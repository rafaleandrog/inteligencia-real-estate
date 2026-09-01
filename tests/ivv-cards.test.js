// Cards do Mercado Residencial DF — issue #59.
//
// Duas coisas caras que este arquivo impede. A primeira é a variação pintada pelo SINAL
// em vez do significado: distrato subindo em verde transforma um alerta em elogio, com a
// mesma aparência de um número certo. A segunda é métrica ausente virando zero — "0
// unidades vendidas" e "não publicado" são afirmações diferentes, e a segunda é a
// verdadeira quando a coluna está vazia.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_ROWS, METRIC_SENTIMENT, SENTIMENTS, deltaTone, formatMetricValue,
  metricDeltas, buildMarketCards, metricsWithoutSentiment,
} from '../src/ivv/cards.js';
import { aggregatePeriod } from '../src/ivv/aggregate.js';
import { METRIC_KEYS } from '../src/ivv/metrics.js';

// --- O registro de sentimento é completo por construção ------------------------------

test('toda métrica do registro tem sentimento declarado', () => {
  // Sem isto, uma métrica nova herda "subir é bom" por omissão — e a primeira que
  // aparecer sendo ruim (mais distratos, mais estoque parado) sai verde na tela.
  assert.deepEqual(metricsWithoutSentiment(), []);
});

test('as três linhas de cards existem e não repetem métrica', () => {
  const todas = CARD_ROWS.flat();
  assert.equal(CARD_ROWS.length, 3);
  assert.equal(new Set(todas).size, todas.length, 'card repetido entre as linhas');
  for (const key of todas) assert.ok(METRIC_KEYS.includes(key), key);
});

test('a primeira linha é preço e volume de vendas, nessa ordem', () => {
  // Prioridade definida pelo dono do repositório: preços e volume de vendas primeiro.
  assert.deepEqual([...CARD_ROWS[0]],
    ['sale_price_brl_m2', 'asking_price_brl_m2', 'sales_units', 'sold_area_m2']);
});

// --- O tom segue o significado, não o sinal ------------------------------------------

test('venda subindo é bom; distrato subindo é ruim', () => {
  assert.equal(deltaTone('sales_units', 12), 'bom');
  assert.equal(deltaTone('sales_units', -12), 'ruim');
  // O caso que dá nome à regra.
  assert.equal(deltaTone('cancellations_units', 12), 'ruim');
  assert.equal(deltaTone('cancellations_units', -12), 'bom');
  assert.equal(METRIC_SENTIMENT.cancellations_units, SENTIMENTS.NEGATIVO);
});

test('preço e estoque são neutros: a tela não sabe de que lado está quem lê', () => {
  // Preço subindo é bom para quem vende e ruim para quem compra. Escolher um lado seria
  // a tela opinando sobre o mercado.
  for (const key of ['sale_price_brl_m2', 'asking_price_brl_m2', 'offers_units', 'vgo_brl_million']) {
    assert.equal(deltaTone(key, 10), 'neutro', key);
    assert.equal(deltaTone(key, -10), 'neutro', key);
  }
});

test('variação zero e variação ausente são sempre neutras', () => {
  for (const valor of [0, null, undefined, Number.NaN]) {
    assert.equal(deltaTone('cancellations_units', valor), 'neutro', String(valor));
  }
});

// --- Formatação por unidade declarada ------------------------------------------------

test('cada unidade do registro sai no seu formato', () => {
  // `Intl` usa espaço NÃO separável depois de "R$" (U+00A0). Comparar com espaço comum
  // falharia por um caractere invisível, então a normalização é explícita.
  const nbsp = (texto) => texto.replace(/\u00a0/g, ' ');
  assert.equal(nbsp(formatMetricValue('sale_price_brl_m2', 12071.92)), 'R$ 12.072/m²');
  assert.equal(formatMetricValue('sales_units', 414), '414');
  assert.equal(formatMetricValue('sold_area_m2', 29493), '29.493 m²');
  assert.equal(nbsp(formatMetricValue('vgv_brl_million', 356)), 'R$ 356 mi');
  // Escala decimal do IVV convertida por `percentFromDecimal`, não por um `* 100` solto.
  assert.equal(formatMetricValue('ivv_pct', 0.065), '6,5%');
});

test('valor ausente devolve null, nunca zero formatado', () => {
  for (const valor of [null, undefined, Number.NaN, Infinity]) {
    assert.equal(formatMetricValue('sales_units', valor), null, String(valor));
  }
  assert.equal(formatMetricValue('sales_units', 0), '0', 'zero publicado é valor');
});

// --- Variações lidas do backend ------------------------------------------------------

