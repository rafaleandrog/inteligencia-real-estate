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
const FIXTURE_ROW = {
  listing_id: 'LIST_FIXTURE', title: 'Anúncio de teste', address: 'Rua Fixture',
  locality: 'Asa Norte', ra_geo_id: 'RA2026_RA-I', property_type: 'apartamento',
  transaction_type: 'sale', status: 'active', portal: 'Fixture',
  source_url: 'https://example.com/fixture', source_url_type: 'individual_listing',
  source_page_verified_at: '2026-08-21', last_seen_at: '2026-08-21', observed_at: '2026-08-21',
  latitude: -15.7, longitude: -47.9, coordinate_precision: 'manual_entry',
  confidence_flag: 'manual_entry', asking_price_brl: 500000, area_m2: 100,
  asking_price_brl_m2: 5000, area_basis: 'portal_area_unspecified', bedrooms: 3,
  quality_flag: 'manual_entry',
};

await page.route('**/exec*', async (route) => {
  const req = route.request();
  if (req.method() === 'POST') {
    const body = req.postDataJSON();
    writeCalls.push(body);

    if (body.token !== 'valid-token') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        ok: false, error: { code: 'UNAUTHENTICATED', message: 'Token inválido.' },
      }) });
    }
    if (body.action === 'update' && body.expected_version !== String(datasetVersion)) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        ok: false, error: { code: 'VERSION_CONFLICT', message: 'Dataset mudou.' },
      }) });
    }
    datasetVersion += 1;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      ok: true, record: { ...FIXTURE_ROW, ...body.fields }, dataset_version: String(datasetVersion),
    }) });
  }

  return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    name: 'LISTINGS', dataset_version: String(datasetVersion), count: 1, rows: [FIXTURE_ROW],
  }) });
});

console.log('\n== 1. Portão de login ==');
await page.goto('http://localhost:8080/admin.html');
(await page.locator('#adminLogin').isVisible()) ? pass('tela de login aparece sem token')
                                                : fail('tela de login não aparece');
(await page.locator('#adminApp').isVisible()) ? fail('área admin visível sem autenticar')
                                              : pass('área admin escondida sem autenticar');

await page.fill('#adminLoginToken', 'valid-token');
await page.click('#adminLoginForm button[type=submit]');
await page.waitForTimeout(600);
(await page.locator('#adminApp').isVisible()) ? pass('área admin aparece após login')
                                              : fail('área admin não aparece após login');

console.log('\n== 2. Tabela e abas ==');
const tabs = await page.locator('.admin-tab').count();
tabs === 3 ? pass('três abas (LISTINGS/DEVELOPMENTS/ANCHORS)') : fail(`esperava 3 abas, achou ${tabs}`);
const rows = await page.locator('.admin-table tbody tr').count();
rows === 1 ? pass('tabela renderiza o registro da fixture') : fail(`esperava 1 linha, achou ${rows}`);

console.log('\n== 3. Criação: validação de obrigatórios ==');
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

console.log('\n== 4. Edição: só envia o campo mudado ==');
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
const statusAfterUpdate = await page.locator('#adminStatus').textContent();
/atualizado/i.test(statusAfterUpdate || '') ? pass('mensagem de sucesso do update aparece e não some com o reload')
                                            : fail('mensagem de sucesso ausente após update: ' + statusAfterUpdate);

console.log('\n== 5. Conflito de versão ==');
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

console.log('\n== 6. Exclusão ==');
await page.click('#adminFormWrap .admin-form-actions .btn-ghost').catch(() => {});
writeCalls = [];
await page.click('.admin-btn-danger >> nth=0');
await page.waitForTimeout(400);
const deleteCall = writeCalls.find((c) => c.action === 'delete');
deleteCall ? pass('exclusão dispara o doPost com action=delete após confirmação')
           : fail('exclusão não chamou a API');

console.log('\n== 7. Console e XSS ==');
const real = consoleErrors.filter((e) => !/ERR_TUNNEL|net::/i.test(e));
real.length === 0 ? pass('console sem erro de aplicação') : fail('erros no console: ' + JSON.stringify(real.slice(0, 3)));

console.log('\n== 8. Mobile 390px ==');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
overflow <= 1 ? pass('sem overflow horizontal em 390px') : fail(`overflow horizontal de ${overflow}px`);

console.log(`\n===== ${ok.length} ok, ${errors.length} falhas =====`);
await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
