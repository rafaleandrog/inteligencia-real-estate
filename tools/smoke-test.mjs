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
const consoleWarnings = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
  if (m.type() === 'warning') consoleWarnings.push(m.text());
});
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

// Avisos de contrato continuam disponíveis para o operador, mas ficam recolhidos
// no fluxo da barra lateral em vez de cobrir o mapa (issue #79).
(await page.locator('#warnings').count()) === 0
  ? pass('avisos técnicos não são renderizados sobre o mapa')
  : fail('o painel técnico #warnings continua na interface pública');
(await page.locator('#dataWarnings').isVisible()) && !(await page.locator('#dataWarnings').evaluate((node) => node.open))
  ? pass('avisos técnicos ficam visíveis e recolhidos na barra lateral')
  : fail('indicador recolhido de avisos técnicos não está disponível');
(await page.locator('#dataWarnings').evaluate((node) => !['absolute', 'fixed'].includes(getComputedStyle(node).position)))
  ? pass('avisos técnicos participam do fluxo e não sobrepõem o mapa')
  : fail('avisos técnicos ainda podem sobrepor o mapa');
(await page.locator('#dataWarningsList li').count()) > 0
  ? pass('detalhes dos avisos continuam acessíveis ao operador')
  : fail('detalhes dos avisos não chegaram à interface');
consoleWarnings.some((message) => message.includes('[imob] avisos:'))
  ? pass('avisos técnicos continuam disponíveis no console')
  : fail('avisos técnicos sumiram também do console');

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
// `sales_stage` é DERIVADO pelo gerador do demo, então o artefato versionado já o traz:
// checar a ausência sobre a `page` compartilhada mediria a coisa errada. A ausência é
// injetada, como na 12d. `regularization_status` não tem derivação e continua vazio no
// demo — mas é lido pela mesma fonte de propósito, para as duas asserções não
// dependerem de qual coluna por acaso está preenchida hoje (R8.39).
const semClassificacao = await abrirSemColunas({
  developments: ['sales_stage', 'regularization_status'],
  listings: ['regularization_status'],
});
(await semClassificacao.$$eval('#salesStage option', (o) => o.length)) === 1
  ? pass('sem sales_stage, o select de estágio fica só com "Todos"')
  : fail('select de estágio populado sem dado');
(await semClassificacao.$$eval('#regularizationStatus option', (o) => o.length)) === 1
  ? pass('sem regularization_status, o select de regularização fica só com "Todas"')
  : fail('select de regularização populado sem dado');
await semClassificacao.close();

// E a contrapartida positiva: com o demo versionado, que JÁ traz `sales_stage`
// derivado, o filtro de estágio precisa ser utilizável. Sem esta, a suíte só provaria
// que a tela aguenta a ausência — nunca que ela mostra o dado quando ele existe.
(await page.$$eval('#salesStage option', (o) => o.length)) > 1
  ? pass('com o demo versionado, o filtro de estágio é utilizável')
  : fail('select de estágio vazio mesmo com sales_stage derivado no demo');

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

console.log('\n== 12f. Indicadores por RA (issues #34, #35) ==');
const lerBlocoRa = (alvo) => alvo.evaluate(() => {
  const box = document.querySelector('#raProfile');
  if (!box || box.hidden) return null;
  return {
    stats: [...box.querySelectorAll('.ra-stats li')].map((li) => [
      li.querySelector('.ra-stat-label').textContent,
      li.querySelector('.ra-stat-value').textContent]),
    faixas: [...box.querySelectorAll('.ra-ages li')].map((li) => ({
      faixa: li.querySelector('.ra-age-label').textContent,
      valor: li.querySelector('.ra-age-value').textContent,
      largura: li.querySelector('.ra-age-bar').style.width,
    })),
    // A nota de composição é a primeira `.ra-ages-note`; o aviso de escala é a que
    // carrega também `.ra-scale-note`. Ler as duas pelo mesmo seletor pegaria uma pela
    // outra conforme a ordem no DOM.
    nota: box.querySelector('.ra-ages-note:not(.ra-scale-note)')?.textContent ?? null,
    avisoEscala: box.querySelector('.ra-scale-note')?.textContent ?? null,
    pendente: box.querySelector('.ra-profile-pending')?.textContent ?? null,
  };
});

// Sem RA selecionada o bloco fica escondido; com RA, população e densidade aparecem
// mesmo sem renda e sem faixa etária publicadas — que é o estado da planilha hoje.
(await lerBlocoRa(page)) === null ? pass('sem RA selecionada, o bloco de indicadores fica escondido')
                                  : fail('bloco de RA visível sem seleção');
await page.selectOption('#raFilter', { index: 1 });
await page.waitForTimeout(400);
const raSemDado = await lerBlocoRa(page);
raSemDado && raSemDado.stats.length >= 1
  ? pass('população/densidade continuam aparecendo sem os campos novos')
  : fail('bloco de RA vazio: ' + JSON.stringify(raSemDado));
raSemDado && raSemDado.faixas.length === 0 && raSemDado.nota === null
  ? pass('sem faixa etária publicada, nenhuma barra e nenhuma nota')
  : fail('gráfico desenhado sem dado: ' + JSON.stringify(raSemDado));
!raSemDado.stats.some(([k]) => k === 'Renda per capita')
  ? pass('sem renda publicada, a linha some em vez de virar travessão')
  : fail('linha de renda apareceu sem dado');
await page.click('#clearFilters'); await page.waitForTimeout(300);

const raPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await raPage.addInitScript(() => {
  Object.defineProperty(window, 'APP_CONFIG', {
    configurable: true,
    set(value) { delete window.APP_CONFIG; window.APP_CONFIG = value; if (value) value.demoMode = true; },
    get() { return undefined; },
  });
});
await raPage.route('**/data/demo.json', async (route) => {
  const response = await route.fetch();
  const payload = await response.json();
  // Quatro cenários no mesmo carregamento: completa; só renda; distribuição parcial;
  // e distribuição em escala decimal, que docs/DATA_CONTRACT.md admite.
  const PERFIS = {
    'RA2026_RA-I': { income_per_capita_brl: '3250.75', population_age_0_14_pct: '18.2',
      population_age_15_29_pct: '21.4', population_age_30_44_pct: '24.1',
      population_age_45_59_pct: '19.6', population_age_60_plus_pct: '16.7' },
    'RA2026_RA-V': { income_per_capita_brl: '1480' },
    'RA2026_RA-III': { population_age_0_14_pct: '18.2', population_age_60_plus_pct: '16.7' },
    'RA2026_RA-IX': { population_age_0_14_pct: '0.182', population_age_15_29_pct: '0.214',
      population_age_30_44_pct: '0.241', population_age_45_59_pct: '0.196',
      population_age_60_plus_pct: '0.167' },
    // RA criada depois da PDAD-A 2024: as colunas existem e estão vazias, e vão
    // continuar vazias até a próxima pesquisa (issue #54).
    'RA2026_RA-X': {
      profile_status: 'not_available_created_after_pdad_2024',
      predecessor_ra: 'Ceilândia',
      population_total: '', population_density_km2: '', income_per_capita_brl: '',
      population_age_0_14_pct: '', population_age_15_29_pct: '',
      population_age_30_44_pct: '', population_age_45_59_pct: '',
      population_age_60_plus_pct: '',
    },
  };
  payload.ra_profiles = payload.ra_profiles.map((r) => ({ ...r, ...(PERFIS[r.ra_geo_id] || {}) }));
  await route.fulfill({ response, json: payload });
});
await raPage.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await raPage.waitForTimeout(1200);

await raPage.selectOption('#raFilter', 'RA2026_RA-I');
await raPage.waitForTimeout(400);
const raCheia = await lerBlocoRa(raPage);
JSON.stringify(raCheia.stats.map(([k]) => k)) === JSON.stringify(['População', 'Densidade', 'Renda per capita'])
  ? pass('os três indicadores aparecem quando há dado') : fail('indicadores: ' + JSON.stringify(raCheia.stats));
JSON.stringify(raCheia.faixas.map((f) => f.faixa)) === JSON.stringify(['0–14', '15–29', '30–44', '45–59', '60+'])
  ? pass('as cinco faixas saem na ordem da pirâmide etária, não na alfabética')
  : fail('faixas: ' + JSON.stringify(raCheia.faixas.map((f) => f.faixa)));
// Barra ancorada em zero e proporcional: 18,2 / 24,1 = 75,5 % da régua.
Math.abs(parseFloat(raCheia.faixas[0].largura) - (18.2 / 24.1) * 100) < 0.5
  ? pass('comprimento da barra é proporcional ao valor desde o zero')
  : fail('barra fora de proporção: ' + raCheia.faixas[0].largura);
raCheia.faixas[0].valor === '18,2%' ? pass('cada linha traz o valor com vírgula decimal') : fail('valor: ' + raCheia.faixas[0].valor);
raCheia.nota === null ? pass('somando ~100 %, nenhuma nota de composição incompleta') : fail('nota indevida: ' + raCheia.nota);

await raPage.selectOption('#raFilter', 'RA2026_RA-V');
await raPage.waitForTimeout(400);
const raSoRenda = await lerBlocoRa(raPage);
raSoRenda.stats.some(([k]) => k === 'Renda per capita') && raSoRenda.faixas.length === 0
  ? pass('RA com renda e sem faixa mostra só a renda, sem deixar buraco')
  : fail('RA só com renda: ' + JSON.stringify(raSoRenda));

await raPage.selectOption('#raFilter', 'RA2026_RA-III');
await raPage.waitForTimeout(400);
const raParcial = await lerBlocoRa(raPage);
raParcial.faixas.length === 2 ? pass('faixa não publicada não vira barra de zero') : fail('faixas: ' + raParcial.faixas.length);
/somam 34,9% da população/.test(raParcial.nota || '')
  ? pass('composição incompleta é declarada na tela (R8.15)') : fail('nota ausente: ' + raParcial.nota);

await raPage.selectOption('#raFilter', 'RA2026_RA-IX');
await raPage.waitForTimeout(400);
const raDecimal = await lerBlocoRa(raPage);
raDecimal.faixas[0].valor === '18,2%'
  ? pass('escala decimal (0,182) vira porcento em vez de cinco barras invisíveis')
  : fail('escala decimal não convertida: ' + raDecimal.faixas[0].valor);
// A conversão está certa, mas não pode ser calada: hoje a causa é convenção, amanhã
// pode ser coluna trocada, e o número continuaria plausível (issue #54).
/escala decimal/.test(raDecimal.avisoEscala || '')
  ? pass('a conversão de escala é declarada na tela, não acontece em silêncio')
  : fail('conversão de escala silenciosa: ' + raDecimal.avisoEscala);
raCheia.avisoEscala === null
  ? pass('distribuição já em porcento não recebe aviso de escala')
  : fail('aviso de escala indevido: ' + raCheia.avisoEscala);

// RA sem perfil publicado: a tela diz por quê, em vez de sumir com o bloco.
await raPage.selectOption('#raFilter', 'RA2026_RA-X');
await raPage.waitForTimeout(400);
const raPendente = await lerBlocoRa(raPage);
raPendente && /ainda não disponíveis/.test(raPendente.pendente || '')
  ? pass('RA criada após a PDAD-A 2024 diz que o dado ainda não existe')
  : fail('RA pendente não explicada: ' + JSON.stringify(raPendente));
/Ceilândia/.test(raPendente?.pendente || '')
  ? pass('a nota aponta a RA de origem do território')
  : fail('RA de origem ausente na nota');
raPendente && raPendente.stats.length === 0 && raPendente.faixas.length === 0
  ? pass('RA pendente não mostra zero em indicador nenhum')
  : fail('RA pendente mostrou indicador: ' + JSON.stringify(raPendente));
await raPage.close();

// == Camada de contornos (issue #28) ==
//
// O demo.json publica `polygons: []` de propósito — polígono inventado num artefato
// publicado é geografia falsa. Aqui a camada é exercitada injetando um contorno
// SINTÉTICO por interceptação, do mesmo jeito que a APP_META acima: assim o caminho
// real de carregamento é testado sem sujar o dado versionado.
console.log('\n== 12g. Camada de contornos (issue #28) ==');

const polyPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await polyPage.addInitScript(() => {
  Object.defineProperty(window, 'APP_CONFIG', {
    configurable: true,
    set(value) { delete window.APP_CONFIG; window.APP_CONFIG = value; if (value) value.demoMode = true; },
    get() { return undefined; },
  });
});
await polyPage.route('**/data/demo.json', async (route) => {
  const response = await route.fetch();
  const payload = await response.json();
  payload.polygons = [
    {
      polygon_id: 'SMOKE_1',
      // Nome hostil: propriedade de KML de terceiro é entrada não confiável (R4.4).
      name: '<img src=x onerror=alert(1)>Contorno sintético',
      category: 'fixture',
      geometry_geojson: JSON.stringify({
        type: 'Polygon',
        coordinates: [[[-47.95, -15.82], [-47.85, -15.82], [-47.85, -15.74], [-47.95, -15.82]]],
      }),
      color: '#aa3344',
      description: 'Geometria de teste — não representa território real.',
      properties_json: '{"populacao":4321}',
      source_file: 'smoke.kml',
      imported_at: '2026-08-01',
      status: 'active',
    },
    {
      polygon_id: 'SMOKE_QUEBRADO',
      name: 'Geometria ilegível',
      geometry_geojson: '{isto nao e json',
      status: 'active',
    },
    // Região Administrativa: estilo declarado pelo backend (issue #52).
    {
      polygon_id: 'SMOKE_RA',
      name: 'RA sintética',
      layer_group: 'administrative_regions',
      entity_type: 'administrative_region',
      // Aponta para uma RA que EXISTE em data/demo.json, para o perfil vir do
      // normalizador de verdade em vez de um objeto montado à mão (issue #53).
      ra_geo_id: 'RA2026_RA-I',
      entity_id: 'RA2026_RA-I',
      // Retrato tirado na sincronização: com perfil canônico disponível, ele NÃO pode
      // ser despejado embaixo — duas verdades para o mesmo fato, e o valor velho aqui
      // é justamente o que envelhece sem sintoma.
      properties_json: '{"population_total":11111,"avg_household_size":2.9}',
      geometry_geojson: JSON.stringify({
        type: 'Polygon',
        // Cobre a rodovia (que é o ponto do teste de empilhamento) e para em -15.83,
        // acima do SMOKE_1: sobrepor os dois faria um roubar o clique do outro, que é
        // justamente o defeito que esta issue conserta — não o que ela deve reproduzir.
        coordinates: [[[-47.99, -15.90], [-47.80, -15.90], [-47.80, -15.83], [-47.99, -15.83], [-47.99, -15.90]]],
      }),
      fill_color: '#2f6f4f',
      stroke_color: '#123456',
      fill_opacity: 0.28,
      stroke_width: 1.2,
      status: 'active',
    },
    // Rodovia SOBRE a RA: é o caso que a issue #52 nomeia — hoje a RA cobriria o
    // corredor por sorteio, e cobrir rouba o clique junto com a cor.
    {
      polygon_id: 'SMOKE_ROAD',
      name: 'DF-999 · trecho sintético',
      layer_group: 'road_network',
      entity_type: 'road_segment',
      geometry_geojson: JSON.stringify({
        type: 'Polygon',
        coordinates: [[[-47.95, -15.85], [-47.85, -15.85], [-47.85, -15.84], [-47.95, -15.84], [-47.95, -15.85]]],
      }),
      fill_color: '#53606b',
      stroke_color: '#374151',
      fill_opacity: 0.35,
      stroke_width: 1.5,
      status: 'active',
    },
    // Estilo inteiramente inválido: cor que não é hex, opacidade fora de 0–1 e
    // espessura absurda. Precisa cair no fallback, não virar atributo SVG inválido.
    {
      polygon_id: 'SMOKE_ESTILO_INVALIDO',
      name: 'Estilo inválido',
      layer_group: 'road_network',
      entity_type: 'road_segment',
      geometry_geojson: JSON.stringify({
        type: 'Polygon',
        coordinates: [[[-47.70, -15.90], [-47.65, -15.90], [-47.65, -15.85], [-47.70, -15.90]]],
      }),
      fill_color: 'vermelho',
      stroke_color: 'rgb(1,2,3)',
      fill_opacity: 5,
      stroke_width: 999,
      status: 'active',
    },
    // Segundo TIPO dentro do grupo da malha rodoviária. Ele existe para que o segundo
    // nível da legenda exista: sem um grupo com mais de um tipo, a checagem do nível de
    // tipo passaria de qualquer jeito, e teste que não pode falhar não é teste.
    {
      polygon_id: 'SMOKE_ENTRONCAMENTO',
      name: 'Entroncamento sintético',
      layer_group: 'road_network',
      entity_type: 'road_junction',
      geometry_geojson: JSON.stringify({
        type: 'Polygon',
        coordinates: [[[-47.60, -15.95], [-47.58, -15.95], [-47.58, -15.93], [-47.60, -15.95]]],
      }),
      fill_color: '#8a5a2b',
      stroke_color: '#8a5a2b',
      fill_opacity: 0.4,
      stroke_width: 2,
      status: 'active',
    },
  ];
  await route.fulfill({ response, json: payload });
});
await polyPage.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await polyPage.waitForTimeout(1200);

(await polyPage.locator('#polygonLayers').isVisible())
  ? pass('com contorno na planilha, a caixa da camada aparece')
  : fail('caixa da camada de contornos não apareceu');

const polyCount = await polyPage.textContent('#countPolygon');
polyCount === '6' ? pass('a contagem mostra os contornos carregados') : fail('contagem errada: ' + polyCount);

// Um contorno com geometria ilegível some do mapa e os outros seguem (R2.6): dois
// registros carregados, um só caminho desenhado.
// `#map path` casaria com todo marcador — `circleMarker` do Leaflet também é <path>.
// A classe `.polygon-shape` isola os contornos.
const paths = await polyPage.evaluate(() => document.querySelectorAll('#map .polygon-shape').length);
paths === 5 ? pass('geometria ilegível não é desenhada, as boas continuam') : fail(`contornos desenhados: ${paths}`);

// `#map img` casaria com os tiles do OpenStreetMap — falso positivo garantido.
const polyXss = await polyPage.evaluate(
  () => document.querySelectorAll('#map img:not(.leaflet-tile)').length,
);
polyXss === 0 ? pass('nome hostil de contorno não virou markup') : fail('markup injetado via POLYGONS!');

