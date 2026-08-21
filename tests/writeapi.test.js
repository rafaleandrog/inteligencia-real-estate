import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppsScriptSandbox, readJsonOutput } from './helpers/appsScriptSandbox.mjs';
import { pricePerM2 } from '../src/normalize.js';

// API de escrita (admin) do Apps Script — PR-A: só LISTINGS, ver docs/DATA_CONTRACT.md
// e a issue #5. Executa Code.gs de verdade dentro de um sandbox de vm (ver
// tests/helpers/appsScriptSandbox.mjs), não uma reimplementação em paralelo: um bug
// aqui é o mesmo bug que apareceria numa chamada real ao Web App.

const LISTINGS_HEADERS = [
  'address', 'area_basis', 'area_m2', 'asking_price_brl', 'asking_price_brl_m2', 'bedrooms',
  'condo_fee_brl', 'confidence_flag', 'coordinate_precision', 'iptu_brl', 'last_seen_at',
  'latitude', 'listing_id', 'locality', 'longitude', 'observed_at', 'parking_spaces',
  'portal', 'property_type', 'quality_flag', 'ra_geo_id', 'source_page_verified_at',
  'source_url', 'source_url_type', 'status', 'suites', 'title', 'transaction_type',
];

/** Uma linha LISTINGS válida e completa, na ordem de LISTINGS_HEADERS. */
function listingRow(overrides = {}) {
  const base = {
    address: 'SQN 404', area_basis: 'portal_area_unspecified', area_m2: 160,
    asking_price_brl: 2500000, asking_price_brl_m2: 15625, bedrooms: 4,
    condo_fee_brl: '', confidence_flag: 'low_spatial_high_attribute',
    coordinate_precision: 'locality_centroid_deterministic_jitter', iptu_brl: '',
    last_seen_at: '2026-08-18', latitude: -15.76, listing_id: 'LIST_1',
    locality: 'Asa Norte', longitude: -47.87, observed_at: '2026-08-18',
    parking_spaces: 2, portal: 'QuintoAndar', property_type: 'apartamento',
    quality_flag: 'web_search_direct_item_page_indexed', ra_geo_id: 'RA2026_RA-I',
    source_page_verified_at: '2026-08-18', source_url: 'https://example.com/imovel/1',
    source_url_type: 'individual_listing', status: 'active', suites: 4,
    title: 'Apartamento 4 quartos', transaction_type: 'sale',
  };
  const merged = { ...base, ...overrides };
  return LISTINGS_HEADERS.map((h) => merged[h]);
}

function setup(extra = {}) {
  return createAppsScriptSandbox({
    sheets: {
      LISTINGS: [LISTINGS_HEADERS, listingRow()],
      APP_META: [['key', 'value', 'updated_at']],
      CHANGE_LOG: [['timestamp', 'sheet', 'range', 'record_id', 'old_value', 'new_value', 'editor']],
      ...extra.sheets,
    },
    scriptProperties: { DATASET_VERSION: '1', ADMIN_TOKEN: 'secret-token', ...extra.scriptProperties },
  });
}

function post(context, body) {
  return readJsonOutput(context.doPost({ postData: { contents: JSON.stringify(body) } }));
}

// --- Autenticação -----------------------------------------------------------

