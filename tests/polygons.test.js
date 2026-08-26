import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePolygon, normalizePolygons, toJsonObject, NORMALIZERS } from '../src/normalize.js';

// POLYGONS é a única aba cujo conteúdo vem de arquivo de terceiro (KML/KMZ importado no
// Drive), então é a que tem mais chance de trazer dado malformado. R2.6 diz que um
// registro ruim nunca pode derrubar o carregamento — estes testes cobram isso com um
// fixture que inclui, de propósito, JSON quebrado nos dois campos e linha sem id.

const fixture = JSON.parse(readFileSync(new URL('./fixtures/polygons.json', import.meta.url), 'utf8'));
const byId = (rows, id) => rows.find((row) => row.id === id);

test('normalizePolygons() descarta linha sem polygon_id e mantém o resto', () => {
  const rows = normalizePolygons(fixture.rows);
  assert.equal(rows.length, 3, 'a linha sem id tinha que sair');
  assert.equal(rows.some((row) => !row.id), false);
});

test('normalizePolygon() não parseia geometry_geojson — o texto passa cru', () => {
  const rows = normalizePolygons(fixture.rows);
  const ok = byId(rows, 'fixture-quadrado-ok');
  assert.equal(typeof ok.geometry_geojson, 'string');
  assert.match(ok.geometry_geojson, /^\{"type":"Polygon"/);
});

// Parsear aqui transformaria um blob malformado em exceção no meio do carregamento de
// TODAS as camadas. O parse acontece no render, por registro, isolado.
test('geometry_geojson malformado atravessa como texto, sem lançar', () => {
  assert.doesNotThrow(() => normalizePolygons(fixture.rows));
  const quebrado = byId(normalizePolygons(fixture.rows), 'fixture-geometria-quebrada');
  assert.equal(typeof quebrado.geometry_geojson, 'string');
});

test('properties_json válido vira objeto; malformado vira null, nunca exceção', () => {
  const rows = normalizePolygons(fixture.rows);
  assert.deepEqual(byId(rows, 'fixture-quadrado-ok').properties, { populacao: 1234, renda_per_capita: 5678.9 });
  assert.equal(byId(rows, 'fixture-properties-quebrado').properties, null);
  assert.equal(byId(rows, 'fixture-geometria-quebrada').properties, null, 'vazio também é null');
});

test('toJsonObject() devolve null para tudo que não seja objeto JSON', () => {
  assert.deepEqual(toJsonObject('{"a":1}'), { a: 1 });
  for (const input of ['', '   ', null, undefined, 'texto', '[1,2]', '42', '"str"', 'null', '{quebrado']) {
    assert.equal(toJsonObject(input), null, JSON.stringify(input));
  }
});

// `kind` é o que faz um registro ser plotado como marcador no mapa. Polígono não é
// marcador: se ganhasse `kind`, apareceria como pino no centro do próprio polígono.
test('polígono não tem `kind` e não entra em NORMALIZERS', () => {
  const [first] = normalizePolygons(fixture.rows);
  assert.equal('kind' in first, false);
  assert.equal('POLYGONS' in NORMALIZERS, false);
});

test('status inactive é preservado — filtrar é decisão da camada de render', () => {
  const rows = normalizePolygons(fixture.rows);
  assert.equal(byId(rows, 'fixture-geometria-quebrada').status, 'inactive');
  assert.equal(byId(rows, 'fixture-quadrado-ok').status, 'active');
});

test('normalizePolygons() aguenta entrada não-array sem lançar', () => {
  for (const input of [null, undefined, '', 42, {}]) {
    assert.deepEqual(normalizePolygons(input), [], JSON.stringify(input));
  }
});
