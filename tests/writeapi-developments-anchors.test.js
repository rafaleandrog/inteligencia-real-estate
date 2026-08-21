import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppsScriptSandbox, readJsonOutput } from './helpers/appsScriptSandbox.mjs';
import { pricePerM2 } from '../src/normalize.js';

// Extensão da API de escrita (PR-B) para DEVELOPMENTS e ANCHORS — mesmo padrão da
// PR-A (tests/writeapi.test.js), que já cobre auth/roteamento/erros genéricos em
// profundidade sobre LISTINGS. Este arquivo foca no que é específico de cada aba:
// campo derivado com fonte de área diferente (DEVELOPMENTS), campo booleano
// (spatial_usable), enum de vocabulário fechado (category) e a ausência de derivado
// em ANCHORS.

const DEVELOPMENTS_HEADERS = [
  'address', 'area_max_m2', 'area_min_m2', 'confidence_flag', 'coordinate_status',
  'current_price_brl', 'current_price_brl_m2', 'developer_name', 'development_id',
  'expected_delivery', 'last_verified_at', 'latitude', 'longitude', 'name', 'neighborhood',
  'product', 'quality_flag', 'ra_geo_id', 'segment', 'source_url', 'spatial_usable',
  'status', 'unit_mix', 'units_total', 'work_progress_pct',
];

const ANCHORS_HEADERS = [
  'address', 'category', 'confidence_flag', 'coordinate_precision', 'coordinate_source_url',
  'last_verified_at', 'latitude', 'longitude', 'name', 'neighborhood', 'operator_name',
  'place_id', 'ra_geo_id', 'scale_capacity', 'source_url', 'status', 'subcategory',
];

function developmentRow(overrides = {}) {
  const base = {
    address: 'SQNW 108', area_max_m2: 120, area_min_m2: 80, confidence_flag: 'high_attributes',
    coordinate_status: 'pending_exact_parcel_or_poi_validation', current_price_brl: '',
    current_price_brl_m2: '', developer_name: 'Construtora X', development_id: 'DEV_1',
    expected_delivery: '2028-01-01', last_verified_at: '2026-08-18', latitude: -15.77,
    longitude: -47.91, name: 'Residencial Noroeste', neighborhood: 'Noroeste',
    product: 'apartamento', quality_flag: '', ra_geo_id: 'RA2026_RA-XXII', segment: 'alto_padrao',
    source_url: 'https://example.com/empreendimento/1', spatial_usable: 1, status: 'lancamento',
    unit_mix: '2 e 3 quartos', units_total: 120, work_progress_pct: 10,
  };
  const merged = { ...base, ...overrides };
  return DEVELOPMENTS_HEADERS.map((h) => merged[h]);
}

function anchorRow(overrides = {}) {
  const base = {
    address: 'SGAS 915', category: 'escola', confidence_flag: 'high',
    coordinate_precision: 'school_polygon_reference_point',
    coordinate_source_url: 'https://example.com/fonte-coordenada', last_verified_at: '2026-08-18',
    latitude: -15.79, longitude: -47.89, name: 'Escola Modelo', neighborhood: 'Asa Sul',
    operator_name: 'GDF', place_id: 'ANCHOR_1', ra_geo_id: 'RA2026_RA-III',
    scale_capacity: '', source_url: 'https://example.com/fonte', status: 'active',
    subcategory: 'ensino_fundamental',
  };
  const merged = { ...base, ...overrides };
  return ANCHORS_HEADERS.map((h) => merged[h]);
}

const CHANGE_LOG_HEADERS = [
  'timestamp', 'sheet', 'range', 'record_id', 'old_value', 'new_value', 'editor',
  'correlation_id', 'result', 'error_reason',
];

function setup() {
  return createAppsScriptSandbox({
    sheets: {
      DEVELOPMENTS: [DEVELOPMENTS_HEADERS, developmentRow()],
      ANCHORS: [ANCHORS_HEADERS, anchorRow()],
      APP_META: [['key', 'value', 'updated_at']],
      CHANGE_LOG: [CHANGE_LOG_HEADERS],
    },
    scriptProperties: { DATASET_VERSION: '1', ADMIN_TOKEN: 'secret-token' },
  });
}

function post(context, body) {
  return readJsonOutput(context.doPost({ postData: { contents: JSON.stringify(body) } }));
}

/** Login em duas etapas (issue #5): troca token por sessão antes de cada escrita. */
function write(context, body) {
  const auth = post(context, { action: 'authenticate', token: 'secret-token' });
  if (!auth.ok) throw new Error('login falhou no teste: ' + JSON.stringify(auth));
  return post(context, { ...body, session: auth.session });
}

// --- DEVELOPMENTS ---------------------------------------------------------------

