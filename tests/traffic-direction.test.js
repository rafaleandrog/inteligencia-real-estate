// Issue #142 — sentido oficial, corredor Sobradinho–Plano Piloto e filtros temporais.
//
// A maior parte dos testes roda sobre um recorte REAL da planilha
// (tests/fixtures/traffic-direction-jul2026.json), porque os critérios de aceite são
// números publicados: se o contrato mudar, o teste precisa quebrar com o dado de verdade.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  normalizeRoadDirections, normalizeCorridorDailyRecords, buildDirectionContext,
  canonicalProjectDirection, corridorSumMismatch, directionKey,
} from '../src/traffic/direction.js';
import {
  EMPTY_TRAFFIC_FILTERS, filterLinkedTraffic, filterCorridorDaily, trafficFilterOptions,
  roadFlowDisplay, flowWeight, segmentFlowTotal, DIRECTION_COLORS, activeTrafficFilterCount,
} from '../src/traffic/filters.js';
import { segmentPeriodSummary, corridorPointSummary, corridorSummariesByPoint, officialTmd } from '../src/traffic/summary.js';
import {
  normalizeRoadSegments, normalizeTrafficDailyRecords,
} from '../src/traffic/normalize.js';
import { linkTrafficDataset, segmentIdsWithTraffic } from '../src/traffic/link.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/traffic-direction-jul2026.json', import.meta.url)));

function carregar() {
  const directions = normalizeRoadDirections(fixture.road_direction_map);
  const corridor = normalizeCorridorDailyRecords(fixture.traffic_corridor_daily);
  const segments = normalizeRoadSegments(fixture.road_segments).records;
  const daily = normalizeTrafficDailyRecords(fixture.traffic_daily).records;
  const traffic = linkTrafficDataset(segments, [], daily, [], directions.records);
  const ctx = buildDirectionContext(directions.records, corridor.records);
  return { directions, corridor, traffic, ctx };
}

const filtro = (over) => ({ ...EMPTY_TRAFFIC_FILTERS, ...over });

// --- Contratos ---------------------------------------------------------------------

test('ROAD_DIRECTION_MAP: 181 registros, 176 oficiais e 5 sem geometria oficial', () => {
  const { directions } = carregar();
  assert.equal(directions.records.length, 181);
  assert.equal(directions.dropped, 0);
  assert.equal(directions.duplicates, 0);
  const oficiais = directions.records.filter((d) => d.mappingStatus === 'mapped_official');
  assert.equal(oficiais.length, 176);
  const semGeometria = directions.records
    .filter((d) => d.mappingStatus === 'unmatched_official_layer')
    .map((d) => d.sourceSegmentCode)
    .sort();
  assert.deepEqual(semGeometria, ['009EDF0050', '020BDF0010', '020BDF0018', '020BDF0020', 'TUNEL-REI-']);
});

test('ROAD_DIRECTION_MAP: identificadores preservados como texto, km como número', () => {
  const { ctx } = carregar();
  const d = ctx.officialOf('001EDF0010', 'crescente');
  assert.equal(d.sourceSegmentCode, '001EDF0010', 'zeros à esquerda preservados');
  assert.equal(d.kmStart, 0);
  assert.equal(d.kmEnd, 2.8);
  assert.equal(d.directionRule, 'DER_km_I_to_km_F');
  assert.ok(ctx.unmatchedCodes.has('TUNEL-REI-'), 'hífen final preservado');
});

test('ROAD_DIRECTION_MAP: chave repetida fica com a primeira e é contada', () => {
  const linha = { source_segment_code: 'X1', source_direction: 'crescente', origin_official: 'A' };
  const r = normalizeRoadDirections([linha, { ...linha, origin_official: 'B' }, { source_direction: 'crescente' }]);
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].originOfficial, 'A');
  assert.equal(r.duplicates, 1);
  assert.equal(r.dropped, 1);
});

