// Tabela compacta do painel do trecho (issue #173).
import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentFlowTable } from '../src/traffic/summary.js';

const r = (date, direction, flow) => ({ date, direction, flow });

test('separa crescente, decrescente e total, com média por dia', () => {
  const linked = {
    traffic: {
      crescente: [r('2026-07-01', 'crescente', 100), r('2026-07-02', 'crescente', 300)],
      decrescente: [r('2026-07-01', 'decrescente', 50)],
      semSentido: [],
    },
  };
  const { period, months } = segmentFlowTable(linked);
  assert.deepEqual(period.crescente, { total: 400, days: 2, average: 200 });
  assert.deepEqual(period.decrescente, { total: 50, days: 1, average: 50 });
  // Total por dia: 01/07 = 150, 02/07 = 300 (só crescente).
  assert.deepEqual(period.total, { total: 450, days: 2, average: 225 });
  assert.equal(period.singleDirectionDays, 1);
  assert.equal(months.length, 1);
  assert.equal(months[0].label, 'Julho/2026');
  assert.equal(months[0].daysInMonth, 31);
});

test('um mês por linha, sem projetar o mês cheio', () => {
  const linked = {
    traffic: {
      crescente: [r('2026-06-30', 'crescente', 10), r('2026-07-01', 'crescente', 20)],
      decrescente: [r('2026-06-30', 'decrescente', 30)],
      semSentido: [],
    },
  };
  const { months } = segmentFlowTable(linked);
  assert.deepEqual(months.map((m) => m.month), ['2026-06', '2026-07']);
  assert.deepEqual(months[0].total, { total: 40, days: 1, average: 40 });
  assert.equal(months[1].decrescente.total, null);
  assert.equal(months[1].decrescente.average, null);
});

test('dia sem fluxo numérico não vira zero, e trecho vazio dá null', () => {
  assert.equal(segmentFlowTable(null), null);
  assert.equal(segmentFlowTable({ traffic: { crescente: [], decrescente: [], semSentido: [] } }), null);
  const { period } = segmentFlowTable({
    traffic: { crescente: [r('2026-07-01', 'crescente', null)], decrescente: [], semSentido: [] },
  });
  assert.equal(period.total.total, null);
  assert.equal(period.total.days, 0);
});
