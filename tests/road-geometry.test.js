// Camada de trechos rodoviários oficiais do DER/DF — issue #131.
//
// O que este arquivo existe para impedir tem três formas, e as três são silenciosas:
//
// 1. Um trecho que SOME do mapa sem erro nenhum. Foi o estado de todos os cinco até esta
//    issue: `renderPolygons` aceitava só `Polygon`/`MultiPolygon`, e as LineStrings caíam
//    num `continue` mudo com o dado íntegro na planilha o tempo todo.
// 2. Uma linha desenhada como ÁREA. É pior que sumir: um eixo de 24 pontos "fechado" é
//    geografia falsa com a aparência de um dado bom.
// 3. Um vínculo feito por NOME. "DF-001" é o nome dos cinco trechos do piloto; casar por
//    ele cola o fluxo de um trecho no painel de outro, com todos os números plausíveis.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PILOT_ROAD_SEGMENT_CODES, OFFICIAL_SOURCE_SYSTEM, OFFICIAL_SOURCE_LAYER,
  isRoadSegmentPolygon, selectRoadSegmentPolygons, parseLineGeometry, lineParts,
  roadSegmentBounds, roadSegmentIdOf, roadSegmentCodeOf, validateRoadSegmentLayer,
  drawsAsLine,
} from '../src/traffic/road-geometry.js';
import { normalizePolygons, normalizePolygon } from '../src/normalize.js';
import {
  normalizeRoadSegments, normalizeRoadSegmentAliases, normalizeTrafficDailyRecords,
} from '../src/traffic/normalize.js';
import { linkTrafficDataset, segmentIdsWithTraffic } from '../src/traffic/link.js';
import { roadSegmentTrafficDetail } from '../src/traffic/panel.js';
import {
  polygonRows, roadSegmentRows, aliasRows, trafficRows,
} from './helpers/roadSegmentRows.mjs';

const trechos = () => normalizePolygons(polygonRows());
const contorno = (over = {}) => normalizePolygon({ polygon_id: 'P1', status: 'active', ...over });

// --- Identificação POR CAMPO, nunca por posição na planilha -------------------------

test('os cinco trechos são encontrados pelos campos, não pelas linhas 39-43', () => {
  // As cinco linhas de trecho estão hoje nas linhas 39 a 43 da aba. Amanhã alguém insere
  // uma linha acima e elas estão em 40-44 — um seletor por índice quebraria naquele dia,
  // em silêncio. Aqui elas chegam no meio de contornos territoriais, fora de ordem.
  const misturado = normalizePolygons([
    { polygon_id: 'RA_X', entity_type: 'administrative_region', status: 'active',
      geometry_geojson: '{"type":"Polygon","coordinates":[[[-47.9,-15.8],[-47.8,-15.8],[-47.8,-15.7],[-47.9,-15.8]]]}' },
    ...polygonRows(),
    { polygon_id: 'AREA_Y', entity_type: 'custom_area', status: 'active' },
  ]);
  const achados = selectRoadSegmentPolygons(misturado);
  assert.equal(achados.length, 5);
  assert.deepEqual(achados.map(roadSegmentCodeOf).sort(), [...PILOT_ROAD_SEGMENT_CODES].sort());
});

test('`category: trecho_rodoviario` sozinho já identifica o trecho', () => {
  // Os dois campos são declarados no contrato, e um deles pode faltar numa linha gravada
  // por outra versão do backend. Exigir os dois faria o trecho sumir por causa de uma
  // coluna vazia.
  assert.equal(isRoadSegmentPolygon(contorno({ entity_type: 'road_segment' })), true);
  assert.equal(isRoadSegmentPolygon(contorno({ category: 'trecho_rodoviario' })), true);
  assert.equal(isRoadSegmentPolygon(contorno({ entity_type: 'administrative_region' })), false);
  assert.equal(isRoadSegmentPolygon(null), false);
});