test('TRAFFIC_CORRIDOR_DAILY: 62 registros, 31 dias por ponto em julho/2026, sem id duplicado', () => {
  const { corridor } = carregar();
  assert.equal(corridor.records.length, 62);
  assert.equal(corridor.duplicates, 0);
  const ids = corridor.records.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const code of ['003EDF0010', '150EDF0010']) {
    const dias = new Set(corridor.records.filter((r) => r.sourceSegmentCode === code && r.monthRef === '2026-07').map((r) => r.date));
    assert.equal(dias.size, 31, code);
  }
});

test('TRAFFIC_CORRIDOR_DAILY: corridor_daily_id repetido e ponto+dia repetido são recusados', () => {
  const base = fixture.traffic_corridor_daily[0];
  const r = normalizeCorridorDailyRecords([base, base, { ...base, corridor_daily_id: 'OUTRO' }]);
  assert.equal(r.records.length, 1);
  assert.equal(r.duplicates, 2);
});

test('TRAFFIC_CORRIDOR_DAILY: a soma publicada fecha em todos os registros', () => {
  const { corridor } = carregar();
  for (const r of corridor.records) assert.equal(corridorSumMismatch(r), 0, r.id);
});

// --- Regra do corredor ---------------------------------------------------------------

test('corredor: decrescente = para o Plano Piloto, crescente = para Sobradinho', () => {
  const { ctx } = carregar();
  for (const code of ['003EDF0010', '150EDF0010']) {
    assert.deepEqual(ctx.projectOf(code, 'decrescente'), { projectDirection: 'para_plano', corridorId: 'SOBRADINHO_PLANO' });
    assert.deepEqual(ctx.projectOf(code, 'crescente'), { projectDirection: 'para_sobradinho', corridorId: 'SOBRADINHO_PLANO' });
  }
});

test('corredor: a tradução NÃO vaza para outras vias', () => {
  const { ctx } = carregar();
  assert.deepEqual(ctx.projectOf('001EDF0070', 'decrescente'), { projectDirection: null, corridorId: null });
  assert.deepEqual(ctx.projectOf('001EDF0070', 'crescente'), { projectDirection: null, corridorId: null });
});

test('canonicalProjectDirection aceita as grafias do backend e recusa o resto', () => {
  assert.equal(canonicalProjectDirection('para_plano'), 'para_plano');
  assert.equal(canonicalProjectDirection('Para o Plano Piloto'), 'para_plano');
  assert.equal(canonicalProjectDirection('para Sobradinho'), 'para_sobradinho');
  assert.equal(canonicalProjectDirection('crescente'), null);
  assert.equal(directionKey(' 003EDF0010 ', 'Crescente'), '003EDF0010|crescente');
});

// --- Critérios de aceite numéricos -----------------------------------------------------

function resumoDoDia(code, dia, extra = {}) {
  const { traffic, ctx } = carregar();
  const filtrado = filterLinkedTraffic(traffic, filtro({ day: dia, ...extra }), ctx);
  return segmentPeriodSummary(filtrado.bySegmentId.get(`ROADSEG_${code}`), ctx);
}

test('150EDF0010 em 31/07/2026: 31.772 para o Plano, 57.291 para Sobradinho, 89.063 bidirecional', () => {
  const s = resumoDoDia('150EDF0010', '2026-07-31');
  assert.equal(s.paraPlano.total, 31772);
  assert.equal(s.paraSobradinho.total, 57291);
  assert.equal(s.bidirectional, 89063);
  assert.equal(s.paraPlano.total + s.paraSobradinho.total, s.bidirectional);

  const { corridor } = carregar();
  const c = corridorPointSummary(filterCorridorDaily(corridor.records, filtro({ day: '2026-07-31', segment: '150EDF0010' })));
  assert.deepEqual([c.paraPlano, c.paraSobradinho, c.bidirecional], [31772, 57291, 89063]);
});

