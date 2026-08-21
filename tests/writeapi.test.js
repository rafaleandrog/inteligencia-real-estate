import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppsScriptSandbox, readJsonOutput } from './helpers/appsScriptSandbox.mjs';
import { pricePerM2 } from '../src/normalize.js';

// API de escrita (admin) do Apps Script — PR-A: só LISTINGS, ver docs/DATA_CONTRACT.md
// e a issue #5. Executa Code.gs de verdade dentro de um sandbox de vm (ver
// tests/helpers/appsScriptSandbox.mjs), não uma reimplementação em paralelo: um bug
// aqui é o mesmo bug que apareceria numa chamada real ao Web App.
//
// Autenticação por token direto em toda chamada — mesmo racional do Web App de
// tipolis-sandbox/press-research-communications (frontend estático público + Apps
// Script atrás de um bearer token único, sem troca por sessão). O token nunca é
// hardcoded no cliente; viaja em todo `create`/`update`/`delete`/`validate`.

const LISTINGS_HEADERS = [
  'address', 'area_basis', 'area_m2', 'asking_price_brl', 'asking_price_brl_m2', 'bedrooms',
  'condo_fee_brl', 'confidence_flag', 'coordinate_precision', 'iptu_brl', 'last_seen_at',
  'latitude', 'listing_id', 'locality', 'longitude', 'observed_at', 'parking_spaces',
  'portal', 'property_type', 'quality_flag', 'ra_geo_id', 'source_page_verified_at',
  'source_url', 'source_url_type', 'status', 'suites', 'title', 'transaction_type',
];

const CHANGE_LOG_HEADERS = [
  'timestamp', 'sheet', 'range', 'record_id', 'old_value', 'new_value', 'editor',
  'correlation_id', 'result', 'error_reason',
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
      CHANGE_LOG: [CHANGE_LOG_HEADERS],
      ...extra.sheets,
    },
    scriptProperties: { DATASET_VERSION: '1', ADMIN_TOKEN: 'secret-token', ...extra.scriptProperties },
    googleEmail: extra.googleEmail,
  });
}

function post(context, body) {
  return readJsonOutput(context.doPost({ postData: { contents: JSON.stringify(body) } }));
}

/** Atalho: sempre manda o token direto no corpo, como toda chamada real faz. */
function write(context, body, token = 'secret-token') {
  return post(context, { token, ...body });
}

// --- Autenticação (token direto em toda chamada) --------------------------------

test('doPost recusa token ausente', () => {
  const { context } = setup();
  const res = post(context, { action: 'update', sheet: 'LISTINGS', id: 'LIST_1' });
  assert.equal(res.error.code, 'UNAUTHENTICATED');
});

test('doPost recusa token errado', () => {
  const { context } = setup();
  const res = write(context, { action: 'update', sheet: 'LISTINGS', id: 'LIST_1' }, 'chute');
  assert.equal(res.error.code, 'UNAUTHENTICATED');
});

test('doPost recusa toda escrita quando ADMIN_TOKEN não está configurado', () => {
  const { context } = setup({ scriptProperties: { ADMIN_TOKEN: undefined } });
  const res = write(context, { action: 'update', sheet: 'LISTINGS', id: 'LIST_1' });
  assert.equal(res.error.code, 'UNAUTHENTICATED');
});

test('action=validate confirma um token correto sem ler nem escrever nada', () => {
  const { context, sheets } = setup();
  const res = write(context, { action: 'validate' });
  assert.equal(res.ok, true);
  assert.equal(res.record.valid, true);
  assert.equal(sheets.LISTINGS._rows.length, 2); // header + 1, intocado
  assert.equal(sheets.CHANGE_LOG._rows.length, 1); // só o header, nada logado
});

test('action=validate com token errado é UNAUTHENTICATED', () => {
  const { context } = setup();
  const res = write(context, { action: 'validate' }, 'chute');
  assert.equal(res.error.code, 'UNAUTHENTICATED');
});

// --- Roteamento e payload -----------------------------------------------------

test('doPost recusa aba fora da allowlist de escrita', () => {
  const { context } = setup();
  const res = write(context, { action: 'create', sheet: 'ANCHORS', id: 'X' });
  assert.equal(res.error.code, 'UNKNOWN_SHEET');
});

test('doPost recusa action desconhecida', () => {
  const { context } = setup();
  const res = write(context, { action: 'upsert', sheet: 'LISTINGS', id: 'LIST_1' });
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

  const res = write(context, { action: 'create', sheet: 'LISTINGS', id: 'LIST_2', fields });

  assert.equal(res.ok, true);
  assert.equal(res.record.listing_id, 'LIST_2');
  assert.equal(res.record.asking_price_brl_m2, 10000); // 1000000 / 100
  assert.equal(res.dataset_version, '2');
  assert.equal(sheets.LISTINGS._rows.length, 3); // header + LIST_1 + LIST_2
  assert.equal(sheets.CHANGE_LOG._rows.length, 2); // header + 1 evento
});

