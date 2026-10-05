// Classes por cortes fixos (issue #150): igual ao corte sobe; ausência é null; zero é
// ausência só quando a métrica declara; a rampa precisa caber.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { classIndexFor, classCount, ensureBreaksFit } from '../src/territorio/classes.js';
import { RAMPS, TERRITORY_LAYERS } from '../src/territorio/layers.js';

const BREAKS = [100, 350, 750, 1000, 2000];

test('classIndexFor: valor igual ao corte cai na classe de cima, como assign_class no pipeline', () => {
  assert.equal(classIndexFor(0, BREAKS), 0);
  assert.equal(classIndexFor(99.9, BREAKS), 0);
  assert.equal(classIndexFor(100, BREAKS), 1);
  assert.equal(classIndexFor(349.99, BREAKS), 1);
  assert.equal(classIndexFor(350, BREAKS), 2);
  assert.equal(classIndexFor(1000, BREAKS), 4);
  assert.equal(classIndexFor(2000, BREAKS), 5);
  assert.equal(classIndexFor(1e9, BREAKS), 5);
  assert.equal(classIndexFor(-40, BREAKS), 0, 'perda cai na primeira classe, que inclui perda e zero');
});

test('classIndexFor: ausência é null, nunca classe zero; zero só é ausência quando declarado', () => {
  for (const v of [null, undefined, NaN, Infinity, -Infinity, '12', '']) assert.equal(classIndexFor(v, BREAKS), null, String(v));
  assert.equal(classIndexFor(0, BREAKS, { zeroIsAbsent: true }), null);
  assert.equal(classIndexFor(1, BREAKS, { zeroIsAbsent: true }), 0);
  assert.equal(classIndexFor(10, []), null);
  assert.equal(classIndexFor(10, null), null);
});

test('classCount e ensureBreaksFit', () => {
  assert.equal(classCount(BREAKS), 6);
  assert.equal(classCount([]), 0);
  assert.equal(classCount(null), 0);
  assert.deepEqual(ensureBreaksFit(BREAKS, 6), { ok: true, reason: null });
  assert.deepEqual(ensureBreaksFit(BREAKS, 10), { ok: true, reason: null });
  assert.match(ensureBreaksFit(BREAKS, 5).reason, /6 classes para uma rampa de 5/);
  assert.match(ensureBreaksFit([1, 1], 6).reason, /não crescentes/);
  assert.match(ensureBreaksFit([], 6).reason, /sem cortes/);
});

test('os cortes de fixture de cada métrica cabem na rampa da camada (o manifest e o CSS concordam)', () => {
  const manifest = JSON.parse(readFileSync(new URL('./fixtures/public/manifest.json', import.meta.url), 'utf8'));
  for (const layer of TERRITORY_LAYERS) {
    const dataset = manifest.datasets.find((d) => d.id === layer.datasetId);
    for (const metric of layer.metrics) {
      const spec = dataset.class_breaks[metric.key];
      assert.ok(spec, `${layer.id}/${metric.key}`);
      assert.equal(ensureBreaksFit(spec.breaks, RAMPS[layer.ramp]).ok, true, `${layer.id}/${metric.key}`);
      assert.equal(classCount(spec.breaks), spec.classes);
    }
  }
});
