# Spec — Inteligência Imobiliária (app UrbiVerso)

**Status:** rascunho em construção, versão 0.3 (2026-10-16). A v0.2 incorporou as três rodadas
de pesquisa de referências (D-21 a D-54); a v0.3 traz o método de Novos Negócios da UP para dentro
do app, a leitura do sítio, a viabilidade expedita e a camada de governança (D-55 a D-78).
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
- **`[CONFIRMAR SDK P-nn]`** marca o que depende de um contrato que esta spec não conseguiu
  ler no SDK publicado. Item marcado não é implementado antes de a pendência ser fechada contra
  `node_modules/@urbiverso/sdk/docs/` (regra da skill `revisar-pr-apps`). Todo item marcado
  tem uma alternativa já descrita que não depende do contrato.

### O que mudou da v0.1 para a v0.2

A v0.1 descrevia a migração do site para o UrbiVerso. A v0.2 acrescenta o que transforma o app
em ferramenta de decisão sobre as **nossas áreas**: entorno de qualquer área desenhada, demanda e
produto, preço de terra, oferta futura, comércio e âncoras. Em termos de desenho:

- **Uma chave de junção nova, a célula H3 r9** (seção 5.13), ao lado da localidade. Todo dado
  público passa a chegar também como tabela por célula, e não só como GeoJSON para desenhar.
- **Uma camada de achados determinísticos** (seção 9.7): a app detecta o que mudou e o que
  destoa; a IA só escreve sobre isso.
- **Quatro áreas de tela novas** (Estudos de área, Produto, Comércio e âncoras, Terra e oferta
  futura) e uma tela de Início (seção 10).
- **Três fases novas** (4A, 4B e 7) e uma fase 5 que passa a depender delas (seção 15).
- **Seção 20, riscos e armadilhas**, para resolver por etapa.

### O que mudou da v0.2 para a v0.3

A v0.2 trouxe os dados e as análises. A v0.3 trouxe o **jeito de trabalhar da equipe**, tirado da
biblioteca do projeto (`02_estrategia_gestao_oportunidades.md`, `05_inteligencia_imobiliaria_territorial.md`,
`03_modelos_negocio_parcerias.md`):

- áreas de estudo seguem a escada de maturidade da UP (sinal → hipótese → oportunidade →
  iniciativa → projeto → negócio ou ativo), com perímetros estratégicos (D-55, D-59);
- o dossiê é lido nas **quatro escalas** (regional, urbana, entorno, sítio) e termina numa
  **síntese em cinco grupos** que vira agenda de decisão (D-56);
- toda afirmação registrada numa área é **fato, hipótese, premissa ou decisão**, com evidência
  (D-57); tese territorial, condições e diligência viram objetos do app (D-58, D-60);
- leitura do **sítio** (restrições ambientais e fundiárias, área líquida estimada), equipamentos
  públicos, **viabilidade expedita** pelo método residual e **mercado de lotes** (D-61 a D-64);
