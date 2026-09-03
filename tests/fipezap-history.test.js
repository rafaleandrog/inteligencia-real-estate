// Montagem dos gráficos de "Preços FipeZap — Distrito Federal".

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIPEZAP_HISTORY_CHARTS, buildFipezapHistoryCharts, fipezapMonthlyIndex, fipezapRowsInRange,
} from '../src/fipezap/history.js';
import { CHART_TYPES } from '../src/ivv/chart-model.js';

const linha = (over = {}) => ({
  reference_date: '2026-01-01',
  segment_scope: 'RESIDENCIAL',
  transaction_type: 'VENDA',
  geography_scope: 'DF_TOTAL',
  price_brl_m2: 8000,
  ...over,
});

test('a lista de gráficos é dado congelado, com chaves estáveis', () => {
  assert.deepEqual(FIPEZAP_HISTORY_CHARTS.map((item) => item.key), [
    'fipezap-venda-residencial', 'fipezap-locacao-residencial',
    'fipezap-yield-residencial', 'fipezap-price-to-rent-residencial',
    'fipezap-venda-comercial', 'fipezap-locacao-comercial',
    'fipezap-yield-comercial', 'fipezap-price-to-rent-comercial',
  ]);
  assert.ok(Object.isFrozen(FIPEZAP_HISTORY_CHARTS));
});

test('venda e locação nunca dividem o mesmo gráfico — ordens de grandeza diferentes', () => {
  for (const definicao of FIPEZAP_HISTORY_CHARTS) {
    assert.equal(definicao.series.length, 1, `${definicao.key}: mais de uma série no mesmo eixo`);
  }
});

test('toda definição tem tipo do vocabulário fechado e uma pergunta', () => {
  for (const definicao of FIPEZAP_HISTORY_CHARTS) {
    assert.ok(Object.values(CHART_TYPES).includes(definicao.tipo), definicao.key);
    assert.ok(definicao.pergunta?.endsWith('?'), definicao.key);
  }
});

test('cada gráfico lê só o segmento/transação que declara', () => {
  const rows = [
    linha({ segment_scope: 'RESIDENCIAL', transaction_type: 'VENDA', price_brl_m2: 8000 }),
    linha({ segment_scope: 'RESIDENCIAL', transaction_type: 'LOCACAO', price_brl_m2: 30 }),
    linha({ segment_scope: 'COMERCIAL', transaction_type: 'VENDA', price_brl_m2: 9000 }),
    linha({ segment_scope: 'COMERCIAL', transaction_type: 'LOCACAO', price_brl_m2: 40 }),
  ];
  const charts = buildFipezapHistoryCharts(rows);
  assert.equal(chartByKey(charts, 'fipezap-venda-residencial').series[0].pontos[0].valor, 8000);
  assert.equal(chartByKey(charts, 'fipezap-locacao-residencial').series[0].pontos[0].valor, 30);
  assert.equal(chartByKey(charts, 'fipezap-venda-comercial').series[0].pontos[0].valor, 9000);
  assert.equal(chartByKey(charts, 'fipezap-locacao-comercial').series[0].pontos[0].valor, 40);
});

test('linhas com geography_scope = LOCALIDADE não entram nos gráficos de DF', () => {
  const rows = [
    linha({ geography_scope: 'LOCALIDADE', price_brl_m2: 99999 }),
  ];
  const [venda] = buildFipezapHistoryCharts(rows);
  assert.equal(venda.vazio, true);
});

const chartByKey = (charts, key) => charts.find((c) => c.key === key);

test('yield usa o oficial, e cai no calculado só quando ele faltar (residencial e comercial)', () => {
  for (const [segment_scope, key] of [
    ['RESIDENCIAL', 'fipezap-yield-residencial'], ['COMERCIAL', 'fipezap-yield-comercial'],
  ]) {
    const comOficial = buildFipezapHistoryCharts([
      linha({ segment_scope, transaction_type: 'LOCACAO', official_yield_annual_pct: 0.05, calculated_yield_annual_pct: 0.09 }),
    ]);
    assert.equal(chartByKey(comOficial, key).series[0].pontos[0].valor, 0.05, segment_scope);

    const soCalculado = buildFipezapHistoryCharts([
      linha({ segment_scope, transaction_type: 'LOCACAO', calculated_yield_annual_pct: 0.09 }),
    ]);
    assert.equal(chartByKey(soCalculado, key).series[0].pontos[0].valor, 0.09, segment_scope);
  }
});

test('yield residencial e comercial não se misturam entre si', () => {
  const rows = [
    linha({ segment_scope: 'RESIDENCIAL', transaction_type: 'LOCACAO', official_yield_annual_pct: 0.05 }),
    linha({ segment_scope: 'COMERCIAL', transaction_type: 'LOCACAO', official_yield_annual_pct: 0.09 }),
  ];
  const charts = buildFipezapHistoryCharts(rows);
  assert.equal(chartByKey(charts, 'fipezap-yield-residencial').series[0].pontos[0].valor, 0.05);
  assert.equal(chartByKey(charts, 'fipezap-yield-comercial').series[0].pontos[0].valor, 0.09);
});

test('cada gráfico carrega o segmento que declara, e agrupa em dois blocos de 4', () => {
  const charts = buildFipezapHistoryCharts([]);
  const residencial = charts.filter((c) => c.segmento === 'RESIDENCIAL');
  const comercial = charts.filter((c) => c.segmento === 'COMERCIAL');
  assert.equal(residencial.length, 4);
  assert.equal(comercial.length, 4);
  assert.equal(residencial.length + comercial.length, FIPEZAP_HISTORY_CHARTS.length);
});

test('meses de aluguel para pagar o imóvel lê price_to_rent_months, residencial e comercial', () => {
  const charts = buildFipezapHistoryCharts([
    linha({ segment_scope: 'RESIDENCIAL', transaction_type: 'LOCACAO', price_to_rent_months: 250 }),
    linha({ segment_scope: 'COMERCIAL', transaction_type: 'LOCACAO', price_to_rent_months: 160 }),
  ]);
  assert.equal(chartByKey(charts, 'fipezap-price-to-rent-residencial').series[0].pontos[0].valor, 250);
  assert.equal(chartByKey(charts, 'fipezap-price-to-rent-comercial').series[0].pontos[0].valor, 160);
});

test('fipezapMonthlyIndex: um item por mês distinto do recorte DF_TOTAL, mesmo com várias linhas por mês', () => {
  const rows = [
    linha({ transaction_type: 'VENDA' }),
    linha({ transaction_type: 'LOCACAO' }),
    linha({ segment_scope: 'COMERCIAL' }),
    linha({ geography_scope: 'LOCALIDADE' }),
    linha({ reference_date: '2026-02-01' }),
  ];
  const indice = fipezapMonthlyIndex(rows);
  assert.deepEqual(indice.map((i) => i.reference_date), ['2026-01-01', '2026-02-01']);
});

test('fipezapRowsInRange filtra por mês, incluindo o início e o fim', () => {
  const rows = [
    linha({ reference_date: '2025-12-01' }),
    linha({ reference_date: '2026-01-01' }),
    linha({ reference_date: '2026-02-01' }),
  ];
  const dentro = fipezapRowsInRange(rows, '2026-01', '2026-02');
  assert.equal(dentro.length, 2);
  assert.deepEqual(dentro.map((r) => r.reference_date), ['2026-01-01', '2026-02-01']);
});

test('fipezapRowsInRange sem start/end devolve lista vazia, nunca a base inteira', () => {
  assert.deepEqual(fipezapRowsInRange([linha()], null, null), []);
});
