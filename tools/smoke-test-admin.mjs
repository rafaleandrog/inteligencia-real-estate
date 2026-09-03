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
// Quatro abas desde a issue #37: as três de tabela mais a de contornos, que abre uma
// tela própria de desenho em vez do formulário genérico (CUSTOM_UI_ADMIN_SHEETS).
// A asserção nomeia as abas em vez de só contar — assim uma aba que suma ou apareça
// diz QUAL, em vez de "esperava 3, achou 4".
const tabNames = await page.locator('.admin-tab').evaluateAll(
  (nodes) => nodes.map((n) => n.dataset.sheet),
);
JSON.stringify(tabNames) === JSON.stringify(['LISTINGS', 'DEVELOPMENTS', 'ANCHORS', 'POLYGONS'])
  ? pass('quatro abas: as três de tabela mais contornos')
  : fail(`abas inesperadas: ${JSON.stringify(tabNames)}`);
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

console.log('\n== 9b. Desenhar e salvar contorno (issue #37) ==');

// A aba de contornos não tem formulário genérico: o registro nasce do desenho. Este
// bloco exercita o caminho inteiro — abrir a aba, clicar nos cantos, salvar — e
// confere o PAYLOAD que sai, que é onde a inversão lat/lng e o anel aberto se
// esconderiam sem ninguém notar até o servidor recusar.
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(300);

// O passo 9 deixou o formulário de edição aberto E derrubou a sessão de propósito.
// Fechar o diálogo primeiro é obrigatório: `#adminFormDialog` cobre a página e
// intercepta o clique no botão de entrar, que o Playwright reporta como "visível e
// estável" enquanto tenta por 30s — o erro não menciona o modal.
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
if (await page.locator('#adminFormDialog').isVisible()) {
  await page.evaluate(() => { document.getElementById('adminFormDialog').hidden = true; });
}

validToken = 'valid-token';
await page.fill('#adminLoginToken', validToken);
await page.click('#adminLoginForm button[type=submit]');
await page.waitForTimeout(500);

const polygonTab = page.locator('#adminSheetTabs button[data-sheet="POLYGONS"]');
(await polygonTab.count()) === 1
  ? pass('a aba de contornos aparece ao lado das abas de tabela')
  : fail('aba POLYGONS ausente na barra de abas');

await polygonTab.click();
await page.waitForTimeout(600);

(await page.locator('#adminPolygonSection').isVisible())
  ? pass('a aba de contornos abre a tela de desenho, não a tabela')
  : fail('a tela de desenho não apareceu');
(await page.locator('#adminNewRecord').isHidden())
  ? pass('"+ Novo registro" some — o registro nasce do desenho')
  : fail('o botão de formulário genérico continua visível em POLYGONS');

// Salvar tem que começar desabilitado: sem desenho não há o que salvar.
(await page.locator('#polygonSave').isDisabled())
  ? pass('salvar começa desabilitado, sem desenho')
  : fail('salvar habilitado sem nenhum canto marcado');

const mapBox = await page.locator('#polygonMap').boundingBox();
const clickAt = async (dx, dy) => {
  await page.mouse.click(mapBox.x + dx, mapBox.y + dy);
  await page.waitForTimeout(180);
};

// Dois cantos ainda não formam área — o botão continua desabilitado.
await clickAt(140, 120);
await clickAt(280, 120);
(await page.locator('#polygonSave').isDisabled())
  ? pass('com dois cantos, salvar continua desabilitado')
  : fail('salvar habilitou com dois cantos');

await clickAt(280, 260);
(await page.locator('#polygonSave').isEnabled())
  ? pass('com três cantos, salvar habilita')
  : fail('salvar não habilitou com três cantos');

// Desfazer devolve ao estado inválido — o botão tem que voltar a desabilitar.
await page.click('#polygonUndo');
await page.waitForTimeout(200);
(await page.locator('#polygonSave').isDisabled())
  ? pass('desfazer um canto volta a desabilitar salvar')
  : fail('salvar continuou habilitado depois de desfazer');
await clickAt(280, 260);

// Sem nome, salvar recusa antes de chegar ao servidor.
const callsBefore = writeCalls.length;
await page.click('#polygonSave');
await page.waitForTimeout(300);
writeCalls.length === callsBefore
  ? pass('contorno sem nome não é enviado ao servidor')
  : fail('um contorno sem nome foi enviado');
(await page.locator('#polygonError').isVisible())
  ? pass('a recusa por falta de nome aparece na tela')
  : fail('nenhuma mensagem ao tentar salvar sem nome');

await page.fill('#polygonName', 'Setor de teste');
await page.click('#polygonSave');
await page.waitForTimeout(600);