test('003EDF0010: 45.188 / 79.840 / 125.028 é o dia 01/07/2026 na planilha (a instrução diz 31/07)', () => {
  // A instrução do GitHub cita estes números como "31/07/2026". Na planilha, e nas DUAS abas
  // (TRAFFIC_DAILY_TEST e TRAFFIC_CORRIDOR_DAILY), eles são de 01/07/2026; o 31/07 é
  // 49.465 / 87.652 / 137.117. O teste fixa o que a planilha publica.
  const primeiro = resumoDoDia('003EDF0010', '2026-07-01');
  assert.deepEqual([primeiro.paraPlano.total, primeiro.paraSobradinho.total, primeiro.bidirectional], [45188, 79840, 125028]);
  assert.equal(45188 + 79840, 125028);

  const ultimo = resumoDoDia('003EDF0010', '2026-07-31');
  assert.deepEqual([ultimo.paraPlano.total, ultimo.paraSobradinho.total, ultimo.bidirectional], [49465, 87652, 137117]);
});

test('as duas abas concordam dia a dia nos dois pontos do corredor', () => {
  const { traffic, corridor, ctx } = carregar();
  for (const r of corridor.records) {
    const f = filterLinkedTraffic(traffic, filtro({ day: r.date }), ctx);
    const s = segmentPeriodSummary(f.bySegmentId.get(r.measurementSegmentId), ctx);
    assert.equal(s.paraPlano.total, r.paraPlano, `${r.id} para_plano`);
    assert.equal(s.paraSobradinho.total, r.paraSobradinho, `${r.id} para_sobradinho`);
  }
});

test('os dois pontos nunca são somados: o resumo recusa uma lista com pontos misturados', () => {
  const { corridor } = carregar();
  assert.equal(corridorPointSummary(corridor.records), null);
  const porPonto = corridorSummariesByPoint(corridor.records);
  assert.deepEqual(porPonto.map((p) => p.sourceSegmentCode), ['003EDF0010', '150EDF0010']);
  assert.ok(porPonto.every((p) => p.days === 31));
});

// --- Filtros ---------------------------------------------------------------------------

test('filtrar o sentido altera os números', () => {
  const todos = resumoDoDia('150EDF0010', '2026-07-31');
  const plano = resumoDoDia('150EDF0010', '2026-07-31', { projectDirection: 'para_plano' });
  assert.equal(plano.total, 31772);
  assert.equal(plano.paraSobradinho.total, null, 'o outro sentido fica sem número, não zero');
  assert.equal(plano.bidirectional, null, 'com um sentido só, não existe bidirecional');
  assert.notEqual(plano.total, todos.total);

  const cresc = resumoDoDia('150EDF0010', '2026-07-31', { officialDirection: 'crescente' });
  assert.equal(cresc.total, 57291);
});

test('filtrar a classe de veículo altera o indicador', () => {
  const total = resumoDoDia('150EDF0010', '2026-07-31');
  const carro = resumoDoDia('150EDF0010', '2026-07-31', { vehicleClass: 'carro' });
  assert.equal(carro.paraPlano.total, 22374);
  assert.equal(carro.paraSobradinho.total, 38476);
  assert.equal(carro.bidirectional, 60850);
  assert.notEqual(carro.total, total.total);

  const { corridor } = carregar();
  const c = corridorPointSummary(
    filterCorridorDaily(corridor.records, filtro({ day: '2026-07-31', segment: '150EDF0010' })),
    { vehicleClass: 'carro' }
  );
  assert.deepEqual([c.paraPlano, c.paraSobradinho, c.bidirecional], [22374, 38476, 60850]);
  const moto = corridorPointSummary(
    filterCorridorDaily(corridor.records, filtro({ day: '2026-07-31', segment: '150EDF0010' })),
    { vehicleClass: 'moto' }
  );
  assert.equal(moto.paraPlano, null, 'moto só é publicada no bidirecional — nunca zero');
  assert.equal(moto.bidirecional, 7554);
});

