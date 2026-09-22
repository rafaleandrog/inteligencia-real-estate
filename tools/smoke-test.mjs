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
// Contagens vêm do módulo que as DECLARA, nunca digitadas aqui (R8.72): um `4` literal
// deixaria o teste verde subtestando quando o quinto gráfico chegasse, e vermelho sem
// nada ter quebrado quando um saísse.
import { CARD_DESTAQUES, CARD_GRUPOS, dashboardMetricKeys } from '../src/ivv/cards.js';
import { HISTORY_CHARTS } from '../src/ivv/history.js';
import { PERIOD_MODE_OPTIONS } from '../src/ivv/period.js';
// Os cinco trechos do piloto saem do MESMO helper que os testes unitários usam, e a
// geometria dele vem da resposta gravada da camada oficial do DER (issue #131). Digitar
// coordenadas aqui criaria uma terceira versão da mesma geometria oficial.
import {
  polygonRows as trechosOficiais, roadSegmentRows, aliasRows, trafficRows,
} from '../tests/helpers/roadSegmentRows.mjs';
import { PILOT_ROAD_SEGMENT_CODES } from '../src/traffic/road-geometry.js';

// Nota humana colada no fim da prosa que a sincronização gera, no trecho `001EDF0130`.
// Ela existe para provar que a supressão da descrição não a leva junto (issue #138).
const NOTA_DO_TRECHO = 'Faixa da direita interditada desde 03/2026 por erosão de talude.';

const errors = [];
const ok = [];
const fail = (m) => { errors.push(m); console.log('  ✗ ' + m); };
const pass = (m) => { ok.push(m); console.log('  ✓ ' + m); };

// Alguns ambientes trazem um Chromium pré-instalado cuja build não corresponde à que
// esta versão do Playwright baixaria. CHROMIUM_PATH aponta para o binário existente.
const executablePath = process.env.CHROMIUM_PATH || undefined;
// Os filtros secundários vivem numa gaveta `<details>` recolhida (issue #124); o Playwright
// só interage com o que está visível, então cada página a abre antes de usá-los.
const abrirMaisFiltros = (p) => p.$eval('#moreFilters', (d) => { d.open = true; });
const browser = await chromium.launch(executablePath ? { executablePath } : {});

// Um CONTEXTO só, com viewport e rotas, em vez de `browser.newPage()` avulso por seção.
// A rota abaixo vale para toda página criada a partir dele, inclusive as que vierem depois
// — que é a razão de ela morar aqui e não repetida em cada `newPage`: uma lista de onze
// chamadas que precisam lembrar de aplicar a rota erra por AUSÊNCIA na décima segunda, e a
// falha aparece como timeout de 30s num lugar que não tem nada a ver com o que quebrou.
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// Os tiles do OSM são cortados de propósito, e não por economia: em ambiente sem saída
// para a internet a requisição de tile não FALHA — ela pendura até o timeout do socket, e
// `waitUntil: 'networkidle'` fica esperando por ela. O resultado é um smoke que estoura os
// 30s do `goto` antes de exercitar a primeira asserção, sem que nada da aplicação esteja
// errado. Abortar na rota torna o carregamento determinístico nos dois ambientes: nenhuma
// asserção deste arquivo depende de tile desenhado (as camadas são medidas por `path` e
// `circleMarker`, e a regra da R8.45 existe justamente para NÃO contar `img.leaflet-tile`).
await context.route(/tile\.openstreetmap\.org/, (route) => route.abort());

const page = await context.newPage();

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

// Selo de origem do dado (issue #90). Em modo demo ele NÃO pode virar link: apontar para a
// planilha aqui seria a tela afirmando uma procedência que este dado não tem.
const seloDemo = await page.evaluate(() => {
  const selo = document.querySelector('#sourceBadge');
  const link = selo?.querySelector('a');
  return {
    texto: selo?.textContent ?? '',
    origem: selo?.dataset.source ?? '',
    temLink: !!link,
  };
});
seloDemo.origem === 'demo' && seloDemo.texto.includes('demonstração') && !seloDemo.temLink
  ? pass('em modo demo o selo diz "Modo demonstração" e NÃO linka a planilha')
  : fail('selo em modo demo: ' + JSON.stringify(seloDemo));

console.log('\n== 4. Mapa e marcadores ==');
const markers = await page.locator('#map .marker').count();
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
// URL compartilhável (issue #127): o filtro vai para o hash, e o botão de copiar existe.
const hashComFiltro = await page.evaluate(() => location.hash);
/^#mapa\?.*locality=/.test(hashComFiltro) ? pass(`filtro serializado no hash: ${hashComFiltro.slice(0, 60)}`) : fail('hash sem o filtro: ' + hashComFiltro);
(await page.locator('#copyLink').count()) === 1 ? pass('botão "Copiar link desta análise" presente') : fail('botão de copiar link ausente');
await page.click('#clearFilters'); await page.waitForTimeout(300);
(await page.evaluate(() => location.hash)) === '#mapa' ? pass('sem filtro, o hash volta a ser só #mapa') : fail('hash com filtro fantasma: ' + await page.evaluate(() => location.hash));

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
await page.locator('#map .marker-listing').first().click({ force: true });
await page.waitForTimeout(500);
(await page.locator('#detail').isVisible()) ? pass('painel de detalhe abriu') : fail('detalhe não abriu');
const title = (await page.locator('#detailTitle').textContent()).trim();
title.length > 0 ? pass(`título: "${title.slice(0,45)}"`) : fail('título vazio');
// Desde a #104 a precisão espacial é uma LINHA do essencial ("Localização: Aproximada …"),
// não uma caixa: o texto visível diz "aproximada" e a frase completa da R3.6 fica no `title`.
const precNode = page.locator('#detailBody .precision').first();
const prec = await precNode.textContent();
const precTitle = (await precNode.getAttribute('title')) || '';
/aproximada|verificada/i.test(prec) ? pass('precisão espacial presente no essencial') : fail('precisão espacial ausente');
/não o endereço exato/i.test(precTitle) ? pass('não apresenta coordenada aproximada como exata (R3.6)') : fail('R3.6: a linha de precisão não diz que não é endereço exato');
(await page.locator('#detailBody details').count()) === 0
  ? pass('detalhe do registro em lista plana, sem seções recolhidas (#104)')
  : fail('detalhe do registro ainda tem <details> recolhido');

// Posição no recorte (issue #124): o painel do anúncio diz como o preço/m² se posiciona
// contra os comparáveis visíveis — ou diz que não há comparáveis, nunca "0".
const posicao = page.locator('#detailBody .detail-position');
(await posicao.count()) === 1 ? pass('bloco "Posição no recorte" presente no detalhe do anúncio') : fail('bloco de posição ausente');
const posicaoTexto = (await posicao.textContent()) || '';
/comparáveis|Sem comparáveis|nenhum com preço/i.test(posicaoTexto)
  ? pass('posição fala em comparáveis ou declara a ausência deles') : fail('texto da posição: ' + posicaoTexto.slice(0, 80));
/vs\. mediana/.test(posicaoTexto) && (await posicao.locator('.detail-ruler-dot').count()) === 1
  ? pass('preço/m² posicionado contra a mediana, com o ponto na régua P25–P75')
  : (/Sem comparáveis|nenhum com preço/.test(posicaoTexto) ? pass('sem comparáveis: nenhuma régua desenhada') : fail('régua sem ponto ou sem delta'));
!/\b0 comparáveis\b/.test(posicaoTexto) ? pass('amostra vazia nunca aparece como "0 comparáveis"') : fail('amostra vazia mostrada como zero');

const link = page.locator('#detailBody a.detail-source').first();
if (await link.count() > 0) {
  const href = await link.getAttribute('href');
  const rel = await link.getAttribute('rel');
  /^https?:\/\//.test(href) ? pass(`link da fonte válido: ${href.slice(0,50)}`) : fail('href inválido: '+href);
  rel === 'noopener noreferrer' ? pass('link com rel="noopener noreferrer"') : fail('rel incorreto: '+rel);
} else fail('link da fonte ausente');

console.log('\n== 11. Detalhe de empreendimento ==');
await page.click('#closeDetail'); await page.waitForTimeout(200);
await page.locator('#map .marker-development').first().click({ force: true });
await page.waitForTimeout(400);
(await page.locator('#detail').isVisible()) ? pass('detalhe de empreendimento abriu') : fail('detalhe de empreendimento não abriu');
const devKind = (await page.locator('#detailBody .detail-kind').textContent()).trim();
devKind === 'Empreendimento' ? pass('rótulo correto: '+devKind) : fail('rótulo inesperado: '+devKind);

console.log('\n== 12. XSS: dado hostil não vira markup ==');
// Um <script> injetado é o caso fácil. O caso real que passou despercebido foi
// `<img onerror=...>` no tooltip do Leaflet, que usa innerHTML para conteúdo string.
// Este teste injeta um título hostil no dataset e confirma que ele continua texto.
const xss = await page.evaluate(async () => {
  const marker = document.querySelector('#map .marker-listing');
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
await page.locator('#map .marker-development').first().click({ force: true });
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
const metaPage = await context.newPage();
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
  const p = await context.newPage();
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

const anchorPage = await context.newPage();
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
      rotulo: li.textContent.trim(),
      cor: li.querySelector('.marker-icon').style.getPropertyValue('--marker-cor').trim(),
      icone: li.querySelector('.marker-icon').dataset.icon,
    })),
  })));
const titulos = legenda.map((sec) => sec.titulo);
JSON.stringify(titulos) === JSON.stringify(['Infraestrutura', 'Comércio e serviço', 'Sem classificação'])
  ? pass('legenda separa Infraestrutura de Comércio e serviço, com o não classificado no fim')
  : fail('títulos de grupo inesperados: ' + JSON.stringify(titulos));

legenda.some((sec) => sec.itens.some((i) => i.rotulo === 'Food hall'))
  ? pass('segmento fora do vocabulário vira rótulo legível, não slug cru')
  : fail('segmento desconhecido não apareceu humanizado na legenda');

// Legenda e mapa precisam usar EXATAMENTE o mesmo conjunto de cores e de ícones
// (issue #112). Cor ou glifo na legenda que nenhum marcador usa (ou o contrário) é a
// legenda mentindo sobre o mapa. Todo marcador é um `divIcon` (`.marker.marker-<kind>`,
// issues #112 e #115); marcador não é mais `<path>`, só o contorno é.
const paresMapa = [...new Set(await anchorPage.$$eval('#map .marker-anchor .marker-icon', (ns) =>
  ns.map((n) => `${n.dataset.icon}|${n.style.getPropertyValue('--marker-cor').trim()}`)))].sort();
