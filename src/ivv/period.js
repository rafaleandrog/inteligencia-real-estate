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

/**
 * Os períodos oferecidos, na ordem em que aparecem como pílulas (issue #83).
 *
 * `chip` é o texto curto do botão; `label` continua sendo a frase inteira, que vai para o
 * `aria-label` — a pílula precisa caber em quatro linhas de 390px, e o leitor de tela não
 * precisa se contentar com a abreviação.
 *
 * A ordem é de recorte crescente: o mês, o ano corrente até aqui, os doze últimos, o ano
 * fechado, tudo, e por fim o intervalo à mão.
 */
export const PERIOD_MODE_OPTIONS = Object.freeze([
  { value: PERIOD_MODES.MONTH, chip: 'Mês', label: 'Mês selecionado' },
  { value: PERIOD_MODES.YTD, chip: 'No ano', label: 'Acumulado do ano' },
  { value: PERIOD_MODES.LAST_12, chip: '12 meses', label: 'Últimos 12 meses' },
  { value: PERIOD_MODES.YEAR, chip: 'Ano fechado', label: 'Ano completo' },
  { value: PERIOD_MODES.ALL, chip: 'Tudo', label: 'Histórico completo' },
  { value: PERIOD_MODES.CUSTOM, chip: 'Personalizado', label: 'Intervalo personalizado' },
]);

/**
 * Que campo cada período usa — DADO, não `if` espalhado pela tela.
 *
 * Campo que o período não usa fica DESABILITADO, com o motivo no `title`, e nunca some
 * (R8.64): controle que desaparece parece defeito de carregamento, e ninguém procura o
 * que não viu. Foi por isso que o intervalo "De/Até", que antes era escondido, passou a
 * ficar visível e apagado fora do modo personalizado.
 */
export const PERIOD_MODE_CONTROLS = Object.freeze({
  [PERIOD_MODES.MONTH]: Object.freeze({ ano: true, mes: true, intervalo: false }),
  [PERIOD_MODES.YTD]: Object.freeze({ ano: true, mes: true, intervalo: false }),
  [PERIOD_MODES.LAST_12]: Object.freeze({ ano: true, mes: true, intervalo: false }),
  [PERIOD_MODES.YEAR]: Object.freeze({ ano: true, mes: false, intervalo: false }),
  [PERIOD_MODES.ALL]: Object.freeze({ ano: false, mes: false, intervalo: false }),
  [PERIOD_MODES.CUSTOM]: Object.freeze({ ano: false, mes: false, intervalo: true }),
});

const CONTROL_LABELS = Object.freeze({
  ano: 'o ano de referência',
  mes: 'o mês de referência',
  intervalo: 'o intervalo personalizado',
});

/**
 * Por que este campo está apagado — a frase que vai para o `title`, ou `null` quando o
 * campo está ativo. Um controle desabilitado sem motivo escrito é indistinguível de um
 * controle quebrado.
 */
export function controlDisabledReason(mode, controle) {
  const usos = PERIOD_MODE_CONTROLS[mode] || PERIOD_MODE_CONTROLS[PERIOD_MODES.YTD];
  if (usos[controle]) return null;
  const periodo = PERIOD_MODE_OPTIONS.find((item) => item.value === mode);
  return `${(periodo?.label || 'O período escolhido')} não usa ${CONTROL_LABELS[controle]}.`;
}

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

/** Os `n` meses que terminam em `end`, inclusive. Uma fonte só para "janela de contexto". */
export function trailingRows(rows, end, n = 12) {
  const prepared = preparedRows(rows);
  if (prepared.length === 0) return [];
  const index = prepared.findIndex((item) => item.month === end);
  const endIndex = index >= 0 ? index : prepared.length - 1;
  return prepared.slice(Math.max(0, endIndex - (n - 1)), endIndex + 1).map((item) => item.row);
}

/** Um mês isolado ganha contexto de 12 meses no gráfico; os cards continuam mensais. */
export function chartRowsForSelection(rows, selected) {
  if ((selected?.rows || []).length > 1) return selected.rows;
  return trailingRows(rows, selected?.end || null);
}

/**
 * O mês anterior a `2026-06` é `2026-05`, e o mesmo mês do ano anterior é `2025-06`.
 *
 * Existem para que o rótulo da variação possa NOMEAR o mês com que está comparando
 * (issue #83). "vs mês anterior" sob um agregado de 66 meses parece variação do período
 * inteiro e é variação do último mês — ambíguo de um jeito caro (R8.66).
 */
export function mesAnterior(mesISO) {
  if (!/^\d{4}-\d{2}$/.test(mesISO || '')) return null;
  const [ano, mes] = mesISO.split('-').map(Number);
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, '0')}`;
}

export function mesmoMesAnoAnterior(mesISO) {
  if (!/^\d{4}-\d{2}$/.test(mesISO || '')) return null;
  const [ano, mes] = mesISO.split('-');
  return `${Number(ano) - 1}-${mes}`;
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

/**
 * O período em uma frase, e a base de comparação em outra (issue #83).
 *
 * Existe porque "Acumulado do ano" sozinho não diz de quando até quando, e a pessoa que
 * chega na tela precisa saber que recorte está lendo antes de acreditar em qualquer
 * número dela.
 */
export function periodSummary(selected) {
  if (!selected?.start || !selected?.end) {
    return { intervalo: 'Sem período disponível', meses: 0, referencia: null };
  }
  const meses = selected.rows.length;
  return {
    intervalo: selected.start === selected.end
      ? monthYearLabel(selected.start)
      : `${monthYearLabel(selected.start)} a ${monthYearLabel(selected.end)}`,
    meses,
    referencia: selected.end,
  };
}
