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

console.log('\n== 12c. Metadados do dataset (APP_META) ==');
// Sem APP_META publicada — o estado real da planilha hoje — a seção fica escondida
// em vez de aparecer vazia ou com travessões.
(await page.locator('#datasetMeta').isHidden())
  ? pass('sem APP_META publicada, a seção fica escondida')
  : fail('seção de metadados apareceu sem dados');

// Agora com APP_META, interceptando o demo.json para exercitar o caminho real de
// carregamento em vez de mexer no estado interno da aplicação.
const metaPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await metaPage.addInitScript(() => {
  Object.defineProperty(window, 'APP_CONFIG', {
    configurable: true,
    set(value) { delete window.APP_CONFIG; window.APP_CONFIG = value; if (value) value.demoMode = true; },
    get() { return undefined; },
  });
});
await metaPage.route('**/data/demo.json', async (route) => {
  const response = await route.fetch();
  const payload = await response.json();
  payload.meta = {
    ...payload.meta,
    last_data_change_at: '2026-08-19T18:40:00.000Z',
    dataset_version: '12',
    validation_status: 'warning',
    last_validation_at: '2026-08-19',
    validation_warnings: '3',
    rows_listings: '141',
    // Um valor hostil, para confirmar que metadado não vira markup.
    app_version: '<img src=x onerror=alert(1)>1.0.0',
  };
  await route.fulfill({ response, json: payload });
});
await metaPage.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await metaPage.waitForTimeout(1200);

(await metaPage.locator('#datasetMeta').isVisible())
  ? pass('com APP_META publicada, a seção aparece')
  : fail('seção de metadados não apareceu');

// "Atualizado em" é o único campo de resumo público (issue #19) — fica fora do
// <details> "Detalhes técnicos", no próprio #datasetMetaSummary.
const summary = await metaPage.textContent('#datasetMetaSummary');
/atualizado em/i.test(summary || '') ? pass('resumo mostra a data de atualização') : fail('resumo ausente: ' + summary);
/19\/08\/2026/.test(summary || '') ? pass('data em formato brasileiro') : fail('data não formatada: ' + summary);

// O resto (versão do dataset, status de validação etc.) é jargão de pipeline e
// fica recolhido dentro do <details>, longe do resumo público.
const metaRows = await metaPage.$$eval('#datasetMetaList dt', (nodes) => nodes.map((n) => n.textContent));
metaRows.includes('Atualizado em') ? fail('data não pode duplicar no bloco técnico: ' + metaRows) : pass('resumo não duplica no bloco técnico');
metaRows.includes('Dataset') ? pass('mostra a versão do dataset') : fail('versão ausente');
metaRows.includes('Qualidade') ? pass('mostra o estado da validação') : fail('qualidade ausente');

const dataFormatada = await metaPage.$$eval('#datasetMetaList dd', (n) => n.map((x) => x.textContent));
dataFormatada.includes('v12') ? pass('versão prefixada') : fail('versão sem prefixo');

// A legenda existe para o leitor não confundir o total publicado com o que os
// filtros deixam visível em "Camadas" — os dois coincidem sem filtro.
const caption = await metaPage.textContent('.meta-caption');
/antes dos filtros/i.test(caption || '')
  ? pass('legenda distingue total publicado de visível')
  : fail('legenda ausente: ' + caption);

const tone = await metaPage.getAttribute('#datasetMetaList .meta-status', 'data-tone');
tone === 'warning' ? pass('chip com o tom do status: ' + tone) : fail('tom incorreto: ' + tone);

const metaXss = await metaPage.evaluate(() => ({
  imgs: document.querySelectorAll('#datasetMeta img, #datasetMeta *[onerror]').length,
  texto: [...document.querySelectorAll('#datasetMetaList dd')].some((d) => d.textContent.includes('<img')),
}));
metaXss.imgs === 0 ? pass('metadado hostil não virou markup') : fail('markup injetado via APP_META!');
metaXss.texto ? pass('valor hostil permanece como texto') : fail('valor hostil sumiu do DOM');