const paresLegenda = [...new Set(legenda.flatMap((sec) => sec.itens.map((i) => `${i.icone}|${i.cor}`)))].sort();
const coresMapa = [...new Set(paresMapa.map((p) => p.split('|')[1]))];
coresMapa.length > 1 ? pass(`âncoras usam ${coresMapa.length} cores distintas no mapa`) : fail('todas as âncoras na mesma cor');
JSON.stringify(paresMapa) === JSON.stringify(paresLegenda)
  ? pass('legenda e mapa usam o mesmo conjunto de (ícone, cor)')
  : fail(`legenda e mapa divergem\n    mapa:    ${paresMapa}\n    legenda: ${paresLegenda}`);
const glifosMapa = await anchorPage.$$eval('#map .marker-anchor .marker-icon svg', (ns) => ns.map((n) => n.childElementCount));
glifosMapa.length > 0 && glifosMapa.every((n) => n > 0)
  ? pass(`${glifosMapa.length} âncoras desenhadas como ícone, nenhuma com SVG vazio`)
  : fail('âncora sem glifo no mapa');

const totalAnchor = Number((await anchorPage.textContent('#kpiVisible')).replace(/\D/g, ''));
await abrirMaisFiltros(anchorPage);
await anchorPage.selectOption('#anchorGroup', 'infraestrutura');
await anchorPage.waitForTimeout(400);
const soInfra = Number((await anchorPage.textContent('#kpiVisible')).replace(/\D/g, ''));
soInfra > 0 && soInfra < totalAnchor ? pass(`filtro de grupo reduziu ${totalAnchor} -> ${soInfra}`) : fail('filtro de grupo não reduziu');

const segmentosDoGrupo = await anchorPage.$$eval('#anchorSegment option', (o) => o.map((x) => x.textContent));
segmentosDoGrupo.includes('Estação de metrô') && !segmentosDoGrupo.includes('Escola')
  ? pass('select de segmento fica restrito ao grupo escolhido')
  : fail('segmentos fora do grupo: ' + JSON.stringify(segmentosDoGrupo));

await abrirMaisFiltros(anchorPage);
await anchorPage.selectOption('#anchorSegment', 'estacao_metro');
(await anchorPage.textContent('#moreFiltersSummary')).includes('ativo')
  ? pass('o resumo da gaveta conta os filtros secundários ativos (#124)') : fail('resumo da gaveta não conta ativos');
await anchorPage.waitForTimeout(400);
const soMetro = Number((await anchorPage.textContent('#kpiVisible')).replace(/\D/g, ''));
soMetro > 0 && soMetro <= soInfra ? pass(`filtro de segmento reduziu ${soInfra} -> ${soMetro}`) : fail('filtro de segmento não reduziu');
// Só âncora sobra: nenhum anúncio/empreendimento e pelo menos um disco de âncora.
(await anchorPage.locator('#map .marker-listing, #map .marker-development').count()) === 0 && (await anchorPage.locator('#map .marker-anchor').count()) > 0
  ? pass('filtrar âncora por grupo/segmento esconde as outras camadas')
  : fail('sobrou anúncio ou empreendimento com filtro de âncora ativo');

await abrirMaisFiltros(anchorPage);
await anchorPage.selectOption('#anchorGroup', 'comercio_servico');
await anchorPage.waitForTimeout(400);
(await anchorPage.inputValue('#anchorSegment')) === ''
  ? pass('trocar de grupo zera segmento incompatível, sem filtro invisível ativo')
  : fail('segmento incompatível sobreviveu à troca de grupo');
await anchorPage.click('#clearFilters'); await anchorPage.waitForTimeout(400);

// P1 do review do Codex na PR #42: escolher SÓ o segmento, sem tocar no grupo, e
// limpar. Com a lista completa o segmento continua presente, e a rotina que repopula
// o select o restaurava — "Limpar filtros" não limpava (R8.43).
await abrirMaisFiltros(anchorPage);
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
await abrirMaisFiltros(anchorPage);
await anchorPage.selectOption('#anchorSegment', 'food_hall');
await anchorPage.waitForTimeout(400);
await anchorPage.locator('#map .marker-anchor').first().click({ force: true });
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

const classPage = await context.newPage();
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

await abrirMaisFiltros(classPage);
await classPage.selectOption('#salesStage', 'oferta');
await classPage.waitForTimeout(400);
const emOferta = await contarVisiveis();
emOferta > 0 && emOferta < totalClass ? pass(`filtro de estágio reduziu ${totalClass} -> ${emOferta}`) : fail('filtro de estágio não reduziu');
(await classPage.$$eval('#map .marker', (ns) => ns.length > 0 && ns.every((n) => n.classList.contains('marker-development'))))
  ? pass('filtrar por estágio esconde anúncios e âncoras') : fail('sobrou outra camada com filtro de estágio');
await classPage.click('#clearFilters'); await classPage.waitForTimeout(400);

await abrirMaisFiltros(classPage);
await classPage.selectOption('#regularizationStatus', 'nao_regularizado');
await classPage.waitForTimeout(400);
const naoRegularizados = await contarVisiveis();
naoRegularizados > 0 && naoRegularizados < totalClass
  ? pass(`filtro de regularização reduziu ${totalClass} -> ${naoRegularizados}`) : fail('filtro de regularização não reduziu');
// O Leaflet acrescenta as classes dele ao `<div>` (`leaflet-marker-icon`, ...): a camada
// é a classe `marker-<kind>`, onde quer que ela esteja na lista.
const camadasReg = await classPage.$$eval('#map .marker', (ns) => [...new Set(ns.map((n) => [...n.classList].find((c) => /^marker-/.test(c))))]);
camadasReg.includes('marker-listing') && camadasReg.includes('marker-development') && !camadasReg.includes('marker-anchor')
  ? pass('regularização cobre anúncio E empreendimento, e exclui âncora')
  : fail('camadas com filtro de regularização: ' + JSON.stringify(camadasReg));
await classPage.click('#clearFilters'); await classPage.waitForTimeout(400);

// Vertical/horizontal precisa alcançar o empreendimento, não só o anúncio — e o
// empreendimento cuja célula veio como " Vertical " é justamente o teste do caso real.
await abrirMaisFiltros(classPage);
await classPage.selectOption('#buildingOrientation', 'vertical');
await classPage.waitForTimeout(400);
const devsVerticais = await classPage.$$eval('#map .marker-development', (ns) => ns.length);
devsVerticais > 0
  ? pass(`filtro vertical alcança ${devsVerticais} empreendimento(s), inclusive o de célula " Vertical "`)
  : fail('nenhum empreendimento passou no filtro vertical');
await classPage.click('#clearFilters'); await classPage.waitForTimeout(400);

// Clique por evento no elemento: clique por coordenada acerta o marcador que estiver por
// cima, e os discos se sobrepõem em vários pontos.
await classPage.evaluate(() => document.querySelector('#map .marker-development')
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
await classPage.evaluate(() => document.querySelector('#map .marker-listing')
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

const raPage = await context.newPage();
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

const polyPage = await context.newPage();
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
      // Nota que NÃO é a prosa gerada pela sincronização: ela precisa sobreviver à
      // supressão da descrição do trecho do DER (achado P1 do Codex na PR #139).
      description: 'Corredor legado com nota que só existe aqui.',
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
    // Os cinco trechos rodoviários OFICIAIS do piloto (issue #131). Diferente de tudo
    // acima, estes não são sintéticos: a geometria é a da camada `Rodovias_2025` do DER,
    // gravada em tests/fixtures/der-rodovias-2025-df001.json. Eles entram para que o
    // caminho de LINHA seja exercitado ao lado do de área, no mesmo carregamento — o
    // `SMOKE_ROAD` acima é um corredor `Polygon` e CONTINUA sendo área, porque um trecho
    // gravado assim precisa continuar desenhando assim.
    //
    // O `001EDF0130` recebe uma NOTA colada no fim da prosa que a sincronização gera. Ela
    // tem que sobreviver à supressão da descrição: uma versão anterior via o TMD e a
    // extensão no texto e apagava o parágrafo inteiro, levando a nota junto (segundo
    // achado P1 do Codex na PR #139).
    ...trechosOficiais().map((linha) => (linha.polygon_id === 'ROADSEG_001EDF0130'
      ? { ...linha, description: `${linha.description} ${NOTA_DO_TRECHO}` }
      : linha)),
    // Trecho APOSENTADO: `supersedePolygonsOfEntity_` deixa a geometria antiga na aba com
    // `status: inactive`. Ele não pode ser desenhado nem virar item de legenda — sem esta
    // linha no payload, as asserções de "inativo não aparece" passariam de qualquer jeito, e
    // teste que não pode falhar não é teste.
    {
      ...trechosOficiais()[0],
      polygon_id: 'ROADSEG_APOSENTADO',
      entity_id: 'ROADSEG_APOSENTADO',
      status: 'inactive',
    },
  ];
  // As três abas de tráfego, para o painel do trecho ter o que mostrar. Sem elas o
  // bloco de fluxo abriria dizendo "sem dias medidos", que é um estado válido mas não é
  // o que este teste precisa cobrir.
  payload.road_segments = roadSegmentRows();
  payload.road_segment_aliases = aliasRows();
  payload.traffic_daily = trafficRows({ dias: 4, parcialNoUltimo: true, diaDeOutroMes: true });
  await route.fulfill({ response, json: payload });
});
await polyPage.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await polyPage.waitForTimeout(1200);

(await polyPage.locator('#polygonLayers').isVisible())
  ? pass('com contorno na planilha, a caixa da camada aparece')
  : fail('caixa da camada de contornos não apareceu');

const polyCount = await polyPage.textContent('#countPolygon');
const esperado = String(6 + PILOT_ROAD_SEGMENT_CODES.length);
polyCount === esperado
  ? pass('a contagem mostra os contornos carregados')
  : fail(`contagem errada: ${polyCount} (esperado ${esperado})`);

// Um contorno com geometria ilegível some do mapa e os outros seguem (R2.6): dois
// registros carregados, um só caminho desenhado.
// `#map path` casaria com o vértice do editor e com qualquer <path> avulso;
// A classe `.polygon-shape` isola os contornos.
const paths = await polyPage.evaluate(() => document.querySelectorAll('#map .polygon-shape').length);
paths === 5 ? pass('geometria ilegível não é desenhada, as boas continuam') : fail(`contornos desenhados: ${paths}`);

