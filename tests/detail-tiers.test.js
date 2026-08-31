// Painel de detalhe em três níveis — issue #55.
//
// O painel chegou a ~30 linhas de peso visual idêntico porque três decisões se somaram:
// ordem alfabética das chaves, chave crua como rótulo, e nenhuma hierarquia. O
// resultado é que `avg_household_size` aparecia antes de `population_total`, e
// `geometry_source_hash` ocupava o mesmo destaque que a população da RA.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  polygonEssentials, polygonPropertyTiers, polygonEssentialKeys,
  classifyPolygonProperty, DETAIL_TIERS,
} from '../src/format.js';
import { normalizePolygon, normalizeRaProfile } from '../src/normalize.js';

const contorno = (over = {}) => normalizePolygon({ polygon_id: 'P1', status: 'active', ...over });

// --- Rótulos: nenhuma chave crua no nível de destaque -------------------------------

test('chave conhecida ganha rótulo em português e vai para o complementar', () => {
  assert.deepEqual(classifyPolygonProperty('jurisdiction'),
    { tier: DETAIL_TIERS.COMPLEMENTAR, label: 'Jurisdição' });
  assert.deepEqual(classifyPolygonProperty('traffic_avg_daily_flow'),
    { tier: DETAIL_TIERS.COMPLEMENTAR, label: 'Fluxo médio diário' });
});

test('chave desconhecida é humanizada e cai no técnico, nunca no essencial', () => {
  // O vocabulário do `properties_json` é aberto: nome de chave é do arquivo de terceiro,
  // não do contrato. Nenhuma chave nova pode escalar para o topo do painel sozinha.
  const out = classifyPolygonProperty('display_simplification_tolerance_m');
  assert.equal(out.tier, DETAIL_TIERS.TECNICO);
  assert.equal(out.label, 'Display simplification tolerance m');

  const inventada = classifyPolygonProperty('campo_que_ninguem_previu');
  assert.equal(inventada.tier, DETAIL_TIERS.TECNICO);
  assert.equal(inventada.label, 'Campo que ninguem previu');
});

// --- Essencial por tipo de entidade -------------------------------------------------

test('rodovia: código, tipo de trecho, jurisdição e fluxo médio', () => {
  const rodovia = contorno({
    entity_type: 'road_segment', name: 'DF-095 · TR-047',
    properties_json: JSON.stringify({
      road_code: 'DF-095', segment_type: 'pista dupla', jurisdiction: 'Distrital',
      traffic_avg_daily_flow: 48213, geometry_hash: 'abc123', native_source_crs: 'EPSG:31983',
    }),
  });
  assert.deepEqual(polygonEssentials(rodovia, null), [
    { label: 'Código', value: 'DF-095' },
    { label: 'Tipo de trecho', value: 'pista dupla' },
    { label: 'Jurisdição', value: 'Distrital' },
    { label: 'Fluxo médio diário', value: '48.213 veíc./dia' },
  ]);
});

test('o nome NÃO entra no essencial — ele já é o título do painel', () => {
  const rodovia = contorno({ entity_type: 'road_segment', name: 'DF-095 · TR-047',
    properties_json: JSON.stringify({ road_name: 'DF-095', road_code: 'DF-095' }) });
  const rotulos = polygonEssentials(rodovia, null).map((r) => r.label);
  assert.equal(rotulos.includes('Rodovia'), false);
  assert.equal(rotulos.includes('Nome'), false);
});

test('rodovia sem medição de tráfego omite o fluxo, não mostra zero', () => {
  // Zero veículos por dia é uma rodovia por onde ninguém passa. Ausência de medição é
  // outra afirmação, e a diferença entre as duas é o ponto da R5.7.
  const semFluxo = contorno({ entity_type: 'road_segment',
    properties_json: JSON.stringify({ road_code: 'DF-095', traffic_avg_daily_flow: null }) });
  assert.deepEqual(polygonEssentials(semFluxo, null).map((r) => r.label), ['Código']);

  const comZero = contorno({ entity_type: 'road_segment',
    properties_json: JSON.stringify({ road_code: 'DF-095', traffic_avg_daily_flow: 0 }) });
  assert.deepEqual(polygonEssentials(comZero, null)[1], { label: 'Fluxo médio diário', value: '0 veíc./dia' });
});

test('RA usa o perfil canônico, não o properties_json', () => {
  const perfil = normalizeRaProfile({ ra_geo_id: 'RA_III', population_total: '222598' });
  const ra = contorno({ entity_type: 'administrative_region', ra_geo_id: 'RA_III',
    properties_json: JSON.stringify({ population_total: 11111, avg_household_size: 2.9 }) });
  assert.deepEqual(polygonEssentials(ra, perfil), [{ label: 'População', value: '222.598' }]);
});