await metaPage.screenshot({ path: process.env.SHOT_META || 'meta.png' });
await metaPage.close();

/**
 * Abre a página com o demo.json SEM as colunas indicadas.
 *
 * O caminho "sem dado" continua real — a planilha do usuário ainda não preencheu esses
 * campos — mas não pode depender de o `data/demo.json` versionado por acaso não ter a
 * coluna. Desde que o gerador passou a derivar `group`/`segment`/`sales_stage`, essa
 * premissa caiu: as checagens de ausência viravam vermelhas sem nada no código de tela ter
 * mudado. Mesma lição da R8.39 — quando a semente deixa de ser autoridade sobre "que
 * colunas existem", todo teste que a usava como verdade muda de significado em silêncio.
 */
async function abrirSemColunas(porEntidade) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.addInitScript(() => {
    Object.defineProperty(window, 'APP_CONFIG', {
      configurable: true,
      set(value) { delete window.APP_CONFIG; window.APP_CONFIG = value; if (value) value.demoMode = true; },
      get() { return undefined; },
    });
  });
  await p.route('**/data/demo.json', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    for (const [entidade, colunas] of Object.entries(porEntidade)) {
      payload[entidade] = (payload[entidade] || []).map((linha) => {
        const copia = { ...linha };
        for (const coluna of colunas) delete copia[coluna];
        return copia;
      });
    }
    await route.fulfill({ response, json: payload });
  });
  await p.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  return p;
}

console.log('\n== 12d. Legenda de âncoras em dois níveis (issue #26) ==');
// O demo.json versionado agora É gerado com as derivações do backend, então a legenda
// agrupada aparece em modo demonstração SEM interceptar nada. É o que fecha o achado
// "wire the derivation into demo generation": prova que a derivação do gerador chega à tela.
const legendaDemo = await page.$$eval('#anchorLegend .anchor-legend-title', (ns) => ns.map((n) => n.textContent));
legendaDemo.includes('Infraestrutura') && legendaDemo.includes('Comércio e serviço')
  ? pass('modo demo sai com a legenda agrupada, sem interceptação: ' + JSON.stringify(legendaDemo))
  : fail('demo versionado não trouxe group derivado: ' + JSON.stringify(legendaDemo));
(await page.$$eval('#anchorGroup option', (o) => o.length)) > 1
  ? pass('filtro de grupo utilizável em modo demo, sem interceptação')
  : fail('select de grupo vazio no demo versionado');

// E o caminho "sem group/segment" — o estado da planilha real do usuário — continua
// coberto, agora REMOVENDO as colunas na interceptação em vez de contar com o artefato
// versionado não as ter.
const semGrupo = await abrirSemColunas({ anchors: ['group', 'segment'] });
const legendaPlana = await semGrupo.$$eval('#anchorLegend .anchor-legend-group', (secs) =>
  secs.map((sec) => sec.querySelector('.anchor-legend-title')?.textContent ?? null));
legendaPlana.length === 1 && legendaPlana[0] === null
  ? pass('sem group na planilha, a legenda continua plana')
  : fail('legenda inesperada sem group: ' + JSON.stringify(legendaPlana));
(await semGrupo.$$eval('#anchorGroup option', (o) => o.length)) === 1
  ? pass('select de grupo fica só com "Todos" quando ninguém classificou')
  : fail('select de grupo populado sem dado');
await semGrupo.close();

// Agora COM classificação, interceptando o demo.json — o único jeito de exercitar o
// caminho real de carregamento sem a planilha, que este ambiente não alcança.
const SEGMENTOS = {
  escola: ['comercio_servico', 'escola'],
  universidade: ['comercio_servico', 'universidade'],
  saude: ['comercio_servico', 'hospital'],
  supermercado_atacarejo: ['comercio_servico', 'supermercado'],
  shopping_center: ['comercio_servico', 'department_store'],
  mobilidade: ['infraestrutura', 'estacao_metro'],
  parque_equipamento_publico: ['infraestrutura', ''],
};

const anchorPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await anchorPage.addInitScript(() => {
  Object.defineProperty(window, 'APP_CONFIG', {
    configurable: true,
    set(value) { delete window.APP_CONFIG; window.APP_CONFIG = value; if (value) value.demoMode = true; },
    get() { return undefined; },
  });
});
await anchorPage.route('**/data/demo.json', async (route) => {
  const response = await route.fetch();
  const payload = await response.json();
  payload.anchors = payload.anchors.map((a, i) => {
    // A primeira recebe um segmento FORA do vocabulário do backend, com categoria
    // conhecida: é o caso que fazia legenda e mapa divergirem (a cor cai do segmento
    // desconhecido para a categoria, e a legenda precisa cair junto).
    if (i === 0) return { ...a, group: 'comercio_servico', segment: 'food_hall', brand_name: 'Marca <img src=x onerror=alert(1)>', occupied_area_m2: '2450' };
    if (i === 1) return { ...a, group: '', segment: '' }; // fica sem classificação
    const [group, segment] = SEGMENTOS[a.category] || ['', ''];
    return { ...a, group, segment };
  });
  await route.fulfill({ response, json: payload });
});
await anchorPage.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await anchorPage.waitForTimeout(1200);

const legenda = await anchorPage.$$eval('#anchorLegend .anchor-legend-group', (secs) =>
  secs.map((sec) => ({
    titulo: sec.querySelector('.anchor-legend-title')?.textContent ?? null,
    itens: [...sec.querySelectorAll('li')].map((li) => ({
      rotulo: li.textContent.trim(), cor: li.querySelector('.dot').style.background,
    })),
  })));
const titulos = legenda.map((sec) => sec.titulo);
JSON.stringify(titulos) === JSON.stringify(['Infraestrutura', 'Comércio e serviço', 'Sem classificação'])
  ? pass('legenda separa Infraestrutura de Comércio e serviço, com o não classificado no fim')
  : fail('títulos de grupo inesperados: ' + JSON.stringify(titulos));

legenda.some((sec) => sec.itens.some((i) => i.rotulo === 'Food hall'))
  ? pass('segmento fora do vocabulário vira rótulo legível, não slug cru')
  : fail('segmento desconhecido não apareceu humanizado na legenda');

// Legenda e mapa precisam usar EXATAMENTE o mesmo conjunto de cores. Cor na legenda
// que nenhum marcador usa (ou o contrário) é a legenda mentindo sobre o mapa.
const paraHex = (rgb) => '#' + rgb.match(/\d+/g).map((v) => Number(v).toString(16).padStart(2, '0')).join('');
const coresMapa = [...new Set(await anchorPage.$$eval('#map path.marker-anchor', (ns) => ns.map((n) => n.getAttribute('fill'))))].sort();
const coresLegenda = [...new Set(legenda.flatMap((sec) => sec.itens.map((i) => paraHex(i.cor))))].sort();
coresMapa.length > 1 ? pass(`âncoras usam ${coresMapa.length} cores distintas no mapa`) : fail('todas as âncoras na mesma cor');
JSON.stringify(coresMapa) === JSON.stringify(coresLegenda)
  ? pass('legenda e mapa usam o mesmo conjunto de cores')
  : fail(`legenda e mapa divergem\n    mapa:    ${coresMapa}\n    legenda: ${coresLegenda}`);

const totalAnchor = Number((await anchorPage.textContent('#kpiVisible')).replace(/\D/g, ''));
await anchorPage.selectOption('#anchorGroup', 'infraestrutura');
await anchorPage.waitForTimeout(400);
const soInfra = Number((await anchorPage.textContent('#kpiVisible')).replace(/\D/g, ''));
soInfra > 0 && soInfra < totalAnchor ? pass(`filtro de grupo reduziu ${totalAnchor} -> ${soInfra}`) : fail('filtro de grupo não reduziu');