// == Eixos rodoviários oficiais desenhados como LINHA (issue #131) ==
console.log('\n== 12g-bis. Trechos rodoviários do DER desenhados como linha (issue #131) ==');

const eixos = await polyPage.evaluate(() => document.querySelectorAll('#map .road-segment-shape').length);
eixos === PILOT_ROAD_SEGMENT_CODES.length
  ? pass(`os ${eixos} trechos do piloto foram desenhados`)
  : fail(`trechos desenhados: ${eixos} (esperado ${PILOT_ROAD_SEGMENT_CODES.length})`);

// A linha é LINHA: `fill="none"` no SVG. Um eixo com preenchimento seria uma área entre o
// primeiro e o último ponto que a fonte nunca publicou.
const comPreenchimento = await polyPage.evaluate(() => [...document.querySelectorAll('#map .road-segment-shape')]
  .filter((n) => (n.getAttribute('fill') || 'none') !== 'none').length);
comPreenchimento === 0
  ? pass('nenhum eixo foi desenhado com preenchimento — linha continua sendo linha')
  : fail(`${comPreenchimento} eixo(s) desenhados como área`);

// Cores distintas por trecho, vindas da planilha e não de tema.
const coresEixos = await polyPage.evaluate(() => [...new Set([...document.querySelectorAll('#map .road-segment-shape')]
  .map((n) => n.getAttribute('stroke')))]);
coresEixos.length === PILOT_ROAD_SEGMENT_CODES.length
  ? pass('cada trecho tem a própria cor, como a planilha declarou')
  : fail(`cores distintas: ${coresEixos.length} (${coresEixos.join(', ')})`);

// O alvo de clique existe e é mais largo que o traço — sem isso, 4px são um alvo
// impossível no toque.
const alvos = await polyPage.evaluate(() => [...document.querySelectorAll('#map .road-segment-hit')]
  .map((n) => Number(n.getAttribute('stroke-width'))));
alvos.length === PILOT_ROAD_SEGMENT_CODES.length && alvos.every((w) => w >= 10)
  ? pass('cada trecho tem alvo de clique largo, com o traço visível intacto')
  : fail(`alvos de clique: ${JSON.stringify(alvos)}`);

// Clique num trecho: painel com as propriedades oficiais e com o fluxo vinculado.
//
// O teste NÃO assume qual trecho recebe o clique. Os cinco eixos se encostam na DF-001, e
// o centro da caixa envolvente de um deles cai sobre o traço do vizinho — uma versão
// anterior deste bloco afirmava "001EDF0070" e recebia o 0090, falhando por um motivo
// que não tinha nada a ver com o que ela queria verificar. O painel diz qual trecho
// abriu, e as asserções são conferidas contra a linha oficial correspondente.
await polyPage.locator('#map .road-segment-hit').first().click({ force: true });
await polyPage.waitForTimeout(400);
const trechoDetail = (await polyPage.textContent('#detail')) || '';
const abertos = trechosOficiais().filter((r) => trechoDetail.includes(JSON.parse(r.properties_json).cod_distrital));
const aberto = abertos.length === 1 ? abertos[0] : null;
const props = aberto ? JSON.parse(aberto.properties_json) : null;

aberto && /Código do trecho/.test(trechoDetail)
  ? pass(`o painel do trecho abre com o código oficial (${props.cod_distrital})`)
  : fail('painel do trecho sem um código do piloto: ' + trechoDetail.slice(0, 400));

if (aberto) {
  const tmd = new Intl.NumberFormat('pt-BR').format(Number(props.tmd_der));
  /TMD oficial do DER\/DF/.test(trechoDetail) && trechoDetail.includes(tmd)
    ? pass(`o painel mostra o TMD oficial do DER (${tmd})`)
    : fail(`TMD ${tmd} ausente do painel do trecho`);

  /Fluxo diário \(DER\/DF\)/.test(trechoDetail) && trechoDetail.includes(props.road_segment_id)
    ? pass('o bloco de fluxo aparece, identificado pelo road_segment_id')
    : fail('bloco de fluxo ausente do painel do trecho: ' + trechoDetail.slice(-500));

  /Caminhão/.test(trechoDetail) && /Ônibus/.test(trechoDetail)
    ? pass('as classes de veículo aparecem no painel')
    : fail('classes de veículo ausentes do painel');

  // Décimo de quilômetro é a precisão do cadastro do DER: 0,9 km arredondado para "1 km"
  // inventaria 100 m num trecho de 900.
  const km = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    .format(props.extensao_km);
  trechoDetail.includes(`${km} km`)
    ? pass(`a extensão preserva o décimo de quilômetro do cadastro (${km} km)`)
    : fail(`extensão "${km} km" arredondada ou ausente`);

  // O OBJECTID é o que permite abrir a feição exata no FeatureServer do DER e conferir a
  // geometria contra a que está na tela.
  trechoDetail.includes(String(props.geometry_source_feature_id))
    ? pass('o painel traz o OBJECTID da feição na camada oficial')
    : fail('OBJECTID ausente do painel do trecho');
}
// Nenhum aviso sobre a camada: os cinco chegaram íntegros.
const avisosTexto = (await polyPage.textContent('#dataWarnings').catch(() => '')) || '';
!/Trecho rodoviário/.test(avisosTexto)
  ? pass('camada rodoviária íntegra não gera aviso')
  : fail('aviso inesperado sobre a camada rodoviária: ' + avisosTexto);

// == Legenda por código, seleção e procedência (issue #134) ==
// Escopo: a sublista do GRUPO `road_segments`. Os corredores sintéticos deste teste também
// são `entity_type: road_segment`, mas vivem no grupo `road_network` e têm a sua própria
// sublista — o que está certo, e é por isso que a asserção é por grupo, não global.
const legendaDoGrupo = (page) => page.evaluate(() => {
  const input = document.querySelector('#polygonLayers input[data-polygon-group="road_segments"]');
  const lista = input && input.closest('ul');
  if (!lista) return null;
  return [...lista.querySelectorAll('.road-segment-legend-item')].map((b) => ({
    codigo: b.querySelector('.polygon-legend-label').textContent.trim(),
    cor: b.querySelector('.dot').style.background,
    traco: b.querySelector('.dot').classList.contains('dot-road-sample'),
  }));
});

const itens = await legendaDoGrupo(polyPage);
const codigosNaLegenda = (itens || []).map((i) => i.codigo).sort();
const codigosEsperados = [...PILOT_ROAD_SEGMENT_CODES].sort();
JSON.stringify(codigosNaLegenda) === JSON.stringify(codigosEsperados)
  ? pass('a legenda lista os cinco códigos do piloto')
  : fail(`códigos na legenda: ${JSON.stringify(codigosNaLegenda)}`);

// Cada código com a cor do seu eixo: a cor identifica QUAL trecho é, e sem isso a lista
// não identifica nada.
const coresLegenda = [...new Set((itens || []).map((i) => i.cor))];
coresLegenda.length === PILOT_ROAD_SEGMENT_CODES.length
  ? pass('cada código da legenda tem a cor do seu eixo')
  : fail(`cores distintas na legenda: ${coresLegenda.length}`);

// A amostra é TRAÇO para eixo. O corredor com buffer, que o mapa desenha como área, ganha
// quadrado — legenda que não bate com o mapa é pior que legenda nenhuma (issue #52).
(itens || []).every((i) => i.traco)
  ? pass('a amostra de cada eixo é um traço, como o mapa desenha')
  : fail('algum eixo ficou com amostra de área na legenda');

// Contorno INATIVO não entra na legenda: o renderizador se recusa a desenhá-lo, e um item
// clicável para geometria que não está no mapa promete o que o mapa não tem (achado P2 do
// Codex na PR #135 — mesma classe do P1 da PR #133).
const inativoNaLegenda = (itens || []).some((i) => i.codigo === 'ROADSEG_APOSENTADO');
!inativoNaLegenda
  ? pass('trecho aposentado não aparece na legenda')
  : fail('um trecho inativo virou item clicável da legenda');
const corredores = await polyPage.evaluate(() => {
  const input = document.querySelector('#polygonLayers input[data-polygon-group="road_network"]');
  const lista = input && input.closest('ul');
  if (!lista) return [];
  return [...lista.querySelectorAll('.road-segment-legend-item .dot')]
    .map((d) => d.classList.contains('dot-road-sample'));
});
corredores.length > 0 && corredores.every((traco) => traco === false)
  ? pass('o corredor com buffer aparece com amostra de ÁREA, não de traço')
  : fail(`amostras do grupo road_network: ${JSON.stringify(corredores)}`);

// O corredor legado MANTÉM a descrição: a supressão da #138 olha o conteúdo (a prosa que
// repete TMD e extensão), não o tipo de feição — perguntar pelo tipo apagava a nota deste
// registro em silêncio (achado P1 do Codex na PR #139).
//
// O alvo é a ÁREA do `SMOKE_ROAD` pela cor dele, não o primeiro item da legenda do grupo:
// `road_network` tem três registros, e o primeiro da lista é o `SMOKE_ESTILO_INVALIDO`,
// que não tem descrição nenhuma — uma versão anterior desta asserção abria o painel dele
// e acusava o código de ter apagado um texto que nunca existiu.
await polyPage.click('#map .polygon-shape[fill="#53606b"]');
await polyPage.waitForTimeout(400);
const painelCorredor = (await polyPage.textContent('#detail')) || '';
const descricaoDoCorredor = await polyPage.evaluate(
  () => document.querySelectorAll('#detail .detail-description').length,
);
descricaoDoCorredor === 1 && /nota que só existe aqui/.test(painelCorredor)
  ? pass('o corredor legado mantém a nota que só existe na descrição dele')
  : fail(`descrições no painel do corredor legado: ${descricaoDoCorredor} | titulo=`
    + (await polyPage.textContent('#detailTitle')));
await polyPage.click('#closeDetail');
await polyPage.waitForTimeout(900);

// Clicar num código da legenda seleciona o trecho e destaca a linha.
await polyPage.locator('.road-segment-legend-item').first().click();
await polyPage.waitForTimeout(400);
const destacados = await polyPage.evaluate(() => document.querySelectorAll('#map .road-segment-selected').length);
destacados === 1
  ? pass('clicar no código da legenda destaca exatamente um eixo')
  : fail(`eixos destacados: ${destacados}`);

const painelLegenda = (await polyPage.textContent('#detail')) || '';
/Geometria oficial do DER\/DF/.test(painelLegenda)
  ? pass('o painel declara que a geometria é oficial do DER/DF')
  : fail('procedência oficial ausente do painel');
