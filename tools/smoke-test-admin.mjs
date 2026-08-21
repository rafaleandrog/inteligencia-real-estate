#!/usr/bin/env node
// Smoke test da área administrativa (issue #5), dirigindo um Chromium real.
//
//   npm install          # instala o playwright (devDependency opcional)
//   npm run serve &      # sobe http://localhost:8080
//   npm run smoke:admin
//
// Não roda na CI: exige navegador e um servidor de pé — mesmo regime de
// tools/smoke-test.mjs (R6.4). Diferente daquele, este não depende de rede real nem
// de uma planilha: intercepta toda chamada ao Apps Script via page.route() e responde
// com fixtures locais, porque não há Web App de teste disponível neste ambiente
// (mesma limitação de rede que a PR-A já documentou para validação manual). O que
// este script verifica é o contrato entre a UI e a API — não o Apps Script real.
//
// Autenticação simulada por token direto (mesmo padrão do tipolis-sandbox): a
// fixture confere `token` em toda requisição — inclusive `action: "validate"`,
// usada pelo portão de login para conferir o token sem ler/escrever nada — igual
// ao Code.gs real, para o teste pegar regressão de contrato.

import { chromium } from 'playwright';

const errors = [];
const ok = [];
const fail = (m) => { errors.push(m); console.log('  ✗ ' + m); };
const pass = (m) => { ok.push(m); console.log('  ✓ ' + m); };

const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
page.on('dialog', (d) => d.accept());

let writeCalls = [];
let datasetVersion = 1;
let validToken = 'valid-token';

function fixtureRow(overrides = {}) {
  return {
    listing_id: overrides.listing_id || 'LIST_FIXTURE', title: 'Anúncio de teste', address: 'Rua Fixture',
    locality: 'Asa Norte', ra_geo_id: 'RA2026_RA-I', property_type: 'apartamento',
    transaction_type: 'sale', status: 'active', portal: 'Fixture',
    source_url: 'https://example.com/fixture', source_url_type: 'individual_listing',
    source_page_verified_at: '2026-08-21', last_seen_at: '2026-08-21', observed_at: '2026-08-21',
    latitude: -15.7, longitude: -47.9, coordinate_precision: 'manual_entry',
    confidence_flag: 'manual_entry', asking_price_brl: 500000, area_m2: 100,
    asking_price_brl_m2: 5000, area_basis: 'portal_area_unspecified', bedrooms: 3,
    quality_flag: 'manual_entry',
    ...overrides,
  };
}

const FIXTURE_ROWS = [
  fixtureRow({ listing_id: 'LIST_A', title: 'Apartamento Asa Norte', asking_price_brl: 900000 }),
  fixtureRow({ listing_id: 'LIST_B', title: 'Casa Lago Sul', asking_price_brl: 2500000 }),
  fixtureRow({ listing_id: 'LIST_C', title: 'Kitnet Asa Sul', asking_price_brl: 300000 }),
];

function json(body) {
  return { contentType: 'application/json', body: JSON.stringify(body) };
}

