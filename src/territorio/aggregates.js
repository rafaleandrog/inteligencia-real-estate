// Agregados por RA dos arquivos públicos — módulo puro (issues #149, #153).
//
// Uma linha por `RA_nn` com domicílios (IBGE), empregos (Ipea/RAIS) e centralidade (OSM),
// somados pelo pipeline sobre os arquivos publicados. Regras que não se perdem:
// - publicado prevalece; o recálculo só AVISA divergência (R8.54);
// - escala declarada, nunca inferida: `households_growth_pct` é fração decimal (R8.60);
// - ausência é `null`, nunca zero; bloco de dataset não gerado vem nulo com flag;
// - coluna que o backend publica e este módulo não declara vira aviso nomeado (COLUNA_NAO_DECLARADA).

import { toInteger, toNumber, toText } from '../normalize.js';
import { formatBRL, formatDecimal, formatNumber, formatPercent, percentFromDecimal } from '../format.js';
import { EMPTY_CROSSWALK, toRaRoman } from './ra-keys.js';

/** As colunas do contrato (docs/DATA_CONTRACT.md, "ra_aggregates"). Fora daqui é aviso. */
export const RA_AGGREGATE_COLUMNS = Object.freeze([
  'ra_geo_id', 'ra_geo_id_roman', 'ra_name', 'ra_area_km2',
  'households_source', 'households_2010', 'households_2022', 'households_delta', 'households_growth_pct',
  'households_per_km2_2022', 'pop_2010', 'pop_2022', 'cells_2010', 'cells_2022', 'cells_partial',
  'jobs_source', 'jobs_year', 'jobs_total', 'jobs_low', 'jobs_mid', 'jobs_high', 'jobs_population_basis',
  'jobs_per_1000_residents', 'jobs_per_km2', 'hexes',
  'centrality_source', 'centrality_snapshot', 'edges_total', 'road_km_total', 'road_km_top_decile',
  'centrality_mean', 'centrality_p90', 'quality_flags',
]);

/** Fora deste intervalo a fração decimal foi quase certamente publicada em pontos (R8.60). */
const GROWTH_PCT_RANGE = Object.freeze({ min: -1, max: 5 });
const GROWTH_TOLERANCE = 0.001; // 0,1 p.p.
const PER_1000_TOLERANCE = 0.5;

const COLUMN_SET = new Set(RA_AGGREGATE_COLUMNS);

function normalizeRow(raw) {
  const flags = Array.isArray(raw.quality_flags) ? raw.quality_flags.map((f) => toText(f)).filter(Boolean) : [];
  return {
    raGeoId: toText(raw.ra_geo_id),
    raGeoIdRoman: toText(raw.ra_geo_id_roman) || null,
    raName: toText(raw.ra_name) || null,
    raAreaKm2: toNumber(raw.ra_area_km2),
    householdsSource: toText(raw.households_source) || null,
    householdsTotal2010: toInteger(raw.households_2010),
    householdsTotal2022: toInteger(raw.households_2022),
    householdsDelta: toInteger(raw.households_delta),
    householdsGrowthPct: toNumber(raw.households_growth_pct),
    householdsPerKm2_2022: toNumber(raw.households_per_km2_2022),
    population2010: toInteger(raw.pop_2010),
    population2022: toInteger(raw.pop_2022),
    cells2010: toInteger(raw.cells_2010),
    cells2022: toInteger(raw.cells_2022),
    cellsPartial: toInteger(raw.cells_partial),
    jobsSource: toText(raw.jobs_source) || null,
    jobsYear: toInteger(raw.jobs_year),
    jobsTotal: toInteger(raw.jobs_total),
    jobsLow: toInteger(raw.jobs_low),
    jobsMid: toInteger(raw.jobs_mid),
    jobsHigh: toInteger(raw.jobs_high),
    jobsPopulationBasis: toInteger(raw.jobs_population_basis),
    jobsPer1000Residents: toNumber(raw.jobs_per_1000_residents),
    jobsPerKm2: toNumber(raw.jobs_per_km2),
    hexes: toInteger(raw.hexes),
    centralitySource: toText(raw.centrality_source) || null,
    centralitySnapshot: toText(raw.centrality_snapshot) || null,
    edgesCount: toInteger(raw.edges_total),
    roadKmTotal: toNumber(raw.road_km_total),
    roadKmTopDecile: toNumber(raw.road_km_top_decile),
    centralityMean: toNumber(raw.centrality_mean),
    centralityP90: toNumber(raw.centrality_p90),
    qualityFlags: flags,
  };
}

