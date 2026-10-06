// Registro das camadas territoriais — módulo puro (issues #149, #150, #151, #152).
//
// Vocabulário FECHADO, ao contrário de POLYGONS: cada camada declara o dataset do manifest
// que a alimenta, suas métricas, a rampa de cor (por NOME e TAMANHO — a cor em si mora no
// CSS) e como escolher arquivo por zoom e viewport. Nada aqui conhece cor, DOM ou Leaflet.

import { toNumber } from '../normalize.js';
import { datasetById, filesFor } from './manifest.js';

/** Famílias de token no CSS e quantos degraus cada uma tem — conferido 1:1 pelo teste de tokens. */
export const RAMPS = Object.freeze({ seq: 6, seq10: 10, via: 5 });

export const TERRITORY_LAYERS = Object.freeze([
  Object.freeze({
    id: 'households_grid',
    datasetId: 'households_grid',
    kind: 'area',
    title: 'Crescimento de domicílios 2010→2022',
    short: 'Domicílios 2010→2022',
    ramp: 'seq',
    idProperty: 'cell_id',
    metrics: Object.freeze([
      Object.freeze({ key: 'households_delta_per_km2', label: 'Domicílios novos por km²', unit: 'dom./km²', format: 'decimal1', roles: ['overview', 'detail_shard'] }),
      Object.freeze({
        key: 'households_delta', label: 'Domicílios novos (absoluto)', unit: 'dom.', format: 'number', roles: ['detail_shard'],
        unavailableReason: 'No overview, células de 1 km e de 200 m misturadas não são comparáveis em valor absoluto; aproxime o zoom (R8.15).',
      }),
    ]),
    defaultMetric: 'households_delta_per_km2',
    fillOpacity: 0.78,
  }),
  Object.freeze({
    id: 'jobs_hex',
    datasetId: 'jobs_hex',
    kind: 'area',
    title: 'Empregos formais (hexágonos H3)',
    short: 'Empregos formais',
    ramp: 'seq10',
    idProperty: 'h3_index',
    metrics: Object.freeze([
      Object.freeze({ key: 'jobs_total', label: 'Empregos formais · total', unit: 'empregos', format: 'number', roles: ['overview', 'detail_shard'], zeroIsAbsent: true }),
      Object.freeze({ key: 'jobs_low', label: 'Empregos · renda baixa', unit: 'empregos', format: 'number', roles: ['overview', 'detail_shard'], zeroIsAbsent: true }),
      Object.freeze({ key: 'jobs_mid', label: 'Empregos · renda média', unit: 'empregos', format: 'number', roles: ['overview', 'detail_shard'], zeroIsAbsent: true }),
      Object.freeze({ key: 'jobs_high', label: 'Empregos · renda alta', unit: 'empregos', format: 'number', roles: ['overview', 'detail_shard'], zeroIsAbsent: true }),
    ]),
    defaultMetric: 'jobs_total',
    fillOpacity: 0.78,
  }),
  Object.freeze({
    id: 'road_centrality',
    datasetId: 'road_centrality',
    kind: 'line',
    title: 'Centralidade viária',
    short: 'Centralidade viária',
    ramp: 'via',
    idProperty: 'edge_id',
    metrics: Object.freeze([
      // Detalhe em shards por RA desde a segunda execução real (#167); 'detail' fica aceito para um arquivo único.
      Object.freeze({ key: 'betweenness_percentile', label: 'Centralidade (percentil)', unit: 'percentil', format: 'decimal1', roles: ['overview', 'detail', 'detail_shard'] }),
    ]),
    defaultMetric: 'betweenness_percentile',
    // Peso e opacidade por classe — números, não cor (R8.71). Progressão suave como `flowWeight`.
    line: Object.freeze({ weight: [1, 1.5, 2.2, 3, 4], opacity: [0.35, 0.5, 0.65, 0.8, 1] }),
  }),
]);

export const AREA_LAYER_IDS = Object.freeze(TERRITORY_LAYERS.filter((l) => l.kind === 'area').map((l) => l.id));
export const LINE_LAYER_IDS = Object.freeze(TERRITORY_LAYERS.filter((l) => l.kind === 'line').map((l) => l.id));

export function layerById(id) {
  return TERRITORY_LAYERS.find((l) => l.id === id) || null;
}

export function metricFor(layer, key) {
  if (!layer) return null;
  return layer.metrics.find((m) => m.key === (key || layer.defaultMetric)) || null;
}

/**
 * A camada pode ser ligada? Devolve `{ available, reason, dataset }` com o motivo em pt-BR —
 * é o `title` do controle desabilitado (R8.64).
 */
