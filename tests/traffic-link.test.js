import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAliasIndex, resolveTrafficSegmentId, indexTrafficBySegment,
  linkSegmentToPolygon, linkTrafficDataset,
} from '../src/traffic/link.js';

const alias = (roadSegmentId, sourceSegmentCode) => ({ roadSegmentId, sourceSegmentCode });
const traffic = (over) => ({
  roadSegmentId: null, sourceSegmentCode: null, date: '2026-04-01', direction: null,
  intervalsObserved: 96, flow: 1000, qualityFlag: null, ...over,
});
const segment = (over) => ({ roadSegmentId: 'RS-1', name: 'DF-001', currentPolygonId: null, ...over });

test('buildAliasIndex indexa por source_segment_code', () => {
  const index = buildAliasIndex([alias('RS-1', 'DER-001'), alias('RS-2', 'DER-002')]);
  assert.equal(index.get('DER-001'), 'RS-1');
  assert.equal(index.get('DER-002'), 'RS-2');
  assert.equal(index.get('DER-999'), undefined);
});

test('resolveTrafficSegmentId usa road_segment_id direto quando presente', () => {
  const index = buildAliasIndex([alias('RS-9', 'DER-001')]);
  const id = resolveTrafficSegmentId(traffic({ roadSegmentId: 'RS-1', sourceSegmentCode: 'DER-001' }), index);
  assert.equal(id, 'RS-1', 'road_segment_id direto vence, não precisa do alias');
});

test('resolveTrafficSegmentId resolve por alias quando road_segment_id vem vazio (linha antiga)', () => {
  const index = buildAliasIndex([alias('RS-1', 'DER-001')]);
  const id = resolveTrafficSegmentId(traffic({ roadSegmentId: null, sourceSegmentCode: 'DER-001' }), index);
  assert.equal(id, 'RS-1');
});

test('resolveTrafficSegmentId devolve null quando nada resolve', () => {
  const index = buildAliasIndex([]);
  assert.equal(resolveTrafficSegmentId(traffic({ roadSegmentId: null, sourceSegmentCode: 'DER-999' }), index), null);
  assert.equal(resolveTrafficSegmentId(null, index), null);
});

test('indexTrafficBySegment separa por sentido — crescente e decrescente nunca se somam', () => {
  const records = [
    traffic({ roadSegmentId: 'RS-1', direction: 'crescente' }),
    traffic({ roadSegmentId: 'RS-1', direction: 'decrescente' }),
    traffic({ roadSegmentId: 'RS-1', direction: 'crescente' }),
  ];
  const { bySegment } = indexTrafficBySegment(records, []);
  const bucket = bySegment.get('RS-1');
  assert.equal(bucket.crescente.length, 2);
  assert.equal(bucket.decrescente.length, 1);
  assert.equal(bucket.semSentido.length, 0);
});

test('indexTrafficBySegment resolve alias e agrupa registro antigo no mesmo trecho', () => {
  const aliases = [alias('RS-1', 'DER-001')];
  const records = [
    traffic({ roadSegmentId: 'RS-1', direction: 'crescente' }),
    traffic({ roadSegmentId: null, sourceSegmentCode: 'DER-001', direction: 'crescente' }), // linha antiga
  ];
  const { bySegment, orphaned } = indexTrafficBySegment(records, aliases);
  assert.equal(bySegment.get('RS-1').crescente.length, 2);
  assert.equal(orphaned.length, 0);
});

test('indexTrafficBySegment: registro sem road_segment_id resolúvel fica órfão, não descartado', () => {
  const records = [traffic({ roadSegmentId: null, sourceSegmentCode: 'DER-UNKNOWN' })];
  const { bySegment, orphaned } = indexTrafficBySegment(records, []);
  assert.equal(bySegment.size, 0);
  assert.equal(orphaned.length, 1, 'registro não some, fica disponível para aviso (R2.5/R2.6)');
});

test('linkSegmentToPolygon: trecho sem geometria sincronizada carrega normalmente com polygon null', () => {
  // road_sync_synced_count = 0 no piloto: nenhum trecho tem geometria ainda.
  const linked = linkSegmentToPolygon(segment({ currentPolygonId: null }), new Map());
  assert.equal(linked.polygon, null);
  assert.equal(linked.roadSegmentId, 'RS-1');
});

test('linkSegmentToPolygon: current_polygon_id que não existe em POLYGONS também vira null, não erro', () => {
  const linked = linkSegmentToPolygon(segment({ currentPolygonId: 'POLY-404' }), new Map());
  assert.equal(linked.polygon, null);
});

