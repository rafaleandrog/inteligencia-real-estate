// Linhas de POLYGONS / ROAD_SEGMENTS / TRAFFIC_DAILY_TEST dos cinco trechos do piloto,
// para os testes da camada rodoviária (issue #131).
//
// A GEOMETRIA não é escrita aqui: ela é derivada de
// `tests/fixtures/der-rodovias-2025-df001.json`, que é a resposta GRAVADA da camada
// oficial `Rodovias_2025` do DER/DF (`outSR=4326`) — o mesmo arquivo que
// tests/appsscript-territorio-sync.test.js usa para exercitar a sincronização. Copiar as
// coordenadas para um segundo arquivo criaria duas versões da mesma geometria oficial,
// que é exatamente o tipo de duplicata que dessincroniza em silêncio (R8.7).
//
// Os campos NÃO geométricos reproduzem o que a aba POLYGONS traz hoje para essas cinco
// linhas: `layer_group: road_segments`, `entity_type: road_segment`,
// `geometry_type: LineString`, `geometry_role: route_axis`, `fill_opacity: 0`,
// `stroke_width: 4` e uma cor distinta por trecho.

import { readFileSync } from 'node:fs';

const DER = JSON.parse(
  readFileSync(new URL('../fixtures/der-rodovias-2025-df001.json', import.meta.url), 'utf8')
);

/** Cores por trecho, na ordem dos OBJECTID 187..191 — as mesmas que a planilha grava. */
const CORES = ['#4C78A8', '#F58518', '#54A24B', '#E45756', '#72B7B2'];

/** `esriGeometryPolyline.paths` → GeoJSON. Uma parte vira LineString; várias, MultiLineString. */
function pathsToGeoJson(paths) {
  const partes = (paths || []).filter((p) => Array.isArray(p) && p.length > 1);
  if (partes.length === 1) return { type: 'LineString', coordinates: partes[0] };
  return { type: 'MultiLineString', coordinates: partes };
}

/** Os cinco trechos oficiais, já no formato de LINHA CRUA da aba POLYGONS. */
export function polygonRows() {
  return DER.features.map((feature, i) => {
    const a = feature.attributes;
    const id = `ROADSEG_${a.cod_distrital}`;
    const geometry = pathsToGeoJson(feature.geometry.paths);
    return {
      polygon_id: id,
      name: `DF-001 · trecho ${a.cod_distrital.slice(-4)}`,
      category: 'trecho_rodoviario',
      geometry_geojson: JSON.stringify(geometry),
      color: CORES[i % CORES.length],
      description: `DF-001 — ${a.descricao_inicial} → ${a.descricao_final}.`,
      properties_json: JSON.stringify({
        road_segment_id: id,
        source_segment_code: a.cod_distrital,
        cod_distrital: a.cod_distrital,
        rodovia: a.rodovia,
        descricao_inicial: a.descricao_inicial,
        descricao_final: a.descricao_final,
        extensao_km: a.extensao_km,
        tmd_der: a.TMD,
        situacao_fisica: a.situacao_fisica,
        tipo_revestimento: a.tipo_revestimento,
        administracao: a.administracao,
        fx_total: a.fx_total,
        fx_direita: a.fx_direita,
        fx_esquerda: a.fx_esquerda,
        geometry_status: 'official',
        geometry_type: geometry.type,
        source_geometry_type: 'Polyline',
        geometry_source_url: 'https://services7.arcgis.com/mLiYCaoVbEXk2abA/ArcGIS/rest/services/Rodovias_2025/FeatureServer/0',
        geometry_source_layer: 'Rodovias_2025',
        geometry_source_feature_id: a.OBJECTID,
        geometry_source_crs: 'EPSG:31983',
        display_geometry_crs: 'EPSG:4326',
        geometry_query_out_sr: '4326',
        geometry_sha256: `hash_${a.OBJECTID}`,
        traffic_dataset: 'TRAFFIC_DAILY_TEST',
        traffic_link_key: 'road_segment_id',
      }),
      source_url: 'https://services7.arcgis.com/mLiYCaoVbEXk2abA/ArcGIS/rest/services/Rodovias_2025/FeatureServer/0',
      source_file: 'Rodovias_2025',
      imported_at: '2026-09-21T16:21:04.111Z',
      status: 'active',
      layer_group: 'road_segments',
      subcategory: 'rodovia',
      fill_color: CORES[i % CORES.length],
      stroke_color: CORES[i % CORES.length],
      // Zero de propósito: o desenho é a LINHA do eixo, e um eixo não tem área interna.
      fill_opacity: 0,
      stroke_width: 4,
      z_index: 5,
      confidence_flag: 'high_official_source',
      quality_flag: 'valid_official_geometry',
      entity_type: 'road_segment',
      entity_id: id,
      geometry_type: geometry.type,
      geometry_role: 'route_axis',
      source_geometry_type: 'Polyline',
      display_buffer_m: 0,
      source_system: 'DER_DF',
      source_layer_name: 'Rodovias_2025',
      source_feature_id: a.OBJECTID,
      source_crs: 'EPSG:31983',
      geometry_hash: `hash_${a.OBJECTID}`,
      last_synced_at: '2026-09-21T16:21:04.111Z',
      source_geometry_geojson: JSON.stringify(geometry),
    };
  });
}

