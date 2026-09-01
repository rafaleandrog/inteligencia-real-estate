// Modelos puros dos gráficos históricos do Mercado Residencial DF.

import { monthlySeries } from './aggregate.js';
import { METRIC_BY_KEY } from './metrics.js';
import { formatMetricValue } from './cards.js';
import { monthYearLabel } from './period.js';

export const HISTORY_CHARTS = Object.freeze([
  {
    key: 'ivv', title: 'Evolução do IVV', unit: 'fracao',
    series: [{ key: 'ivv_pct', color: '#55d99a' }],
  },
  {
    key: 'prices', title: 'Preço por m²', unit: 'brl_m2',
    series: [
      { key: 'sale_price_brl_m2', color: '#55d99a' },
      { key: 'asking_price_brl_m2', color: '#8eb8ff' },
    ],
  },
  {
    key: 'activity', title: 'Vendas e lançamentos mensais', unit: 'unidades',
    series: [
      { key: 'sales_units', color: '#55d99a' },
      { key: 'launches_units', color: '#d6a449' },
    ],
  },
  {
    key: 'offers', title: 'Unidades em oferta por mês', unit: 'unidades',
    series: [{ key: 'offers_units', color: '#9f7aea' }],
  },
]);

function extent(series, baselineZero) {
  const values = series.flatMap((item) => item.points.map((point) => point.value))
    .filter(Number.isFinite);
  if (values.length === 0) return { min: 0, max: 1 };
  let min = baselineZero ? 0 : Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    const padding = Math.abs(max || 1) * 0.1;
    min -= baselineZero ? 0 : padding;
    max += padding;
  } else if (!baselineZero) {
    const padding = (max - min) * 0.08;
    min -= padding;
    max += padding;
  }
  return { min, max };
}

export function buildHistoryCharts(rows) {
  return HISTORY_CHARTS.map((definition) => {
    const series = definition.series.map((item) => ({
      ...item,
      label: METRIC_BY_KEY[item.key]?.label || item.key,
      points: monthlySeries(rows, item.key).filter((point) => Number.isFinite(point.value)),
    }));
    const range = extent(series, definition.unit !== 'brl_m2');
    const months = [...new Set(series.flatMap((item) => item.points.map((point) => point.month)))].sort();
    return {
      ...definition,
      series,
      months,
      min: range.min,
      max: range.max,
      startLabel: monthYearLabel(months[0]),
      endLabel: monthYearLabel(months.at(-1)),
      minLabel: formatMetricValue(definition.series[0].key, range.min),
      maxLabel: formatMetricValue(definition.series[0].key, range.max),
      empty: series.every((item) => item.points.length === 0),
    };
  });
}
