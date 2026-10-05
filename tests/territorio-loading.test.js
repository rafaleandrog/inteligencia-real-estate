// Carga dos arquivos públicos (issue #149, R2.7): o manifest é da mesma origem e independe da
// estratégia; toda falha vira aviso com motivo; a camada só é entregue se bytes e sha256
// conferem com o manifest; `fetchRef` injetado — nenhum teste aqui mexe em `globalThis.fetch`
// para o manifest.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import {
  publicFileUrl, fetchPublicManifest, fetchPublicLayer, clearPublicLayerCache, EMPTY_PUBLIC_DATA, loadDataset,
} from '../src/data.js';
import { normalizeManifest, datasetById } from '../src/territorio/manifest.js';

const FIXTURE_DIR = new URL('./fixtures/public/', import.meta.url);
const RAW_MANIFEST = JSON.parse(readFileSync(new URL('manifest.json', FIXTURE_DIR), 'utf8'));
const BASE = './tests/fixtures/public/';

/** Um `fetch` falso que serve o diretório de fixture e registra as URLs pedidas. */
function fixtureFetch({ status = 200, body = null, throwWith = null } = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    if (throwWith) throw throwWith;
    const rel = String(url).replace(BASE, '').replace(/\?.*$/, '');
    const bytes = body !== null ? Buffer.from(body) : readFileSync(new URL(rel, FIXTURE_DIR));
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => JSON.parse(bytes.toString('utf8')),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  };
  fn.calls = calls;
  return fn;
}

test('publicFileUrl só monta caminho relativo da mesma origem', () => {
  assert.equal(publicFileUrl('./data/public/', 'manifest.json'), './data/public/manifest.json');
  assert.equal(publicFileUrl('./data/public', 'a/b.json'), './data/public/a/b.json');
  assert.equal(publicFileUrl('./data/public/', '../fora.json'), null);
  assert.equal(publicFileUrl('./data/public/', '/abs.json'), null);
  assert.equal(publicFileUrl('./data/public/', 'https://outra.origem/x.json'), null);
  assert.equal(publicFileUrl('./data/public/', 'a//b.json'), null);
  // Base absoluta fora do navegador: não há `location` para comparar a origem → recusa.
  assert.equal(publicFileUrl('https://outra.origem/data/', 'manifest.json'), null);
  assert.equal(publicFileUrl('', 'manifest.json'), null);
  assert.equal(publicFileUrl('./data/public/', ''), null);
});

test('sem publicDataUrl o manifest não é pedido e o resultado é o vazio declarado', async () => {
  const fetchRef = fixtureFetch();
  const out = await fetchPublicManifest({}, { fetchRef });
  assert.deepEqual(out, { ...EMPTY_PUBLIC_DATA });
  assert.equal(fetchRef.calls.length, 0);
  assert.equal(EMPTY_PUBLIC_DATA.available, false);
  assert.ok(Object.isFrozen(EMPTY_PUBLIC_DATA));
});

test('o manifest de fixture carrega pela mesma origem com cache por conteúdo desligado', async () => {
  const fetchRef = fixtureFetch();
  const out = await fetchPublicManifest({ publicDataUrl: BASE, publicManifestFile: 'manifest.json' }, { fetchRef });
  assert.equal(out.available, true);
  assert.equal(out.reason, null);
  assert.equal(out.baseUrl, BASE);
  assert.deepEqual(out.warnings, []);
  assert.equal(out.manifest.datasets.length, 5);
  assert.deepEqual(fetchRef.calls, [`${BASE}manifest.json`]);
});

test('404, HTTP 500, rede, timeout, JSON inválido e versão desconhecida viram aviso com motivo — nunca lançam', async () => {
  const config = { publicDataUrl: BASE };
  const casos = [
    [fixtureFetch({ status: 404, body: '' }), /ainda não publicado/],
    [fixtureFetch({ status: 500, body: '' }), /HTTP 500/],
    [fixtureFetch({ throwWith: new TypeError('Failed to fetch') }), /inacessível/],
    [fixtureFetch({ throwWith: Object.assign(new Error('aborted'), { name: 'AbortError' }) }), /demorou/],
    [fixtureFetch({ body: '{nao e json' }), /inacessível/],
    [fixtureFetch({ body: JSON.stringify({ manifest_version: 7, datasets: [] }) }), /inválido/],
  ];
  for (const [fetchRef, esperado] of casos) {
    const out = await fetchPublicManifest(config, { fetchRef });
    assert.equal(out.available, false);
    assert.match(out.reason, esperado);
    assert.equal(out.manifest, null);
    assert.ok(out.warnings.length >= 1, 'todo motivo vira aviso');
    // O aviso nomeia a origem: o do carregador diz "Arquivos públicos", o do normalizador
    // diz "Território" — os dois apontam para data/public.
    assert.match(out.warnings[0], /\(data\/public\)/);
  }
  // Base que escapa da mesma origem: aviso, sem requisição.
  const fora = fixtureFetch();
  const out = await fetchPublicManifest({ publicDataUrl: 'https://outra.origem/x/' }, { fetchRef: fora });
  assert.equal(out.available, false);
  assert.match(out.reason, /mesma origem/);
  assert.equal(fora.calls.length, 0);
});

test('manifest publicado com datasets vazio é o estado antes da primeira execução: indisponível, sem aviso', async () => {
  const vazio = JSON.parse(readFileSync(new URL('../data/public/manifest.json', import.meta.url), 'utf8'));
  const fetchRef = fixtureFetch({ body: JSON.stringify(vazio) });
  const out = await fetchPublicManifest({ publicDataUrl: BASE }, { fetchRef });
  assert.equal(out.available, false);
  assert.match(out.reason, /sem nenhum conjunto/);
  assert.ok(out.manifest, 'o manifest em si é válido');
  assert.deepEqual(out.warnings, [], 'estado esperado não é aviso técnico');
});

