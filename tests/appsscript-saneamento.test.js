import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppsScriptSandbox } from './helpers/appsScriptSandbox.mjs';

// v2.4.0 (issues #119/#120): rotinas de saneamento e cobertura que rodam pelo menu da
// planilha. Não há canal de escrita na planilha a partir do repositório, então o que
// dá para garantir aqui é que cada rotina faz exatamente o que o runbook promete — e que
// rodá-la duas vezes não muda nada (idempotência, prioridade nº 2 do Apps Script).

const OPERATIONAL = {
  APP_META: [['key', 'value', 'updated_at']],
  DATA_QUALITY: [['severity', 'sheet', 'row', 'record_id', 'field', 'code', 'message', 'detected_at', 'category']],
  CHANGE_LOG: [['timestamp', 'sheet', 'range', 'record_id', 'old_value', 'new_value', 'editor', 'correlation_id', 'result', 'error_reason']],
};

const LISTING_HEADERS = ['listing_id', 'portal', 'status', 'property_type', 'ra_geo_id', 'latitude', 'longitude',
  'observed_at', 'asking_price_brl', 'area_m2', 'asking_price_brl_m2', 'bedrooms', 'condo_fee_brl', 'iptu_brl'];

function listing(over) {
  const base = { listing_id: 'L1', portal: 'DFImoveis', status: 'active', property_type: 'apartamento',
    ra_geo_id: 'RA2026_RA-I', latitude: -15.7, longitude: -47.9, observed_at: '2026-08-18',
    asking_price_brl: 'R$ 290.000', area_m2: 37, asking_price_brl_m2: 'R$ 7.837,84', bedrooms: 1,
    condo_fee_brl: '', iptu_brl: '' };
  const row = { ...base, ...over };
  return LISTING_HEADERS.map((h) => (row[h] === undefined ? '' : row[h]));
}

const changeLogRows = (sandbox) => sandbox.sheets.CHANGE_LOG._rows.slice(1);
const findings = (sandbox) => sandbox.sheets.DATA_QUALITY._rows.slice(1).filter((r) => r.some((v) => v !== '' && v !== undefined));
const meta = (sandbox, key) => { const r = sandbox.sheets.APP_META._rows.find((x) => x[0] === key); return r ? r[1] : undefined; };

// --- toNumber_ ---------------------------------------------------------------------

test('toNumber_ lê moeda brasileira com ponto único de milhar quando há R$ — o bug dos 61 avisos', () => {
  const { context } = createAppsScriptSandbox();
  assert.equal(context.toNumber_('R$ 290.000'), 290000);
  assert.equal(context.toNumber_('R$ 2.500.000'), 2500000);
  assert.equal(context.toNumber_('R$ 2.500.000,50'), 2500000.5);
  assert.equal(context.toNumber_('R$ 7.837,84'), 7837.84);
  assert.equal(context.toNumber_('2.500.000'), 2500000);
  assert.equal(context.toNumber_('2,500,000.50'), 2500000.5);
  assert.equal(context.toNumber_('2500000'), 2500000);
  assert.equal(context.toNumber_(2500000), 2500000);
  assert.equal(context.toNumber_('1,5'), 1.5);
  assert.equal(context.toNumber_('120 m²'), 120);
  assert.equal(context.toNumber_('8,6%'), 8.6);
  assert.equal(context.toNumber_('0'), 0);
  assert.equal(context.toNumber_('-2.500.000'), -2500000);
  assert.equal(context.toNumber_('R$ 0,00'), 0);
  // Sem marcador de moeda, ponto único continua decimal — a âncora fica com toPriceNumber().
  assert.equal(context.toNumber_('2.500'), 2.5);
  for (const bad of ['', '   ', null, undefined, 'abc', 'R$', NaN, Infinity, '1.2.3,4,5']) {
    assert.equal(context.toNumber_(bad), null, JSON.stringify(String(bad)));
  }
});

test('preço como texto "R$ 290.000" não gera mais PRICE_M2_MISMATCH falso', () => {
  const sandbox = createAppsScriptSandbox({
    sheets: { ...OPERATIONAL, LISTINGS: [LISTING_HEADERS, listing()],
      DEVELOPMENTS: [['development_id', 'latitude', 'longitude']], ANCHORS: [['place_id', 'latitude', 'longitude']] },
    scriptProperties: { DATASET_VERSION: '1' },
  });
  sandbox.context.validateAll();
  const codes = findings(sandbox).filter((r) => r[1] === 'LISTINGS').map((r) => r[5]);
  assert.ok(!codes.includes('PRICE_M2_MISMATCH'), codes.join(', '));
});

