// Rotina de anúncios do Code.gs v2.5.0 (issue #178), executada de verdade no sandbox.
//
// O defeito que motivou a versão estava na planilha, não numa hipótese: quinze execuções
// diárias gravadas como `success` com 154 erros cada ("You do not have permission to call
// UrlFetchApp.fetch"), nenhuma página lida, e o fechamento mensal contando como ativo o que
// nunca foi conferido. Os testes abaixo reproduzem esse caso e travam as três regras da
// v2.5.0: bloqueio não é remoção; run com erro não é sucesso; histórico só conta o que foi
// confirmado.
//
// As páginas de portal aqui são SINTÉTICAS: a rede da sessão em que isto foi escrito não
// alcança os portais. Elas reproduzem as estruturas que o parser lê (JSON-LD schema.org,
// `__NEXT_DATA__`, meta de preço) e as que ele precisa recusar (vitrine de semelhantes,
// página de desafio, marcador de remoção dentro de script). Amostras reais entram como
// fixture pelo menu "Anúncios: diagnosticar portais", que as salva no Drive.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppsScriptSandbox } from './helpers/appsScriptSandbox.mjs';

/** Cabeçalho de LISTINGS como está na planilha viva em 2026-10-08 (48 colunas). */
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

const SOURCES_HEADERS = [
  'source_id', 'source_name', 'source_type', 'active', 'collection_frequency', 'base_url',
  'search_urls', 'parser_key', 'parser_config_json', 'request_headers_json', 'notes',
  'last_success_at', 'last_error_at', 'last_run_id',
];

const DF = 'https://www.dfimoveis.com.br/imovel/apartamento-3-quartos-venda-aguas-claras-brasilia-df-1364276';
const QA = 'https://www.quintoandar.com.br/imovel/894155475/comprar/apartamento-4-quartos-asa-norte-brasilia';
const WI = 'https://www.wimoveis.com.br/propriedades/casa-lago-norte-3042738424.html';

function listing(over = {}) {
  const row = LISTINGS_HEADERS.map(() => '');
  const base = {
    listing_id: 'LIST_WEB_DFIMOVEIS_1364276', portal: 'DFImoveis', transaction_type: 'sale',
    title: 'Apartamento 3 quartos', source_url: DF, source_url_type: 'individual_listing',
    external_id: '1364276', status: 'active', last_seen_at: new Date('2026-08-20T00:00:00Z'),
    observed_at: new Date('2026-08-20T00:00:00Z'), source_page_verified_at: new Date('2026-08-20T00:00:00Z'),
    property_type: 'apartamento', address: 'Rua 10', locality: 'Águas Claras', ra_geo_id: 'RA2026_RA-XX',
    latitude: -15.84, longitude: -48.02, coordinate_precision: 'locality_centroid_deterministic_jitter',
    confidence_flag: 'low_spatial_high_attribute', asking_price_brl: 800000, area_m2: 80,
    area_basis: 'privativa', asking_price_brl_m2: 10000, bedrooms: 3, parking_spaces: 2,
    quality_flag: 'web_search_direct_item_page_indexed',
  };
  for (const [k, v] of Object.entries({ ...base, ...over })) row[IX[k]] = v;
  return row;
}

function sourceRow(id, name) {
  return [id, name, 'portal', true, 'daily', '', '', 'generic_html', '', '', '', '', '', ''];
}

function sheetsWith(rows) {
  return {
    LISTINGS: [LISTINGS_HEADERS, ...rows],
    LISTING_SOURCES: [
      SOURCES_HEADERS,
      sourceRow('SRC_PORTAL_DFIMOVEIS', 'DFImoveis'),
      sourceRow('SRC_PORTAL_QUINTOANDAR', 'QuintoAndar'),
      sourceRow('SRC_PORTAL_WIMOVEIS', 'Wimoveis'),
    ],
    APP_META: [['key', 'value', 'updated_at']],
    CHANGE_LOG: [['timestamp', 'sheet', 'range', 'record_id', 'old_value', 'new_value', 'editor', 'correlation_id', 'result', 'error_reason']],
  };
}

// --- páginas sintéticas ---------------------------------------------------------------

function jsonLdPage({ price = 800000, area = 80, url = DF, extra = '' } = {}) {
  const data = {
    '@context': 'https://schema.org', '@type': 'RealEstateListing', url,
    offers: { '@type': 'Offer', price: String(price), priceCurrency: 'BRL' },
    about: { '@type': 'Apartment', floorSize: { '@type': 'QuantitativeValue', value: area, unitCode: 'MTK' }, numberOfRooms: 3 },
    datePosted: '2026-08-10',
  };
  return `<html><head><title>Apartamento à venda</title><meta property="og:title" content="Apartamento 3 quartos à venda">
<script type="application/ld+json">${JSON.stringify(data)}</script></head><body><h1>Apartamento</h1>${extra}</body></html>`;
}

function similarListingsPage() {
  // Página SEM o anúncio, só com vitrine de semelhantes — três ofertas de outros anúncios.
  const items = [111111, 222222, 333333].map((id, i) => ({
    '@type': 'ListItem', position: i + 1,
    item: { '@type': 'RealEstateListing', url: `https://www.dfimoveis.com.br/imovel/x-${id}`, offers: { price: 500000 + i * 100000 } },
  }));
  return `<html><head><title>Imóveis à venda</title><script type="application/ld+json">${JSON.stringify({ '@type': 'ItemList', itemListElement: items })}</script></head><body>Veja outros</body></html>`;
}