test('área customizada: categoria, área, origem, data', () => {
  const area = contorno({
    entity_type: 'custom_area', category: 'zona especial', area_ha: '412,7',
    source_file: 'zonas.kml', imported_at: '2026-08-01',
  });
  assert.deepEqual(polygonEssentials(area, null), [
    { label: 'Categoria', value: 'zona especial' },
    { label: 'Área', value: '413 ha' },
    { label: 'Origem', value: 'zonas.kml' },
    { label: 'Importado em', value: '01/08/2026' },
  ]);
});

test('o essencial nunca passa de seis itens, em nenhum tipo', () => {
  // É o contrato desta issue: o essencial cabe sem rolagem em 390 px. Ele é curto por
  // construção, não por sorte — uma lista que cresce sozinha volta ao problema original.
  const cheios = [
    contorno({ entity_type: 'road_segment', properties_json: JSON.stringify({
      road_code: 'A', segment_type: 'B', jurisdiction: 'C', traffic_avg_daily_flow: 1,
      administration: 'D', road_name: 'E', traffic_daily_rows: 9 }) }),
    contorno({ entity_type: 'custom_area', category: 'c', area_ha: 1,
      source_file: 'f.kml', imported_at: '2026-08-01', source_system: 'S' }),
    contorno({ entity_type: 'administrative_region', ra_geo_id: 'RA_I' }),
  ];
  const perfil = normalizeRaProfile({
    ra_geo_id: 'RA_I', population_total: '1', population_density_km2: '2',
    income_per_capita_brl: '3', average_age: '4', households_total: '5', area_km2: '6',
  });
  for (const c of cheios) {
    const n = polygonEssentials(c, perfil).length;
    assert.ok(n >= 1 && n <= 6, `essencial com ${n} itens`);
  }
});

// --- Complementar × técnico ---------------------------------------------------------

test('as chaves de pipeline vão para o técnico e não poluem o complementar', () => {
  const rodovia = contorno({ entity_type: 'road_segment', properties_json: JSON.stringify({
    road_code: 'DF-095', jurisdiction: 'Distrital', administration: 'DER/DF',
    traffic_date_max: '2026-07-31',
    road_segment_id: 'RS_1', source_segment_code: 'TR-047', native_source_crs: 'EPSG:31983',
    traffic_relation_dataset: 'TRAFFIC_DAILY_TEST', display_buffer_m_each_side: 12,
  }) });
  const { complementar, tecnico } = polygonPropertyTiers(rodovia, {
    skip: polygonEssentialKeys(rodovia),
  });
  assert.deepEqual(complementar.map((r) => r.label), ['Administração', 'Última medição']);
  assert.deepEqual(tecnico.map((r) => r.label).sort(), [
    'Display buffer m each side', 'Native source crs', 'Road segment id',
    'Source segment code', 'Traffic relation dataset',
  ]);
});

test('o que já apareceu no essencial não se repete embaixo', () => {
  // Repetir "Jurisdição" duas vezes no mesmo painel gasta espaço e faz o leitor conferir
  // se são a mesma coisa.
  const rodovia = contorno({ entity_type: 'road_segment', properties_json: JSON.stringify({
    road_code: 'DF-095', jurisdiction: 'Distrital', segment_type: 'pista dupla',
    traffic_avg_daily_flow: 100,
  }) });
  const { complementar, tecnico } = polygonPropertyTiers(rodovia, {
    skip: polygonEssentialKeys(rodovia),
  });
  const todos = [...complementar, ...tecnico].map((r) => r.label);
  for (const repetido of ['Código', 'Jurisdição', 'Tipo de trecho', 'Fluxo médio diário']) {
    assert.equal(todos.includes(repetido), false, repetido);
  }
});

test('valor vazio, nulo ou aninhado não vira linha', () => {
  // Objeto viraria "[object Object]", que ocupa uma linha e não informa nada.
  const c = contorno({ properties_json: JSON.stringify({
    vazio: '', so_espaco: '   ', nulo: null, aninhado: { a: 1 }, lista: [1, 2], bom: 'sim',
  }) });
  const { complementar, tecnico } = polygonPropertyTiers(c);
  assert.deepEqual([...complementar, ...tecnico].map((r) => r.label), ['Bom']);
});

test('contorno sem properties_json não estoura', () => {
  assert.deepEqual(polygonPropertyTiers(contorno()), { complementar: [], tecnico: [] });
  assert.deepEqual(polygonPropertyTiers(null), { complementar: [], tecnico: [] });
  assert.deepEqual(polygonEssentials(null, null), []);
  assert.deepEqual(polygonEssentialKeys(contorno()), []);
});