// --- normalizeMonetaryCells ----------------------------------------------------------

test('normalizeMonetaryCells converte texto em número, loga cada célula e é idempotente', () => {
  const sandbox = createAppsScriptSandbox({
    sheets: { ...OPERATIONAL,
      LISTINGS: [LISTING_HEADERS,
        listing({ listing_id: 'L1' }),
        listing({ listing_id: 'L2', asking_price_brl: 2500000, asking_price_brl_m2: 15625, condo_fee_brl: 'R$ 1.200,00' }),
        listing({ listing_id: 'L3', asking_price_brl: 'sob consulta', asking_price_brl_m2: '' }),
      ],
      DEVELOPMENTS: [['development_id', 'current_price_brl', 'current_price_brl_m2'], ['D1', 'R$ 850.000', '']],
    },
    scriptProperties: { DATASET_VERSION: '1' },
  });
  const message = sandbox.context.normalizeMonetaryCells_();
  const rows = sandbox.sheets.LISTINGS._rows;
  const ix = Object.fromEntries(LISTING_HEADERS.map((h, i) => [h, i]));
  assert.equal(rows[1][ix.asking_price_brl], 290000);
  assert.equal(rows[1][ix.asking_price_brl_m2], 7837.84);
  assert.equal(rows[2][ix.asking_price_brl], 2500000, 'número já tipado não é tocado');
  assert.equal(rows[2][ix.condo_fee_brl], 1200);
  assert.equal(rows[3][ix.asking_price_brl], 'sob consulta', 'texto que não parseia é preservado para a validação acusar');
  assert.equal(sandbox.sheets.DEVELOPMENTS._rows[1][1], 850000);
  assert.match(message, /LISTINGS\.asking_price_brl: 1 convertida/);
  assert.match(message, /1 não numérica\(s\) preservada/);

  const log = changeLogRows(sandbox);
  assert.equal(log.length, 4, 'uma linha de CHANGE_LOG por célula convertida');
  const l1 = log.find((r) => r[3] === 'L1' && r[2] === 'asking_price_brl');
  assert.deepEqual([l1[1], l1[4], l1[5], l1[8]], ['LISTINGS', 'R$ 290.000', '290000', 'ok']);
  assert.equal(sandbox.properties.DATASET_VERSION, '2');
  assert.equal(meta(sandbox, 'validation_status'), 'dirty');

  // Segunda execução: nada muda.
  const before = JSON.stringify(sandbox.sheets.LISTINGS._rows);
  sandbox.context.normalizeMonetaryCells_();
  assert.equal(JSON.stringify(sandbox.sheets.LISTINGS._rows), before);
  assert.equal(changeLogRows(sandbox).length, 4);
  assert.equal(sandbox.properties.DATASET_VERSION, '2');
});

// --- normalizeFipezapPeriodCells -----------------------------------------------------

test('normalizeFipezapPeriodCells grava period_id YYYY-MM e reference_date YYYY-MM-DD como texto, uma vez', () => {
  const sandbox = createAppsScriptSandbox({
    sheets: { ...OPERATIONAL,
      FIPEZAP_MONTHLY: [['fipezap_id', 'period_id', 'reference_date', 'price_brl_m2'],
        ['A', new Date(Date.UTC(2011, 0, 1)), new Date(Date.UTC(2011, 0, 1)), 7004],
        ['B', '2011-02', '2011-02-01', 7097],
        ['C', 'inválido', '', 7100],
      ],
      FIPEZAP_SOURCES: [['source_id', 'period_id', 'reference_date'], ['S1', new Date(Date.UTC(2026, 6, 1)), '2026-07-01']],
    },
    scriptProperties: { DATASET_VERSION: '1' },
  });
  const message = sandbox.context.normalizeFipezapPeriodCells_();
  const monthly = sandbox.sheets.FIPEZAP_MONTHLY._rows;
  assert.deepEqual(monthly[1].slice(1, 3), ['2011-01', '2011-01-01']);
  assert.deepEqual(monthly[2].slice(1, 3), ['2011-02', '2011-02-01'], 'texto já no formato é preservado');
  assert.equal(monthly[3][1], 'inválido', 'ilegível é preservado, não apagado');
  assert.deepEqual(sandbox.sheets.FIPEZAP_SOURCES._rows[1].slice(1, 3), ['2026-07', '2026-07-01']);
  assert.match(message, /FIPEZAP_MONTHLY\.period_id: 1 convertida\(s\), 1 ilegível/);
  assert.equal(changeLogRows(sandbox).length, 3, 'uma linha por aba × coluna alterada');

  const before = JSON.stringify(sandbox.sheets.FIPEZAP_MONTHLY._rows);
  sandbox.context.normalizeFipezapPeriodCells_();
  assert.equal(JSON.stringify(sandbox.sheets.FIPEZAP_MONTHLY._rows), before);
  assert.equal(changeLogRows(sandbox).length, 3);
});

