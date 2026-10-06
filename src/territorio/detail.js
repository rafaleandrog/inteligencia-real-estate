// Painel de detalhe das feições territoriais — módulo puro (issues #150, #151).
//
// Devolve os três níveis que `appendTiers` desenha (R8.61: essencial com no máximo 6 linhas),
// com rótulo em português, ano e fonte onde o número vem de outra pesquisa, e a RA pelo
// NOME quando a ponte resolve — a chave crua `RA_nn` quando não (nunca um nome adivinhado).
// Sem DOM, sem cor, sem Leaflet.

import { formatNumber, formatDecimal, formatPercent, percentFromDecimal } from '../format.js';
import { toInteger, toNumber, toText } from '../normalize.js';
import { classIndexFor } from './classes.js';
import { legendRows } from './legend.js';
import { EMPTY_CROSSWALK } from './ra-keys.js';

export const ESSENTIAL_MAX_ROWS = 6;

const FLAG_LABELS = Object.freeze({
  cell_missing_2010: 'célula ausente na grade de 2010',
  cell_missing_2022: 'célula ausente na grade de 2022',
  value_suppressed_2010: 'valor suprimido pelo IBGE em 2010',
  value_suppressed_2022: 'valor suprimido pelo IBGE em 2022',
  ra_unassigned: 'centroide fora de todo limite oficial de RA',
  partial_children: 'soma parcial: alguma célula filha sem dado',
  resolution_changed: 'célula de 1 km inteira numa edição e subdividida em 200 m na outra; o valor de cada ano vem da listagem daquele ano',
  aop_population_2010_based: 'população-base do Censo 2010 (AOP)',
  betweenness_sampled: 'betweenness amostrado (fontes sorteadas, semente fixa)',
  geometry_simplified: 'geometria simplificada para publicação',
});

function raLabel(raGeoId, crosswalk) {
  const id = toText(raGeoId);
  if (!id) return 'fora dos limites oficiais';
  const row = crosswalk?.byNn?.get(id);
  return row ? `${row.raName} (${id})` : id;
}

function flagsText(flags) {
  if (!Array.isArray(flags) || flags.length === 0) return null;
  return flags.map((f) => FLAG_LABELS[f] || toText(f)).join('; ');
}

function classLabel(value, breaks, { zeroIsAbsent = false } = {}) {
  if (!breaks) return null;
  const index = classIndexFor(value, breaks.breaks, { zeroIsAbsent });
  if (index === null) return null;
  const row = legendRows(breaks.breaks, { zeroIsAbsent }).find((r) => r.classIndex === index);
  return row ? `${index + 1} de ${breaks.classes} · ${row.label}` : null;
}

/**
 * A linha "Classe no mapa" é da métrica ATIVA — a que pintou a feição — e diz qual é. Com a
 * métrica padrão o rótulo fica curto; com outra, o nome dela entra entre parênteses para o
 * painel nunca descrever uma escala que não está na tela (R8.42; achado da revisão da PR #157).
 */
function classRow(add, rows, layer, metric, props, dataset, defaultKey) {
  const active = metric || (layer.metrics || []).find((m) => m.key === defaultKey) || null;
  if (!active) return;
  const breaks = dataset?.classBreaks?.[active.key];
  const label = active.key === defaultKey ? 'Classe no mapa' : `Classe no mapa (${active.label})`;
  add(rows, label, classLabel(toNumber(props[active.key]), breaks, { zeroIsAbsent: active.zeroIsAbsent === true }));
}

function provenanceRows(dataset, file, integrity) {
  const rows = [];
  if (!dataset) return rows;
  rows.push({ label: 'Conjunto', value: `${dataset.titlePt} (${dataset.id})` });
  if (dataset.version) rows.push({ label: 'Versão publicada', value: dataset.version });
  if (dataset.generatedAt) rows.push({ label: 'Gerado em', value: dataset.generatedAt });
  for (const source of dataset.sources || []) {
    rows.push({ label: 'Fonte', value: `${source.name}${source.retrievedAt ? ` · coletado em ${source.retrievedAt}` : ''}` });
    if (source.license) rows.push({ label: 'Licença', value: source.license });
  }
  if (dataset.raAssignmentMethod) {
    rows.push({ label: 'Atribuição de RA', value: dataset.raAssignmentMethod === 'midpoint_within_ra' ? 'ponto médio dentro do limite oficial' : 'centroide dentro do limite oficial' });
  }
  if (file) rows.push({ label: 'Arquivo', value: file.path });
  if (integrity) rows.push({ label: 'Integridade', value: integrity });
  return rows;
}