const segmentosDoGrupo = await anchorPage.$$eval('#anchorSegment option', (o) => o.map((x) => x.textContent));
segmentosDoGrupo.includes('Estação de metrô') && !segmentosDoGrupo.includes('Escola')
  ? pass('select de segmento fica restrito ao grupo escolhido')
  : fail('segmentos fora do grupo: ' + JSON.stringify(segmentosDoGrupo));

await anchorPage.selectOption('#anchorSegment', 'estacao_metro');
await anchorPage.waitForTimeout(400);
const soMetro = Number((await anchorPage.textContent('#kpiVisible')).replace(/\D/g, ''));
soMetro > 0 && soMetro <= soInfra ? pass(`filtro de segmento reduziu ${soInfra} -> ${soMetro}`) : fail('filtro de segmento não reduziu');
(await anchorPage.$$eval('#map path.marker', (ns) => ns.every((n) => n.getAttribute('class').includes('marker-anchor'))))
  ? pass('filtrar âncora por grupo/segmento esconde as outras camadas')
  : fail('sobrou anúncio ou empreendimento com filtro de âncora ativo');

await anchorPage.selectOption('#anchorGroup', 'comercio_servico');
await anchorPage.waitForTimeout(400);
(await anchorPage.inputValue('#anchorSegment')) === ''
  ? pass('trocar de grupo zera segmento incompatível, sem filtro invisível ativo')
  : fail('segmento incompatível sobreviveu à troca de grupo');
await anchorPage.click('#clearFilters'); await anchorPage.waitForTimeout(400);

// P1 do review do Codex na PR #42: escolher SÓ o segmento, sem tocar no grupo, e
// limpar. Com a lista completa o segmento continua presente, e a rotina que repopula
// o select o restaurava — "Limpar filtros" não limpava (R8.43).
await anchorPage.selectOption('#anchorSegment', 'estacao_metro');
await anchorPage.waitForTimeout(400);
const comSegmento = Number((await anchorPage.textContent('#kpiVisible')).replace(/\D/g, ''));
comSegmento < totalAnchor ? pass(`só o segmento já filtra (${totalAnchor} -> ${comSegmento})`) : fail('segmento sozinho não filtrou');
await anchorPage.click('#clearFilters'); await anchorPage.waitForTimeout(400);
(await anchorPage.inputValue('#anchorSegment')) === ''
  ? pass('"Limpar filtros" zera o segmento escolhido sem grupo')
  : fail('segmento sobreviveu a "Limpar filtros"');
Number((await anchorPage.textContent('#kpiVisible')).replace(/\D/g, '')) === totalAnchor
  ? pass('"Limpar filtros" devolve o conjunto completo')
  : fail('conjunto não voltou ao total depois de limpar');

// Card de âncora: os campos novos aparecem, e `brand_name` hostil continua texto (R4.4).
await anchorPage.selectOption('#anchorSegment', 'food_hall');
await anchorPage.waitForTimeout(400);
await anchorPage.locator('#map path.marker-anchor').first().click({ force: true });
await anchorPage.waitForTimeout(400);
const cardAnchor = Object.fromEntries(
  await anchorPage.$$eval('#detailBody dt', (ns) => ns.map((n) => [n.textContent, n.nextElementSibling.textContent])));
cardAnchor['Grupo'] === 'Comércio e serviço' ? pass('card de âncora mostra o Grupo') : fail('Grupo no card: ' + cardAnchor['Grupo']);
cardAnchor['Segmento'] === 'Food hall' ? pass('card de âncora mostra o Segmento humanizado') : fail('Segmento no card: ' + cardAnchor['Segmento']);
cardAnchor['Área ocupada'] === '2.450 m²' ? pass('card de âncora mostra a Área ocupada (issue #39)') : fail('Área ocupada: ' + cardAnchor['Área ocupada']);
(cardAnchor['Marca'] || '').includes('<img') ? pass('brand_name hostil permanece texto no card') : fail('Marca no card: ' + cardAnchor['Marca']);
(await anchorPage.$$('#detailBody img, #detailBody *[onerror]')).length === 0
  ? pass('nenhum markup injetado por brand_name (R4.4)') : fail('markup injetado via brand_name!');
