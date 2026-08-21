// Sandbox mínimo para executar optional-apps-script/Code.gs fora do Apps Script.
//
// Code.gs não é um módulo ES — é um arquivo com `var`/`function` de topo, pensado para
// rodar dentro do runtime do Apps Script, que injeta SpreadsheetApp, LockService,
// CacheService, PropertiesService, Session, ContentService e Logger como globais. Para
// testar a lógica de escrita sem esse runtime, criamos um `vm.Context` com mocks
// mínimos desses objetos, carregamos o arquivo real (não uma cópia) nesse contexto, e
// devolvemos o contexto: cada `function` de topo do Code.gs vira uma propriedade dele,
// exatamente como no runtime real.
//
// tests/contract.test.js já lê Code.gs como texto para checar schema; isto vai um
// passo além e executa o arquivo de verdade, para que um bug na lógica de escrita
// apareça no teste em vez de só numa chamada manual em produção.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

/** Uma planilha em memória: linhas como array de arrays, primeira linha é cabeçalho. */
export function createFakeSheet(name, rows) {
  const data = rows.map((row) => [...row]);

  const sheet = {
    getName: () => name,
    getLastRow: () => data.length,
    getLastColumn: () => (data[0] ? data[0].length : 0),
    getRange(row, col, numRows = 1, numCols = 1) {
      return createRange(data, row, col, numRows, numCols);
    },
    appendRow(row) {
      data.push([...row]);
    },
    deleteRow(rowNumber) {
      data.splice(rowNumber - 1, 1);
    },
    deleteRows(rowNumber, count) {
      data.splice(rowNumber - 1, count);
    },
    setFrozenRows() {},
    // Exposto só para asserção nos testes — não existe na API real do Apps Script.
    _rows: data,
  };
  return sheet;
}

function createRange(data, row, col, numRows, numCols) {
  return {
    getValue() {
      return data[row - 1][col - 1];
    },
    setValue(value) {
      data[row - 1][col - 1] = value;
    },
    getValues() {
      const out = [];
      for (let r = 0; r < numRows; r++) {
        out.push(data[row - 1 + r].slice(col - 1, col - 1 + numCols));
      }
      return out;
    },
    setValues(values) {
      for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
          data[row - 1 + r][col - 1 + c] = values[r][c];
        }
      }
    },
    getA1Notation: () => `R${row}C${col}`,
    getRow: () => row,
    getNumRows: () => numRows,
    getNumColumns: () => numCols,
    getSheet: () => { throw new Error('getSheet() não é usado pelos testes de escrita'); },
  };
}

/**
 * Cria o sandbox com Code.gs carregado. `sheets` é `{NOME: [[header...], [linha...]]}`.
 * `scriptProperties` é o estado inicial de PropertiesService.getScriptProperties().
 */
export function createAppsScriptSandbox({ sheets = {}, scriptProperties = {}, googleEmail = '' } = {}) {
  const fakeSheets = {};
  for (const [name, rows] of Object.entries(sheets)) {
    fakeSheets[name] = createFakeSheet(name, rows);
  }

  const properties = { ...scriptProperties };
  const cache = new Map();
  const contentOutputs = [];

  const book = {
    getSheetByName: (name) => fakeSheets[name] || null,
    insertSheet(name) {
      fakeSheets[name] = createFakeSheet(name, []);
      return fakeSheets[name];
    },
  };

  const context = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => book,
      getUi: () => { throw new Error('getUi() não é usado pelos testes de escrita'); },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => (key in properties ? properties[key] : null),
        setProperty: (key, value) => { properties[key] = value; },
      }),
    },
    LockService: {
      getDocumentLock: () => ({
        tryLock: () => true,
        releaseLock: () => {},
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get(key) {
          if (!cache.has(key)) return null;
          const entry = cache.get(key);
          if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
            cache.delete(key);
            return null;
          }
          return entry.value;
        },
        put(key, value, ttlSeconds) {
          const expiresAt = typeof ttlSeconds === 'number' ? Date.now() + ttlSeconds * 1000 : null;
          cache.set(key, { value, expiresAt });
        },
        remove(key) { cache.delete(key); },
        removeAll(keys) { keys.forEach((key) => cache.delete(key)); },
      }),
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => googleEmail || '' }),
    },
    Utilities: {
      // randomUUID() já é padrão no runtime do Node usado pelos testes; getUuid() do
      // Apps Script tem a mesma forma (RFC 4122 v4), então serve como substituto fiel.
      getUuid: () => randomUUID(),
    },
    ContentService: {
      MimeType: { JSON: 'JSON', JAVASCRIPT: 'JAVASCRIPT' },
      createTextOutput(text) {
        const output = {
          _text: text,
          _mimeType: null,
          setMimeType(mime) { output._mimeType = mime; return output; },
        };
        contentOutputs.push(output);
        return output;
      },
    },
    ScriptApp: {
      getProjectTriggers: () => [],
      newTrigger: () => { throw new Error('newTrigger() não é usado pelos testes de escrita'); },
    },
    Logger: { log: () => {} },
    console,
  };

  vm.createContext(context);
  const src = readFileSync(new URL('../../optional-apps-script/Code.gs', import.meta.url), 'utf8');
  vm.runInContext(src, context, { filename: 'Code.gs' });

  return { context, sheets: fakeSheets, properties, cache };
}

/** Devolve o payload JSON de uma resposta ContentService (as que doPost/doGet produzem). */
export function readJsonOutput(output) {
  return JSON.parse(output._text);
}
