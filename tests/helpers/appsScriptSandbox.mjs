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
import { randomUUID, createHash } from 'node:crypto';

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

/**
 * O Sheets real estende a grade sozinho: escrever em A1 de uma aba recém-criada por
 * `insertSheet()` funciona, mesmo que a aba não tenha linha nenhuma. O mock guarda as
 * linhas num array, então precisa crescer explicitamente — sem isto, `ensureHeaders_()`
 * numa aba nova (o caminho de `setupProject()` criando RA_PROFILES e POLYGONS) morre
 * com "Cannot set properties of undefined", que é bug do mock, não do Code.gs.
 */
function ensureRow(data, index) {
  while (data.length <= index) data.push([]);
  return data[index];
}

function createRange(data, row, col, numRows, numCols) {
  return {
    getValue() {
      const cell = data[row - 1][col - 1];
      return cell === undefined ? '' : cell;
    },
    setValue(value) {
      ensureRow(data, row - 1)[col - 1] = value;
    },
    getValues() {
      const out = [];
      for (let r = 0; r < numRows; r++) {
        const source = data[row - 1 + r] || [];
        const line = [];
        // O Sheets real devolve célula vazia como '', nunca uma linha curta. Uma linha
        // de dado gravada antes de `ensureHeaders_()` acrescentar colunas é justamente
        // esse caso, e um `undefined` aqui viraria bug só no teste.
        for (let c = 0; c < numCols; c++) {
          const cell = source[col - 1 + c];
          line.push(cell === undefined ? '' : cell);
        }
        out.push(line);
      }
      return out;
    },
    setValues(values) {
      for (let r = 0; r < numRows; r++) {
        const line = ensureRow(data, row - 1 + r);
        for (let c = 0; c < numCols; c++) {
          line[col - 1 + c] = values[r][c];
        }
      }
    },
    clearContent() {
      for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
          if (data[row - 1 + r]) data[row - 1 + r][col - 1 + c] = '';
        }
      }
      return this;
    },
    // Formatação não muda valor, e nenhum teste afirma nada sobre ela — mas o Code.gs
    // chama estes três, então precisam existir para não virar exceção disfarçada de
    // INTERNAL_ERROR na resposta da API.
    setNumberFormat() { return this; },
    setFontWeight() { return this; },
    copyFormatToRange() { return this; },
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
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      /**
       * `computeDigest` do Apps Script devolve bytes **com sinal** (-128..127), e
       * `stablePolygonId_()` depende disso: ele reconverte para 0..255 antes de virar
       * hex. Um mock que devolvesse bytes sem sinal geraria ids diferentes dos de
       * produção e a idempotência da importação KML seria testada contra a coisa errada.
       */
      computeDigest: (_algorithm, value, _charset) => {
        const hash = createHash('sha256').update(String(value), 'utf8').digest();
        return [...hash].map((byte) => (byte > 127 ? byte - 256 : byte));
      },
      unzip: () => { throw new Error('unzip() exige um blob real; nenhum teste exercita KMZ'); },
    },
    DriveApp: {
      getFileById: () => { throw new Error('DriveApp não é exercitado pelos testes'); },
    },
    XmlService: {
      parse: () => { throw new Error('XmlService não é exercitado pelos testes'); },
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