await anchorPage.close();

console.log('\n== 12e. Estágio, vertical/horizontal e regularização (issues #30, #31, #32) ==');
// Sem as colunas na planilha, os dois selects novos ficam só com a opção "todos" e o
// card do empreendimento não ganha selo nem linha vazia.
(await page.$$eval('#salesStage option', (o) => o.length)) === 1
  ? pass('sem sales_stage, o select de estágio fica só com "Todos"')
  : fail('select de estágio populado sem dado');
(await page.$$eval('#regularizationStatus option', (o) => o.length)) === 1
  ? pass('sem regularization_status, o select de regularização fica só com "Todas"')
  : fail('select de regularização populado sem dado');

const classPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await classPage.addInitScript(() => {
  Object.defineProperty(window, 'APP_CONFIG', {
    configurable: true,
    set(value) { delete window.APP_CONFIG; window.APP_CONFIG = value; if (value) value.demoMode = true; },
    get() { return undefined; },
  });
});
await classPage.route('**/data/demo.json', async (route) => {
  const response = await route.fetch();
  const payload = await response.json();
  const ESTAGIOS = ['em_construcao', 'em_lancamento', 'oferta'];
  const REGULARIZACAO = ['regularizado', 'nao_regularizado', 'em_regularizacao'];
  payload.developments = payload.developments.map((d, i) => ({
    ...d,
    // A primeira linha traz valor FORA do enum e `building_orientation` com espaço e
    // caixa — é célula digitada à mão, e é assim que ela chega na prática.
    sales_stage: i === 0 ? 'pre_lancamento' : ESTAGIOS[i % 3],
    building_orientation: i === 0 ? ' Vertical ' : (i % 2 ? 'vertical' : 'horizontal'),
    regularization_status: i === 0 ? 'processo_judicial' : REGULARIZACAO[i % 3],
  }));
  payload.listings = payload.listings.map((l, i) => ({ ...l, regularization_status: REGULARIZACAO[i % 3] }));
  await route.fulfill({ response, json: payload });
});
await classPage.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await classPage.waitForTimeout(1200);

const estagios = await classPage.$$eval('#salesStage option', (o) => o.map((x) => x.textContent));
estagios.includes('Em construção') && estagios.includes('Pre lancamento')
  ? pass('estágio fora do enum aparece humanizado em vez de sumir')
  : fail('opções de estágio: ' + JSON.stringify(estagios));
const regularizacoes = await classPage.$$eval('#regularizationStatus option', (o) => o.map((x) => x.textContent));
regularizacoes.includes('Não regularizado') && regularizacoes.includes('Processo judicial')
  ? pass('regularização é texto livre e o valor inesperado continua filtrável')
  : fail('opções de regularização: ' + JSON.stringify(regularizacoes));

const contarVisiveis = async () => Number((await classPage.textContent('#kpiVisible')).replace(/\D/g, ''));
const totalClass = await contarVisiveis();

await classPage.selectOption('#salesStage', 'oferta');
await classPage.waitForTimeout(400);
const emOferta = await contarVisiveis();
emOferta > 0 && emOferta < totalClass ? pass(`filtro de estágio reduziu ${totalClass} -> ${emOferta}`) : fail('filtro de estágio não reduziu');
(await classPage.$$eval('#map path.marker', (ns) => ns.every((n) => n.getAttribute('class').includes('marker-development'))))
  ? pass('filtrar por estágio esconde anúncios e âncoras') : fail('sobrou outra camada com filtro de estágio');
await classPage.click('#clearFilters'); await classPage.waitForTimeout(400);

