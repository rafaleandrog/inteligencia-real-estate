import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAppsScriptSandbox } from './helpers/appsScriptSandbox.mjs';
import { readXlsx } from '../tools/xlsx.mjs';
import { POST_SEED_COLUMNS, POST_SEED_SHEETS, REQUIRED_SHEETS } from './helpers/schema.mjs';

// Este é o teste que paga pela flexibilização feita em tests/contract.test.js.
//
// Até a v1.0.0, um erro de digitação em REQUIRED_HEADERS produzia um MISSING_HEADER
// barulhento, e o cruzamento contra a semente de migração pegava o erro. Na v2.0.0
// `ensureHeaders_()` PROVISIONA a coluna faltante — um `latitud` digitado errado vira
// uma coluna nova, vazia e silenciosa. A rede de proteção não podia ser removida, então
// foi movida para cá: em vez de comparar texto, este teste EXECUTA `setupProject()` de
// verdade no sandbox de vm, partindo dos cabeçalhos reais da semente, e afirma o que o
// provisionamento pode e não pode fazer.

const workbook = readXlsx(readFileSync(new URL('../migration/imob-intelligence-backend.xlsx', import.meta.url)));

/** Monta as abas do sandbox com exatamente os cabeçalhos e as linhas da semente. */
function seededSheets() {
  const sheets = {};
  for (const name of REQUIRED_SHEETS) {
    const { headers, rows } = workbook[name];
    sheets[name] = [[...headers], ...rows.map((row) => headers.map((header) => row[header] ?? ''))];
  }
  return sheets;
}

/**
 * Snapshot comparável de todas as abas.
 *
 * Uma linha gravada antes de `ensureHeaders_()` acrescentar colunas fica mais curta que
 * o cabeçalho: no Sheets real as células novas são '', no mock são buracos do array.
 * Comparar os arrays crus acusaria diferença entre `undefined` e `null` a cada
 * serialização — ruído do mock, não comportamento do Code.gs. Preencher com '' até o
 * comprimento do cabeçalho compara o que a planilha de verdade devolveria.
 */
// APP_META fica fora do snapshot: `refreshMeta()` reescreve `updated_at` a cada
// execução por definição — é um batimento de metadado, não dado do dataset. Incluí-la
// faria o teste de idempotência falhar sempre, pelo motivo errado. O que precisa ser
// idempotente é o dado e a versão do dataset, e as duas coisas são afirmadas abaixo.
const SNAPSHOT_EXCLUDED_SHEETS = ['APP_META'];

function snapshot(sandbox) {
  const out = {};
  for (const [name, sheet] of Object.entries(sandbox.sheets)) {
    if (SNAPSHOT_EXCLUDED_SHEETS.includes(name)) continue;
    const width = sheet._rows[0] ? sheet._rows[0].length : 0;
    out[name] = sheet._rows.map((row) => {
      const line = [];
      for (let i = 0; i < Math.max(width, row.length); i++) {
        line.push(row[i] === undefined ? '' : row[i]);
      }
      return line;
    });
  }
  return JSON.stringify(out);
}

function headersOf(sandbox, name) {
  const sheet = sandbox.sheets[name];
  if (!sheet) return null;
  return sheet._rows[0] ? [...sheet._rows[0]] : [];
}

test('setupProject() roda sobre a semente sem lançar', () => {
  const sandbox = createAppsScriptSandbox({ sheets: seededSheets(), scriptProperties: {} });
  assert.doesNotThrow(() => sandbox.context.setupProject());
});

test('setupProject() cria exatamente as colunas declaradas em POST_SEED_COLUMNS', () => {
  const sandbox = createAppsScriptSandbox({ sheets: seededSheets(), scriptProperties: {} });
  const before = Object.fromEntries(REQUIRED_SHEETS.map((name) => [name, headersOf(sandbox, name)]));
  sandbox.context.setupProject();

  for (const name of REQUIRED_SHEETS) {
    const added = headersOf(sandbox, name).filter((header) => !before[name].includes(header));
    assert.deepEqual(
      added.sort(),
      [...(POST_SEED_COLUMNS[name] || [])].sort(),
      `${name}: o provisionamento divergiu do delta declarado em POST_SEED_COLUMNS`,
    );
  }
});