test('nome de rodovia NÃO identifica trecho — a correspondência é por campo', () => {
  // Uma RA chamada "Rodoviária" ou um contorno chamado "DF-001" não podem virar trecho
  // rodoviário. Correspondência aproximada por texto é o que a issue proíbe.
  const isca = contorno({ name: 'DF-001 · trecho 0070', entity_type: 'administrative_region' });
  assert.equal(isRoadSegmentPolygon(isca), false);
});

// --- Linha é linha; área é área ------------------------------------------------------

test('LineString e MultiLineString passam; Polygon NUNCA vira linha', () => {
  const linha = parseLineGeometry('{"type":"LineString","coordinates":[[-47.8,-15.8],[-47.7,-15.7]]}');
  assert.equal(linha.type, 'LineString');

  const multi = parseLineGeometry('{"type":"MultiLineString","coordinates":[[[-47.8,-15.8],[-47.7,-15.7]],[[-47.6,-15.6],[-47.5,-15.5]]]}');
  assert.equal(multi.type, 'MultiLineString');
  assert.equal(lineParts(multi).length, 2);

  // Uma área que chegue por esta porta é recusada, não "adaptada": desenhar o anel de um
  // polígono como linha mostraria uma via que ninguém publicou.
  assert.equal(parseLineGeometry('{"type":"Polygon","coordinates":[[[-47.9,-15.8],[-47.8,-15.8],[-47.8,-15.7],[-47.9,-15.8]]]}'), null);
  assert.equal(parseLineGeometry('{"type":"MultiPolygon","coordinates":[]}'), null);
});

test('geometria ilegível ou vazia devolve null em vez de estourar', () => {
  // O parse é por registro e isolado (R2.6): um blob malformado tira UM trecho do mapa,
  // não derruba o carregamento das outras camadas.
  assert.equal(parseLineGeometry('{isto nao e json'), null);
  assert.equal(parseLineGeometry(''), null);
  assert.equal(parseLineGeometry(null), null);
  assert.equal(parseLineGeometry('{"type":"LineString","coordinates":[]}'), null);
  assert.deepEqual(lineParts(null), []);
});

test('os cinco trechos do piloto têm geometria de linha utilizável', () => {
  for (const trecho of trechos()) {
    const geometry = parseLineGeometry(trecho.geometry_geojson);
    assert.ok(geometry, `${trecho.id} sem geometria de linha`);
    assert.equal(geometry.type, 'LineString');
    assert.ok(lineParts(geometry)[0].length > 1, `${trecho.id} com menos de dois vértices`);
  }
});

// --- O corredor de ÁREA da v2.2.1 continua sendo área ---------------------------------
//
// Esta seção existe por causa de uma regressão real, introduzida pela primeira versão
// desta issue e pega pelo smoke test: o desenho era despachado por
// `entity_type === 'road_segment'`, e isso mandava o corredor legado — que é
// `road_segment` com geometria `Polygon` — para o renderizador de linha, que o recusava.
// Todo corredor gravado antes da migração sumia do mapa sem erro nenhum. É o mesmo
// defeito que a issue conserta, reintroduzido pela correção dele.

const corredorLegado = () => contorno({
  polygon_id: 'ROADSEG_CORREDOR_ANTIGO',
  layer_group: 'road_network',
  entity_type: 'road_segment',
  geometry_geojson: '{"type":"Polygon","coordinates":[[[-47.95,-15.85],[-47.85,-15.85],[-47.85,-15.84],[-47.95,-15.85]]]}',
});

test('corredor com entity_type road_segment e geometria Polygon é ÁREA, não linha', () => {
  const corredor = corredorLegado();
  // Ele É um trecho rodoviário — a classificação por campo continua certa...
  assert.equal(isRoadSegmentPolygon(corredor), true);
  // ...mas quem decide COMO desenhar é a geometria, e ela é área.
  assert.equal(drawsAsLine(corredor), false);
  assert.equal(parseLineGeometry(corredor.geometry_geojson), null);
});

test('eixo do DER desenha como linha; as duas perguntas não são a mesma', () => {
  const eixo = trechos()[0];
  assert.equal(isRoadSegmentPolygon(eixo), true);
  assert.equal(drawsAsLine(eixo), true);
});

