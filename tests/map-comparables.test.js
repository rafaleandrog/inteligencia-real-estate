import test from 'node:test';
import assert from 'node:assert/strict';
import {
  percentile, comparableSample, comparableStats, positionVsMedian, rulerPosition, RECENT_DAYS,
} from '../src/map/comparables.js';

// Comparáveis do recorte (issue #124). O que este arquivo impede: amostra vazia virando
// zero; NaN/Infinity vazando para a tela; o próprio imóvel contando como comparável de
// si mesmo; quartis errados por percentil "de tabela" em vez de interpolação.

const NOW = Date.parse('2026-09-19T12:00:00Z');
const listing = (id, price_m2, over = {}) => ({ kind: 'listing', id, price_m2, status: 'active', observed_at: '2026-09-01', ...over });

test('percentile: interpolação linear, um elemento, lista vazia e p fora de 0–100', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([7], 25), 7);
  assert.equal(percentile([1, 2, 3, 4], 50), 2.5);
  assert.equal(percentile([1, 2, 3, 4], 25), 1.75);
  assert.equal(percentile([1, 2, 3, 4], 75), 3.25);
  assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
  assert.equal(percentile([1, 2, 3], 0), 1);
  assert.equal(percentile([1, 2, 3], 100), 3);
  assert.equal(percentile([1, 2, 3], 150), 3, 'p acima de 100 é preso ao máximo');
  assert.equal(percentile([1, 2, 3], NaN), null);
  assert.equal(percentile(null, 50), null);
});

test('comparableStats: amostra vazia é n = 0 com estatísticas null, nunca zero', () => {
  for (const vazio of [[], null, undefined, [null, 'x']]) {
    const s = comparableStats(vazio, { now: NOW });
    assert.equal(s.n, 0);
    assert.equal(s.withPriceM2, 0);
    assert.equal(s.median, null);
    assert.equal(s.p25, null);
    assert.equal(s.min, null);
  }
});

test('comparableStats: ignora price_m2 null/NaN e conta ativos e recentes', () => {
  const s = comparableStats([
    listing('a', 8000),
    listing('b', 10000, { status: 'inactive', observed_at: '2026-01-01' }),
    listing('c', null),
    listing('d', NaN),
    listing('e', 9000, { observed_at: 'não é data' }),
    listing('f', 7000, { observed_at: '2026-06-01' }),
  ], { now: NOW });
  assert.equal(s.n, 6);
  assert.equal(s.withPriceM2, 4);
  assert.equal(s.active, 5);
  assert.equal(s.recent, 3, 'só quem foi observado nos últimos 90 dias: b é de janeiro, e tem data ilegível, f é de junho');
  assert.equal(s.min, 7000);
  assert.equal(s.median, 8500);
  assert.equal(s.max, 10000);
  assert.equal(s.p25, 7750);
  assert.equal(s.p75, 9250);
});

test('amostra pequena: um comparável dá quartis iguais à mediana, sem NaN', () => {
  const s = comparableStats([listing('a', 8000)], { now: NOW });
  assert.deepEqual([s.min, s.p25, s.median, s.p75, s.max], [8000, 8000, 8000, 8000, 8000]);
  assert.equal(s.withPriceM2, 1);
});

test('comparableSample: mesmo tipo, sem o próprio registro, tolerando lixo', () => {
  const alvo = listing('me', 9000);
  const sample = comparableSample([alvo, listing('x', 1), { kind: 'development', id: 'd', price_m2: 5 }, null, 'lixo'], alvo);
  assert.deepEqual(sample.map((r) => r.id), ['x']);
  assert.deepEqual(comparableSample(null, alvo), []);
  assert.equal(comparableSample([alvo, listing('x', 1)], null).length, 2, 'sem alvo, a lista inteira');
});

test('positionVsMedian: +8,6% contra a mediana; null sem preço, sem mediana ou mediana zero', () => {
  const stats = comparableStats([listing('a', 8000), listing('b', 8670), listing('c', 10200)], { now: NOW });
  const pos = positionVsMedian(9420, stats);
  assert.equal(pos.sampleN, 3);
  assert.ok(Math.abs(pos.deltaPct - (9420 / 8670 - 1)) < 1e-12);

  assert.deepEqual(positionVsMedian(null, stats), { deltaPct: null, sampleN: 3 });
  assert.deepEqual(positionVsMedian(NaN, stats), { deltaPct: null, sampleN: 3 });
  assert.deepEqual(positionVsMedian(9420, comparableStats([], { now: NOW })), { deltaPct: null, sampleN: 0 });
  assert.deepEqual(positionVsMedian(9420, { median: 0, withPriceM2: 2 }), { deltaPct: null, sampleN: 2 });
  assert.deepEqual(positionVsMedian(9420, null), { deltaPct: null, sampleN: 0 });
});

test('rulerPosition: fração 0–1 entre P25 e P75, presa às bordas, 0.5 quando P25 = P75', () => {
  const stats = { p25: 8000, p75: 10000 };
  assert.equal(rulerPosition(9000, stats), 0.5);
  assert.equal(rulerPosition(8000, stats), 0);
  assert.equal(rulerPosition(12000, stats), 1);
  assert.equal(rulerPosition(1000, stats), 0);
  assert.equal(rulerPosition(9000, { p25: 9000, p75: 9000 }), 0.5);
  assert.equal(rulerPosition(9000, { p25: null, p75: null }), null);
  assert.equal(rulerPosition(null, stats), null);
  assert.equal(RECENT_DAYS, 90);
});