// --- IVV_REGION ----------------------------------------------------------------------

test('provisionIvvRegion cria a aba com os 12 cabeçalhos do contrato e não toca dado existente', () => {
  const sandbox = createAppsScriptSandbox({ sheets: { ...OPERATIONAL }, scriptProperties: {} });
  assert.equal(sandbox.sheets.IVV_REGION, undefined);
  sandbox.context.provisionIvvRegion();
  assert.deepEqual(sandbox.sheets.IVV_REGION._rows[0], [...sandbox.context.IVV_REGION_HEADERS]);
  assert.equal(sandbox.context.IVV_REGION_HEADERS.length, 12);
  assert.equal(meta(sandbox, 'rows_ivv_region'), '0');

  sandbox.sheets.IVV_REGION.appendRow(['2026-05-01', 'Asa Norte', '1Q', 8, 1, 12.5, 12.5, 12.5, 0, 24736, 24981.61, 'SRC']);
  const before = JSON.stringify(sandbox.sheets.IVV_REGION._rows);
  sandbox.context.provisionIvvRegion();
  assert.equal(JSON.stringify(sandbox.sheets.IVV_REGION._rows), before);
  assert.equal(meta(sandbox, 'rows_ivv_region'), '1');
  // Fora de REQUIRED_HEADERS de propósito: chave composta, sem ID_FIELD (ver Code.gs).
  assert.equal(sandbox.context.REQUIRED_HEADERS.IVV_REGION, undefined);
});

test('validateIvvRegion_ cobra faixa, mês, duplicidade, escala e conferência — DF Total é só referência', () => {
  const headers = ['reference_month', 'market_region', 'bedroom_bucket', 'offered_units', 'sold_units',
    'ivv_pct_published', 'ivv_pct', 'ivv_pct_check', 'ivv_variance_pp', 'offer_price_brl_m2', 'sale_price_brl_m2', 'source_id'];
  const sandbox = createAppsScriptSandbox({
    sheets: { ...OPERATIONAL,
      LISTINGS: [['listing_id', 'latitude', 'longitude']], DEVELOPMENTS: [['development_id', 'latitude', 'longitude']], ANCHORS: [['place_id', 'latitude', 'longitude']],
      IVV_REGION: [headers,
        [new Date(Date.UTC(2026, 4, 1)), 'Asa Norte', '1Q', 8, 1, 12.5, 12.5, 12.5, 0, 24736, 24981.61, 'SRC'],
        ['2026-05-01', 'Asa Norte', '2Q', 0, 0, '', '', '', '', '', '', 'SRC'],
        ['2026-05-01', 'DF Total', 'TOTAL', 100, 10, 10, 10, 10, 0, 9000, 9100, 'SRC'],
        ['2026-05-01', 'Guará', '5Q', 4, 1, 25, 25, 25, 0, '', '', 'SRC'],
        ['mai/26', 'Gama', '1Q', 4, 1, 25, 25, 25, 0, '', '', 'SRC'],
        ['2026-05-01', 'Asa Norte', '1Q', 8, 1, 12.5, 12.5, 12.5, 0, 24736, 24981.61, 'SRC'],
        ['2026-05-01', 'Lago Sul', '1Q', 10, 1, 0.1, 0.1, 10, 0, '', '', 'SRC'],
        ['2026-05-01', 'Lago Norte', '1Q', 10, 1, 250, 250, 10, 0, '', '', 'SRC'],
        ['2026-05-01', 'Noroeste', '1Q', 10, 1, 10, 9, 10, 0, '', '', 'SRC'],
      ] },
    scriptProperties: { DATASET_VERSION: '1' },
  });
  sandbox.context.validateAll();
  const region = findings(sandbox).filter((r) => r[1] === 'IVV_REGION');
  const codesFor = (name) => region.filter((r) => String(r[3]).includes(name)).map((r) => r[5]);
  assert.deepEqual(codesFor('Asa Norte|2Q'), [], 'célula vazia é ausência, não erro');
  assert.deepEqual(codesFor('DF Total'), [], 'a linha agregada é referência, nunca comparada com a soma');
  assert.ok(codesFor('Guará').includes('IVV_REGION_INVALID_BUCKET'));
  assert.ok(codesFor('Gama').includes('IVV_REGION_INVALID_MONTH'));
  assert.ok(codesFor('Asa Norte|1Q').includes('IVV_REGION_DUPLICATE'));
  assert.ok(codesFor('Lago Sul').includes('IVV_REGION_IVV_MISMATCH'), 'publicado 0.1 vs 10 p.p. calculado');
  assert.ok(codesFor('Lago Norte').includes('IVV_REGION_SCALE'));
  assert.ok(codesFor('Noroeste').includes('IVV_REGION_ALIAS_MISMATCH'));
});