test('corredor legado não é cobrado pelo contrato do eixo oficial', () => {
  // Ele não é LineString, não tem `source_system` do DER e não tem `road_segment_id` — e
  // nada disso é defeito, porque ele não é um dos cinco do piloto. Acusá-lo encheria o
  // canal de avisos de falsos positivos, que é o jeito mais rápido de fazer todo mundo
  // parar de ler os avisos verdadeiros.
  const { segments, warnings } = validateRoadSegmentLayer([...trechos(), corredorLegado()]);
  assert.equal(segments.length, 6, 'o corredor continua sendo reconhecido como trecho');
  assert.deepEqual(warnings, []);
});

// --- Enquadramento -------------------------------------------------------------------

test('os limites saem em [lat, lon] e caem dentro do DF', () => {
  // GeoJSON é [longitude, latitude] e o Leaflet é [latitude, longitude]. Trocar os dois
  // enquadra o Golfo da Guiné, e o sintoma não aponta para a linha que causou.
  const bounds = roadSegmentBounds(trechos());
  assert.ok(bounds.length > 100, `poucos vértices (${bounds.length})`);
  for (const [lat, lon] of bounds) {
    assert.ok(lat > -16.1 && lat < -15.4, `latitude fora do DF: ${lat}`);
    assert.ok(lon > -48.3 && lon < -47.3, `longitude fora do DF: ${lon}`);
  }
});

test('vértice corrompido não arrasta o enquadramento para o oceano', () => {
  const ruim = normalizePolygons([{
    polygon_id: 'ROADSEG_RUIM', entity_type: 'road_segment', status: 'active',
    geometry_geojson: JSON.stringify({
      type: 'LineString',
      coordinates: [[-47.8, -15.8], ['x', 'y'], [999, 999], [-47.7, -15.7]],
    }),
  }]);
  assert.deepEqual(roadSegmentBounds(ruim), [[-15.8, -47.8], [-15.7, -47.7]]);
});

test('contorno de área não contribui com nenhum vértice para o enquadramento', () => {
  const ra = normalizePolygons([{
    polygon_id: 'RA_X', entity_type: 'administrative_region', status: 'active',
    geometry_geojson: '{"type":"Polygon","coordinates":[[[-47.9,-15.8],[-47.8,-15.8],[-47.8,-15.7],[-47.9,-15.8]]]}',
  }]);
  assert.deepEqual(roadSegmentBounds(ra), []);
});

// --- Identificador do trecho ---------------------------------------------------------

test('o id do trecho vem de properties_json e, na falta dele, de entity_id', () => {
  assert.equal(
    roadSegmentIdOf(contorno({ entity_type: 'road_segment', entity_id: 'ENT',
      properties_json: '{"road_segment_id":"ROADSEG_A"}' })),
    'ROADSEG_A',
  );
  assert.equal(roadSegmentIdOf(contorno({ entity_type: 'road_segment', entity_id: 'ROADSEG_B' })), 'ROADSEG_B');
  // `polygon_id` NÃO entra: ele identifica o DESENHO, não o trecho. Hoje os dois
  // coincidirem é conveniência da sincronização, não garantia do contrato.
  assert.equal(roadSegmentIdOf(contorno({ polygon_id: 'ROADSEG_C', entity_type: 'road_segment' })), null);
});

// --- Validação: desvio vira aviso nomeado, nunca exceção e nunca silêncio -------------

test('o piloto íntegro não produz nenhum aviso', () => {
  const { bySegmentId } = linkTrafficDataset(
    normalizeRoadSegments(roadSegmentRows()).records,
    trechos(),
    normalizeTrafficDailyRecords(trafficRows()).records,
    normalizeRoadSegmentAliases(aliasRows()).records,
  );
  const { segments, warnings } = validateRoadSegmentLayer(trechos(), {
    trafficSegmentIds: segmentIdsWithTraffic(bySegmentId),
  });
  assert.equal(segments.length, 5);
  assert.deepEqual(warnings, []);
});

