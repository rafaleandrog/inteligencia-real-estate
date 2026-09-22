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
  classifyPolygonProperty, polygonDuplicateKeys, DETAIL_TIERS,
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
  // `road_segment_id` e `source_segment_code` deixaram de ser pipeline na issue #131: os
  // dois passaram a ser a identidade que o painel do trecho precisa mostrar — o primeiro é
  // a chave pela qual o fluxo de TRAFFIC_DAILY_TEST é ligado, e é ele que alguém confere
  // na planilha quando discorda de um número.
  assert.deepEqual(complementar.map((r) => r.label).sort(), [
    'Administração', 'Código na fonte', 'ID do trecho', 'Última medição',
  ]);
  assert.deepEqual(tecnico.map((r) => r.label).sort(), [
    'Display buffer m each side', 'Native source crs', 'Traffic relation dataset',
  ]);
});

// --- Vocabulário do DER/DF de hoje (issue #131) -------------------------------------

test('trecho do DER: o essencial lê as chaves que a planilha realmente grava', () => {
  // A lista anterior (`road_code`, `segment_type`, `jurisdiction`, `traffic_avg_daily_flow`)
  // era do contrato previsto, não do gravado: a sincronização nunca escreveu nenhuma delas
  // em POLYGONS. O efeito era um essencial VAZIO em todos os cinco trechos do piloto — e um
  // painel que abre sem nada parece um trecho sem dado, não uma chave procurada errada.
  const trecho = contorno({
    entity_type: 'road_segment', category: 'trecho_rodoviario', name: 'DF-001 · trecho 0070',
    properties_json: JSON.stringify({
      cod_distrital: '001EDF0070', rodovia: 'DF001', extensao_km: 0.9,
      tmd_der: '26402', situacao_fisica: 'PAV', fx_total: 2, fx_direita: 1, fx_esquerda: 1,
    }),
  });
  assert.deepEqual(polygonEssentials(trecho, null), [
    { label: 'Código do trecho', value: '001EDF0070' },
    { label: 'Rodovia', value: 'DF001' },
    { label: 'Extensão', value: '0,9 km' },
    { label: 'TMD oficial do DER/DF', value: '26.402 veíc./dia' },
    { label: 'Faixas', value: '2 (1 + 1)' },
    { label: 'Situação física', value: 'PAV' },
  ]);
});

test('extensão em décimos de km não é arredondada para o inteiro', () => {
  // 0,9 km arredondado para "1 km" inventa 100 m num trecho de 900. Décimo de quilômetro é
  // a precisão real do cadastro do DER, e a vírgula é o separador do pt-BR.
  const trecho = contorno({ entity_type: 'road_segment',
    properties_json: JSON.stringify({ cod_distrital: 'X', extensao_km: 5.6 }) });
  assert.deepEqual(polygonEssentials(trecho, null)[1], { label: 'Extensão', value: '5,6 km' });
});

test('faixas só mostram a divisão por sentido quando ela SOMA o total', () => {
  const coerente = contorno({ entity_type: 'road_segment',
    properties_json: JSON.stringify({ rodovia: 'DF001', fx_total: 4, fx_direita: 2, fx_esquerda: 2 }) });
  assert.equal(polygonEssentials(coerente, null).find((r) => r.label === 'Faixas').value, '4 (2 + 2)');

  // Divisão que não fecha: o parêntese seria uma afirmação que o próprio registro
  // contradiz. O total continua sendo o dado oficial e a linha não some por causa disso.
  const incoerente = contorno({ entity_type: 'road_segment',
    properties_json: JSON.stringify({ rodovia: 'DF001', fx_total: 4, fx_direita: 2, fx_esquerda: 1 }) });
  assert.equal(polygonEssentials(incoerente, null).find((r) => r.label === 'Faixas').value, '4');

  // Sem o total, somar os dois lados seria derivar um número que a fonte não publicou.
  const semTotal = contorno({ entity_type: 'road_segment',
    properties_json: JSON.stringify({ rodovia: 'DF001', fx_direita: 2, fx_esquerda: 2 }) });
  assert.equal(polygonEssentials(semTotal, null).some((r) => r.label === 'Faixas'), false);
});

