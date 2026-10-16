# Spec — Inteligência Imobiliária (app UrbiVerso)

**Status:** rascunho em construção, versão 0.1 (2026-10-16).
**Issue de registro:** [#193](https://github.com/rafaleandrog/inteligencia-real-estate/issues/193).
**Slug da app:** `inteligencia_imobiliaria`. **Nome exibido:** Inteligência Imobiliária.
**Instância-alvo da primeira instalação:** Pinguim (`homolog.urbiverso.com.br`), instância de testes.

Este documento é a fonte de verdade do que o app vai ser. Ele substitui, para o app UrbiVerso,
os papéis que `docs/PRODUCT_PLAN.md`, `docs/ARCHITECTURE.md` e `docs/DATA_CONTRACT.md` cumprem
para o site estático. Esses três continuam valendo para o site enquanto ele existir; quando o
app entrar em uso na Pinguim e a planilha for congelada, eles passam a ser históricos.

Convenções do texto:

- **Decisão** é algo fechado com o dono do produto. Cada uma tem um código `D-nn` e aparece no
  registro da seção 16, com a alternativa descartada e o motivo.
- **Pendente** é algo que ainda depende de resposta. Está listado na seção 17 e marcado no texto
  com `[PENDENTE P-nn]`.
- Nomes de tabela, coluna, rota, rotina e parâmetro estão em **português**, `snake_case`, como
  manda a convenção do UrbiVerso. A coluna "origem" das tabelas aponta a aba e a coluna da
  planilha de onde o dado vem na migração.
- Tudo o que o texto afirma sobre a plataforma vem dos docs de `docs/shell/` do UrbiVerso na
  versão `0.56.37` do shell e no nível **SDK 100**. Onde a app depende de algo que entrou num
  nível específico, o nível está citado.

---

## Sumário

1. [Objetivo e princípios](#1-objetivo-e-princípios)
2. [O que existe hoje e o que muda](#2-o-que-existe-hoje-e-o-que-muda)
3. [Arquitetura no UrbiVerso](#3-arquitetura-no-urbiverso)
4. [Manifesto](#4-manifesto)
5. [Modelo de dados (`schema.json`)](#5-modelo-de-dados-schemajson)
6. [API da app (`backend/rotas.ts`)](#6-api-da-app-backendrotasts)
7. [Rotinas](#7-rotinas)
8. [Coleta nos portais](#8-coleta-nos-portais)
9. [Análises por IA](#9-análises-por-ia)
10. [Telas (`frontend/`)](#10-telas-frontend)
11. [Importação, exportação e migração da planilha](#11-importação-exportação-e-migração-da-planilha)
12. [Dados públicos (pipeline → app)](#12-dados-públicos-pipeline--app)
13. [Eventos, erros e notificações](#13-eventos-erros-e-notificações)
14. [Permissões e papéis](#14-permissões-e-papéis)
15. [Fases de implementação](#15-fases-de-implementação)
16. [Registro de decisões](#16-registro-de-decisões)
17. [Pendências](#17-pendências)
18. [Testes, qualidade e critérios de pronto](#18-testes-qualidade-e-critérios-de-pronto)
19. [Glossário](#19-glossário)

---

## 1. Objetivo e princípios

### 1.1 Objetivo

Dar à equipe da UP uma leitura do mercado imobiliário do Distrito Federal, com dado rastreável
até a fonte, em três camadas que conversam: **oferta** (anúncios do mercado secundário e
lançamentos, verificados nos portais), **mercado** (séries publicadas: IVV, FipeZap) e
**território** (PDAD, dados públicos do IBGE, Ipea e OpenStreetMap, rede viária e tráfego). Em
cima dessas camadas, análises escritas por IA que leem o histórico inteiro e dizem o que ele
significa.

As cinco perguntas do plano de produto continuam sendo a régua:

1. O que existe nesta região e quanto custa?
2. Como este imóvel ou região se posiciona no recorte selecionado?
3. O mercado está mais rápido ou mais lento, e a que preço?
4. Que perfil tem o território, comparado com os demais?
5. Qual é a fonte, a data, a qualidade e a precisão espacial de cada número?

E uma sexta, nova (D-01): **o que tudo isso significa, lido por um analista?**

### 1.2 Princípios herdados do site, que continuam valendo

Estes princípios estão provados em produção há meses e entram na app sem mudança:

- **Ausência nunca vira zero.** Amostra vazia, denominador zero e categoria suprimida devolvem
  `null`, e a tela escreve a frase ("não publicado", "sem amostra"). Vale no banco (colunas
  anuláveis), na API (`null` no JSON) e na tela.
- **A fórmula fica ao lado do número.** Todo indicador derivado mostra como foi calculado e de
  que fonte, com o ano.
- **Coordenada aproximada nunca é apresentada como endereço exato.** `precisao_coordenada` e
  `confianca` sobrevivem do banco até a tela. Distância a âncora só se calcula com coordenada
  exata.
- **Preço anunciado é preço pedido, não transação realizada.** A interface não sugere o
  contrário.
- **Registro ruim é sinalizado, nunca apagado em silêncio.** Remoção é soft-delete com autor; a
  decisão de apagar é humana.
- **Escala declarada, nunca inferida.** No site, duas escalas de percentual conviviam
  (`0.057` e `5.7`) e a regra era nunca unificar sem declarar. No app a regra muda de forma e
  não de espírito (D-12): o banco guarda **uma** escala, a fração decimal, e a conversão
  acontece **uma vez**, na importação, por fonte, declarada e registrada no relatório da
  importação. Valor implausível nas duas escalas é recusado, não convertido.
- **Cruzamento só por chave declarada.** As duas grafias de Região Administrativa deixam de
  ser cruzadas por uma ponte externa: viram duas colunas da mesma linha de `localidades`
  (D-07). Nunca por nome, nunca por aritmética de algarismos romanos.
- **Cor não mora no módulo.** Classes de mapa e séries de gráfico declaram índice; quem resolve
  cor é o tema do UrbiVerso ou, no mapa, o `estilo` por feição, que é dado.

### 1.3 Princípios novos, do UrbiVerso

- **UI e API andam juntas.** Toda capacidade da API tem controle na tela e vice-versa. Rota sem
  tela não entra.
- **Doc e código no mesmo PR.** A documentação da app vive em `apps/inteligencia_imobiliaria/docs/`
  e muda junto com o comportamento.
- **A app nunca escreve SQL.** Tudo passa por `req.dados` e, quando o vocabulário não alcança,
  por `sql_declarado` no `schema.json`. Não há banco próprio.
- **Rotina é idempotente e termina em 15 minutos.** Trabalho longo é fatiado com cursor
  persistido.
- **Agente não-humano é usuário de primeira classe.** Nenhuma tela ou rota ramifica por
  natureza do usuário; só por nível e papel.

---

## 2. O que existe hoje e o que muda

### 2.1 Correspondência site → app

| Peça do site | Hoje | No app |
|---|---|---|
| Hospedagem do frontend | GitHub Pages, estático | `frontend/index.js` da app, servido pelo shell em `/inteligencia_imobiliaria` |
| Fonte dos dados curados | Google Sheet (41 abas) via GViz | PostgreSQL da app (schema `inteligencia_imobiliaria`), via `req.dados` |
| Backend de governança | Apps Script `Code.gs` | `backend/rotas.js` + rotinas do shell |
| Rotina diária de anúncios | Gatilho do Apps Script às 04h/05h/06h | Rotinas `verificar_anuncios` e `descobrir_anuncios` (framework de rotinas) |
| Fechamento mensal (retrato + métricas) | Dentro da rotina diária do script | Rotina `fechar_mes` (mensal) + atualização do mês corrente na rotina diária |
| Área admin (`admin.html`, token) | Token em `sessionStorage` | Telas de Cadastro e Operação, gate por nível e papel do shell |
| Dados públicos (`data/public/`) | Arquivos no Pages, lidos pelo manifest | Tabelas `conjuntos_publicos` e `conjunto_arquivos` (coluna `arquivo`), carregadas pela rotina `carregar_dados_publicos` |
| Pipeline Python | GitHub Actions deste repositório | Continua no GitHub Actions; publica artefatos; a app os consome (D-05) |
| Mapa | Leaflet vendorizado, canvas próprio | `urbi-mapa` (SDK ≥ 98), Leaflet em canvas, camadas GeoJSON |
| Gráficos | SVG próprio (`chart-model` + `chart-layout`) | Família `urbi-grafico-*`, `urbi-kpi`, `urbi-mapa-de-calor` |
| Estado na URL (`#mapa?ra=…`) | `url-state.js` | Sub-rota da app + querystring por `replaceState` |
| DATA_QUALITY / CHANGE_LOG | Abas da planilha | `achados_qualidade` + `alteracoes_cadastro` + trilha do shell |
| Modo demonstração (`data/demo.json`) | Existe | **Não existe** (D-15). A app nasce vazia e é povoada por CSV |
| Acesso público | Site aberto | **Nenhum** (D-02). Só usuários da instância, sem permissão padrão |

### 2.2 O que entra na V1 completa (todas as fases)

Tudo o que o site faz hoje, mais:

- análises escritas por IA (seção 9);
- cadastro de anúncio por URL (a app lê a página e preenche) e por formulário;
- verificação automática das páginas de lançamento, com aviso de lacuna;
- exportação CSV de toda tabela que tem tela;
- importação CSV por tabela, com prévia, mapeamento e relatório;
- notificação dos erros de operação ao admin da app;
- modelo de território aberto a outras cidades (D-08).

### 2.3 O que fica de fora da V1 e entra como fase futura (seção 15.7)

- Pipeline fase 2 (empregos 2023 por CEP via BigQuery, Censo 2022 por setor), issue #159.
- Modelo 2, base histórica multi-cidade (`warehouse/`), issue #154.
- Dependência do módulo `imobiliario` do UrbiVerso (D-06).
- Páginas públicas.
- Proxy de saída para os portais, só se o bloqueio aparecer na Pinguim (D-09).

---

## 3. Arquitetura no UrbiVerso

### 3.1 Forma do repositório da app

A app é uma pasta `apps/inteligencia_imobiliaria/` num repositório que segue a convenção dos
repositórios de app do UrbiVerso (`pnpm-workspace.yaml` com `apps/*`, catálogo de versões,
`release.yml` e `ci.yml` do kit `@urbiverso/kit-apps`). **Onde essa pasta nasce** (este
repositório, reorganizado, ou um repositório novo) é decisão adiada (D-16); a spec não depende
dela. O que ela exige é:

```
apps/inteligencia_imobiliaria/
├── manifesto.json
├── schema.json
├── package.json            # build canônico: esbuild frontend (--external:@urbiverso/ui) + backend self-contained
├── tsconfig.json
├── backend/
│   ├── rotas.ts            # exports: rotas, rotinas, aoIniciar
│   ├── rotas/              # um arquivo por domínio (anuncios.ts, mercado.ts, territorio.ts, …)
│   ├── rotinas/            # um arquivo por rotina
│   ├── coleta/             # parser dos portais, classificação de resposta, cliente HTTP com proxy opcional
│   ├── ia/                 # montagem de contexto, schemas de resposta, gravação das análises
│   ├── importacao/         # leitura de CSV, mapeamento, validação por tabela
│   └── metricas/           # mediana, percentil, agregação por natureza (fluxo/estoque/razão)
├── comum/                  # código puro compartilhado: indicadores PDAD, escalas, formatação, classes de mapa
├── frontend/
│   ├── index.ts            # app-inteligencia-imobiliaria: roteador de sub-rotas
│   ├── telas/              # uma por sub-rota
│   └── componentes/        # peças reutilizadas entre telas
├── migracoes/              # vazio no nascimento; migração de dados a partir da 2ª release com mudança de schema
├── docs/
│   ├── README.md           # visão geral (gerado desta spec quando a app existir)
│   ├── dados.md            # contrato de dados (sucessor do DATA_CONTRACT.md)
│   ├── coleta.md           # rotinas e parser
│   ├── analises.md         # IA
│   └── importacao.md       # CSV
└── testes/                 # node --test; fixtures de HTML de portal e de CSV
```

O código puro (`comum/`) é importado pelo backend e pelo frontend por um único `../comum/`,
que o shell aceita como import intra-app. Nenhum arquivo importa `../../shell` nem outra app.

### 3.2 Frameworks do UrbiVerso que a app usa

| Framework | Uso | Declaração |
|---|---|---|
| Dados | todas as tabelas; `req.dados`; `sql_declarado` para ranking e janelas | `schema.json` |
| UI | todas as telas autenticadas; `urbi-mapa`, `urbi-grafico-*`, `urbi-tabela`, `urbi-kpi` | `ui` ausente (= validado) |
| Rotinas | seis rotinas (seção 7) | `rotinas` + `export const rotinas` |
| IA | análises (seção 9), slots custom com base `poder` e um slot opcional de extração com base `barato` | `ia.slots` |
| Config da app | parâmetros declarativos (seção 4.3); aba Rotinas nativa | `parametros` |
| Eventos | erros de operação e evento de lacuna (seção 13) | `eventos`, `erros` |
| Arquivos | CSV de importação, shards dos dados públicos, KML/KMZ importado | colunas `arquivo` |
| Permissões | níveis + papéis `curador` e `operador` | `roles` |

Não usa: Segregação por conta (um território não é um tenant), Módulos (D-06), Páginas públicas
(D-02), Webhooks de entrada, Wiki, Email, Slack direto (a notificação por Slack, se vier, é
destino de Remessa configurado pelo admin, sem código).

### 3.3 Pisos

- `sdk_min`: o major do `@urbiverso/sdk` contra o qual a app compila na primeira release. Hoje
  o nível publicado é 99 e o `main` da plataforma está em 100; `urbi-mapa` exige ≥ 98, o bloco
  `dependencias` não é usado, `formato`/`intervalo` no schema exigem ≥ 94. Regra prática do guia:
  copiar o major instalado.
- `shell_min`: a versão de shell espelhada por esse SDK (`npm view @urbiverso/sdk urbiverso`).
  Não inventar número.
- `versao` do manifesto nasce em `0.1.0` e avança a cada release que muda `schema.json`.

### 3.4 Multi-local (D-08)

Nenhuma tabela de fato guarda "RA" como texto. Toda referência territorial aponta para
`localidades`, que pertence a uma `cidade`. Hoje só existe o Distrito Federal, e `localidades`
tem as 35 RAs mais os submercados do FipeZap. Uma segunda cidade entra sem mudança de schema:
uma linha em `cidades`, suas localidades, e os dados. As telas filtram por cidade quando há mais
de uma; com uma só, o seletor não aparece.

---

## 4. Manifesto

### 4.1 `manifesto.json`

```jsonc
{
  "nome": "Inteligência Imobiliária",
  "versao": "0.1.0",
  "descricao": "Oferta, mercado e território do mercado imobiliário, com dado rastreável e análises por IA",
  "identidade": "<owner>/<repo>::inteligencia_imobiliaria",   // acertado quando o repositório for decidido (D-16)
  "shell_min": "<versão espelhada pelo SDK publicado>",
  "sdk_min": 99,

  "roles": {
    "escrita": {
      "curador": {
        "descricao": "Cadastra e corrige anúncios, lançamentos, âncoras e contornos; aprova candidatos",
        "sticker": { "icone": "fa-solid fa-pen-ruler", "cor": "#2E7D32" }
      },
      "operador": {
        "descricao": "Roda rotinas, gerencia fontes de portal, importa e carrega dados, resolve achados de qualidade",
        "sticker": { "icone": "fa-solid fa-gears", "cor": "#1565C0" }
      }
    }
  },

  "nav": [
    { "titulo": "Mapa", "rota": "/mapa", "icone": "fa-solid fa-map-location-dot" },
    { "titulo": "Mercado", "rota": "/mercado", "icone": "fa-solid fa-chart-line" },
    {
      "titulo": "Diagnóstico", "icone": "fa-solid fa-city",
      "itens": [
        { "titulo": "Perfil territorial", "rota": "/diagnostico" },
        { "titulo": "Ranking", "rota": "/diagnostico/ranking" },
        { "titulo": "Comparar", "rota": "/diagnostico/comparar" },
        { "titulo": "Base de dados", "rota": "/diagnostico/base" }
      ]
    },
    { "titulo": "Análises", "rota": "/analises", "icone": "fa-solid fa-wand-magic-sparkles" },
    {
      "titulo": "Cadastro", "icone": "fa-solid fa-pen-ruler",
      "itens": [
        { "titulo": "Anúncios", "rota": "/cadastro/anuncios" },
        { "titulo": "Lançamentos", "rota": "/cadastro/lancamentos" },
        { "titulo": "Âncoras", "rota": "/cadastro/ancoras" },
        { "titulo": "Contornos", "rota": "/cadastro/contornos" },
        { "titulo": "Localidades", "rota": "/cadastro/localidades" }
      ]
    },
    {
      "titulo": "Operação", "icone": "fa-solid fa-gears",
      "itens": [
        { "titulo": "Candidatos", "rota": "/operacao/candidatos" },
        { "titulo": "Fontes de portal", "rota": "/operacao/fontes" },
        { "titulo": "Execuções", "rota": "/operacao/execucoes" },
        { "titulo": "Importações", "rota": "/operacao/importacoes" },
        { "titulo": "Dados públicos", "rota": "/operacao/dados-publicos" },
        { "titulo": "Qualidade", "rota": "/operacao/qualidade" }
      ]
    }
  ],

  "rotinas": {
    "verificar_anuncios":     { "titulo": "Verificar anúncios nos portais", "descricao": "Confirma, inativa, reativa e lê preço dos anúncios ativos, em lotes", "frequencia": "diaria" },
    "descobrir_anuncios":     { "titulo": "Descobrir anúncios novos", "descricao": "Lê as buscas salvas das fontes, gera candidatos e promove os que passam nos portões", "frequencia": "diaria" },
    "verificar_lancamentos":  { "titulo": "Verificar páginas de lançamentos", "descricao": "Lê a página de cada lançamento, atualiza o que encontrar e registra lacunas", "frequencia": "semanal" },
    "fechar_mes":             { "titulo": "Fechar o mês dos anúncios", "descricao": "Grava o retrato do mês anterior e recalcula as métricas mensais", "frequencia": "mensal" },
    "carregar_dados_publicos":{ "titulo": "Carregar dados públicos do pipeline", "descricao": "Lê o manifest publicado e carrega os arquivos que mudaram de hash", "frequencia": "mensal" },
    "gerar_analises_mensais": { "titulo": "Gerar análises mensais por IA", "descricao": "Escreve a análise do mês para o DF e para cada localidade com dado suficiente", "frequencia": "mensal" }
  },

  "ia": {
    "slots": {
      "analise_territorio": { "titulo": "Análise de território", "base": "poder", "descricao": "Leitura analítica de uma localidade: oferta, preço, perfil e território, sobre o histórico inteiro" },
      "analise_mercado":    { "titulo": "Análise de mercado", "base": "poder", "descricao": "Leitura analítica do mercado da cidade no mês, sobre IVV, FipeZap e oferta" },
      "analise_tela":       { "titulo": "Análise do recorte em tela", "base": "poder", "descricao": "Leitura do recorte que o usuário está vendo (filtros do mapa ou do mercado)" },
      "extracao_pagina":    { "titulo": "Extração de página (opcional)", "base": "barato", "descricao": "Fallback para extrair campos de uma página de lançamento sem dado estruturado; desligado por padrão" }
    }
  },

  "parametros": { /* seção 4.3 */ },
  "eventos":    { /* seção 13 */ },
  "erros":      { /* seção 13 */ }
}
```

Observações:

- `permissao_padrao` não é campo do manifesto: é configuração do admin da instância. A spec pede
  que ela fique em **nenhuma** (D-13); a liberação é por pessoa.
- `rotas_publicas`, `paginas_publicas`, `dependencias`, `webhooks`, `wiki`, `emails` não são
  declarados.
- `ui` fica ausente: a app está sob o framework de UI e é validada por ele.

### 4.2 Exports do `backend/rotas.ts`

| Export | Conteúdo |
|---|---|
| `rotas` | Router autenticado, montado em `/api/inteligencia_imobiliaria/` (seção 6) |
| `rotinas` | Handlers das seis rotinas (seção 7) |
| `aoIniciar` | Semente idempotente: a cidade `distrito_federal` e as 35 localidades do tipo `ra` com códigos oficiais, **sem** geometria nem perfil (os dois vêm por importação). Guarda o `ctx` para uso das rotinas de fatiamento |
| `aoEncerrar` | Cancela qualquer lote de coleta em voo (sinaliza `AbortController`) |

Não exporta `rotasPublicas`, `rotasPessoais`, `webhooks`, `reagir` nem `disparadores`.

### 4.3 Parâmetros (Config › Parâmetros)

| Slug | Tipo | Padrão | Para quê |
|---|---|---|---|
| `confirmacoes_inatividade` | numero | `2` | Falhas em dias distintos antes de marcar anúncio inativo (D-10) |
| `variacao_preco_maxima_frac` | numero | `0.60` | Acima disso o preço lido não sobrescreve; vira evento `preco_nao_confirmado` |
| `tolerancia_preco_m2_frac` | numero | `0.05` | Divergência entre preço/m² informado e calculado que vira achado de qualidade |
| `max_verificacoes_por_execucao` | numero | `250` | Lote da rotina `verificar_anuncios` |
| `max_paginas_busca_por_execucao` | numero | `50` | Lote da rotina `descobrir_anuncios` |
| `max_candidatos_por_execucao` | numero | `250` | Candidatos processados por execução |
| `orcamento_rotina_ms` | numero | `600000` | Orçamento de tempo por execução (10 min; o shell corta em 15) |
| `intervalo_min_por_host_ms` | numero | `1500` | Pausa mínima entre duas requisições ao mesmo host |
| `user_agent_coleta` | string | `ImobIntelligence/1.0 (+UrbiVerso; public-data-collector)` | Cabeçalho de identificação |
| `proxy_saida_url` | string, `secret` | (vazio) | URL `http://usuario:senha@host:porta` de um proxy de saída. Vazio = acesso direto (D-09) |
| `jitter_raio_m` | numero | `350` | Raio do deslocamento determinístico aplicado à coordenada aproximada |
| `manifest_publico_url` | string | URL raw do `data/public/manifest.json` no GitHub | De onde a rotina `carregar_dados_publicos` lê o manifest |
| `usar_ia_extracao_lancamentos` | bool | `false` | Liga o slot `extracao_pagina` como fallback na verificação de lançamentos |
| `analise_minimo_meses_historico` | numero | `6` | Meses de histórico mínimos para a IA escrever sobre um recorte |
| `instrucoes_analise_territorio` | texto_longo | texto da seção 9.3 | Instruções de sistema da análise de localidade |
| `instrucoes_analise_mercado` | texto_longo | texto da seção 9.3 | Instruções de sistema da análise de mercado |
| `instrucoes_analise_tela` | texto_longo | texto da seção 9.3 | Instruções de sistema da análise de recorte |
| `faixas_area_m2` | string | `50,80,120,180` | Cortes das faixas de área das métricas mensais |

O padrão é vivo: mudar um `padrao` num release vale em toda instância que não personalizou.
As instruções de IA ficam como parâmetro justamente para que a equipe as refine na tela, sem
release.

---

## 5. Modelo de dados (`schema.json`)

### 5.1 Regras gerais

- Toda tabela declara `acesso_externo`. O padrão é **`restrito`**: a rota genérica
  `/api/dados/...` fica fechada e toda leitura e escrita passa pelas rotas da app, que aplicam
  as regras (papel, validação, eventos). Só as tabelas de leitura simples sem regra ficam em
  `somente_leitura` (indicado na tabela).
- Toda tabela de cadastro tem `soft_delete: true` e `id_legivel`.
- Toda coluna que guarda percentual termina em `_frac` e está em **fração decimal**
  (`0.057` = 5,7%). Toda coluna em pontos percentuais termina em `_pp` e só existe para
  diferenças (`ivv_variancia_pp`). Não há terceira forma (D-12).
- Dinheiro é `decimal(14,2)` em BRL nominal. Área é `decimal(12,2)` em m². Coordenada é
  `decimal(10,7)`. Sem `R$`, sem separador de milhar.
- `data` é data civil (`YYYY-MM-DD`); `datahora` é instante. Mês de referência é `data` fixada
  no dia 1º.
- Geometria é GeoJSON (`geometry`) em coluna `json`, sempre `[longitude, latitude]` em
  EPSG:4326, com as quatro colunas de caixa envolvente ao lado para filtro por área. Não existe
  PostGIS para app; filtro espacial fino é feito em código sobre o resultado do filtro de caixa.
- Colunas com vocabulário fechado usam `opcoes`. Vocabulário aberto por decisão (segmento de
  âncora, situação de regularização, qualidade) fica `texto`, e quem renderiza humaniza o termo
  desconhecido em vez de vazar o slug.
- Toda tabela que o site lia da planilha guarda em `id_legado` (texto, único quando preenchido)
  a chave antiga (`listing_id`, `development_id`, `place_id`, `polygon_id`, …), para a migração
  ser conferível e para links antigos serem traduzíveis.
- `extras` (`json`) aparece nas tabelas de série publicada: guarda as colunas publicadas que o
  app não modela como coluna própria, verbatim, para nada se perder na importação.

### 5.2 Visão geral

```
cidades ─┬─ localidades ─┬─ localidade_perfis
         │               ├─ contornos
         │               ├─ anuncios ─┬─ anuncio_eventos
         │               │            └─ anuncio_retratos
         │               ├─ metricas_anuncios_mensais
         │               ├─ lancamentos ── lancamento_eventos
         │               ├─ ancoras
         │               ├─ ivv_regional
         │               ├─ fipezap_mensal
         │               ├─ pdad_observacoes
         │               ├─ agregados_territoriais
         │               └─ analises_ia
         └─ ivv_mensal

fontes_portal ─┬─ buscas_portal
               └─ candidatos ── anuncios

coletas (execuções)  cursores_rotina  importacoes  achados_qualidade  alteracoes_cadastro

trechos_rodoviarios ─┬─ trecho_aliases
                     ├─ sentidos_oficiais
                     ├─ trafego_diario
                     └─ corredores ── corredor_diario

conjuntos_publicos ── conjunto_arquivos      pdad_figuras   procedencias
```

### 5.3 Território

#### `cidades`

`acesso_externo: somente_leitura` · `id_legivel: "{nome}"`

| Coluna | Tipo | Obrig. | Origem | Observação |
|---|---|---|---|---|
| `slug` | texto(60), único, `formato ^[a-z][a-z0-9_]*$` | sim | semente | `distrito_federal` |
| `nome` | texto(120) | sim | semente | "Distrito Federal" |
| `uf` | texto(2) | sim | semente | `DF` |
| `codigo_ibge` | texto(7) | não | semente | `5300108` |
| `centro_latitude`, `centro_longitude` | decimal(10,7) | sim | `config.js defaultCenter` | centro inicial do mapa |
| `zoom_inicial` | inteiro | sim | `config.js defaultZoom` | `10` |
| `ativa` | booleano | sim, padrão `true` | — | cidade inativa some dos seletores |

#### `localidades`

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "{nome} ({codigo})"`

Unifica o que hoje está espalhado em `RA_PROFILES` (identidade e códigos), `POLYGONS` com
`layer_group = administrative_regions` (só o vínculo; a geometria fica em `contornos`),
`FIPEZAP_LOCALITY_MAP` (submercados) e `ra_crosswalk.json` (as duas grafias).

| Coluna | Tipo | Obrig. | Origem | Observação |
|---|---|---|---|---|
| `cidade_id` | referencia → `cidades`, `restringir` | sim | — | |
| `tipo` | texto, `opcoes: ["ra", "submercado", "bairro", "municipio", "agregado"]` | sim | derivado | `agregado` é a linha "DF Total"/"BRASILIA" das séries |
| `codigo` | texto(40) | sim | `RA_PROFILES.ra_geo_id` (`RA_01`) · `FIPEZAP_LOCALITY_MAP.locality_map_id` | chave estável da localidade na cidade |
| `codigo_romano` | texto(12) | não | `RA_PROFILES.ra_code` (`RA-I`) | só `ra` |
| `codigo_legado` | texto(40) | não | `LISTINGS.ra_geo_id` (`RA2026_RA-I`) via `ra_crosswalk.json` | a segunda grafia; é por ela que a migração traduz anúncios, lançamentos e âncoras |
| `numero` | inteiro | não | `RA_PROFILES.ra_number` | |
| `nome` | texto(120) | sim | `RA_PROFILES.ra_name` · `FIPEZAP_LOCALITY_MAP.ra_name` | nome de exibição |
| `nome_fonte` | texto(120) | não | `FIPEZAP_LOCALITY_MAP.source_locality_name` (`ASA SUL`) | como a fonte publica; nunca é apagado |
| `localidade_pai_id` | referencia → `localidades`, `anular` | não | `FIPEZAP_LOCALITY_MAP.ra_geo_id` | submercado → RA |
| `classificacao_fonte` | texto(40) | não | `FIPEZAP_LOCALITY_MAP.geography_classification` | `RA_OU_LOCALIDADE_FIPE`, `SUBMERCADO_FIPE`, `AGREGADO_DF` |
| `regra_mapeamento` | texto_longo | não | `FIPEZAP_LOCALITY_MAP.mapping_rule` | |
| `nota_metodologica` | texto_longo | não | `FIPEZAP_LOCALITY_MAP.methodology_note` | |
| `vigente_de`, `vigente_ate` | data | não | `FIPEZAP_LOCALITY_MAP.valid_from/valid_to` | |
| `area_km2` | decimal(12,4) | não | `RA_PROFILES.area_km2` | oficial (GeoPortal) |
| `ponto_referencia_latitude`, `ponto_referencia_longitude` | decimal(10,7) | não | centroide do contorno vigente, ou cadastro | ponto base do jitter dos anúncios sem coordenada (seção 8.6) |
| `criada_apos_pdad_2024` | booleano | não | `RA_PROFILES.created_after_pdad_2024` | |
| `localidade_predecessora_id` | referencia → `localidades`, `anular` | não | `RA_PROFILES.predecessor_ra` | |
| `referencia_legal` | texto(200) | não | `RA_PROFILES.legal_reference` | |
| `geometria_fonte_url` | texto(500) | não | `RA_PROFILES.geometry_source_url` | |
| `perfil_fonte_url` | texto(500) | não | `RA_PROFILES.profile_source_url` | |
| `qualidade` | texto(80) | não | `RA_PROFILES.quality_flag` | |
| `notas` | texto_longo | não | `RA_PROFILES.notes` | |

`unicos`: `(cidade_id, tipo, codigo)`; `(cidade_id, codigo_legado)` onde `codigo_legado` não é
nulo. `indices`: `(cidade_id, tipo)`. `busca_texto`: `nome`, `nome_fonte`.

#### `localidade_perfis`

`acesso_externo: somente_leitura` · `id_legivel: "{ano_referencia}"`

Uma linha por localidade e ano de referência (hoje só 2024). Sucede `RA_PROFILES` sem a
identidade, que foi para `localidades`.

| Coluna | Tipo | Origem (`RA_PROFILES.`) |
|---|---|---|
| `localidade_id` | referencia → `localidades`, `restringir`, obrig. | `ra_geo_id` |
| `ano_referencia` | inteiro, obrig. | `profile_reference_year` |
| `populacao_total` | inteiro | `population_total` |
| `densidade_hab_km2` | decimal(12,2) | `population_density_km2` |
| `renda_per_capita_brl` | decimal(12,2) | `income_per_capita_brl` |
| `faixa_0_14_frac`, `faixa_15_29_frac`, `faixa_30_44_frac`, `faixa_45_59_frac`, `faixa_60_mais_frac` | decimal(6,5) | `population_age_*_pct` ÷ 100 |
| `idade_media` | decimal(5,2) | `average_age` |
| `feminino_frac`, `masculino_frac` | decimal(6,5) | `female_pct`, `male_pct` ÷ 100 |
| `domicilios_total` | inteiro | `households_total` |
| `moradores_por_domicilio` | decimal(5,2) | `avg_household_size` |
| `tipologia_dominante`, `tipologia_dominante_frac` | texto(40), decimal(6,5) | `dominant_dwelling_type`, `_pct` ÷ 100 |
| `ocupacao_dominante`, `ocupacao_dominante_frac` | texto(40), decimal(6,5) | `dominant_tenure`, `_pct` ÷ 100 |
| `escritura_registrada_frac` | decimal(6,5) | `deed_registered_pct` ÷ 100 |
| `status` | texto(80) | `profile_status` |
| `qualidade` | texto(80) | `quality_flag` |
| `extras` | json | as demais colunas de `RA_PROFILES` (`avg_residents_private_occupied`, `pdad_*_pct`, `primary_work_location`, `sector_count`, `coverage_note`, …), verbatim |

`unicos`: `(localidade_id, ano_referencia)`. Validação na importação: cada `faixa_*_frac` em
[0, 1]; soma das cinco em [0,98, 1,02] senão achado `SOMA_FAIXAS_ETARIAS`; renda ≥ 0.

#### `contornos`

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "{nome}"`

Sucede `POLYGONS` inteira: RA, KML importado, eixo rodoviário e corredor com buffer. O que os
separa é `tipo_entidade` e `papel_geometria`, não tabelas diferentes.

| Coluna | Tipo | Obrig. | Origem (`POLYGONS.`) | Observação |
|---|---|---|---|---|
| `id_legado` | texto(80), único parcial | não | `polygon_id` | |
| `nome` | texto(200) | sim | `name` | |
| `categoria`, `subcategoria` | texto(60) | não | `category`, `subcategory` | |
| `tipo_entidade` | texto, `opcoes: ["regiao_administrativa", "trecho_rodoviario", "area_personalizada"]` | sim | `entity_type` | |
| `entidade_codigo` | texto(80) | não | `entity_id` | id da entidade do mundo real; por ele uma versão supera a anterior |
| `papel_geometria` | texto, `opcoes: ["limite_exibicao", "limite", "eixo_rota", "corredor_exibicao"]` | sim | `geometry_role` | |
| `localidade_id` | referencia → `localidades`, `anular` | não | `ra_geo_id` | |
| `grupo_camada` | texto(60) | sim | `layer_group` | `administrative_regions`, `road_segments`, `road_network`, `poligonais_importadas` |
| `geometria` | json | sim | `geometry_geojson` | GeoJSON `geometry`, `[lng, lat]`; é o que vai ao mapa |
| `geometria_tipo` | texto(20) | sim | `geometry_type` ou inferido | `Polygon`, `MultiPolygon`, `LineString`, `MultiLineString` |
| `geometria_fonte` | json | não | `source_geometry_geojson` | original; só vira desenho como fallback de eixo rodoviário (regra da seção 10.1) |
| `bbox_oeste`, `bbox_sul`, `bbox_leste`, `bbox_norte` | decimal(10,7) | sim | calculado na escrita | filtro por área visível |
| `centroide_latitude`, `centroide_longitude` | decimal(10,7) | não | `centroid_*` ou calculado | |
| `area_m2`, `area_ha`, `perimetro_m` | decimal(16,2) | não | idem | |
| `metricas_aproximadas` | booleano | sim | derivado | `true` quando calculadas por projeção plana (apoio visual, não medida) |
| `estilo` | json | não | `fill_color`, `stroke_color`, `fill_opacity`, `stroke_width`, `z_index`, `color` | no formato `EstiloFeicao` do `urbi-mapa` |
| `buffer_exibicao_m` | decimal(8,2) | não | `display_buffer_m` | `0` no eixo |
| `descricao` | texto_longo | não | `description` | texto de terceiro: sempre `textContent` |
| `propriedades` | json | não | `properties_json` | |
| `fonte_url`, `fonte_arquivo`, `fonte_sistema`, `fonte_camada`, `fonte_feicao_id`, `fonte_crs` | texto | não | `source_*` | `fonte_crs` é o CRS **nativo da fonte**, não o da geometria gravada |
| `fonte_verificada_em` | data | não | `source_page_verified_at` | |
| `confianca`, `qualidade` | texto(80) | não | `confidence_flag`, `quality_flag` | |
| `geometria_hash` | texto(64) | sim | `geometry_hash` ou calculado | SHA-256 da geometria; detecta mudança de limite |
| `vigente_de`, `vigente_ate` | data | não | `geometry_valid_from/_to` | vazio = vigente |
| `sincronizado_em`, `importado_em` | datahora | não | `last_synced_at`, `imported_at` | |
| `status` | texto, `opcoes: ["ativo", "inativo"]` | sim | `status` | limite substituído fica `inativo` com `vigente_ate`, nunca é apagado |
| `arquivo_origem` | arquivo (`application/vnd.google-earth.kml+xml`, `application/vnd.google-earth.kmz`, `application/geo+json`; 20 MB) | não | — | o KML/KMZ/GeoJSON importado, guardado para reprocessamento |

`unicos`: `(tipo_entidade, entidade_codigo, geometria_hash)`. `indices`: `(grupo_camada, status)`,
`(bbox_oeste, bbox_leste)`, `(bbox_sul, bbox_norte)`, `(localidade_id)`.

Validação na escrita (mesmas regras do `Code.gs`): `Polygon`/`MultiPolygon` com anel de ao
menos quatro posições, três distintas, fechado; `LineString` com ao menos duas; longitude em
[-180, 180], latitude em [-90, 90]; ordem `[lng, lat]` conferida pela faixa (latitude fora de
[-90, 90] denuncia inversão).

### 5.4 Mercado secundário (anúncios)

#### `fontes_portal`

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "{nome}"`

| Coluna | Tipo | Obrig. | Origem (`LISTING_SOURCES.`) | Observação |
|---|---|---|---|---|
| `slug` | texto(60), único, `formato ^[a-z][a-z0-9_]*$` | sim | `source_id` (`SRC_PORTAL_QUINTOANDAR` → `quintoandar`) | |
| `nome` | texto(80) | sim | `source_name` | o `portal` dos anúncios |
| `tipo` | texto, `opcoes: ["portal", "agregador", "manual"]` | sim | `source_type` | |
| `ativa` | booleano | sim | `active` | fonte inativa não é lida nem verificada |
| `frequencia` | texto, `opcoes: ["diaria", "semanal", "manual"]` | sim | `collection_frequency` | |
| `url_base` | texto(500) | sim | `base_url` | o host dela é a unidade do intervalo mínimo entre requisições |
| `parser` | texto, `opcoes: ["generico_html", "generico_json", "quintoandar", "dfimoveis", "wimoveis", "imovelweb", "vivareal"]` | sim | `parser_key` | seção 8.3 |
| `config_parser` | json | não | `parser_config_json` | `items_path`, `field_map` |
| `cabecalhos` | json | não | `request_headers_json` | cabeçalhos extras |
| `notas` | texto_longo | não | `notes` | |
| `estado` | texto, `opcoes: ["ok", "bloqueada", "instavel", "sem_dado"]` | sim | derivado | atualizado por execução (seção 8.4) |
| `bloqueada_desde` | datahora | não | — | |
| `ultimo_sucesso_em`, `ultimo_erro_em` | datahora | não | `last_success_at`, `last_error_at` | |
| `ultima_coleta_id` | referencia → `coletas`, `anular` | não | `last_run_id` | |

#### `buscas_portal`

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "{rotulo}"`

Uma URL de resultados por linha (o que `LISTING_SOURCES.search_urls` guardava separado por
vírgula, e o que o repositório chamava de `LISTING_SEARCHES`).

| Coluna | Tipo | Obrig. | Observação |
|---|---|---|---|
| `fonte_id` | referencia → `fontes_portal`, `restringir` | sim | |
| `rotulo` | texto(120) | sim | "Apartamentos 2q Asa Norte venda" |
| `url` | texto(1000) | sim | URL de resultados copiada do portal; só `http(s)` |
| `localidade_id` | referencia → `localidades`, `anular` | não | localidade esperada dos resultados; alimenta o portão de coerência |
| `tipo_transacao` | texto, `opcoes: ["venda", "locacao"]` | não | idem |
| `tipo_imovel` | texto, opções da tabela `anuncios` | não | idem |
| `ativa` | booleano | sim | |
| `ultima_leitura_em` | datahora | não | |
| `ultimo_status` | texto, `opcoes: ["ok", "bloqueada", "erro", "sem_resultados"]` | não | |
| `candidatos_gerados` | inteiro | sim, padrão 0 | acumulado |
| `autor_id` | referencia → `shell.usuarios` | não | quem cadastrou |

`unicos`: `(fonte_id, url)`.

#### `anuncios`

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "{titulo} · {localidade_texto}"`

| Coluna | Tipo | Obrig. | Origem (`LISTINGS.`) | Observação |
|---|---|---|---|---|
| `id_legado` | texto(200), único parcial | não | `listing_id` | |
| `fonte_id` | referencia → `fontes_portal`, `restringir` | sim | `portal` → fonte pelo nome | |
| `portal` | texto(80) | sim | `portal` | redundante com `fonte_id.nome` de propósito: o nome do portal no momento da coleta é fato histórico |
| `tipo_transacao` | texto, `opcoes: ["venda", "locacao"]` | sim | `transaction_type` (`sale`→`venda`, `rent`→`locacao`) | |
| `titulo` | texto(300) | sim | `title` | |
| `url_fonte` | texto(1000), único parcial | sim | `source_url` | canônica (sem query e fragmento) |
| `tipo_url_fonte` | texto(40) | não | `source_url_type` | `individual_listing`, `detail` |
| `id_externo` | texto(120) | não | `external_id` | |
| `codigo_portal` | texto(120) | não | `portal_listing_code` | |
| `data_texto_portal` | texto(40) | não | `portal_date_text` | |
| `status` | texto, `opcoes: ["ativo", "inativo"]` | sim | `status` (vazio → `ativo`) | |
| `localidade_id` | referencia → `localidades`, `restringir` | sim | `ra_geo_id` via `codigo_legado` | |
| `endereco` | texto(300) | não | `address` | |
| `localidade_texto` | texto(120) | sim | `locality` | o nome do bairro/setor como a fonte deu |
| `latitude`, `longitude` | decimal(10,7) | sim | `latitude`, `longitude` | |
| `precisao_coordenada` | texto, `opcoes: ["exata_fonte", "centroide_localidade_jitter_deterministico", "centroide_localidade_jitter", "centroide_ra_jitter_deterministico", "manual"]` | sim | `coordinate_precision` | |
| `confianca` | texto(60) | sim | `confidence_flag` | `low_spatial_high_attribute`, `source_observed`, … (vocabulário aberto) |
| `tipo_imovel` | texto, `opcoes: ["apartamento", "casa", "casa_condominio", "kitnet", "predio", "terreno", "nao_classificado"]` | sim | `property_type` (`imovel` → `nao_classificado`) | orientação vertical/horizontal é derivada em código |
| `preco_pedido_brl` | decimal(14,2) | não | `asking_price_brl` | `null` quando a fonte não publica; nunca 0 |
| `area_m2` | decimal(12,2) | não | `area_m2` | |
| `base_area` | texto(40) | não | `area_basis` | `portal_area_unspecified`, `privativa`, `total` |
| `preco_m2_informado_brl` | decimal(12,2) | não | `asking_price_brl_m2` | só quando a fonte informa; o calculado é derivado em leitura |
| `quartos`, `suites`, `vagas` | inteiro | não | `bedrooms`, `suites`, `parking_spaces` | `quartos` obrigatório hoje (141/141); passa a opcional porque a descoberta pode não achar |
| `condominio_brl`, `iptu_brl` | decimal(12,2) | não | `condo_fee_brl`, `iptu_brl` | |
| `dias_publicado`, `visualizacoes`, `interessados` | inteiro | não | `published_days`, `views_count`, `interested_count` | |
| `qualidade` | texto(80) | sim | `quality_flag` | |
| `situacao_regularizacao` | texto(40) | não | `regularization_status` | vocabulário aberto (`regularizado`, `nao_regularizado`, `em_regularizacao`) |
| `observado_em` | data | sim | `observed_at` | última vez que o **preço** foi observado |
| `visto_em` | data | não | `last_seen_at` | última confirmação no portal |
| `pagina_verificada_em` | data | não | `source_page_verified_at` | |
| `primeiro_visto_em` | datahora | sim | `first_seen_at` | |
| `verificado_em` | datahora | não | `last_checked_at` | última tentativa, com qualquer resultado |
| `preco_alterado_em` | datahora | não | `last_price_change_at` | |
| `inativo_em` | datahora | não | `inactive_at` | |
| `falhas_verificacao` | inteiro | sim, padrão 0 | `verification_failures` | zera ao confirmar ativo |
| `ultima_falha_em` | data | não | derivado | garante "dias distintos" na contagem |
| `ultimo_status_verificacao` | texto, `opcoes: ["ativa", "inativa", "inativa_pendente", "bloqueada", "erro", "nunca"]` | sim | `last_check_status` | |
| `ultimo_http` | inteiro | não | `last_check_http_code` | |
| `ultima_mensagem` | texto(500) | não | `last_check_message` | |
| `hash_conteudo` | texto(64) | não | `content_hash` | SHA-256 dos campos que importam (seção 8.5) |
| `versao_parser` | texto(60) | não | `parser_version` | |
| `coleta_id` | referencia → `coletas`, `anular` | não | `update_run_id` | |
| `origem_cadastro` | texto, `opcoes: ["importacao", "descoberta", "manual_url", "manual_formulario"]` | sim | derivado (`importacao` na migração) | |
| `caracteristicas` | json | não | `LISTING_CANDIDATES.features_json` quando promovido | lista livre do portal |

`unicos`: `(fonte_id, id_externo)` onde `id_externo` não nulo e `removido_em` nulo; `url_fonte`
onde `removido_em` nulo. `indices`: `(localidade_id, status)`, `(status, visto_em)`,
`(tipo_imovel, tipo_transacao)`, `(latitude, longitude)`, `(primeiro_visto_em)`.
`busca_texto`: `titulo`, `endereco`, `localidade_texto`.

Derivados **em código**, nunca gravados: `orientacao` (`vertical` para apartamento, prédio e
kitnet; `horizontal` para casa, casa em condomínio e terreno; `null` para não classificado),
`preco_m2_calculado` (`preco_pedido_brl / area_m2`), `preco_m2` (informado quando existe, senão
calculado), `divergencia_preco_m2_frac` e `preco_m2_divergente` (acima de
`tolerancia_preco_m2_frac`), `pode_calcular_distancia` (`precisao_coordenada = exata_fonte`).

#### `anuncio_eventos`

`acesso_externo: somente_leitura` · `id_legivel: "{tipo} em {ocorrido_em}"`

| Coluna | Tipo | Origem (`LISTING_EVENTS.`) |
|---|---|---|
| `anuncio_id` | referencia → `anuncios`, `cascata`, obrig. | `listing_id` |
| `tipo` | texto, `opcoes: ["criado", "reativado", "preco_alterado", "preco_nao_confirmado", "inativo_confirmado", "bloqueado", "corrigido_manualmente", "removido", "restaurado"]`, obrig. | `event_type` |
| `ocorrido_em` | datahora, obrig. | `event_at` |
| `status_anterior`, `status_novo` | texto(20) | `old_status`, `new_status` |
| `preco_anterior_brl`, `preco_novo_brl` | decimal(14,2) | `old_price_brl`, `new_price_brl` |
| `campos_alterados` | json (lista de nomes) | `changed_fields` |
| `coleta_id` | referencia → `coletas`, `anular` | `run_id` |
| `autor_id` | referencia → `shell.usuarios`, `anular` | — (nulo quando foi a rotina) |
| `detalhes` | texto(1000) | `details` |

`indices`: `(anuncio_id, ocorrido_em)`, `(tipo, ocorrido_em)`.

#### `anuncio_retratos`

`acesso_externo: somente_leitura` · `id_legivel: "{mes_referencia}"`

Retrato de cada anúncio no fim do mês. Sucede `LISTINGS_HISTORY_MONTHLY`. A rotina diária
mantém a linha do **mês corrente** sempre atualizada e a rotina `fechar_mes` congela o mês
anterior (seção 7.4).

| Coluna | Tipo | Origem (`LISTINGS_HISTORY_MONTHLY.`) |
|---|---|---|
| `mes_referencia` | data (dia 1º), obrig. | `reference_month` |
| `anuncio_id` | referencia → `anuncios`, `cascata`, obrig. | `listing_id` |
| `status_fim_mes` | texto(20), obrig. | `status_at_month_end` |
| `preco_pedido_brl`, `area_m2`, `preco_m2_brl` | decimal | `asking_price_brl`, `area_m2`, `asking_price_brl_m2` |
| `quartos`, `suites`, `vagas` | inteiro | idem |
| `tipo_imovel`, `tipo_transacao` | texto | idem |
| `localidade_id` | referencia → `localidades`, `restringir` | `ra_geo_id` |
| `latitude`, `longitude` | decimal(10,7) | idem |
| `primeiro_visto_em`, `visto_em`, `preco_alterado_em` | datahora | idem |
| `hash_conteudo` | texto(64) | `content_hash` |
| `coleta_id` | referencia → `coletas`, `anular` | `capture_run_id` |
| `capturado_em` | datahora, obrig. | `captured_at` |
| `congelado` | booleano, obrig., padrão `false` | derivado | `true` depois do `fechar_mes`; linha congelada não é reescrita |

`unicos`: `(mes_referencia, anuncio_id)`. `indices`: `(mes_referencia, localidade_id)`.

#### `metricas_anuncios_mensais`

`acesso_externo: somente_leitura` · `id_legivel: "{mes_referencia} {faixa_area}"`

Sucede `LISTINGS_MONTHLY_METRICS`. Materializada pela rotina (seção 7.4), nunca editada.
`null` nas dimensões significa "todas".

| Coluna | Tipo | Origem (`LISTINGS_MONTHLY_METRICS.`) |
|---|---|---|
| `mes_referencia` | data, obrig. | `reference_month` |
| `cidade_id` | referencia → `cidades`, obrig. | derivado |
| `localidade_id` | referencia → `localidades`, `restringir` | `ra_geo_id` (`null` = cidade inteira) |
| `tipo_imovel`, `tipo_transacao` | texto | `property_type`, `transaction_type` |
| `quartos` | inteiro | `bedrooms` |
| `faixa_area` | texto(12), obrig. | `area_band` (`0-49`, `50-79`, `80-119`, `120-179`, `180+`, `todas`) |
| `ativos`, `novos`, `inativados` | inteiro, obrig. | `active_ads_count`, `new_ads_count`, `inactive_ads_count` |
| `preco_mediano_brl`, `preco_medio_brl`, `preco_p25_brl`, `preco_p75_brl` | decimal(14,2) | `median_price`, `average_price`, `p25_price`, `p75_price` |
| `preco_m2_mediano_brl`, `preco_m2_medio_brl` | decimal(12,2) | `median_price_m2`, `average_price_m2` |
| `area_mediana_m2` | decimal(12,2) | `median_area_m2` |
| `vagas_mediana` | decimal(5,2) | `median_parking_spaces` |
| `variacao_preco_mom_frac`, `variacao_estoque_mom_frac` | decimal(8,5) | `price_change_mom_pct` ÷ 100, `inventory_change_mom_pct` ÷ 100 |
| `fontes_qtd` | inteiro | `source_count` |
| `qualidade_cobertura` | texto, `opcoes: ["boa", "fonte_unica", "so_historico_inativo", "amostra_pequena"]` | `coverage_quality` |
| `amostra_n` | inteiro, obrig. | derivado | tamanho da amostra de preço; abaixo de 5 a tela mostra "amostra pequena" |
| `calculado_em` | datahora, obrig. | `calculated_at` |

`unicos`: `{ colunas: [mes_referencia, cidade_id, localidade_id, tipo_imovel, tipo_transacao, quartos, faixa_area], nulos_distintos: false }`.

#### `candidatos`

`acesso_externo: restrito` · `id_legivel: "{titulo}"`

| Coluna | Tipo | Obrig. | Origem (`LISTING_CANDIDATES.`) | Observação |
|---|---|---|---|---|
| `descoberto_em` | datahora | sim | `discovered_at` | |
| `descoberto_por` | texto, `opcoes: ["busca_automatica", "manual_url", "importacao"]` | sim | `discovered_by` | |
| `fonte_id` | referencia → `fontes_portal`, `restringir` | sim | `source_id` | |
| `busca_id` | referencia → `buscas_portal`, `anular` | não | — | qual busca o gerou |
| `url_fonte` | texto(1000) | sim | `source_url` | canônica |
| `id_externo` | texto(120) | não | `external_id` | |
| `titulo` | texto(300) | não | `title` | |
| `tipo_transacao`, `tipo_imovel` | texto | não | idem | mesmas opções de `anuncios` |
| `endereco`, `localidade_texto` | texto | não | `address`, `locality` | |
| `localidade_id` | referencia → `localidades`, `anular` | não | `ra_geo_id` | resolvida pela busca ou por inferência (seção 8.6) |
| `latitude`, `longitude` | decimal(10,7) | não | idem | |
| `preco_pedido_brl`, `area_m2` | decimal | não | `asking_price_brl`, `area_m2` | |
| `quartos`, `suites`, `vagas` | inteiro | não | idem | |
| `condominio_brl`, `iptu_brl` | decimal | não | idem | |
| `caracteristicas` | json | não | `features_json` | |
| `bruto` | json | não | `raw_json` | o que o parser leu, para auditoria |
| `status` | texto, `opcoes: ["pendente", "aprovado", "rejeitado", "erro", "promovido", "bloqueado_leitura"]` | sim | `status` | |
| `leituras_bloqueadas` | inteiro | sim, padrão 0 | derivado | após 5, vira `bloqueado_leitura` e pede revisão manual |
| `revisado_em` | datahora | não | `reviewed_at` | |
| `revisado_por_id` | referencia → `shell.usuarios`, `anular` | não | — | |
| `motivo_rejeicao` | texto(300) | não | `reject_reason` | códigos da seção 8.7 |
| `versao_parser` | texto(60) | não | `parser_version` | |
| `anuncio_id` | referencia → `anuncios`, `anular` | não | — | preenchido na promoção |

`unicos`: `(fonte_id, url_fonte)`. `indices`: `(status, descoberto_em)`.

#### `coletas`

`acesso_externo: somente_leitura` · `id_legivel: "{tipo} {iniciado_em}"`

Sucede `LISTINGS_UPDATE_RUNS` e vale para toda execução de rotina da app (o log do shell guarda
a execução; esta tabela guarda os **contadores de domínio**, que o shell não conhece).

| Coluna | Tipo | Obrig. | Origem (`LISTINGS_UPDATE_RUNS.`) |
|---|---|---|---|
| `tipo` | texto, `opcoes: ["verificacao_anuncios", "descoberta_anuncios", "verificacao_lancamentos", "fechamento_mes", "dados_publicos", "analises_ia", "importacao"]` | sim | derivado |
| `disparo` | texto, `opcoes: ["agendado", "manual", "continuacao"]` | sim | — |
| `iniciado_em`, `finalizado_em` | datahora | sim / não | `started_at`, `finished_at` |
| `status` | texto, `opcoes: ["executando", "sucesso", "parcial", "falha", "interrompida"]` | sim | `status` |
| `candidatos_lidos`, `candidatos_processados`, `candidatos_rejeitados` | inteiro | sim, padrão 0 | `candidate_*` |
| `paginas_pedidas`, `paginas_lidas`, `paginas_bloqueadas` | inteiro | sim, padrão 0 | `source_pages_*` |
| `novos`, `atualizados`, `reativados`, `precos_alterados` | inteiro | sim, padrão 0 | `new_listings`, … |
| `verificacoes`, `inativados` | inteiro | sim, padrão 0 | `active_checks`, `confirmed_inactive` |
| `retratos`, `metricas` | inteiro | sim, padrão 0 | `history_rows`, `metrics_rows` |
| `erros` | inteiro | sim, padrão 0 | `errors` |
| `detalhes_erros` | texto_longo | não | `error_details` (teto 20 000 caracteres) |
| `cursor_inicial`, `cursor_final` | inteiro | não | — |
| `versao_parser` | texto(60) | não | `parser_version` |
| `disparado_por_id` | referencia → `shell.usuarios`, `anular` | não | — |

#### `cursores_rotina`

`acesso_externo: restrito`. Uma linha por rotina: `rotina` (texto, único), `cursor` (json),
`atualizado_em`. Guarda a posição do lote entre execuções (o que o script guardava em
`PropertiesService`).

### 5.5 Lançamentos

#### `lancamentos`

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "{nome}"`

| Coluna | Tipo | Obrig. | Origem (`DEVELOPMENTS.`) | Observação |
|---|---|---|---|---|
| `id_legado` | texto(120), único parcial | não | `development_id` | |
| `nome` | texto(200) | sim | `name` | |
| `incorporadora` | texto(200) | não | `developer_name` | |
| `endereco` | texto(300) | não | `address` | |
| `latitude`, `longitude` | decimal(10,7) | não | idem | 7 dos 22 não têm; **não** vão ao mapa |
| `precisao_coordenada` | texto, mesmas opções de `anuncios` | não | derivado de `coordinate_status` | |
| `espacial_utilizavel` | booleano | sim | `spatial_usable` | |
| `status_coordenada` | texto(80) | não | `coordinate_status` | `pending_exact_parcel_or_poi_validation` |
| `localidade_id` | referencia → `localidades`, `anular` | não | `ra_geo_id` via `codigo_legado` | |
| `bairro_texto` | texto(120) | sim | `neighborhood` | |
| `produto`, `segmento` | texto(80) | não | `product`, `segment` | |
| `status` | texto(60) | não | `status` | texto livre da fonte |
| `estagio_vendas` | texto, `opcoes: ["em_construcao", "em_lancamento", "oferta", "encerrado"]` | não | `sales_stage`, derivado de `status` quando vazio | valor manual nunca é sobrescrito |
| `unidades_total` | inteiro | não | `units_total` | |
| `area_min_m2`, `area_max_m2` | decimal(12,2) | não | `area_min_m2`, `area_max_m2` | |
| `preco_atual_brl` | decimal(14,2) | não | `current_price_brl` | |
| `preco_m2_atual_brl` | decimal(12,2) | não | `current_price_brl_m2` | só informado; calculado é derivado |
| `url_fonte` | texto(1000) | não | `source_url` | |
| `confianca`, `qualidade` | texto(80) | sim / não | `confidence_flag`, `quality_flag` | |
| `verificado_em` | data | sim | `last_verified_at` | verificação humana |
| `obra_frac` | decimal(6,5) | não | `work_progress_pct` ÷ 100 | |
| `mix_unidades` | texto(300) | não | `unit_mix` | |
| `entrega_prevista` | data | não | `expected_delivery` | |
| `orientacao` | texto, `opcoes: ["vertical", "horizontal"]` | não | `building_orientation` | coluna dedicada: sem derivação segura |
| `situacao_regularizacao` | texto(40) | não | `regularization_status` | |
| `primeiro_visto_em` | datahora | não | `first_seen_at` | |
| `verificado_auto_em` | datahora | não | `last_checked_at` | verificação automática |
| `ultimo_status_verificacao`, `ultimo_http`, `ultima_mensagem` | texto / inteiro / texto | não | `last_check_*` | |
| `hash_conteudo`, `versao_parser` | texto | não | `content_hash`, `parser_version` | |
| `coleta_id` | referencia → `coletas`, `anular` | não | `update_run_id` | |
| `caracteristicas` | json | não | — | o que a coleta leu da página |
| `lacunas` | json (lista de nomes de campo) | não | — | campos que a coleta não achou; alimenta o evento `lacuna_cadastro` |

`busca_texto`: `nome`, `incorporadora`, `bairro_texto`. `indices`: `(localidade_id)`, `(estagio_vendas)`.

#### `lancamento_eventos`

Mesma forma de `anuncio_eventos` com `lancamento_id` no lugar de `anuncio_id` e tipos
`criado`, `atualizado_pela_coleta`, `preco_alterado`, `lacuna_detectada`, `corrigido_manualmente`,
`removido`, `restaurado`.

### 5.6 Âncoras

#### `ancoras`

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "{nome}"`

| Coluna | Tipo | Obrig. | Origem (`ANCHORS.`) |
|---|---|---|---|
| `id_legado` | texto(120), único parcial | não | `place_id` |
| `nome` | texto(200) | sim | `name` |
| `categoria` | texto, `opcoes: ["escola", "mobilidade", "parque_equipamento_publico", "saude", "shopping_center", "supermercado_atacarejo", "universidade"]` | sim | `category` |
| `subcategoria` | texto(80) | sim | `subcategory` |
| `grupo` | texto, `opcoes: ["infraestrutura", "comercio_servico"]` | sim | `group`, derivado de `categoria` quando vazio |
| `segmento` | texto(60) | não | `segment` (vocabulário aberto; os doze inferíveis mais os manuais) |
| `operador` | texto(200) | sim | `operator_name` |
| `marca` | texto(120) | não | `brand_name` |
| `endereco` | texto(300) | não | `address` |
| `latitude`, `longitude` | decimal(10,7) | sim | idem |
| `precisao_coordenada` | texto(80) | sim | `coordinate_precision` (`school_polygon_reference_point`, …) |
| `confianca` | texto(40) | sim | `confidence_flag` |
| `localidade_id` | referencia → `localidades`, `anular` | não | `ra_geo_id` |
| `bairro_texto` | texto(120) | não | `neighborhood` |
| `url_fonte`, `url_fonte_coordenada` | texto(1000) | sim | `source_url`, `coordinate_source_url` |
| `verificado_em` | data | sim | `last_verified_at` |
| `status` | texto, `opcoes: ["ativa", "inativa", "prevista"]` | sim | `status` |
| `escala_capacidade` | texto(120) | não | `scale_capacity` |
| `area_ocupada_m2` | decimal(12,2) | não | `occupied_area_m2` |

`busca_texto`: `nome`, `operador`, `marca`. `indices`: `(categoria)`, `(grupo, segmento)`.

### 5.7 Séries publicadas de mercado

#### `ivv_mensal`

`acesso_externo: somente_leitura` · `id_legivel: "IVV {mes_referencia}"`

Sucede `IVV_MONTHLY` (79 colunas publicadas). A app guarda como coluna própria as
**13 métricas mensais** e a identificação; acumulados do ano, variações e checagens ficam em
`extras`, porque a tela os **recalcula** a partir das métricas (é o que o site já faz, com
política de agregação por natureza), e a importação confere o recalculado contra o publicado e
registra divergência como achado de qualidade.

| Coluna | Tipo | Origem (`IVV_MONTHLY.`) | Agregação de período |
|---|---|---|---|
| `cidade_id` | referencia → `cidades`, obrig. | — | |
| `mes_referencia` | data, obrig. | `reference_date` (dia 1º) | |
| `escopo_geografico`, `escopo_mercado`, `escopo_segmento` | texto(60) | `geography_scope`, `market_scope`, `segment_scope` | |
| `ivv_frac` | decimal(8,6) | `ivv_pct` (já decimal) | razão ponderada pareada |
| `oferta_unidades` | inteiro | `offers_units` | média do período |
| `vendas_unidades` | inteiro | `sales_units` | soma |
| `lancamentos_unidades` | inteiro | `launches_units` | soma |
| `lancamentos_empreendimentos` | inteiro | `launches_developments` | não agregável |
| `distratos_unidades` | inteiro | `cancellations_units` | soma |
| `oferta_area_m2` | decimal(14,2) | `offer_area_m2` | média do período |
| `area_vendida_m2` | decimal(14,2) | `sold_area_m2` | soma |
| `preco_pedido_m2_brl` | decimal(12,2) | `asking_price_brl_m2` | razão ponderada pareada |
| `preco_venda_m2_brl` | decimal(12,2) | `sale_price_brl_m2` | razão ponderada pareada |
| `vgo_brl_milhoes` | decimal(14,3) | `vgo_brl_million` | média do período |
| `vgv_brl_milhoes` | decimal(14,3) | `vgv_brl_million` | soma |
| `vgl_brl_milhoes` | decimal(14,3) | `vgl_brl_million` | soma |
| `distratos_sobre_vendas_frac` | decimal(8,6) | `cancellations_to_sales_pct` | razão publicada; só gráfico, nunca card |
| `fonte_publicador`, `fonte_arquivo`, `fonte_url`, `fonte_relatorio_gerado_em`, `filtro_relatorio`, `fonte_codigo`, `localizador_fonte`, `verificado_em`, `nota_cobertura`, `qualidade` | texto / data | `source_*`, `report_filter`, `source_id`, `source_locator`, `verified_at`, `coverage_note`, `quality_flag` | |
| `extras` | json | as 50 colunas restantes (`*_ytd*`, `*_mom_pct_change`, `*_yoy_pct_change`, `*_calc_*`, `*_check`, `*_diff_*`, `avg_*`) | |

`unicos`: `(cidade_id, mes_referencia, escopo_segmento, escopo_mercado)`.

Escala na importação: `ivv_pct` chega em fração decimal (`0.057`) na planilha viva, mas a
semente antiga trazia `6.5`. A importação aceita as duas **só se declarado no mapeamento**
(`escala: "fracao" | "pontos_percentuais"`), e recusa valor fora de [0, 1] depois da conversão.

#### `ivv_regional`

`acesso_externo: somente_leitura` · `id_legivel: "{nome_regiao_fonte} {faixa_quartos} {mes_referencia}"`

Sucede `IVV_REGION`. É **retrato**: hoje um mês só.

| Coluna | Tipo | Origem (`IVV_REGION.`) |
|---|---|---|
| `cidade_id` | referencia, obrig. | — |
| `mes_referencia` | data, obrig. | `reference_month` |
| `localidade_id` | referencia → `localidades`, `anular` | `market_region` resolvido por nome **na importação, com mapeamento confirmado pelo operador**; `null` para `DF Total` |
| `nome_regiao_fonte` | texto(120), obrig. | `market_region` |
| `agregado_total` | booleano, obrig. | `market_region = 'DF Total'` |
| `faixa_quartos` | texto, `opcoes: ["1Q", "2Q", "3Q", "4+Q", "TOTAL"]`, obrig. | `bedroom_bucket` |
| `ofertadas`, `vendidas` | inteiro | `offered_units`, `sold_units` |
| `ivv_publicado_frac` | decimal(8,6) | `ivv_pct_published` ÷ 100 |
| `ivv_recalculado_frac` | decimal(8,6) | `ivv_pct_check` ÷ 100 (sinaliza, nunca substitui) |
| `ivv_variancia_pp` | decimal(8,4) | `ivv_variance_pp` |
| `preco_oferta_m2_brl`, `preco_venda_m2_brl` | decimal(12,2) | `offer_price_brl_m2`, `sale_price_brl_m2` |
| `fonte_codigo` | texto(80) | `source_id` |

`unicos`: `(cidade_id, mes_referencia, nome_regiao_fonte, faixa_quartos)`. Regra de tela:
`agregado_total` e `TOTAL` são régua, nunca barra; nunca entram em soma nem em ranking.

#### `fipezap_mensal`

`acesso_externo: somente_leitura` · `id_legivel: "{segmento} {tipo_transacao} {nome_localidade_fonte} {mes_referencia}"`

Sucede `FIPEZAP_MONTHLY`. A visão pareada venda × locação por localidade
(`FIPEZAP_LOCALITY_MONTHLY`) **não é tabela**: é derivada em leitura pela rota
`/mercado/fipezap/localidades` (D-11).

| Coluna | Tipo | Origem (`FIPEZAP_MONTHLY.`) |
|---|---|---|
| `cidade_id` | referencia, obrig. | — |
| `mes_referencia` | data, obrig. | `reference_date` (dia 1º; `period_id` conferido) |
| `segmento` | texto, `opcoes: ["residencial", "comercial"]`, obrig. | `segment_scope` |
| `tipo_transacao` | texto, `opcoes: ["venda", "locacao"]`, obrig. | `transaction_type` |
| `escopo_geografico` | texto, `opcoes: ["total", "localidade"]`, obrig. | `geography_scope` (`DF_TOTAL`→`total`) |
| `localidade_id` | referencia → `localidades`, `anular` | `ra_geo_id`/`source_locality_name` via `localidades.nome_fonte` |
| `nome_localidade_fonte` | texto(120) | `source_locality_name` |
| `unidade_preco` | texto, `opcoes: ["brl_m2", "brl_m2_mes"]`, obrig. | `price_unit` |
| `preco_m2_brl` | decimal(12,2) | `price_brl_m2` |
| `yield_mensal_oficial_frac`, `yield_anual_oficial_frac` | decimal(8,6) | `official_yield_*_pct` (já decimal; só locação) |
| `yield_mensal_calc_frac`, `yield_anual_calc_frac` | decimal(8,6) | `calculated_yield_*_pct` |
| `variacao_mom_frac`, `variacao_ytd_frac`, `variacao_yoy_frac` | decimal(8,6) | `price_*_pct_change` |
| `meses_aluguel_para_pagar` | decimal(8,2) | `price_to_rent_months` |
| `diff_vs_total_frac` | decimal(8,6) | `diff_vs_df_pct` |
| `rank_preco`, `rank_yoy` | inteiro | `rank_price`, `rank_yoy` |
| `amostra_n` | inteiro | `sample_n` |
| `fonte_publicador`, `fonte_tipo`, `fonte_url`, `fonte_pagina`, `fonte_pasta_trabalho`, `fonte_codigo`, `nota_codigo`, `qualidade`, `notas` | texto | `source_*`, `quality_flag`, `notes`, `source_id`, `note_id` |

`unicos`: `{ colunas: [cidade_id, mes_referencia, segmento, tipo_transacao, escopo_geografico, nome_localidade_fonte], nulos_distintos: false }`.
`indices`: `(localidade_id, segmento, mes_referencia)`.

### 5.8 Diagnóstico territorial (PDAD)

#### `pdad_observacoes`

`acesso_externo: somente_leitura` · `id_legivel: "{codigo_indicador} {categoria_padrao} {ano}"`

Sucede `PDAD_A_DATA` (12 190 linhas, formato longo).

| Coluna | Tipo | Origem (`PDAD_A_DATA.`) |
|---|---|---|
| `localidade_id` | referencia → `localidades`, `restringir`, obrig. | `ra_geo_id` (`RA_01` → `codigo`) |
| `ano` | inteiro, obrig. | `pdad_year` |
| `escopo_geografia` | texto(20) | `geography_scope` |
| `numero_figura`, `numero_tabela` | texto(20) | `figure_number`, `table_number` (não são inteiros: `A71`) |
| `secao` | texto(80) | `section` |
| `codigo_indicador` | texto(80), obrig. | `indicator_code` |
| `nome_indicador` | texto(200) | `indicator_name` |
| `universo` | texto(300) | `universe` |
| `dimensao_segmento`, `valor_segmento` | texto(120) | `segment_dimension`, `segment_value` |
| `categoria_resposta` | texto(200) | `response_category` |
| `categoria_padrao` | texto(120), obrig. | `category_standard` (chave de agrupamento entre RAs) |
| `categoria_bruta` | texto(200) | `category_raw` |
| `estimativa_total` | decimal(14,2) | `estimate_total` |
| `estimativa_frac` | decimal(8,6) | `estimate_pct` ÷ 100 |
| `status_valor` | texto, `opcoes: ["publicado", "parcial", "suprimido"]`, obrig. | `source_value_status` |
| `origem_valor` | texto, `opcoes: ["publicado", "parcial_publicado", "calculado", "suprimido"]` | `value_origin` |
| `pagina_figura`, `pagina_tabela` | inteiro | `figure_pdf_page`, `table_pdf_page` |
| `arquivo_fonte`, `instituicao_fonte`, `base_extracao`, `localizador_fonte`, `notas` | texto | idem |
| `metodologia` | json | `figure_segmentation`, `figure_data_structure`, `figure_fields_to_capture`, `figure_preferred`, `figure_extraction_rule`, `figure_quality_notes`, `figure_map_status` |

`unicos`: `{ colunas: [localidade_id, ano, codigo_indicador, valor_segmento, categoria_padrao], nulos_distintos: false }`.
`indices`: `(ano, codigo_indicador)`, `(localidade_id, ano)`.

Regras de importação herdadas do normalizador do site: linha com `categoria_padrao` só dígitos é
**rejeitada com achado nomeado** (`CATEGORIA_NUMERICA`); `suprimido`/`parcial` nunca vira 0;
os cinco `purchase_*` têm o destino resolvido pelos dois formatos de linha (seção 11.4).

#### `pdad_figuras`

`acesso_externo: somente_leitura`. Sucede `PDAD_A_FIGURE_MAP` (31 linhas, 15 colunas).
Colunas: `codigo_indicador` (texto, único), `numero_figura`, `numero_tabela`, `secao`,
`nome_indicador`, `extras` (json com as demais colunas, verbatim) `[PENDENTE P-03: cabeçalho
exato da aba]`.

#### `procedencias`

`acesso_externo: somente_leitura` · `id_legivel: "{familia} {codigo}"`

Tabela única para os registros de procedência e metodologia que hoje são três abas:
`FIPEZAP_SOURCES` (1 214 linhas), `FIPEZAP_NOTES` (33) e `PDAD_A_GUIDE` (20).

| Coluna | Tipo | Observação |
|---|---|---|
| `familia` | texto, `opcoes: ["fipezap_fonte", "fipezap_nota", "pdad_guia"]`, obrig. | |
| `codigo` | texto(80), obrig. | `source_id`, `note_id`, ou chave da linha do guia |
| `titulo` | texto(300) | |
| `texto` | texto_longo | |
| `url` | texto(1000) | |
| `periodo_de`, `periodo_ate` | data | |
| `extras` | json | as colunas da aba, verbatim `[PENDENTE P-03]` |

`unicos`: `(familia, codigo)`.

### 5.9 Rodovias e tráfego

#### `trechos_rodoviarios`

`acesso_externo: somente_leitura` · `id_legivel: "{sigla_rodovia} {codigo_fonte}"`

| Coluna | Tipo | Origem (`ROAD_SEGMENTS.`) |
|---|---|---|
| `codigo` | texto(60), único, obrig. | `road_segment_id` (`ROADSEG_001EDF0070`) |
| `contorno_id` | referencia → `contornos`, `anular` | `current_polygon_id`; quando vazio, resolvido na importação por `contornos.entidade_codigo = codigo` (a ponte que o site fazia em runtime) |
| `codigo_fonte` | texto(40), obrig. | `source_segment_code` (`001EDF0070`) |
| `nome_rodovia` | texto(200) | `road_name` |
| `sigla_rodovia` | texto(20) | `road_code` (`DF-001`) |
| `tipo_trecho`, `jurisdicao`, `administracao` | texto(80) | idem |
| `extensao_m` | decimal(12,2) | `length_m` |
| `fonte_sistema`, `fonte_camada`, `fonte_feicoes`, `fonte_crs` | texto | `source_*` |
| `vigente_de`, `vigente_ate` | data | `valid_from`, `valid_to` |
| `vigente` | booleano, obrig. | `is_current` |
| `propriedades` | json | `properties_json` (chaves com os nomes da camada do DER: `tmd_der`, `fx_total`, …) |
| `confianca`, `qualidade` | texto(80) | idem |
| `sincronizado_em` | datahora | `last_synced_at` |

#### `trecho_aliases`

Sucede `ROAD_SEGMENT_ALIASES`: `trecho_id` (ref), `codigo_fonte`, `sistema_fonte`,
`vigente_de`, `vigente_ate`, `metodo` (`official_code`), `confianca`, `arquivo_fonte`, `notas`,
`importado_em`. `unicos`: `(sistema_fonte, codigo_fonte, vigente_de)` com `nulos_distintos: false`.

#### `sentidos_oficiais`

Sucede `ROAD_DIRECTION_MAP` (somente leitura hoje, continua). Chave de junção com o fluxo:
`(codigo_fonte, sentido_fonte)`, nunca o nome.

| Coluna | Tipo | Origem (`ROAD_DIRECTION_MAP.`) |
|---|---|---|
| `trecho_id` | referencia → `trechos_rodoviarios`, `anular` | `road_segment_id` |
| `codigo_fonte` | texto(40), obrig. | `source_segment_code` (zeros e hífens preservados: `TUNEL-REI-`) |
| `sentido_fonte` | texto, `opcoes: ["crescente", "decrescente"]` | `source_direction` (vazio nos sem geometria) |
| `sigla_rodovia`, `sigla_normalizada` | texto(20) | `road_code`, `normalized_road_code` |
| `origem_oficial`, `destino_oficial` | texto(200) | idem |
| `km_inicio`, `km_fim` | decimal(8,3) | `km_start`, `km_end` |
| `sentido_projeto`, `corredor_id`, `papel_corredor` | texto / referencia → `corredores` / texto | `project_direction`, `corridor_id`, `corridor_role` |
| `status_mapeamento` | texto, `opcoes: ["mapeado_oficial", "sem_geometria_oficial"]`, obrig. | `mapping_status` |
| `regra_sentido` | texto(60) | `direction_rule` (`DER_km_I_to_km_F`) |
| `confianca`, `fonte_org`, `fonte_camada`, `fonte_feicao_id`, `notas` | texto | idem |

`unicos`: `{ colunas: [codigo_fonte, sentido_fonte], nulos_distintos: false }`.

#### `trafego_diario`

Sucede `TRAFFIC_DAILY_TEST` (4 683 linhas). Os nomes vieram em português da fonte e ficam.

| Coluna | Tipo | Origem |
|---|---|---|
| `trecho_id` | referencia → `trechos_rodoviarios`, `anular` | `road_segment_id` |
| `codigo_fonte` | texto(40), obrig. | `trecho` |
| `sentido` | texto(20), obrig. | `sentido` |
| `dia` | data, obrig. | `dia` |
| `fluxo_total`, `carro`, `moto`, `onibus`, `caminhao`, `medio`, `indefinido` | inteiro | idem |
| `intervalos_15min` | inteiro | `intervalos_15min_observados` |
| `cobertura_dia_frac` | decimal(6,5) | `cobertura_dia_pct` (fração ou `"100,0%"`; conversão declarada) |
| `pico_15min_fluxo` | inteiro | idem |
| `pico_15min_intervalo` | texto(20) | idem |
| `soma_classes`, `divergencia_total_classes` | inteiro | idem |
| `qualidade` | texto(60) | `quality_flag` |
| `arquivo_fonte`, `politica_total`, `versao_schema_fonte` | texto | `source_file`, `source_total_policy`, `traffic_schema_version` |
| `perfil_total_15m`, `perfil_classes_15m` | json | `profile_*_15m_json` |
| `importado_em` | datahora | `imported_at` |

`unicos`: `(codigo_fonte, sentido, dia)`. `indices`: `(trecho_id, dia)`.

#### `corredores` e `corredor_diario`

`corredores` generaliza o único corredor de hoje (`SOBRADINHO_PLANO`): `codigo` (texto, único),
`nome`, `extremo_a_nome` ("Plano Piloto"), `extremo_b_nome` ("Sobradinho"), `regras_sentido`
(json: por `codigo_fonte`, qual `sentido_fonte` leva ao extremo A e qual ao B, mais o papel do
ponto). A tradução "decrescente = para o Plano" vale **só** para os códigos listados ali.

`corredor_diario` sucede `TRAFFIC_CORRIDOR_DAILY` com os nomes neutralizados:

| Coluna | Origem (`TRAFFIC_CORRIDOR_DAILY.`) |
|---|---|
| `corredor_id` (ref, obrig.), `dia` (data, obrig.), `mes_referencia` (data) | `corridor_id`, `dia`, `mes_ref` |
| `trecho_medicao_id` (ref → trechos), `codigo_fonte` (obrig.), `nome_rodovia`, `papel_ponto` | `measurement_segment_id`, `source_segment_code`, `road_name`, `measurement_point_role` |
| `sentido_para_a`, `sentido_para_b` | `sentido_para_plano`, `sentido_para_sobradinho` |
| `fluxo_para_a`, `fluxo_para_b`, `fluxo_bidirecional` | `fluxo_para_plano`, `fluxo_para_sobradinho`, `fluxo_bidirecional` |
| `carro_para_a`, `carro_para_b`, `carro_bidirecional` | `carro_*` |
| `motos_bidirecional`, `onibus_bidirecional`, `caminhoes_bidirecional` | idem (por lado: "não publicado", nunca zero) |
| `intervalos_min_15min`, `cobertura_min_frac` | `intervalos_minimos_15min`, `cobertura_min_pct` |
| `qualidade`, `linhas_fonte`, `arquivos_fonte`, `regra_agregacao` | idem |

`unicos`: `(corredor_id, codigo_fonte, dia)`. Regra: os dois pontos nunca são somados; os
números são passagens, não veículos únicos.

### 5.10 Dados públicos

#### `conjuntos_publicos`

`acesso_externo: somente_leitura` · `id_legivel: "{titulo} {versao}"`

Uma linha por `datasets[]` do `manifest.json` do pipeline, por versão.

| Coluna | Tipo | Origem (`manifest.datasets[]`) |
|---|---|---|
| `codigo` | texto(60), obrig. | `id` (`households_grid`, `jobs_hex`, `road_centrality`, `ra_aggregates`, `ra_crosswalk`) |
| `titulo` | texto(200), obrig. | `title_pt` |
| `versao` | data, obrig. | `version` |
| `gerado_em` | datahora | `generated_at` |
| `hash_conteudo` | texto(64), obrig. | `content_hash` |
| `schema_json` | json | o JSON Schema de `schemas/` |
| `anos`, `bbox`, `fontes`, `cortes_classe`, `contagens`, `flags_qualidade` | json | `years`, `bbox`, `sources`, `class_breaks`, `counts`, `quality_flags` |
| `crs` | texto(20) | `crs` |
| `metodo`, `metodo_atribuicao_ra`, `notas` | texto | `method_pt`, `ra_assignment_method`, `notes_pt` |
| `manifest_versao` | inteiro | `manifest_version` |
| `pipeline_versao`, `pipeline_commit`, `config_sha256`, `atribuicao` | texto | do manifest raiz |
| `status` | texto, `opcoes: ["ativo", "substituido", "carregando", "falhou"]`, obrig. | derivado |
| `carregado_em` | datahora | — |

`unicos`: `(codigo, hash_conteudo)`. Só **um** `ativo` por `codigo` (único parcial com `onde status = ativo`).

#### `conjunto_arquivos`

| Coluna | Tipo | Origem (`files[]`) |
|---|---|---|
| `conjunto_id` | referencia → `conjuntos_publicos`, `cascata`, obrig. | — |
| `caminho` | texto(300), obrig. | `path` |
| `papel` | texto, `opcoes: ["overview", "detail", "detail_shard", "data"]`, obrig. | `role` |
| `bytes`, `orcamento_bytes`, `feicoes` | inteiro | `bytes`, `budget_bytes`, `features` |
| `sha256` | texto(64), obrig. | `sha256` |
| `bbox` | json | `bbox` |
| `chave_shard`, `valor_shard` | texto(40) | `shard_key`, `shard_value` (`RA_nn`) |
| `localidade_id` | referencia → `localidades`, `anular` | `valor_shard` → `codigo` |
| `zoom_min` | inteiro | `zoom_min` |
| `arquivo` | arquivo (`application/json`, `application/geo+json`; `tamanho_max_mb: 50`), obrig. | o próprio arquivo, baixado pela rotina |
| `carregado_em` | datahora | — |

`unicos`: `(conjunto_id, caminho)`. O download é pela rota da app (seção 6.7), que confere o
`sha256` gravado antes de servir e aplica cache por conteúdo (`?v=<sha8>`).

#### `agregados_territoriais`

`acesso_externo: somente_leitura`. Formato longo: uma linha por localidade, conjunto, ano e
métrica. Sucede `ra_aggregates.json` e é também o destino das três abas de emprego, se forem
indicadores por RA `[PENDENTE P-01]`.

| Coluna | Tipo |
|---|---|
| `localidade_id` | referencia → `localidades`, `restringir`, obrig. |
| `conjunto_codigo` | texto(60), obrig. (`households_grid`, `jobs_hex`, `road_centrality`, `emprego_pdad`, …) |
| `ano` | inteiro, obrig. |
| `metrica` | texto(80), obrig. (`domicilios_2010`, `domicilios_2022`, `crescimento_domicilios_frac`, `empregos_total`, `empregos_por_mil_moradores`, `empregos_por_km2`, `centralidade_media`, …) |
| `valor` | decimal(18,6) (nulo = suprimido/ausente) |
| `n` | inteiro |
| `qualidade` | texto(80) |
| `fonte`, `fonte_url` | texto |
| `formula` | texto(300) (a fórmula que a tela mostra ao lado do número) |

`unicos`: `(localidade_id, conjunto_codigo, ano, metrica)`.

### 5.11 Operação e qualidade

#### `importacoes`

`acesso_externo: restrito` · `id_legivel: "{tabela_alvo} {criado_em}"`

| Coluna | Tipo | Observação |
|---|---|---|
| `tabela_alvo` | texto(60), obrig. | nome da tabela desta spec |
| `arquivo` | arquivo (`text/csv`, `application/vnd.ms-excel`; 50 MB), obrig. | |
| `modo_duplicata` | texto, `opcoes: ["ignorar", "atualizar", "substituir_tudo", "falhar"]`, obrig. | seção 11.2 |
| `mapeamento` | json | coluna do CSV → coluna da tabela, mais declarações de escala e de localidade |
| `status` | texto, `opcoes: ["previa", "aplicando", "aplicada", "falhou", "cancelada"]`, obrig. | |
| `total_linhas`, `inseridas`, `atualizadas`, `ignoradas`, `rejeitadas` | inteiro | |
| `relatorio` | json | por linha rejeitada: número, coluna, código, mensagem; resumo de conversões de escala |
| `autor_id` | referencia → `shell.usuarios`, obrig. | |
| `aplicada_em` | datahora | |
| `coleta_id` | referencia → `coletas`, `anular` | a execução registrada |

#### `achados_qualidade`

`acesso_externo: restrito` · `id_legivel: "{codigo} em {tabela}#{registro_id}"`

Sucede `DATA_QUALITY`.

| Coluna | Tipo |
|---|---|
| `tabela` | texto(60), obrig. |
| `registro_id` | inteiro |
| `campo` | texto(60) |
| `codigo` | texto(60), obrig. (`PRECO_M2_DIVERGENTE`, `SOMA_FAIXAS_ETARIAS`, `COORDENADA_FORA_DA_LOCALIDADE`, `LOCALIDADE_NAO_RESOLVIDA`, `CATEGORIA_NUMERICA`, `ESCALA_INDETERMINADA`, `COLUNA_NAO_DECLARADA`, `DUPLICATA_OBSERVACAO`, `LACUNA_PERIODO`, `PUBLICADO_DIVERGE_RECALCULADO`, …) |
| `severidade` | texto, `opcoes: ["erro", "aviso", "info"]`, obrig. |
| `mensagem` | texto(1000), obrig. |
| `valor` | texto(500) |
| `origem` | texto, `opcoes: ["importacao", "rotina", "manual", "validacao_escrita"]`, obrig. |
| `detectado_em` | datahora, obrig. |
| `resolvido_em` | datahora |
| `resolvido_por_id` | referencia → `shell.usuarios`, `anular` |
| `importacao_id`, `coleta_id` | referencias, `anular` |

`indices`: `(tabela, resolvido_em)`, `(codigo)`.

#### `alteracoes_cadastro`

Sucede `CHANGE_LOG` para as edições humanas de cadastro: `tabela`, `registro_id`, `acao`
(`criado`, `editado`, `removido`, `restaurado`, `destruido`), `campos` (json: `{ campo: { antes, depois } }`),
`autor_id` (ref `shell.usuarios`, obrig.), `em` (datahora), `motivo` (texto 500).
Toda rota de escrita das telas de Cadastro grava uma linha aqui dentro da mesma transação.

#### `analises_ia`

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "{titulo}"`

| Coluna | Tipo | Observação |
|---|---|---|
| `tipo` | texto, `opcoes: ["territorio", "mercado", "tela"]`, obrig. | slot usado |
| `cidade_id` | referencia → `cidades`, obrig. | |
| `localidade_id` | referencia → `localidades`, `anular` | `territorio` |
| `mes_referencia` | data, obrig. | o "último mês" que a análise lê |
| `escopo` | json | filtros do recorte (`tela`): tipologia, quartos, faixa de preço, período, camadas |
| `titulo` | texto(200), obrig. | |
| `texto` | texto_longo, obrig. | Markdown |
| `estrutura` | json, obrig. | a resposta estruturada (seção 9.4): sumário, achados com indicador citado, tendências, alertas, lacunas |
| `indicadores_usados` | json, obrig. | lista `{ chave, valor, fonte, periodo }` exatamente como foi ao modelo |
| `slot`, `modelo`, `provedor` | texto | o que o shell resolveu |
| `versao_instrucoes` | texto(64), obrig. | hash das instruções do parâmetro usado |
| `tokens_entrada`, `tokens_saida` | inteiro | |
| `disparo` | texto, `opcoes: ["manual", "rotina"]`, obrig. | |
| `gerada_por_id` | referencia → `shell.usuarios`, `anular` | nulo na rotina |
| `gerada_em` | datahora, obrig. | |
| `substituida_por_id` | referencia → `analises_ia`, `anular` | encadeia versões do mesmo recorte |
| `lacunas_avisadas` | booleano, obrig., padrão `false` | se o evento `lacuna_cadastro` saiu |

`busca_texto`: `titulo`, `texto`. `indices`: `(tipo, localidade_id, mes_referencia)`.

### 5.12 `sql_declarado`

Consultas que o vocabulário não alcança, todas de leitura, com funções da allowlist (janela e
agregação; **sem** `percentile_cont`, que não está na lista):

| Nome | Para quê |
|---|---|
| `mediana_preco_por_localidade` | mediana e P25/P75 de `anuncios` ativos por localidade e tipologia, com `row_number() OVER` e `count(*) OVER` (mediana por posição) |
| `ranking_localidades_indicador` | `rank() OVER` de um indicador de `agregados_territoriais` ou `localidade_perfis` entre as localidades com dado |
| `serie_pareada_fipezap` | venda e locação do mesmo mês/segmento/localidade lado a lado (a antiga `FIPEZAP_LOCALITY_MONTHLY`) |
| `contagem_anuncios_por_celula` | contagem de anúncios ativos por caixa de grade (para o painel de cobertura) |
| `cobertura_anuncios` | RA × tipo × quartos × faixa de preço com contagem (o antigo `LISTINGS_COVERAGE`) |
| `cobertura_pdad` | RA × indicador com status (o antigo `PDAD_A_COVERAGE`) |

Percentil fino (P10, P90) e qualquer estatística fora disso são calculados **em código** sobre
as linhas filtradas, no backend, nunca no frontend com dado parcial.

---

## 6. API da app (`backend/rotas.ts`)

Todas as rotas são relativas e montadas pelo shell em `/api/inteligencia_imobiliaria/`. Toda
rota autenticada recebe `req.contexto` com nível e papéis; o gate uniforme do shell já exige
`leitura` para `GET`, `escrita` para `POST`/`PATCH`/`PUT` e `admin` para `DELETE`. A app
acrescenta o gate de **papel** onde indicado (`curador`, `operador`) e **nunca** afrouxa o do
shell.

Convenções:

- Lista responde `{ dados, total, pagina, por_pagina, paginas }` (envelope do framework) com
  `por_pagina` limitado a 100 na borda da app (`Math.min(…, 100)`).
- Filtro de cidade: `?cidade=<slug>`; com uma cidade só, é opcional e resolve para ela.
- Erro responde `{ erro: true, codigo, mensagem, detalhes? }`, e o frontend lê `e.codigo` e
  `e.detalhes` do `Error` que `urbiVerso.api()` lança.
- Toda rota de escrita de cadastro grava `alteracoes_cadastro` e o evento de domínio
  (`anuncio_eventos`/`lancamento_eventos`) **na mesma transação** (`req.dados.transaction`).
- Exportação CSV: toda rota de lista aceita `?formato=csv` e responde `text/csv; charset=utf-8`
  com BOM, separador `;` (Excel pt-BR), **sem** paginação, teto de 50 000 linhas (acima disso
  responde `413 EXPORTACAO_GRANDE` e manda estreitar o filtro). O frontend baixa com
  `urbiVerso.fetch(...).blob()`.

### 6.1 Território

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/cidades` | leitura | lista de cidades ativas |
| GET | `/localidades?cidade&tipo&q` | leitura | localidades com perfil mais recente anexado (`perfil`) e contorno vigente (`contorno_id`); `q` busca por nome |
| GET | `/localidades/:id` | leitura | localidade + perfis por ano + agregados territoriais + contagens (anúncios ativos, lançamentos, âncoras) |
| POST | `/localidades` | curador | cria submercado ou localidade manual |
| PATCH | `/localidades/:id` | curador | edita campos editáveis (nome, pai, classificação, ponto de referência, notas) |
| GET | `/contornos?grupo&tipo_entidade&status&bbox=o,s,l,n` | leitura | GeoJSON `FeatureCollection` das geometrias que cruzam a caixa; `properties` traz `id`, `nome`, `tipo_entidade`, `papel_geometria`, `localidade_id`, `estilo` |
| GET | `/contornos/:id` | leitura | o contorno inteiro, com `geometria_fonte` e `propriedades` |
| POST | `/contornos` | curador | cria contorno desenhado (geometria do `urbi-mapa`) ou colado |
| POST | `/contornos/importar` | curador | recebe `upload_id` de KML/KMZ/GeoJSON, devolve prévia (`{ feicoes: [{ nome, tipo, vertices, bbox }] }`) |
| POST | `/contornos/importar/aplicar` | curador | aplica a prévia: cria os contornos, sem duplicar (`geometria_hash`), grupo `poligonais_importadas` |
| PATCH | `/contornos/:id` | curador | nome, categoria, estilo, localidade, status |
| PATCH | `/contornos/:id/remover`, `/restaurar` | curador | soft-delete |

### 6.2 Anúncios

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/anuncios?cidade&localidade&tipo_imovel&tipo_transacao&quartos_min&quartos_max&preco_min&preco_max&area_min&area_max&orientacao&situacao_regularizacao&status=ativo\|todos&portal&q&bbox&ordenar&pagina` | leitura | lista com os derivados (`preco_m2`, `orientacao`, `preco_m2_divergente`) |
| GET | `/anuncios/mapa?<mesmos filtros>` | leitura | versão enxuta para o mapa: `id`, `latitude`, `longitude`, `preco_m2`, `tipo_imovel`, `status`, `precisao_coordenada`; teto 5 000 pontos, acima disso responde `agrupado: true` com contagens por localidade |
| GET | `/anuncios/kpis?<filtros>` | leitura | contagem, mediana de preço e de preço/m², P25/P75, `sem_coordenada_exata`, `amostra_n`; `null` quando a amostra é vazia |
| GET | `/anuncios/comparaveis?anuncio_id&raio_m` | leitura | amostra comparável (mesma tipologia e quartos, mesma localidade), régua P25–P50–P75 e posição do anúncio contra a mediana; devolve `qualidade_amostra` |
| GET | `/anuncios/:id` | leitura | detalhe em três níveis (essencial, complementar, técnico) + eventos + retratos |
| POST | `/anuncios` | curador | cria por formulário (`origem_cadastro = manual_formulario`) |
| POST | `/anuncios/por-url` | curador | recebe `{ url }`, lê a página com o parser (seção 8.3) e devolve o **candidato** preenchido para revisão; não grava ainda |
| POST | `/anuncios/por-url/confirmar` | curador | grava o anúncio a partir do candidato revisado (`origem_cadastro = manual_url`) |
| PATCH | `/anuncios/:id` | curador | edita; `preco_m2_informado_brl` só por aqui; `status` manual é respeitado pela rotina (nunca sobrescrito) |
| PATCH | `/anuncios/:id/remover`, `/restaurar` | curador | soft-delete |
| POST | `/anuncios/:id/verificar` | operador | verifica agora este anúncio (fora da rotina), devolve o resultado da classificação |
| GET | `/anuncios/:id/eventos` | leitura | |
| GET | `/anuncios/:id/retratos` | leitura | série mensal do anúncio |

### 6.3 Candidatos, fontes e buscas

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/candidatos?status&fonte&busca&pagina` | leitura | |
| GET | `/candidatos/:id` | leitura | com `bruto` |
| POST | `/candidatos/:id/aprovar` | curador | promove a anúncio (seção 8.7); corpo pode trazer correções dos campos |
| POST | `/candidatos/:id/rejeitar` | curador | `{ motivo }` |
| POST | `/candidatos/:id/reler` | operador | lê a página de novo agora |
| GET | `/fontes` | leitura | |
| POST / PATCH | `/fontes`, `/fontes/:id` | operador | |
| POST | `/fontes/:id/diagnosticar` | operador | um anúncio por fonte: código HTTP, classificação e amostra do HTML (primeiros 4 KB), sem gravar nada |
| GET / POST / PATCH | `/buscas`, `/buscas/:id` | leitura / operador | |
| POST | `/buscas/:id/executar` | operador | lê esta busca agora e gera candidatos |

### 6.4 Lançamentos e âncoras

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/lancamentos?cidade&localidade&estagio_vendas&orientacao&q&pagina` | leitura | |
| GET | `/lancamentos/:id` | leitura | + eventos + lacunas |
| POST / PATCH | `/lancamentos`, `/lancamentos/:id` | curador | |
| POST | `/lancamentos/:id/verificar` | operador | lê a página agora |
| PATCH | `/lancamentos/:id/remover`, `/restaurar` | curador | |
| GET | `/ancoras?categoria&grupo&segmento&bbox&q&pagina` | leitura | |
| GET | `/ancoras/:id` | leitura | |
| POST / PATCH | `/ancoras`, `/ancoras/:id` | curador | |
| PATCH | `/ancoras/:id/remover`, `/restaurar` | curador | |

### 6.5 Mercado

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/mercado/ivv?cidade&de=AAAA-MM&ate=AAAA-MM&segmento&mercado` | leitura | série mensal; cada métrica traz `natureza` (`fluxo`, `estoque`, `razao`, `nao_agregavel`) |
| GET | `/mercado/ivv/periodo?cidade&de&ate&comparar=anterior\|ano_anterior\|nenhum` | leitura | agregação do período por natureza (soma, média, razão ponderada pareada), com os seis derivados (gap pedido/venda, meses de oferta, reposição da oferta, ticket médio vendido, área média vendida, distrato/venda) e o período de comparação quando pedido |
| GET | `/mercado/ivv/acumulado?cidade&ano` | leitura | série acumulada no ano civil, mesma política de agregação |
| GET | `/mercado/ivv/sazonalidade?cidade&metrica` | leitura | IVV por mês do ano, uma série por ano |
| GET | `/mercado/ivv-regional?cidade&mes&faixa_quartos` | leitura | retrato por localidade, com `agregado_total` separado como régua; ranking e as três leituras da matriz (IVV × preço, IVV × oferta, gap × preço) |
| GET | `/mercado/fipezap?cidade&segmento&tipo_transacao&escopo&localidade&de&ate` | leitura | série; `total` e `localidade` separados |
| GET | `/mercado/fipezap/localidades?cidade&segmento` | leitura | localidades disponíveis com classificação e rótulo desambiguado (submercado dentro de RA) |
| GET | `/mercado/fipezap/pareado?cidade&segmento&localidade&de&ate` | leitura | venda × locação do mesmo mês (`sql_declarado serie_pareada_fipezap`) + yield |
| GET | `/mercado/anuncios/metricas?cidade&localidade&tipo_imovel&tipo_transacao&quartos&faixa_area&de&ate` | leitura | `metricas_anuncios_mensais` |

### 6.6 Diagnóstico

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/diagnostico/anos?cidade` | leitura | anos publicados e cobertura (quais localidades cada ano cobre) |
| GET | `/diagnostico/perfil?cidade&localidade=<id\|todas>&ano&tema` | leitura | índice `indicador → categorias` consolidado; "todas" é **média** entre localidades (população e domicílios somam); `suprimido` fica fora com status; traz o bloco "Perfil imobiliário" (valor, diferença contra a mediana das localidades com dado, `n`, posição) e o bloco "Perfil territorial" (agregados) |
| GET | `/diagnostico/perfil/detalhe?localidade&ano&indicador` | leitura | as linhas cruas da Figura (drill-down) com o cabeçalho (Figura, Tabela, universo, notas) |
| GET | `/diagnostico/ranking?cidade&ano&indicador` | leitura | localidades ordenadas, com `formula`, `fonte`, `n`, e as ressalvas do conjunto quando o indicador é público |
| GET | `/diagnostico/comparar?cidade&ano&localidades=a,b,c&indicadores=x,y` | leitura | 2 a 6 localidades × até 4 indicadores; três kits prontos (`imob`, `perfil`, `infra`) |
| GET | `/diagnostico/dispersao?cidade&ano&leitura` | leitura | as nove leituras cruzadas (sete do PDAD, duas com dados públicos), pontos com os dois eixos publicados e correlação de Pearson descritiva |
| GET | `/diagnostico/base?cidade` | leitura | a Base de dados: toda fonte (planilha migrada, séries, PDAD, conjuntos públicos) com versão, data, licença, método, contagens, cortes de classe e `achados` abertos |

O catálogo de indicadores (quais `codigo_indicador` viram cartão, com que tipo de gráfico, em
que tema, com que chave de exibição) mora em `comum/indicadores.ts` e é **código**, não
tabela: é o `PDAD_VIZ`/`PDAD_RANK_SET`/`PDAD_COMPARE_KITS`/`PDAD_SCATTER_VIEWS` de hoje,
transcrito. A rota `/diagnostico/catalogo` o devolve para a tela não duplicar.

### 6.7 Território público e tráfego

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/territorio/conjuntos?cidade` | leitura | conjuntos ativos com arquivos, cortes de classe, fontes, ressalvas |
| GET | `/territorio/conjuntos/:codigo/arquivos/:caminho` | leitura | **o arquivo**: confere `sha256`, responde com `ETag` = sha256 e `Cache-Control: immutable` quando a URL traz `?v=`; `Content-Type: application/geo+json` |
| GET | `/territorio/agregados?cidade&conjunto&ano` | leitura | agregados por localidade |
| GET | `/trechos?cidade` | leitura | trechos vigentes com o contorno (eixo) e resumo de tráfego (último mês com dado) |
| GET | `/trechos/:id/trafego?de&ate&sentido&metrica` | leitura | diário por sentido, com origem e destino oficiais traduzidos por `sentidos_oficiais` |
| GET | `/trechos/:id/trafego/mensal?metrica` | leitura | agregação mensal por sentido |
| GET | `/corredores/:codigo?mes&metrica` | leitura | os pontos do corredor, nunca somados entre si, com os extremos nomeados |
| GET | `/trafego/cobertura?cidade` | leitura | que trechos têm fluxo e geometria, quais têm fluxo sem geometria ("fluxo disponível; geometria oficial não localizada") |

### 6.8 Análises por IA

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/analises?tipo&localidade&mes&pagina` | leitura | últimas análises (a vigente de cada recorte, com `substituida_por_id` nulo) |
| GET | `/analises/:id` | leitura | texto, estrutura, indicadores usados, custo |
| POST | `/analises/territorio` | escrita | `{ localidade_id, mes_referencia? }` gera agora; responde `202` com o `id` e a tela acompanha por `GET` (a geração leva segundos a um minuto) |
| POST | `/analises/mercado` | escrita | `{ cidade, mes_referencia? }` |
| POST | `/analises/tela` | escrita | `{ tela, filtros }` para o recorte em tela |
| GET | `/analises/estado` | leitura | `req.ia.estadoSlot` dos três slots: se resolvem, se há failsafe; a tela esconde o botão quando não resolve |

### 6.9 Operação

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/coletas?tipo&status&pagina` | leitura | execuções com contadores |
| GET | `/coletas/:id` | leitura | |
| GET | `/importacoes`, `/importacoes/:id` | leitura | |
| POST | `/importacoes/previa` | operador | `{ tabela_alvo, upload_id, modo_duplicata, mapeamento? }` → lê o CSV, infere o mapeamento pelos cabeçalhos, valida tudo e devolve a prévia (contagens e primeiras 50 rejeições) **sem gravar** |
| POST | `/importacoes/:id/aplicar` | operador | aplica a prévia numa transação por lote de 500 linhas |
| GET | `/importacoes/modelo/:tabela` | leitura | CSV só com o cabeçalho esperado pela tabela |
| GET | `/qualidade?tabela&codigo&severidade&resolvido=false` | leitura | achados |
| PATCH | `/qualidade/:id/resolver` | operador | |
| GET | `/dados-publicos/estado` | leitura | manifest remoto × carregado: por conjunto, hash remoto, hash local, arquivos faltando |
| POST | `/dados-publicos/carregar` | operador | dispara a rotina `carregar_dados_publicos` agora (via `POST /api/shell/rotinas/...` não; a app chama o próprio handler com `ctx` guardado e registra a `coleta` como `manual`) |

---

## 7. Rotinas

Todas exportadas em `export const rotinas`, idempotentes, com orçamento de tempo
(`orcamento_rotina_ms`, padrão 10 min) abaixo do corte de 15 min do shell. Toda execução cria
uma linha em `coletas` no início e a fecha no fim (`sucesso`, `parcial` quando o orçamento
acabou antes do lote, `falha`). O retorno ao shell é `{ ok, resultado: { resumo, ...contadores } }`.

Fatiamento: a rotina lê o cursor em `cursores_rotina`, processa até o orçamento acabar ou o
lote esgotar, grava o cursor novo e devolve `parcial` quando sobrou trabalho. Como o shell não
reexecuta no mesmo dia, a continuação acontece de dois jeitos: o próprio handler agenda uma
**continuação** com `ctx.eventos.agendar('continuar_coleta', { rotina }, { em: +2 min })`,
escutada por `reagir`, até o lote do dia esgotar; e o operador pode usar "Rodar agora". O
evento `continuar_coleta` é interno (declarado em `eventos`, sem notificação).

Pausa entre requisições ao mesmo host: `intervalo_min_por_host_ms`, com um relógio por host na
memória do processo. Requisições a hosts diferentes correm em paralelo (até 4).

### 7.1 `verificar_anuncios` (diária)

Sucede `listingsVerifyJob` do script. Para cada anúncio **ativo** com `url_fonte`, em ordem de
`verificado_em` ascendente (o menos verificado primeiro), até `max_verificacoes_por_execucao`:

1. Busca a página (seção 8.2) e classifica a resposta: `ativa`, `inativa`, `bloqueada`, `erro`.
2. **`ativa`**: `visto_em = hoje`, `pagina_verificada_em = hoje`, `falhas_verificacao = 0`,
   `ultimo_status_verificacao = ativa`. Se o parser leu preço de **dado estruturado** (JSON-LD,
   `__NEXT_DATA__`, meta `product:price:amount`), compara com `preco_pedido_brl`: igual, só
   `observado_em = hoje`; diferente até `variacao_preco_maxima_frac`, grava o novo preço,
   `preco_alterado_em`, `observado_em`, evento `preco_alterado`; acima disso mantém o preço e
   grava evento `preco_nao_confirmado`. Preço lido de regex sobre texto **nunca** sobrescreve.
3. **`inativa`** (404/410 ou marcador de remoção no texto): se `ultima_falha_em` é hoje, não
   conta; senão `falhas_verificacao += 1`, `ultima_falha_em = hoje`,
   `ultimo_status_verificacao = inativa_pendente`. Ao atingir `confirmacoes_inatividade`:
   `status = inativo`, `inativo_em = agora`, evento `inativo_confirmado`.
4. **`bloqueada`** (403, 429, captcha, página vazia): não conta falha, não altera `visto_em`;
   `ultimo_status_verificacao = bloqueada`; incrementa `paginas_bloqueadas` da coleta e o
   contador da fonte (seção 8.4).
5. **`erro`** (rede, timeout, 5xx): como bloqueada, mas `ultimo_status_verificacao = erro`.
6. Anúncio `inativo` cuja página volta a responder `ativa` em verificação manual ou na
   varredura semanal de inativos (um sétimo do estoque inativo por dia, rotativo) volta a
   `ativo` com evento `reativado`.
7. `status` alterado **manualmente** (pelo `curador`, registrado em `alteracoes_cadastro` nas
   últimas 24 h) não é tocado pela rotina naquele dia.

Ao fim do lote do dia: atualiza a linha do mês corrente em `anuncio_retratos` para todo anúncio
tocado (seção 7.4) e recalcula `metricas_anuncios_mensais` do mês corrente.

### 7.2 `descobrir_anuncios` (diária)

Sucede `listingsDiscoveryJob`. Para cada `buscas_portal` ativa de fonte ativa e não bloqueada,
até `max_paginas_busca_por_execucao` páginas no total:

1. Lê a página de resultados e extrai links de anúncio (seção 8.3): JSON-LD `ItemList`,
   `__NEXT_DATA__`, e padrões de URL do parser da fonte.
2. Cada link canônico que não existe em `anuncios.url_fonte` nem em `candidatos.url_fonte`
   vira `candidato` com `status = pendente`, `descoberto_por = busca_automatica`, `busca_id`.
3. Para cada candidato pendente, até `max_candidatos_por_execucao`: lê a **página do próprio
   anúncio**, preenche os campos, aplica os portões (seção 8.7). Passou: promove
   (`anuncios` + evento `criado`, `qualidade = automated_item_page_verified`,
   `origem_cadastro = descoberta`). Reprovou em portão **duro**: `rejeitado` com motivo.
   Reprovou em portão **brando** (falta campo): fica `pendente` para revisão humana.
   Leitura bloqueada: `leituras_bloqueadas += 1`; na quinta vira `bloqueado_leitura` e aparece
   na fila do curador com o aviso de que a página nunca foi lida.
4. Atualiza `buscas_portal.ultima_leitura_em`, `ultimo_status` e `candidatos_gerados`.

Editar ou criar uma busca pela tela **não** dispara a rotina sozinho (diferente do script): o
operador clica "Executar agora" na busca. Aprovar um candidato é síncrono na rota.

### 7.3 `verificar_lancamentos` (semanal)

Para cada lançamento com `url_fonte`, lê a página e tenta preencher o que estiver vazio:
`preco_atual_brl`, `preco_m2_atual_brl`, `area_min_m2`, `area_max_m2`, `unidades_total`,
`obra_frac`, `entrega_prevista`, `mix_unidades`, `estagio_vendas`, `latitude`/`longitude`
(só de dado estruturado, e aí `precisao_coordenada = exata_fonte`, `espacial_utilizavel = true`).

- Campo **já preenchido à mão** nunca é sobrescrito; divergência vira achado
  `PUBLICADO_DIVERGE_CADASTRO` (aviso).
- Campo não encontrado entra em `lacunas`. Quando a lista de lacunas **muda** (campo novo não
  encontrado, ou página sem nenhum dado estruturado), a rotina publica o evento
  `lacuna_cadastro` (seção 13), uma vez por lançamento por mudança, e grava
  `lancamento_eventos.lacuna_detectada`.
- Com `usar_ia_extracao_lancamentos = true` e página sem JSON-LD, a rotina chama o slot
  `extracao_pagina` com o texto limpo da página (teto 12 000 caracteres) e um schema fechado dos
  campos acima; o resultado entra com `qualidade = ia_extraido_nao_verificado` e só preenche
  vazios. Desligado por padrão: o custo por página é real e a maioria dos lançamentos tem dado
  estruturado ou é cadastro manual.

### 7.4 `fechar_mes` (mensal, dia 1, horário do admin)

1. Determina o mês anterior `M` no fuso da organização.
2. Para todo anúncio que estava ativo em algum dia de `M`, ou ficou inativo em `M`, ou nasceu em
   `M`: grava ou reescreve `anuncio_retratos(M)` com o estado ao fim de `M` e marca
   `congelado = true`. Linha já congelada não é reescrita (idempotência).
3. Recalcula `metricas_anuncios_mensais` de `M` e de `M-1` (porque `variacao_*_mom_frac` de `M`
   depende de `M-1` e `M-1` pode ter recebido anúncio atrasado): grupos por
   `(localidade | todas) × (tipo_imovel | todos) × tipo_transacao × (quartos | todos) × faixa_area`,
   sobre os retratos com `status_fim_mes = ativo`. Mediana e percentis em código
   (`backend/metricas/`), com a mesma função que a rota `/anuncios/kpis` usa. `amostra_n` é o
   tamanho da amostra de preço; grupo sem preço grava `null` nas estatísticas, nunca zero.
4. Abre a linha do mês corrente para todo anúncio ativo (não congelada).
5. Resumo: retratos congelados, grupos de métricas, anúncios sem preço, grupos de amostra
   pequena. Falha publica `erros.fechamento_mes_falhou`.

A rotina diária mantém a linha do mês corrente de cada anúncio tocado, então a tela de
métricas mostra o mês em curso como **parcial** (rótulo "mês em andamento") e os fechados como
definitivos.

### 7.5 `carregar_dados_publicos` (mensal)

Seção 12. Resumo: baixa o `manifest.json` de `manifest_publico_url`, compara `content_hash`
por conjunto com o `ativo` local; para cada conjunto novo, cria a linha `carregando`, baixa cada
arquivo em `files[]`, confere `sha256` e `bytes`, sobe como `arquivo` (`req.arquivos.enviar`,
sem usuário) e vincula em `conjunto_arquivos`; ao completar, marca `ativo`, o anterior
`substituido`, e recarrega `agregados_territoriais` a partir de `ra_aggregates.json`. Arquivo
que não confere aborta o conjunto (`falhou`) e publica `erros.dados_publicos_falhou`; os outros
conjuntos seguem. Orçamento: um conjunto por execução quando o total passa de 20 MB, com
continuação agendada.

### 7.6 `gerar_analises_mensais` (mensal, agendada pelo admin para depois do `fechar_mes`)

Seção 9. Gera a análise de **mercado** da cidade e uma análise de **território** por localidade
que tenha ao menos `analise_minimo_meses_historico` meses de métricas de anúncios **ou** série
FipeZap própria. Uma chamada por análise, em série, respeitando o orçamento; sobra continua por
agendamento. Falha de uma análise não impede as outras; cada falha publica
`erros.analise_falhou`.

---

## 8. Coleta nos portais

### 8.1 Postura

A coleta lê páginas públicas de anúncios, com identificação honesta (`User-Agent` nomeado), uma
requisição por vez por host, pausa mínima configurável, e nunca tenta contornar captcha nem
login. Bloqueio é **estado**, não erro: fica registrado por fonte e por anúncio, aparece na
tela de Operação, e não inativa anúncio. É a mesma postura do `Code.gs`, transcrita.

### 8.2 Cliente HTTP

`backend/coleta/cliente.ts`, com `fetch` do Node 20 e `undici` embutido no bundle para o
`ProxyAgent`:

- Timeout de 20 s por requisição; até 2 redirecionamentos; corpo lido até 2 MB.
- Cabeçalhos: `User-Agent` do parâmetro, `Accept: text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8`,
  `Accept-Language: pt-BR,pt;q=0.9`, mais `fontes_portal.cabecalhos`.
- **Proxy de saída (D-09):** quando `proxy_saida_url` está configurado, toda requisição de
  coleta sai por ele (`undici.ProxyAgent`). O precedente é o do charles3: uma VPS mínima com
  `tinyproxy` e firewall restrito ao IP da instância, usada porque o WAF do CNJ bloqueava o IP
  do datacenter. Aqui a regra é a mesma: a spec **não** exige o proxy; ela deixa a porta pronta,
  e a decisão de ligar vem da medição na Pinguim (seção 8.4 explica como a tela mostra isso).
- Classificação da resposta (`backend/coleta/classificar.ts`), na ordem:

| Resultado | Quando |
|---|---|
| `inativa` | HTTP 404 ou 410; ou corpo com marcador de remoção (`anúncio indisponível`, `imóvel não encontrado`, `este anúncio foi removido`, `página não encontrada`, lista fechada por fonte em `config_parser.marcadores_inatividade`) |
| `bloqueada` | HTTP 403, 429, 503 com corpo de desafio; corpo com marcador de desafio (`captcha`, `cloudflare`, `access denied`, `verifique se você é humano`); corpo menor que 2 KB em página que deveria ter anúncio |
| `erro` | falha de rede, timeout, 5xx sem desafio, HTML que não parseia |
| `ativa` | resto: a página respondeu e **foi reconhecida como a do anúncio** (o parser achou ao menos título ou preço, ou o `id_externo` aparece no HTML) |

Página que responde 200 mas não é reconhecida (redirecionada para a home, para a listagem) é
`inativa` com mensagem `redirecionada_para_listagem` **só** quando a URL final difere da pedida
em caminho; senão `erro` com `nao_reconhecida`, porque não dá para afirmar remoção.

### 8.3 Parser

`backend/coleta/parser/` tem um módulo por `parser` de `fontes_portal`, todos com a mesma
assinatura `(html, urlFinal, config) → Candidato | null` e os mesmos extratores em cascata:

1. **JSON-LD** (`<script type="application/ld+json">`): `@graph`, `ItemList`, `Product`,
   `Offer`, `Residence`/`Apartment`/`House`, `floorSize`, `numberOfRooms`, `geo`, `address`.
2. **`__NEXT_DATA__`** e estados iniciais embutidos (`window.__INITIAL_STATE__`,
   `window.__PRELOADED_STATE__`): procurados por caminho declarado em `config_parser.caminhos_estado`
   e por heurística (chaves `price`, `area`, `bedrooms`, `address`, `geo`).
3. **Meta tags** (`og:title`, `og:url`, `product:price:amount`, `description`).
4. **Regex sobre texto limpo** (`R$ 1.234.567`, `123 m²`, `3 quartos`, `2 vagas`): só preenche
   o que os três anteriores não deram, e marca `caracteristicas.origem_campos[campo] = texto`,
   que é o que impede esse valor de sobrescrever preço na verificação.

Cada parser por fonte (`quintoandar`, `dfimoveis`, `wimoveis`, `imovelweb`, `vivareal`) só
acrescenta: padrão de URL de anúncio, caminho do estado embutido, marcadores de inatividade e
normalização do `id_externo`. O `generico_html` e o `generico_json` (com `items_path` e
`field_map` do `config_parser`) são os fallbacks. A normalização de número (`R$ 1.234,56`,
`1,234.56`, `1234`) é a do `src/normalize.js` do site, portada para `comum/numeros.ts` com os
mesmos testes de paridade.

Toda fixture de teste é um HTML real salvo em `testes/fixtures/portais/<fonte>/<caso>.html`,
com o resultado esperado ao lado; o diagnóstico da fonte (`POST /fontes/:id/diagnosticar`) é a
forma de colher fixture nova quando um portal muda de layout.

### 8.4 Estado da fonte

Por execução, por fonte: `bloqueadas / (lidas + bloqueadas)` nas últimas 24 h. Acima de 0,8 com
ao menos 5 tentativas → `estado = bloqueada`, `bloqueada_desde = agora`, evento
`erros.fonte_bloqueada` (uma vez por transição). Entre 0,2 e 0,8 → `instavel`. Abaixo → `ok`,
e `bloqueada_desde` limpa. Fonte `bloqueada` não é lida pela descoberta; a verificação segue
tentando um décimo do lote dela por dia, para detectar a volta. A tela de Fontes mostra o
estado, a razão e a data, e é esse painel que fundamenta ligar ou não o proxy (D-09).

### 8.5 Hash de conteúdo

`hash_conteudo` = SHA-256 do JSON canônico de `{ url_fonte, titulo, status, preco_pedido_brl,
area_m2, quartos, suites, vagas, endereco, localidade_texto }`. Muda quando algo relevante
muda; é o que permite ao retrato mensal registrar "mudou" sem comparar campo a campo.

### 8.6 Coordenada e localidade

Candidato sem coordenada de dado estruturado recebe a do **ponto de referência da
localidade** mais um deslocamento determinístico (`jitter_raio_m`, semente = hash da
`url_fonte`), e `precisao_coordenada = centroide_localidade_jitter_deterministico`. A
localidade vem, nesta ordem: da `buscas_portal.localidade_id`; do `address.addressLocality`
casado com `localidades.nome`/`nome_fonte` (caixa e acento ignorados); da URL (segmentos como
`asa-norte`, `lago-norte`, lista em `comum/localidades-url.ts`). Sem localidade resolvida, o
candidato fica `pendente` com motivo brando `LOCALIDADE_NAO_RESOLVIDA`.

Coordenada de dado estruturado que cai **fora** do contorno vigente da localidade resolvida
não é rejeitada: entra com achado `COORDENADA_FORA_DA_LOCALIDADE` (aviso) para o curador
decidir. Conferência ponto-em-polígono em código (`comum/geo.ts`, ray casting), depois do
filtro por caixa.

### 8.7 Portões de promoção

| Portão | Tipo | Regra |
|---|---|---|
| URL válida e canônica, `http(s)`, host da fonte | duro | |
| Não duplicado (`url_fonte`, ou `fonte_id + id_externo`) | duro | duplicado de anúncio **inativo** reativa o anúncio em vez de criar |
| Página lida e reconhecida (`ativa`) | duro | bloqueada 5 vezes → `bloqueado_leitura` |
| `tipo_transacao` coerente com a busca | duro | |
| `tipo_imovel` conhecido | brando | `nao_classificado` passa, marcado |
| `preco_pedido_brl` > 0 | brando | sem preço fica pendente |
| `area_m2` > 10 | brando | |
| `localidade_id` resolvida | brando | |
| preço/m² entre 500 e 60 000 BRL (venda) ou 5 e 500 (locação) | brando | fora da faixa fica pendente com `PRECO_M2_IMPLAUSIVEL` |

Promoção grava `anuncios`, `anuncio_eventos.criado`, `candidatos.status = promovido`,
`candidatos.anuncio_id`, na mesma transação.

---

## 9. Análises por IA

### 9.1 O que é e o que não é

É um **analista escrito**: texto em português, no tom de um profissional que leu todo o
histórico disponível e explica o que vê, o que mudou, o que destoa e o que falta. Não é modelo
preditivo numérico: a análise pode falar de tendência e de cenário, mas todo número que ela
cita vem dos indicadores que a app calculou e entregou a ela, nunca de cálculo do modelo. Isso
é o que torna o texto conferível (D-01).

Três tipos, três slots custom com base `poder` (o shell resolve provedor, modelo, chave e
failsafe; a app só nomeia o slot):

| Tipo | Slot | Recorte | Quando |
|---|---|---|---|
| Território | `analise_territorio` | uma localidade, no mês de referência, com todo o histórico | rotina mensal para toda localidade com dado suficiente; botão na tela de Diagnóstico e no bloco da localidade no Mapa |
| Mercado | `analise_mercado` | a cidade, no mês de referência, com todo o histórico | rotina mensal; botão na tela de Mercado |
| Recorte em tela | `analise_tela` | os filtros que o usuário está vendo (Mapa ou Mercado) | só por botão |

### 9.2 Contexto entregue ao modelo

Montado por `backend/ia/contexto.ts`, sempre com a mesma forma: um cabeçalho com o recorte e a
data, e blocos de indicadores em JSON compacto (chave, valor, unidade, período, fonte, `n`
quando é amostra). **Nada de texto de página de portal, nada de linha crua de anúncio.** Os
blocos, por tipo:

**Território** (localidade `L`, mês `M`):

- identidade: nome, tipo, cidade, área, perfil demográfico do último ano (população,
  densidade, renda per capita quando publicada, faixas etárias, domicílios, tipologia e
  ocupação dominantes, escritura);
- oferta secundária: métricas mensais de anúncios de `L` nos últimos 36 meses (ou o que
  houver), por tipologia: ativos, novos, inativados, mediana e P25/P75 de preço/m², área
  mediana, `amostra_n`; e a posição de `L` contra a mediana das localidades da cidade em `M`;
- lançamentos em `L`: contagem por estágio, faixa de área, preços quando houver;
- FipeZap da localidade ou do submercado dela: série de venda e locação (36 meses), yield,
  variação ano a ano, diferença contra o total da cidade;
- IVV regional de `L` no último retrato disponível (ofertadas, vendidas, IVV, preços);
- indicadores PDAD de `L` versus a mediana das localidades com dado (os 10 do ranking do
  Diagnóstico mais os 4 territoriais);
- agregados públicos de `L` (crescimento de domicílios, empregos por mil moradores e por km²,
  centralidade viária) com fonte e ano;
- âncoras em `L` por grupo e segmento (contagem);
- lacunas: lista do que **não** existe para `L` (sem FipeZap próprio, sem IVV regional, sem
  perfil PDAD, amostra de anúncios menor que 10), para o modelo declarar em vez de inventar.

**Mercado** (cidade `C`, mês `M`): IVV mensal inteiro (todas as 13 métricas, 2021 em diante),
os seis derivados por período (mês, trimestre, ano e acumulado), sazonalidade do IVV, IVV
regional do último retrato (ranking e matriz preço × liquidez), FipeZap total venda e locação
(2011 em diante, com yield e variações), métricas de anúncios da cidade por tipologia (36
meses), ranking de localidades por preço/m² e por crescimento de oferta em `M`, lançamentos por
estágio, lacunas.

**Recorte em tela**: os KPIs e as séries exatamente como a tela os mostra, mais o perfil da
localidade quando há uma só no filtro, mais lacunas.

Limite de entrada: o contexto é medido em caracteres antes de ir e, acima de 60 000, as séries
são **compactadas** (mensal → trimestral nos anos mais antigos), nunca cortadas em silêncio; o
que foi compactado consta em `indicadores_usados`.

### 9.3 Instruções (parâmetros `instrucoes_analise_*`)

O texto padrão de cada parâmetro nasce na implementação da fase 5 e é refinado pela equipe na
tela de Config. A spec fixa o que ele **tem** de conter, por ser contrato com a tela:

1. Papel: analista de mercado imobiliário sênior escrevendo para a equipe interna da UP;
   português do Brasil; direto; sem jargão vazio; sem recomendação de compra ou venda a terceiro.
2. Regra de ouro: só afirmar o que os indicadores sustentam; todo número citado vem do
   contexto; indicar fonte e período ao citar; ausência de dado é dita como ausência.
3. O que a leitura deve cobrir, em ordem: situação atual do recorte; o que mudou no último mês
   e no último ano; o que destoa (contra a cidade, contra o histórico); tendência observável
   (direção e consistência, nunca número projetado); sinais de atenção; lacunas de dado que
   limitam a leitura e o que faltou coletar.
4. Formato: responder **no schema** da seção 9.4; o texto em Markdown curto (títulos de nível
   3, parágrafos de até 4 frases, listas quando há mais de dois itens); cada achado nomeia
   `indicadores` por chave.
5. Tamanho: entre 400 e 1 200 palavras; recorte em tela entre 150 e 500.

### 9.4 Schema de resposta

```jsonc
{
  "type": "object",
  "required": ["titulo", "sumario", "secoes", "achados", "alertas", "lacunas"],
  "properties": {
    "titulo":  { "type": "string" },
    "sumario": { "type": "string" },                       // 2 a 4 frases
    "secoes":  { "type": "array", "items": { "type": "object", "required": ["titulo", "texto"],
                 "properties": { "titulo": { "type": "string" }, "texto": { "type": "string" } } } },
    "achados": { "type": "array", "items": { "type": "object", "required": ["texto", "indicadores", "direcao"],
                 "properties": {
                   "texto": { "type": "string" },
                   "indicadores": { "type": "array", "items": { "type": "string" } },   // chaves de indicadores_usados
                   "direcao": { "type": "string", "enum": ["alta", "queda", "estavel", "destoa", "neutro"] } } } },
    "alertas": { "type": "array", "items": { "type": "string" } },
    "lacunas": { "type": "array", "items": { "type": "object", "required": ["o_que", "impacto"],
                 "properties": { "o_que": { "type": "string" }, "impacto": { "type": "string" },
                                 "campo_cadastro": { "type": "string" } } } }
  }
}
```

A app valida que toda chave em `achados[].indicadores` existe em `indicadores_usados`; achado
que cita chave desconhecida é **descartado** e a análise grava `estrutura.achados_descartados`.
`lacunas[].campo_cadastro`, quando aponta um campo de cadastro (preço de lançamento,
coordenada), dispara o evento `lacuna_cadastro` (uma vez por análise), que é o aviso que o
dono do produto pediu para alimentar a correção manual.

### 9.5 Gravação, versões e custo

Cada geração grava uma linha nova em `analises_ia` e aponta a anterior do mesmo recorte e mês
em `substituida_por_id`. A tela mostra a vigente e permite ver as anteriores. `tokens_entrada` e
`tokens_saida` vêm da resposta do helper, para a tela de Operação somar custo por mês.

Orçamento de referência (para o admin calibrar os slots): uma análise de território consome na
faixa de 15 a 30 mil tokens de entrada e 1,5 mil de saída; a rotina mensal, com 35 localidades
mais a de mercado, fica em torno de 1 milhão de tokens de entrada por mês. É aceitável no slot
`poder` mensal; não é aceitável por clique sem controle, por isso o botão de "gerar agora" é
`escrita` e a tela avisa quando já existe análise do mês para o recorte.

### 9.6 Quando não gerar

Sem slot resolvido (`estadoSlot` sem `efetivo`): botão escondido, rotina pula com resumo "slot
não configurado". Recorte com menos de `analise_minimo_meses_historico` meses de qualquer
série: a rotina pula a localidade e a tela mostra "histórico insuficiente"; o botão manual
continua disponível, com o aviso. Falha do provedor: `erros.analise_falhou`, nada gravado.

---

## 10. Telas (`frontend/`)

### 10.1 Regras gerais de UI

- Toda tela é composta de primitivos `urbi-*` e tokens semânticos. Nenhum CSS estrutural, nenhum
  literal de cor. O que o catálogo não cobre entra no registro de exceções da app **no mesmo
  PR** (hoje previstos: a legenda de classes do mapa com amostras de cor, que é dado do
  conjunto; e a régua P25–P50–P75 dos comparáveis, se `urbi-grafico-medidor` não a expressar).
- Layout: `urbi-shell-page` como raiz de cada tela; `urbi-inbox` para lista + detalhe;
  `urbi-2x1`/`urbi-3-colunas` para mapa + painel; `urbi-abas` para sub-telas; `urbi-grid min="140px"`
  para KPIs; `urbi-stack` para blocos empilhados.
- Dados: `urbi-tabela` com filtros por coluna e `[expandir]` em painel; `urbi-kpi` para
  destaques; `urbi-grafico-linha|area|colunas|pizza` para séries; `urbi-mapa-de-calor` para a
  matriz de comparação; `urbi-mapa` para tudo que é geográfico.
- Estado na URL: a sub-rota identifica a tela; os filtros vão na querystring por
  `history.replaceState` montado com `urbiVerso.href(sub)`, sem `popstate` (refletir filtro não
  é navegar). Vocabulário fechado de chaves, igual ao do site: `ra` → `localidade`, `type`,
  `beds`, `price_min`, `price_max`, `q`, `inativos`, `terr`, `terr_metrica`, `vias`, `de`, `ate`,
  `periodo`, `comparar`, `serie`, `regiao_modo`, `faixa`, `ano`, `tema`, `locality`, `mes`. Link
  colado abre a mesma visão.
- Estados: carregando (`urbi-loading`), vazio com motivo (`urbi-estado-vazio`), erro com
  `e.message` e `e.detalhes` em `urbi-banner variante="erro"`, e **ausência de dado** sempre
  como frase, nunca zero. Controle cuja fonte não existe fica desabilitado **com o motivo**
  (herdado da regra R8.64 do site).
- Procedência: todo bloco de números tem um rodapé "Fonte · período · n" e um link para a Base
  de dados.
- Mobile: usável a 390 px; `urbi-tabela responsivo="multiline"`; o mapa ocupa a tela com o
  painel em gaveta (`urbi-inbox` colapsa).

### 10.2 Mapa (`/mapa`)

Sucede a view Mapa.

**Layout:** `urbi-2x1` com o `urbi-mapa` expandido à esquerda e um `urbi-inbox` à direita
(filtros no topo, lista de resultados, detalhe ao clicar).

**Camadas (do fundo para a frente), todas `CamadaMapa` com `estilo` por feição vindo do dado:**

1. Território público: a coroplética ligada (domicílios **ou** empregos, rádio) com classes do
   `cortes_classe` do conjunto e cor por índice de classe (`properties.estilo.preenchimento`
   resolvido pelo tema no momento de montar a camada, pela mesma função da legenda); por
   padrão, **domicílios** ligados quando o conjunto existe.
2. Contornos das localidades (`limite_exibicao`): preenchimento clicável quando nenhuma área
   pública está ligada; só linha quando está (para a célula receber o clique).
3. Centralidade viária (linhas, caixa de seleção, convive com qualquer área); espessura e
   opacidade por percentil.
4. Eixos rodoviários do DER (`eixo_rota`), clicáveis: abrem o painel do trecho.
5. Contornos importados (`area_personalizada`).
6. Âncoras (pontos; marcador por grupo).
7. Lançamentos (só os com coordenada; `espacial_utilizavel`).
8. Anúncios (pontos; cor por faixa de preço/m² do recorte, declarada na legenda; forma por
   precisão: círculo = aproximada, losango = exata).

Camadas de área e de detalhe são carregadas por `urbi:mapa-viewport` (caixa + zoom):
abaixo do `zoom_min` do conjunto desenha-se o `overview`; a partir dele, só os shards cujas
`localidade_id` cruzam a caixa. Cada arquivo é buscado uma vez e memoizado por `sha256`.

**Filtros (topo do painel):** cidade (se > 1), localidade, tipo de imóvel, transação, quartos
(mín/máx), preço (mín/máx), busca textual; gaveta "Mais filtros": área, orientação
(vertical/horizontal), situação do anúncio (só ativos | todos, com a contagem de ocultos),
regularização, portal, estágio do lançamento, grupo e segmento de âncora, métrica da área
pública, vias ligadas.

**KPIs do recorte (`urbi-grid` de `urbi-kpi`):** anúncios no recorte, mediana de preço, mediana
de preço/m², P25–P75, lançamentos, âncoras, "sem coordenada exata: N".

**Detalhe de anúncio (três níveis):** essencial (título, preço, preço/m² com origem informado
ou calculado, área, quartos/suítes/vagas, localidade, status e "confirmado no portal em");
complementar (condomínio, IPTU, regularização, dias publicado, portal com link `rel="noopener"`,
primeiro visto, histórico de preço em `urbi-grafico-linha`); técnico (precisão da coordenada
**com a frase "localização aproximada; centroide da localidade"**, confiança, qualidade, hash,
parser, última verificação, eventos). Bloco **Comparáveis**: régua P25–P50–P75 do recorte e a
posição deste anúncio; `qualidade_amostra` escrita. Botão "Analisar este recorte" (seção 9).

**Detalhe de localidade (clique no contorno):** nome, códigos, perfil do último ano,
agregados públicos com fonte e ano, contagens, FipeZap do submercado se houver, link para o
Diagnóstico e para a análise de IA vigente.

**Detalhe de célula/hexágono/via (clique no público):** essencial (valor da métrica, classe),
complementar (demais métricas do conjunto), técnico (id, fonte, ano, método, hash do arquivo).

**Painel de trecho rodoviário:** propriedades do DER (`tmd_der`, faixas, revestimento), fluxo
diário por sentido com origem → destino oficiais, agregação mensal, gráfico de colunas por
sentido; ponto do corredor com o rótulo dos extremos.

**Legenda:** uma por camada ligada; classes fixas do conjunto e "sem dado"; linha de
procedência que leva à Base de dados.

### 10.3 Mercado (`/mercado`)

Sucede a view Mercado Residencial. `urbi-shell-page` com `urbi-stack`:

1. **Seletor de período** (`urbi-chips-atalho`: último mês, trimestre, 12 meses, ano civil,
   personalizado) + comparação (sem | período anterior | mesmo período do ano anterior) + modo
   (mês a mês | acumulado no ano).
2. **Quatro destaques** (`urbi-kpi`): preço de venda/m² realizado, vendas (unidades), IVV, VGV.
   Em modo comparação, cada card mostra a variação e o período comparado.
3. **Grupos de indicadores**: oferta, vendas, lançamentos, distratos, preços, áreas, valores
   (VGO/VGV/VGL), cada métrica com sua natureza de agregação escrita na dica.
4. **Faixa de derivados**: gap pedido/venda, meses de oferta, reposição da oferta, ticket médio
   vendido, área média vendida, distrato/venda, cada um com a fórmula.
5. **Sete gráficos** (`urbi-grafico-*`, séries por índice de cor, `null` como gap): Velocidade
   de vendas (área), Preço pedido × preço de venda (linha), Vendas e lançamentos (colunas),
   Unidades em oferta (área), VGV por mês (colunas), Distratos sobre vendas (linha, só gráfico),
   IVV por mês do ano (linha, uma série por ano). Com comparação, a série comparada entra no
   mesmo eixo.
6. **IVV por localidade** (retrato): `urbi-tabela` ordenável com ofertadas, vendidas, IVV,
   preços, gap; `DF Total` como régua acima da tabela; `urbi-mapa-de-calor` localidade × faixa
   de quartos; três leituras da matriz preço × liquidez em gráfico de dispersão (colunas com
   marcadores, ou registro de exceção se precisar de scatter real).
7. **FipeZap**: total da cidade (venda e locação, residencial e comercial, com yield) e por
   localidade (seletor desambiguado; venda × locação pareadas; diferença contra o total;
   ranking do mês).
8. **Métricas de anúncios** (novo no app): mediana de preço/m² e estoque ativo por mês, por
   tipologia, da própria base de anúncios, com `amostra_n` e o mês corrente marcado como
   parcial.
9. **Análise de mercado** vigente (seção 9) e botão "Gerar análise do mês".

### 10.4 Diagnóstico (`/diagnostico`, `/ranking`, `/comparar`, `/base`)

Sucede Diagnóstico Territorial PDAD-A e as três telas irmãs. `urbi-abas` entre as quatro.

**Perfil territorial:** seletor de ano (com a cobertura: "2021 publica só Plano Piloto"),
localidade ou "todas", tema. KPIs: população, domicílios ocupados (somados), demais médias.
Cartões por tema com o tipo de gráfico do catálogo (colunas, empilhado, rosca → pizza, tempo
com acumulada, grupo × destino, barras). Clique em categoria abre o drill-down com a Figura
inteira. Bloco **Perfil imobiliário** (os indicadores curados contra a mediana das localidades,
com `n` e posição) e bloco **Perfil territorial** (agregados públicos). Análise de território
vigente e botão "Gerar análise".

**Ranking:** indicador (os 10 curados + 4 territoriais + renda per capita quando publicada),
cartão com fórmula e fonte, localidades ordenadas, ressalvas do conjunto.

**Comparar:** 2 a 6 localidades × até 4 indicadores, kits prontos, tabela e colunas agrupadas.

**Dispersão:** as nove leituras, pontos nomeados, Pearson descritivo, ano travado no de
cobertura completa.

**Base de dados:** toda fonte com versão, data, licença, método, contagens, cortes de classe;
seção "Conjuntos públicos" lida de `/territorio/conjuntos`; seção "Achados abertos" com link
para Operação › Qualidade; botão de exportar CSV por tabela.

### 10.5 Análises (`/analises`)

`urbi-inbox`: lista das análises vigentes (filtro por tipo, localidade, mês), detalhe com o
Markdown (`urbi-markdown`), os achados como lista com a direção (badge) e os indicadores
citados expandíveis (valor, fonte, período), alertas, lacunas (com link para o cadastro quando
há `campo_cadastro`), e o rodapé técnico (slot, modelo, versão das instruções, tokens, data,
quem gerou). Botão "Ver versões anteriores". Botões "Gerar análise de mercado" e "Gerar análise
de território" (escrita).

### 10.6 Cadastro (`/cadastro/*`)

Papel `curador` para escrever; `leitura` vê tudo em modo somente leitura.

- **Anúncios:** `urbi-inbox` com `urbi-tabela` (filtros por coluna, inclusive inativos e
  removidos) e ficha editável; ações: novo por URL (cola a URL → prévia preenchida → confirma),
  novo por formulário, editar, remover/restaurar, verificar agora; histórico de eventos e
  retratos na ficha; mini-mapa `urbi-mapa` em modo `desenhar-ponto` para ajustar coordenada
  (e aí `precisao_coordenada = manual`).
- **Lançamentos:** idem, com `lacunas` em destaque na ficha e botão "verificar agora".
- **Âncoras:** idem; `grupo` derivado mostrado como sugestão.
- **Contornos:** lista por grupo e status; importar KML/KMZ/GeoJSON (upload → prévia das
  feições → aplicar); desenhar (`urbi-mapa modo="desenhar-poligono"`), editar vértices
  (`modo="editar"`), estilo (cor é dado da feição, com amostra), vincular localidade; limites
  oficiais substituídos aparecem como inativos com vigência.
- **Localidades:** lista por tipo, ficha com códigos, pai, ponto de referência (ajustável no
  mini-mapa), perfis por ano, contornos vinculados.

### 10.7 Operação (`/operacao/*`)

Papel `operador` para agir; `leitura` vê.

- **Candidatos:** fila por status; ficha com os campos lidos, o `bruto`, a página de origem;
  aprovar (com correções inline), rejeitar (motivo), reler; destaque aos `bloqueado_leitura`
  ("a página nunca foi lida; os dados são os da listagem").
- **Fontes de portal:** tabela com estado (ok | instável | bloqueada, desde quando, taxa de
  bloqueio 24 h), parser, última execução; ficha com buscas salvas (CRUD, executar agora),
  diagnóstico (código HTTP, classificação, amostra do HTML); aviso quando `proxy_saida_url`
  está vazio e há fonte bloqueada ("considere o proxy de saída; ver docs/coleta.md").
- **Execuções:** `urbi-tabela` de `coletas` com contadores; detalhe com `detalhes_erros`;
  link para a aba Rotinas nativa da Config (log do shell e "Rodar agora").
- **Importações:** escolher tabela, baixar modelo de CSV, subir arquivo, escolher modo de
  duplicata, ver prévia (contagens, mapeamento inferido editável, rejeições), aplicar; histórico
  com relatório.
- **Dados públicos:** manifest remoto × carregado por conjunto; "Carregar agora"; arquivos com
  tamanho, hash, status.
- **Qualidade:** achados abertos por tabela/código/severidade, link para o registro, resolver.

### 10.8 Config (nativa do shell)

Abas que o shell monta sozinho a partir do manifesto: Parâmetros (seção 4.3), Rotinas (status,
horário, "Rodar agora", log), IA (overrides por slot, utilização, histórico), Eventos, Usuários
(papéis `curador` e `operador`), Arquivos (TTL dos anexos, só leitura). A app não declara
`telas_config`: o que é operação de domínio está em `/operacao/*`.

---

## 11. Importação, exportação e migração da planilha

### 11.1 Importação CSV (tela Operação › Importações)

Um CSV por tabela, com as colunas **da tabela desta spec** (o modelo baixável traz o cabeçalho
exato). Fluxo em dois passos, como a importação do módulo `pessoas`:

1. **Prévia** (`POST /importacoes/previa`): upload via coluna `arquivo` de `importacoes`;
   leitura com separador detectado (`;` ou `,`), aspas RFC 4180, UTF-8 com ou sem BOM;
   mapeamento inferido por nome exato, com **aliases** das colunas da planilha antiga
   (`listing_id → id_legado`, `asking_price_brl → preco_pedido_brl`, `ra_geo_id → localidade`
   por `codigo` ou `codigo_legado`, …) para a migração não exigir renomear nada; declarações
   obrigatórias quando a coluna é percentual (`escala: fracao | pontos_percentuais`); validação
   completa de todas as linhas (tipo, opções, obrigatórios, referências resolvidas, unicidade
   dentro do arquivo e contra o banco); nada é gravado.
2. **Aplicar** (`POST /importacoes/:id/aplicar`): em lotes de 500 numa transação cada, com o
   modo de duplicata escolhido; linha rejeitada não derruba o lote (vai ao relatório); ao fim,
   `coletas` e `achados_qualidade` registram o que a validação achou de não bloqueante.

Modos de duplicata (chave natural por tabela, declarada em `comum/importacao-chaves.ts`):

| Modo | Efeito |
|---|---|
| `ignorar` | linha cuja chave já existe é pulada (contada em `ignoradas`) |
| `atualizar` | linha existente recebe as colunas presentes no CSV (coluna ausente não é tocada) |
| `substituir_tudo` | **só** para tabelas de série publicada (`ivv_*`, `fipezap_mensal`, `pdad_observacoes`, `trafego_diario`, `corredor_diario`, `sentidos_oficiais`): apaga o conteúdo da cidade/ano e insere; exige confirmação explícita na tela |
| `falhar` | qualquer duplicata reprova a prévia inteira |

### 11.2 Exportação CSV

Toda lista tem "Baixar CSV" (seção 6): o filtro em tela, todas as colunas da tabela mais os
derivados, `;` como separador, BOM, datas `AAAA-MM-DD`, frações como `0.057` (não `5,7%`), e um
rodapé **não**: o nome do arquivo carrega tabela, filtro resumido e data
(`anuncios_asa-norte_2026-10-16.csv`).

### 11.3 Migração da planilha (uma vez)

Ordem, respeitando referências. Cada passo é uma importação pela tela, com o CSV exportado da
aba correspondente (Arquivo › Fazer download › CSV, por aba), sem edição manual do CSV:

| # | Aba(s) | Tabela destino | Observações |
|---|---|---|---|
| 0 | — | `cidades`, `localidades` (35 RAs) | semente do `aoIniciar` |
| 1 | `RA_PROFILES` | `localidades` (atualizar: códigos, nomes, área, notas) e `localidade_perfis` | `ra_geo_id` = `codigo`; `ra_code` = `codigo_romano` |
| 2 | `data/public/ra_crosswalk.json` | `localidades.codigo_legado` | único uso do arquivo; depois ele morre |
| 3 | `FIPEZAP_LOCALITY_MAP` | `localidades` tipo `submercado`/`agregado` | `ra_geo_id` → pai |
| 4 | `POLYGONS` | `contornos` | `ra_geo_id` → `localidade_id`; o `polygon_id` de eixo é o `codigo` do trecho |
| 5 | `ANCHORS` | `ancoras` | `ra_geo_id` legado → `codigo_legado` |
| 6 | `LISTING_SOURCES` | `fontes_portal` (+ `buscas_portal` a partir de `search_urls`) | |
| 7 | `LISTINGS` | `anuncios` | `portal` → fonte; `ra_geo_id` legado; `status` vazio → `ativo`; `imovel` → `nao_classificado` |
| 8 | `LISTING_EVENTS`, `LISTINGS_HISTORY_MONTHLY`, `LISTINGS_UPDATE_RUNS`, `LISTING_CANDIDATES` | `anuncio_eventos`, `anuncio_retratos` (congelados), `coletas`, `candidatos` | `listing_id` → `anuncio_id` por `id_legado` |
| 9 | `LISTINGS_MONTHLY_METRICS` | **não importa**: recalculada pelo `fechar_mes` em modo "recalcular tudo" (botão na tela de Execuções) | garante uma só implementação da estatística |
| 10 | `DEVELOPMENTS` | `lancamentos` | |
| 11 | `IVV_MONTHLY` | `ivv_mensal` | cabeçalhos observados × canônicos (de-para do contrato antigo) como aliases; 50 colunas em `extras`; recalculado conferido |
| 12 | `IVV_REGION` | `ivv_regional` | `market_region` → localidade com mapeamento confirmado; p.p. ÷ 100 |
| 13 | `FIPEZAP_MONTHLY` | `fipezap_mensal` | `FIPEZAP_LOCALITY_MONTHLY` **não importa** (derivada) |
| 14 | `FIPEZAP_SOURCES`, `FIPEZAP_NOTES`, `PDAD_A_GUIDE` | `procedencias` | |
| 15 | `PDAD_A_FIGURE_MAP`, `PDAD_A_DATA` | `pdad_figuras`, `pdad_observacoes` | linhas numéricas em `category_standard` rejeitadas com achado; p.p. ÷ 100 |
| 16 | `ROAD_SEGMENTS`, `ROAD_SEGMENT_ALIASES`, `ROAD_DIRECTION_MAP`, `TRAFFIC_DAILY_TEST`, `TRAFFIC_CORRIDOR_DAILY` | `trechos_rodoviarios`, `trecho_aliases`, `sentidos_oficiais`, `trafego_diario`, `corredores` (1 linha, manual) + `corredor_diario` | `current_polygon_id` vazio resolvido por `entidade_codigo` |
| 17 | `EMPLOYMENT_PRELIMINARY`, `EMPLOYMENT_RA_PROFILE`, `WORKPLACE_RA_2018` | `agregados_territoriais` (`conjunto_codigo = emprego_*`) `[PENDENTE P-01]` | |
| 18 | `data/public/` | `conjuntos_publicos`, `conjunto_arquivos`, `agregados_territoriais` | pela rotina `carregar_dados_publicos` |
| 19 | `LISTINGS_COVERAGE`, `PDAD_A_COVERAGE`, `APP_META`, `DATA_QUALITY`, `CHANGE_LOG`, `_FIPEZAP_SCRATCH_*` | **não importam** | coberturas viram `sql_declarado`; meta vira contagens em tempo real; qualidade e log recomeçam no app |

Critério de aceite da migração: para cada aba importada, `total_linhas = inseridas + ignoradas + rejeitadas`
no relatório, e as rejeitadas estão listadas com motivo; as contagens de `APP_META`
(`listings_active_count`, `rows_polygons_active`, …) batem com as contagens da app no dia da
migração, e a diferença, se houver, está explicada por rejeição nomeada. Depois disso a
planilha é posta em somente leitura e o Apps Script tem os gatilhos removidos.

### 11.4 Regras de normalização herdadas (em `comum/`)

Portadas do site com os mesmos testes: número em formato brasileiro e americano; data em
`YYYY-MM-DD`, `Date(a,m,d)` do GViz, serial Excel e `dd/mm/aaaa`; `period_id` × `reference_date`
(a data vence, discordância vira achado); vocabulário de `property_type`, `transaction_type`
(`sale`/`rent` → `venda`/`locacao`), `segment_scope`, `geography_scope`; os dois formatos de
linha dos `purchase_*` do PDAD; `DF Total`/`TOTAL` como agregados; `ivv_pct_published` vence
`ivv_pct`; coluna não declarada no mapeamento vira achado `COLUNA_NAO_DECLARADA` e vai para
`extras` quando a tabela o tem.

---

## 12. Dados públicos (pipeline → app)

### 12.1 Divisão de responsabilidades (D-05)

O pipeline Python (`pipeline/`) continua sendo o **produtor**: roda no GitHub Actions deste
repositório (mensal e manual), lê IBGE, Ipea, OSM e GeoPortal, escreve `data/public/` com
`manifest.json`, schemas, `sha256` e orçamento por arquivo, e abre a PR automática. Nada disso
muda. A app é a **consumidora**: a rotina `carregar_dados_publicos` lê o manifest publicado e
traz os arquivos para dentro do banco (coluna `arquivo`), de onde a app os serve.

Por que não rodar o pipeline na app: ele precisa de Python, geopandas e de horas de CPU em
rasters; a rotina do shell tem 15 minutos e Node. Por que não deixar os arquivos no GitHub e
só apontar: "tudo dentro do app" (D-05) e independência do Pages, que vai deixar de servir o
site.

### 12.2 Contrato que a app lê

O `manifest.json` versão 1 tal como `docs/DATA_CONTRACT.md` o descreve: `datasets[]` com `id`,
`version`, `content_hash`, `files[]` (`path`, `role`, `bytes`, `budget_bytes`, `sha256`,
`shard_key`, `shard_value`, `zoom_min`), `sources[]`, `class_breaks`, `quality_flags`,
`notes_pt`. A app recusa `manifest_version` que não conhece.

### 12.3 Equilíbrio de custo

- Só baixa conjunto cujo `content_hash` difere do `ativo`; conjunto inalterado não gera tráfego.
- Um conjunto por execução quando o total passa de 20 MB; continuação por agendamento.
- Arquivo baixado é conferido (`bytes`, `sha256`) antes de subir; o shell guarda o blob uma vez.
- No frontend, cada arquivo é buscado uma vez por sessão e memoizado por `sha256`; a URL leva
  `?v=<sha8>` e a rota responde `Cache-Control: immutable`.
- `ra_aggregates.json` vira linhas de `agregados_territoriais`, que é o que Ranking, Comparar,
  Diagnóstico e a análise de IA leem; as camadas finas só são baixadas quando alguém liga a
  camada no mapa.

### 12.4 Pipeline fase 2 (futuro, seção 15.7)

Empregos 2023 por CEP (BigQuery, Base dos Dados) e Censo 2022 por setor entram como conjuntos
novos no mesmo manifest, sem mudança na app além de catálogo (`comum/conjuntos.ts` com título,
métrica padrão e legenda).

---

## 13. Eventos, erros e notificações

Foco em **erros de operação** (D-14). Todo erro vai ao admin da app automaticamente (inscrição
sem opt-out, inbox como piso; e-mail e Slack como o admin preferir, ou um destino de Remessa).

```jsonc
"erros": {
  "coleta_falhou":          { "campos": ["coleta_id", "rotina", "erro"],          "conteudo": "Rotina {rotina} falhou: {erro}",                               "api": "coletas/{coleta_id}",        "rota": "operacao/execucoes" },
  "fonte_bloqueada":        { "campos": ["fonte_id", "fonte", "taxa_bloqueio"],   "conteudo": "Fonte {fonte} bloqueada ({taxa_bloqueio} das leituras em 24 h)", "api": "fontes/{fonte_id}",         "rota": "operacao/fontes" },
  "importacao_falhou":      { "campos": ["importacao_id", "tabela", "erro"],      "conteudo": "Importação em {tabela} falhou: {erro}",                        "api": "importacoes/{importacao_id}", "rota": "operacao/importacoes" },
  "fechamento_mes_falhou":  { "campos": ["coleta_id", "mes", "erro"],             "conteudo": "Fechamento de {mes} falhou: {erro}",                           "api": "coletas/{coleta_id}",        "rota": "operacao/execucoes" },
  "dados_publicos_falhou":  { "campos": ["conjunto", "erro"],                     "conteudo": "Carga do conjunto {conjunto} falhou: {erro}",                  "api": "dados-publicos/estado",       "rota": "operacao/dados-publicos" },
  "analise_falhou":         { "campos": ["tipo", "recorte", "erro"],              "conteudo": "Análise {tipo} de {recorte} falhou: {erro}",                   "api": "analises/estado",            "rota": "analises" }
},
"eventos": {
  "lacuna_cadastro":        { "descricao": "A coleta ou a análise por IA apontou um dado de cadastro que falta e precisa de preenchimento manual.", "campos": ["tabela", "registro_id", "nome", "campos"], "conteudo": "Lacuna em {nome}: faltam {campos}", "api": "{tabela}/{registro_id}", "rota": "cadastro/{tabela}" },
  "continuar_coleta":       { "descricao": "Evento interno: a rotina agendou a própria continuação dentro do dia.", "campos": ["rotina", "coleta_id"], "conteudo": "Continuação de {rotina}", "api": "coletas/{coleta_id}", "rota": "operacao/execucoes" }
}
```

`lacuna_cadastro` é evento de domínio comum (quem tem `leitura` pode se inscrever; o `curador`
é inscrito por padrão no `aoIniciar`, por `escopo` de papel). `continuar_coleta` é escutado por
`export const reagir` e não gera notificação (ninguém se inscreve; o shell só o entrega ao
listener). Os erros injetados pelo shell (`ia_chamada`, `listener_falhou`, `iniciar_falhou`,
…) chegam ao admin sem declaração.

---

## 14. Permissões e papéis

| Nível | Quem | O que faz |
|---|---|---|
| (sem permissão) | todo usuário da instância, por padrão (D-13) | não vê a app |
| `leitura` | liberado individualmente | vê todas as telas, exporta CSV, abre análises |
| `escrita` + `curador` | | cadastra e corrige anúncios, lançamentos, âncoras, contornos e localidades; aprova e rejeita candidatos; gera análises |
| `escrita` + `operador` | | gerencia fontes e buscas, roda verificações e buscas agora, importa CSV, carrega dados públicos, resolve achados; gera análises |
| `escrita` sem papel | | só gera análises (o botão) e nada mais de escrita: as rotas de cadastro e operação exigem o papel e respondem `403 PAPEL_EXIGIDO` |
| `admin` | | tudo acima mais a Config (parâmetros, rotinas, IA, usuários e papéis). Como o shell não concede papéis ao admin automaticamente, o admin que também cura atribui a si o papel |

Gate de papel em código: `exigirPapel('curador')` lê `req.contexto.rolesApp`. Nenhuma rota
olha `usuario.tipo` nem `natureza`. Externos: a app não declara `aceita_externos`.

---

## 15. Fases de implementação

Cada fase termina com release instalável na Pinguim e com a documentação em `docs/` da app
atualizada. As fases mais distantes têm menos detalhe de propósito: o detalhe cresce quando a
fase anterior mostra o que a realidade pede. Estimativa em **sessões** de implementação com
agente (uma sessão ≈ um PR grande revisado), não em dias.

### 15.0 Fase 0 — Preparação (1 sessão)

- Decidir o repositório (D-16) e instalar o kit (`npx @urbiverso/kit-apps`): `apps/`,
  `pnpm-workspace.yaml` com catálogo, `release.yml`, `ci.yml`, `KIT.md`, skills.
- Credenciar o SDK (PAT `read:packages` no ambiente do agente e secret no CI).
- Criar `apps/inteligencia_imobiliaria/` com `manifesto.json` mínimo, `schema.json` vazio,
  `backend/rotas.ts` com `rotas` vazio, `frontend/index.ts` com a tela "em construção",
  `docs/README.md` apontando para esta spec.
- `pnpm build && pnpm exec urbi-empacotar inteligencia_imobiliaria` limpo; primeira release;
  instalação na Pinguim com auto-update ligado.

**Pronto quando:** a app aparece no menu da Pinguim com a tela vazia e `0.1.0`.

### 15.1 Fase 1 — Fundação: território, cadastro, mapa (3 a 4 sessões)

**Schema:** `cidades`, `localidades`, `localidade_perfis`, `contornos`, `fontes_portal`,
`buscas_portal`, `anuncios`, `anuncio_eventos`, `lancamentos`, `lancamento_eventos`, `ancoras`,
`importacoes`, `achados_qualidade`, `alteracoes_cadastro`, `coletas`, `cursores_rotina`.

**Backend:** `aoIniciar` com a semente; rotas de 6.1, 6.2 (menos comparáveis, verificar e
por-url), 6.4, 6.9 (importações e qualidade); `comum/` com normalização portada e testada;
exportação CSV; `backend/metricas/` com mediana e percentis.

**Importação:** prévia + aplicar com aliases da planilha; passos 0 a 7 e 10 da migração
(sem a parte de rotina do 8).

**Frontend:** roteador de sub-rotas; Mapa com camadas 2, 5, 6, 7, 8, filtros, KPIs, detalhes
em três níveis, estado na URL; Cadastro (anúncios por formulário, lançamentos, âncoras,
contornos com importação de KML e desenho, localidades); Operação › Importações e Qualidade.

**Docs:** `docs/dados.md` (todas as tabelas da fase), `docs/importacao.md`.

**Pronto quando:** os 158 anúncios, 22 lançamentos, 35 âncoras e os contornos da planilha
estão na Pinguim pela importação, com o relatório conferindo as contagens; o mapa abre com os
mesmos filtros do site e o mesmo detalhe; um curador cria, edita e remove um anúncio e o
evento e a alteração ficam registrados; um CSV exportado reabre na prévia da importação sem
rejeição.

### 15.2 Fase 2 — Mercado e Diagnóstico (3 sessões)

**Schema:** `ivv_mensal`, `ivv_regional`, `fipezap_mensal`, `pdad_observacoes`, `pdad_figuras`,
`procedencias`; `sql_declarado` `serie_pareada_fipezap`, `ranking_localidades_indicador`,
`cobertura_pdad`.

**Backend:** rotas 6.5 e 6.6; agregação por natureza e os seis derivados (portados de
`src/ivv/` com os testes); consolidação do PDAD (`aggregate.js` portado); kits de comparação
e dispersão; Base de dados.

**Importação:** passos 11 a 15, com a conferência publicado × recalculado do IVV.

**Frontend:** Mercado (10.3 itens 1 a 7), Diagnóstico com as quatro abas; `comum/indicadores.ts`.

**Pronto quando:** cada número que o site mostra hoje no Mercado e no Diagnóstico aparece
igual no app para o mesmo recorte (roteiro de paridade com 30 valores escolhidos, conferidos à
mão); a Base de dados lista toda fonte importada.

### 15.3 Fase 3 — Coleta, histórico e fechamento mensal (3 a 4 sessões)

**Schema:** `candidatos`, `anuncio_retratos`, `metricas_anuncios_mensais`; `sql_declarado`
`mediana_preco_por_localidade`, `cobertura_anuncios`.

**Backend:** cliente HTTP com proxy opcional; classificação; parsers (genéricos + cinco
fontes) com fixtures reais colhidas pelo diagnóstico; rotinas `verificar_anuncios`,
`descobrir_anuncios`, `verificar_lancamentos`, `fechar_mes` com fatiamento e continuação; rotas
6.3, `/anuncios/por-url`, `/anuncios/:id/verificar`, comparáveis, métricas de anúncios;
eventos e erros da seção 13.

**Importação:** passo 8; recálculo total das métricas.

**Frontend:** Operação › Candidatos, Fontes, Execuções; Cadastro › anúncio por URL; Mercado
item 8; comparáveis no detalhe do Mapa; situação do anúncio e "confirmado no portal em".

**Docs:** `docs/coleta.md` com a postura, a classificação, os portões e o runbook do proxy.

**Pronto quando:** a rotina diária roda na Pinguim por sete dias seguidos com log limpo ou
com bloqueio registrado por fonte (não com erro); um candidato descoberto é promovido pelo
portão e outro fica pendente pelo motivo certo; o primeiro `fechar_mes` congela o mês e as
métricas conferem com um recálculo manual de três grupos; a decisão sobre o proxy (D-09) é
tomada com o painel de Fontes como evidência.

### 15.4 Fase 4 — Território público e tráfego (2 a 3 sessões)

**Schema:** `conjuntos_publicos`, `conjunto_arquivos`, `agregados_territoriais`,
`trechos_rodoviarios`, `trecho_aliases`, `sentidos_oficiais`, `trafego_diario`, `corredores`,
`corredor_diario`.

**Backend:** rotina `carregar_dados_publicos`; rotas 6.7; servir arquivo com `ETag` e cache
imutável.

**Importação:** passos 16 a 18.

**Frontend:** Mapa camadas 1, 3, 4 com legenda, detalhe e procedência; painel de trecho e
corredor; Perfil territorial no Diagnóstico; Ranking e Dispersão com os indicadores públicos;
Operação › Dados públicos; Base de dados com os conjuntos.

**Pronto quando:** os três conjuntos publicados em 2026-10-06 estão carregados e desenham no
mapa da Pinguim com as mesmas classes do site; o fluxo da DF-003 por sentido confere com a
planilha para um dia escolhido; o pipeline publica uma versão nova e a rotina a carrega sem
intervenção.

### 15.5 Fase 5 — Análises por IA (2 sessões)

**Schema:** `analises_ia`.

**Backend:** `backend/ia/` (contexto por tipo, compactação, schema, validação de chaves,
gravação, evento de lacuna); rotina `gerar_analises_mensais`; rotas 6.8; slots no manifesto;
parâmetros de instruções com texto padrão.

**Frontend:** tela Análises; botões e blocos de análise vigente no Mapa, Mercado e
Diagnóstico; `estadoSlot` escondendo o que não resolve.

**Docs:** `docs/analises.md`.

**Pronto quando:** a análise de mercado do mês e a de três localidades são geradas na Pinguim,
todos os achados citam indicadores existentes, uma lacuna de lançamento vira evento e aparece
no inbox do curador, e o custo em tokens está dentro da faixa da seção 9.5.

### 15.6 Fase 6 — Fechamento da migração (1 sessão)

- Planilha em somente leitura; gatilhos do Apps Script removidos; `README.md` do repositório
  passa a apontar para a app e marca o site como legado.
- Site estático congelado em uma tag; GitHub Pages pode seguir no ar como arquivo histórico ou
  ser desligado (decisão do dono).
- `docs/PRODUCT_PLAN.md`, `ARCHITECTURE.md`, `DATA_CONTRACT.md`, `SHEET_SETUP.md` recebem um
  aviso de que descrevem o legado.

### 15.7 Futuro (fora da V1, detalhado na medida do possível)

- **Pipeline fase 2 (#159):** conjuntos `jobs_cep_2023` e `censo_setores_2022` no manifest; na
  app, só catálogo e legenda. Depende de credencial BigQuery no Actions.
- **Modelo 2 (#154):** painel longo `cidade × ano × variável × fonte` com cenários e backtest.
  Na app, viraria `cidades` com mais linhas, `agregados_territoriais` com `conjunto_codigo =
  warehouse_*` e uma tela "Cidades"; previsão só publicada com backtest ao lado, como o
  `warehouse/README.md` já exige. A análise de IA de mercado ganharia o bloco de cidades
  comparadas.
- **Módulo `imobiliario` (D-06):** ligar `lancamentos` a `incorporacoes` por referência lógica
  (só o id) quando a UP passar a cadastrar incorporações no núcleo; `dependencias` no
  manifesto com `imoveis: ["ler"]`.
- **Proxy de saída (D-09):** se a Pinguim medir bloqueio, uma VPS mínima com `tinyproxy` e
  firewall para o IP da instância, URL em `proxy_saida_url`; runbook em `docs/coleta.md`.
- **Páginas públicas:** se um dia parte do mapa voltar a ser pública, `paginas_publicas` com
  componente próprio sem tokens de tema e rotas `GET` em `rotasPublicas` filtrando o que é
  público; nada disso está desenhado.
- **Segunda cidade:** linha em `cidades`, localidades por importação, séries por importação;
  o que falta medir é o custo do IVV e do FipeZap de outra praça, que são publicações de outras
  entidades.

---

## 16. Registro de decisões

| Código | Decisão | Alternativa descartada | Motivo |
|---|---|---|---|
| D-01 | Análise por IA em texto, como analista, sobre indicadores calculados pela app | Manter a proibição do plano de produto; ou modelo preditivo numérico | A proibição era postura de site público. O app é interno. Texto sobre indicadores é conferível; número gerado pelo modelo não |
| D-02 | App só autenticada, sem página pública | Manter o site público em paralelo; página pública com o mapa | O produto é da empresa. Menos superfície, uma só implementação |
| D-03 | Tudo dentro da app: banco da app é a fonte de verdade; planilha vira semente e depois congela | Planilha sincronizada com a app | Duas fontes de verdade foi o que gerou as divergências de versão do Apps Script |
| D-04 | Coleta e parsing determinísticos, portados do script; IA só para análise (e um fallback opcional de extração, desligado) | IA para extrair campos de toda página | O script já faz isso de graça; token é para onde dá retorno |
| D-05 | Pipeline Python segue no GitHub Actions como produtor; a app carrega os artefatos por rotina mensal e os serve do próprio banco | Reescrever o pipeline na app; apontar para o GitHub Pages | 15 minutos de rotina Node não rodam o pipeline; "tudo dentro do app" vale para o dado servido |
| D-06 | Sem dependência de módulo do UrbiVerso na V1 | `dependencias` em `imobiliario` já na V1 | O módulo não expõe tabela referenciável e o dado da UP ainda não está lá |
| D-07 | Localidade é entidade com as duas grafias de RA como colunas; `ra_crosswalk.json` morre | Manter `ra_geo_id` texto e uma ponte | A ponte existia porque a planilha não tinha chave; o banco tem |
| D-08 | Modelo aberto a outras cidades desde o início (`cidades` + `localidades` tipadas) | Modelar só o DF | Custa pouco agora e evita migração de toda tabela de fato depois |
| D-09 | Coleta direta da instância com proxy de saída **opcional** por parâmetro, decidido por medição | Exigir proxy desde o início; ou não prever | O charles3 provou o caminho; só vale pagar a VPS se o bloqueio aparecer |
| D-10 | Inativação com **2** confirmações em dias distintos | 3 (regra do repositório) | É o que a planilha roda hoje; com rotina diária confiável, 2 dias é latência suficiente |
| D-11 | `FIPEZAP_LOCALITY_MONTHLY` não é tabela: derivada por `sql_declarado` | Importar a visão larga | Era materialização para contornar o GViz; o banco pareia na leitura |
| D-12 | Uma escala só no banco (fração decimal), conversão declarada por fonte na importação | Guardar cada fonte na escala em que publica | Com duas escalas a regra do site era "nunca unificar"; no banco a unificação é feita uma vez, testada e registrada |
| D-13 | Permissão padrão **nenhuma**; liberação por pessoa | `leitura` para toda a instância | Pedido do dono, por enquanto |
| D-14 | Notificação só de erros de operação, mais o evento de lacuna de cadastro | Notificar candidato novo, reativação, queda de preço | Foco pedido; o resto entra quando houver uso |
| D-15 | Sem modo demonstração nem dado fictício | Manter `demo.json` | A instância de destino é de testes e recebe o dado real por CSV |
| D-16 | Repositório da app a decidir depois; a spec descreve a forma (`apps/<slug>/`) sem fixar onde | Decidir agora | Pedido do dono: nesta rodada só a spec |
| D-17 | `metricas_anuncios_mensais` materializada por rotina, com recálculo total disponível | Calcular na hora | Velocidade de tela e uma só implementação da estatística (o fechamento) |
| D-18 | Papéis `curador` (dado) e `operador` (operação) sob `escrita` | Um papel só | Separa quem responde pelo dado de quem responde pela máquina; admin pode ter os dois |
| D-19 | Tráfego e rodovias entram na V1 (fase 4) | Deixar para depois | Já está pronto na planilha e no site; portar custa menos que decidir de novo |
| D-20 | `ivv_mensal` guarda 13 métricas como coluna e o resto em `extras`; derivados recalculados | 79 colunas | O site já recalcula; conferir publicado × recalculado vira achado de qualidade em vez de duas verdades |

---

## 17. Pendências

| Código | O que falta | Impacto se não resolvido |
|---|---|---|
| P-01 | O que são `EMPLOYMENT_PRELIMINARY`, `EMPLOYMENT_RA_PROFILE` e `WORKPLACE_RA_2018` (fonte, ano, unidade) | Decidir se viram linhas de `agregados_territoriais`, tabela própria ou morrem na migração |
| P-02 | Texto padrão das instruções de IA dos três slots | Fase 5 escreve a primeira versão; a equipe refina na Config |
| P-03 | Cabeçalhos exatos de `PDAD_A_FIGURE_MAP`, `FIPEZAP_SOURCES`, `FIPEZAP_NOTES`, `PDAD_A_GUIDE`, `LISTINGS_COVERAGE`, `PDAD_A_COVERAGE` (não alcancei a planilha além da nona aba) | As tabelas `pdad_figuras` e `procedencias` têm `extras` justamente para absorver o que não está modelado; confirmar na primeira importação |
| P-04 | Repositório da app (D-16) e `identidade` do manifesto | Fase 0 |
| P-05 | Horários das rotinas no fuso da organização (quem define é o admin na Config) | Padrão 06:00 UTC até alguém mudar |
| P-06 | Quem são as pessoas da equipe que recebem `leitura`, `curador`, `operador`, `admin` na Pinguim | Liberação na instalação |
| P-07 | Se o GitHub Pages continua no ar como arquivo depois da fase 6 | Fase 6 |

---

## 18. Testes, qualidade e critérios de pronto

### 18.1 Testes da app (`testes/`, `node --test`)

- **Puros (`comum/`):** normalização de número e data (paridade com `src/normalize.js` e com
  `toNumber_` do script, entrada por entrada); escalas (fração ↔ p.p. declarada; recusa fora da
  faixa); agregação por natureza (fluxo soma, estoque média, razão ponderada pareada,
  não-agregável recusa); mediana e percentil (listas vazias, pares, ímpares); ponto em
  polígono; jitter determinístico (mesma URL, mesmo ponto); orientação por tipologia;
  consolidação do PDAD (média entre localidades, soma de contagens, `suprimido` fora, os dois
  formatos de `purchase_*`); vocabulário de URL do mapa (ida e volta).
- **Parser:** uma fixture real por fonte e por caso (ativo com JSON-LD, ativo só com meta,
  inativo por marcador, bloqueado por captcha, listagem com `ItemList`), resultado esperado em
  JSON ao lado; o teste roda o parser contra a fixture e compara.
- **Classificação de resposta:** tabela-verdade de status HTTP × corpo → resultado.
- **Portões de promoção:** cada portão com um candidato que passa e um que reprova, e a
  distinção duro × brando.
- **Rotinas:** handler com `ctx` falso (`dados` em memória, `eventos` que grava, relógio
  controlável): verificar com `ativa`/`inativa`/`bloqueada`, contagem de dias distintos,
  reativação, preço acima da variação máxima; descoberta com duplicata e com bloqueio;
  fechamento de mês idempotente (rodar duas vezes não muda nada); continuação por cursor.
- **Importação:** CSV de cada aba da planilha (amostra de 20 linhas versionada em
  `testes/fixtures/planilha/`) → prévia sem rejeição; CSV com erro de cada tipo → rejeição
  nomeada; os quatro modos de duplicata.
- **IA:** montagem de contexto (chaves esperadas por tipo; compactação acima do limite);
  validação da resposta (achado com chave desconhecida é descartado e registrado).
- **Rotas:** `supertest` sobre o Router com `req.dados`/`req.contexto` falsos: gate de papel
  (403 `PAPEL_EXIGIDO`), teto de `por_pagina`, CSV com BOM e `;`, `null` para ausência.

Os testes **só leem a pasta da app** (regra do guia de apps em repositório próprio).

### 18.2 Portas

- `pnpm build && pnpm exec urbi-empacotar inteligencia_imobiliaria` limpo em todo PR (CI do kit).
- `pnpm test` verde em todo PR; noturna contra o SDK mais novo.
- Revisão de PR pela skill `revisar-pr-apps` (bundle do SDK como referência, nunca o monorepo).
- QA na Pinguim pela skill `qa`, com o roteiro de cada fase derivado dos "Pronto quando" da
  seção 15, com o token do QA Principal (nunca sysadmin).

### 18.3 Critério global de pronto da V1

1. Todas as fases 0 a 5 instaladas na Pinguim pela release, auto-update ligado.
2. Migração conferida (seção 11.3), planilha congelada, Apps Script sem gatilhos.
3. Paridade de 30 valores com o site (fase 2) e de 10 cenários de mapa (fase 1).
4. Sete dias de rotinas com log limpo ou bloqueio registrado.
5. Docs da app completos; esta spec marcada como implementada e as seções que viraram
   comportamento migradas para `docs/` da app (spec descreve o que ainda não existe).

---

## 19. Glossário

- **Anúncio:** oferta individual no mercado secundário, lida de um portal. Preço é pedido.
- **Candidato:** anúncio descoberto e ainda não promovido; vive na fila do curador.
- **Lançamento:** empreendimento em comercialização (o `DEVELOPMENT` do site).
- **Âncora:** ponto de interesse (escola, mobilidade, saúde, comércio) com coordenada exata.
- **Localidade:** unidade territorial tipada (RA, submercado, bairro, município, agregado) de
  uma cidade. Sucede "RA" como chave.
- **Contorno:** geometria desenhável (limite de localidade, eixo rodoviário, área importada).
- **Retrato mensal:** estado de um anúncio no fim de um mês. **Fechamento:** a rotina que o
  congela e recalcula as métricas.
- **IVV:** índice de velocidade de vendas, fração decimal (vendidas / ofertadas) por mês.
- **Fração decimal:** `0.057` = 5,7%. Única escala de percentual no banco.
- **Conjunto público:** dataset do pipeline (grade de domicílios, hexágonos de emprego,
  centralidade viária, agregados por localidade) com manifest, hash e procedência.
- **Agregado territorial:** indicador por localidade, ano e métrica, em formato longo.
- **Coleta:** execução de uma rotina, com contadores de domínio.
- **Achado de qualidade:** registro de validação não bloqueante ou de divergência, com código.
- **Análise:** texto gerado por IA sobre indicadores calculados, com os indicadores citados.
- **Slot (IA):** nome pelo qual a app pede um modelo ao shell; o shell resolve provedor, chave e
  failsafe.
- **Portão (de promoção):** regra que um candidato precisa passar para virar anúncio; duro
  rejeita, brando deixa pendente.