function nextDataPage({ price = 2500000, area = 160, id = '894155475' } = {}) {
  const data = {
    props: { pageProps: { initialState: {
      house: { id, salePrice: price, area, bedrooms: 4, parkingSpaces: 2, condoPrice: 1800, iptu: 4000 },
      similar: [{ id: '1', salePrice: 999000, area: 70 }, { id: '2', salePrice: 1200000, area: 90 }],
    } } },
  };
  return `<html><head><title>QuintoAndar</title></head><body><div id="__next"></div>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

const REMOVED_PAGE = '<html><head><title>DF Imóveis</title></head><body><h2>Este anúncio não está mais disponível.</h2></body></html>';
const CHALLENGE_PAGE = '<html><head><title>Just a moment...</title></head><body><div id="cf-chl-widget">Checking your browser</div></body></html>';

// --- rede falsa -------------------------------------------------------------------------

function response(code, body = '', headers = {}) {
  return {
    getResponseCode: () => code,
    getContentText: () => body,
    getAllHeaders: () => headers,
  };
}

/** `fetchAll` falso: `routes` é `{url: response | (url) => response}`; registra cada URL. */
function installNetwork(context, routes, calls = []) {
  context.UrlFetchApp = {
    fetchAll(requests) {
      return requests.map((req) => {
        calls.push(req.url);
        assert.equal(req.followRedirects, false, 'redirecionamento é seguido pela rotina, não pelo UrlFetchApp');
        assert.equal(req.muteHttpExceptions, true);
        const route = routes[req.url];
        if (!route) throw new Error(`URL não prevista pelo teste: ${req.url}`);
        return typeof route === 'function' ? route(req.url) : route;
      });
    },
    fetch() { throw new Error('a rotina deve usar fetchAll'); },
  };
  context.Utilities.sleep = () => {};
  return calls;
}

const day = (n) => new Date(Date.UTC(2026, 9, 8 + n, 12, 0, 0)); // 2026-10-08 + n, 12h UTC
const cell = (sandbox, rowIndex, field) => sandbox.sheets.LISTINGS._rows[rowIndex + 1][IX[field]];
const runs = (sandbox) => sandbox.sheets.LISTINGS_UPDATE_RUNS._rows.slice(1);
const lastRun = (sandbox) => {
  const header = sandbox.sheets.LISTINGS_UPDATE_RUNS._rows[0];
  const row = runs(sandbox).at(-1);
  return Object.fromEntries(header.map((h, i) => [h, row[i]]));
};
const events = (sandbox) => (sandbox.sheets.LISTING_EVENTS ? sandbox.sheets.LISTING_EVENTS._rows.slice(1) : []);
const meta = (sandbox, key) => {
  const row = sandbox.sheets.APP_META._rows.find((r) => r[0] === key);
  return row ? row[1] : undefined;
};

// --- 1. o defeito da planilha ------------------------------------------------------------

test('sem autorização de rede o run é `failed`, nenhum anúncio é tocado e APP_META diz auth_required', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith([listing(), listing({ listing_id: 'LIST_WEB_QUINTOANDAR_894155475', portal: 'QuintoAndar', source_url: QA, external_id: '894155475' })]) });
  const { context } = sandbox;
  const authError = 'You do not have permission to call UrlFetchApp.fetchAll. Required permissions: https://www.googleapis.com/auth/script.external_request';
  context.UrlFetchApp = {
    fetchAll() { throw new Error(authError); },
    fetch() { throw new Error(authError); },
  };
  context.Utilities.sleep = () => {};
  context.ensureListingsRoutineSchema_();
  const before = JSON.stringify(sandbox.sheets.LISTINGS._rows);

  const message = context.runListingsVerify_({ now: day(0) });

  assert.match(message, /SEM AUTORIZAÇÃO/);
  assert.equal(JSON.stringify(sandbox.sheets.LISTINGS._rows), before, 'nenhuma célula de LISTINGS pode mudar');
  const run = lastRun(sandbox);
  assert.equal(run.status, 'failed', 'o defeito original: run com 154 erros gravado como success');
  assert.match(run.error_details, /^AUTHORIZATION_REQUIRED/);
  assert.equal(meta(sandbox, 'listings_update_status'), 'auth_required');
  assert.equal(events(sandbox).length, 0);
  assert.equal(sandbox.sheets.LISTINGS_HISTORY_MONTHLY._rows.length, 1, 'sem verificação, sem fechamento mensal');
});

test('`success` só com zero erros: um portal bloqueado deixa o run `partial`', () => {
  const rows = [listing(), listing({ listing_id: 'LIST_WEB_WIMOVEIS_3042738424', portal: 'Wimoveis', source_url: WI, external_id: '3042738424' })];
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith(rows) });
  installNetwork(sandbox.context, { [DF]: response(200, jsonLdPage()), [WI]: response(403, 'Forbidden') });

  sandbox.context.runListingsVerify_({ now: day(0) });
  const run = lastRun(sandbox);
  assert.equal(run.status, 'partial');
  assert.equal(run.errors, 1);
  assert.equal(run.source_pages_read, 1);
  assert.equal(run.active_checks, 2);

  const ok = createAppsScriptSandbox({ sheets: sheetsWith([listing()]) });
  installNetwork(ok.context, { [DF]: response(200, jsonLdPage()) });
  ok.context.runListingsVerify_({ now: day(0) });
  assert.equal(lastRun(ok).status, 'success');
  assert.equal(meta(ok, 'listings_update_status'), 'ok');
});

// --- 2. bloqueio não é remoção ---------------------------------------------------------------

test('403, 429 e página de desafio, dia após dia, nunca inativam', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith([listing()]) });
  const answers = [response(403), response(429), response(200, CHALLENGE_PAGE), response(403), response(503)];
  for (let d = 0; d < answers.length; d++) {
    installNetwork(sandbox.context, { [DF]: answers[d] });
    sandbox.context.runListingsVerify_({ now: day(d) });
    assert.equal(cell(sandbox, 0, 'status'), 'active', `dia ${d}`);
    assert.ok(['blocked', 'error'].includes(cell(sandbox, 0, 'last_check_status')), `dia ${d}`);
    assert.ok(!cell(sandbox, 0, 'verification_failures'), 'bloqueio não soma confirmação de remoção');
  }
  assert.equal(lastRun(sandbox).status, 'failed', 'nada lido no run: failed, não partial');
  assert.equal(events(sandbox).length, 0);
});

test('404 em três dias distintos inativa, com evento; dois 404 no mesmo dia contam uma vez', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith([listing()]) });
  installNetwork(sandbox.context, { [DF]: response(404) });

  sandbox.context.runListingsVerify_({ now: day(0) });
  assert.equal(cell(sandbox, 0, 'verification_failures'), 1);
  sandbox.context.runListingsVerify_({ now: new Date(day(0).getTime() + 3600000), force: true });
  assert.equal(cell(sandbox, 0, 'verification_failures'), 1, 'mesmo dia não é nova confirmação');
  assert.equal(cell(sandbox, 0, 'status'), 'active');

  sandbox.context.runListingsVerify_({ now: day(1) });
  assert.equal(cell(sandbox, 0, 'verification_failures'), 2);
  assert.equal(cell(sandbox, 0, 'status'), 'active');

  sandbox.context.runListingsVerify_({ now: day(2) });
  assert.equal(cell(sandbox, 0, 'verification_failures'), 3);
  assert.equal(cell(sandbox, 0, 'status'), 'inactive');
  assert.deepEqual(cell(sandbox, 0, 'inactive_at'), day(2));
  const deactivated = events(sandbox).filter((e) => e[3] === 'deactivated');
  assert.equal(deactivated.length, 1);
  assert.equal(deactivated[0][2], 'LIST_WEB_DFIMOVEIS_1364276');
  assert.equal(lastRun(sandbox).confirmed_inactive, 1);
});

test('um dia ok no meio zera a contagem de remoção', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith([listing()]) });
  installNetwork(sandbox.context, { [DF]: response(404) });
  sandbox.context.runListingsVerify_({ now: day(0) });
  sandbox.context.runListingsVerify_({ now: day(1) });
  installNetwork(sandbox.context, { [DF]: response(200, jsonLdPage()) });
  sandbox.context.runListingsVerify_({ now: day(2) });
  assert.equal(cell(sandbox, 0, 'verification_failures'), 0);
  installNetwork(sandbox.context, { [DF]: response(404) });
  sandbox.context.runListingsVerify_({ now: day(3) });
  assert.equal(cell(sandbox, 0, 'status'), 'active');
});

test('anúncio inativo que volta a responder é reativado, com evento', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith([listing({
    status: 'inactive', inactive_at: new Date('2026-09-01T00:00:00Z'), verification_failures: 3,
    last_checked_at: new Date('2026-09-20T00:00:00Z'),
  })]) });
  installNetwork(sandbox.context, { [DF]: response(200, jsonLdPage()) });
  sandbox.context.runListingsVerify_({ now: day(0) });

  assert.equal(cell(sandbox, 0, 'status'), 'active');
  assert.equal(cell(sandbox, 0, 'inactive_at'), '');
  assert.equal(cell(sandbox, 0, 'verification_failures'), 0);
  assert.deepEqual(cell(sandbox, 0, 'last_seen_at'), day(0));
  assert.deepEqual(events(sandbox).map((e) => e[3]), ['reactivated']);
  assert.equal(lastRun(sandbox).reactivated_listings, 1);
});

test('inativo é reconferido só a cada sete dias', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith([listing({
    status: 'inactive', last_checked_at: day(-3),
  })]) });
  const calls = installNetwork(sandbox.context, { [DF]: response(404) });
  sandbox.context.runListingsVerify_({ now: day(0) });
  assert.equal(calls.length, 0);
  sandbox.context.runListingsVerify_({ now: day(5) });
  assert.equal(calls.length, 1);
});

// --- 3. preço ----------------------------------------------------------------------------------

test('preço novo dentro do teto é gravado, com preço/m², evento, CHANGE_LOG e observed_at', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith([listing()]) });
  installNetwork(sandbox.context, { [DF]: response(200, jsonLdPage({ price: 760000 })) });
  sandbox.context.runListingsVerify_({ now: day(0) });

  assert.equal(cell(sandbox, 0, 'asking_price_brl'), 760000);
  assert.equal(cell(sandbox, 0, 'asking_price_brl_m2'), 9500, 'era o derivado (800000/80): acompanha');
  assert.deepEqual(cell(sandbox, 0, 'last_price_change_at'), day(0));
  assert.deepEqual(cell(sandbox, 0, 'observed_at'), day(0));
  const change = events(sandbox).find((e) => e[3] === 'price_change');
  assert.ok(change);
  assert.equal(change[7], 800000);
  assert.equal(change[8], 760000);
  const log = sandbox.sheets.CHANGE_LOG._rows.slice(1);
  assert.equal(log.length, 1);
  assert.equal(log[0][2], 'asking_price_brl');
  assert.equal(log[0][7], lastRun(sandbox).run_id, 'correlation_id é o run');
  assert.equal(lastRun(sandbox).price_changes, 1);
});

test('preço/m² informado pela fonte com outro critério não é reescrito', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith([listing({ asking_price_brl_m2: 12500 })]) });
  installNetwork(sandbox.context, { [DF]: response(200, jsonLdPage({ price: 760000 })) });
  sandbox.context.runListingsVerify_({ now: day(0) });
  assert.equal(cell(sandbox, 0, 'asking_price_brl'), 760000);
  assert.equal(cell(sandbox, 0, 'asking_price_brl_m2'), 12500);
});

test('variação acima de 60% não é gravada: vira `price_unconfirmed`', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith([listing()]) });
  installNetwork(sandbox.context, { [DF]: response(200, jsonLdPage({ price: 2600 * 1000 })) });
  sandbox.context.runListingsVerify_({ now: day(0) });
  assert.equal(cell(sandbox, 0, 'asking_price_brl'), 800000);
  assert.deepEqual(events(sandbox).map((e) => e[3]), ['price_unconfirmed']);
  assert.equal(sandbox.sheets.CHANGE_LOG._rows.length, 1, 'nada no CHANGE_LOG');
});

test('preço igual ao da planilha confirma a observação sem gerar evento', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith([listing()]) });
  installNetwork(sandbox.context, { [DF]: response(200, jsonLdPage()) });
  sandbox.context.runListingsVerify_({ now: day(0) });
  assert.deepEqual(cell(sandbox, 0, 'observed_at'), day(0));
  assert.deepEqual(cell(sandbox, 0, 'source_page_verified_at'), day(0));
  assert.equal(cell(sandbox, 0, 'last_check_status'), 'ok');
  assert.equal(cell(sandbox, 0, 'last_check_http_code'), 200);
  assert.equal(cell(sandbox, 0, 'source_observed_at'), '2026-08-10');
  assert.equal(cell(sandbox, 0, 'parser_version'), sandbox.context.LISTINGS_PARSER_VERSION);
  assert.match(String(cell(sandbox, 0, 'content_hash')), /^[0-9a-f]{64}$/);
  assert.deepEqual(cell(sandbox, 0, 'first_seen_at'), new Date('2026-08-20T00:00:00Z'), 'preenchido de observed_at');
  assert.equal(events(sandbox).length, 0);
});

// --- 4. o que a página é -------------------------------------------------------------------

test('classificador: códigos HTTP e redirecionamentos', () => {
  const { context } = createAppsScriptSandbox();
  const c = (code, body = '', headers = {}) => context.classifyListingResponse_(DF, { code, body, headers }, '1364276').outcome;
  assert.equal(c(404), 'gone');
  assert.equal(c(410), 'gone');
  for (const code of [401, 403, 429, 451]) assert.equal(c(code), 'blocked', `HTTP ${code}`);
  for (const code of [500, 502, 503]) assert.equal(c(code), 'error', `HTTP ${code}`);
  assert.equal(context.classifyListingResponse_(DF, { error: 'timeout' }).outcome, 'error');
  assert.equal(c(301, '', { location: DF.replace('https://www.', 'https://') }), 'redirect', 'mesmo anúncio');
  assert.equal(c(302, '', { location: '/imoveis/venda/df/brasilia/aguas-claras' }), 'gone', 'para a busca');
  assert.equal(c(302, '', { location: '/captcha?return=x' }), 'blocked');
  assert.equal(c(302, ''), 'error', 'sem Location');
});

test('"jardim-botanico" no caminho não é rota de captcha; preço na URL não é id', () => {
  const { context } = createAppsScriptSandbox();
  // URL real da planilha (Imovelweb): o slug tem "botanico", que um padrão por substring lia como "bot".
  const imw = 'https://www.imovelweb.com.br/propriedades/casa-4-qts-4-suites-2-vagas-350m-cond-jardim-botanico-3043081631.html';
  const moved = imw.replace('https://www.', 'https://');
  assert.equal(context.classifyListingResponse_(imw, { code: 301, body: '', headers: { location: moved } }, '3043081631').outcome, 'redirect');
  assert.equal(context.classifyListingResponse_(imw, { code: 302, body: '', headers: { location: '/imoveis-venda-jardim-botanico.html' } }, '3043081631').outcome, 'gone');

  // URL real da planilha (VivaReal): `RS650000` é o preço, não identificador.
  const vr = 'https://www.vivareal.com.br/imovel/casa-2-quartos-setor-de-mansoes-do-lago-norte-brasilia-com-garagem-160m2-venda-RS650000-id-2907369820/';
  assert.deepEqual([...context.listingIdTokens_(vr, '')], ['2907369820']);
  assert.deepEqual([...context.listingIdTokens_(vr, '2907369820')], ['2907369820']);
  assert.deepEqual([...context.listingIdTokens_(QA, 'apartamento-4-quartos-asa-norte-brasilia')], ['894155475']);
  assert.deepEqual([...context.listingIdTokens_(DF, 248653.0)], ['248653']);
  const searchPage = '<html><body>Casas a partir de R$ 650000 no Lago Norte</body></html>';
  assert.equal(context.classifyListingResponse_(vr, { code: 200, body: searchPage }, '2907369820').outcome, 'error');
});

test('marcador de remoção só conta no texto visível, não dentro de script', () => {
  const { context } = createAppsScriptSandbox();
  const insideScript = `<html><body><div>Apartamento código 1364276</div><script>var e={notFound:"Este anúncio não está mais disponível"}</script></body></html>`;
  assert.equal(context.classifyListingResponse_(DF, { code: 200, body: insideScript }, '1364276').outcome, 'ok');
  assert.equal(context.classifyListingResponse_(DF, { code: 200, body: REMOVED_PAGE }, '1364276').outcome, 'gone');
});

test('aviso de indisponível escondido no HTML não conta como remoção', () => {
  // Revisão do Codex na #181: anúncio vivo pode carregar escondido o aviso que só aparece
  // quando ele sai. Antes, isso dava `gone` e três dias depois inativava um anúncio vivo.
  const { context } = createAppsScriptSandbox();
  const hiddenVariants = [
    '<div class="unavailable" style="display: none">Este anúncio não está mais disponível</div>',
    '<div hidden>Este anúncio não está mais disponível</div>',
    '<section class="banner d-none">Anúncio indisponível</section>',
    '<p aria-hidden="true">Imóvel indisponível</p>',
    // Segunda rodada do Codex: tag fora de qualquer lista fixa.
    '<a hidden>Este anúncio não está mais disponível</a>',
    '<button style="display:none" type="button">Anúncio indisponível</button>',
    '<custom-banner class="x hidden">Anúncio removido</custom-banner>',
  ];
  for (const hidden of hiddenVariants) {
    const live = jsonLdPage({ extra: hidden });
    assert.equal(context.classifyListingResponse_(DF, { code: 200, body: live }, '1364276').outcome, 'ok', hidden);
    const noData = `<html><body>Apartamento código 1364276 ${hidden}</body></html>`;
    assert.equal(context.classifyListingResponse_(DF, { code: 200, body: noData }, '1364276').outcome, 'ok', hidden);
  }
});

test('marcador numa página que ainda traz o anúncio é inconclusivo, não remoção', () => {
  const { context } = createAppsScriptSandbox();
  // Escondido de um jeito que a regex não pega (filho da mesma tag) e escondido por CSS
  // externo (classe que só a folha de estilo do portal conhece): o anúncio ainda está na
  // página — pelo dado estruturado ou pelo id — e isso impede a inativação.
  const nested = jsonLdPage({ extra: '<div style="display:none"><div>x</div><p>Anúncio indisponível</p></div>' });
  const byCss = '<html><body>Apartamento código 1364276<div class="modal-indisponivel">Este anúncio não está mais disponível</div></body></html>';
  for (const body of [nested, byCss]) {
    const verdict = context.classifyListingResponse_(DF, { code: 200, body }, '1364276');
    assert.equal(verdict.outcome, 'error');
    assert.match(verdict.message, /^CONFLICTING_SIGNALS/);
  }
  // Página que já não traz o anúncio (nem id nem dado): o marcador visível é remoção.
  assert.equal(context.classifyListingResponse_(DF, { code: 200, body: REMOVED_PAGE }, '1364276').outcome, 'gone');
});

test('lock da planilha ocupado: nada é gravado, e a continuação refaz a leitura', () => {
  // Revisão do Codex na #181: gravar sem o lock de documento disputa com a API de escrita,
  // a edição manual e o job de 6 h.
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith([listing()]), documentLockBusy: true });
  installNetwork(sandbox.context, { [DF]: response(200, jsonLdPage({ price: 760000 })) });
  sandbox.context.ensureListingsRoutineSchema_();
  const before = JSON.stringify(sandbox.sheets.LISTINGS._rows);
  const message = sandbox.context.runListingsVerify_({ now: day(0) });
  assert.match(message, /nada foi gravado/);
  assert.equal(JSON.stringify(sandbox.sheets.LISTINGS._rows), before);
  assert.equal(events(sandbox).length, 0);
  assert.equal(sandbox.sheets.CHANGE_LOG._rows.length, 1);
  assert.equal(lastRun(sandbox).status, 'failed');
  assert.match(lastRun(sandbox).error_details, /^DOCUMENT_LOCK_BUSY/);
  assert.deepEqual(sandbox.triggers.map((t) => t.getHandlerFunction()), ['listingsVerifyContinue']);
  assert.equal(sandbox.sheets.LISTINGS_HISTORY_MONTHLY._rows.length, 1, 'sem gravação, sem fechamento');
});

test('lock ocupado com a fila vazia também não fecha o mês', () => {
  // Segunda rodada do Codex: sem nada a conferir, `processed = 0` fazia a falta de lock
  // valer como "livre", e o fechamento mensal gravava enquanto outro escritor alterava LISTINGS.
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith([listing({ last_checked_at: day(0) })]), documentLockBusy: true });
  installNetwork(sandbox.context, {});
  sandbox.context.runListingsVerify_({ now: day(0) });
  assert.equal(sandbox.sheets.LISTINGS_HISTORY_MONTHLY._rows.length, 1);
  assert.equal(lastRun(sandbox).status, 'failed');
  assert.deepEqual(sandbox.triggers.map((t) => t.getHandlerFunction()), ['listingsVerifyContinue']);
});

test('página de desafio é bloqueio; reCAPTCHA num anúncio com dado é ok', () => {
  const { context } = createAppsScriptSandbox();
  assert.equal(context.classifyListingResponse_(DF, { code: 200, body: CHALLENGE_PAGE }, '1364276').outcome, 'blocked');
  const withRecaptcha = jsonLdPage({ extra: '<script src="https://www.google.com/recaptcha/api.js"></script><div class="g-recaptcha"></div>' });
  assert.equal(context.classifyListingResponse_(DF, { code: 200, body: withRecaptcha }, '1364276').outcome, 'ok');
});

test('vitrine de semelhantes sem o anúncio não confirma nada nem vira preço', () => {
  const { context } = createAppsScriptSandbox();
  const verdict = context.classifyListingResponse_(DF, { code: 200, body: similarListingsPage() }, '1364276');
  assert.equal(verdict.outcome, 'error');
  assert.equal(verdict.message, 'UNRECOGNIZED_PAGE');
  const parsed = context.parseListingHtml_(similarListingsPage(), ['1364276']);
  assert.equal(parsed.price, null);
  assert.deepEqual([...parsed.signals], ['ambiguous_3']);
});

test('com vitrine junto, o preço é o do candidato que carrega o id da URL', () => {
  const { context } = createAppsScriptSandbox();
  const page = jsonLdPage({ price: 790000 }).replace('</head>',
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'ItemList', itemListElement: [
      { item: { '@type': 'RealEstateListing', url: 'https://x/imovel/555555', offers: { price: 450000 } } },
    ] })}</script></head>`);
  const parsed = context.parseListingHtml_(page, ['1364276']);
  assert.equal(parsed.price, 790000);
  assert.equal(parsed.area, 80);
  assert.equal(parsed.priceSource, 'jsonld');
});

