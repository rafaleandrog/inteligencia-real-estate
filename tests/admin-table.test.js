import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRecords, sortRecords, paginateRecords } from '../src/admin/admin-table.js';

const FIELDS = [
  { key: 'title', label: 'Título' },
  { key: 'locality', label: 'Localidade' },
  { key: 'price', label: 'Preço' },
];

const RECORDS = [
  { title: 'Apartamento Asa Norte', locality: 'Asa Norte', price: 900000 },
  { title: 'Casa Lago Sul', locality: 'Lago Sul', price: 2500000 },
  { title: 'Kitnet Asa Sul', locality: 'Asa Sul', price: 300000 },
  { title: 'Cobertura Sudoeste', locality: 'Sudoeste', price: null },
];

// --- filterRecords -----------------------------------------------------------

test('filterRecords sem termo devolve tudo', () => {
  assert.equal(filterRecords(RECORDS, FIELDS, '').length, 4);
  assert.equal(filterRecords(RECORDS, FIELDS, '   ').length, 4);
});

test('filterRecords busca em qualquer campo visível, não só um', () => {
  const porTitulo = filterRecords(RECORDS, FIELDS, 'casa');
  assert.equal(porTitulo.length, 1);
  assert.equal(porTitulo[0].title, 'Casa Lago Sul');

  // "asa" aparece em title ou locality de três registros: Apartamento Asa Norte,
  // Casa Lago Sul (dentro de "Casa") e Kitnet Asa Sul.
  const porLocalidade = filterRecords(RECORDS, FIELDS, 'asa');
  assert.equal(porLocalidade.length, 3);
});

test('filterRecords é case-insensitive', () => {
  assert.equal(filterRecords(RECORDS, FIELDS, 'LAGO SUL').length, 1);
});

test('filterRecords tolera valor nulo em algum campo sem lançar', () => {
  assert.doesNotThrow(() => filterRecords(RECORDS, FIELDS, 'sudoeste'));
  assert.equal(filterRecords(RECORDS, FIELDS, 'sudoeste').length, 1);
});

// --- sortRecords ---------------------------------------------------------------

test('sortRecords ordena texto ascendente por padrão', () => {
  const sorted = sortRecords(RECORDS, 'title', 'asc');
  assert.deepEqual(sorted.map((r) => r.title), [
    'Apartamento Asa Norte', 'Casa Lago Sul', 'Cobertura Sudoeste', 'Kitnet Asa Sul',
  ]);
});

test('sortRecords ordena texto descendente', () => {
  const sorted = sortRecords(RECORDS, 'title', 'desc');
  assert.deepEqual(sorted.map((r) => r.title), [
    'Kitnet Asa Sul', 'Cobertura Sudoeste', 'Casa Lago Sul', 'Apartamento Asa Norte',
  ]);
});

test('sortRecords ordena número como número, não como texto', () => {
  const sorted = sortRecords(RECORDS.filter((r) => r.price !== null), 'price', 'asc');
  assert.deepEqual(sorted.map((r) => r.price), [300000, 900000, 2500000]);
});

test('sortRecords não muta o array original', () => {
  const before = RECORDS.map((r) => r.title);
  sortRecords(RECORDS, 'title', 'desc');
  assert.deepEqual(RECORDS.map((r) => r.title), before);
});

test('sortRecords sem campo devolve a lista como veio', () => {
  assert.deepEqual(sortRecords(RECORDS, null), RECORDS);
});

// --- paginateRecords -------------------------------------------------------------

test('paginateRecords corta em páginas do tamanho pedido', () => {
  const page1 = paginateRecords(RECORDS, 1, 2);
  assert.equal(page1.rows.length, 2);
  assert.equal(page1.page, 1);
  assert.equal(page1.totalPages, 2);
  assert.equal(page1.totalRecords, 4);

  const page2 = paginateRecords(RECORDS, 2, 2);
  assert.equal(page2.rows.length, 2);
  assert.equal(page2.rows[0].title, 'Kitnet Asa Sul');
});

test('paginateRecords volta para a última página válida quando a pedida não existe mais', () => {
  const result = paginateRecords(RECORDS, 99, 2);
  assert.equal(result.page, 2); // 4 registros / 2 por página = 2 páginas
  assert.equal(result.rows.length, 2);
});

test('paginateRecords com lista vazia devolve página 1 sem lançar', () => {
  const result = paginateRecords([], 1, 10);
  assert.equal(result.page, 1);
  assert.equal(result.totalPages, 1);
  assert.deepEqual(result.rows, []);
});

test('paginateRecords nunca devolve página menor que 1', () => {
  const result = paginateRecords(RECORDS, 0, 2);
  assert.equal(result.page, 1);
});
