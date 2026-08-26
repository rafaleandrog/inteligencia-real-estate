import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppsScriptSandbox, readJsonOutput } from './helpers/appsScriptSandbox.mjs';

// Validação de geometria e revogação de segredo legado — os dois achados de segurança
// e de integridade de dado da revisão do Code.gs v2.0.0.

const POLYGON_HEADERS = [
  'polygon_id', 'name', 'category', 'geometry_geojson', 'color', 'description',
  'properties_json', 'source_url', 'source_file', 'imported_at', 'status',
];

function setup(sheets = {}) {
  return createAppsScriptSandbox({
    sheets: { POLYGONS: [POLYGON_HEADERS], APP_META: [['key', 'value', 'updated_at']], ...sheets },
    scriptProperties: { ADMIN_TOKEN: 'secret-token', DATASET_VERSION: '1' },
  });
}

function createPolygon(context, coordinates) {
  return readJsonOutput(context.doPost({
    postData: {
      contents: JSON.stringify({
        token: 'secret-token',
        action: 'create',
        sheet: 'POLYGONS',
        expected_version: '1',
        fields: {
          name: 'Contorno de teste',
          geometry_geojson: JSON.stringify({ type: 'Polygon', coordinates: [coordinates] }),
        },
      }),
    },
  }));
}

const VALID_RING = [[-47.9, -15.8], [-47.8, -15.8], [-47.8, -15.7], [-47.9, -15.8]];

test('anel com coordenadas válidas é aceito', () => {
  const { context } = setup();
  const res = createPolygon(context, VALID_RING);
  assert.equal(res.ok, true, `esperado sucesso, veio ${JSON.stringify(res.error)}`);
});

// `Number(null)`, `Number('')` e `Number(false)` são todos 0, e 0 passa em isFinite e na
// faixa válida. Sem a checagem estrita, um anel de coordenadas AUSENTES vira um polígono
// perfeitamente válido perto de [0, 0] — geografia fabricada, persistida como se fosse
// real. É o oposto exato do que o contrato exige de dado espacial.
for (const [rotulo, vazio] of [['null', null], ['string vazia', ''], ['espaços', '   '], ['false', false], ['array', []]]) {
  test(`coordenada ${rotulo} é rejeitada em vez de virar 0`, () => {
    const { context } = setup();
    const ring = [[vazio, vazio], [-47.8, -15.8], [-47.8, -15.7], [vazio, vazio]];
    const res = createPolygon(context, ring);

    assert.equal(res.ok, false, `coordenada ${rotulo} foi aceita e viraria [0, 0]`);
    assert.match(res.error.code, /VALIDATION_ERROR|INVALID_PAYLOAD/);
    assert.match(res.error.message, /num[ée]rica|inv[áa]lida|posi[çc][ãa]o|faixa/i);
  });
}

test('coordenada em string numérica continua aceita', () => {
  const { context } = setup();
  const ring = [['-47.9', '-15.8'], ['-47.8', '-15.8'], ['-47.8', '-15.7'], ['-47.9', '-15.8']];
  const res = createPolygon(context, ring);
  assert.equal(res.ok, true, `esperado sucesso, veio ${JSON.stringify(res.error)}`);
});

test('nenhum polígono é gravado quando a geometria é recusada', () => {
  const { context, sheets } = setup();
  createPolygon(context, [[null, null], [-47.8, -15.8], [-47.8, -15.7], [null, null]]);
  assert.equal(sheets.POLYGONS._rows.length, 1, 'só o cabeçalho podia estar lá');
});

// --- revogação do token legado ---------------------------------------------------

// APP_META é lida pelo navegador de qualquer visitante, via GViz. Um segredo que esteve
// lá esteve público, e limpar a célula depois não revoga cópia já lida ou cacheada.
// Copiá-lo para a Script Property ativa transformaria um valor vazado em credencial
// válida do endpoint de escrita.
test('token administrativo legado no APP_META é descartado, nunca promovido', () => {
  const sandbox = createAppsScriptSandbox({
    sheets: {
      APP_META: [['key', 'value', 'updated_at'], ['admin_token', 'token-que-vazou', '2026-01-01']],
      LISTINGS: [['listing_id', 'title']],
    },
    scriptProperties: {},
  });

  sandbox.context.setupProject();

  assert.notEqual(
    sandbox.properties.ADMIN_TOKEN,
    'token-que-vazou',
    'um token que esteve público virou credencial ativa',
  );
  assert.equal(sandbox.properties.ADMIN_TOKEN, undefined, 'nenhum token deve ficar ativo automaticamente');
  assert.ok(sandbox.properties.LEGACY_ADMIN_TOKEN_REVOKED_AT, 'a revogação precisa ficar registrada');
});

test('o valor legado sai da célula pública do APP_META', () => {
  const sandbox = createAppsScriptSandbox({
    sheets: {
      APP_META: [['key', 'value', 'updated_at'], ['admin_token', 'token-que-vazou', '2026-01-01']],
      LISTINGS: [['listing_id', 'title']],
    },
    scriptProperties: {},
  });

  sandbox.context.setupProject();

  const flat = JSON.stringify(sandbox.sheets.APP_META._rows);
  assert.equal(flat.includes('token-que-vazou'), false, 'o segredo continua legível na aba pública');
});