test('`__NEXT_DATA__`: pega o anúncio pelo id, não a vitrine', () => {
  const { context } = createAppsScriptSandbox();
  const parsed = context.parseListingHtml_(nextDataPage(), ['894155475']);
  assert.equal(parsed.price, 2500000);
  assert.equal(parsed.area, 160);
  assert.equal(parsed.bedrooms, 4);
  assert.equal(parsed.condo, 1800);
  assert.equal(parsed.priceSource, 'nextdata');
});

test('redirecionamento no mesmo anúncio é seguido; o resultado é o da página final', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith([listing()]) });
  const target = DF.replace('https://www.', 'https://');
  const calls = installNetwork(sandbox.context, {
    [DF]: response(301, '', { Location: target }),
    [target]: response(200, jsonLdPage()),
  });
  sandbox.context.runListingsVerify_({ now: day(0) });
  assert.deepEqual(calls, [DF, target]);
  assert.equal(cell(sandbox, 0, 'last_check_status'), 'ok');
  assert.equal(lastRun(sandbox).source_pages_requested, 2);
});

// --- 5. fila, lote e continuação ------------------------------------------------------------

test('fila maior que o lote agenda UMA continuação; o mês só fecha quando a fila do dia acaba', () => {
  const rows = [
    listing(),
    listing({ listing_id: 'LIST_WEB_QUINTOANDAR_894155475', portal: 'QuintoAndar', source_url: QA, external_id: '894155475', asking_price_brl: 2500000, area_m2: 160, asking_price_brl_m2: 15625 }),
    listing({ listing_id: 'LIST_WEB_WIMOVEIS_3042738424', portal: 'Wimoveis', source_url: WI, external_id: '3042738424' }),
  ];
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith(rows) });
  installNetwork(sandbox.context, {
    [DF]: response(200, jsonLdPage()), [QA]: response(200, nextDataPage()), [WI]: response(200, jsonLdPage({ url: WI })),
  });

  sandbox.context.runListingsVerify_({ now: day(0), maxPerRun: 1 });
  assert.deepEqual(sandbox.triggers.map((t) => t.getHandlerFunction()), ['listingsVerifyContinue']);
  assert.equal(sandbox.triggers[0]._spec.afterMs, 60000);
  assert.equal(sandbox.sheets.LISTINGS_HISTORY_MONTHLY._rows.length, 1, 'fila do dia não acabou: sem fechamento');

  sandbox.context.runListingsVerify_({ now: day(0), maxPerRun: 1 });
  assert.equal(sandbox.triggers.length, 1, 'gatilho pendente não duplica');
  assert.equal(cell(sandbox, 1, 'last_check_status'), 'ok');
  assert.equal(sandbox.sheets.LISTINGS_HISTORY_MONTHLY._rows.length, 1);

  sandbox.context.runListingsVerify_({ now: day(0), maxPerRun: 1 });
  assert.equal(cell(sandbox, 2, 'last_check_status'), 'ok');
  assert.equal(sandbox.sheets.LISTINGS_HISTORY_MONTHLY._rows.length, 4, 'fila acabou: mês fechado');
});

