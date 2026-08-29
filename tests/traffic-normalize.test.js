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
  const record = normalizeRoadSegment({ road_segment_id: 'RS-1', road_name: 'DF-001' });
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
  assert.equal(normalizeTrafficDaily({ road_segment_id: 'RS-1', dia: 'not-a-date' }), null);
});

test('normalizeTrafficDaily lê road_segment_id, sentido e intervalos', () => {
  const record = normalizeTrafficDaily({
    road_segment_id: 'RS-1',
    dia: '2026-04-05',
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
    dia: '2026-04-05',
  });
  assert.equal(record.roadSegmentId, null);
  assert.equal(record.sourceSegmentCode, 'DER-001');
});

test('normalizeTrafficDaily: sentido fora do vocabulário vira null, nunca adivinhado', () => {
  const record = normalizeTrafficDaily({ road_segment_id: 'RS-1', dia: '2026-04-05', sentido: 'norte' });
  assert.equal(record.direction, null);
});

test('normalizeTrafficDailyRecords soma dropped', () => {
  const { records, dropped } = normalizeTrafficDailyRecords([
    { road_segment_id: 'RS-1', dia: '2026-04-05' },
    { road_segment_id: 'RS-1' }, // sem data
  ]);
  assert.equal(records.length, 1);
  assert.equal(dropped, 1);
});

test('normalizeTrafficDaily lê fluxo só de fluxo_total — sem apelido especulativo', () => {
  // Regressão: uma versão anterior aceitava row?.fluxo_total ?? row?.veiculos_dia ??
  // row?.flow, colunas inventadas por falta do schema real. O schema real (Code.gs
  // v2.2.0, REQUIRED_HEADERS de TRAFFIC_DAILY_TEST) só tem fluxo_total; um nome
  // inventado que a fila de `??` aceitasse em silêncio é a mesma falha da R8.59, pelo
  // lado da leitura: coluna do contrato que sumir vira null, nunca um apelido.
  const record = normalizeTrafficDaily({ road_segment_id: 'RS-1', dia: '2026-04-05', fluxo_total: 12345 });
  assert.equal(record.flow, 12345);

  // Colunas inventadas não são lidas — só fluxo_total conta.
  const withOnlyInvented = normalizeTrafficDaily({
    road_segment_id: 'RS-1', dia: '2026-04-05', veiculos_dia: 9999, flow: 8888,
  });
  assert.equal(withOnlyInvented.flow, null, 'nomes inventados não substituem a coluna real ausente');
});

test('normalizeRoadSegment lê o nome só de road_name — sem apelido especulativo', () => {
  // Mesma família: name/nome/nome_trecho/descricao eram fallbacks inventados; o
  // schema real (Code.gs v2.2.0) só tem road_name.
  const record = normalizeRoadSegment({ road_segment_id: 'RS-1', road_name: 'DF-001' });
  assert.equal(record.name, 'DF-001');

  const withOnlyInvented = normalizeRoadSegment({ road_segment_id: 'RS-1', nome: 'X', descricao: 'Y' });
  assert.equal(withOnlyInvented.name, '', 'colunas inventadas não substituem road_name ausente');
});
