import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRoadSegment, normalizeRoadSegments,
  normalizeRoadSegmentAlias, normalizeRoadSegmentAliases,
  normalizeTrafficDaily, normalizeTrafficDailyRecords,
} from '../src/traffic/normalize.js';

test('normalizeRoadSegment descarta linha sem road_segment_id', () => {
  assert.equal(normalizeRoadSegment({ name: 'sem id' }), null);
  assert.equal(normalizeRoadSegment({ road_segment_id: '' }), null);
});

test('normalizeRoadSegment aceita trecho sem geometria sincronizada', () => {
  // road_sync_synced_count = 0 hoje: nenhum trecho tem current_polygon_id ainda.
  // Um trecho assim continua válido, só não tem onde ser desenhado.
  const record = normalizeRoadSegment({ road_segment_id: 'RS-1', name: 'DF-001' });
  assert.equal(record.roadSegmentId, 'RS-1');
  assert.equal(record.currentPolygonId, null);
});

test('normalizeRoadSegment lê current_polygon_id quando presente', () => {
  const record = normalizeRoadSegment({ road_segment_id: 'RS-1', current_polygon_id: 'POLY-9' });
  assert.equal(record.currentPolygonId, 'POLY-9');
});

test('normalizeRoadSegments soma dropped para linhas inválidas', () => {
  const { records, dropped } = normalizeRoadSegments([
    { road_segment_id: 'RS-1' },
    { road_segment_id: '' },
    {},
  ]);
  assert.equal(records.length, 1);
  assert.equal(dropped, 2);
});

test('normalizeRoadSegmentAlias exige road_segment_id e source_segment_code', () => {
  assert.equal(normalizeRoadSegmentAlias({ road_segment_id: 'RS-1' }), null);
  assert.equal(normalizeRoadSegmentAlias({ source_segment_code: 'DER-001' }), null);
  const record = normalizeRoadSegmentAlias({ road_segment_id: 'RS-1', source_segment_code: 'DER-001' });
  assert.deepEqual(
    { roadSegmentId: record.roadSegmentId, sourceSegmentCode: record.sourceSegmentCode },
    { roadSegmentId: 'RS-1', sourceSegmentCode: 'DER-001' }
  );
});

test('normalizeRoadSegmentAliases soma dropped', () => {
  const { records, dropped } = normalizeRoadSegmentAliases([
    { road_segment_id: 'RS-1', source_segment_code: 'DER-001' },
    { road_segment_id: 'RS-2' },
  ]);
  assert.equal(records.length, 1);
  assert.equal(dropped, 1);
});

test('normalizeTrafficDaily descarta linha sem data válida', () => {
  assert.equal(normalizeTrafficDaily({ road_segment_id: 'RS-1' }), null);
  assert.equal(normalizeTrafficDaily({ road_segment_id: 'RS-1', date: 'not-a-date' }), null);
});

test('normalizeTrafficDaily lê road_segment_id, sentido e intervalos', () => {
  const record = normalizeTrafficDaily({
    road_segment_id: 'RS-1',
    date: '2026-04-05',
    sentido: 'crescente',
    intervalos_15min_observados: 90,
    quality_flag: 'partial_intervals',
  });
  assert.equal(record.roadSegmentId, 'RS-1');
  assert.equal(record.date, '2026-04-05');
  assert.equal(record.direction, 'crescente');
  assert.equal(record.intervalsObserved, 90);
  assert.equal(record.qualityFlag, 'partial_intervals');
});

test('normalizeTrafficDaily: road_segment_id vazio fica null, não string vazia', () => {
  // Linha antiga sem road_segment_id, só com source_segment_code — a resolução por
  // alias é responsabilidade de src/traffic/link.js, não deste normalizador.
  const record = normalizeTrafficDaily({
    trecho: 'DER-001',
    date: '2026-04-05',
  });
  assert.equal(record.roadSegmentId, null);
  assert.equal(record.sourceSegmentCode, 'DER-001');
});

test('normalizeTrafficDaily: sentido fora do vocabulário vira null, nunca adivinhado', () => {
  const record = normalizeTrafficDaily({ road_segment_id: 'RS-1', date: '2026-04-05', sentido: 'norte' });
  assert.equal(record.direction, null);
});

test('normalizeTrafficDailyRecords soma dropped', () => {
  const { records, dropped } = normalizeTrafficDailyRecords([
    { road_segment_id: 'RS-1', date: '2026-04-05' },
    { road_segment_id: 'RS-1' }, // sem data
  ]);
  assert.equal(records.length, 1);
  assert.equal(dropped, 1);
});
