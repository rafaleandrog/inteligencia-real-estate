// Integridade dos arquivos públicos (issue #149, R2.7/R2.8): o que o manifest promete existe,
// com os bytes, o sha256 e a contagem de feições que ele declara — para o diretório real
// (`data/public/`, vazio até a primeira execução do pipeline) e para a fixture do site.
//
// Em Node, de propósito: o validador Python roda na CI, mas quem publica a página é este
// repositório inteiro, e `npm test` é o que todo agente roda antes de dizer "pronto".

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

import { normalizeManifest, MANIFEST_SCHEMA_VERSION } from '../src/territorio/manifest.js';
import { TERRITORY_LAYERS } from '../src/territorio/layers.js';

const DIRS = {
  'data/public': fileURLToPath(new URL('../data/public/', import.meta.url)),
  'tests/fixtures/public': fileURLToPath(new URL('./fixtures/public/', import.meta.url)),
};

function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

/** A mesma fórmula de `outputs/manifest.py::content_hash`: sha256 de `path:sha256\n` em ordem de caminho. */
function contentHash(files) {
  const h = createHash('sha256');
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) h.update(`${f.path}:${f.sha256}\n`);
  return h.digest('hex');
}

function featureCount(payload) {
  if (payload && payload.type === 'FeatureCollection') return payload.features.length;
  if (payload && Array.isArray(payload.rows)) return payload.rows.length;
  return null;
}

for (const [label, root] of Object.entries(DIRS)) {
  test(`${label}: todo arquivo do manifest existe com bytes, sha256, feições e content_hash iguais aos declarados`, () => {
    const manifestPath = join(root, 'manifest.json');
    assert.ok(existsSync(manifestPath), `${label}/manifest.json precisa existir — sem ele o site registra um 404 a cada abertura`);
    const raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.equal(raw.manifest_version, MANIFEST_SCHEMA_VERSION);
    const { manifest, warnings } = normalizeManifest(raw);
    assert.deepEqual(warnings, []);
    assert.ok(manifest);
    for (const dataset of manifest.datasets) {
      for (const file of dataset.files) {
        const full = join(root, file.path);
        assert.ok(existsSync(full), `${label}: ${file.path} listado e ausente`);
        const bytes = readFileSync(full);
        assert.equal(bytes.byteLength, file.bytes, `${file.path}: bytes`);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `${file.path}: sha256`);
        assert.ok(bytes.byteLength <= file.budgetBytes, `${file.path}: acima do orçamento`);
        const text = bytes.toString('utf8');
        assert.ok(!/\bNaN\b|\bInfinity\b/.test(text), `${file.path}: NaN/Infinity no JSON`);
        assert.equal(featureCount(JSON.parse(text)), file.features, `${file.path}: feições`);
      }
      assert.equal(contentHash(dataset.files), dataset.contentHash, `${dataset.id}: content_hash`);
    }
  });

  test(`${label}: nenhum arquivo solto fora do manifest (além de README, manifest e schemas)`, () => {
    const raw = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
    const listed = new Set(raw.datasets.flatMap((d) => d.files.map((f) => f.path)));
    const soltos = [];
    for (const full of walk(root)) {
      const rel = relative(root, full).split('\\').join('/');
      if (rel === 'README.md' || rel === 'manifest.json' || rel.startsWith('schemas/')) continue;
      if (!listed.has(rel)) soltos.push(rel);
    }
    assert.deepEqual(soltos, [], `${label}: arquivos que o manifest não lista`);
  });
}

test('a fixture do site cobre todo conjunto que as camadas e os agregados leem', () => {
  const raw = JSON.parse(readFileSync(join(DIRS['tests/fixtures/public'], 'manifest.json'), 'utf8'));
  const ids = new Set(raw.datasets.map((d) => d.id));
  for (const layer of TERRITORY_LAYERS) assert.ok(ids.has(layer.datasetId), `fixture sem ${layer.datasetId}`);
  for (const id of ['ra_crosswalk', 'ra_aggregates']) assert.ok(ids.has(id), `fixture sem ${id}`);
});

test('data/public/manifest.json é vazio ou real — nunca a fixture copiada', () => {
  const real = JSON.parse(readFileSync(join(DIRS['data/public'], 'manifest.json'), 'utf8'));
  const fixture = JSON.parse(readFileSync(join(DIRS['tests/fixtures/public'], 'manifest.json'), 'utf8'));
  assert.notEqual(real.config_sha256, fixture.config_sha256, 'o config da fixture nunca gera o diretório real');
  for (const dataset of real.datasets) {
    const fx = fixture.datasets.find((d) => d.id === dataset.id);
    if (fx) assert.notEqual(dataset.content_hash, fx.content_hash, `${dataset.id}: conteúdo de fixture em data/public`);
  }
});
