import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTERVALS_PER_DAY, dailyCoverage, classifyDayCoverage, averageFlow,
} from '../src/traffic/coverage.js';

test('dia completo real: 96 intervalos → cobertura 1, status completo', () => {
  assert.equal(dailyCoverage(96), 1);
  const day = classifyDayCoverage(96);
  assert.equal(day.status, 'complete');
  assert.equal(day.coverage, 1);
  assert.equal(day.intervalsObserved, 96);
  assert.equal(day.qualityFlag, null);
});

test('dia parcial real: 90 intervalos → 93,75%, nunca 9375%', () => {
  // Exemplo real do backend: cobertura_dia_pct = 9375 (bug de locale).
  // A cobertura correta é 90 / 96 = 0,9375 → 93,75%, derivada só do bruto.
  const coverage = dailyCoverage(90);
  assert.equal(coverage, 0.9375);
  assert.equal(Math.round(coverage * 10000) / 100, 93.75, 'expresso em % dá 93,75, não 9375');

  const day = classifyDayCoverage(90);
  assert.equal(day.status, 'partial');
  assert.equal(day.coverage, 0.9375);
  assert.equal(day.intervalsObserved, 90);
  assert.equal(day.qualityFlag, 'partial_intervals');
});

test('cobertura_dia_pct nunca é lido — a função nem aceita esse campo', () => {
  // dailyCoverage e classifyDayCoverage recebem só intervalos_15min_observados.
  // Um valor de cobertura_dia_pct absurdo (9375) passado por engano no lugar
  // de intervalsObserved seria tratado (corretamente) como contagem bruta —
  // provando que a API não tem como "ler" o campo de cobertura por acidente.
  assert.equal(dailyCoverage.length, 1);
  assert.equal(classifyDayCoverage.length, 1);

  // Nenhuma das duas funções tem `cobertura_dia_pct` no seu texto-fonte —
  // ou seja, ele não é referenciado em nenhum ramo de decisão.
  assert.doesNotMatch(dailyCoverage.toString(), /cobertura_dia_pct/);
  assert.doesNotMatch(classifyDayCoverage.toString(), /cobertura_dia_pct/);
});

test('INTERVALS_PER_DAY é 96 (24h × 4)', () => {
  assert.equal(INTERVALS_PER_DAY, 96);
});

test('intervalos inválidos ou ausentes não viram cobertura zero', () => {
  for (const bad of [null, undefined, NaN, -1, 'x']) {
    const coverage = dailyCoverage(bad);
    assert.equal(coverage, null, `${String(bad)} deve ser null, não 0`);
    const day = classifyDayCoverage(bad);
    assert.equal(day.status, 'unknown');
    assert.equal(day.qualityFlag, 'no_coverage_data');
  }
});

test('intervalos acima do máximo são limitados a 96, não geram cobertura > 1', () => {
  assert.equal(dailyCoverage(120), 1);
  const day = classifyDayCoverage(120);
  assert.equal(day.status, 'complete');
  assert.equal(day.intervalsObserved, 96);
});

test('averageFlow declara quantos dias usou e quantos eram parciais', () => {
  const days = [
    { flow: 1000, intervalsObserved: 96 }, // completo
    { flow: 900, intervalsObserved: 90 },  // parcial
    { flow: 800, intervalsObserved: 96 },  // completo
  ];
  const result = averageFlow(days);
  assert.equal(result.daysUsed, 3);
  assert.equal(result.partialDaysUsed, 1);
  assert.equal(result.daysExcluded, 0);
  assert.equal(result.average, (1000 + 900 + 800) / 3);
});

test('averageFlow nunca preenche dia sem medição com zero — exclui, não zera', () => {
  const days = [
    { flow: 1000, intervalsObserved: 96 },
    { flow: null, intervalsObserved: 0 },      // sem medição nenhuma: excluído, não é 0
    { flow: undefined, intervalsObserved: 96 }, // flow ausente apesar de cobertura: excluído
  ];
  const result = averageFlow(days);
  assert.equal(result.daysUsed, 1);
  assert.equal(result.daysExcluded, 2);
  assert.equal(result.average, 1000, 'média não foi puxada para baixo por dias sem medição');
});

test('averageFlow com lista vazia devolve null, não zero', () => {
  const result = averageFlow([]);
  assert.equal(result.average, null);
  assert.equal(result.daysUsed, 0);
});

test('averageFlow: dia parcial puxa a média para baixo, e partialDaysUsed denuncia', () => {
  // Dois dias completos com o mesmo fluxo total (1000) e um terceiro dia parcial
  // (90/96 intervalos) com o MESMO fluxo total, cujo total só é menor porque foi
  // medido por menos tempo, não porque teve menos tráfego.
  const onlyComplete = [
    { flow: 1000, intervalsObserved: 96 },
    { flow: 1000, intervalsObserved: 96 },
  ];
  const withPartial = [
    { flow: 1000, intervalsObserved: 96 },
    { flow: 1000, intervalsObserved: 96 },
    { flow: 700, intervalsObserved: 90 }, // dia parcial: total menor por medição incompleta
  ];

  const baseline = averageFlow(onlyComplete);
  const biased = averageFlow(withPartial);

  assert.equal(baseline.average, 1000);
  assert.ok(
    biased.average < baseline.average,
    'entrar com um dia parcial de total menor derruba a média simples, como documentado'
  );
  assert.equal(biased.partialDaysUsed, 1, 'partialDaysUsed denuncia a presença do dia parcial');

  // completeDaysAverage ignora o dia parcial e recupera o valor sem o viés de cobertura.
  assert.equal(biased.completeDaysAverage, 1000);
});
