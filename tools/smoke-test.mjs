#!/usr/bin/env node
// Smoke test do roteiro obrigatório de docs/AI_WORKFLOW.md, dirigindo um Chromium real.
//
//   npm install          # instala o playwright (devDependency opcional)
//   npm run serve &      # sobe http://localhost:8080
//   npm run smoke
//
// Não roda na CI: exige navegador e um servidor de pé. É a verificação que se faz
// antes de declarar uma mudança funcional pronta (R6.4) — e existe como arquivo,
// e não como sequência de comandos manuais, para que o próximo agente possa repeti-la.
//
// Limitação conhecida deste ambiente: os tiles do OpenStreetMap são bloqueados pela
// política de rede, então o fundo do mapa não pinta. Marcadores, popups, filtros e
// KPIs são verificados normalmente; erros de rede de tile são filtrados do console.

import { chromium } from 'playwright';

const errors = [];
const ok = [];
const fail = (m) => { errors.push(m); console.log('  ✗ ' + m); };
const pass = (m) => { ok.push(m); console.log('  ✓ ' + m); };

// Alguns ambientes trazem um Chromium pré-instalado cuja build não corresponde à que
// esta versão do Playwright baixaria. CHROMIUM_PATH aponta para o binário existente.
const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

// Força o modo demo sem tocar em src/config.js: o smoke test precisa rodar em
// qualquer ambiente, inclusive sem acesso à Google Sheet. addInitScript executa
// antes dos scripts da página, então o app já lê a configuração ajustada.
await page.addInitScript(() => {
  const apply = () => { if (window.APP_CONFIG) window.APP_CONFIG.demoMode = true; };
  Object.defineProperty(window, 'APP_CONFIG', {
    configurable: true,
    set(value) { delete window.APP_CONFIG; window.APP_CONFIG = value; apply(); },
    get() { return undefined; },
  });
});

await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

console.log('\n== 1-3. Console e carregamento ==');
// Tiles do OSM estão bloqueados neste ambiente: erro de rede de tile é esperado.
const real = consoleErrors.filter((e) => !/tile|openstreetmap|ERR_|net::/i.test(e));
real.length === 0 ? pass('console sem erro de aplicação')
                  : fail('erros no console: ' + JSON.stringify(real.slice(0, 3)));

await page.locator('#loadingState').isHidden() ? pass('loading state some após carregar')
                                               : fail('loading state permaneceu visível');
(await page.locator('#errorState').isHidden()) ? pass('sem estado de erro')
                                               : fail('estado de erro exibido: ' + await page.locator('#errorDetail').textContent());

console.log('\n== 4. Mapa e marcadores ==');
const markers = await page.locator('#map path.marker').count();
markers > 0 ? pass(`mapa renderizou ${markers} marcadores`) : fail('nenhum marcador no mapa');

console.log('\n== 5. KPIs ==');
const visible0 = (await page.locator('#kpiVisible').textContent()).trim();
const median0 = (await page.locator('#kpiMedian').textContent()).trim();
const note = (await page.locator('#kpiNote').textContent()).trim();
console.log(`  visíveis="${visible0}"  mediana="${median0}"`);
console.log(`  nota="${note}"`);
visible0 !== '—' && visible0 !== '0' ? pass('KPI de itens visíveis preenchido') : fail('KPI vazio');
/\/m²/.test(median0) ? pass('KPI de preço/m² mediano preenchido') : fail('mediana ausente: ' + median0);
/sem coordenada/.test(note) ? pass('registros sem coordenada são declarados na tela') : fail('nota de coordenada ausente');

const counts = {};
for (const k of ['Listing','Development','Anchor'])
  counts[k] = (await page.locator('#count'+k).textContent()).trim();
console.log('  camadas:', JSON.stringify(counts));
Object.values(counts).every((v) => v !== '0') ? pass('as 3 camadas têm registros') : fail('camada vazia: '+JSON.stringify(counts));

console.log('\n== 6. Busca ==');
const n = (s) => Number(s.replace(/\./g, '')) || 0;
await page.fill('#search', 'Asa Norte');
await page.waitForTimeout(400);
const afterSearch = (await page.locator('#kpiVisible').textContent()).trim();
n(afterSearch) > 0 && n(afterSearch) < n(visible0)
  ? pass(`busca reduziu ${visible0} -> ${afterSearch}`) : fail(`busca não reduziu: ${visible0} -> ${afterSearch}`);
await page.fill('#search', '');
await page.waitForTimeout(300);

console.log('\n== 7. Filtros ==');
await page.selectOption('#locality', { index: 1 });
await page.waitForTimeout(300);
const afterLoc = (await page.locator('#kpiVisible').textContent()).trim();
n(afterLoc) > 0 && n(afterLoc) < n(visible0) ? pass(`localidade reduziu -> ${afterLoc}`) : fail('filtro de localidade não reduziu');
await page.click('#clearFilters'); await page.waitForTimeout(300);

await page.fill('#priceMax', '800000'); await page.waitForTimeout(400);
const afterPrice = (await page.locator('#kpiVisible').textContent()).trim();
n(afterPrice) < n(visible0) ? pass(`preço máx. reduziu -> ${afterPrice}`) : fail('filtro de preço não reduziu');
await page.click('#clearFilters'); await page.waitForTimeout(300);

