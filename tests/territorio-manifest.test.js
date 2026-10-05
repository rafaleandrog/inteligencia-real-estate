// Normalização do manifest de data/public (issue #149): dataset inválido é descartado com
// aviso nomeado, nunca derruba a carga; manifest de versão desconhecida vira nulo com motivo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  normalizeManifest, datasetById, filesFor, fileFor, safeRelativePath, formatBytes,
  MANIFEST_SCHEMA_VERSION, FILE_ROLES,
} from '../src/territorio/manifest.js';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/public/manifest.json', import.meta.url), 'utf8'));

const clone = () => JSON.parse(JSON.stringify(FIXTURE));

test('o manifest de fixture normaliza inteiro, sem aviso, com os cinco conjuntos em ordem', () => {
  const { manifest, warnings } = normalizeManifest(FIXTURE);
  assert.deepEqual(warnings, []);
  assert.ok(manifest);
  assert.equal(manifest.schemaVersion, MANIFEST_SCHEMA_VERSION);
  assert.deepEqual(manifest.datasets.map((d) => d.id), ['households_grid', 'jobs_hex', 'ra_aggregates', 'ra_crosswalk', 'road_centrality']);
  assert.match(manifest.pipelineCommit, /^[0-9a-f]{7,40}$/);
  assert.match(manifest.configSha256, /^[0-9a-f]{64}$/);
  const hh = datasetById(manifest, 'households_grid');
  assert.equal(hh.files.length, 4);
  assert.deepEqual(hh.years, [2010, 2022]);
  assert.equal(hh.classBreaks.households_delta_per_km2.classes, 6);
  assert.deepEqual(hh.classBreaks.households_delta_per_km2.breaks, [100, 350, 750, 1000, 2000]);
  assert.equal(hh.classBreaks.households_delta_per_km2.zeroIsAbsent, false);
  assert.equal(hh.sources.length, 2);
  assert.match(hh.sources[0].url, /^https:\/\//);
  assert.equal(datasetById(manifest, 'nao_existe'), null);
});

test('filesFor filtra por papel e por caixa; fileFor devolve o primeiro', () => {
  const { manifest } = normalizeManifest(FIXTURE);
  const hh = datasetById(manifest, 'households_grid');
  assert.equal(filesFor(hh, { role: 'detail_shard' }).length, 3);
  assert.equal(filesFor(hh, { role: 'overview' }).length, 1);
  assert.equal(fileFor(hh, { role: 'overview' }).path, 'households_grid/overview_1km.json');
  // Só o shard de RA_11 cruza esta caixa (a RA_19 fica ao sul).
  const soRa11 = filesFor(hh, { role: 'detail_shard', bbox: [-47.94, -15.794, -47.936, -15.79] });
  assert.deepEqual(soRa11.map((f) => f.shardValue), ['RA_11']);
  assert.equal(filesFor(null).length, 0);
  assert.equal(fileFor(hh, { role: 'data' }), null);
});

test('manifest que não é objeto, de versão desconhecida ou sem datasets vira nulo com motivo', () => {
  assert.equal(normalizeManifest(null).manifest, null);
  assert.equal(normalizeManifest([]).manifest, null);
  const versao = normalizeManifest({ manifest_version: 2, datasets: [] });
  assert.equal(versao.manifest, null);
  assert.match(versao.warnings[0], /manifest_version 2/);
  const semLista = normalizeManifest({ manifest_version: 1 });
  assert.equal(semLista.manifest, null);
  assert.match(semLista.warnings[0], /datasets/);
  // Lista vazia é manifest VÁLIDO — é o estado antes da primeira execução do pipeline.
  const vazio = normalizeManifest({ manifest_version: 1, datasets: [] });
  assert.ok(vazio.manifest);
  assert.deepEqual(vazio.manifest.datasets, []);
});

test('dataset com caminho fora do diretório, sha inválido ou arquivo repetido é descartado com aviso nomeado', () => {
  const raw = clone();
  raw.datasets[0].files[0].path = '../fora.json';
  let out = normalizeManifest(raw);
  assert.ok(!out.manifest.datasets.some((d) => d.id === 'households_grid'));
  assert.ok(out.warnings.some((w) => /households_grid/.test(w) && /caminho inválido/.test(w)), out.warnings.join('\n'));

  const raw2 = clone();
  raw2.datasets[1].files[0].sha256 = 'xyz';
  out = normalizeManifest(raw2);
  assert.ok(!out.manifest.datasets.some((d) => d.id === 'jobs_hex'));
  assert.ok(out.warnings.some((w) => /jobs_hex/.test(w) && /sha256/.test(w)));

  const raw3 = clone();
  raw3.datasets[4].files.push({ ...raw3.datasets[4].files[0] });
  out = normalizeManifest(raw3);
  assert.ok(!out.manifest.datasets.some((d) => d.id === 'road_centrality'));
  assert.ok(out.warnings.some((w) => /duas vezes/.test(w)));

  const raw4 = clone();
  raw4.datasets.push(JSON.parse(JSON.stringify(raw4.datasets[2])));
  out = normalizeManifest(raw4);
  assert.equal(out.manifest.datasets.filter((d) => d.id === 'ra_aggregates').length, 1);
  assert.ok(out.warnings.some((w) => /repetido/.test(w)));

  const raw5 = clone();
  raw5.datasets[0].id = 'Nope-Id';
  out = normalizeManifest(raw5);
  assert.equal(out.manifest.datasets.length, 4);
  assert.ok(out.warnings.some((w) => /id inválido/.test(w)));
});

test('cortes não crescentes tiram só a métrica, e URL de fonte fora de http(s) sai sem link', () => {
  const raw = clone();
  raw.datasets[0].class_breaks.households_delta.breaks = [10, 5];
  raw.datasets[0].sources[0].url = 'javascript:alert(1)';
  const { manifest, warnings } = normalizeManifest(raw);
  const hh = datasetById(manifest, 'households_grid');
  assert.ok(hh, 'dataset continua');
  assert.equal(hh.classBreaks.households_delta, undefined);
  assert.ok(hh.classBreaks.households_delta_per_km2);
  assert.equal(hh.sources[0].url, null);
  assert.ok(warnings.some((w) => /households_delta/.test(w) && /não crescentes/.test(w)));
  assert.ok(warnings.some((w) => /URL inválida/.test(w)));
});

test('safeRelativePath aceita só caminho relativo .json sem escapes', () => {
  assert.equal(safeRelativePath('households_grid/overview_1km.json'), 'households_grid/overview_1km.json');
  assert.equal(safeRelativePath('../x.json'), null);
  assert.equal(safeRelativePath('a/../x.json'), null);
  assert.equal(safeRelativePath('/abs.json'), null);
  assert.equal(safeRelativePath('https://x/y.json'), null);
  assert.equal(safeRelativePath('a//b.json'), null);
  assert.equal(safeRelativePath('semextensao'), null);
  assert.equal(safeRelativePath(''), null);
});

test('formatBytes em pt-BR; FILE_ROLES é o vocabulário fechado do contrato', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1234), '1 kB');
  assert.equal(formatBytes(1480233), '1,5 MB');
  assert.equal(formatBytes(null), '—');
  assert.deepEqual([...FILE_ROLES], ['overview', 'detail', 'detail_shard', 'data']);
});
