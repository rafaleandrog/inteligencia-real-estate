import { chromium } from 'playwright';
const esquema = process.argv[2] || 'light';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: esquema });
const page = await ctx.newPage();
await page.route('**://*.tile.openstreetmap.org/**', r => r.abort());
await page.addInitScript(() => {
  const apply = () => { if (window.APP_CONFIG) window.APP_CONFIG.demoMode = true; };
  Object.defineProperty(window, 'APP_CONFIG', { configurable: true,
    set(v) { delete window.APP_CONFIG; window.APP_CONFIG = v; apply(); }, get() { return undefined; } });
});
await page.goto('http://localhost:8080/#mercado', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
for (const [id, nome] of [['marketCharts', 'graficos'], ['marketRegioes', 'regioes']]) {
  const el = page.locator('#' + id);
  if (await el.count() && await el.isVisible()) {
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await el.screenshot({ path: `/tmp/shots/z-${esquema}-${nome}.png` });
    console.log('capturado', nome);
  } else { console.log('ausente/oculto', nome); }
}
// abre a tabela de valores do primeiro gráfico para conferir o cabeçalho em mono
const sum = page.locator('#marketCharts .market-chart-valores > summary').first();
if (await sum.count()) {
  await sum.click(); await page.waitForTimeout(400);
  await page.locator('#marketCharts .market-chart').first().screenshot({ path: `/tmp/shots/z-${esquema}-tabela.png` });
  console.log('capturado tabela');
}
await b.close();