test('o handler da continuação apaga o próprio gatilho antes de rodar', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith([]) });
  const { context, triggers } = sandbox;
  context.scheduleOneOffTrigger_('listingsVerifyContinue', 60000);
  const seen = [];
  context.runListingsVerify_ = (options) => { seen.push({ options, pending: triggers.length }); return 'ok'; };
  context.listingsVerifyContinue();
  // JSON: o objeto `options` nasce no realm do vm, e deepEqual estrito compara protótipo.
  assert.equal(JSON.stringify(seen), JSON.stringify([{ options: { trigger: 'continuation' }, pending: 0 }]));
});

test('segunda execução no mesmo dia não reconfere nada nem muda LISTINGS', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith([listing()]) });
  const calls = installNetwork(sandbox.context, { [DF]: response(200, jsonLdPage({ price: 760000 })) });
  sandbox.context.runListingsVerify_({ now: day(0) });
  const after = JSON.stringify(sandbox.sheets.LISTINGS._rows);
  sandbox.context.runListingsVerify_({ now: new Date(day(0).getTime() + 7200000) });
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(sandbox.sheets.LISTINGS._rows), after);
  assert.equal(events(sandbox).length, 1);
});

test('lock de script ocupado: a execução desiste sem escrever', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith([listing()]), scriptLockBusy: true });
  installNetwork(sandbox.context, { [DF]: response(200, jsonLdPage()) });
  const message = sandbox.context.runListingsVerify_({ now: day(0) });
  assert.match(message, /em andamento/);
  assert.equal(sandbox.sheets.LISTINGS_UPDATE_RUNS, undefined);
});

