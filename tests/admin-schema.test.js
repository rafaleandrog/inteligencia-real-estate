import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppsScriptSandbox } from './helpers/appsScriptSandbox.mjs';
import {
  ADMIN_SHEETS, ADMIN_FIELDS, ID_FIELD, ENUM_VALUES, DERIVED_PRICE_M2_FIELD, fieldKeys,
} from '../src/admin/admin-schema.js';

// src/admin/admin-schema.js é escrito à mão porque roda no navegador e não pode
// importar optional-apps-script/Code.gs — são runtimes diferentes. O risco de
// duplicação é real (o mesmo que motivou tests/contract.test.js para
// REQUIRED_HEADERS), então este teste executa o Code.gs real dentro do sandbox de vm
// (tests/helpers/appsScriptSandbox.mjs) e compara os dois lados campo a campo. Editar
// só um dos dois faz este teste falhar.

const { context } = createAppsScriptSandbox({
  sheets: {}, // não precisamos de dados de planilha, só das constantes de topo do script
  scriptProperties: {},
});

test('ADMIN_SHEETS cobre exatamente as abas com WRITE_ALLOWLIST em Code.gs', () => {
  assert.deepEqual([...ADMIN_SHEETS].sort(), Object.keys(context.WRITE_ALLOWLIST).sort());
});

test('ID_FIELD do frontend concorda com ID_FIELD do Apps Script', () => {
  for (const sheet of ADMIN_SHEETS) {
    assert.equal(ID_FIELD[sheet], context.ID_FIELD[sheet], sheet);
  }
});

test('fieldKeys() de cada aba é exatamente o WRITE_ALLOWLIST correspondente', () => {
  for (const sheet of ADMIN_SHEETS) {
    const declared = [...fieldKeys(sheet)].sort();
    const expected = [...context.WRITE_ALLOWLIST[sheet]].sort();
    assert.deepEqual(declared, expected, sheet);
  }
});

test('o tipo de cada campo concorda com FIELD_SCHEMA em Code.gs', () => {
  for (const sheet of ADMIN_SHEETS) {
    for (const field of ADMIN_FIELDS[sheet]) {
      const expected = context.FIELD_SCHEMA[sheet][field.key];
      assert.equal(field.type, expected, `${sheet}.${field.key}`);
    }
  }
});

test('required=true concorda exatamente com REQUIRED_FOR_CREATE em Code.gs', () => {
  for (const sheet of ADMIN_SHEETS) {
    const declaredRequired = ADMIN_FIELDS[sheet].filter((f) => f.required).map((f) => f.key).sort();
    const expected = [...context.REQUIRED_FOR_CREATE[sheet]].sort();
    assert.deepEqual(declaredRequired, expected, sheet);
  }
});

test('ENUM_VALUES do frontend concorda com ENUM_VALUES do Apps Script', () => {
  // JSON.parse/stringify normaliza os arrays vindos do sandbox de vm: são de um
  // realm diferente do deste teste, e assert.deepEqual trata array cross-realm como
  // "mesma estrutura, mas não idêntico" mesmo com conteúdo igual.
  assert.deepEqual(ENUM_VALUES, JSON.parse(JSON.stringify(context.ENUM_VALUES)));
});

test('DERIVED_PRICE_M2_FIELD concorda com o `target` de DERIVED_PRICE_M2_FIELD em Code.gs', () => {
  for (const [sheet, target] of Object.entries(DERIVED_PRICE_M2_FIELD)) {
    assert.equal(target, context.DERIVED_PRICE_M2_FIELD[sheet].target, sheet);
  }
  // ANCHORS não tem entrada — nem aqui, nem lá.
  assert.equal('ANCHORS' in DERIVED_PRICE_M2_FIELD, false);
  assert.equal('ANCHORS' in context.DERIVED_PRICE_M2_FIELD, false);
});

test('nenhum campo derivado aparece na lista de campos editáveis', () => {
  for (const [sheet, target] of Object.entries(DERIVED_PRICE_M2_FIELD)) {
    assert.equal(fieldKeys(sheet).includes(target), false, `${sheet}.${target}`);
  }
});

test('a chave primária de cada aba nunca aparece na lista de campos editáveis', () => {
  for (const sheet of ADMIN_SHEETS) {
    assert.equal(fieldKeys(sheet).includes(ID_FIELD[sheet]), false, sheet);
  }
});
