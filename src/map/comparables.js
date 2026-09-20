// Comparáveis do recorte selecionado — módulo PURO (issue #124, Plano 01 §6.2–6.5).
//
// Responde "como este imóvel se posiciona no recorte que está na tela?": a distribuição
// do preço/m² dos registros filtrados (mínimo, quartis, mediana, máximo), a posição do
// imóvel contra a mediana e a qualidade da amostra (quantos têm preço/m², quantos estão
// ativos, quantos são recentes). Nada aqui toca o DOM nem conhece cor: o app monta a
// régua a partir do que sai daqui.
//
// Regras que valem explicar:
// - amostra vazia devolve `n: 0` e estatísticas `null` — nunca zero, porque "não há
//   comparáveis" e "o preço/m² é zero" são afirmações diferentes (R5.7);
// - o próprio imóvel sai da amostra: comparar um anúncio consigo mesmo dá +0% e uma
//   "mediana" de um elemento, que parece informação e não é;
// - percentil por interpolação linear (o mesmo que planilhas usam por padrão), sobre a
//   lista ordenada dos preços/m² finitos.

import { median } from '../filters.js';

/** Janela de "recente": observado nos últimos N dias em relação a `now`. */
export const RECENT_DAYS = 90;

const MS_PER_DAY = 86400000;

function finiteNumbers(values) {
  return (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
}

/**
 * Percentil `p` (0–100) de uma lista JÁ ordenada, por interpolação linear entre vizinhos.
 * Lista vazia devolve `null`; um elemento devolve ele mesmo para qualquer `p`.
 */
export function percentile(sorted, p) {
  if (!Array.isArray(sorted) || sorted.length === 0) return null;
  if (!Number.isFinite(p)) return null;
  const clamped = Math.min(100, Math.max(0, p));
  if (sorted.length === 1) return sorted[0];
  const pos = (clamped / 100) * (sorted.length - 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  const weight = pos - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

/**
 * Amostra de comparáveis de um registro: os registros visíveis do MESMO tipo (kind), sem o
 * próprio registro. Quem decide o recorte é o filtro da tela — este módulo só o respeita.
 */
export function comparableSample(records, target) {
  if (!Array.isArray(records)) return [];
  const targetKey = target ? `${target.kind}:${target.id}` : null;
  return records.filter((r) => r && typeof r === 'object' && r.kind === (target ? target.kind : r.kind)
    && (targetKey === null || `${r.kind}:${r.id}` !== targetKey));
}

function isRecent(record, now) {
  if (!record || typeof record.observed_at !== 'string') return false;
  const t = Date.parse(`${record.observed_at}T00:00:00Z`);
  if (!Number.isFinite(t)) return false;
  return now - t <= RECENT_DAYS * MS_PER_DAY && t <= now + MS_PER_DAY;
}

/**
 * Estatísticas de preço/m² de uma amostra.
 *
 * @returns {{ n, withPriceM2, active, recent, min, p25, median, p75, max }} — `n` conta
 *   todos os registros da amostra; as estatísticas usam só os que têm `price_m2` finito.
 */
export function comparableStats(records, { now = Date.now() } = {}) {
  const sample = Array.isArray(records) ? records.filter((r) => r && typeof r === 'object') : [];
  const prices = finiteNumbers(sample.map((r) => r.price_m2));
  const empty = { n: sample.length, withPriceM2: prices.length, active: 0, recent: 0,
    min: null, p25: null, median: null, p75: null, max: null };
  empty.active = sample.filter((r) => String(r.status || '').toLowerCase() === 'active').length;
  empty.recent = sample.filter((r) => isRecent(r, now)).length;
  if (prices.length === 0) return empty;
  return {
    ...empty,
    min: prices[0],
    p25: percentile(prices, 25),
    median: median(prices),
    p75: percentile(prices, 75),
    max: prices[prices.length - 1],
  };
}

/**
 * Posição de um preço/m² contra a mediana da amostra: `delta = preço/mediana − 1`.
 * `deltaPct` é `null` quando não há preço, não há mediana ou a mediana é zero — nunca
 * `Infinity`, nunca `NaN`.
 */
export function positionVsMedian(priceM2, stats) {
  const price = typeof priceM2 === 'number' && Number.isFinite(priceM2) ? priceM2 : null;
  const med = stats && typeof stats.median === 'number' && Number.isFinite(stats.median) ? stats.median : null;
  const sampleN = stats && Number.isFinite(stats.withPriceM2) ? stats.withPriceM2 : 0;
  if (price === null || med === null || med === 0) return { deltaPct: null, sampleN };
  return { deltaPct: price / med - 1, sampleN };
}

/**
 * Posição do ponto na régua P25–P75, como fração 0–1 da largura útil, para o desenho.
 * Fora do intervalo é preso às bordas; sem dado, `null`.
 */
export function rulerPosition(priceM2, stats) {
  const price = typeof priceM2 === 'number' && Number.isFinite(priceM2) ? priceM2 : null;
  if (price === null || !stats || stats.p25 === null || stats.p75 === null) return null;
  if (stats.p75 === stats.p25) return 0.5;
  return Math.min(1, Math.max(0, (price - stats.p25) / (stats.p75 - stats.p25)));
}