test('DEVELOPMENTS: create exige só os campos marcados sim no contrato', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'create', sheet: 'DEVELOPMENTS', id: 'DEV_2',
    fields: {
      name: 'Torres do Lago', address: 'QI 5', neighborhood: 'Lago Sul',
      confidence_flag: 'high_attributes', spatial_usable: true, last_verified_at: '2026-08-21',
    },
  });
  assert.equal(res.ok, true);
  assert.equal(res.record.development_id, 'DEV_2');
  assert.equal(res.record.spatial_usable, true);
});

test('DEVELOPMENTS: create sem os campos obrigatórios é VALIDATION_ERROR', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'create', sheet: 'DEVELOPMENTS', id: 'DEV_2',
    fields: { name: 'Só o nome' },
  });
  assert.equal(res.error.code, 'VALIDATION_ERROR');
});

test('DEVELOPMENTS: current_price_brl_m2 é recusado como entrada direta', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'update', sheet: 'DEVELOPMENTS', id: 'DEV_1',
    expected_version: '1', fields: { current_price_brl_m2: 9999 },
  });
  assert.equal(res.error.code, 'UNKNOWN_FIELD');
});

test('DEVELOPMENTS: development_id é imutável (só via `id`, nunca em fields)', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'update', sheet: 'DEVELOPMENTS', id: 'DEV_1',
    expected_version: '1', fields: { development_id: 'DEV_X' },
  });
  assert.equal(res.error.code, 'UNKNOWN_FIELD');
});

test('DEVELOPMENTS: update recalcula current_price_brl_m2 usando area_min_m2 como base', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'update', sheet: 'DEVELOPMENTS', id: 'DEV_1',
    expected_version: '1', fields: { current_price_brl: 800000 },
  });
  assert.equal(res.ok, true);
  // area_min_m2 atual da linha é 80: 800000 / 80 = 10000.
  assert.equal(res.record.current_price_brl_m2, 10000);
  assert.equal(res.record.current_price_brl_m2, pricePerM2(800000, 80, null));
});

test('DEVELOPMENTS: spatial_usable aceita literais tolerantes de booleano', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'update', sheet: 'DEVELOPMENTS', id: 'DEV_1',
    expected_version: '1', fields: { spatial_usable: 'sim' },
  });
  assert.equal(res.ok, true);
  assert.equal(res.record.spatial_usable, true);
});

test('DEVELOPMENTS: delete remove a linha e audita', () => {
  const { context, sheets } = setup();
  const res = write(context, {
    action: 'delete', sheet: 'DEVELOPMENTS', id: 'DEV_1', expected_version: '1',
  });
  assert.equal(res.ok, true);
  assert.equal(sheets.DEVELOPMENTS._rows.length, 1); // só o header
});

// --- ANCHORS ---------------------------------------------------------------------

test('ANCHORS: create exige os campos marcados sim no contrato', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'create', sheet: 'ANCHORS', id: 'ANCHOR_2',
    fields: {
      name: 'Parque da Cidade', category: 'parque_equipamento_publico', subcategory: 'parque_urbano',
      operator_name: 'GDF', latitude: -15.8, longitude: -47.92, ra_geo_id: 'RA2026_RA-I',
      source_url: 'https://example.com/fonte-2', coordinate_source_url: 'https://example.com/geo-2',
      confidence_flag: 'high', coordinate_precision: 'official_wfs_point',
      last_verified_at: '2026-08-21', status: 'active',
    },
  });
  assert.equal(res.ok, true);
  assert.equal(res.record.place_id, 'ANCHOR_2');
});

test('ANCHORS: category fora do vocabulário fechado é VALIDATION_ERROR', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'update', sheet: 'ANCHORS', id: 'ANCHOR_1',
    expected_version: '1', fields: { category: 'castelo' },
  });
  assert.equal(res.error.code, 'VALIDATION_ERROR');
});

test('ANCHORS: não tem campo derivado — nenhum campo de preço/m² existe na allowlist', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'update', sheet: 'ANCHORS', id: 'ANCHOR_1',
    expected_version: '1', fields: { price_m2: 100 },
  });
  assert.equal(res.error.code, 'UNKNOWN_FIELD');
});

test('ANCHORS: update grava, versiona e audita', () => {
  const { context, sheets } = setup();
  const res = write(context, {
    action: 'update', sheet: 'ANCHORS', id: 'ANCHOR_1',
    expected_version: '1', fields: { name: 'Escola Modelo II' },
  });
  assert.equal(res.ok, true);
  assert.equal(res.record.name, 'Escola Modelo II');
  assert.equal(sheets.CHANGE_LOG._rows.length, 2);
});

test('ANCHORS: place_id inexistente é NOT_FOUND', () => {
  const { context } = setup();
  const res = write(context, {
    action: 'delete', sheet: 'ANCHORS', id: 'NAO_EXISTE', expected_version: '1',
  });
  assert.equal(res.error.code, 'NOT_FOUND');
});