// --- DATA_QUALITY como painel --------------------------------------------------------

test('DATA_QUALITY sai com 9 colunas, categoria derivada do código e ordenada por severidade → aba → categoria', () => {
  const sandbox = createAppsScriptSandbox({
    sheets: { ...OPERATIONAL,
      LISTINGS: [LISTING_HEADERS, listing({ listing_id: 'L1', latitude: '', longitude: -47.9 }), listing({ listing_id: 'L1' })],
      DEVELOPMENTS: [['development_id', 'latitude', 'longitude', 'current_price_brl'], ['D1', '', '', '']],
      ANCHORS: [['place_id', 'latitude', 'longitude']],
    },
    scriptProperties: { DATASET_VERSION: '1' },
  });
  sandbox.context.validateAll();
  const rows = findings(sandbox);
  assert.ok(rows.length > 3);
  assert.equal(sandbox.context.OPERATIONAL_HEADERS.DATA_QUALITY.length, 9);
  for (const r of rows) {
    assert.equal(r.length, 9, `achado com ${r.length} colunas`);
    assert.equal(r[8], sandbox.context.qualityCategoryOf_(r[5]));
  }
  const severities = rows.map((r) => r[0]);
  const firstWarning = severities.indexOf('warning');
  assert.ok(!severities.slice(firstWarning).includes('error'), 'erro depois de aviso');
  const errors = rows.filter((r) => r[0] === 'error');
  const sheetsInOrder = errors.map((r) => r[1]);
  assert.deepEqual(sheetsInOrder, [...sheetsInOrder].sort(), 'abas fora de ordem entre os erros');

  const { qualityCategoryOf_: cat } = sandbox.context;
  assert.equal(cat('HALF_COORDINATE'), 'spatial');
  assert.equal(cat('DUPLICATE_ID'), 'duplicate');
  assert.equal(cat('PRICE_M2_MISMATCH'), 'price');
  assert.equal(cat('MISSING_OPTIONAL_SHEET'), 'schema');
  assert.equal(cat('INVALID_URL'), 'invalid_url');
  assert.equal(cat('FIPEZAP_INVALID_PERIOD'), 'date');
  assert.equal(cat('FIPEZAP_MISSING_SOURCE'), 'source');
  assert.equal(cat('COVERAGE_MISSING_COORDINATE'), 'coverage');
  assert.equal(cat('INVALID_ENUM'), 'data_type');
  assert.equal(cat('EMPTY_ID'), 'missing_value');

  // A fila de pesquisa de DEVELOPMENTS aparece como aviso de cobertura.
  const queue = rows.filter((r) => r[1] === 'DEVELOPMENTS' && r[8] === 'coverage').map((r) => r[5]);
  assert.ok(queue.includes('COVERAGE_MISSING_COORDINATE'));
  assert.ok(queue.includes('COVERAGE_MISSING_CURRENT_PRICE_BRL'));
  assert.ok(rows.every((r) => !(r[1] === 'DEVELOPMENTS' && r[8] === 'coverage' && r[0] !== 'warning')));
});

// --- refreshMeta --------------------------------------------------------------------