test('status fora de active/inactive e fonte desligada não são conferidos', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith([
    listing({ status: 'removido_manual' }),
    listing({ listing_id: 'LIST_WEB_WIMOVEIS_3042738424', portal: 'Wimoveis', source_url: WI, external_id: '3042738424' }),
  ]) });
  sandbox.sheets.LISTING_SOURCES._rows[3][3] = false; // Wimoveis desligada
  const calls = installNetwork(sandbox.context, {});
  sandbox.context.runListingsVerify_({ now: day(0) });
  assert.deepEqual(calls, []);
});

test('lote respeita o teto por domínio', () => {
  const { context } = createAppsScriptSandbox();
  const items = Array.from({ length: 7 }, (_, i) => ({ url: `https://www.dfimoveis.com.br/imovel/a-${100000 + i}` }))
    .concat([{ url: QA }, { url: WI }]);
  const chunks = context.chunkByHost_(items, 8, 3);
  for (const chunk of chunks) {
    const df = chunk.filter((it) => it.url.includes('dfimoveis')).length;
    assert.ok(df <= 3, `lote com ${df} do mesmo domínio`);
  }
  assert.equal(chunks.flat().length, 9);
});

// --- 6. fechamento mensal --------------------------------------------------------------------

test('fechamento: só o confirmado no mês é active; o resto é unverified, e a métrica não o conta', () => {
  const rows = [
    listing(),
    listing({ listing_id: 'LIST_WEB_WIMOVEIS_3042738424', portal: 'Wimoveis', source_url: WI, external_id: '3042738424' }),
  ];
  const sheets = sheetsWith(rows);
  // Setembro gravado pela rotina antiga: preservado, não reescrito.
  sheets.LISTINGS_HISTORY_MONTHLY = [
    ['history_id', 'reference_month', 'listing_id', 'portal', 'external_id', 'status_at_month_end', 'asking_price_brl', 'area_m2', 'asking_price_brl_m2', 'bedrooms', 'suites', 'parking_spaces', 'property_type', 'transaction_type', 'address', 'locality', 'ra_geo_id', 'latitude', 'longitude', 'first_seen_at', 'last_seen_at', 'last_price_change_at', 'content_hash', 'capture_run_id', 'captured_at'],
    ['2026-09|LIST_WEB_DFIMOVEIS_1364276', new Date(2026, 8, 1), 'LIST_WEB_DFIMOVEIS_1364276', 'DFImoveis', '1364276', 'active', 800000, 80, 10000, 3, '', 2, 'apartamento', 'sale', '', 'Águas Claras', 'RA2026_RA-XX', '', '', '2026-08-20T00:00:00Z', '2026-08-20T00:00:00Z', '', '', 'RUN_OLD', new Date(2026, 8, 30)],
  ];
  const sandbox = createAppsScriptSandbox({ sheets });
  installNetwork(sandbox.context, { [DF]: response(200, jsonLdPage()), [WI]: response(403) });
  sandbox.context.runListingsVerify_({ now: day(0) });

  const history = sandbox.sheets.LISTINGS_HISTORY_MONTHLY._rows;
  const header = history[0];
  const byId = Object.fromEntries(history.slice(1).map((r) => [r[0], Object.fromEntries(header.map((h, i) => [h, r[i]]))]));
  assert.equal(byId['2026-09|LIST_WEB_DFIMOVEIS_1364276'].capture_run_id, 'RUN_OLD', 'mês anterior intocado');
  assert.equal(byId['2026-10|LIST_WEB_DFIMOVEIS_1364276'].status_at_month_end, 'active');
  assert.equal(byId['2026-10|LIST_WEB_WIMOVEIS_3042738424'].status_at_month_end, 'unverified');

  const metrics = sandbox.sheets.LISTINGS_MONTHLY_METRICS._rows;
  const mh = metrics[0];
  const m = metrics.slice(1).map((r) => Object.fromEntries(mh.map((h, i) => [h, r[i]])));
  assert.equal(m.length, 1, 'os dois anúncios caem no mesmo grupo');
  assert.equal(m[0].active_ads_count, 1, 'o Wimoveis bloqueado não conta como estoque');
  assert.equal(m[0].median_price, 800000);
  assert.equal(m[0].area_band, '80-119');
  assert.equal(m[0].source_count, 1);
  assert.equal(m[0].coverage_quality, 'single_source');
  assert.match(m[0].metric_id, /^METRIC_[0-9A-F]{24}$/);
  assert.equal(lastRun(sandbox).history_rows, 2);
});