test('create recusa id duplicado', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'create', sheet: 'LISTINGS', id: 'LIST_1',
    fields: { title: 'Duplicado' },
  });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'VALIDATION_ERROR');
});

test('create recusa campo obrigatório ausente', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'create', sheet: 'LISTINGS', id: 'LIST_9',
    fields: { title: 'Sem endereço nem preço' },
  });
  assert.equal(res.error.code, 'VALIDATION_ERROR');
  assert.match(res.error.message, /obrigatório/);
});

test('create recusa asking_price_brl_m2 enviado diretamente pelo cliente', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'create', sheet: 'LISTINGS', id: 'LIST_9',
    fields: { asking_price_brl_m2: 99999 },
  });
  assert.equal(res.error.code, 'UNKNOWN_FIELD');
});

test('create recusa listing_id enviado dentro de fields (chave só via `id`)', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'create', sheet: 'LISTINGS', id: 'LIST_9',
    fields: { listing_id: 'LIST_9' },
  });
  assert.equal(res.error.code, 'UNKNOWN_FIELD');
});

// --- update -------------------------------------------------------------------

test('update exige expected_version', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'update', sheet: 'LISTINGS', id: 'LIST_1',
    fields: { title: 'Novo título' },
  });
  assert.equal(res.error.code, 'INVALID_PAYLOAD');
});

test('update recusa versão desatualizada com VERSION_CONFLICT', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'update', sheet: 'LISTINGS', id: 'LIST_1',
    expected_version: '999', fields: { title: 'Novo título' },
  });
  assert.equal(res.error.code, 'VERSION_CONFLICT');
});

test('update grava a mudança, versiona e audita', () => {
  const { context, sheets } = setup();
  const res = write(context, {
    action: 'update', sheet: 'LISTINGS', id: 'LIST_1',
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
  const res = write(context, {
    action: 'update', sheet: 'LISTINGS', id: 'LIST_1',
    expected_version: '1', fields: { area_m2: 200 },
  });
  assert.equal(res.record.asking_price_brl_m2, 2500000 / 200);
});

test('update não recalcula o derivado quando preço/área não estão no payload', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'update', sheet: 'LISTINGS', id: 'LIST_1',
    expected_version: '1', fields: { title: 'Só o título' },
  });
  assert.equal(res.record.asking_price_brl_m2, 15625); // valor original, intocado
});

test('update sem nenhuma mudança real de valor é INVALID_PAYLOAD', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'update', sheet: 'LISTINGS', id: 'LIST_1',
    expected_version: '1', fields: { title: 'Apartamento 4 quartos' }, // valor já existente
  });
  assert.equal(res.error.code, 'INVALID_PAYLOAD');
});

test('update recusa registro inexistente', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'update', sheet: 'LISTINGS', id: 'NAO_EXISTE',
    expected_version: '1', fields: { title: 'X' },
  });
  assert.equal(res.error.code, 'NOT_FOUND');
});

// --- delete -------------------------------------------------------------------

test('delete remove a linha e audita', () => {
  const { context, sheets } = setup();
  const res = write(context, {
    action: 'delete', sheet: 'LISTINGS', id: 'LIST_1', expected_version: '1',
  });

  assert.equal(res.ok, true);
  assert.equal(sheets.LISTINGS._rows.length, 1); // só o header
  assert.equal(sheets.CHANGE_LOG._rows.length, 2);
});

test('delete recusa registro inexistente', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'delete', sheet: 'LISTINGS', id: 'NAO_EXISTE', expected_version: '1',
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
    const res = write(context, {
      action: 'update', sheet: 'LISTINGS', id: 'LIST_1',
      expected_version: '1', fields,
    });
    assert.equal(res.error.code, 'VALIDATION_ERROR', JSON.stringify(fields));
  }
});

// --- correlation_id e auditoria de falha (issue #5) -------------------------------

test('correlation_id é ecoado na resposta e gravado no CHANGE_LOG junto com result=ok', () => {
  const { context, sheets } = setup();
  const res = write(context, {
    action: 'update', sheet: 'LISTINGS', id: 'LIST_1', expected_version: '1',
    fields: { title: 'Com correlação' }, correlation_id: 'corr-123', editor: 'Fulano',
  });

  assert.equal(res.ok, true);
  assert.equal(res.correlation_id, 'corr-123');

  const lastRow = sheets.CHANGE_LOG._rows[sheets.CHANGE_LOG._rows.length - 1];
  assert.equal(lastRow[7], 'corr-123'); // correlation_id
  assert.equal(lastRow[8], 'ok'); // result
  assert.equal(lastRow[9], ''); // error_reason
});