/**
 * ROAD_SEGMENTS dos mesmos cinco trechos.
 *
 * `current_polygon_id` sai VAZIO porque é assim que a planilha está hoje — é justamente o
 * estado que o segundo caminho de `linkSegmentToPolygon` existe para atravessar. Preenchê-lo
 * aqui faria o teste passar sobre um dado que a produção não tem.
 */
export function roadSegmentRows() {
  return DER.features.map((feature) => {
    const a = feature.attributes;
    return {
      road_segment_id: `ROADSEG_${a.cod_distrital}`,
      current_polygon_id: '',
      source_segment_code: a.cod_distrital,
      road_name: 'DF-001',
      road_code: a.rodovia,
      segment_type: 'road_segment',
      jurisdiction: 'DF',
      administration: a.administracao,
      length_m: Math.round(a.extensao_km * 1000),
      source_system: 'DER_DF',
      source_layer_name: 'Rodovias_2025',
      source_feature_id: a.OBJECTID,
      source_crs: 'EPSG:31983',
      is_current: true,
      confidence_flag: 'official_der_geometry',
      quality_flag: 'ok_official_geometry',
      last_synced_at: '2026-09-21T16:08:50Z',
    };
  });
}

/** ROAD_SEGMENT_ALIASES: código do DER → `road_segment_id`. */
export function aliasRows() {
  return DER.features.map((feature) => ({
    alias_id: `ALIAS_DER_${feature.attributes.cod_distrital}`,
    road_segment_id: `ROADSEG_${feature.attributes.cod_distrital}`,
    source_segment_code: feature.attributes.cod_distrital,
    source_system: 'DER_TRAFFIC',
    match_method: 'exact_source_code',
    match_confidence: 'high',
  }));
}

/**
 * Dias de tráfego sintéticos, com a forma real de TRAFFIC_DAILY_TEST.
 *
 * Os NÚMEROS são inventados — e podem ser, porque contagem de veículo de teste não é
 * geografia: ela não afirma nada sobre o território. A geometria, que afirma, vem da
 * camada oficial. O que o gerador reproduz do dado real é a FORMA: `road_segment_id`
 * preenchido direto, um sentido por trecho, e `fluxo_total` igual à soma das classes.
 *
 * `dias` permite pedir um dia parcial (menos de 96 intervalos) para exercitar a distinção
 * entre dia completo e dia parcial sem depender de sorte.
 */
export function trafficRows({ segmentos = null, dias = 3, parcialNoUltimo = false } = {}) {
  const ids = segmentos || DER.features.map((f) => `ROADSEG_${f.attributes.cod_distrital}`);
  const rows = [];
  ids.forEach((id, s) => {
    const sentido = s === 1 ? 'decrescente' : 'crescente';
    for (let d = 0; d < dias; d += 1) {
      const carro = 10000 + (s * 100) + d;
      const moto = 1000 + d;
      const onibus = 400 + d;
      const caminhao = 300 + d;
      const medio = 200 + d;
      const indefinido = 0;
      const total = carro + moto + onibus + caminhao + medio + indefinido;
      const parcial = parcialNoUltimo && d === dias - 1;
      rows.push({
        traffic_daily_id: `TRAF_${id}_${sentido}_${d}`,
        trecho: id.replace('ROADSEG_', ''),
        sentido,
        dia: `2026-04-0${d + 1}`,
        fluxo_total: total,
        carro,
        moto,
        onibus,
        caminhao,
        medio,
        indefinido,
        intervalos_15min_observados: parcial ? 90 : 96,
        // Gravado com o MESMO erro de separador decimal que o backend produz num dia
        // parcial (R8.58): 9375 no lugar de 0,9375. Está aqui de propósito, para que
        // qualquer leitura acidental desta coluna apareça como número absurdo no teste.
        cobertura_dia_pct: parcial ? 9375 : 1,
        soma_classes: total,
        divergencia_total_classes: 0,
        quality_flag: parcial ? 'partial_day' : 'ok',
        road_segment_id: id,
        source_total_policy: 'official_total_equals_sum_classes',
        traffic_schema_version: '2026_v1',
      });
    }
  });
  return rows;
}
