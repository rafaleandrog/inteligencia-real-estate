// Seleção temporal da série IVV_MONTHLY.
//
// A UI entrega intenção (mês, YTD, ano, intervalo); este módulo devolve as linhas
// correspondentes. A agregação continua exclusivamente em aggregate.js, onde a natureza
// de cada métrica decide soma, média ou razão ponderada.

import { prepareRows } from './aggregate.js';

export const PERIOD_MODES = Object.freeze({
  MONTH: 'month',
  LAST_12: 'last_12',
  YTD: 'ytd',
  YEAR: 'year',
  ALL: 'all',
  CUSTOM: 'custom',
});

export const PERIOD_MODE_OPTIONS = Object.freeze([
  { value: PERIOD_MODES.MONTH, label: 'Mês selecionado' },
  { value: PERIOD_MODES.LAST_12, label: 'Últimos 12 meses' },
  { value: PERIOD_MODES.YTD, label: 'Acumulado do ano' },
  { value: PERIOD_MODES.YEAR, label: 'Ano completo' },
  { value: PERIOD_MODES.ALL, label: 'Histórico completo' },
  { value: PERIOD_MODES.CUSTOM, label: 'Intervalo personalizado' },
]);

const MONTH_LABELS = Object.freeze([
  'jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.',
  'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.',
]);

function preparedRows(rows) {
  return prepareRows(rows).rows;
}

export function availableYears(rows) {
  return [...new Set(preparedRows(rows).map((item) => item.year))].sort((a, b) => b - a);
}

export function availableMonths(rows, year) {
  return preparedRows(rows)
    .filter((item) => item.year === Number(year))
    .map((item) => ({
      value: Number(item.month.slice(5)),
      key: item.month,
      label: MONTH_LABELS[Number(item.month.slice(5)) - 1],
    }));
}

export function defaultPeriodSelection(rows) {
  const prepared = preparedRows(rows);
  const latest = prepared.at(-1);
  return {
    mode: PERIOD_MODES.YTD,
    year: latest ? latest.year : null,
    month: latest ? Number(latest.month.slice(5)) : null,
    start: prepared[0]?.month || null,
    end: latest?.month || null,
  };
}

function referenceIndex(prepared, selection) {
  if (prepared.length === 0) return -1;
  const year = Number(selection.year);
  const month = Number(selection.month);
  const exact = prepared.findIndex((item) => item.year === year
    && Number(item.month.slice(5)) === month);
  if (exact >= 0) return exact;
  return prepared.length - 1;
}

function orderedBounds(start, end, fallbackStart, fallbackEnd) {
  const a = /^\d{4}-\d{2}$/.test(start || '') ? start : fallbackStart;
  const b = /^\d{4}-\d{2}$/.test(end || '') ? end : fallbackEnd;
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

export function selectIvvPeriod(rows, selection = {}) {
  const prepared = preparedRows(rows);
  if (prepared.length === 0) {
    return { rows: [], mode: selection.mode || PERIOD_MODES.YTD, start: null, end: null };
  }

  const mode = Object.values(PERIOD_MODES).includes(selection.mode)
    ? selection.mode : PERIOD_MODES.YTD;
  const refIndex = referenceIndex(prepared, selection);
  const reference = prepared[refIndex];
  let selected;

  switch (mode) {
    case PERIOD_MODES.MONTH:
      selected = [reference];
      break;
    case PERIOD_MODES.LAST_12:
      selected = prepared.slice(Math.max(0, refIndex - 11), refIndex + 1);
      break;
    case PERIOD_MODES.YEAR:
      selected = prepared.filter((item) => item.year === reference.year);
      break;
    case PERIOD_MODES.ALL:
      selected = prepared;
      break;
    case PERIOD_MODES.CUSTOM: {
      const bounds = orderedBounds(
        selection.start, selection.end, prepared[0].month, prepared.at(-1).month,
      );
      selected = prepared.filter((item) => item.month >= bounds.start && item.month <= bounds.end);
      break;
    }
    case PERIOD_MODES.YTD:
    default:
      selected = prepared.filter((item) => item.year === reference.year && item.month <= reference.month);
      break;
  }

  return {
    rows: selected.map((item) => item.row),
    mode,
    reference: reference.month,
    start: selected[0]?.month || null,
    end: selected.at(-1)?.month || null,
  };
}

/** Um mês isolado ganha contexto de 12 meses no gráfico; os cards continuam mensais. */
export function chartRowsForSelection(rows, selected) {
  if ((selected?.rows || []).length > 1) return selected.rows;
  const prepared = preparedRows(rows);
  if (prepared.length === 0) return [];
  const end = selected?.end || prepared.at(-1).month;
  const index = prepared.findIndex((item) => item.month === end);
  const endIndex = index >= 0 ? index : prepared.length - 1;
  return prepared.slice(Math.max(0, endIndex - 11), endIndex + 1).map((item) => item.row);
}

/** Rótulo curto do mês do ano (`1` → `jan.`). O eixo da sazonalidade não tem ano. */
export function monthShortLabel(numero) {
  return MONTH_LABELS[Number(numero) - 1] || '';
}

export function monthYearLabel(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return '';
  const [year, number] = month.split('-').map(Number);
  return `${MONTH_LABELS[number - 1]}/${year}`;
}

export function periodLabel(selected) {
  if (!selected?.start || !selected?.end) return 'Sem período disponível';
  if (selected.start === selected.end) return monthYearLabel(selected.start);
  return `${monthYearLabel(selected.start)} a ${monthYearLabel(selected.end)} · ${selected.rows.length} meses`;
}
