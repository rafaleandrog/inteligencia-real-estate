import test from 'node:test';
import assert from 'node:assert/strict';
import { HISTORY_CHARTS, buildHistoryCharts } from '../src/ivv/history.js';

const rows = [
  {
    reference_date: '2026-02-01', ivv_pct: 0.06,
    sale_price_brl_m2: 10000, asking_price_brl_m2: 12000,
    sales_units: 300, launches_units: 500, offers_units: 4000,
  },
  {
    reference_date: '2026-01-01', ivv_pct: 0.05,
    sale_price_brl_m2: 9800, asking_price_brl_m2: 11800,
    sales_units: 250, launches_units: 350, offers_units: 4200,
  },
];

test('os quatro gráficos históricos têm séries compatíveis por unidade', () => {
  assert.deepEqual(HISTORY_CHARTS.map((item) => item.key), ['ivv', 'prices', 'activity', 'offers']);
  const charts = buildHistoryCharts(rows);
  assert.equal(charts.length, 4);
  assert.ok(charts.every((chart) => chart.empty === false));
  assert.deepEqual(charts[0].months, ['2026-01', '2026-02']);
});

test('gráfico usa valor mensal ordenado, nunca acumulado repetido', () => {
  const activity = buildHistoryCharts(rows).find((chart) => chart.key === 'activity');
  const sales = activity.series.find((series) => series.key === 'sales_units');
  assert.deepEqual(sales.points.map((point) => point.value), [250, 300]);
});

test('dado ausente não vira zero no gráfico', () => {
  const charts = buildHistoryCharts([{ reference_date: '2026-01-01', sales_units: null }]);
  const ivv = charts.find((chart) => chart.key === 'ivv');
  assert.equal(ivv.empty, true);
  assert.deepEqual(ivv.series[0].points, []);
});
