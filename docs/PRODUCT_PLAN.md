# Plano de produto

O produto passou da V1 minimalista descrita originalmente: hoje são três views com identidade
própria — **Mapa** (ferramenta geoespacial), **Mercado** (dashboard executivo e temporal) e
**Diagnóstico** (leitura territorial e perfil das Regiões Administrativas, com Ranking, Comparar
e Base de dados como telas irmãs). Este plano registra o que já foi entregue, o que está em
curso e o que fica adiante — sem inventar conexão entre bases que ainda não têm granularidade
compatível (`docs/DATA_CONTRACT.md`).

A premissa continua: **código mora no GitHub, dados moram no Google Sheets**. Sem backend novo,
sem banco dedicado, sem framework pesado, sem nova camada de autenticação.

## Objetivo

Responder, com dado rastreável até a fonte:

1. O que existe nesta região e quanto custa?
2. Como este imóvel ou região se posiciona no recorte selecionado?
3. O mercado está mais rápido ou mais lento, e a que preço?
4. Que perfil tem o território, comparado com as demais RAs?
5. Qual é a fonte, a data, a qualidade e a precisão espacial de cada número?

## Fases

### Fase 1 — Explorar (entregue)
Mapa em tela cheia; busca; filtros rápidos (RA, tipo, preço, quartos) com os secundários numa
gaveta; três entidades (anúncios, empreendimentos, âncoras) e contornos (RAs, rodovias);
detalhe em três níveis com link da fonte e linha de precisão espacial; modo demonstração.

### Fase 2 — Entender (entregue)
Mercado Residencial DF: quatro destaques (preço realizado, vendas, IVV, VGV), grupos de
indicadores, faixa de derivados (gap pedido/venda, meses de oferta, reposição, ticket médio,
área média, distrato/venda), histórico com modo mensal/acumulado, sazonalidade, IVV por RA e
preços FipeZap (DF e por localidade). Diagnóstico Territorial PDAD-A: KPIs, cartões por tema,
perfil imobiliário da RA contra a mediana das RAs publicadas, ranking, comparação e base de
dados com rastreabilidade até a Figura de origem.

### Fase 3 — Comparar (entregue nesta rodada)
Comparáveis no Mapa (régua P25–P50–P75 e posição contra a mediana do recorte); comparação
temporal nos gráficos (período anterior, mesmo período do ano anterior, no mesmo eixo); matriz
preço × liquidez por RA (IVV × preço, IVV × oferta, gap × preço); link compartilhável com view e
filtros na URL.

### Fase 3b — Território (em curso, issue #146)
Dados públicos por pipeline reprodutível (`pipeline/` → `data/public/`, R2.7), lidos pelo site
pelo `manifest.json`. Foco de decisão: **produto e tipologia de lançamento** — perfil de
domicílios e renda, mix de quartos demandado, concorrência e velocidade por RA, lidos lado a lado
com o retrato territorial.

