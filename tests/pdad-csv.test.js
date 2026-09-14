// Exportação CSV das telas de Diagnóstico Territorial (issue #102).
//
// Só `rowsToCsv` é testado aqui — `downloadCsv` toca o DOM (Blob, <a>, clique
// sintético) e este projeto verifica código que toca DOM por Playwright
// (tools/smoke-test.mjs), não por node:test, mesmo tratamento que src/app.js e
// src/pdad/charts.js já recebem.

import test from 'node:test';
import assert from 'node:assert/strict';
import { rowsToCsv } from '../src/pdad/csv.js';

test('rowsToCsv junta cabeçalho e linhas com CRLF, campos simples sem aspas', () => {
  const csv = rowsToCsv(['ra', 'valor'], [['RA_01', '52']]);
  assert.equal(csv, 'ra,valor\r\nRA_01,52');
});

test('rowsToCsv escapa campo com vírgula entre aspas', () => {
  const csv = rowsToCsv(['nome'], [['Água Quente, DF']]);
  assert.equal(csv, 'nome\r\n"Água Quente, DF"');
});

test('rowsToCsv duplica aspas internas (RFC 4180)', () => {
  const csv = rowsToCsv(['nota'], [['disse "sim"']]);
  assert.equal(csv, 'nota\r\n"disse ""sim"""');
});

test('rowsToCsv escapa campo com quebra de linha', () => {
  const csv = rowsToCsv(['nota'], [['linha 1\nlinha 2']]);
  assert.equal(csv, 'nota\r\n"linha 1\nlinha 2"');
});

test('rowsToCsv trata null/undefined como célula vazia, nunca a string "null"', () => {
  const csv = rowsToCsv(['a', 'b'], [[null, undefined]]);
  assert.equal(csv, 'a,b\r\n,');
});

test('rowsToCsv sem linhas devolve só o cabeçalho', () => {
  assert.equal(rowsToCsv(['a', 'b'], []), 'a,b');
});