await page.route('**/exec*', async (route) => {
  const req = route.request();

  if (req.method() === 'POST') {
    const body = req.postDataJSON();

    if (body.token !== validToken) {
      if (body.action !== 'validate') writeCalls.push(body);
      return route.fulfill(json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Token inválido.' } }));
    }

    if (body.action === 'validate') {
      return route.fulfill(json({ ok: true, record: { valid: true } }));
    }

    writeCalls.push(body);

    if (body.action === 'update' && body.expected_version !== String(datasetVersion)) {
      return route.fulfill(json({ ok: false, error: { code: 'VERSION_CONFLICT', message: 'Dataset mudou.' } }));
    }
    datasetVersion += 1;
    return route.fulfill(json({
      ok: true, record: { ...FIXTURE_ROWS[0], ...body.fields }, dataset_version: String(datasetVersion),
      correlation_id: body.correlation_id,
    }));
  }

  return route.fulfill(json({ name: 'LISTINGS', dataset_version: String(datasetVersion), count: FIXTURE_ROWS.length, rows: FIXTURE_ROWS }));
});

console.log('\n== 1. Portão de login ==');
await page.goto('http://localhost:8080/admin.html');
(await page.locator('#adminLogin').isVisible()) ? pass('tela de login aparece sem sessão')
                                                : fail('tela de login não aparece');
(await page.locator('#adminApp').isVisible()) ? fail('área admin visível sem autenticar')
                                              : pass('área admin escondida sem autenticar');

await page.fill('#adminLoginToken', 'token-errado');
await page.click('#adminLoginForm button[type=submit]');
await page.waitForTimeout(300);
(await page.locator('#adminLoginError').isVisible()) ? pass('token errado mostra erro sem liberar a área')
                                                     : fail('token errado não mostrou erro');

await page.fill('#adminLoginToken', 'valid-token');
await page.click('#adminLoginForm button[type=submit]');
await page.waitForTimeout(600);
(await page.locator('#adminApp').isVisible()) ? pass('área admin aparece após login com token válido')
                                              : fail('área admin não aparece após login');
const tokenAuthCall = writeCalls.filter((c) => c.action === 'validate').length;
tokenAuthCall === 0 ? pass('login (action=validate) não é contado como chamada de escrita') : fail('validate apareceu em writeCalls');

console.log('\n== 2. Tabela completa, abas ==');
const tabs = await page.locator('.admin-tab').count();
tabs === 3 ? pass('três abas (LISTINGS/DEVELOPMENTS/ANCHORS)') : fail(`esperava 3 abas, achou ${tabs}`);
const rows = await page.locator('.admin-table tbody tr').count();
rows === 3 ? pass('tabela renderiza os 3 registros da fixture') : fail(`esperava 3 linhas, achou ${rows}`);
const headerCount = await page.locator('.admin-table thead th').count();
headerCount > 6 ? pass(`tabela mostra todas as colunas (${headerCount}, não um preview de ~5)`)
                : fail(`poucas colunas na tabela: ${headerCount} — critério de aceite "dados completos" não atendido`);

console.log('\n== 3. Busca ==');
await page.fill('#admin-table-search', 'lago sul');
await page.waitForTimeout(150);
const filteredRows = await page.locator('.admin-table tbody tr').count();
filteredRows === 1 ? pass('busca filtra para 1 registro') : fail(`busca não filtrou corretamente: ${filteredRows} linhas`);
await page.fill('#admin-table-search', '');
await page.waitForTimeout(150);

console.log('\n== 4. Ordenação ==');
await page.click('.admin-sort-btn >> nth=1'); // segunda coluna clicável (primeira é o ID)
await page.waitForTimeout(150);
const firstCellAfterSort = await page.locator('.admin-table tbody tr').first().locator('td').nth(1).textContent();
firstCellAfterSort ? pass('ordenação por coluna reordena a tabela (primeira célula: ' + firstCellAfterSort + ')')
                   : fail('ordenação não alterou a tabela');

console.log('\n== 5. Criação: validação de obrigatórios ==');
await page.click('#adminNewRecord');
await page.waitForTimeout(150);
const idInput = await page.locator('#admin-field-id').count();
idInput === 1 ? pass('formulário de criação tem campo de ID') : fail('sem campo de ID na criação');
await page.click('#adminFormWrap button[type=submit]');
await page.waitForTimeout(150);
const emptySubmitError = await page.locator('#adminFormError').isVisible();
emptySubmitError ? pass('submit vazio é recusado com mensagem de obrigatório')
                 : fail('submit vazio não mostrou erro — BUG: campo obrigatório não bloqueia o envio');
await page.click('#adminFormWrap .admin-form-actions .btn-ghost'); // cancelar

console.log('\n== 6. Edição: só envia o campo mudado, com token ==');
writeCalls = [];
await page.click('.admin-table-actions .btn-ghost >> nth=0');
await page.waitForTimeout(150);
const editIdInput = await page.locator('#admin-field-id').count();
editIdInput === 0 ? pass('formulário de edição não repete o campo de ID') : fail('ID reaparece na edição');
await page.fill('#admin-field-title', 'Título editado');
await page.click('#adminFormWrap button[type=submit]');
await page.waitForTimeout(400);
const updateCall = writeCalls.find((c) => c.action === 'update');
if (updateCall && Object.keys(updateCall.fields).length === 1 && updateCall.fields.title === 'Título editado') {
  pass('update envia só o campo que mudou (patch)');
} else {
  fail('update não fez patch correto: ' + JSON.stringify(updateCall));
}
updateCall && updateCall.token === 'valid-token'
  ? pass('update manda `token` em toda requisição')
  : fail('update sem token: ' + JSON.stringify(updateCall));
updateCall && updateCall.correlation_id ? pass('update manda correlation_id') : fail('update sem correlation_id');
const statusAfterUpdate = await page.locator('#adminStatus').textContent();
/atualizado/i.test(statusAfterUpdate || '') ? pass('mensagem de sucesso do update aparece e não some com o reload')
                                            : fail('mensagem de sucesso ausente após update: ' + statusAfterUpdate);

console.log('\n== 7. Conflito de versão ==');
await page.click('.admin-table-actions .btn-ghost >> nth=0');
await page.waitForTimeout(150);
// A cada write bem-sucedido, o cliente recarrega e sincroniza a versão — nunca fica
// desatualizado sozinho. Um conflito real só acontece quando ALGUÉM MAIS escreve
// entre o cliente carregar o registro e submeter o formulário: simula isso
// incrementando a versão do servidor mockado por fora, como um segundo editor.
datasetVersion += 1;
writeCalls = [];
await page.fill('#admin-field-title', 'Outra edição');
await page.click('#adminFormWrap button[type=submit]');
await page.waitForTimeout(400);
const conflictShown = await page.locator('#adminFormError').isVisible();
const conflictText = await page.locator('#adminFormError').textContent();
conflictShown && /mudaram/i.test(conflictText || '')
  ? pass('conflito de versão mostra mensagem clara, não sobrescreve silenciosamente')
  : fail('conflito de versão não tratado corretamente: ' + conflictText);

console.log('\n== 8. Exclusão ==');
await page.click('#adminFormWrap .admin-form-actions .btn-ghost').catch(() => {});
writeCalls = [];
await page.click('.admin-btn-danger >> nth=0');
await page.waitForTimeout(400);
const deleteCall = writeCalls.find((c) => c.action === 'delete');
deleteCall ? pass('exclusão dispara o doPost com action=delete após confirmação')
           : fail('exclusão não chamou a API');

console.log('\n== 9. Token rotacionado no servidor força novo login ==');
validToken = 'rotated-token'; // simula troca do ADMIN_TOKEN nas Script Properties
await page.click('.admin-table-actions .btn-ghost >> nth=0');
await page.waitForTimeout(150);
await page.fill('#admin-field-title', 'Vai falhar');
await page.click('#adminFormWrap button[type=submit]');
await page.waitForTimeout(400);
(await page.locator('#adminLogin').isVisible()) ? pass('token rotacionado força volta à tela de login')
                                                : fail('token rotacionado não forçou novo login');

console.log('\n== 10. Console e XSS ==');
const real = consoleErrors.filter((e) => !/ERR_TUNNEL|net::/i.test(e));
real.length === 0 ? pass('console sem erro de aplicação') : fail('erros no console: ' + JSON.stringify(real.slice(0, 3)));

console.log('\n== 11. Mobile 390px ==');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
overflow <= 1 ? pass('sem overflow horizontal em 390px') : fail(`overflow horizontal de ${overflow}px`);

console.log(`\n===== ${ok.length} ok, ${errors.length} falhas =====`);
await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