/**
 * Normaliza `ra_aggregates.json`. Devolve `{ byRa, rows, warnings, sources, years }`.
 * Linha cuja RA não está na ponte (quando há ponte) é descartada com aviso.
 */
export function normalizeRaAggregates(rawRows, crosswalk = EMPTY_CROSSWALK) {
  const warnings = [];
  const byRa = {};
  const rows = [];
  if (!Array.isArray(rawRows)) {
    return { byRa, rows, warnings: ['Território (agregados por RA): rows não é uma lista.'], sources: {}, years: [] };
  }
  const unknown = new Set();
  const sources = { households: null, jobs: null, centrality: null };
  const years = new Set();
  for (const raw of rawRows) {
    if (raw === null || typeof raw !== 'object') continue;
    for (const key of Object.keys(raw)) if (!COLUMN_SET.has(key)) unknown.add(key);
    const row = normalizeRow(raw);
    if (!/^RA_\d{2}$/.test(row.raGeoId)) {
      warnings.push(`Território (agregados por RA): linha com ra_geo_id ${JSON.stringify(raw.ra_geo_id)} fora do padrão RA_nn; descartada.`);
      continue;
    }
    if (crosswalk.byNn.size > 0 && !crosswalk.byNn.has(row.raGeoId)) {
      warnings.push(`Território (agregados por RA): ${row.raGeoId} não existe na ponte de RAs; linha descartada.`);
      continue;
    }
    if (byRa[row.raGeoId]) {
      warnings.push(`Território (agregados por RA): ${row.raGeoId} aparece duas vezes; a segunda linha foi ignorada.`);
      continue;
    }
    // Publicado prevalece; o recálculo só sinaliza (R8.54).
    if (row.householdsGrowthPct !== null && row.householdsDelta !== null && row.householdsTotal2010) {
      const recalculated = row.householdsDelta / row.householdsTotal2010;
      if (Math.abs(recalculated - row.householdsGrowthPct) > GROWTH_TOLERANCE) {
        warnings.push(`Território (agregados por RA): ${row.raGeoId} publica crescimento ${row.householdsGrowthPct} e o recálculo dá ${recalculated.toFixed(4)}; o publicado foi mantido.`);
      }
    }
    if (row.householdsGrowthPct !== null && (row.householdsGrowthPct < GROWTH_PCT_RANGE.min || row.householdsGrowthPct > GROWTH_PCT_RANGE.max)) {
      warnings.push(`Território (agregados por RA): ${row.raGeoId} tem households_growth_pct = ${row.householdsGrowthPct}, fora da escala decimal declarada; valor mantido, nunca convertido.`);
    }
    if (row.jobsPer1000Residents !== null && row.jobsTotal !== null && row.jobsPopulationBasis) {
      const recalculated = (row.jobsTotal / row.jobsPopulationBasis) * 1000;
      if (Math.abs(recalculated - row.jobsPer1000Residents) > PER_1000_TOLERANCE) {
        warnings.push(`Território (agregados por RA): ${row.raGeoId} publica ${row.jobsPer1000Residents} empregos/mil hab. e o recálculo dá ${recalculated.toFixed(1)}; o publicado foi mantido.`);
      }
    }
    if (row.householdsSource) sources.households = row.householdsSource;
    if (row.jobsSource) sources.jobs = row.jobsSource;
    if (row.centralitySource) sources.centrality = row.centralitySource;
    if (row.jobsYear !== null) years.add(row.jobsYear);
    byRa[row.raGeoId] = row;
    rows.push(row);
  }
  for (const column of [...unknown].sort()) {
    warnings.push(`COLUNA_NAO_DECLARADA: ra_aggregates.json publica "${column}" e o contrato não a declara.`);
  }
  return { byRa, rows, warnings, sources, years: [...years].sort() };
}

/**
 * Os indicadores territoriais que o Ranking, a dispersão e o perfil da RA leem (issue #153).
 * `attr` é o campo da linha normalizada; `unit` é resolvida por `formatByUnit`; a fórmula e a
 * fonte viajam junto porque ficam ao lado do número na tela.
 */