test('validação: estoque sem confirmação, portal bloqueado e histórico active sem confirmação viram aviso agregado', () => {
  const sheets = sheetsWith([
    listing({ last_check_status: 'blocked' }),
    listing({ listing_id: 'LIST_WEB_DFIMOVEIS_2', last_check_status: 'error' }),
  ]);
  sheets.LISTINGS_HISTORY_MONTHLY = [
    ['history_id', 'reference_month', 'listing_id', 'status_at_month_end', 'last_seen_at'],
    ['2026-09|A', new Date(2026, 8, 1), 'A', 'active', '2026-08-18T03:00:00Z'],
    ['2026-09|B', new Date(2026, 8, 1), 'B', 'active', '2026-09-15T03:00:00Z'],
  ];
  const sandbox = createAppsScriptSandbox({ sheets });
  const findings = [];
  sandbox.context.validateListingsRoutine_((...f) => findings.push(f), day(0));
  const codes = findings.map((f) => `${f[5]}:${f[6].split(':')[0]}`);
  assert.deepEqual(codes.sort(), [
    'LISTING_HISTORY_UNVERIFIED:2026-09',
    'LISTING_PORTAL_BLOCKED:DFImoveis',
    'LISTING_STALE_VERIFICATION:DFImoveis',
  ]);
  assert.match(findings.find((f) => f[5] === 'LISTING_STALE_VERIFICATION')[6], /2 anúncio/);
  assert.equal(sandbox.context.qualityCategoryOf_('LISTING_HISTORY_UNVERIFIED'), 'source');
});