await classPage.selectOption('#regularizationStatus', 'nao_regularizado');
await classPage.waitForTimeout(400);
const naoRegularizados = await contarVisiveis();
naoRegularizados > 0 && naoRegularizados < totalClass
  ? pass(`filtro de regularização reduziu ${totalClass} -> ${naoRegularizados}`) : fail('filtro de regularização não reduziu');
const camadasReg = await classPage.$$eval('#map path.marker', (ns) => [...new Set(ns.map((n) => n.getAttribute('class').split(' ')[1]))]);
camadasReg.includes('marker-listing') && camadasReg.includes('marker-development') && !camadasReg.includes('marker-anchor')
  ? pass('regularização cobre anúncio E empreendimento, e exclui âncora')
  : fail('camadas com filtro de regularização: ' + JSON.stringify(camadasReg));
await classPage.click('#clearFilters'); await classPage.waitForTimeout(400);

// Vertical/horizontal precisa alcançar o empreendimento, não só o anúncio — e o
// empreendimento cuja célula veio como " Vertical " é justamente o teste do caso real.
await classPage.selectOption('#buildingOrientation', 'vertical');
await classPage.waitForTimeout(400);
const devsVerticais = await classPage.$$eval('#map path.marker-development', (ns) => ns.length);
devsVerticais > 0
  ? pass(`filtro vertical alcança ${devsVerticais} empreendimento(s), inclusive o de célula " Vertical "`)
  : fail('nenhum empreendimento passou no filtro vertical');
await classPage.click('#clearFilters'); await classPage.waitForTimeout(400);

// Clique por evento no <path>: clique por coordenada acerta o marcador que estiver por
// cima, e as âncoras se sobrepõem aos empreendimentos em vários pontos.
await classPage.evaluate(() => document.querySelector('#map path.marker-development')
  .dispatchEvent(new MouseEvent('click', { bubbles: true })));
await classPage.waitForTimeout(400);
const seloEstagio = await classPage.textContent('#detailBody .detail-stage').catch(() => null);
seloEstagio ? pass(`card do empreendimento traz o selo de estágio: "${seloEstagio}"`) : fail('selo de estágio ausente');
const cardDev = Object.fromEntries(
  await classPage.$$eval('#detailBody dt', (ns) => ns.map((n) => [n.textContent, n.nextElementSibling.textContent])));
cardDev['Vertical / horizontal'] ? pass('card do empreendimento traz vertical/horizontal') : fail('vertical/horizontal ausente no empreendimento');
cardDev['Regularização'] ? pass('card do empreendimento traz a regularização') : fail('regularização ausente no empreendimento');
!('Estágio de comercialização' in cardDev) ? pass('estágio não duplica como linha da lista') : fail('estágio duplicado no card');
const ressalva = await classPage.textContent('#detailBody .field-note-inline').catch(() => null);
/não certidão oficial/i.test(ressalva || '')
  ? pass('regularização vem com a ressalva de procedência (R3.6/R8.15)')
  : fail('ressalva de procedência ausente: ' + ressalva);

await classPage.click('#closeDetail');
await classPage.evaluate(() => document.querySelector('#map path.marker-listing')
  .dispatchEvent(new MouseEvent('click', { bubbles: true })));
await classPage.waitForTimeout(400);
const cardListing = Object.fromEntries(
  await classPage.$$eval('#detailBody dt', (ns) => ns.map((n) => [n.textContent, n.nextElementSibling.textContent])));
cardListing['Regularização'] ? pass('card do anúncio traz a regularização') : fail('regularização ausente no anúncio');
cardListing['Vertical / horizontal'] ? pass('card do anúncio traz vertical/horizontal') : fail('vertical/horizontal ausente no anúncio');
(await classPage.$$('#detailBody .detail-stage')).length === 0
  ? pass('anúncio não recebe selo de estágio: o campo é só de empreendimento')
  : fail('selo de estágio apareceu num anúncio');
await classPage.close();

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