test('refreshMeta publica contagens das bases novas; aba ausente publica vazio, não zero', () => {
  const sandbox = createAppsScriptSandbox({
    sheets: { ...OPERATIONAL,
      IVV_MONTHLY: [['period_id'], ['2021-01'], ['2021-02']],
      FIPEZAP_MONTHLY: [['fipezap_id', 'period_id'], ['A', '2011-01'], ['B', new Date(Date.UTC(2026, 6, 1))]],
      POLYGONS: [['polygon_id', 'status'], ['P1', 'active'], ['P2', 'inactive'], ['P3', 'active']],
    },
    scriptProperties: { DATASET_VERSION: '1' },
  });
  sandbox.context.refreshMeta();
  assert.equal(meta(sandbox, 'rows_ivv_monthly'), '2');
  assert.equal(meta(sandbox, 'rows_fipezap_monthly'), '2');
  assert.equal(meta(sandbox, 'rows_ivv_region'), '', 'aba ausente não é zero');
  assert.equal(meta(sandbox, 'rows_pdad_data'), '');
  assert.equal(meta(sandbox, 'rows_polygons'), '3');
  assert.equal(meta(sandbox, 'rows_polygons_active'), '2');
  assert.equal(meta(sandbox, 'fipezap_period_start'), '2011-01');
  assert.equal(meta(sandbox, 'fipezap_period_end'), '2026-07');
});

// --- LISTINGS_COVERAGE --------------------------------------------------------------

test('buildListingsCoverage mostra RA × tipo com zero, detalha combinações observadas e classifica a cobertura', () => {
  const sandbox = createAppsScriptSandbox({
    sheets: { ...OPERATIONAL,
      RA_PROFILES: [['ra_geo_id', 'ra_name', 'ra_code'], ['RA_01', 'Plano Piloto', 'RA-I'], ['RA_20', 'Águas Claras', 'RA-XX']],
      LISTINGS: [LISTING_HEADERS,
        listing({ listing_id: 'L1' }),
        listing({ listing_id: 'L2', portal: 'Wimoveis', asking_price_brl: 'R$ 1.500.000', area_m2: 76, asking_price_brl_m2: 19736.84, bedrooms: 3 }),
        listing({ listing_id: 'L3', portal: 'DFImoveis', asking_price_brl: 'R$ 1.600.000', area_m2: 80, asking_price_brl_m2: '', bedrooms: 3, observed_at: '2026-09-01' }),
        listing({ listing_id: 'L4', portal: 'DFImoveis', asking_price_brl: 'R$ 1.700.000', area_m2: 80, asking_price_brl_m2: 30000, bedrooms: 3, status: 'inactive' }),
        listing({ listing_id: 'L5', property_type: 'kitnet', bedrooms: 0, asking_price_brl: '', area_m2: '' }),
      ],
    },
    scriptProperties: { DATASET_VERSION: '1' },
  });
  const message = sandbox.context.buildListingsCoverage_();
  const rows = sandbox.sheets.LISTINGS_COVERAGE._rows;
  const headers = rows[0];
  assert.deepEqual(headers, [...sandbox.context.LISTINGS_COVERAGE_HEADERS]);
  const recs = rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));

  const zero = recs.find((r) => r.ra_geo_id === 'RA2026_RA-XX' && r.property_type === 'apartamento' && r.bedroom_bucket === 'TODOS');
  assert.ok(zero, 'RA sem anúncio precisa aparecer');
  assert.equal(zero.ra_name, 'Águas Claras');
  assert.equal(zero.active_count, 0);
  assert.equal(zero.coverage_status, 'none');

  const three = recs.find((r) => r.ra_geo_id === 'RA2026_RA-I' && r.property_type === 'apartamento' && r.bedroom_bucket === '3Q' && r.price_bucket === '1M_2M');
  assert.ok(three);
  assert.equal(three.active_count, 2, 'inativo não conta como ativo');
  assert.equal(three.with_price_count, 3);
  assert.equal(three.with_area_count, 3);
  assert.equal(three.with_valid_price_m2_count, 2, 'L4 informa 30000 para 21250 calculado');
  assert.equal(three.portals_count, 2);
  assert.equal(three.latest_observed_at, '2026-09-01');
  assert.equal(three.coverage_status, 'thin');

  const kit = recs.find((r) => r.property_type === 'kitnet' && r.bedroom_bucket === 'studio_kitnet');
  assert.ok(kit);
  assert.equal(kit.price_bucket, 'sem_preco');
  assert.equal(kit.coverage_status, 'single');

  const total = recs.find((r) => r.ra_geo_id === 'RA2026_RA-I' && r.property_type === 'apartamento' && r.bedroom_bucket === 'TODOS');
  assert.equal(total.active_count, 3);
  assert.equal(total.coverage_status, 'ok');
  assert.match(message, /sem nenhum anúncio ativo/);
  assert.equal(meta(sandbox, 'rows_listings_coverage'), String(recs.length));

  const before = JSON.stringify(rows.map((r) => r.slice(0, 12)));
  sandbox.context.buildListingsCoverage_();
  assert.equal(JSON.stringify(sandbox.sheets.LISTINGS_COVERAGE._rows.map((r) => r.slice(0, 12))), before, 'recalcular é idempotente');
});

