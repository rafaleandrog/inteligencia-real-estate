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

### Fase 4 — Decidir (adiante)
Watchlists, alertas, relatórios e cenários — só com necessidade de usuário comprovada e sem
score automático de oportunidade: a tela mostra números e metodologia; a leitura é de quem usa.

### Fase 5 — Escalar (adiante)
Banco geoespacial dedicado, autenticação, ingestão automatizada, tiles/vetores e APIs
versionadas — quando o Google Sheets deixar de bastar (`docs/ARCHITECTURE.md`, "Quando migrar").

## O que não entra agora

Score de oportunidade; recomendação gerada por IA; modelo preditivo; heatmap/hexbin
obrigatórios; distância exata a partir de coordenada aproximada (`canUseForDistance` é a guarda);
cruzamento automático PDAD + FipeZap + IVV + anúncios num único número.

## Base de dados: filas, não volume

A planilha é fonte de verdade, governança e fila de pesquisa. `DATA_QUALITY` (com categoria e
ordenação), `LISTINGS_COVERAGE` e `PDAD_A_COVERAGE` dizem onde há e onde falta dado; a pesquisa
segue essas filas, com fonte específica por registro, nunca volume por volume
(`docs/SHEET_SETUP.md` §9).

Snapshot de referência ao escrever este plano: 2026-09-19. Contagens vivem em `APP_META`, não
aqui.
