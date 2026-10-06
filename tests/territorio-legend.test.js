// Legenda territorial (issue #150): linhas sem cor, "sem dado" sempre presente, procedência
// só com o que o manifest declara.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { legendRows, legendTitle, lineLegendRows, provenanceLine } from '../src/territorio/legend.js';
import { layerById, metricFor } from '../src/territorio/layers.js';
import { normalizeManifest, datasetById } from '../src/territorio/manifest.js';

const { manifest } = normalizeManifest(JSON.parse(readFileSync(new URL('./fixtures/public/manifest.json', import.meta.url), 'utf8')));

test('legendRows: k cortes viram k+1 classes mais a linha "sem dado", em pt-BR', () => {
  const rows = legendRows([100, 350, 750, 1000, 2000]);
  assert.deepEqual(rows.map((r) => r.label), ['até 100', '100 a 350', '350 a 750', '750 a 1.000', '1.000 a 2.000', 'mais de 2.000', 'sem dado']);
  assert.deepEqual(rows.map((r) => r.classIndex), [0, 1, 2, 3, 4, 5, null]);
  assert.equal(legendRows([75], { zeroIsAbsent: true }).at(-1).label, 'sem dado (inclui zero)');
  assert.deepEqual(legendRows([]), []);
  assert.deepEqual(legendRows(null), []);
  assert.ok(rows.every((r) => !('color' in r)), 'linha de legenda nunca carrega cor');
  const custom = legendRows([0.5, 1.5], { formatValue: (v) => v.toFixed(1) });
  assert.deepEqual(custom.map((r) => r.label), ['até 0.5', '0.5 a 1.5', 'mais de 1.5', 'sem dado']);
});

test('legendTitle traz métrica, unidade e período do dataset', () => {
  const layer = layerById('households_grid');
  const dataset = datasetById(manifest, 'households_grid');
  assert.equal(legendTitle(layer, metricFor(layer), dataset), 'Domicílios novos por km² (dom./km²) · 2010→2022');
  const jobs = layerById('jobs_hex');
  assert.equal(legendTitle(jobs, metricFor(jobs), datasetById(manifest, 'jobs_hex')), 'Empregos formais · total (empregos) · 2017→2019');
  assert.equal(legendTitle(null, null, null), '');
  assert.equal(legendTitle(layer, metricFor(layer), null), 'Domicílios novos por km² (dom./km²)');
});

test('lineLegendRows anexa peso e opacidade por classe — números, nunca cor', () => {
  const layer = layerById('road_centrality');
  const rows = lineLegendRows([50, 75, 90, 97], layer.line);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.slice(0, 5).map((r) => r.weight), layer.line.weight);
  assert.deepEqual(rows.slice(0, 5).map((r) => r.opacity), layer.line.opacity);
  assert.equal(rows[5].classIndex, null);
  assert.equal('weight' in rows[5], false);
  assert.equal(lineLegendRows([50], null).length, 3);
});

test('provenanceLine: fonte, coleta e versão do manifest; vazio sem dataset', () => {
  const dataset = datasetById(manifest, 'households_grid');
  const linha = provenanceLine(dataset);
  assert.match(linha, /^Fonte: IBGE — Grade Estatística, Censo Demográfico 2010; IBGE — Grade Estatística, Censo Demográfico 2022 · coletado em fixture · versão \d{4}-\d{2}-\d{2}$/);   // a versão é a data da regeneração do fixture, não um valor fixo
  assert.equal(provenanceLine(null), '');
  assert.equal(provenanceLine({ sources: [], version: null }), '');
});