// Clique no contorno abre o painel com as propriedades do KML.
//
// O contorno é escolhido pela COR, não por ser o primeiro do documento: a ordem no SVG
// agora vem do dado (issue #52), então "o primeiro" deixou de ser o contorno do KML e
// passou a ser a RA. Depender da ordem do documento era frágil antes e ficou errado
// agora — a cor identifica o registro que este bloco quer, sem depender de empilhamento.
await polyPage.click('#map .polygon-shape[fill="#aa3344"]');
await polyPage.waitForTimeout(400);
const polyDetail = await polyPage.textContent('#detail');
/4321/.test(polyDetail || '')
  ? pass('clique no contorno abre o painel com as propriedades do KML')
  : fail('painel do contorno sem as propriedades: ' + polyDetail);
/smoke\.kml/.test(polyDetail || '')
  ? pass('o painel nomeia o arquivo de origem')
  : fail('arquivo de origem ausente no painel');

// == Perfil da Região Administrativa no painel (issue #53) ==
console.log('\n== 12i. Clique numa RA abre o perfil de RA_PROFILES (issue #53) ==');

await polyPage.click('#map .polygon-shape[fill="#2f6f4f"]');
await polyPage.waitForTimeout(400);
const raDetail = (await polyPage.textContent('#detail')) || '';

/População/.test(raDetail)
  ? pass('o painel da RA abre com os indicadores do perfil')
  : fail('painel da RA sem indicadores: ' + raDetail);
/RA_PROFILES/.test(raDetail)
  ? pass('o painel diz de onde veio o perfil')
  : fail('o painel não nomeia a fonte do perfil');
// O retrato preso no properties_json não pode aparecer ao lado do perfil canônico: o
// valor velho e o novo lado a lado não dizem a quem lê qual dos dois está certo.
!/11\.?111/.test(raDetail)
  ? pass('properties_json não é despejado quando existe perfil canônico')
  : fail('o retrato velho do properties_json apareceu junto do perfil: ' + raDetail);
!/avg_household_size/.test(raDetail)
  ? pass('chave crua do properties_json não vira rótulo na RA')
  : fail('chave crua apareceu como rótulo: ' + raDetail);

// Contorno que NÃO é RA continua caindo no properties_json — é a única informação que
// ele tem, e sem perfil canônico não há duplicação possível.
await polyPage.click('#map .polygon-shape[fill="#aa3344"]');
await polyPage.waitForTimeout(400);
const kmlDetail = (await polyPage.textContent('#detail')) || '';
/4321/.test(kmlDetail)
  ? pass('contorno sem perfil continua mostrando as propriedades do KML')
  : fail('propriedades do KML sumiram do contorno sem perfil: ' + kmlDetail);
!/RA_PROFILES/.test(kmlDetail)
  ? pass('contorno sem perfil não afirma uma fonte que não usou')
  : fail('contorno sem perfil citou RA_PROFILES');

// == Legenda em dois níveis e estilo do backend (issues #51, #52) ==
console.log('\n== 12h. Camadas de contorno: grupo, tipo e estilo (issues #51, #52) ==');

const legendaTexto = (await polyPage.textContent('#polygonLayers')) || '';
/Regiões administrativas/.test(legendaTexto)
  ? pass('a legenda nomeia o grupo das Regiões Administrativas')
  : fail('grupo administrative_regions ausente da legenda: ' + legendaTexto);
/Malha rodoviária/.test(legendaTexto)
  ? pass('a legenda nomeia o grupo da malha rodoviária')
  : fail('grupo road_network ausente da legenda');
// Contorno antigo, sem `layer_group`, não pode sumir: cai em "Outros".
/Outros/.test(legendaTexto)
  ? pass('contorno sem layer_group aparece no grupo "Outros", não some')
  : fail('grupo "Outros" ausente — contorno sem layer_group sumiu');

// Estilo: a cor no mapa é a cor da planilha, não uma cor decorativa.
const estilos = await polyPage.evaluate(() => [...document.querySelectorAll('#map .polygon-shape')]
  .map((el) => ({
    fill: (el.getAttribute('fill') || '').toLowerCase(),
    stroke: (el.getAttribute('stroke') || '').toLowerCase(),
    width: el.getAttribute('stroke-width'),
  })));

estilos.some((e) => e.fill === '#2f6f4f' && e.stroke === '#123456' && e.width === '1.2')
  ? pass('a RA usa fill_color/stroke_color/stroke_width da planilha')
  : fail('estilo da RA não veio do backend: ' + JSON.stringify(estilos));
estilos.some((e) => e.fill === '#53606b' && e.width === '1.5')
  ? pass('a rodovia usa o estilo declarado pelo backend')
  : fail('estilo da rodovia não veio do backend: ' + JSON.stringify(estilos));
// Estilo inválido cai no fallback em vez de virar atributo SVG que o navegador ignora.
estilos.some((e) => e.fill === '#5b6b8c' && e.width === '2')
  ? pass('estilo inválido cai no fallback, não vira atributo SVG inválido')
  : fail('estilo inválido não caiu no fallback: ' + JSON.stringify(estilos));
estilos.every((e) => Number(e.width) > 0 && Number(e.width) <= 12)
  ? pass('nenhuma espessura absurda chegou ao SVG')
  : fail('espessura fora da faixa: ' + JSON.stringify(estilos));

// Ordem de empilhamento: área grande embaixo, corredor estreito em cima. No SVG do
// Leaflet, quem é desenhado depois fica por cima — então a RA precisa vir ANTES.
const ordem = await polyPage.evaluate(() => [...document.querySelectorAll('#map .polygon-shape')]
  .map((el) => (el.getAttribute('fill') || '').toLowerCase()));
ordem.indexOf('#2f6f4f') < ordem.indexOf('#53606b')
  ? pass('a RA é desenhada antes da rodovia — o corredor fica por cima')
  : fail('empilhamento errado: ' + JSON.stringify(ordem));

// E a ordem é a mesma depois de recarregar: ela vem do dado, não da ordem das linhas.
await polyPage.reload({ waitUntil: 'networkidle' });
await polyPage.waitForTimeout(1200);
const ordem2 = await polyPage.evaluate(() => [...document.querySelectorAll('#map .polygon-shape')]
  .map((el) => (el.getAttribute('fill') || '').toLowerCase()));
