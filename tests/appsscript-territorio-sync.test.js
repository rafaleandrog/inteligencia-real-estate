// Sincronização territorial do Code.gs (issue #105), executada de verdade no sandbox:
// rodovias do DER casadas por código e desenhadas na faixa de domínio; RAs do GeoPortal
// já simplificadas, com escada de tolerância; faixas etárias de RA_PROFILES derivadas da
// aba PDAD_A_DATA. A rede é substituída por fixtures GRAVADAS das respostas reais de
// 2026-09 (DER "Rodovias 2025" e GeoPortal/SEDUH) — não são payloads inventados para o
// teste, e é por isso que os números afirmados abaixo são os da planilha e das camadas.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAppsScriptSandbox } from './helpers/appsScriptSandbox.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const DER = fixture('der-rodovias-2025-df001.json');
const RAS = fixture('geoportal-ras-cruzeiro-candangolandia.geojson');
const RENDERER = fixture('geoportal-limites-renderer.json');
const PDAD_AGE = JSON.parse(fixture('pdad-age-sex-ra11-ra19.json'));

/** UrlFetchApp falso: responde por padrão de URL e registra cada chamada. */
function fakeFetch(routes, calls) {
  return (url) => {
    calls.push(url);
    for (const [pattern, body] of routes) {
      if (pattern.test(url)) {
        const text = typeof body === 'function' ? body(url) : body;
        return { getResponseCode: () => 200, getContentText: () => text };
      }
    }
    throw new Error(`URL não prevista pelo teste: ${url}`);
  };
}

/** Abas mínimas para as duas sincronizações rodarem inteiras (lock, meta, changelog). */
function sheetsBase(context) {
  const H = context.REQUIRED_HEADERS;
  return {
    POLYGONS: [H.POLYGONS],
    ROAD_SEGMENTS: [H.ROAD_SEGMENTS],
    ROAD_SEGMENT_ALIASES: [H.ROAD_SEGMENT_ALIASES],
    TRAFFIC_DAILY_TEST: [H.TRAFFIC_DAILY_TEST],
    RA_PROFILES: [H.RA_PROFILES],
    APP_META: [['key', 'value', 'updated_at']],
    CHANGE_LOG: [['timestamp', 'sheet', 'field', 'record_id', 'old_value', 'new_value', 'editor', 'correlation_id', 'result', 'error_reason']],
  };
}

function trafficRow(H, id, trecho, dia, fluxo) {
  const row = H.TRAFFIC_DAILY_TEST.map(() => '');
  const set = (k, v) => { row[H.TRAFFIC_DAILY_TEST.indexOf(k)] = v; };
  set('traffic_daily_id', id); set('trecho', trecho); set('sentido', 'crescente'); set('dia', dia);
  set('fluxo_total', fluxo); set('intervalos_15min_observados', 96);
  return row;
}

function profileRow(H, values) {
  const row = H.RA_PROFILES.map(() => '');
  for (const [k, v] of Object.entries(values)) row[H.RA_PROFILES.indexOf(k)] = v;
  return row;
}

function rowsOf(sheet, headers) {
  return sheet._rows.slice(1).map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
}

// --- rodovias -------------------------------------------------------------------------

function sandboxRodovias() {
  const probe = createAppsScriptSandbox().context;
  const H = probe.REQUIRED_HEADERS;
  const sheets = sheetsBase(probe);
  sheets.TRAFFIC_DAILY_TEST.push(
    trafficRow(H, 'T1', '001EDF0070', '2026-04-01', 13654),
    trafficRow(H, 'T2', '001EDF0070', '2026-04-02', 13849),
    trafficRow(H, 'T3', '001EDF0090', '2026-04-01', 14000),
    trafficRow(H, 'T4', '999EDF0001', '2026-04-01', 500), // não existe na camada do DER
  );
  const sandbox = createAppsScriptSandbox({ sheets });
  const calls = [];
  sandbox.context.UrlFetchApp.fetch = fakeFetch([
    [/Rodovias_2025\/FeatureServer\/0\/query\?.*cod_distrital%3D'001EDF0070'/, DER_ONLY('001EDF0070')],
    [/Rodovias_2025\/FeatureServer\/0\/query\?.*cod_distrital%3D'001EDF0090'/, DER_ONLY('001EDF0090')],
    [/Rodovias_2025\/FeatureServer\/0\/query\?/, JSON.stringify({ features: [] })],
  ], calls);
  return { ...sandbox, calls, H };
}

