// Fluxo por mês de calendário e conferência de classes — issue #138.
//
// O painel do trecho respondia "quanto passou no período", e o período é uma janela que
// só quem leu a data de início conhece. A pergunta que se faz olhando uma rodovia é
// "quanto passou neste mês" — e a resposta só é honesta se vier com quantos dias do mês
// foram efetivamente medidos: hoje são 20 dos 30 de abril/2026.
//
// O teste que importa mais é o da NÃO projeção: nenhuma linha destas pode multiplicar a
// média pelo número de dias do mês.

import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyTotals, divergenceSummary, invalidDateDays } from '../src/traffic/panel.js';
import { normalizeTrafficDailyRecords } from '../src/traffic/normalize.js';

/** Um dia normalizado, com só o que a agregação por mês lê. */
function dia(date, over = {}) {
  return {
    date,
    flow: 1000,
    intervalsObserved: 96,
    classes: {},
    classDivergence: 0,
    ...over,
  };
}

// --- Total do mês: soma do medido, nunca projeção ------------------------------------

test('mês parcial soma os dias medidos e declara quantos são — sem projetar o mês cheio', () => {
  const dias = [];
  for (let d = 1; d <= 20; d += 1) dias.push(dia(`2026-04-${String(d).padStart(2, '0')}`, { flow: 7174 }));

  const [abril] = monthlyTotals(dias);
  assert.equal(abril.month, '2026-04');
  assert.equal(abril.label, 'Abril/2026');
  assert.equal(abril.days, 20);
  assert.equal(abril.daysInMonth, 30);
  // 20 × 7174. Se alguém trocar a soma por média × daysInMonth, este número vira 215.220.
  assert.equal(abril.total, 143480);
  assert.notEqual(abril.total, Math.round((143480 / 20) * 30));
});

test('dia sem fluxo numérico fica fora da soma e fora da contagem de dias medidos', () => {
  const linhas = monthlyTotals([
    dia('2026-04-01', { flow: 100 }),
    dia('2026-04-02', { flow: null }),
    dia('2026-04-03', { flow: 200 }),
  ]);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].total, 300, 'o dia sem total não pode entrar como zero');
  assert.equal(linhas[0].days, 2);
  assert.equal(linhas[0].daysExcluded, 1);
});

test('mês sem nenhum dia com total devolve total null, nunca zero', () => {
  const [linha] = monthlyTotals([dia('2026-04-01', { flow: null })]);
  assert.equal(linha.total, null);
  assert.equal(linha.days, 0);
  assert.equal(linha.daysExcluded, 1);
});

// --- Dias do mês: lidos do mês, não de constante --------------------------------------

test('daysInMonth acompanha o mês, inclusive fevereiro e ano bissexto', () => {
  const linhas = monthlyTotals([
    dia('2026-02-10'), dia('2026-03-10'), dia('2028-02-10'),
  ]);
  assert.deepEqual(linhas.map((m) => [m.month, m.daysInMonth]), [
    ['2026-02', 28],
    ['2026-03', 31],
    ['2028-02', 29],
  ]);
});

test('meses diferentes viram linhas separadas, em ordem cronológica', () => {
  const linhas = monthlyTotals([
    dia('2026-05-02', { flow: 50 }),
    dia('2026-04-30', { flow: 10 }),
    dia('2026-05-01', { flow: 40 }),
  ]);
  assert.deepEqual(linhas.map((m) => m.label), ['Abril/2026', 'Maio/2026']);
  assert.equal(linhas[0].total, 10);
  assert.equal(linhas[1].total, 90);
});

test('data ausente ou fora do formato não cria mês', () => {
  assert.deepEqual(monthlyTotals([dia(null), dia('abril'), dia('2026-13-01')]), []);
  assert.deepEqual(monthlyTotals(null), []);
});

// --- Contagem de DIAS do calendário, não de registros ---------------------------------

test('os dois sentidos do mesmo dia somam o fluxo mas contam UM dia', () => {
  // Contar registros diria "40 de 30 dias" num mês com os dois sentidos medidos.
  const linhas = monthlyTotals([
    dia('2026-04-01', { flow: 600 }),
    dia('2026-04-01', { flow: 400 }),
    dia('2026-04-02', { flow: 500 }),
  ]);
  assert.equal(linhas[0].total, 1500);
  assert.equal(linhas[0].days, 2);
});

test('dia completo num sentido e parcial no outro conta como parcial', () => {
  // Bastar um sentido completo diria "dia completo" sobre uma via medida pela metade.
  const [abril] = monthlyTotals([
    dia('2026-04-01', { intervalsObserved: 96 }),
    dia('2026-04-01', { intervalsObserved: 40 }),
    dia('2026-04-02', { intervalsObserved: 96 }),
  ]);
  assert.equal(abril.complete, 1);
  assert.equal(abril.partial, 1);
  assert.equal(abril.unknown, 0);
});

test('dia sem intervalos observados não é dado como completo', () => {
  const [abril] = monthlyTotals([dia('2026-04-01', { intervalsObserved: null })]);
  assert.equal(abril.complete, 0);
  assert.equal(abril.partial, 0);
  assert.equal(abril.unknown, 1);
});

// --- Divergência entre total e soma das classes ---------------------------------------

test('divergenceSummary devolve null quando a conferência da fonte fecha em todos os dias', () => {
  assert.equal(divergenceSummary([dia('2026-04-01'), dia('2026-04-02')]), null);
  assert.equal(divergenceSummary([]), null);
  assert.equal(divergenceSummary(null), null);
});

