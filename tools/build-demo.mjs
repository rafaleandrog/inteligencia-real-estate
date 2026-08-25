#!/usr/bin/env node
// Gera data/demo.json a partir da semente de migração.
//
//   node tools/build-demo.mjs [migration/imob-intelligence-backend.xlsx] [data/demo.json]
//
// O demo precisa ter exatamente o mesmo formato que a Google Sheet devolve, para que
// "funciona em demo" signifique alguma coisa sobre produção. Por isso a origem é o
// .xlsx de migração — que é o conteúdo canônico da planilha — e não o HTML de
// referência, cuja estrutura interna não é o contrato da planilha em produção.
//
// As linhas saem cruas, sem normalizar: normalizar é trabalho de src/normalize.js, e
// o demo tem que exercitar esse caminho igual à planilha real.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { readXlsx } from './xlsx.mjs';

const MS_PER_DAY = 86400000;
const SHEET_EPOCH_MS = Date.UTC(1899, 11, 30);

/** Aba da planilha -> entidade consumida pela aplicação. */
const ENTITY_BY_SHEET = {
  LISTINGS: 'listings',
  DEVELOPMENTS: 'developments',
  ANCHORS: 'anchors',
};

/**
 * Serial de data do Excel para ISO.
 *
 * O .xlsx guarda data como número de dias desde 1899-12-30. Ao importar na Google
 * Sheet isso vira data de verdade, e o GViz devolve `Date(2026,7,18)`. Converter aqui
 * mantém o demo.json legível e coerente com o que a planilha entrega.
 */
function serialToISO(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 20000 || n >= 80000) return null;
  return new Date(SHEET_EPOCH_MS + Math.floor(n) * MS_PER_DAY).toISOString().slice(0, 10);
}

// Campos de data. `expected_delivery` nao termina em _at mas guarda serial de
// planilha igual aos outros — deixa-lo de fora fazia o painel exibir "46569".
const DATE_FIELDS = new Set(['reference_month', 'expected_delivery']);
const isDateField = (field) => /_at$/.test(field) || DATE_FIELDS.has(field);

function convertDates(row) {
  const out = {};
  for (const [field, value] of Object.entries(row)) {
    out[field] = isDateField(field) ? (serialToISO(value) ?? value) : value;
  }
  return out;
}

const source = process.argv[2] || 'migration/imob-intelligence-backend.xlsx';
const target = process.argv[3] || 'data/demo.json';

const workbook = readXlsx(readFileSync(source));

const payload = {
  meta: {
    generated_from: source,
    generated_at: new Date().toISOString().slice(0, 10),
    note:
      'Dataset de DEMONSTRAÇÃO. Não é produção. A fonte de verdade é a Google Sheet — ' +
      'ver docs/ARCHITECTURE.md. Regerar com: node tools/build-demo.mjs',
  },
};

const missing = [];
for (const [sheet, entity] of Object.entries(ENTITY_BY_SHEET)) {
  if (!workbook[sheet]) { missing.push(sheet); payload[entity] = []; continue; }
  payload[entity] = workbook[sheet].rows.map(convertDates);
}

if (missing.length > 0) {
  console.error(`erro: abas obrigatórias ausentes em ${source}: ${missing.join(', ')}`);
  process.exit(1);
}

// RA_PROFILES é opcional (issue #33/#34): ausente no .xlsx de origem vira lista
// vazia, não erro — mesmo tratamento que a aplicação já dá à aba na planilha real.
payload.ra_profiles = workbook.RA_PROFILES ? workbook.RA_PROFILES.rows.map(convertDates) : [];

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);

for (const [sheet, entity] of Object.entries(ENTITY_BY_SHEET)) {
  console.log(`${sheet.padEnd(15)} -> ${String(entity).padEnd(14)} ${payload[entity].length} linhas`);
}
console.log(`RA_PROFILES     -> ra_profiles    ${payload.ra_profiles.length} linhas`);
console.log(`\n${target} gerado.`);