// --- 7. schema, gatilhos e diagnóstico ----------------------------------------------------------

test('o schema da rotina provisiona as 6 abas e só as 12 colunas operacionais em LISTINGS', () => {
  const seedHeaders = LISTINGS_HEADERS.slice(0, LISTINGS_HEADERS.indexOf('first_seen_at'));
  const sandbox = createAppsScriptSandbox({ sheets: { LISTINGS: [seedHeaders], APP_META: [['key', 'value', 'updated_at']] } });
  sandbox.context.ensureListingsRoutineSchema_();
  assert.deepEqual(sandbox.sheets.LISTINGS._rows[0], LISTINGS_HEADERS, 'mesma ordem da planilha viva');
  for (const name of ['LISTING_SOURCES', 'LISTING_CANDIDATES', 'LISTING_EVENTS', 'LISTINGS_UPDATE_RUNS', 'LISTINGS_HISTORY_MONTHLY', 'LISTINGS_MONTHLY_METRICS']) {
    assert.ok(sandbox.sheets[name], name);
  }
  assert.deepEqual(sandbox.sheets.LISTING_SOURCES._rows[0].slice(0, 14), SOURCES_HEADERS, 'as 14 da planilha viva primeiro');
  const second = JSON.stringify(Object.fromEntries(Object.entries(sandbox.sheets).map(([k, s]) => [k, s._rows])));
  sandbox.context.ensureListingsRoutineSchema_();
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(sandbox.sheets).map(([k, s]) => [k, s._rows]))), second, 'idempotente');
});