function DER_ONLY(code) {
  const payload = JSON.parse(DER);
  return JSON.stringify({ ...payload, features: payload.features.filter((f) => f.attributes.cod_distrital === code) });
}

// Formato que a aba POLYGONS tem HOJE em produção, conferido ao vivo em 2026-09-21.
//
// A sincronização versionada aqui precisa PRODUZIR isto. Enquanto ela produzia outra coisa
// (corredor com buffer, `polygon_id` com hash, `layer_group: road_network`, chaves `der_*`),
// rodar o menu da planilha teria substituído os cinco eixos oficiais por corredores cinza
// sob ids novos — o risco que a issue #132 registrou.
const FORMATO_EM_PRODUCAO = {
  polygon_id: 'ROADSEG_001EDF0070',
  entity_id: 'ROADSEG_001EDF0070',
  category: 'trecho_rodoviario',
  subcategory: 'rodovia',
  layer_group: 'road_segments',
  entity_type: 'road_segment',
  geometry_type: 'LineString',
  geometry_role: 'route_axis',
  source_geometry_type: 'Polyline',
  source_system: 'DER_DF',
  source_layer_name: 'Rodovias_2025',
  source_crs: 'EPSG:31983',
  source_file: 'Rodovias_2025',
  status: 'active',
  display_buffer_m: 0,
  confidence_flag: 'high_official_source',
  quality_flag: 'valid_official_geometry',
};