test('doPost recusa token ausente', () => {
  const { context } = setup();
  const res = post(context, { action: 'update', sheet: 'LISTINGS', id: 'LIST_1' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'UNAUTHENTICATED');
});

test('doPost recusa token errado', () => {
  const { context } = setup();
  const res = post(context, { token: 'chute', action: 'update', sheet: 'LISTINGS', id: 'LIST_1' });
  assert.equal(res.error.code, 'UNAUTHENTICATED');
});

test('doPost recusa toda escrita quando ADMIN_TOKEN não está configurado', () => {
  const { context } = setup({ scriptProperties: { ADMIN_TOKEN: undefined } });
  const res = post(context, { token: 'secret-token', action: 'update', sheet: 'LISTINGS', id: 'LIST_1' });
  assert.equal(res.error.code, 'UNAUTHENTICATED');
});

// --- Roteamento e payload -----------------------------------------------------

test('doPost recusa aba fora da allowlist de escrita', () => {
  const { context } = setup();
  const res = post(context, { token: 'secret-token', action: 'create', sheet: 'ANCHORS', id: 'X' });
  assert.equal(res.error.code, 'UNKNOWN_SHEET');
});

test('doPost recusa action desconhecida', () => {
  const { context } = setup();
  const res = post(context, { token: 'secret-token', action: 'upsert', sheet: 'LISTINGS', id: 'LIST_1' });
  assert.equal(res.error.code, 'INVALID_PAYLOAD');
});

test('doPost recusa corpo que não é JSON', () => {
  const { context } = setup();
  const res = readJsonOutput(context.doPost({ postData: { contents: '{não é json' } }));
  assert.equal(res.error.code, 'INVALID_PAYLOAD');
});

// --- create -------------------------------------------------------------------

test('create grava um registro novo, calcula o derivado e devolve o registro persistido', () => {
  const { context, sheets } = setup();
  const fields = {
    address: 'SQN 111', area_basis: 'portal_area_unspecified', area_m2: 100,
    asking_price_brl: 1000000, bedrooms: 3, confidence_flag: 'low_spatial_high_attribute',
    coordinate_precision: 'locality_centroid_deterministic_jitter', last_seen_at: '2026-08-21',
    latitude: -15.7, locality: 'Asa Sul', longitude: -47.9, observed_at: '2026-08-21',
    portal: 'QuintoAndar', property_type: 'casa', quality_flag: 'web_search_direct_item_page_indexed',
    ra_geo_id: 'RA2026_RA-I', source_page_verified_at: '2026-08-21',
    source_url: 'https://example.com/imovel/2', source_url_type: 'individual_listing',
    status: 'active', title: 'Casa 3 quartos', transaction_type: 'sale',
  };

  const res = post(context, { token: 'secret-token', action: 'create', sheet: 'LISTINGS', id: 'LIST_2', fields });

  assert.equal(res.ok, true);
  assert.equal(res.record.listing_id, 'LIST_2');
  assert.equal(res.record.asking_price_brl_m2, 10000); // 1000000 / 100
  assert.equal(res.dataset_version, '2');
  assert.equal(sheets.LISTINGS._rows.length, 3); // header + LIST_1 + LIST_2
  assert.equal(sheets.CHANGE_LOG._rows.length, 2); // header + 1 evento
});

test('create recusa id duplicado', () => {
  const { context } = setup();
  const res = post(context, {
    token: 'secret-token', action: 'create', sheet: 'LISTINGS', id: 'LIST_1',
    fields: { title: 'Duplicado' },
  });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'VALIDATION_ERROR');
});

test('create recusa campo obrigatório ausente', () => {
  const { context } = setup();
  const res = post(context, {
    token: 'secret-token', action: 'create', sheet: 'LISTINGS', id: 'LIST_9',
    fields: { title: 'Sem endereço nem preço' },
  });
  assert.equal(res.error.code, 'VALIDATION_ERROR');
  assert.match(res.error.message, /obrigatório/);
});

test('create recusa asking_price_brl_m2 enviado diretamente pelo cliente', () => {
  const { context } = setup();
  const res = post(context, {
    token: 'secret-token', action: 'create', sheet: 'LISTINGS', id: 'LIST_9',
    fields: { asking_price_brl_m2: 99999 },
  });
  assert.equal(res.error.code, 'UNKNOWN_FIELD');
});

test('create recusa listing_id enviado dentro de fields (chave só via `id`)', () => {
  const { context } = setup();
  const res = post(context, {
    token: 'secret-token', action: 'create', sheet: 'LISTINGS', id: 'LIST_9',
    fields: { listing_id: 'LIST_9' },
  });
  assert.equal(res.error.code, 'UNKNOWN_FIELD');
});

// --- update -------------------------------------------------------------------

test('update exige expected_version', () => {
  const { context } = setup();
  const res = post(context, {
    token: 'secret-token', action: 'update', sheet: 'LISTINGS', id: 'LIST_1',
    fields: { title: 'Novo título' },
  });
  assert.equal(res.error.code, 'INVALID_PAYLOAD');
});

test('update recusa versão desatualizada com VERSION_CONFLICT', () => {
  const { context } = setup();
  const res = post(context, {
    token: 'secret-token', action: 'update', sheet: 'LISTINGS', id: 'LIST_1',
    expected_version: '999', fields: { title: 'Novo título' },
  });
  assert.equal(res.error.code, 'VERSION_CONFLICT');
});