test('as colunas operacionais não são graváveis pela API de escrita', () => {
  const { context } = createAppsScriptSandbox();
  for (const column of context.LISTINGS_ROUTINE_COLUMNS) {
    assert.ok(!context.WRITE_ALLOWLIST.LISTINGS.includes(column), column);
  }
  for (const sheet of Object.keys(context.LISTINGS_ROUTINE_SHEETS)) {
    assert.ok(!context.WRITE_ALLOWLIST[sheet], sheet);
  }
});

test('installTriggers instala o gatilho diário e remove o órfão da rotina antiga', () => {
  const sandbox = createAppsScriptSandbox({ sheets: { APP_META: [['key', 'value', 'updated_at']] } });
  const { context, triggers } = sandbox;
  context.ScriptApp.newTrigger('runDailyListingsUpdate').timeBased().everyDays(1).create(); // handler que não existe
  context.ScriptApp.newTrigger('listingsVerifyJob').timeBased().everyDays(1).create();
  context.ScriptApp.newTrigger('syncFipezapFromStaging_UI').timeBased().everyDays(1).create(); // existe: fica

  const message = context.installTriggers();
  const handlers = triggers.map((t) => t.getHandlerFunction()).sort();
  assert.deepEqual(handlers, ['handleEdit', 'listingsVerifyJob', 'maintenanceJob', 'syncFipezapFromStaging_UI']);
  const daily = triggers.find((t) => t.getHandlerFunction() === 'listingsVerifyJob');
  assert.equal(daily._spec.everyDays, 1);
  assert.equal(daily._spec.atHour, 5);
  assert.equal(daily._spec.timezone, 'America/Sao_Paulo');
  assert.match(message, /órfãos removidos: runDailyListingsUpdate/);
});

test('diagnóstico grava em LISTING_SOURCES o que cada portal devolveu', () => {
  const rows = [
    listing(),
    listing({ listing_id: 'LIST_WEB_WIMOVEIS_3042738424', portal: 'Wimoveis', source_url: WI, external_id: '3042738424' }),
  ];
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith(rows) });
  installNetwork(sandbox.context, { [DF]: response(200, jsonLdPage()), [WI]: response(403, 'no') });
  const message = sandbox.context.diagnoseListingPortals_({ now: day(0) });
  assert.match(message, /DFImoveis: HTTP 200 · ok · preço via jsonld/);
  assert.match(message, /Wimoveis: HTTP 403 · blocked/);
  const s = sandbox.sheets.LISTING_SOURCES._rows;
  const h = s[0];
  const wim = s.find((r) => r[1] === 'Wimoveis');
  assert.equal(wim[h.indexOf('last_probe_http_code')], 403);
  assert.match(wim[h.indexOf('last_probe_result')], /^blocked/);
  assert.equal(sandbox.sheets.LISTINGS._rows[1][IX.last_check_status], '', 'diagnóstico não mexe em LISTINGS');
});

test('diagnóstico sem autorização devolve o caminho do conserto', () => {
  const sandbox = createAppsScriptSandbox({ sheets: sheetsWith([listing()]) });
  sandbox.context.UrlFetchApp = { fetchAll() { throw new Error('Você não tem permissão para chamar UrlFetchApp.fetchAll. Permissões necessárias: https://www.googleapis.com/auth/script.external_request'); } };
  const message = sandbox.context.diagnoseListingPortals_({ now: day(0) });
  assert.match(message, /Instalar gatilhos/);
  assert.equal(meta(sandbox, 'listings_update_status'), 'auth_required');
});

// --- 8. o manifesto ------------------------------------------------------------------------

test('appsscript.json declara o escopo de cada serviço que o Code.gs usa', async () => {
  // O defeito de origem foi exatamente este: o código chamava UrlFetchApp e o projeto não
  // tinha `script.external_request`. Com `oauthScopes` explícito, o Google NÃO infere escopo
  // nenhum — esquecer um aqui é o mesmo defeito, então a lista é cobrada contra o código.
  const { readFileSync } = await import('node:fs');
  const manifest = JSON.parse(readFileSync(new URL('../optional-apps-script/appsscript.json', import.meta.url), 'utf8'));
  const code = readFileSync(new URL('../optional-apps-script/Code.gs', import.meta.url), 'utf8');
  const scope = (s) => `https://www.googleapis.com/auth/${s}`;
  const needs = [
    [/UrlFetchApp\./, scope('script.external_request')],
    [/ScriptApp\.(newTrigger|getProjectTriggers|deleteTrigger)/, scope('script.scriptapp')],
    [/DriveApp\./, scope('drive')],
    [/SpreadsheetApp\.getUi\(/, scope('script.container.ui')],
    [/SpreadsheetApp\.openById\(/, scope('spreadsheets')],
    [/Session\.getActiveUser\(/, scope('userinfo.email')],
  ];
  for (const [usage, required] of needs) {
    assert.ok(usage.test(code), `o Code.gs não usa mais ${usage}; tire o escopo da lista`);
    assert.ok(manifest.oauthScopes.includes(required), `Code.gs usa ${usage} sem ${required} no manifesto`);
  }
  assert.equal(manifest.oauthScopes.length, needs.length, 'escopo a mais, sem uso no código');
  // Leitura pública do /exec (R4.7): só funciona executando como quem implantou.
  assert.deepEqual(manifest.webapp, { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' });
  assert.equal(manifest.timeZone, 'America/Sao_Paulo');
});