JSON.stringify(ordem) === JSON.stringify(ordem2)
  ? pass('o empilhamento é estável entre recarregamentos')
  : fail(`empilhamento mudou: ${JSON.stringify(ordem)} -> ${JSON.stringify(ordem2)}`);

// Desligar um grupo tira só aquele grupo.
await polyPage.uncheck('input[data-polygon-group="road_network"]');
await polyPage.waitForTimeout(400);
const semRodovia = await polyPage.evaluate(() => [...document.querySelectorAll('#map .polygon-shape')]
  .map((el) => (el.getAttribute('fill') || '').toLowerCase()));
!semRodovia.includes('#53606b')
  ? pass('desligar o grupo da malha rodoviária remove as rodovias')
  : fail('a rodovia continuou desenhada');
semRodovia.includes('#2f6f4f')
  ? pass('desligar um grupo não afeta os outros grupos')
  : fail('a RA sumiu junto com a rodovia');
const marcadoresComGrupoOff = await polyPage.evaluate(() => document.querySelectorAll('#map .marker').length);
marcadoresComGrupoOff > 0
  ? pass('desligar um grupo de contorno não afeta os marcadores')
  : fail('os marcadores sumiram ao desligar um grupo');
await polyPage.check('input[data-polygon-group="road_network"]');
await polyPage.waitForTimeout(300);

// Desligar um TIPO dentro de um grupo (segundo nível da legenda).
//
// O grupo da malha rodoviária tem dois tipos no fixture — trecho e entroncamento —, e é
// só por isso que este bloco pode falhar. O grupo das RAs tem um tipo só e não ganha
// sublista: repetir a caixa daria dois controles para a mesma decisão.
const caixasDeTipo = await polyPage.evaluate(() => [...document.querySelectorAll(
  '#polygonLayers input[data-polygon-type]',
)].filter((i) => !i.hidden).map((i) => i.dataset.polygonType));
caixasDeTipo.length === 2 && caixasDeTipo.every((k) => k.startsWith('road_network'))
  ? pass('o segundo nível aparece só no grupo com mais de um tipo')
  : fail('caixas de tipo inesperadas: ' + JSON.stringify(caixasDeTipo));