test('update grava a mudança, versiona e audita', () => {
  const { context, sheets } = setup();
  const res = post(context, {
    token: 'secret-token', action: 'update', sheet: 'LISTINGS', id: 'LIST_1',
    expected_version: '1', fields: { title: 'Título atualizado', bedrooms: 5 },
  });

  assert.equal(res.ok, true);
  assert.equal(res.record.title, 'Título atualizado');
  assert.equal(res.record.bedrooms, 5);
  assert.equal(res.dataset_version, '2');
  assert.equal(sheets.CHANGE_LOG._rows.length, 3); // header + 2 campos mudados
});

test('update recalcula asking_price_brl_m2 quando preço ou área mudam', () => {
  const { context } = setup();
  const res = post(context, {
    token: 'secret-token', action: 'update', sheet: 'LISTINGS', id: 'LIST_1',
    expected_version: '1', fields: { area_m2: 200 },
  });
  assert.equal(res.record.asking_price_brl_m2, 2500000 / 200);
});

test('update não recalcula o derivado quando preço/área não estão no payload', () => {
  const { context } = setup();
  const res = post(context, {
    token: 'secret-token', action: 'update', sheet: 'LISTINGS', id: 'LIST_1',
    expected_version: '1', fields: { title: 'Só o título' },
  });
  assert.equal(res.record.asking_price_brl_m2, 15625); // valor original, intocado
});

test('update sem nenhuma mudança real de valor é INVALID_PAYLOAD', () => {
  const { context } = setup();
  const res = post(context, {
    token: 'secret-token', action: 'update', sheet: 'LISTINGS', id: 'LIST_1',
    expected_version: '1', fields: { title: 'Apartamento 4 quartos' }, // valor já existente
  });
  assert.equal(res.error.code, 'INVALID_PAYLOAD');
});

test('update recusa registro inexistente', () => {
  const { context } = setup();
  const res = post(context, {
    token: 'secret-token', action: 'update', sheet: 'LISTINGS', id: 'NAO_EXISTE',
    expected_version: '1', fields: { title: 'X' },
  });
  assert.equal(res.error.code, 'NOT_FOUND');
});

// --- delete -------------------------------------------------------------------

test('delete remove a linha e audita', () => {
  const { context, sheets } = setup();
  const res = post(context, {
    token: 'secret-token', action: 'delete', sheet: 'LISTINGS', id: 'LIST_1', expected_version: '1',
  });

  assert.equal(res.ok, true);
  assert.equal(sheets.LISTINGS._rows.length, 1); // só o header
  assert.equal(sheets.CHANGE_LOG._rows.length, 2);
});

test('delete recusa registro inexistente', () => {
  const { context } = setup();
  const res = post(context, {
    token: 'secret-token', action: 'delete', sheet: 'LISTINGS', id: 'NAO_EXISTE', expected_version: '1',
  });
  assert.equal(res.error.code, 'NOT_FOUND');
});

// --- validação de tipo ---------------------------------------------------------

test('validação de tipo recusa número inválido, URL inválida, data fora do formato e enum fora do vocabulário', () => {
  const { context } = setup();
  const casosInvalidos = [
    { area_m2: 'não é número' },
    { source_url: 'ftp://exemplo.com' },
    { observed_at: '18/08/2026' },
    { property_type: 'castelo' },
  ];
  for (const fields of casosInvalidos) {
    const res = post(context, {
      token: 'secret-token', action: 'update', sheet: 'LISTINGS', id: 'LIST_1',
      expected_version: '1', fields,
    });
    assert.equal(res.error.code, 'VALIDATION_ERROR', JSON.stringify(fields));
  }
});

// --- paridade do campo derivado -------------------------------------------------

test('pricePerM2_ (Code.gs) concorda com pricePerM2 (src/normalize.js) sem valor informado', () => {
  const { context } = setup();
  const casos = [[2500000, 160], [1000000, 100], [0, 100], [1000000, 0], [1000000, -5]];
  for (const [price, area] of casos) {
    assert.equal(context.pricePerM2_(price, area), pricePerM2(price, area, null));
  }
});