/Maior pico de 15 min/.test(painelLegenda)
  ? pass('o painel mostra o maior pico de 15 min do período')
  : fail('pico de 15 min ausente do painel');

// == Painel enxuto e fluxo por mês (issue #138) ==
//
// O fluxo por mês é o que responde "quanto passou neste mês", e a cobertura anda COLADA
// no número: "Abril/2026 — 143.485 veíc." sozinho se lê como o mês inteiro, e hoje são
// 20 dos 30 dias de abril na planilha real.
/Abril\/2026/.test(painelLegenda)
  ? pass('o painel mostra o fluxo por mês de calendário')
  : fail('linha de mês ausente do painel: ' + painelLegenda.slice(-600));
/de 30 dias medidos/.test(painelLegenda)
  ? pass('o mês declara quantos dos seus dias foram medidos, ao lado do número')
  : fail('cobertura do mês ausente da linha de mês');
// Dois meses na série sintética: um código que ignorasse o mês somaria tudo numa linha só.
/Março\/2026/.test(painelLegenda) && /de 31 dias medidos/.test(painelLegenda)
  ? pass('março aparece como linha própria, com os 31 dias do mês dele')
  : fail('a série cruzando dois meses não virou duas linhas');

// No trecho `001EDF0130`, que tem uma NOTA colada no fim da prosa gerada, o painel mostra
// A NOTA — e só ela. É a regressão exata que o Codex apontou: a versão anterior via o TMD
// e a extensão no texto e apagava o parágrafo inteiro.
await polyPage.locator('.road-segment-legend-item', { hasText: '001EDF0130' }).first().click();
await polyPage.waitForTimeout(400);
const painelComNota = await polyPage.evaluate(() => {
  const nos = [...document.querySelectorAll('#detail .detail-description')];
  return { quantas: nos.length, texto: nos.map((n) => n.textContent).join(' | ') };
});
painelComNota.quantas === 1 && painelComNota.texto === NOTA_DO_TRECHO
  ? pass('a nota colada na prosa gerada sobrevive, e a prosa repetida não')
  : fail(`descrição do 001EDF0130: ${JSON.stringify(painelComNota)}`);

await polyPage.locator('.road-segment-legend-item').first().click();
await polyPage.waitForTimeout(400);

// A descrição do trecho some: ela repetia em prosa a rodovia, o TMD e a extensão que as
// linhas essenciais mostram duas linhas acima.
//
// A asserção é pelo ELEMENTO, não pelo texto: "ENTR. DF-025(B)" também é o valor de
// `Início do trecho` no bloco complementar, e procurá-lo no texto acusaria uma descrição
// que não está lá enquanto deixaria passar uma que estivesse com outro começo.
const descricaoDoTrecho = await polyPage.evaluate(
  () => document.querySelectorAll('#detail .detail-description').length,
);
descricaoDoTrecho === 0
  ? pass('o painel do trecho não repete a descrição em prosa')
  : fail('a descrição do trecho voltou ao painel');

// O hash aparece UMA vez: `geometry_sha256` do properties_json e a coluna `geometry_hash`
// carregavam o mesmo valor em duas linhas.
const hashNoPainel = await polyPage.evaluate(() => {
  const texto = document.querySelector('#detail').textContent || '';
  return (texto.match(/Hash da geometria/g) || []).length;
});
hashNoPainel <= 1
  ? pass(`o hash da geometria aparece ${hashNoPainel} vez no painel`)
  : fail(`o hash aparece ${hashNoPainel} vezes no painel`);

// Fechar o painel desfaz o destaque: eixo marcado sem painel é uma marca sem explicação.
//
// Fechar o painel ALARGA `.map-wrap`, e o Leaflet remede o container — as feições mudam de
// posição na tela. Os blocos seguintes clicam por COORDENADA dentro da caixa do contorno
// (ver `clicarContornoKml`), medindo a caixa antes e clicando depois: com o layout em
// movimento, os 85% medidos numa largura caem fora da forma na outra, e o clique acerta a
// RA que fica logo abaixo. Por isso a espera aqui não é folclore — é o tempo de o mapa
// voltar a ficar parado.
await polyPage.click('#closeDetail');
await polyPage.waitForTimeout(900);
(await polyPage.evaluate(() => document.querySelectorAll('#map .road-segment-selected').length)) === 0
  ? pass('fechar o painel desfaz o destaque do eixo')
  : fail('o destaque sobreviveu ao fechamento do painel');

// Clique numa RA continua funcionando com os trechos por cima.
await polyPage.click('#map .polygon-shape[fill="#2f6f4f"]');
await polyPage.waitForTimeout(400);
const raAindaAbre = (await polyPage.textContent('#detail')) || '';
/População/.test(raAindaAbre)
  ? pass('clique numa RA continua abrindo o perfil, com os eixos desenhados por cima')
  : fail('o eixo rodoviário roubou o clique da RA: ' + raAindaAbre.slice(0, 300));
// Painel aberto de novo: mesma razão da espera acima, o mapa volta a estreitar.
await polyPage.waitForTimeout(900);

// Desligar a camada tira as linhas e NÃO toca nas áreas.
await polyPage.locator('#polygonLayers input[data-polygon-group="road_segments"]').uncheck();
await polyPage.waitForTimeout(300);
const camadaDesligada = await polyPage.evaluate(() => ({
  eixos: document.querySelectorAll('#map .road-segment-shape').length,
  areas: document.querySelectorAll('#map .polygon-shape').length,
}));
camadaDesligada.eixos === 0 && camadaDesligada.areas === 5
  ? pass('desligar "Trechos rodoviários piloto" some com as linhas e preserva as áreas')
  : fail(`após desligar: ${JSON.stringify(camadaDesligada)}`);
await polyPage.locator('#polygonLayers input[data-polygon-group="road_segments"]').check();
await polyPage.waitForTimeout(300);

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
//
// O clique vai no canto inferior direito do triângulo, não no centro da caixa: o centro
// cai em cima da hipotenusa, onde uma âncora está desenhada — e desde a issue #112 a
// âncora é um disco de 22px no pane de marcadores, acima do contorno, que interceptaria
// o clique (com o círculo de 4px de antes isso passava por sorte).
const clicarContornoKml = async (page) => {
  const alvo = page.locator('#map .polygon-shape[fill="#aa3344"]');
  const caixa = await alvo.boundingBox();
  await alvo.click({ position: { x: caixa.width * 0.85, y: caixa.height * 0.85 } });
};
await clicarContornoKml(polyPage);
await polyPage.waitForTimeout(400);
const polyDetail = await polyPage.textContent('#detail');
/4321/.test(polyDetail || '')
  ? pass('clique no contorno abre o painel com as propriedades do KML')
  : fail('painel do contorno sem as propriedades: ' + polyDetail);
/smoke\.kml/.test(polyDetail || '')
  ? pass('o painel nomeia o arquivo de origem')
  : fail('arquivo de origem ausente no painel');

// Controle positivo da supressão acima (issue #138): a descrição some no TRECHO, onde
// repete o essencial, e continua aqui, onde é a única prosa que o registro tem.
const descricaoDoKml = await polyPage.evaluate(
  () => document.querySelectorAll('#detail .detail-description').length,
);
descricaoDoKml === 1
  ? pass('a descrição do contorno importado continua no painel')
  : fail(`descrições no painel do contorno KML: ${descricaoDoKml}`);

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
await clicarContornoKml(polyPage);
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
/Trechos rodoviários piloto/.test(legendaTexto)
  ? pass('a legenda nomeia a camada de trechos rodoviários em português')
  : fail('grupo road_segments ausente ou com slug vazado na legenda: ' + legendaTexto);
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

const viewPage = await context.newPage();
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
// Comparação temporal (issue #127): três pílulas; escolher "Ano anterior" sobrepõe uma
// série tracejada no mesmo eixo e vai para o hash.
(await viewPage.locator('#marketCompare .market-chip').count()) === 3 ? pass('controle "Comparar com" com três opções') : fail('pílulas de comparação ausentes');
await viewPage.click('#marketCompare .market-chip[data-compare="mesmo_periodo_ano_anterior"]');
await viewPage.waitForTimeout(500);
const comparacao = await viewPage.evaluate(() => ({
  tracejadas: document.querySelectorAll('#marketCharts .market-serie-comparacao').length,
  eixosY: document.querySelectorAll('#marketCharts [data-chart="ivv"] .chart-axis-value').length,
  hash: location.hash,
  nota: document.querySelector('#marketCharts [data-chart="ivv"] .market-chart-modo')?.textContent ?? '',
}));
comparacao.tracejadas > 0 || /Sem mês publicado no recorte de comparação/.test(comparacao.nota)
  ? pass(`comparação: ${comparacao.tracejadas} série(s) tracejada(s) ou ausência declarada`) : fail('comparação sem série e sem aviso: ' + JSON.stringify(comparacao));
/compare=mesmo_periodo_ano_anterior/.test(comparacao.hash) ? pass('modo de comparação serializado no hash') : fail('hash: ' + comparacao.hash);
await viewPage.click('#marketCompare .market-chip[data-compare="nenhum"]');
await viewPage.waitForTimeout(400);
(await viewPage.evaluate(() => location.hash)) === '#mercado' ? pass('voltar a "Nenhum" limpa o hash') : fail('hash: ' + await viewPage.evaluate(() => location.hash));
// Matriz preço × liquidez: um ponto por RA com tooltip, ou a ausência declarada.
const matriz = await viewPage.evaluate(() => ({
  visivel: !document.querySelector('#marketRegioes').hidden,
  modos: document.querySelectorAll('#marketRegioesModo .market-chip').length,
  pontos: document.querySelectorAll('#marketRegioesScatter .market-scatter-ponto').length,
  titulo: document.querySelector('#marketRegioesScatter .market-scatter-ponto title')?.textContent ?? '',
  ausente: document.querySelector('#marketRegioesScatter .market-card-absent')?.textContent ?? '',
}));
if (matriz.visivel) {
  matriz.modos === 3 ? pass('matriz com três leituras (IVV × preço, IVV × oferta, gap × preço)') : fail('modos da matriz: ' + matriz.modos);
  matriz.pontos > 0 && /IVV:|Preço de venda:/.test(matriz.titulo)
    ? pass(`matriz com ${matriz.pontos} RAs e tooltip com IVV e preço`)
    : (matriz.ausente ? pass('matriz sem eixos declara a ausência') : fail('matriz sem pontos e sem aviso'));
}
/Distrito Federal inteiro/.test(noMercado.escopo) && /Região Administrativa/.test(noMercado.escopo)
  ? pass('a tela declara o escopo do DF inteiro, sem recorte por RA')
  : fail('escopo não declarado: ' + noMercado.escopo);