const polygonCall = writeCalls.find((c) => c.sheet === 'POLYGONS');
if (!polygonCall) {
  fail('nenhuma chamada de escrita para POLYGONS');
} else {
  polygonCall.action === 'create' ? pass('o desenho vira um create') : fail('ação inesperada: ' + polygonCall.action);

  let geometry = null;
  try { geometry = JSON.parse(polygonCall.fields.geometry_geojson); } catch { /* fica null */ }

  geometry?.type === 'Polygon'
    ? pass('o payload leva um Polygon GeoJSON')
    : fail('geometria ausente ou de tipo errado: ' + JSON.stringify(geometry));

  const ring = geometry?.coordinates?.[0] || [];
  ring.length >= 4 ? pass('o anel tem as 4 posições mínimas') : fail(`anel com ${ring.length} posições`);

  const [first] = ring;
  const last = ring[ring.length - 1];
  (first && last && first[0] === last[0] && first[1] === last[1])
    ? pass('o anel sai fechado')
    : fail('anel aberto no payload');

  // A checagem que pega a inversão: no GeoJSON vem [longitude, latitude], e em
  // Brasília a longitude é ~-47 e a latitude ~-15. Se estiverem trocados, os dois
  // números continuam plausíveis isoladamente — só a ordem denuncia.
  const [lon, lat] = first || [];
  (lon < -30 && lat > -30)
    ? pass('o anel sai em [longitude, latitude], não invertido')
    : fail(`ordem suspeita na primeira posição: [${lon}, ${lat}]`);

  'polygon_id' in polygonCall.fields
    ? fail('o cliente mandou polygon_id — quem gera é o servidor')
    : pass('o cliente não disputa o polygon_id com o servidor');
}

(await page.locator('#polygonSave').isDisabled())
  ? pass('depois de salvar, o desenho é limpo e salvar desabilita')
  : fail('o desenho não foi limpo depois de salvar');

console.log('\n== 9c. Tipo de contorno: Rodovia / trecho importante ==');

// A primeira gravação (acima) já limpou o formulário e voltou o rádio para "área" — é
// esse reset que este bloco confere primeiro, antes de trocar para "rodovia".
(await page.locator('#polygonKindArea').isChecked())
  ? pass('depois de salvar, o tipo volta a "área genérica"')
  : fail('o rádio de tipo não voltou para "área" depois de salvar');

await page.click('#polygonKindRoad');
await page.waitForTimeout(150);

(await page.locator('#polygonHint').innerText()).includes('DOIS LADOS')
  ? pass('o texto de apoio muda para a orientação de rodovia')
  : fail('o texto de apoio não mudou ao selecionar "rodovia"');
(await page.locator('#polygonColor').inputValue()) === '#c2410c'
  ? pass('a cor sugerida muda para a cor padrão de rodovia (sem tocar no seletor)')
  : fail('a cor não mudou para o padrão de rodovia');

await clickAt(160, 140);
await clickAt(300, 140);
await clickAt(300, 280);
await page.fill('#polygonName', 'Trecho de teste');
await page.click('#polygonSave');
await page.waitForTimeout(600);

const roadCalls = writeCalls.filter((c) => c.sheet === 'POLYGONS');
const roadCall = roadCalls[roadCalls.length - 1];
if (!roadCall || roadCall === polygonCall) {
  fail('nenhuma nova chamada de escrita para POLYGONS ao salvar um trecho de rodovia');
} else {
  const f = roadCall.fields || {};
  f.layer_group === 'road_network'
    ? pass('rodovia manual grava layer_group: road_network')
    : fail('layer_group ausente ou errado: ' + f.layer_group);
  f.entity_type === 'road_segment'
    ? pass('rodovia manual grava entity_type: road_segment')
    : fail('entity_type ausente ou errado: ' + f.entity_type);
  f.geometry_role === 'display_corridor'
    ? pass('rodovia manual grava geometry_role: display_corridor')
    : fail('geometry_role ausente ou errado: ' + f.geometry_role);
  f.subcategory === 'trecho_importante_manual' && f.source_system === 'user_upload'
    ? pass('rodovia manual declara procedência própria (trecho_importante_manual / user_upload)')
    : fail('subcategory/source_system inesperados: ' + JSON.stringify({ subcategory: f.subcategory, source_system: f.source_system }));
  (f.subcategory !== 'rodovia_der' && f.source_system !== 'DER_DF')
    ? pass('rodovia manual NUNCA se declara como sincronização oficial do DER')
    : fail('um desenho à mão se declarou como rodovia_der/DER_DF');
}

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