function householdsTiers(props, { dataset, crosswalk, layer, metric }) {
  const size = toText(props.cell_size) === '1KM' ? '1 km' : '200 m';
  const dom2010 = toInteger(props.dom_ocu_2010);
  const dom2022 = toInteger(props.dom_ocu_2022);
  const delta = toInteger(props.households_delta);
  const perKm2 = toNumber(props.households_delta_per_km2);
  const pct = toNumber(props.households_delta_pct_change);
  const essencial = [];
  const add = (rows, label, value, title) => { if (value !== null && value !== undefined && value !== '') rows.push(title ? { label, value, title } : { label, value }); };
  add(essencial, 'Domicílios novos por km² (2010→2022)', perKm2 === null ? null : formatDecimal(perKm2, { digits: 1 }), 'IBGE · Grade Estatística: (domicílios ocupados 2022 − 2010) ÷ área da célula');
  add(essencial, 'Domicílios ocupados 2010 → 2022', dom2010 === null && dom2022 === null ? null : `${dom2010 === null ? '—' : formatNumber(dom2010)} → ${dom2022 === null ? '—' : formatNumber(dom2022)}`);
  add(essencial, 'Variação 2010→2022', pct === null ? null : formatPercent(percentFromDecimal(pct)), 'fração decimal publicada: (2022 − 2010) ÷ 2010');
  add(essencial, 'População 2022', toInteger(props.pop_2022) === null ? null : formatNumber(toInteger(props.pop_2022)));
  add(essencial, 'Região Administrativa', raLabel(props.ra_geo_id, crosswalk));
  classRow(add, essencial, layer, metric, props, dataset, 'households_delta_per_km2');

  const complementar = [];
  add(complementar, 'Domicílios novos (absoluto)', delta === null ? null : formatNumber(delta));
  add(complementar, 'População 2010', toInteger(props.pop_2010) === null ? null : formatNumber(toInteger(props.pop_2010)));
  add(complementar, 'Área da célula', toNumber(props.area_km2) === null ? null : `${formatDecimal(toNumber(props.area_km2), { digits: 2 })} km²`);
  add(complementar, 'Tamanho da célula', size);
  if (toInteger(props.children) !== null) {
    add(complementar, 'Células de 200 m somadas', `${formatNumber(toInteger(props.children))}${toInteger(props.children_missing) ? ` (${formatNumber(toInteger(props.children_missing))} sem dado)` : ''}`);
  }
  add(complementar, 'Qualidade', flagsText(props.quality_flags));
  return { title: `Célula de ${size} · ${toText(props.cell_id) || '—'}`, essencial, complementar };
}

function jobsTiers(props, { dataset, crosswalk, layer, metric }) {
  const total = toInteger(props.jobs_total);
  const essencial = [];
  const add = (rows, label, value, title) => { if (value !== null && value !== undefined && value !== '') rows.push(title ? { label, value, title } : { label, value }); };
  const ano = toInteger(props.year);
  add(essencial, `Empregos formais${ano ? ` ${ano}` : ''}`, total === null ? null : formatNumber(total), 'Ipea · Acesso a Oportunidades (RAIS/MTE)');
  const faixas = ['jobs_low', 'jobs_mid', 'jobs_high'].map((k) => toInteger(props[k]));
  if (faixas.some((v) => v !== null)) {
    add(essencial, 'Por faixa de renda (baixa · média · alta)', faixas.map((v) => (v === null ? '—' : formatNumber(v))).join(' · '));
  }
  const anterior = toInteger(props.jobs_total_2017);
  if (anterior !== null && total !== null) add(essencial, 'Empregos 2017 → 2019', `${formatNumber(anterior)} → ${formatNumber(total)}`);
  add(essencial, 'População (Censo 2010, AOP)', toInteger(props.pop_total) === null ? null : formatNumber(toInteger(props.pop_total)));
  add(essencial, 'Região Administrativa', raLabel(props.ra_geo_id, crosswalk));
  classRow(add, essencial, layer, metric, props, dataset, 'jobs_total');

  const complementar = [];
  add(complementar, 'Renda média (R$, AOP)', toNumber(props.income_avg_brl) === null ? null : formatNumber(Math.round(toNumber(props.income_avg_brl))));
  add(complementar, 'Decil de renda', toInteger(props.income_decile) === null ? null : String(toInteger(props.income_decile)));
  add(complementar, 'Hexágono pai (r8)', toText(props.h3_parent_r8) || null);
  if (toInteger(props.hexes) !== null) add(complementar, 'Hexágonos r9 somados', formatNumber(toInteger(props.hexes)));
  add(complementar, 'Qualidade', flagsText(props.quality_flags));
  return { title: `Hexágono H3 · ${toText(props.h3_index) || '—'}`, essencial, complementar };
}