// A tela precisa ROLAR (issue #83). `body { overflow: hidden }` é decisão do mapa, que
// ocupa a viewport por definição; a view do Mercado é irmã dele e herdava o corte sem
// herdar altura nenhuma — no desktop, tudo abaixo da dobra ficava inalcançável, sem barra
// e sem erro. Só medição prova isso: o atributo confirma a intenção, o layout confirma o
// resultado (R8.67).
const rolagem = await viewPage.evaluate(() => {
  const view = document.querySelector('#marketView');
  const antes = view.scrollTop;
  view.scrollTop = 1e6;
  const desceu = view.scrollTop > antes;
  view.scrollTop = antes;
  return {
    overflow: getComputedStyle(view).overflowY,
    maiorQueAJanela: view.scrollHeight > view.clientHeight + 1,
    desceu,
  };
});
rolagem.maiorQueAJanela && rolagem.desceu
  ? pass('a tela do Mercado rola no desktop: o fim do conteúdo é alcançável')
  : fail('a view do Mercado não rola: ' + JSON.stringify(rolagem));

// Hierarquia dos indicadores (issues #59 e #83). O fixture da demo tem UM mês da semente
// v1.0.0, e é pouco para exercitar variação — por isso a série é substituída por dois
// meses com os campos de variação preenchidos, na mesma interceptação que o resto do
// smoke já usa.
const cards = await viewPage.evaluate(() => ({
  destaques: [...document.querySelectorAll('#marketDestaques .market-kpi')].map((n) => n.dataset.metrica),
  grupos: [...document.querySelectorAll('#marketBody .market-grupo')].map((n) => ({
    key: n.dataset.grupo,
    titulo: n.querySelector('.market-grupo-titulo')?.textContent ?? '',
    tiles: n.querySelectorAll('.market-card').length,
  })),
  sparks: document.querySelectorAll('#marketDestaques .market-spark-svg').length,
  micro: [...document.querySelectorAll('#marketMicroKpis .market-micro')].map((n) => ({
    key: n.dataset.derivado, formula: n.title, valor: n.querySelector('.market-micro-value')?.textContent ?? '',
  })),
  ausentes: document.querySelectorAll('#marketView .market-card-absent').length,
  travessoes: [...document.querySelectorAll('#marketView .market-kpi-valor, #marketView .market-card-value')]
    .filter((n) => n.textContent.trim() === '\u2014').length,
  corpoDestaque: Math.round(parseFloat(
    getComputedStyle(document.querySelector('#marketDestaques .market-kpi-valor')).fontSize)),
  corpoTile: Math.round(parseFloat(
    getComputedStyle(document.querySelector('#marketBody .market-card-value')).fontSize)),
}));
JSON.stringify(cards.destaques) === JSON.stringify([...CARD_DESTAQUES])
  ? pass(`os ${CARD_DESTAQUES.length} indicadores em destaque abrem a tela, na ordem declarada`)
  : fail('destaques fora do declarado: ' + JSON.stringify(cards.destaques));
// Derivados (issue #125): seis micro-indicadores, cada um com a fórmula no title, e nenhum
// valor "0" no lugar de dado não publicado.
cards.micro.length === 6 && cards.micro.every((m) => m.key && m.formula.length > 0)
  ? pass('faixa de derivados com 6 micro-indicadores, todos com fórmula declarada')
  : fail('micro-indicadores: ' + JSON.stringify(cards.micro));
cards.micro.every((m) => m.valor !== '0' && m.valor !== '')
  ? pass('derivado sem dado diz "não publicado", nunca zero')
  : fail('derivado com valor vazio ou zero: ' + JSON.stringify(cards.micro));
cards.grupos.length === CARD_GRUPOS.length
  && cards.grupos.every((g, i) => g.tiles === CARD_GRUPOS[i].metricas.length && g.titulo.length > 0)
  ? pass(`os ${CARD_GRUPOS.length} grupos trazem o restante dos indicadores, cada um sob seu rótulo`)
  : fail('grupos fora do declarado: ' + JSON.stringify(cards.grupos));
(cards.destaques.length + cards.grupos.reduce((t, g) => t + g.tiles, 0)) === dashboardMetricKeys().length
  ? pass('nenhum indicador se perdeu na reorganização')
  : fail('a soma de destaques e tiles não bate com o declarado');
// A hierarquia tem que existir no PIXEL, não só na marcação (R8.67).
cards.corpoDestaque > cards.corpoTile
  ? pass(`o destaque é maior que o tile na tela (${cards.corpoDestaque}px × ${cards.corpoTile}px)`)
  : fail(`destaque e tile com o mesmo corpo: ${cards.corpoDestaque}px`);
cards.sparks > 0
  ? pass(`${cards.sparks} destaque(s) trazem o sparkline do movimento recente`)
  : fail('nenhum sparkline renderizado nos destaques');
cards.travessoes === 0
  ? pass('nenhum indicador mostra travessão no lugar do valor')
  : fail(`${cards.travessoes} indicador(es) com travessão`);
cards.ausentes > 0
  ? pass(`${cards.ausentes} indicador(es) sem dado dizem isso por escrito, em vez de zero`)
  : pass('todos os indicadores têm valor nesta série');

const filtrosEGraficos = await viewPage.evaluate(() => ({
  chips: [...document.querySelectorAll('#marketPeriodChips .market-chip')].map((c) => c.dataset.mode),
  pressionados: [...document.querySelectorAll('#marketPeriodChips .market-chip[aria-pressed="true"]')]
    .map((c) => c.dataset.mode),
  anos: document.querySelector('#marketYear')?.options.length ?? 0,
  meses: document.querySelector('#marketMonth')?.options.length ?? 0,
  periodo: document.querySelector('#marketPeriodLabel')?.textContent ?? '',
  base: document.querySelector('#marketPeriodBase')?.textContent ?? '',
  graficos: document.querySelectorAll('#marketCharts .market-chart').length,
  svgs: document.querySelectorAll('#marketCharts .market-chart-svg').length,
  vazios: document.querySelectorAll('#marketCharts .market-chart-empty').length,
  semAria: [...document.querySelectorAll('#marketCharts .market-chart-svg')]
    .filter((s) => s.getAttribute('role') !== 'img' || !s.getAttribute('aria-label')).length,
  marcas: document.querySelectorAll('#marketCharts .market-serie-marcador').length,
  colunas: document.querySelectorAll('#marketCharts .market-serie-coluna').length,
  tabelas: [...document.querySelectorAll('#marketCharts .market-chart-valores tbody')]
    .map((t) => t.querySelectorAll('tr').length),
  categorias: [...document.querySelectorAll('#marketCharts .market-chart')].length,
}));
JSON.stringify(filtrosEGraficos.chips) === JSON.stringify(PERIOD_MODE_OPTIONS.map((o) => o.value))
  ? pass('os períodos aparecem como pílulas, na ordem declarada')
  : fail('pílulas de período: ' + JSON.stringify(filtrosEGraficos.chips));
filtrosEGraficos.pressionados.length === 1 && filtrosEGraficos.pressionados[0] === 'ytd'
  ? pass('exatamente uma pílula está marcada, e a tela abre no acumulado do ano')
  : fail('estado das pílulas: ' + JSON.stringify(filtrosEGraficos.pressionados));
filtrosEGraficos.anos >= 1 && filtrosEGraficos.meses >= 1
  ? pass('os campos de ano e mês expõem o que a série tem')
  : fail('filtros temporais incompletos: ' + JSON.stringify(filtrosEGraficos));
/\d+\s+m[êe]s/.test(filtrosEGraficos.periodo)
  ? pass('a tela declara o intervalo aplicado e conta os meses')
  : fail('resumo do período: ' + filtrosEGraficos.periodo);
/Varia(ç|c)ões referentes a/.test(filtrosEGraficos.base)
  ? pass('a base de comparação está escrita uma vez, junto do período')
  : fail('base de comparação: ' + filtrosEGraficos.base);
// Gráfico sem dado na série não vira desenho vazio: vira frase (R5.7). Por isso a conta
// é `desenhados + declaradamente vazios === declarados`, e não `svgs === gráficos`.
filtrosEGraficos.graficos === HISTORY_CHARTS.length + 1
  && filtrosEGraficos.svgs + filtrosEGraficos.vazios === filtrosEGraficos.graficos
  && filtrosEGraficos.svgs > 0
  ? pass(`o dashboard renderiza ${filtrosEGraficos.graficos} gráficos (histórico + sazonalidade)`)
  : fail('gráficos incompletos: ' + JSON.stringify(filtrosEGraficos));
filtrosEGraficos.semAria === 0
  ? pass('todo gráfico se anuncia como imagem, com descrição')
  : fail(`${filtrosEGraficos.semAria} gráfico(s) sem role/aria-label`);
filtrosEGraficos.marcas > 0 && filtrosEGraficos.colunas > 0
  ? pass('linha e coluna coexistem: o tipo de cada gráfico é o declarado')
  : fail('formas dos gráficos: ' + JSON.stringify(filtrosEGraficos));
filtrosEGraficos.tabelas.length === filtrosEGraficos.svgs
  && filtrosEGraficos.tabelas.every((n) => n > 0)
  ? pass('cada gráfico desenhado traz os valores mês a mês em tabela')
  : fail('tabelas de valores: ' + JSON.stringify(filtrosEGraficos.tabelas));

// O desenho tem que ter a LARGURA DA CAIXA (R8.74). Um `viewBox` fixo dentro de uma caixa
// menor não dá erro: o navegador escala a arte inteira e a tipografia encolhe junto, em
// silêncio. Só medindo os dois lados dá para saber.
const medidorDeGrafico = () => {
  const plot = document.querySelector('#marketCharts .market-chart-plot');
  const svg = plot?.querySelector('.market-chart-svg');
  const caixa = plot ? Math.round(plot.clientWidth) : 0;
  const viewBoxLargura = Number((svg?.getAttribute('viewBox') || '').split(' ')[2] || 0);
  const grade = document.querySelector('#marketCharts');
  return {
    caixa,
    viewBoxLargura,
    casa: caixa > 0 && Math.abs(caixa - viewBoxLargura) <= 8,
    overflow: grade ? grade.scrollWidth - grade.clientWidth : 0,
  };
};
const graficoLargo = await viewPage.evaluate(medidorDeGrafico);
graficoLargo.casa
  ? pass(`o desenho sai na medida da caixa (${graficoLargo.caixa}px), não reduzido de um viewBox fixo`)
  : fail('viewBox fora da medida da caixa: ' + JSON.stringify(graficoLargo));