test('falha de validação autenticada é registrada no CHANGE_LOG com result=error e o motivo', () => {
  const { context, sheets } = setup();
  const before = sheets.CHANGE_LOG._rows.length;

  const res = write(context, {
    action: 'update', sheet: 'LISTINGS', id: 'NAO_EXISTE', expected_version: '1',
    fields: { title: 'X' }, correlation_id: 'corr-err',
  });

  assert.equal(res.error.code, 'NOT_FOUND');
  assert.equal(res.correlation_id, 'corr-err');
  assert.equal(sheets.CHANGE_LOG._rows.length, before + 1);

  const lastRow = sheets.CHANGE_LOG._rows[sheets.CHANGE_LOG._rows.length - 1];
  assert.equal(lastRow[7], 'corr-err');
  assert.equal(lastRow[8], 'error');
  assert.match(lastRow[9], /NOT_FOUND/);
});

test('falha de autenticação NÃO é registrada no CHANGE_LOG (evita ruído de força bruta)', () => {
  const { context, sheets } = setup();
  const before = sheets.CHANGE_LOG._rows.length;
  write(context, { action: 'update', sheet: 'LISTINGS', id: 'LIST_1' }, 'chute-de-token');
  assert.equal(sheets.CHANGE_LOG._rows.length, before);
});

test('editor: identidade do Google, quando disponível, tem prioridade sobre o autodeclarado', () => {
  const { context, sheets } = setup({ googleEmail: 'pessoa@up.bsb.br' });
  write(context, {
    action: 'update', sheet: 'LISTINGS', id: 'LIST_1', expected_version: '1',
    fields: { title: 'X' }, editor: 'Nome Autodeclarado',
  });
  const lastRow = sheets.CHANGE_LOG._rows[sheets.CHANGE_LOG._rows.length - 1];
  assert.equal(lastRow[6], 'pessoa@up.bsb.br'); // editor
});

test('editor: sem identidade do Google, usa o autodeclarado', () => {
  const { context, sheets } = setup();
  write(context, {
    action: 'update', sheet: 'LISTINGS', id: 'LIST_1', expected_version: '1',
    fields: { title: 'X' }, editor: 'Nome Autodeclarado',
  });
  const lastRow = sheets.CHANGE_LOG._rows[sheets.CHANGE_LOG._rows.length - 1];
  assert.equal(lastRow[6], 'Nome Autodeclarado');
});

// --- migração do cabeçalho do CHANGE_LOG (issue #5) -------------------------------

test('upgradeChangeLogHeader_ estende um cabeçalho antigo de 7 colunas para 10, sem tocar linhas existentes', () => {
  const { context, sheets } = createAppsScriptSandbox({
    sheets: {
      LISTINGS: [LISTINGS_HEADERS, listingRow()],
      DEVELOPMENTS: [['development_id']],
      ANCHORS: [['place_id']],
      APP_META: [['key', 'value', 'updated_at']],
      DATA_QUALITY: [['severity', 'sheet', 'row', 'record_id', 'field', 'code', 'message', 'detected_at']],
      CHANGE_LOG: [
        ['timestamp', 'sheet', 'range', 'record_id', 'old_value', 'new_value', 'editor'],
        ['2026-01-01T00:00:00.000Z', 'LISTINGS', 'A2', 'LIST_OLD', '', 'x', 'alguem@example.com'],
      ],
    },
    scriptProperties: {},
  });

  const upgraded = context.upgradeChangeLogHeader_();
  assert.equal(upgraded, true);
  assert.deepEqual(sheets.CHANGE_LOG._rows[0], CHANGE_LOG_HEADERS);
  assert.equal(sheets.CHANGE_LOG._rows[1][3], 'LIST_OLD'); // linha antiga preservada

  // idempotente: rodar de novo não quebra nem duplica
  assert.equal(context.upgradeChangeLogHeader_(), false);
});

test('upgradeChangeLogHeader_ não mexe num cabeçalho que já é o novo', () => {
  const { context, sheets } = setup();
  const before = JSON.stringify(sheets.CHANGE_LOG._rows[0]);
  assert.equal(context.upgradeChangeLogHeader_(), false);
  assert.equal(JSON.stringify(sheets.CHANGE_LOG._rows[0]), before);
});

// --- paridade do campo derivado -------------------------------------------------

test('pricePerM2_ (Code.gs) concorda com pricePerM2 (src/normalize.js) sem valor informado', () => {
  const { context } = setup();
  const casos = [[2500000, 160], [1000000, 100], [0, 100], [1000000, 0], [1000000, -5]];
  for (const [price, area] of casos) {
    assert.equal(context.pricePerM2_(price, area), pricePerM2(price, area, null));
  }
});