export function layerAvailability(layer, publicData) {
  if (!layer) return { available: false, reason: 'camada desconhecida', dataset: null };
  if (!publicData || !publicData.available) {
    return { available: false, reason: publicData?.reason || 'Arquivos públicos indisponíveis.', dataset: null };
  }
  const dataset = datasetById(publicData.manifest, layer.datasetId);
  if (!dataset) {
    return { available: false, reason: `O manifest de data/public não traz o conjunto "${layer.datasetId}" — o pipeline ainda não o publicou.`, dataset: null };
  }
  const roles = new Set(dataset.files.map((f) => f.role));
  const hasOverview = roles.has('overview');
  const hasDetail = roles.has('detail') || roles.has('detail_shard');
  if (!hasOverview && !hasDetail) {
    return { available: false, reason: `O conjunto "${layer.datasetId}" não tem arquivo de overview nem de detalhe.`, dataset };
  }
  const metric = metricFor(layer, layer.defaultMetric);
  const breaks = dataset.classBreaks[metric.key];
  if (!breaks) {
    return { available: false, reason: `O manifest não traz cortes de classe para "${metric.key}".`, dataset };
  }
  if (breaks.classes > RAMPS[layer.ramp]) {
    return { available: false, reason: `"${metric.key}" tem ${breaks.classes} classes e a rampa "${layer.ramp}" tem ${RAMPS[layer.ramp]} degraus.`, dataset };
  }
  // "Zero é ausência" é declarado nos DOIS lados — no registro (a legenda e a marca leem daqui)
  // e no manifest (o pipeline gravou as classes assim). Divergência é erro de contrato da
  // mesma classe da R8.53: pintar zero como classe 1 numa camada que omite zeros, ou apagar
  // zeros legítimos de domicílios. A camada não liga até os dois concordarem.
  for (const m of layer.metrics) {
    const spec = dataset.classBreaks[m.key];
    if (spec && Boolean(spec.zeroIsAbsent) !== Boolean(m.zeroIsAbsent)) {
      return { available: false, reason: `O manifest declara zero_is_absent=${Boolean(spec.zeroIsAbsent)} para "${m.key}" e o registro da camada declara ${Boolean(m.zeroIsAbsent)}; o contrato precisa ser corrigido de um dos lados.`, dataset };
    }
  }
  return { available: true, reason: null, dataset };
}

/** Uma métrica pode ser desenhada no papel de arquivo atual? */
export function metricAvailability(layer, metric, dataset, { role } = {}) {
  if (!metric) return { available: false, reason: 'métrica desconhecida' };
  if (role && !metric.roles.includes(role)) {
    return { available: false, reason: metric.unavailableReason || `A métrica "${metric.key}" não está disponível neste nível de detalhe.` };
  }
  if (!dataset || !dataset.classBreaks[metric.key]) {
    return { available: false, reason: `O manifest não traz cortes de classe para "${metric.key}".` };
  }
  return { available: true, reason: null };
}

/**
 * Que arquivos desenhar agora: abaixo do `zoomMin` do detalhe, o overview; a partir dele, os
 * shards (ou o detalhe único) cuja caixa cruza a viewport. Devolve `{ role, files }`.
 */
export function layerFilesFor(layer, dataset, { zoom, bounds = null } = {}) {
  if (!dataset) return { role: null, files: [] };
  const overview = filesFor(dataset, { role: 'overview' });
  const shards = filesFor(dataset, { role: 'detail_shard' });
  const detail = filesFor(dataset, { role: 'detail' });
  const detailFiles = shards.length > 0 ? shards : detail;
  const detailRole = shards.length > 0 ? 'detail_shard' : 'detail';
  const zoomMin = detailFiles.reduce((min, f) => (f.zoomMin !== null && (min === null || f.zoomMin < min) ? f.zoomMin : min), null);
  const useDetail = detailFiles.length > 0 && (overview.length === 0 || (zoomMin !== null && Number.isFinite(zoom) && zoom >= zoomMin));
  if (!useDetail) return { role: overview.length > 0 ? 'overview' : null, files: overview };
  const chosen = bounds ? detailFiles.filter((f) => !f.bbox || intersects(f.bbox, bounds)) : detailFiles;
  return { role: detailRole, files: chosen };
}

function intersects(a, b) {
  return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
}

/** Valor numérico da métrica numa feição, ou `null`. */
export function featureValue(metric, properties) {
  if (!metric || !properties) return null;
  return toNumber(properties[metric.key]);
}

/**
 * Quantas feições publicam `class_<métrica>` diferente do que os cortes do manifest dão.
 * Publicado prevalece na tela? Não: a tela desenha pelos cortes (legenda e marca pela mesma
 * função, R8.42); a classe publicada só é conferida e a divergência vira aviso (R8.54).
 */
export function classCheckMismatch(features, metric, breaks, classIndexFor) {
  if (!metric || !breaks || !Array.isArray(features)) return 0;
  const key = `class_${metric.key}`;
  let mismatches = 0;
  for (const feature of features) {
    const props = feature?.properties;
    if (!props || !(key in props)) continue;
    const expected = classIndexFor(featureValue(metric, props), breaks.breaks, { zeroIsAbsent: metric.zeroIsAbsent === true });
    const published = toNumber(props[key]);
    if ((published === null ? null : published) !== expected) mismatches += 1;
  }
  return mismatches;
}