test('mês, intervalo e qualidade filtram; dia parcial fica identificado', () => {
  const { traffic, ctx, corridor } = carregar();
  const mes = segmentPeriodSummary(filterLinkedTraffic(traffic, filtro({ month: '2026-07' }), ctx).bySegmentId.get('ROADSEG_150EDF0010'), ctx);
  assert.equal(mes.days, 31);
  const semana = segmentPeriodSummary(
    filterLinkedTraffic(traffic, filtro({ dateFrom: '2026-07-01', dateTo: '2026-07-07' }), ctx).bySegmentId.get('ROADSEG_150EDF0010'),
    ctx
  );
  assert.equal(semana.days, 7);
  const vazio = segmentPeriodSummary(filterLinkedTraffic(traffic, filtro({ month: '2026-04' }), ctx).bySegmentId.get('ROADSEG_150EDF0010'), ctx);
  assert.equal(vazio.hasData, false);

  const p003 = corridorPointSummary(filterCorridorDaily(corridor.records, filtro({ segment: '003EDF0010' })));
  assert.equal(p003.coverage.parciais, 1, 'um dia com 95/96 intervalos');
  assert.equal(p003.coverage.completos, 30);
  const parcial = filterCorridorDaily(corridor.records, filtro({ quality: 'partial_or_quality_issue' }));
  assert.equal(parcial.length, 1);
});

test('rodovia, trecho e corredor restringem os trechos sem apagá-los', () => {
  const { traffic, ctx } = carregar();
  const soCorredor = filterLinkedTraffic(traffic, filtro({ corridor: 'SOBRADINHO_PLANO' }), ctx);
  assert.deepEqual(segmentIdsWithTraffic(soCorredor.bySegmentId).sort(), ['ROADSEG_003EDF0010', 'ROADSEG_150EDF0010']);
  assert.equal(soCorredor.bySegmentId.size, traffic.bySegmentId.size, 'trecho fora do filtro continua (vira cinza)');

  const df001 = filterLinkedTraffic(traffic, filtro({ road: 'DF001' }), ctx);
  assert.deepEqual(segmentIdsWithTraffic(df001.bySegmentId), ['ROADSEG_001EDF0070']);
  const trecho = filterLinkedTraffic(traffic, filtro({ segment: '003EDF0010' }), ctx);
  assert.deepEqual(segmentIdsWithTraffic(trecho.bySegmentId), ['ROADSEG_003EDF0010']);
});

test('opções derivadas dos dados: mês não é fixo', () => {
  const { traffic, ctx, corridor } = carregar();
  const opts = trafficFilterOptions(traffic, ctx, corridor.records);
  assert.deepEqual(opts.months.map((m) => m.value), ['2026-07']);
  assert.equal(opts.months[0].label, 'Julho/2026');
  assert.equal(opts.days.length, 31);
  assert.deepEqual(opts.corridors, [{ value: 'SOBRADINHO_PLANO', label: 'Sobradinho–Plano Piloto' }]);
  assert.ok(opts.quality.includes('ok'));
  assert.ok(opts.quality.includes('partial_intervals') || opts.quality.includes('partial_or_quality_issue'));

  // Um mês novo na série aparece sozinho.
  const agosto = normalizeTrafficDailyRecords([{ ...fixture.traffic_daily[0], dia: '2026-08-01' }]).records;
  const segs = normalizeRoadSegments(fixture.road_segments).records;
  const t2 = linkTrafficDataset(segs, [], agosto, []);
  assert.deepEqual(trafficFilterOptions(t2, ctx, []).months.map((m) => m.value), ['2026-08']);
  assert.equal(activeTrafficFilterCount(filtro({ month: '2026-07', vehicleClass: 'carro' })), 2);
});

// --- Códigos sem geometria oficial -----------------------------------------------------

test('fluxo de código sem geometria oficial é guardado, identificado e nunca vira trecho desenhável', () => {
  const { traffic } = carregar();
  assert.ok(!traffic.bySegmentId.has('ROADSEG_009EDF0050'));
  const entrada = traffic.unmatchedTraffic.get('ROADSEG_009EDF0050');
  assert.ok(entrada, 'o fluxo não some');
  assert.equal(entrada.mappingStatus, 'unmatched_official_layer');
  assert.equal(entrada.sourceSegmentCode, '009EDF0050');
  assert.ok(entrada.traffic.crescente.length + entrada.traffic.decrescente.length > 0);
});

// --- Mapa ------------------------------------------------------------------------------