const mes = (over = {}) => ({
  reference_date: '2026-05-01', sales_units: 414, offers_units: 6325,
  sold_area_m2: 29493, offer_area_m2: 506965, vgv_brl_million: 356,
  vgo_brl_million: 7107, vgl_brl_million: 242, cancellations_units: 96,
  launches_units: 732, ivv_pct: 0.065,
  ...over,
});

test('as variações vêm dos campos publicados, e o mês é nomeado', () => {
  // "vs mês anterior +3,2%" sobre um período de 66 meses parece variação do período e é
  // variação do último mês. Sem nomear o mês, a ambiguidade é cara.
  const { deltas, mes: ref } = metricDeltas('sales_units', mes({
    sales_units_mom_pct_change: 0.032, sales_units_yoy_pct_change: -0.084, sales_units_ytd: 1980,
  }));
  assert.equal(ref, '2026-05');
  assert.deepEqual(deltas, [
    { label: 'vs mês anterior', value: '+3,2%', tone: 'bom' },
    { label: 'vs mesmo mês do ano anterior', value: '−8,4%', tone: 'ruim' },
    { label: 'Acumulado do ano', value: '1.980', tone: 'neutro' },
  ]);
});

test('o IVV mostra pontos percentuais e variação percentual como coisas DIFERENTES', () => {
  // +1 p.p. e +20% podem descrever o mesmo movimento. Apresentar as duas com o mesmo
  // rótulo faria a tela mentir sobre a magnitude.
  const { deltas } = metricDeltas('ivv_pct', mes({
    ivv_mom_pp: 0.4, ivv_mom_pct_change: 0.065, ivv_yoy_pp: -1.2, ivv_ytd_pct: 0.058,
  }));
  const porRotulo = Object.fromEntries(deltas.map((d) => [d.label, d.value]));
  assert.equal(porRotulo['vs mês anterior'], '+0,4 p.p.');
  assert.equal(porRotulo['vs mês anterior, em %'], '+6,5%');
  assert.equal(porRotulo['vs mesmo mês do ano anterior'], '−1,2 p.p.');
  assert.notEqual(porRotulo['vs mês anterior'], porRotulo['vs mês anterior, em %']);
});

test('o acumulado do ano é VALOR, não variação, e nunca ganha cor', () => {
  // Pintar o acumulado pelo sinal afirmaria uma comparação que ninguém fez.
  const { deltas } = metricDeltas('cancellations_units', mes({ cancellations_units_ytd: 480 }));
  const ytd = deltas.find((d) => d.label === 'Acumulado do ano');
  assert.equal(ytd.value, '480');
  assert.equal(ytd.tone, 'neutro');
});

test('variação que o backend não publicou simplesmente não aparece', () => {
  const { deltas } = metricDeltas('sales_units', mes());
  assert.deepEqual(deltas, []);
  assert.deepEqual(metricDeltas('sales_units', null), []);
});

// --- O modelo completo ----------------------------------------------------------------

test('os cards saem do motor de agregação, nunca de soma própria', () => {
  // Doze meses de estoque somados dariam doze vezes o estoque real. O motor tira média;
  // este teste prova que o card usa o motor e não uma conta paralela.
  const meses = Array.from({ length: 12 }, (_, i) => mes({
    reference_date: `2026-${String(i + 1).padStart(2, '0')}-01`,
  }));
  const cards = buildMarketCards(aggregatePeriod(meses), meses).flat();
  const porChave = Object.fromEntries(cards.map((c) => [c.key, c]));

  assert.equal(porChave.offers_units.value, '6.325', 'estoque virou soma de 12 meses');
  assert.equal(porChave.offers_units.origin, 'media');
  assert.equal(porChave.sales_units.value, '4.968', '414 × 12');
  assert.equal(porChave.sales_units.origin, 'soma');
});

test('métrica sem valor vira frase de ausência, nunca zero', () => {
  const meses = [mes({ vgl_brl_million: null, launches_units: null })];
  const cards = buildMarketCards(aggregatePeriod(meses), meses).flat();
  const vgl = cards.find((c) => c.key === 'vgl_brl_million');
  assert.equal(vgl.value, null);
  assert.match(vgl.absent, /Sem valor publicado/);
  assert.deepEqual(vgl.deltas, []);
});

test('série vazia devolve a grade inteira ausente, sem estourar', () => {
  const cards = buildMarketCards(aggregatePeriod([]), []);
  assert.equal(cards.length, 3);
  for (const card of cards.flat()) {
    assert.equal(card.value, null, card.key);
    assert.ok(card.absent, card.key);
  }
  assert.doesNotThrow(() => buildMarketCards(null, null));
});