export const TERRITORY_INDICATORS = Object.freeze([
  { id: 'householdsGrowth', attr: 'householdsGrowthPct', label: 'Crescimento de domicílios 2010→2022', tema: 'Território (IBGE)', unit: 'pct_decimal', formula: '(domicílios 2022 − domicílios 2010) ÷ domicílios 2010', source: 'IBGE · Grade Estatística 2010/2022' },
  { id: 'jobsPer1000', attr: 'jobsPer1000Residents', label: 'Empregos formais por mil moradores', tema: 'Território (Ipea)', unit: 'ratio1', formula: 'empregos formais ÷ população-base (AOP, Censo 2010) × 1.000', source: 'Ipea · Acesso a Oportunidades (RAIS)' },
  { id: 'jobsDensity', attr: 'jobsPerKm2', label: 'Empregos formais por km²', tema: 'Território (Ipea)', unit: 'ratio1', formula: 'empregos formais ÷ área oficial da RA (km²)', source: 'Ipea · Acesso a Oportunidades (RAIS) / GeoPortal' },
  { id: 'centrality', attr: 'centralityMean', label: 'Centralidade viária média', tema: 'Território (OSM)', unit: 'index3', formula: 'média do betweenness normalizado das vias publicadas da RA', source: 'OpenStreetMap · rede viária' },
]);

/**
 * Formata pela unidade declarada. Unidade desconhecida LANÇA — um `default` silencioso é o
 * mesmo erro de classe que a R8.53 nomeia para agregação.
 */
export function formatByUnit(unit, value) {
  switch (unit) {
    case 'pct_decimal': return formatPercent(percentFromDecimal(value));
    case 'ratio1': return formatDecimal(value, { digits: 1 });
    case 'index3': return formatDecimal(value, { digits: 3 });
    case 'currency': return value === null || value === undefined ? '—' : formatBRL(value);
    case 'number': return value === null || value === undefined ? '—' : formatNumber(value);
    default: throw new Error(`unidade de indicador desconhecida: ${String(unit)}`);
  }
}

/**
 * Linhas para o bloco da RA no mapa e no painel do polígono: ano e fonte no rótulo, para
 * nunca serem confundidas com PDAD ou RA_PROFILES (R8.26, R8.52). Ausência omite a linha.
 */
export function territoryProfileRows(row) {
  if (!row) return [];
  const out = [];
  const add = (label, value, title) => { if (value !== null && value !== undefined) out.push({ label, value, title }); };
  add('Domicílios 2022 (IBGE)', row.householdsTotal2022 === null ? null : formatNumber(row.householdsTotal2022),
    row.householdsSource || 'IBGE · Grade Estatística');
  add('Crescimento de domicílios 2010→2022 (IBGE)', row.householdsGrowthPct === null ? null : formatByUnit('pct_decimal', row.householdsGrowthPct),
    'Fração decimal publicada pelo pipeline: (2022 − 2010) ÷ 2010');
  add(`Empregos formais${row.jobsYear ? ` ${row.jobsYear}` : ''} (Ipea)`, row.jobsTotal === null ? null : formatNumber(row.jobsTotal),
    row.jobsSource || 'Ipea · Acesso a Oportunidades (RAIS)');
  add('Empregos por mil moradores (Ipea)', row.jobsPer1000Residents === null ? null : formatByUnit('ratio1', row.jobsPer1000Residents),
    'empregos formais ÷ população-base (AOP, Censo 2010) × 1.000');
  add('Centralidade viária média (OSM)', row.centralityMean === null ? null : formatByUnit('index3', row.centralityMean),
    row.centralitySource || 'OpenStreetMap');
  return out;
}

/** Os atributos que `attachTerritory` escreve em cada RA do índice do PDAD. */
export const TERRITORY_ATTRS = Object.freeze(TERRITORY_INDICATORS.map((i) => i.attr));

/**
 * Anexa os agregados territoriais a cada RA do índice do PDAD (issue #153) — sem mutação:
 * devolve um índice novo. Com `byRa` vazio devolve o MESMO índice: sem arquivo público, a
 * RA fica exatamente como era, e `rankScalar` lê ausência (R2.5). RA sem linha nos
 * agregados recebe `null` em cada atributo — nunca zero.
 */