// A cor da série CHEGA — e chega por CSS. `stroke="var(--cat-1)"` como atributo de
// apresentação é aceito pelo parser e descartado em silêncio pelo browser: a série some
// sem erro nenhum. Só o valor COMPUTADO prova que ela está lá (R8.70).
const cores = await viewPage.evaluate(() => {
  const grafico = [...document.querySelectorAll('#marketCharts .market-chart')]
    .find((c) => c.querySelectorAll('.market-chart-legend li').length > 1);
  if (!grafico) return null;
  const swatches = [...grafico.querySelectorAll('.market-legenda-cor')]
    .map((n) => getComputedStyle(n).backgroundColor);
  const tracos = [...grafico.querySelectorAll('.market-serie-linha, .market-serie-coluna')]
    .map((n) => getComputedStyle(n).stroke + '|' + getComputedStyle(n).fill);
  return { swatches, tracos };
});
cores && cores.swatches.length > 1 && new Set(cores.swatches).size === cores.swatches.length
  && cores.swatches.every((c) => c && c !== 'rgba(0, 0, 0, 0)')
  ? pass('a legenda pinta cada série com uma cor própria, resolvida pelo CSS')
  : fail('cores da legenda: ' + JSON.stringify(cores));
cores && cores.tracos.every((t) => !t.includes('none|none'))
  ? pass('o traço da série recebeu cor — nenhuma série sumiu por atributo descartado')
  : fail('traços sem cor: ' + JSON.stringify(cores));

// Mês a mês × acumulado no ano (issue #85). A prova de que o modo acumulado não é outra
// conta paralela: o ÚLTIMO PONTO da curva tem que ser o mesmo número que o card mostra.
// Se divergirem, a tela exibe dois valores para a mesma coisa e nenhum se explica.
const lerModo = () => {
  const chips = [...document.querySelectorAll('#marketSeriesMode .market-chip')];
  const card = document.querySelector('#marketView [data-metrica="sales_units"]');
  const grafico = document.querySelector('[data-chart="atividade"]');
  const linhas = [...(grafico?.querySelectorAll('.market-chart-valores tbody tr') || [])];
  return {
    modos: chips.map((c) => c.dataset.serieModo),
    ativo: chips.find((c) => c.getAttribute('aria-pressed') === 'true')?.dataset.serieModo ?? null,
    valorDoCard: card?.querySelector('.market-kpi-valor, .market-card-value')?.textContent ?? '',
    ultimoDaCurva: linhas.at(-1)?.querySelectorAll('td')[0]?.textContent ?? '',
    nota: grafico?.querySelector('.market-chart-modo')?.textContent ?? '',
    notaDistratos: document.querySelector('[data-chart="distratos"] .market-chart-modo')?.textContent ?? '',
  };
};

const modoInicial = await viewPage.evaluate(lerModo);
JSON.stringify(modoInicial.modos) === JSON.stringify(['mensal', 'acumulado'])
  ? pass('o modo da série aparece como par de pílulas, acima de todos os gráficos')
  : fail('pílulas de modo: ' + JSON.stringify(modoInicial.modos));
modoInicial.ativo === 'acumulado'
  ? pass('em período "Acumulado do ano" os gráficos abrem acumulados — a tela concorda consigo mesma')
  : fail('modo inicial: ' + JSON.stringify(modoInicial));
modoInicial.valorDoCard === modoInicial.ultimoDaCurva
  ? pass(`o último ponto da curva acumulada é o valor do card (${modoInicial.valorDoCard})`)
  : fail('curva e card divergem: ' + JSON.stringify(modoInicial));
/Sempre mensal/.test(modoInicial.notaDistratos)
  ? pass('o gráfico que não acumula declara isso, em vez de inventar um acumulado')
  : fail('nota de distratos: ' + modoInicial.notaDistratos);

// Campo que o período não usa fica APAGADO, com o motivo escrito, e nunca some (R8.64).
await viewPage.click('.market-chip[data-mode="all"]');
await viewPage.waitForTimeout(250);
const apagados = await viewPage.evaluate(() => ['#marketYear', '#marketMonth', '#marketStart', '#marketEnd']
  .map((sel) => {
    const campo = document.querySelector(sel);
    return {
      sel,
      existe: !!campo,
      visivel: campo.getBoundingClientRect().height > 0,
      desabilitado: campo.disabled,
      motivo: campo.title,
    };
  }));
apagados.every((c) => c.existe && c.visivel && c.desabilitado && c.motivo.length > 0)
  ? pass('no histórico completo, os campos ficam apagados COM o motivo, e nenhum some')
  : fail('campos do período: ' + JSON.stringify(apagados));
await viewPage.click('.market-chip[data-mode="custom"]');
await viewPage.waitForTimeout(250);
const intervalo = await viewPage.evaluate(() => ({
  de: document.querySelector('#marketStart').disabled,
  ate: document.querySelector('#marketEnd').disabled,
  ano: document.querySelector('#marketYear').disabled,
}));
!intervalo.de && !intervalo.ate && intervalo.ano
  ? pass('no intervalo personalizado, De/Até ligam e o ano desliga')
  : fail('intervalo personalizado: ' + JSON.stringify(intervalo));
await viewPage.click('.market-chip[data-mode="ytd"]');
await viewPage.waitForTimeout(250);

// IVV por Região Administrativa (issue #87). A aba estava na planilha desde o começo e
// nunca era buscada; o que se prova aqui é que ela chegou, que o agregado NÃO virou barra e
// que região sem valor é nomeada em vez de virar barra de zero.
const regioes = await viewPage.evaluate(() => {
  const secao = document.querySelector('#marketRegioes');
  const itens = [...document.querySelectorAll('#marketRegioesLista .market-regiao')];
  const valores = itens.map((n) => n.querySelector('.market-regiao-valor').textContent);
  return {
    visivel: !secao.hidden,
    nomes: itens.map((n) => n.dataset.regiao),
    valores,
    faixas: [...document.querySelectorAll('#marketRegioesFaixa .market-chip')].map((c) => c.dataset.faixa),
    regua: document.querySelector('.market-regioes-regua')?.textContent ?? '',
    nota: document.querySelector('#marketRegioesNote')?.textContent ?? '',
    ausentes: document.querySelector('#marketRegioesAusentes')?.textContent ?? '',
    larguras: itens.map((n) => n.querySelector('.market-regiao-barra').style.width),
  };
});
regioes.visivel && regioes.nomes.length > 5
  ? pass(`a seção territorial traz ${regioes.nomes.length} regiões`)
  : fail('IVV por região não renderizou: ' + JSON.stringify(regioes));
!regioes.nomes.includes('DF Total')
  ? pass('o agregado do DF fica de fora do ranking — o mesmo mercado não é contado duas vezes')
  : fail('DF Total virou barra: ' + JSON.stringify(regioes.nomes));
/DF Total/.test(regioes.regua)
  ? pass('o agregado aparece como régua, dizendo quem gira mais rápido que o DF inteiro')
  : fail('régua ausente: ' + regioes.regua);
// A ordenação é por IVV decrescente, e o valor sai em ponto percentual (12,5% e não 1250%).
regioes.valores.length > 1 && /^\d{1,2},\d%$/.test(regioes.valores[0])
  ? pass(`a escala é ponto percentual, como a aba publica (${regioes.valores[0]})`)
  : fail('escala do IVV por região: ' + JSON.stringify(regioes.valores.slice(0, 3)));
regioes.larguras.every((w) => w && w !== '0%')
  ? pass('nenhuma barra tem largura zero — ausência virou frase, não barra vazia')
  : fail('barra de tamanho zero: ' + JSON.stringify(regioes.larguras));
/um único mês|Retrato de/.test(regioes.nota)
  ? pass('a seção declara que é retrato de um mês, e não promete série por região')
  : fail('nota da seção: ' + regioes.nota);

await viewPage.click('#marketRegioesFaixa .market-chip[data-faixa="1Q"]');
await viewPage.waitForTimeout(300);
const umQuarto = await viewPage.evaluate(() => ({
  nomes: [...document.querySelectorAll('#marketRegioesLista .market-regiao')].map((n) => n.dataset.regiao),
  ausentes: document.querySelector('#marketRegioesAusentes')?.textContent ?? '',
}));
JSON.stringify(umQuarto.nomes) !== JSON.stringify(regioes.nomes)
  ? pass('trocar a faixa de quartos troca o recorte de verdade')
  : fail('a faixa não mudou o ranking');
umQuarto.ausentes.length > 0
  ? pass('região sem IVV na faixa é NOMEADA, em vez de sumir ou virar zero')
  : pass('todas as regiões têm IVV nesta faixa');
await viewPage.click('#marketRegioesFaixa .market-chip[data-faixa="TOTAL"]');
await viewPage.waitForTimeout(250);

// A declaração de escopo mudou de conteúdo: ela precisa dizer o que EXISTE por RA e o que
// não existe. A frase antiga ("a fonte não publica por RA") virou falsa com esta aba.
const escopo = await viewPage.evaluate(() => document.querySelector('#marketScope').textContent);
/série mensal/i.test(escopo) && /retrato de um mês/i.test(escopo)
  ? pass('o escopo separa o que existe por RA do que não existe')
  : fail('escopo desatualizado: ' + escopo);

const proveniencia = await viewPage.evaluate(() => ({
  linhas: document.querySelectorAll('#marketProvenanceList dt').length,
  temFonte: !document.querySelector('#marketSource').hidden,
}));
proveniencia.linhas >= 1
  ? pass(`a procedência mostra ${proveniencia.linhas} campo(s) do dataset`)
  : fail('procedência vazia');

