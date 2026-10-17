# Spec — Inteligência Imobiliária (app UrbiVerso)

**Status:** rascunho em construção, versão 0.5 (2026-10-17). A v0.2 incorporou as três rodadas
de pesquisa de referências (D-21 a D-54); a v0.3 trouxe o método de Novos Negócios da UP para dentro
do app, a leitura do sítio, a viabilidade expedita e a camada de governança (D-55 a D-78); a v0.4 é
a **conferência contra o SDK publicado** (`@urbiverso/sdk` 100.0.0, shell 0.56.37): os 84 itens de
`docs/CONFERENCIA_SDK.md`, as decisões D-79 a D-94, os riscos R-38 a R-46 e a matriz de adoção de
frameworks (seção 3.5); a v0.5 responde à revisão de prontidão para implementar: repositório e
ativação, fases em PRs com portão entre elas, convivência com o site e com a instância, segurança
da coleta e das áreas próprias, e o método dos números.
**Issues de registro:** [#193](https://github.com/rafaleandrog/inteligencia-real-estate/issues/193) (v0.1),
[#195](https://github.com/rafaleandrog/inteligencia-real-estate/issues/195) (v0.4),
[#197](https://github.com/rafaleandrog/inteligencia-real-estate/issues/197) (v0.5).
**Slug da app:** `inteligencia_imobiliaria`. **Nome exibido:** Inteligência Imobiliária.
**Repositório da app:** `UP-Urbita/app-inteligencia-imobiliaria`, privado; identidade
`UP-Urbita/app-inteligencia-imobiliaria::inteligencia_imobiliaria` (seção 3.1).
**Instâncias:** Pinguim (`homolog.urbiverso.com.br`) é a de **teste**: recebe toda release e é onde
roda o QA de cada fase. Laputa (`urbiverso.up.bsb.br`), produção da UP, é onde a equipe **usa** a
app, a partir do fim da fase 1 (seção 15).

Este documento é a fonte de verdade do que o app vai ser. Ele substitui, para o app UrbiVerso,
os papéis que `docs/PRODUCT_PLAN.md`, `docs/ARCHITECTURE.md` e `docs/DATA_CONTRACT.md` cumprem
para o site estático. Esses três continuam valendo para o site enquanto ele existir; quando o
app entrar em uso na Laputa e a planilha for congelada, eles passam a ser históricos.

Convenções do texto:

- **Decisão** é algo fechado com o dono do produto. Cada uma tem um código `D-nn` e aparece no
  registro da seção 16, com a alternativa descartada e o motivo.
- **Pendente** é algo que ainda depende de resposta. Está listado na seção 17 e marcado no texto
  com `[PENDENTE P-nn]`.
- Nomes de tabela, coluna, rota, rotina e parâmetro estão em **português**, `snake_case`, como
  manda a convenção do UrbiVerso. A coluna "origem" das tabelas aponta a aba e a coluna da
  planilha de onde o dado vem na migração.
- Tudo o que o texto afirma sobre a plataforma foi **conferido contra o bundle publicado**
  `node_modules/@urbiverso/sdk/` na versão **100.0.0** (shell espelhado `0.56.37`), item a item,
  em `docs/CONFERENCIA_SDK.md`. Onde a app depende de algo que entrou num nível específico, o
  nível está citado. Referência `C-nn` aponta o item da conferência que sustenta a afirmação.
- Desde a v0.4 **não existe mais marcador de confirmação contra o SDK** no texto: cada um foi substituído pela
  decisão que a conferência permitiu tomar (D-79 a D-94) ou pela alternativa já escrita. A regra
  continua: contrato novo da plataforma só entra na spec depois de lido no bundle instalado
  (regra da skill `revisar-pr-apps`), nunca no `main` do monorepo.

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

### O que mudou da v0.3 para a v0.4

A v0.3 foi escrita sem acesso ao SDK publicado. A v0.4 é a **conferência contra o bundle**
`@urbiverso/sdk` 100.0.0 (shell 0.56.37), em 2026-10-17, item a item, em `docs/CONFERENCIA_SDK.md`:
84 vereditos (18 confirmados, 43 confirmados com ajuste, 8 ausentes no SDK, 7 contrariados e 8
ambíguos), nenhum bloqueante para a V1. Nenhuma decisão de produto mudou de sentido; quatro ganharam nota
(D-09, D-13, D-47, D-48). Em termos de desenho, por seção:

- **3 — Arquitetura:** pisos corretos (`sdk_min: 100`, `shell_min: "0.56.37"`; o publicado já é o
  100, C-01); build canônico com `.gitignore` e ajuda gerada em `index.ts`; bibliotecas puras no
  bundle (D-93); e a **matriz de adoção** dos 37 frameworks do SDK (3.5).
- **4 — Manifesto:** `nav` com onze folhas e sub-telas em `urbi-abas`, porque o teto é 20 itens
  (D-86); ordem das rotinas mensais por hora cheia e guarda (fecha P-05); `rotasPessoais` e o
  listener `analise_concluida` nos exports; parâmetros sem JSON nem `secret` — sai
  `proxy_saida_url` (D-79), entram `fuso_organizacao` (D-84) e `polyline_max_vertices` (D-92).
- **5 — Dados:** tradução da notação para o `schema.json`; regras do reconciliador; único parcial
  com `removido_em`; `versao` e `atualizarSe` para concorrência (D-88); nome do autor por
  `campos_incluir`; anexo não obrigatório expira, e a foto de campo vai para `observacao_fotos`
  (D-89); `series_macro_config` vira tabela (D-90); `visoes_salvas` pessoal (D-80); a grade sai do
  SQL declarado e da rota genérica (D-83).
- **6 — API:** `detalhes` é `string[]` e o `409` manda refazer o `GET`; corpo até 100 KB e polyline
  até 300 vértices (D-92); a rota de arquivo resolve e não serve bytes (D-81); IA por
  `consultarAsync` e `202` (D-82); carga pedida por evento (D-91); geometria da grade separada dos
  valores; erros de plataforma traduzidos em 6.22.
- **7 e 8 — Rotinas e coleta:** o `ctx` não tem fuso nem relógio (D-84); trava e cursor com
  compare-and-set em `cursores_rotina`, continuação pelo menos uma vez (D-85); `interrompida`
  gravada pela execução seguinte; um arquivo por vez na carga pública; troca de versão por
  `deletarVarios`; cliente pelo `fetch` global, com o proxy de egresso da instância (D-79);
  "uma vez por transição" é deduplicação da app.
- **9 — IA:** slots-base autorizados na instalação; tetos de 512 KB, 16 000 tokens, 120 s e 10
  chamadas por minuto; `efetivo` e `backup` no estado do slot; códigos de falha com tratamento.
- **10 — Telas:** registro de exceções em `docs/ui-excecoes.md` (sem a régua, que o medidor
  exprime); sem linha expansível; regra de link interno; estilo do mapa nos campos do SDK, sem
  hover e sem losango em camada grande (D-87); "ver tabela", legenda e posição do aparelho são da
  app (D-94); Config com as doze abas reais; modo campo com HTML puro (fecha P-39).
- **13 e 14 — Eventos e permissões:** não existe evento interno sem notificação; erros só ao
  admin da app; lista fechada dos erros injetados; inscrição do `curador` reconciliada; "Rodar
  agora" é do admin; visões salvas com `leitura`.
- **15 a 22:** dependência do módulo `imobiliario` com a identidade nova (C-81); P-16 a P-22, P-38
  e P-39 fechadas; riscos R-38 a R-46 para o que o bundle não documenta (retenção de IA, egresso,
  transação, TTL, transporte, cap de arquivo, disco, carga da grade, permissões do navegador).

As 31 capacidades e documentações que a app gostaria de ter estão em
`docs/ISSUES_SHELL_SUGERIDAS.md`, cada uma com o plano B já adotado aqui.

### O que mudou da v0.4 para a v0.5

A v0.4 conferiu a spec contra o SDK. A v0.5 responde a uma revisão de **prontidão para construir**
em três frentes (encaixe na instância compartilhada, método e dado, e o que impede começar): 57
itens, cada um resolvido pelo contrato do bundle `@urbiverso/sdk` 100.0.0 ou pelo precedente das
apps que já rodam na plataforma (charles3 e contencioso_ciborgue em `urbiverso/apps-juridico`,
reg360, radar_sei, nobi e o Urbigis). Seis ficaram para o dono (P-42 a P-47). Em termos de desenho:

- **Onde e como nasce (3, 15, 18):** repositório privado `UP-Urbita/app-inteligencia-imobiliaria`
  (D-95); fase −1 de ativação com checklist e alçada por item (D-96); a Pinguim testa e a Laputa
  usa, e dado sigiloso nunca entra na Pinguim (D-97); o pipeline segue neste repositório em trilha
  própria (D-100); a unidade de plano é o PR, com fases em sub-issues e portão de três condições
  (D-99, D-104); teste sem instância por `req.dados` falso tipado e banco opcional (D-101);
  aceite sobre retrato datado e entrada congelada (D-102, D-103); protocolo do kit (D-114).
- **Convivência com o site e com a instância (2, 3.6, 11.3):** um coletor por vez, também entre
  instâncias, com corte na fase 3 (D-98); migração com `importacao_id`, retrato datado e desfazer
  (D-119); índices nascem com a tabela, uma release por dia útil, sem downgrade (D-106); trava por
  classe de rotina (D-120), `coleta_ativa` (D-108), guarda da cadeia mensal com erro
  `cadeia_mensal_parada`, cota de IA por fatia (D-109); semente aguardada (D-112); Início em "/"
  (D-110); prefixo de tags (D-111).
- **Segurança (6, 8, 10, 14, 22):** a coleta só busca hosts das fontes cadastradas, com guarda a
  cada redirecionamento (SSRF); invólucro de erro em toda rota; links e conteúdo de terceiro
  tratados como texto, e CSV protegido contra fórmula; guarda por objeto com matriz de acesso por
  contagem exata (D-115); papel `estrategico` para áreas próprias, 404 para os demais e filtro antes
  da paginação (D-107, D-116); histórico congelado protegido da purga (`restringir`); cálculo de
  cidade inteira só em rotina.
- **Método e dado (5, 7, 9, 10):** estatística suprimida abaixo do n mínimo; painel fixo de buscas
  para variação e achados; índice estratificado com peso exógeno e teto de imputação (fecha P-23);
  liquidez por Kaplan-Meier e R$/m² por base de área (D-122, D-123); agrupamento sem confiança
  automática (D-113); viabilidade com preço de venda, custos indiretos, contrapartida e comparação
  por m² computável; área líquida vetorial (mínimo 1 ha); matriz de produto em composição e fluxo;
  absorção só com 12 meses de IVV e alvará com validade; lacuna comercial por bacia (D-121) e Gi*
  com FDR; Huff com escala única de atratividade; capa da ficha sem falácia ecológica; comparar
  duas fichas da mesma área; `hipoteses_produto` (D-124) e a 4C sem depender das fases 5 e 7
  (D-105).

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
| **Direção de Novos Negócios** | `leitura` + `estrategico` | o que mudou no mês (Início), o portfólio das áreas, fichas para decidir, a agenda de decisão de cada área |
| **Analista de Novos Negócios** | `escrita` (+ `estrategico` para quem trabalha áreas próprias) | triar glebas, montar o dossiê, registrar síntese, tese e condições, simular produto, âncora e viabilidade, gerar a ficha |
| **Curador de dados** | `escrita` + `curador` | manter cadastros, aprovar candidatos, confirmar grupos e vínculos, cadastrar as áreas próprias e as faixas de programa |
| **Operador de dados** | `escrita` + `operador` | fontes, buscas, cargas públicas, importações, saúde do parser, qualidade |
| **Admin** | `admin` | parâmetros, rotinas, IA, usuários e papéis |
| **Agente** (Claude ou outro) | o nível do token | ler o mesmo que as telas mostram, pelas mesmas rotas, para montar análises e documentos fora do app |

O papel `estrategico` (v0.5) é o que abre as áreas próprias e tudo o que pende delas; sem ele,
nem `leitura` nem `escrita` as veem (seções 4.1 e 14).

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
| Pipeline Python | GitHub Actions deste repositório | Continua no GitHub Actions **deste** repositório, em trilha própria (seção 15.0a); publica artefatos públicos; a app, que mora em outro repositório, lê o manifest pela URL pública (D-05) |
| Mapa | Leaflet vendorizado, canvas próprio | `urbi-mapa` (SDK ≥ 98), Leaflet em canvas, camadas GeoJSON |
| Gráficos | SVG próprio (`chart-model` + `chart-layout`) | Família `urbi-grafico-*`, `urbi-kpi`, `urbi-mapa-de-calor` |
| Estado na URL (`#mapa?ra=…`) | `url-state.js` | Sub-rota da app + querystring por `replaceState` |
| DATA_QUALITY / CHANGE_LOG | Abas da planilha | `achados_qualidade` + `alteracoes_cadastro` + trilha do shell |
| Modo demonstração (`data/demo.json`) | Existe | **Não existe** (D-15). A app nasce vazia e é povoada por CSV |
| Acesso público | Site aberto | **Nenhum** (D-02). Só usuários da instância, sem permissão padrão |

**Convivência até o corte (v0.5).** Regra: **um coletor por vez, uma fonte de verdade por
tabela** (dois coletores no mesmo portal violariam "uma requisição por vez por host", 8.1). Nas
fases 1 e 2 a planilha continua fonte de verdade e o Apps Script continua coletando; a app recebe a
planilha por reimportação incremental (`modo_duplicata = atualizar` pela chave natural
`id_legado`), quantas vezes for preciso, e o site segue no ar sem mudança (precedente: a
reimportação idempotente do `reg360`). Na fase 3, no dia em que as rotinas de coleta da app são
ligadas na Laputa, os gatilhos do Apps Script são removidos e as abas de anúncios (`LISTINGS*`,
`LISTING_*`) ficam somente leitura: dali em diante a app é a fonte de verdade de anúncios e o site
mostra o retrato congelado. As demais abas (IVV, FipeZap, PDAD, tráfego) migram de fonte quando a
fase que as carrega fica pronta. A fase 6 só congela o resto e marca o site como legado (seção 15).

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
- Proxy de saída para os portais, só se a medição da fase 3 mostrar bloqueio: pedido ao admin da
  instância, no proxy de egresso dela (D-09, D-79).

---

## 3. Arquitetura no UrbiVerso

### 3.1 Forma do repositório da app

A app nasce num repositório novo e **privado** da org da UP, `UP-Urbita/app-inteligencia-imobiliaria`,
com o kit instalado (`npx @urbiverso/kit-apps`: `pnpm-workspace.yaml` com `apps/*`, catálogo de
versões, `release.yml`, `ci.yml`, `KIT.md` e skills) e a app em `apps/inteligencia_imobiliaria/`.
A identidade é `UP-Urbita/app-inteligencia-imobiliaria::inteligencia_imobiliaria` e entra no
`manifesto.json` desde a primeira release (o gate da `manifesto-sem-identidade` reprova, a partir
de 2026-10-28, manifesto sem ela). Apps da UP moram na org da UP, um repositório privado por app
(precedentes: `UP-Urbita/app-radar-sei::radar_sei`, `UP-Urbita/urbigis::magis`); o kit recusa
`manifesto.json` na raiz, por isso a pasta fica sob `apps/`.

Este repositório (`rafaleandrog/inteligencia-real-estate`) continua sendo o do site estático e do
pipeline (seção 15.0a), com as regras dele intactas: reorganizá-lo exigiria revogar
`docs/ENGINEERING_RULES.md` (R1.1 "sem build obrigatório", R1.3 "não introduza backend Node") de um
site que continua no ar. A spec e o site são referência, como o `prototipo/` do Urbigis: o código
do site não é reaproveitado por cópia, só portado com os testes de paridade (11.4). Fecha D-16 e
P-04 (D-95).

Raiz do repositório da app (o que fica fora da pasta da app):

```
UP-Urbita/app-inteligencia-imobiliaria/
├── KIT.md, CLAUDE.md, pnpm-workspace.yaml   # do kit; o "Deste repositório" do CLAUDE.md é do dono
├── .github/workflows/
│   ├── ci.yml, release.yml                   # do kit (typecheck, build, test, empacotamento; release)
│   └── sdk-noturna.yml                       # noturna contra o SDK novo, do repositório (18.2)
├── scripts/
│   ├── exportar-planilha.mjs                 # retrato datado da planilha, aba por aba, por GViz (11.3)
│   └── gerar-paridade.mjs                    # fixture de paridade a partir do código do site (18.1)
├── migracao/AAAA-MM-DD/                      # <aba>.csv + sha256 de cada arquivo (retrato datado)
├── qa-relatorios/                            # relatórios do QA; medidor/p95.mjs (18.2)
└── apps/inteligencia_imobiliaria/
```

`gerar-paridade.mjs` recebe por argumento um checkout do site num commit fixado e grava esse commit
no arquivo que produz, para que a fixture diga de que código saiu (D-103).

A pasta da app:

```
apps/inteligencia_imobiliaria/
├── manifesto.json
├── schema.json
├── package.json            # build canônico: esbuild frontend (--external:@urbiverso/ui) + backend self-contained
├── tsconfig.json
├── backend/
│   ├── rotas.ts            # exports: rotas, rotasPessoais, rotinas, reagir, aoIniciar, aoEncerrar
│   ├── semente.ts          # garantirSemente(dados): promise memoizada por processo, aguardada pelas rotas (4.2)
│   ├── rotas/              # um arquivo por domínio (anuncios.ts, mercado.ts, territorio.ts, estudos.ts,
│   │                       #   produto.ts, comercio.ts, terra.ts, empreendimentos.ts, inicio.ts,
│   │                       #   metodo.ts, sitio.ts, viabilidade.ts, governanca.ts, …) e comum.ts,
│   │                       #   com rota(fn), o invólucro de erro de toda rota (seção 6)
│   ├── rotinas/            # um arquivo por rotina
│   ├── coleta/             # parser dos portais, classificação de resposta, cliente HTTP (fetch global; D-79)
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
│   ├── importacao-chaves.ts # chave natural e colunas_derivadas por tabela (11.1)
│   ├── regras-objeto.ts    # regra por objeto por tabela (autor, responsavel, curador, estrategico) (14)
│   ├── url.ts              # urlSegura(): só http/https, senão null (10.1)
│   ├── laco.ts             # cederAoLaco(): setImmediate a cada 1 000 iterações (orçamento de CPU, 21.1)
│   └── ajuda/              # "Como ler" de cada tela, em Markdown (D-77); gerado em ajuda/index.ts no build (C-72)
├── frontend/
│   ├── index.ts            # app-inteligencia-imobiliaria: roteador de sub-rotas; Início em "/";
│   │                       #   rota desconhecida → urbi-estado-vazio "Página não encontrada"
│   ├── registro.ts         # definir(tag, classe): só define se a tag ainda não existe; prefixo intel-imob-
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
│   ├── ui-excecoes.md      # registro de exceções de UI da app (C-58): Superfície · Por quê · O que pode
│   ├── ativacao.md         # checklist da fase −1, conferido na fase 0 (15.−1)
│   └── importacao.md       # CSV
└── testes/                 # node --test; fixtures de HTML de portal e de CSV
    ├── infra.ts            # req.dados falso em memória, tipado por Pick<HelperDados, …> (18.1)
    └── fixtures/           # paridade/<data>.json, areas_referencia/<area>/, planilha/, portais/
```

**Custom elements (v0.5).** A raiz é `app-inteligencia-imobiliaria`, derivada do slug. Toda outra
tag leva o prefixo `intel-imob-` (curto e único na instância; o slug inteiro daria tags de mais de
40 caracteres), como fazem `radar-sei-*`, `charles3-*` e `reg360-*`. O registro passa por
`frontend/registro.ts`, que só chama `customElements.define` se `customElements.get(tag)` é
`undefined`: o "Tentar novamente" do shell reavalia o bundle com cache-bust, e `define` de tag já
definida lança. Um teste confere o prefixo de toda tag registrada (D-111).

O código puro (`comum/`) é importado pelo backend e pelo frontend por um único `../comum/`,
que o shell aceita como import intra-app. Nenhum arquivo importa `../../shell` nem outra app.

Três regras de forma que a conferência fixou (C-72, C-73, C-75): o build é o canônico do kit
(`esbuild frontend/index.ts --bundle --external:@urbiverso/ui` e `esbuild backend/rotas.ts
--bundle --platform=node --target=node20 --minify`), sem loaders extras — por isso os `.md` de
`comum/ajuda/` são convertidos num `comum/ajuda/index.ts` (mapa tela → string) por um passo do
`pnpm build` da app, antes do esbuild; o `.gitignore` cobre `backend/rotas.js`, `frontend/index.js`
e `dist/` (gate de árvore limpa do kit); e o bundle não tem limite documentado de tamanho, mas o
shell importa todos os bundles a cada boot, então `--minify` é obrigatório e dependência só entra
quando o ganho justifica.

### 3.2 Frameworks do UrbiVerso que a app usa

| Framework | Uso | Declaração |
|---|---|---|
| Dados | todas as tabelas; `req.dados`; `sql_declarado` para ranking e janelas | `schema.json` |
| UI | todas as telas autenticadas; `urbi-mapa`, `urbi-grafico-*`, `urbi-tabela`, `urbi-kpi` | `ui` ausente (= validado) |
| Rotinas | treze rotinas (seção 7) | `rotinas` + `export const rotinas` |
| IA | análises (seção 9): quatro slots custom com base `poder` (território, mercado, tela, área) e um slot opcional de extração com base `barato` | `ia.slots` |
| Config da app | parâmetros declarativos (seção 4.3); aba Rotinas nativa | `parametros` |
| Eventos | erros de operação (incluindo `parser_degradado` e `cadeia_mensal_parada`), evento de lacuna, o evento de continuação e o callback `analise_concluida` (seção 13; ambos visíveis, D-85, D-82) | `eventos`, `erros` |
| Arquivos | CSV de importação, shards dos dados públicos, KML/KMZ importado | colunas `arquivo` |
| Permissões | níveis + papéis `curador`, `operador` e `estrategico` (v0.5); **rotas pessoais** para as visões salvas (D-80) e a telemetria de uso (`/pessoal/uso`) | `roles` + `export const rotasPessoais` |
| Hooks de ciclo de vida | `aoIniciar` (dispara a semente memoizada, que as rotas aguardam, e reconcilia as inscrições) e `aoEncerrar` (cancela lote em voo) | exports |

Não usa na V1: Segregação por conta (um território não é um tenant; C-82), Módulos (D-06; os
contratos estão publicados e a forma exata do bloco `dependencias` está na seção 15.7), Páginas
públicas (D-02), Webhooks de entrada, Disparadores, Wiki, Email, Slack direto (a notificação por
Slack, se vier, é destino de Remessa configurado pelo admin, sem código), Auditoria (`auditavel`
é trilha permanente de categoria fechada, não telemetria; C-83). A **matriz completa**, framework
a framework, com fase e motivo, está na seção 3.5.

O funil de prospecção de âncoras (quem foi contatado, status, próxima ação) **não** entra: é
trabalho de CRM e continua no CRM da equipe (D-45). A app produz a ficha que o funil usa.

**Dependências de terceiros no bundle (D-48, D-93).** O contrato do bundle self-contained é
literal: "as dependências de runtime da app (`express`, `lit`, `undici` etc.) vêm embutidas no
bundle" e só "dependência nativa (binário compilado) fica fora" (C-74) — biblioteca pura em JS ou
WASM entra sem permissão, e não há lista de proibidas. Mesmo assim a app **não** depende de
biblioteca H3 em tempo de execução (D-48): o pipeline publica cada célula com centroide, vizinhos
e pai r8, e a app decide a que célula um ponto pertence pelo centroide mais próximo entre as
células da caixa, que na grade hexagonal coincide com a célula que contém o ponto. `h3-js` fica
autorizada a entrar quando a medição da fase 4A mostrar que a aproximação erra na borda de
projeção, sem mudar schema. O ZIP do pacote com proveniência (D-28) usa biblioteca pura embutida
(`fflate`), sem plano B de três downloads.

### 3.3 Pisos

- `sdk_min: 100`. O publicado em 2026-10-17 **é** o SDK 100 (`latest` = `100.0.0`), igual ao
  `main` da plataforma — a v0.3 supunha um publicado atrasado em 99 e estava errada (C-01). Regra
  prática do guia, literal: "copie o major do SDK contra o qual você compilou". Todos os pisos
  parciais que a app usa ficam cobertos: `urbi-mapa` 98, `rotasPessoais` e `formato`/`intervalo`
  94, `busca_texto` 92, `estadoSlot` 83, hooks de ciclo de vida 59 (C-02).
- `shell_min: "0.56.37"`: a versão de shell espelhada pelo SDK 100. Ela **não** sai do registry —
  "o metadata do GitHub Packages omite campos custom, então `npm view` não os exibe" (C-01); a
  leitura certa é `node -p "require('@urbiverso/sdk/package.json').urbiverso"` na árvore da app
  depois do `pnpm install`. Pisos de shell que a spec usa (`fetch()` 0.50.21, `padrao` vivo
  0.53.20, único parcial 0.53.4, `sql_declarado` 0.53.3, `status`/`codigo`/`detalhes` no erro
  0.53.15, rotas pessoais 0.56.25) ficam todos abaixo.
- `versao` do manifesto nasce em `0.1.0` e avança a cada release que muda `schema.json`, traz
  migração **ou mexe em `shell_min`/`sdk_min`** — são os quatro gatilhos da regra única de
  versionamento (C-09). Subir o SDK compilado num release sem mudar código também sobe `sdk_min`
  e, por tabela, `versao`.

### 3.4 Multi-local (D-08)

Nenhuma tabela de fato guarda "RA" como texto. Toda referência territorial aponta para
`localidades`, que pertence a uma `cidade`. Hoje só existe o Distrito Federal, e `localidades`
tem as 35 RAs mais os submercados do FipeZap. Uma segunda cidade entra sem mudança de schema:
uma linha em `cidades`, suas localidades, e os dados. As telas filtram por cidade quando há mais
de uma; com uma só, o seletor não aparece.

A primeira candidata a segunda cidade é Campinas/RMC, porque a equipe já analisa áreas lá
`[PENDENTE P-09]`. Grade, Censo, CNEFE, AOP (Campinas está entre as cidades do Ipea), CNPJ e
anúncios funcionam lá desde o primeiro dia; IVV e FipeZap dependem de quem publica para a praça.

### 3.5 Matriz de adoção de frameworks (v0.4)

Fonte: `@urbiverso/sdk` 100.0.0 (shell 0.56.37), conferido em 2026-10-17 contra os 37 docs de
`node_modules/@urbiverso/sdk/docs/` (o `README.md` da pasta é índice, sem frontmatter, e não conta),
mais `dist/*.d.ts` e `obsolescencias.json`. Uma linha por doc, em ordem alfabética. Estados:
**adota**: a app usa dentro da V1 completa (seção 2.2), e a coluna Fase diz em que fase entra;
**adota depois**: fica fora da V1 e entra no Futuro (seção 15.7); **não adota**: a app não usa, com o
motivo; **referência**: doc de processo ou de conceito que a app segue, sem adoção técnica própria.

| Doc do SDK | Framework | Adoção | Fase | Como a app usa, ou por que não |
|---|---|---|---|---|
| `ajuda.md` | Ajuda, Feedback e Sentinela | adota | 1 | Sem código: o widget "?" abre `/{appId}/docs` com o `docs/README.md` da app (§3.1) e mostra reporte de bug e sugestão se o admin ligar o Sentinela da app. Não substitui o "Como ler" por tela (D-77, §10.1), que fica onde o número está. |
| `apps-em-repo-proprio.md` | Apps em repositório próprio | adota | 0 | Forma do repositório, catálogo, kit `@urbiverso/kit-apps`, build canônico com `--minify`, `.gitignore` dos bundles e testes que só exercitam a própria pasta (§3.1; C-72, C-73, C-75, C-76). Repositório privado `UP-Urbita/app-inteligencia-imobiliaria` (§3.1; fecha D-16 e P-04), leitura dele concedida ao PAT das instâncias na fase −1 (§15.−1) e testes sem instância nem dev-shell, que não existe (§18.1). |
| `arquivos.md` | Arquivos | adota | 1 | Colunas `arquivo` para CSV de importação, KML/KMZ, shards dos conjuntos públicos e foto de campo, com upload em dois passos (§5.10, §11.1; C-37, C-38). A app nunca serve bytes, só resolve `{ arquivo_id, sha256, url }` (C-39, D-81), e o TTL de anexo não obrigatório tem decisão explícita (C-41, D-89). |
| `auditoria.md` | Auditoria | não adota | — | `auditavel` é trilha permanente de categoria fechada (autenticação, permissão, aprovação…), não telemetria de uso; o uso por tela fica em `uso_eventos` (§5.23; C-83, D-72). Não há categoria de leitura, então "quem viu" uma área própria não cabe aqui; a trilha de saída fica em `area_eventos` (§22). Um registro de decisão sobre área usaria a categoria `aprovacao` `[PENDENTE P-42]`. |
| `autenticacao.md` | Autenticação | adota | 1 | A app não faz auth: lê `req.contexto` (`usuario.id`, `nivelApp`, `rolesApp`) e nunca `tipo` nem `natureza`, que chegam redigidos (§14; C-52). |
| `banco-de-dados.md` | Dados | adota | 1 | Todo o `schema.json` (§5), `req.dados`, `sql_declarado` para ranking e janelas, `busca_texto`, `acesso_externo` explícito e `atualizarSe` com coluna `versao` (C-10, C-15 a C-29; D-83, D-88). A grade lê por `varrerTudo` porque `listar` sempre paga `COUNT(*)` (C-27). `uso_eventos` é tabela `pessoal` (§5.23); histórico e registro congelado ligam ao cadastro por FK `restringir` (§5.1); as tabelas das áreas próprias são `restrito` e só as rotas da app as leem (§14). |
| `barramento.md` | Eventos e Notificações | adota | 3 | Bloco `erros` (oito erros de operação, com `cadeia_mensal_parada`) e `eventos` (`lacuna_cadastro`, `continuar_coleta`, `analise_concluida`), listener `reagir` e inscrição do `curador` por escopo no `aoIniciar` (§13; C-08, C-13, C-47 a C-50; D-14, D-85). Erro só é visível ao admin, por isso a Operação lê estado em tela (C-48). |
| `compatibilidade.md` | Compatibilidade e quebra retroativa | referência | 0 | Rege os dois pisos (`sdk_min: 100`, `shell_min: "0.56.37"`, §3.3; C-01, C-02) e o registro de obsolescências: a spec não usa nada do que está em obsolescência (C-03). |
| `config-app.md` | Config da App | adota | 1 | Parâmetros declarativos de §4.3 (`bool`, `numero`, `string`, `texto_longo`; sem JSON nem lista, por isso `series_macro_config` virou tabela) e as abas nativas de §10.8 (C-07, C-84; D-90). Sem `telas_config`. |
| `contas.md` | Segregação por Conta | não adota | — | App interna de colaborador, sem tenant: um território não é conta, e a 4ª camada de permissões cobre autor e responsável (§3.2, §14; C-82). |
| `disparadores.md` | Disparadores | não adota | — | Nenhuma outra app da instância precisa acionar ação desta, nem esta de outra; o funil de âncoras fica no CRM (D-45). Reabre se um CRM no UrbiVerso quiser receber a ficha. |
| `distribuicao.md` | Distribuição de Apps | adota | 0 | `identidade`, os dois pisos, regra única de versionamento com quatro gatilhos, bundle self-contained com bibliotecas puras (`fflate`, `h3-js` se medida pedir) e tag `-a` pelo `urbi-release` (§3.3, §4.1; C-09, C-74; D-93). Identidade `UP-Urbita/app-inteligencia-imobiliaria::inteligencia_imobiliaria`; release nasce prerelease, a Pinguim fica em `Releases` e a Laputa em `homologado`; downgrade é recusado, então conserto é release nova (§3.6). |
| `documentacao.md` | Documentação | referência | 0 | Convenção dos `docs/*.md` da app com `README.md` primeiro e doc no mesmo PR do código (§1.3, §3.1); o shell serve essa pasta em `/{appId}/docs`. |
| `email.md` | Email | não adota | — | O framework é para público externo; notificação interna vai pelo barramento, e aviso de mercado por e-mail foi adiado (D-14, D-33). Sem `emails` no manifesto (§4.1). |
| `faxina.md` | Faxina | não adota | — | Housekeeping interno do shell: "Apps não consomem este módulo". A retenção da app é a rotina própria `limpar_retencao` (§7.13). |
| `guia-desenvolvimento.md` | Guia de Desenvolvimento de Apps | referência | 0 | Receita e checklist da Fase 0; o § 9 fixa que só o `fetch()` global passa pelo proxy de egresso da instância, o que tirou `proxy_saida_url` e `undici.ProxyAgent` da coleta (§8.2; C-34, D-79). O § 8 (todas as apps no mesmo processo Node) funda o orçamento de CPU da app (§8.3, §21.1). |
| `ia.md` | IA | adota | 5 | Quatro slots custom de base `poder` e um de extração `barato` desligado (§4.1, §9; C-06; D-04), `consultarAsync` com evento de callback para o `202` (C-80, D-82), `estadoSlot` escondendo o que não resolve (C-43) e tokens da resposta para custo (C-44). O limite de requisições por minuto é por app (padrão 10): o admin da app o sobe para 30 na fase 5, e o lote mensal enfileira no máximo `ia_lote_por_fatia` por fatia (§4.3, §15.5). |
| `icones.md` | Ícones | adota | 1 | Sem declaração: o `icone` de cada folha do `nav` é classe FontAwesome (§4.1) e as telas usam `<urbi-icone>`; nenhum glyph custom `ubv`. |
| `lixeira.md` | Lixeira | adota | 1 | Aba nativa da Config para o admin, porque toda tabela de cadastro tem `soft_delete` (§5.1, §10.8); é a lixeira manual que dispensa tela própria de restauração (C-84). A purga de anúncio com retrato e de área com ficha é recusada por desenho (FK `restringir`, §5.1). Ver pontos de atenção. |
| `modulos-autoria.md` | Módulos, autoria | não adota | — | A app é app, não módulo: não publica `modulo.js`, entidades nem componentes expostos. |
| `modulos.md` | Módulos, dependência | adota depois | Futuro | Ligar `lancamentos`, `empreendimentos` e áreas `propria` a `incorporacoes` e `imoveis` do `imobiliario` por referência lógica, porque o módulo não expõe tabela referenciável (§15.7; D-06, C-81). |
| `nucleo.md` | Núcleo, dados compartilhados | referência | Futuro | Modelo e semântica de `imoveis` e `incorporacoes` para quando D-06 reabrir; o contrato de acesso do núcleo (`req.nucleo`, `dependencias_nucleo`) está em obsolescência e nunca entra (C-03). Sem `pessoas`, pela regra de dado pessoal (§22). |
| `overview.md` | Visão geral (manifesto, exports, navegação, `urbiVerso.fetch`) | adota | 0 | Manifesto e exports reconhecidos (§4.1, §4.2; C-14), `nav` com onze folhas sob o teto de 20 (C-04, D-86), hooks `aoIniciar` e `aoEncerrar` (C-11, C-12), sub-rotas e erros do `api()` com teto de corpo de 100 kB (C-69, C-70, C-78; D-92). Início em `/`, a mesma tela do Home que o shell põe no menu (§4.1); como o `aoIniciar` roda depois do `listen`, as rotas aguardam a semente (§4.2); tags com prefixo `intel-imob-` e registro que tolera a reavaliação do bundle (§3.1). |
| `paginas-publicas.md` | Páginas Públicas | não adota | — | App só autenticada (D-02); sem `rotas_publicas` nem `paginas_publicas`. A hipótese de mapa público em §15.7 não está desenhada. |
| `permissoes.md` | Sistema de Permissões | adota | 1 | Permissão padrão nenhuma, níveis com papéis `curador` e `operador`, contrato método→nível, admin que autoatribui papel (§14; C-51, C-53, C-56; D-13, D-18), `rotasPessoais` para visões salvas (C-54, D-80) e 4ª camada "autor, responsável ou curador" nas áreas, declarada em `comum/regras-objeto.ts` e coberta por uma matriz rota × perfil (§18.1). Papel `estrategico` sob `leitura` para as áreas próprias (§4.1, §14) e `POST /pessoal/uso` em `rotasPessoais` (T6). |
| `protocolo-distribuicao.md` | Protocolo de distribuição (urbihub v1) | não adota | — | Contrato de quem implementa servidor de instaláveis; a app é distribuída por release no GitHub e instalada pelo repositório (§3.1). |
| `remessas.md` | Remessa Externa | adota | 3 | Sem código: os erros de §13 viram destino `webhook`, `slack`, `sentinela` ou `rotina_claude` se o admin da app configurar em Config › Eventos; é o caminho de Slack que a spec prevê (§3.2; C-48). |
| `rotinas.md` | Rotinas | adota | 3 | Treze rotinas de §7 com fatiamento abaixo de 15 minutos e cursor (C-30, C-31), trava própria em `cursores_rotina` além do advisory lock (C-32, D-85), `fuso_organizacao` porque o `ctx` não tem relógio (C-33, D-84), sem encadeamento declarado (C-36) e carga por evento em vez de "Rodar agora" da app (C-05, D-91). Trava por classe (`coleta`, `carga`) contra o empilhamento do catch-up, `coleta_ativa` como off-switch de toda a coleta, guarda da cadeia mensal que vira `ok: false` e grade de horários sugerida, porque o default é 06:00 UTC para todas (§4.1, §4.3, §7). |
| `slack.md` | Integração Slack | não adota | — | Sem `req.slack.notificar`: a app não tem canal próprio a notificar, e o Slack, se vier, é destino de Remessa sem código (§3.2, §13). |
| `tokens-api.md` | Tokens de API | adota | 1 | A persona Agente (§1.4) entra por token Bearer, que herda nível, papéis e gates de uma pessoa do mesmo nível, sem ramo na app (§22; C-55). |
| `ui-componentes-conteudo.md` | Componentes de conteúdo | adota | 1 | `urbi-mapa` (SDK 98) com `EstiloFeicao` do SDK e ordem pelo array de camadas, família `urbi-grafico-*`, `urbi-kpi`, `urbi-tabela`, `urbi-markdown` (§10; C-02, C-61 a C-66, C-72; D-87). Legenda, "ver tabela" e geolocalização são da app (C-60, C-67, C-68; D-94). Conteúdo bruto de portal e JSON de diagnóstico só em `urbi-navegador-json` ou `<pre>`; `unsafeHTML` é proibido na app (§10.1). |
| `ui-componentes-layout.md` | Componentes de layout | adota | 1 | `urbi-shell-page`, `urbi-2x1` e `urbi-3-colunas` para mapa com painel, `urbi-abas` para as folhas de Cadastro e Operação e para as escalas do dossiê (§10.1; C-57; D-86). |
| `ui.md` | UI do Shell | adota | 1 | Toda tela de primitivos `urbi-*` e tokens semânticos, sem CSS estrutural nem cor no módulo (§1.2, §10.1; C-59); exceção nomeada no `docs/ui-excecoes.md` no mesmo PR (C-58). |
| `upgrade-e-migracoes.md` | Upgrade e Migrações | adota | 1 | O reconciliador converge o `schema.json` a cada boot e a app segue as regras de aperto e poda para não ficar `!saudavel` (§5.1; C-16, C-18, C-21); `migracoes/` nasce vazia e só recebe backfill ou renomeação de dado, por helpers. Índices nascem com a tabela e não há downgrade (§3.6). |
| `variaveis.md` | Variáveis de Configuração | não adota | — | "Apps não leem env do shell". O proxy de egresso para os portais, se a medição pedir, é configurado ali pelo admin com a alçada `sistema`, e o README da app lista os hosts candidatos (§8.2; C-34, D-79). |
| `wh.md` | Webhooks de Entrada | não adota | — | A V1 não recebe dado de fonte externa por POST: o pipeline publica artefatos e a rotina mensal os busca (§12; D-05). Ver pontos de atenção. |
| `wiki.md` | Wiki | não adota | — | Não há wiki corporativo no fluxo da equipe; dossiê e ficha vivem na própria app (§10.10). |

**Pontos de atenção** (o que a matriz mostrou; os três primeiros a v0.4 já tratou, os três últimos ficam como ideia, sem decisão):

- **A Lixeira restaura e purga por fora das rotas da app.** `lixeira.md`: "Restaurar — mesma
  operação do `PATCH /restaurar` do framework de Dados … zera `removido_em`/`removido_por_id`,
  atualiza `atualizado_em`", e "Fora de escopo …: audit trail de quem restaurou/hard-deletou". O
  restauro pela aba não passa pela rota `/restaurar` da app, então não grava `alteracoes_cadastro`,
  não sobe a coluna `versao` (D-88) e não passa pelo gate de `curador`. Tratado em §10.8: é aceito,
  porque só o admin da app vê a aba e o shell registra a ação. A **purga** (hard-delete) tem
  outro risco: ela dispara a cascata das FKs `cascata` e levaria retratos congelados e fichas. Na
  v0.5 histórico e registro congelado ligam ao cadastro por `restringir`, então a purga de anúncio
  com retrato e de área com ficha responde `409 DADOS_DEPENDENCIA_EXISTE` e o registro fica na
  lixeira (§5.1; precedente: `nobi`, `docs/limpeza.md`).
- **A identidade do módulo imobiliário mudou.** `obsolescencias.json` › `identidade-imobiliario-antiga`:
  "a identidade … passou a `urbiverso/modulos-urbiverso::imobiliario`", com `gate_apos`
  2026-10-09, já vencido. Tratado em §15.7, que agora
  traz o bloco `dependencias` com a chave nova (C-81).
- **Token de agente sem modo somente leitura.** `tokens-api.md`: "**Modo somente leitura** — tokens
  com essa flag bloqueiam métodos mutáveis (POST, PUT, PATCH, DELETE) no middleware". Tratado em §22.2: o README
  recomenda emitir o token da persona Agente como `somente_leitura`.

- **O widget de ajuda da app já existe e a spec não o usa.** `ajuda.md`: "Documentação · app · Há
  app corrente · Abre `/{appId}/docs`" e "Reportar bug / Fazer sugestão · `sentinela_config.ativo`
  naquele escopo". A spec não diz que `docs/` é lido pelo usuário dentro do app, nem se o admin
  liga o Sentinela da app para a equipe reportar defeito de coleta ou de número.
- **IA para arquivo e voz não foi considerada.** `ia.md`: "O slot `arquivos` extrai conteúdo de
  texto UTF-8, PDFs e imagens usando a API dedicada `extrairConteudo`" e "O slot `audio` é **STT de
  gravação curta** — o microfone do chat, uma mensagem de voz". Os editais da Terracap em PDF (Fase
  4B) e a observação de campo ditada (D-78, J7) são candidatos; dentro de D-04, seriam fallback
  desligado por padrão, como o slot de extração de página.
- **O pipeline poderia avisar a app em vez de esperar a rotina mensal.** `wh.md`: "**`recorrente`** —
  URL estável que aceita N chamadas", com o handler recebendo `req.dados` e `req.eventos`. Um POST
  do GitHub Actions ao publicar versão nova poderia publicar o mesmo evento que a carga já usa
  (D-91), sem esperar o mês. A V1 não o adota (o pipeline publica e a rotina busca, D-05); fica
  como melhoria depois da fase 4, sem decisão.

### 3.6 Convivência na instância (v0.5)

Instalar ou atualizar uma app reinicia o shell inteiro, e com auto-update isso acontece sem
ninguém clicar (overview.md › Restart): cada release da app derruba por segundos todas as apps da
Pinguim, que recebe devs de fora. Regras (D-106):

1. **Índices nascem com a tabela.** Cada tabela nasce com todos os `indices` e `unicos` que a spec
   lhe dá, na release que a cria. O reconciliador cria índice também em tabela existente, no boot,
   com teto de 5 s de espera por lock; índice novo em tabela que já tem dado (anúncios, retratos,
   células) só entra com nota no PR medindo a contagem de linhas na Pinguim, e `unico` novo só
   depois de conferir que o dado não o viola (senão a app fica `!saudavel`).
2. **Cadência.** Releases são agrupadas, no máximo uma por dia útil, publicadas fora do horário
   de uso, e a fase só publica release instalável quando o teste local passou. O horário exato é
   item do checklist da fase −1 (§15.−1) `[PENDENTE P-48]`.
3. **Sem downgrade.** A plataforma recusa downgrade em todo caminho de instalação: release
   defeituosa se corrige com release nova (`z+1`), e a spec não promete rollback.
4. **Aceitação.** A Pinguim fica com nível de aceitação `Releases` e auto-update ligado (a release
   nasce prerelease pelo `urbi-release`); a Laputa fica em `homologado`, e a homologação
   (`prerelease=false`) é ato humano (precedente: `reg360`, `docs/operacao.md`).
5. **Migração pesada fora do boot.** Migração de dados pesada roda fatiada por rotina e cursor,
   nunca no boot.
6. **Coleta numa instância só.** A coleta nos portais roda na Laputa depois do corte da fase 3; na
   Pinguim, `coleta_ativa` fica `false` fora da janela de QA de coleta (§15).
7. **Sem dado sigiloso.** Áreas próprias, teses e cenários reais nunca entram na Pinguim (§15).

---

## 4. Manifesto

### 4.1 `manifesto.json`

```jsonc
{
  "nome": "Inteligência Imobiliária",
  "versao": "0.1.0",
  "descricao": "Oferta, mercado e território do mercado imobiliário, com dado rastreável e análises por IA",
  "identidade": "UP-Urbita/app-inteligencia-imobiliaria::inteligencia_imobiliaria",   // desde a 1ª release (C-03); fecha D-16
  "shell_min": "0.56.37",
  "sdk_min": 100,

  "roles": {
    "leitura": {
      "estrategico": {
        "descricao": "Vê as áreas próprias da UP e o que pende delas: teses, condições, diligências, síntese, cenários, fichas",
        "sticker": { "icone": "fa-solid fa-lock", "cor": "#6A1B9A" }
      }
    },
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
    { "titulo": "Início", "rota": "/", "icone": "fa-solid fa-house" },
    { "titulo": "Mapa", "rota": "/mapa", "icone": "fa-solid fa-map-location-dot" },
    { "titulo": "Mercado", "rota": "/mercado", "icone": "fa-solid fa-chart-line" },
    { "titulo": "Diagnóstico", "rota": "/diagnostico", "icone": "fa-solid fa-city" },
    { "titulo": "Estudos de área", "rota": "/estudos", "icone": "fa-solid fa-draw-polygon" },
    { "titulo": "Produto", "rota": "/produto", "icone": "fa-solid fa-building" },
    { "titulo": "Comércio e âncoras", "rota": "/comercio", "icone": "fa-solid fa-store" },
    { "titulo": "Terra e oferta futura", "rota": "/terra", "icone": "fa-solid fa-mountain-sun" },
    { "titulo": "Análises", "rota": "/analises", "icone": "fa-solid fa-wand-magic-sparkles" },
    { "titulo": "Cadastro", "rota": "/cadastro", "icone": "fa-solid fa-pen-ruler" },
    { "titulo": "Operação", "rota": "/operacao", "icone": "fa-solid fa-gears" }
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

- `permissao_padrao` não é campo do manifesto: é configuração do admin da instância
  (`config_apps.permissao_padrao`, Admin › Instaláveis › Apps › Acesso, alçada `usuarios`). A spec
  pede que ela fique em **nenhuma** (D-13); a liberação é por pessoa. Conferir o valor é passo da
  instalação, escrito no README da app (C-56).
- `identidade` é `UP-Urbita/app-inteligencia-imobiliaria::inteligencia_imobiliaria` (seção 3.1):
  o `owner/repo` é o do repositório da app e o `slug` é igual ao nome da pasta. A obsolescência
  `manifesto-sem-identidade` tem `gate_apos` em 2026-10-28, e a partir daí o manifesto sem o
  campo, ou com forma errada, reprova no empacotamento, no CI e na instalação (C-03).
- **Papel `estrategico` (v0.5).** Declarado sob `leitura`, para que a Direção o receba (um usuário
  com nível `leitura` só recebe papéis de `leitura`; e `nivelApp: 'admin'` não confere os papéis
  declarados). Áreas `tipo = propria` e o que pende delas só são lidas por quem tem `estrategico`
  ou `curador`, ou é o `responsavel_id` da área; para os demais elas somem das listas e o detalhe
  responde `404` (seção 14; D-107). Quem recebe o papel segue em P-06.
- `rotas_publicas`, `paginas_publicas`, `dependencias`, `webhooks`, `wiki`, `emails` não são
  declarados.
- `ui` fica ausente: a app está sob o framework de UI e é validada por ele. O tipo `Manifesto` do
  SDK não lista `ui` nem `parametros` (só o doc os descreve), então o `manifesto.json` não é
  conferido por `satisfies Manifesto` em TypeScript (C-09).
- **O `nav` tem onze folhas, uma por área (D-86).** O teto da plataforma é "máximo de 20 itens no
  total (contando sub-itens)" e o desenho da v0.3 tinha 45 (C-04). Cada área que tinha sub-itens
  (Diagnóstico, Estudos de área, Produto, Comércio e âncoras, Terra e oferta futura, Cadastro,
  Operação) vira uma folha cuja tela abre com `urbi-abas`, uma aba por sub-rota; as sub-rotas
  continuam no path (`/diagnostico/ranking`, `/operacao/fontes`…), então link de notificação e
  favorito abrem a aba certa. Sobram nove itens de margem para o futuro.
- **Início é a raiz (v0.5).** O shell põe **Home** como primeiro item do menu, e o Home da app
  abre a sub-rota `/`. Por isso a tela Início mora em `/` e o `nav` a declara com `"rota": "/"`: o
  Home do shell e o Início do `nav` abrem a mesma tela, em vez de duas telas lado a lado. `/inicio`
  não existe como tela; links de notificação e visões salvas usam `/`. Rota desconhecida cai num
  `urbi-estado-vazio` "Página não encontrada" com link para Início, sem redirecionar em silêncio
  (precedentes: `radar_sei`, `charles3` e `reg360` declaram a tela de entrada em `/`;
  D-110). As folhas continuam onze.
- A ordem do `nav` põe as telas de decisão (Início, Estudos de área, Produto, Comércio e âncoras,
  Terra e oferta futura) logo depois das telas de leitura, e o Cadastro e a Operação no fim.
- A ordem das rotinas importa e é configurada pelo admin na aba Rotinas, por **hora cheia
  distinta** no fuso da organização. O default de fábrica é 06:00 UTC para todas, que poria as
  treze no mesmo slot; por isso o README da app traz a **grade de horários sugerida** (ex.: 01h
  `descobrir_anuncios`, 02h `verificar_anuncios`, 03h `agrupar_anuncios`, 04h
  `verificar_lancamentos`; mensais no dia 1: 05h `fechar_mes`, 06h `carregar_series_macro`, 07h
  `calcular_achados`, 08h `gerar_analises_mensais`), aplicada em cada instância na release que
  declara a rotina. Não existe dependência entre rotinas (`RotinaManifesto` só tem `titulo`,
  `descricao` e `frequencia`), e o catch-up depois de indisponibilidade dispara de uma vez todas
  as rotinas com slot perdido, sem ordem (C-05, C-36; fecha P-05). Duas defesas (v0.5):
  - **Trava por classe.** `cursores_rotina` ganha classe: `coleta` (`verificar_anuncios`,
    `descobrir_anuncios`, `verificar_lancamentos` e as continuações delas) e `carga`
    (`fechar_mes`, `carregar_dados_publicos`, `recalcular_derivados`, `calcular_achados`,
    `agrupar_anuncios`). No máximo uma execução por classe ao mesmo tempo, pelo mesmo
    compare-and-set da D-85; quem não obtém a trava grava a `coleta` como `adiada`, agenda
    `continuar_coleta` para +10 min e devolve `ok: true` com "adiada: <rotina> em curso". As
    rotinas leves ficam fora (seção 7).
  - **Guarda da cadeia mensal que não falha calada.** `calcular_achados` e
    `gerar_analises_mensais` conferem a pré-condição (mês `M` fechado, achados de `M` calculados).
    Falsa, devolvem `ok: true` com "aguardando fechar_mes de M" e reagendam por `continuar_coleta`
    em +60 min, até 6 vezes; esgotadas as tentativas, ou passados 3 dias de `M`, devolvem
    `ok: false` e publicam `cadeia_mensal_parada` (seção 13). A aba Rotinas mostra `Falhou`, e a
    Operação › Saúde mostra o estado de cada elo por mês. Rotina mensal com `ok: true` só roda de
    novo no mês seguinte, por isso "parcial" como sucesso esconderia o mês perdido.
- O admin da instância precisa **autorizar os slots-base `poder` e `barato`** para a app (Admin ›
  Instaláveis › Apps › IA): slot custom só tem configuração própria por override local, e sem
  override cai na base. `barato` não tem cascata: sem ele configurado, o fallback de extração
  falha em vez de cair para `normal`. "Desligado por padrão" do `extracao_pagina` é o parâmetro
  `usar_ia_extracao_lancamentos`, não uma propriedade do slot (C-06).
- O limite de requisições de IA por minuto é **por app** e é do admin da app (Config › IA ›
  Configurações, 1 a 600; padrão 10). O worker do modo assíncrono o respeita e transforma o estouro
  em `RATE_LIMIT` retentável com backoff, então pausa entre enfileiramentos não controla o ritmo.
  A fase 5 sobe o limite para `30` na instalação, e `gerar_analises_mensais` enfileira no máximo
  `ia_lote_por_fatia` análises por fatia, com a próxima por `continuar_coleta` em +2 min, deixando
  folga para os pedidos de usuário no mesmo minuto (D-109).

### 4.2 Exports do `backend/rotas.ts`

| Export | Conteúdo |
|---|---|
| `rotas` | Router autenticado, montado em `/api/inteligencia_imobiliaria/` (seção 6) |
| `rotasPessoais` | Router das visões salvas e da telemetria de uso (`POST /pessoal/uso`, que grava `uso_eventos`), montado pelo shell em `/api/inteligencia_imobiliaria/pessoal/*`, onde `POST`/`PATCH`/`DELETE` exigem só `leitura` e o shell impõe `usuario_id` (D-80, C-54; seções 5.23, 6.16) |
| `rotinas` | Handlers das treze rotinas (seção 7) |
| `aoIniciar` | Dispara a semente idempotente (v0.5: `garantirSemente(dados)` de `backend/semente.ts`, promise memoizada por processo). Como o `aoIniciar` roda depois do `listen`, um middleware no topo de `rotas` e de `rotasPessoais` aguarda a mesma promise, e listeners e rotinas também a aguardam antes de agir; falha zera a memoização e segue por `next(e)`, e o request seguinte tenta de novo (precedente: `nobi`, `backend/seed.ts`). Não há `503 APP_PREPARANDO`. A semente é pequena (1 cidade, 35 localidades), então o primeiro request espera menos de 1 s (D-112). Conteúdo: a cidade `distrito_federal` e as 35 localidades do tipo `ra` com códigos oficiais, **sem** geometria nem perfil (os dois vêm por importação). `faixas_programa` nasce vazia de propósito: valores de portaria não entram por semente, e a tela de Produto pede o cadastro. **Reconcilia** as inscrições do evento `lacuna_cadastro` com o papel `curador` (seção 13; C-49), sem bloquear request. Guarda o `ctx`, que é o mesmo `ContextoListener` das rotinas e dos listeners ("guardar a referência é legítimo e esperado", C-11, C-33) |
| `aoEncerrar` | Sinaliza o `AbortController` do lote de coleta em voo. Não recebe `ctx` (usa o guardado no `aoIniciar`), tem um orçamento de 5 s compartilhado por todas as apps e nada garante que termine: o cursor e a `coleta` já estão gravados por fatia (seção 7), e o encerramento não grava nada (C-12) |
| `reagir` | Dois listeners: `continuar_coleta`, que retoma a rotina indicada pelo cursor (seção 7; D-85), e `analise_concluida`, que grava o resultado de uma análise de IA pedida em modo assíncrono (seção 6.8; D-82) |

Não exporta `rotasPublicas`, `webhooks` nem `disparadores`. A v0.1 dizia que `reagir` também
não era exportado, mas a seção 7 já dependia dele para a continuação das rotinas fatiadas; a v0.2
corrige (D-47). A v0.4 acrescenta `rotasPessoais` (D-80) e o segundo listener (D-82); o listener
de `analise_concluida` é callback de uma chamada que a própria app fez, não reação a outro
domínio, então não contraria D-47.

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
| `coleta_ativa` | bool | `true` | Off-switch de toda a coleta (v0.5). Desligado, nenhuma rotina de coleta externa nem continuação faz requisição: lidas no início de cada fatia, fecham a `coleta` como `pausada` e não reagendam; as rotas manuais de coleta respondem `409 COLETA_PAUSADA`. O toggle da aba Rotinas desliga uma rotina, mas não a cadeia de continuações já agendadas (precedente: `atendimento_ativo` do `nobi`; D-108) |
| `fuso_organizacao` | string | `America/Sao_Paulo` | Fuso em que as rotinas cortam o dia e o mês (`intervaloDoDia(data, fuso)` do SDK). O `ctx` de rotina não traz fuso nem relógio; o fuso da organização só chega em `req.contexto.fuso`, em rota autenticada (D-84, C-33) |
| `jitter_raio_m` | numero | `350` | Raio do deslocamento determinístico aplicado à coordenada aproximada |
| `manifest_publico_url` | string | `https://raw.githubusercontent.com/rafaleandrog/inteligencia-real-estate/main/data/public/manifest.json` | De onde a rotina `carregar_dados_publicos` lê o manifest (o `padrao` é literal, C-07). O pipeline fica neste repositório, público porque só publica dado público, e a app privada o lê sem credencial (seção 15.0a); a mudança de dono segue em R-25 `[PENDENTE P-44]` |
| `usar_ia_extracao_lancamentos` | bool | `false` | Liga o slot `extracao_pagina` como fallback na verificação de lançamentos |
| `analise_minimo_meses_historico` | numero | `6` | Meses de histórico mínimos para a IA escrever sobre um recorte |
| `ia_lote_por_fatia` | numero | `8` | Análises que `gerar_analises_mensais` enfileira por fatia; a fatia seguinte vem por `continuar_coleta` em +2 min, com folga no limite de requisições por minuto da app (v0.5, seção 4.1) |
| `instrucoes_analise_territorio` | texto_longo | texto da seção 9.3 | Instruções de sistema da análise de localidade |
| `instrucoes_analise_mercado` | texto_longo | texto da seção 9.3 | Instruções de sistema da análise de mercado |
| `instrucoes_analise_tela` | texto_longo | texto da seção 9.3 | Instruções de sistema da análise de recorte. A análise de tela não aparece em jornada nenhuma `[PENDENTE P-46]` |
| `faixas_area_m2` | string | `50,80,120,180` | Cortes das faixas de área das métricas mensais |
| `raios_padrao_m` | string | `1000,3000,5000` | Anéis padrão de áreas de estudo, fichas e simulações (D-23) |
| `hex_zoom_min` | numero | `12` | Zoom a partir do qual a camada hexagonal desenha células r9; abaixo, o pai r8 |
| `hex_max_celulas_resposta` | numero | `6000` | Teto de células por resposta da camada; acima, a rota agrega em r8 |
| `agrupar_tolerancia_area_frac` | numero | `0.02` | Diferença máxima de área para sugerir que dois anúncios são o mesmo imóvel (D-26) |
| `agrupar_tolerancia_preco_frac` | numero | `0.05` | Diferença máxima de preço para a mesma sugestão |
| `agrupar_distancia_max_m` | numero | `150` | Distância máxima quando os dois têm coordenada exata |
| `indice_n_minimo_estrato` | numero | `5` | Estrato com menos anúncios repete o valor do mês anterior, marcado, por até `indice_imputacao_max_meses` |
| `indice_imputacao_max_meses` | numero | `3` | Meses seguidos em que um estrato pode repetir o mês anterior; depois ele sai e os pesos se renormalizam (v0.5) |
| `indice_peso_imputado_max_frac` | numero | `0.30` | Peso máximo de estratos imputados ou ausentes; acima disso o índice do mês é `null` com motivo (v0.5) |
| `saude_parser_janela_execucoes` | numero | `7` | Execuções que formam a linha de base da saúde do parser (D-27) |
| `queda_itens_max_frac` | numero | `0.30` | Queda de itens lidos contra a linha de base que marca a fonte como degradada |
| `aumento_nulos_max_frac` | numero | `0.20` | Aumento absoluto da taxa de nulos de um campo que marca a fonte como degradada |
| `pdad_cv_alerta_frac` | numero | `0.15` | Coeficiente de variação acima do qual o número da PDAD vem com aviso de cautela (D-29) `[PENDENTE P-29]` |
| `comprometimento_renda_frac` | numero | `0.30` | Parcela máxima da renda domiciliar na capacidade de pagamento (D-44) |
| `prazo_financiamento_meses` | numero | `360` | Prazo da simulação de financiamento |
| `entrada_frac` | numero | `0.20` | Entrada da simulação |
| `taxa_juros_aa_frac_override` | numero, `nullable` | `null` | Taxa anual fixa; `null` = taxa da faixa de programa ou a última série `taxa_financiamento` (C-07) |
| `faixas_preco_brl` | string | `300000,500000,800000,1200000,2000000` | Cortes das colunas da matriz de produto |
| `huff_expoente_distancia` | numero | `2` | Expoente de distância do modelo de Huff (D-43) `[PENDENTE P-27]` |
| `huff_raio_max_m` | numero | `10000` | Distância além da qual a célula de demanda não entra na simulação |
| `lacuna_comercial_razao_min` | numero | `1.5` | Gasto potencial por estabelecimento, somado na bacia da categoria (`raio_bacia_m` declarado por categoria em `comum/comercio/categorias.ts`, não por célula isolada), contra a mediana da cidade, que vira achado de lacuna (v0.5) |
| `similaridade_max_resultados` | numero | `10` | Resultados das áreas gêmeas |
| `achados_max_por_recorte` | numero | `12` | Achados entregues por recorte à tela e à IA (D-21) |
| `achado_janela_meses` | numero | `24` | Janela histórica da regra de mudança incomum |
| `instrucoes_analise_area` | texto_longo | texto da seção 9.3 | Instruções de sistema da análise de área |
| `poligono_max_km2` | numero | `200` | Maior área aceita em recorte, área de estudo e enriquecimento (seção 21) |
| `poligono_max_vertices` | numero | `500` | Vértices máximos de um polígono gravado (área de estudo, contorno desenhado) |
| `polyline_max_vertices` | numero | `300` | Vértices máximos de um polígono ad hoc na querystring (≈ 2 KB em *encoded polyline*); acima disso a tela salva o desenho como área de estudo temporária e passa o `id` (D-92, C-77) |
| `raio_max_m` | numero | `20000` | Maior raio aceito |
| `cache_ttl_dias` | numero | `30` | Validade máxima de um cálculo em cache, mesmo sem mudança de versão (D-69) |
| `uso_retencao_dias` | numero | `180` | Retenção da telemetria de uso (D-72) |
| `bruto_rejeitados_retencao_dias` | numero | `90` | Retenção do conteúdo bruto de candidatos rejeitados (D-74) |
| `area_liquida_min_ha` | numero | `1` | Abaixo disso a área líquida não é estimada. Desde a v0.5 ela é vetorial (polígono − restrições, em SIRGAS 2000 / UTM 23S), não pela grade, cuja célula tem ≈ 10,5 ha (R-28) |
| `app_largura_padrao_m` | numero | `30` | Faixa de APP assumida para curso d'água sem largura conhecida, como premissa declarada (D-61) `[PENDENTE P-32]` |
| `declividade_restritiva_frac` | numero | `0.30` | Declividade a partir da qual o terreno conta como restrito; o pipeline vetoriza a declividade com esse corte (5.21) |
| `faixas_area_lote_m2` | string | `250,450,800,1500,5000` | Cortes das faixas de área do mercado de lotes (D-64) |
| `viab_eficiencia_privativa_frac` | numero | `0.70` | Área privativa ÷ área computável, ponto de partida (D-63) `[PENDENTE P-35]` |
| `viab_fator_custo_sobre_cub` | numero | `1.35` | Multiplicador do CUB para chegar ao custo de obra total `[PENDENTE P-35]` |
| `viab_despesas_comerciais_frac` | numero | `0.06` | Corretagem e marketing sobre o VGV `[PENDENTE P-35]` |
| `viab_impostos_frac` | numero | `0.04` | Tributos sobre a receita (referência: RET da incorporação) `[PENDENTE P-35]` |
| `viab_margem_alvo_frac` | numero | `0.15` | Margem do incorporador sobre o VGV `[PENDENTE P-35]` |
| `viab_aproveitamento_loteavel_frac` | numero | `0.55` | Área de lotes ÷ área líquida no método de loteamento `[PENDENTE P-35]` |
| `viab_desconto_pedido_venda_frac` | numero | `0.10` | Desconto do preço pedido para o de venda no VGV, usado só sem IVV do recorte (com IVV: 1 − venda ÷ pedido, últimos 12 meses), como premissa declarada (v0.5) `[PENDENTE P-35]` |
| `viab_custos_indiretos_frac` | numero | `0.10` | Custos indiretos (projetos, aprovação, legalização, administração) sobre o custo de obra (v0.5) `[PENDENTE P-35]` |
| `viab_aquisicao_frac` | numero | `0.04` | ITBI + registro na aquisição do terreno: residual líquido = residual bruto ÷ (1 + fração) (v0.5) `[PENDENTE P-35]` |
| `alvara_validade_meses` | numero | `48` | Alvará sem habite-se e sem lançamento vinculado há mais que isso sai do pipeline de oferta e vai para "alvará antigo sem habite-se"; premissa declarada a conferir no Código de Obras do DF (v0.5) |

`indice_ano_base` saiu na v0.5 (fecha P-23): a base do índice estratificado (D-40) são os
primeiros 12 meses corridos com índice publicável, resolvidos no código, e não um ano civil, que só
fecharia no fim de 2027 (seção 5.4).

`agrupar_confianca_auto` saiu na v0.5 (D-113): a app não guarda
anunciante, e com coordenada por jitter um limiar de confiança contaria plantas iguais do mesmo
prédio como um imóvel. A contagem automática como um imóvel, sem curador, fica presa a uma regra
fixa no código (coordenada exata nos dois a ≤ 30 m, área igual a ±1 m² e preço a ±2%); qualquer
outro grupo só conta depois de `confirmado` (seção 7.7).

O padrão é vivo: mudar um `padrao` num release vale em toda instância que não personalizou
(`shell_min` 0.53.20, coberto). As instruções de IA ficam como parâmetro justamente para que a
equipe as refine na tela, sem release.

Três regras do framework que a tabela respeita (C-07): os tipos são só `bool`, `numero`, `string`
e `texto_longo` — lista entra como CSV em `string` (convenção da app) e **JSON não é parâmetro**,
por isso as séries macro saem daqui e viram a tabela `series_macro_config` (D-90, seção 5.19);
`padrao` é obrigatório e literal (texto explicativo entre parênteses não é declarável; quando o
padrão depende de dado, o parâmetro é `nullable` com `padrao: null` e a regra mora no código); e
nenhum parâmetro é `secret` — o único que havia, `proxy_saida_url`, saiu com a D-79 (o proxy de
saída é da instância). O tamanho máximo de `texto_longo` não é documentado.

---

## 5. Modelo de dados (`schema.json`)

### 5.1 Regras gerais

- Toda tabela declara `acesso_externo` **explicitamente**: o framework não tem default ("declare
  explicitamente, sem default silencioso") e o validador reprova a omissão (C-10). A convenção
  desta app é **`restrito`**: a rota genérica `/api/dados/...` fica fechada e toda leitura e
  escrita passa pelas rotas da app, que aplicam as regras (papel, validação, eventos). Só as
  tabelas de leitura simples sem regra ficam em `somente_leitura` (indicado na tabela). A app não
  declara `aceita_externos`: usuário externo nunca entra.
- Toda tabela de cadastro tem `soft_delete: true` e `id_legivel`. `soft_delete` filtra o removido
  em `listar`, `buscar`, `incluir` e nas rotas genéricas, mas **`atualizar` escreve em registro
  removido**: todo `PATCH` de cadastro faz `buscar` antes de `atualizar` e devolve `404` se o
  registro sumiu. Como as tabelas são `restrito`, os genéricos `/remover` e `/restaurar` ficam
  trancados, e as rotas `/remover` e `/restaurar` da app são invólucros de
  `req.dados.remover`/`restaurar` (C-19). A restauração manual também está na aba Lixeira da
  Config (seção 10.8).
- `id`, `criado_em` e `atualizado_em` são automáticos e **não** se declaram. Controle de
  concorrência otimista é por coluna **`versao`** (`inteiro`, padrão 1) e `req.dados.atualizarSe`
  com `{ versao }` nas condições, incrementando-a na mesma escrita; `atualizado_em` é só para
  exibição (D-88, C-22). Levam `versao` as tabelas editáveis por mais de uma pessoa: cadastros
  (anúncios, lançamentos, âncoras, contornos, localidades, empreendimentos, lotes Terracap,
  licenças, faixas de programa), `areas_estudo`, `area_sintese_itens`, `teses`, `tese_condicoes`,
  `diligencias`, `hipoteses_ancora`, `hipoteses_produto` (v0.5) e `cenarios_viabilidade`.
- **Referência a `shell.usuarios` cujo nome aparece em tela** declara
  `campos_incluir: ["nome as <coluna>_nome", "avatar_url as <coluna>_avatar"]`: o framework faz o
  `LEFT JOIN` e o nome do autor chega em `listar`, `buscar` e na rota genérica. Não há leitura de
  `tipo` nem de `email`, e consulta declarada não cita `shell.*` (C-29). Vale para todo
  `autor_id`, `responsavel_id`, `decidido_por_id`, `usuario_id` exibido.
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
- Toda tabela que o site lia da planilha guarda em `id_legado` (texto, `unico: true`) a chave
  antiga (`listing_id`, `development_id`, `place_id`, `polygon_id`, …), para a migração ser
  conferível e para links antigos serem traduzíveis. "Único quando preenchido" de uma coluna só já
  é o comportamento de `unico: true` (NULLs distintos); não precisa de único parcial (C-17).
- `extras` (`json`) aparece nas tabelas de série publicada: guarda as colunas publicadas que o
  app não modela como coluna própria, verbatim, para nada se perder na importação.
- **Rastro da importação (v0.5).** Toda tabela que a importação CSV alcança (seção 11.1) tem a
  coluna `importacao_id` (referencia → `importacoes`, `anular`, não obrigatória), preenchida na
  linha **criada** por uma importação e nunca reescrita depois; linha criada por rota, rotina ou
  coleta fica com `null`. São elas: `localidades`, `localidade_perfis`, `contornos`,
  `fontes_portal`, `buscas_portal`, `anuncios`, `lancamentos`, `ancoras`, `ivv_mensal`,
  `ivv_regional`, `fipezap_mensal`, `pdad_observacoes`, `pdad_figuras`, `procedencias`,
  `trechos_rodoviarios`, `trecho_aliases`, `sentidos_oficiais`, `trafego_diario`, `corredores`,
  `corredor_diario`, `empreendimentos`, `terracap_lotes`, `licenciamento_obras`,
  `faixas_programa` e `areas_estudo`. É o que permite **desfazer** uma importação:
  soft delete das linhas daquela importação cuja `versao` ainda é a da criação (precedente:
  reg360, importação idempotente com marcador por linha). `indices`: `(importacao_id)` em cada
  uma. Tabela importável sem `versao` (as séries publicadas) compara `atualizado_em` com
  `importacoes.aplicada_em`.
- **Histórico não sai por purga (v0.5).** FK de tabela de histórico ou de registro congelado
  para um cadastro com `soft_delete` é **`restringir`**, nunca `cascata`: `anuncio_retratos`,
  `anuncio_eventos`, `lancamento_eventos`, `area_estudo_fichas`, `teses`, `tese_condicoes`,
  `diligencias`, `area_sintese_itens`, `hipoteses_ancora`, `hipoteses_produto`, `area_eventos`
  e `observacoes_campo`. Com isso o hard-delete da Lixeira responde `409
  DADOS_DEPENDENCIA_EXISTE` para anúncio com retrato e para área com ficha, e o registro fica na
  lixeira; a remoção lógica continua livre (precedente: nobi, `tarefas_transicoes` e
  `lancamentos_financeiros` em `restringir` sob cadastro `soft_delete`). `cascata` fica só para
  vínculo e cache sem valor histórico: `celula_metricas`, `conjunto_arquivos`, `fonte_saude`,
  `area_perimetros`, `observacao_fotos` e as tabelas `pessoal`. `restringir` em coluna
  obrigatória não gera aviso do validador (o aviso é só para coluna anulável). O README da app
  diz ao admin que a purga de anúncio ou área com histórico é recusada por desenho.
- **Supressão por amostra (v0.5).** Vale para tabela materializada, rota, achado e contexto de
  IA: mediana só com n ≥ 5; P25, P75 e dispersão só com n ≥ 10; variação entre dois meses só
  quando os dois têm n ≥ 20. Abaixo disso o campo é `null` com o motivo `amostra_pequena` e o `n`
  ao lado, nunca o valor com aviso. Oferta por célula ou por anel só usa anúncios com `h3_r9`;
  quando a fração de anúncios ativos do recorte com coordenada exata é menor que 0,5, o bloco de
  oferta do entorno usa a estatística da localidade, rotulada "da RA, não do anel" (seção 10.10).
  Não há meta de volume como portão de fase: a Operação mostra n por localidade × tipologia como
  fila de coleta (R-16).

**Tradução da notação desta spec para o `schema.json` (C-15).** As tabelas abaixo usam uma
notação curta; o `schema.json` usa a forma do framework de dados:

| Notação da spec | `schema.json` | Nota |
|---|---|---|
| `texto(n)` | `{ "tipo": "texto", "limite": n }` | **toda** coluna `texto` declara `limite`; `texto` sem número na spec vira `texto_longo` ou ganha limite na implementação |
| `texto_longo` | `{ "tipo": "texto_longo" }` | `TEXT` |
| `inteiro` | `{ "tipo": "inteiro" }` | `INTEGER` de 32 bits; o bundle não documenta `bigint` |
| `decimal(p,s)` | `{ "tipo": "decimal", "precisao": p, "escala": s }` | sem teto documentado para `(18,6)` |
| `booleano`, `data`, `datahora`, `json` | o mesmo nome em `tipo` | `json` é `JSONB` |
| `arquivo (mimes; n MB)` | `{ "tipo": "arquivo", "mimes": [...], "tamanho_max_mb": n }` | `tamanho_max_mb` é teto da coluna **sob o cap global da instância**, que o bundle não publica; conferir o cap é passo da fase 0 na Pinguim |
| `referencia → t, cascata` | `{ "tipo": "referencia", "tabela_ref": "t", "ao_deletar": "cascata" }` | `cascata`, `anular` (o default) ou `restringir`; `shell.usuarios` é a única tabela do shell referenciável |
| `opcoes: [...]`, `padrao`, `obrig.` | `opcoes`, `padrao`, `obrigatorio` | |
| `formato ^…$` | `formato` | piso SDK 94, coberto |

Geometria continua em `json`: o tipo `geometria` do framework é só de módulo, e app não tem
PostGIS (D-05).

**Regras do reconciliador que a app segue (C-16, C-18, C-21).**

- Índice novo — composto, único, total ou parcial — nasce no boot seguinte, **sem migração**,
  inclusive em tabela que já existe. Único novo sobre dado duplicado vira pendência (a app fica
  `!saudavel` até o dado ser corrigido por migração); índice não único não falha por dado; índice
  que o `schema.json` deixa de declarar é podado.
- Mudar `opcoes` de coluna com dado gravado pede, no **mesmo release**, uma migração que
  normaliza os valores antigos; senão o CHECK recriado deixa a app `!saudavel` por pendência.
  Vale para o `estagio` de `areas_estudo`, cujos valores mudaram na v0.3: eles entram
  definitivos antes da primeira release.
- Coluna ou tabela removida do `schema.json` é podada se estiver vazia; com dado, é erro com
  receita. Remover ou renomear é um release: `schema.json` + migração que copia (com
  `varrerTudo`, nunca `listar`) e esvazia a antiga (`limparColuna`). Mudar tipo, `limite` ou
  `precisao` é coluna nova, nunca alteração.
- Não há limite documentado de tabelas ou colunas por app; as ~60 tabelas ficam separadas.

**Único parcial (C-17).** Declara-se por objeto:
`{ "colunas": ["tipo_ato", "numero"], "onde": [{ "coluna": "numero", "operador": "nao_nulo" }] }`.
Em tabela com `soft_delete`, o predicado repete `{ "coluna": "removido_em", "operador": "nulo" }`,
senão um registro removido bloqueia o recadastro. Vale para os únicos parciais de `contornos`,
`lancamentos`, `ancoras` e `licenciamento_obras`. Nada disso é validação em código.

**Anexos não obrigatórios expiram (D-89, C-41).** Toda coluna `arquivo` sem `obrigatorio: true`
expira no TTL da instância (`ttl_dias`, padrão 90) e a Faxina apaga o blob. Por isso: o que tem de
durar é `obrigatorio`: `conjunto_arquivos.arquivo`, `importacoes.arquivo` e a foto de campo, que
é evidência (D-78) e por isso sai de `observacoes_campo` para a tabela própria `observacao_fotos`,
onde a coluna pode ser obrigatória (seção 5.20). O que é cópia de conveniência
(`contornos.arquivo_origem`, `areas_estudo.arquivo_origem`) expira, e a tela mostra "arquivo
original expirado" em vez de link quebrado; a geometria e os dados extraídos do arquivo ficam nas
colunas da linha, que não expiram. Arquivo de linha apagada sai junto, na mesma transação do
`deletar`/`deletarVarios`; `req.arquivos.remover` recusa coluna `obrigatorio` (`409
ARQUIVOS_COLUNA_OBRIGATORIA`). A Operação pode exibir o evento do shell
`urbiverso.arquivos.removido` (com `motivo`: `ttl_expirado`, `registro_deletado`…).

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

E na v0.5:

```
areas_estudo ── hipoteses_produto ── tese_condicoes (hipotese_produto_id, opcional)

importacoes ── importacao_id em toda tabela importável (seção 5.1)
```

Não há outra tabela nova na v0.5; o resto são colunas: `buscas_portal.painel` e `painel_desde`,
`anuncios.busca_origem_id`, `cursores_rotina.classe` e `agendamento_id`, status `pausada` e
`adiada` em `coletas`, `terracap_lotes.destinacao_categoria`, `importacoes.desfeita_em` e
`desfeita_por_id`, e as colunas de liquidez por Kaplan-Meier em `metricas_anuncios_mensais`.

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
| `id_legado` | texto(80), único | não | `polygon_id` | |
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
| `estilo` | json | não | `fill_color`, `stroke_color`, `fill_opacity`, `stroke_width`, `color` | no formato `EstiloFeicao` do `urbi-mapa` (D-87, C-62): `preenchimento`, `opacidadePreenchimento` (0–1), `contorno`, `espessura` (px), `opacidadeContorno`, `tracejado`, `marcador`, `rotulo`. A migração traduz `fill_color→preenchimento`, `fill_opacity→opacidadePreenchimento`, `stroke_color→contorno`, `stroke_width→espessura`, `color→contorno` (linha) ou `preenchimento` (polígono) |
| `ordem_camada` | inteiro | não | `z_index` | ordem do contorno entre os grupos; a tela a usa para ordenar o array `camadas` do mapa, porque `EstiloFeicao` não tem `z_index` e não há ordem por feição dentro de uma camada (D-87) |
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
| `arquivo_origem` | arquivo (`application/vnd.google-earth.kml+xml`, `application/vnd.google-earth.kmz`, `application/geo+json`, `application/octet-stream`; até 20 MB, sob o cap da instância) | não | — | o KML/KMZ/GeoJSON importado, guardado para reprocessamento; **expira no TTL da instância** (D-89) — reprocessar depois disso pede reimportar. `octet-stream` entra porque o navegador nem sempre rotula KMZ, e a app confere o conteúdo pelos bytes (C-38) |

`unicos`: `(tipo_entidade, entidade_codigo, geometria_hash)`. `indices`: `(grupo_camada, status)`,
`(bbox_oeste, bbox_leste)`, `(bbox_sul, bbox_norte)`, `(localidade_id)`.

Validação na escrita (mesmas regras do `Code.gs`): `Polygon`/`MultiPolygon` com anel de ao
menos quatro posições, três distintas, fechado; `LineString` com ao menos duas; longitude em
[-180, 180], latitude em [-90, 90]; ordem `[lng, lat]` conferida pela faixa (latitude fora de
[-90, 90] denuncia inversão). A conferência pela faixa é obrigatória também para a geometria que
vem do `urbi-mapa` (`urbi:mapa-geometria`), porque o doc do primitivo não escreve a ordem das
coordenadas que ele emite (C-61).

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
| `url_base` | texto(500) | sim | `base_url` | o host dela é a unidade do intervalo mínimo entre requisições e a base da guarda de destino da coleta (seção 8.2); só `http`/`https` na porta padrão; IP literal, `localhost` e host terminado em `.local` ou `.internal` são recusados ao salvar; host com ponto inicial (`.dfimoveis.com.br`) cobre os subdomínios |
| `parser` | texto, `opcoes: ["generico_html", "generico_json", "quintoandar", "dfimoveis", "wimoveis", "imovelweb", "vivareal"]` | sim | `parser_key` | seção 8.3 |
| `config_parser` | json | não | `parser_config_json` | `items_path`, `field_map` |
| `cabecalhos` | json | não | `request_headers_json` | cabeçalhos extras, só de uma lista fechada (`Accept`, `Accept-Language`, `Referer`); `Host`, `Cookie`, `Authorization` e `Proxy-*` são recusados ao salvar (seção 8.2) |
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
| `painel` | booleano | sim, padrão `false` | a busca faz parte do **painel fixo** de coleta: só anúncios de buscas do painel entram em variação temporal (v0.5) |
| `painel_desde` | data | não | mês em que a busca entrou no painel; entrar ou sair do painel marca quebra de série naquele mês |

`unicos`: `(fonte_id, url)`.

**Painel de coleta (v0.5).** A amostra de anúncios reflete quais buscas existem, não o mercado
(na semente, sete localidades têm exatamente 12 anúncios cada, sinal de teto de resultados da
busca). Série temporal comparável pede painel constante, como o FipeZap fixa amostra e pesos.
Por isso toda **variação** de oferta (achados `variacao_periodo` e `mudanca_incomum`, variação
mensal e em 12 meses na tela, contexto da IA) é calculada só sobre anúncios cuja
`busca_origem_id` é de busca do painel ativa nos dois meses comparados, e usa o
`indice_oferta_mensal` quando ele é publicável; a mediana bruta de todos os anúncios é **nível**,
nunca variação. `destoa_cidade` sobre oferta só compara localidades com `qualidade_cobertura =
boa` (seção 9.7, R-02).

#### `anuncios`

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "{titulo} · {localidade_texto}"`

| Coluna | Tipo | Obrig. | Origem (`LISTINGS.`) | Observação |
|---|---|---|---|---|
| `id_legado` | texto(200), único | não | `listing_id` | |
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
| `quartos`, `suites`, `vagas` | inteiro | não | `bedrooms`, `suites`, `parking_spaces` | `quartos` obrigatório hoje (141/141, semente do repositório de 2026-09-19; a planilha viva tinha 158 na mesma data); passa a opcional porque a descoberta pode não achar |
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
| `busca_origem_id` | referencia → `buscas_portal`, `anular` | não | `candidatos.busca_id` na promoção | busca que primeiro trouxe o anúncio; base do painel de coleta (v0.5). `null` nos importados e nos cadastrados por URL |
| `importacao_id` | referencia → `importacoes`, `anular` | não | — | seção 5.1 |

`unicos`: `(fonte_id, id_externo)` onde `id_externo` não nulo e `removido_em` nulo; `url_fonte`
onde `removido_em` nulo. `indices`: `(localidade_id, status)`, `(status, visto_em)`,
`(tipo_imovel, tipo_transacao)`, `(latitude, longitude)`, `(primeiro_visto_em)`, `(h3_r9)`,
`(grupo_id)`, `(busca_origem_id)`, `(importacao_id)`.
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
| `anuncio_id` | referencia → `anuncios`, `restringir`, obrig. | `listing_id` |
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
| `anuncio_id` | referencia → `anuncios`, `restringir`, obrig. | `listing_id` | histórico não sai por purga (seção 5.1) |
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
| `base_area` | texto, `opcoes: ["privativa", "total", "nao_especificada", "todas"]`, obrig. | derivado de `anuncios.base_area` | v0.5: R$/m² **nunca** mistura bases de área; na linha `todas` as colunas de R$/m² ficam `null` e só preço, contagem e liquidez são preenchidos. A tela escreve a base no rótulo ("R$/m², área não especificada pelo portal"). Hoje a semente é 100% `nao_especificada` |
| `ativos`, `novos`, `inativados` | inteiro, obrig. | `active_ads_count`, `new_ads_count`, `inactive_ads_count` | |
| `preco_mediano_brl`, `preco_medio_brl`, `preco_p25_brl`, `preco_p75_brl` | decimal(14,2) | `median_price`, `average_price`, `p25_price`, `p75_price` | mediana `null` com n < 5; P25 e P75 `null` com n < 10 (supressão, seção 5.1) |
| `preco_m2_mediano_brl`, `preco_m2_medio_brl` | decimal(12,2) | `median_price_m2`, `average_price_m2` | idem |
| `area_mediana_m2` | decimal(12,2) | `median_area_m2` | |
| `vagas_mediana` | decimal(5,2) | `median_parking_spaces` | |
| `variacao_preco_mom_frac`, `variacao_estoque_mom_frac` | decimal(8,5) | `price_change_mom_pct` ÷ 100, `inventory_change_mom_pct` ÷ 100 | v0.5: só sobre anúncios de buscas do **painel** ativas nos dois meses (seção 5.4, `buscas_portal`) e só quando os dois meses têm n ≥ 20; senão `null` com motivo |
| `fontes_qtd` | inteiro | `source_count` | |
| `qualidade_cobertura` | texto, `opcoes: ["boa", "fonte_unica", "so_historico_inativo", "amostra_pequena"]` | `coverage_quality` | |
| `amostra_n` | inteiro, obrig. | derivado | anúncios na amostra de preço; abaixo de 5 a mediana é `null` com motivo `amostra_pequena` e o `n` ao lado (seção 5.1), nunca o valor com aviso |
| `imoveis_n` | inteiro | derivado | imóveis distintos, publicado sempre ao lado de `amostra_n`: grupo `confirmado` conta uma vez; grupo `sugerido` só conta uma vez quando passa a regra automática de `anuncio_grupos` (coordenada exata, ≤ 30 m, área ±1 m², preço ±2%) (D-26) |
| `com_reducao_preco_frac` | decimal(6,5) | derivado | ativos com `preco_pedido_brl` abaixo de `preco_inicial_brl` (D-25) |
| `reducao_mediana_frac` | decimal(8,5) | derivado | mediana de `1 − preco_pedido / preco_inicial` entre os que reduziram |
| `idade_estoque_mediana_dias` | inteiro | derivado | mediana de dias desde `primeiro_visto_em` entre os ativos no fim do mês; é **idade do estoque**, nunca tempo até sair (viés de duração), e a tela diz isso |
| `dias_ate_sair_mediana` | inteiro | derivado | v0.5: mediana de **Kaplan-Meier** do tempo de anúncio (método abaixo); `null` com menos de 20 eventos no grupo |
| `permanencia_30_dias_frac` | decimal(6,5) | derivado | v0.5: S(30) de Kaplan-Meier, fração estimada de anúncios ainda ativos aos 30 dias; substitui `saidas_ate_30_dias_frac`; `null` com menos de 20 eventos |
| `saidas_eventos_n`, `censurados_n` | inteiro | derivado | eventos (inativação confirmada) e observações censuradas usados no Kaplan-Meier |
| `preco_m2_saida_mediano_brl` | decimal(12,2) | derivado | mediana do **último preço pedido** dos que saíram no mês; rótulo "último preço pedido antes de sair", nunca "venda" (D-50) |
| `calculado_em` | datahora, obrig. | `calculated_at` | |

`unicos`: `{ colunas: [mes_referencia, cidade_id, localidade_id, tipo_imovel, tipo_transacao, quartos, faixa_area, base_area], nulos_distintos: false }`.

**Tempo de anúncio por Kaplan-Meier (v0.5).** Quem continua ativo é observação censurada, e a
mediana só de quem saiu no mês sobre-representa as saídas rápidas (R-08). Entrada:
`primeiro_visto_em`, ou a data de publicação quando `dias_publicado` existe. Evento: inativação
confirmada, com a data no meio do intervalo entre o último `visto_em` e a primeira falha de
verificação (o dado é intervalar). Ativos no fim do mês e anúncios `bloqueada` entram
censurados. Importados sem data de publicação entram com truncamento à esquerda (risco a partir
de `primeiro_visto_em`, não de zero). Mediana e S(30) só com ≥ 20 eventos no grupo; abaixo,
`null` com motivo `amostra_pequena`. O cálculo é em código (`comum/oferta/liquidez.ts`), nunca
em `sql_declarado`.

#### `indice_oferta_mensal`

`acesso_externo: somente_leitura` · `id_legivel: "{mes_referencia} {tipo_transacao}"`

Índice de preço de oferta estratificado (D-40), no método do FipeZap: mediana do R$/m² por
estrato, agregada com **pesos fixos e exógenos**. Separa variação de preço de mudança de
composição da amostra. A tela sempre o mostra ao lado da mediana bruta.

| Coluna | Tipo | Observação |
|---|---|---|
| `mes_referencia` | data, obrig. | |
| `cidade_id` | referencia → `cidades`, obrig. | |
| `localidade_id` | referencia → `localidades`, `anular` | `null` = índice da cidade |
| `tipo_imovel`, `tipo_transacao` | texto | `tipo_imovel` nulo = todos |
| `indice` | decimal(12,6) | base 100 na janela-base; `null` quando o mês não é publicável |
| `variacao_mom_frac`, `variacao_12m_frac` | decimal(8,5) | |
| `mediana_bruta_brl_m2` | decimal(12,2) | para a comparação lado a lado |
| `estratos_total`, `estratos_imputados`, `estratos_ausentes` | inteiro | imputado = estrato abaixo de `indice_n_minimo_estrato` que repete o mês anterior (no máximo `indice_imputacao_max_meses` seguidos); ausente = estrato que passou desse limite e saiu |
| `peso_imputado_frac` | decimal(6,5) | soma dos pesos dos estratos imputados ou ausentes |
| `publicavel` | booleano, obrig. | `peso_imputado_frac ≤ indice_peso_imputado_max_frac` |
| `motivo_nao_publicado` | texto(60) | `peso_imputado_acima`, `janela_base_aberta`, … |
| `base_de`, `base_ate` | data | a janela-base de 12 meses usada |
| `pesos` | json | os pesos usados, para auditoria |
| `calculado_em` | datahora, obrig. | |

**Método do índice (v0.5; fecha P-23).** Estrato = localidade × orientação (`vertical`,
`horizontal`); quartos entra como subestrato só quando o estrato tem n ≥ 5 em pelo menos 80%
dos meses (com a semente, 141 anúncios em 9 RAs, localidade × quartos não tem estrato com n ≥ 5).
Peso = domicílios da localidade no Censo 2022 × distribuição de dormitórios dos domicílios da
PDAD, fixo; **nenhuma parte do peso vem dos anúncios**, que são a amostra cuja composição o
índice neutraliza. Base = os primeiros 12 meses corridos com índice publicável, não o ano civil
(o ano civil só fecharia no fim de 2027). Imputação repete o mês anterior por no máximo
`indice_imputacao_max_meses` (3); depois o estrato sai e os pesos se renormalizam. O mês só é
publicado com `peso_imputado_frac ≤ indice_peso_imputado_max_frac` (0,30); senão `indice` é
`null` com motivo. O índice é calculado desde a fase 3 e só aparece na tela quando a primeira
janela-base fechar. Mudar o método recalcula a série inteira e sobe `VERSAO_METODO.indice`
(seção 5.23). Os parâmetros moram na seção 4.3 (`indice_ano_base` deixa de existir).

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
distância até `agrupar_distancia_max_m` quando os dois têm coordenada exata, e fonte diferente
**ou** mesma fonte com `id_externo` diferente (outro anunciante no mesmo portal gera outro
código). A app não guarda anunciante (D-74, seção 22.1), então a condição não pode ser
"anunciante diferente".

**Contagem automática (v0.5).** Um grupo `sugerido` só conta como um imóvel, sem curador, quando
os dois anúncios têm coordenada exata (`exata_fonte`) a até 30 m, área igual a ±1 m² e preço a
±2%; qualquer outro grupo só conta depois de `confirmado`. O motivo: com todos os anúncios da
semente por jitter a checagem de distância nunca roda, e em Águas Claras e Noroeste há plantas
idênticas no mesmo prédio que casam unidades diferentes nas tolerâncias de sugestão. Isto
substitui a regra por `agrupar_confianca_auto` (seção 4.3); a `confianca` continua só ordenando
a fila do curador.

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
| `status` | texto, `opcoes: ["executando", "sucesso", "parcial", "falha", "interrompida", "pausada", "adiada"]` | sim | `status`; `pausada` = a fatia achou `coleta_ativa = false` e saiu sem requisição nem reagendamento; `adiada` = não obteve a trava da classe e agendou continuação (v0.5) |
| `candidatos_lidos`, `candidatos_processados`, `candidatos_rejeitados` | inteiro | sim, padrão 0 | `candidate_*` |
| `paginas_pedidas`, `paginas_lidas`, `paginas_bloqueadas` | inteiro | sim, padrão 0 | `source_pages_*` |
| `novos`, `atualizados`, `reativados`, `precos_alterados` | inteiro | sim, padrão 0 | `new_listings`, … |
| `verificacoes`, `inativados` | inteiro | sim, padrão 0 | `active_checks`, `confirmed_inactive` |
| `retratos`, `metricas` | inteiro | sim, padrão 0 | `history_rows`, `metrics_rows` |
| `erros` | inteiro | sim, padrão 0 | `errors` |
| `detalhes_erros` | texto_longo | não | `error_details` (teto 20 000 caracteres) |
| `cursor_inicial`, `cursor_final` | inteiro | não | — |
| `versao_parser` | texto(60) | não | `parser_version` |
| `disparado_por_id` | referencia → `shell.usuarios`, `anular`, `campos_incluir` nome | não | — |

O status `interrompida` não é gravado no corte: o shell não entrega sinal ao handler no timeout
de 15 min (não há `AbortSignal` no `ContextoListener`) e a promise segue em segundo plano. Quem
grava `interrompida` é a execução seguinte, que encontra uma linha `executando` com `iniciado_em`
há mais de 15 min e a fecha antes de abrir a sua (C-30). Execução manual da tela de Operação ou
de rota grava `disparo = manual` (C-11).

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

`acesso_externo: restrito`. Uma linha por rotina: `rotina` (texto(60), único), `cursor` (json),
`versao` (inteiro), `em_execucao_desde` (datahora, nulo = livre), `coleta_id` (referencia →
`coletas`, `anular`), `atualizado_em`. Na v0.5, mais duas colunas: `classe` (texto,
`opcoes: ["coleta", "carga", "leve"]`, obrig.) e `agendamento_id` (inteiro, o `id` devolvido por
`req.eventos.agendar` para a próxima fatia; desligar `coleta_ativa` não precisa cancelá-lo,
porque a fatia que acordar sai sem agir). Guarda a posição do lote entre execuções (o que o script
guardava em `PropertiesService`) e é a **trava** da rotina (D-85, C-32): o advisory lock do shell
só impede duas execuções da mesma rotina, e a continuação corre num listener, fora dele. Quem vai
tocar o lote — rotina agendada, "Rodar agora", catch-up ou listener `continuar_coleta` — adquire a
trava com `atualizarSe` (`em_execucao_desde` nulo ou mais velho que 15 min), grava o cursor com a
`versao` lida a cada fatia (compare-and-set) e a libera ao fim. Quem não adquire devolve
`{ ok: true, resultado: { resumo: "outra execução em curso" } }`. O `ctx` não tem `definir`: todo
estado de rotina mora aqui (C-33).

**Trava por classe (v0.5).** O advisory lock do shell é por rotina, e o catch-up do boot
dispara juntas todas as rotinas que perderam o slot. Por isso, além da trava da própria rotina,
há no máximo **uma execução por classe** ao mesmo tempo: `coleta` (`verificar_anuncios`,
`descobrir_anuncios`, `verificar_lancamentos` e as continuações delas) e `carga` (`fechar_mes`,
`carregar_dados_publicos`, `recalcular_derivados`, `calcular_achados`, `agrupar_anuncios`). A
trava da classe é uma linha de `cursores_rotina` com `rotina = "classe:<classe>"`, adquirida com
o mesmo compare-and-set (D-85). Quem não a obtém não falha: grava a `coleta` com status
`adiada`, agenda `continuar_coleta` para +10 min e devolve `ok: true` com o resumo
"adiada: <rotina> em curso". As rotinas `leve` (`verificar_frescor`, `limpar_retencao`,
`vincular_empreendimentos`, `carregar_series_macro`, `gerar_analises_mensais`) não usam trava de
classe (seção 7).

### 5.5 Lançamentos

#### `lancamentos`

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "{nome}"`

| Coluna | Tipo | Obrig. | Origem (`DEVELOPMENTS.`) | Observação |
|---|---|---|---|---|
| `id_legado` | texto(120), único | não | `development_id` | |
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

Mesma forma de `anuncio_eventos` com `lancamento_id` (referencia → `lancamentos`, `restringir`,
obrig.; seção 5.1) no lugar de `anuncio_id` e tipos
`criado`, `atualizado_pela_coleta`, `preco_alterado`, `lacuna_detectada`, `corrigido_manualmente`,
`removido`, `restaurado`.

### 5.6 Âncoras

#### `ancoras`

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "{nome}"`

| Coluna | Tipo | Obrig. | Origem (`ANCHORS.`) |
|---|---|---|---|
| `id_legado` | texto(120), único | não | `place_id` |
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

`unicos`: `(codigo, hash_conteudo)`. Só **um** `ativo` por `codigo`: único parcial
`{ "colunas": ["codigo"], "onde": [<status igual a "ativo">] }`, com a condição escrita na forma
`{ "coluna", "operador", "valor" }` do doc de dados (C-17).

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
| `arquivo` | arquivo (`application/json`, `application/geo+json`; `tamanho_max_mb: 50`, sob o cap da instância), obrig. | o próprio arquivo, baixado pela rotina; `obrigatorio` é o que o protege do TTL de 90 dias (D-89, C-35, C-37) |
| `carregado_em` | datahora | — |

`unicos`: `(conjunto_id, caminho)`. **A app nunca serve os bytes** ("Nunca serve bytes
diretamente", C-39): a rota da seção 6.7 só resolve `{ arquivo_id, sha256, bytes, url }`, com a
`url` de `req.arquivos.url`, e o frontend baixa pelo download do framework e memoiza por `sha256`
(D-81). Não há dedup de blob no shell: conjunto substituído tem as linhas daqui apagadas por
`deletarVarios` (seção 21.6), e os arquivos vão junto (C-37, C-41).

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
| `arquivo` | arquivo (`text/csv`, `application/vnd.ms-excel`; até 50 MB, sob o cap da instância), obrig. | obrigatória: não expira no TTL (D-89) |
| `modo_duplicata` | texto, `opcoes: ["ignorar", "atualizar", "substituir_tudo", "falhar"]`, obrig. | seção 11.2 |
| `mapeamento` | json | coluna do CSV → coluna da tabela, mais declarações de escala e de localidade |
| `status` | texto, `opcoes: ["previa", "aplicando", "aplicada", "falhou", "cancelada", "desfeita"]`, obrig. | `desfeita` na v0.5 |
| `total_linhas`, `inseridas`, `atualizadas`, `ignoradas`, `rejeitadas` | inteiro | |
| `relatorio` | json | por linha rejeitada: número, coluna, código, mensagem; resumo de conversões de escala |
| `autor_id` | referencia → `shell.usuarios`, obrig., `campos_incluir` nome | |
| `aplicada_em` | datahora | |
| `coleta_id` | referencia → `coletas`, `anular` | a execução registrada |
| `retrato_data` | data | data do retrato da planilha (`migracao/AAAA-MM-DD/`) de onde veio o CSV, na migração (seção 11.3) |
| `arquivo_sha256` | texto(64) | sha256 do CSV, conferido contra o do retrato datado |
| `desfeita_em` | datahora | v0.5: quando o admin da app desfez a importação |
| `desfeita_por_id` | referencia → `shell.usuarios`, `anular`, `campos_incluir` nome | |
| `relatorio_desfazer` | json | linhas removidas (soft delete) e linhas mantidas por terem sido editadas depois (`versao` diferente da criação), com id e tabela |

**Desfazer importação (v0.5).** Faz soft delete (`req.dados.remover`) das linhas com aquele
`importacao_id` (seção 5.1) que ninguém editou depois, e lista em `relatorio_desfazer` as que
ficaram; nunca apaga de vez. Linha `atualizada` (não criada) pela importação não é tocada: o
modo `atualizar` não guarda o valor anterior, e a planilha somente leitura é a cópia de
segurança. Como a importação é idempotente pela chave natural (seção 11.1), desfazer e
reimportar dá o mesmo resultado. A rota é a da seção 6.9.

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

`indices`: `(tabela, resolvido_em)`, `(codigo)`, `(importacao_id)`.

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
| `status` | texto, `opcoes: ["gerando", "pronta", "falhou"]`, obrig., padrão `gerando` | a análise é pedida por `consultarAsync` e gravada pelo listener `analise_concluida` (D-82, C-80) |
| `codigo_erro`, `mensagem_erro` | texto(60), texto(1000) | preenchidos quando `status = falhou` |
| `ia_chamada_id` | texto(80) | id da chamada no log de IA do shell, devolvido no callback |
| `slot`, `modelo` | texto(60), texto(120) | `modelo` vem na resposta; `provedor` não vem (C-44) e não é gravado — consulta-se no histórico de IA do shell |
| `versao_instrucoes` | texto(64), obrig. | hash das instruções do parâmetro usado |
| `tokens_entrada`, `tokens_saida` | inteiro | campos literais de `RespostaIA` (C-44) |
| `disparo` | texto, `opcoes: ["manual", "rotina"]`, obrig. | |
| `gerada_por_id` | referencia → `shell.usuarios`, `anular` | nulo na rotina |
| `gerada_em` | datahora, obrig. | |
| `substituida_por_id` | referencia → `analises_ia`, `anular` | encadeia versões do mesmo recorte |
| `lacunas_avisadas` | booleano, obrig., padrão `false` | se o evento `lacuna_cadastro` saiu |

`busca_texto`: `titulo`, `texto`. `indices`: `(tipo, localidade_id, mes_referencia)`.

### 5.12 `sql_declarado`

Consultas que o vocabulário não alcança, todas de leitura, no degrau 2 do framework: janela
(`row_number`, `rank`, `count(*) OVER`), `JOIN … ON` entre tabelas da app e CTE, com funções da
allowlist (**sem** `percentile_cont`, que não está na lista). O retorno é um array de linhas
cruas, sem o envelope de `listar` (C-26). Regras de forma que o validador cobra: sem `;`, sem
aspas duplas, sem `FROM a, b`; CTE nunca com nome de tabela da app; todo `:param` declarado e
usado; parâmetro opcional chega `NULL` e se escreve `(:x IS NULL OR col = :x)`; contagem
condicional por `sum(CASE WHEN … END)`, não por `count(*) FILTER (…)`, que o doc não cita;
nenhuma consulta toca `shell.*` (C-29). Piso de shell 0.53.3, coberto.

| Nome | Para quê |
|---|---|
| `mediana_preco_por_localidade` | mediana e P25/P75 de `anuncios` ativos por localidade e tipologia, com `row_number() OVER` e `count(*) OVER` (mediana por posição) |
| `ranking_localidades_indicador` | `rank() OVER` de um indicador de `agregados_territoriais` ou `localidade_perfis` entre as localidades com dado |
| `serie_pareada_fipezap` | venda e locação do mesmo mês/segmento/localidade lado a lado (a antiga `FIPEZAP_LOCALITY_MONTHLY`) |
| `contagem_anuncios_por_celula` | contagem de anúncios ativos por caixa de grade (para o painel de cobertura) |
| `cobertura_anuncios` | RA × tipo × quartos × faixa de preço com contagem (o antigo `LISTINGS_COVERAGE`) |
| `cobertura_pdad` | RA × indicador com status (o antigo `PDAD_A_COVERAGE`) |
| `contagem_por_celula` | contagem por `h3_r9` de anúncios (por imóvel), lançamentos, âncoras, pontos comerciais e licenças, para a camada hexagonal |
| `mediana_terracap_por_localidade` | mediana por posição do R$/m² arrematado (terreno e potencial) e do ágio por localidade, `destinacao_categoria` (sem `outra`) e ano, só lotes vendidos |
| `pipeline_oferta_localidade` | unidades residenciais licenciadas sem habite-se (alvará com até `alvara_validade_meses`) e lançamentos em obra sem alvará vinculado, por localidade, sem dupla contagem; à parte, a contagem de "alvará antigo sem habite-se" |

Percentil fino (P10, P90) e qualquer estatística fora disso são calculados **em código** sobre
as linhas filtradas, no backend, nunca no frontend com dado parcial.

**A agregação por célula sai do SQL declarado (D-83).** O `sql_declarado` não tem parâmetro de
lista, e `string_to_array` não está na allowlist para simular um (C-26). O que existe é o filtro
por array em `req.dados`, que vira `IN` sem teto documentado (C-23). Por isso a consulta
`agrega_celula_metricas` da v0.2 não existe: o enriquecimento (D-37) lê `celula_metricas` com
`req.dados.varrerTudo('celula_metricas', { filtros: { celula_id: ids, ano, metrica: chaves },
maximo })` em lotes de 500 ids — o lote é conservadorismo da app, não limite do SDK — e soma em
código. Duas guardas: lista vazia não é filtro (array vazio devolve a tabela inteira), então a
rota confere `ids.length === 0` antes; e `maximo` é sempre explícito. Ordenação em `req.dados` é
por uma coluna só. Fecha P-16.

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

`acesso_externo: restrito` · `id_legivel: "{h3}"` (a tela nunca lê pela rota genérica; C-27)

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

`acesso_externo: restrito`. Formato longo, como `agregados_territoriais`.

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
Volume esperado de 0,6 a 1,2 milhão de linhas no DF.

**Leitura e carga da grade (D-83, C-27, C-28).** `listar` por offset sempre calcula `total`
(`COUNT(*)`) e não há como pedir o envelope sem ele; por isso `celulas` e `celula_metricas` são
`restrito` (a rota genérica pagaria um `COUNT(*)` sobre um milhão de linhas a cada página) e toda
leitura interna da grade é por `varrerTudo` (com `maximo` explícito quando o recorte pode passar de
100 mil linhas, acima das quais ele lança por padrão) ou por cursor em `id`, nunca por `listar`.
Não existe inserção em lote: a carga é um laço de `criarOuAtualizar` pela chave natural
`(celula_id, conjunto_codigo, ano, metrica)`, idempotente, em fatias por cursor dentro dos 15 min
de cada execução. O bundle não documenta limite de linhas, de armazenamento nem orientação de
desempenho para tabela grande; o throughput real é medido na Pinguim na fase 4A antes de fixar o
número de continuações (P-21 vira medição). Se a medição não fechar a carga mensal, entra o
fallback já previsto: só células habitadas e só as métricas do catálogo inicial (R-45).

#### Catálogo de métricas (`comum/metricas.ts`, código)

Sucede e amplia o `comum/indicadores.ts` (D-22, D-35). Cada métrica declara:

| Campo | Valores | Para quê |
|---|---|---|
| `chave`, `titulo`, `unidade`, `fonte`, `formula` | | rótulo e procedência |
| `natureza` | `contagem`, `razao`, `media`, `amostra`, `indice`, `categorica`, `nao_agregavel` | como se agrega; `amostra` = estatística recalculada sobre os **pontos** dentro da área (mediana, percentil), nunca agregada de células (D-67), e sujeita à supressão por n da seção 5.1 (`null` com `amostra_pequena` e o `n` ao lado) |
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
| `renda_domiciliar_media_brl` | Renda domiciliar média | média | domicílios | alta_favoravel | PDAD | localidade (nunca mostrada como valor do anel na capa da ficha; R-04) |
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
| `dias_ate_sair_mediana` | Tempo de anúncio (mediana Kaplan-Meier) | amostra (≥ 20 eventos) | — | alta_desfavoravel | app | ponto |
| `permanencia_30_dias_frac` | Anúncios ainda ativos aos 30 dias, S(30) | amostra (≥ 20 eventos) | — | neutro | app | ponto |
| `com_reducao_preco_frac` | Anúncios com redução de preço | amostra | — | alta_desfavoravel | app | ponto |
| `lancamentos_estoque_unidades` | Unidades em estoque de lançamentos | contagem | — | neutro | app | ponto |
| `pipeline_unidades` | Unidades no pipeline de oferta | contagem | — | alta_desfavoravel (pressão) | app | ponto |
| `terracap_preco_m2_terreno` | R$/m² arrematado de terreno, por `destinacao_categoria` | amostra | — | neutro | Terracap | ponto |
| `terracap_preco_m2_potencial` | R$/m² arrematado de potencial, por `destinacao_categoria` | amostra | — | neutro | Terracap | ponto |
| `terracap_agio_frac` | Ágio sobre o mínimo, por `destinacao_categoria` | amostra | — | neutro | Terracap | ponto |
| `estabelecimentos_<cat>` | Estabelecimentos da categoria | contagem | — | neutro | CNPJ, OSM | célula |
| `gasto_potencial_<cat>_brl_ano` | Gasto potencial anual da categoria | contagem | — | alta_favoravel | POF × Grade | célula |
| `gasto_por_estabelecimento_<cat>` | Gasto potencial por estabelecimento **na bacia da categoria** | razão (somas no raio `raio_bacia_m`) | — | alta_favoravel (lacuna) | derivado | célula (bacia) |
| `equipamentos_<tipo>` | Escolas, unidades de saúde, … | contagem | — | alta_favoravel | INEP, CNES, OSM | ponto |
| `area_urbanizada_frac_<ano>` | Fração urbanizada | razão | — | neutro | MapBiomas | célula |
| `edificacoes_n_<ano>` | Edificações | contagem | — | neutro | Open Buildings | célula |
| `novas_edificacoes_2016_2023` | Edificações novas | contagem | — | neutro | Open Buildings | célula |
| `altura_media_edificacoes_m` | Altura média das edificações | média | edificações | neutro | Open Buildings | célula |
| `frac_restrita_total` | Fração restrita (APP, UC, declividade) | razão | — | alta_desfavoravel | pipeline (seção 5.21) | célula (mapa e achados; nunca alimenta a área líquida de uma gleba) |
| `zona_pdot` | Zona do PDOT | categórica | área | — | IPEDF | polígono |

Métrica `categorica` numa área devolve a distribuição por área (ex.: 70% Zona Urbana Consolidada,
30% Zona de Contenção), nunca um valor único.

Regras da v0.5 sobre o catálogo: métrica de `unidade_nativa = localidade` (PDAD) nunca aparece
como valor do anel na capa da ficha; ali entra a distribuição de domicílios por faixa de renda,
rotulada "da RA <nome>, PDAD <ano>", com a fração do anel em cada RA quando ele cruza mais de uma
(seção 10.10). Valor de renda do anel só entra com fonte por setor ou célula
(`censo_2022_setores` com rendimento), com a fonte escrita. As métricas `terracap_*` são sempre
por localidade × `destinacao_categoria` (seção 5.15), e `outra` nunca entra em mediana.

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
| `destinacao_categoria` | texto, `opcoes: ["residencial_unifamiliar", "residencial_multifamiliar", "comercial_servicos", "misto", "institucional", "industrial", "rural", "outra"]` | sim | v0.5: a importação propõe a categoria a partir do verbatim por tabela em `comum/terra/destinacoes.ts` e o operador confirma o mapeamento, como o de `ivv_regional` (R-09) |
| `importacao_id` | referencia → `importacoes`, `anular` | não | seção 5.1 |
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
Mediana de arrematado, ágio, o achado `terra_agio` e a comparação da viabilidade são sempre por
localidade × `destinacao_categoria` (projeção residencial, lote comercial e institucional não se
misturam); `outra` nunca entra em mediana. `indices`: `(localidade_id, destinacao_categoria)`.

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

`unicos`: `{ "colunas": ["tipo_ato", "numero"], "onde": [{ "coluna": "numero", "operador": "nao_nulo" }] }`
(a tabela não tem `soft_delete`; C-17). Entra por importação CSV até a fonte
automática ser confirmada `[PENDENTE P-12]`.

**Pipeline de oferta (derivado).** Unidades em obra = empreendimentos com alvará e sem habite-se
+ lançamentos `em_construcao` sem alvará vinculado (para não contar duas vezes). Só alvarás de
uso residencial contam unidades. Alvará sem habite-se e sem lançamento vinculado emitido há mais
de `alvara_validade_meses` (seção 4.3; padrão 48, premissa declarada a conferir no Código de
Obras do DF) **sai do pipeline** e vai para "alvará antigo sem habite-se", listado à parte, para
obra caducada ou parada não ficar no pipeline para sempre.

**Absorção (v0.5).** Meses de absorção futura = unidades no pipeline ÷ vendas mensais médias.
Na cidade, as vendas são os últimos 12 meses do `ivv_mensal`. Na localidade, `ivv_regional` só é
usado quando houver ≥ 12 meses da série (hoje há um mês só, mai/2026, que é sazonal e não tem
média); até lá, vendas da cidade (12 meses do `ivv_mensal`) × participação da localidade na
oferta regional do último retrato, rotulada "rateio da cidade"; sem nenhum dos dois, `null`.

### 5.16 Áreas de estudo (D-23)

#### `areas_estudo`

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "{nome}"`

| Coluna | Tipo | Obrig. | Observação |
|---|---|---|---|
| `nome` | texto(200) | sim | |
| `tipo` | texto, `opcoes: ["propria", "prospeccao", "referencia"]` | sim | `propria` = área da UP; só o `curador` cria ou muda para esse tipo; de onde vem a lista oficial `[PENDENTE P-47]`. Área `propria` é sigilosa (nota abaixo) |
| `cidade_id` | referencia → `cidades`, `restringir` | sim | |
| `geometria`, `geometria_tipo` | json, texto | sim | ponto ou polígono, como `contornos` |
| `bbox_oeste`, `bbox_sul`, `bbox_leste`, `bbox_norte` | decimal(10,7) | sim | |
| `centroide_latitude`, `centroide_longitude` | decimal(10,7) | sim | |
| `area_m2` | decimal(16,2) | não | polígono |
| `raios_m` | texto(60) | não | CSV; vazio = `raios_padrao_m` |
| `estagio` | texto, `opcoes: ["sinal", "hipotese", "oportunidade", "iniciativa", "projeto", "negocio_ativo", "encerrada"]` | sim | a escada de maturidade da UP (D-55); toda mudança grava `area_eventos`; quem decide a mudança e se ela exige decisão registrada `[PENDENTE P-42]` |
| `motivo_encerramento` | texto(300) | não | obrigatório quando `estagio = encerrada` |
| `aprendizado` | texto_longo | não | o que a área ensinou, mesmo sem virar projeto (doc. 02, §8) |
| `responsavel_id` | referencia → `shell.usuarios`, `anular` | não | |
| `localidade_id` | referencia → `localidades`, `anular` | não | dominante |
| `contorno_id` | referencia → `contornos`, `anular` | não | quando veio de KMZ já importado |
| `arquivo_origem` | arquivo (KML, KMZ, GeoJSON, `octet-stream`; até 20 MB, sob o cap da instância) | não | expira no TTL da instância (D-89); a geometria fica na linha |
| `notas` | texto_longo | não | |
| `importacao_id` | referencia → `importacoes`, `anular` | não | seção 5.1 |

**Sigilo das áreas próprias (v0.5).** Área `tipo = propria` e tudo que pende dela
(`area_estudo_fichas`, `area_perimetros`, `area_sintese_itens`, `teses`, `tese_condicoes`,
`diligencias`, `hipoteses_ancora`, `hipoteses_produto`, `cenarios_viabilidade`,
`observacoes_campo`, `observacao_fotos`, `area_eventos` e `analises_ia` com `area_estudo_id`)
só é lido por quem tem o papel `estrategico` ou `curador` (seção 4.1) ou é o `responsavel_id` da
área. Por isso **todas essas tabelas são `restrito`**, sem exceção: só as rotas da app as leem,
e a regra fica nelas (seções 6.11, 6.17 e 14; precedentes: nobi, reg360). Para os demais, a área
própria some de listas, portfólio, Início, achados, mapa e exportações, e o detalhe responde
`404`. Não há trilha de visualização (seria telemetria nominal, R-35); há trilha de **saída**:
ficha, pacote, exportação e análise de IA de área própria gravam `area_eventos` com o usuário.
Área própria real só existe na instância de produção, nunca na de teste.

`acesso_externo: restrito` · `id_legivel: "{titulo_area} · {formato}"` (o template não resolve
referência nem formata data; o nome da área é gravado na ficha; C-19)

O dossiê congelado, para a ficha poder ir num pacote de aprovação e ser reproduzida depois. O
bundle não documenta teto de valor `json` nem de linha (C-20); por prudência a ficha guarda o
Markdown pronto e os **números-chave** por bloco em `conteudo`, não o dossiê inteiro.

| Coluna | Tipo | Observação |
|---|---|---|
| `area_estudo_id` | referencia → `areas_estudo`, `restringir`, obrig. | ficha é registro congelado: não sai por purga (seção 5.1) |
| `titulo_area` | texto(200), obrig. | nome da área no momento da geração |
| `formato` | texto, `opcoes: ["uma_pagina", "detalhada"]`, obrig. | |
| `secoes` | json, obrig. | as escolhidas, na ordem escolhida; seção cuja fonte é de fase posterior sai omitida com o motivo ("disponível com Comércio e âncoras"), nunca vazia nem zero |
| `conteudo` | json, obrig. | números-chave, método e fonte por bloco. Na v0.5 cada número tem **chave estável** = chave do catálogo + recorte + período, com o valor, a versão do conjunto de origem e o `n` quando houver; é o que permite comparar duas fichas |
| `versoes_conjuntos` | json, obrig. | código → versão e hash de cada conjunto usado |
| `markdown` | texto_longo, obrig. | a ficha pronta |
| `analise_ia_id` | referencia → `analises_ia`, `anular` | |
| `gerada_por_id`, `gerada_em` | referência, datahora | |

**Comparar duas fichas (v0.5).** `GET /estudos/:id/fichas/comparar?a&b` (seção 6.11) devolve,
por chave de `conteudo`, os dois valores e a diferença, e marca cada linha "mudou o dado" quando a
versão do conjunto e a `versao_metodo` das duas fichas coincidem, ou "mudou a medida" quando não,
sem calcular variação nesse caso. A tela é a ação "Comparar com…" na lista de fichas da área
(seção 10.10), sem entrada nova no `nav`.

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
orientação), colunas pelas faixas de `faixas_preco_brl`. A demanda por célula da matriz vem dos
domicílios por faixa alcançável × distribuição de tamanho de domicílio convertida em quartos por
uma tabela declarada em código. A tabela "moradores → quartos" é uma hipótese, e a tela diz
isso.

Na v0.5 a matriz tem **duas leituras, nomeadas**, porque diferença de participações mede
descompasso de composição, nunca quantidade (a v0.4 subtraía frações de universos diferentes):

- **Composição.** `demanda_frac` e `oferta_frac` são a participação de cada célula da matriz na
  demanda e na oferta do recorte, cada uma somando 1. `descompasso_pp` = diferença em pontos
  percentuais, rotulada "composição, não quantidade". O achado `lacuna_produto` usa
  `descompasso_pp ≥ 10` (seção 9.7).
- **Fluxo.** Demanda anual = `formacao_domiciliar_anual` × distribuição alcançável; oferta
  anual = unidades lançadas nos últimos 12 meses mais o pipeline com entrega em até 12 meses
  (seção 5.15). `lacuna_unidades_ano` = demanda anual − oferta anual, e só aparece nesta
  leitura.

A oferta é só venda, separada em "usado (anúncios, por imóvel)" e "novo (lançamentos,
unidades)", nunca somadas numa coluna só. `absorcao` segue a regra da seção 5.15 (IVV regional
só com ≥ 12 meses; senão rateio da cidade; senão `dias_ate_sair_mediana` de Kaplan-Meier,
rotulado como tempo de anúncio, não de venda).

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
`[PENDENTE P-25]`. Na v0.5 cada categoria declara também `raio_bacia_m` (a bacia em que se
somam gasto e estabelecimentos para a lacuna comercial) e `classes_porte` (a área de vendas
imputada por classe, que dá a escala comum de atratividade do Huff).

Categorias iniciais (os códigos CNAE são subclasses a conferir na CONCLA antes da carga):

| Chave | CNAE (subclasse) | Grupo de despesa (POF) | Categoria de âncora | Huff | `raio_bacia_m` |
|---|---|---|---|---|---|
| `supermercado` | 4711-3/01, 4711-3/02 | alimentação no domicílio | `supermercado_atacarejo` | sim | 1 500 |
| `farmacia` | 4771-7/01, 4771-7/02, 4771-7/03 | assistência à saúde (remédios) | — | sim | 800 |
| `padaria` | 4721-1/02 | alimentação no domicílio | — | não | 800 |
| `academia` | 9313-1/00 | recreação e cultura | — | sim | 1 500 |
| `escola_particular` | 8512-1/00, 8513-9/00, 8520-1/00 | educação | `escola` | sim | 2 000 |
| `clinica` | 8630-5/02, 8630-5/03 | assistência à saúde | `saude` | sim | 2 000 |
| `restaurante` | 5611-2/01 | alimentação fora do domicílio | — | não | 1 000 |
| `pet` | 4789-0/04 | outras despesas correntes | — | não | 1 500 |
| `vestuario` | 4781-4/00 | vestuário | `shopping_center` | não | 3 000 |

Os raios de supermercado (1 500 m) e farmácia (800 m) são os do método; os demais são ponto de
partida declarado, a conferir junto com a P-25. Classes de porte de partida, por exemplo em
`supermercado`: CNAE 4711-3/01 (hipermercado) = 5 000 m², 4711-3/02 (supermercado) = 1 500 m²,
mercado de vizinhança = 300 m².

**Lacuna comercial (v0.5).** É calculada sobre a **bacia** da categoria, não sobre a célula
isolada (a compra atravessa células, e a divisão por estabelecimentos de uma célula de 10 ha
divide por zero ou por um): gasto potencial e estabelecimentos somados no raio `raio_bacia_m` em
torno da célula. Célula sem estabelecimento na bacia é "sem oferta", fora da razão. Só entram
células habitadas com gasto potencial ≥ P25 da cidade (seção 9.7, `lacuna_comercial`).

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

**Escala única de atratividade (v0.5).** Numa rodada de Huff todas as lojas usam a mesma
escala, senão a unidade decide o resultado (`pontos_comerciais` só tem porte fiscal do CNPJ, e
`ancoras.atratividade` é m²): (a) classe de porte da categoria (`classes_porte`), aplicada também
à âncora simulada pelo porte escolhido; ou (b) A = 1 para todas. A área medida de uma âncora só
entra se todas as concorrentes da rodada tiverem área medida. O resultado diz a escala usada e a
fração de concorrentes com atratividade imputada (R-12; o expoente segue em P-27).

**Áreas gêmeas** (`comum/espacial/similaridade.ts`): vetor das métricas com `similaridade =
true`, padronizado (z) na cidade, distância euclidiana ponderada; referência = área de estudo,
localidade ou célula; resultado = os `similaridade_max_resultados` mais próximos, cada um com as
três métricas que mais aproximam e as três que mais afastam.

**Bolsões** (`comum/espacial/gi.ts`): Gi* sobre métricas de célula (R$/m² mediano das células
com ao menos 5 imóveis, gasto potencial, crescimento domiciliar), vizinhança = a célula e o anel
1. Sem regressão, sem previsão. Na v0.5: só células habitadas entram; a significância é por
**FDR de Benjamini-Hochberg** (q = 0,05) sobre os p-valores de todas as células, no lugar de
|z| ≥ 1,96 fixo, que sobre ~20 mil células daria ~1 000 falsos positivos por acaso (Caldas de
Castro e Singer, 2006); o achado `bolsao` só sai para grupo de ≥ 3 células contíguas
significativas (seção 9.7). O Gi* de R$/m² fica **desligado** até haver ≥ 200 células com ≥ 5
imóveis (hoje nenhum anúncio tem célula).

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
| `valor` | decimal(18,6) (percentual em fração decimal, convertido na carga com a escala declarada na tabela `series_macro_config`; D-12) |
| `capturado_em` | datahora, obrig. |

`unicos`: `(codigo_serie, mes_referencia)`.

#### `series_macro_config` (D-90)

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "{codigo_serie} ({fonte})"`

O que a v0.3 guardava como JSON num parâmetro `texto_longo`. Parâmetro não aceita lista nem JSON
(C-07), então as séries a carregar viram tabela editável na Operação (seção 10.7), pelo operador.

| Coluna | Tipo | Observação |
|---|---|---|
| `codigo_serie` | texto(40), obrig. | código na fonte (no SGS do Banco Central, o número da série) |
| `fonte` | texto(40), obrig. | `bcb_sgs`, … |
| `papel` | texto, as mesmas `opcoes` de `series_macro.papel`, obrig. | |
| `escala` | texto, `opcoes: ["fracao", "percentual", "indice", "valor"]`, obrig. | declarada; a carga converte para fração uma vez (D-12) |
| `ativa` | booleano, obrig., padrão `true` | |
| `versao` | inteiro, obrig., padrão 1 | D-88 |

`unicos`: `{ "colunas": ["fonte", "codigo_serie"], "onde": [{ "coluna": "removido_em", "operador": "nulo" }] }`.
Quais séries entram de partida continua sendo decisão da equipe `[PENDENTE P-24]`.

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

A tabela e a rotina `calcular_achados` entram na fase 4C só com o tipo `condicao_em_risco`
(a 4C precisa reavaliar condições monitoradas); os demais tipos entram na fase 5 (v0.5, seção
15.4C). Achado sobre recorte de área própria segue o sigilo da seção 5.16.

#### `visoes_salvas`

`acesso_externo: restrito` · `pessoal: true` · `id_legivel: "{nome}"`

| Coluna | Tipo |
|---|---|
| `usuario_id` | referencia → `shell.usuarios`, `cascata`, obrig. |
| `nome` | texto(120), obrig. |
| `sub_rota` | texto(120), obrig. |
| `querystring` | texto(2000) |
| `fixada_inicio` | booleano, padrão `false` |

A tabela é **pessoal** e as rotas dela ficam em `rotasPessoais` (D-80, C-54): o shell as monta em
`/api/inteligencia_imobiliaria/pessoal/*`, exige só `leitura` também para `POST`, `PATCH` e
`DELETE`, e impõe `usuario_id` — ninguém lê nem altera visão alheia. Quem só lê salva, edita e
apaga as próprias visões. Como `DELETE` é permitido na rota pessoal, visão não tem
`soft_delete`: apagar é apagar. Piso SDK 94 e shell 0.56.25, cobertos. Fecha P-22.

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
| `area_estudo_id` | referencia → `areas_estudo`, `restringir`, obrig. | seção 5.1 |
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

`teses` (`acesso_externo: restrito`): `area_estudo_id` (referencia → `areas_estudo`, `restringir`; seção 5.1), `versao` (inteiro), `status` (`rascunho`, `vigente`,
`substituida`), `componentes` (json com as dez chaves do doc. 05, §48.1: `situacao_atual`,
`transformacao`, `mecanismo`, `participantes`, `ativos`, `sequencia`, `posicao_up`,
`captura_valor`, `opcoes`, `limites`, cada uma com texto e evidências), `autor_id`, `criada_em`.
Só uma `vigente` por área; publicar uma nova versão torna a anterior `substituida`.

`tese_condicoes` (`acesso_externo: restrito`):

| Coluna | Tipo | Observação |
|---|---|---|
| `tese_id` | referencia → `teses`, `restringir`, obrig. | seção 5.1 |
| `tipo` | texto, `opcoes: ["necessaria", "interrupcao"]`, obrig. | doc. 05, §50 e §51 |
| `texto` | texto(1000), obrig. | "a demanda por lote de 450 m² no entorno precisa ser maior que o pipeline" |
| `frente` | texto, `opcoes` das frentes de diligência | |
| `status` | texto, `opcoes: ["nao_verificada", "sustentada", "contrariada", "inconclusiva"]`, obrig. | |
| `evidencias` | json | |
| `verificar_ate` | data | condição vencida aparece no Início; aviso ao responsável antes do prazo `[PENDENTE P-43]` |
| `metrica_monitorada` | json | opcional: `{ chave, recorte, operador, limiar }`; `calcular_achados` reavalia todo mês e propõe mudança de status (achado `condicao_em_risco`, já na fase 4C) |
| `hipotese_produto_id` | referencia → `hipoteses_produto`, `anular` | v0.5, opcional: a condição de que depende uma hipótese de produto (J2) |

#### `diligencias` (D-60)

`acesso_externo: restrito`. Perguntas por frente (doc. 05, §61), semeadas ao criar a área a
partir de `comum/diligencia.ts` `[PENDENTE P-40]`.

| Coluna | Tipo | Observação |
|---|---|---|
| `area_estudo_id` | referencia → `areas_estudo`, `restringir`, obrig. | seção 5.1 |
| `frente` | texto, `opcoes: ["fundiaria", "urbanistica", "ambiental", "fisica", "infraestrutural", "social", "mercadologica"]`, obrig. | |
| `pergunta` | texto(500), obrig. | |
| `impacto` | json (lista) | o que a resposta pode mudar: `preco`, `estrutura`, `prazo`, `uso`, `posicao`, `decisao` |
| `status` | texto, `opcoes: ["aberta", "respondida_app", "respondida", "nao_aplicavel"]`, obrig. | |
| `resposta` | texto_longo | |
| `natureza_resposta` | texto, opções de `natureza` | |
| `evidencias` | json | |
| `responsavel_id` | referencia → `shell.usuarios`, `anular` | |
| `prazo` | data | aviso ao responsável antes do prazo `[PENDENTE P-43]` |

**Pré-preenchimento pelo app.** Perguntas que o app responde ganham `status = respondida_app`,
com a resposta e a evidência, e continuam abertas para um humano confirmar: zona do PDOT e área
de regularização (urbanística), fração restrita por APP, UC e declividade (ambiental), edificações
existentes (física), acesso e distância a equipamentos (infraestrutural), oferta, preço,
pipeline e concorrência (mercadológica). Fundiária e social nunca são respondidas pelo app.
Enquanto o conjunto `restricoes_sitio` não estiver carregado (seção 12.4), a ambiental fica
`aberta`, sem pré-preenchimento e com a nota "restrições não carregadas", nunca "sem
restrição"; o mesmo vale para a infraestrutural sem `equipamentos_publicos`.

#### `hipoteses_ancora` (D-65)

`acesso_externo: restrito` · `soft_delete`

| Coluna | Tipo | Observação |
|---|---|---|
| `area_estudo_id` | referencia → `areas_estudo`, `restringir`, obrig. | seção 5.1 |
| `categoria_consumo` | texto(60), obrig. | |
| `porte` | texto(80) | classe de porte do catálogo (`classes_porte`), que dá a `atratividade` usada na simulação |
| `simulacao` | json | parâmetros e resultado do Huff congelados, com a escala de atratividade usada (`classe_porte` ou `unitaria`) e a fração de concorrentes com atratividade imputada (seção 5.18) |
| `ancora_traz` | json (lista) | demanda, emprego, fluxo, reputação, serviço… (doc. 03) |
| `up_traz` | json (lista) | terra, infraestrutura, articulação, capital, operação… |
| `modelo_parceria` | texto(120) | candidato, do repertório do doc. 03 `[PENDENTE P-41]` |
| `compromisso_esperado` | texto(500) | o que transforma intenção em compromisso |
| `natureza` | texto, opções de `natureza`, obrig. | nasce `hipotese` |
| `status` | texto, `opcoes: ["hipotese", "em_conversa", "descartada", "compromisso"]`, obrig. | a conversa em si fica no CRM (D-45) |

#### `hipoteses_produto` (v0.5)

`acesso_externo: restrito` · `soft_delete` · `id_legivel: "{tipologia} {faixa_preco}"`

A J2 pede "registrar duas hipóteses de produto com condições", e a v0.4 só tinha hipótese de
âncora. Entra na fase 4C.

| Coluna | Tipo | Observação |
|---|---|---|
| `area_estudo_id` | referencia → `areas_estudo`, `restringir`, obrig. | seção 5.1 |
| `tipologia` | texto(40), obrig. | linha da matriz de produto (quartos e orientação, seção 5.17) |
| `faixa_preco` | texto(40), obrig. | coluna da matriz (faixa de `faixas_preco_brl`) |
| `unidades` | inteiro | quantas unidades a hipótese supõe |
| `cenario_viabilidade_id` | referencia → `cenarios_viabilidade`, `anular` | o cenário que a testa |
| `natureza` | texto, opções de `natureza`, obrig. | nasce `hipotese` |
| `status` | texto, `opcoes: ["hipotese", "sustentada", "descartada"]`, obrig. | |
| `evidencias` | json | lista de evidências (forma da seção 5.20) |
| `autor_id` | referencia → `shell.usuarios`, `campos_incluir` nome | |
| `versao` | inteiro, obrig., padrão 1 | concorrência (D-88) |

As condições de uma hipótese de produto são linhas de `tese_condicoes` da tese da área com
`hipotese_produto_id` preenchido.

#### `area_eventos` e `observacoes_campo` (D-78)

`area_eventos`: linha do tempo da área (`tipo`: `estagio_alterado`, `nota`, `ficha_gerada`,
`analise_gerada`, `tese_publicada`, `condicao_alterada`, `observacao_campo`, `perimetro_alterado`;
`dados` json; `autor_id`; `em`; `area_estudo_id` referencia → `areas_estudo`, `restringir`).
Toda rota de escrita das tabelas desta seção grava aqui na mesma transação. Na v0.5 há também
os tipos de **saída** de área própria (`ficha_exportada`, `pacote_gerado`, `exportacao`), além de
`ficha_gerada` e `analise_gerada`, todos com o usuário (seção 5.16). O comentário da área é o
`tipo = nota`, não editável. Ambas as tabelas são `acesso_externo: restrito`.

`observacoes_campo`: `area_estudo_id` (referencia → `areas_estudo`, `restringir`), `texto` (texto_longo), `latitude`, `longitude`,
`precisao_m` (nulo quando a posição foi tocada no mapa ou digitada; seção 10.10), `registrada_em`,
`autor_id` (`campos_incluir` nome).

`observacao_fotos`: `observacao_id` (referencia → `observacoes_campo`, cascata, obrig.), `foto`
(arquivo `image/jpeg`, `image/png`; 15 MB, sob o cap da instância; **obrigatório**). A foto mora
numa tabela própria para que a coluna seja obrigatória e não expire no TTL da instância: a visita
é evidência da área (D-78, D-89, C-41). Uma observação pode ter zero ou mais fotos. Foto com
pessoas identificáveis segue a seção 22.

### 5.21 Sítio: restrições e equipamentos públicos (D-61, D-62)

**Restrições por célula.** O pipeline calcula, para cada célula, as frações cobertas por: APP
de curso d'água (faixa de `app_largura_padrao_m` quando a largura não é conhecida, como premissa
declarada), unidade de conservação de proteção integral, unidade de conservação de uso
sustentável, declividade acima de `declividade_restritiva_frac`, e áreas de regularização do PDOT
(ARIS, ARINE). Também a união das restritivas (`frac_restrita_total`), sem dupla contagem
`[PENDENTE P-31]`. Tudo entra em `celula_metricas` (conjunto `restricoes_sitio`) e numa camada
vetorial para o mapa. O produtor é o pipeline (linha `restricoes_sitio` da seção 12.4). Na v0.5
o pipeline publica as restrições também como **polígonos por tipo**, simplificados a 5 m (a
declividade vetorizada do modelo de elevação). Camadas internas da UP (por exemplo as do Urbigis
para Colorado–Sobradinho: Rebio da Contagem, linha de alta tensão, matrículas com restrição ou
servidão) entram por KMZ como `contornos` de papel restrição, rotuladas com a origem. Enquanto o
conjunto não existe, o bloco Sítio mostra "restrições não carregadas" e a diligência ambiental
fica sem pré-preenchimento, nunca "sem restrição".

**Área líquida (v0.5, vetorial).** Área líquida de um polígono = área do polígono − área de
(polígono ∩ união das camadas restritivas), calculada em `comum/geo.ts` com biblioteca pura de
recorte de polígonos no bundle (D-93), em SIRGAS 2000 / UTM 23S (precedente: o Urbigis mede área
oficial nessa projeção, por geometria). A célula H3 r9 tem ≈ 10,5 ha, então a grade não serve
para glebas menores que algumas células. A faixa mostrada vem da tolerância de simplificação e da
resolução da fonte (± perímetro × 15 m para declividade de 30 m), não das células de borda. Só é
calculada acima de `area_liquida_min_ha` (seção 4.3; 1 ha na v0.5) e sempre rotulada "estimativa
sobre camadas públicas; não substitui levantamento". `frac_restrita_total` por célula continua
para mapa e achados e **nunca** alimenta a área líquida de uma gleba (R-28).

#### `equipamentos_publicos`

`acesso_externo: somente_leitura`. Carregada pelo pipeline (linha `equipamentos_publicos` da
seção 12.4, fase 4). Enquanto o conjunto não existe, a tela diz "equipamentos não carregados", e
a diligência infraestrutural fica sem pré-preenchimento.

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
| `area_estudo_id` | referencia → `areas_estudo`, `anular` | sem área, é cenário solto (terreno digitado); cenário de área própria segue o sigilo da seção 5.16 |
| `nome` | texto(200), obrig. | |
| `metodo` | texto, `opcoes: ["vertical", "loteamento"]`, obrig. | |
| `premissas` | json, obrig. | cada premissa com `valor`, `origem` (`parametro`, `benchmark`, `serie`, `manual`) e `natureza = premissa` |
| `resultados` | json | VGV, custos por linha, valor residual total e por m² de terreno, sensibilidade |
| `comparacao` | json | Terracap (mediana da localidade × `destinacao_categoria`), anúncios de terreno no entorno, ambos com amostra e com a base de comparação escrita (abaixo) |
| `versao_metodo` | texto(20), obrig. | |
| `autor_id`, `versao` | referencia (`campos_incluir` nome), inteiro | `versao` para a concorrência (D-88) |

**Preço de venda, não pedido (v0.5).** Benchmark de lançamentos e mediana de anúncios são
preços **pedidos** (D-50). O VGV usa preço de venda = preço pedido × (1 −
`viab_desconto_pedido_venda_frac`), com o desconto tirado do IVV do recorte (1 −
`preco_venda_m2_brl` ÷ `preco_pedido_m2_brl`, últimos 12 meses) e, sem IVV, do parâmetro
(premissa declarada). Preço manual é declarado pelo usuário como pedido ou venda.

**Vertical:** área computável = área do terreno × coeficiente (do PDOT/LUOS quando houver, senão
manual); área privativa = computável × `viab_eficiencia_privativa_frac`; VGV = privativa ×
preço de **venda** por m² (acima); custo de obra = área construída × CUB-DF da série
`custo_construcao` × `viab_fator_custo_sobre_cub` `[PENDENTE P-34]`; **custos indiretos**
(projetos, aprovação, legalização, administração) = custo de obra × `viab_custos_indiretos_frac`;
**contrapartida urbanística** (ODIR e ONALT) em R$, entrada manual sem padrão, zero só se
declarada "não incide"; despesas = VGV × (`viab_despesas_comerciais_frac` + `viab_impostos_frac`);
margem = VGV × `viab_margem_alvo_frac`; **residual bruto** = VGV − custo de obra − custos
indiretos − contrapartida − despesas − margem; **valor residual do terreno** = residual bruto ÷
(1 + `viab_aquisicao_frac`), que desconta ITBI e registro da aquisição.

**Loteamento:** área de lotes = área líquida × `viab_aproveitamento_loteavel_frac`; receita =
área de lotes × preço de venda do m² de lote (mercado de lotes da área, com o mesmo desconto, ou
manual); custo de infraestrutura = área loteada × custo por m² (entrada obrigatória, sem padrão);
custos indiretos, contrapartida, despesas, margem e aquisição como acima; valor residual idem.

Os parâmetros novos (`viab_desconto_pedido_venda_frac`, `viab_custos_indiretos_frac`,
`viab_aquisicao_frac`) moram na seção 4.3, com os padrões marcados `[PENDENTE P-35]`.

**Comparação (v0.5).** Vertical: residual por m² de **área computável** contra
`terracap_preco_m2_potencial` da localidade × `destinacao_categoria`, que é a base comparável
entre terrenos de potencial diferente. Loteamento: residual por m² de gleba bruta, com o aviso
"a Terracap vende lote urbanizado, não gleba". Nunca residual por m² de terreno contra
arrematado por m² de terreno (R-29, R-30).

**Sensibilidade:** grade 3 × 3 de preço (−10%, 0, +10%) por custo (−10%, 0, +10%). **Custo de
espera** opcional (doc. 05, §64): meses até o lançamento × taxa mensal sobre o valor do terreno.
O método é **estático** e diz isso na tela: o tempo só entra pelo custo de espera (método
involutivo simplificado, NBR 14653-2).

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
| `resultado` | json | **um bloco** do cálculo (no dossiê, uma escala ou um tema por linha), nunca o dossiê inteiro: o bundle não documenta teto de valor `json` (C-20) |
| `criado_em`, `expira_em` | datahora | `expira_em` = criação + `cache_ttl_dias` |
| `acessos` | inteiro | |

`geracao_cadastro` é um contador em `cursores_rotina` que toda escrita de cadastro incrementa
(anúncio, lançamento, âncora, lote, licença, empreendimento, grupo). Assim uma correção manual
invalida o cache sem precisar saber quais cálculos ela afeta (R-34).

#### `uso_eventos` (D-72)

`acesso_externo: restrito` · `pessoal: true`. Telemetria mínima para decidir fases pelo uso
(R-26): `usuario_id` (referencia → `shell.usuarios`, `cascata`, obrig.; dado pessoal no
inventário da seção 22.1), `sub_rota`, `acao` (`abrir`, `exportar`, `gerar_ficha`,
`gerar_analise`, `salvar_area`, `simular`), `em`.

**Tabela pessoal (v0.5).** Pelo contrato método → nível, `POST` exige `escrita`, e quem só tem
`leitura` não conseguiria registrar a abertura de uma tela. Por isso a tabela é `pessoal: true`
e a abertura é gravada por `POST /pessoal/uso` em `rotasPessoais` (`{ sub_rota, acao }`,
`req.dados.criar`; o shell preenche `usuario_id`), como `visoes_salvas` (D-80). As ações que já
passam por rota da app com `escrita` (exportar, gerar ficha, gerar análise) gravam o evento no
próprio handler, sem o POST. O frontend agrupa aberturas (no máximo uma chamada por troca de
sub-rota) e ignora falha do POST. Fora da rota pessoal a tabela é comum: a agregação da seção
6.20 lê a tabela inteira pela rota normal, e `limpar_retencao` apaga por `deletarVarios` no `ctx`
da rotina.

Agregada por tela na Operação; apagada depois de `uso_retencao_dias`. O shell
não registra uso por tela nem expõe telemetria de navegação à app: a Auditoria é trilha de
eventos `auditavel` de categoria fechada, sem PII e permanente, e a aba Utilização da IA só conta
chamadas de IA. Por isso a tabela é da app (C-83; fecha P-38).

**Frescor das fontes (D-71).** `comum/fontes.ts` declara, por fonte, a periodicidade e o
`frescor_esperado_dias` (seção 23); quem responde por cada fonte manual
`[PENDENTE P-44]`. A rotina `verificar_frescor` compara com a última carga e abre
achado de qualidade `FONTE_ATRASADA` (aviso), que a tela mostra no rodapé de procedência de todo
número daquela fonte.

---

## 6. API da app (`backend/rotas.ts`)

Todas as rotas são relativas e montadas pelo shell em `/api/inteligencia_imobiliaria/`. Toda
rota autenticada recebe `req.contexto` com nível e papéis; o gate uniforme do shell já exige
`leitura` para `GET`, `escrita` para `POST`/`PATCH`/`PUT` e `admin` para `DELETE`. A app
acrescenta o gate de **papel** onde indicado (`curador`, `operador`, `estrategico`), a **guarda
por objeto** onde a coluna Papel diz `obj.` (T4, abaixo) e **nunca** afrouxa o do shell.

Convenções:

- Lista responde `{ dados, total, pagina, por_pagina, paginas }` (envelope do framework) com
  `por_pagina` limitado a 100 na borda da app (`Math.min(…, 100)`).
- Filtro de cidade: `?cidade=<slug>`; com uma cidade só, é opcional e resolve para ela.
- Erro responde `{ erro: true, codigo, mensagem, detalhes? }`, e o frontend lê `e.status`,
  `e.codigo` e `e.detalhes` do `Error` que `urbiVerso.api()` lança. **`detalhes` chega
  normalizado como `string[]`** (C-69): só linhas de texto acionáveis, nunca objeto.
- **Invólucro de erro (v0.5, T2).** Toda rota é registrada por `rota(fn)`
  (`backend/rotas/comum.ts`), que aguarda o handler e, em exceção, decide: `ErroApp` (código da
  6.22) vira `{ erro: true, codigo, mensagem, detalhes }` com o status dele; erro da plataforma
  que traz `status` e `codigo` (`ErroArquivoRecusado`, `CONFLITO`; violação de `CHECK` `23514` →
  `422 DADOS_VALOR_INVALIDO`) segue com o status dele; o resto vai a `next(erro)`, e o shell
  responde `500 ERRO_INTERNO` com o `id` da ocorrência. O SDK usa Express 4, que não captura
  promessa rejeitada: exceção que escapa do handler deixa a request sem resposta (modulos.md).
  Nenhum handler escreve `try/catch` só para responder 500. Teste: um percorre a pilha de cada
  Router exportado e reprova rota registrada sem `rota()`; outro prova que exceção num handler
  resolve a request (precedente: nobi, `try { … } catch (e) { next(e) }`).
- Toda rota de escrita de cadastro grava `alteracoes_cadastro` e o evento de domínio
  (`anuncio_eventos`/`lancamento_eventos`) **na mesma transação** (`req.dados.transaction`:
  `READ COMMITTED`, `ROLLBACK` automático, mesmo helper dentro do callback; C-25). Só tabelas
  entram na transação: o evento de **barramento** (seção 13) é publicado depois do `COMMIT`. A
  transação é curta e sem I/O externo; o bundle não documenta limite de tamanho nem de tempo
  (R-40).
- Lista ordena por **uma** coluna (`ordem`, `direcao`); filtro por lista de ids é um array em
  `filtros`, que o framework traduz em `IN` (C-23).
- Exportação CSV: toda rota de lista aceita `?formato=csv` e responde `text/csv; charset=utf-8`
  com BOM, separador `;` (Excel pt-BR), **sem** paginação, teto de 50 000 linhas (acima disso
  responde `413 EXPORTACAO_GRANDE` e manda estreitar o filtro). O frontend baixa com
  `urbiVerso.fetch(...).blob()`. **Injeção de fórmula (v0.5, T3):** célula de texto que começa
  com `=`, `+`, `-`, `@`, tabulação ou retorno sai com `'` na frente; coluna numérica sai como
  número e não é tocada. A importação retira esse `'` inicial e ignora com aviso as colunas
  derivadas que a exportação acrescenta (seção 11.1, T9), para o ida e volta não rejeitar linha.
- **Pacote com proveniência (D-28):** toda rota de lista e de tela de decisão aceita também
  `?formato=pacote` e responde um ZIP com `dados.csv`, `metadados.json` (colunas com unidade e
  natureza do catálogo, fontes com versão e hash, filtros aplicados, data) e `LEIAME.md` com a
  citação "Fonte (ano) – processado pela Inteligência Imobiliária". O ZIP é gerado no backend com
  biblioteca pura embutida no bundle (`fflate`), que o contrato self-contained permite: só
  dependência nativa fica fora, e não há lista de proibidas (D-93, C-40, C-74; fecha P-18).
- **CSV grande e pacote saem em fluxo** (`res.write` por lote) e o frontend lê com
  `urbiVerso.fetch(...).blob()`. O bundle não documenta teto de resposta nem compressão; a app
  não conta com gzip (C-79).
- **Cálculo que não grava é `GET` (v0.2).** O shell exige `escrita` para `POST`, e a app não pode
  afrouxar o gate: o contrato é "`POST`, `PUT`, `PATCH` → escrita", e a única exceção são as rotas
  pessoais, que só servem a estado do próprio usuário (C-51). Enriquecimento, dossiê, capacidade,
  matriz, simulação de Huff, áreas gêmeas e score de lente não gravam nada e precisam funcionar
  para quem só tem `leitura`, então são `GET`. Polígono ad hoc vai na querystring codificado em
  *encoded polyline* (`comum/celulas.ts`) com no máximo `polyline_max_vertices` (300, ≈ 2 KB)
  vértices; acima disso a tela salva o desenho como área de estudo temporária e passa
  `area_estudo_id` (D-92). O bundle não documenta teto de URL; a app assume 8 KB (C-77, R-42).
- **Corpo de `POST`/`PATCH` até 100 KB** (`413 CORPO_MUITO_GRANDE`, C-78): geometria desenhada
  no `urbi-mapa` cabe; geometria colada ou importada vai sempre como arquivo, por `__upload`
  (D-92).
- **Concorrência de edição (v0.3, D-88 na v0.4):** todo `PATCH` de cadastro, área, síntese, tese,
  condição, diligência e cenário manda a `versao` que a tela leu; a rota grava com
  `req.dados.atualizarSe` e `{ versao }` nas condições, incrementando-a. Se o registro mudou
  depois, responde `409 CONFLITO_VERSAO` com uma linha de texto em `detalhes`; a tela, ao receber
  `e.codigo === "CONFLITO_VERSAO"`, refaz `GET /:id` para obter a versão atual e mostra as duas
  (C-22, C-69). Nenhuma escrita sobrescreve em silêncio a de outra pessoa.
- **Guarda por objeto (v0.5, T4).** Cada tabela com regra por objeto a declara em
  `comum/regras-objeto.ts` (`autor`, `responsavel`, `curador`, `estrategico`, por operação `ler` e
  `escrever`). Toda rota que recebe `:id` dessas tabelas, ou id de objeto pai no corpo ou na
  querystring (`area_estudo_id`, `tese_id`), busca o registro e chama
  `exigirAcessoObjeto(req, registro, operacao)` antes de qualquer efeito: quem não pode ler recebe
  `404 REGISTRO_NAO_ENCONTRADO` (não confirma que existe); quem lê e não pode escrever recebe
  `403 OBJETO_SEM_PERMISSAO`. Na coluna Papel, `obj. ler` e `obj. escrever` marcam essa guarda.
  Nas tabelas que pendem de uma área de estudo, `ler` é o da área, resolvido pelo pai
  (`tese_id` → tese → área), e `escrever` é `escrita` mais `ler` da área, salvo quando a coluna
  Papel acrescenta "autor ou curador" (D-115). Teste:
  `testes/matriz-acesso.test.ts`, uma linha por rota × perfil (autor, responsável, curador,
  `estrategico`, `escrita` sem relação, `leitura` sem `estrategico`) com o status esperado; a lista
  de rotas é conferida contra a pilha dos Routers por **contagem exata**, então rota nova sem linha
  reprova (precedente: nobi, `testes/papeis.test.ts` `MATRIZ`). O QA repete a matriz na Pinguim
  com o pool de usuários de QA.
- **Sigilo das áreas próprias (v0.5, item 13).** Área `tipo = propria` e tudo que pende dela
  (seções 5.16 a 5.22, `analises_ia` de área incluída) só é lido por quem tem `estrategico` ou
  `curador`, ou é o `responsavel_id` da área (regra `ler` de `areas_estudo`). Para os demais, a
  área some de toda lista, do portfólio, do Início, dos achados, do mapa, da comparação e das
  exportações, e o detalhe responde `404`. O filtro entra **na consulta, antes da paginação**,
  para que `total` e contagens não denunciem a área (D-116). Toda
  **saída** de área própria (gerar ficha, baixar ficha em qualquer formato, pacote, CSV, pedir
  análise de IA) grava `area_eventos` com o usuário; não há trilha de visualização, que seria
  telemetria nominal (R-35).
- **Supressão por amostra (v0.5, item 21).** Rota que devolve estatística de amostra aplica a
  regra da seção 5.1: mediana só com n ≥ 5; P25, P75 e dispersão só com n ≥ 10; variação entre
  dois meses só quando os dois têm n ≥ 20. Abaixo disso o campo vem `null` com
  `indisponivel: { motivo: 'amostra_pequena', n }` (6.21), nunca o valor com aviso. A mesma função
  de `backend/metricas/` serve rota, rotina, achado e contexto de IA.
- **Variação de oferta (v0.5, item 22).** Variação temporal de oferta (mês contra mês, 12 meses)
  em qualquer rota é calculada só sobre anúncios de buscas do **painel** ativas nos dois meses, ou
  pelo `indice_oferta_mensal` quando ele é publicável; a mediana bruta de todos os anúncios é
  nível, nunca variação.
- **Campo de fase futura (v0.5, T10).** Os contratos da 6.21 valem desde a fase 1. Bloco ou campo
  que depende de tabela de fase posterior vem `null` com
  `indisponivel: { motivo: 'fase_futura', fase: '3' }` no mesmo nível (nunca omitido, nunca 0); a
  fase que cria a tabela troca o `null` pelo valor sem mudar a forma da resposta.
- **Orçamento de CPU (v0.5, item 12).** Todas as apps rodam no processo do shell (guia de
  desenvolvimento § 8), então nenhum trecho síncrono de rota passa de ~50 ms. O que varre a cidade
  inteira (Gi*, lacunas comerciais por célula, `celula_metricas`, quantis de classe, achados) só
  roda em rotina e grava resultado; a rota lê o resultado e nunca recalcula para o DF. Cálculo por
  pedido (enriquecimento, Huff, matriz, viabilidade, comparação) é limitado pelos tetos da seção
  21.2 e por `hex_max_celulas_resposta`, passa pelo cache (D-69) e, em laço acima de 1 000 itens,
  cede ao event loop com `await cederAoLaco()` (`comum/`, `setImmediate` a cada 1 000 iterações).
  Mediana e percentil ordenam só a amostra do recorte, nunca a tabela. Sem `worker_threads` na
  V1: o bundle é arquivo único e o SDK não o documenta.
- **Coleta pausada (v0.5, item 14).** Rota manual que faz requisição externa
  (`/anuncios/por-url`, `/anuncios/:id/verificar`, `/lancamentos/:id/verificar`,
  `/candidatos/:id/reler`, `/fontes/:id/diagnosticar`, `/buscas/:id/executar`,
  `/dados-publicos/carregar`) lê o parâmetro `coleta_ativa` antes de tudo e, desligado, responde
  `409 COLETA_PAUSADA`.
- **Dado de terceiro (v0.5, T3).** Toda URL que vem de dado de terceiro (anúncio, fonte,
  procedência, conjunto) passa por `urlSegura()` de `comum/` ao gravar: só `http` e `https`,
  senão `null`. `bruto`, HTML de portal e JSON de diagnóstico saem como dado, e a tela os mostra
  como texto, nunca como HTML (seções 8.3 e 10.1).

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
| POST | `/contornos` | curador | cria contorno **desenhado** (geometria do `urbi-mapa`, que cabe nos 100 KB do corpo); geometria colada vai como arquivo por `/contornos/importar` (D-92, C-78) |
| POST | `/contornos/importar` | curador | recebe o `upload_id` de KML/KMZ/GeoJSON e **grava na hora** uma linha de `importacoes` (`tabela_alvo = contornos`, `status = previa`) com o arquivo, porque o `upload_id` vale 10 min e não renova (C-38); devolve `{ importacao_id, feicoes: [{ nome, tipo, vertices, bbox }] }` |
| POST | `/contornos/importar/:importacao_id/aplicar` | curador | aplica a prévia lendo o arquivo da importação: cria os contornos, sem duplicar (`geometria_hash`), grupo `poligonais_importadas` |
| PATCH | `/contornos/:id` | curador | nome, categoria, estilo, localidade, status |
| PATCH | `/contornos/:id/remover`, `/restaurar` | curador | soft-delete (invólucro de `req.dados.remover`/`restaurar`; C-19) |

### 6.2 Anúncios

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/anuncios?cidade&localidade&tipo_imovel&tipo_transacao&quartos_min&quartos_max&preco_min&preco_max&area_min&area_max&orientacao&situacao_regularizacao&status=ativo\|todos&portal&q&bbox&ordenar&pagina` | leitura | lista com os derivados (`preco_m2`, `orientacao`, `preco_m2_divergente`) |
| GET | `/anuncios/mapa?<mesmos filtros>` | leitura | versão enxuta para o mapa: `id`, `latitude`, `longitude`, `preco_m2`, `tipo_imovel`, `status`, `precisao_coordenada`; teto 5 000 pontos, acima disso responde `agrupado: true` com contagens por localidade |
| GET | `/anuncios/kpis?<filtros>` | leitura | contagem, mediana de preço e de preço/m², P25/P75, `sem_coordenada_exata`, `amostra_n`; estatística abaixo do n mínimo vem `null` com `indisponivel` (supressão por amostra, v0.5) |
| GET | `/anuncios/comparaveis?anuncio_id&raio_m` | leitura | amostra comparável (mesma tipologia e quartos, mesma localidade), régua P25–P50–P75 (só com n ≥ 10) e posição do anúncio contra a mediana; devolve `qualidade_amostra` |
| GET | `/anuncios/:id` | leitura | detalhe em três níveis (essencial, complementar, técnico) + eventos + retratos; na fase 1, retratos, grupo, liquidez e `preco_inicial_brl` vêm `null` com `indisponivel: { motivo: 'fase_futura', fase: '3' }` (T10) |
| POST | `/anuncios` | curador | cria por formulário (`origem_cadastro = manual_formulario`) |
| POST | `/anuncios/por-url` | curador | recebe `{ url }`, lê a página com o parser (seção 8.3) e devolve o **candidato** preenchido para revisão; não grava ainda. Host fora das fontes ativas → `422 URL_FORA_DAS_FONTES`, sem requisição (guarda de destino, 8.2) |
| POST | `/anuncios/por-url/confirmar` | curador | grava o anúncio a partir do candidato revisado (`origem_cadastro = manual_url`) |
| PATCH | `/anuncios/:id` | curador | edita; `preco_m2_informado_brl` só por aqui; `status` manual é respeitado pela rotina (nunca sobrescrito) |
| PATCH | `/anuncios/:id/remover`, `/restaurar` | curador | soft-delete |
| POST | `/anuncios/:id/verificar` | operador | verifica agora este anúncio (fora da rotina), devolve o resultado da classificação; ação síncrona de uma página (6.3) |
| GET | `/anuncios/:id/eventos` | leitura | |
| GET | `/anuncios/:id/retratos` | leitura | série mensal do anúncio; na fase 1, lista vazia com `indisponivel: { motivo: 'fase_futura', fase: '3' }` (T10) |

### 6.3 Candidatos, fontes e buscas

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/candidatos?status&fonte&busca&pagina` | leitura | |
| GET | `/candidatos/:id` | leitura | com `bruto`, entregue como dado e mostrado como texto (T3) |
| POST | `/candidatos/:id/aprovar` | curador | promove a anúncio (seção 8.7); corpo pode trazer correções dos campos |
| POST | `/candidatos/:id/rejeitar` | curador | `{ motivo }` |
| POST | `/candidatos/:id/reler` | operador | lê a página de novo agora; ação síncrona de uma página |
| GET | `/fontes` | leitura | |
| POST / PATCH | `/fontes`, `/fontes/:id` | operador | `url_base` com esquema fora de `http(s)`, porta não padrão, host IP literal, `localhost` ou terminado em `.local`/`.internal`, ou `cabecalhos` com nome fora da lista fechada (8.2), responde `422 FONTE_CONFIG_INVALIDA` (D-117) |
| POST | `/fontes/:id/diagnosticar` | operador | um anúncio por fonte: código HTTP, classificação e amostra do HTML (primeiros 4 KB, como texto), sem gravar nada; ação síncrona de uma página |
| GET / POST / PATCH | `/buscas`, `/buscas/:id` | leitura / operador | `painel` e `painel_desde` mudam por aqui; entrar ou sair do painel marca quebra de série no mês (item 22) |
| POST | `/buscas/:id/executar` | operador | pede a leitura desta busca **sem rodá-la no request** (v0.5, T5): cria a linha de `coletas` (`disparo = manual`), publica `continuar_coleta` com `{ rotina: 'descobrir_anuncios', busca_id, coleta_id, disparo: 'manual' }` por `agendar(…, { em: new Date() })` e responde `202 { coleta_id }`; o listener adquire a trava da classe `coleta`, lê só esta busca e fecha a `coleta`; a tela acompanha por `GET /coletas/:id` |

**Ações síncronas de uma página (v0.5, T5, item 11).** Só leem no request as ações de **uma**
página: `/anuncios/por-url`, `/anuncios/:id/verificar`, `/lancamentos/:id/verificar`,
`/candidatos/:id/reler` e `/fontes/:id/diagnosticar`. Todas passam pela guarda de destino (8.2),
têm teto de 20 s no cliente HTTP contando os saltos de redirecionamento, respondem
`504 COLETA_TIMEOUT` com texto legível quando estouram (D-118) e obedecem
`coleta_ativa`. O que lê mais de uma página (busca, lote, carga) vai por evento e responde `202`,
como a D-91: uma busca percorre até `max_paginas_busca_por_execucao` páginas com
`intervalo_min_por_host_ms` entre elas, o que leva minutos.

### 6.4 Lançamentos e âncoras

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/lancamentos?cidade&localidade&estagio_vendas&orientacao&q&pagina` | leitura | |
| GET | `/lancamentos/:id` | leitura | + eventos + lacunas |
| POST / PATCH | `/lancamentos`, `/lancamentos/:id` | curador | |
| POST | `/lancamentos/:id/verificar` | operador | lê a página agora; ação síncrona de uma página (6.3) |
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
| GET | `/mercado/anuncios/metricas?cidade&localidade&tipo_imovel&tipo_transacao&quartos&faixa_area&de&ate` | leitura | `metricas_anuncios_mensais`, com a supressão por amostra; as variações vêm só do painel (item 22) |

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
| GET | `/territorio/conjuntos/:codigo/arquivos/:caminho` | leitura | **resolve, não serve** (D-81, C-39): responde `{ arquivo_id, sha256, bytes, url }`, com `url` de `req.arquivos.url(arquivo_id, ttl)`; o frontend baixa com `urbiVerso.fetch(url)` e memoiza por `sha256` na sessão. Sem `ETag` nem `Cache-Control`, que o download do framework não documenta |
| GET | `/territorio/agregados?cidade&conjunto&ano` | leitura | agregados por localidade |
| GET | `/trechos?cidade` | leitura | trechos vigentes com o contorno (eixo) e resumo de tráfego (último mês com dado) |
| GET | `/trechos/:id/trafego?de&ate&sentido&metrica` | leitura | diário por sentido, com origem e destino oficiais traduzidos por `sentidos_oficiais` |
| GET | `/trechos/:id/trafego/mensal?metrica` | leitura | agregação mensal por sentido |
| GET | `/corredores/:codigo?mes&metrica` | leitura | os pontos do corredor, nunca somados entre si, com os extremos nomeados |
| GET | `/trafego/cobertura?cidade` | leitura | que trechos têm fluxo e geometria, quais têm fluxo sem geometria ("fluxo disponível; geometria oficial não localizada") |

### 6.8 Análises por IA

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/analises?tipo&localidade&mes&pagina` | leitura | últimas análises (a vigente de cada recorte, com `substituida_por_id` nulo); análise de área própria só para quem lê a área (sigilo, v0.5) |
| GET | `/analises/:id` | leitura · obj. ler (análise de área) | texto, estrutura, indicadores usados, custo |
| POST | `/analises/territorio` | escrita | `{ localidade_id, mes_referencia? }` gera agora: cria a linha de `analises_ia` com `status = gerando`, chama `req.ia.consultarAsync({ …, aoConcluir: { evento: "analise_concluida", dados: { analise_id } } })` e responde `202 { id }`; o listener `analise_concluida` grava o resultado, e a tela acompanha por `GET /analises/:id` (D-82, C-80) |
| POST | `/analises/mercado` | escrita | `{ cidade, mes_referencia? }` |
| POST | `/analises/tela` | escrita | `{ tela, filtros }` para o recorte em tela [PENDENTE P-46] |
| POST | `/analises/area` | escrita · obj. ler | `{ area_estudo_id, mes_referencia? }`; de área própria, grava `area_eventos` com o usuário (item 13) |
| GET | `/analises/estado` | leitura | `req.ia.estadoSlot` dos quatro slots de análise, devolvido como `{ [slot]: { pedido, efetivo, backup } }` (`EstadoSlotIA`; `efetivo` e `backup` são `{ slot, origem }` ou `null`, nunca provedor ou modelo). A tela esconde o botão quando `efetivo === null` e avisa "sem failsafe: uma queda de cota derruba a chamada" quando `backup === null` (C-43) |

As três outras rotas `POST /analises/*` seguem o mesmo fluxo assíncrono da primeira. O bundle
não documenta timeout de rota HTTP síncrona; a IA nunca roda dentro do request (C-80), e pedido
síncrono não existe na app. `RATE_LIMIT` no worker assíncrono do shell não é falha: o worker
retenta no próprio backoff, a análise fica `gerando` mais tempo e a tela mostra "na fila" com a
hora do pedido (seção 9.6, item 19).

### 6.9 Operação

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/coletas?tipo&status&pagina` | leitura | execuções com contadores |
| GET | `/coletas/:id` | leitura | |
| GET | `/importacoes`, `/importacoes/:id` | leitura | |
| POST | `/importacoes/previa` | operador | `{ tabela_alvo, upload_id, modo_duplicata, mapeamento? }` → grava a linha de `importacoes` com o arquivo na hora (o `upload_id` vale 10 min; C-38), lê o CSV, infere o mapeamento pelos cabeçalhos, valida tudo e devolve a prévia (contagens e primeiras 50 rejeições) **sem gravar dado na tabela alvo**; coluna derivada ou desconhecida é ignorada com aviso em `colunas_ignoradas` (motivo `derivada` ou `desconhecida`), nunca rejeita a linha (T9, seção 11.1) |
| POST | `/importacoes/:id/aplicar` | operador | aplica a prévia numa transação por lote de 500 linhas |
| POST | `/importacoes/:id/desfazer` | admin da app | remoção lógica (`PATCH …/remover`) das linhas criadas por esta importação que ninguém editou depois (`versao` igual à da criação); grava `relatorio_desfazer` com as removidas e as mantidas por edição; nunca apaga de vez (v0.5, item 5; seção 11.3.2) |
| GET | `/importacoes/modelo/:tabela` | leitura | CSV só com o cabeçalho esperado pela tabela |
| GET | `/qualidade?tabela&codigo&severidade&resolvido=false` | leitura | achados |
| PATCH | `/qualidade/:id/resolver` | operador | |
| GET | `/dados-publicos/estado` | leitura | manifest remoto × carregado: por conjunto, hash remoto, hash local, arquivos faltando |
| POST | `/dados-publicos/carregar` | operador | pede a carga agora **sem rodá-la no request** (D-91): publica `continuar_coleta` com `{ rotina: "carregar_dados_publicos", disparo: "manual" }` por `agendar(…, { em: new Date() })` e responde `202`; o listener roda a carga com a trava de `cursores_rotina` (classe `carga`) e registra a `coleta` como `manual`. Com `coleta_ativa = false`, `409 COLETA_PAUSADA`. Não existe verbo para a app disparar a própria rotina, e chamar o handler em linha correria fora do lock, do log da aba Rotinas e do corte de 15 min (C-11). O admin da app tem também o "Rodar agora" nativo |
| GET | `/operacao/saude?meses` | leitura | painel do que pode parar calado (v0.5, itens 14 a 16): valor de `coleta_ativa` e desde quando; por classe (`coleta`, `carga`), a execução em curso e as `adiada`/`pausada` recentes, com a continuação agendada; e, por mês, o estado de cada elo da cadeia mensal (`fechar_mes`, `carregar_series_macro`, `calcular_achados`, `gerar_analises_mensais`) lido de `coletas`: concluído, aguardando (com a tentativa, até 6), adiado, falhou ou parado; e as fontes bloqueadas, de parser degradado e atrasadas (8.4, 8.4.1, seção 23). É o que a aba Saúde da Operação (10.7) mostra, porque `erros.cadeia_mensal_parada` só o admin vê |

### 6.10 Grade e enriquecimento (D-34 a D-37)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/territorio/catalogo` | leitura | catálogo de métricas (seção 5.13) |
| GET | `/territorio/celulas?cidade&bbox&metrica&ano&zoom` | leitura | **só valores**: `{ h3, valor, classe, qualidade }` das células da caixa (`classe` pelos quantis da cidade gravados na carga, nunca recalculados no pedido; item 12); abaixo de `hex_zoom_min` ou acima de `hex_max_celulas_resposta`, responde o pai r8 somado em código (`agregado: "r8"`). A geometria não vai junto (C-79) |
| GET | `/territorio/celulas/geometria?bloco` | leitura | a geometria dos hexágonos de um bloco (pai r8 ou quadrante da caixa), estática por versão de `celulas`; o frontend a memoiza por `h3` e só pede os blocos que ainda não tem. Quando a caixa cruza blocos demais, a tela pede por partes. O bundle não documenta teto de resposta nem compressão |
| GET | `/territorio/enriquecer?ponto=lat,lng&raios=…` \| `?poligono=<polyline>` \| `?area_estudo_id` `&metricas&ano` | leitura (com `area_estudo_id`: obj. ler) | células que entram, fração coberta, e cada métrica agregada pela natureza dela, com método de rateio e fonte; dado por localidade vem rateado e marcado |
| GET | `/territorio/composicao?localidade` | leitura | pesos de `localidade_composicao` que chegam a ela e saem dela |
| GET | `/territorio/serie?localidade&metrica&integracao=nominal\|padronizada` | leitura | série com a quebra de limite marcada |

### 6.11 Estudos de área (D-23)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/estudos?tipo&estagio&responsavel&q&pagina` | leitura | sem as áreas próprias que o usuário não lê (filtro antes da paginação) |
| GET | `/estudos/:id` | leitura · obj. ler | área + resumo do último dossiê |
| POST | `/estudos` | escrita (`tipo = propria`: curador) | cria por desenho (geometria do `urbi-mapa`) ou por ponto |
| PATCH | `/estudos/:id` | escrita · obj. escrever (autor ou curador; `propria`: curador) | |
| POST | `/estudos/importar`, `/estudos/importar/:importacao_id/aplicar` | escrita (`tipo = propria`: curador) | KML/KMZ/GeoJSON, o mesmo fluxo de `contornos`: a prévia já grava a `importacao` (C-38) |
| PATCH | `/estudos/:id/remover`, `/restaurar` | escrita · obj. escrever (autor ou curador) | soft-delete; `DELETE` é do admin no shell |
| GET | `/estudos/:id/dossie?escalas&blocos` | leitura · obj. ler | `Dossie` (seção 6.21): blocos nas quatro escalas (regional, urbana, entorno, sítio), síntese aceita e agenda de decisão (D-56); usa o cache por bloco (D-69). O bundle não documenta timeout de rota: a tela pede os blocos em chamadas separadas (`?blocos=`) e monta o dossiê à medida que chegam, e nenhuma chamada passa do orçamento da seção 21.1 (C-80) |
| POST | `/estudos/:id/fichas` | escrita · obj. ler | congela o dossiê em `area_estudo_fichas` (formato e seções escolhidos); de área própria, grava `area_eventos` com o usuário |
| GET | `/estudos/:id/fichas`, `/estudos/:id/fichas/:fid?formato=md\|csv\|json\|pacote` | leitura · obj. ler | baixar ficha de área própria em qualquer formato grava `area_eventos` com o usuário |
| GET | `/estudos/:id/fichas/comparar?a&b` | leitura · obj. ler | v0.5, item 39: por chave estável de `conteudo` (chave do catálogo + recorte + período), os dois valores e a diferença; cada linha marcada "mudou o dado" quando a versão do conjunto e a `versao_metodo` das duas fichas coincidem, ou "mudou a medida" quando não, e aí sem variação calculada. A tela é a ação "Comparar com…" na lista de fichas (10.10) |
| GET | `/estudos/comparar?ids=a,b,c` | leitura · obj. ler de cada id | 2 a 6 áreas lado a lado, mesmas métricas; id que o usuário não lê responde `404` para o pedido inteiro |

### 6.12 Produto (D-44)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/produto/demanda?localidade\|area_estudo_id` | leitura | domicílios, população, faixas etárias, composição, renda por faixa, aluguel × próprio, déficit e coabitação, crescimento domiciliar |
| GET | `/produto/capacidade?localidade\|area_estudo_id&programa` | leitura | domicílios por faixa de preço alcançável, com a taxa usada e a origem dela |
| GET | `/produto/matriz?localidade\|area_estudo_id&tipo_transacao` | leitura | matriz tipologia × faixa de preço nas duas leituras nomeadas, composição e fluxo (seção 5.17, item 26) |
| GET | `/produto/benchmark?localidade\|area_estudo_id&raio_m&quartos&estagio` | leitura | lançamentos comparáveis com área, R$/m², estágio, estoque e IVV regional; régua P25–P50–P75 |
| GET | `/faixas-programa` | leitura | |
| POST / PATCH | `/faixas-programa`, `/faixas-programa/:id` | curador | |

### 6.13 Comércio e âncoras (D-41 a D-43)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/comercio/categorias` | leitura | catálogo de categorias de consumo |
| GET | `/comercio/potencial?localidade\|area_estudo_id\|ponto&raios&categoria` | leitura | gasto potencial e estabelecimentos por anel e por categoria |
| GET | `/comercio/lacunas?cidade\|area_estudo_id&categoria&escala=celula\|localidade` | leitura | gasto potencial e estabelecimentos somados na **bacia** da categoria (`raio_bacia_m`), contra a mediana da cidade; célula sem estabelecimento na bacia é "sem oferta", fora da razão; só células habitadas com gasto ≥ P25 da cidade (item 30). Com `cidade`, lê o resultado gravado por `calcular_achados`, nunca recalcula (item 12); acima de `lacuna_comercial_razao_min` vira achado |
| GET | `/comercio/simular?ponto&categoria&escala=porte\|unitaria\|medida&porte&expoente` | leitura | modelo de Huff para uma âncora hipotética no ponto; todas as lojas da rodada na mesma escala de atratividade (item 29): classe de porte da categoria, aplicada à âncora pelo `porte` escolhido; A = 1 para todas; ou área medida, só se todas as concorrentes a tiverem |
| GET | `/comercio/gemeas?referencia=area:<id>\|localidade:<id>\|celula:<h3>&escala&n` | leitura | áreas gêmeas |
| GET | `/comercio/bolsoes?cidade&metrica` | leitura | Gi* por célula, lido do resultado gravado pela rotina (só células habitadas, significância por FDR; seção 9.7) [PENDENTE P-46] |
| GET | `/comercio/lentes`, `/comercio/lentes/:id/score?bbox&escala` | leitura | score e decomposição [PENDENTE P-46] |
| POST / PATCH | `/comercio/lentes`, `/comercio/lentes/:id` | curador | [PENDENTE P-46] |
| GET | `/pontos-comerciais?bbox&categoria&fonte` | leitura | |

### 6.14 Terra e oferta futura (D-39)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/terra/lotes?cidade&localidade&situacao&de&ate&destinacao&bbox&pagina` | leitura | com os derivados (R$/m² de terreno e de potencial, ágio) |
| GET | `/terra/resumo?cidade&ano` | leitura | por localidade × `destinacao_categoria`: medianas de R$/m², ágio, propostas, fração vendida (`sql_declarado mediana_terracap_por_localidade`); `outra` nunca entra em mediana (T12) |
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
| GET | `/achados?recorte_tipo&recorte_id&mes&tipo` | leitura | ranqueados por `pontuacao`; achado de área própria só para quem lê a área (com `recorte_id` de área: obj. ler) |
| GET | `/inicio/resumo?cidade&mes` | leitura | achados de maior pontuação da cidade e das áreas próprias **que o usuário lê**, estado das fontes, análises novas, visões fixadas |
| POST | `/pessoal/uso` | leitura | v0.5, T6: `{ sub_rota, acao }` grava `uso_eventos` por `req.dados.criar` em `rotasPessoais`; o shell preenche `usuario_id`. Quem só tem `leitura` pode chamar. O frontend manda no máximo uma chamada por troca de sub-rota e ignora falha; as ações que já passam por rota com `escrita` (exportar, gerar ficha, gerar análise) gravam o evento no próprio handler |
| GET | `/pessoal/visoes` | leitura | as do próprio usuário (`rotasPessoais`; D-80) |
| POST / PATCH / DELETE | `/pessoal/visoes`, `/pessoal/visoes/:id` | leitura | só as próprias, imposto pelo shell; `DELETE` apaga (C-54) |
| GET | `/mercado/macro/config` | leitura | as séries macro configuradas (`series_macro_config`; D-90) |
| POST / PATCH | `/mercado/macro/config`, `/mercado/macro/config/:id` | operador | cadastra ou edita uma série; `PATCH .../remover` desativa |
| GET | `/fontes/:id/saude?de&ate` | leitura | `fonte_saude` |

### 6.17 Método da oportunidade (D-55 a D-60, D-65, D-78)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/estudos/portfolio?tipo&estagio` | leitura | uma linha por área: estágio, perímetro, seis indicadores-chave, condições necessárias por status, diligências abertas por frente, último achado, última ficha (D-66); sem as áreas próprias que o usuário não lê |
| GET | `/estudos/:id/agenda` | leitura · obj. ler | a agenda de decisão: síntese aceita por prioridade, diligências abertas de maior impacto, condições vencidas ou contrariadas |
| GET | `/estudos/:id/linha-do-tempo` | leitura · obj. ler | `area_eventos` |
| GET / POST | `/estudos/:id/perimetros` | leitura · obj. ler / escrita · obj. ler | |
| PATCH | `/perimetros/:pid`, `/perimetros/:pid/remover` | escrita · obj. escrever (autor ou curador) | |
| GET | `/estudos/:id/sintese?grupo&escala&status` | leitura · obj. ler | |
| POST | `/estudos/:id/sintese` | escrita · obj. ler | `fato` sem evidência → `422 FATO_SEM_EVIDENCIA` |
| PATCH | `/sintese/:item`, `/sintese/:item/aceitar`, `/sintese/:item/descartar` | escrita · obj. ler | |
| POST | `/analises/:id/propor-sintese` | escrita · obj. ler | transforma os itens da análise de área em itens `proposto`, `origem = ia`, natureza `hipotese` (D-57) |
| GET | `/estudos/:id/teses`, `/teses/:tid` | leitura · obj. ler | |
| POST | `/estudos/:id/teses`, `/teses/:tid/publicar` | escrita · obj. ler | publicar torna a vigente anterior `substituida` |
| POST / PATCH | `/teses/:tid/condicoes`, `/condicoes/:cid` | escrita · obj. ler | |
| GET | `/estudos/:id/diligencias?frente&status` | leitura · obj. ler | |
| POST / PATCH | `/estudos/:id/diligencias`, `/diligencias/:did` | escrita · obj. ler | pergunta extra; resposta, status, responsável, prazo |
| GET / POST | `/estudos/:id/hipoteses-ancora` | leitura · obj. ler / escrita · obj. ler | o corpo pode trazer a `simulacao` devolvida por `/comercio/simular` |
| PATCH | `/hipoteses-ancora/:hid` | escrita · obj. ler | |
| GET / POST | `/estudos/:id/hipoteses-produto` | leitura · obj. ler / escrita · obj. ler | v0.5, item 40 (fase 4C): tipologia, faixa de preço, unidades, `cenario_viabilidade_id`, natureza, status, evidências |
| PATCH | `/hipoteses-produto/:pid` | escrita · obj. ler | |
| POST | `/estudos/:id/observacoes` | escrita · obj. ler | `{ texto, upload_id?, latitude?, longitude?, precisao_m? }` |

### 6.18 Sítio e equipamentos públicos (D-61, D-62)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/estudos/:id/sitio` | leitura · obj. ler | área bruta, área líquida estimada (faixa), fração por restrição, zonas do PDOT, edificações existentes, distância à via de maior centralidade (`road_centrality`) e aos equipamentos mais próximos |
| GET | `/territorio/restricoes?bbox&tipo` | leitura | camada vetorial de restrições |
| GET | `/equipamentos?bbox&tipo&rede&pagina` | leitura | |
| POST | `/equipamentos/:id/promover` | curador | cria a âncora correspondente e liga `ancora_id` |

### 6.19 Viabilidade expedita e mercado de lotes (D-63, D-64)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/viabilidade/simular?metodo&<premissas>` | leitura | calcula sem gravar; premissa ausente obrigatória → `422 CENARIO_INCOMPLETO` com os campos |
| GET | `/viabilidade?area_estudo_id`, `/viabilidade/:id` | leitura · obj. ler (cenário de área) | |
| POST / PATCH | `/viabilidade`, `/viabilidade/:id` | escrita · obj. ler (cenário de área) | recalcula `resultados` e `comparacao` ao gravar |
| GET | `/terra/lotes-mercado?cidade\|localidade\|area_estudo_id&faixa_area` | leitura | pedido (anúncios de terreno), arrematado (Terracap) e residual (cenários), lado a lado e rotulados |

### 6.20 Governança (D-69 a D-72)

| Método | Rota | Papel | O quê |
|---|---|---|---|
| GET | `/operacao/uso?de&ate` | operador | aberturas e ações por tela e por semana, sem identificar pessoa na agregação; lê `uso_eventos` inteira pela rota normal (fora da rota pessoal a tabela `pessoal` é tabela comum; T6) |
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

// v0.5 (item 21, T10): todo null de métrica ou bloco diz o motivo, no mesmo nível
type MotivoAusencia = 'nao_agregavel' | 'sem_dado' | 'fora_da_cobertura' | 'amostra_pequena' | 'fase_futura';
interface Indisponivel {
  motivo: MotivoAusencia;
  n?: number;                 // com 'amostra_pequena'
  fase?: string;              // com 'fase_futura': a fase que cria o dado ('3', '4A', …)
}

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
  indisponivel?: Indisponivel; // presente sempre que valor é null (v0.5)
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
  recusadas: Array<{ chave: string; motivo: MotivoAusencia }>;
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
  indisponivel?: Indisponivel; // bloco inteiro de fase futura: metricas vazio (v0.5, T10)
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

interface MatrizProduto {                // v0.5, item 26: duas leituras nomeadas (seção 5.17)
  linhas: string[]; colunas: string[];   // tipologias × faixas de preço
  composicao: {
    rotulo: 'composição, não quantidade';
    celulas: Array<{ linha: string; coluna: string; demanda_frac: number | null;
                     oferta_usado_frac: number | null; oferta_novo_frac: number | null;  // nunca somadas
                     descompasso_pp: number | null; amostra_n: number }>;
  };
  fluxo: {                               // unidades por ano; a lacuna em quantidade só existe aqui
    celulas: Array<{ linha: string; coluna: string; demanda_anual: number | null;
                     oferta_anual: number | null; lacuna_unidades_ano: number | null; absorcao: number | null }>;
  };
  tabela_tipologia: { versao: string; calibrada_por_localidade: boolean };
}

interface SimulacaoHuff {
  rotulo: 'simulação com parâmetros declarados';
  categoria: string; ponto: [number, number]; atratividade: number; expoente: number; raio_max_m: number;
  escala_atratividade: 'porte' | 'unitaria' | 'medida';  // a mesma para todas as lojas (v0.5, item 29)
  frac_concorrentes_imputada: number;                    // 0..1
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
| `CENARIO_INCOMPLETO` | 422 | premissa obrigatória faltando; `detalhes` lista uma linha por campo (`string[]`, C-69) |
| `CONFLITO_VERSAO` | 409 | edição concorrente (`atualizarSe` com `{ versao }` não casou); a tela refaz `GET /:id` (D-88) |
| `REGISTRO_REMOVIDO` | 404 | `PATCH` em registro com `soft_delete` já removido (C-19) |
| `MES_NAO_FECHADO` | 409 | pedido que depende de um mês ainda não fechado |
| `SLOT_INDISPONIVEL` | 503 | análise pedida sem slot resolvido |
| `REGISTRO_NAO_ENCONTRADO` | 404 | id inexistente, ou objeto que o usuário não pode ler; a resposta é a mesma, para não confirmar que existe (v0.5, T4, item 13) |
| `OBJETO_SEM_PERMISSAO` | 403 | o usuário lê o objeto, mas a regra de `comum/regras-objeto.ts` não o deixa escrever (v0.5, T4) |
| `URL_FORA_DAS_FONTES` | 422 | URL cujo host não pertence a fonte ativa nem aos hosts fixos do código; nenhuma requisição é feita (v0.5, item 11; 8.2) |
| `FONTE_CONFIG_INVALIDA` | 422 | `url_base` ou `cabecalhos` de `fontes_portal` fora da regra da 8.2; `detalhes` lista uma linha por campo (v0.5) |
| `COLETA_PAUSADA` | 409 | ação manual de coleta com `coleta_ativa = false` (v0.5, item 14) |
| `COLETA_TIMEOUT` | 504 | ação síncrona de uma página passou de 20 s, contando os redirecionamentos (v0.5, T5) |

**Erros de plataforma que a tela traduz (v0.4).** Não são da app, mas chegam a ela e a tela os
mostra com texto próprio, lendo `e.status` e `e.codigo` do `Error` de `urbiVerso.api()`:

| Código | HTTP | Origem | O que a tela diz |
|---|---|---|---|
| `CORPO_MUITO_GRANDE` | 413 | parser do shell, corpo acima de 100 KB (C-78) | "geometria grande demais para enviar desenhada; importe como arquivo" |
| `URL_INVALIDA` | 400 | percent-encoding inválido no caminho (C-77) | erro genérico com o código |
| `DADOS_ARQUIVO_MUITO_GRANDE` | 413 | upload acima do cap da coluna ou da instância (C-35, C-38) | o tamanho máximo aceito e que o cap é da instância |
| `ARQUIVOS_UPLOAD_EXPIRADO` | 410 | `upload_id` com mais de 10 min (C-38) | "o envio expirou; envie o arquivo de novo" |
| `ARQUIVOS_UPLOAD_DE_OUTRO_USUARIO` | 403 | `upload_id` de outra sessão (C-38) | erro genérico com o código |
| `AUTH_TOKEN_SOMENTE_LEITURA` | 403 | token de agente somente leitura em mutação (C-55) | "este token só lê" |
| `AUTH_METODO_NAO_PERMITIDO` | 405 | método fora do contrato método → nível (C-51) | erro genérico com o código |
| `DADOS_VALOR_INVALIDO` | 422 | violação de `CHECK` (`23514`) que o invólucro `rota()` traduz (v0.5, T2) | o campo e a regra violada |

Rotina que falha devolve `{ ok: false, erro: <mensagem> }`, nunca só `ok: false` (C-30).

---

## 7. Rotinas

Todas exportadas em `export const rotinas`, idempotentes, com orçamento de tempo
(`orcamento_rotina_ms`, padrão 10 min) abaixo do corte de 15 min do shell. Toda execução cria
uma linha em `coletas` no início e a fecha no fim (`sucesso`, `parcial` quando o orçamento
acabou antes do lote, `falha`, `pausada` quando `coleta_ativa` está desligado, `adiada` quando a
trava da classe estava ocupada; v0.5). O retorno ao shell é `{ ok: true, resultado: { resumo,
...contadores } }`, e a falha devolve `{ ok: false, erro: <mensagem> }` (C-30). No corte de
15 min o shell registra falha por timeout **sem avisar o handler**, que segue em segundo plano:
quem fecha a `coleta` como `interrompida` é a execução seguinte (seção 5.4).

**O que o `ctx` da rotina tem (C-33, C-45).** `dados`, `eventos`, `arquivos`, `ia`, `parametros`
(só leitura), `shell`, `notificacoes`, `slack` e `email`, sem usuário. **Não tem relógio nem
fuso**: "hoje", "ontem" e o mês corrente são calculados com `Date.now()` do processo e o
parâmetro `fuso_organizacao`, por `intervaloDoDia(data, fuso)` do SDK (D-84). Não tem `definir`:
estado de rotina mora em `cursores_rotina`.

**CPU (v0.5, item 12).** A rotina roda no mesmo processo do shell e das outras apps: laço acima
de 1 000 itens cede ao event loop (`await cederAoLaco()`), e nenhum trecho síncrono passa de
~50 ms. É a rotina, e não a rota, que faz o que varre a cidade inteira (Gi*, lacunas comerciais
por célula, `celula_metricas`, quantis de classe, achados) e grava o resultado para a rota ler
(seção 6).

**Quando a rotina roda (C-05, C-31).** O shell dispara o slot agendado uma vez por cadência, na
hora cheia que o admin escolheu, e não o repete. Execuções extras no mesmo dia existem e não são
erro: "Rodar agora" (só o admin da app; conta como execução e não é bloqueado), catch-up depois
de indisponibilidade (uma execução imediata no boot, possivelmente fora do horário escolhido),
re-tentativa enquanto a app está insalubre e a própria continuação. Todas **retomam do cursor**,
nunca reiniciam o lote, e gravam `disparo` em `coletas` (`agendado`, `manual`, `continuacao`).

**Trava por classe e grade de horários (v0.5, item 15).** O catch-up dispara juntas, no boot,
todas as rotinas que perderam o slot, e o advisory lock do shell é por rotina, não entre rotinas.
Por isso a trava de `cursores_rotina` tem **classe** (seção 5.4): `coleta` (`verificar_anuncios`,
`descobrir_anuncios`, `verificar_lancamentos` e as continuações delas) e `carga` (`fechar_mes`,
`carregar_dados_publicos`, `recalcular_derivados`, `calcular_achados`, `agrupar_anuncios`). No
máximo uma execução por classe ao mesmo tempo, com o mesmo compare-and-set da D-85. Quem não
obtém a trava da classe não falha: grava a `coleta` com o `disparo` e status `adiada`, agenda
`continuar_coleta` para +10 min e devolve `{ ok: true, resultado: { resumo: "adiada: <rotina> em
curso" } }`. As rotinas `leve` (`verificar_frescor`, `limpar_retencao`,
`vincular_empreendimentos`, `carregar_series_macro`, `gerar_analises_mensais`, que só enfileira)
ficam fora da trava de classe. O default de fábrica do shell é 06:00 UTC para todas, o que poria
as treze no mesmo slot: o README da app traz a **grade sugerida**, em horas cheias distintas no
fuso da organização (01h `descobrir_anuncios`, 02h `verificar_anuncios`, 03h `agrupar_anuncios`,
04h `verificar_lancamentos`; mensais no dia 1: 05h `fechar_mes`, 06h `carregar_series_macro`,
07h `calcular_achados`, 08h `gerar_analises_mensais`), e a fase 0 a aplica na aba Rotinas.

**Fatiamento e continuação (D-85, C-13, C-32).** A rotina adquire a trava em `cursores_rotina`
(seção 5.4), lê o cursor, processa até o orçamento acabar ou o lote esgotar, grava o cursor a
**cada fatia** com compare-and-set na `versao` (nunca só no fim) e devolve `parcial` quando sobrou
trabalho. A continuação é um evento agendado:
`ctx.eventos.agendar("continuar_coleta", { rotina, coleta_id }, { em: new Date(Date.now() + 120_000) })`,
escutado por `reagir`, até o lote do dia esgotar. `em` é uma `Date` absoluta, a granularidade é de
minuto (dispara entre 2 e 3 min depois) e a entrega é **pelo menos uma vez**: duas fatias podem
partir do mesmo cursor, por isso o listener adquire a mesma trava da rotina e relê o cursor antes
de agir. O evento `continuar_coleta` é declarado em `eventos` e, como todo evento de app, é
**visível**: aparece em Preferências e quem tem `leitura` pode segui-lo; ele só é publicado quando
há continuação, e o texto é escrito para quem opera (seção 13). O `id` devolvido por `agendar`
vai para `cursores_rotina.agendamento_id`. O listener captura o próprio erro: fecha a `coleta`
como `falha` com a mensagem e não relança (T2). O operador sem `admin` não tem "Rodar agora"; ele
usa as ações que a app expõe por rota (`POST /buscas/:id/executar`, `POST /anuncios/:id/verificar`,
`POST /dados-publicos/carregar`; D-91, T5). A v0.4 citava aqui `POST /fontes/:id/verificar`, que
não existe na seção 6.

**Parar a coleta (v0.5, item 14).** O toggle da aba Rotinas é o off-switch de **uma** rotina:
desativada, ela não agenda, mas as continuações já agendadas acordam do mesmo jeito (o listener
`reagir` roda independente do toggle). O off-switch de todas é o parâmetro `coleta_ativa` (seção
4.3). Toda rotina de coleta externa (`verificar_anuncios`, `descobrir_anuncios`,
`verificar_lancamentos`, `carregar_dados_publicos`, `carregar_series_macro`) e o listener
`continuar_coleta`, quando a continuação é de uma delas, leem `coleta_ativa` no início de **cada
fatia**; desligado, fecham a `coleta` como `pausada`, devolvem
`{ ok: true, resultado: { resumo: "coleta pausada (coleta_ativa = false)" } }` e **não
reagendam**. Desligar não precisa cancelar o agendamento pendente: a fatia que acordar sai sem
agir. As rotas manuais de coleta respondem `409 COLETA_PAUSADA` (seção 6). Precedente: nobi e
charles3 usam parâmetro `bool` conferido na hora da execução, no listener e na ação manual.

**Transação por lote (C-24, C-25).** Não existe inserção em lote em `req.dados`: o lote de 500
linhas é um laço de `criar`/`criarOuAtualizar` dentro de `transaction()`, e o orçamento conta com
isso. Dentro da transação não há chamada HTTP nem de IA: coleta e parse acontecem antes, a
gravação depois.

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
operador clica "Executar agora" na busca, que pede a leitura por evento e responde `202` (seção
6.3, T5); o listener lê só aquela busca, com a trava da classe `coleta`. Aprovar um candidato é
síncrono na rota.

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

1. Determina o mês anterior `M` no fuso `fuso_organizacao` (D-84). Como o catch-up pode rodar fora
   do dia e da hora escolhidos, confere que `M` já terminou nesse fuso antes de fechar; se a
   execução cair antes da virada (relógio adiantado, "Rodar agora" no último dia), termina sem
   gravar (C-31).
2. Para todo anúncio que estava ativo em algum dia de `M`, ou ficou inativo em `M`, ou nasceu em
   `M`: grava ou reescreve `anuncio_retratos(M)` com o estado ao fim de `M` e marca
   `congelado = true`. Linha já congelada não é reescrita (idempotência).
3. Recalcula `metricas_anuncios_mensais` de `M` e de `M-1` (porque `variacao_*_mom_frac` de `M`
   depende de `M-1` e `M-1` pode ter recebido anúncio atrasado): grupos por
   `(localidade | todas) × (tipo_imovel | todos) × tipo_transacao × (quartos | todos) × faixa_area`,
   sobre os retratos com `status_fim_mes = ativo`. Mediana e percentis em código
   (`backend/metricas/`), com a mesma função que a rota `/anuncios/kpis` usa. `amostra_n` é o
   tamanho da amostra de preço; grupo sem preço grava `null` nas estatísticas, nunca zero.
   A supressão por amostra (seção 5.1, item 21) vale na gravação: mediana só com n ≥ 5, P25/P75
   e dispersão só com n ≥ 10, `variacao_*` só com n ≥ 20 nos dois meses; abaixo, `null` com o
   motivo `amostra_pequena` e o `n`. As `variacao_*` são calculadas só sobre anúncios de buscas
   do **painel** ativas em `M` e `M-1` (item 22); a mediana de todos os anúncios é nível, nunca
   variação.
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

Regras de arquivo que a conferência fixou (C-35, C-37):

- **Um arquivo por vez, do começo ao fim:** baixa → confere `sha256` e `bytes` →
  `ctx.arquivos.enviar` → `criar` a linha de `conjunto_arquivos` **na mesma iteração**. O
  `upload_id` vale 10 min, então nunca "sobe todos e grava no fim".
- `enviar` aceita só `Buffer`: o arquivo inteiro passa pela memória do processo, que é o mesmo
  do shell e das outras apps. A rotina mantém um arquivo por vez em memória e solta a referência
  antes do próximo. O bundle não documenta limite de memória da rotina nem o cap global de
  arquivo; `DADOS_ARQUIVO_MUITO_GRANDE` vindo do `enviar` falha o conjunto com mensagem que cita
  o cap da instância (R-43).
- O teto de arquivo é **do pipeline, não da app** (v0.5, T14): `[manifest] arquivo_max_bytes` em
  `config/df.toml` (padrão 50 MB, nunca acima do cap medido na Pinguim na fase 0), e o validador
  do pipeline reprova `budget_bytes` maior que ele, além do arquivo maior que o próprio
  `budget_bytes`. Shard que estoura é erro de build do pipeline, consertado fatiando mais
  (sub-shard `RA_xx_1`, `RA_xx_2`, mesmo `shard_value`); nunca se publica acima. `detail_shard`
  por RA já fatia. A app não tem parâmetro de tamanho de arquivo.
- A leitura do arquivo guardado é em fluxo (`caminho_fs` do `ler`), nunca por buffer inteiro.

Na v0.2 o manifest passa à versão 2 (D-49): além dos arquivos GeoJSON (`overview`, `detail`,
`detail_shard`, `data`), um conjunto pode trazer arquivos com `role: "tabela"`, em CSV, com
`tabela_destino` (`celulas`, `celula_metricas`, `localidade_composicao`, `pontos_comerciais`) e
`chave_natural`. A rotina carrega a tabela em lotes de 500 linhas, por cursor (arquivo e linha),
com `criarOuAtualizar` pela chave natural, grava com a `versao_conjunto` nova e só então remove as
linhas da versão anterior daquele conjunto com
`deletarVarios(tabela, { filtros: { conjunto_codigo, versao_conjunto: <anterior> } })`, para a
tela nunca ver o conjunto pela metade. O delete por filtro existe, então não há ponteiro de
versão ativa (C-24, C-28). A app continua aceitando o manifest 1.

### 7.6 `gerar_analises_mensais` (mensal, agendada pelo admin para depois do `fechar_mes`)

Seção 9. Gera a análise de **mercado** da cidade e uma análise de **território** por localidade
que tenha ao menos `analise_minimo_meses_historico` meses de métricas de anúncios **ou** série
FipeZap própria. A rotina **enfileira, não espera** (D-82, C-80): para cada análise cria a linha
de `analises_ia` em `gerando` e chama `ctx.ia.consultarAsync` com o callback
`analise_concluida`; o listener grava o resultado. Assim o orçamento de 15 min só paga o
enfileiramento. Quem chama o provedor é o worker assíncrono do shell, que confere o limite de
chamadas por minuto da app antes de cada chamada e trata o estouro como `RATE_LIMIT` retentável
no próprio backoff; pausa dentro da rotina não controla esse ritmo (ia.md, modo assíncrono). Por
isso a rotina enfileira **no máximo `ia_lote_por_fatia` análises por fatia** (parâmetro, padrão
8) e agenda a próxima fatia por `continuar_coleta` em +2 min, deixando folga para os pedidos de
usuário no mesmo minuto (v0.5, item 19). O limite é **por app** e é do admin da app (Config › IA
› Configurações, 1 a 600); a fase 5 o sobe para 30 na instalação. Falha de uma análise não
impede as outras; cada falha publica `erros.analise_falhou`.

**Guarda da cadeia mensal (v0.5, item 16).** Antes de começar, confere que `fechar_mes` e
`calcular_achados` de `M` concluíram (C-36). A guarda não espera um mês: na primeira vez que acha
a pré-condição falsa, devolve `ok: true` com o resumo "aguardando <rotina> de M" e agenda
`continuar_coleta` para +60 min; repete até 6 vezes, contadas em `cursores_rotina`, o que cobre o
catch-up fora de ordem. Esgotadas as tentativas, ou se já passaram mais de 3 dias do fim de `M`,
devolve `{ ok: false, erro: "cadeia mensal parada: <rotina> de M não concluiu" }` e publica
`erros.cadeia_mensal_parada` (seção 13, severidade alta). Com `ok: true` a aba Rotinas mostraria
`OK` e a rotina mensal só voltaria no mês seguinte, escondendo o mês perdido; com `ok: false` ela
mostra `Falhou`, e a aba Saúde da Operação (`GET /operacao/saude`) mostra o elo parado
(precedente: charles3, `consulta_djen_falhou` com `ok: false`).

Na v0.2, também uma análise de **área** por área de estudo com `tipo = propria` e `estagio`
diferente de `encerrada`, e sempre depois de `calcular_achados` do mesmo mês.

### 7.7 `agrupar_anuncios` (diária, depois da descoberta)

Para cada anúncio ativo criado ou com preço alterado desde o cursor, procura os candidatos a
mesmo imóvel pela regra de `anuncio_grupos` (filtro por localidade, tipo, transação e quartos via
`req.dados`, tolerâncias em código), cria ou amplia um grupo `sugerido` com a `confianca`, e
nunca mexe em grupo `confirmado` nem `descartado`. Condição de grupo (v0.5, item 31): fonte
diferente, **ou** mesma fonte com `id_externo` diferente (outro anunciante no mesmo portal gera
outro código); anunciante não é guardado (D-74). Um grupo só conta como **um imóvel** sem
curador quando os dois anúncios têm coordenada exata a ≤ 30 m, área igual a ±1 m² e preço a
±2%; qualquer outro só conta depois de `confirmado` (com todos os anúncios por jitter, a
checagem de distância nunca passa, e plantas idênticas no mesmo prédio casariam unidades
diferentes). Resumo: grupos sugeridos, anúncios envolvidos, grupos que contam sem revisão.
Idempotente: rodar de novo não cria grupo repetido.

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
da coleta (seção 8.2), pelo `fetch` global; se `api.bcb.gov.br` sai ou não pelo proxy de egresso é
decisão do admin da instância, por host (D-79).

### 7.10 `calcular_achados` (mensal, depois de `fechar_mes` e `carregar_series_macro`)

Calcula, para o mês `M`, os achados da seção 9.7 em quatro recortes: a cidade, cada localidade,
cada área de estudo não encerrada e as células (só os tipos `bolsao` e `lacuna_comercial`). É
aqui, e não na rota, que o Gi* e as lacunas comerciais por célula são calculados (item 12). Apaga
e regrava os achados de `M` (idempotente). Fatiada por recorte, com cursor, e cedendo ao event
loop a cada 1 000 células.
Guarda: se o `fechar_mes` de `M` não terminou com `sucesso`, a rotina não calcula e segue a
guarda da cadeia mensal da 7.6: `ok: true` com "aguardando fechar_mes de M" e nova tentativa em
+60 min, até 6 vezes; depois `ok: false` e `erros.cadeia_mensal_parada` (v0.5, item 16; R-21).
Na fase 4C a rotina entra só com o tipo `condicao_em_risco`, que alimenta o Início mínimo; os
demais tipos entram na fase 5 (v0.5, item 40).

### 7.11 `recalcular_derivados` (mensal, e "Rodar agora" do admin da app)

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
faz requisição externa. Também **reconcilia as inscrições** de `lacuna_cadastro` com o papel
`curador` (seção 13), como o `aoIniciar`: o shell não avisa a app quando um papel é concedido ou
revogado (C-49).

### 7.13 `limpar_retencao` (semanal)

Apaga `cache_calculos` expirado, `uso_eventos` além de `uso_retencao_dias` e o campo `bruto` de
candidatos `rejeitado` além de `bruto_rejeitados_retencao_dias` (a linha do candidato fica, para a
deduplicação continuar funcionando). Apaga também os **arquivos de conjunto substituído** há mais
de 30 dias: `deletarVarios("conjunto_arquivos", { filtros: { conjunto_id } })` dentro de
`transaction()`, que leva os blobs junto; nunca `req.arquivos.remover`, que recusa coluna
obrigatória com `409`. A linha de `conjuntos_publicos` fica, com `hash_conteudo`, para a
reprodutibilidade (seção 21.6; C-41).

---

## 8. Coleta nos portais

### 8.1 Postura

A coleta lê páginas públicas de anúncios, com identificação honesta (`User-Agent` nomeado), uma
requisição por vez por host, pausa mínima configurável, e nunca tenta contornar captcha nem
login. Bloqueio é **estado**, não erro: fica registrado por fonte e por anúncio, aparece na
tela de Operação, e não inativa anúncio. É a mesma postura do `Code.gs`, transcrita.

A postura é técnica. Ainda não se validou se a coleta automática é compatível com os termos de
uso de cada portal (DFImoveis, QuintoAndar, Wimoveis, Imovelweb, VivaReal)
[PENDENTE P-45].

### 8.2 Cliente HTTP

`backend/coleta/cliente.ts`, com o `fetch` **global** do Node 20, sem `dispatcher` próprio e
sem `undici` (D-79):

- Timeout de 20 s por requisição. Na ação síncrona de uma página (seção 6.3), os 20 s são o
  total, contando os saltos de redirecionamento. Corpo lido **em fluxo** até 2 MB e cortado ali.
- **Guarda de destino (v0.5, item 11).** Uma requisição da app sai com a rede do servidor da
  instância, porque todas as apps rodam no processo do shell (guia de desenvolvimento § 8). Por
  isso a coleta só busca URL cujo host pertence a uma fonte ativa. A lista vem de
  `fontes_portal.url_base`: host exato, ou também os subdomínios quando `url_base` declara o host
  com ponto inicial. Somam-se os hosts fixos do código (`raw.githubusercontent.com`,
  `api.bcb.gov.br`). A guarda vale para `POST /anuncios/por-url`, `/anuncios/:id/verificar`,
  `/lancamentos/:id/verificar`, `/candidatos/:id/reler`, `/fontes/:id/diagnosticar`, rotinas e
  buscas. Fora da lista: `422 URL_FORA_DAS_FONTES`, sem requisição. Só `http` e `https` na porta
  padrão. Host que é IP literal, `localhost` ou que termina em `.local` ou `.internal` é recusado,
  e já ao salvar `url_base` (`422 FONTE_CONFIG_INVALIDA`). Precedente: nobi, integração Twilio,
  que só busca mídia do domínio do Twilio. O contraexemplo a não seguir é a busca de URL
  arbitrária com `redirect: 'follow'`.
- **Redirecionamento manual.** `redirect: 'manual'`, até 2 saltos, e cada `Location` passa pela
  mesma guarda. Salto para host fora da lista não é seguido: vira `erro` com a mensagem
  `redirecionamento_externo`.
- Cabeçalhos: `User-Agent` do parâmetro, `Accept: text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8`,
  `Accept-Language: pt-BR,pt;q=0.9`, mais `fontes_portal.cabecalhos`. Esse campo aceita só nomes
  de uma lista fechada (`Accept`, `Accept-Language`, `Referer`). `Host`, `Cookie`,
  `Authorization`, `Proxy-*` e qualquer outro nome são recusados ao salvar
  (`422 FONTE_CONFIG_INVALIDA`).
- Teste: tabela-verdade da guarda com host da fonte, subdomínio declarado e não declarado, IP
  literal, `localhost`, porta não padrão e redirecionamento para fora.
- **Proxy de saída é da instância (D-79, C-34).** O shell tem um proxy de egresso declarativo
  por host: o administrador da instância (alçada `sistema`, Admin › Variáveis) lista os hosts que
  saem por um proxy HTTP, e a regra vale para o `fetch()` global. Um `dispatcher` explícito da app
  **ignora** essa regra, por isso o cliente não tem um. A app não guarda credencial de proxy nem
  decide nada: se a medição na Pinguim mostrar bloqueio (seção 8.4), a equipe pede ao admin da
  instância que inclua o host. O README da app lista os hosts candidatos: os dos portais em
  `fontes_portal.url_base`, `raw.githubusercontent.com` (manifest público) e `api.bcb.gov.br`
  (séries macro). O bundle não documenta restrição de egresso da instância (R-39).
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

**CPU do parser (v0.5, item 12).** O parser recebe no máximo os 2 MB que o cliente leu (8.2).
Expressão regular sem quantificador aninhado (`(a+)+`, `(.*)*`) nem alternância ambígua sob
quantificador, para não abrir ReDoS no processo do shell. Cada parser tem um teste com uma
fixture de 2 MB que falha acima de 200 ms.

**`bruto` é dado, não HTML (v0.5, T3).** `bruto`, o HTML de portal e o JSON de diagnóstico nunca
são renderizados como HTML: a tela os mostra em `urbi-navegador-json` ou em `<pre>` com
interpolação Lit (seção 10.1). URL extraída da página passa por `urlSegura()` antes de gravar
(seção 6).

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
estado, a razão e a data, e é esse painel que fundamenta o pedido ao admin da instância para
pôr o host no proxy de egresso (D-09, revista pela D-79).

**"Uma vez por transição" é deduplicação da app (C-50).** O barramento só deduplica por usuário
e evento na entrega; não coalesce eventos por chave nem por janela. A rotina compara o estado
anterior com o novo **na mesma transação** que grava o estado, com `atualizarSe` condicionado ao
estado anterior, e só publica o evento depois do `COMMIT` e se a escrita teve efeito: duas
execuções concorrentes não publicam duas vezes. Vale também para `parser_degradado` (8.4.1). Como
`erro.*` só é visível ao admin da app, o estado das fontes é sempre também **estado em tela**.

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
| URL válida e canônica, `http(s)`, host de fonte ativa | duro | a guarda de destino da 8.2 |
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
failsafe; a app só nomeia o slot). Slot custom só tem configuração própria por override local do
admin da app; sem override ele é a base, e por isso a **autorização dos slots-base `poder` e
`barato` para a app**, pelo admin da instância, é pré-requisito da instalação (C-06; seção 4.1).
O slot opcional `extracao_pagina` usa `barato`, que não tem cascata: sem `barato` configurado o
fallback falha em vez de cair para `normal`.

| Tipo | Slot | Recorte | Quando |
|---|---|---|---|
| Território | `analise_territorio` | uma localidade, no mês de referência, com todo o histórico | rotina mensal para toda localidade com dado suficiente; botão na tela de Diagnóstico e no bloco da localidade no Mapa |
| Mercado | `analise_mercado` | a cidade, no mês de referência, com todo o histórico | rotina mensal; botão na tela de Mercado |
| Recorte em tela | `analise_tela` | os filtros que o usuário está vendo (Mapa ou Mercado) | só por botão [PENDENTE P-46] |
| Área de estudo | `analise_area` | uma área de estudo, no mês, com os anéis dela | rotina mensal para as áreas próprias ativas; botão no dossiê e na ficha, só para quem lê a área (9.5) |

### 9.2 Contexto entregue ao modelo

Montado por `backend/ia/contexto.ts`, sempre com a mesma forma: um cabeçalho com o recorte e a
data, e blocos de indicadores em JSON compacto (chave, valor, unidade, período, fonte, `n`
quando é amostra). **Nada de texto de página de portal, nada de linha crua de anúncio.**

**Regras de método no contexto (v0.5, itens 21 e 22).** O contexto usa a mesma função das rotas
(seção 6). Valor suprimido pela regra de amostra (seção 5.1) vai como `null`, com o motivo
`amostra_pequena` e o `n`, nunca como número. Variação de oferta (mês contra mês, 12 meses,
crescimento de oferta) vem só do painel de buscas ou do `indice_oferta_mensal`; a mediana bruta
de todos os anúncios entra como nível. Ainda não se validou o uso de IVV e FipeZap no contexto
enviado ao provedor [PENDENTE P-45].

Os blocos, por tipo:

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
  perfil PDAD, estatísticas de anúncios suprimidas por amostra pequena), para o modelo declarar
  em vez de inventar.

**Mercado** (cidade `C`, mês `M`): IVV mensal inteiro (todas as 13 métricas, 2021 em diante),
os seis derivados por período (mês, trimestre, ano e acumulado), sazonalidade do IVV, IVV
regional do último retrato (ranking e matriz preço × liquidez), FipeZap total venda e locação
(2011 em diante, com yield e variações), métricas de anúncios da cidade por tipologia (36
meses), ranking de localidades por preço/m² e por crescimento de oferta em `M` (do painel,
item 22), lançamentos por estágio, lacunas.

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

A chamada é `consultar`/`consultarAsync` com `{ contexto, schema, instrucoes_sistema, slot }`; a
saída estruturada por JSON Schema é contrato (`OpcoesConsultaIA.schema`), então não há "pedir
JSON no texto". O framework deriva `required` dos campos com `default`; a app declara os dois
para não depender da derivação (C-42).

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

Cada geração grava uma linha nova em `analises_ia` (em `gerando`, completada pelo listener
`analise_concluida`; D-82) e aponta a anterior do mesmo recorte e mês em `substituida_por_id`
quando fica `pronta`. A tela mostra a vigente e permite ver as anteriores. `tokens_entrada`,
`tokens_saida` e `modelo` vêm literalmente da `RespostaIA` (C-44), para a tela de Operação somar
custo por mês; o provedor não vem e fica no histórico de IA do shell.

**Tetos da plataforma (C-42).** Entrada até 512 KB por chamada (os 15 a 30 mil tokens de uma
análise de território, ≈ 60 a 120 KB, cabem; o corte de séries da seção 9.2 e
`analise_minimo_meses_historico` mantêm o contexto bem abaixo disso); saída até 16 000 tokens,
fixo (modelo com teto menor recusa com `MODELO_INVALIDO`); timeout padrão de 120 s, que o admin
da app ajusta de 1 a 600 s em Config › IA › Configurações; limite de chamadas por minuto **por
app**, padrão 10, que o admin da app ajusta de 1 a 600 no mesmo lugar. A fase 5 o sobe para 30
na instalação (passo do checklist), e a rotina mensal limita o próprio ritmo por
`ia_lote_por_fatia` (seção 7.6), deixando folga para os pedidos de usuário (v0.5, item 19). As consultas de análise **não** ligam `cache` (o contexto é sempre diferente, e
assim o prompt não fica retido no provedor; seção 22.2).

Orçamento de referência (para o admin calibrar os slots): uma análise de território consome na
faixa de 15 a 30 mil tokens de entrada e 1,5 mil de saída; a rotina mensal, com 35 localidades
mais a de mercado, fica em torno de 1 milhão de tokens de entrada por mês. Na v0.2, cada área própria ativa
soma uma análise de área na mesma faixa de uma de território; os achados entram no lugar de parte
das séries, e o contexto de território e de mercado tende a encolher. É aceitável no slot
`poder` mensal; não é aceitável por clique sem controle, por isso o botão de "gerar agora" é
`escrita` e a tela avisa quando já existe análise do mês para o recorte.

**Sigilo da análise de área própria (v0.5, item 13).** A análise de uma área `tipo = propria`
herda o sigilo da área (seção 6): só quem tem `estrategico` ou `curador`, ou é o
`responsavel_id`, a pede, a vê na lista e a abre; para os demais o detalhe responde `404`. O pedido
grava `area_eventos` com o usuário; a gerada pela rotina grava o evento sem usuário. O contexto
segue a seção 22.2 e a R-38: nenhum dado pessoal, e a retenção pelo provedor fica sob a política
do contrato do admin da instância com ele. Área própria real só existe na Laputa; na Pinguim, a
análise de área roda sobre áreas de prospecção, referência ou fictícias.

### 9.6 Quando não gerar

Sem slot resolvido (`EstadoSlotIA.efetivo === null`): botão escondido, rotina pula com resumo
"slot não configurado". Sem failsafe (`backup === null`): a tela avisa que uma queda de cota
derruba a chamada (C-43). Recorte com menos de `analise_minimo_meses_historico` meses de qualquer
série: a rotina pula a localidade e a tela mostra "histórico insuficiente"; o botão manual
continua disponível, com o aviso.

Códigos de falha da plataforma e o tratamento (C-42): em todos, nada é gravado em `texto` e a
linha fica `falhou` com `codigo_erro`.

| Código | Tratamento |
|---|---|
| `ENTRADA_MUITO_GRANDE`, `JANELA_EXCEDIDA` | erro da app: o contexto passou do teto; não publica `analise_falhou`, abre achado de qualidade para corrigir o corte |
| `RESPOSTA_TRUNCADA` | a resposta passou de 16 000 tokens; publica `erros.analise_falhou` |
| `RATE_LIMIT` | não é falha (v0.5, item 19): no modo assíncrono o worker do shell retenta no próprio backoff, e a linha fica `gerando` mais tempo; a tela mostra "na fila" com a hora do pedido. A rotina não pausa: ela já limita o lote por `ia_lote_por_fatia`. Só vira `falhou` se o worker esgotar as tentativas |
| `SLOT_NAO_CONFIGURADO` | como "sem slot resolvido" acima |
| falha do provedor | `erros.analise_falhou` |

### 9.7 Camada de achados determinísticos (D-21)

No modelo do Tableau Pulse: a app detecta, ranqueia e escreve uma frase curta em código; a IA lê
e interpreta. Os tipos, todos calculados por `comum/achados.ts` sobre métricas do catálogo:

| Tipo | Regra | Recortes |
|---|---|---|
| `variacao_periodo` | variação de `M` contra `M-1` e contra `M-12`; em métrica de oferta, só sobre anúncios do painel ou pelo `indice_oferta_mensal`, e só com n ≥ 20 nos dois meses (v0.5, itens 21 e 22) | cidade, localidade, área |
| `mudanca_incomum` | valor de `M` fora de [P10, P90] dos últimos `achado_janela_meses` (mínimo 12 pontos); em métrica de oferta, sobre o painel ou o índice (item 22) | cidade, localidade, área |
| `maior_contribuidor`, `maior_detrator` | localidade ou tipologia que mais moveu a métrica da cidade no mesmo sentido ou no oposto | cidade |
| `destoa_cidade` | recorte fora de [P25, P75] das localidades no mês; em métrica de oferta, só entre localidades com `qualidade_cobertura = boa` (item 22) | localidade, área |
| `lacuna_produto` | célula da matriz com descompasso de **composição** `descompasso_pp` ≥ 10 pontos percentuais, rotulado "composição, não quantidade" (v0.5, item 26; seção 5.17) | localidade, área |
| `lacuna_comercial` | gasto potencial por estabelecimento na **bacia** da categoria (`raio_bacia_m`) ≥ `lacuna_comercial_razao_min` × mediana da cidade; só células habitadas com gasto ≥ P25 da cidade; célula sem estabelecimento na bacia é "sem oferta", fora da razão (v0.5, item 30) | localidade, área, célula |
| `bolsao` | Gi* só sobre células habitadas, com significância por FDR de Benjamini-Hochberg (q = 0,05) no lugar de \|z\| ≥ 1,96 fixo, e só para grupo de ≥ 3 células contíguas significativas; Gi* de preço desligado até haver ≥ 200 células com ≥ 5 imóveis (v0.5, item 30; seção 5.18) [PENDENTE P-46] | célula |
| `pipeline_pressao` | meses de absorção futura acima da mediana das localidades; absorção `null` não gera achado, e alvará antigo sem habite-se fica fora do pipeline (v0.5, item 27; seção 5.15) | localidade, área |
| `terra_agio` | ágio mediano das licitações do ano, por localidade × `destinacao_categoria`, acima do P75 das localidades na mesma categoria; `outra` nunca entra (v0.5, T12) | localidade |

**Pontuação** (D-68) = |z| × peso do tipo × fator de amostra × fator de qualidade, onde:

- `z` é o desvio em unidades de dispersão robusta: para séries, a variação do mês dividida por
  1,4826 × MAD das variações da janela; entre recortes, a distância à mediana das localidades
  dividida por 1,4826 × MAD entre localidades; para lacunas, a própria diferença dividida pelo
  limiar do tipo;
- fator de amostra = min(1, √(n ÷ 30)), com `n` = `amostra_n` da métrica (1 para métricas sem
  amostra); métrica suprimida pela regra de amostra (seção 5.1) não gera achado (v0.5, item 21);
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

**Na fase 4C (v0.5, item 40)** `calcular_achados` entra só com o tipo `condicao_em_risco`, que
alimenta o Início mínimo (condições vencidas e diligências da semana); os demais tipos entram na
fase 5. Achado de área própria herda o sigilo da área (seção 6): some de `/achados`, do Início e
de quem não lê a área, e nunca entra no contexto das análises de cidade ou de localidade, que
todos leem.

---

## 10. Telas (`frontend/`)

### 10.1 Regras gerais de UI

- Toda tela é composta de primitivos `urbi-*` e tokens semânticos. Nenhum CSS estrutural, nenhum
  literal de cor (C-59). O que o catálogo não cobre entra no **registro de exceções da app**,
  `docs/ui-excecoes.md`, numa tabela de três colunas (Superfície · Por quê · O que pode), **no
  mesmo PR** do HTML; sem linha no registro não é exceção, é violação, e o que for reutilizável
  vira pedido de primitivo `urbi-*`, não HTML da app (C-58). Linhas previstas: a **legenda** com
  amostras de cor (o `urbi-mapa` não tem legenda nativa e trata a cor da feição como dado do
  consumidor; C-67, D-94) e a **dispersão** (componente de domínio). A régua P25–P50–P75 **não** é
  exceção: `urbi-grafico-medidor` a exprime com `min` = P10, `max` = P90, `faixas` em
  P25/P50/P75/P90 e `valor` = o preço do anúncio (fora do intervalo a agulha grampeia e o texto
  mostra o valor real; C-57).
- Layout: `urbi-shell-page` como raiz de cada tela; `urbi-inbox` para lista + detalhe (no celular
  ele alterna os painéis); `urbi-2x1`/`urbi-3-colunas` para mapa + painel (a largura do `urbi-2x1`
  é por preset: `igual`, `estreito`, `mediano`, `largo`); `urbi-abas` para sub-telas, inclusive as
  das áreas do `nav` (D-86); `urbi-grid min="140px"` para KPIs; `urbi-stack` para blocos
  empilhados.
- Dados: `urbi-tabela` com filtros por coluna (`texto`, `select`, `toggle`, `custom`; a tabela só
  emite `urbi:tabela-filtro`, e a app refaz a consulta); **não há linha expansível**: clique na
  linha (`clicavel`, `urbi:tabela-click`) abre o detalhe no painel do `urbi-inbox`. `urbi-kpi`
  para destaques; `urbi-grafico-linha|area|colunas` para séries (várias séries, `empilhado`),
  `urbi-grafico-pizza` só com uma série; `urbi-mapa-de-calor` com `clicavel` e `urbi:mapa-click`
  para a matriz de comparação; `urbi-mapa` para tudo que é geográfico. Nada se constrói sobre o
  getter `mapaLeaflet`, que o bundle não aceita como base de construção (C-65).
- Estado na URL: a sub-rota identifica a tela; os filtros vão na querystring por
  `history.replaceState` montado com `urbiVerso.href(sub)`, sem `popstate` (refletir filtro não
  é navegar). A sub-rota vem do path (`urbiVerso.subRota()`, `escutarRota`); a querystring é
  lida de `window.location.search` (C-70).
- Links internos: todo `<a>` interno tem `href` montado por `urbiVerso.href(sub)` e um handler
  que chama `urbiVerso.navegarSub(sub)` no clique simples e não intercepta Ctrl, Cmd, Shift nem
  botão do meio — o shell não intercepta âncora. A `rota` gravada numa notificação é permanente:
  mover uma tela exige reescrita permanente da rota antiga no roteador da app (C-70). Vocabulário fechado de chaves, igual ao do site: `ra` → `localidade`, `type`,
  `beds`, `price_min`, `price_max`, `q`, `inativos`, `terr`, `terr_metrica`, `vias`, `de`, `ate`,
  `periodo`, `comparar`, `serie`, `regiao_modo`, `faixa`, `ano`, `tema`, `locality`, `mes`. Link
  colado abre a mesma visão.
  Rota desconhecida cai num `urbi-estado-vazio` "Página não encontrada" com link para Início
  (`/`); não redireciona em silêncio (v0.5).
- Estados: carregando (`urbi-loading`), vazio com motivo (`urbi-estado-vazio`), erro com
  `e.message` e `e.detalhes` em `urbi-banner variante="erro"`, e **ausência de dado** sempre
  como frase, nunca zero. Controle cuja fonte não existe fica desabilitado **com o motivo**
  (herdado da regra R8.64 do site).
- **Frases de ausência (v0.5).** Cada motivo de `null` da 6.21 tem uma frase fixa na tela, e o
  número nunca aparece com aviso ao lado:
  - `amostra_pequena`: "amostra pequena (n = 3; mediana pede 5)", com o `n` e o mínimo da regra
    (mediana n ≥ 5; P25/P75 e dispersão n ≥ 10; variação entre meses n ≥ 20 nos dois meses);
  - `fase_futura`: "disponível a partir da <entrega>" (ex.: "disponível a partir da coleta
    automática"), para bloco ou campo de tabela que ainda não existe (T10);
  - conjunto público ausente: "<conjunto> não carregado", nunca "sem restrição" nem "sem
    equipamento" (ex.: "restrições não carregadas");
  - seção da ficha cuja fonte é de fase posterior: omitida, com a linha "disponível com
    <entrega>" no lugar (ex.: "disponível com Comércio e âncoras").
- **Áreas próprias (v0.5).** Quem não tem `estrategico` nem `curador` e não é o `responsavel_id`
  da área nunca vê área `tipo = propria`: ela some de listas, portfólio, Início, achados, mapa
  (camada 13), comparações e exportações, sem contagem de ocultas, e o link direto cai no
  "Página não encontrada" (a rota responde `404`; seção 14).
- **Conteúdo de terceiro (v0.5).** Toda URL vinda de dado de terceiro (anúncio, fonte,
  procedência, conjunto) passa por `urlSegura()` de `comum/` ao gravar e ao renderizar: só
  `http`/`https`, senão `null`, e a tela mostra o texto sem link. Link externo abre com
  `target="_blank" rel="noopener noreferrer"`. O `bruto`, o HTML de portal e o JSON de
  diagnóstico aparecem em `urbi-navegador-json` ou em `<pre>` com interpolação Lit, nunca como
  HTML; `unsafeHTML` é proibido na app (teste estático procura a palavra em `frontend/`); texto
  da IA vai só por `urbi-markdown`.
- **Tags e registro (v0.5).** A raiz é `app-inteligencia-imobiliaria` (derivada do slug); toda
  outra tag leva o prefixo `intel-imob-` (o slug inteiro daria tags de 40+ caracteres). O
  registro passa por `definir(tag, classe)` de `frontend/registro.ts`, que só chama
  `customElements.define` quando `customElements.get(tag)` é `undefined`, para o "Tentar
  novamente" do shell reavaliar o bundle (`?r=N`) sem lançar. Um teste confere o prefixo de toda
  tag registrada.
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
- **Como ler (v0.3, D-77):** toda tela tem um botão "Como ler" que abre o texto de
  `comum/ajuda/<tela>.md` num `urbi-modal` com `urbi-markdown` (`.conteudo`): o que a tela mostra,
  o método, os limites e o que não concluir dela. Os `.md` viram `comum/ajuda/index.ts` no build
  (seção 3.1); o texto não usa imagem nem link relativo, só âncoras e links externos, porque link
  interno vira evento que a app teria de tratar e imagem não é garantida (C-72).
- **Natureza visível (v0.3):** todo item de síntese, condição e premissa mostra a natureza (fato,
  hipótese, premissa, decisão) como rótulo de texto, nunca só por cor.
- **Todo gráfico tem "ver tabela"** com os mesmos números (acessibilidade e conferência). O
  primitivo não oferece alternativa tabular (só `aria-label` e `<title>` por elemento; C-60), então
  é da app (D-94): um helper em `frontend/componentes/` monta um `urbi-tabela` com as mesmas
  `categorias` × `series` do gráfico, alternado por `urbi-botao-alternar`.

### 10.2 Mapa (`/mapa`)

Sucede a view Mapa.

**Layout:** `urbi-2x1` com o `urbi-mapa` expandido à esquerda e um `urbi-inbox` à direita
(filtros no topo, lista de resultados, detalhe ao clicar).

**Camadas (do fundo para a frente), todas `CamadaMapa` com `estilo` por feição vindo do dado:**

1. Território público: a coroplética ligada (domicílios **ou** empregos, rádio) com classes do
   `cortes_classe` do conjunto e cor por índice de classe (`properties.estilo.preenchimento`
   resolvido pelo tema no momento de montar a camada, pela mesma função da legenda: lê o token
   `--cor-*` com `getComputedStyle` uma vez por ciclo e reamostra quando `data-theme` muda; C-59);
   por padrão, **domicílios** ligados quando o conjunto existe.
2. Contornos das localidades (`limite_exibicao`): preenchimento sempre clicável. O
   `urbi:mapa-clique` entrega a **pilha inteira** de feições sob o ponto (`feicoes`, da frente para
   trás), e a app escolhe: com área pública ligada, a célula tem prioridade sobre o contorno (C-66).
3. Centralidade viária (linhas, caixa de seleção, convive com qualquer área); espessura e
   opacidade por percentil.
4. Eixos rodoviários do DER (`eixo_rota`), clicáveis: abrem o painel do trecho.
5. Contornos importados (`area_personalizada`).
6. Âncoras (pontos; marcador por grupo).
7. Lançamentos (só os com coordenada; `espacial_utilizavel`).
8. Anúncios (pontos, todos `marcador.forma = circulo`; cor por faixa de preço/m² do recorte,
   declarada na legenda; **precisão por atributo de canvas**: aproximada com
   `opacidadePreenchimento` baixa e `tracejado`, exata cheia e com `contorno`). `losango` e
   `quadrado` viram nós DOM e ficam só nas camadas pequenas (âncoras, lotes Terracap); numa
   camada de até 5 000 pontos seriam 5 000 nós (C-64, D-87).

A ordem de desenho é a do array `camadas` (a lista acima, de trás para a frente), e as feições
selecionadas sempre por cima; dentro de uma camada não há ordem por feição, e os contornos
importados se ordenam por `ordem_camada` como camadas separadas quando preciso (D-87, C-62). Não
há evento de hover no `urbi-mapa`: nome de localidade e de trecho é `estilo.rotulo` permanente
(acima de um zoom), e o resto aparece no painel ao clicar (C-66). O clique com o botão direito ou
o toque longo (`urbi:mapa-contexto`) abre "Analisar este recorte" e "Salvar como área". O
`urbi:mapa-viewport` tem debounce do próprio primitivo, sem valor contratual, e o enquadramento
automático só acontece na primeira carga (C-63).

Camadas de área e de detalhe são carregadas por `urbi:mapa-viewport` (caixa + zoom):
abaixo do `zoom_min` do conjunto desenha-se o `overview`; a partir dele, só os shards cujas
`localidade_id` cruzam a caixa. Cada arquivo é resolvido pela rota da seção 6.7, baixado pelo
download do framework e memoizado por `sha256` na sessão (D-81).

**Filtros (topo do painel):** cidade (se > 1), localidade, tipo de imóvel, transação, quartos
(mín/máx), preço (mín/máx), busca textual; gaveta "Mais filtros": área, orientação
(vertical/horizontal), situação do anúncio (só ativos | todos, com a contagem de ocultos),
regularização, portal, estágio do lançamento, grupo e segmento de âncora, métrica da área
pública, vias ligadas.

**KPIs do recorte (`urbi-grid` de `urbi-kpi`):** anúncios no recorte, mediana de preço, mediana
de preço/m², P25–P75, lançamentos, âncoras, "sem coordenada exata: N".

**Detalhe de anúncio (três níveis):** essencial (título, preço, preço/m² com origem informado
ou calculado, área, quartos/suítes/vagas, localidade, status e "confirmado no portal em");
complementar (condomínio, IPTU, regularização, dias publicado, portal com link por `urlSegura()`
e `rel="noopener noreferrer"`,
primeiro visto, histórico de preço em `urbi-grafico-linha`); técnico (precisão da coordenada
**com a frase "localização aproximada; centroide da localidade"**, confiança, qualidade, hash,
parser, última verificação, eventos; o `bruto` em `urbi-navegador-json`). Na fase 1, histórico
de preço e retratos mostram "disponível a partir da coleta automática" (`fase_futura`). Bloco **Comparáveis**: régua P25–P50–P75 do recorte e a
posição deste anúncio em `urbi-grafico-medidor` com faixas (C-57); `qualidade_amostra` escrita. Botão "Analisar este recorte" (seção 9).

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
  e dois mapas sincronizados. O `urbi-mapa` do SDK 100 não tem cluster, raster, tiles/WMS próprios
  nem sincronia; "ficam fora — são componentes de módulo construídos sobre este". Entram só por
  pedido ao shell (C-65; fecha P-19).
- **Camadas da v0.3:** restrições do sítio (APP, UC, declividade, ARIS e ARINE), com legenda por
  tipo; equipamentos públicos por tipo e rede; perímetros estratégicos das áreas de estudo, com
  cor por papel. Sem o conjunto `restricoes_sitio` ou `equipamentos_publicos` carregado, a
  camada fica desabilitada com "restrições não carregadas" ou "equipamentos não carregados"
  (v0.5); camadas internas da UP importadas por KMZ como `contornos` de papel restrição aparecem
  na mesma legenda, rotuladas com a origem.

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
    tempo de anúncio, último preço pedido antes de sair; todos por imóvel. Na v0.5 o tempo de
    anúncio é a mediana Kaplan-Meier e S(30) (fração ainda ativa aos 30 dias), com o rótulo
    "estimativa com censura (Kaplan-Meier)" e o número de eventos; abaixo de 20 eventos no
    grupo, "amostra pequena". R$/m² sempre por `base_area`, com a base no rótulo e "não
    especificada" como classe própria.
11. **Índice de oferta estratificado** ao lado da mediana bruta, com estratos imputados contados.
    Calculado desde a fase 3, só aparece na tela quando a primeira base de 12 meses fechar; até
    lá, "índice em formação: base fecha em <mês>". Mês sem índice publicável mostra o motivo.
12. **Contexto macro e de crédito**: as séries de `series_macro` por papel, com o mês do IVV
    alinhado.
13. **Estoque de lançamentos por status** (na planta, em obra, pronto) e VSO/LsO onde a fonte
    permitir (D-32).

### 10.4 Diagnóstico (`/diagnostico`, `/diagnostico/ranking`, `/diagnostico/comparar`, `/diagnostico/base`)

Sucede Diagnóstico Territorial PDAD-A e as três telas irmãs. `urbi-abas` entre as quatro; as
sub-rotas seguem o `nav` (seção 4.1), alinhadas na v0.4 (C-70).

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
de território" (escrita). Análise em `gerando` aparece como "na fila desde <hora do pedido>":
todo pedido é assíncrono (D-82) e o limite por minuto da app, quando estoura, só adia a chamada
(o worker retenta), não a faz falhar (v0.5).

### 10.6 Cadastro (`/cadastro/*`)

Papel `curador` para escrever; `leitura` vê tudo em modo somente leitura. `/cadastro` é uma folha
do `nav` e abre com `urbi-abas`, uma aba por cadastro abaixo, cada uma na sua sub-rota
(`/cadastro/anuncios`, …, `/cadastro/faixas-programa`; D-86).

- **Anúncios:** `urbi-inbox` com `urbi-tabela` (filtros por coluna, inclusive inativos e
  removidos) e ficha editável; ações: novo por URL (cola a URL → prévia preenchida → confirma),
  novo por formulário, editar, remover/restaurar, verificar agora; histórico de eventos e
  retratos na ficha; mini-mapa `urbi-mapa` em modo `desenhar-ponto` para ajustar coordenada
  (e aí `precisao_coordenada = manual`).
- **Lançamentos:** idem, com `lacunas` em destaque na ficha e botão "verificar agora".
- **Âncoras:** idem; `grupo` derivado mostrado como sugestão.
- **Contornos:** lista por grupo e status; importar KML/KMZ/GeoJSON (upload → prévia das
  feições → aplicar; também é o caminho de GeoJSON colado, que não vai no corpo JSON; D-92);
  desenhar (`urbi-mapa modo="desenhar-poligono"`), editar vértices (`modo="editar"`) só em
  geometria simples (`Polygon` sem buraco, `LineString`, `Point`) — `MultiPolygon` se edita por
  reimportação —, estilo nos campos de `EstiloFeicao` (cor é dado da feição, com amostra), ordem
  da camada, vincular localidade; limites oficiais substituídos aparecem como inativos com
  vigência. A geometria chega em `urbi:mapa-geometria { geometry }` e passa pela validação de
  faixa de 5.3 antes de gravar (C-61). Arquivo original expirado (D-89) aparece como tal.
- **Localidades:** lista por tipo, ficha com códigos, pai, ponto de referência (ajustável no
  mini-mapa), perfis por ano, contornos vinculados.
- **Empreendimentos** (v0.2): lista e ficha com os vínculos (lançamento, anúncios, licenças,
  lote Terracap) e o estágio derivado; criar, editar, desvincular.
- **Lotes Terracap** (v0.2): `urbi-inbox` com a ficha, os derivados e o mini-mapa; importação de
  CSV do edital e do resultado. Na prévia, a `destinacao_categoria` vem proposta a partir do
  texto verbatim (`comum/terra/destinacoes.ts`) e o operador confirma o mapeamento, como o de
  `ivv_regional` (v0.5).
- **Licenciamento de obras** (v0.2): idem, com importação de CSV.
- **Faixas de programa** (v0.2): tabela editável com vigência e link da portaria.

### 10.7 Operação (`/operacao/*`)

Papel `operador` para agir; `leitura` vê. `/operacao` é uma folha do `nav` e abre com `urbi-abas`,
uma aba por item abaixo, cada uma na sua sub-rota (D-86). Erros do barramento (`erro.*`) só o
admin da app vê; a Operação mostra falhas lendo `coletas`, `fonte_saude` e `achados_qualidade`,
nunca o barramento (C-47).

**Coleta pausada (v0.5).** Com o parâmetro `coleta_ativa = false`, todas as abas da Operação
abrem com um `urbi-banner` fixo "coleta pausada (coleta_ativa = false) desde <data>; nenhuma
rotina de coleta faz requisição", e os botões que pedem coleta (verificar agora, executar busca,
reler, carregar dados públicos) ficam desabilitados com esse motivo, em vez de receber
`409 COLETA_PAUSADA`. Quem religa é o admin da app, em Config › Parâmetros.

- **Saúde (v0.5):** painel único do que pode parar calado. (1) **Cadeia mensal:** por mês, o
  estado de cada elo (`fechar_mes`, `carregar_series_macro`, `calcular_achados`,
  `gerar_analises_mensais`) lido de `coletas`: concluído, aguardando (com a tentativa, até 6),
  adiado, falhou ou parado; a cadeia parada também é o erro `cadeia_mensal_parada` (seção 13),
  que só o admin vê, por isso o estado está aqui (`GET /operacao/saude`). (2) **Coleta:**
  `coleta_ativa`, última execução por rotina e execuções `adiada` ou `pausada`. (3) **Fontes:**
  as bloqueadas, as de parser degradado e as atrasadas (seção 23).
- **Candidatos:** fila por status; ficha com os campos lidos, o `bruto`, a página de origem;
  aprovar (com correções inline), rejeitar (motivo), reler; destaque aos `bloqueado_leitura`
  ("a página nunca foi lida; os dados são os da listagem"). O `bruto` aparece em
  `urbi-navegador-json`, nunca como HTML (10.1).
- **Fontes de portal:** tabela com estado (ok | instável | bloqueada, desde quando, taxa de
  bloqueio 24 h), parser, última execução; ficha com buscas salvas (CRUD, executar agora; a
  execução é pedida por evento, a rota responde `202` e a ficha acompanha a `coleta` criada; v0.5),
  diagnóstico (código HTTP, classificação, amostra do HTML); aviso quando há fonte bloqueada:
  "fonte bloqueada: considere pedir ao administrador da instância a inclusão do host no proxy de
  egresso; ver docs/coleta.md" (D-79).
- **Execuções:** `urbi-tabela` de `coletas` com contadores e `disparo`; detalhe com
  `detalhes_erros`; os status `pausada` (coleta desligada) e `adiada` (outra rotina da mesma
  classe em curso) aparecem com o resumo da rotina, não como falha (v0.5); link para a aba
  Rotinas nativa da Config (log do shell e "Rodar agora", que é do admin da app; C-05).
- **Importações:** escolher tabela, baixar modelo de CSV, subir arquivo, escolher modo de
  duplicata, ver prévia (contagens, mapeamento inferido editável, rejeições e a lista
  `colunas_ignoradas` com o motivo `derivada` ou `desconhecida`; coluna ignorada nunca rejeita a
  linha), aplicar; histórico com relatório. **Desfazer importação** (v0.5, admin da app):
  confirma com as contagens, faz remoção lógica das linhas criadas por aquela importação que
  ninguém editou depois e mostra no relatório as que ficaram por terem sido editadas; nunca
  apaga de vez (11.3).
- **Dados públicos:** manifest remoto × carregado por conjunto; "Carregar agora" (pede a carga
  por evento e mostra a `coleta` quando ela começa; D-91); arquivos com tamanho, hash, status;
  arquivos removidos pelo shell (`urbiverso.arquivos.removido`, com o motivo).
- **Séries macro** (v0.4): `urbi-tabela` editável de `series_macro_config` (código, fonte, papel,
  escala, ativa), pelo operador (D-90).
- **Qualidade:** achados abertos por tabela/código/severidade, link para o registro, resolver.
- **Agrupamentos e vínculos** (v0.2): duas filas, grupos de anúncios sugeridos (anúncios lado
  a lado, confirmar, descartar, separar) e sugestões de vínculo a empreendimento (aceitar,
  rejeitar).
- **Fontes de portal** ganha a coluna e a ficha de **saúde do parser** (seção 8.4.1).
- **Uso e frescor** (v0.3): uso agregado por tela e semana (sem nomes); frescor de cada fonte
  com a situação; botão de limpar cache (operador); versões em uso (`/sobre/versoes`).

### 10.8 Config (nativa do shell)

Abas que o shell monta sozinho (C-84), todas do admin da app:

| Aba | Por que aparece | O que a app usa dela |
|---|---|---|
| Parâmetros | a app declara `parametros` | seção 4.3 |
| Manifesto | sempre (leitura) | conferência da versão instalada |
| Schema | a app tem `schema.json` (leitura) | conferência das tabelas |
| Usuários | sempre | nível e papéis `curador` e `operador` |
| Arquivos | sempre | TTL dos anexos não obrigatórios (D-89) |
| Planos | sempre (vazia: a app não declara `privilegios`) | — |
| Slack | sempre | — |
| Eventos | a app declara `eventos` | destinos de Remessa dos erros (seção 13) |
| Sentinela | sempre | — |
| Lixeira | a app tem tabelas com `soft_delete` | restauração e purga manual de anúncios, lançamentos, contornos, análises…; por isso a Operação não tem tela própria de restauração. A purga de anúncio com retrato e de área com ficha é recusada por desenho (`409 DADOS_DEPENDENCIA_EXISTE`, FK `restringir`; v0.5): o histórico não sai por purga, e o registro fica na lixeira |
| Rotinas | a app declara `rotinas` | status, horário, "Rodar agora", log; a fase 0 aplica a grade de horários sugerida do README (o default 06:00 UTC poria todas no mesmo slot) |
| IA | a app declara `ia` | sub-abas Slots · Configurações (timeout e limite por minuto; C-42) · Utilização · Histórico. O limite é por app (1 a 600, padrão 10) e sobe para 30 na instalação da fase 5 (v0.5) |

A Lixeira restaura e purga fora das rotas da app: não grava `alteracoes_cadastro` nem incrementa
`versao`. É aceitável porque é ação do admin da app, registrada pelo shell; a tela de Cadastro
mostra o registro restaurado como qualquer outro. A app não declara `telas_config`: o que é
operação de domínio está em `/operacao/*`.

### 10.9 Início (`/`, v0.2)

**Início é a raiz (v0.5).** A tela mora em `/` e o `nav` a declara como `{ "titulo": "Início",
"rota": "/", "icone": "fa-solid fa-house" }`; o "Home" que o shell põe no menu e o "Início" do
`nav` abrem a mesma tela. `/inicio` não existe; links de notificação e visões salvas usam `/`.

`urbi-shell-page` com `urbi-stack`: achados de maior pontuação da cidade e das áreas próprias
(cartões com `texto_curto`, direção e link para a tela de origem), **condições de tese vencidas ou
em risco** e **diligências com prazo na semana** das áreas próprias (v0.3), análises novas do mês,
estado das fontes e da saúde do parser, fontes atrasadas, visões salvas fixadas. É a resposta a "o que mudou desde a
última vez que olhei". As áreas próprias e o que pende delas só aparecem para quem as vê (10.1);
para os demais o Início não diz que existem.

**Início mínimo da 4C (v0.5).** Na fase 4C entra só o bloco de condições vencidas ou em risco
(achado `condicao_em_risco`, único tipo de `calcular_achados` nessa fase) e o de diligências da
semana; os demais blocos chegam com a fase 5 e, até lá, mostram "disponível com <entrega>".

### 10.10 Estudos de área (`/estudos`, `/estudos/:id`, `/estudos/portfolio`, `/estudos/comparar`, v0.2)

- **Lista:** `urbi-inbox` por tipo e estágio, com mini-mapa; "Nova área" por desenho, por ponto
  ou por importação de KMZ. Área `tipo = propria` só aparece para quem tem `estrategico` ou
  `curador`, ou é o responsável dela (10.1, seção 14); a lista oficial de onde elas vêm é
  `[PENDENTE P-47]`.
- **Dossiê (v0.3, D-56):** `urbi-2x1` com o mapa da área, dos anéis e dos perímetros à esquerda
  e, à direita, `urbi-abas` nas quatro escalas do método, mais as abas de trabalho:
  - **Regional:** contexto macro e de crédito, IVV e FipeZap da cidade, posição da localidade no
    ranking dos indicadores-chave.
  - **Urbana:** a localidade que contém a área (perfil, série padronizada, pipeline, Terracap,
    expansão urbana), centralidades de emprego próximas.
  - **Entorno (por anel):** demografia e renda, formação domiciliar, emprego e acessibilidade,
    oferta e preço (por imóvel, com a natureza do preço), lançamentos e pipeline, comércio e
    lacunas, âncoras e equipamentos, tráfego dos trechos próximos, novas edificações. Estatística
    abaixo do mínimo de amostra sai como "amostra pequena" com o `n` (10.1). Oferta por anel só
    usa anúncios com `h3_r9`; enquanto a fração de ativos com coordenada exata no recorte for
    menor que 50%, o bloco de oferta mostra a estatística da localidade com o rótulo "da RA, não
    do anel" (v0.5).
  - **Sítio:** área bruta e líquida, restrições por tipo, zona do PDOT e regularização,
    edificações existentes, acesso à via de maior centralidade. A área líquida é **vetorial**
    (polígono menos a interseção com a união das camadas restritivas, em SIRGAS 2000 / UTM 23S)
    e aparece com a faixa que vem da simplificação e da resolução da fonte, com a fonte escrita;
    a grade de células não entra nela. Sem `restricoes_sitio` carregado, o bloco diz
    "restrições não carregadas" e não mostra área líquida (v0.5).
  - **Síntese e agenda:** os cinco grupos com natureza e evidência; itens propostos pela IA para
    aceitar ou descartar; a agenda de decisão. O registro da decisão (quem decide, foro,
    alternativas) e as transições da escada que a exigem são
    `[PENDENTE P-42]`.
  - **Tese:** os dez componentes, as condições necessárias e de interrupção com status, prazo e
    métrica monitorada; as hipóteses de produto (`hipoteses_produto`, fase 4C: tipologia, faixa de
    preço, unidades, cenário de viabilidade, natureza, status) a que as condições podem se ligar;
    histórico de versões.
  - **Diligência:** as perguntas por frente, com as respondidas pelo app marcadas para confirmar.
    A ambiental fica sem pré-preenchimento enquanto `restricoes_sitio` não estiver carregado.
  - **Âncoras:** hipóteses de âncora com simulação, "a âncora traz" e "a UP traz".
  - **Viabilidade:** cenários vertical e loteamento, sensibilidade, comparação com pedido e
    arrematado (mesmas regras da 10.13).
  - **Linha do tempo:** `area_eventos` e observações de campo. Comentário é `area_eventos` de
    `tipo = nota`, com autor e data, não editável; não há tabela de comentários (v0.5). A trilha
    de saídas (ficha, pacote, exportação, análise de IA de área própria) aparece aqui com o
    usuário. Aviso de prazo ao responsável é `[PENDENTE P-43]`.
  Cada bloco tem o rodapé "fonte · período · método · fração coberta" e, quando houver, a marca de
  fonte atrasada. Seletor de anel no topo.
- **Modo campo (v0.3, D-78):** no celular, a área abre direto no mapa com anéis, perímetros e
  restrições; "Registrar observação" pega texto, fotos e a posição do aparelho. Não há iframe
  entre o shell e a app, mas o bundle não fala de câmera, geolocalização nem `Permissions-Policy`
  (C-71), e o `urbi-mapa` não expõe "minha posição" (C-68). Por isso, com HTML puro e
  alternativa sempre disponível (D-94; fecha P-39):
  - **foto:** `<input type="file" accept="image/*" capture="environment">`, enviada por `__upload`
    para `observacao_fotos` (sem API de mídia);
  - **posição:** `navigator.geolocation.getCurrentPosition`, desenhada como camada de ponto; se
    falhar ou for negada, o usuário toca a posição no mapa (`modo="desenhar-ponto"`) ou a digita,
    e `precisao_m` fica nulo (R-46).
- **Portfólio (v0.3, D-66):** `urbi-tabela` das áreas próprias (e das outras por filtro) com
  estágio, seis indicadores-chave (os mesmos da capa da ficha), condições por status,
  diligências abertas por frente e data da última ficha; mapa de todas; clique abre o dossiê.
  Quem não vê áreas próprias (10.1) recebe o portfólio só com as outras, sem aviso de ocultas.
- **Ficha:** escolher "uma página" ou "detalhada", marcar e ordenar as seções, gerar (congela em
  `area_estudo_fichas`), baixar em Markdown, CSV ou pacote (ZIP gerado no backend; D-93). PDF e
  Word ficam no Futuro: o SDK 100 não tem geração de documento (C-40; fecha P-20). Leiaute da **uma página** (v0.3): cabeçalho (nome, tipo, estágio, data,
  "uso interno" quando `tipo = propria`, mapa com anéis); seis indicadores (domicílios no anel
  médio, formação domiciliar anual, distribuição de domicílios por faixa de renda, R$/m² pedido
  mediano, unidades no pipeline, R$/m² arrematado da localidade), cada um com natureza e fonte;
  três maiores lacunas de produto; três maiores lacunas comerciais; sítio (área líquida com a
  faixa, zona do PDOT); síntese aceita em cinco linhas curtas; três próximas perguntas de maior
  impacto; rodapé de fontes, versões e método. A **detalhada** acrescenta as quatro escalas, a
  tese com condições, as hipóteses de âncora e a viabilidade.
- **Capa sem falácia ecológica (v0.5).** Na capa, indicador cuja unidade nativa é `localidade`
  não aparece como valor do anel. A renda entra como distribuição de domicílios por faixa, com o
  rótulo "da RA <nome>, PDAD <ano>" e, quando o anel cruza mais de uma RA, a fração do anel em
  cada uma. Valor de renda do anel só entra quando houver fonte por setor ou célula
  (`censo_2022_setores` com rendimento), com a fonte escrita.
- **Seção omitida com motivo (v0.5).** Seção cuja fonte é de fase posterior sai da ficha com a
  linha "disponível com <entrega>" (ex.: as três maiores lacunas comerciais, "disponível com
  Comércio e âncoras", até a fase 7), nunca vazia nem zero; a J1 não depende dela.
- **Comparar fichas (v0.5).** Na lista de fichas da área, a ação "Comparar com…" escolhe outra
  ficha da mesma área e abre a tabela de `GET /estudos/:id/fichas/comparar?a&b`: por chave
  estável de `conteudo` (chave do catálogo + recorte + período), os dois valores e a diferença,
  com a marca "mudou o dado" quando versão do conjunto e `versao_metodo` coincidem, ou "mudou a
  medida" quando não, e aí sem variação calculada. Não ganha entrada no `nav`.
- **Saídas de área própria (v0.5).** Gerar ficha, baixar pacote ou CSV e gerar análise de IA de
  área própria gravam `area_eventos` com o usuário (trilha de saídas; seção 22). Não há trilha de
  visualização.
- **Comparar áreas:** 2 a 6 áreas, mesma tabela e `urbi-grafico-colunas` agrupadas.

### 10.11 Produto (`/produto`, `/produto/matriz`, `/produto/benchmark`, v0.2)

- **Demanda e capacidade:** recorte por localidade ou área de estudo; perfil de demanda em
  `urbi-kpi` e gráficos; capacidade de pagamento como colunas por faixa de preço alcançável, com
  a taxa usada e a origem dela escritas; seletor de programa.
- **Matriz de produto:** `urbi-mapa-de-calor` tipologia × faixa de preço, em **duas leituras
  nomeadas** (v0.5), alternadas por `urbi-abas`:
  - **Composição:** participação de cada célula na demanda e na oferta, cada uma somando 1 no
    recorte, e o "descompasso" em pontos percentuais, rotulado "composição, não quantidade";
  - **Fluxo:** demanda anual (`formacao_domiciliar_anual` × distribuição alcançável) contra
    oferta anual (unidades lançadas nos últimos 12 meses, mais pipeline com entrega em 12 meses);
    a lacuna em unidades/ano só aparece nesta leitura, ao lado da absorção.
  A oferta é só venda, separada em "usado (anúncios, por imóvel)" e "novo (lançamentos,
  unidades)". Clique na célula abre os anúncios e lançamentos dela. Aviso fixo: a conversão de
  tamanho de domicílio em quartos é hipótese declarada. Absorção por localidade com menos de 12
  meses de IVV regional vem rotulada "rateio da cidade" (10.13).
- **Benchmark de lançamentos:** `urbi-tabela` dos comparáveis com régua P25–P50–P75 e posição de
  um produto hipotético digitado (área e preço).

### 10.12 Comércio e âncoras (`/comercio`, `/comercio/simular`, `/comercio/gemeas`, `/comercio/lentes`, v0.2)

- **Potencial e lacunas:** escolher categoria; mapa de lacuna por célula ou localidade; tabela
  das categorias com gasto potencial, estabelecimentos e razão contra a cidade; filtro pela área
  de estudo. Na v0.5 a lacuna de cada célula é a da **bacia da categoria** (gasto e
  estabelecimentos somados no `raio_bacia_m` dela, escrito na legenda); célula sem
  estabelecimento na bacia aparece como "sem oferta", fora da escala da razão, e só células
  habitadas com gasto ≥ P25 da cidade são coloridas. Bolsão (Gi*) só aparece para grupo de ≥ 3
  células contíguas significativas por FDR (q = 0,05), e o de preço fica desligado com o motivo
  até haver 200 células com ≥ 5 imóveis.
- **Simular âncora:** clicar um ponto (ou escolher uma área própria), categoria e porte; o
  resultado do Huff por anel, com os concorrentes considerados e os parâmetros escritos; botão
  "Levar para a ficha". Na v0.5 o resultado diz a **escala de atratividade** usada (classe de
  porte por categoria, aplicada também à âncora simulada, ou A = 1 para todas) e a fração de
  concorrentes com atratividade imputada; a área medida da âncora só entra quando todas as
  concorrentes da rodada têm área medida.
- **Áreas gêmeas:** referência (área, localidade ou célula), resultado no mapa e em tabela com
  o que aproxima e o que afasta.
- **Lentes de aptidão:** lista de lentes; editor de pesos para o curador; mapa do score com a
  decomposição ao clicar. Permanência na V1 é `[PENDENTE P-46]` (sem jornada que
  a use, R-36).

### 10.13 Terra e oferta futura (`/terra`, `/terra/lotes`, `/terra/viabilidade`, `/terra/pipeline`, v0.2)

- **Licitações Terracap:** resumo por localidade × `destinacao_categoria` (medianas de R$/m² de
  terreno e de potencial, ágio, propostas, fração vendida), série por ano e mapa dos lotes;
  sempre com "preço arrematado em licitação" escrito. A categoria `outra` é listada, mas nunca
  entra em mediana (v0.5).
- **Pipeline de oferta:** unidades por estágio (licenciado, em obra, lançado, concluído) por
  localidade, meses de absorção futura e a lista dos empreendimentos. Só alvarás de uso
  residencial contam unidades. Alvará sem habite-se e sem lançamento vinculado há mais de
  `alvara_validade_meses` sai do pipeline e vai para a lista à parte "alvará antigo sem
  habite-se". A absorção usa o IVV regional só com 12 meses de série; antes disso, "rateio da
  cidade"; sem nenhum dos dois, "sem absorção" (v0.5).
- **Mercado de lotes (v0.3):** por localidade e faixa de área de lote: pedido (anúncios de
  terreno), arrematado (Terracap) e residual (cenários), lado a lado, com a natureza de cada um e
  a amostra; mapa dos lotes anunciados e licitados.
- **Viabilidade expedita (v0.3):** formulário de premissas com a origem de cada uma (parâmetro,
  benchmark, série, manual) e as que diferem do padrão destacadas; resultado em linhas, residual
  total e por m², grade de sensibilidade em `urbi-mapa-de-calor`, comparação com pedido e
  arrematado; "Salvar cenário" liga à área de estudo. Rótulo fixo: simulação expedita, não
  substitui avaliação.
- **Linhas da viabilidade (v0.5).** O resultado mostra, cada uma com a origem: VGV a **preço de
  venda** (pedido × (1 − desconto), com o desconto do IVV do recorte nos últimos 12 meses ou, sem
  IVV, do parâmetro, escrito como premissa); custos indiretos (fração do custo de obra);
  contrapartida urbanística (ODIR/ONALT) em R$, campo manual sem padrão, que só vale zero quando
  marcado "não incide"; e o residual bruto e o **líquido** de aquisição (ITBI e registro). O
  rótulo diz "método estático; o tempo entra só pelo custo de espera". A comparação é por R$/m²
  de área computável contra o R$/m² de potencial da Terracap (mesma `destinacao_categoria`) no
  cenário vertical, e por R$/m² de gleba bruta no loteamento, com o aviso "a Terracap vende lote
  urbanizado, não gleba". Os valores padrão dos parâmetros seguem `[PENDENTE P-35]`.

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
   `coletas` e `achados_qualidade` registram o que a validação achou de não bloqueante. Toda
   linha criada guarda `importacao_id` (referência → `importacoes`, `anular`), que é o que
   permite desfazer a importação (11.3.2).

**Colunas que a app não grava (v0.5).** `comum/importacao-chaves.ts` declara, por tabela, as
`colunas_derivadas`: as que a exportação acrescenta (`id`, `criado_em`, `atualizado_em`,
`versao`, `preco_m2`, `orientacao`, `preco_m2_divergente`, `localidade_nome`, `h3_r9`, …). Na
prévia, coluna derivada e coluna desconhecida são **ignoradas com aviso**, na lista
`colunas_ignoradas` com o motivo `derivada` ou `desconhecida`, e nunca rejeitam a linha. O `id`
exportado só serve de chave no modo `atualizar` em tabela sem chave natural. Na leitura, o `'`
inicial de célula de texto que começa com `=`, `+`, `-`, `@`, tabulação ou retorno é retirado
(é o prefixo que a exportação põe; 11.2), para o ida-e-volta não alterar o dado. Teste de ida e
volta (18.1): exportar → importar em `ignorar` dá zero rejeições e zero inserções.

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

**Injeção de fórmula (v0.5).** Célula de texto que começa com `=`, `+`, `-`, `@`, tabulação ou
retorno sai com `'` na frente, para a planilha que abrir o CSV não a executar como fórmula;
colunas numéricas saem como número e não são tocadas. A importação retira esse `'` (11.1).

**Recorte de sigilo (v0.5).** A exportação aplica a mesma regra das telas: quem não vê áreas
próprias (seção 14) recebe o CSV sem elas e sem o que pende delas, sem linha de aviso. Exportação,
ficha, pacote e análise de IA de área própria gravam `area_eventos` com o usuário (trilha de
saídas; seção 22). A saída de IVV e FipeZap em CSV e pacote depende de
`[PENDENTE P-45]`.

Além do CSV, o **pacote com proveniência** (D-28, seção 6) acompanha o modelo do Our World in
Data: os dados, os metadados em JSON e um LEIAME com a citação, para o número sair do app com a
fonte junto. Os CSVs do pacote seguem a mesma regra de prefixo.

### 11.3 Migração da planilha (incremental e reversível; v0.5)

**Retrato datado.** A migração nunca importa a planilha viva nem download manual. O repositório
da app traz `scripts/exportar-planilha.mjs`, que baixa cada aba em CSV pela mesma consulta GViz
que o site já usa e grava `migracao/AAAA-MM-DD/<aba>.csv` com o sha256 de cada arquivo. Cada
passo da tabela abaixo é uma importação pela tela com o CSV do retrato, sem edição manual. O
mesmo retrato é a entrada dos testes de paridade (18.1). A semente versionada do repositório do
site tem 141 anúncios (2026-09-19); a planilha viva tinha 158 na mesma data e cresce. Por isso o
aceite não usa número fixo: `importacoes` grava a contagem de linhas do CSV do retrato, e o
pronto é "importadas + rejeitadas com motivo = linhas do retrato".

Ordem, respeitando referências:

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
migração, e a diferença, se houver, está explicada por rejeição nomeada. O corte não acontece
de uma vez: segue a convivência da 11.3.1, aba por aba.

#### 11.3.1 Convivência site × app (v0.5)

Regra: **um coletor por vez, uma fonte de verdade por tabela** (dois coletores no mesmo portal
violariam "uma requisição por vez por host", 8.1).

| Fase | Fonte de verdade de anúncios | Coletor | Site |
|---|---|---|---|
| 1 e 2 | planilha | Apps Script | no ar, sem mudança |
| 3 em diante | app, a partir do dia em que as rotinas de coleta são ligadas na Laputa | rotinas da app | mostra o retrato congelado |
| 6 | app | rotinas da app | congelado por inteiro, marcado como legado |

- Nas fases 1 e 2 a app recebe a planilha por **reimportação incremental**: novo retrato datado,
  `modo_duplicata = atualizar` pela chave natural `id_legado`, quantas vezes for preciso.
- No corte da fase 3, no mesmo dia: os gatilhos do Apps Script são removidos e as abas de
  anúncios (`LISTINGS*`, `LISTING_*`) ficam somente leitura.
- As demais abas (IVV, FipeZap, PDAD, tráfego) mudam de fonte de verdade quando a fase que as
  carrega fica pronta; até lá, a reimportação incremental vale para elas também.
- A planilha não é apagada nem editada durante a migração; é ela a cópia de segurança.

#### 11.3.2 Desfazer importação (v0.5)

A tela de Importações tem **Desfazer importação**, só para o admin da app
(`POST /importacoes/:id/desfazer`): faz remoção lógica (`PATCH …/remover`) das linhas com aquele
`importacao_id` que ninguém editou depois (`versao` igual à da criação) e lista no relatório as
que ficaram por terem sido editadas; nunca apaga de vez. Linhas que a importação **atualizou**
(modo `atualizar`) não voltam ao valor anterior: o relatório as lista para conferência, e o
caminho é reimportar o retrato anterior (D-119). Como a importação é idempotente pela chave natural
(11.1), desfazer e reimportar dá o mesmo resultado.

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
traz os arquivos para dentro do banco (coluna `arquivo`); a app entrega ao frontend uma URL
assinada (D-81), nunca os bytes.

**Repositório do pipeline (v0.5).** O pipeline Python **não muda de repositório com a app**:
continua em `rafaleandrog/inteligencia-real-estate`, com os workflows e as regras dele (R2.7,
R2.8), publicando o manifest e os arquivos em `data/public/`, que é público porque deriva só de
fonte pública. A app, num repositório privado próprio, lê esse manifest pela URL
`raw.githubusercontent.com` declarada em `manifest_publico_url` (seção 4.3), sem credencial: a
app não tem parâmetro `secret` (D-79). Mudança no pipeline é PR naquele repositório; mudança no
contrato que a app lê (12.2) é PR nos dois, com a versão do manifest como amarra. Cada fase que
precisa de conjunto novo (4A, 7) começa com o PR do pipeline mergeado e o conjunto publicado
(seção 15). A transferência daquele repositório para uma org e o dono das credenciais seguem em
R-25 `[PENDENTE P-44]`.

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
- No frontend, cada arquivo é pedido uma vez por sessão: a rota da seção 6.7 devolve
  `{ arquivo_id, sha256, bytes, url }` e a tela memoiza o conteúdo por `sha256`; não há
  cabeçalho de cache próprio, porque a app não serve bytes (D-81).
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
| `equipamentos_publicos` | INEP (Censo Escolar), CNES, OSM | pontos com `fonte`, `id_fonte`, `tipo` (tabela `equipamentos_publicos`, seção 5.21); licença por fonte `[PENDENTE P-14]` | 4 |
| `restricoes_sitio` | hidrografia (APP pela faixa declarada), UC de proteção integral e de uso sustentável, modelo de elevação 30 m (declividade), ARIS/ARINE do PDOT | polígonos por tipo, simplificados a 5 m (camada vetorial, base da área líquida) + frações por célula em `celula_metricas`; fontes e licenças `[PENDENTE P-31]` | 4A |
| `comercio_cnpj` | estabelecimentos do CNPJ (Base dos Dados), CNAE → categoria | estabelecimentos por categoria e célula; `pontos_comerciais` das categorias com `huff` | 7 |
| `comercio_osm` | POIs do OpenStreetMap | idem, como segunda fonte e para o que o CNPJ não localiza | 7 |
| `potencial_consumo` | POF/IBGE (participação do gasto por faixa de renda) × domicílios e renda da célula | gasto potencial anual por categoria e célula | 7 |
| `mapbiomas_urbano` | MapBiomas, cobertura anual desde 1985 | área urbanizada por célula e ano | 7 |
| `open_buildings` | Google Open Buildings 2.5D Temporal, 2016–2023 | presença, contagem e altura média de edificação por célula e ano | 7 |
| `jobs_cep_2023` | empregos 2023 por CEP (BigQuery, Base dos Dados; issue #159) | empregos por célula | 7 |

Cada conjunto registra licença, ano de referência e método no manifest `[PENDENTE P-14]`.
MapBiomas e Open Buildings exigem processamento de raster com credencial no Actions
`[PENDENTE P-30]`.

**Conjunto ausente não é zero (v0.5).** Enquanto `restricoes_sitio` ou `equipamentos_publicos`
não estiverem publicados e carregados, a tela diz "restrições não carregadas" ou "equipamentos não
carregados" e a diligência correspondente fica sem pré-preenchimento (seção 5.20); nunca "sem
restrição" nem contagem zero. A fase que depende de um conjunto (4, 4A, 7) só começa com o PR do
pipeline mergeado e o conjunto publicado no manifest (seção 12.1).

**Teto de arquivo é do pipeline (v0.5).** O cap global de arquivo da instância não é publicado
no bundle (R-43), e a app só controla o tamanho de cada arquivo publicado. Por isso o teto mora
no pipeline: `[manifest] arquivo_max_bytes` em `config/df.toml` (padrão 50 MB, nunca acima do
cap medido na Pinguim na fase 0), e o validador (`outputs/validator.py`) reprova `budget_bytes`
maior que ele, além do arquivo maior que o próprio `budget_bytes` (regra que já existe). Shard
que estoura é erro de build do pipeline; o conserto é fatiar mais (sub-shard `RA_xx_1`,
`RA_xx_2`, com o mesmo `shard_value`) ou subir o percentil de corte, nunca publicar acima. Hoje
o maior arquivo publicado tem 5,6 MB (`road_centrality/overview.json`). A app só recebe
`DADOS_ARQUIVO_MUITO_GRANDE` se o cap da instância for menor que o do pipeline, e aí falha o
conjunto citando o cap (R-43). A regra entra no `docs/DATA_CONTRACT.md` no PR do pipeline.

---

## 13. Eventos, erros e notificações

Foco em **erros de operação** (D-14). Todo erro declarado vai ao **admin da app, e só a ele**
(C-48): inscrição automática, inbox como piso; e-mail e Slack são opt-in por tipo em Preferências
(o e-mail nasce desligado e exige e-mail de sistema ligado na instância; o Slack exige `slack_id`);
destinos de Remessa (`webhook`, `slack`, …) o admin configura em Config › Eventos. `curador` e
`operador` sem `admin` não veem `erro.*`; por isso o que importa para a operação também é estado
em tela (Fontes, Execuções, Qualidade).

```jsonc
"erros": {
  "coleta_falhou":          { "campos": ["coleta_id", "rotina", "erro"],          "conteudo": "Rotina {rotina} falhou: {erro}",                               "api": "coletas/{coleta_id}",        "rota": "operacao/execucoes" },
  "fonte_bloqueada":        { "campos": ["fonte_id", "fonte", "taxa_bloqueio"],   "conteudo": "Fonte {fonte} bloqueada ({taxa_bloqueio} das leituras em 24 h)", "api": "fontes/{fonte_id}",         "rota": "operacao/fontes" },
  "importacao_falhou":      { "campos": ["importacao_id", "tabela", "erro"],      "conteudo": "Importação em {tabela} falhou: {erro}",                        "api": "importacoes/{importacao_id}", "rota": "operacao/importacoes" },
  "fechamento_mes_falhou":  { "campos": ["coleta_id", "mes", "erro"],             "conteudo": "Fechamento de {mes} falhou: {erro}",                           "api": "coletas/{coleta_id}",        "rota": "operacao/execucoes" },
  "dados_publicos_falhou":  { "campos": ["conjunto", "erro"],                     "conteudo": "Carga do conjunto {conjunto} falhou: {erro}",                  "api": "dados-publicos/estado",       "rota": "operacao/dados-publicos" },
  "analise_falhou":         { "campos": ["tipo", "recorte", "erro"],              "conteudo": "Análise {tipo} de {recorte} falhou: {erro}",                   "api": "analises/estado",            "rota": "analises" },
  "parser_degradado":       { "campos": ["fonte_id", "fonte", "campos"],          "conteudo": "Parser de {fonte} degradado: {campos}",                          "api": "fontes/{fonte_id}/saude",     "rota": "operacao/fontes" },
  "cadeia_mensal_parada":   { "campos": ["mes", "rotina", "erro"],               "conteudo": "Cadeia mensal de {mes} parada em {rotina}: {erro}",            "api": "operacao/saude",             "rota": "operacao/saude" }
},
"eventos": {
  "lacuna_cadastro":        { "descricao": "A coleta ou a análise por IA apontou um dado de cadastro que falta e precisa de preenchimento manual.", "campos": ["tabela", "registro_id", "nome", "campos"], "conteudo": "Lacuna em {nome}: faltam {campos}", "api": "{tabela}/{registro_id}", "rota": "cadastro/{tabela}" },
  "continuar_coleta":       { "descricao": "Uma rotina fatiada retomou o lote do dia, ou uma carga foi pedida pela Operação. Útil só para quem opera a coleta.", "campos": ["rotina", "coleta_id", "disparo"], "conteudo": "A rotina {rotina} retomou a coleta {coleta_id}", "api": "coletas/{coleta_id}", "rota": "operacao/execucoes" },
  "analise_concluida":      { "descricao": "Uma análise por IA pedida pela app terminou (pronta ou com falha).", "campos": ["analise_id", "status", "dados", "codigo_erro", "mensagem_erro", "tentativas", "ia_chamada_id"], "conteudo": "Análise {analise_id} concluída: {status}", "api": "analises/{analise_id}", "rota": "analises" }
}
```

Regras de forma (C-08): `descricao` tem no máximo 200 caracteres; `api` é relativo e vira
`/api/inteligencia_imobiliaria/{api}`; `rota` é sub-rota de frontend, resolvida na publicação e
gravada na notificação (por isso permanente; seção 10.1). No `lacuna_cadastro`, `api` começa por
placeholder: a rotina garante na origem que `tabela` é uma das tabelas de cadastro e
`registro_id` um inteiro. Nenhum evento da app começa por `sentinela` (nome reservado, gate da
obsolescência `evento-prefixo-sentinela`).

`lacuna_cadastro` é evento de domínio comum: quem tem `leitura` pode segui-lo. O `curador` é
inscrito por papel, e a inscrição é **reconciliada**, não só criada (C-49): no `aoIniciar` e na
rotina diária `verificar_frescor`, a app lista os usuários do papel
(`ctx.shell.listarUsuariosPorRole("curador")`), lista as inscrições de `escopo = "curador"`,
inscreve quem entrou (`inscreverUsuario(id, "lacuna_cadastro", {}, "forte", "curador")`) e
cancela quem saiu (`cancelarInscricoesPorEscopo`). O shell não cancela a inscrição forte de quem
perde o papel nem avisa a app quando um papel muda.

**Não existe evento interno sem notificação** (C-08, D-85). `continuar_coleta` e
`analise_concluida` são escutados por `export const reagir`, mas, como todo evento declarado,
aparecem em Preferências e quem tem `leitura` pode segui-los. Por isso o texto é honesto e escrito
para quem opera, e `continuar_coleta` só é publicado quando há continuação de fato. A
deduplicação nativa é só por usuário e evento na entrega; "uma vez por transição" é da app
(seção 8.4; C-50).

**`cadeia_mensal_parada` (v0.5), severidade alta.** As rotinas dependentes (`calcular_achados`,
`gerar_analises_mensais`) não esperam um mês pela pré-condição: achando o `fechar_mes` de M não
concluído, devolvem `ok: true` com "aguardando fechar_mes de M" e reagendam por
`continuar_coleta` em +60 min, até 6 vezes (cobre o catch-up fora de ordem). Esgotadas as
tentativas, ou passados 3 dias de M, devolvem `ok: false` com `erro: "cadeia mensal parada:
fechar_mes de M não concluiu"` e publicam este erro. A aba Rotinas passa a mostrar `Falhou` e a
Operação › Saúde mostra o elo parado (10.7), porque `curador` e `operador` não veem `erro.*`.
Sem isso, uma guarda que devolve `parcial` como sucesso esconde o mês perdido até o mês seguinte
(precedente: charles3 `consulta_djen_falhou`, falha parcial com `ok: false`).

Pendências do dono que mudariam esta seção: o evento de decisão registrada sobre uma área
(`[PENDENTE P-42]`) e o aviso de prazo de diligência e condição ao
responsável, que amplia a D-14 (`[PENDENTE P-43]`).

Erros que o shell injeta sem declaração (C-47), também só para o admin da app: `ia_chamada` e
`override_ia_removido` (a app declara `ia`), `listener_falhou` (declara `eventos`),
`remessa_falhou`, `evento_rejeitado`, `iniciar_falhou` e `encerrar_falhou` (sempre).
`email_envio_falhou` não entra, porque a app não declara `emails`.

Fora da V1 (D-52): um evento de domínio `mudanca_relevante`, publicado por `calcular_achados`
para achado acima de um limiar, com inscrição opcional por localidade ou área. Reabre a D-14 e
só entra quando houver uso que peça. Para a inscrição por filtro valer, ele declara
`localidade_id` e `area_estudo_id` em `campos` (C-49).

---

## 14. Permissões e papéis

| Nível | Quem | O que faz |
|---|---|---|
| (sem permissão) | todo usuário da instância: o admin da instância mantém `permissao_padrao = nenhuma` em Admin › Instaláveis › Apps › Acesso (alçada `usuarios`); a app não declara isso no manifesto (D-13, C-56) | não vê a app |
| `leitura` | liberado individualmente pelo admin da instância | vê todas as telas, exceto as áreas `tipo = propria` e o que pende delas (abaixo), exporta CSV, abre análises; **salva, edita e apaga as próprias visões** pelas rotas pessoais (D-80); grava a própria telemetria por `POST /pessoal/uso` (`uso_eventos` é `pessoal`; v0.5) |
| `leitura` + `estrategico` (v0.5) | a Direção; analistas que trabalham áreas próprias também. Quem recebe é a P-06 | tudo de `leitura` mais **ver** as áreas `tipo = propria` e o que pende delas; o papel não dá escrita. Declarado sob `leitura`, então pode ser dado a quem só lê (usuário `leitura` só recebe papéis de `leitura`, permissoes.md) |
| `escrita` + `curador` | | cadastra e corrige anúncios, lançamentos, âncoras, contornos e localidades; aprova e rejeita candidatos; gera análises; e, na v0.2, empreendimentos, lotes Terracap, licenciamento, faixas de programa, lentes, grupos de anúncios, vínculos e as áreas `propria` (cuja lista oficial de origem é `[PENDENTE P-47]`); vê as áreas próprias |
| `escrita` + `operador` | | gerencia fontes e buscas, roda verificações e buscas agora pelas rotas da app, importa CSV, pede a carga de dados públicos (D-91), mantém as séries macro (D-90), resolve achados; gera análises. Não tem o "Rodar agora" da aba Rotinas, que é do admin (C-05) |
| `escrita` sem papel | | gera análises; cria e edita as **próprias** áreas de estudo (exceto `tipo = propria`) e, nelas e nas áreas em que é responsável, perímetros, síntese, tese, condições, diligências, hipóteses de âncora, cenários e observações; gera fichas. Rotas de cadastro e operação exigem o papel e respondem `403 PAPEL_EXIGIDO` |
| `admin` | | tudo acima mais a Config (parâmetros, rotinas e "Rodar agora", IA, eventos e destinos, usuários e papéis, Lixeira), **desfazer importação** (11.3.2; v0.5) e os erros do barramento. `admin` sem `estrategico` nem `curador` não vê área própria de que não é responsável: a regra é por papel, não por nível. Como o shell não concede papéis ao admin automaticamente — "`nivelApp: 'admin'` não confere os papéis declarados sob `escrita`" (C-53) —, o admin que também cura atribui a si o papel |

Gate de papel em código: `exigirPapel('curador')` lê `req.contexto.rolesApp` (`ContextoRequest`
traz `usuario`, `nivelApp` e `rolesApp`; C-52). Um agente com token passa pelo mesmo gate e pelos
mesmos papéis do usuário a que o token aponta, inclusive nas rotas pessoais; a app nem sabe que
veio por token (C-55). Nas tabelas do
método da oportunidade, a regra é "autor, responsável da área ou curador"; nas áreas
`tipo = propria`, só responsável e curador escrevem. Nenhuma rota
olha `usuario.tipo` nem `natureza`. Externos: a app não declara `aceita_externos`.

**Sigilo das áreas próprias (v0.5).** Áreas `tipo = propria` e tudo que pende delas (`teses`,
`tese_condicoes`, `diligencias`, `area_sintese_itens`, `cenarios_viabilidade`,
`area_estudo_fichas`, `observacoes_campo`, `area_eventos`, `analises_ia` de área) só são lidos
por quem tem `estrategico` ou `curador`, ou é o `responsavel_id` da área. Para os demais a área
some das listas, do portfólio, do Início, dos achados, do mapa e das exportações, e o detalhe
responde `404 REGISTRO_NAO_ENCONTRADO` (não confirma que existe). Essas tabelas são `restrito`,
então só as rotas da app as leem (a rota genérica não sabe de papel; `req.dados` ignora
`acesso_externo`). Área própria real só existe na Laputa; na Pinguim, que recebe devs de fora, os
testes usam áreas de prospecção, referência ou fictícias. O papel e a escrita sobre a decisão da
área (decisor, transições da escada) dependem de `[PENDENTE P-42]`.

**Guarda por objeto (v0.5).** Cada tabela com regra por objeto a declara em
`comum/regras-objeto.ts` (`autor`, `responsavel`, `curador`, `estrategico`, por operação). Toda
rota que recebe `:id` dessas tabelas busca o registro e chama `exigirAcessoObjeto(req, registro,
operacao)` antes de qualquer efeito: quem não pode ler recebe `404 REGISTRO_NAO_ENCONTRADO`;
quem lê e não pode escrever, `403 OBJETO_SEM_PERMISSAO`. Id de objeto pai vindo no corpo
(`area_estudo_id`, `tese_id`) passa pela mesma guarda. `testes/matriz-acesso.test.ts` tem uma
linha por rota × perfil (autor, responsável, curador, estrategico, escrita sem relação, leitura
sem `estrategico`) com o status esperado, e a lista de rotas é conferida contra a pilha dos
Routers por contagem exata: rota nova sem linha reprova. O QA repete a matriz na Pinguim com o
pool de usuários de QA (18.2).

---

## 15. Fases de implementação

Cada subfase termina numa release que a **Pinguim** instala sozinha e onde roda o QA; cada fase
termina com a release instalada na **Laputa**, onde a equipe usa a app, e com a documentação em
`docs/` da app atualizada. As fases mais distantes têm menos detalhe de propósito: o detalhe
cresce quando a fase anterior mostra o que a realidade pede.

**A unidade de planejamento é o PR, não a sessão (v0.5).** Cada fase vira uma sub-issue de uma
issue-spec guarda-chuva (skill `orquestrar` do kit) e se divide em subfases; cada subfase é um PR
que entrega uma fatia vertical instalável (schema + rota + tela + teste + doc) e termina numa
release que instala na Pinguim. A estimativa de cada fase é o número de PRs: a soma abaixo dá 28 a
34 PRs, que é piso, e a contagem real é registrada na issue guarda-chuva a cada fase fechada e
reestima as seguintes. As fases 1 e 3 já vêm divididas (1a a 1d, 3a a 3d); 4A, 4B e 7 seguem a
mesma regra quando chegarem (precedente: o `reg360` cresceu por versões pequenas, uma issue por
mudança; D-99).

**Pinguim testa, Laputa usa (v0.5).** A Pinguim é instância de teste: recebe toda release pelo
auto-update (aceitação `Releases`) e é onde o QA de cada fase roda. A equipe usa a app na Laputa
(produção da UP), com aceitação `homologado` e atualização manual pelo admin dela: a release de uma
fase só vai à Laputa depois do QA na Pinguim e da homologação (`prerelease=false`). Como a
Pinguim recebe devs de fora, **áreas próprias, teses e cenários reais nunca entram na Pinguim**:
lá o golden set e os testes usam áreas de prospecção, referência ou fictícias. A primeira
instalação na Laputa acontece ao fim da fase 1; `1.0.0` só depois do critério global de pronto
(18.3). As regras de convivência com as outras apps da instância estão em 3.6 (precedente:
`reg360`, `docs/operacao.md`; D-97).

**Portão entre fases (R-26, v0.5).** Uma fase só começa quando a anterior cumpriu três condições,
registradas na sub-issue dela: (a) o "Pronto quando" conferido pelo QA na Pinguim (skill `qa`,
relatório em `qa-relatorios/`); (b) a release instalada na Laputa; (c) uso real: cada jornada da
seção 24 atribuída à fase feita por uma pessoa da equipe com dado real (data e quem), ou, nas
fases sem jornada que feche nelas (1, 2, 3 e 4; a J6 só fecha inteira na 4B), duas semanas de uso
na Laputa com a tela da fase aberta em pelo menos cinco dias distintos segundo `uso_eventos`. A
fase 0 só tem a condição (a), porque a primeira instalação na Laputa é ao fim da fase 1. Cumpridas
as condições, o dono dá o ok por escrito na sub-issue; sem o ok, a fase seguinte não começa.
`uso_eventos` é evidência, não substitui o ok (D-104).

**Convivência com o site (v0.5).** Um coletor por vez, uma fonte de verdade por tabela (seção 2.1):
nas fases 1 e 2 a planilha é a fonte e o Apps Script coleta, e a app recebe a planilha por
reimportação incremental; na fase 3, no dia em que as rotinas de coleta são ligadas na Laputa, os
gatilhos do Apps Script saem e as abas de anúncios ficam somente leitura; as demais abas mudam de
fonte quando a fase que as carrega fica pronta; a fase 6 só congela o resto. A regra vale também
entre instâncias: na Pinguim, `coleta_ativa` fica `false` fora da janela de QA de coleta, que é
curta (um dia) e com lote reduzido; é a única sobreposição com o Apps Script, porque o corte só
acontece depois do QA (D-98).

Ordem: −1 → 0 → 1 → 2 → 3 → 4 → **4A** → **4B** → **4C** → 5 → 6, com a **7** podendo correr em
paralelo à 6, porque depende sobretudo do pipeline, que anda na sua trilha (15.0a). Cada fase de
4A em diante fecha com as jornadas da seção 24 que lhe cabem e com o golden set. A fase 5 (IA) vem
depois da 4B porque a análise de área e a camada de achados dependem dela; o que a 4C precisa dos
achados e do Início entra na própria 4C, para que nenhuma fase dependa de uma posterior
(D-105). Cada fase abaixo lista no fim os **acréscimos da
v0.2**.

### 15.−1 Fase −1 — Ativação na plataforma (não é sessão de código)

Responsável: o operador das instâncias (Urbiverso Ltda), acionado pelo dono da app. Cada item diz
quem tem a alçada. O checklist vira `docs/ativacao.md` da app e é conferido item a item na fase 0
(precedente: o checklist de ativação do `reg360`, `docs/operacao.md`; D-96).

1. Criar o repositório privado `UP-Urbita/app-inteligencia-imobiliaria` (dono da org UP-Urbita).
2. PAT *classic* `read:packages` da conta de serviço da UP em `URBIVERSO_PACKAGES_TOKEN`, no
   ambiente das sessões e nos secrets do repositório (o registry não autentica fine-grained).
3. Leitura do repositório para o usuário do PAT da Pinguim e da Laputa, ou a credencial do
   repositório cadastrada no modal Instalar app.
4. Na Pinguim (alçada `apps`): instalar do repositório, nível de aceitação `Releases`, auto-update
   ligado. Sem `Releases`, a release prerelease não chega, e a falha é calada.
5. Na Laputa (alçada `apps`), ao fim da fase 1: instalar do repositório, aceitação `homologado`,
   atualização manual.
6. `permissao_padrao = nenhuma` nas duas instâncias (alçada `usuarios`; C-56). Quem recebe
   `leitura`, `estrategico`, `curador`, `operador` e `admin` na Laputa segue em `[PENDENTE P-06]`.
7. Slots-base `poder` e `barato` autorizados para a app (alçada `integracoes`; C-06).
8. Cap global de arquivo informado (C-15, C-35); ele é o teto do `arquivo_max_bytes` do pipeline.
9. Cadência e horário das releases na Pinguim acertados (3.6)
   `[PENDENTE P-48]`.
10. Hosts do proxy de egresso só quando a medição da fase 3 pedir (alçada `sistema`; D-79).

**Pronto quando:** os itens 1 a 4 e 6 a 9 estão feitos e registrados em `docs/ativacao.md`; o
item 5 fica para o fim da fase 1, e o 10 só existe se a medição pedir.

### 15.0 Fase 0 — Preparação (1 a 2 PRs)

- Instalar o kit no repositório criado na fase −1 (`npx @urbiverso/kit-apps`): `apps/`,
  `pnpm-workspace.yaml` com catálogo, `release.yml`, `ci.yml`, `KIT.md`, skills. Dali em diante
  vale o protocolo do kit (18.2).
- Criar `apps/inteligencia_imobiliaria/` com `manifesto.json` mínimo, já com a `identidade`
  `UP-Urbita/app-inteligencia-imobiliaria::inteligencia_imobiliaria`, `schema.json` vazio,
  `backend/rotas.ts` com `rotas` vazio e o invólucro `rota(fn)`, `frontend/index.ts` com a tela
  "em construção" em `/`, `docs/README.md` apontando para esta spec e `docs/ativacao.md` com o
  checklist da fase −1.
- `testes/infra.ts` com o `req.dados` falso e o teste de contrato dele (18.1), para que a fase 1
  nasça testável sem instância.
- `scripts/exportar-planilha.mjs` e o primeiro retrato datado em `migracao/AAAA-MM-DD/` (11.3);
  `scripts/gerar-paridade.mjs` e `testes/fixtures/paridade/<data>.json` com os 30 valores de
  Mercado e Diagnóstico e os 10 cenários de mapa (18.1). Quem monta é o PR desta fase; o dono
  só aprova a lista de valores.
- `pnpm build && pnpm exec urbi-empacotar inteligencia_imobiliaria --dir apps/inteligencia_imobiliaria`
  limpo; primeira release pelo `release.yml` do kit (nasce prerelease); a Pinguim a instala sozinha.
- Conferir o checklist da fase −1 item a item. Escrever no README a grade de horários sugerida
  das rotinas (seção 4.1), que cada instância aplica na aba Rotinas na release que declara a
  rotina, porque o default de 06:00 UTC poria as treze no mesmo slot.

**Pronto quando:** a app aparece no menu da Pinguim com a tela vazia e `0.1.0`; o checklist da
fase −1 está conferido; a fixture de paridade existe e o dono aprovou a lista.

### 15.0a Trilha do pipeline (paralela, em outro repositório)

O pipeline Python **não muda de repositório com a app**: continua em
`rafaleandrog/inteligencia-real-estate`, com os workflows e as regras dele (R2.7, R2.8), publicando
o manifest e os arquivos em `data/public/`, que é público porque deriva só de fonte pública. A app
lê esse manifest pela URL `raw.githubusercontent.com` de `manifest_publico_url` (4.3): a app
privada não precisa de credencial para ler dado público. Mudança no pipeline é PR naquele
repositório; mudança no contrato que a app lê (12.2) é PR nos dois, com a versão do manifest como
amarra. Cada fase que precisa de conjunto novo (4, 4A, 7) começa com o PR do pipeline mergeado e o
conjunto publicado: é pré-requisito da fase, não entrega dela. A transferência daquele
repositório e o dono das credenciais seguem em R-25 `[PENDENTE P-44]`
(D-100).

### 15.1 Fase 1 — Fundação: território, cadastro, mapa (4 PRs: 1a a 1d)

**Schema:** `cidades`, `localidades`, `localidade_perfis`, `contornos`, `fontes_portal`,
`buscas_portal`, `anuncios`, `anuncio_eventos`, `lancamentos`, `lancamento_eventos`, `ancoras`,
`importacoes`, `achados_qualidade`, `alteracoes_cadastro`, `coletas`, `cursores_rotina`. Cada
tabela nasce com todos os seus índices (3.6).

**Subfases (v0.5), cada uma um PR com release na Pinguim:**

- **1a** esqueleto, território e importação: `cidades`, `localidades`, `localidade_perfis`,
  `contornos`, `importacoes`, `achados_qualidade`; semente; prévia e aplicar.
- **1b** cadastro de anúncios, lançamentos e âncoras (com `fontes_portal`, `buscas_portal`,
  `anuncio_eventos`, `lancamento_eventos`, `alteracoes_cadastro`), exportação CSV e `uso_eventos`.
- **1c** Mapa.
- **1d** Operação › Qualidade e migração dos passos 0 a 7 e 10 (com `coletas` e
  `cursores_rotina`).

**Backend:** `aoIniciar` com a semente, aguardada pelas rotas (4.2); rotas de 6.1, 6.2 (menos
comparáveis, verificar e por-url), 6.4, 6.9 (importações e qualidade); `comum/` com normalização
portada e testada; exportação CSV; `backend/metricas/` com mediana e percentis. Os contratos de
6.21 valem desde já: bloco ou campo que depende de tabela de fase posterior (retratos, grupos,
liquidez, `preco_inicial`) vem `null` com `indisponivel: { motivo: 'fase_futura', fase: '3' }`, e a
tela mostra "disponível a partir da coleta automática"; a fase que cria a tabela troca o `null`
pelo valor sem mudar a forma da resposta.

**Importação:** prévia + aplicar com aliases da planilha; passos 0 a 7 e 10 da migração
(sem a parte de rotina do 8), sobre o retrato datado (`migracao/AAAA-MM-DD/`), nunca sobre a
planilha viva. Reimportar o retrato seguinte em `atualizar` é o caminho de manter a app em dia até
o corte da fase 3.

**Frontend:** roteador de sub-rotas; Mapa com camadas 2, 5, 6, 7, 8, filtros, KPIs, detalhes
em três níveis, estado na URL; Cadastro (anúncios por formulário, lançamentos, âncoras,
contornos com importação de KML e desenho, localidades); Operação › Importações e Qualidade.

**Docs:** `docs/dados.md` (todas as tabelas da fase), `docs/importacao.md`.

**Pronto quando:** os anúncios, lançamentos, âncoras e contornos do retrato datado estão na
Pinguim pela importação, e o relatório de cada tabela fecha "importadas + rejeitadas com motivo =
linhas do retrato" (contagem gravada em `importacoes`); o aceite não usa número fixo, porque os 141
anúncios são a semente versionada do repositório do site (2026-09-19) e a planilha viva tinha 158 na
mesma data e cresce; reimportar o mesmo retrato não duplica nada; o mapa abre com os mesmos
filtros do site e o mesmo detalhe, e os 10 cenários de mapa da fixture de paridade conferem; um
curador cria, edita e remove um anúncio e o evento e a alteração ficam registrados; um CSV
exportado reabre na prévia da importação sem rejeição (colunas derivadas ignoradas com aviso). Ao
fim da fase a release é homologada e instalada na Laputa, com a planilha ainda como fonte de
verdade.

**Acréscimos da v0.2:** nenhum de desenho; a legenda com classes já era exceção prevista. O
roteador de sub-rotas já nasce com as rotas novas do `nav` apontando para "em construção".

**Acréscimos da v0.3:** `uso_eventos` desde o primeiro dia (D-72), para que a decisão de seguir
de fase use uso real; `comum/tipos.ts` com `Procedencia` e `ValorMetrica`; regra de
`CONFLITO_VERSAO` nos `PATCH` de cadastro; botão "Como ler" nas telas da fase; `comum/higienizar.ts`
(a coleta da fase 3 já nasce com ele).

### 15.2 Fase 2 — Mercado e Diagnóstico (3 PRs)

**Schema:** `ivv_mensal`, `ivv_regional`, `fipezap_mensal`, `pdad_observacoes`, `pdad_figuras`,
`procedencias`; `sql_declarado` `serie_pareada_fipezap`, `ranking_localidades_indicador`,
`cobertura_pdad`.

**Backend:** rotas 6.5 e 6.6; agregação por natureza e os seis derivados (portados de
`src/ivv/` com os testes); consolidação do PDAD (`aggregate.js` portado); kits de comparação
e dispersão; Base de dados.

**Importação:** passos 11 a 15, com a conferência publicado × recalculado do IVV.

**Frontend:** Mercado (10.3 itens 1 a 7), Diagnóstico com as quatro abas; `comum/indicadores.ts`.

**Pronto quando:** cada número que o site mostra hoje no Mercado e no Diagnóstico aparece
igual no app para o mesmo recorte: o `pnpm test` compara a app com os 30 valores de
`testes/fixtures/paridade/<data>.json`, tirados do código do site sobre o retrato datado, e o QA
confere a mesma lista na Pinguim; a Base de dados lista toda fonte importada.

**Acréscimos da v0.2:** `comum/metricas.ts` (catálogo com natureza, rateio e sentido, D-22,
D-35), que substitui `comum/indicadores.ts`; coroplética das localidades por qualquer métrica;
exceção de dispersão; estoque de lançamentos por status e VSO/LsO (D-32); déficit habitacional e
coabitação por importação; `cv_frac` e `erro_padrao` na PDAD com o aviso de cautela (D-29).

### 15.3 Fase 3 — Coleta, histórico e fechamento mensal (4 PRs: 3a a 3d)

A coleta automática nos portais depende do parecer jurídico sobre os termos de uso
`[PENDENTE P-45]`.

**Subfases (v0.5):**

- **3a** cliente HTTP, classificação e parsers: código puro, sem rotina, com as fixtures reais.
- **3b** `verificar_anuncios` e `descobrir_anuncios`, com `cursores_rotina`, trava por classe e
  `coleta_ativa`.
- **3c** `fechar_mes` e as métricas.
- **3d** candidatos, portões e as telas de Operação.

**Schema:** `candidatos`, `anuncio_retratos`, `metricas_anuncios_mensais`; `sql_declarado`
`mediana_preco_por_localidade`, `cobertura_anuncios`.

**Backend:** cliente HTTP pelo `fetch` global (D-79); classificação; parsers (genéricos + cinco
fontes) com fixtures reais colhidas pelo diagnóstico; rotinas `verificar_anuncios`,
`descobrir_anuncios`, `verificar_lancamentos`, `fechar_mes` com fatiamento, continuação e trava
em `cursores_rotina` (D-85); rotas
6.3, `/anuncios/por-url`, `/anuncios/:id/verificar`, comparáveis, métricas de anúncios;
eventos e erros da seção 13.

**Importação:** passo 8; recálculo total das métricas.

**Frontend:** Operação › Candidatos, Fontes, Execuções; Cadastro › anúncio por URL; Mercado
item 8; comparáveis no detalhe do Mapa; situação do anúncio e "confirmado no portal em".

**Docs:** `docs/coleta.md` com a postura, a classificação, os portões e o runbook do pedido de
proxy de egresso ao admin da instância, com a lista de hosts (D-79).

**Pronto quando:** é o único que termina na Laputa. **Na Pinguim**, na janela de QA (um dia,
lote reduzido): cada rotina de coleta roda com log limpo ou bloqueio registrado por fonte; um
candidato descoberto é promovido pelo portão e outro fica pendente pelo motivo certo; duas
continuações entregues em duplicata não processam o mesmo lote duas vezes (D-85); `coleta_ativa =
false` para a cadeia de continuações na fatia seguinte; e a janela fecha com `coleta_ativa =
false`. **Na Laputa**: o corte é feito no dia em que as rotinas de coleta são ligadas (gatilhos do
Apps Script removidos, abas de anúncios somente leitura); a rotina diária roda sete dias seguidos
com log limpo ou com bloqueio registrado por fonte (não com erro); o primeiro `fechar_mes` congela
o mês e as métricas conferem com um recálculo manual de três grupos; a decisão de pedir o proxy de
egresso (D-09, D-79) é tomada com o painel de Fontes como evidência.

**Acréscimos da v0.2:** `anuncio_grupos`, rotina `agrupar_anuncios` e a fila de agrupamentos
(D-26); `preco_inicial_brl` e as métricas ampliadas (D-25); `indice_oferta_mensal` (D-40), calculado desde já e mostrado na tela só quando a primeira base de 12 meses fechar;
`fonte_saude` e o erro `parser_degradado` (D-27); recorte por polígono e raio no Mapa (D-24);
seletor temporal dos retratos; pacote com proveniência (D-28).

### 15.4 Fase 4 — Território público e tráfego (2 a 3 PRs)

**Schema:** `conjuntos_publicos`, `conjunto_arquivos`, `agregados_territoriais`,
`trechos_rodoviarios`, `trecho_aliases`, `sentidos_oficiais`, `trafego_diario`, `corredores`,
`corredor_diario`.

**Pipeline (pré-requisito, 15.0a):** os conjuntos que a fase carrega, publicados; para o
acréscimo da v0.3, `equipamentos_publicos` (INEP, CNES, OSM; pontos com `fonte`, `id_fonte`,
`tipo`).

**Backend:** rotina `carregar_dados_publicos`; rotas 6.7, com a rota de arquivo que resolve a URL
assinada (D-81).

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

### 15.4A Fase 4A — Grade analítica (2 a 3 PRs)

**Schema:** `celulas`, `celula_metricas`, `localidade_composicao`; `h3_r9` em `anuncios`,
`lancamentos`, `ancoras` (preenchido por um passo de recálculo para o que já existe);
`sql_declarado` `contagem_por_celula`; a agregação do enriquecimento é código sobre `varrerTudo`
(D-83).

**Pipeline (pré-requisito, 15.0a):** conjuntos `celulas_r9`, `ibge_grade` e `aop_ipea` também em
tabela; `cnefe_2022`, `censo_2022_setores`, `composicao_localidades`; `restricoes_sitio`
(polígonos por tipo, simplificados a 5 m, mais a fração restrita por célula).

**Backend:** `comum/celulas.ts` (pertencimento por centroide, raio, polígono, polyline), rateio
pelo catálogo; carga tabular fatiada; rotas 6.10.

**Frontend:** camada hexagonal com legenda e procedência; série nominal × padronizada no
Diagnóstico.

**Pronto quando:** a soma de domicílios das células de cada RA bate com `agregados_territoriais`
dentro de 1%; o enriquecimento de três raios em volta de três pontos escolhidos confere com um
cálculo manual no QGIS; a série de domicílios de Planaltina aparece nominal e padronizada, com a
quebra de 2022 marcada; a camada hexagonal desenha o DF no zoom 12 sem travar no celular de
referência, com `hex_max_celulas_resposta` medido e fixado aqui (o `urbi-mapa` desenha em canvas
para "milhares de polígonos", sem número contratual; P-17 é medição, C-64); a carga de
`celula_metricas` cabe nas continuações do mês, com o throughput medido na Pinguim (C-28); a área
líquida de um polígono sintético com restrição conhecida confere com o cálculo vetorial; a grade
entra **sem** oferta por célula: enquanto a fração de anúncios ativos com coordenada exata no
recorte for menor que 50%, o entorno mostra a estatística da localidade, rotulada "da RA, não do
anel" (não há meta de volume como portão de fase); e o teste do golden set roda o dossiê sobre a
entrada congelada de cada área de referência e passa (24.2).

**Acréscimos da v0.3:** restrições do sítio como polígonos (a área líquida é vetorial) e a
fração restrita por célula, só para mapa e achados (D-61); natureza
`amostra` e `categorica` no catálogo e o catálogo inicial (D-67); `versao_metodo` e
`comum/versoes.ts` (D-70); `cache_calculos` e `geracao_cadastro` (D-69); rotinas
`recalcular_derivados` e `limpar_retencao`; `ResultadoEnriquecimento` como contrato; golden set
montado sobre entrada congelada (P-37, 24.2) e conferido no "pronto quando".

### 15.4B Fase 4B — Áreas, demanda e produto (3 a 4 PRs)

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

**Pronto quando:** na Pinguim, o QA cadastra áreas de prospecção, referência ou fictícias e gera
a ficha de uma página de cada uma; na Laputa, as áreas próprias da UP estão cadastradas
`[PENDENTE P-47]` e cada uma tem uma ficha de uma página gerada e baixada
em Markdown; uma pessoa sem `estrategico`, `curador` nem responsabilidade pela área não as vê; a
capacidade de pagamento de uma localidade confere com uma planilha feita à mão para três faixas de
renda; a mediana de R$/m² arrematado de uma localidade, por `destinacao_categoria`, confere com os
editais lidos à mão; um empreendimento aparece com lançamento, alvará e anúncios vinculados. A
seção de comércio da ficha sai omitida com o motivo ("disponível com Comércio e âncoras"), nunca
vazia nem zero; a J1 não depende dela.

**Acréscimos da v0.3:** estágios da escada de maturidade (D-55); dossiê nas quatro escalas e
`Dossie` como contrato (D-56); sítio no dossiê (área líquida); `cenarios_viabilidade`, as rotas
6.19, a tela de viabilidade e o mercado de lotes (D-63, D-64); leiaute da ficha de uma página;
jornada J1.

### 15.4C Fase 4C — Tese, diligência e portfólio (3 a 4 PRs)

**Schema:** `area_perimetros`, `area_sintese_itens`, `teses`, `tese_condicoes` (com
`hipotese_produto_id` opcional), `diligencias`, `hipoteses_ancora`, `hipoteses_produto` (v0.5:
área, tipologia, faixa de preço, unidades, `cenario_viabilidade_id`, natureza, status, evidências),
`area_eventos`, `observacoes_campo`; `achados_mercado`.

**Backend:** rotas 6.17 e 6.18; semente de perguntas de diligência (`comum/diligencia.ts`) e o
pré-preenchimento pelo app; agenda de decisão `[PENDENTE P-42]`; portfólio;
métrica monitorada nas condições; a rotina `calcular_achados` só com o tipo `condicao_em_risco` (os
demais tipos entram na fase 5); comparação de duas fichas da mesma área (6.11).

**Frontend:** abas Síntese e agenda, Tese, Diligência, Âncoras (sem simulação ainda), Linha do
tempo; Portfólio; modo campo; perímetros no mapa; **Início mínimo** em `/`, com condições vencidas
e diligências da semana (o Início completo é da fase 5); ação "Comparar com…" na lista de fichas.
Aviso de prazo ao responsável fica fora até decisão `[PENDENTE P-43]`.

**Pronto quando:** as jornadas J2 (sem a parte de âncora), J5 e J7 são feitas na Laputa por
alguém da equipe, e o QA as repete na Pinguim com áreas fictícias; uma condição com métrica
monitorada muda de status sugerido depois de um `calcular_achados`; um item `fato` sem evidência é
recusado com o erro certo.

### 15.5 Fase 5 — Análises por IA (2 PRs)

**Schema:** `analises_ia`.

**Backend:** `backend/ia/` (contexto por tipo, compactação, schema, validação de chaves,
gravação, evento de lacuna); rotina `gerar_analises_mensais`; rotas 6.8; slots no manifesto;
parâmetros de instruções com texto padrão.

**Frontend:** tela Análises; botões e blocos de análise vigente no Mapa, Mercado e
Diagnóstico; `estadoSlot` escondendo o que não resolve.

**Docs:** `docs/analises.md`, com o porquê do limite de requisições por minuto.

**Instalação (v0.5):** o admin da app sobe o limite de requisições de IA por minuto de 10 para
`30` (Config › IA › Configurações), na Pinguim e na Laputa; é passo do checklist da fase.
`gerar_analises_mensais` enfileira no máximo `ia_lote_por_fatia` análises por fatia (4.1).

**Pronto quando:** a análise de mercado do mês e a de três localidades são geradas na Pinguim,
todos os achados citam indicadores existentes, uma lacuna de lançamento vira evento e aparece
no inbox do curador, e o custo em tokens está dentro da faixa da seção 9.5.

**Acréscimos da v0.2:** os demais tipos de achado da seção 9.7 (D-21; a tabela `achados_mercado`
e a rotina `calcular_achados` entram na 4C); slot `analise_area` e a análise de área no dossiê e na
ficha; `achado_ids` no schema de resposta; Início completo (D-33; o mínimo entra na 4C);
`visoes_salvas`. O "pronto quando" ganha: toda análise do mês cita ao menos
três achados por `id`, e nenhum achado citado é desconhecido.

**Acréscimos da v0.3:** extensão do schema de `analise_area` (síntese, hipóteses, perguntas) e a
rota `/analises/:id/propor-sintese`; pesos e fórmula da pontuação (D-68); jornada J4. O achado
`condicao_em_risco` e o Início com condições vencidas e diligências da semana passaram para a 4C.

### 15.6 Fase 6 — Fechamento da migração (1 PR)

- A coleta da planilha já parou na fase 3 (gatilhos do Apps Script removidos, abas de anúncios
  somente leitura). Aqui as demais abas ficam somente leitura, e o `README.md` deste repositório
  passa a apontar para a app e marca o site como legado.
- Site estático congelado em uma tag; GitHub Pages pode seguir no ar como arquivo histórico ou
  ser desligado (decisão do dono).
- `docs/PRODUCT_PLAN.md`, `ARCHITECTURE.md`, `DATA_CONTRACT.md`, `SHEET_SETUP.md` recebem um
  aviso de que descrevem o legado.

### 15.6A Fase 7 — Comércio e âncoras (3 a 4 PRs; pode correr em paralelo à 6)

Lentes, Gi* e as camadas de MapBiomas e Open Buildings não aparecem em jornada nenhuma (R-36) e
dependem de decisão de escopo `[PENDENTE P-46]`; MapBiomas e Open Buildings
dependem também da credencial do Earth Engine (P-30). Nada sai do escopo até a decisão.

**Schema:** `pontos_comerciais`, `lentes`; `categoria_consumo` e `atratividade` em `ancoras`.

**Pipeline (pré-requisito, 15.0a):** `comercio_cnpj`, `comercio_osm`, `potencial_consumo`,
`mapbiomas_urbano`, `open_buildings`, `jobs_cep_2023`.

**Backend:** `comum/comercio/` (categorias, lacunas, Huff), `comum/espacial/` (similaridade,
score, Gi*, com significância por FDR e o Gi* de preço desligado até haver dado); rotas 6.13;
achados `lacuna_comercial` (na bacia da categoria) e `bolsao`.

**Frontend:** Comércio e âncoras (potencial e lacunas, simular, gêmeas, lentes); camadas de
pontos comerciais, expansão urbana e novas edificações; seção de comércio no dossiê e na ficha.

**Pronto quando:** a contagem de supermercados por RA confere com uma amostra verificada à mão
em duas RAs; a simulação de Huff de uma âncora existente, rodada como se ela não existisse,
devolve participação coerente com a localização dela, com a escala de atratividade declarada
(teste de sanidade, não de calibração); a
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
  as `areas_estudo` de `tipo = propria` aos imóveis da UP, por referência lógica (só o id, sem
  `tabela_ref`), quando a UP passar a cadastrar no núcleo. Os contratos estão publicados (C-81);
  o bloco do manifesto é

  ```jsonc
  "dependencias": {
    "urbiverso/modulos-urbiverso::imobiliario": {
      "versao_min": "1.2.0",
      "entidades": { "imoveis": ["ler"], "incorporacoes": ["ler"] }
    }
  }
  ```

  com a identidade nova (a antiga, `urbiverso/urbiverso::imobiliario`, já passou do gate), uma
  flag por entidade, toggles ligados pelo admin na aba Núcleo e `sdk_min ≥ 87` (já coberto). A
  leitura é por `req.modulos.imobiliario` ou `urbiVerso.modulo("imobiliario", …)` só em rota
  autenticada, **nunca em rotina** — então `vincular_empreendimentos` (7.8) não chama o módulo; o
  vínculo sai de uma rota que o curador aciona. O cadastro do núcleo tem tela própria em
  `/imobiliario` (≥ 1.2.0). Fica no Futuro por decisão de produto, não por falta de contrato.
- **Proxy de saída (D-09, revista pela D-79):** não é mais trabalho da app. Se a Pinguim medir
  bloqueio, a equipe pede ao admin da instância que inclua o host no proxy de egresso (Admin ›
  Variáveis); a infraestrutura do proxy (uma VPS mínima com `tinyproxy`, como o precedente do
  DJEN) é da instância. O runbook `docs/coleta.md` lista os hosts.
- **Páginas públicas:** se um dia parte do mapa voltar a ser pública, `paginas_publicas` com
  componente próprio sem tokens de tema e rotas `GET` em `rotasPublicas` filtrando o que é
  público; nada disso está desenhado.
- **Segunda cidade:** linha em `cidades`, localidades por importação, séries por importação;
  o que falta medir é o custo do IVV e do FipeZap de outra praça, que são publicações de outras
  entidades.
- **Isócronas (D-52):** tempo a pé e de carro a partir das áreas salvas, calculado no pipeline
  com motor de rota (r5r ou OSRM) e carregado como polígono; na V1, os anéis por raio cumprem o
  papel.
- **Raster direto no mapa, cluster de pontos e dois mapas sincronizados (D-52):** não existem no
  `urbi-mapa` do SDK 100 e não se constroem sobre `mapaLeaflet`; entram só por pedido ao shell
  (C-65; P-19 fechada).
- **Ficha do lote (D-52):** lote registrado com parâmetros urbanísticos, no modelo do GeoSampa,
  se o Geoportal publicar `[PENDENTE P-15]`.
- **ITBI (D-52):** tabela `transacoes_declaradas`, natureza "declarado", e o gap pedido ×
  declarado, quando houver acesso `[PENDENTE P-08]`.
- **Aviso de mudança relevante (D-52):** seção 13.
- **PDF e Word da ficha (D-93):** o SDK 100 não tem geração de documento (C-40); entram quando a
  plataforma publicar o contrato. Até lá a ficha sai em Markdown, CSV e pacote (P-20 fechada).

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
| D-09 | Coleta direta da instância com proxy de saída **opcional**, decidido por medição. *v0.4: o mecanismo muda pela D-79 — o proxy é o de egresso da instância, por host, e não mais parâmetro da app; a decisão (direto, proxy só se medir bloqueio) fica* | Exigir proxy desde o início; ou não prever | O charles3 provou o caminho; só vale pagar a VPS se o bloqueio aparecer |
| D-10 | Inativação com **2** confirmações em dias distintos | 3 (regra do repositório) | É o que a planilha roda hoje; com rotina diária confiável, 2 dias é latência suficiente |
| D-11 | `FIPEZAP_LOCALITY_MONTHLY` não é tabela: derivada por `sql_declarado` | Importar a visão larga | Era materialização para contornar o GViz; o banco pareia na leitura |
| D-12 | Uma escala só no banco (fração decimal), conversão declarada por fonte na importação | Guardar cada fonte na escala em que publica | Com duas escalas a regra do site era "nunca unificar"; no banco a unificação é feita uma vez, testada e registrada |
| D-13 | Permissão padrão **nenhuma**; liberação por pessoa. *v0.4: é operação do admin da instância (`permissao_padrao`), não contrato do manifesto (C-56)* | `leitura` para toda a instância | Pedido do dono, por enquanto |
| D-14 | Notificação só de erros de operação, mais o evento de lacuna de cadastro | Notificar candidato novo, reativação, queda de preço | Foco pedido; o resto entra quando houver uso |
| D-15 | Sem modo demonstração nem dado fictício | Manter `demo.json` | A instância de destino é de testes e recebe o dado real por CSV |
| D-16 | Repositório da app a decidir depois; a spec descreve a forma (`apps/<slug>/`) sem fixar onde. *v0.5: substituída pela D-95 (repositório na org UP-Urbita)* | Decidir agora | Pedido do dono: nesta rodada só a spec |
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
| D-47 | `reagir` exportado só com `continuar_coleta`. *v0.4: ganha o callback `analise_concluida` da própria app (D-82); continua sem reagir a evento de outro domínio* | Manter a v0.1 | A v0.1 se contradizia: a seção 7 já dependia dele |
| D-48 | Pertencimento à célula por centroide mais próximo, sem biblioteca H3 em execução. *v0.4: a biblioteca é permitida (C-74, D-93); a decisão fica até a medição da 4A* | Exigir a biblioteca no bundle | Tira a dependência de um contrato não confirmado; a lib substitui depois sem mudar schema |
| D-49 | Manifest 2 do pipeline com papel `tabela` (CSV), além do GeoJSON | Converter GeoJSON em linhas na app | Mantém o geoprocessamento no pipeline (D-05) e a app só carrega |
| D-50 | Três naturezas de preço (pedido, arrematado, declarado) nunca misturadas; mínimo de edital não é preço | Um "preço/m²" único | Confundir as três é o erro mais caro de uma leitura de terra |
| D-51 | Ordem das fases: 4A e 4B antes da 5; a 7 em paralelo à 6 | Fases novas depois da V1 | A IA de área depende da grade; comércio depende do pipeline |
| D-52 | Isócronas, raster no mapa, mapas sincronizados, ficha do lote, ITBI, aviso de mudança e PDF/Word ficam no Futuro | Incluir na V1 | Dependem de motor externo, de contrato não confirmado ou de acesso a dado |
| D-53 | Sem mapa de calor de densidade (kernel); a camada hexagonal cumpre o papel | Exceção de UI para kernel | O hexágono é conferível e já existe |
| D-54 | Ficha exporta Markdown, CSV e pacote na V1 | PDF desde já | PDF depende de contrato que o SDK 100 não tem (C-40; P-20 fechada) |
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
| D-79 | **O proxy de saída é da instância.** A coleta usa o `fetch` global, sem `dispatcher`; o bloqueio se resolve pondo o host no proxy de egresso da instância (Admin › Variáveis), a pedido da equipe ao admin. Saem `proxy_saida_url` e `undici.ProxyAgent` | Manter o proxy como parâmetro `secret` da app com `ProxyAgent` | C-34 (contrariado): "um `dispatcher` explícito da app ignora a regra" da instância; o proxy de egresso já existe, por host, configurado pelo admin. C-74: `undici` seria permitido, mas não há o que fazer com ele |
| D-80 | Visões salvas em **rotas pessoais**: `visoes_salvas` com `pessoal: true`, rotas em `rotasPessoais` (`/pessoal/visoes`), gravação com `leitura` | Visões só para `escrita` (o plano B da v0.3) | C-54: o SDK 94 publica exatamente essa via — o shell monta `rotasPessoais` com `POST`/`PATCH`/`DELETE` em `leitura` e impõe `usuario_id`. Fecha P-22 |
| D-81 | **A app nunca serve bytes.** A rota de arquivo de conjunto resolve `{ arquivo_id, sha256, bytes, url }` com `req.arquivos.url`; o frontend baixa pelo download do framework e memoiza por `sha256` | Rota da app servindo o GeoJSON com `ETag` e `Cache-Control: immutable` | C-39 (contrariado): "Nunca serve bytes diretamente" é contrato do tipo `arquivo`, e o download do framework não documenta cabeçalho de cache |
| D-82 | **IA assíncrona por `consultarAsync`** com callback declarado `analise_concluida`, escutado por `reagir`; `POST /analises/*` responde `202 { id }`, a rotina mensal enfileira em vez de esperar, e `analises_ia` ganha `status` | `consultar` síncrono dentro da rota ou da rotina | C-80: timeout de rota não documentado; `consultarAsync` + `aoConcluir` é o caminho sancionado. C-45, C-42: o orçamento de 15 min e o limite de 10 chamadas/min cabem melhor enfileirando |
| D-83 | **A grade analítica sai do SQL declarado:** agregação por célula em código sobre `varrerTudo` com filtro por array (`IN`) em lotes de 500 e `maximo` explícito; `celulas` e `celula_metricas` `restrito`; carga por `criarOuAtualizar` pela chave natural | Consulta declarada `agrega_celula_metricas` com parâmetro de lista; `listar` paginado na grade | C-26: não existe parâmetro de lista no `sql_declarado`. C-23: o filtro por array existe, sem teto documentado. C-27: `listar` sempre paga `COUNT(*)`. C-28: não há inserção em lote. Fecha P-16; P-21 vira medição |
| D-84 | **Fuso por parâmetro:** `fuso_organizacao` (padrão `America/Sao_Paulo`) e `intervaloDoDia()` do SDK em toda rotina que corta dia ou mês | Ler o fuso do `ctx` | C-33 (contrariado): o `ctx` de rotina não tem relógio nem fuso; o fuso só chega em `req.contexto.fuso`, em rota |
| D-85 | **Continuação por evento agendado, idempotente, com trava da app:** `agendar` com `Date` absoluta (minuto de granularidade, entrega pelo menos uma vez), trava e cursor com compare-and-set em `cursores_rotina` (`em_execucao_desde`, `coleta_id`, `versao`); `continuar_coleta` é evento visível e com texto para quem opera | Confiar no advisory lock do shell e num evento interno sem notificação | C-32: o lock cobre só rotina × rotina, e a continuação corre num listener. C-13: entrega at-least-once. C-08 (contrariado): evento interno sem notificação não existe |
| D-86 | **`nav` com onze folhas**, uma por área; as sub-telas viram `urbi-abas` com sub-rota no path | Nav de dois níveis com 45 itens | C-04 (contrariado): "Máximo de 20 itens no total (contando sub-itens)". Folhas uniformes deixam nove itens de margem e preservam os links de notificação |
| D-87 | **Estilo de feição nos campos do SDK** (`preenchimento`, `opacidadePreenchimento`, `contorno`, `espessura`, `opacidadeContorno`, `tracejado`, `marcador`, `rotulo`); ordem pelo array `camadas` e `ordem_camada`; precisão do anúncio por atributo de canvas, não por forma | Os campos da planilha (`fill_color`, `z_index`) e o losango para coordenada exata | C-62 (contrariado): `EstiloFeicao` não tem `fill_color` nem `z_index`. C-64: `losango` é nó DOM, inviável em 5 000 pontos. C-66: não há hover, o rótulo é permanente |
| D-88 | **Concorrência otimista por coluna `versao`** e `req.dados.atualizarSe`; o `409` manda a tela refazer o `GET` | Comparar `atualizado_em` lido pela tela | C-22: `atualizarSe` é o controle nativo; `atualizado_em` como `TIMESTAMPTZ` pode não casar por ISO. C-69: `detalhes` chega como `string[]`, então o registro atual não viaja no erro |
| D-89 | **Anexo não obrigatório expira** no TTL da instância (padrão 90 dias): `arquivo_origem` de contornos e áreas expira e a tela diz; a foto de campo vai para `observacao_fotos` com coluna obrigatória | Tratar todo anexo como permanente | C-41: "Anexo de coluna `obrigatorio` não expira"; os outros expiram e a Faxina apaga o blob. A foto é evidência (D-78); o arquivo de origem é cópia de conveniência |
| D-90 | **Séries macro em tabela** (`series_macro_config`), editável pelo operador | JSON num parâmetro `texto_longo` | C-07: parâmetro só aceita `bool`, `numero`, `string`, `texto_longo`; JSON cai no "não suportado". É o plano B escrito na v0.3 para P-24 |
| D-91 | **"Rodar agora" é do admin; a app pede carga por evento.** `POST /dados-publicos/carregar` publica `continuar_coleta` com `disparo = manual`; o listener roda a carga com a trava da app | Rota chamando o handler da rotina com o `ctx` guardado | C-05: "Rodar agora" exige `nivelApp = admin`. C-11: não existe verbo para a app disparar a própria rotina, e chamar o handler em linha corre fora do lock, do log e do corte de 15 min |
| D-92 | **Teto de transporte:** polyline na querystring até `polyline_max_vertices` (300); acima, área de estudo temporária; corpo JSON até 100 KB, então geometria colada ou importada vai sempre como arquivo | Polígono de centenas de vértices na URL e GeoJSON colado no corpo | C-77: o bundle não documenta teto de URL (a app assume 8 KB). C-78: "O corpo excede o teto de `100kb`" → `413`. C-20: sem teto de `json` documentado, cache e ficha guardam por bloco |
| D-93 | **Bibliotecas puras no bundle; PDF e Word no Futuro.** ZIP do pacote por `fflate`; `h3-js` autorizada quando a medição pedir; ficha em Markdown, CSV e pacote | Pacote em três downloads; PDF da ficha na V1 | C-74: "dependência nativa fica fora", e biblioteca pura em JS ou WASM entra sem permissão. C-40: o SDK 100 não tem geração de documento. Fecha P-18 e P-20 |
| D-94 | **"Ver tabela", legenda do mapa e posição do aparelho são da app:** `urbi-tabela` montado com os dados do gráfico; legenda como exceção registrada; `navigator.geolocation` com fallback de posição tocada, e foto por `<input type="file" capture>` | Esperar o primitivo oferecer | C-60, C-67, C-68 (ausentes no SDK) e C-71 (ambíguo): nenhum dos três existe no primitivo, e o modo campo precisa funcionar sem contrato de câmera e geolocalização. Fecha P-39 |
| D-95 | A app nasce no repositório privado UP-Urbita/app-inteligencia-imobiliaria, identidade UP-Urbita/app-inteligencia-imobiliaria::inteligencia_imobiliaria; este repositório fica com o site e o pipeline | reorganizar o repositório atual ou usar um repositório pessoal | apps da UP moram na org da UP (UP-Urbita/app-radar-sei, UP-Urbita/urbigis); ENGINEERING_RULES R1.1 e R1.3 proíbem build e backend Node; gate de identidade em 2026-10-28 (substitui D-16; fecha P-04) |
| D-96 | Fase −1 de ativação na plataforma, checklist de 10 itens com alçada por item, feita pelo operador das instâncias e registrada em docs/ativacao.md | deixar a ativação implícita na fase 0 | apps-em-repo-proprio.md § 7; checklist de ativação do reg360 |
| D-97 | Pinguim é teste (Releases, auto-update, QA); a equipe usa na Laputa (homologado, atualização manual) a partir do fim da fase 1; dado sigiloso nunca na Pinguim | usar a Pinguim como instância de uso | apps-em-repo-proprio.md § 8; reg360 operacao.md; a Pinguim recebe devs de fora |
| D-98 | Um coletor por vez também entre instâncias: na Pinguim coleta_ativa = false fora de uma janela curta de QA; os sete dias da fase 3 contam na Laputa depois do corte | coletar nas duas instâncias | §8.1 (uma requisição por vez por host); item 4 da revisão |
| D-99 | A unidade de planejamento é o PR (fatia vertical com release); fases como sub-issues de uma issue guarda-chuva; estimativa em PRs, recontada a cada fase | estimar em sessões | skill orquestrar; reg360 cresceu por versões pequenas |
| D-100 | O pipeline fica neste repositório em trilha própria; a app lê o manifest público sem credencial; conjunto publicado é pré-requisito das fases 4, 4A e 7 | levar o pipeline para o repositório da app | apps-em-repo-proprio.md § 2; workflows do pipeline já existem aqui |
| D-101 | req.dados falso tipado por Pick<HelperDados>, teste estático de sql_declarado, banco só via URBIVERSO_PG_TESTE_URL antes de release que muda sql_declarado | esperar dev-shell ou testar só na instância | apps-em-repo-proprio.md § 9 (não existe dev-shell); KIT.md; nobi testes/infra.ts |
| D-102 | Paridade e golden set sobre retrato datado e entrada congelada versionados; o teste local bloqueia a fase, a Pinguim é informativa | comparar com a planilha viva ou com dado vivo | nobi atendimento-golden.test.ts; reg360 importacao.md |
| D-103 | gerar-paridade.mjs recebe um checkout do site num commit fixado e grava o commit na fixture | copiar o código do site para o repositório da app | os repositórios são separados |
| D-104 | A fase seguinte só começa com QA na Pinguim, release na Laputa e uso real (jornada, ou 5 dias distintos em 2 semanas), mais o ok escrito do dono | portão subjetivo "foi usada" | skill orquestrar; reg360 operacao.md |
| D-105 | A 4C traz achados_mercado só com condicao_em_risco, o Início mínimo e hipoteses_produto; seção da ficha de fase posterior sai omitida com motivo | manter a 4C dependendo das fases 5 e 7 | o pronto quando da 4C usava o que só nascia na fase 5; a J1 usava lacunas da fase 7 |
| D-106 | Índices nascem com a tabela; no máximo uma release por dia útil fora do horário de uso; sem downgrade; migração pesada fora do boot (§3.6) | releases livres | overview.md (instalar reinicia o shell); distribuicao.md (downgrade proibido) |
| D-107 | Papel estrategico sob leitura abre as áreas próprias; os demais recebem 404 | sigilo só por curador, ou nenhum | permissoes.md (papel sob leitura); nobi papel gestor |
| D-108 | Parâmetro bool coleta_ativa lido a cada fatia; desligado, para continuações e rotas manuais (409 COLETA_PAUSADA) | confiar no toggle da aba Rotinas | rotinas.md (o toggle não cancela agendamentos); nobi atendimento_ativo |
| D-109 | Limite de IA sobe para 30 na fase 5; o lote mensal enfileira até ia_lote_por_fatia (8) por fatia, com intervalo de 2 min | pausa entre pedidos dentro da rotina | ia.md (o worker respeita requests_por_minuto); nobi integracoes.md |
| D-110 | Início mora em "/" e é a tela do Home do shell; rota desconhecida mostra "Página não encontrada" | Início em /inicio | overview.md (o shell põe Home, que abre "/"); radar_sei, charles3 e reg360 usam "/" |
| D-111 | Tags com prefixo intel-imob-, raiz app-inteligencia-imobiliaria, registro que só define a tag se ela ainda não existe | prefixo com o slug inteiro, ou @customElement direto | convenção de prefixo por app (radar-sei-*, charles3-*, reg360-*); o "Tentar novamente" do shell reavalia o bundle |
| D-112 | Semente como promise memoizada, aguardada por middleware; sem 503 APP_PREPARANDO | responder 503 até o fim da semente | overview.md (aoIniciar roda depois do listen); nobi seed.ts |
| D-113 | Sai agrupar_confianca_auto; grupo só conta sozinho com coordenada exata a ≤ 30 m, área ±1 m² e preço ±2% | limiar de confiança 0,90 | a app não guarda anunciante; 141 de 141 anúncios da semente têm coordenada por jitter |
| D-114 | O repositório da app segue o KIT.md e as skills do kit; merge e release só por ordem expressa | replicar o protocolo deste repositório | KIT.md; o ci.yml do kit já empacota cada app |
| D-115 | Nas tabelas filhas de uma área de estudo, ler é o da área (resolvido pelo pai) e escrever é escrita + ler da área, salvo quando a coluna Papel acrescenta "autor ou curador" | regra própria por tabela filha | uma regra só, e a matriz de acesso fecha por contagem exata (T4, item 13) |
| D-116 | O filtro de sigilo das áreas próprias entra na consulta antes da paginação e vale também para contagens | filtrar a página depois de lida | senão total e contagens revelam a área oculta, contra o 404 que não confirma existência (item 13) |
| D-117 | Código próprio 422 FONTE_CONFIG_INVALIDA para url_base ou cabecalhos inválidos ao salvar fonte | reusar URL_FORA_DAS_FONTES | este significa host fora da lista; ao salvar a fonte o host define a lista |
| D-118 | Nas ações síncronas de uma página o teto de 20 s é o total com redirecionamentos; estourou, 504 COLETA_TIMEOUT | 20 s por requisição (até 60 s com 2 saltos) | T5; nas rotinas o teto por requisição continua 20 s |
| D-119 | Desfazer importação só remove (lógico) as linhas criadas e não editadas; linhas atualizadas no modo atualizar não voltam: o relatório as lista e o caminho é reimportar o retrato anterior | Reverter as atualizações guardando o valor anterior de cada coluna | Guardar o antes de cada célula exigiria tabela de histórico; o retrato datado com sha256 já permite voltar (precedente reg360: sem desfazer em produção) |
| D-120 | A trava de classe é uma linha de cursores_rotina com rotina = "classe:<classe>", pelo mesmo compare-and-set da D-85 | tabela própria de travas | reaproveita o mecanismo sancionado (D-85, C-32) |
| D-121 | raio_bacia_m de partida por categoria (supermercado 1 500, farmácia 800, padaria 800, academia 1 500, escola 2 000, clínica 2 000, restaurante 1 000, pet 1 500, vestuário 3 000) | raio único | ponto de partida a conferir com a P-25 |
| D-122 | dias_ate_sair_mediana mantém o nome e passa a ser mediana de Kaplan-Meier; S(30) em permanencia_30_dias_frac | renomear | não quebra referências |
| D-123 | base_area vira dimensão de metricas_anuncios_mensais, R$/m² null na linha todas | colunas lado a lado | garante nunca misturar base de área |
| D-124 | hipoteses_produto.status em hipotese, sustentada, descartada | reaproveitar status de hipoteses_ancora | hipótese de produto não tem fase de conversa |

---

## 17. Pendências

P-11 (a contradição sobre `reagir`) foi resolvida pela D-47 e não aparece abaixo. Na v0.5 fecharam P-04 e P-23 e entraram P-42 a P-48. Na v0.4 a
conferência contra o SDK fechou P-05, P-16 a P-22, P-38 e P-39; elas ficam na tabela com a linha
"Fechada em v0.4", para o histórico.

| Código | O que falta | Impacto se não resolvido |
|---|---|---|
| P-01 | O que são `EMPLOYMENT_PRELIMINARY`, `EMPLOYMENT_RA_PROFILE` e `WORKPLACE_RA_2018` (fonte, ano, unidade) | Decidir se viram linhas de `agregados_territoriais`, tabela própria ou morrem na migração |
| P-02 | Texto padrão das instruções de IA dos quatro slots de análise | Fase 5 escreve a primeira versão; a equipe refina na Config |
| P-03 | Cabeçalhos exatos de `PDAD_A_FIGURE_MAP`, `FIPEZAP_SOURCES`, `FIPEZAP_NOTES`, `PDAD_A_GUIDE`, `LISTINGS_COVERAGE`, `PDAD_A_COVERAGE` (não alcancei a planilha além da nona aba) | As tabelas `pdad_figuras` e `procedencias` têm `extras` justamente para absorver o que não está modelado; confirmar na primeira importação |
| P-04 | **Fechada em v0.5:** repositório `UP-Urbita/app-inteligencia-imobiliaria` e identidade `UP-Urbita/app-inteligencia-imobiliaria::inteligencia_imobiliaria` (D-95) | — |
| P-05 | **Fechada em v0.4:** o horário é do admin da app na aba Rotinas, por hora cheia no fuso da organização (dia do mês de 1 a 28); não há dependência entre rotinas, e a ordem mensal é por horas distintas mais guarda de pré-condição (C-05, C-36). O README da app sugere os horários; o fuso das rotinas é o parâmetro `fuso_organizacao` (D-84) | — |
| P-06 | Quem são as pessoas da equipe que recebem `leitura`, `curador`, `operador`, `admin` na Pinguim | Liberação na instalação |
| P-07 | Se o GitHub Pages continua no ar como arquivo depois da fase 6 | Fase 6 |
| P-08 | Acesso ao ITBI da SEFAZ-DF (convênio ou LAI) | Sem o par pedido × declarado; fica no Futuro |
| P-09 | Se a segunda cidade é Campinas/RMC e quando | A grade e o dossiê funcionam lá; as telas de mercado ficam vazias com motivo |
| P-10 | Se vale contratar fonte paga de lançamentos (estilo Órulo) | Estoque por status depende de cadastro manual |
| P-12 | Formato e histórico dos dados de alvará e habite-se no portal da CAP/SEDUH | Licenciamento entra só por CSV manual |
| P-13 | Resultados da Terracap: leitura do DODF ou pedido direto à empresa | Arrematado entra à mão, edital por edital |
| P-14 | Licença de cada fonte nova (CNEFE, CNPJ, OSM, MapBiomas, Open Buildings, POF, AOP) | Conjunto sem licença não carrega |
| P-15 | Se o Geoportal publica lote registrado com parâmetros urbanísticos | Ficha do lote fica no Futuro |
| P-16 | **Fechada em v0.4:** o filtro por array existe e vira `IN`, sem teto documentado; o `sql_declarado` não tem parâmetro de lista. O enriquecimento é código sobre `varrerTudo` em lotes de 500 (C-23, C-26; D-83) | — |
| P-17 | **Fechada em v0.4 como pergunta ao SDK:** o `urbi-mapa` desenha em canvas "milhares de polígonos" sem número contratual; o teto vira medição do "pronto quando" da fase 4A, com `hex_max_celulas_resposta` 6 000 como valor inicial (C-64) | se a medição falhar, teto menor e r8 mais cedo |
| P-18 | **Fechada em v0.4:** bibliotecas puras (JS ou WASM) entram embutidas no bundle, sem lista de proibidas; só nativas ficam fora. ZIP por `fflate`; `h3-js` quando a medição pedir (C-40, C-74; D-93) | — |
| P-19 | **Fechada em v0.4:** raster, tiles próprios, cluster e mapas sincronizados não existem no SDK 100 e não se constroem sobre `mapaLeaflet`; ficam no Futuro, por pedido ao shell (C-65) | — |
| P-20 | **Fechada em v0.4:** não há geração de PDF ou Word no SDK 100; a ficha sai em Markdown, CSV e pacote, e PDF/Word ficam no Futuro (C-40; D-54, D-93) | — |
| P-21 | **Fechada em v0.4 como pergunta ao SDK:** o bundle não documenta limite de linhas nem orientação para tabela grande, e não há inserção em lote; a carga é `criarOuAtualizar` por cursor e o throughput é medido na Pinguim na fase 4A (C-28; D-83) | fallback: só células habitadas e catálogo inicial (R-45) |
| P-22 | **Fechada em v0.4:** sim, por `rotasPessoais` e tabela `pessoal: true` (SDK 94, shell 0.56.25) (C-54; D-80) | — |
| P-23 | **Fechada em v0.5:** estrato localidade × orientação, peso exógeno (Censo 2022 × dormitórios da PDAD), base nos primeiros 12 meses publicáveis, imputação de até 3 meses e publicação só com peso imputado ≤ 0,30 (seção 5.4); `indice_ano_base` sai de 4.3 | — |
| P-24 | Quais séries macro carregar (códigos e escalas) e se o custo de construção tem licença de uso | O bloco macro sai vazio |
| P-25 | Lista final de categorias de consumo, CNAEs e grupos da POF | Comércio começa por um conjunto mínimo (supermercado, farmácia, academia, escola, clínica) |
| P-26 | Geocodificação do CNPJ: por CEP, por endereço ou casada ao CNEFE | Pontos por CEP ficam fora de distância e de célula |
| P-27 | Calibração do expoente do Huff (sem dado de venda) | Simulação só serve para comparar cenários entre si |
| P-28 | Quem cadastra as áreas próprias da UP e de onde vem a lista oficial *v0.5: a fonte provável é o Urbigis/Magis; ver P-47* | Áreas próprias incompletas ou desatualizadas no Início e nas análises |
| P-29 | Se o IPEDF publica erro padrão ou CV por indicador, e qual limiar usar | Aviso de cautela só pela cobertura amostral |
| P-30 | Credencial do Earth Engine (ou alternativa) no Actions para MapBiomas e Open Buildings | Expansão urbana e novas edificações ficam fora da fase 7 |
| P-31 | Fontes e licenças de UC, APP e hidrografia, e do modelo de elevação para declividade, no DF | Restrições do sítio ficam incompletas; área líquida não é estimada |
| P-32 | Largura de APP adotada por padrão e quando usar a largura real do curso d'água | A área líquida usa a premissa de 30 m, declarada |
| P-33 | Se existe camada pública de situação fundiária (terra pública, Terracap) utilizável | A frente fundiária da diligência fica só humana |
| P-34 | CUB-DF: série, periodicidade e licença de uso | A viabilidade vertical exige custo de obra manual |
| P-35 | Premissas padrão da viabilidade (eficiência, fator sobre o CUB, despesas, impostos, margem, aproveitamento) validadas com a área financeira | Os padrões ficam marcados como ponto de partida |
| P-36 | Calibrar a tabela moradores → quartos com a PDAD por localidade | A matriz usa a tabela inicial declarada |
| P-37 | Escolher as três áreas do golden set e quem calcula os valores à mão | As fases 4A em diante não têm aceite numérico |
| P-38 | **Fechada em v0.4:** não; a Auditoria é trilha de eventos `auditavel` e a Utilização é só de IA. A app grava `uso_eventos` (C-83) | — |
| P-39 | **Fechada em v0.4:** sem contrato no SDK (C-68 ausente, C-71 ambíguo); o modo campo usa HTML puro para a foto e `navigator.geolocation` com fallback de posição tocada ou digitada (D-94) | se a instância restringir permissões, só o fallback (R-46) |
| P-40 | Perguntas padrão de diligência por frente, revisadas com o doc. 05 e com o jurídico | A semente começa com as perguntas do doc. 05, §61 |
| P-41 | Repertório oficial de modelos de parceria para hipóteses de âncora, a partir do doc. 03 | `modelo_parceria` fica texto livre |
| P-42 | Quem decide sobre uma área e quais transições da escada exigem decisão registrada; recomendação: tabela `decisoes_area` e papel `decisor` para a Direção (precedente: aprovações do nobi) | A agenda de decisão não registra quem decidiu; a Direção, só com `leitura`, não registra nada |
| P-43 | Se o aviso de prazo de diligência e de condição ao responsável pode ampliar a D-14; recomendação: notificação direta ao responsável por rotina diária (precedente: reg360 `checar_propostas_vencendo`) | Prazos só aparecem no Início, por consulta |
| P-44 | Quem responde por cada fonte manual e se o pipeline vai para a org da UP; recomendação: responsável nomeado por fonte e pipeline em repositório público na `UP-Urbita` | Fonte manual atrasada sem ninguém para cobrar; o manifest depende de um repositório pessoal |
| P-45 | Parecer sobre a coleta nos portais (termos de uso) e sobre IVV e FipeZap em exportação, pacote e IA; recomendação: parecer antes da fase 3 | Risco de violar termos de uso e de redistribuir dado licenciado |
| P-46 | Se lentes, Gi* e análise de tela, que não servem a nenhuma jornada, saem da V1 pela R-36; recomendação: mover para o Futuro e manter áreas gêmeas (J3) | Telas sem uso que custam construção e manutenção |
| P-47 | Confirmar que a lista oficial de áreas próprias é a do Urbigis/Magis ("MATRÍCULAS › Atuais (UP)") e nomear o curador que a espelha; recomendação: importar por KMZ com o id de origem | Áreas próprias incompletas ou desatualizadas no Início, no portfólio e nas análises |
| P-48 | Horário e cadência exata das releases na Pinguim, a acertar com o operador | release em horário de uso derruba as apps de outros na Pinguim |

---

## 18. Testes, qualidade e critérios de pronto

### 18.1 Testes da app (`testes/`, `node --test`)

Os testes rodam **sem instância e sem dev-shell**, que não existe (apps-em-repo-proprio.md § 9;
D-101):

- **Infra de teste (v0.5):** `testes/infra.ts` traz o `req.dados` falso em memória, declarado como
  `Pick<HelperDados, …>` dos métodos que a app usa, para que o typecheck acuse divergência de
  assinatura com o SDK (precedente: `criarDadosMock` do `nobi`). Um teste de contrato do falso
  cobre filtros com operador, array como `IN`, `atualizarSe` com `versao`, soft delete e
  `transaction` com rollback, citando a seção do `banco-de-dados.md` que cada caso espelha.
- **`sql_declarado` (v0.5):** todo `sql_declarado` tem teste estático no `pnpm test`: só `SELECT`
  ou `WITH`, sem `;`, sem aspas duplas, parâmetros usados = declarados. Teste que executa SQL contra
  banco lê `URBIVERSO_PG_TESTE_URL` e pula sem ela (convenção do `KIT.md`); roda na sessão local com
  um PostgreSQL descartável e, obrigatoriamente, antes de cada release que muda `sql_declarado`. O
  CI do kit não sobe banco para app; isso é aceito, e a execução real é conferida na Pinguim.

- **Puros (`comum/`):** normalização de número e data (paridade com `src/normalize.js` e com
  `toNumber_` do script, entrada por entrada); escalas (fração ↔ p.p. declarada; recusa fora da
  faixa); agregação por natureza (fluxo soma, estoque média, razão ponderada pareada,
  não-agregável recusa); mediana e percentil (listas vazias, pares, ímpares); ponto em
  polígono; jitter determinístico (mesma URL, mesmo ponto); orientação por tipologia;
  consolidação do PDAD (média entre localidades, soma de contagens, `suprimido` fora, os dois
  formatos de `purchase_*`); vocabulário de URL do mapa (ida e volta); `urlSegura()` (só
  `http`/`https`, o resto vira `null`); supressão por amostra (mediana com n ≥ 5, P25/P75 com
  n ≥ 10, variação entre meses com n ≥ 20 nos dois, abaixo disso `null` com `amostra_pequena`).
- **Parser:** uma fixture real por fonte e por caso (ativo com JSON-LD, ativo só com meta,
  inativo por marcador, bloqueado por captcha, listagem com `ItemList`), resultado esperado em
  JSON ao lado; o teste roda o parser contra a fixture e compara. Uma fixture de 2 MB falha o
  teste se o parser passar de 200 ms; expressões regulares sem quantificador aninhado (21.1).
- **Guarda de destino da coleta (v0.5):** tabela-verdade de host da fonte, subdomínio declarado,
  IP literal, `localhost`, `.local`/`.internal`, porta não padrão e redirecionamento para fora
  (`422 URL_FORA_DAS_FONTES` sem requisição; salto externo vira `redirecionamento_externo`);
  cabeçalho fora da lista fechada recusado.
- **Classificação de resposta:** tabela-verdade de status HTTP × corpo → resultado.
- **Portões de promoção:** cada portão com um candidato que passa e um que reprova, e a
  distinção duro × brando.
- **Rotinas:** handler com `ctx` falso (`dados` em memória, `eventos` que grava, relógio
  controlável): verificar com `ativa`/`inativa`/`bloqueada`, contagem de dias distintos,
  reativação, preço acima da variação máxima; descoberta com duplicata e com bloqueio;
  fechamento de mês idempotente (rodar duas vezes não muda nada); continuação por cursor;
  `coleta_ativa = false` fecha a fatia como `pausada` sem reagendar; segunda rotina da mesma classe
  de trava sai `adiada`; a guarda da cadeia mensal reagenda até 6 vezes e depois devolve `ok: false`
  com `cadeia_mensal_parada`. O `ctx` falso usa o mesmo `req.dados` de `testes/infra.ts`.
- **Importação:** CSV de cada aba da planilha (amostra de 20 linhas versionada em
  `testes/fixtures/planilha/`) → prévia sem rejeição; CSV com erro de cada tipo → rejeição
  nomeada; os quatro modos de duplicata. **Ida e volta (v0.5):** exportar → importar em `ignorar`
  dá zero rejeições e zero inserções, com as colunas derivadas e desconhecidas em
  `colunas_ignoradas`; célula de texto que começa com `=`, `+`, `-`, `@`, tabulação ou retorno sai
  com `'` na frente e volta sem ele; coluna numérica não é tocada.
- **IA:** montagem de contexto (chaves esperadas por tipo; compactação acima do limite);
  validação da resposta (achado com chave desconhecida é descartado e registrado).
- **Rotas:** `supertest` sobre o Router com o `req.dados` de `testes/infra.ts` e `req.contexto`
  falso: gate de papel (403 `PAPEL_EXIGIDO`), teto de `por_pagina`, CSV com BOM e `;`, `null` para
  ausência. **Invólucro (v0.5):** um teste percorre a pilha de cada Router exportado e reprova rota
  registrada sem `rota()`; outro prova que exceção num handler resolve a request. Campo de fase
  posterior vem `null` com `indisponivel.motivo = 'fase_futura'`, nunca omitido nem 0.
- **Frontend (v0.5):** teste estático que reprova a palavra `unsafeHTML` em `frontend/`; toda tag
  registrada por `frontend/registro.ts` tem o prefixo `intel-imob-` (a raiz é
  `app-inteligencia-imobiliaria`).
- **Grade e rateio (v0.2):** pertencimento por centroide contra uma fixture de pontos com o H3
  de referência calculado pelo pipeline (deve bater em 100% dos pontos fora da borda de
  projeção); raio e polígono → células; *encoded polyline* ida e volta; contagem soma, razão
  recalculada de numerador e denominador, média ponderada, `nao_agregavel` recusa; soma dos
  pesos de composição; série padronizada só para contagens; oferta por célula só com anúncios de
  `h3_r9`, e o rótulo "da RA, não do anel" abaixo de 50% de coordenada exata no recorte.
- **Oferta (v0.2):** regra de agrupamento com casos que casam e que não casam em cada
  tolerância, incluindo mesma fonte com `id_externo` diferente e plantas iguais no mesmo prédio
  por jitter (que nunca contam sozinhas: a contagem automática exige coordenada exata a ≤ 30 m,
  área ±1 m² e preço ±2%); métricas com `amostra_n` e `imoveis_n` lado a lado; índice
  estratificado em que só a composição muda e o índice fica parado, com imputação parada no
  terceiro mês e mês não publicado acima do peso imputado máximo; preço de saída nunca rotulado
  como venda; tempo de anúncio por Kaplan-Meier com ativos censurados e importados truncados à
  esquerda contra um caso calculado à mão, `null` abaixo de 20 eventos; R$/m² nunca mistura
  `base_area`.
- **Produto e comércio (v0.2):** capacidade de pagamento contra três casos calculados à mão
  (Price e SAC); matriz de composição em que demanda e oferta somam 1 cada no recorte, com o
  descompasso em p.p., e leitura de fluxo em unidades/ano só com fluxo dos dois lados; Huff com
  participações que somam 1 por célula, loja única com participação 1 e todas as lojas da rodada na
  mesma escala de atratividade; áreas gêmeas em que a referência é a mais próxima de si; lacuna
  comercial somada na bacia da categoria; Gi* numa grade sintética com bolsão conhecido, com
  significância por FDR (Benjamini-Hochberg, q = 0,05) e bolsão só com 3 ou mais células
  contíguas, e uma grade de ruído puro que não gera bolsão.
- **Terra e oferta futura (v0.2):** lote não vendido fora da mediana de arrematado; ágio;
  pipeline sem dupla contagem entre alvará e lançamento.
- **Achados (v0.2):** cada tipo com um caso positivo e um negativo; pontuação ordena; recorte
  sem amostra não gera achado; resposta da IA com `achado_id` desconhecido é descartada.
- **Carga tabular (v0.2):** troca de versão atômica (a leitura nunca vê o conjunto pela metade);
  retomada por cursor no meio do arquivo.
- **Gates (v0.2):** toda rota de cálculo é `GET` e responde para `leitura`; visões só do próprio
  usuário. **Matriz de acesso (v0.5):** `testes/matriz-acesso.test.ts` tem uma linha por rota ×
  perfil (autor, responsável, curador, estrategico, escrita sem relação, leitura sem
  `estrategico`) com o status esperado: quem não pode ler recebe `404 REGISTRO_NAO_ENCONTRADO`,
  quem lê e não pode escrever recebe `403 OBJETO_SEM_PERMISSAO`, e área própria some das listas
  para quem não tem `estrategico`, `curador` nem é responsável. A lista de rotas é conferida contra
  a pilha dos Routers por contagem exata: rota nova sem linha reprova (precedente: `MATRIZ` do
  `nobi`, `testes/papeis.test.ts`).
- **Método (v0.3):** `fato` sem evidência recusado; item da IA nasce `proposto` e `hipotese`;
  publicar tese torna a anterior `substituida`; encerrar área sem motivo recusado; condição com
  métrica monitorada gera `condicao_em_risco` ao cruzar o limiar; semente de diligências
  idempotente; pré-preenchimento marca `respondida_app` e não fecha a pergunta.
- **Sítio e viabilidade (v0.3):** área líquida **vetorial** (polígono − interseção com a união
  das restrições, em SIRGAS 2000 / UTM 23S) num polígono sintético com restrição conhecida, menor
  que uma célula; área abaixo de `area_liquida_min_ha` não estimada; residual vertical e de loteamento contra dois casos à mão;
  sensibilidade 3 × 3; premissa obrigatória ausente → `CENARIO_INCOMPLETO`.
- **Catálogo (v0.3):** natureza `amostra` recalcula a mediana dos pontos dentro da área (e não a
  das células); `categorica` devolve distribuição que soma 1.
- **Governança (v0.3):** a chave de cache muda com versão de conjunto, de método e com
  `geracao_cadastro`; `recalcular_derivados` não refaz o que já está na versão atual; frescor
  abre e fecha `FONTE_ATRASADA`; retenção apaga só o que venceu; higienização remove telefone,
  e-mail, CPF e nome de pessoa de uma fixture com todos eles.
- **Concorrência (v0.3, D-88):** dois `PATCH` com a mesma `versao`, o segundo recebe
  `CONFLITO_VERSAO`; `PATCH` em registro removido recebe `REGISTRO_REMOVIDO`.
- **Paridade (v0.5):** a app contra `testes/fixtures/paridade/<data>.json`, gerado por
  `scripts/gerar-paridade.mjs` com as funções de `src/` do site sobre o retrato datado de
  `migracao/AAAA-MM-DD/` (30 valores de Mercado e Diagnóstico, 10 cenários de mapa).
- **Golden set (v0.5):** para cada área de referência, `testes/fixtures/areas_referencia/<area>/`
  guarda a **entrada congelada** (geometria, extrato das células, métricas e pontos do maior anel,
  com `versoes_conjuntos` e data de corte) e o **esperado** calculado à mão por um analista sobre
  essa entrada, com data, versões e autor. O teste roda o código do dossiê sobre a entrada
  congelada e é ele que bloqueia a fase; ele também trava a contagem de casos, para que o golden
  set não encolha calado (precedente: `atendimento-golden.test.ts` do `nobi`).

Retrato novo, fixture de paridade nova ou entrada congelada nova só entram por PR que regenera os
arquivos e explica cada diferença (D-102).

Os testes **só leem a pasta da app** (regra do guia de apps em repositório próprio).

### 18.2 Portas

**Protocolo (v0.5).** No repositório da app vale o protocolo do kit, e a spec só aponta para ele:
`KIT.md` e as skills `especificar` (ideia → issue-spec), `implementar` (issue → PR), `orquestrar`
(arco de fases, seção 15), `revisar-pr-apps` (revisão contra o SDK instalado, nunca o monorepo) e
`qa` (Pinguim, nunca sysadmin). Issues e PRs ficam no repositório da app; o protocolo de issues do
`CLAUDE.md` deste repositório (labels, `logged-by-claude`) vale aqui, não lá, e se a equipe quiser
as mesmas labels lá elas vão na seção "Deste repositório" do `CLAUDE.md` da app. Merge e release
só por ordem expressa do dono na conversa (`KIT.md`; D-114).

- O `ci.yml` do kit roda typecheck, build, testes e o empacotamento de cada app (passo
  "Empacotar (validação)") em todo PR; a app não repete o empacotamento no script `test` (C-73,
  C-76). O release é pelo `release.yml` do kit (`urbi-release` via `npx @latest`), não pelo
  `pnpm exec`, e nasce prerelease.
- `pnpm test` verde em todo PR. A noturna contra o SDK novo é workflow próprio do repositório
  (`sdk-noturna.yml`, como no `nobi`). Opcional: `revisao-registrada.yml` como required check, a
  partir da linha de máquina do relatório da `revisar-pr-apps`. Os testes só leem a pasta da app,
  nunca fontes da plataforma (C-76). Teste com banco roda localmente antes de release que muda
  `sql_declarado` (18.1).
- QA na Pinguim pela skill `qa`, com o roteiro de cada fase derivado dos "Pronto quando" da
  seção 15, com o token do QA Principal (nunca sysadmin), relatório em `qa-relatorios/`. O QA
  repete a matriz de acesso de 18.1 com o pool de usuários de QA e usa só áreas de prospecção,
  referência ou fictícias.
- **Medidor de desempenho (v0.5).** `qa-relatorios/medidor/p95.mjs` mede os alvos de 21.1 na
  instância: lê `URBIVERSO_QA_URL` e o token do QA Principal (nunca o imprime), roda só `GET` de uma
  lista fechada de operações (lista, pontos por viewport, enriquecimento, dossiê por bloco com e sem
  cache, Huff, ficha), 30 chamadas por operação depois de 3 de aquecimento, uma por vez, e grava
  `qa-relatorios/AAAA-MM-DD-desempenho.md` com host, versão da app e do shell, p50, p95 e máximo
  por operação e o alvo ao lado. A lista nunca contém rota com `homolog`, `upgrade`, `release` ou
  `atestado`. O QA de cada fase anexa o relatório ao PR (precedente: `qa-relatorios/simulador/` do
  `nobi`).
- **Promoção.** Release só vai à Laputa depois do QA na Pinguim e da homologação
  (`prerelease=false`), que é ato humano; releases respeitam a cadência e as regras de 3.6, e não
  há downgrade.

### 18.3 Critério global de pronto da V1

1. Todas as fases 0 a 7 (incluindo 4A, 4B e 4C) instaladas na Laputa pela release homologada, e
   a Pinguim com aceitação `Releases` e auto-update ligado; só então a versão é `1.0.0`.
2. Migração conferida (seção 11.3), planilha congelada, Apps Script sem gatilhos.
3. Paridade de 30 valores com o site (fase 2) e de 10 cenários de mapa (fase 1), sobre o retrato
   datado da fixture.
4. Sete dias de rotinas na Laputa com log limpo ou bloqueio registrado.
5. Os "pronto quando" das fases 4A, 4B, 4C e 7 conferidos, incluindo as validações amostrais à
   mão (enriquecimento, capacidade, Terracap, contagem de comércio) e o golden set.
6. As sete jornadas da seção 24 feitas por pessoas da equipe na Laputa, cada uma dentro da meta
   de tempo.
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
| R-38 | 5 | **Contexto de análise retido ou usado pelo provedor de IA**: o SDK não documenta retenção nem uso dos dados (C-46) | nunca dado pessoal no contexto (22.2); `cache` desligado nas análises; a política é a do contrato do admin da instância com o provedor de cada slot, registrada no README |
| R-39 | 3 | **Egresso da instância bloqueado ou restrito** sem que a app saiba: o bundle não documenta restrição de saída, e o proxy é decisão do admin (C-34) | estado da fonte em tela (8.4); hosts candidatos listados no README; o pedido ao admin é parte do runbook (D-79) |
| R-40 | 3, 4A | **Transação longa demais** num lote de 500 linhas: o bundle não documenta limite de tempo nem de tamanho de `transaction()` (C-25) | nada de HTTP ou IA dentro da transação; lote menor se a medição na Pinguim pedir |
| R-41 | 1, 4B, 4C | **Arquivo original some em 90 dias** pela expiração de anexo não obrigatório (C-41) | `observacao_fotos` com coluna obrigatória; a tela diz "arquivo original expirado"; a geometria fica na linha (D-89) |
| R-42 | 1, 4A, 4B | **Limites de transporte não documentados** — URL, timeout de rota, tamanho de resposta e compressão (C-77, C-79, C-80) | polyline até 300 vértices (D-92); geometria da grade separada dos valores; dossiê por bloco; IA assíncrona (D-82) |
| R-43 | 4 | **Cap global de arquivo e memória da rotina desconhecidos**: o `enviar` só aceita `Buffer` e o processo é compartilhado (C-15, C-35, C-38) | um arquivo por vez; `arquivo_max_mb` no pipeline; cap conferido na fase 0; `DADOS_ARQUIVO_MUITO_GRANDE` tratado |
| R-44 | 4, 4A | **Disco cresce sem cota nem dedup**: o shell guarda cada blob, e conjunto substituído dobra o espaço (C-37) | `limpar_retencao` apaga os arquivos de conjunto substituído há mais de 30 dias por `deletarVarios` (21.6) |
| R-45 | 4A | **Carga de um milhão de linhas sem inserção em lote** não fecha no mês, e a continuação é entregue pelo menos uma vez (C-13, C-28, C-32) | cursor com compare-and-set e trava da app (D-85); throughput medido na 4A; fallback de só células habitadas e catálogo inicial (D-83) |
| R-46 | 4C | **Câmera e geolocalização bloqueadas** por uma `Permissions-Policy` futura da instância, que o bundle não documenta (C-71) | foto por `<input type="file">` e posição tocada ou digitada como caminho sempre disponível (D-94) |
| R-47 | 4B a 5 | **área própria vaza por agregado (portfólio, total, Início, achados, contexto de IA da cidade ou localidade) mesmo com o detalhe em 404** | filtro antes da paginação, achados de área própria fora de análises compartilhadas, matriz T4 com leitura sem estrategico em toda rota de área |
| R-48 | 3 | **Apps Script e app, ou Pinguim e Laputa, coletando o mesmo portal ao mesmo tempo** | corte no dia da ligação na Laputa; coleta_ativa = false na Pinguim fora de janela curta de QA |
| R-49 | todas | **cada release reinicia a Pinguim inteira; índice em tabela grande alonga o boot ou deixa a app !saudavel** | §3.6: índices na criação, uma release por dia útil |
| R-50 | 4B, 4C | **área própria ou tese real cadastrada na Pinguim, que recebe devs de fora** | regra em §15 e §3.6; QA só com áreas de prospecção, referência ou fictícias |

---

## 21. Requisitos não funcionais

### 21.1 Orçamento de desempenho (p95 na Pinguim, com dado público real do DF)

| Operação | Alvo | Se passar |
|---|---|---|
| Lista paginada de qualquer tabela (exceto a grade, que nunca é lida por `listar`; C-27) | 800 ms | índice ou `sql_declarado` |
| Pontos ou células do mapa por viewport (valores; a geometria dos hexágonos vem em blocos memoizados), sem contar com compressão (C-79) | 1,5 s | baixar o teto ou agregar em r8 |
| Enriquecimento de três anéis | 3 s | cache (D-69) |
| Dossiê completo, sem cache / com cache | 8 s / 1 s | já é pedido por bloco, em chamadas separadas, porque o timeout de rota não é documentado (C-80); cache por bloco |
| Simulação de Huff, viabilidade, matriz | 3 s | cache |
| Gerar ficha | 10 s | congelar a partir do dossiê em cache |
| Abrir o app no celular (primeira tela útil) | 3 s em 4G | carregar camadas sob demanda |

A Pinguim é a instância de teste: os alvos são medidos lá com dado público e anúncios reais e
com áreas de prospecção, referência ou fictícias, nunca áreas próprias (que só existem na
Laputa; seção 14). O QA de cada fase mede os alvos das telas dela e registra no PR. A **fase 0**
confere na Pinguim o que o bundle não publica: o cap global de arquivo (C-15, C-35) e, na fase
4A, o throughput da carga da grade (C-28).

**Medidor (v0.5).** `qa-relatorios/medidor/p95.mjs` mede os alvos da tabela na instância: lê
`URBIVERSO_QA_URL` e o token do QA Principal (nunca o imprime), roda só `GET` de uma lista
fechada de operações (lista, pontos por viewport, enriquecimento, dossiê por bloco com e sem
cache, Huff, ficha), 30 chamadas por operação depois de 3 de aquecimento, uma por vez, e grava
`qa-relatorios/AAAA-MM-DD-desempenho.md` com host, versão da app e do shell, p50, p95 e máximo
por operação e o alvo ao lado. A lista nunca contém rota com `homolog`, `upgrade`, `release` ou
`atestado`. O QA de cada fase anexa o relatório ao PR e reprova operação acima do alvo
(precedente: `nobi/qa-relatorios/simulador/api.mjs`).

**Orçamento de CPU (v0.5).** Todas as apps rodam no mesmo processo Node da instância
(guia-desenvolvimento.md § 8): CPU presa na app trava o shell e as outras apps. Por isso nenhum
trecho síncrono da app passa de ~50 ms:

1. O que varre a cidade inteira (Gi*, lacunas comerciais por célula, `celula_metricas`,
   achados) só roda em rotina e grava resultado; a rota lê o resultado, nunca recalcula para o
   DF.
2. Cálculo por pedido (enriquecimento, Huff, matriz, viabilidade) é limitado pelos tetos da
   21.2 e por `hex_max_celulas_resposta`, passa pelo cache (D-69) e, em laço acima de 1 000
   itens, cede ao event loop (`await cederAoLaco()` de `comum/`, `setImmediate` a cada 1 000
   iterações).
3. Mediana e percentil ordenam só a amostra do recorte, nunca a tabela.
4. Parser: corpo até 2 MB (8.2); expressões regulares sem quantificador aninhado; teste com
   fixture de 2 MB que falha acima de 200 ms.
5. Sem `worker_threads` na V1: o bundle é arquivo único e o SDK não o documenta.

O medidor acima é quem confere o efeito: operação acima do alvo reprova no QA.

### 21.2 Limites de entrada

Polígono até `poligono_max_km2` e `poligono_max_vertices`; polígono na querystring até
`polyline_max_vertices` (D-92); raio até `raio_max_m`; até 4 anéis; até 6 áreas em comparação;
até 12 métricas por pedido de enriquecimento; `por_pagina` até 100; exportação até 50 000 linhas.
Acima, o erro da seção 6.22, com o limite numa linha de `detalhes`.

Limites da plataforma (v0.4): corpo JSON até **100 KB** (`413 CORPO_MUITO_GRANDE`, C-78); upload
até o `tamanho_max_mb` da coluna, limitado pelo cap global da instância, que o bundle não publica
(os 20 e 50 MB desta spec valem só se a instância permitir; `DADOS_ARQUIVO_MUITO_GRANDE`, C-38);
`upload_id` válido por 10 min (C-38); URL sem teto documentado, e a app assume 8 KB (C-77, R-42);
entrada de IA até 512 KB e saída até 16 000 tokens (C-42).

### 21.3 Formatos e fuso

Tela em pt-BR: `1.234,5`, `R$ 1.234.567`, `5,7%`, `16/10/2026`. Banco e API em ISO, frações
decimais, `null` para ausência. Mês de referência no fuso da organização: em rota, o de
`req.contexto.fuso`; em rotina, o parâmetro `fuso_organizacao` com `intervaloDoDia()`, porque o
`ctx` de rotina não traz fuso (D-84, C-33). Áreas em m² no banco e em hectares na tela acima de
1 ha.

### 21.4 Celular

Todas as telas de leitura e o modo campo usáveis a 390 px. O dossiê no celular mostra uma escala
por vez, sem tabela larga fora de `overflow` próprio. Editores de tese e de premissas são
desktop-first, mas não quebram no celular.

### 21.5 Acessibilidade

Cores só por tokens; nenhuma informação só por cor (classes e naturezas com rótulo); todo gráfico
com "ver tabela", que é um `urbi-tabela` montado pela app com as mesmas `categorias` e `series`,
porque o primitivo de gráfico só oferece `aria-label` e `<title>` por elemento (C-60, D-94); foco
visível e navegação por teclado nos primitivos `urbi-*`.

### 21.6 Reprodutibilidade

Toda ficha, análise e cenário guarda as versões dos conjuntos e o `versao_metodo`; `/sobre/versoes`
diz o que está em uso agora. Refazer uma ficha antiga com as versões dela é possível enquanto os
conjuntos daquela versão existirem; conjunto substituído fica registrado com hash, mesmo quando
seus arquivos são apagados. Os arquivos saem por `deletarVarios("conjunto_arquivos", { filtros:
{ conjunto_id } })` dentro de `transaction()`, que leva os blobs junto, e nunca por
`req.arquivos.remover`, que recusa coluna obrigatória (`409 ARQUIVOS_COLUNA_OBRIGATORIA`); quem
apaga é `limpar_retencao` (7.13; C-41, R-44).

---

## 22. Dados pessoais e sigilo

### 22.1 Inventário

| Dado | Onde | Tratamento |
|---|---|---|
| Usuários (id, nome, `avatar_url`) | shell, pela view de diretório; `autor_id` e afins com `campos_incluir` (C-29) | o mínimo para autoria e auditoria; a app não lê `email` nem `tipo` |
| Telemetria de uso | `uso_eventos` (`pessoal`, `restrito`; `usuario_id` é dado pessoal) | gravada pela rota pessoal `POST /pessoal/uso`; agregada sem nome na tela; retenção curta, apagada por `limpar_retencao` (D-72) |
| Corretor ou anunciante pessoa física | páginas lidas na coleta | **não** é guardado: higienização do `bruto` (D-74) |
| CNPJ de empresário individual e MEI | pipeline `comercio_cnpj` | só categoria, CNAE, porte e localização; sem nome nem documento |
| Arrematante de licitação, responsável técnico de licença | editais, DODF, licenças | não é guardado |
| Fotos de campo | `observacao_fotos.foto` | orientar a não fotografar pessoas; foto com pessoa identificável é apagada a pedido |
| Áreas próprias e teses | `areas_estudo` (`tipo = propria`) e tudo que pende delas (seção 14) | sigilo comercial: só quem tem `estrategico` ou `curador`, ou é o responsável, vê; para os demais, `404` e ausência em listas e exportações (v0.5). Ficha e pacote marcados "uso interno". Só existem na Laputa, nunca na Pinguim. Lista oficial: `[PENDENTE P-47]` |
| Trilha de saídas de área própria | `area_eventos` (usuário, ação, data) | ficha, pacote, exportação e análise de IA de área própria gravam quem gerou; não há trilha de visualização, que seria telemetria nominal (R-35) |

### 22.2 Regras

- Nenhum dado pessoal sai em exportação, pacote, ficha ou contexto de IA.
- Área própria não sai para quem não a vê (seção 14), nem em exportação; quem a vê e a leva para
  fora deixa o registro em `area_eventos`. Na Pinguim (instância de teste, com devs de fora) não
  entra área própria, tese nem cenário real.
- O contexto enviado ao provedor de IA leva números, achados e textos de síntese, nunca nome de
  pessoa.
- A ficha registra quem a gerou; o pacote leva o nome do arquivo e a data, não o usuário.
- Agente com token tem exatamente os gates de uma pessoa do mesmo nível, inclusive nas rotas
  pessoais; token `somente_leitura` recebe `403 AUTH_TOKEN_SOMENTE_LEITURA` em mutação, erro de
  plataforma, não ramificação da app (C-55). Como a persona Agente (1.4) só lê, o README da app
  recomenda emitir o token dela como `somente_leitura`.
- O SDK não documenta retenção nem uso dos dados pelo provedor de IA (C-46): a política é a do
  contrato do administrador da instância com o provedor configurado em cada slot, e o README da
  app pede que ela seja registrada na instalação. A app não liga `cache` nas consultas de análise
  (contexto sempre diferente; evita manter o prompt no provedor). O histórico de IA do shell
  guarda metadados das chamadas; o doc não diz se guarda o contexto (R-38). A análise de IA de
  área própria segue as mesmas regras (sem dado pessoal; política de retenção do contrato do
  admin) e grava a saída em `area_eventos`.
- O uso de IVV e FipeZap (dado de terceiro) em exportação, pacote e contexto de IA, e a coleta
  automática nos portais, dependem de `[PENDENTE P-45]`.

---

## 23. Calendário e frescor das fontes

Valores iniciais de `comum/fontes.ts`, a calibrar com a primeira carga de cada fonte. Quando a
fonte passa do frescor, o rodapé de procedência mostra "fonte atrasada" e o Início lista.
A Operação › Saúde (10.7) lista as atrasadas junto com as bloqueadas e a cadeia mensal (v0.5).

A coluna **Dono** (v0.5) nomeia quem responde por cada fonte: quem a carrega quando é manual
(IVV de PDF, Terracap, licenciamento, faixas de programa) e quem acompanha o pipeline quando é
pública. Hoje nenhuma tem responsável nomeado, e a escolha é do dono da app.

| Fonte | Periodicidade | Frescor esperado | Observação | Dono |
|---|---|---|---|---|
| Anúncios (coleta) | diária | 2 dias | atraso = rotina parada ou fonte bloqueada | `[PENDENTE P-44]` |
| IVV | mensal | 75 dias | publicação de terceiro; atraso não é erro da app | `[PENDENTE P-44]` |
| FipeZap | mensal | 45 dias | | `[PENDENTE P-44]` |
| Séries do Banco Central | mensal | 45 dias | | `[PENDENTE P-44]` |
| CUB-DF | mensal | 60 dias | `[PENDENTE P-34]` | `[PENDENTE P-44]` |
| Terracap | por edital | 120 dias | sem edital no período não é atraso; o aviso só diz "sem licitação recente" | `[PENDENTE P-44]` |
| Licenciamento (CAP/SEDUH) | mensal | 60 dias | `[PENDENTE P-12]` | `[PENDENTE P-44]` |
| CNPJ | mensal | 60 dias | | `[PENDENTE P-44]` |
| OpenStreetMap | contínua | 90 dias | | `[PENDENTE P-44]` |
| PDAD | cerca de bienal | 900 dias | a idade aparece em todo número | `[PENDENTE P-44]` |
| Censo, Grade, CNEFE | decenal | — | a idade aparece em todo número; sem alerta | `[PENDENTE P-44]` |
| AOP (Ipea) | pontual | — | marcado como base 2017–2019 e população de 2010 | `[PENDENTE P-44]` |
| MapBiomas | anual | 450 dias | | `[PENDENTE P-44]` |
| Open Buildings | pontual | — | até 2023 | `[PENDENTE P-44]` |
| Tráfego do DER | conforme publicação | 120 dias | | `[PENDENTE P-44]` |
| PDOT | por revisão do plano | — | a vigência aparece na ficha da zona | `[PENDENTE P-44]` |

---

## 24. Jornadas e aceitação

### 24.1 As sete jornadas

Cada jornada é feita por uma pessoa da equipe, na **Laputa**, com dado real, e é o aceite das
fases indicadas: a jornada feita, com data e quem, é a condição (c) do portão entre fases (seção
15). Na Pinguim o QA repete as jornadas só com áreas de prospecção, referência ou fictícias. O
tempo é uma meta de uso, não de desempenho.

| # | Jornada | Persona | Passos | Saída esperada | Fases |
|---|---|---|---|---|---|
| J1 | **Triar uma gleba nova** | analista | importar o KMZ ou desenhar; ver o sítio (área líquida, PDOT, restrições); ver o entorno nos anéis; ver terra e oferta; registrar três itens de síntese; gerar a ficha de uma página (sem a seção de comércio, que sai omitida com o motivo até a fase 7) | ficha baixada, área no estágio `sinal` ou `hipotese`, em até 30 min | 4A, 4B |
| J2 | **Definir produto para uma área própria** | analista | demanda e capacidade; matriz; benchmark de lançamentos; dois cenários de viabilidade (vertical e loteamento); registrar duas hipóteses de produto (`hipoteses_produto`) com condições | cenários salvos, hipóteses de produto com condições e métrica monitorada | 4B, 4C |
| J3 | **Preparar a conversa com uma âncora** | analista | potencial e lacuna da categoria; simulação de Huff em dois portes; áreas gêmeas; hipótese de âncora com "traz/traz"; ficha detalhada com a seção de âncora | hipótese registrada, ficha baixada | 7 |
| J4 | **Revisão mensal do mercado** | direção | Início; análise de mercado; achados do mês; portfólio | leitura em até 15 min; três achados citados na reunião têm link para a origem | 5 |
| J5 | **Acompanhar o portfólio** | direção | portfólio; condições vencidas e diligências da semana no Início mínimo; abrir uma área e ver a linha do tempo; comparar a ficha atual com a anterior | sabe o que mudou em cada área própria sem abrir planilha, separando "mudou o dado" de "mudou a medida" | 4C, 5 |
| J6 | **Curadoria semanal** | curador, operador | candidatos; grupos e vínculos; saúde das fontes; frescor; qualidade | filas zeradas ou com motivo, em até 45 min | 3, 4B |
| J7 | **Visita de campo** | analista | abrir a área no celular; ver anéis, perímetros e restrições; registrar duas observações com foto | observações na linha do tempo, com posição | 4C |

Lentes de aptidão, Gi*/bolsões e a análise de tela não aparecem em jornada nenhuma; pela R-36
seriam candidatas a sair para o Futuro, o que depende de decisão `[PENDENTE P-46]`.

### 24.2 Áreas de referência (golden set)

Três áreas escolhidas pela equipe, uma de cada tipo (própria, prospecção, referência)
`[PENDENTE P-37]`. Os aceites numéricos usam o **retrato datado** (`migracao/AAAA-MM-DD/`, com
sha256), nunca a planilha viva nem o dado vivo da instância. Para cada área,
`testes/fixtures/areas_referencia/<area>/` guarda a **entrada congelada** (geometria, extrato das
células, métricas e pontos do maior anel, com `versoes_conjuntos` e data de corte) e o
**esperado** calculado à mão por um analista sobre essa entrada (domicílios por anel, distribuição
de renda da RA, R$/m² mediano, área líquida, residual de um cenário, participação de Huff de uma
categoria), com data, versões e autor. Toda fase de 4A em diante roda o código do dossiê sobre a
entrada congelada, em `node --test`, sem instância: diferença acima de 2% em contagem, ou acima de
5% em estatística de amostra, bloqueia a fase até ser explicada. Na Pinguim a conferência é
informativa e só compara quando as versões dos conjuntos coincidem com as da fixture; versão nova
de conjunto não reprova nada e pede, se quiserem, uma fixture nova com novo cálculo à mão. A área
própria do golden set tem a entrada congelada no repositório privado, e nunca é carregada na
Pinguim.

