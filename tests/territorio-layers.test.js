// Registro das camadas territoriais (issue #149): disponibilidade com motivo em pt-BR,
// escolha de arquivo por zoom/viewport, conferência da classe publicada.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  TERRITORY_LAYERS, RAMPS, AREA_LAYER_IDS, LINE_LAYER_IDS, layerById, metricFor, layerAvailability,
  metricAvailability, layerFilesFor, featureValue, classCheckMismatch,
} from '../src/territorio/layers.js';
import { normalizeManifest, datasetById } from '../src/territorio/manifest.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const RAW = read('./fixtures/public/manifest.json');
const publicData = () => ({ available: true, reason: null, baseUrl: './tests/fixtures/public/', manifest: normalizeManifest(RAW).manifest, warnings: [] });

/** O mesmo contrato de `classes.js` (commit seguinte): igual ao corte sobe; ausente/zero-ausente → null. */
const classIndexFor = (value, breaks, { zeroIsAbsent = false } = {}) => {
  if (value === null || !Number.isFinite(value) || (zeroIsAbsent && value === 0)) return null;
  return breaks.filter((cut) => value >= cut).length;
};

test('o registro é fechado, com rampas conhecidas e métrica padrão existente', () => {
  assert.deepEqual(TERRITORY_LAYERS.map((l) => l.id), ['households_grid', 'jobs_hex', 'road_centrality']);
  assert.deepEqual([...AREA_LAYER_IDS], ['households_grid', 'jobs_hex']);
  assert.deepEqual([...LINE_LAYER_IDS], ['road_centrality']);
  for (const layer of TERRITORY_LAYERS) {
    assert.ok(layer.ramp in RAMPS, `rampa ${layer.ramp} desconhecida`);
    assert.ok(metricFor(layer), `${layer.id} sem métrica padrão`);
    assert.equal(metricFor(layer).key, layer.defaultMetric);
    assert.ok(Object.isFrozen(layer));
  }
  assert.equal(layerById('x'), null);
  assert.equal(metricFor(layerById('jobs_hex'), 'jobs_high').zeroIsAbsent, true);
  assert.equal(layerById('road_centrality').line.weight.length, RAMPS.via);
  assert.equal(layerById('road_centrality').line.opacity.length, RAMPS.via);
});

test('com o manifest de fixture as três camadas estão disponíveis e os cortes cabem nas rampas', () => {
  const pd = publicData();
  for (const layer of TERRITORY_LAYERS) {
    const a = layerAvailability(layer, pd);
    assert.equal(a.available, true, `${layer.id}: ${a.reason}`);
    for (const metric of layer.metrics) {
      const breaks = a.dataset.classBreaks[metric.key];
      assert.ok(breaks, `${layer.id}/${metric.key} sem cortes no manifest`);
      assert.ok(breaks.classes <= RAMPS[layer.ramp], `${layer.id}/${metric.key}: ${breaks.classes} classes > rampa ${layer.ramp}`);
    }
  }
});

test('indisponível sempre diz por quê, em português', () => {
  const layer = layerById('households_grid');
  assert.equal(layerAvailability(layer, null).available, false);
  assert.equal(layerAvailability(layer, { available: false, reason: 'manifest.json ainda não publicado' }).reason, 'manifest.json ainda não publicado');
  const semDataset = normalizeManifest({ ...RAW, datasets: RAW.datasets.filter((d) => d.id !== 'households_grid') }).manifest;
  assert.match(layerAvailability(layer, { available: true, manifest: semDataset }).reason, /não traz o conjunto "households_grid"/);
  const semCortes = JSON.parse(JSON.stringify(RAW));
  delete semCortes.datasets[0].class_breaks.households_delta_per_km2;
  assert.match(layerAvailability(layer, { available: true, manifest: normalizeManifest(semCortes).manifest }).reason, /cortes de classe/);
  const classesDemais = JSON.parse(JSON.stringify(RAW));
  classesDemais.datasets[0].class_breaks.households_delta_per_km2.breaks = [1, 2, 3, 4, 5, 6, 7];
  assert.match(layerAvailability(layer, { available: true, manifest: normalizeManifest(classesDemais).manifest }).reason, /8 classes/);
  assert.equal(layerAvailability(null, publicData()).available, false);
});

test('métrica só de detalhe fica indisponível no overview, com o motivo da R8.15', () => {
  const layer = layerById('households_grid');
  const dataset = datasetById(publicData().manifest, 'households_grid');
  const abs = metricFor(layer, 'households_delta');
  assert.equal(metricAvailability(layer, abs, dataset, { role: 'overview' }).available, false);
  assert.match(metricAvailability(layer, abs, dataset, { role: 'overview' }).reason, /R8\.15/);
  assert.equal(metricAvailability(layer, abs, dataset, { role: 'detail_shard' }).available, true);
  assert.equal(metricAvailability(layer, null, dataset).available, false);
  assert.match(metricAvailability(layer, abs, { classBreaks: {} }, {}).reason, /cortes/);
});

test('layerFilesFor: overview abaixo do zoom_min; a partir dele, só os shards que cruzam a viewport', () => {
  const manifest = publicData().manifest;
  const hh = datasetById(manifest, 'households_grid');
  const layer = layerById('households_grid');
  assert.deepEqual(layerFilesFor(layer, hh, { zoom: 10 }).role, 'overview');
  assert.equal(layerFilesFor(layer, hh, { zoom: 10 }).files.length, 1);
  const detalhe = layerFilesFor(layer, hh, { zoom: 12 });
  assert.equal(detalhe.role, 'detail_shard');
  assert.equal(detalhe.files.length, 3);
  const soRa11 = layerFilesFor(layer, hh, { zoom: 14, bounds: [-47.94, -15.794, -47.936, -15.79] });
  assert.deepEqual(soRa11.files.map((f) => f.shardValue), ['RA_11']);
  const vias = datasetById(manifest, 'road_centrality');
  assert.equal(layerFilesFor(layerById('road_centrality'), vias, { zoom: 11 }).role, 'overview');
  assert.equal(layerFilesFor(layerById('road_centrality'), vias, { zoom: 12 }).role, 'detail');
  assert.deepEqual(layerFilesFor(layer, null, { zoom: 12 }), { role: null, files: [] });
});

test('classCheckMismatch confere a classe publicada contra os cortes do manifest', () => {
  const manifest = publicData().manifest;
  const hh = datasetById(manifest, 'households_grid');
  const layer = layerById('households_grid');
  const metric = metricFor(layer);
  const payload = read('./fixtures/public/households_grid/overview_1km.json');
  assert.ok(payload.features.length > 0);
  assert.equal(classCheckMismatch(payload.features, metric, hh.classBreaks[metric.key], classIndexFor), 0);
  const adulterado = JSON.parse(JSON.stringify(payload.features));
  adulterado[0].properties[`class_${metric.key}`] = 99;
  assert.equal(classCheckMismatch(adulterado, metric, hh.classBreaks[metric.key], classIndexFor), 1);
  assert.equal(featureValue(metric, { [metric.key]: '12.5' }), 12.5);
  assert.equal(featureValue(metric, {}), null);
  assert.equal(classCheckMismatch(null, metric, hh.classBreaks[metric.key], classIndexFor), 0);
});