// Tom da variação: o SIGNIFICADO manda, não o sinal. Distrato subindo é ruim, venda
// subindo é bom, e preço é neutro porque a tela não sabe de que lado está quem lê.
const tomPage = await context.newPage();
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
  // O endereço do indicador é a CHAVE da métrica, não o rótulo: rótulo muda, chave não —
  // e o mesmo seletor serve destaque e tile.
  const ler = (metrica) => {
    const card = document.querySelector(`#marketView [data-metrica="${metrica}"]`);
    if (!card) return null;
    return [...card.querySelectorAll('.market-delta')].map((d) => ({
      classe: d.className,
      label: d.querySelector('.market-delta-label').textContent,
      valor: d.querySelector('.market-delta-value').textContent,
      icone: d.querySelector('.market-delta-icon').textContent,
    }));
  };
  return {
    vendas: ler('sales_units'),
    distratos: ler('cancellations_units'),
    preco: ler('sale_price_brl_m2'),
    ivv: ler('ivv_pct'),
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
// O rótulo NOMEIA o mês comparado (R8.66): "vs abr./2026", e a versão em % ao lado.
rotulosIvv.some((r) => /^vs \w{3}\.\/\d{4}$/.test(r))
  && rotulosIvv.some((r) => /^vs \w{3}\.\/\d{4}, em %$/.test(r))
  ? pass('o IVV separa pontos percentuais de variação percentual, e nomeia o mês comparado')
  : fail('rótulos do IVV: ' + JSON.stringify(rotulosIvv));
valoresIvv.some((v) => /p\.p\./.test(v)) && valoresIvv.some((v) => /%$/.test(v) && !/p\.p\./.test(v))
  ? pass('as duas grandezas do IVV saem com unidades distintas na tela')
  : fail('valores do IVV: ' + JSON.stringify(valoresIvv));

// A mesma série precisa mudar de soma YTD para leitura pontual quando o usuário escolhe
// um mês. O gráfico mantém o contexto histórico, sem somar pontos mensais entre si.
const lerVendasEPeriodo = (alvo) => alvo.evaluate(() => {
  const card = document.querySelector('#marketView [data-metrica="sales_units"]');
  return {
    valor: card?.querySelector('.market-kpi-valor, .market-card-value')?.textContent ?? '',
    periodo: document.querySelector('#marketPeriodLabel')?.textContent ?? '',
    // Vendas e lançamentos são COLUNAS: contagem de evento do mês não é linha.
    colunasAtividade: document.querySelectorAll('[data-chart="atividade"] .market-serie-coluna').length,
  };
});
const vendasYtd = await lerVendasEPeriodo(tomPage);
/800/.test(vendasYtd.valor)
  ? pass('o acumulado do ano soma os fluxos mensais')
  : fail('vendas YTD não somadas: ' + JSON.stringify(vendasYtd));

// Com DOIS meses na série, acumulado e mensal são números diferentes — é aqui que dá para
// provar que a pílula troca a SÉRIE, e não só o rótulo. (Na página anterior a série tem um
// mês só, e os dois modos coincidem por construção.)
const acumuladoDoisMeses = await tomPage.evaluate(lerModo);
await tomPage.click('.market-chip[data-serie-modo="mensal"]');
await tomPage.waitForTimeout(300);
const mensalDoisMeses = await tomPage.evaluate(lerModo);
acumuladoDoisMeses.ultimoDaCurva === '800' && mensalDoisMeses.ultimoDaCurva === '400'
  ? pass('a pílula troca a série: 800 acumulado no ano contra 400 no mês')
  : fail('troca de modo sem efeito: '
    + JSON.stringify({ acumulado: acumuladoDoisMeses, mensal: mensalDoisMeses }));
/Valores do m[êe]s/.test(mensalDoisMeses.nota)
  ? pass('o gráfico diz qual série está na tela, sem depender da pílula lá em cima')
  : fail('nota do modo: ' + mensalDoisMeses.nota);
await tomPage.click('.market-chip[data-serie-modo="acumulado"]');
await tomPage.waitForTimeout(300);
await tomPage.click('.market-chip[data-mode="month"]');
await tomPage.selectOption('#marketYear', '2026');
await tomPage.selectOption('#marketMonth', '4');
await tomPage.waitForTimeout(250);
const vendasAbril = await lerVendasEPeriodo(tomPage);
/400/.test(vendasAbril.valor) && /abr\./i.test(vendasAbril.periodo)
  ? pass('selecionar abril troca os cards para o valor mensal correto')
  : fail('filtro mensal incorreto: ' + JSON.stringify(vendasAbril));
vendasAbril.colunasAtividade >= 2
  ? pass('no modo mensal, o gráfico preserva contexto histórico anterior')
  : fail('o gráfico perdeu o histórico ao filtrar um mês: ' + JSON.stringify(vendasAbril));

// 390 px: os destaques empilham em uma coluna e viram pílula (rótulo e valor na mesma
// linha de base). Empilhados como no desktop, os quatro comeriam a tela toda antes do
// primeiro grupo.
await tomPage.setViewportSize({ width: 390, height: 844 });
await tomPage.waitForTimeout(400);
const empilha = await tomPage.evaluate(() => {
  const kpis = [...document.querySelectorAll('#marketDestaques .market-kpi')];
  if (kpis.length < 2) return null;
  const [a, b] = kpis.map((c) => c.getBoundingClientRect());
  const rotulo = kpis[0].querySelector('.market-kpi-rotulo').getBoundingClientRect();
  const valor = kpis[0].querySelector('.market-kpi-valor').getBoundingClientRect();
  return {
    empilhado: b.top >= a.bottom - 1,
    pilula: Math.abs(rotulo.bottom - valor.bottom) < 6 && valor.left > rotulo.left,
    largura: Math.round(a.width),
  };
});
empilha?.empilhado
  ? pass('em 390px os destaques empilham em uma coluna')
  : fail('destaques não empilharam em 390px: ' + JSON.stringify(empilha));
empilha?.pilula
  ? pass('em 390px o destaque vira pílula: rótulo e valor na mesma linha de base')
  : fail('destaque não virou pílula em 390px: ' + JSON.stringify(empilha));
const overflowCards = await tomPage.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
overflowCards <= 1
  ? pass('os indicadores não estouram a largura em 390px')
  : fail(`overflow de ${overflowCards}px nos indicadores`);
const graficoEstreito = await tomPage.evaluate(medidorDeGrafico);
graficoEstreito.casa && graficoEstreito.overflow <= 1
  ? pass(`em 390px o desenho tem a largura da caixa (${graficoEstreito.viewBoxLargura}px), sem estourar`)
  : fail('gráfico em 390px: ' + JSON.stringify(graficoEstreito));
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
const semIvv = await context.newPage();
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

// A origem `gviz` VIRA link. Esta página não força o modo demo, então o selo assume a
// estratégia configurada — e o que se afirma aqui é a marcação do link, não a rede: o GViz
// não é alcançável do ambiente de teste, e o selo é escrito antes de qualquer resposta.
const seloReal = await context.newPage();
await seloReal.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await seloReal.waitForTimeout(1500);
const selo = await seloReal.evaluate(() => {
  const link = document.querySelector('#sourceBadge a');
  return link ? {
    texto: link.textContent,
    href: link.getAttribute('href'),
    target: link.getAttribute('target'),
    rel: link.getAttribute('rel'),
    id: window.APP_CONFIG?.spreadsheetId ?? '',
  } : { ausente: true, origem: document.querySelector('#sourceBadge')?.dataset.source ?? '' };
});
await seloReal.close();

selo.ausente
  ? fail('o selo de origem não virou link: ' + JSON.stringify(selo))
  : pass('a origem Google Sheets vira link para a planilha');
!selo.ausente && selo.href.includes(selo.id)
  ? pass('o link aponta para o id da planilha que a configuração declara')
  : fail('href fora do id configurado: ' + JSON.stringify(selo));
!selo.ausente && selo.target === '_blank' && /noopener/.test(selo.rel) && /noreferrer/.test(selo.rel)
  ? pass('o link externo abre em aba nova com rel="noopener noreferrer" (R4.5)')
  : fail('atributos do link: ' + JSON.stringify(selo));

// == Sazonalidade: a rampa ORDINAL chega à tela (issue #97) ==
//
// A rampa `--ano-1..4` existia no CSS desde a issue #85 e NUNCA foi emitida por ninguém: o
// gráfico saía com `serie-N` e pintava os anos com a paleta categórica. Nada errava — e a
// R8.76, a mensagem do commit e o comentário do CSS já descreviam o conserto como feito.
// Esta asserção é a que faltava lá: ela fala as duas línguas, porque compara o token do CSS
// com o valor COMPUTADO do traço (R8.67/R8.70).
//
// A base de demonstração traz UMA linha de `ivv_monthly`, o que daria uma série só e não
// exercitaria ordem nenhuma. Por isso injeta quatro anos — mesmo padrão que a seção do IVV
// ausente usa para zerar a aba.
console.log('\n== 12l. Sazonalidade: rampa ordinal dos anos ==');

const sazonal = await context.newPage();
await sazonal.addInitScript(() => {
  Object.defineProperty(window, 'APP_CONFIG', {
    configurable: true,
    set(value) { delete window.APP_CONFIG; window.APP_CONFIG = value; if (value) value.demoMode = true; },
    get() { return undefined; },
  });
});
await sazonal.route('**/data/demo.json', async (route) => {
  const response = await route.fetch();
  const payload = await response.json();
  payload.ivv_monthly = [];
  for (const ano of [2023, 2024, 2025, 2026]) {
    for (let mes = 1; mes <= 12; mes += 1) {
      payload.ivv_monthly.push({
        reference_month: `${ano}-${String(mes).padStart(2, '0')}-01`,
        ivv_pct: String(5 + (mes % 4)),
        offered_units: '6000',
        sold_units: '400',
      });
    }
  }
  await route.fulfill({ response, json: payload });
});
await sazonal.goto('http://localhost:8080/#mercado', { waitUntil: 'networkidle' });
await sazonal.waitForTimeout(1800);

const rampa = await sazonal.evaluate(() => {
  // `--ano-1` chega como texto do token (" #7ebe9a"); `stroke` chega como "rgb(126, 190, 154)".
  // Sem normalizar, nenhuma comparação casaria — e o teste passaria a falhar por formato.
  const paraRgb = (hex) => {
    const h = hex.trim().replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  };
  const raiz = getComputedStyle(document.documentElement);
  const card = document.querySelector('#marketCharts [data-chart="sazonalidade"]');
  if (!card) return { ausente: true };
  // O degrau sai da PRÓPRIA classe do grupo, não da posição no DOM: `.market-serie-linha` é
  // um path por SEGMENTO, e um ano com buraco no meio produz dois — qualquer casamento por
  // índice desalinharia em silêncio.
  const grupos = [...card.querySelectorAll('g.market-serie')].map((g) => {
    const ordinal = /(?:^|\s)ano-(\d+)(?:\s|$)/.exec(g.className.baseVal || '');
    const categorico = /(?:^|\s)serie-(\d+)(?:\s|$)/.test(g.className.baseVal || '');
    const traco = g.querySelector('.market-serie-linha, .market-serie-coluna');
    return {
      degrau: ordinal ? Number(ordinal[1]) : null,
      categorico,
      cor: traco ? (getComputedStyle(traco).stroke !== 'none'
        ? getComputedStyle(traco).stroke : getComputedStyle(traco).fill) : null,
      esperado: ordinal ? paraRgb(raiz.getPropertyValue(`--ano-${ordinal[1]}`)) : null,
    };
  });
  return {
    grupos,
    legendas: card.querySelectorAll('.market-chart-legend li').length,
    catsDaPaleta: [1, 2, 3, 4].map((i) => paraRgb(raiz.getPropertyValue(`--cat-${i}`))),
  };
});

if (rampa.ausente || !rampa.grupos) {
  fail('o card da sazonalidade não chegou à tela: ' + JSON.stringify(rampa));
} else {
  const degraus = rampa.grupos.map((g) => g.degrau);
  rampa.grupos.length > 1 && rampa.grupos.length === rampa.legendas
    ? pass(`a sazonalidade desenhou ${rampa.grupos.length} anos, um por item de legenda`)
    : fail('séries e legenda divergem: ' + JSON.stringify(rampa));
  rampa.grupos.every((g) => g.degrau !== null) && !rampa.grupos.some((g) => g.categorico)
    ? pass('cada ano sai na rampa ORDINAL (ano-N), nenhum na paleta categórica')
    : fail('classe de série errada: ' + JSON.stringify(degraus));
  rampa.grupos.every((g) => g.cor && g.cor === g.esperado)
    ? pass('a cor COMPUTADA de cada ano é o degrau que a classe dele promete')
    : fail('cor fora da rampa: ' + JSON.stringify(rampa.grupos));
  rampa.grupos.every((g) => !rampa.catsDaPaleta.includes(g.cor))
    ? pass('nenhum ano está pintado com uma cor da paleta categórica')
    : fail('ano com cor categórica: ' + JSON.stringify(rampa.grupos));
  // O corrente é o teto da rampa: mais escuro no tema claro, mais claro no escuro — nos dois
  // casos o mais saliente, que é o que a R8.76 pede.
  Math.max(...degraus) === degraus[degraus.length - 1]
    && new Set(degraus).size === degraus.length
    ? pass('o ano corrente fica no último degrau, e nenhum degrau se repete')
    : fail('ordem dos degraus: ' + JSON.stringify(degraus));
}
await sazonal.close();

// == Painel de trechos rodoviários com tráfego (issue #63) ==
//
// Cobre os dois estados que a issue pede: sem geometria sincronizada (o piloto real
// hoje, road_sync_synced_count = 0) e com geometria injetada — o painel precisa ficar
// clicável no segundo caso SEM mudança de código.
console.log('\n== 12k. Painel de trechos rodoviários com tráfego (issue #63) ==');

const trafficPage = await context.newPage();
await trafficPage.addInitScript(() => {
  Object.defineProperty(window, 'APP_CONFIG', {
    configurable: true,
    set(value) { delete window.APP_CONFIG; window.APP_CONFIG = value; if (value) value.demoMode = true; },
    get() { return undefined; },
  });
});
await trafficPage.route('**/data/demo.json', async (route) => {
  const response = await route.fetch();
  const payload = await response.json();
  payload.road_segments = [
    // Sem current_polygon_id: o estado real do piloto — geometria pendente.
    { road_segment_id: 'RS-SMOKE-1', road_name: 'DF-995 · trecho sintético sem geometria', jurisdiction: 'DER-DF' },
    // Com current_polygon_id apontando para um polígono que EXISTE em `polygons` abaixo.
    { road_segment_id: 'RS-SMOKE-2', road_name: 'DF-996 · trecho sintético com geometria', jurisdiction: 'DER-DF', current_polygon_id: 'SMOKE_TRAFFIC_POLY' },
  ];
  payload.road_segment_aliases = [];
  payload.traffic_daily = [
    { road_segment_id: 'RS-SMOKE-1', dia: '2026-04-01', sentido: 'crescente', fluxo_total: 12000, intervalos_15min_observados: 96 },
    { road_segment_id: 'RS-SMOKE-1', dia: '2026-04-02', sentido: 'crescente', fluxo_total: 14000, intervalos_15min_observados: 96 },
    { road_segment_id: 'RS-SMOKE-1', dia: '2026-04-01', sentido: 'decrescente', fluxo_total: 9000, intervalos_15min_observados: 90 },
    { road_segment_id: 'RS-SMOKE-2', dia: '2026-04-01', sentido: 'crescente', fluxo_total: 5000, intervalos_15min_observados: 96 },
  ];
  payload.polygons = [
    {
      polygon_id: 'SMOKE_TRAFFIC_POLY',
      name: 'DF-996 · trecho sintético com geometria',
      layer_group: 'road_network',
      entity_type: 'road_segment',
      geometry_geojson: JSON.stringify({
        type: 'Polygon',
        coordinates: [[[-47.5, -16.0], [-47.4, -16.0], [-47.4, -15.95], [-47.5, -16.0]]],
      }),
      fill_color: '#53606b',
      stroke_color: '#374151',
      status: 'active',
    },
  ];
  await route.fulfill({ response, json: payload });
});
await trafficPage.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await trafficPage.waitForTimeout(1200);

(await trafficPage.locator('#trafficSection').isVisible())
  ? pass('com ROAD_SEGMENTS na planilha, o painel de tráfego aparece')
  : fail('painel de trechos rodoviários não apareceu');

const trafficItems = await trafficPage.locator('#trafficList .traffic-item').count();
trafficItems === 2
  ? pass('os dois trechos do piloto aparecem no painel')
  : fail(`trechos no painel: ${trafficItems}`);

const trafficText = await trafficPage.textContent('#trafficList');
/[Gg]eometria pendente/.test(trafficText || '')
  ? pass('trecho sem geometria sincronizada declara a pendência, em vez de sumir')
  : fail('trecho sem geometria não avisou a pendência: ' + trafficText);

// Sentido crescente e decrescente não se somam: 12000 e 14000 são do crescente
// (média 13.000), 9000 é do decrescente — nenhum dos três aparece somado.
/13\.000/.test(trafficText || '') && /9\.000/.test(trafficText || '')
  ? pass('crescente e decrescente aparecem com médias separadas, sem se somar')
  : fail('médias por sentido não bateram: ' + trafficText);

// Trecho SEM geometria não vira botão (não tem link nenhum). Trecho COM geometria vira.
const semGeometriaEhBotao = await trafficPage.evaluate(() => {
  const item = [...document.querySelectorAll('#trafficList .traffic-item')]
    .find((li) => /RS-SMOKE-1|sem geometria/.test(li.textContent));
  return item ? item.querySelector('.traffic-item-head')?.tagName : null;
});
semGeometriaEhBotao === 'DIV'
  ? pass('trecho sem geometria não vira link para lugar nenhum')
  : fail('trecho sem geometria virou elemento clicável: ' + semGeometriaEhBotao);

// Clicar no trecho COM geometria leva ao corredor no mapa e abre o mesmo detalhe de um
// clique nele — sem mudança de código quando a sincronização do DER rodar (critério de
// aceite da issue #63).
await trafficPage.click('#trafficList .traffic-item-head[type="button"]');
await trafficPage.waitForTimeout(400);
const trafficDetail = await trafficPage.textContent('#detail');
/DF-996/.test(trafficDetail || '')
  ? pass('clicar no trecho com geometria abre o mesmo painel de detalhe do mapa')
  : fail('clique no trecho não abriu o detalhe do corredor: ' + trafficDetail);
const mapaVisivelAposClique = await trafficPage.evaluate(() => !document.getElementById('mapView').hidden);
mapaVisivelAposClique
  ? pass('clicar no trecho leva de volta para a view do mapa')
  : fail('a view do mapa não voltou ao clicar no trecho');

await trafficPage.close();

console.log('\n== 12b. Recolher trilho e painel (issue #104) ==');
await page.click('#closeDetail').catch(() => {});
const medir = () => page.evaluate(() => ({
  trilho: Math.round(document.querySelector('.app > .topbar').getBoundingClientRect().width),
  painel: document.querySelector('#filters').getBoundingClientRect().width,
  mapa: Math.round(document.querySelector('#map').getBoundingClientRect().width),
  rail: document.documentElement.dataset.rail || '',
  railAria: document.querySelector('#railToggle').getAttribute('aria-expanded'),
  panelAria: document.querySelector('#panelToggle').getAttribute('aria-expanded'),
}));
const antesToggle = await medir();
await page.click('#railToggle');
await page.waitForTimeout(300);
const trilhoRecolhido = await medir();
trilhoRecolhido.trilho < antesToggle.trilho && trilhoRecolhido.mapa > antesToggle.mapa
  ? pass(`o trilho recolhe (${antesToggle.trilho}px → ${trilhoRecolhido.trilho}px) e o mapa alarga`)
  : fail('o trilho não recolheu: ' + JSON.stringify({ antesToggle, trilhoRecolhido }));
trilhoRecolhido.rail === 'collapsed' && trilhoRecolhido.railAria === 'false'
  ? pass('estado do trilho refletido em data-rail e aria-expanded')
  : fail('estado do trilho incoerente: ' + JSON.stringify(trilhoRecolhido));
await page.click('#panelToggle');
await page.waitForTimeout(300);
const painelRecolhido = await medir();
painelRecolhido.painel === 0 && painelRecolhido.mapa > trilhoRecolhido.mapa && painelRecolhido.panelAria === 'false'
  ? pass('o painel recolhe e o mapa ocupa o espaço')
  : fail('o painel não recolheu: ' + JSON.stringify(painelRecolhido));
// Tile desenhado até a borda direita: o `invalidateSize()` do toggle é o que garante isso.
const mapaCobre = await page.evaluate(() => {
  const mapa = document.querySelector('#map').getBoundingClientRect();
  const pane = document.querySelector('#map .leaflet-map-pane');
  return !!pane && mapa.width > 0;
});
mapaCobre ? pass('o mapa continua montado após os toggles') : fail('o mapa perdeu o pane após os toggles');
await page.click('#panelToggle');
await page.click('#railToggle');
await page.waitForTimeout(300);
const restaurado = await medir();
restaurado.trilho === antesToggle.trilho && restaurado.painel === antesToggle.painel
  ? pass('trilho e painel voltam ao tamanho original ao expandir')
  : fail('não restaurou: ' + JSON.stringify({ antesToggle, restaurado }));

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
    complementares: detail.querySelectorAll('dl.detail-more, dl.detail-provenance').length,
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
painel390.complementares >= 1
  ? pass('o resto da informação segue abaixo do essencial, em lista plana (#104)')
  : fail('nenhuma lista complementar — a informação complementar sumiu');
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