// `applyCreate_`/`applyUpdate_` são indexados por POSIÇÃO de coluna. Se o
// provisionamento reordenasse cabeçalhos, toda linha existente passaria a ser lida
// deslocada — corrupção de dado silenciosa, pior que um erro.
test('setupProject() preserva toda coluna existente na posição original', () => {
  const sandbox = createAppsScriptSandbox({ sheets: seededSheets(), scriptProperties: {} });
  const before = Object.fromEntries(REQUIRED_SHEETS.map((name) => [name, headersOf(sandbox, name)]));
  sandbox.context.setupProject();

  for (const name of REQUIRED_SHEETS) {
    const after = headersOf(sandbox, name);
    assert.deepEqual(
      after.slice(0, before[name].length),
      before[name],
      `${name}: coluna existente mudou de posição`,
    );
  }
});

test('setupProject() preserva o dado das linhas da semente', () => {
  const sandbox = createAppsScriptSandbox({ sheets: seededSheets(), scriptProperties: {} });
  const rowsBefore = Object.fromEntries(
    REQUIRED_SHEETS.map((name) => [name, sandbox.sheets[name]._rows.length]),
  );
  const sample = [...sandbox.sheets.LISTINGS._rows[1]];
  sandbox.context.setupProject();

  for (const name of REQUIRED_SHEETS) {
    assert.equal(sandbox.sheets[name]._rows.length, rowsBefore[name], `${name}: número de linhas mudou`);
  }
  assert.deepEqual(
    sandbox.sheets.LISTINGS._rows[1].slice(0, sample.length),
    sample,
    'o conteúdo da primeira linha de LISTINGS foi alterado',
  );
});

test('setupProject() cria as abas gerenciadas declaradas em POST_SEED_SHEETS', () => {
  const sandbox = createAppsScriptSandbox({ sheets: seededSheets(), scriptProperties: {} });
  for (const name of POST_SEED_SHEETS) {
    assert.equal(sandbox.sheets[name], undefined, `${name} não devia existir antes`);
  }
  sandbox.context.setupProject();
  for (const name of POST_SEED_SHEETS) {
    assert.ok(sandbox.sheets[name], `${name} não foi criada`);
    assert.deepEqual(headersOf(sandbox, name), [...sandbox.context.REQUIRED_HEADERS[name]], name);
  }
});

// Rodar "Configurar projeto" duas vezes é o caso normal, não o excepcional: é o que o
// usuário faz depois de cada deploy. A segunda execução não pode mexer em nada.
test('setupProject() é idempotente na segunda execução', () => {
  const sandbox = createAppsScriptSandbox({ sheets: seededSheets(), scriptProperties: {} });
  sandbox.context.setupProject();

  const before = snapshot(sandbox);
  const versionAfterFirst = sandbox.properties.DATASET_VERSION;

  sandbox.context.setupProject();

  assert.equal(snapshot(sandbox), before, 'a segunda execução alterou alguma célula');
  assert.equal(
    sandbox.properties.DATASET_VERSION,
    versionAfterFirst,
    'a segunda execução subiu a versão do dataset sem ter mudado nada',
  );
});

// Se REQUIRED_HEADERS ganhar `latitud`, este teste é o único lugar do repo que percebe:
// o contrato não reclama mais (a coluna passa a ser provisionada) e a semente não é
// mais a verdade. A lista POST_SEED_COLUMNS é a declaração explícita do que é
// legítimo criar — qualquer coisa fora dela é digitação errada até prova em contrário.
test('nenhuma coluna é provisionada sem estar declarada — a rede não tem furo', () => {
  const sandbox = createAppsScriptSandbox({ sheets: seededSheets(), scriptProperties: {} });
  const before = Object.fromEntries(REQUIRED_SHEETS.map((name) => [name, headersOf(sandbox, name)]));
  sandbox.context.setupProject();

  const declared = new Set(Object.values(POST_SEED_COLUMNS).flat());
  for (const name of REQUIRED_SHEETS) {
    for (const header of headersOf(sandbox, name)) {
      if (before[name].includes(header)) continue;
      assert.ok(declared.has(header), `${name}.${header} foi criada sem estar em POST_SEED_COLUMNS`);
    }
  }
});