test('linkSegmentToPolygon liga trecho à geometria quando o polygon_id existe', () => {
  const polygonsById = new Map([['POLY-9', { polygonId: 'POLY-9', name: 'geometria' }]]);
  const linked = linkSegmentToPolygon(segment({ currentPolygonId: 'POLY-9' }), polygonsById);
  assert.deepEqual(linked.polygon, { polygonId: 'POLY-9', name: 'geometria' });
});

test('linkTrafficDataset encadeia TRAFFIC_DAILY_TEST → ROAD_SEGMENTS → POLYGONS de ponta a ponta', () => {
  const segments = [segment({ roadSegmentId: 'RS-1', currentPolygonId: 'POLY-9' })];
  const polygons = [{ id: 'POLY-9', name: 'geometria do trecho' }];
  const records = [
    traffic({ roadSegmentId: 'RS-1', direction: 'crescente', flow: 1200 }),
    traffic({ roadSegmentId: null, sourceSegmentCode: 'DER-001', direction: 'decrescente', flow: 900 }),
  ];
  const aliases = [alias('RS-1', 'DER-001')];

  const { bySegmentId, orphaned, unmatchedSegmentIds } = linkTrafficDataset(segments, polygons, records, aliases);

  const trecho = bySegmentId.get('RS-1');
  assert.equal(trecho.polygon.name, 'geometria do trecho');
  assert.equal(trecho.traffic.crescente.length, 1);
  assert.equal(trecho.traffic.decrescente.length, 1);
  assert.equal(trecho.traffic.crescente[0].flow, 1200);
  assert.equal(orphaned.length, 0);
  assert.equal(unmatchedSegmentIds.length, 0);
});

test('linkTrafficDataset: tráfego cujo trecho não existe em ROAD_SEGMENTS aparece em unmatchedSegmentIds', () => {
  const records = [traffic({ roadSegmentId: 'RS-GHOST' })];
  const { bySegmentId, unmatchedSegmentIds } = linkTrafficDataset([], [], records, []);
  assert.equal(bySegmentId.size, 0);
  assert.deepEqual(unmatchedSegmentIds, ['RS-GHOST']);
});

// Issue #185: ROAD_SEGMENTS fora do ar (ou sem a linha) não pode apagar o fluxo de um
// trecho cuja geometria ativa declara o mesmo id em `entity_id`.
test('linkTrafficDataset vincula fluxo pela geometria quando ROAD_SEGMENTS não tem o trecho', () => {
  const polygon = {
    id: 'POLY-1', status: 'active', entity_type: 'road_segment', entity_id: 'ROADSEG_004EDF0130',
    name: 'DF-004 · trecho 0130', properties: { rodovia: 'DF004', cod_distrital: '004EDF0130' },
  };
  const records = [
    traffic({ roadSegmentId: 'ROADSEG_004EDF0130', sourceSegmentCode: '004EDF0130', direction: 'crescente', flow: 100 }),
    traffic({ roadSegmentId: 'ROADSEG_004EDF0130', sourceSegmentCode: '004EDF0130', direction: 'decrescente', flow: 200 }),
  ];
  const out = linkTrafficDataset([], [polygon], records, []);
  const linked = out.bySegmentId.get('ROADSEG_004EDF0130');
  assert.ok(linked, 'o trecho desenhado precisa ter o fluxo vinculado');
  assert.equal(linked.polygon, polygon);
  assert.equal(linked.identitySource, 'polygon');
  assert.equal(linked.sourceSegmentCode, '004EDF0130');
  assert.equal(linked.roadCode, 'DF004');
  assert.equal(linked.traffic.crescente.length, 1);
  assert.equal(linked.traffic.decrescente.length, 1);
  assert.deepEqual(out.unmatchedSegmentIds, [], 'vinculado não é órfão');
});

test('linkTrafficDataset não vincula pela geometria quando ela é inativa ou de outro tipo', () => {
  const records = [traffic({ roadSegmentId: 'ROADSEG_X', sourceSegmentCode: 'X', direction: 'crescente' })];
  const inativa = { id: 'P1', status: 'inactive', entity_type: 'road_segment', entity_id: 'ROADSEG_X' };
  const ra = { id: 'P2', status: 'active', entity_type: 'administrative_region', entity_id: 'ROADSEG_X' };
  for (const polygon of [inativa, ra]) {
    const out = linkTrafficDataset([], [polygon], records, []);
    assert.equal(out.bySegmentId.has('ROADSEG_X'), false);
    assert.deepEqual(out.unmatchedSegmentIds, ['ROADSEG_X']);
  }
});
