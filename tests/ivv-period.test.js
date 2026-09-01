import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERIOD_MODES, availableYears, availableMonths, defaultPeriodSelection,
  selectIvvPeriod, chartRowsForSelection, periodLabel,
} from '../src/ivv/period.js';

const rows = Array.from({ length: 18 }, (_, index) => {
  const date = new Date(Date.UTC(2024, index, 1));
  return {
    reference_date: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`,
    sales_units: index + 1,
  };
});

test('anos e meses disponíveis saem do eixo temporal real', () => {
  assert.deepEqual(availableYears(rows), [2025, 2024]);
  assert.equal(availableMonths(rows, 2025).length, 6);
  assert.equal(availableMonths(rows, 2025)[5].key, '2025-06');
});

test('seleção padrão é o acumulado do ano até o último mês', () => {
  const selection = defaultPeriodSelection(rows);
  assert.deepEqual(selection, {
    mode: PERIOD_MODES.YTD, year: 2025, month: 6, start: '2024-01', end: '2025-06',
  });
  const selected = selectIvvPeriod(rows, selection);
  assert.equal(selected.rows.length, 6);
  assert.equal(selected.start, '2025-01');
  assert.equal(selected.end, '2025-06');
});

test('mês, últimos 12, ano e histórico completo recortam sem inventar linha', () => {
  assert.equal(selectIvvPeriod(rows, { mode: PERIOD_MODES.MONTH, year: 2024, month: 4 }).rows.length, 1);
  assert.equal(selectIvvPeriod(rows, { mode: PERIOD_MODES.LAST_12, year: 2025, month: 3 }).rows.length, 12);
  assert.equal(selectIvvPeriod(rows, { mode: PERIOD_MODES.YEAR, year: 2024, month: 12 }).rows.length, 12);
  assert.equal(selectIvvPeriod(rows, { mode: PERIOD_MODES.ALL }).rows.length, 18);
});

test('intervalo personalizado inclui as duas pontas e tolera ordem invertida', () => {
  const selected = selectIvvPeriod(rows, {
    mode: PERIOD_MODES.CUSTOM, start: '2025-03', end: '2024-11',
  });
  assert.equal(selected.start, '2024-11');
  assert.equal(selected.end, '2025-03');
  assert.equal(selected.rows.length, 5);
});

test('gráfico dá 12 meses de contexto quando os cards mostram um único mês', () => {
  const selected = selectIvvPeriod(rows, { mode: PERIOD_MODES.MONTH, year: 2025, month: 6 });
  const chartRows = chartRowsForSelection(rows, selected);
  assert.equal(chartRows.length, 12);
  assert.equal(chartRows[0].reference_date, '2024-07-01');
  assert.equal(chartRows.at(-1).reference_date, '2025-06-01');
  assert.match(periodLabel(selected), /jun\.\/2025/);
});

test('série vazia devolve seleção utilizável', () => {
  assert.deepEqual(selectIvvPeriod([], { mode: PERIOD_MODES.ALL }).rows, []);
  assert.deepEqual(availableYears([]), []);
});