test('estilo do eixo: cinza sem dado, cor do sentido com filtro, espessura pelo fluxo', () => {
  const sem = roadFlowDisplay({ total: null, maxTotal: 100, baseColor: '#123456', filters: EMPTY_TRAFFIC_FILTERS });
  assert.equal(sem.color, DIRECTION_COLORS.sem_dado);
  assert.equal(sem.hasData, false);

  const base = roadFlowDisplay({ total: 50, maxTotal: 100, baseColor: '#123456', filters: EMPTY_TRAFFIC_FILTERS });
  assert.equal(base.color, '#123456', 'sem filtro de sentido, a cor da planilha');
  assert.equal(roadFlowDisplay({ total: 50, maxTotal: 100, baseColor: '#1', filters: filtro({ projectDirection: 'para_plano' }) }).color, DIRECTION_COLORS.para_plano);
  assert.equal(roadFlowDisplay({ total: 50, maxTotal: 100, baseColor: '#1', filters: filtro({ projectDirection: 'para_sobradinho' }) }).color, DIRECTION_COLORS.para_sobradinho);
  assert.equal(roadFlowDisplay({ total: 50, maxTotal: 100, baseColor: '#1', filters: filtro({ officialDirection: 'decrescente' }) }).color, DIRECTION_COLORS.decrescente);

  assert.ok(flowWeight(100, 100) > flowWeight(10, 100));
  assert.equal(flowWeight(0, 100), 3);
  assert.equal(flowWeight(null, 100), 3);
  assert.equal(segmentFlowTotal({ traffic: { crescente: [{ flow: 2 }], decrescente: [{ flow: null }], semSentido: [] } }), 2);
  assert.equal(segmentFlowTotal({ traffic: { crescente: [], decrescente: [], semSentido: [] } }), null);
});

test('TMD oficial vem de properties_json.tmd_der e não depende do período', () => {
  assert.equal(officialTmd({ properties: { tmd_der: '26402' } }), 26402);
  assert.equal(officialTmd({ properties: {} }, { raw: { properties_json: '{"tmd_der":"1234"}' } }), 1234);
  assert.equal(officialTmd({ properties: {} }, { raw: { properties_json: 'quebrado' } }), null);
});

// --- Revisão do Kimi na PR #143 ---------------------------------------------------------

test('canonicalProjectDirection remove diacríticos (regex com escape, não caractere literal)', () => {
  assert.equal(canonicalProjectDirection('para Sobradínho'), 'para_sobradinho');
  assert.equal(canonicalProjectDirection('Pára o Plano Pilóto'), 'para_plano');
});

test('corredor: lado fora do filtro de sentido é "excluído", não "não publicado"', () => {
  const { corridor } = carregar();
  const linhas = filterCorridorDaily(corridor.records, filtro({ day: '2026-07-31', segment: '150EDF0010' }));
  const cresc = corridorPointSummary(linhas, { officialDirection: 'crescente' });
  assert.equal(cresc.paraSobradinho, 57291);
  assert.equal(cresc.paraPlano, null);
  assert.deepEqual(cresc.excluded, { paraPlano: true, paraSobradinho: false, bidirecional: true });
  const moto = corridorPointSummary(linhas, { vehicleClass: 'moto' });
  assert.deepEqual(moto.excluded, { paraPlano: false, paraSobradinho: false, bidirecional: false },
    'classe sem lado publicado não é exclusão por filtro');
});

test('TMD oficial pelo caminho real: POLYGONS normalizado expõe properties.tmd_der', async () => {
  const { normalizePolygons } = await import('../src/normalize.js');
  const [poligono] = normalizePolygons([{
    polygon_id: 'ROADSEG_150EDF0010', status: 'active', entity_type: 'road_segment',
    geometry_geojson: '{"type":"LineString","coordinates":[[-47.8,-15.7],[-47.7,-15.6]]}',
    properties_json: '{"tmd_der":"18980","road_segment_id":"ROADSEG_150EDF0010"}',
  }]);
  assert.equal(officialTmd(poligono), 18980);
  const [trecho] = normalizeRoadSegments(fixture.road_segments.filter((r) => r.source_segment_code === '150EDF0010')).records;
  assert.equal(officialTmd({}, trecho), 18980, 'fallback por ROAD_SEGMENTS.properties_json');
});