test('os dois vocabulários de rodovia nunca se somam no mesmo painel', () => {
  // Somá-los daria até dez linhas e quebraria o teto de seis itens da issue #55. O
  // registro escolhe UM, e o que o essencial usou é o que `polygonEssentialKeys` esconde
  // embaixo — devolver as duas listas esconderia uma chave que o topo não mostrou.
  const novo = contorno({ entity_type: 'road_segment', properties_json: JSON.stringify({
    cod_distrital: '001EDF0070', rodovia: 'DF001',
    road_code: 'DF-001', segment_type: 'pista dupla', jurisdiction: 'Distrital',
  }) });
  assert.deepEqual(polygonEssentials(novo, null).map((r) => r.label), ['Código do trecho', 'Rodovia']);
  const { complementar } = polygonPropertyTiers(novo, { skip: polygonEssentialKeys(novo) });
  // As chaves do vocabulário antigo continuam visíveis — embaixo, não apagadas.
  assert.deepEqual(complementar.map((r) => r.label).sort(), ['Código', 'Jurisdição', 'Tipo de trecho']);
});

test('procedência da geometria fica legível E no técnico, nunca no complementar', () => {
  // Sem rótulo declarado, `geometry_sha256` voltava cru como "Geometry sha256". Com rótulo
  // simples, subiria para o bloco que o usuário lê primeiro. Rótulo e nível são decisões
  // separadas, e é por isso que a lista declara os dois.
  assert.deepEqual(classifyPolygonProperty('geometry_sha256'),
    { tier: DETAIL_TIERS.TECNICO, label: 'Hash da geometria consultada' });
  assert.deepEqual(classifyPolygonProperty('geometry_source_feature_id'),
    { tier: DETAIL_TIERS.TECNICO, label: 'OBJECTID na camada oficial' });
  assert.deepEqual(classifyPolygonProperty('geometry_source_url'),
    { tier: DETAIL_TIERS.TECNICO, label: 'Fonte oficial da geometria' });
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

// --- Chaves de properties_json que repetem uma coluna — issue #138 -------------------
//
// No painel de um trecho do DER o hash saía duas vezes (`geometry_sha256` e a coluna
// `geometry_hash`) e o OBJECTID duas vezes (`geometry_source_feature_id` e
// `source_feature_id`). O mesmo fato em duas linhas faz quem lê conferir se são a mesma
// coisa — o custo exato que a hierarquia da #55 existe para evitar.

test('chave de properties_json idêntica à coluna é apontada como duplicata', () => {
  const p = contorno({
    geometry_hash: 'abc123',
    source_feature_id: '188',
    source_crs: 'EPSG:31983',
    properties_json: JSON.stringify({
      geometry_sha256: 'abc123',
      geometry_source_feature_id: '188',
      geometry_source_crs: 'EPSG:31983',
    }),
  });
  assert.deepEqual(polygonDuplicateKeys(p).sort(), [
    'geometry_sha256', 'geometry_source_crs', 'geometry_source_feature_id',
  ]);
});

test('valor DIFERENTE da coluna continua aparecendo — a divergência é a informação', () => {
  // Hash recalculado, ou camada que mudou de CRS: sumir com um dos dois apagaria a
  // evidência justamente no caso em que ela importa (R5.7).
  const p = contorno({
    geometry_hash: 'novo',
    source_crs: 'EPSG:4326',
    properties_json: JSON.stringify({
      geometry_sha256: 'antigo',
      geometry_source_crs: 'EPSG:31983',
    }),
  });
  assert.deepEqual(polygonDuplicateKeys(p), []);
});

test('coluna vazia não transforma a propriedade em duplicata', () => {
  const p = contorno({ properties_json: JSON.stringify({ geometry_sha256: 'abc123' }) });
  assert.deepEqual(polygonDuplicateKeys(p), []);
});

test('display_geometry_crs nunca é duplicata de source_crs', () => {
  // Uma diz em que CRS a geometria DESENHADA está (sempre 4326), a outra em que CRS a
  // camada de origem mantém o cadastro. Coincidirem não as torna o mesmo fato.
  const p = contorno({
    source_crs: 'EPSG:4326',
    properties_json: JSON.stringify({ display_geometry_crs: 'EPSG:4326' }),
  });
  assert.deepEqual(polygonDuplicateKeys(p), []);
});

test('as duplicatas somem do painel quando passadas em skip, e o resto fica', () => {
  const p = contorno({
    geometry_hash: 'abc123',
    properties_json: JSON.stringify({
      geometry_sha256: 'abc123',
      geometry_status: 'official',
    }),
  });
  const { tecnico } = polygonPropertyTiers(p, { skip: polygonDuplicateKeys(p) });
  const rotulos = tecnico.map((r) => r.label);
  assert.ok(!rotulos.includes('Hash da geometria consultada'));
  assert.ok(rotulos.includes('Situação da geometria'));
});

test('contorno ausente não quebra a varredura de duplicatas', () => {
  assert.deepEqual(polygonDuplicateKeys(null), []);
  assert.deepEqual(polygonDuplicateKeys(contorno()), []);
});