function centralityTiers(props, { dataset, crosswalk, layer, metric }) {
  const essencial = [];
  const add = (rows, label, value, title) => { if (value !== null && value !== undefined && value !== '') rows.push(title ? { label, value, title } : { label, value }); };
  const pct = toNumber(props.betweenness_percentile);
  add(essencial, 'Centralidade (percentil)', pct === null ? null : formatDecimal(pct, { digits: 1 }), 'posição entre todas as arestas da rede (0–100)');
  add(essencial, 'Betweenness normalizado', toNumber(props.betweenness) === null ? null : formatDecimal(toNumber(props.betweenness), { digits: 3 }));
  add(essencial, 'Tipo de via (OSM)', toText(props.highway) || null);
  add(essencial, 'Extensão', toNumber(props.length_m) === null ? null : `${formatNumber(Math.round(toNumber(props.length_m)))} m`);
  add(essencial, 'Região Administrativa', raLabel(props.ra_geo_id, crosswalk));
  classRow(add, essencial, layer, metric, props, dataset, 'betweenness_percentile');
  const complementar = [];
  add(complementar, 'Mão', props.oneway === true ? 'única' : props.oneway === false ? 'dupla' : null);
  add(complementar, 'OSM ids', Array.isArray(props.osmid) ? props.osmid.map((v) => toText(v)).join(', ') : toText(props.osmid) || null);
  add(complementar, 'Qualidade', flagsText(props.quality_flags));
  return { title: toText(props.name) ? `${toText(props.name)} · ${toText(props.edge_id)}` : `Via · ${toText(props.edge_id) || '—'}`, essencial, complementar };
}

const BUILDERS = Object.freeze({ households_grid: householdsTiers, jobs_hex: jobsTiers, road_centrality: centralityTiers });

/**
 * Os três níveis do painel para uma feição da camada. `essencial` tem no máximo
 * `ESSENTIAL_MAX_ROWS` linhas (R8.61); `tecnico` é a procedência do conjunto.
 */
export function territoryDetailTiers(layer, properties, { dataset = null, file = null, integrity = null, crosswalk = EMPTY_CROSSWALK, metric = null } = {}) {
  const props = properties && typeof properties === 'object' ? properties : {};
  const build = BUILDERS[layer?.id];
  if (!build) return { title: layer?.title || 'Feição', essencial: [], complementar: [], tecnico: provenanceRows(dataset, file, integrity) };
  const { title, essencial, complementar } = build(props, { dataset, crosswalk, layer, metric });
  return {
    title,
    essencial: essencial.slice(0, ESSENTIAL_MAX_ROWS),
    complementar: [...essencial.slice(ESSENTIAL_MAX_ROWS), ...complementar],
    tecnico: provenanceRows(dataset, file, integrity),
  };
}

/** Texto do balão: valor da métrica com unidade e a RA — ou "sem dado". */
export function territoryTooltipText(layer, metric, properties, { crosswalk = EMPTY_CROSSWALK } = {}) {
  const props = properties && typeof properties === 'object' ? properties : {};
  const value = toNumber(metric ? props[metric.key] : null);
  // Zero numa métrica em que zero é ausência (empregos por faixa) é "sem dado", como na
  // legenda e no mapa — nunca "0 empregos" num hexágono desenhado vazado.
  const absent = value === null || (metric?.zeroIsAbsent === true && value === 0);
  const formatted = absent
    ? (value === 0 ? 'sem dado (zero)' : 'sem dado')
    : metric.format === 'decimal1' ? `${formatDecimal(value, { digits: 1 })} ${metric.unit}` : `${formatNumber(value)} ${metric.unit}`;
  const ra = raLabel(props.ra_geo_id, crosswalk);
  return `${metric ? metric.label : layer?.short || ''}: ${formatted} · ${ra}`;
}