// A chave do tipo é `grupo\u0000tipo`: NUL não se escreve em seletor CSS, então a caixa
// é achada percorrendo o DOM.
await polyPage.evaluate(() => {
  const input = [...document.querySelectorAll('#polygonLayers input[data-polygon-type]')]
    .find((i) => i.dataset.polygonType.endsWith('road_junction'));
  input.checked = false;
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
await polyPage.waitForTimeout(400);
const semEntroncamento = await polyPage.evaluate(() => [...document.querySelectorAll('#map .polygon-shape')]
  .map((el) => (el.getAttribute('fill') || '').toLowerCase()));
!semEntroncamento.includes('#8a5a2b')
  ? pass('desligar um tipo remove só aquele tipo')
  : fail('o entroncamento continuou desenhado');
semEntroncamento.includes('#53606b')
  ? pass('desligar um tipo não afeta os outros tipos do mesmo grupo')
  : fail('o trecho rodoviário sumiu junto com o entroncamento');
semEntroncamento.includes('#2f6f4f')
  ? pass('desligar um tipo não afeta os outros grupos')
  : fail('a RA sumiu ao desligar um tipo da malha rodoviária');
await polyPage.evaluate(() => {
  const input = [...document.querySelectorAll('#polygonLayers input[data-polygon-type]')]
    .find((i) => i.dataset.polygonType.endsWith('road_junction'));
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
await polyPage.waitForTimeout(300);

// Desligar a camada tira os contornos sem mexer nos marcadores.
await polyPage.uncheck('input[data-layer="polygon"]');
await polyPage.waitForTimeout(400);
const afterUncheck = await polyPage.evaluate(() => document.querySelectorAll('#map .polygon-shape').length);
afterUncheck === 0 ? pass('desligar a camada remove os contornos') : fail(`contornos após desligar: ${afterUncheck}`);
const markersLeft = await polyPage.evaluate(() => document.querySelectorAll('#map .marker').length);
markersLeft > 0 ? pass('desligar contornos não afeta os marcadores') : fail('os marcadores sumiram junto');

await polyPage.close();

// Sem contorno nenhum — o estado normal da planilha hoje — a caixa nem aparece.
(await page.locator('#polygonLayers').isHidden())
  ? pass('sem contorno na planilha, a camada não aparece na legenda')
  : fail('caixa de contornos apareceu com a aba vazia');

console.log('\n== 12j. Troca de view: Mapa × Mercado Residencial DF (issue #58) ==');

const viewPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const viewErros = [];
viewPage.on('pageerror', (e) => viewErros.push(e.message));
await viewPage.addInitScript(() => {
  Object.defineProperty(window, 'APP_CONFIG', {
    configurable: true,
    set(value) { delete window.APP_CONFIG; window.APP_CONFIG = value; if (value) value.demoMode = true; },
    get() { return undefined; },
  });
});
await viewPage.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await viewPage.waitForTimeout(1200);

const lerView = (alvo) => alvo.evaluate(() => {
  // Conferir só a propriedade `.hidden` deixou passar o bug real da #78: o atributo
  // estava correto, mas `.layout { display:flex }` o vencia e o mapa seguia visível.
  const estaVisivel = (node) => {
    const box = node.getBoundingClientRect();
    return getComputedStyle(node).display !== 'none' && box.width > 0 && box.height > 0;
  };
  const mapView = document.querySelector('#mapView');
  const marketView = document.querySelector('#marketView');
  return {
    hash: location.hash,
    mapa: estaVisivel(mapView),
    mercado: estaVisivel(marketView),
    mapaHidden: mapView.hidden,
    mercadoHidden: marketView.hidden,
    botaoAtivo: document.querySelector('.view-tab[aria-pressed="true"]')?.dataset.view ?? null,
    desabilitado: document.querySelector('#marketTab').disabled,
    escopo: document.querySelector('#marketScope')?.textContent ?? '',
    // Leaflet mede o container quando ele está oculto e conclui tamanho zero: sem
    // invalidateSize() o mapa volta em branco, sem erro no console.
    mapaLargura: Math.round(document.querySelector('#map').getBoundingClientRect().width),
  };
});

const inicial = await lerView(viewPage);
inicial.mapa && !inicial.mercado
  ? pass('a página abre no mapa') : fail('view inicial errada: ' + JSON.stringify(inicial));
!inicial.desabilitado
  ? pass('com série de IVV carregada, o botão do Mercado fica habilitado')
  : fail('botão do Mercado desabilitado com dado presente');

// Ir para o Mercado.
await viewPage.click('#marketTab');
await viewPage.waitForTimeout(300);
const noMercado = await lerView(viewPage);
noMercado.mercado && !noMercado.mapa
  ? pass('o botão troca a view para o Mercado') : fail('não trocou: ' + JSON.stringify(noMercado));
noMercado.hash === '#mercado'
  ? pass('o hash reflete a view atual') : fail('hash: ' + noMercado.hash);
noMercado.botaoAtivo === 'mercado'
  ? pass('a aba ativa acompanha a view') : fail('aba ativa: ' + noMercado.botaoAtivo);
/Distrito Federal inteiro/.test(noMercado.escopo) && /Região Administrativa/.test(noMercado.escopo)
  ? pass('a tela declara o escopo do DF inteiro, sem recorte por RA')
  : fail('escopo não declarado: ' + noMercado.escopo);

// Cards do Mercado (issue #59). O fixture da demo tem UM mês da semente v1.0.0, e é
// pouco para exercitar variação — por isso a série é substituída por dois meses com os
// campos de variação preenchidos, na mesma interceptação que o resto do smoke já usa.
const cards = await viewPage.evaluate(() => {
  const linhas = [...document.querySelectorAll('#marketBody .market-row')];
  return {
    linhas: linhas.length,
    porLinha: linhas.map((l) => l.querySelectorAll('.market-card').length),
    primeiros: [...document.querySelectorAll('#marketBody .market-card-label')]
      .slice(0, 4).map((n) => n.textContent),
    ausentes: document.querySelectorAll('#marketBody .market-card-absent').length,
    travessoes: [...document.querySelectorAll('#marketBody .market-card-value')]
      .filter((n) => n.textContent.trim() === '\u2014').length,
  };
});
cards.linhas === 3 && cards.porLinha.every((n) => n === 4)
  ? pass('a grade tem três linhas de quatro cards')
  : fail('grade errada: ' + JSON.stringify(cards));
/Preço de venda/.test(cards.primeiros[0] || '') && /Preço pedido/.test(cards.primeiros[1] || '')
  ? pass('preços abrem a tela, antes de qualquer outro indicador')
  : fail('ordem dos cards: ' + JSON.stringify(cards.primeiros));
cards.travessoes === 0
  ? pass('nenhum card mostra travessão no lugar do valor')
  : fail(`${cards.travessoes} card(s) com travessão`);
cards.ausentes > 0
  ? pass(`${cards.ausentes} card(s) sem dado dizem isso por escrito, em vez de zero`)
  : pass('todos os cards têm valor nesta série');

const filtrosEGraficos = await viewPage.evaluate(() => ({
  modo: document.querySelector('#marketPeriodMode')?.value,
  anos: document.querySelector('#marketYear')?.options.length ?? 0,
  meses: document.querySelector('#marketMonth')?.options.length ?? 0,
  periodo: document.querySelector('#marketPeriodLabel')?.textContent ?? '',
  graficos: document.querySelectorAll('#marketCharts .market-chart').length,
  svgs: document.querySelectorAll('#marketCharts .market-chart-svg').length,
  pontos: document.querySelectorAll('#marketCharts circle').length,
}));
filtrosEGraficos.modo === 'ytd' && filtrosEGraficos.anos >= 1 && filtrosEGraficos.meses >= 1
  ? pass('os filtros abrem no acumulado do ano e expõem ano e mês disponíveis')
  : fail('filtros temporais incompletos: ' + JSON.stringify(filtrosEGraficos));
filtrosEGraficos.periodo.length > 0
  ? pass('a tela declara explicitamente o intervalo aplicado aos cards')
  : fail('rótulo do período ficou vazio');
filtrosEGraficos.graficos === 4 && filtrosEGraficos.svgs === 4 && filtrosEGraficos.pontos > 0
  ? pass('o dashboard renderiza quatro gráficos históricos com dados')
  : fail('gráficos históricos incompletos: ' + JSON.stringify(filtrosEGraficos));

const proveniencia = await viewPage.evaluate(() => ({
  linhas: document.querySelectorAll('#marketProvenanceList dt').length,
  temFonte: !document.querySelector('#marketSource').hidden,
}));
proveniencia.linhas >= 1
  ? pass(`a procedência mostra ${proveniencia.linhas} campo(s) do dataset`)
  : fail('procedência vazia');

// Tom da variação: o SIGNIFICADO manda, não o sinal. Distrato subindo é ruim, venda
// subindo é bom, e preço é neutro porque a tela não sabe de que lado está quem lê.
const tomPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await tomPage.addInitScript(() => {
  Object.defineProperty(window, 'APP_CONFIG', {
    configurable: true,
    set(value) { delete window.APP_CONFIG; window.APP_CONFIG = value; if (value) value.demoMode = true; },
    get() { return undefined; },
  });
});
await tomPage.route('**/data/demo.json', async (route) => {
  const response = await route.fetch();
  const payload = await response.json();
  const base = {
    geography_scope: 'Distrito Federal', source_publisher: 'Fixture sintético',
    sales_units: 400, offers_units: 6000, sold_area_m2: 28000, offer_area_m2: 500000,
    vgv_brl_million: 350, vgo_brl_million: 7000, vgl_brl_million: 240,
    cancellations_units: 90, launches_units: 700, ivv_pct: 0.065,
  };
  payload.ivv_monthly = [
    { ...base, reference_date: '2026-04-01' },
    {
      ...base,
      reference_date: '2026-05-01',
      // Ambas SOBEM. Uma tem que sair boa e a outra ruim.
      sales_units_mom_pct_change: 5.4,
      cancellations_units_mom_pct_change: 7.1,
      sale_price_brl_m2_mom_pct_change: 2.3,
      ivv_mom_pp: 0.4,
      ivv_mom_pct_change: 6.5,
    },
  ];
  await route.fulfill({ response, json: payload });
});
await tomPage.goto('http://localhost:8080/#mercado', { waitUntil: 'networkidle' });

await tomPage.waitForTimeout(1400);

const tons = await tomPage.evaluate(() => {
  const ler = (rotulo) => {
    const card = [...document.querySelectorAll('#marketBody .market-card')]
      .find((c) => c.querySelector('.market-card-label')?.textContent.includes(rotulo));
    if (!card) return null;
    return [...card.querySelectorAll('.market-delta')].map((d) => ({
      classe: d.className,
      label: d.querySelector('.market-delta-label').textContent,
      valor: d.querySelector('.market-delta-value').textContent,
      icone: d.querySelector('.market-delta-icon').textContent,
    }));
  };
  return {
    vendas: ler('Unidades vendidas'),
    distratos: ler('Unidades distratadas'),
    preco: ler('Preço de venda'),
    ivv: ler('IVV'),
  };
});

tons.vendas?.[0]?.classe.includes('market-delta-bom')
  ? pass('venda subindo sai como variação boa')
  : fail('tom de vendas: ' + JSON.stringify(tons.vendas));
tons.distratos?.[0]?.classe.includes('market-delta-ruim')
  ? pass('distrato subindo sai como variação RUIM, não boa (o sinal é o mesmo)')
  : fail('tom de distratos: ' + JSON.stringify(tons.distratos));
tons.preco?.[0]?.classe.includes('market-delta-neutro')
  ? pass('preço subindo é neutro: a tela não escolhe lado')
  : fail('tom de preço: ' + JSON.stringify(tons.preco));
tons.vendas?.[0]?.icone && tons.distratos?.[0]?.icone !== tons.vendas?.[0]?.icone
  ? pass('o tom não viaja só na cor: os ícones diferem')
  : fail('ícones iguais para tons opostos');

const rotulosIvv = (tons.ivv || []).map((d) => d.label);
const valoresIvv = (tons.ivv || []).map((d) => d.valor);
rotulosIvv.includes('vs mês anterior') && rotulosIvv.includes('vs mês anterior, em %')
  ? pass('o IVV separa pontos percentuais de variação percentual')
  : fail('rótulos do IVV: ' + JSON.stringify(rotulosIvv));
valoresIvv.some((v) => /p\.p\./.test(v)) && valoresIvv.some((v) => /%$/.test(v) && !/p\.p\./.test(v))
  ? pass('as duas grandezas do IVV saem com unidades distintas na tela')
  : fail('valores do IVV: ' + JSON.stringify(valoresIvv));

// A mesma série precisa mudar de soma YTD para leitura pontual quando o usuário escolhe
// um mês. O gráfico mantém o contexto histórico, sem somar pontos mensais entre si.
const lerVendasEPeriodo = (alvo) => alvo.evaluate(() => {
  const card = [...document.querySelectorAll('#marketBody .market-card')]
    .find((item) => item.querySelector('.market-card-label')?.textContent.includes('Unidades vendidas'));
  return {
    valor: card?.querySelector('.market-card-value')?.textContent ?? '',
    periodo: document.querySelector('#marketPeriodLabel')?.textContent ?? '',
    pontosVendas: document.querySelectorAll('[data-chart="activity"] circle').length,
  };
});
const vendasYtd = await lerVendasEPeriodo(tomPage);
/800/.test(vendasYtd.valor)
  ? pass('o acumulado do ano soma os fluxos mensais')
  : fail('vendas YTD não somadas: ' + JSON.stringify(vendasYtd));
await tomPage.selectOption('#marketPeriodMode', 'month');
await tomPage.selectOption('#marketYear', '2026');
await tomPage.selectOption('#marketMonth', '4');
await tomPage.waitForTimeout(250);
const vendasAbril = await lerVendasEPeriodo(tomPage);
/400/.test(vendasAbril.valor) && /abr\./i.test(vendasAbril.periodo)
  ? pass('selecionar abril troca os cards para o valor mensal correto')
  : fail('filtro mensal incorreto: ' + JSON.stringify(vendasAbril));
vendasAbril.pontosVendas >= 2
  ? pass('no modo mensal, o gráfico preserva contexto histórico anterior')
  : fail('o gráfico perdeu o histórico ao filtrar um mês: ' + JSON.stringify(vendasAbril));

// 390 px: os cards empilham em uma coluna.
await tomPage.setViewportSize({ width: 390, height: 844 });
await tomPage.waitForTimeout(400);
const empilha = await tomPage.evaluate(() => {
  const cards = [...document.querySelectorAll('#marketBody .market-row:first-child .market-card')];
  if (cards.length < 2) return null;
  const [a, b] = cards.map((c) => c.getBoundingClientRect());
  return { empilhado: b.top >= a.bottom - 1, largura: Math.round(a.width) };
});
empilha?.empilhado
  ? pass('em 390px os cards empilham em uma coluna')
  : fail('cards não empilharam em 390px: ' + JSON.stringify(empilha));
const overflowCards = await tomPage.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
overflowCards <= 1
  ? pass('os cards não estouram a largura em 390px')
  : fail(`overflow de ${overflowCards}px nos cards`);
await tomPage.close();

// Voltar para o mapa: o Leaflet precisa remedir o container.
await viewPage.click('.view-tab[data-view="mapa"]');
await viewPage.waitForTimeout(400);
const deVolta = await lerView(viewPage);
deVolta.mapa && !deVolta.mercado
  ? pass('voltar para o mapa esconde o Mercado') : fail('volta falhou: ' + JSON.stringify(deVolta));
deVolta.mapaLargura > 200
  ? pass('o mapa volta com tamanho — invalidateSize() rodou')
  : fail(`o mapa voltou com ${deVolta.mapaLargura}px de largura`);
const tilesDeVolta = await viewPage.evaluate(() => document.querySelectorAll('#map .leaflet-tile').length);
tilesDeVolta > 0
  ? pass('o mapa continua montado, não foi recriado do zero')
  : fail('o mapa perdeu os tiles ao voltar');

// Os filtros sobrevivem à ida e volta.
await viewPage.fill('#search', 'asa');
await viewPage.waitForTimeout(400);
const antes = await viewPage.textContent('#kpiVisible');
await viewPage.click('#marketTab');
await viewPage.waitForTimeout(250);
await viewPage.click('.view-tab[data-view="mapa"]');
await viewPage.waitForTimeout(400);
const depois = await viewPage.textContent('#kpiVisible');
(await viewPage.inputValue('#search')) === 'asa' && antes === depois
  ? pass('trocar de view e voltar não perde os filtros')
  : fail(`filtros perdidos: busca=${await viewPage.inputValue('#search')} kpi ${antes} -> ${depois}`);

// Link direto e recarga.
await viewPage.goto('http://localhost:8080/#mercado', { waitUntil: 'networkidle' });
await viewPage.waitForTimeout(1200);
const direto = await lerView(viewPage);
direto.mercado
  ? pass('recarregar em #mercado abre direto no dashboard')
  : fail('link direto falhou: ' + JSON.stringify(direto));

// Hash desconhecido cai no mapa, sem erro.
await viewPage.goto('http://localhost:8080/#nao-existe', { waitUntil: 'networkidle' });
await viewPage.waitForTimeout(1000);
const desconhecido = await lerView(viewPage);
desconhecido.mapa
  ? pass('hash desconhecido cai no mapa em vez de deixar a tela vazia')
  : fail('hash desconhecido: ' + JSON.stringify(desconhecido));

viewErros.length === 0
  ? pass('nenhum erro de execução durante a troca de view')
  : fail('erros: ' + viewErros.join(' | '));

// Sem a aba IVV_MONTHLY o botão não pode levar a uma tela vazia.
const semIvv = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await semIvv.addInitScript(() => {
  Object.defineProperty(window, 'APP_CONFIG', {
    configurable: true,
    set(value) { delete window.APP_CONFIG; window.APP_CONFIG = value; if (value) value.demoMode = true; },
    get() { return undefined; },
  });
});
await semIvv.route('**/data/demo.json', async (route) => {
  const response = await route.fetch();
  const payload = await response.json();
  payload.ivv_monthly = [];
  await route.fulfill({ response, json: payload });
});
await semIvv.goto('http://localhost:8080/#mercado', { waitUntil: 'networkidle' });
await semIvv.waitForTimeout(1200);
const vazio = await lerView(semIvv);
vazio.desabilitado
  ? pass('sem IVV_MONTHLY o botão do Mercado fica desabilitado')
  : fail('botão habilitado sem série');
vazio.mapa && !vazio.mercado
  ? pass('sem série, pedir #mercado cai no mapa em vez de abrir tela vazia')
  : fail('abriu tela vazia: ' + JSON.stringify(vazio));
(await semIvv.getAttribute('#marketTab', 'title'))?.includes('IVV_MONTHLY')
  ? pass('o botão desabilitado explica por quê')
  : fail('botão desabilitado sem explicação');
await semIvv.close();

// 390 px: as abas cabem sem empurrar a busca para fora.
await viewPage.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await viewPage.waitForTimeout(1000);
await viewPage.setViewportSize({ width: 390, height: 844 });
await viewPage.waitForTimeout(400);
const overflowView = await viewPage.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
overflowView <= 1
  ? pass('a barra com as duas abas não estoura em 390px')
  : fail(`overflow de ${overflowView}px em 390px com as abas`);
await viewPage.click('#marketTab');
await viewPage.waitForTimeout(300);
const overflowMercado = await viewPage.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
overflowMercado <= 1
  ? pass('a view do Mercado não estoura em 390px')
  : fail(`overflow de ${overflowMercado}px na view do Mercado`);
await viewPage.close();

console.log('\n== 13. Mobile 390px ==');
await page.click('#closeDetail').catch(()=>{});
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
overflow <= 1 ? pass('sem overflow horizontal em 390px') : fail(`overflow horizontal de ${overflow}px`);
(await page.locator('#map').isVisible()) ? pass('mapa visível em mobile') : fail('mapa some em mobile');
(await page.locator('#search').isVisible()) ? pass('busca acessível em mobile') : fail('busca some em mobile');

// Critério de aceite da issue #55, como checagem FIXA: o nível essencial do painel de
// detalhe cabe sem rolagem em 390 px. Sem esta trava o painel volta a crescer na
// próxima issue que precisar mostrar mais um campo — foi assim que ele chegou a ~30
// linhas de peso visual idêntico.
await page.locator('#map .marker').first().click();
await page.waitForTimeout(500);
const painel390 = await page.evaluate(() => {
  const detail = document.querySelector('#detail');
  if (!detail || detail.hidden) return null;
  const essencial = detail.querySelector('.detail-essential');
  if (!essencial) return { semEssencial: true };
  const caixa = detail.getBoundingClientRect();
  const fim = essencial.getBoundingClientRect().bottom;
  return {
    // Quanto do essencial fica ABAIXO da área visível do painel. Zero ou menos é o
    // essencial inteiro visível sem arrastar.
    excedente: Math.round(fim - caixa.bottom),
    linhas: essencial.querySelectorAll('dt').length,
    recolhidas: detail.querySelectorAll('details').length,
    // Rótulo com underscore é chave crua vazando para o nível de destaque.
    rotulos: [...essencial.querySelectorAll('dt')].map((n) => n.textContent),
  };
});

painel390 && !painel390.semEssencial
  ? pass('o painel de detalhe abre com um nível essencial em 390px')
  : fail('sem nível essencial no painel: ' + JSON.stringify(painel390));
painel390.excedente <= 0
  ? pass('o essencial cabe sem rolagem em 390px (critério de aceite da #55)')
  : fail(`o essencial passa ${painel390.excedente}px além do painel em 390px`);
painel390.linhas >= 1 && painel390.linhas <= 6
  ? pass(`o essencial tem ${painel390.linhas} linhas, dentro do teto de 6`)
  : fail(`essencial com ${painel390.linhas} linhas`);
painel390.recolhidas >= 1
  ? pass('o resto da informação fica recolhido, não some')
  : fail('nenhuma seção recolhida — a informação complementar sumiu');
painel390.rotulos.every((r) => !/_/.test(r))
  ? pass('nenhuma chave crua aparece no nível essencial')
  : fail('chave crua no essencial: ' + JSON.stringify(painel390.rotulos));

await page.click('#closeDetail').catch(() => {});
await page.waitForTimeout(200);
await page.screenshot({ path: process.env.SHOT_MOBILE || 'mobile.png' });

await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(500);
await page.screenshot({ path: process.env.SHOT_DESKTOP || 'desktop.png' });

console.log(`\n===== ${ok.length} ok, ${errors.length} falhas =====`);
await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