test('o sync das rodovias casa por cod_distrital e grava o EIXO oficial, não um corredor', () => {
  const { context, sheets, calls, H } = sandboxRodovias();
  const result = context.syncRoadSegmentsFromTraffic_();

  assert.deepEqual({ ...result }, { synced: 2, skipped: 1, failed: 0, retired: 0 });
  // Casamento EXATO: a consulta leva o código, nunca `nome LIKE '%DF-001%'`.
  assert.ok(calls.every((url) => /cod_distrital/.test(url)), calls.join('\n'));
  assert.ok(calls.every((url) => !/LIKE/.test(url)), 'sobrou casamento por rota');

  const polys = rowsOf(sheets.POLYGONS, H.POLYGONS);
  assert.equal(polys.length, 2, 'um eixo por código encontrado; o código inexistente não vira linha');
  const p70 = polys.find((p) => p.entity_id === 'ROADSEG_001EDF0070');
  assert.ok(p70, 'eixo do 001EDF0070');

  // O formato inteiro, campo a campo, contra o que a planilha tem hoje.
  for (const [campo, esperado] of Object.entries(FORMATO_EM_PRODUCAO)) {
    assert.equal(p70[campo], esperado, `POLYGONS.${campo}`);
  }

  // A geometria desenhada É a linha de origem — não uma derivação dela.
  assert.equal(p70.geometry_geojson, p70.source_geometry_geojson);
  // E é LINHA: o validador de área a recusa, o de origem a aceita. Esta dupla é o que
  // impede um buffer de voltar por descuido.
  assert.equal(context.validateGeoJsonSourceGeometry_(p70.geometry_geojson).ok, true);
  assert.equal(context.validateGeoJsonGeometry_(p70.geometry_geojson).ok, false);
  assert.equal(JSON.parse(p70.geometry_geojson).type, 'LineString');

  // Eixo não tem área: os campos de área ficam VAZIOS, não zerados — zero afirmaria uma
  // medição feita que deu zero.
  assert.equal(p70.area_m2, '');
  assert.equal(p70.area_ha, '');
  const length = context.lineGeometryLengthM_(JSON.parse(p70.source_geometry_geojson));
  assert.ok(Math.abs(p70.perimeter_m - length) < 1, `comprimento ${p70.perimeter_m} vs ${length}`);

  // Cartografia da camada, na criação.
  assert.equal(p70.fill_opacity, 0, 'eixo não tem preenchimento');
  assert.equal(p70.stroke_width, 4);
  assert.equal(p70.z_index, 5);
  assert.match(String(p70.color), /^#[0-9A-F]{6}$/i);
  assert.equal(p70.stroke_color, p70.color);

  // Cores DISTINTAS por trecho: cinco linhas cinza encostadas na mesma rodovia são
  // indistinguíveis no mapa e no clique.
  const cores = new Set(polys.map((p) => p.color));
  assert.equal(cores.size, polys.length, 'dois eixos com a mesma cor');

  // `properties_json` com os nomes da CAMADA, não com prefixo `der_`.
  const props = JSON.parse(p70.properties_json);
  assert.equal(props.rodovia, 'DF001');
  assert.equal(props.cod_distrital, '001EDF0070');
  assert.equal(props.road_segment_id, 'ROADSEG_001EDF0070');
  // O TMD vai como TEXTO, que é como a camada o publica.
  assert.equal(props.tmd_der, '26402');
  assert.equal(props.extensao_km, 0.9);
  assert.equal(props.situacao_fisica, 'PAV');
  assert.equal(props.tipo_revestimento, 'CBUQ');
  assert.equal(props.fx_total, 2);
  assert.equal(props.fx_direita, 1);
  assert.equal(props.fx_esquerda, 1);
  assert.equal(props.descricao_inicial, 'ENTR. DF-005 (EPPR)');
  assert.equal(props.geometry_status, 'official');
  assert.equal(props.geometry_source_layer, 'Rodovias_2025');
  assert.equal(props.geometry_source_crs, 'EPSG:31983');
  assert.equal(props.display_geometry_crs, 'EPSG:4326');
  assert.equal(props.geometry_query_out_sr, '4326');
  assert.equal(props.traffic_dataset, 'TRAFFIC_DAILY_TEST');
  assert.equal(props.traffic_link_key, 'road_segment_id');
  assert.equal(props.geometry_sha256, p70.geometry_hash);
  // Nenhuma chave `der_*`: elas nunca chegaram à planilha e o cliente que as lia mostrava
  // um painel vazio (issue #131).
  assert.deepEqual(Object.keys(props).filter((k) => k.startsWith('der_')), []);

  assert.match(p70.description, /TMD DER\/DF: 26402/);
  assert.match(p70.name, /trecho 0070$/);

  const segs = rowsOf(sheets.ROAD_SEGMENTS, H.ROAD_SEGMENTS);
  const s70 = segs.find((r) => r.road_segment_id === 'ROADSEG_001EDF0070');
  // A regra de vínculo da planilha: current_polygon_id = polygon_id = road_segment_id.
  assert.equal(s70.current_polygon_id, p70.polygon_id, 'o trecho aponta para o eixo vigente');
  assert.equal(s70.current_polygon_id, s70.road_segment_id);
  assert.equal(s70.road_code, 'DF001');
  assert.equal(s70.road_name, 'DF-001');
  assert.equal(s70.segment_type, 'road_segment');
  assert.equal(s70.jurisdiction, 'DF');
  assert.equal(s70.source_layer_name, 'Rodovias_2025');
  assert.equal(s70.source_crs, 'EPSG:31983');
  assert.equal(s70.confidence_flag, 'official_der_geometry');
  assert.equal(s70.quality_flag, 'ok_official_geometry');
  assert.ok(s70.length_m > 800 && s70.length_m < 1000, `comprimento ${s70.length_m} fora do km 17,0–17,9`);
  assert.equal(JSON.parse(s70.properties_json).tmd_der, '26402');
  // A camada Rodovias 2025 publica `OBJECTID` em maiúsculas: a coluna canônica de
  // procedência tem de carregar o mesmo id que `properties_json.geometry_source_feature_id`.
  assert.notEqual(s70.source_feature_id, '', 'source_feature_id do trecho vazio');
  assert.equal(String(s70.source_feature_id), String(JSON.parse(s70.properties_json).geometry_source_feature_id));
  assert.equal(String(p70.source_feature_id), String(s70.source_feature_id), 'eixo e trecho com a mesma feição');
  assert.equal(segs.some((r) => r.road_segment_id === 'ROADSEG_999EDF0001'), false, 'código sem feição não vira trecho');

  // O alias declara o sistema do TRÁFEGO e o método exato, como a planilha traz.
  const aliases = rowsOf(sheets.ROAD_SEGMENT_ALIASES, H.ROAD_SEGMENT_ALIASES);
  const a70 = aliases.find((r) => r.road_segment_id === 'ROADSEG_001EDF0070');
  assert.equal(a70.source_system, 'DER_TRAFFIC');
  assert.equal(a70.match_method, 'exact_source_code');

  // Toda linha de tráfego recebe o id canônico, inclusive a do código sem geometria.
  const traffic = rowsOf(sheets.TRAFFIC_DAILY_TEST, H.TRAFFIC_DAILY_TEST);
  assert.deepEqual(traffic.map((r) => r.road_segment_id),
    ['ROADSEG_001EDF0070', 'ROADSEG_001EDF0070', 'ROADSEG_001EDF0090', 'ROADSEG_999EDF0001']);

  const meta = Object.fromEntries(sheets.APP_META._rows.slice(1).map((r) => [r[0], r[1]]));
  assert.equal(meta.road_sync_status, 'synced_with_warnings');
  assert.equal(meta.road_sync_synced_count, '2');
  assert.equal(meta.road_sync_skipped_count, '1');
  assert.equal(meta.road_sync_buffer_m, '0', 'o eixo não é bufferizado');
});

test('re-sincronizar NÃO troca o id, a geometria nem a cartografia do eixo já cadastrado', () => {
  // É o critério de aceite da issue #132: rodar o menu numa planilha que já tem os eixos
  // oficiais não pode mexer neles. Antes, cada execução gerava um `polygon_id` novo (o hash
  // entrava na chave) e repintava a linha com o cinza fixo do corredor.
  const primeiro = sandboxRodovias();
  primeiro.context.syncRoadSegmentsFromTraffic_();
  const antes = rowsOf(primeiro.sheets.POLYGONS, primeiro.H.POLYGONS)
    .find((p) => p.entity_id === 'ROADSEG_001EDF0070');

  // Alguém ajusta a cor na planilha, como é permitido fazer.
  const linha = primeiro.sheets.POLYGONS._rows.find((r) => r[0] === 'ROADSEG_001EDF0070');
  const iCor = primeiro.H.POLYGONS.indexOf('stroke_color');
  const iLargura = primeiro.H.POLYGONS.indexOf('stroke_width');
  linha[iCor] = '#123456';
  linha[iLargura] = 7;

  primeiro.context.syncRoadSegmentsFromTraffic_();
  const depois = rowsOf(primeiro.sheets.POLYGONS, primeiro.H.POLYGONS)
    .filter((p) => p.entity_id === 'ROADSEG_001EDF0070');

  assert.equal(depois.length, 1, 'a re-sincronização criou uma segunda linha para o mesmo trecho');
  assert.equal(depois[0].polygon_id, antes.polygon_id, 'o polygon_id mudou entre execuções');
  assert.equal(depois[0].geometry_geojson, antes.geometry_geojson, 'a geometria foi reescrita');
  assert.equal(depois[0].status, 'active');
  // Cartografia é apresentação: a sincronização não é dona dela.
  assert.equal(depois[0].stroke_color, '#123456', 'a sincronização repintou a linha');
  assert.equal(depois[0].stroke_width, 7, 'a sincronização mudou a espessura');
});

test('código sem feição oficial aposenta o corredor e o trecho herdados de uma sincronização anterior', () => {
  // Planilha sincronizada pela v2.2.1: o 999EDF0001 tinha ganhado um corredor da rota inteira
  // por heurística. Na v2.3.0 o código não casa — e o corredor antigo não pode continuar ativo.
  const probe = createAppsScriptSandbox().context;
  const H = probe.REQUIRED_HEADERS;
  const sheets = sheetsBase(probe);
  sheets.TRAFFIC_DAILY_TEST.push(trafficRow(H, 'T4', '999EDF0001', '2026-04-01', 500));
  const seg = H.ROAD_SEGMENTS.map(() => '');
  const setSeg = (k, v) => { seg[H.ROAD_SEGMENTS.indexOf(k)] = v; };
  setSeg('road_segment_id', 'ROADSEG_999EDF0001'); setSeg('current_polygon_id', 'POLY_ROAD_999EDF0001_abc');
  setSeg('source_segment_code', '999EDF0001'); setSeg('is_current', true);
  setSeg('quality_flag', 'route_matched_by_heuristic_code');
  sheets.ROAD_SEGMENTS.push(seg);
  const poly = H.POLYGONS.map(() => '');
  const setPoly = (k, v) => { poly[H.POLYGONS.indexOf(k)] = v; };
  setPoly('polygon_id', 'POLY_ROAD_999EDF0001_abc'); setPoly('entity_id', 'ROADSEG_999EDF0001');
  setPoly('entity_type', 'road_segment'); setPoly('layer_group', 'road_network'); setPoly('status', 'active');
  setPoly('geometry_geojson', JSON.stringify({ type: 'Polygon', coordinates: [[[-47.9, -15.8], [-47.8, -15.8], [-47.8, -15.7], [-47.9, -15.8]]] }));
  sheets.POLYGONS.push(poly);

  const sandbox = createAppsScriptSandbox({ sheets });
  sandbox.context.UrlFetchApp.fetch = fakeFetch([[/Rodovias_2025\/FeatureServer\/0\/query\?/, JSON.stringify({ features: [] })]], []);
  const result = sandbox.context.syncRoadSegmentsFromTraffic_();
  assert.deepEqual({ ...result }, { synced: 0, skipped: 1, failed: 0, retired: 1 });

  const [s] = rowsOf(sandbox.sheets.ROAD_SEGMENTS, H.ROAD_SEGMENTS);
  assert.equal(s.road_segment_id, 'ROADSEG_999EDF0001', 'o trecho não é apagado: a série de tráfego continua apontando para ele');
  assert.equal(s.is_current, false);
  assert.equal(s.current_polygon_id, '', 'sem corredor vigente para o mapa desenhar');
  assert.match(String(s.valid_to), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(s.quality_flag, 'no_official_match_in_current_layer');

  const [p] = rowsOf(sandbox.sheets.POLYGONS, H.POLYGONS);
  assert.equal(p.status, 'inactive', 'o corredor herdado deixa de ser desenhado');
  assert.match(String(p.geometry_valid_to), /^\d{4}-\d{2}-\d{2}$/);

  const meta = Object.fromEntries(sandbox.sheets.APP_META._rows.slice(1).map((r) => [r[0], r[1]]));
  assert.equal(meta.road_sync_retired_count, '1');
  assert.equal(meta.road_sync_status, 'no_official_matches');
  assert.equal(meta.validation_status, 'dirty', 'aposentar também é mudança de dado: versão e cache avançam');

  // Rodar de novo sem nada vigente não aposenta duas vezes.
  const again = sandbox.context.syncRoadSegmentsFromTraffic_();
  assert.equal(again.retired, 0);
});

test('sem faixa de domínio publicada, o corredor usa o buffer padrão e diz isso', () => {
  const { context } = createAppsScriptSandbox();
  // Objetos vêm de outro `vm.Context`: comparar por campo, não por protótipo.
  const plain = (o) => ({ meters: o.meters, source: o.source });
  assert.deepEqual(plain(context.derBufferHalfWidthM_({ fd_direita_larg: null, fd_esquerda_largu: '' }, 20)),
    { meters: 20, source: 'default_buffer' });
  assert.deepEqual(plain(context.derBufferHalfWidthM_({ fd_direita_larg: 65, fd_esquerda_largu: 65 }, 20)),
    { meters: 65, source: 'der_faixa_de_dominio' });
  // Um lado só publicado vale sozinho; valor absurdo bate no teto.
  assert.deepEqual(plain(context.derBufferHalfWidthM_({ fd_direita_larg: 0, fd_esquerda_largu: 25 }, 20)),
    { meters: 25, source: 'der_faixa_de_dominio' });
  assert.equal(context.derBufferHalfWidthM_({ fd_direita_larg: 5000 }, 20).meters, context.MAX_ROAD_DISPLAY_BUFFER_M);
});

// --- Regiões Administrativas ---------------------------------------------------------

function sandboxRas({ bigFirst = false } = {}) {
  const probe = createAppsScriptSandbox().context;
  const H = probe.REQUIRED_HEADERS;
  const sheets = sheetsBase(probe);
  sheets.RA_PROFILES.push(
    profileRow(H, { ra_geo_id: 'RA_11', ra_name: 'Cruzeiro', population_total: 26435, income_per_capita_brl: 4321.5, notes: 'antiga' }),
    profileRow(H, { ra_geo_id: 'RA_19', ra_name: 'Candangolândia', population_total: 14540 }),
  );
  sheets.PDAD_A_DATA = PDAD_AGE;
  const sandbox = createAppsScriptSandbox({ sheets });
  // A exportação KMZ vai para o Drive de verdade; aqui só precisa devolver um arquivo.
  sandbox.context.Utilities.newBlob = () => ({});
  sandbox.context.Utilities.zip = () => ({});
  sandbox.context.DriveApp.createFile = () => ({ getId: () => 'kmz-teste', getUrl: () => 'https://drive/kmz', getName: () => 'ras.kmz' });

  const calls = [];
  const collection = JSON.parse(RAS);
  // Simula uma feição grande demais na busca normal: um anel com 3.000 vértices (> 48 mil chars).
  const big = { ...collection.features[1], geometry: { type: 'Polygon', coordinates: [ringWithVertices(3000)] } };
  const firstPayload = bigFirst
    ? { ...collection, features: [collection.features[0], big] }
    : collection;
  sandbox.context.UrlFetchApp.fetch = fakeFetch([
    [/LIMITES\/FeatureServer\/1\?f=json/, RENDERER],
    [/LIMITES\/FeatureServer\/1\/query\?.*where=objectid%3D72.*maxAllowableOffset=0\.0002/, JSON.stringify({ type: 'FeatureCollection', features: [collection.features[1]] })],
    [/LIMITES\/FeatureServer\/1\/query\?.*where=1%3D1/, JSON.stringify(firstPayload)],
  ], calls);
  return { ...sandbox, calls, H };
}

function ringWithVertices(n) {
  const ring = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    ring.push([Number((-47.93 + 0.01 * Math.cos(a)).toFixed(6)), Number((-15.79 + 0.01 * Math.sin(a)).toFixed(6))]);
  }
  ring.push(ring[0]);
  return ring;
}

test('o sync das RAs pede a geometria já simplificada, grava as duas RAs e completa o perfil', () => {
  const { context, sheets, calls, H } = sandboxRas();
  const result = context.syncAdministrativeRegions_();
  assert.equal(result.synced, 2);
  assert.equal(result.failed, 0);

  // A busca normal já leva o primeiro degrau da escada.
  const bulk = calls.find((url) => /where=1%3D1/.test(url));
  assert.match(bulk, /maxAllowableOffset=0\.0001/);

  const polys = rowsOf(sheets.POLYGONS, H.POLYGONS);
  assert.equal(polys.length, 2);
  const cruzeiro = polys.find((p) => p.ra_geo_id === 'RA_11');
  assert.ok(cruzeiro);
  assert.equal(cruzeiro.name, 'Cruzeiro');
  assert.equal(cruzeiro.entity_type, 'administrative_region');
  assert.equal(cruzeiro.entity_id, 'RA_11');
  assert.equal(cruzeiro.layer_group, 'administrative_regions');
  assert.equal(cruzeiro.geometry_role, 'boundary');
  assert.equal(cruzeiro.source_system, 'GeoPortal_SEDUH_DF');
  assert.equal(cruzeiro.quality_flag, 'official_boundary_simplified_for_sheet');
  assert.equal(cruzeiro.fill_color, '#9e4c5e', 'cor oficial do renderer do GeoPortal');
  assert.match(cruzeiro.polygon_id, /^POLY_RA_11_[0-9a-f]{12}$/);
  assert.equal(JSON.parse(cruzeiro.properties_json).display_simplification_tolerance_deg, '0.0001');
  assert.ok(cruzeiro.area_m2 > 3.1e6 && cruzeiro.area_m2 < 3.3e6, 'área oficial 3,19 km²');

  const perfis = rowsOf(sheets.RA_PROFILES, H.RA_PROFILES);
  const ra11 = perfis.find((r) => r.ra_geo_id === 'RA_11');
  assert.equal(ra11.ra_code, 'RA-XI');
  assert.equal(ra11.ra_number, 11);
  assert.ok(Math.abs(ra11.area_km2 - 3.19) < 0.01);
  assert.ok(Math.abs(ra11.population_density_km2 - 26435 / ra11.area_km2) < 0.01);
  // Faixas etárias agregadas da PDAD_A_DATA (34 linhas publicadas do Cruzeiro, 2024).
  assert.deepEqual(
    [ra11.population_age_0_14_pct, ra11.population_age_15_29_pct, ra11.population_age_30_44_pct,
      ra11.population_age_45_59_pct, ra11.population_age_60_plus_pct],
    [14.4, 18.9, 26.4, 21.6, 18.8],
  );
  assert.equal(ra11.income_per_capita_brl, 4321.5, 'renda já gravada nunca é tocada pelo sync');
  assert.match(ra11.notes, /PDAD_A_DATA/);

  const ra19 = perfis.find((r) => r.ra_geo_id === 'RA_19');
  assert.deepEqual(
    [ra19.population_age_0_14_pct, ra19.population_age_15_29_pct, ra19.population_age_30_44_pct,
      ra19.population_age_45_59_pct, ra19.population_age_60_plus_pct],
    [17.6, 23.1, 25.7, 17.1, 16.4],
  );
  assert.equal(ra19.income_per_capita_brl, '', 'sem renda publicada a célula continua vazia — nunca zero');
});

test('RA acima do teto da célula volta ao GeoPortal com o próximo degrau da escada', () => {
  const { context, sheets, calls, H } = sandboxRas({ bigFirst: true });
  const result = context.syncAdministrativeRegions_();
  assert.equal(result.failed, 0, 'a RA grande não pode ser descartada');
  assert.ok(calls.some((url) => /objectid%3D72/.test(url) && /maxAllowableOffset=0\.0002/.test(url)),
    'faltou a re-busca simplificada da feição 72');
  const cruzeiro = rowsOf(sheets.POLYGONS, H.POLYGONS).find((p) => p.ra_geo_id === 'RA_11');
  assert.ok(cruzeiro.geometry_geojson.length <= context.RA_SYNC_MAX_CELL_CHARS);
  assert.equal(JSON.parse(cruzeiro.properties_json).display_simplification_tolerance_deg, '0.0002');
});

test('faixas etárias só entram quando as 34 linhas vieram publicadas', () => {
  const { context } = createAppsScriptSandbox({ sheets: {
    PDAD_A_DATA: [PDAD_AGE[0], ...PDAD_AGE.slice(1).map((row, i) => (i === 0 ? row.map((v, c) => (c === 7 ? 'suppressed' : v)) : row))],
  } });
  const bands = context.ageBandsByRaFromPdad_();
  assert.equal(bands.RA_11, undefined, 'uma categoria suprimida invalida a agregação da RA');
  // Linha `published` sem valor numérico: o contador NÃO pode chegar a 34 com denominador menor.
  const semValor = createAppsScriptSandbox({ sheets: {
    PDAD_A_DATA: [PDAD_AGE[0], ...PDAD_AGE.slice(1).map((row, i) => (i === 0 ? row.map((v, c) => (c === 6 ? '' : v)) : row))],
  } }).context.ageBandsByRaFromPdad_();
  assert.equal(semValor.RA_11, undefined, 'linha publicada sem estimate_total invalida a RA');
  assert.deepEqual({ ...semValor.RA_19 }, { year: 2024, age_0_14: 17.6, age_15_29: 23.1, age_30_44: 25.7, age_45_59: 17.1, age_60_plus: 16.4 });
  // Linha repetida (mesma categoria e sexo) também não conta duas vezes.
  const repetida = createAppsScriptSandbox({ sheets: {
    PDAD_A_DATA: [PDAD_AGE[0], ...PDAD_AGE.slice(1), PDAD_AGE[1]],
  } }).context.ageBandsByRaFromPdad_();
  assert.equal(repetida.RA_11, undefined, 'linha duplicada invalida a RA em vez de inflar a faixa');
  assert.deepEqual({ ...bands.RA_19 }, { year: 2024, age_0_14: 17.6, age_15_29: 23.1, age_30_44: 25.7, age_45_59: 17.1, age_60_plus: 16.4 });
  assert.equal(context.ageBandOfCategory_('ate_4_anos'), 'age_0_14');
  assert.equal(context.ageBandOfCategory_('80_anos_ou_mais'), 'age_60_plus');
  assert.equal(context.ageBandOfCategory_('categoria_estranha'), null);
});