test('divergenceSummary conta os dias que não fecham e soma a diferença publicada', () => {
  const out = divergenceSummary([
    dia('2026-04-01', { classDivergence: 0 }),
    dia('2026-04-02', { classDivergence: 12 }),
    dia('2026-04-03', { classDivergence: -5 }),
    dia('2026-04-04', { classDivergence: null }),
  ]);
  // 12 e 5 em módulo: a soma mede o TAMANHO da discrepância, não o saldo dela.
  assert.deepEqual(out, { days: 2, total: 17 });
});

// --- Data que não existe no calendário — achado P2 do Codex na PR #139 ----------------
//
// `toDateISO` reconhece o FORMATO, não o calendário: ela devolve `2026-04-31` e
// `2026-02-30` intactos. Sem validar o dia, um 31 de abril entrava no balde de abril e
// contava como dia distinto — e o painel chegava a dizer "31 de 30 dias medidos".

test('dia que não existe no mês não cria mês nem conta como dia medido', () => {
  const linhas = monthlyTotals([
    dia('2026-04-31', { flow: 999 }),
    dia('2026-02-30', { flow: 999 }),
    dia('2026-04-99', { flow: 999 }),
    dia('2026-04-20', { flow: 100 }),
  ]);
  assert.equal(linhas.length, 1, 'só abril, e só pelo dia 20');
  assert.equal(linhas[0].days, 1);
  assert.equal(linhas[0].total, 100, 'o 31 de abril não pode entrar na soma do mês');
});

test('o último dia real de cada mês continua valendo', () => {
  // A guarda tem que rejeitar o dia impossível sem comer o dia legítimo da borda.
  const linhas = monthlyTotals([
    dia('2026-01-31'), dia('2026-04-30'), dia('2026-02-28'), dia('2028-02-29'),
  ]);
  assert.deepEqual(linhas.map((m) => [m.month, m.days]), [
    ['2026-01', 1], ['2026-02', 1], ['2026-04', 1], ['2028-02', 1],
  ]);
});

test('29 de fevereiro em ano comum é recusado; em bissexto é aceito', () => {
  assert.deepEqual(monthlyTotals([dia('2026-02-29')]), []);
  assert.equal(monthlyTotals([dia('2028-02-29')]).length, 1);
});

test('invalidDateDays conta os registros recusados, para a diferença não ser silenciosa', () => {
  // O registro segue no total do período; some-lo do mês sem dizer nada faria as duas
  // contas divergirem sem explicação na tela.
  assert.equal(invalidDateDays([dia('2026-04-31'), dia('2026-02-30'), dia('2026-04-20')]), 2);
  assert.equal(invalidDateDays([dia('2026-04-20')]), 0);
  assert.equal(invalidDateDays([]), 0);
  assert.equal(invalidDateDays(null), 0);
});

test('a mesma data inválida nos dois sentidos conta UM dia, não dois', () => {
  assert.equal(invalidDateDays([dia('2026-04-31'), dia('2026-04-31')]), 1);
});

// --- Achados da revisão do Kimi na PR #139 -------------------------------------------

test('divergência conta DATAS distintas — os dois sentidos do mesmo dia são um dia', () => {
  // Mesmo argumento de monthlyTotals e invalidDateDays: contar registros diria
  // "2 dia(s)" sobre um único 01/04 com os dois sentidos divergindo.
  const out = divergenceSummary([
    dia('2026-04-01', { classDivergence: 10 }),
    dia('2026-04-01', { classDivergence: 10 }),
    dia('2026-04-02', { classDivergence: 5 }),
  ]);
  assert.equal(out.days, 2);
  assert.equal(out.total, 25, 'o total continua somando os dois sentidos — é discrepância dos dois');
});

test('divergências de sinais opostos NÃO se anulam — a soma é em módulo', () => {
  // Com soma algébrica a tela diria "0 veíc. em 2 dia(s)": afirma divergência e mostra
  // zero ao lado, com 1.600 veíc. de discrepância real sumindo.
  const out = divergenceSummary([
    dia('2026-04-03', { classDivergence: 800 }),
    dia('2026-04-04', { classDivergence: -800 }),
  ]);
  assert.equal(out.days, 2);
  assert.equal(out.total, 1600);
});

test('dia completo num sentido e SEM cobertura conhecida no outro não é dado como completo', () => {
  // Não saber é diferente de estar completo (R5.7) — a mesma regra que já valia para o
  // dia parcial.
  const [abril] = monthlyTotals([
    dia('2026-04-01', { intervalsObserved: 96 }),
    dia('2026-04-01', { intervalsObserved: null }),
    dia('2026-04-02', { intervalsObserved: 96 }),
  ]);
  assert.equal(abril.complete, 1);
  assert.equal(abril.unknown, 1);
  assert.equal(abril.partial, 0);
});

test('dia parcial ainda vence o desconhecido na classificação', () => {
  const [abril] = monthlyTotals([
    dia('2026-04-01', { intervalsObserved: 40 }),
    dia('2026-04-01', { intervalsObserved: null }),
  ]);
  assert.equal(abril.partial, 1);
  assert.equal(abril.unknown, 0);
});

test('linha de tráfego com dia vazio nem chega ao painel — é descartada na normalização', () => {
  // Achado do Kimi que NÃO se confirma: `normalizeTrafficDaily` devolve null quando
  // `toDateISO(dia)` é null, então a linha não entra no total do período nem no mês.
  // Não há divergência silenciosa para declarar.
  const { records, dropped } = normalizeTrafficDailyRecords([
    { dia: '', fluxo_total: 4100, road_segment_id: 'RS-1' },
    { dia: '2026-04-01', fluxo_total: 100, road_segment_id: 'RS-1' },
  ]);
  assert.equal(records.length, 1);
  assert.equal(dropped, 1);
  assert.equal(monthlyTotals(records)[0].total, 100);
});