test('camada inteira ausente vira UM aviso, não cinco', () => {
  // Cinco linhas dizendo a mesma coisa afogariam os avisos das outras abas.
  const { segments, warnings } = validateRoadSegmentLayer([]);
  assert.deepEqual(segments, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /nenhum encontrado/);
});

test('trecho faltando é dito PELO CÓDIGO, não por uma contagem', () => {
  // "4 de 5" não diz a ninguém qual conferir na planilha.
  const quatro = trechos().filter((p) => roadSegmentCodeOf(p) !== '001EDF0110');
  const { warnings } = validateRoadSegmentLayer(quatro);
  assert.ok(warnings.some((w) => w.includes('001EDF0110') && /ausente/.test(w)), warnings.join(' | '));
  assert.ok(warnings.some((w) => /encontrados 4 dos 5 do piloto/.test(w)), warnings.join(' | '));
});

test('código duplicado é apontado: duas linhas no mesmo lugar tiram a regra do clique', () => {
  const linhas = polygonRows();
  const { warnings } = validateRoadSegmentLayer(
    normalizePolygons([...linhas, { ...linhas[0], polygon_id: 'ROADSEG_COPIA' }])
  );
  assert.ok(warnings.some((w) => /duplicado/.test(w) && w.includes('001EDF0070')), warnings.join(' | '));
});

test('geometria de área, tipo declarado errado e origem não oficial viram avisos', () => {
  const torto = normalizePolygons([{
    polygon_id: 'ROADSEG_001EDF0070', entity_type: 'road_segment', status: 'active',
    properties_json: '{"cod_distrital":"001EDF0070","road_segment_id":"ROADSEG_001EDF0070"}',
    geometry_type: 'Polygon',
    geometry_geojson: '{"type":"Polygon","coordinates":[[[-47.9,-15.8],[-47.8,-15.8],[-47.8,-15.7],[-47.9,-15.8]]]}',
    source_system: 'OpenStreetMap',
    source_layer_name: 'outra_camada',
  }]);
  const { warnings } = validateRoadSegmentLayer(torto, { expectedCodes: ['001EDF0070'] });
  assert.ok(warnings.some((w) => /geometry_type "Polygon"/.test(w)), warnings.join(' | '));
  assert.ok(warnings.some((w) => /ilegível ou fora de/.test(w)), warnings.join(' | '));
  assert.ok(warnings.some((w) => w.includes('OpenStreetMap') && w.includes(OFFICIAL_SOURCE_SYSTEM)), warnings.join(' | '));
  assert.ok(warnings.some((w) => w.includes('outra_camada') && w.includes(OFFICIAL_SOURCE_LAYER)), warnings.join(' | '));
});

test('trecho sem fluxo em TRAFFIC_DAILY_TEST é nomeado, e a camada continua desenhada', () => {
  const semUm = trafficRows({
    segmentos: PILOT_ROAD_SEGMENT_CODES.filter((c) => c !== '001EDF0130').map((c) => `ROADSEG_${c}`),
  });
  const { bySegmentId } = linkTrafficDataset(
    normalizeRoadSegments(roadSegmentRows()).records,
    trechos(),
    normalizeTrafficDailyRecords(semUm).records,
    normalizeRoadSegmentAliases(aliasRows()).records,
  );
  const { segments, warnings } = validateRoadSegmentLayer(trechos(), {
    trafficSegmentIds: segmentIdsWithTraffic(bySegmentId),
  });
  // O trecho continua na lista: sem fluxo ele ainda é uma geometria oficial válida.
  assert.equal(segments.length, 5);
  assert.ok(warnings.some((w) => w.includes('ROADSEG_001EDF0130') && /não tem fluxo/.test(w)), warnings.join(' | '));
});