test('fetchPublicLayer entrega o arquivo só com bytes e sha256 iguais aos do manifest, e memoiza', async () => {
  clearPublicLayerCache();
  const { manifest } = normalizeManifest(RAW_MANIFEST);
  const dataset = datasetById(manifest, 'ra_crosswalk');
  const file = dataset.files[0];
  const fetchRef = fixtureFetch();
  const out = await fetchPublicLayer({ baseUrl: BASE, dataset, file }, { fetchRef });
  assert.equal(out.payload.rows.length, 2);
  assert.equal(out.integrity, 'sha256 conferido');
  assert.equal(out.bytes, file.bytes);
  assert.equal(fetchRef.calls.length, 1);
  assert.match(fetchRef.calls[0], new RegExp(`ra_crosswalk\\.json\\?v=${file.sha256.slice(0, 12)}$`));
  const again = await fetchPublicLayer({ baseUrl: BASE, dataset, file }, { fetchRef });
  assert.equal(again, out, 'mesma promessa resolvida — sem segunda requisição');
  assert.equal(fetchRef.calls.length, 1);
  clearPublicLayerCache();
});

test('arquivo que não confere com o manifest é recusado — e a recusa não fica memoizada', async () => {
  clearPublicLayerCache();
  const { manifest } = normalizeManifest(RAW_MANIFEST);
  const dataset = datasetById(manifest, 'ra_crosswalk');
  const file = dataset.files[0];

  const tamanhoErrado = { ...file, bytes: file.bytes + 1 };
  await assert.rejects(fetchPublicLayer({ baseUrl: BASE, dataset, file: tamanhoErrado }, { fetchRef: fixtureFetch() }), /não confere com o manifest/);

  const shaErrado = { ...file, sha256: 'a'.repeat(64) };
  await assert.rejects(fetchPublicLayer({ baseUrl: BASE, dataset, file: shaErrado }, { fetchRef: fixtureFetch() }), /sha256 diferente/);

  const naoEncontrado = fixtureFetch({ status: 404, body: '' });
  await assert.rejects(fetchPublicLayer({ baseUrl: BASE, dataset, file }, { fetchRef: naoEncontrado }), /HTTP 404/);
  // Depois da falha, a próxima chamada tenta de novo (nada ficou no cache).
  const certo = fixtureFetch();
  const out = await fetchPublicLayer({ baseUrl: BASE, dataset, file }, { fetchRef: certo });
  assert.equal(certo.calls.length, 1);
  assert.equal(out.payload.rows.length, 2);

  await assert.rejects(fetchPublicLayer({ baseUrl: BASE, dataset, file: { ...file, path: '../x.json' } }, { fetchRef: certo }), /recusado/);
  await assert.rejects(fetchPublicLayer({ baseUrl: BASE }, { fetchRef: certo }), /obrigatórios/);
  clearPublicLayerCache();
});

test('o sha256 conferido é o mesmo que o pipeline publicou (prova de que a conferência é real)', () => {
  const { manifest } = normalizeManifest(RAW_MANIFEST);
  for (const dataset of manifest.datasets) {
    for (const file of dataset.files) {
      const bytes = readFileSync(new URL(file.path, FIXTURE_DIR));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `${file.path}`);
      assert.equal(bytes.byteLength, file.bytes, `${file.path}`);
    }
  }
});

test('loadDataset devolve publicData nos dois caminhos e não pede o manifest sem publicDataUrl', async () => {
  const demo = {
    listings: [{ listing_id: 'A' }],
    developments: [{ development_id: 'B' }],
    anchors: [{ place_id: 'C' }],
  };
  const original = globalThis.fetch;
  const demoCalls = [];
  globalThis.fetch = async (url) => {
    demoCalls.push(String(url));
    return { ok: true, json: async () => demo };
  };
  const config = {
    demoMode: true,
    demoUrl: 'inline',
    sheets: { listings: 'LISTINGS', developments: 'DEVELOPMENTS', anchors: 'ANCHORS' },
  };
  try {
    const semPublico = await loadDataset(config);
    assert.equal(semPublico.ok, true);
    assert.deepEqual(semPublico.publicData, { ...EMPTY_PUBLIC_DATA });
    assert.equal(demoCalls.length, 1, 'só o demo foi buscado');

    const fetchRef = fixtureFetch();
    const comPublico = await loadDataset({ ...config, publicDataUrl: BASE }, { fetchRef });
    assert.equal(comPublico.ok, true);
    assert.equal(comPublico.publicData.available, true);
    assert.equal(comPublico.publicData.manifest.datasets.length, 5);
    assert.deepEqual(fetchRef.calls, [`${BASE}manifest.json`]);

    // Manifest indisponível é aviso no resultado — nunca erro, nunca `ok: false`.
    const quebrado = await loadDataset({ ...config, publicDataUrl: BASE }, { fetchRef: fixtureFetch({ status: 404, body: '' }) });
    assert.equal(quebrado.ok, true);
    assert.equal(quebrado.publicData.available, false);
    assert.ok(quebrado.warnings.some((w) => /ainda não publicado/.test(w)));
    assert.deepEqual(quebrado.errors, []);

    // Caminho fatal da estratégia: o resultado continua carregando `publicData`.
    globalThis.fetch = async () => { throw new Error('rede caiu'); };
    const fatal = await loadDataset({ ...config, publicDataUrl: BASE }, { fetchRef: fixtureFetch() });
    assert.equal(fatal.ok, false);
    assert.equal(fatal.publicData.available, true, 'o manifest veio por outro caminho e não se perde');
  } finally {
    globalThis.fetch = original;
  }
});