export function attachTerritory(pdadIndex, byRa) {
  if (!pdadIndex || typeof pdadIndex !== 'object') return pdadIndex;
  if (!byRa || Object.keys(byRa).length === 0) return pdadIndex;
  const out = {};
  for (const [year, ras] of Object.entries(pdadIndex)) {
    out[year] = {};
    for (const [id, ra] of Object.entries(ras)) {
      const row = byRa[id] || null;
      const extra = {};
      for (const attr of TERRITORY_ATTRS) extra[attr] = row && Number.isFinite(row[attr]) ? row[attr] : null;
      out[year][id] = { ...ra, ...extra };
    }
  }
  return out;
}

/**
 * O perfil de `RA_PROFILES` de uma RA do PDAD (`RA_nn`), pelas DUAS grafias que a aba já
 * teve — e só por elas (issue #153, R2.9; achado do Codex na PR #157):
 *
 * - `RA_nn` direto: é a chave que `syncAdministrativeRegions_` grava desde a v2.3.0
 *   (`Code.gs`, `'RA_' + nn`) — a mesma do PDAD, sem tradução nenhuma;
 * - `RA2026_RA-romano` via ponte: a grafia antiga (e a do `data/demo.json`), que só a
 *   `ra_crosswalk.json` traduz. Sem ponte, a grafia romana não resolve — nunca por nome
 *   nem por aritmética de romanos (R8.30, R8.51).
 */
export function raProfileFor(raGeoId, raProfiles, crosswalk = EMPTY_CROSSWALK) {
  if (!raProfiles || !raGeoId) return null;
  if (Object.prototype.hasOwnProperty.call(raProfiles, raGeoId)) return raProfiles[raGeoId];
  const roman = toRaRoman(raGeoId, crosswalk);
  return roman && Object.prototype.hasOwnProperty.call(raProfiles, roman) ? raProfiles[roman] : null;
}

/**
 * Anexa `incomePerCapita` (de `RA_PROFILES.income_per_capita_brl`) às RAs do índice do PDAD.
 * O perfil é achado por `raProfileFor`; RA sem perfil (ou com a coluna vazia) fica com o
 * valor que já tinha, ou `null` — ausência, nunca zero.
 */
export function attachRaProfiles(pdadIndex, raProfiles, crosswalk = EMPTY_CROSSWALK) {
  if (!pdadIndex || typeof pdadIndex !== 'object') return pdadIndex;
  if (!raProfiles || Object.keys(raProfiles).length === 0) return pdadIndex;
  const out = {};
  for (const [year, ras] of Object.entries(pdadIndex)) {
    out[year] = {};
    for (const [id, ra] of Object.entries(ras)) {
      const profile = raProfileFor(id, raProfiles, crosswalk);
      const income = profile ? toNumber(profile.income_per_capita_brl) : null;
      out[year][id] = { ...ra, incomePerCapita: income === null ? (ra.incomePerCapita ?? null) : income };
    }
  }
  return out;
}

function medianOf(values) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 1 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

/**
 * Perfil territorial de uma RA para o Diagnóstico (issue #153): cada indicador com valor,
 * referência explícita — mediana entre as RAs COM dado, com o `n` escrito (R8.87) —, a
 * diferença e a posição entre elas. RA fora dos agregados devolve `null`; indicador sem
 * valor fica com `value: null` e sem posição — nunca zero, nunca "0ª".
 */
export function raTerritoryProfile(byRa, raGeoId) {
  const row = byRa ? byRa[raGeoId] : null;
  if (!row) return null;
  const rows = Object.values(byRa);
  return {
    raGeoId,
    raName: row.raName,
    items: TERRITORY_INDICATORS.map((ind) => {
      const values = rows.map((r) => r[ind.attr]).filter((v) => Number.isFinite(v));
      const value = Number.isFinite(row[ind.attr]) ? row[ind.attr] : null;
      const median = medianOf(values);
      const position = value === null ? null : values.filter((v) => v > value).length + 1;
      return {
        id: ind.id,
        label: ind.label,
        tema: ind.tema,
        unit: ind.unit,
        formula: ind.formula,
        source: ind.source,
        value,
        formatted: formatByUnit(ind.unit, value),
        reference: { median, n: values.length, formatted: formatByUnit(ind.unit, median) },
        delta: value !== null && median !== null ? value - median : null,
        rank: value === null ? null : { position, total: values.length },
      };
    }),
  };
}