test('a validação nunca lança, nem com entrada absurda', () => {
  // Aba opcional é entrada não confiável (R2.5/R2.6): uma exceção aqui derrubaria o mapa
  // inteiro por causa de uma camada acessória.
  for (const entrada of [null, undefined, [], [null], [{}], [{ entity_type: 'road_segment' }]]) {
    assert.doesNotThrow(() => validateRoadSegmentLayer(entrada));
  }
});

// --- Vínculo geometria ↔ trecho ↔ fluxo, sempre por identificador ---------------------

test('trecho com current_polygon_id VAZIO ainda acha a geometria pela entity_id', () => {
  // É o estado real da planilha hoje: a sincronização grava a linha em POLYGONS com
  // `entity_id` preenchido e deixa `ROAD_SEGMENTS.current_polygon_id` vazio. Sem este
  // caminho, os cinco trechos ficam "sem geometria" com a geometria desenhada no mapa.
  const segmentos = normalizeRoadSegments(roadSegmentRows()).records;
  assert.equal(segmentos[0].currentPolygonId, null, 'a fixture precisa reproduzir a coluna vazia');

  const { bySegmentId } = linkTrafficDataset(
    segmentos, trechos(), normalizeTrafficDailyRecords(trafficRows()).records,
    normalizeRoadSegmentAliases(aliasRows()).records,
  );
  for (const code of PILOT_ROAD_SEGMENT_CODES) {
    const linked = bySegmentId.get(`ROADSEG_${code}`);
    assert.ok(linked.polygon, `${code} sem geometria ligada`);
    assert.equal(linked.polygon.id, `ROADSEG_${code}`);
  }
});

test('entity_id de contorno que NÃO é trecho nunca vira geometria de trecho', () => {
  // Um contorno qualquer também carrega `entity_id`. Casar só por ele colaria o desenho de
  // um território num trecho de rodovia, com todos os campos plausíveis.
  const isca = normalizePolygons([{
    polygon_id: 'POLY_RA', entity_type: 'administrative_region',
    entity_id: 'ROADSEG_001EDF0070', status: 'active',
    geometry_geojson: '{"type":"Polygon","coordinates":[[[-47.9,-15.8],[-47.8,-15.8],[-47.8,-15.7],[-47.9,-15.8]]]}',
  }]);
  const { bySegmentId } = linkTrafficDataset(
    normalizeRoadSegments(roadSegmentRows()).records, isca, [], [],
  );
  assert.equal(bySegmentId.get('ROADSEG_001EDF0070').polygon, null);
});

test('current_polygon_id preenchido tem precedência sobre o caminho por entity_id', () => {
  // Quando o backend preencher a coluna canônica, é ela que manda — o segundo caminho é
  // uma ponte, não uma substituição.
  const linhas = polygonRows();
  const polygons = normalizePolygons([
    ...linhas,
    { ...linhas[0], polygon_id: 'POLY_CANONICO', entity_id: 'ROADSEG_001EDF0070' },
  ]);
  const segmentos = normalizeRoadSegments(
    roadSegmentRows().map((r) => (r.road_segment_id === 'ROADSEG_001EDF0070'
      ? { ...r, current_polygon_id: 'POLY_CANONICO' } : r))
  ).records;
  const { bySegmentId } = linkTrafficDataset(segmentos, polygons, [], []);
  assert.equal(bySegmentId.get('ROADSEG_001EDF0070').polygon.id, 'POLY_CANONICO');
});

// --- Fluxo no painel do trecho -------------------------------------------------------

test('o fluxo é lido por road_segment_id, e cada trecho só vê o seu', () => {
  const { bySegmentId } = linkTrafficDataset(
    normalizeRoadSegments(roadSegmentRows()).records,
    trechos(),
    normalizeTrafficDailyRecords(trafficRows({ dias: 3 })).records,
    normalizeRoadSegmentAliases(aliasRows()).records,
  );
  const detalhe = roadSegmentTrafficDetail(bySegmentId.get('ROADSEG_001EDF0070'));
  assert.equal(detalhe.segmentId, 'ROADSEG_001EDF0070');
  assert.equal(detalhe.hasTraffic, true);
  assert.equal(detalhe.geral.days, 3);
  // Os cinco trechos têm o mesmo nome de rodovia ("DF-001"): se o vínculo fosse por nome,
  // este trecho teria os 15 dias de todos eles.
  assert.notEqual(detalhe.geral.days, 15);
});

