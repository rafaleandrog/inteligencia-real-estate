import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERIOD_MODES, PERIOD_MODE_OPTIONS, PERIOD_MODE_CONTROLS, availableYears, availableMonths,
  defaultPeriodSelection, selectIvvPeriod, chartRowsForSelection, periodLabel,
  periodSummary, controlDisabledReason, trailingRows, mesAnterior, mesmoMesAnoAnterior,
  monthYearLabel, monthShortLabel,
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

// --- Que campo cada período usa (issue #83) -------------------------------------------

test('todo período declara o uso dos três campos, e a lista fecha com as opções', () => {
  const modos = PERIOD_MODE_OPTIONS.map((item) => item.value);
  assert.deepEqual(Object.keys(PERIOD_MODE_CONTROLS).sort(), [...modos].sort(),
    'um período sem declaração de campos cairia num default silencioso');
  for (const [modo, usos] of Object.entries(PERIOD_MODE_CONTROLS)) {
    assert.deepEqual(Object.keys(usos).sort(), ['ano', 'intervalo', 'mes'], modo);
  }
});

test('toda pílula tem texto curto e frase inteira, e as duas são diferentes coisas', () => {
  for (const item of PERIOD_MODE_OPTIONS) {
    assert.ok(item.chip && item.chip.length <= 14, `${item.value}: chip longo demais`);
    assert.ok(item.label && item.label.length >= item.chip.length, `${item.value}: label`);
  }
});

test('campo apagado sempre tem motivo escrito; campo ativo não tem nenhum', () => {
  // Controle desabilitado sem motivo é indistinguível de controle quebrado (R8.64).
  for (const [modo, usos] of Object.entries(PERIOD_MODE_CONTROLS)) {
    for (const [controle, usa] of Object.entries(usos)) {
      const motivo = controlDisabledReason(modo, controle);
      if (usa) assert.equal(motivo, null, `${modo}/${controle}`);
      else assert.match(motivo, /não usa/, `${modo}/${controle}`);
    }
  }
  assert.match(controlDisabledReason(PERIOD_MODES.ALL, 'ano'), /Histórico completo/);
});

test('o resumo do período diz o intervalo e conta os meses', () => {
  const selecao = selectIvvPeriod(rows, { mode: PERIOD_MODES.YTD, year: 2025, month: 3 });
  const resumo = periodSummary(selecao);
  assert.equal(resumo.meses, 3);
  assert.match(resumo.intervalo, /^jan\.\/2025 a mar\.\/2025$/);
  assert.equal(resumo.referencia, '2025-03');

  const umMes = periodSummary(selectIvvPeriod(rows, { mode: PERIOD_MODES.MONTH, year: 2025, month: 3 }));
  assert.equal(umMes.intervalo, 'mar./2025', 'mês único não vira "X a X"');
  assert.equal(periodSummary({}).meses, 0);
});

test('trailingRows é a única fonte da janela de contexto', () => {
  const janela = trailingRows(rows, '2025-06', 12);
  assert.equal(janela.length, 12);
  assert.equal(janela.at(-1).reference_date, '2025-06-01');
  assert.equal(janela[0].reference_date, '2024-07-01');
  // Menos meses disponíveis que o pedido não estoura: devolve o que existe.
  assert.equal(trailingRows(rows, '2024-02', 12).length, 2);
  // Mês inexistente cai no último disponível, como a janela do gráfico sempre fez.
  assert.equal(trailingRows(rows, '2099-01', 3).at(-1).reference_date, '2025-06-01');
  assert.deepEqual(trailingRows([], '2025-01'), []);
});
