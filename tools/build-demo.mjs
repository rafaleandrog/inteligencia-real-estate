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
import { deriveRow } from './derive.mjs';
import { createAppsScriptSandbox } from '../tests/helpers/appsScriptSandbox.mjs';

const MS_PER_DAY = 86400000;
const SHEET_EPOCH_MS = Date.UTC(1899, 11, 30);

/** Aba da planilha -> entidade consumida pela aplicação. */
const ENTITY_BY_SHEET = {
  LISTINGS: 'listings',
  DEVELOPMENTS: 'developments',
  ANCHORS: 'anchors',
};

// A semente é de antes do backend v2.0.0 e não tem nenhuma das colunas que o
// `setupProject()` provisiona (ver "Provisionamento pós-semente" em
// docs/DATA_CONTRACT.md). Sem completar as linhas, o demo exibiria os campos novos
// sempre ausentes e os filtros novos não seriam exercitados por ninguém.
//
// A lista de colunas vem do REQUIRED_HEADERS do Code.gs de verdade, executado no
// sandbox de vm — a mesma fonte que tests/contract.test.js usa. Assim o demo acompanha
// o contrato sozinho: uma coluna acrescentada ao backend aparece aqui na próxima
// geração, sem ninguém precisar lembrar de editar este arquivo.
const { context } = createAppsScriptSandbox({ sheets: {}, scriptProperties: {} });
const REQUIRED_HEADERS = context.REQUIRED_HEADERS;

/** Completa com '' toda coluna do contrato ausente na linha da semente. */
function fillContractColumns(sheet, row) {
  const headers = REQUIRED_HEADERS[sheet];
  if (!headers) return row;
  const out = { ...row };
  for (const header of headers) {
    if (!(header in out)) out[header] = '';
  }
  return out;
}

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
  payload[entity] = workbook[sheet].rows
    .map(convertDates)
    .map((row) => fillContractColumns(sheet, row))
    .map((row) => deriveRow(sheet, row));
}

if (missing.length > 0) {
  console.error(`erro: abas obrigatórias ausentes em ${source}: ${missing.join(', ')}`);
  process.exit(1);
}

// RA_PROFILES é opcional (issue #33/#34): ausente no .xlsx de origem vira lista
// vazia, não erro — mesmo tratamento que a aplicação já dá à aba na planilha real.
payload.ra_profiles = workbook.RA_PROFILES
  ? workbook.RA_PROFILES.rows.map(convertDates).map((row) => fillContractColumns('RA_PROFILES', row))
  : [];

// POLYGONS fica DELIBERADAMENTE vazia. Um polígono inventado é geografia falsa dentro
// de um artefato publicado — exatamente o que docs/DATA_CONTRACT.md passa três seções
// proibindo — e a semente não tem nenhum. O que precisa nunca quebrar é o caminho de
// render com a camada vazia, e é isso que o demo exercita. Os testes usam um fixture
// explicitamente sintético em tests/fixtures/polygons.json.
payload.polygons = [];

// IVV_MONTHLY é opcional (issue #56). A semente tem UMA linha, com os nomes do schema
// v1.0.0 e o IVV em ponto percentual — e é exatamente por isso que ela vale no demo: o
// caminho de tradução de alias e de conversão de escala do src/ivv/normalize-ivv.js sai
// exercitado por quem abre o modo de demonstração, avisos inclusive. Uma série inventada
// de 66 meses seria dado de mercado falso dentro de um artefato publicado.
payload.ivv_monthly = workbook.IVV_MONTHLY
  ? workbook.IVV_MONTHLY.rows.map(convertDates)
  : [];

// IVV_REGION (issue #87). A semente tem as 95 linhas reais — um mês, 19 regiões, 5 faixas —
// e elas entram no demo pelo mesmo motivo da IVV_MONTHLY: é dado publicado, e é o caminho
// que exercita a escala em PONTO percentual (12,5 = 12,5%), oposta à da série mensal, mais
// as linhas agregadas (`DF Total`, `TOTAL`) e as células vazias que viram frase.
payload.ivv_region = workbook.IVV_REGION
  ? workbook.IVV_REGION.rows.map(convertDates)
  : [];

// FIPEZAP_MONTHLY / FIPEZAP_LOCALITY_MONTHLY: preço de venda e locação por m² do FipeZap,
// DF inteiro (2011+) e por localidade/RA (2019+). Mesmo motivo de IVV_MONTHLY/IVV_REGION:
// é dado publicado — não um número inventado para o modo de demonstração — e exercita o
// mesmo caminho de normalização (`src/fipezap/normalize-fipezap.js`) que a planilha real.
payload.fipezap_monthly = workbook.FIPEZAP_MONTHLY
  ? workbook.FIPEZAP_MONTHLY.rows.map(convertDates)
  : [];
payload.fipezap_locality_monthly = workbook.FIPEZAP_LOCALITY_MONTHLY
  ? workbook.FIPEZAP_LOCALITY_MONTHLY.rows.map(convertDates)
  : [];

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);

for (const [sheet, entity] of Object.entries(ENTITY_BY_SHEET)) {
  console.log(`${sheet.padEnd(15)} -> ${String(entity).padEnd(14)} ${payload[entity].length} linhas`);
}
console.log(`RA_PROFILES     -> ra_profiles    ${payload.ra_profiles.length} linhas`);
console.log(`POLYGONS        -> polygons       ${payload.polygons.length} linhas (vazio por decisão — ver comentário)`);
console.log(`IVV_MONTHLY     -> ivv_monthly    ${payload.ivv_monthly.length} linhas`);
console.log(`IVV_REGION      -> ivv_region     ${payload.ivv_region.length} linhas`);
console.log(`FIPEZAP_MONTHLY -> fipezap_monthly ${payload.fipezap_monthly.length} linhas`);
console.log(`FIPEZAP_LOCALITY_MONTHLY -> fipezap_locality_monthly ${payload.fipezap_locality_monthly.length} linhas`);
console.log(`\n${target} gerado.`);