- **governança**: catálogo inicial de métricas, versão de método, cache de cálculo, frescor das
  fontes, telemetria de uso, contratos de resposta, requisitos não funcionais, dados pessoais e
  jornadas com áreas de referência (seções 5.13, 6.21, 21 a 24).

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
20. [Riscos e armadilhas](#20-riscos-e-armadilhas)
21. [Requisitos não funcionais](#21-requisitos-não-funcionais)
22. [Dados pessoais e sigilo](#22-dados-pessoais-e-sigilo)
23. [Calendário e frescor das fontes](#23-calendário-e-frescor-das-fontes)
24. [Jornadas e aceitação](#24-jornadas-e-aceitação)

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

A v0.2 acrescenta três perguntas, que levam o app da leitura de mercado para a decisão sobre as
nossas áreas:

7. Que demanda existe no entorno desta área e que produto, a que faixa de preço, ela sustenta?
   (D-44)
8. Que comércio e que serviços faltam aqui, e que âncora faria sentido atrair? (D-42, D-43)
9. Quanto vale a terra aqui e quanta oferta nova está a caminho? (D-39)

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
- **Três naturezas de preço, nunca misturadas (D-50).** Preço **pedido** (anúncio, lançamento),
  preço **arrematado** (licitação de terreno da Terracap, que é transação) e valor **declarado**
  (ITBI, quando houver). Cada um tem tabela, rótulo e série próprios; nenhum indicador combina
  dois deles sem dizer, e preço mínimo de edital nunca é tratado como preço.
- **Rateio declarado (D-35).** Todo número de uma área que não coincide com a unidade da fonte
  diz como foi rateado (peso de domicílios, de população ou de área) e que fração da área a
  fonte cobre.
- **Série territorial declara a integração (D-36).** Toda série por localidade diz se é
  **nominal** (mesmo nome, limites que mudaram) ou **padronizada** (recalculada para os limites
  vigentes).

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
- **O achado é da app; a IA só escreve (D-21).** O que mudou, o que destoa e o que falta é
  calculado em código, com regra e limiar declarados. A IA recebe os achados ranqueados e os
  cita por `id`.
- **A célula é a chave de junção (D-34).** Anúncio, lançamento, âncora, lote, licença e ponto
  comercial carregam `h3_r9`; dado público chega por célula; qualquer área desenhada vira um
  conjunto de células.

### 1.4 Quem usa e para quê (v0.3)

| Persona | Nível e papel | O que precisa do app |
|---|---|---|
| **Direção de Novos Negócios** | `leitura` | o que mudou no mês (Início), o portfólio das áreas, fichas para decidir, a agenda de decisão de cada área |
| **Analista de Novos Negócios** | `escrita` | triar glebas, montar o dossiê, registrar síntese, tese e condições, simular produto, âncora e viabilidade, gerar a ficha |
| **Curador de dados** | `escrita` + `curador` | manter cadastros, aprovar candidatos, confirmar grupos e vínculos, cadastrar as áreas próprias e as faixas de programa |
| **Operador de dados** | `escrita` + `operador` | fontes, buscas, cargas públicas, importações, saúde do parser, qualidade |
| **Admin** | `admin` | parâmetros, rotinas, IA, usuários e papéis |
| **Agente** (Claude ou outro) | o nível do token | ler o mesmo que as telas mostram, pelas mesmas rotas, para montar análises e documentos fora do app |

As sete jornadas que o app precisa servir de ponta a ponta estão na seção 24, cada uma com o
critério de aceite. Elas, e não a lista de telas, são a medida de pronto do produto.

### 1.5 O método da UP dentro do app (v0.3)

O app não inventa vocabulário de gestão. Ele usa o da biblioteca de Novos Negócios:

| Conceito do método | Onde vive no app |
|---|---|
| Sinal, hipótese, oportunidade, iniciativa, projeto, negócio, ativo (doc. 02, §8) | `areas_estudo.estagio` (D-55) |
| Fato, hipótese, premissa, decisão: "não devem ser misturadas" (doc. 02, §86) | `natureza` de todo item de síntese, condição e premissa (D-57) |
| Quatro escalas: regional, urbana, entorno, sítio (doc. 05, §28) | blocos do dossiê e da ficha (D-56) |
| Síntese: forças, restrições, dependências, incertezas, opções (doc. 05, §44) | `area_sintese_itens` e a agenda de decisão (D-56) |
| Tese territorial em dez componentes; condições necessárias e de interrupção (doc. 05, §48 a §51) | `teses`, `tese_condicoes` (D-58) |
| Perímetro estratégico: essencial, proteção, expansão, influência (doc. 05, §58) | `area_perimetros` (D-59) |
| Diligência como sistema de perguntas por frente (doc. 05, §61) | `diligencias`, pré-preenchidas pelo que o app sabe (D-60) |
| Âncora pelo efeito e pelo compromisso, não pela marca (doc. 05, §31); o que a âncora traz e o que a UP traz (doc. 03) | `hipoteses_ancora` (D-65) |

O app **instrumenta** o método: guarda, liga à evidência e lembra do que vence. Ele não decide.

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

E, na v0.2:

- grade analítica H3 r9 e enriquecimento de qualquer área desenhada (seções 5.13 e 6.10);
- estudos de área, incluindo as áreas próprias da UP, com dossiê e ficha exportável (5.16, 10.10);
- demanda, capacidade de pagamento e matriz de produto (5.17, 10.11);
- preço de terra pelas licitações da Terracap e pipeline de oferta futura por alvarás e
  habite-se (5.15, 10.13);
- inventário de comércio, potencial de consumo, lacunas comerciais, simulação de âncora (modelo
  de Huff), áreas gêmeas e lentes de aptidão (5.18, 10.12);
- camada de achados determinísticos, resumo do mês e visões salvas (5.19, 9.7, 10.9);
- métricas de oferta ampliadas, índice de oferta estratificado, agrupamento de anúncios do mesmo
  imóvel e saúde do parser (5.4, 8.4.1);
- camada regulatória (zoneamento do PDOT), contexto macro e de crédito, incerteza amostral da
  PDAD e séries territoriais padronizadas.

E, na v0.3:

- o método de Novos Negócios dentro do app: escada de maturidade, quatro escalas, síntese e
  agenda de decisão, tese com condições, perímetros, diligência, hipóteses de âncora, linha do
  tempo, portfólio e modo campo (seções 1.5, 5.20, 10.10);
- leitura do sítio (restrições e área líquida estimada) e equipamentos públicos (5.21);
- viabilidade expedita e mercado de lotes (5.22, 10.13);
- governança: catálogo inicial, versão de método, cache, frescor, telemetria, contratos de
  resposta, códigos de erro, requisitos não funcionais, dados pessoais e jornadas com golden set
  (5.13, 5.23, 6.21, 6.22, 21 a 24).

### 2.3 O que fica de fora da V1 e entra como fase futura (seção 15.7)

- Isócronas por tempo de deslocamento (precisam de motor de rota; D-52).
- Raster direto no mapa e dois mapas sincronizados (D-52).
- Ficha do lote com parâmetros urbanísticos, ITBI e avisos de mudança relevante (D-52).
- Fluxo de pessoas por celular, que não tem fonte pública no Brasil (D-46).
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
│   ├── rotas/              # um arquivo por domínio (anuncios.ts, mercado.ts, territorio.ts, estudos.ts,
│   │                       #   produto.ts, comercio.ts, terra.ts, empreendimentos.ts, inicio.ts,
│   │                       #   metodo.ts, sitio.ts, viabilidade.ts, governanca.ts, …)
│   ├── rotinas/            # um arquivo por rotina
│   ├── coleta/             # parser dos portais, classificação de resposta, cliente HTTP com proxy opcional
│   ├── ia/                 # montagem de contexto, schemas de resposta, gravação das análises
│   ├── importacao/         # leitura de CSV, mapeamento, validação por tabela
│   └── metricas/           # mediana, percentil, agregação por natureza (fluxo/estoque/razão)
├── comum/                  # código puro compartilhado: indicadores PDAD, escalas, formatação, classes de mapa
│   ├── metricas.ts         # catálogo de métricas: unidade, natureza, rateio, sentido (D-22, D-35)
│   ├── celulas.ts          # pertencimento por centroide, raios, polígono → células, polyline (D-48)
│   ├── achados.ts          # detecção e pontuação de achados (D-21)
│   ├── espacial/           # enriquecimento, similaridade, score de lentes, Gi* (D-37, D-41)
│   ├── produto/            # capacidade de pagamento, matriz de produto (D-44)
│   ├── comercio/           # categorias de consumo, lacunas, modelo de Huff (D-42, D-43)
│   ├── viabilidade/        # método residual vertical e loteamento (D-63)
│   ├── tipos.ts            # contratos de resposta compartilhados (seção 6.21)
│   ├── fontes.ts           # catálogo de fontes: periodicidade, frescor esperado, licença (D-71)
│   ├── versoes.ts          # VERSAO_METODO por domínio (D-70)
│   ├── diligencia.ts       # perguntas padrão por frente (D-60)
│   ├── higienizar.ts       # remoção de dado pessoal na coleta e nas cargas (D-74)
│   └── ajuda/              # "Como ler" de cada tela, em Markdown (D-77)
├── frontend/
│   ├── index.ts            # app-inteligencia-imobiliaria: roteador de sub-rotas
│   ├── telas/              # uma por sub-rota
│   └── componentes/        # peças reutilizadas entre telas
├── migracoes/              # vazio no nascimento; migração de dados a partir da 2ª release com mudança de schema
├── docs/
│   ├── README.md           # visão geral (gerado desta spec quando a app existir)
│   ├── dados.md            # contrato de dados (sucessor do DATA_CONTRACT.md)
│   ├── coleta.md           # rotinas e parser
│   ├── analises.md         # IA e camada de achados
│   ├── territorio.md       # grade, catálogo de métricas, rateio e composição
│   ├── estudos.md          # áreas de estudo, dossiê e fichas
│   ├── produto.md          # demanda, capacidade de pagamento e matriz
│   ├── comercio.md         # categorias, potencial, lacunas, Huff, gêmeas, lentes
│   ├── metodo.md           # escada de maturidade, escalas, síntese, tese, diligência (v0.3)
│   ├── viabilidade.md      # método residual, premissas e limites (v0.3)
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
| Rotinas | treze rotinas (seção 7) | `rotinas` + `export const rotinas` |
| IA | análises (seção 9): quatro slots custom com base `poder` (território, mercado, tela, área) e um slot opcional de extração com base `barato` | `ia.slots` |
| Config da app | parâmetros declarativos (seção 4.3); aba Rotinas nativa | `parametros` |
| Eventos | erros de operação (incluindo `parser_degradado`), evento de lacuna e o evento interno de continuação (seção 13) | `eventos`, `erros` |
| Arquivos | CSV de importação, shards dos dados públicos, KML/KMZ importado | colunas `arquivo` |
| Permissões | níveis + papéis `curador` e `operador` | `roles` |

Não usa: Segregação por conta (um território não é um tenant), Módulos (D-06), Páginas públicas
(D-02), Webhooks de entrada, Wiki, Email, Slack direto (a notificação por Slack, se vier, é
destino de Remessa configurado pelo admin, sem código).

O funil de prospecção de âncoras (quem foi contatado, status, próxima ação) **não** entra: é
trabalho de CRM e continua no CRM da equipe (D-45). A app produz a ficha que o funil usa.

**Dependências de terceiros no bundle (D-48).** A app não depende de biblioteca H3 em tempo de
execução. O pipeline publica cada célula com centroide, vizinhos e pai r8; a app decide a que
célula um ponto pertence pelo centroide mais próximo entre as células da caixa, que na grade
hexagonal coincide com a célula que contém o ponto. Se o kit aceitar a biblioteca no bundle
`[CONFIRMAR SDK P-18]`, a função exata substitui a aproximação sem mudar schema.

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

A primeira candidata a segunda cidade é Campinas/RMC, porque a equipe já analisa áreas lá
`[PENDENTE P-09]`. Grade, Censo, CNEFE, AOP (Campinas está entre as cidades do Ipea), CNPJ e
anúncios funcionam lá desde o primeiro dia; IVV e FipeZap dependem de quem publica para a praça.

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
    { "titulo": "Início", "rota": "/inicio", "icone": "fa-solid fa-house" },
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
    {
      "titulo": "Estudos de área", "icone": "fa-solid fa-draw-polygon",
      "itens": [
        { "titulo": "Áreas", "rota": "/estudos" },
        { "titulo": "Portfólio", "rota": "/estudos/portfolio" },
        { "titulo": "Comparar áreas", "rota": "/estudos/comparar" }
      ]
    },
    {
      "titulo": "Produto", "icone": "fa-solid fa-building",
      "itens": [
        { "titulo": "Demanda e capacidade", "rota": "/produto" },
        { "titulo": "Matriz de produto", "rota": "/produto/matriz" },
        { "titulo": "Benchmark de lançamentos", "rota": "/produto/benchmark" }
      ]
    },
    {
      "titulo": "Comércio e âncoras", "icone": "fa-solid fa-store",
      "itens": [
        { "titulo": "Potencial e lacunas", "rota": "/comercio" },
        { "titulo": "Simular âncora", "rota": "/comercio/simular" },
        { "titulo": "Áreas gêmeas", "rota": "/comercio/gemeas" },
        { "titulo": "Lentes de aptidão", "rota": "/comercio/lentes" }
      ]
    },
    {
      "titulo": "Terra e oferta futura", "icone": "fa-solid fa-mountain-sun",
      "itens": [
        { "titulo": "Licitações Terracap", "rota": "/terra" },
        { "titulo": "Mercado de lotes", "rota": "/terra/lotes" },
        { "titulo": "Viabilidade expedita", "rota": "/terra/viabilidade" },
        { "titulo": "Pipeline de oferta", "rota": "/terra/pipeline" }
      ]
    },
    { "titulo": "Análises", "rota": "/analises", "icone": "fa-solid fa-wand-magic-sparkles" },
    {
      "titulo": "Cadastro", "icone": "fa-solid fa-pen-ruler",
      "itens": [
        { "titulo": "Anúncios", "rota": "/cadastro/anuncios" },
        { "titulo": "Lançamentos", "rota": "/cadastro/lancamentos" },
        { "titulo": "Empreendimentos", "rota": "/cadastro/empreendimentos" },
        { "titulo": "Âncoras", "rota": "/cadastro/ancoras" },
        { "titulo": "Contornos", "rota": "/cadastro/contornos" },
        { "titulo": "Localidades", "rota": "/cadastro/localidades" },
        { "titulo": "Lotes Terracap", "rota": "/cadastro/terracap" },
        { "titulo": "Licenciamento de obras", "rota": "/cadastro/licenciamento" },
        { "titulo": "Faixas de programa", "rota": "/cadastro/faixas-programa" }
      ]
    },
    {
      "titulo": "Operação", "icone": "fa-solid fa-gears",
      "itens": [
        { "titulo": "Candidatos", "rota": "/operacao/candidatos" },
        { "titulo": "Agrupamentos e vínculos", "rota": "/operacao/agrupamentos" },
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
    "agrupar_anuncios":       { "titulo": "Agrupar anúncios do mesmo imóvel", "descricao": "Sugere grupos de anúncios repetidos entre portais e anunciantes para o curador confirmar", "frequencia": "diaria" },
    "verificar_lancamentos":  { "titulo": "Verificar páginas de lançamentos", "descricao": "Lê a página de cada lançamento, atualiza o que encontrar e registra lacunas", "frequencia": "semanal" },
    "vincular_empreendimentos": { "titulo": "Vincular empreendimentos", "descricao": "Sugere vínculos entre lançamentos, anúncios de unidade nova, alvarás, habite-se e lotes Terracap", "frequencia": "semanal" },
    "fechar_mes":             { "titulo": "Fechar o mês dos anúncios", "descricao": "Grava o retrato do mês anterior, recalcula as métricas mensais e o índice estratificado", "frequencia": "mensal" },
    "carregar_dados_publicos":{ "titulo": "Carregar dados públicos do pipeline", "descricao": "Lê o manifest publicado e carrega os arquivos e as tabelas que mudaram de hash", "frequencia": "mensal" },
    "carregar_series_macro":  { "titulo": "Carregar séries macro e de crédito", "descricao": "Lê as séries públicas configuradas (juros, crédito, inflação, custo de obra) e grava o mês", "frequencia": "mensal" },
    "calcular_achados":       { "titulo": "Calcular achados de mercado", "descricao": "Detecta variações, mudanças incomuns, contribuidores e lacunas por recorte, antes das análises", "frequencia": "mensal" },
    "gerar_analises_mensais": { "titulo": "Gerar análises mensais por IA", "descricao": "Escreve a análise do mês para o DF, para cada localidade com dado suficiente e para as áreas de estudo ativas", "frequencia": "mensal" },
    "recalcular_derivados":   { "titulo": "Recalcular derivados", "descricao": "Preenche e recalcula o que depende de método ou de dado novo: célula, preço inicial, grupos, índice, achados", "frequencia": "mensal" },
    "verificar_frescor":      { "titulo": "Verificar frescor das fontes", "descricao": "Compara a última carga de cada fonte com o frescor esperado e abre achado quando atrasa", "frequencia": "diaria" },
    "limpar_retencao":        { "titulo": "Limpar dados vencidos", "descricao": "Apaga cache expirado, telemetria e conteúdo bruto de candidatos rejeitados além da retenção", "frequencia": "semanal" }
  },

  "ia": {
    "slots": {
      "analise_territorio": { "titulo": "Análise de território", "base": "poder", "descricao": "Leitura analítica de uma localidade: oferta, preço, perfil e território, sobre o histórico inteiro" },
      "analise_mercado":    { "titulo": "Análise de mercado", "base": "poder", "descricao": "Leitura analítica do mercado da cidade no mês, sobre IVV, FipeZap, oferta e contexto macro" },
      "analise_tela":       { "titulo": "Análise do recorte em tela", "base": "poder", "descricao": "Leitura do recorte que o usuário está vendo (filtros do mapa ou do mercado)" },
      "analise_area":       { "titulo": "Análise de área de estudo", "base": "poder", "descricao": "Leitura de uma área desenhada: demanda, oferta, terra, comércio, hipóteses de produto e de âncora, sobre os achados calculados" },
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
- A ordem do `nav` põe as telas de decisão (Início, Estudos de área, Produto, Comércio e âncoras,
  Terra e oferta futura) logo depois das telas de leitura, e o Cadastro e a Operação no fim.
- A ordem das rotinas mensais importa e é configurada pelo admin na aba Rotinas: `fechar_mes`
  (dia 1) → `carregar_series_macro` → `calcular_achados` → `gerar_analises_mensais`
  `[PENDENTE P-05]`.

### 4.2 Exports do `backend/rotas.ts`

| Export | Conteúdo |
|---|---|
| `rotas` | Router autenticado, montado em `/api/inteligencia_imobiliaria/` (seção 6) |
| `rotinas` | Handlers das treze rotinas (seção 7) |
| `aoIniciar` | Semente idempotente: a cidade `distrito_federal` e as 35 localidades do tipo `ra` com códigos oficiais, **sem** geometria nem perfil (os dois vêm por importação). `faixas_programa` nasce vazia de propósito: valores de portaria não entram por semente, e a tela de Produto pede o cadastro. Guarda o `ctx` para uso das rotinas de fatiamento |
| `aoEncerrar` | Cancela qualquer lote de coleta em voo (sinaliza `AbortController`) |
| `reagir` | Um único listener: `continuar_coleta`, que retoma a rotina indicada pelo cursor (seção 7) |

Não exporta `rotasPublicas`, `rotasPessoais`, `webhooks` nem `disparadores`. A v0.1 dizia que
`reagir` também não era exportado, mas a seção 7 já dependia dele para a continuação das
rotinas fatiadas; a v0.2 corrige (D-47).

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
| `raios_padrao_m` | string | `1000,3000,5000` | Anéis padrão de áreas de estudo, fichas e simulações (D-23) |
| `hex_zoom_min` | numero | `12` | Zoom a partir do qual a camada hexagonal desenha células r9; abaixo, o pai r8 |
| `hex_max_celulas_resposta` | numero | `6000` | Teto de células por resposta da camada; acima, a rota agrega em r8 |
| `agrupar_tolerancia_area_frac` | numero | `0.02` | Diferença máxima de área para sugerir que dois anúncios são o mesmo imóvel (D-26) |
| `agrupar_tolerancia_preco_frac` | numero | `0.05` | Diferença máxima de preço para a mesma sugestão |
| `agrupar_distancia_max_m` | numero | `150` | Distância máxima quando os dois têm coordenada exata |
| `agrupar_confianca_auto` | numero | `0.90` | Acima disso, o grupo sugerido já conta como um imóvel nas métricas até o curador decidir |
| `indice_ano_base` | numero | (primeiro ano civil completo de anúncios) | Ano cujos pesos o índice estratificado fixa (D-40) `[PENDENTE P-23]` |
| `indice_n_minimo_estrato` | numero | `5` | Estrato com menos anúncios entra com o valor do mês anterior e é marcado |
| `saude_parser_janela_execucoes` | numero | `7` | Execuções que formam a linha de base da saúde do parser (D-27) |
| `queda_itens_max_frac` | numero | `0.30` | Queda de itens lidos contra a linha de base que marca a fonte como degradada |
| `aumento_nulos_max_frac` | numero | `0.20` | Aumento absoluto da taxa de nulos de um campo que marca a fonte como degradada |
| `pdad_cv_alerta_frac` | numero | `0.15` | Coeficiente de variação acima do qual o número da PDAD vem com aviso de cautela (D-29) `[PENDENTE P-29]` |
| `comprometimento_renda_frac` | numero | `0.30` | Parcela máxima da renda domiciliar na capacidade de pagamento (D-44) |
| `prazo_financiamento_meses` | numero | `360` | Prazo da simulação de financiamento |
| `entrada_frac` | numero | `0.20` | Entrada da simulação |
| `taxa_juros_aa_frac_override` | string | (vazio) | Taxa anual fixa; vazio = taxa da faixa de programa ou a última série `taxa_financiamento` |
| `faixas_preco_brl` | string | `300000,500000,800000,1200000,2000000` | Cortes das colunas da matriz de produto |
| `huff_expoente_distancia` | numero | `2` | Expoente de distância do modelo de Huff (D-43) `[PENDENTE P-27]` |
| `huff_raio_max_m` | numero | `10000` | Distância além da qual a célula de demanda não entra na simulação |
| `lacuna_comercial_razao_min` | numero | `1.5` | Gasto potencial por estabelecimento contra a mediana da cidade que vira achado de lacuna |
| `similaridade_max_resultados` | numero | `10` | Resultados das áreas gêmeas |
| `achados_max_por_recorte` | numero | `12` | Achados entregues por recorte à tela e à IA (D-21) |
| `achado_janela_meses` | numero | `24` | Janela histórica da regra de mudança incomum |
| `series_macro_config` | texto_longo | (vazio) | JSON com as séries a carregar: `[{ codigo, fonte, papel, escala }]` (D-31) `[PENDENTE P-24]` |
| `instrucoes_analise_area` | texto_longo | texto da seção 9.3 | Instruções de sistema da análise de área |
| `poligono_max_km2` | numero | `200` | Maior área aceita em recorte, área de estudo e enriquecimento (seção 21) |
| `poligono_max_vertices` | numero | `500` | Vértices máximos de um polígono |
| `raio_max_m` | numero | `20000` | Maior raio aceito |
| `cache_ttl_dias` | numero | `30` | Validade máxima de um cálculo em cache, mesmo sem mudança de versão (D-69) |
| `uso_retencao_dias` | numero | `180` | Retenção da telemetria de uso (D-72) |
| `bruto_rejeitados_retencao_dias` | numero | `90` | Retenção do conteúdo bruto de candidatos rejeitados (D-74) |
| `area_liquida_min_ha` | numero | `5` | Abaixo disso a área líquida não é estimada pela grade, porque o erro da célula domina (R-28) |
| `app_largura_padrao_m` | numero | `30` | Faixa de APP assumida para curso d'água sem largura conhecida, como premissa declarada (D-61) `[PENDENTE P-32]` |
| `declividade_restritiva_frac` | numero | `0.30` | Declividade a partir da qual a célula conta como restrita na área líquida |
| `faixas_area_lote_m2` | string | `250,450,800,1500,5000` | Cortes das faixas de área do mercado de lotes (D-64) |
| `viab_eficiencia_privativa_frac` | numero | `0.70` | Área privativa ÷ área computável, ponto de partida (D-63) `[PENDENTE P-35]` |
| `viab_fator_custo_sobre_cub` | numero | `1.35` | Multiplicador do CUB para chegar ao custo de obra total `[PENDENTE P-35]` |
| `viab_despesas_comerciais_frac` | numero | `0.06` | Corretagem e marketing sobre o VGV `[PENDENTE P-35]` |
| `viab_impostos_frac` | numero | `0.04` | Tributos sobre a receita (referência: RET da incorporação) `[PENDENTE P-35]` |
| `viab_margem_alvo_frac` | numero | `0.15` | Margem do incorporador sobre o VGV `[PENDENTE P-35]` |
| `viab_aproveitamento_loteavel_frac` | numero | `0.55` | Área de lotes ÷ área líquida no método de loteamento `[PENDENTE P-35]` |

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

Acréscimos da v0.2:

```
cidades ── celulas ── celula_metricas                 localidades ── localidade_composicao

empreendimentos ─┬─ lancamentos          anuncio_grupos ── anuncios
                 ├─ anuncios             vinculo_sugestoes
                 ├─ licenciamento_obras
                 └─ terracap_lotes

areas_estudo ── area_estudo_fichas ── analises_ia     faixas_programa   lentes

pontos_comerciais   series_macro   achados_mercado   visoes_salvas   fonte_saude
```

E na v0.3:

```
areas_estudo ─┬─ area_perimetros        teses ── tese_condicoes
              ├─ area_sintese_itens     diligencias
              ├─ hipoteses_ancora       cenarios_viabilidade
              └─ area_eventos           observacoes_campo

equipamentos_publicos   cache_calculos   uso_eventos
```

Toda tabela de fato com coordenada ganha `h3_r9` (texto, indexado). Não é chave estrangeira para
`celulas`, de propósito: a célula pode chegar depois do anúncio, e o vínculo é resolvido na
leitura.

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
| `h3_r9` | texto(16) | não | calculado na escrita (seção 5.13) | nulo quando a coordenada é aproximada demais para a célula (`centroide_*`): esse anúncio entra nas métricas da localidade, não da célula |
| `grupo_id` | referencia → `anuncio_grupos`, `anular` | não | — | grupo do mesmo imóvel (D-26) |
| `empreendimento_id` | referencia → `empreendimentos`, `anular` | não | — | anúncio de unidade nova de um empreendimento (D-38) |
| `preco_inicial_brl` | decimal(14,2) | não | primeiro `preco_pedido_brl` observado | nunca reescrito; base da redução de preço (D-25) |

`unicos`: `(fonte_id, id_externo)` onde `id_externo` não nulo e `removido_em` nulo; `url_fonte`
onde `removido_em` nulo. `indices`: `(localidade_id, status)`, `(status, visto_em)`,
`(tipo_imovel, tipo_transacao)`, `(latitude, longitude)`, `(primeiro_visto_em)`, `(h3_r9)`,
`(grupo_id)`.
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

| Coluna | Tipo | Origem (`LISTINGS_HISTORY_MONTHLY.`) | Observação |
|---|---|---|---|
| `mes_referencia` | data (dia 1º), obrig. | `reference_month` | |
| `anuncio_id` | referencia → `anuncios`, `cascata`, obrig. | `listing_id` | |
| `status_fim_mes` | texto(20), obrig. | `status_at_month_end` | |
| `preco_pedido_brl`, `area_m2`, `preco_m2_brl` | decimal | `asking_price_brl`, `area_m2`, `asking_price_brl_m2` | |
| `quartos`, `suites`, `vagas` | inteiro | idem | |
| `tipo_imovel`, `tipo_transacao` | texto | idem | |
| `localidade_id` | referencia → `localidades`, `restringir` | `ra_geo_id` | |
| `latitude`, `longitude` | decimal(10,7) | idem | |
| `primeiro_visto_em`, `visto_em`, `preco_alterado_em` | datahora | idem | |
| `hash_conteudo` | texto(64) | `content_hash` | |
| `coleta_id` | referencia → `coletas`, `anular` | `capture_run_id` | |
| `capturado_em` | datahora, obrig. | `captured_at` | |
| `congelado` | booleano, obrig., padrão `false` | derivado | `true` depois do `fechar_mes`; linha congelada não é reescrita |

`unicos`: `(mes_referencia, anuncio_id)`. `indices`: `(mes_referencia, localidade_id)`.

#### `metricas_anuncios_mensais`

`acesso_externo: somente_leitura` · `id_legivel: "{mes_referencia} {faixa_area}"`

Sucede `LISTINGS_MONTHLY_METRICS`. Materializada pela rotina (seção 7.4), nunca editada.
`null` nas dimensões significa "todas".

| Coluna | Tipo | Origem (`LISTINGS_MONTHLY_METRICS.`) | Observação |
|---|---|---|---|
| `mes_referencia` | data, obrig. | `reference_month` | |
| `cidade_id` | referencia → `cidades`, obrig. | derivado | |
| `localidade_id` | referencia → `localidades`, `restringir` | `ra_geo_id` (`null` = cidade inteira) | |
| `tipo_imovel`, `tipo_transacao` | texto | `property_type`, `transaction_type` | |
| `quartos` | inteiro | `bedrooms` | |
| `faixa_area` | texto(12), obrig. | `area_band` (`0-49`, `50-79`, `80-119`, `120-179`, `180+`, `todas`) | |
| `ativos`, `novos`, `inativados` | inteiro, obrig. | `active_ads_count`, `new_ads_count`, `inactive_ads_count` | |
| `preco_mediano_brl`, `preco_medio_brl`, `preco_p25_brl`, `preco_p75_brl` | decimal(14,2) | `median_price`, `average_price`, `p25_price`, `p75_price` | |
| `preco_m2_mediano_brl`, `preco_m2_medio_brl` | decimal(12,2) | `median_price_m2`, `average_price_m2` | |
| `area_mediana_m2` | decimal(12,2) | `median_area_m2` | |
| `vagas_mediana` | decimal(5,2) | `median_parking_spaces` | |
| `variacao_preco_mom_frac`, `variacao_estoque_mom_frac` | decimal(8,5) | `price_change_mom_pct` ÷ 100, `inventory_change_mom_pct` ÷ 100 | |
| `fontes_qtd` | inteiro | `source_count` | |
| `qualidade_cobertura` | texto, `opcoes: ["boa", "fonte_unica", "so_historico_inativo", "amostra_pequena"]` | `coverage_quality` | |
| `amostra_n` | inteiro, obrig. | derivado | tamanho da amostra de preço; abaixo de 5 a tela mostra "amostra pequena" |
| `imoveis_n` | inteiro | derivado | imóveis distintos: grupo confirmado (ou sugerido acima de `agrupar_confianca_auto`) conta uma vez (D-26) |
| `com_reducao_preco_frac` | decimal(6,5) | derivado | ativos com `preco_pedido_brl` abaixo de `preco_inicial_brl` (D-25) |
| `reducao_mediana_frac` | decimal(8,5) | derivado | mediana de `1 − preco_pedido / preco_inicial` entre os que reduziram |
| `idade_estoque_mediana_dias` | inteiro | derivado | mediana de dias desde `primeiro_visto_em` entre os ativos no fim do mês |
| `dias_ate_sair_mediana` | inteiro | derivado | mediana de dias entre `primeiro_visto_em` e `inativo_em` dos que saíram no mês |
| `saidas_ate_30_dias_frac` | decimal(6,5) | derivado | fração dos que saíram no mês com até 30 dias de anúncio |
| `preco_m2_saida_mediano_brl` | decimal(12,2) | derivado | mediana do **último preço pedido** dos que saíram no mês; rótulo "último preço pedido antes de sair", nunca "venda" (D-50) |
| `calculado_em` | datahora, obrig. | `calculated_at` | |

`unicos`: `{ colunas: [mes_referencia, cidade_id, localidade_id, tipo_imovel, tipo_transacao, quartos, faixa_area], nulos_distintos: false }`.

#### `indice_oferta_mensal`

`acesso_externo: somente_leitura` · `id_legivel: "{mes_referencia} {tipo_transacao}"`

Índice de preço de oferta estratificado (D-40), no método do FipeZap: mediana do R$/m² por
estrato (localidade × quartos), agregada com **pesos fixos** do ano-base. Separa variação de
preço de mudança de composição da amostra. A tela sempre o mostra ao lado da mediana bruta.

| Coluna | Tipo | Observação |
|---|---|---|
| `mes_referencia` | data, obrig. | |
| `cidade_id` | referencia → `cidades`, obrig. | |
| `localidade_id` | referencia → `localidades`, `anular` | `null` = índice da cidade |
| `tipo_imovel`, `tipo_transacao` | texto | `tipo_imovel` nulo = todos |
| `indice` | decimal(12,6) | base 100 no ano-base |
| `variacao_mom_frac`, `variacao_12m_frac` | decimal(8,5) | |
| `mediana_bruta_brl_m2` | decimal(12,2) | para a comparação lado a lado |
| `estratos_total`, `estratos_imputados` | inteiro | imputado = estrato abaixo de `indice_n_minimo_estrato`, que repete o mês anterior |
| `ano_base`, `pesos` | inteiro, json | os pesos usados, para auditoria |
| `calculado_em` | datahora, obrig. | |

Peso do estrato = domicílios do Censo 2022 da localidade × fração de anúncios com aquele número
de quartos no ano-base `[PENDENTE P-23]`. Mudar o ano-base recalcula a série inteira.

#### `anuncio_grupos`

`acesso_externo: restrito` · `id_legivel: "{rotulo}"`

O mesmo imóvel anunciado em mais de um portal ou por mais de um anunciante (D-26). A app
**nunca** funde nem apaga anúncio: o grupo só diz que eles são um.

| Coluna | Tipo | Observação |
|---|---|---|
| `rotulo` | texto(200), obrig. | gerado do anúncio de referência |
| `status` | texto, `opcoes: ["sugerido", "confirmado", "descartado"]`, obrig. | |
| `anuncio_referencia_id` | referencia → `anuncios`, `anular` | o mais completo do grupo; é o que entra nas medianas |
| `criterio` | json | regra e tolerâncias que casaram |
| `confianca` | decimal(6,5) | 1 − (Δárea/tolerância + Δpreço/tolerância + Δdistância/limite) ÷ 3, limitado a [0, 1] |
| `confirmado_por_id` | referencia → `shell.usuarios`, `anular` | |
| `confirmado_em` | datahora | |

Regra de sugestão: mesma localidade, mesmo `tipo_imovel` e `tipo_transacao`, mesmos quartos, área
dentro de `agrupar_tolerancia_area_frac`, preço dentro de `agrupar_tolerancia_preco_frac`,
distância até `agrupar_distancia_max_m` quando os dois têm coordenada exata, e fonte **ou**
anunciante diferente.

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
| `tipo` | texto, `opcoes: ["verificacao_anuncios", "descoberta_anuncios", "verificacao_lancamentos", "fechamento_mes", "dados_publicos", "analises_ia", "importacao", "agrupamento_anuncios", "vinculo_empreendimentos", "series_macro", "achados", "recalculo", "frescor", "retencao"]` | sim | derivado |
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

#### `fonte_saude`

`acesso_externo: somente_leitura`. Uma linha por fonte e por execução de coleta (D-27).

| Coluna | Tipo | Observação |
|---|---|---|
| `fonte_id` | referencia → `fontes_portal`, `cascata`, obrig. | |
| `coleta_id` | referencia → `coletas`, `cascata`, obrig. | |
| `itens_lidos` | inteiro, obrig. | páginas reconhecidas como `ativa` |
| `nulos_por_campo` | json | campo → fração de itens sem o campo (preço, área, quartos, coordenada, …) |
| `linha_base` | json | mediana das últimas `saude_parser_janela_execucoes` |
| `queda_itens_frac` | decimal(6,5) | contra a linha de base |
| `campos_degradados` | json (lista) | campos cuja taxa de nulos subiu mais que `aumento_nulos_max_frac` |
| `estado` | texto, `opcoes: ["ok", "degradado", "sem_base"]`, obrig. | |

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
| `h3_r9` | texto(16) | não | calculado na escrita | só com coordenada utilizável |
| `empreendimento_id` | referencia → `empreendimentos`, `anular` | não | — | D-38 |
| `unidades_estoque` | inteiro | não | cadastro ou fonte | unidades ainda à venda (D-32) |
| `unidades_prontas_estoque` | inteiro | não | cadastro ou fonte | das quais já prontas; base do "estoque pronto" |

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
| `h3_r9` | texto(16) | não | calculado na escrita |
| `categoria_consumo` | texto(60) | não | chave do catálogo de categorias (seção 5.18); liga a âncora ao modelo de Huff e às lacunas |
| `atratividade` | decimal(12,2) | não | área de vendas em m² ou outro porte declarado; vazio = `area_ocupada_m2` |

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
| `erro_padrao` | decimal(14,4) | quando o IPEDF publica (D-29) |
| `cv_frac` | decimal(6,5) | coeficiente de variação; acima de `pdad_cv_alerta_frac` a tela avisa cautela |
| `integracao_geografica` | texto, `opcoes: ["nominal", "padronizada"]` | `padronizada` quando a linha foi recalculada por `localidade_composicao` (D-36) |

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
| `tipo` | texto, `opcoes: ["territorio", "mercado", "tela", "area"]`, obrig. | slot usado |
| `cidade_id` | referencia → `cidades`, obrig. | |
| `localidade_id` | referencia → `localidades`, `anular` | `territorio` |
| `area_estudo_id` | referencia → `areas_estudo`, `anular` | `area` |
| `achados_usados` | json | ids de `achados_mercado` entregues ao modelo (D-21) |
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
| `agrega_celula_metricas` | soma de `valor` e de `peso` por métrica para uma lista de células e um ano; é o motor do enriquecimento (D-37). Se a allowlist não aceitar parâmetro de lista `[CONFIRMAR SDK P-16]`, a rota lê `celula_metricas` por lotes de 500 células com `req.dados` e soma em código, com o mesmo resultado |
| `contagem_por_celula` | contagem por `h3_r9` de anúncios (por imóvel), lançamentos, âncoras, pontos comerciais e licenças, para a camada hexagonal |
| `mediana_terracap_por_localidade` | mediana por posição do R$/m² arrematado (terreno e potencial) e do ágio por localidade e ano, só lotes vendidos |
| `pipeline_oferta_localidade` | unidades licenciadas sem habite-se e lançamentos em obra sem alvará vinculado, por localidade, sem dupla contagem |

Percentil fino (P10, P90) e qualquer estatística fora disso são calculados **em código** sobre
as linhas filtradas, no backend, nunca no frontend com dado parcial.

### 5.13 Grade analítica (D-34, D-35, D-36, D-48)

A unidade analítica comum é a célula **H3 de resolução 9** (cerca de 0,1 km², lado de cerca de
174 m), a mesma do Projeto Acesso a Oportunidades do Ipea, que o pipeline já lê (`jobs_hex`). A
Grade Estatística do IBGE de 200 m, que o pipeline também já lê (`households_grid`), entra na
célula pelo centroide. O pipeline produz as células e as métricas; a app guarda, soma e pondera.
Ordem de grandeza no DF: cerca de 55 mil células, das quais algo como 20 mil habitadas.

**Pertencimento de ponto a célula (D-48).** Na escrita de anúncio, lançamento, âncora, lote,
licença ou ponto comercial com coordenada utilizável, `comum/celulas.ts` busca as células cuja
caixa contém o ponto (filtro por `centroide_latitude`/`centroide_longitude` com folga de uma
célula) e escolhe a de centroide mais próximo. Na grade hexagonal isso coincide com a célula que
contém o ponto; a diferença só aparece na distorção de projeção do H3, em metros. Coordenada
aproximada por jitter (`centroide_*`) **não** recebe célula: o ponto não está lá.

**Área → células.** Raio: células cujo centroide está a até `r` metros (haversine). Polígono:
células cujo centroide passa no ponto-em-polígono de `comum/geo.ts`. A resposta sempre diz
quantas células entraram e a fração da área que elas cobrem (`area das células ÷ área pedida`).

#### `celulas`

`acesso_externo: somente_leitura` · `id_legivel: "{h3}"`

| Coluna | Tipo | Obrig. | Origem (pipeline `celulas_r9`) | Observação |
|---|---|---|---|---|
| `h3` | texto(16), único | sim | `h3_index` | |
| `h3_pai_r8` | texto(16) | sim | `h3_parent_r8` | agregação da camada em zoom baixo |
| `cidade_id` | referencia → `cidades`, `restringir` | sim | derivado | |
| `localidade_id` | referencia → `localidades`, `anular` | não | `ra_geo_id` | localidade vigente que contém o centroide |
| `centroide_latitude`, `centroide_longitude` | decimal(10,7) | sim | | base do pertencimento e dos raios |
| `geometria` | json | sim | | hexágono GeoJSON, para desenhar |
| `vizinhos` | json (lista de `h3`) | sim | | anel 1; base do Gi* |
| `area_km2` | decimal(10,6) | sim | | |
| `fracao_na_cidade` | decimal(6,5) | sim | | célula de borda da cidade |
| `habitada` | booleano | sim | | tem domicílio no CNEFE ou na Grade |
| `versao_conjunto` | data | sim | | |

`indices`: `(cidade_id, localidade_id)`, `(centroide_latitude, centroide_longitude)`, `(h3_pai_r8)`.

#### `celula_metricas`

`acesso_externo: somente_leitura`. Formato longo, como `agregados_territoriais`.

| Coluna | Tipo |
|---|---|
| `celula_id` | referencia → `celulas`, `cascata`, obrig. |
| `conjunto_codigo` | texto(60), obrig. (`ibge_grade`, `cnefe_2022`, `aop_ipea`, `censo_2022_setores`, `pdot_zoneamento`, `comercio_cnpj`, `potencial_consumo`, `mapbiomas_urbano`, `open_buildings`, …) |
| `ano` | inteiro, obrig. |
| `metrica` | texto(80), obrig. (chave do catálogo) |
| `valor` | decimal(18,6) (nulo = suprimido ou ausente, nunca zero) |
| `peso` | decimal(18,6) (denominador da razão ou peso da média; nulo em contagem) |
| `qualidade` | texto(80) |
| `versao_conjunto` | data, obrig. |

`unicos`: `(celula_id, conjunto_codigo, ano, metrica)`. `indices`: `(conjunto_codigo, metrica, ano)`.
Volume esperado de 0,6 a 1,2 milhão de linhas no DF; carga fatiada por conjunto
`[CONFIRMAR SDK P-21]`.

#### Catálogo de métricas (`comum/metricas.ts`, código)

Sucede e amplia o `comum/indicadores.ts` (D-22, D-35). Cada métrica declara:

| Campo | Valores | Para quê |
|---|---|---|
| `chave`, `titulo`, `unidade`, `fonte`, `formula` | | rótulo e procedência |
| `natureza` | `contagem`, `razao`, `media`, `amostra`, `indice`, `categorica`, `nao_agregavel` | como se agrega; `amostra` = estatística recalculada sobre os **pontos** dentro da área (mediana, percentil), nunca agregada de células (D-67) |
| `numerador`, `denominador` | chaves de métrica | razão é sempre recalculada de numerador e denominador somados; nunca média de razões |
| `peso_rateio` | `domicilios`, `populacao`, `estabelecimentos`, `area`, `nenhum` | como a métrica se reparte quando a área corta a unidade da fonte |
| `unidade_nativa` | `celula`, `setor`, `localidade`, `ponto` | o que o rateio precisa saber |
| `sentido` | `alta_favoravel`, `alta_desfavoravel`, `neutro` | leitura do achado (D-21) |
| `similaridade` | booleano | entra no vetor das áreas gêmeas |
| `escala_cor` | `sequencial`, `divergente` | classes do mapa |

Regras: contagem soma; razão recalculada; média ponderada pelo peso; índice e `nao_agregavel`
recusam com motivo escrito ("este indicador não se soma entre áreas"). Dado por **localidade**
(PDAD) entra numa área desenhada rateado pelo `peso_rateio` das células, e a ficha diz isso.

**Catálogo inicial (v0.3).** O ponto de partida do `comum/metricas.ts`. Chave com `<cat>` se
repete por categoria de consumo; com `<ano>`, por ano publicado.

| Chave | Título | Natureza | Rateio | Sentido | Fonte | Nativa |
|---|---|---|---|---|---|---|
| `domicilios_2022`, `domicilios_2010` | Domicílios ocupados | contagem | — | neutro | IBGE Grade | célula |
| `populacao_2022`, `populacao_2010` | População | contagem | — | neutro | IBGE Grade | célula |
| `crescimento_domicilios_frac` | Crescimento de domicílios 2010–2022 | razão (Δ ÷ 2010) | — | alta_favoravel | IBGE Grade | célula |
| `formacao_domiciliar_anual` | Domicílios novos por ano, 2010–2022 | contagem (Δ ÷ 12) | — | alta_favoravel | IBGE Grade | célula |
| `densidade_domicilios_km2` | Domicílios por km² | razão | — | neutro | IBGE Grade | célula |
| `enderecos_nao_residenciais` | Endereços não residenciais | contagem | — | neutro | CNEFE 2022 | célula |
| `renda_domiciliar_media_brl` | Renda domiciliar média | média | domicílios | alta_favoravel | PDAD | localidade |
| `domicilios_faixa_renda_<k>_frac` | Domicílios por faixa de renda | média | domicílios | neutro | PDAD | localidade |
| `moradores_por_domicilio` | Moradores por domicílio | média | domicílios | neutro | PDAD | localidade |
| `domicilios_alugados_frac` | Domicílios alugados | média | domicílios | neutro | PDAD | localidade |
| `coabitacao_frac` | Coabitação | média | domicílios | alta_favoravel (demanda) | PDAD | localidade |
| `empregos_total` | Empregos formais | contagem | — | alta_favoravel | AOP/RAIS | célula |
| `empregos_por_1000_hab` | Empregos por mil habitantes | razão | — | alta_favoravel | AOP + Grade | célula |
| `acesso_empregos_tp_60min_frac` | Empregos alcançáveis em 60 min de transporte público | média | população | alta_favoravel | AOP | célula |
| `acesso_empregos_carro_30min_frac` | Empregos alcançáveis em 30 min de carro | média | população | alta_favoravel | AOP | célula |
| `tempo_saude_min`, `tempo_escola_min` | Tempo até o equipamento mais próximo | média | população | alta_desfavoravel | AOP | célula |
| `imoveis_ativos_venda`, `imoveis_ativos_locacao` | Imóveis anunciados (por imóvel) | contagem | — | neutro | app | ponto |
| `preco_m2_mediano_venda`, `preco_m2_mediano_locacao` | R$/m² pedido mediano | amostra | — | neutro | app | ponto |
| `preco_m2_lote_mediano` | R$/m² pedido de lote | amostra | — | neutro | app | ponto |
| `dias_ate_sair_mediana` | Dias até sair do anúncio | amostra | — | alta_desfavoravel | app | ponto |
| `com_reducao_preco_frac` | Anúncios com redução de preço | amostra | — | alta_desfavoravel | app | ponto |
| `lancamentos_estoque_unidades` | Unidades em estoque de lançamentos | contagem | — | neutro | app | ponto |
| `pipeline_unidades` | Unidades no pipeline de oferta | contagem | — | alta_desfavoravel (pressão) | app | ponto |
| `terracap_preco_m2_terreno` | R$/m² arrematado de terreno | amostra | — | neutro | Terracap | ponto |
| `terracap_preco_m2_potencial` | R$/m² arrematado de potencial | amostra | — | neutro | Terracap | ponto |
| `terracap_agio_frac` | Ágio sobre o mínimo | amostra | — | neutro | Terracap | ponto |
| `estabelecimentos_<cat>` | Estabelecimentos da categoria | contagem | — | neutro | CNPJ, OSM | célula |
| `gasto_potencial_<cat>_brl_ano` | Gasto potencial anual da categoria | contagem | — | alta_favoravel | POF × Grade | célula |
| `gasto_por_estabelecimento_<cat>` | Gasto potencial por estabelecimento | razão | — | alta_favoravel (lacuna) | derivado | célula |
| `equipamentos_<tipo>` | Escolas, unidades de saúde, … | contagem | — | alta_favoravel | INEP, CNES, OSM | ponto |
| `area_urbanizada_frac_<ano>` | Fração urbanizada | razão | — | neutro | MapBiomas | célula |
| `edificacoes_n_<ano>` | Edificações | contagem | — | neutro | Open Buildings | célula |
| `novas_edificacoes_2016_2023` | Edificações novas | contagem | — | neutro | Open Buildings | célula |
| `altura_media_edificacoes_m` | Altura média das edificações | média | edificações | neutro | Open Buildings | célula |
| `frac_restrita_total` | Fração restrita (APP, UC, declividade) | razão | — | alta_desfavoravel | pipeline (seção 5.21) | célula |
| `zona_pdot` | Zona do PDOT | categórica | área | — | IPEDF | polígono |

Métrica `categorica` numa área devolve a distribuição por área (ex.: 70% Zona Urbana Consolidada,
30% Zona de Contenção), nunca um valor único.

#### `localidade_composicao` (D-36)

`acesso_externo: somente_leitura`. Pesos que levam uma localidade antiga aos limites vigentes,
no modelo dos crosswalks do NHGIS.

| Coluna | Tipo |
|---|---|
| `origem_id` | referencia → `localidades`, `restringir`, obrig. (ex.: Planaltina como era em 2021) |
| `destino_id` | referencia → `localidades`, `restringir`, obrig. (Planaltina vigente; Arapoanga) |
| `vigente_de`, `vigente_ate` | data |
| `base_peso` | texto, `opcoes: ["domicilios", "populacao", "area"]`, obrig. |
| `peso` | decimal(8,6), obrig. (fração da origem que pertence ao destino) |
| `fonte`, `metodo` | texto |

`unicos`: `(origem_id, destino_id, base_peso, vigente_de)`. Validação: soma dos pesos por origem e
base em [0,98; 1,02], senão achado `COMPOSICAO_INCOMPLETA`. Série padronizada = Σ valor da origem
× peso, **só** para contagens; razões são recalculadas de numerador e denominador padronizados.
Médias e frações da PDAD não são padronizadas: a tela mostra a série nominal com a quebra
marcada no ano em que o limite mudou.

### 5.14 Empreendimentos e vínculos (D-38)

#### `empreendimentos`

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "{nome}"`

O hub que diz que lançamento, anúncios de unidade nova, alvará, habite-se e lote Terracap são o
mesmo empreendimento em estágios diferentes.

| Coluna | Tipo | Observação |
|---|---|---|
| `nome` | texto(200), obrig. | |
| `cidade_id` | referencia → `cidades`, obrig. | |
| `localidade_id` | referencia → `localidades`, `anular` | |
| `latitude`, `longitude`, `h3_r9` | decimal / texto | |
| `incorporadora` | texto(200) | |
| `estagio` | texto, `opcoes: ["terreno", "licenciado", "lancado", "em_obra", "concluido"]` | derivado do vínculo mais avançado; manual vence |
| `unidades_total`, `area_construida_m2` | inteiro / decimal | |
| `notas` | texto_longo | |

Vínculos: `lancamentos.empreendimento_id`, `anuncios.empreendimento_id`,
`licenciamento_obras.empreendimento_id`, `terracap_lotes.empreendimento_id`.

#### `vinculo_sugestoes`

`acesso_externo: restrito`. O que a rotina `vincular_empreendimentos` propõe e o curador decide.

| Coluna | Tipo |
|---|---|
| `tabela_origem` | texto, `opcoes: ["lancamentos", "anuncios", "licenciamento_obras", "terracap_lotes"]`, obrig. |
| `registro_id` | inteiro, obrig. |
| `empreendimento_id` | referencia → `empreendimentos`, `anular` (nulo = propor um novo) |
| `criterio` | json (distância, nome normalizado, área, datas) |
| `confianca` | decimal(6,5) |
| `status` | texto, `opcoes: ["sugerido", "aceito", "rejeitado"]`, obrig. |
| `decidido_por_id`, `decidido_em` | referência, datahora |

### 5.15 Terra e oferta futura (D-39)

#### `terracap_lotes`

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "Edital {edital} item {item}"`

Cada item de licitação de imóvel da Terracap: o único preço de terra observado em transação no
DF. Entra por importação CSV; a leitura automática dos editais e do resultado no DODF é do
pipeline `[PENDENTE P-13]`.

| Coluna | Tipo | Obrig. | Observação |
|---|---|---|---|
| `edital` | texto(20) | sim | `18/2025` |
| `item` | inteiro | sim | |
| `modalidade` | texto, `opcoes: ["concorrencia", "leilao", "venda_direta"]` | sim | |
| `data_sessao` | data | não | |
| `endereco` | texto(300) | sim | como o edital escreve |
| `localidade_id` | referencia → `localidades`, `anular` | não | |
| `latitude`, `longitude`, `precisao_coordenada`, `h3_r9` | | não | |
| `area_terreno_m2` | decimal(12,2) | sim | |
| `area_construcao_m2` | decimal(12,2) | não | potencial declarado no edital |
| `destinacao` | texto(300) | não | uso do edital, verbatim |
| `preco_minimo_brl` | decimal(14,2) | sim | **nunca** é tratado como preço (D-50) |
| `valor_arrematado_brl` | decimal(14,2) | não | nulo = não vendido ou resultado ainda não publicado |
| `situacao` | texto, `opcoes: ["ofertado", "vendido", "deserto", "cancelado", "aguardando_resultado"]` | sim | |
| `propostas_n` | inteiro | não | |
| `fonte_edital_url`, `fonte_resultado_url` | texto(1000) | não | |
| `empreendimento_id` | referencia → `empreendimentos`, `anular` | não | |
| `extras` | json | não | |

`unicos`: `(edital, item)`. Derivados em código: `preco_m2_terreno` (arrematado ÷ área do
terreno), `preco_m2_potencial` (arrematado ÷ área de construção), `agio_frac` (arrematado ÷
mínimo − 1). Lote não vendido entra em "ofertado sem venda", nunca na mediana de arrematado.

#### `licenciamento_obras`

`acesso_externo: restrito` · `id_legivel: "{tipo_ato} {numero}"`

| Coluna | Tipo | Obrig. | Observação |
|---|---|---|---|
| `tipo_ato` | texto, `opcoes: ["alvara_construcao", "habite_se", "habite_se_regularizacao"]` | sim | |
| `numero`, `processo` | texto(80) | não | |
| `emitido_em` | data | sim | |
| `endereco` | texto(300) | não | |
| `localidade_id` | referencia → `localidades`, `anular` | não | |
| `latitude`, `longitude`, `precisao_coordenada`, `h3_r9` | | não | |
| `uso` | texto(80) | não | `residencial_unifamiliar`, `residencial_multifamiliar`, `comercial`, `misto` (vocabulário aberto) |
| `unidades` | inteiro | não | |
| `area_construida_m2` | decimal(12,2) | não | |
| `empreendimento_id` | referencia → `empreendimentos`, `anular` | não | |
| `fonte_url` | texto(1000) | não | |
| `extras` | json | não | |

`unicos`: `(tipo_ato, numero)` onde `numero` não é nulo. Entra por importação CSV até a fonte
automática ser confirmada `[PENDENTE P-12]`.

**Pipeline de oferta (derivado).** Unidades em obra = empreendimentos com alvará e sem habite-se
+ lançamentos `em_construcao` sem alvará vinculado (para não contar duas vezes). Meses de
absorção futura = unidades no pipeline ÷ média de vendas dos últimos 12 meses do IVV (cidade) ou
do IVV regional (localidade), quando houver.

### 5.16 Áreas de estudo (D-23)

#### `areas_estudo`

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "{nome}"`

| Coluna | Tipo | Obrig. | Observação |
|---|---|---|---|
| `nome` | texto(200) | sim | |
| `tipo` | texto, `opcoes: ["propria", "prospeccao", "referencia"]` | sim | `propria` = área da UP; só o `curador` cria ou muda para esse tipo |
| `cidade_id` | referencia → `cidades`, `restringir` | sim | |
| `geometria`, `geometria_tipo` | json, texto | sim | ponto ou polígono, como `contornos` |
| `bbox_oeste`, `bbox_sul`, `bbox_leste`, `bbox_norte` | decimal(10,7) | sim | |
| `centroide_latitude`, `centroide_longitude` | decimal(10,7) | sim | |
| `area_m2` | decimal(16,2) | não | polígono |
| `raios_m` | texto(60) | não | CSV; vazio = `raios_padrao_m` |
| `estagio` | texto, `opcoes: ["sinal", "hipotese", "oportunidade", "iniciativa", "projeto", "negocio_ativo", "encerrada"]` | sim | a escada de maturidade da UP (D-55); toda mudança grava `area_eventos` |
| `motivo_encerramento` | texto(300) | não | obrigatório quando `estagio = encerrada` |
| `aprendizado` | texto_longo | não | o que a área ensinou, mesmo sem virar projeto (doc. 02, §8) |
| `responsavel_id` | referencia → `shell.usuarios`, `anular` | não | |
| `localidade_id` | referencia → `localidades`, `anular` | não | dominante |
| `contorno_id` | referencia → `contornos`, `anular` | não | quando veio de KMZ já importado |
| `arquivo_origem` | arquivo (KML, KMZ, GeoJSON; 20 MB) | não | |
| `notas` | texto_longo | não | |

#### `area_estudo_fichas`

`acesso_externo: restrito` · `id_legivel: "{area_estudo_id} {gerada_em}"`

O dossiê congelado, para a ficha poder ir num pacote de aprovação e ser reproduzida depois.

| Coluna | Tipo | Observação |
|---|---|---|
| `area_estudo_id` | referencia → `areas_estudo`, `cascata`, obrig. | |
| `formato` | texto, `opcoes: ["uma_pagina", "detalhada"]`, obrig. | |
| `secoes` | json, obrig. | as escolhidas, na ordem escolhida |
| `conteudo` | json, obrig. | números, método e fonte por bloco |
| `versoes_conjuntos` | json, obrig. | código → versão e hash de cada conjunto usado |
| `markdown` | texto_longo, obrig. | a ficha pronta |
| `analise_ia_id` | referencia → `analises_ia`, `anular` | |
| `gerada_por_id`, `gerada_em` | referência, datahora | |

### 5.17 Demanda e produto (D-44)

#### `faixas_programa`

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "{programa} {faixa}"`

Faixas de programa habitacional e de crédito, editáveis pelo curador porque mudam por portaria.

| Coluna | Tipo |
|---|---|
| `programa` | texto(60), obrig. (`mcmv`, `sbpe`, …) |
| `faixa` | texto(40), obrig. |
| `renda_min_brl`, `renda_max_brl` | decimal(12,2) |
| `preco_max_imovel_brl` | decimal(14,2) |
| `taxa_juros_aa_frac` | decimal(8,5) |
| `subsidio_max_brl` | decimal(12,2) |
| `vigente_de`, `vigente_ate` | data |
| `fonte_url` | texto(1000) |

**Capacidade de pagamento** (`comum/produto/capacidade.ts`): parcela máxima = renda ×
`comprometimento_renda_frac`; valor financiável = valor presente da parcela à taxa e no prazo
(tabela Price; SAC como alternativa declarada); preço alcançável = financiável ÷
(1 − `entrada_frac`), limitado pelo teto da faixa quando a renda cai numa faixa de programa.
Taxa, nesta ordem: a da faixa; `taxa_juros_aa_frac_override`; a última série `series_macro` com
`papel = taxa_financiamento`. A renda vem da distribuição por faixa de renda domiciliar da PDAD
da localidade, rateada para a área quando a área é desenhada. A saída é a distribuição de
domicílios por faixa de preço alcançável, com a taxa usada e a origem dela.

**Matriz de produto** (`comum/produto/matriz.ts`): linhas por tipologia (quartos 1, 2, 3, 4+, e
orientação), colunas pelas faixas de `faixas_preco_brl`. Por célula da matriz: `demanda_frac`
(domicílios por faixa alcançável × distribuição de tamanho de domicílio convertida em quartos
por uma tabela declarada em código), `oferta_frac` (anúncios por imóvel + estoque de
lançamentos), `absorcao` (IVV regional quando houver; senão `dias_ate_sair_mediana`) e `lacuna`
= demanda − oferta. A tabela "moradores → quartos" é uma hipótese, e a tela diz isso.

Tabela inicial moradores → quartos (`comum/produto/tipologia.ts`, com `versao_metodo`), a
calibrar com o cruzamento de moradores por dormitórios da PDAD, por localidade `[PENDENTE P-36]`:

| Moradores | 1 quarto | 2 quartos | 3 quartos | 4 ou mais |
|---|---|---|---|---|
| 1 | 0,70 | 0,30 | — | — |
| 2 | 0,30 | 0,60 | 0,10 | — |
| 3 | — | 0,60 | 0,40 | — |
| 4 | — | 0,30 | 0,60 | 0,10 |
| 5 ou mais | — | — | 0,60 | 0,40 |

Cada linha soma 1. A matriz mostra a tabela usada no rodapé, e trocá-la muda a `versao_metodo`.

### 5.18 Comércio e âncoras (D-41, D-42, D-43)

#### Catálogo de categorias de consumo (`comum/comercio/categorias.ts`, código)

Cada categoria (supermercado, atacarejo, farmácia, padaria, academia, escola particular, clínica,
restaurante, pet, vestuário, serviços financeiros, …) declara: os CNAEs que a compõem, as
etiquetas do OSM, o grupo de despesa da POF/IBGE que alimenta o potencial de consumo, a
`categoria` de âncora correspondente e `huff` (se entra na simulação com pontos individuais)
`[PENDENTE P-25]`.

Categorias iniciais (os códigos CNAE são subclasses a conferir na CONCLA antes da carga):

| Chave | CNAE (subclasse) | Grupo de despesa (POF) | Categoria de âncora | Huff |
|---|---|---|---|---|
| `supermercado` | 4711-3/01, 4711-3/02 | alimentação no domicílio | `supermercado_atacarejo` | sim |
| `farmacia` | 4771-7/01, 4771-7/02, 4771-7/03 | assistência à saúde (remédios) | — | sim |
| `padaria` | 4721-1/02 | alimentação no domicílio | — | não |
| `academia` | 9313-1/00 | recreação e cultura | — | sim |
| `escola_particular` | 8512-1/00, 8513-9/00, 8520-1/00 | educação | `escola` | sim |
| `clinica` | 8630-5/02, 8630-5/03 | assistência à saúde | `saude` | sim |
| `restaurante` | 5611-2/01 | alimentação fora do domicílio | — | não |
| `pet` | 4789-0/04 | outras despesas correntes | — | não |
| `vestuario` | 4781-4/00 | vestuário | `shopping_center` | não |

Métricas por célula, em `celula_metricas` (conjuntos `comercio_cnpj`, `comercio_osm`,
`cnefe_2022`, `potencial_consumo`): `estabelecimentos_<categoria>`,
`gasto_potencial_<categoria>_brl_ano`, `estabelecimentos_nao_residenciais_cnefe`.

#### `pontos_comerciais`

`acesso_externo: somente_leitura`. Pontos individuais das categorias com `huff = true`,
carregados pelo pipeline.

| Coluna | Tipo |
|---|---|
| `fonte` | texto, `opcoes: ["cnpj", "osm", "cnefe"]`, obrig. |
| `id_fonte` | texto(40), obrig. |
| `categoria` | texto(60), obrig. |
| `nome` | texto(200) (nome fantasia quando a fonte publica) |
| `latitude`, `longitude` | decimal(10,7), obrig. |
| `precisao_coordenada` | texto, `opcoes: ["endereco", "cep", "osm_exata"]`, obrig. |
| `h3_r9` | texto(16) |
| `porte` | texto(40) |
| `situacao` | texto(20) |
| `aberto_em` | data |
| `versao_conjunto` | data, obrig. |

`unicos`: `(fonte, id_fonte)`. Ponto com `precisao_coordenada = cep` entra em contagem por
localidade, mas **não** em distância abaixo de 500 m nem em contagem por célula `[PENDENTE P-26]`.

#### `lentes`

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "{nome}"`

| Coluna | Tipo | Observação |
|---|---|---|
| `nome` | texto(120), obrig. | "Supermercado de vizinhança", "Residencial 2q faixa 3" |
| `segmento` | texto(60) | categoria de consumo ou produto habitacional |
| `escala` | texto, `opcoes: ["celula", "localidade"]`, obrig. | |
| `pesos` | json, obrig. | lista `{ metrica, peso, sentido, transformacao: "z" \| "percentil" }` |
| `filtros` | json | exclusões: zona regulatória, distância mínima de concorrente, habitada |
| `autor_id` | referencia → `shell.usuarios` | |
| `notas` | texto_longo | |

**Score de lente** (`comum/espacial/score.ts`): Σ peso × valor transformado, com o sinal do
sentido; a tela sempre mostra a decomposição por métrica.

**Modelo de Huff** (`comum/comercio/huff.ts`): participação da loja *j* na célula *i* =
(A_j ÷ d_ij^λ) ÷ Σ_k (A_k ÷ d_ik^λ), com demanda = gasto potencial da categoria na célula,
lojas = `pontos_comerciais` + `ancoras` da categoria + a âncora simulada, *d* = distância do
centroide da célula à loja com piso de 200 m, λ = `huff_expoente_distancia`, corte em
`huff_raio_max_m`. Saída: participação e gasto capturado por anel. É simulação com parâmetros
declarados, rotulada assim; não é previsão de vendas.

**Áreas gêmeas** (`comum/espacial/similaridade.ts`): vetor das métricas com `similaridade =
true`, padronizado (z) na cidade, distância euclidiana ponderada; referência = área de estudo,
localidade ou célula; resultado = os `similaridade_max_resultados` mais próximos, cada um com as
três métricas que mais aproximam e as três que mais afastam.

**Bolsões** (`comum/espacial/gi.ts`): Gi* sobre métricas de célula (R$/m² mediano das células
com ao menos 5 imóveis, gasto potencial, crescimento domiciliar), vizinhança = a célula e o anel
1; classes descritivas em |z| ≥ 1,96 e ≥ 2,58. Sem regressão, sem previsão.

### 5.19 Contexto, achados e acompanhamento (D-21, D-31, D-33)

#### `series_macro`

`acesso_externo: somente_leitura`.

| Coluna | Tipo |
|---|---|
| `codigo_serie` | texto(40), obrig. |
| `fonte` | texto(40), obrig. (`bcb_sgs`, …) |
| `titulo`, `unidade` | texto |
| `papel` | texto, `opcoes: ["taxa_financiamento", "selic", "inflacao", "credito_concessoes", "custo_construcao", "outro"]`, obrig. |
| `mes_referencia` | data, obrig. |
| `valor` | decimal(18,6) (percentual em fração decimal, convertido na carga com a escala declarada em `series_macro_config`; D-12) |
| `capturado_em` | datahora, obrig. |

`unicos`: `(codigo_serie, mes_referencia)`.

#### `achados_mercado`

`acesso_externo: somente_leitura` · `id_legivel: "{tipo} {metrica} {mes_referencia}"`

| Coluna | Tipo |
|---|---|
| `mes_referencia` | data, obrig. |
| `recorte_tipo` | texto, `opcoes: ["cidade", "localidade", "area_estudo", "celula"]`, obrig. |
| `recorte_id` | inteiro, obrig. |
| `tipo` | texto, `opcoes` da seção 9.7, obrig. |
| `metrica` | texto(80), obrig. |
| `valor`, `referencia`, `diferenca` | decimal(18,6) |
| `direcao` | texto, `opcoes: ["alta", "queda", "estavel", "destoa"]` |
| `sentido` | texto (do catálogo) |
| `pontuacao` | decimal(10,4), obrig. |
| `texto_curto` | texto(300), obrig. (frase determinística montada em código) |
| `indicadores` | json, obrig. (chaves, valores, fonte, período) |
| `calculado_em` | datahora, obrig. |

`unicos`: `(mes_referencia, recorte_tipo, recorte_id, tipo, metrica)`.

#### `visoes_salvas`

`acesso_externo: restrito` · `id_legivel: "{nome}"`

| Coluna | Tipo |
|---|---|
| `usuario_id` | referencia → `shell.usuarios`, `cascata`, obrig. |
| `nome` | texto(120), obrig. |
| `sub_rota` | texto(120), obrig. |
| `querystring` | texto(2000) |
| `fixada_inicio` | booleano, padrão `false` |

A rota só devolve e só altera as visões do próprio usuário. Salvar é `POST`, que o shell exige
`escrita`; usuário só com `leitura` não salva `[CONFIRMAR SDK P-22]`.

### 5.20 Método da oportunidade (D-55, D-57 a D-60, D-65)

Estas tabelas fazem do app o lugar onde a leitura da equipe fica registrada e ligada à
evidência. **Evidência** é sempre uma lista `{ tipo, ref, rotulo }`, onde `tipo` é `achado`,
`indicador` (chave do catálogo + recorte + período), `ficha`, `analise`, `observacao_campo`,
`documento` (URL externa) ou `nota`. Um item sem evidência é permitido, mas só como `hipotese`
ou `premissa`; `fato` exige evidência (D-57).

#### `area_perimetros` (D-59)

`acesso_externo: restrito`. Uma área pode ter vários perímetros; a geometria principal de
`areas_estudo` é o perímetro de análise.

| Coluna | Tipo |
|---|---|
| `area_estudo_id` | referencia → `areas_estudo`, `cascata`, obrig. |
| `papel` | texto, `opcoes: ["aquisicao", "essencial", "protecao", "expansao", "influencia"]`, obrig. |
| `geometria`, bbox, `area_m2` | json, decimais |
| `notas` | texto(1000) |

#### `area_sintese_itens` (D-56, D-57)

`acesso_externo: restrito` · `soft_delete`

| Coluna | Tipo | Observação |
|---|---|---|
| `area_estudo_id` | referencia → `areas_estudo`, `cascata`, obrig. | |
| `grupo` | texto, `opcoes: ["forca", "restricao", "dependencia", "incerteza", "opcao"]`, obrig. | doc. 05, §44 |
| `escala` | texto, `opcoes: ["regional", "urbana", "entorno", "sitio"]` | doc. 05, §28 |
| `texto` | texto(1000), obrig. | |
| `natureza` | texto, `opcoes: ["fato", "hipotese", "premissa", "decisao"]`, obrig. | doc. 02, §86 |
| `evidencias` | json | obrigatório para `fato` |
| `origem` | texto, `opcoes: ["humano", "ia", "app"]`, obrig. | `ia` nasce `proposto` |
| `status` | texto, `opcoes: ["proposto", "aceito", "descartado"]`, obrig. | só `aceito` entra na ficha |
| `prioridade` | inteiro | ordem na agenda de decisão |
| `autor_id`, `aceito_por_id` | referências | |

#### `teses` e `tese_condicoes` (D-58)

`teses`: `area_estudo_id` (cascata), `versao` (inteiro), `status` (`rascunho`, `vigente`,
`substituida`), `componentes` (json com as dez chaves do doc. 05, §48.1: `situacao_atual`,
`transformacao`, `mecanismo`, `participantes`, `ativos`, `sequencia`, `posicao_up`,
`captura_valor`, `opcoes`, `limites`, cada uma com texto e evidências), `autor_id`, `criada_em`.
Só uma `vigente` por área; publicar uma nova versão torna a anterior `substituida`.

`tese_condicoes`:

| Coluna | Tipo | Observação |
|---|---|---|
| `tese_id` | referencia → `teses`, `cascata`, obrig. | |
| `tipo` | texto, `opcoes: ["necessaria", "interrupcao"]`, obrig. | doc. 05, §50 e §51 |
| `texto` | texto(1000), obrig. | "a demanda por lote de 450 m² no entorno precisa ser maior que o pipeline" |
| `frente` | texto, `opcoes` das frentes de diligência | |
| `status` | texto, `opcoes: ["nao_verificada", "sustentada", "contrariada", "inconclusiva"]`, obrig. | |
| `evidencias` | json | |
| `verificar_ate` | data | condição vencida aparece no Início |
| `metrica_monitorada` | json | opcional: `{ chave, recorte, operador, limiar }`; `calcular_achados` reavalia todo mês e propõe mudança de status |

#### `diligencias` (D-60)

`acesso_externo: restrito`. Perguntas por frente (doc. 05, §61), semeadas ao criar a área a
partir de `comum/diligencia.ts` `[PENDENTE P-40]`.

| Coluna | Tipo | Observação |
|---|---|---|
| `area_estudo_id` | referencia → `areas_estudo`, `cascata`, obrig. | |
| `frente` | texto, `opcoes: ["fundiaria", "urbanistica", "ambiental", "fisica", "infraestrutural", "social", "mercadologica"]`, obrig. | |
| `pergunta` | texto(500), obrig. | |
| `impacto` | json (lista) | o que a resposta pode mudar: `preco`, `estrutura`, `prazo`, `uso`, `posicao`, `decisao` |
| `status` | texto, `opcoes: ["aberta", "respondida_app", "respondida", "nao_aplicavel"]`, obrig. | |
| `resposta` | texto_longo | |
| `natureza_resposta` | texto, opções de `natureza` | |
| `evidencias` | json | |
| `responsavel_id` | referencia → `shell.usuarios`, `anular` | |
| `prazo` | data | |

**Pré-preenchimento pelo app.** Perguntas que o app responde ganham `status = respondida_app`,
com a resposta e a evidência, e continuam abertas para um humano confirmar: zona do PDOT e área
de regularização (urbanística), fração restrita por APP, UC e declividade (ambiental), edificações
existentes (física), acesso e distância a equipamentos (infraestrutural), oferta, preço,
pipeline e concorrência (mercadológica). Fundiária e social nunca são respondidas pelo app.

#### `hipoteses_ancora` (D-65)

`acesso_externo: restrito` · `soft_delete`

| Coluna | Tipo | Observação |
|---|---|---|
| `area_estudo_id` | referencia → `areas_estudo`, `cascata`, obrig. | |
| `categoria_consumo` | texto(60), obrig. | |
| `porte` | texto(80) | e `atratividade` usada na simulação |
| `simulacao` | json | parâmetros e resultado do Huff congelados |
| `ancora_traz` | json (lista) | demanda, emprego, fluxo, reputação, serviço… (doc. 03) |
| `up_traz` | json (lista) | terra, infraestrutura, articulação, capital, operação… |
| `modelo_parceria` | texto(120) | candidato, do repertório do doc. 03 `[PENDENTE P-41]` |
| `compromisso_esperado` | texto(500) | o que transforma intenção em compromisso |
| `natureza` | texto, opções de `natureza`, obrig. | nasce `hipotese` |
| `status` | texto, `opcoes: ["hipotese", "em_conversa", "descartada", "compromisso"]`, obrig. | a conversa em si fica no CRM (D-45) |

#### `area_eventos` e `observacoes_campo` (D-78)

`area_eventos`: linha do tempo da área (`tipo`: `estagio_alterado`, `nota`, `ficha_gerada`,
`analise_gerada`, `tese_publicada`, `condicao_alterada`, `observacao_campo`, `perimetro_alterado`;
`dados` json; `autor_id`; `em`). Toda rota de escrita das tabelas desta seção grava aqui na
mesma transação.

`observacoes_campo`: `area_estudo_id` (cascata), `texto` (texto_longo), `foto` (arquivo
`image/jpeg`, `image/png`; 15 MB), `latitude`, `longitude`, `precisao_m`, `registrada_em`,
`autor_id`. Foto com pessoas identificáveis segue a seção 22.

### 5.21 Sítio: restrições e equipamentos públicos (D-61, D-62)

**Restrições por célula.** O pipeline calcula, para cada célula, as frações cobertas por: APP
de curso d'água (faixa de `app_largura_padrao_m` quando a largura não é conhecida, como premissa
declarada), unidade de conservação de proteção integral, unidade de conservação de uso
sustentável, declividade acima de `declividade_restritiva_frac`, e áreas de regularização do PDOT
(ARIS, ARINE). Também a união das restritivas (`frac_restrita_total`), sem dupla contagem
`[PENDENTE P-31]`. Tudo entra em `celula_metricas` (conjunto `restricoes_sitio`) e numa camada
vetorial para o mapa.

**Área líquida estimada** de um polígono = Σ (área da célula dentro do polígono × (1 −
`frac_restrita_total`)). É estimativa na resolução da célula, só calculada acima de
`area_liquida_min_ha`, mostrada como faixa (± a área das células de borda) e sempre rotulada
"estimativa pela grade; não substitui levantamento".

#### `equipamentos_publicos`

`acesso_externo: somente_leitura`. Carregada pelo pipeline.

| Coluna | Tipo |
|---|---|
| `fonte` | texto, `opcoes: ["inep", "cnes", "osm", "manual"]`, obrig. |
| `id_fonte` | texto(40), obrig. |
| `tipo` | texto(60), obrig. (`escola_publica`, `escola_privada`, `ubs`, `hospital`, `upa`, `delegacia`, `parque`, …) |
| `nome` | texto(200) |
| `rede` | texto, `opcoes: ["publica", "privada", "nao_informada"]` |
| `porte` | texto(80) (matrículas, leitos, quando a fonte publica) |
| `latitude`, `longitude`, `precisao_coordenada`, `h3_r9` | |
| `ancora_id` | referencia → `ancoras`, `anular` (quando o curador promove a âncora) |
| `versao_conjunto` | data, obrig. |

`unicos`: `(fonte, id_fonte)`.

### 5.22 Viabilidade expedita e mercado de lotes (D-63, D-64)

#### `cenarios_viabilidade`

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "{nome}"`

Simulação pelo **método residual**: quanto o terreno pode custar para o produto dar a margem
desejada, comparado com o que o mercado pede e o que a Terracap arrematou. Não é avaliação nem
laudo (R-29).

| Coluna | Tipo | Observação |
|---|---|---|
| `area_estudo_id` | referencia → `areas_estudo`, `anular` | sem área, é cenário solto (terreno digitado) |
| `nome` | texto(200), obrig. | |
| `metodo` | texto, `opcoes: ["vertical", "loteamento"]`, obrig. | |
| `premissas` | json, obrig. | cada premissa com `valor`, `origem` (`parametro`, `benchmark`, `serie`, `manual`) e `natureza = premissa` |
| `resultados` | json | VGV, custos por linha, valor residual total e por m² de terreno, sensibilidade |
| `comparacao` | json | Terracap (mediana da localidade), anúncios de terreno no entorno, ambos com amostra |
| `versao_metodo` | texto(20), obrig. | |
| `autor_id`, `atualizado_em` | | |

**Vertical:** área computável = área do terreno × coeficiente (do PDOT/LUOS quando houver, senão
manual); área privativa = computável × `viab_eficiencia_privativa_frac`; VGV = privativa ×
preço de venda por m² (benchmark de lançamentos da área, mediana de anúncios novos, ou manual);
custo de obra = área construída × CUB-DF da série `custo_construcao` × `viab_fator_custo_sobre_cub`
`[PENDENTE P-34]`; despesas = VGV × (`viab_despesas_comerciais_frac` + `viab_impostos_frac`);
margem = VGV × `viab_margem_alvo_frac`; **valor residual do terreno** = VGV − custo de obra −
despesas − margem.

**Loteamento:** área de lotes = área líquida × `viab_aproveitamento_loteavel_frac`; receita =
área de lotes × preço do m² de lote (mercado de lotes da área ou manual); custo de infraestrutura
= área loteada × custo por m² (entrada obrigatória, sem padrão); despesas e margem como acima;
valor residual idem.

**Sensibilidade:** grade 3 × 3 de preço (−10%, 0, +10%) por custo (−10%, 0, +10%). **Custo de
espera** opcional (doc. 05, §64): meses até o lançamento × taxa mensal sobre o valor do terreno.

**Mercado de lotes (D-64):** `metricas_anuncios_mensais` com `tipo_imovel = terreno` passa a usar
as faixas de `faixas_area_lote_m2` em vez de `faixas_area_m2`; a tela de lotes junta pedido de
anúncio, arrematado da Terracap e o residual dos cenários da mesma localidade, cada um com a
natureza escrita.

### 5.23 Governança do dado e do cálculo (D-69 a D-72)

**Versão de método (D-70).** `comum/versoes.ts` exporta `VERSAO_METODO` por domínio (`metricas`,
`indice`, `agrupamento`, `achados`, `rateio`, `produto`, `comercio`, `viabilidade`). Ganham a
coluna `versao_metodo` (texto 20): `metricas_anuncios_mensais`, `indice_oferta_mensal`,
`achados_mercado`, `area_estudo_fichas`, `cenarios_viabilidade`, `analises_ia`. Mudar uma regra
sobe a versão; a rotina `recalcular_derivados` refaz o que depende dela e a ficha antiga continua
dizendo com que versão foi feita.

#### `cache_calculos` (D-69)

`acesso_externo: restrito`.

| Coluna | Tipo | Observação |
|---|---|---|
| `chave` | texto(64), único | SHA-256 de rota + parâmetros normalizados + versões dos conjuntos usados + `VERSAO_METODO` + `geracao_cadastro` |
| `rota` | texto(120) | |
| `resultado` | json | |
| `criado_em`, `expira_em` | datahora | `expira_em` = criação + `cache_ttl_dias` |
| `acessos` | inteiro | |

`geracao_cadastro` é um contador em `cursores_rotina` que toda escrita de cadastro incrementa
(anúncio, lançamento, âncora, lote, licença, empreendimento, grupo). Assim uma correção manual
invalida o cache sem precisar saber quais cálculos ela afeta (R-34).

#### `uso_eventos` (D-72)

`acesso_externo: restrito`. Telemetria mínima para decidir fases pelo uso (R-26): `usuario_id`,
`sub_rota`, `acao` (`abrir`, `exportar`, `gerar_ficha`, `gerar_analise`, `salvar_area`,
`simular`), `em`. Agregada por tela na Operação; apagada depois de `uso_retencao_dias`. Se o shell
já registrar uso por tela, a app lê de lá e não grava esta tabela `[CONFIRMAR SDK P-38]`.

**Frescor das fontes (D-71).** `comum/fontes.ts` declara, por fonte, a periodicidade e o
`frescor_esperado_dias` (seção 23). A rotina `verificar_frescor` compara com a última carga e abre
achado de qualidade `FONTE_ATRASADA` (aviso), que a tela mostra no rodapé de procedência de todo
número daquela fonte.

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
- **Pacote com proveniência (D-28):** toda rota de lista e de tela de decisão aceita também
  `?formato=pacote` e responde um ZIP com `dados.csv`, `metadados.json` (colunas com unidade e
  natureza do catálogo, fontes com versão e hash, filtros aplicados, data) e `LEIAME.md` com a
  citação "Fonte (ano) – processado pela Inteligência Imobiliária". Sem biblioteca de ZIP no
  bundle `[CONFIRMAR SDK P-18]`, a tela oferece os três arquivos em downloads separados.
- **Cálculo que não grava é `GET` (v0.2).** O shell exige `escrita` para `POST`. Enriquecimento,
  dossiê, capacidade, matriz, simulação de Huff, áreas gêmeas e score de lente não gravam nada e
  precisam funcionar para quem só tem `leitura`, então são `GET`. Polígono ad hoc vai na
  querystring codificado em *encoded polyline* (`comum/celulas.ts`), que cabe na URL até centenas
  de vértices; polígono maior precisa ser salvo como área de estudo antes.
- **Concorrência de edição (v0.3):** todo `PATCH` de cadastro, área, síntese, tese, condição,
  diligência e cenário manda o `atualizado_em` que a tela leu; se o registro mudou depois,
  responde `409 CONFLITO_VERSAO` com o registro atual em `detalhes`, e a tela mostra as duas
  versões. Nenhuma escrita sobrescreve em silêncio a de outra pessoa.

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
| POST | `/analises/area` | escrita | `{ area_estudo_id, mes_referencia? }` |
| GET | `/analises/estado` | leitura | `req.ia.estadoSlot` dos quatro slots de análise: se resolvem, se há failsafe; a tela esconde o botão quando não resolve |

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

### 6.10 Grade e enriquecimento (D-34 a D-37)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/territorio/catalogo` | leitura | catálogo de métricas (seção 5.13) |
| GET | `/territorio/celulas?cidade&bbox&metrica&ano&zoom` | leitura | células da caixa com `geometria`, `valor`, `classe` (quantis da cidade) e `qualidade`; abaixo de `hex_zoom_min` ou acima de `hex_max_celulas_resposta`, responde o pai r8 somado em código (`agregado: "r8"`) |
| GET | `/territorio/enriquecer?ponto=lat,lng&raios=…` \| `?poligono=<polyline>` \| `?area_estudo_id` `&metricas&ano` | leitura | células que entram, fração coberta, e cada métrica agregada pela natureza dela, com método de rateio e fonte; dado por localidade vem rateado e marcado |
| GET | `/territorio/composicao?localidade` | leitura | pesos de `localidade_composicao` que chegam a ela e saem dela |
| GET | `/territorio/serie?localidade&metrica&integracao=nominal\|padronizada` | leitura | série com a quebra de limite marcada |

### 6.11 Estudos de área (D-23)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/estudos?tipo&estagio&responsavel&q&pagina` | leitura | |
| GET | `/estudos/:id` | leitura | área + resumo do último dossiê |
| POST | `/estudos` | escrita (`tipo = propria`: curador) | cria por desenho (geometria do `urbi-mapa`) ou por ponto |
| PATCH | `/estudos/:id` | escrita (autor ou curador; `propria`: curador) | |
| POST | `/estudos/importar`, `/estudos/importar/aplicar` | escrita | KML/KMZ/GeoJSON, o mesmo fluxo de `contornos` |
| PATCH | `/estudos/:id/remover`, `/restaurar` | escrita (autor ou curador) | soft-delete; `DELETE` é do admin no shell |
| GET | `/estudos/:id/dossie?escalas&blocos` | leitura | `Dossie` (seção 6.21): blocos nas quatro escalas (regional, urbana, entorno, sítio), síntese aceita e agenda de decisão (D-56); usa o cache (D-69) |
| POST | `/estudos/:id/fichas` | escrita | congela o dossiê em `area_estudo_fichas` (formato e seções escolhidos) |
| GET | `/estudos/:id/fichas`, `/estudos/:id/fichas/:fid?formato=md\|csv\|json\|pacote` | leitura | |
| GET | `/estudos/comparar?ids=a,b,c` | leitura | 2 a 6 áreas lado a lado, mesmas métricas |

### 6.12 Produto (D-44)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/produto/demanda?localidade\|area_estudo_id` | leitura | domicílios, população, faixas etárias, composição, renda por faixa, aluguel × próprio, déficit e coabitação, crescimento domiciliar |
| GET | `/produto/capacidade?localidade\|area_estudo_id&programa` | leitura | domicílios por faixa de preço alcançável, com a taxa usada e a origem dela |
| GET | `/produto/matriz?localidade\|area_estudo_id&tipo_transacao` | leitura | matriz tipologia × faixa de preço (seção 5.17) |
| GET | `/produto/benchmark?localidade\|area_estudo_id&raio_m&quartos&estagio` | leitura | lançamentos comparáveis com área, R$/m², estágio, estoque e IVV regional; régua P25–P50–P75 |
| GET | `/faixas-programa` | leitura | |
| POST / PATCH | `/faixas-programa`, `/faixas-programa/:id` | curador | |

### 6.13 Comércio e âncoras (D-41 a D-43)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/comercio/categorias` | leitura | catálogo de categorias de consumo |
| GET | `/comercio/potencial?localidade\|area_estudo_id\|ponto&raios&categoria` | leitura | gasto potencial e estabelecimentos por anel e por categoria |
| GET | `/comercio/lacunas?cidade\|area_estudo_id&categoria&escala=celula\|localidade` | leitura | gasto potencial por estabelecimento contra a mediana da cidade; acima de `lacuna_comercial_razao_min` vira achado |
| GET | `/comercio/simular?ponto&categoria&atratividade&expoente` | leitura | modelo de Huff para uma âncora hipotética no ponto |
| GET | `/comercio/gemeas?referencia=area:<id>\|localidade:<id>\|celula:<h3>&escala&n` | leitura | áreas gêmeas |
| GET | `/comercio/bolsoes?cidade&metrica` | leitura | Gi* por célula |
| GET | `/comercio/lentes`, `/comercio/lentes/:id/score?bbox&escala` | leitura | score e decomposição |
| POST / PATCH | `/comercio/lentes`, `/comercio/lentes/:id` | curador | |
| GET | `/pontos-comerciais?bbox&categoria&fonte` | leitura | |

### 6.14 Terra e oferta futura (D-39)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/terra/lotes?cidade&localidade&situacao&de&ate&destinacao&bbox&pagina` | leitura | com os derivados (R$/m² de terreno e de potencial, ágio) |
| GET | `/terra/resumo?cidade&ano` | leitura | por localidade: medianas de R$/m², ágio, propostas, fração vendida (`sql_declarado mediana_terracap_por_localidade`) |
| POST / PATCH | `/terra/lotes`, `/terra/lotes/:id` | curador | |
| GET | `/licenciamento?cidade&localidade&tipo_ato&uso&de&ate&pagina` | leitura | |
| POST / PATCH | `/licenciamento`, `/licenciamento/:id` | curador | |
| GET | `/oferta-futura/pipeline?cidade\|localidade\|area_estudo_id` | leitura | unidades por estágio, sem dupla contagem, e meses de absorção futura |

### 6.15 Empreendimentos e agrupamentos (D-26, D-38)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/empreendimentos?cidade&localidade&estagio&q&pagina`, `/empreendimentos/:id` | leitura | com os vínculos |
| POST / PATCH | `/empreendimentos`, `/empreendimentos/:id` | curador | |
| GET | `/vinculos/sugestoes?status&tabela_origem` | leitura | |
| POST | `/vinculos/sugestoes/:id/aceitar`, `/rejeitar` | curador | |
| GET | `/anuncio-grupos?status&localidade&pagina`, `/anuncio-grupos/:id` | leitura | com os anúncios lado a lado |
| POST | `/anuncio-grupos/:id/confirmar`, `/descartar` | curador | |
| POST | `/anuncio-grupos/:id/separar` | curador | `{ anuncio_id }` tira um anúncio do grupo |

### 6.16 Contexto, achados, início e visões (D-21, D-31, D-33)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/mercado/macro?papel&de&ate` | leitura | `series_macro` |
| GET | `/achados?recorte_tipo&recorte_id&mes&tipo` | leitura | ranqueados por `pontuacao` |
| GET | `/inicio/resumo?cidade&mes` | leitura | achados de maior pontuação da cidade e das áreas próprias, estado das fontes, análises novas, visões fixadas |
| GET | `/visoes` | leitura | as do próprio usuário |
| POST / PATCH | `/visoes`, `/visoes/:id`, `/visoes/:id/remover` | escrita | só as próprias `[CONFIRMAR SDK P-22]` |
| GET | `/fontes/:id/saude?de&ate` | leitura | `fonte_saude` |

### 6.17 Método da oportunidade (D-55 a D-60, D-65, D-78)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/estudos/portfolio?tipo&estagio` | leitura | uma linha por área: estágio, perímetro, seis indicadores-chave, condições necessárias por status, diligências abertas por frente, último achado, última ficha (D-66) |
| GET | `/estudos/:id/agenda` | leitura | a agenda de decisão: síntese aceita por prioridade, diligências abertas de maior impacto, condições vencidas ou contrariadas |
| GET | `/estudos/:id/linha-do-tempo` | leitura | `area_eventos` |
| GET / POST | `/estudos/:id/perimetros` | leitura / escrita | |
| PATCH | `/perimetros/:pid`, `/perimetros/:pid/remover` | escrita (autor ou curador) | |
| GET | `/estudos/:id/sintese?grupo&escala&status` | leitura | |
| POST | `/estudos/:id/sintese` | escrita | `fato` sem evidência → `422 FATO_SEM_EVIDENCIA` |
| PATCH | `/sintese/:item`, `/sintese/:item/aceitar`, `/sintese/:item/descartar` | escrita | |
| POST | `/analises/:id/propor-sintese` | escrita | transforma os itens da análise de área em itens `proposto`, `origem = ia`, natureza `hipotese` (D-57) |
| GET | `/estudos/:id/teses`, `/teses/:tid` | leitura | |
| POST | `/estudos/:id/teses`, `/teses/:tid/publicar` | escrita | publicar torna a vigente anterior `substituida` |
| POST / PATCH | `/teses/:tid/condicoes`, `/condicoes/:cid` | escrita | |
| GET | `/estudos/:id/diligencias?frente&status` | leitura | |
| POST / PATCH | `/estudos/:id/diligencias`, `/diligencias/:did` | escrita | pergunta extra; resposta, status, responsável, prazo |
| GET / POST | `/estudos/:id/hipoteses-ancora` | leitura / escrita | o corpo pode trazer a `simulacao` devolvida por `/comercio/simular` |
| PATCH | `/hipoteses-ancora/:hid` | escrita | |
| POST | `/estudos/:id/observacoes` | escrita | `{ texto, upload_id?, latitude?, longitude?, precisao_m? }` |

### 6.18 Sítio e equipamentos públicos (D-61, D-62)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/estudos/:id/sitio` | leitura | área bruta, área líquida estimada (faixa), fração por restrição, zonas do PDOT, edificações existentes, distância à via de maior centralidade (`road_centrality`) e aos equipamentos mais próximos |
| GET | `/territorio/restricoes?bbox&tipo` | leitura | camada vetorial de restrições |
| GET | `/equipamentos?bbox&tipo&rede&pagina` | leitura | |
| POST | `/equipamentos/:id/promover` | curador | cria a âncora correspondente e liga `ancora_id` |

### 6.19 Viabilidade expedita e mercado de lotes (D-63, D-64)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/viabilidade/simular?metodo&<premissas>` | leitura | calcula sem gravar; premissa ausente obrigatória → `422 CENARIO_INCOMPLETO` com os campos |
| GET | `/viabilidade?area_estudo_id`, `/viabilidade/:id` | leitura | |
| POST / PATCH | `/viabilidade`, `/viabilidade/:id` | escrita | recalcula `resultados` e `comparacao` ao gravar |
| GET | `/terra/lotes-mercado?cidade\|localidade\|area_estudo_id&faixa_area` | leitura | pedido (anúncios de terreno), arrematado (Terracap) e residual (cenários), lado a lado e rotulados |

### 6.20 Governança (D-69 a D-72)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/operacao/uso?de&ate` | operador | aberturas e ações por tela e por semana, sem identificar pessoa na agregação |
| GET | `/operacao/frescor` | leitura | por fonte: última carga, frescor esperado, situação |
| POST | `/operacao/cache/limpar` | operador | apaga o cache inteiro (o próximo acesso recalcula) |
| GET | `/sobre/versoes` | leitura | `VERSAO_METODO` por domínio, versões dos conjuntos ativos, versão da app e do SDK |

### 6.21 Contratos de resposta (v0.3)

Os tipos moram em `comum/tipos.ts`, compartilhados por backend e frontend, e são a fonte de
verdade das respostas. Excerto dos principais:

```ts
type Natureza = 'fato' | 'hipotese' | 'premissa' | 'decisao';
type NaturezaPreco = 'pedido' | 'arrematado' | 'declarado';
type Escala = 'regional' | 'urbana' | 'entorno' | 'sitio';

interface Procedencia {
  fonte: string;              // chave de comum/fontes.ts
  conjunto?: string;          // código do conjunto público
  versao?: string;            // versão ou hash do conjunto
  periodo: string;            // '2022' | '2026-09' | '2024-01..2026-09'
  metodo: string;             // "soma das células" | "rateado de localidade por domicílios" | …
  atrasada?: boolean;         // há FONTE_ATRASADA aberto
}

interface ValorMetrica {
  chave: string;              // do catálogo (seção 5.13)
  valor: number | null;       // null = ausente ou suprimido; nunca 0 por ausência
  unidade: string;
  natureza_preco?: NaturezaPreco;
  amostra_n?: number;         // natureza 'amostra'
  fracao_coberta?: number;    // 0..1
  rateado_de?: 'localidade' | 'setor' | null;
  distribuicao?: Array<{ categoria: string; frac: number }>; // natureza 'categorica'
  qualidade: string[];        // flags do conjunto e da amostra
  procedencia: Procedencia;
}

interface ResultadoEnriquecimento {
  consulta: { tipo: 'ponto_raios' | 'poligono' | 'area_estudo'; area_estudo_id?: number };
  aneis: Array<{
    raio_m: number | null;    // null quando é polígono
    celulas_n: number;
    area_km2: number;
    fracao_coberta: number;
    metricas: ValorMetrica[];
  }>;
  recusadas: Array<{ chave: string; motivo: 'nao_agregavel' | 'sem_dado' | 'fora_da_cobertura' }>;
  versao_metodo: string;
  cache: { hit: boolean };
}

interface AchadoResumo {
  id: number; tipo: string; metrica: string; texto_curto: string;
  direcao: 'alta' | 'queda' | 'estavel' | 'destoa'; pontuacao: number;
  indicadores: ValorMetrica[];
}

interface BlocoDossie {
  escala: Escala;
  chave: string;              // 'demografia' | 'oferta_preco' | 'terra' | 'restricoes' | …
  titulo: string;
  metricas: ValorMetrica[];
  tabelas?: Array<{ titulo: string; colunas: string[]; linhas: Array<Array<string | number | null>> }>;
  achados: AchadoResumo[];
  lacunas: string[];          // o que este bloco não conseguiu calcular e por quê
}

interface ItemSintese {
  id: number; grupo: 'forca' | 'restricao' | 'dependencia' | 'incerteza' | 'opcao';
  escala?: Escala; texto: string; natureza: Natureza;
  evidencias: Array<{ tipo: string; ref: string | number; rotulo: string }>;
  origem: 'humano' | 'ia' | 'app'; status: 'proposto' | 'aceito' | 'descartado';
}

interface Dossie {
  area: { id: number; nome: string; tipo: string; estagio: string; area_m2: number | null; raios_m: number[] };
  gerado_em: string;
  versoes_conjuntos: Record<string, string>;
  versao_metodo: string;
  blocos: BlocoDossie[];
  sintese: ItemSintese[];     // só 'aceito'
  agenda: {
    diligencias_abertas: Array<{ id: number; frente: string; pergunta: string; impacto: string[]; prazo: string | null }>;
    condicoes_atencao: Array<{ id: number; tipo: 'necessaria' | 'interrupcao'; texto: string; status: string; verificar_ate: string | null }>;
  };
  cache: { hit: boolean };
}

interface CapacidadePagamento {
  taxa_aa_frac: number; taxa_origem: 'faixa' | 'parametro' | 'serie';
  prazo_meses: number; comprometimento_frac: number; entrada_frac: number; sistema: 'price' | 'sac';
  faixas: Array<{ preco_min: number; preco_max: number | null; domicilios: number | null; frac: number | null }>;
  renda: Procedencia;
}

interface MatrizProduto {
  linhas: string[]; colunas: string[];   // tipologias × faixas de preço
  celulas: Array<{ linha: string; coluna: string; demanda_frac: number | null; oferta_frac: number | null;
                   lacuna: number | null; absorcao: number | null; amostra_n: number }>;
  tabela_tipologia: { versao: string; calibrada_por_localidade: boolean };
}

interface SimulacaoHuff {
  rotulo: 'simulação com parâmetros declarados';
  categoria: string; ponto: [number, number]; atratividade: number; expoente: number; raio_max_m: number;
  aneis: Array<{ raio_m: number; gasto_potencial_brl_ano: number; participacao_frac: number; gasto_capturado_brl_ano: number }>;
  concorrentes: Array<{ id: string; fonte: string; nome: string | null; distancia_m: number; atratividade: number }>;
}

interface ResultadoViabilidade {
  rotulo: 'simulação expedita; não substitui avaliação';
  metodo: 'vertical' | 'loteamento';
  premissas: Record<string, { valor: number | null; origem: 'parametro' | 'benchmark' | 'serie' | 'manual'; natureza: 'premissa' }>;
  linhas: Array<{ chave: string; valor_brl: number }>;   // VGV, obra, despesas, margem…
  residual_total_brl: number; residual_m2_terreno_brl: number;
  sensibilidade: number[][];                              // 3 × 3, preço × custo
  comparacao: Array<{ natureza_preco: NaturezaPreco | 'residual'; valor_m2_brl: number | null; amostra_n: number; procedencia: Procedencia }>;
}
```

### 6.22 Códigos de erro da app (v0.3)

| Código | HTTP | Quando |
|---|---|---|
| `PAPEL_EXIGIDO` | 403 | rota pede papel que o usuário não tem (inclui `tipo = propria` sem `curador`) |
| `EXPORTACAO_GRANDE` | 413 | exportação acima de 50 000 linhas |
| `POLIGONO_INVALIDO` | 400 | menos de 3 vértices, autointerseção, *polyline* que não decodifica |
| `AREA_GRANDE_DEMAIS` | 413 | acima de `poligono_max_km2`, `poligono_max_vertices` ou `raio_max_m` |
| `FORA_DA_CIDADE` | 422 | a geometria não toca nenhuma célula da cidade |
| `METRICA_DESCONHECIDA` | 400 | chave fora do catálogo |
| `METRICA_NAO_AGREGAVEL` | 422 | pedido só de métricas que não se agregam na área (em pedido misto, elas vão para `recusadas`) |
| `FATO_SEM_EVIDENCIA` | 422 | item `fato` sem evidência |
| `ESTAGIO_INVALIDO` | 422 | encerrar sem `motivo_encerramento`; voltar de `encerrada` sem reabrir |
| `CENARIO_INCOMPLETO` | 422 | premissa obrigatória faltando, com `detalhes.campos` |
| `CONFLITO_VERSAO` | 409 | edição concorrente |
| `MES_NAO_FECHADO` | 409 | pedido que depende de um mês ainda não fechado |
| `SLOT_INDISPONIVEL` | 503 | análise pedida sem slot resolvido |

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
5. Ao fim, por fonte, grava `fonte_saude` (seção 8.4.1). `verificar_anuncios` faz o mesmo.

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
4. Calcula as métricas ampliadas (D-25) sobre os mesmos grupos, por imóvel (D-26), e grava
   `indice_oferta_mensal` de `M` (D-40).
5. Abre a linha do mês corrente para todo anúncio ativo (não congelada).
6. Resumo: retratos congelados, grupos de métricas, anúncios sem preço, grupos de amostra
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

Na v0.2 o manifest passa à versão 2 (D-49): além dos arquivos GeoJSON (`overview`, `detail`,
`detail_shard`, `data`), um conjunto pode trazer arquivos com `role: "tabela"`, em CSV, com
`tabela_destino` (`celulas`, `celula_metricas`, `localidade_composicao`, `pontos_comerciais`) e
`chave_natural`. A rotina carrega a tabela em lotes de 500 linhas, por cursor (arquivo e linha),
grava com a `versao_conjunto` nova e só então remove as linhas da versão anterior daquele
conjunto, para a tela nunca ver o conjunto pela metade. A app continua aceitando o manifest 1.

### 7.6 `gerar_analises_mensais` (mensal, agendada pelo admin para depois do `fechar_mes`)

Seção 9. Gera a análise de **mercado** da cidade e uma análise de **território** por localidade
que tenha ao menos `analise_minimo_meses_historico` meses de métricas de anúncios **ou** série
FipeZap própria. Uma chamada por análise, em série, respeitando o orçamento; sobra continua por
agendamento. Falha de uma análise não impede as outras; cada falha publica
`erros.analise_falhou`.

Na v0.2, também uma análise de **área** por área de estudo com `tipo = propria` e `estagio`
diferente de `encerrada`, e sempre depois de `calcular_achados` do mesmo mês.

### 7.7 `agrupar_anuncios` (diária, depois da descoberta)

Para cada anúncio ativo criado ou com preço alterado desde o cursor, procura os candidatos a
mesmo imóvel pela regra de `anuncio_grupos` (filtro por localidade, tipo, transação e quartos via
`req.dados`, tolerâncias em código), cria ou amplia um grupo `sugerido` com a `confianca`, e
nunca mexe em grupo `confirmado` nem `descartado`. Resumo: grupos sugeridos, anúncios envolvidos,
grupos acima de `agrupar_confianca_auto`. Idempotente: rodar de novo não cria grupo repetido.

### 7.8 `vincular_empreendimentos` (semanal)

Para lançamentos, anúncios de unidade nova (descrição ou característica "na planta", "lançamento",
"pronto para morar" em empreendimento conhecido), licenças e lotes Terracap sem
`empreendimento_id`, propõe o vínculo por distância (até 150 m quando os dois têm coordenada
exata), nome normalizado e área compatível; sem empreendimento próximo, propõe criar um. Grava
`vinculo_sugestoes`; o curador decide em Operação › Agrupamentos e vínculos.

### 7.9 `carregar_series_macro` (mensal)

Lê `series_macro_config`; para cada série, pede à API pública da fonte (`bcb_sgs` na primeira
versão) os meses que faltam desde o último gravado, converte com a `escala` declarada (D-12) e
grava em `series_macro` por `(codigo_serie, mes_referencia)`. Série que falha não impede as
outras; falha publica `erros.coleta_falhou` com a série no detalhe. Sai pelo mesmo cliente HTTP
da coleta (seção 8.2), sem o proxy.

### 7.10 `calcular_achados` (mensal, depois de `fechar_mes` e `carregar_series_macro`)

Calcula, para o mês `M`, os achados da seção 9.7 em quatro recortes: a cidade, cada localidade,
cada área de estudo não encerrada e as células (só os tipos `bolsao` e `lacuna_comercial`). Apaga e
regrava os achados de `M` (idempotente). Fatiada por recorte, com cursor.
Guarda: se o `fechar_mes` de `M` não terminou com `sucesso`, a rotina não calcula e devolve
`parcial` com o resumo "mês não fechado" (R-21).

### 7.11 `recalcular_derivados` (mensal, e "Rodar agora")

Backfill e recálculo, fatiado por etapa e cursor, idempotente. Etapas, nesta ordem: `h3_r9` de
todo registro com coordenada utilizável e sem célula; `preco_inicial_brl` a partir do primeiro
`preco_pedido_brl` em `anuncio_eventos` e `anuncio_retratos` (ou do próprio anúncio, se não houver
evento); sugestão de grupos para a base inteira (mesma regra da 7.7); `metricas_anuncios_mensais`
e `indice_oferta_mensal` cujo `versao_metodo` difere do atual; `achados_mercado` idem; cenários de
viabilidade com `versao_metodo` antiga (recalcula `resultados`, mantém as premissas). Sem nada a
fazer, termina em segundos. É o passo de migração da v0.2 e da v0.3 numa instância que já tem
dado.

### 7.12 `verificar_frescor` (diária)

Para cada fonte de `comum/fontes.ts`, compara a data da última carga com o
`frescor_esperado_dias`; abre `FONTE_ATRASADA` quando passa e o resolve quando a carga chega. Não
faz requisição externa.

### 7.13 `limpar_retencao` (semanal)

Apaga `cache_calculos` expirado, `uso_eventos` além de `uso_retencao_dias` e o campo `bruto` de
candidatos `rejeitado` além de `bruto_rejeitados_retencao_dias` (a linha do candidato fica, para a
deduplicação continuar funcionando).

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

**Higienização (v0.3, D-74).** Antes de gravar `bruto` e `caracteristicas`, o parser remove
telefone, e-mail, CPF e nome de pessoa (corretor, anunciante pessoa física), por padrões
declarados em `comum/higienizar.ts`. Imobiliária e incorporadora (pessoa jurídica) ficam. A
fixture de teste também passa pela higienização antes de entrar no repositório.

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

### 8.4.1 Saúde do parser (D-27)

O estado da fonte (8.4) mede **bloqueio**. Ele não vê a falha silenciosa: o portal mudou o HTML,
a página responde 200 e o parser passa a devolver preço ou área vazios. Por execução e por fonte,
a rotina grava em `fonte_saude` os itens lidos e a taxa de nulos de cada campo, e compara com a
mediana das últimas `saude_parser_janela_execucoes`. Queda de itens acima de
`queda_itens_max_frac`, ou aumento da taxa de nulos de algum campo acima de
`aumento_nulos_max_frac`, marca a execução `degradado` e publica `erros.parser_degradado` uma vez
por transição de estado. A tela de Fontes mostra a saúde ao lado do estado, e o diagnóstico da
fonte (`POST /fontes/:id/diagnosticar`) é o caminho para colher a fixture nova.

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

Quatro tipos, quatro slots custom com base `poder` (o shell resolve provedor, modelo, chave e
failsafe; a app só nomeia o slot):

| Tipo | Slot | Recorte | Quando |
|---|---|---|---|
| Território | `analise_territorio` | uma localidade, no mês de referência, com todo o histórico | rotina mensal para toda localidade com dado suficiente; botão na tela de Diagnóstico e no bloco da localidade no Mapa |
| Mercado | `analise_mercado` | a cidade, no mês de referência, com todo o histórico | rotina mensal; botão na tela de Mercado |
| Recorte em tela | `analise_tela` | os filtros que o usuário está vendo (Mapa ou Mercado) | só por botão |
| Área de estudo | `analise_area` | uma área de estudo, no mês, com os anéis dela | rotina mensal para as áreas próprias ativas; botão no dossiê e na ficha |

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

**Área de estudo** (área `A`, mês `M`): o `Dossie` inteiro (seção 6.21), nas quatro escalas,
cada bloco com método e fração coberta; o tipo e o estágio da área; a síntese já **aceita**; a
tese vigente e as condições com status; as diligências abertas; as hipóteses de âncora; os
cenários de viabilidade (premissas e resultado); as notas do responsável.

**Achados, em todos os tipos (v0.2).** O contexto traz um bloco `achados` com os de
`achados_mercado` do recorte e do mês, ranqueados, até `achados_max_por_recorte`, cada um com
`id`, `tipo`, `texto_curto` e os indicadores. É a matéria-prima principal; os blocos de
indicadores continuam para o modelo poder conferir e contextualizar.

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
6. Achados (v0.2): começar pelos achados de maior pontuação; citar cada um pelo `id`; não
   apresentar como novidade o que nenhum achado sustenta.
7. Área de estudo (v0.2): hipóteses de produto e de âncora formuladas como **hipótese a validar**,
   cada uma com os achados que a sustentam e o que falta saber; nunca projeção de vendas nem de
   preço; dizer sempre quando um número veio rateado de localidade.

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
                   "achado_ids":  { "type": "array", "items": { "type": "integer" } },  // ids de achados_usados (v0.2)
                   "direcao": { "type": "string", "enum": ["alta", "queda", "estavel", "destoa", "neutro"] } } } },
    "alertas": { "type": "array", "items": { "type": "string" } },
    "lacunas": { "type": "array", "items": { "type": "object", "required": ["o_que", "impacto"],
                 "properties": { "o_que": { "type": "string" }, "impacto": { "type": "string" },
                                 "campo_cadastro": { "type": "string" } } } }
  }
}
```

A app valida que toda chave em `achados[].indicadores` existe em `indicadores_usados` e que todo
id em `achados[].achado_ids` existe em `achados_usados`; achado que não cita nenhum dos dois, ou
que cita chave ou id desconhecido, é **descartado** e a análise grava `estrutura.achados_descartados`.
`lacunas[].campo_cadastro`, quando aponta um campo de cadastro (preço de lançamento,
coordenada), dispara o evento `lacuna_cadastro` (uma vez por análise), que é o aviso que o
dono do produto pediu para alimentar a correção manual.

**Extensão do schema para `analise_area` (v0.3).** Além de `sumario`, `achados`, `tendencias`,
`alertas` e `lacunas`, a resposta traz:

- `sintese`: cinco listas (`forcas`, `restricoes`, `dependencias`, `incertezas`, `opcoes`), cada
  item `{ texto, escala, natureza, indicadores, achado_ids }`. A app grava cada item como
  `proposto`, `origem = ia`, e rebaixa para `hipotese` todo item que o modelo marcou como `fato`
  sem citar indicador ou achado (D-57).
- `hipoteses`: `{ tipo: "produto" | "ancora" | "tese", texto, condicoes: [texto], achado_ids }`.
- `perguntas`: `{ frente, pergunta, impacto }` que o modelo acha que faltam na diligência; viram
  sugestão, não pergunta, até um humano aceitar.

Nada do que a IA escreve entra na ficha sem passar por `aceito`.

### 9.5 Gravação, versões e custo

Cada geração grava uma linha nova em `analises_ia` e aponta a anterior do mesmo recorte e mês
em `substituida_por_id`. A tela mostra a vigente e permite ver as anteriores. `tokens_entrada` e
`tokens_saida` vêm da resposta do helper, para a tela de Operação somar custo por mês.

Orçamento de referência (para o admin calibrar os slots): uma análise de território consome na
faixa de 15 a 30 mil tokens de entrada e 1,5 mil de saída; a rotina mensal, com 35 localidades
mais a de mercado, fica em torno de 1 milhão de tokens de entrada por mês. Na v0.2, cada área própria ativa
soma uma análise de área na mesma faixa de uma de território; os achados entram no lugar de parte
das séries, e o contexto de território e de mercado tende a encolher. É aceitável no slot
`poder` mensal; não é aceitável por clique sem controle, por isso o botão de "gerar agora" é
`escrita` e a tela avisa quando já existe análise do mês para o recorte.

### 9.6 Quando não gerar

Sem slot resolvido (`estadoSlot` sem `efetivo`): botão escondido, rotina pula com resumo "slot
não configurado". Recorte com menos de `analise_minimo_meses_historico` meses de qualquer
série: a rotina pula a localidade e a tela mostra "histórico insuficiente"; o botão manual
continua disponível, com o aviso. Falha do provedor: `erros.analise_falhou`, nada gravado.

### 9.7 Camada de achados determinísticos (D-21)

No modelo do Tableau Pulse: a app detecta, ranqueia e escreve uma frase curta em código; a IA lê
e interpreta. Os tipos, todos calculados por `comum/achados.ts` sobre métricas do catálogo:

| Tipo | Regra | Recortes |
|---|---|---|
| `variacao_periodo` | variação de `M` contra `M-1` e contra `M-12` | cidade, localidade, área |
| `mudanca_incomum` | valor de `M` fora de [P10, P90] dos últimos `achado_janela_meses` (mínimo 12 pontos) | cidade, localidade, área |
| `maior_contribuidor`, `maior_detrator` | localidade ou tipologia que mais moveu a métrica da cidade no mesmo sentido ou no oposto | cidade |
| `destoa_cidade` | recorte fora de [P25, P75] das localidades no mês | localidade, área |
| `lacuna_produto` | célula da matriz de produto com \|demanda − oferta\| ≥ 0,10 | localidade, área |
| `lacuna_comercial` | gasto potencial por estabelecimento ≥ `lacuna_comercial_razao_min` × mediana da cidade | localidade, área, célula |
| `bolsao` | Gi* com \|z\| ≥ 1,96 | célula |
| `pipeline_pressao` | meses de absorção futura acima da mediana das localidades | localidade, área |
| `terra_agio` | ágio mediano das licitações do ano acima do P75 das localidades | localidade |

**Pontuação** (D-68) = |z| × peso do tipo × fator de amostra × fator de qualidade, onde:

- `z` é o desvio em unidades de dispersão robusta: para séries, a variação do mês dividida por
  1,4826 × MAD das variações da janela; entre recortes, a distância à mediana das localidades
  dividida por 1,4826 × MAD entre localidades; para lacunas, a própria diferença dividida pelo
  limiar do tipo;
- fator de amostra = min(1, √(n ÷ 30)), com `n` = `amostra_n` da métrica (1 para métricas sem
  amostra);
- fator de qualidade = 0,5 se o conjunto ou a métrica tem flag de qualidade, 1 se não;
- pesos iniciais do tipo, em `comum/achados.ts` com `versao_metodo`:

| Tipo | Peso | Tipo | Peso |
|---|---|---|---|
| `mudanca_incomum` | 1,0 | `destoa_cidade` | 0,7 |
| `lacuna_produto` | 0,9 | `maior_contribuidor`, `maior_detrator` | 0,7 |
| `lacuna_comercial` | 0,9 | `terra_agio` | 0,7 |
| `pipeline_pressao` | 0,8 | `bolsao` | 0,6 |
| `condicao_em_risco` (v0.3) | 1,0 | `variacao_periodo` | 0,5 |

`condicao_em_risco` (v0.3): a `metrica_monitorada` de uma condição de tese cruzou o limiar no
mês; gera o achado e propõe mudar o status da condição. Cada achado guarda os indicadores que o
geraram, com fonte e período, para a tela e a IA mostrarem a mesma coisa. O `sentido` do
catálogo decide se a frase diz "melhorou" ou "piorou"; métrica `neutro` só diz "subiu" ou
"caiu".

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
- **Telas de decisão (v0.2)**: Estudos de área, Produto, Comércio e Terra mostram, ao lado de
  cada número, o método (incluindo rateio e fração coberta) e a natureza do preço (pedido,
  arrematado, declarado; D-50).
- Exceções de UI previstas na v0.2, além das da v0.1: a **dispersão** verdadeira (Mercado,
  Diagnóstico, áreas gêmeas). Histograma de preço/m² e decomposição de score usam
  `urbi-grafico-colunas`; a matriz de produto usa `urbi-mapa-de-calor`; nenhuma pede exceção.
- **Como ler (v0.3, D-77):** toda tela tem um botão "Como ler" que abre `comum/ajuda/<tela>.md` em
  `urbi-markdown`: o que a tela mostra, o método, os limites e o que não concluir dela.
- **Natureza visível (v0.3):** todo item de síntese, condição e premissa mostra a natureza (fato,
  hipótese, premissa, decisão) como rótulo de texto, nunca só por cor.
- **Todo gráfico tem "ver tabela"** com os mesmos números (acessibilidade e conferência).

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

**Acréscimos da v0.2 ao Mapa.**

- **Camadas novas**, com a legenda agrupada em Oferta, Território, Comércio, Terra e Regulatório:
  9. hexágonos por métrica do catálogo (rádio de métrica, seletor de ano; a partir de
     `hex_zoom_min`, r9; abaixo, o pai r8), por `/territorio/celulas`;
  10. coroplética das localidades por qualquer métrica do catálogo (substitui o preenchimento da
      camada 2 quando ligada);
  11. zoneamento do PDOT (polígono com ficha da zona);
  12. pontos comerciais por categoria (só `precisao_coordenada` `endereco` e `osm_exata`);
  13. áreas de estudo (contorno e anéis; as próprias em destaque);
  14. lotes Terracap (cor por situação) e licenças (alvará e habite-se).
- **Recorte por área (D-24):** "Desenhar área" (`urbi-mapa modo="desenhar-poligono"`) ou "Raio a
  partir de um ponto" (`modo="desenhar-ponto"` + raio). O recorte filtra a lista e recalcula os
  KPIs; vai à URL como `poligono=<polyline>` ou `ponto` e `raio`; "Salvar como área de estudo"
  leva o desenho para `/estudos`.
- **Seletor temporal:** mês dos retratos (camada de anúncios, por `anuncio_retratos`) e ano do
  censo (camadas de célula), em `urbi-chips-atalho`.
- **KPIs do recorte** ganham: imóveis distintos (D-26), mediana do índice estratificado da
  localidade quando há uma só, e histograma de preço/m² (`urbi-grafico-colunas`).
- **Fora da V1:** mapa de calor de densidade (o hexágono cumpre o papel; D-53), cluster de pontos
  e dois mapas sincronizados `[CONFIRMAR SDK P-19]`.
- **Camadas da v0.3:** restrições do sítio (APP, UC, declividade, ARIS e ARINE), com legenda por
  tipo; equipamentos públicos por tipo e rede; perímetros estratégicos das áreas de estudo, com
  cor por papel.

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
10. **Oferta ampliada** (v0.2): fração com redução de preço, redução mediana, idade do estoque,
    dias até sair, saídas em até 30 dias, último preço pedido antes de sair; todos por imóvel.
11. **Índice de oferta estratificado** ao lado da mediana bruta, com estratos imputados contados.
12. **Contexto macro e de crédito**: as séries de `series_macro` por papel, com o mês do IVV
    alinhado.
13. **Estoque de lançamentos por status** (na planta, em obra, pronto) e VSO/LsO onde a fonte
    permitir (D-32).

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

Acréscimos da v0.2: toda série por localidade mostra se é nominal ou padronizada, com a quebra de
limite marcada (D-36); número da PDAD com `cv_frac` acima de `pdad_cv_alerta_frac` vem com aviso
de cautela, e cobertura amostral baixa vem escrita (D-29); a Base de dados ganha o catálogo de
métricas inteiro, com natureza, rateio e fonte.

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
- **Empreendimentos** (v0.2): lista e ficha com os vínculos (lançamento, anúncios, licenças,
  lote Terracap) e o estágio derivado; criar, editar, desvincular.
- **Lotes Terracap** (v0.2): `urbi-inbox` com a ficha, os derivados e o mini-mapa; importação de
  CSV do edital e do resultado.
- **Licenciamento de obras** (v0.2): idem, com importação de CSV.
- **Faixas de programa** (v0.2): tabela editável com vigência e link da portaria.

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
- **Agrupamentos e vínculos** (v0.2): duas filas, grupos de anúncios sugeridos (anúncios lado
  a lado, confirmar, descartar, separar) e sugestões de vínculo a empreendimento (aceitar,
  rejeitar).
- **Fontes de portal** ganha a coluna e a ficha de **saúde do parser** (seção 8.4.1).
- **Uso e frescor** (v0.3): uso agregado por tela e semana (sem nomes); frescor de cada fonte
  com a situação; botão de limpar cache (operador); versões em uso (`/sobre/versoes`).

### 10.8 Config (nativa do shell)

Abas que o shell monta sozinho a partir do manifesto: Parâmetros (seção 4.3), Rotinas (status,
horário, "Rodar agora", log), IA (overrides por slot, utilização, histórico), Eventos, Usuários
(papéis `curador` e `operador`), Arquivos (TTL dos anexos, só leitura). A app não declara
`telas_config`: o que é operação de domínio está em `/operacao/*`.

### 10.9 Início (`/inicio`, v0.2)

`urbi-shell-page` com `urbi-stack`: achados de maior pontuação da cidade e das áreas próprias
(cartões com `texto_curto`, direção e link para a tela de origem), **condições de tese vencidas ou
em risco** e **diligências com prazo na semana** das áreas próprias (v0.3), análises novas do mês,
estado das fontes e da saúde do parser, fontes atrasadas, visões salvas fixadas. É a resposta a "o que mudou desde a
última vez que olhei".

### 10.10 Estudos de área (`/estudos`, `/estudos/:id`, `/estudos/comparar`, v0.2)

- **Lista:** `urbi-inbox` por tipo e estágio, com mini-mapa; "Nova área" por desenho, por ponto
  ou por importação de KMZ.
- **Dossiê (v0.3, D-56):** `urbi-2x1` com o mapa da área, dos anéis e dos perímetros à esquerda
  e, à direita, `urbi-abas` nas quatro escalas do método, mais as abas de trabalho:
  - **Regional:** contexto macro e de crédito, IVV e FipeZap da cidade, posição da localidade no
    ranking dos indicadores-chave.
  - **Urbana:** a localidade que contém a área (perfil, série padronizada, pipeline, Terracap,
    expansão urbana), centralidades de emprego próximas.
  - **Entorno (por anel):** demografia e renda, formação domiciliar, emprego e acessibilidade,
    oferta e preço (por imóvel, com a natureza do preço), lançamentos e pipeline, comércio e
    lacunas, âncoras e equipamentos, tráfego dos trechos próximos, novas edificações.
  - **Sítio:** área bruta e líquida estimada, restrições por tipo, zona do PDOT e regularização,
    edificações existentes, acesso à via de maior centralidade.
  - **Síntese e agenda:** os cinco grupos com natureza e evidência; itens propostos pela IA para
    aceitar ou descartar; a agenda de decisão.
  - **Tese:** os dez componentes, as condições necessárias e de interrupção com status, prazo e
    métrica monitorada; histórico de versões.
  - **Diligência:** as perguntas por frente, com as respondidas pelo app marcadas para confirmar.
  - **Âncoras:** hipóteses de âncora com simulação, "a âncora traz" e "a UP traz".
  - **Viabilidade:** cenários vertical e loteamento, sensibilidade, comparação com pedido e
    arrematado.
  - **Linha do tempo:** `area_eventos` e observações de campo.
  Cada bloco tem o rodapé "fonte · período · método · fração coberta" e, quando houver, a marca de
  fonte atrasada. Seletor de anel no topo.
- **Modo campo (v0.3, D-78):** no celular, a área abre direto no mapa com anéis, perímetros e
  restrições; "Registrar observação" pega texto, foto e a posição do aparelho
  `[CONFIRMAR SDK P-39]`.
- **Portfólio (v0.3, D-66):** `urbi-tabela` das áreas próprias (e das outras por filtro) com
  estágio, seis indicadores-chave, condições por status, diligências abertas por frente e data
  da última ficha; mapa de todas; clique abre o dossiê.
- **Ficha:** escolher "uma página" ou "detalhada", marcar e ordenar as seções, gerar (congela em
  `area_estudo_fichas`), baixar em Markdown, CSV ou pacote. PDF e Word dependem de contrato
  `[CONFIRMAR SDK P-20]`. Leiaute da **uma página** (v0.3): cabeçalho (nome, tipo, estágio, data,
  "uso interno" quando `tipo = propria`, mapa com anéis); seis indicadores (domicílios no anel
  médio, formação domiciliar anual, renda média rateada, R$/m² pedido mediano, unidades no
  pipeline, R$/m² arrematado da localidade), cada um com natureza e fonte; três maiores lacunas
  de produto; três maiores lacunas comerciais; sítio (área líquida estimada, zona do PDOT);
  síntese aceita em cinco linhas curtas; três próximas perguntas de maior impacto; rodapé de
  fontes, versões e método. A **detalhada** acrescenta as quatro escalas, a tese com condições, as
  hipóteses de âncora e a viabilidade.
- **Comparar áreas:** 2 a 6 áreas, mesma tabela e `urbi-grafico-colunas` agrupadas.

### 10.11 Produto (`/produto`, `/produto/matriz`, `/produto/benchmark`, v0.2)

- **Demanda e capacidade:** recorte por localidade ou área de estudo; perfil de demanda em
  `urbi-kpi` e gráficos; capacidade de pagamento como colunas por faixa de preço alcançável, com
  a taxa usada e a origem dela escritas; seletor de programa.
- **Matriz de produto:** `urbi-mapa-de-calor` tipologia × faixa de preço, alternando demanda,
  oferta, lacuna e absorção; clique na célula abre os anúncios e lançamentos dela. Aviso fixo:
  a conversão de tamanho de domicílio em quartos é hipótese declarada.
- **Benchmark de lançamentos:** `urbi-tabela` dos comparáveis com régua P25–P50–P75 e posição de
  um produto hipotético digitado (área e preço).

### 10.12 Comércio e âncoras (`/comercio`, `/simular`, `/gemeas`, `/lentes`, v0.2)

- **Potencial e lacunas:** escolher categoria; mapa de lacuna por célula ou localidade; tabela
  das categorias com gasto potencial, estabelecimentos e razão contra a cidade; filtro pela área
  de estudo.
- **Simular âncora:** clicar um ponto (ou escolher uma área própria), categoria e porte; o
  resultado do Huff por anel, com os concorrentes considerados e os parâmetros escritos; botão
  "Levar para a ficha".
- **Áreas gêmeas:** referência (área, localidade ou célula), resultado no mapa e em tabela com
  o que aproxima e o que afasta.
- **Lentes de aptidão:** lista de lentes; editor de pesos para o curador; mapa do score com a
  decomposição ao clicar.

### 10.13 Terra e oferta futura (`/terra`, `/terra/pipeline`, v0.2)

- **Licitações Terracap:** resumo por localidade (medianas de R$/m² de terreno e de potencial,
  ágio, propostas, fração vendida), série por ano e mapa dos lotes; sempre com "preço arrematado
  em licitação" escrito.
- **Pipeline de oferta:** unidades por estágio (licenciado, em obra, lançado, concluído) por
  localidade, meses de absorção futura e a lista dos empreendimentos.
- **Mercado de lotes (v0.3):** por localidade e faixa de área de lote: pedido (anúncios de
  terreno), arrematado (Terracap) e residual (cenários), lado a lado, com a natureza de cada um e
  a amostra; mapa dos lotes anunciados e licitados.
- **Viabilidade expedita (v0.3):** formulário de premissas com a origem de cada uma (parâmetro,
  benchmark, série, manual) e as que diferem do padrão destacadas; resultado em linhas, residual
  total e por m², grade de sensibilidade em `urbi-mapa-de-calor`, comparação com pedido e
  arrematado; "Salvar cenário" liga à área de estudo. Rótulo fixo: simulação expedita, não
  substitui avaliação.

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

Além do CSV, o **pacote com proveniência** (D-28, seção 6) acompanha o modelo do Our World in
Data: os dados, os metadados em JSON e um LEIAME com a citação, para o número sair do app com a
fonte junto.

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

Na v0.2, a versão 2 do manifest (D-49) acrescenta o papel `tabela` (CSV com `tabela_destino` e
`chave_natural`, seção 7.5). O pipeline publica as duas formas do mesmo dado quando ele também
é desenhado: GeoJSON para o mapa, CSV para a consulta. A mudança de contrato entra primeiro no
`docs/DATA_CONTRACT.md` do repositório do pipeline, no mesmo PR que muda o pipeline.

### 12.3 Equilíbrio de custo

- Só baixa conjunto cujo `content_hash` difere do `ativo`; conjunto inalterado não gera tráfego.
- Um conjunto por execução quando o total passa de 20 MB; continuação por agendamento.
- Arquivo baixado é conferido (`bytes`, `sha256`) antes de subir; o shell guarda o blob uma vez.
- No frontend, cada arquivo é buscado uma vez por sessão e memoizado por `sha256`; a URL leva
  `?v=<sha8>` e a rota responde `Cache-Control: immutable`.
- `ra_aggregates.json` vira linhas de `agregados_territoriais`, que é o que Ranking, Comparar,
  Diagnóstico e a análise de IA leem; as camadas finas só são baixadas quando alguém liga a
  camada no mapa.

### 12.4 Pipeline fase 2 ampliado (V1, fases 4, 4A e 7)

A v0.1 deixava a fase 2 do pipeline para o futuro. Na v0.2 ela vira a fonte das fases 4A e 7.
Todo conjunto abaixo sai também em tabela por célula (`celula_metricas`) ou por ponto, com o
manifest 2.

| Código | Fonte | Saída para a app | Fase |
|---|---|---|---|
| `celulas_r9` | grade H3 r9 do DF (e da segunda cidade) | `celulas` com centroide, geometria, vizinhos, pai r8, localidade | 4A |
| `ibge_grade` | Grade Estatística IBGE 200 m, 2010 e 2022 (já no pipeline) | domicílios e população por célula, pelo centroide da quadrícula | 4A |
| `aop_ipea` | Projeto Acesso a Oportunidades, H3 r9 (já no pipeline como `jobs_hex`) | empregos por escolaridade, acessibilidade a empregos e serviços por modo, tempo até saúde e escola; população e renda do AOP com a flag de base 2010 | 4A |
| `cnefe_2022` | CNEFE do Censo 2022, endereços com coordenada e espécie | domicílios particulares, estabelecimentos e outras espécies por célula; é o **peso de rateio** | 4A |
| `censo_2022_setores` | agregados por setor do Censo 2022, conforme publicados | variáveis do setor rateadas para as células pelo CNEFE | 4A |
| `composicao_localidades` | limites antigos e vigentes + CNEFE | `localidade_composicao` | 4A |
| `pdot_zoneamento` | zoneamento do PDOT (catálogo do IPEDF, WFS) | camada vetorial + zona dominante por célula | 4 |
| `comercio_cnpj` | estabelecimentos do CNPJ (Base dos Dados), CNAE → categoria | estabelecimentos por categoria e célula; `pontos_comerciais` das categorias com `huff` | 7 |
| `comercio_osm` | POIs do OpenStreetMap | idem, como segunda fonte e para o que o CNPJ não localiza | 7 |
| `potencial_consumo` | POF/IBGE (participação do gasto por faixa de renda) × domicílios e renda da célula | gasto potencial anual por categoria e célula | 7 |
| `mapbiomas_urbano` | MapBiomas, cobertura anual desde 1985 | área urbanizada por célula e ano | 7 |
| `open_buildings` | Google Open Buildings 2.5D Temporal, 2016–2023 | presença, contagem e altura média de edificação por célula e ano | 7 |
| `jobs_cep_2023` | empregos 2023 por CEP (BigQuery, Base dos Dados; issue #159) | empregos por célula | 7 |

Cada conjunto registra licença, ano de referência e método no manifest `[PENDENTE P-14]`.
MapBiomas e Open Buildings exigem processamento de raster com credencial no Actions
`[PENDENTE P-30]`.

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
  "analise_falhou":         { "campos": ["tipo", "recorte", "erro"],              "conteudo": "Análise {tipo} de {recorte} falhou: {erro}",                   "api": "analises/estado",            "rota": "analises" },
  "parser_degradado":       { "campos": ["fonte_id", "fonte", "campos"],          "conteudo": "Parser de {fonte} degradado: {campos}",                          "api": "fontes/{fonte_id}/saude",     "rota": "operacao/fontes" }
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

Fora da V1 (D-52): um evento de domínio `mudanca_relevante`, publicado por `calcular_achados`
para achado acima de um limiar, com inscrição opcional por localidade ou área. Reabre a D-14 e
só entra quando houver uso que peça.

---

## 14. Permissões e papéis

| Nível | Quem | O que faz |
|---|---|---|
| (sem permissão) | todo usuário da instância, por padrão (D-13) | não vê a app |
| `leitura` | liberado individualmente | vê todas as telas, exporta CSV, abre análises |
| `escrita` + `curador` | | cadastra e corrige anúncios, lançamentos, âncoras, contornos e localidades; aprova e rejeita candidatos; gera análises; e, na v0.2, empreendimentos, lotes Terracap, licenciamento, faixas de programa, lentes, grupos de anúncios, vínculos e as áreas `propria` |
| `escrita` + `operador` | | gerencia fontes e buscas, roda verificações e buscas agora, importa CSV, carrega dados públicos, resolve achados; gera análises |
| `escrita` sem papel | | gera análises; cria e edita as **próprias** áreas de estudo (exceto `tipo = propria`) e, nelas e nas áreas em que é responsável, perímetros, síntese, tese, condições, diligências, hipóteses de âncora, cenários e observações; gera fichas e salva visões. Rotas de cadastro e operação exigem o papel e respondem `403 PAPEL_EXIGIDO` |
| `admin` | | tudo acima mais a Config (parâmetros, rotinas, IA, usuários e papéis). Como o shell não concede papéis ao admin automaticamente, o admin que também cura atribui a si o papel |

Gate de papel em código: `exigirPapel('curador')` lê `req.contexto.rolesApp`. Nas tabelas do
método da oportunidade, a regra é "autor, responsável da área ou curador"; nas áreas
`tipo = propria`, só responsável e curador escrevem. Nenhuma rota
olha `usuario.tipo` nem `natureza`. Externos: a app não declara `aceita_externos`.

---

## 15. Fases de implementação

Cada fase termina com release instalável na Pinguim e com a documentação em `docs/` da app
atualizada. As fases mais distantes têm menos detalhe de propósito: o detalhe cresce quando a
fase anterior mostra o que a realidade pede. Estimativa em **sessões** de implementação com
agente (uma sessão ≈ um PR grande revisado), não em dias.

Ordem na v0.3: 0 → 1 → 2 → 3 → 4 → **4A** → **4B** → **4C** → 5 → 6, com a **7** podendo correr em
paralelo à 6, porque depende sobretudo do pipeline. Cada fase de 4A em diante fecha com as
jornadas da seção 24 que lhe cabem e com o golden set. A fase 5 (IA) vem depois da 4B porque a análise de
área e a camada de achados dependem dela. Cada fase abaixo lista no fim os **acréscimos da
v0.2**.

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

**Acréscimos da v0.2:** nenhum de desenho; a legenda com classes já era exceção prevista. O
roteador de sub-rotas já nasce com as rotas novas do `nav` apontando para "em construção".

**Acréscimos da v0.3:** `uso_eventos` desde o primeiro dia (D-72), para que a decisão de seguir
de fase use uso real; `comum/tipos.ts` com `Procedencia` e `ValorMetrica`; regra de
`CONFLITO_VERSAO` nos `PATCH` de cadastro; botão "Como ler" nas telas da fase; `comum/higienizar.ts`
(a coleta da fase 3 já nasce com ele).

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

**Acréscimos da v0.2:** `comum/metricas.ts` (catálogo com natureza, rateio e sentido, D-22,
D-35), que substitui `comum/indicadores.ts`; coroplética das localidades por qualquer métrica;
exceção de dispersão; estoque de lançamentos por status e VSO/LsO (D-32); déficit habitacional e
coabitação por importação; `cv_frac` e `erro_padrao` na PDAD com o aviso de cautela (D-29).

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

**Acréscimos da v0.2:** `anuncio_grupos`, rotina `agrupar_anuncios` e a fila de agrupamentos
(D-26); `preco_inicial_brl` e as métricas ampliadas (D-25); `indice_oferta_mensal` (D-40);
`fonte_saude` e o erro `parser_degradado` (D-27); recorte por polígono e raio no Mapa (D-24);
seletor temporal dos retratos; pacote com proveniência (D-28).

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

**Acréscimos da v0.2:** camada regulatória do PDOT (D-30); `series_macro`, rotina
`carregar_series_macro` e o bloco macro do Mercado (D-31); manifest 2 com papel `tabela` (D-49),
ainda sem conjunto tabular.

**Acréscimos da v0.3:** `comum/fontes.ts`, rotina `verificar_frescor` e a tela de frescor (D-71);
`equipamentos_publicos` (INEP, CNES, OSM) com a camada e a promoção a âncora (D-62).

### 15.4A Fase 4A — Grade analítica (2 a 3 sessões)

**Schema:** `celulas`, `celula_metricas`, `localidade_composicao`; `h3_r9` em `anuncios`,
`lancamentos`, `ancoras` (preenchido por um passo de recálculo para o que já existe);
`sql_declarado` `agrega_celula_metricas`, `contagem_por_celula`.

**Pipeline:** conjuntos `celulas_r9`, `ibge_grade` e `aop_ipea` também em tabela; `cnefe_2022`,
`censo_2022_setores`, `composicao_localidades`.

**Backend:** `comum/celulas.ts` (pertencimento por centroide, raio, polígono, polyline), rateio
pelo catálogo; carga tabular fatiada; rotas 6.10.

**Frontend:** camada hexagonal com legenda e procedência; série nominal × padronizada no
Diagnóstico.

**Pronto quando:** a soma de domicílios das células de cada RA bate com `agregados_territoriais`
dentro de 1%; o enriquecimento de três raios em volta de três pontos escolhidos confere com um
cálculo manual no QGIS; a série de domicílios de Planaltina aparece nominal e padronizada, com a
quebra de 2022 marcada; a camada hexagonal desenha o DF no zoom 12 sem travar no celular de
referência `[CONFIRMAR SDK P-17]`.

**Acréscimos da v0.3:** restrições do sítio por célula e a camada vetorial (D-61); natureza
`amostra` e `categorica` no catálogo e o catálogo inicial (D-67); `versao_metodo` e
`comum/versoes.ts` (D-70); `cache_calculos` e `geracao_cadastro` (D-69); rotinas
`recalcular_derivados` e `limpar_retencao`; `ResultadoEnriquecimento` como contrato; golden set
montado (P-37) e conferido no "pronto quando".

### 15.4B Fase 4B — Áreas, demanda e produto (3 a 4 sessões)

**Schema:** `areas_estudo`, `area_estudo_fichas`, `empreendimentos`, `vinculo_sugestoes`,
`terracap_lotes`, `licenciamento_obras`, `faixas_programa`; `sql_declarado`
`mediana_terracap_por_localidade`, `pipeline_oferta_localidade`.

**Backend:** rotas 6.11, 6.12, 6.14, 6.15; dossiê; `comum/produto/` (capacidade e matriz);
rotina `vincular_empreendimentos`.

**Importação:** modelos de CSV de lotes Terracap, licenças e faixas; primeira carga de editais
de 2024 em diante e das licenças disponíveis.

**Frontend:** Estudos de área (lista, dossiê, ficha, comparar); Produto (demanda e capacidade,
matriz, benchmark); Terra e oferta futura; Cadastro de empreendimentos, lotes, licenças e
faixas; fila de vínculos; anéis de âncoras existentes no dossiê.

**Pronto quando:** as áreas próprias da UP estão cadastradas e cada uma tem uma ficha de uma
página gerada e baixada em Markdown; a capacidade de pagamento de uma localidade confere com uma
planilha feita à mão para três faixas de renda; a mediana de R$/m² arrematado de uma localidade
confere com os editais lidos à mão; um empreendimento aparece com lançamento, alvará e anúncios
vinculados.

**Acréscimos da v0.3:** estágios da escada de maturidade (D-55); dossiê nas quatro escalas e
`Dossie` como contrato (D-56); sítio no dossiê (área líquida); `cenarios_viabilidade`, as rotas
6.19, a tela de viabilidade e o mercado de lotes (D-63, D-64); leiaute da ficha de uma página;
jornada J1.

### 15.4C Fase 4C — Tese, diligência e portfólio (2 a 3 sessões)

**Schema:** `area_perimetros`, `area_sintese_itens`, `teses`, `tese_condicoes`, `diligencias`,
`hipoteses_ancora`, `area_eventos`, `observacoes_campo`.

**Backend:** rotas 6.17 e 6.18; semente de perguntas de diligência (`comum/diligencia.ts`) e o
pré-preenchimento pelo app; agenda de decisão; portfólio; métrica monitorada nas condições.

**Frontend:** abas Síntese e agenda, Tese, Diligência, Âncoras (sem simulação ainda), Linha do
tempo; Portfólio; modo campo; perímetros no mapa.

**Pronto quando:** as jornadas J2 (sem a parte de âncora), J5 e J7 são feitas na Pinguim por
alguém da equipe; uma condição com métrica monitorada muda de status sugerido depois de um
`calcular_achados`; um item `fato` sem evidência é recusado com o erro certo.

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

**Acréscimos da v0.2:** `achados_mercado`, rotina `calcular_achados` e a seção 9.7 (D-21);
slot `analise_area` e a análise de área no dossiê e na ficha; `achado_ids` no schema de resposta;
tela de Início (D-33); `visoes_salvas`. O "pronto quando" ganha: toda análise do mês cita ao menos
três achados por `id`, e nenhum achado citado é desconhecido.

**Acréscimos da v0.3:** extensão do schema de `analise_area` (síntese, hipóteses, perguntas) e a
rota `/analises/:id/propor-sintese`; pesos e fórmula da pontuação (D-68); achado
`condicao_em_risco`; Início com condições vencidas e diligências da semana; jornada J4.

### 15.6 Fase 6 — Fechamento da migração (1 sessão)

- Planilha em somente leitura; gatilhos do Apps Script removidos; `README.md` do repositório
  passa a apontar para a app e marca o site como legado.
- Site estático congelado em uma tag; GitHub Pages pode seguir no ar como arquivo histórico ou
  ser desligado (decisão do dono).
- `docs/PRODUCT_PLAN.md`, `ARCHITECTURE.md`, `DATA_CONTRACT.md`, `SHEET_SETUP.md` recebem um
  aviso de que descrevem o legado.

### 15.6A Fase 7 — Comércio e âncoras (3 a 4 sessões; pode correr em paralelo à 6)

**Schema:** `pontos_comerciais`, `lentes`; `categoria_consumo` e `atratividade` em `ancoras`.

**Pipeline:** `comercio_cnpj`, `comercio_osm`, `potencial_consumo`, `mapbiomas_urbano`,
`open_buildings`, `jobs_cep_2023`.

**Backend:** `comum/comercio/` (categorias, lacunas, Huff), `comum/espacial/` (similaridade,
score, Gi*); rotas 6.13; achados `lacuna_comercial` e `bolsao`.

**Frontend:** Comércio e âncoras (potencial e lacunas, simular, gêmeas, lentes); camadas de
pontos comerciais, expansão urbana e novas edificações; seção de comércio no dossiê e na ficha.

**Pronto quando:** a contagem de supermercados por RA confere com uma amostra verificada à mão
em duas RAs; a simulação de Huff de uma âncora existente, rodada como se ela não existisse,
devolve participação coerente com a localização dela (teste de sanidade, não de calibração); a
ficha de prospecção de uma área própria sai com potencial, concorrência, fluxo e hipótese de
âncora.

**Acréscimos da v0.3 à fase 7:** categorias iniciais com CNAE conferido (P-25); simulação de Huff
gravada na hipótese de âncora; seção de âncora na ficha detalhada; jornada J3.

### 15.7 Futuro (fora da V1, detalhado na medida do possível)

- **Pipeline fase 2 (#159):** saiu do Futuro na v0.2 e entrou nas fases 4A e 7 (seção 12.4).
- **Modelo 2 (#154):** painel longo `cidade × ano × variável × fonte` com cenários e backtest.
  Na app, viraria `cidades` com mais linhas, `agregados_territoriais` com `conjunto_codigo =
  warehouse_*` e uma tela "Cidades"; previsão só publicada com backtest ao lado, como o
  `warehouse/README.md` já exige. A análise de IA de mercado ganharia o bloco de cidades
  comparadas.
- **Módulo `imobiliario` (D-06):** ligar `lancamentos` e `empreendimentos` a `incorporacoes`, e
  as `areas_estudo` de `tipo = propria` aos imóveis da UP, por referência lógica (só o id),
  quando a UP passar a cadastrar no núcleo; `dependencias` no manifesto com `imoveis: ["ler"]`.
- **Proxy de saída (D-09):** se a Pinguim medir bloqueio, uma VPS mínima com `tinyproxy` e
  firewall para o IP da instância, URL em `proxy_saida_url`; runbook em `docs/coleta.md`.
- **Páginas públicas:** se um dia parte do mapa voltar a ser pública, `paginas_publicas` com
  componente próprio sem tokens de tema e rotas `GET` em `rotasPublicas` filtrando o que é
  público; nada disso está desenhado.
- **Segunda cidade:** linha em `cidades`, localidades por importação, séries por importação;
  o que falta medir é o custo do IVV e do FipeZap de outra praça, que são publicações de outras
  entidades.
- **Isócronas (D-52):** tempo a pé e de carro a partir das áreas salvas, calculado no pipeline
  com motor de rota (r5r ou OSRM) e carregado como polígono; na V1, os anéis por raio cumprem o
  papel.
- **Raster direto no mapa, cluster de pontos e dois mapas sincronizados (D-52)**
  `[CONFIRMAR SDK P-19]`.
- **Ficha do lote (D-52):** lote registrado com parâmetros urbanísticos, no modelo do GeoSampa,
  se o Geoportal publicar `[PENDENTE P-15]`.
- **ITBI (D-52):** tabela `transacoes_declaradas`, natureza "declarado", e o gap pedido ×
  declarado, quando houver acesso `[PENDENTE P-08]`.
- **Aviso de mudança relevante (D-52):** seção 13.
- **PDF e Word da ficha** `[CONFIRMAR SDK P-20]`.

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
| D-21 | Achados calculados em código, ranqueados, antes da IA; a IA cita achados por `id` | Deixar a IA descobrir o que mudou lendo as séries | O D-01 já tirava o número da IA; tirar também o achado deixa o texto conferível e mais barato (modelo do Tableau Pulse) |
| D-22 | Catálogo de métricas em código com unidade, natureza, fonte, fórmula e `sentido` | Metadado espalhado por tela | Uma definição serve à tela, ao mapa, aos achados e à IA |
| D-23 | Áreas de estudo como entidade, com `tipo` própria, prospecção ou referência, dossiê e ficha congelada | Estudo feito fora do app (KMZ, planilha, deck) | É o objeto em torno do qual Novos Negócios trabalha (LandInsight, Atlas, Placer) |
| D-24 | Polígono e raio desenhados no Mapa viram recorte de KPIs e de análise | Desenho só no Cadastro de contornos | A pergunta "o que existe aqui" é sobre um lugar, não sobre uma RA |
| D-25 | Métricas de oferta ampliadas: redução de preço, idade do estoque, tempo até sair, último preço antes de sair | Só ativos, novos, inativados e medianas | O histórico de eventos já permite; são as métricas que mais dizem sobre liquidez (Redfin) |
| D-26 | Agrupamento de anúncios do mesmo imóvel, sugerido por regra e confirmado pelo curador; métricas por imóvel | Deduplicar só por URL ou id externo | O mesmo imóvel em vários portais e corretores infla as medianas (FipeZap filtra duplicados antes do cálculo) |
| D-27 | Saúde do parser por fonte contra linha de base, com erro `parser_degradado` | Só o estado de bloqueio | A falha silenciosa (HTML mudou, campo vazio, HTTP 200) não aparece como bloqueio |
| D-28 | Exportação em pacote com dados, metadados e LEIAME com citação | Só CSV | O número sai do app com a fonte junto (Our World in Data) |
| D-29 | Erro padrão e coeficiente de variação da PDAD, com aviso acima do limiar | Mostrar estimativa amostral como número exato | A PDAD-A 2023 teve baixa resposta justamente nas RAs centrais |
| D-30 | Zoneamento do PDOT como conjunto público vetorial e por célula; LUOS depois | Sem camada regulatória | Toda leitura de terreno começa pelo que a lei permite |
| D-31 | Séries macro e de crédito carregadas pela própria app, por rotina, de API pública | Pelo pipeline | É pouco dado e muda todo mês; a rotina Node faz em segundos |
| D-32 | Estoque de lançamentos por status (pronto, em obra, na planta) e VSO/LsO onde a fonte permitir | Só contagem por estágio | Estoque pronto é o que pressiona preço (Órulo) |
| D-33 | Tela de Início com os achados do mês e visões salvas por usuário; notificação de mercado segue fora (D-14 mantida) | Avisos por e-mail desde já | Primeiro descobrir o que a equipe acompanha; aviso entra quando houver uso |
| D-34 | Célula H3 r9 como chave de junção universal, ao lado da localidade | Só localidade; ou grade IBGE como chave | É a grade do Ipea, que o pipeline já lê; a quadrícula IBGE entra nela pelo centroide |
| D-35 | Regra de agregação e rateio declarada por métrica; razão sempre recalculada | Média simples de valores por célula | Média de razões e rateio por área erram em silêncio (Esri, NHGIS) |
| D-36 | `localidade_composicao` com pesos e série marcada como nominal ou padronizada | Comparar por nome | Arapoanga e Água Quente saíram de Planaltina e do Recanto das Emas em 2022 |
| D-37 | Enriquecimento de qualquer área por rota de leitura | Só perfil da RA inteira | A ficha de um terreno precisa do entorno real |
| D-38 | `empreendimentos` como hub de lançamento, anúncio novo, licença e lote Terracap | Tabelas soltas | É o mesmo empreendimento em estágios diferentes (resolução de entidades, Cherre) |
| D-39 | `terracap_lotes` e `licenciamento_obras`, por importação primeiro e automação depois | Esperar fonte automática | A Terracap é o único preço de terra observado no DF; alvará e habite-se dão a oferta futura (Planning London Datahub) |
| D-40 | Índice de oferta estratificado com pesos fixos, sempre ao lado da mediana bruta | Só mediana simples | Separa variação de preço de mudança de composição (método FipeZap) |
| D-41 | Similaridade, score de lentes e Gi* em código, descritivos | Modelos estatísticos preditivos | Cabe nas rotas e é conferível; previsão segue proibida pelo D-01 |
| D-42 | Inventário comercial (CNPJ, OSM, CNEFE) e potencial de consumo (POF) pelo pipeline, por célula | Base comercial paga | Fontes públicas cobrem o essencial; a validação amostral diz onde não cobrem |
| D-43 | Modelo de Huff para simular uma âncora, com parâmetros escritos e rótulo de simulação | Não simular; ou modelo de vendas | Responde "o que esta âncora disputaria aqui" sem prometer venda |
| D-44 | Capacidade de pagamento e matriz de produto em código, com taxa vinda das faixas ou de `series_macro` | Taxa fixa em parâmetro | Taxa e faixa envelhecem; a origem fica escrita |
| D-45 | Funil de prospecção de âncoras fica no CRM; a app gera a ficha | Funil dentro da app | Fora do propósito e sem framework de integração usado |
| D-46 | Sem fluxo de pessoas por celular; substituído por tráfego do DER, mobilidade da PDAD e AOP | Comprar dado de mobilidade | Não há fonte pública no Brasil |
| D-47 | `reagir` exportado só com `continuar_coleta` | Manter a v0.1 | A v0.1 se contradizia: a seção 7 já dependia dele |
| D-48 | Pertencimento à célula por centroide mais próximo, sem biblioteca H3 em execução | Exigir a biblioteca no bundle | Tira a dependência de um contrato não confirmado; a lib substitui depois sem mudar schema |
| D-49 | Manifest 2 do pipeline com papel `tabela` (CSV), além do GeoJSON | Converter GeoJSON em linhas na app | Mantém o geoprocessamento no pipeline (D-05) e a app só carrega |
| D-50 | Três naturezas de preço (pedido, arrematado, declarado) nunca misturadas; mínimo de edital não é preço | Um "preço/m²" único | Confundir as três é o erro mais caro de uma leitura de terra |
| D-51 | Ordem das fases: 4A e 4B antes da 5; a 7 em paralelo à 6 | Fases novas depois da V1 | A IA de área depende da grade; comércio depende do pipeline |
| D-52 | Isócronas, raster no mapa, mapas sincronizados, ficha do lote, ITBI, aviso de mudança e PDF/Word ficam no Futuro | Incluir na V1 | Dependem de motor externo, de contrato não confirmado ou de acesso a dado |
| D-53 | Sem mapa de calor de densidade (kernel); a camada hexagonal cumpre o papel | Exceção de UI para kernel | O hexágono é conferível e já existe |
| D-54 | Ficha exporta Markdown, CSV e pacote na V1 | PDF desde já | PDF depende de contrato não confirmado (P-20) |
| D-55 | Estágios da área seguem a escada de maturidade da UP: sinal, hipótese, oportunidade, iniciativa, projeto, negócio ou ativo, encerrada (com aprendizado) | Estágios genéricos de funil | O app usa o vocabulário da equipe (doc. 02, §8), não inventa outro |
| D-56 | Dossiê nas quatro escalas (regional, urbana, entorno, sítio), fechado por síntese em cinco grupos que vira agenda de decisão | Dossiê organizado por tema de dado | É a leitura do doc. 05 (§28 e §44); a síntese produz agenda, não resposta prematura |
| D-57 | Todo item registrado numa área tem natureza (fato, hipótese, premissa, decisão); fato exige evidência; texto da IA nasce hipótese proposta | Texto livre | "Essas categorias não devem ser misturadas" (doc. 02, §86); protege a ficha de virar opinião com cara de dado |
| D-58 | Tese territorial estruturada em dez componentes, com condições necessárias e de interrupção, status, prazo e métrica monitorada | Tese em texto corrido | A tese precisa ser falsificável e acompanhada (doc. 05, §48 a §51) |
| D-59 | Perímetros estratégicos por área: aquisição, essencial, proteção, expansão, influência | Um polígono só | O perímetro de análise é maior que o de aquisição (doc. 05, §58) |
| D-60 | Diligência como perguntas por frente, semeadas por padrão e pré-respondidas pelo que o app sabe, sempre para confirmação humana | Checklist fora do app | Junta a pergunta-chave do doc. 05 (§61) ao dado que já está no app |
| D-61 | Restrições do sítio por célula (APP, UC, declividade, ARIS e ARINE) e área líquida estimada, rotulada como estimativa | Sem leitura do sítio | É a primeira pergunta de uma urbanizadora sobre uma gleba |
| D-62 | Equipamentos públicos (INEP, CNES, OSM) como camada própria, promovíveis a âncora | Cadastrar à mão como âncora | Volume e atualização; a âncora continua sendo curadoria |
| D-63 | Viabilidade expedita pelo método residual, vertical e loteamento, com premissas declaradas e comparação com pedido e arrematado | Sem viabilidade; ou planilha externa | Fecha o circuito produto → terra; é simulação rotulada, não avaliação |
| D-64 | Mercado de lotes com faixas de área próprias, juntando pedido, arrematado e residual | Lote misturado nas faixas de apartamento | A UP é urbanizadora; lote tem outra escala de área |
| D-65 | Hipóteses de âncora com "a âncora traz / a UP traz", modelo de parceria candidato e compromisso esperado; o funil segue no CRM | Âncora só como ponto no mapa | "Transformar contribuições em compromissos, não apenas intenções" (doc. 03) |
| D-66 | Portfólio das áreas próprias como tela | Acompanhar em planilha | Gerir o portfólio é um dos quatro usos do doc. 02 (§4.4) |
| D-67 | Naturezas `amostra` e `categorica` no catálogo: mediana recalculada sobre os pontos da área; categórica devolve distribuição | Agregar mediana de células | Mediana não se soma; zona não se faz média |
| D-68 | Pontuação de achados com dispersão robusta, pesos por tipo, fator de amostra e de qualidade declarados | Pontuação só por tamanho da variação | Evita que amostra pequena domine o Início e a IA |
| D-69 | Cache de cálculo com chave nas versões dos conjuntos, do método e numa geração de cadastro | Calcular sempre na hora | Dossiê de 8 s vira 1 s; correção manual invalida sem mapa de dependências |
| D-70 | `versao_metodo` em todo resultado derivado e `recalcular_derivados` para refazer | Resultado sem versão | Uma ficha antiga precisa dizer com que regra foi feita |
| D-71 | Frescor esperado por fonte e alerta de fonte atrasada no rodapé de cada número | Só a data da fonte | Dado velho é o erro silencioso mais comum de painel |
| D-72 | Telemetria mínima de uso desde a fase 1, agregada sem nome e com retenção curta | Sem medição | A regra "fase só começa quando a anterior foi usada" (R-26) precisa de medida |
| D-73 | Requisitos não funcionais com orçamentos de desempenho e limites de entrada | Desempenho como "deve ser rápido" | Dá critério ao QA de cada fase |
| D-74 | Higienização de dados pessoais na coleta e nas cargas | Guardar o bruto inteiro | Corretor pessoa física, CPF de MEI e nomes em editais não servem à análise |
| D-75 | Golden set de três áreas com valores à mão como aceite das fases 4A a 7 | Conferir por amostragem livre | Regressão numérica fica visível de uma fase para outra |
| D-76 | Fase 4C (tese, diligência e portfólio) entre a 4B e a 5 | Juntar na 4B | A 4B já é grande; a IA da fase 5 usa a síntese e a tese |
| D-77 | Botão "Como ler" em toda tela, com Markdown versionado em `comum/ajuda/` | Documentação só em `docs/` | Método e limite precisam estar onde o número está |
| D-78 | Observações de campo com foto e posição, na linha do tempo da área | Fotos em pasta compartilhada | A visita vira evidência ligada à área |

---

## 17. Pendências

P-11 (a contradição sobre `reagir`) foi resolvida pela D-47 e não aparece abaixo.

| Código | O que falta | Impacto se não resolvido |
|---|---|---|
| P-01 | O que são `EMPLOYMENT_PRELIMINARY`, `EMPLOYMENT_RA_PROFILE` e `WORKPLACE_RA_2018` (fonte, ano, unidade) | Decidir se viram linhas de `agregados_territoriais`, tabela própria ou morrem na migração |
| P-02 | Texto padrão das instruções de IA dos quatro slots de análise | Fase 5 escreve a primeira versão; a equipe refina na Config |
| P-03 | Cabeçalhos exatos de `PDAD_A_FIGURE_MAP`, `FIPEZAP_SOURCES`, `FIPEZAP_NOTES`, `PDAD_A_GUIDE`, `LISTINGS_COVERAGE`, `PDAD_A_COVERAGE` (não alcancei a planilha além da nona aba) | As tabelas `pdad_figuras` e `procedencias` têm `extras` justamente para absorver o que não está modelado; confirmar na primeira importação |
| P-04 | Repositório da app (D-16) e `identidade` do manifesto | Fase 0 |
| P-05 | Horários das rotinas no fuso da organização (quem define é o admin na Config) | Padrão 06:00 UTC até alguém mudar |
| P-06 | Quem são as pessoas da equipe que recebem `leitura`, `curador`, `operador`, `admin` na Pinguim | Liberação na instalação |
| P-07 | Se o GitHub Pages continua no ar como arquivo depois da fase 6 | Fase 6 |
| P-08 | Acesso ao ITBI da SEFAZ-DF (convênio ou LAI) | Sem o par pedido × declarado; fica no Futuro |
| P-09 | Se a segunda cidade é Campinas/RMC e quando | A grade e o dossiê funcionam lá; as telas de mercado ficam vazias com motivo |
| P-10 | Se vale contratar fonte paga de lançamentos (estilo Órulo) | Estoque por status depende de cadastro manual |
| P-12 | Formato e histórico dos dados de alvará e habite-se no portal da CAP/SEDUH | Licenciamento entra só por CSV manual |
| P-13 | Resultados da Terracap: leitura do DODF ou pedido direto à empresa | Arrematado entra à mão, edital por edital |
| P-14 | Licença de cada fonte nova (CNEFE, CNPJ, OSM, MapBiomas, Open Buildings, POF, AOP) | Conjunto sem licença não carrega |
| P-15 | Se o Geoportal publica lote registrado com parâmetros urbanísticos | Ficha do lote fica no Futuro |
| P-16 | SDK: `req.dados` filtra por lista de ids e com que teto; `sql_declarado` aceita parâmetro de lista | O enriquecimento cai no plano B (lotes de 500 e soma em código), mais lento |
| P-17 | SDK: quantos polígonos uma camada do `urbi-mapa` aguenta | Teto de células por resposta e r8 em zoom baixo ficam mais agressivos |
| P-18 | SDK: política do kit para bibliotecas de terceiros no bundle (H3, ZIP) | Pertencimento por centroide e pacote em três downloads (já previstos) |
| P-19 | SDK: raster, cluster e sincronização de viewport no `urbi-mapa` | Ficam no Futuro |
| P-20 | SDK: geração de PDF ou Word pelo framework de Arquivos | Ficha só em Markdown, CSV e pacote |
| P-21 | SDK: volume e tempo de carga de ~1 milhão de linhas por rotina fatiada | A carga de `celula_metricas` pode levar dias de continuação |
| P-22 | SDK: usuário com `leitura` pode gravar dado pessoal (visões salvas) por alguma via, como `rotasPessoais` | Visões salvas só para `escrita` |
| P-23 | Ano-base e fonte dos pesos do índice estratificado | O índice não é publicado até decidir |
| P-24 | Quais séries macro carregar (códigos e escalas) e se o custo de construção tem licença de uso | O bloco macro sai vazio |
| P-25 | Lista final de categorias de consumo, CNAEs e grupos da POF | Comércio começa por um conjunto mínimo (supermercado, farmácia, academia, escola, clínica) |
| P-26 | Geocodificação do CNPJ: por CEP, por endereço ou casada ao CNEFE | Pontos por CEP ficam fora de distância e de célula |
| P-27 | Calibração do expoente do Huff (sem dado de venda) | Simulação só serve para comparar cenários entre si |
| P-28 | Quem cadastra as áreas próprias da UP e de onde vem a lista oficial | Áreas próprias incompletas ou desatualizadas no Início e nas análises |
| P-29 | Se o IPEDF publica erro padrão ou CV por indicador, e qual limiar usar | Aviso de cautela só pela cobertura amostral |
| P-30 | Credencial do Earth Engine (ou alternativa) no Actions para MapBiomas e Open Buildings | Expansão urbana e novas edificações ficam fora da fase 7 |
| P-31 | Fontes e licenças de UC, APP e hidrografia, e do modelo de elevação para declividade, no DF | Restrições do sítio ficam incompletas; área líquida não é estimada |
| P-32 | Largura de APP adotada por padrão e quando usar a largura real do curso d'água | A área líquida usa a premissa de 30 m, declarada |
| P-33 | Se existe camada pública de situação fundiária (terra pública, Terracap) utilizável | A frente fundiária da diligência fica só humana |
| P-34 | CUB-DF: série, periodicidade e licença de uso | A viabilidade vertical exige custo de obra manual |
| P-35 | Premissas padrão da viabilidade (eficiência, fator sobre o CUB, despesas, impostos, margem, aproveitamento) validadas com a área financeira | Os padrões ficam marcados como ponto de partida |
| P-36 | Calibrar a tabela moradores → quartos com a PDAD por localidade | A matriz usa a tabela inicial declarada |
| P-37 | Escolher as três áreas do golden set e quem calcula os valores à mão | As fases 4A em diante não têm aceite numérico |
| P-38 | SDK: o shell já registra uso por tela? | A app grava `uso_eventos` |
| P-39 | SDK: posição do aparelho e envio de foto pelo celular no frontend da app | Modo campo só com texto e posição digitada |
| P-40 | Perguntas padrão de diligência por frente, revisadas com o doc. 05 e com o jurídico | A semente começa com as perguntas do doc. 05, §61 |
| P-41 | Repertório oficial de modelos de parceria para hipóteses de âncora, a partir do doc. 03 | `modelo_parceria` fica texto livre |

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
- **Grade e rateio (v0.2):** pertencimento por centroide contra uma fixture de pontos com o H3
  de referência calculado pelo pipeline (deve bater em 100% dos pontos fora da borda de
  projeção); raio e polígono → células; *encoded polyline* ida e volta; contagem soma, razão
  recalculada de numerador e denominador, média ponderada, `nao_agregavel` recusa; soma dos
  pesos de composição; série padronizada só para contagens.
- **Oferta (v0.2):** regra de agrupamento com casos que casam e que não casam em cada
  tolerância; métricas por imóvel; índice estratificado em que só a composição muda e o índice
  fica parado; preço de saída nunca rotulado como venda.
- **Produto e comércio (v0.2):** capacidade de pagamento contra três casos calculados à mão
  (Price e SAC); matriz cujas frações somam 1 por linha de demanda e de oferta; Huff com
  participações que somam 1 por célula e loja única com participação 1; áreas gêmeas em que a
  referência é a mais próxima de si; Gi* numa grade sintética com bolsão conhecido.
- **Terra e oferta futura (v0.2):** lote não vendido fora da mediana de arrematado; ágio;
  pipeline sem dupla contagem entre alvará e lançamento.
- **Achados (v0.2):** cada tipo com um caso positivo e um negativo; pontuação ordena; recorte
  sem amostra não gera achado; resposta da IA com `achado_id` desconhecido é descartada.
- **Carga tabular (v0.2):** troca de versão atômica (a leitura nunca vê o conjunto pela metade);
  retomada por cursor no meio do arquivo.
- **Gates (v0.2):** toda rota de cálculo é `GET` e responde para `leitura`; `tipo = propria` só
  com `curador`; visões só do próprio usuário.
- **Método (v0.3):** `fato` sem evidência recusado; item da IA nasce `proposto` e `hipotese`;
  publicar tese torna a anterior `substituida`; encerrar área sem motivo recusado; condição com
  métrica monitorada gera `condicao_em_risco` ao cruzar o limiar; semente de diligências
  idempotente; pré-preenchimento marca `respondida_app` e não fecha a pergunta.
- **Sítio e viabilidade (v0.3):** área líquida num polígono sintético com restrição conhecida;
  área abaixo do mínimo não estimada; residual vertical e de loteamento contra dois casos à mão;
  sensibilidade 3 × 3; premissa obrigatória ausente → `CENARIO_INCOMPLETO`.
- **Catálogo (v0.3):** natureza `amostra` recalcula a mediana dos pontos dentro da área (e não a
  das células); `categorica` devolve distribuição que soma 1.
- **Governança (v0.3):** a chave de cache muda com versão de conjunto, de método e com
  `geracao_cadastro`; `recalcular_derivados` não refaz o que já está na versão atual; frescor
  abre e fecha `FONTE_ATRASADA`; retenção apaga só o que venceu; higienização remove telefone,
  e-mail, CPF e nome de pessoa de uma fixture com todos eles.
- **Concorrência (v0.3):** dois `PATCH` com o mesmo `atualizado_em`, o segundo recebe
  `CONFLITO_VERSAO`.
- **Golden set (v0.3):** o dossiê das três áreas de referência contra a planilha versionada.

Os testes **só leem a pasta da app** (regra do guia de apps em repositório próprio).

### 18.2 Portas

- `pnpm build && pnpm exec urbi-empacotar inteligencia_imobiliaria` limpo em todo PR (CI do kit).
- `pnpm test` verde em todo PR; noturna contra o SDK mais novo.
- Revisão de PR pela skill `revisar-pr-apps` (bundle do SDK como referência, nunca o monorepo).
- QA na Pinguim pela skill `qa`, com o roteiro de cada fase derivado dos "Pronto quando" da
  seção 15, com o token do QA Principal (nunca sysadmin).

### 18.3 Critério global de pronto da V1

1. Todas as fases 0 a 7 (incluindo 4A, 4B e 4C) instaladas na Pinguim pela release, auto-update
   ligado.
2. Migração conferida (seção 11.3), planilha congelada, Apps Script sem gatilhos.
3. Paridade de 30 valores com o site (fase 2) e de 10 cenários de mapa (fase 1).
4. Sete dias de rotinas com log limpo ou bloqueio registrado.
5. Os "pronto quando" das fases 4A, 4B, 4C e 7 conferidos, incluindo as validações amostrais à
   mão (enriquecimento, capacidade, Terracap, contagem de comércio) e o golden set.
6. As sete jornadas da seção 24 feitas por pessoas da equipe, cada uma dentro da meta de tempo.
7. Docs da app completos; esta spec marcada como implementada e as seções que viraram
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
- **Célula:** hexágono H3 de resolução 9 (cerca de 0,1 km²); a chave de junção da grade.
- **Rateio:** repartição de um número de uma unidade (setor, localidade) para uma área que a
  corta, por um peso declarado (domicílios, população, estabelecimentos, área).
- **Composição de localidade:** pesos que levam uma localidade antiga aos limites vigentes.
- **Série nominal / padronizada:** comparada pelo nome / recalculada para os limites vigentes.
- **Grupo de anúncios:** anúncios do mesmo imóvel em portais ou anunciantes diferentes.
- **Imóvel (nas métricas):** um grupo confirmado conta uma vez.
- **Empreendimento:** o hub que liga lançamento, anúncios de unidade nova, licenças e lote.
- **Preço pedido, arrematado, declarado:** de anúncio, de licitação, de ITBI; nunca misturados.
- **Ágio:** valor arrematado sobre o preço mínimo do edital, menos 1.
- **Último preço antes de sair:** o pedido no momento em que o anúncio saiu; não é venda.
- **Pipeline de oferta:** unidades licenciadas ou lançadas ainda não concluídas.
- **Índice estratificado:** mediana por estrato com pesos fixos; separa preço de composição.
- **Área de estudo:** lugar desenhado ou marcado que a equipe analisa (própria, prospecção,
  referência). **Dossiê:** o cálculo vivo dela. **Ficha:** o dossiê congelado.
- **Capacidade de pagamento:** preço que uma faixa de renda alcança com as regras declaradas.
- **Matriz de produto:** tipologia × faixa de preço com demanda, oferta, lacuna e absorção.
- **Potencial de consumo:** gasto anual estimado de uma categoria numa célula.
- **Lacuna comercial:** gasto potencial por estabelecimento muito acima da mediana da cidade.
- **Modelo de Huff:** simulação da participação de uma loja pela atratividade e pela distância.
- **Áreas gêmeas:** lugares cujo vetor de métricas mais se parece com o de uma referência.
- **Lente:** conjunto de pesos que dá um score de aptidão por segmento.
- **Bolsão:** agrupamento de células com valores altos ou baixos (Gi*).
- **Achado de mercado:** fato detectado por regra (variação, mudança incomum, lacuna), com
  pontuação, que a tela e a IA usam.
- **Escada de maturidade:** sinal, hipótese, oportunidade, iniciativa, projeto, negócio ou ativo
  (doc. 02).
- **Natureza (de uma afirmação):** fato (com evidência), hipótese (a confrontar), premissa
  (assumida para a análise), decisão (escolha autorizada).
- **Quatro escalas:** regional, urbana, entorno, sítio (doc. 05).
- **Síntese:** forças, restrições, dependências, incertezas e opções de uma área. **Agenda de
  decisão:** a síntese ordenada, com as perguntas e condições que pedem ação.
- **Tese territorial:** explicação em dez componentes do que a área pode se tornar, com condições
  necessárias e de interrupção.
- **Perímetro estratégico:** aquisição, essencial, proteção, expansão, influência.
- **Diligência:** pergunta por frente cuja resposta pode mudar preço, estrutura, prazo, uso,
  posição ou decisão.
- **Área líquida estimada:** área do polígono menos as frações restritas das células; estimativa
  na resolução da grade.
- **Valor residual do terreno:** o que sobra do VGV depois de obra, despesas e margem; teto do
  que o terreno pode custar no cenário.
- **Golden set:** as três áreas de referência com valores calculados à mão.
- **Versão de método:** identificador da regra que produziu um resultado derivado.

---

## 20. Riscos e armadilhas

O que pode dar errado em silêncio, por etapa, e como a spec se protege. A lista é viva: cada
fase acrescenta o que encontrar e marca o que resolveu.

| Código | Etapa | Armadilha | Proteção |
|---|---|---|---|
| R-01 | 3, 4B | **Dupla contagem de oferta**: o mesmo imóvel em vários portais; lançamento, anúncio de unidade nova e alvará do mesmo empreendimento | métricas por imóvel (D-26); pipeline de oferta com regra anti-dupla (5.15) |
| R-02 | 3 | **Viés de composição**: a mediana sobe porque entrou mais cobertura no mês, não porque o preço subiu | índice estratificado sempre ao lado da mediana (D-40) |
| R-03 | 4A | **Média de razões e rateio por área** | catálogo com numerador, denominador e peso de rateio; teste de razão recalculada (D-35) |
| R-04 | 4A, 4B | **Falácia ecológica**: renda da RA rateada para 1 km em volta de um terreno herda a média da RA inteira | marca "rateado de localidade"; preferir dado de setor ou célula quando houver; a IA diz isso (9.3) |
| R-05 | 4A | **Bases de anos diferentes**: população e renda do AOP são do Censo 2010; a grade é 2010 e 2022 | flag `aop_population_2010_based`; denominador 2022 sempre que existir |
| R-06 | 2, 4A | **Quebra de série de RA** (Arapoanga, Água Quente) e **baixa resposta da PDAD-A 2023** nas RAs centrais | série nominal × padronizada (D-36); aviso de cautela (D-29) |
| R-07 | 4 | **Universo de domicílios 2010 × 2022** pode diferir (#164): crescimento domiciliar pode ser artefato | a flag `dwelling_universe_to_confirm` segue até a nota do IBGE confirmar |
| R-08 | 3 | **Saída de anúncio não é venda**: sai por venda, desistência ou troca de corretor | rótulo "último preço pedido antes de sair"; nunca "vendido" (D-50) |
| R-09 | 4B | **Terracap não é o mercado**: um vendedor só, mix próprio (projeções, lotes comerciais), mínimo de edital não é preço | natureza "arrematado"; não vendido fora da mediana; leitura por destinação |
| R-10 | 7 | **CNPJ não é loja aberta**: MEI em casa, sede fiscal, endereço de contador; geocódigo por CEP impreciso | cruzar com CNEFE e OSM; precisão `cep` fora de distância e de célula; validação amostral no "pronto quando" |
| R-11 | 7 | **POF de 2017–2018 e regional**: o potencial de consumo é ordem de grandeza | rótulo de estimativa; comparar áreas entre si, não com faturamento |
| R-12 | 7 | **Huff sem calibração** dá a resposta que o expoente quiser | rótulo de simulação; comparar cenários; teste de sanidade com âncora existente (P-27) |
| R-13 | 4B | **Moradores → quartos** é hipótese na matriz de produto | tabela declarada em código e aviso fixo na tela |
| R-14 | 4B | **Taxa e faixa de programa velhas** distorcem a capacidade de pagamento | taxa da faixa vigente ou de `series_macro`; origem da taxa escrita |
| R-15 | 4A, 7 | **Amostra pequena por célula** deixa R$/m² e bolsões instáveis | mínimo de 5 imóveis por célula; fator de amostra na pontuação (9.7) |
| R-16 | 3, 4A | **Coordenada aproximada**: se a maioria dos anúncios vier por jitter, a camada hexagonal de oferta fica rala e enviesada | anúncio sem coordenada exata não recebe célula; medir na fase 3 a fração exata por fonte antes de prometer oferta por célula |
| R-17 | todas | **`POST` exige `escrita`**: cálculo em `POST` some para quem só lê | todo cálculo que não grava é `GET`; polígono por *polyline*; polígono grande vira área salva |
| R-18 | todas | **`DELETE` é do admin** | remoção sempre por `PATCH …/remover` (soft-delete) |
| R-19 | 4A | **Carga de ~1 milhão de linhas** em rotinas de 15 minutos; tela vendo o conjunto pela metade | carga por cursor e troca de versão atômica (7.5); P-21 |
| R-20 | 4A | **Mapa com milhares de polígonos** trava no celular | r8 em zoom baixo, teto por resposta (P-17) |
| R-21 | 5 | **Ordem das rotinas mensais**: achados calculados antes do fechamento leem o mês errado | `calcular_achados` recusa rodar se o `fechar_mes` de `M` não concluiu; ordem configurada pelo admin (P-05) |
| R-22 | 5 | **IA confiante sobre achado fraco** | fator de amostra na pontuação; a IA cita o achado e a fonte; achado desconhecido é descartado |
| R-23 | 4B, 7 | **Dado sensível saindo do app**: áreas próprias da UP em ficha e pacote | permissão padrão nenhuma (D-13); ficha registra quem gerou; pacote só para quem vê a área |
| R-24 | 4B, 7 | **Dado pessoal**: CNPJ de MEI expõe parte do CPF; resultado de licitação e licença trazem nomes de pessoas | não guardar CPF, nome de pessoa física, arrematante nem responsável técnico; só categoria, porte e localização |
| R-25 | 4, 4A, 7 | **Dependência do pipeline** num repositório pessoal, com credenciais de BigQuery e Earth Engine | manifest com versão e hash; carga recusa conjunto inválido; credenciais e dono do repositório decididos antes da fase 7 |
| R-26 | 4B, 7 | **Escopo crescendo** além do que a equipe usa | cada fase tem "pronto quando" com validação à mão; uma fase só começa quando a anterior foi usada de verdade |
| R-27 | futuro | **Segunda cidade sem RA, IVV nem FipeZap** | telas de mercado vazias com motivo, nunca zero; o dossiê funciona com grade, Censo, CNEFE, CNPJ e anúncios |
| R-28 | 4B | **Área líquida pela grade erra em gleba pequena**: a célula tem cerca de 0,1 km² | só acima de `area_liquida_min_ha`; mostrada como faixa; rótulo de estimativa |
| R-29 | 4B | **Viabilidade expedita lida como avaliação** | rótulo fixo; premissas com origem; nunca na ficha sem as premissas |
| R-30 | 4B | **Premissa padrão vira verdade** | a ficha destaca as premissas que diferem do padrão e as que nunca foram revisadas |
| R-31 | 5 | **Texto da IA vira fato sem revisão** | nasce `proposto` e `hipotese`; só `aceito` entra na ficha (D-57) |
| R-32 | 4C | **Tese escrita e esquecida** | condições com prazo e métrica monitorada; Início mostra as vencidas e em risco |
| R-33 | 3 | **Bruto de candidato com dado pessoal de corretor** | higienização antes de gravar (D-74); retenção do bruto de rejeitados |
| R-34 | 4A | **Cache servindo resultado velho depois de correção manual** | `geracao_cadastro` na chave do cache (D-69) |
| R-35 | 1 | **Telemetria virando vigilância de pessoas** | agregada sem nome; retenção curta; só operador vê |
| R-36 | todas | **Spec grande demais para entregar** | cada fase fecha jornadas inteiras (seção 24); nada de tela sem jornada que a use |
| R-37 | 4C | **Diligência pré-respondida pelo app dá falsa segurança** | `respondida_app` continua aberta até um humano confirmar; fundiária e social nunca são respondidas pelo app |

---

## 21. Requisitos não funcionais

### 21.1 Orçamento de desempenho (p95 na Pinguim, com dado real do DF)

| Operação | Alvo | Se passar |
|---|---|---|
| Lista paginada de qualquer tabela | 800 ms | índice ou `sql_declarado` |
| Pontos ou células do mapa por viewport | 1,5 s | baixar o teto ou agregar em r8 |
| Enriquecimento de três anéis | 3 s | cache (D-69) |
| Dossiê completo, sem cache / com cache | 8 s / 1 s | calcular blocos em paralelo; cache por bloco |
| Simulação de Huff, viabilidade, matriz | 3 s | cache |
| Gerar ficha | 10 s | congelar a partir do dossiê em cache |
| Abrir o app no celular (primeira tela útil) | 3 s em 4G | carregar camadas sob demanda |

O QA de cada fase mede os alvos das telas dela e registra no PR.

### 21.2 Limites de entrada

Polígono até `poligono_max_km2` e `poligono_max_vertices`; raio até `raio_max_m`; até 4 anéis;
até 6 áreas em comparação; até 12 métricas por pedido de enriquecimento; `por_pagina` até 100;
exportação até 50 000 linhas. Acima, o erro da seção 6.22, com o limite em `detalhes`.

### 21.3 Formatos e fuso

Tela em pt-BR: `1.234,5`, `R$ 1.234.567`, `5,7%`, `16/10/2026`. Banco e API em ISO, frações
decimais, `null` para ausência. Mês de referência no fuso da organização. Áreas em m² no banco e
em hectares na tela acima de 1 ha.

### 21.4 Celular

Todas as telas de leitura e o modo campo usáveis a 390 px. O dossiê no celular mostra uma escala
por vez, sem tabela larga fora de `overflow` próprio. Editores de tese e de premissas são
desktop-first, mas não quebram no celular.

### 21.5 Acessibilidade

Cores só por tokens; nenhuma informação só por cor (classes e naturezas com rótulo); todo gráfico
com "ver tabela"; foco visível e navegação por teclado nos primitivos `urbi-*`.

### 21.6 Reprodutibilidade

Toda ficha, análise e cenário guarda as versões dos conjuntos e o `versao_metodo`; `/sobre/versoes`
diz o que está em uso agora. Refazer uma ficha antiga com as versões dela é possível enquanto os
conjuntos daquela versão existirem; conjunto substituído fica registrado com hash, mesmo quando
seus arquivos são apagados.

---

## 22. Dados pessoais e sigilo

### 22.1 Inventário

| Dado | Onde | Tratamento |
|---|---|---|
| Usuários (id, nome) | shell; `autor_id` e afins | o mínimo para autoria e auditoria |
| Telemetria de uso | `uso_eventos` | agregada sem nome na tela; retenção curta (D-72) |
| Corretor ou anunciante pessoa física | páginas lidas na coleta | **não** é guardado: higienização do `bruto` (D-74) |
| CNPJ de empresário individual e MEI | pipeline `comercio_cnpj` | só categoria, CNAE, porte e localização; sem nome nem documento |
| Arrematante de licitação, responsável técnico de licença | editais, DODF, licenças | não é guardado |
| Fotos de campo | `observacoes_campo.foto` | orientar a não fotografar pessoas; foto com pessoa identificável é apagada a pedido |
| Áreas próprias e teses | `areas_estudo` (`tipo = propria`), `teses` | sigilo comercial: permissão individual (D-13); ficha e pacote marcados "uso interno" |

### 22.2 Regras

- Nenhum dado pessoal sai em exportação, pacote, ficha ou contexto de IA.
- O contexto enviado ao provedor de IA leva números, achados e textos de síntese, nunca nome de
  pessoa.
- A ficha registra quem a gerou; o pacote leva o nome do arquivo e a data, não o usuário.
- Agente com token tem exatamente os gates de uma pessoa do mesmo nível.

---

## 23. Calendário e frescor das fontes

Valores iniciais de `comum/fontes.ts`, a calibrar com a primeira carga de cada fonte. Quando a
fonte passa do frescor, o rodapé de procedência mostra "fonte atrasada" e o Início lista.

| Fonte | Periodicidade | Frescor esperado | Observação |
|---|---|---|---|
| Anúncios (coleta) | diária | 2 dias | atraso = rotina parada ou fonte bloqueada |
| IVV | mensal | 75 dias | publicação de terceiro; atraso não é erro da app |
| FipeZap | mensal | 45 dias | |
| Séries do Banco Central | mensal | 45 dias | |
| CUB-DF | mensal | 60 dias | `[PENDENTE P-34]` |
| Terracap | por edital | 120 dias | sem edital no período não é atraso; o aviso só diz "sem licitação recente" |
| Licenciamento (CAP/SEDUH) | mensal | 60 dias | `[PENDENTE P-12]` |
| CNPJ | mensal | 60 dias | |
| OpenStreetMap | contínua | 90 dias | |
| PDAD | cerca de bienal | 900 dias | a idade aparece em todo número |
| Censo, Grade, CNEFE | decenal | — | a idade aparece em todo número; sem alerta |
| AOP (Ipea) | pontual | — | marcado como base 2017–2019 e população de 2010 |
| MapBiomas | anual | 450 dias | |
| Open Buildings | pontual | — | até 2023 |
| Tráfego do DER | conforme publicação | 120 dias | |
| PDOT | por revisão do plano | — | a vigência aparece na ficha da zona |

---

## 24. Jornadas e aceitação

### 24.1 As sete jornadas

Cada jornada é feita por uma pessoa da equipe, na Pinguim, com dado real, e é o aceite das fases
indicadas. O tempo é uma meta de uso, não de desempenho.

| # | Jornada | Persona | Passos | Saída esperada | Fases |
|---|---|---|---|---|---|
| J1 | **Triar uma gleba nova** | analista | importar o KMZ ou desenhar; ver o sítio (área líquida, PDOT, restrições); ver o entorno nos anéis; ver terra e oferta; registrar três itens de síntese; gerar a ficha de uma página | ficha baixada, área no estágio `sinal` ou `hipotese`, em até 30 min | 4A, 4B |
| J2 | **Definir produto para uma área própria** | analista | demanda e capacidade; matriz; benchmark de lançamentos; dois cenários de viabilidade (vertical e loteamento); registrar duas hipóteses de produto com condições | cenários salvos, hipóteses com condições e métrica monitorada | 4B, 4C |
| J3 | **Preparar a conversa com uma âncora** | analista | potencial e lacuna da categoria; simulação de Huff em dois portes; áreas gêmeas; hipótese de âncora com "traz/traz"; ficha detalhada com a seção de âncora | hipótese registrada, ficha baixada | 7 |
| J4 | **Revisão mensal do mercado** | direção | Início; análise de mercado; achados do mês; portfólio | leitura em até 15 min; três achados citados na reunião têm link para a origem | 5 |
| J5 | **Acompanhar o portfólio** | direção | portfólio; condições vencidas; diligências da semana; abrir uma área e ver a linha do tempo | sabe o que mudou em cada área própria sem abrir planilha | 4C, 5 |
| J6 | **Curadoria semanal** | curador, operador | candidatos; grupos e vínculos; saúde das fontes; frescor; qualidade | filas zeradas ou com motivo, em até 45 min | 3, 4B |
| J7 | **Visita de campo** | analista | abrir a área no celular; ver anéis, perímetros e restrições; registrar duas observações com foto | observações na linha do tempo, com posição | 4C |

### 24.2 Áreas de referência (golden set)

Três áreas escolhidas pela equipe, uma de cada tipo (própria, prospecção, referência)
`[PENDENTE P-37]`. Para cada uma, uma planilha versionada em `testes/fixtures/areas_referencia/`
com os valores calculados à mão (domicílios por anel, renda rateada, R$/m² mediano, área líquida,
residual de um cenário, participação de Huff de uma categoria). Toda fase de 4A em diante roda
o dossiê das três e compara: diferença acima de 2% em contagem, ou acima de 5% em estatística de
amostra, bloqueia a fase até ser explicada.

