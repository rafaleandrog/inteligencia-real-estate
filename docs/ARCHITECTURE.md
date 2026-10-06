# Arquitetura

## MVP recomendado

```text
Editor de dados                      Fontes públicas (IBGE · Ipea · OSM · GeoPortal)
   |                                     |
   v                                     | pipeline/ (Python, GitHub Actions) → PR de dados
Google Sheets  <-- dado CURADO           v
   |                                 data/public/  <-- dado DERIVADO + manifest (R2.7)
   | Google Visualization Query          |
   v                                     | fetch na mesma origem
GitHub Pages (HTML/CSS/JS)  <------------+
   |
   v
Navegador + Leaflet
```

Dois caminhos de dado, de naturezas diferentes: a planilha guarda o que alguém pesquisou e
assina (anúncios, empreendimentos, IVV, FipeZap, PDAD); `data/public/` guarda o que uma fonte
oficial publicou e um pipeline reprodutível transformou (células do Censo, hexágonos de
empregos, rede viária). O primeiro muda sem commit; o segundo só muda por PR automática.

## Separação de responsabilidades

Uma linguagem por arquivo, uma responsabilidade por módulo.

| Arquivo | Responsabilidade |
|---|---|
| `index.html` | Estrutura. Sem estilo inline, sem lógica |
| `assets/styles.css` | Visual |
| `src/config.js` | ID da planilha, origem dos dados, nomes das abas |
| `src/data.js` | Carregamento e escolha da estratégia; manifest e arquivos públicos (`fetchPublicManifest`, `fetchPublicLayer`) |
| `src/normalize.js` | Conversão e normalização — **funções puras** |
| `src/filters.js` | Filtros, mediana, KPIs — **funções puras** |
| `src/format.js` | Formatação e saneamento — **funções puras** |
| `src/ivv/chart-model.js` | Significado do gráfico: categorias, séries, eixo, ausência — **funções puras** |
| `src/ivv/chart-layout.js` | Geometria do gráfico: coordenadas, caminhos, colunas — **funções puras** |
| `src/ivv/history.js` | Quais gráficos existem, o que cada um pergunta, de que recorte lê, se acumula e com que recorte se compara |
| `src/ivv/derived.js` | Indicadores derivados do Mercado (gap, meses de oferta, reposição, tickets, áreas) — **funções puras** |
| `src/ivv/region.js` | IVV por RA: normalização, ranking e matriz preço × liquidez — **funções puras** |
| `src/map/comparables.js` | Comparáveis do recorte: percentis, posição contra a mediana, qualidade da amostra — **funções puras** |
| `src/pdad/*` | PDAD-A: normalização, agregação por RA, indicadores, gráficos e perfil imobiliário (`insights.js`) — **funções puras** |
| `src/fipezap/*` | FipeZap: normalização (período, duplicidade, vocabulário), histórico e localidades com o mapa localidade → RA — **funções puras** |
| `src/url-state.js` | View e filtros na URL (`parseHash`/`buildHash`), vocabulário fechado de chaves — **funções puras** |
| `src/app.js` | Interação, mapa e DOM; desenha as camadas territoriais em canvas e lê a cor dos tokens do CSS |
| `src/territorio/*` | Arquivos públicos: manifest, ponte de RAs, agregados por RA e seu cruzamento com o índice do PDAD, registro das camadas, classes, legenda e detalhe — **funções puras**, sem DOM, sem Leaflet e sem cor |
| `pipeline/` | Geração de `data/public/` (Python; roda no Actions — `dados-publicos.yml` — ou na máquina do dono, nunca no navegador) |
| `data/public/` | Dado derivado de fonte pública + `manifest.json` e schemas (R2.7); editado só pelo pipeline (R2.8) |
| `tests/fixtures/public/` | Saída do pipeline em modo fixture, lida pelos testes e pelo smoke; regerada pelo pipeline, nunca editada (R2.8) |
| `warehouse/` | Modelo 2 (base histórica multi‑cidade): só o desenho; implementação adiada (issue #154) |
| Google Sheet | Registros e governança |

A divisão não é estética: as camadas de funções puras são as que a suíte cobre sem navegador
e sem rede. `app.js` concentra o que só dá para verificar por smoke test.

Regra que vale para todo módulo puro novo: **ausência de dado nunca vira zero** (amostra vazia,
denominador zero, categoria suprimida devolvem `null` e a tela escreve a frase), **a fórmula
fica ao lado do número** e **nenhum módulo conhece cor** — a série declara um índice e o CSS
resolve. Distância a âncora só se calcula a partir de coordenada exata (`canUseForDistance`
em `src/normalize.js`); hoje nenhuma é calculada, e a guarda existe para o dia em que for.

O gráfico é dividido em **dois** módulos puros de propósito. `chart-model.js` decide
significado e `chart-layout.js` decide pixel, porque as duas decisões envelhecem em ritmos
diferentes: passar de quatro para cinco marcas no eixo é estética, mudar o que "sem valor
publicado" significa é metodologia — e juntas, a segunda acaba alterada por engano ao mexer na
primeira. O renderizador em `app.js` recebe geometria pronta e só cria nós: não calcula nada — mas ele
MEDE. O `viewBox` sai da largura real do card (duas passadas: monta, insere, mede, desenha),
porque um `viewBox` fixo dentro de uma caixa menor encolhe a arte inteira em silêncio (R8.74).

**Mês a mês × acumulado no ano** é um modo de série, não um gráfico à parte. `runningSeries`
(`src/ivv/aggregate.js`) agrega de janeiro até cada mês chamando o mesmo `aggregateMetric` de
sempre, então o que "acumulado" significa continua sendo decidido pelo `kind` da métrica —
fluxo soma, estoque tira média, preço e taxa refazem a razão ponderada — e o último ponto da
curva é o mesmo número que o card mostra. O modo troca a série em vez de sobrepor as duas: a
curva acumulada é uma ordem de grandeza maior que a mensal, e um segundo eixo Y para acomodar
as duas inventaria uma correlação que o dado não tem.

**Não há biblioteca de gráfico**, e não é por falta de opção: dependência de runtime é
vendorizada (R1.6) e o site é estático sem etapa de build, então uma biblioteca custaria peso
de download e superfície de manutenção para desenhar sete gráficos de uma série mensal. Cor de
série também não mora nesses módulos — a série declara um ÍNDICE de paleta e o CSS resolve.

## Estratégias de dados

`src/data.js` mantém um registro de estratégias com a mesma assinatura, para que trocar a origem
seja mudança de configuração e não reescrita:

| Estratégia | Uso |
|---|---|
| `gviz` | Google Visualization Query direto na planilha — **caminho principal** |
| `demo` | `data/demo.json` — demonstração e desenvolvimento offline |
| `appsscript` | Web App do Apps Script — alternativa |

O GViz é carregado por **JSONP** (`tqx=responseHandler`), não por `fetch`: o endpoint
público não envia `Access-Control-Allow-Origin` e o navegador bloquearia a resposta no
GitHub Pages mesmo com a planilha compartilhada para leitura.

As três abas obrigatórias são buscadas em paralelo com `Promise.allSettled`: uma aba com
problema não descarta as outras duas que chegaram bem.

O Apps Script **não** substitui o GViz enquanto a leitura direta for simples e confiável.

## Dependências de runtime

Leaflet é a única, e fica **versionada em `assets/vendor/`** em vez de vir de CDN: um site público
não deve depender da disponibilidade de terceiro, não há SRI para manter, e ambientes sem acesso a
CDN conseguem rodar o smoke test.

### Por que Leaflet, e não Google Maps

É decisão, não acidente — e foi reafirmada em 2026-09-21 (issue #134), quando um pedido explicitou
`google.maps.Polyline` como critério.

**Google Maps exigiria uma chave de API no frontend.** O GitHub Pages serve o repositório inteiro
como estático, então essa chave seria pública por construção. Isso colide com três coisas de uma vez:

- a **R4.1/R4.2** ([`ENGINEERING_RULES.md`](ENGINEERING_RULES.md)) — o ID da planilha e a URL do
  `/exec` são públicos **por design**; qualquer outro identificador não é;
- a **varredura de secrets da CI** (`.github/workflows/validate.yml`), que bloqueia o padrão `AIza…`;
- o próprio pedido que levantou a questão, que trazia "nenhuma credencial privada exposta" como
  critério ao lado do Google Maps — os dois não fecham juntos neste modelo de publicação.

E não havia ganho funcional a compensar: a camada de trechos rodoviários oficiais do DER/DF —
eixos `LineString` sobre as poligonais das RAs, com seleção, painel de propriedades e fluxo diário —
foi entregue inteira em Leaflet (issues #131 e #134).

**Uma reavaliação não é trocar uma linha de código.** Ela precisa cobrir restrição da chave por
domínio no console do Google, conta de cobrança, política de cota e — o que costuma ser esquecido —
o que a página faz quando a cota estourar. Enquanto isso não for endereçado, a resposta é Leaflet.

## Regra anti-dessincronização

**Não commitar snapshots de dados para produção.** O navegador consulta a planilha quando a aplicação abre. O GitHub guarda código; a Google Sheet guarda dados.

A exceção é nomeada e cercada (R2.7–R2.9): `data/public/` guarda **dado derivado de fonte
pública oficial** — não um snapshot da planilha —, gerado por `pipeline/`, acompanhado de
manifest com procedência e hash, validado em toda PR e publicado só por PR automática.

## Arquivos públicos: por que estático na mesma origem

- **Sem CORS, sem JSONP, sem chave**: `fetch` do `manifest.json` no próprio Pages (R1.4), em
  `./data/public/` (`publicDataUrl` em `src/config.js`). `fetchPublicManifest` o pede ANTES da
  estratégia de dados e independente dela — `loadDataset` devolve `publicData` nos dois
  caminhos — e `publicFileUrl` recusa outra origem, `..` e caminho absoluto. O GViz continua
  existindo para a planilha; os dois caminhos não se misturam.
- **Cache por conteúdo e conferência**: cada arquivo é buscado com `?v=` (o início do `sha256`
  do manifest) e, antes de desenhar, `fetchPublicLayer` confere `bytes` e `sha256`; arquivo que
  não confere é recusado, nunca desenhado (R2.7). É a mesma ideia do `tools/versionar-assets.mjs`,
  aplicada a dado. Sem `crypto.subtle` o hash não é conferido e o resultado diz "não verificada".
- **Funciona em modo demo e offline**: arquivo local é arquivo local. Manifest inacessível (404,
  rede, tempo esgotado), inválido ou de versão desconhecida vira aviso e controle desabilitado
  com motivo, nunca erro (R2.5, R8.64); o manifest vazio de antes da primeira execução do
  pipeline é o estado esperado — desabilitado com motivo, sem aviso técnico.
- **Carga preguiçosa**: o manifest vem com a carga inicial, junto da ponte de RAs e dos agregados
  por RA (arquivos pequenos); cada camada só é buscada no primeiro liga e fica memoizada por
  `dataset/caminho@sha256`. Abaixo do `zoom_min` do manifest desenha-se o overview; a partir
  dele, só os arquivos de detalhe que a viewport cruza — shards por RA nos domicílios e nos
  empregos, arquivo único nas vias.
- **Duas grafias de RA, uma ponte**: `RA_nn` e `RA2026_RA-<romano>` só se cruzam por
  `ra_crosswalk.json` (R2.9). O cliente não faz aritmética de algarismos romanos: sem a ponte
  carregada o cruzamento resolve ausente, e conflito de nome entre a ponte e a planilha bloqueia
  o join daquela RA. O cruzamento com o PDAD acontece num ponto só, em `load()`:
  `attachTerritory` e `attachRaProfiles` devolvem um índice novo, sem mutação, com os agregados e
  a renda de `RA_PROFILES` anexados; sem arquivo ou sem ponte o índice fica como era, e Ranking,
  dispersão e Comparar leem ausência.

## Por que canvas para as camadas territoriais

Dezenas de milhares de células como `<path>` SVG travam o pan/zoom; `L.canvas()` desenha o mesmo
em um bitmap — e é do próprio Leaflet, sem dependência nova (R1.2). O custo é que canvas não tem
DOM por feição: cor não pode vir de regra de classe CSS. A solução mantém a regra do projeto
("nenhum módulo conhece cor"): os módulos de `src/territorio/` só devolvem **índice de classe**
(pelos cortes do manifest) e, nas linhas, peso e opacidade; `app.js` lê o token da rampa por
`getComputedStyle` no momento do desenho — `--seq-1…6` nos domicílios, `--seq10-1…10` nos
empregos, `--via-1…5` na centralidade — e usa **a mesma função** para a marca e para a amostra da
legenda (R8.42). Token ausente lança, em vez de pintar célula transparente. A prova de que o
canvas mostra a cor certa é por amostragem de pixel no smoke test (R8.83), não por seletor.

**Empilhamento por pane** (`initMap`). Cada camada territorial tem o seu renderizador de canvas,
`L.canvas({ pane, padding: 0.5 })`, no pane próprio; o resto do mapa continua em SVG:

| z-index | Pane | O que desenha |
|---|---|---|
| 350 | `polygons` | contornos; a RA tem preenchimento clicável |
| 355 | `territory` | a coroplética ligada (domicílios ou empregos), num canvas próprio |
| 357 | `raOutline` | as RAs só como linha, enquanto uma camada de área está ligada |
| 358 | `territoryLines` | a centralidade viária, em outro canvas, independente da área |
| 360 | `roadSegments` | eixos rodoviários do DER/DF |
| 380 | `anchors` | âncoras |
| 600 | `markerPane` | anúncios e empreendimentos (pane padrão de marcadores do Leaflet) |

A coroplética fica ACIMA do contorno das RAs (350): abaixo dele, o preenchimento clicável da RA
roubaria o clique da célula. Por isso, enquanto uma área está ligada, o limite oficial da RA é
redesenhado só como linha em `raOutline`. As vias ficam abaixo dos eixos do DER, que são dado
medido e continuam por cima. Área e linha convivem — uma via sobre uma célula ainda se lê, duas
áreas sobrepostas não —, e por isso as áreas são um rádio e as vias, uma caixa de seleção.

O estado vai na URL do mapa (`src/url-state.js`): `terr` (a camada de área), `terr_metrica` (a
métrica, quando não é a padrão) e `vias` (`1` com a centralidade ligada).
`#mapa?terr=households_grid` liga a camada depois que o manifest confirma que ela existe. Pan e
zoom só redesenham quando a assinatura — arquivos e métrica — muda.

## Limite de segurança

A planilha usada pela V1 precisa ser própria para dados públicos. Não coloque nela informações privadas, chaves ou dados pessoais sensíveis.

## Backend opcional

`optional-apps-script/Code.gs` é a rota adotada para writes autenticados (issue #5, `doPost` sob token — R4.9) e para regras privadas. Fora da escrita administrativa, é uma rota futura: só adote mais responsabilidade quando houver necessidade concreta, pois introduz uma segunda superfície de deploy.

## Quando migrar para banco dedicado

- muitos milhares de pontos por abertura;
- filtros geoespaciais no servidor;
- autenticação por usuário;
- writes concorrentes;
- histórico temporal volumoso;
- ingestão automática frequente;
- camadas públicas que já não cabem em overview + shards por RA (o próximo degrau é tile
  vetorial, não planilha).