**Entregue no código**
- **Pipeline** (`pipeline/`, issues #147 e #148): ponte entre as duas grafias de RA
  (`ra_crosswalk.json`, R2.9), os três conjuntos e os agregados por RA, cada arquivo com `sha256`
  e orçamento no manifest; validador em toda PR; workflow `dados-publicos.yml` que abre a PR de
  dados.
- **Três mapas** (issues #150 a #152), no bloco "Território (dados públicos)" do Mapa:
  crescimento de domicílios 2010→2022 por célula da Grade Estatística (IBGE), empregos formais
  por hexágono H3 (Ipea/RAIS) e centralidade viária (OpenStreetMap, em linhas). Cada um com
  legenda de classes fixas, métrica selecionável onde há mais de uma, detalhe ao clicar
  (essencial, complementar e técnico), procedência e estado na URL; controle desabilitado, com o
  motivo, enquanto o arquivo não existe.
- **Base de dados** (issue #149): a seção "Arquivos públicos (data/public)" lista cada conjunto do
  manifest com versão, anos, arquivos, fontes (link, data de coleta e licença), método e cortes
  de classe.
- **Indicadores cruzados** (issue #153): crescimento de domicílios 2010→2022, empregos formais
  por mil moradores e por km² e centralidade viária média, por RA, cruzados com o PDAD pela ponte
  de RAs. Entram no Ranking (cartão com fórmula e fonte), em duas leituras da dispersão
  (crescimento × verticalização; empregos × locação), em colunas do Comparar, no bloco "Perfil
  territorial" do Diagnóstico (valor, diferença contra a mediana das RAs com dado, com o `n`, e
  posição) e no bloco da RA do Mapa — sempre com fonte e ano. RA sem agregado, ou sem os arquivos
  públicos, fica ausente, nunca zero. A renda per capita de `RA_PROFILES` cruza pela mesma ponte
  e segue ausente enquanto a planilha não a publicar.

**Pendente**
- **Primeira execução real do pipeline.** `data/public/` tem hoje só o README, os schemas e um
  manifest vazio. A PR automática do `dados-publicos.yml`, em etapas (a ponte de RAs primeiro), o
  povoa depois do merge, e é nela que se confirma o que só a rede mostra — quadrantes da Grade,
  layout do `metadata.csv` do AOP, orçamentos de tamanho (`pipeline/README.md`, "Primeira
  execução real"). Até lá as camadas ficam desabilitadas, com o motivo.
- **Extração BigQuery da RAIS** (fase 2 do pipeline): hoje só o esqueleto do comando `extract`,
  que não grava nada.
- **Modelo 2** (`warehouse/`, issue #154), descrito mais abaixo.

### Fase 4 — Decidir (adiante)
Watchlists, alertas, relatórios e cenários — só com necessidade de usuário comprovada e sem
score automático de oportunidade: a tela mostra números e metodologia; a leitura é de quem usa.

### Fase 5 — Escalar (adiante)
Banco geoespacial dedicado, autenticação, ingestão automatizada, tiles/vetores e APIs
versionadas — quando o Google Sheets deixar de bastar (`docs/ARCHITECTURE.md`, "Quando migrar").

## O que não entra agora

Score de oportunidade; recomendação gerada por IA; modelo preditivo no app (o Modelo 2, abaixo,
só publica previsão com backtest ao lado do número); distância exata a partir de coordenada
aproximada (`canUseForDistance` é a guarda); cruzamento de bases num único número sem fonte e
ano ao lado — cruzar **é** permitido, mas só por chave declarada (`ra_crosswalk.json`, R2.9) e
sempre com a fonte e o ano de cada parcela visíveis. Heatmap/hexbin deixaram de ser "não entra":
entram quando a fonte pública os publica (Grade IBGE, hexágonos do Ipea), nunca como estética
sobre dado aproximado.

## Modelo 2 — base histórica multi‑cidade (planejado, issue #154)

Segunda base, em `warehouse/`: painel histórico de São Paulo, Florianópolis e Goiânia (Brasília
como alvo) — população, domicílios, renda, empregos (RAIS/CAGED), PIB, frota, área urbanizada
(MapBiomas/GHSL), preço (FipeZap) — para ler como as cidades evoluem e produzir cenários 5–10
anos com incerteza declarada. Chega ao app como view "Cidades" lendo `data/public/cidades/`,
pelo mesmo caminho da Fase 3b. Implementação depois da Fase 3b.

## Base de dados: filas, não volume

A planilha é fonte de verdade, governança e fila de pesquisa. `DATA_QUALITY` (com categoria e
ordenação), `LISTINGS_COVERAGE` e `PDAD_A_COVERAGE` dizem onde há e onde falta dado; a pesquisa
segue essas filas, com fonte específica por registro, nunca volume por volume
(`docs/SHEET_SETUP.md` §9).

Snapshot de referência ao escrever este plano: 2026-09-19. Contagens vivem em `APP_META`, não
aqui.