// --- PDAD_A_COVERAGE ----------------------------------------------------------------

test('buildPdadCoverage cruza RA × indicador autorizado e marca missing, partial, suppressed_source e needs_review', () => {
  const pdadHeaders = ['pdad_year', 'ra_geo_id', 'ra_name', 'figure_number', 'table_number', 'indicator_code', 'indicator_name', 'segment_value', 'response_category', 'category_standard', 'source_value_status'];
  const P = (ra, name, code, cat, status, fig = '3', tab = '2') => ['2024', ra, name, fig, tab, code, code, '', cat, cat, status];
  const sandbox = createAppsScriptSandbox({
    sheets: { ...OPERATIONAL,
      PDAD_A_FIGURE_MAP: [['figure_number', 'table_number', 'indicator_code', 'indicator_name'],
        ['3', '2', 'dwelling_type', 'Tipo de domicílio'], ['4', '3', 'tenure_status', 'Condição de ocupação'], ['5', '4', 'registered_deed', 'Escritura']],
      PDAD_A_DATA: [pdadHeaders,
        P('RA_01', 'Plano Piloto', 'dwelling_type', 'apartamento', 'published'),
        P('RA_01', 'Plano Piloto', 'dwelling_type', 'casa', 'published'),
        P('RA_01', 'Plano Piloto', 'tenure_status', 'proprio', 'published'),
        P('RA_01', 'Plano Piloto', 'tenure_status', 'alugado', 'suppressed'),
        P('RA_01', 'Plano Piloto', 'pets', 'cachorro', 'published', '9', '7'),
        P('RA_02', 'Gama', 'dwelling_type', 'apartamento', 'published'),
        P('RA_02', 'Gama', 'registered_deed', 'sim', 'suppressed'),
        P('RA_02', 'Gama', 'registered_deed', 'nao', 'suppressed'),
      ],
    },
    scriptProperties: { DATASET_VERSION: '1' },
  });
  sandbox.context.buildPdadCoverage_();
  const rows = sandbox.sheets.PDAD_A_COVERAGE._rows;
  const headers = rows[0];
  assert.deepEqual(headers, [...sandbox.context.PDAD_COVERAGE_HEADERS]);
  const recs = rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
  const find = (ra, code) => recs.find((r) => r.ra_geo_id === ra && r.indicator_code === code);

  assert.equal(find('RA_01', 'dwelling_type').coverage_status, 'complete');
  assert.equal(find('RA_01', 'dwelling_type').categories_loaded, 2);
  assert.equal(find('RA_01', 'dwelling_type').categories_expected, 2);
  assert.equal(find('RA_01', 'tenure_status').coverage_status, 'partial');
  assert.equal(find('RA_01', 'tenure_status').suppressed_count, 1);
  assert.equal(find('RA_01', 'registered_deed').coverage_status, 'missing');
  assert.equal(find('RA_01', 'pets').coverage_status, 'needs_review', 'indicador fora do mapa canônico');
  assert.equal(find('RA_02', 'dwelling_type').coverage_status, 'partial', '1 de 2 categorias esperadas');
  assert.equal(find('RA_02', 'registered_deed').coverage_status, 'suppressed_source');
  assert.equal(find('RA_02', 'registered_deed').published_count, 0);
  assert.equal(find('RA_02', 'tenure_status').coverage_status, 'missing');
  assert.equal(recs.length, 7);
  assert.equal(meta(sandbox, 'rows_pdad_coverage'), '7');
});