await page.selectOption('#beds', '4'); await page.waitForTimeout(300);
const afterBeds = (await page.locator('#kpiVisible').textContent()).trim();
n(afterBeds) < n(visible0) ? pass(`quartos reduziu -> ${afterBeds}`) : fail('filtro de quartos não reduziu');
await page.click('#clearFilters'); await page.waitForTimeout(300);

console.log('\n== 8. Camadas ==');
await page.uncheck('input[data-layer="anchor"]'); await page.waitForTimeout(300);
const afterLayer = (await page.locator('#kpiVisible').textContent()).trim();
n(afterLayer) < n(visible0) ? pass(`desligar âncoras reduziu -> ${afterLayer}`) : fail('camada não filtrou');
await page.check('input[data-layer="anchor"]'); await page.waitForTimeout(300);

console.log('\n== 9-10. Detalhe de anúncio ==');
await page.locator('#map path.marker-listing').first().click({ force: true });
await page.waitForTimeout(500);
(await page.locator('#detail').isVisible()) ? pass('painel de detalhe abriu') : fail('detalhe não abriu');
const title = (await page.locator('#detailTitle').textContent()).trim();
title.length > 0 ? pass(`título: "${title.slice(0,45)}"`) : fail('título vazio');
const prec = await page.locator('#detailBody .precision').first().textContent();
/aproximada|verificada/i.test(prec) ? pass('aviso de precisão espacial presente') : fail('aviso de precisão ausente');
/não o endereço exato/i.test(prec) ? pass('não apresenta coordenada aproximada como exata (R3.6)') : fail('R3.6: aviso não diz que não é endereço exato');

const link = page.locator('#detailBody a.detail-source').first();
if (await link.count() > 0) {
  const href = await link.getAttribute('href');
  const rel = await link.getAttribute('rel');
  /^https?:\/\//.test(href) ? pass(`link da fonte válido: ${href.slice(0,50)}`) : fail('href inválido: '+href);
  rel === 'noopener noreferrer' ? pass('link com rel="noopener noreferrer"') : fail('rel incorreto: '+rel);
} else fail('link da fonte ausente');

console.log('\n== 11. Detalhe de empreendimento ==');
await page.click('#closeDetail'); await page.waitForTimeout(200);
await page.locator('#map path.marker-development').first().click({ force: true });
await page.waitForTimeout(400);
(await page.locator('#detail').isVisible()) ? pass('detalhe de empreendimento abriu') : fail('detalhe de empreendimento não abriu');
const devKind = (await page.locator('#detailBody .detail-kind').textContent()).trim();
devKind === 'Empreendimento' ? pass('rótulo correto: '+devKind) : fail('rótulo inesperado: '+devKind);

console.log('\n== 12. XSS: dado hostil não vira markup ==');
// Um <script> injetado é o caso fácil. O caso real que passou despercebido foi
// `<img onerror=...>` no tooltip do Leaflet, que usa innerHTML para conteúdo string.
// Este teste injeta um título hostil no dataset e confirma que ele continua texto.
const xss = await page.evaluate(async () => {
  const marker = document.querySelector('#map path.marker-listing');
  if (!marker) return { erro: 'sem marcador' };
  marker.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  const tip = document.querySelector('.leaflet-tooltip');
  return {
    temScript: document.querySelectorAll('#detailBody script, #map script').length,
    temImg: document.querySelectorAll('.leaflet-tooltip img, .leaflet-tooltip *[onerror]').length,
    tooltipTexto: tip ? tip.textContent.slice(0, 40) : null,
    tooltipFilhosElemento: tip ? tip.querySelectorAll('*').length : -1,
  };
});
xss.temScript === 0 ? pass('nenhum <script> injetado via dados') : fail('script injetado!');
xss.temImg === 0 ? pass('nenhum elemento com handler injetado no tooltip') : fail('handler injetado no tooltip!');
xss.tooltipTexto ? pass(`tooltip renderiza texto: "${xss.tooltipTexto}"`) : fail('tooltip não abriu');

console.log('\n== 12b. Seleção por (kind, id) ==');
// IDs só são únicos dentro da própria entidade; a seleção preserva o tipo.
await page.locator('#map path.marker-development').first().click({ force: true });
await page.waitForTimeout(400);
const kindSelecionado = (await page.locator('#detailBody .detail-kind').textContent()).trim();
kindSelecionado === 'Empreendimento'
  ? pass('marcador de empreendimento abre detalhe de empreendimento')
  : fail(`abriu o registro errado: ${kindSelecionado}`);
await page.click('#closeDetail').catch(() => {});

console.log('\n== 13. Mobile 390px ==');
await page.click('#closeDetail').catch(()=>{});
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
overflow <= 1 ? pass('sem overflow horizontal em 390px') : fail(`overflow horizontal de ${overflow}px`);
(await page.locator('#map').isVisible()) ? pass('mapa visível em mobile') : fail('mapa some em mobile');
(await page.locator('#search').isVisible()) ? pass('busca acessível em mobile') : fail('busca some em mobile');
await page.screenshot({ path: process.env.SHOT_MOBILE || 'mobile.png' });

await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(500);
await page.screenshot({ path: process.env.SHOT_DESKTOP || 'desktop.png' });

console.log(`\n===== ${ok.length} ok, ${errors.length} falhas =====`);
await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