test('sentidos aparecem SEPARADOS, nunca somados às cegas', () => {
  const { bySegmentId } = linkTrafficDataset(
    normalizeRoadSegments(roadSegmentRows()).records, trechos(),
    normalizeTrafficDailyRecords(trafficRows({ dias: 2 })).records, [],
  );
  // No piloto cada trecho tem um sentido só; o 0090 é o decrescente.
  assert.deepEqual(
    roadSegmentTrafficDetail(bySegmentId.get('ROADSEG_001EDF0090')).porSentido.map((c) => c.label),
    ['Decrescente'],
  );
  assert.deepEqual(
    roadSegmentTrafficDetail(bySegmentId.get('ROADSEG_001EDF0070')).porSentido.map((c) => c.label),
    ['Crescente'],
  );
});

test('classe de veículo sem nenhum dia medido some; nunca vira zero', () => {
  // Zero caminhões é uma via por onde caminhão não passa. Ausência de medição é outra
  // afirmação, e a diferença é o ponto da R5.7.
  const linhas = trafficRows({ dias: 2 }).map((r) => ({ ...r, caminhao: '' }));
  const { bySegmentId } = linkTrafficDataset(
    normalizeRoadSegments(roadSegmentRows()).records, trechos(),
    normalizeTrafficDailyRecords(linhas).records, [],
  );
  const classes = roadSegmentTrafficDetail(bySegmentId.get('ROADSEG_001EDF0070')).geral.classes;
  const caminhao = classes.find((c) => c.key === 'caminhao');
  assert.equal(caminhao.total, null);
  assert.equal(caminhao.days, 0);
  // `indefinido` é medido e vale zero de verdade — esse continua aparecendo.
  assert.equal(classes.find((c) => c.key === 'indefinido').total, 0);
});

test('a cobertura vem de intervalos_15min_observados, nunca de cobertura_dia_pct', () => {
  // A fixture grava `cobertura_dia_pct: 9375` no dia parcial, reproduzindo o erro de
  // separador decimal do backend (R8.58). Se alguém passar a ler essa coluna, o dia vira
  // "completo" em silêncio — por isso o teste afirma a contagem, não o campo.
  const { bySegmentId } = linkTrafficDataset(
    normalizeRoadSegments(roadSegmentRows()).records, trechos(),
    normalizeTrafficDailyRecords(trafficRows({ dias: 3, parcialNoUltimo: true })).records, [],
  );
  const cob = roadSegmentTrafficDetail(bySegmentId.get('ROADSEG_001EDF0070')).geral.cobertura;
  assert.deepEqual(cob, { completos: 2, parciais: 1, desconhecidos: 0 });
});

test('dia sem total medido fica de fora da soma e é contado, não virado zero', () => {
  const linhas = trafficRows({ dias: 3 });
  linhas[0].fluxo_total = '';
  const { bySegmentId } = linkTrafficDataset(
    normalizeRoadSegments(roadSegmentRows()).records, trechos(),
    normalizeTrafficDailyRecords(linhas).records, [],
  );
  const total = roadSegmentTrafficDetail(bySegmentId.get('ROADSEG_001EDF0070')).geral.total;
  assert.equal(total.daysUsed, 2);
  assert.equal(total.daysExcluded, 1);
});

test('trecho sem nenhum dia medido devolve hasTraffic false, não estoura', () => {
  const { bySegmentId } = linkTrafficDataset(
    normalizeRoadSegments(roadSegmentRows()).records, trechos(), [], [],
  );
  const detalhe = roadSegmentTrafficDetail(bySegmentId.get('ROADSEG_001EDF0070'));
  assert.equal(detalhe.hasTraffic, false);
  assert.deepEqual(detalhe.porSentido, []);
  assert.equal(roadSegmentTrafficDetail(null), null);
});
