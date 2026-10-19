---
titulo: Importação
descricao: Como os dados entram na app — CSV com prévia, aplicar e desfazer; KML/KMZ de contornos; carga por agente.
---

# Importação

Todo dado entra pelo mesmo fluxo, com as mesmas validações e o mesmo registro em
**Operação › Importações**.

## Para quem usa

1. **Escolha a tabela e o modo** ("Ignorar", "Atualizar" ou "Recusar se já existir") e envie o CSV.
   "Baixar modelo" traz o cabeçalho esperado. O CSV pode ter `;` ou `,`, com ou sem BOM; os
   cabeçalhos da planilha antiga são aceitos (`ra_geo_id`, `polygon_id`, `female_pct`…).
2. **Prévia.** O arquivo é lido e validado por inteiro, sem gravar nada: quantas linhas entram,
   quantas atualizam, quantas são ignoradas e cada rejeição com linha, coluna e motivo. Colunas
   que a app calcula (como `versao` ou `id`) e colunas desconhecidas são ignoradas com aviso, sem
   rejeitar a linha.
3. **Valor padrão.** Se uma coluna obrigatória está vazia nas linhas rejeitadas (o caso do ano do
   perfil das RAs), a tela oferece declarar um valor padrão. Ele fica gravado na importação e só
   preenche célula vazia.
4. **Aplicar.** Grava as linhas válidas em lotes de 500. A contagem sempre fecha:
   inseridas + atualizadas + ignoradas + rejeitadas = linhas do arquivo.
5. **Desfazer** (só o admin da app): manda para a lixeira as linhas que a importação criou e que
   ninguém editou depois. Linhas atualizadas por ela não voltam ao valor anterior. Uma importação
   que falhou no meio também pode ser desfeita (os lotes que ela gravou saem). Depois de desfazer,
   o arquivo corrigido pode ser importado de novo: o `id_legado` de quem está na lixeira não trava
   a linha nova.

**Modo "Atualizar".** O CSV pode trazer só a chave e as colunas que mudam (ex.: `id_legado` e
`preco_pedido_brl` para atualizar preços). Célula vazia não apaga nem repõe valor padrão: a coluna
fica como está. A linha casa com o registro existente por qualquer chave da tabela (`id_legado`,
URL do anúncio, nome do lançamento ou da âncora, geometria do contorno).

**Atributos no mesmo CSV.** Uma coluna `atr_<codigo>` leva o valor do atributo `<codigo>` do
catálogo para o objeto da linha (anúncios, lançamentos, âncoras e contornos). A prévia confere que o
atributo existe, está ativo e se aplica ao objeto; atributo desconhecido é coluna ignorada com aviso,
e valor fora do tipo rejeita a linha com o motivo. Célula vazia não apaga valor gravado. O modelo
baixado traz as colunas `atr_<codigo>` dos atributos ativos, e o desfazer apaga os valores que a
importação gravou e ninguém editou depois.

**Séries publicadas de mercado** (IVV mensal, IVV por localidade) aceitam os cabeçalhos da planilha
(`reference_date`, `ivv_pct`, `offers_units`…, e os antigos `offered_units`, `sold_units`…). O IVV
mensal vem em fração (0,057); valor acima de 1 é recusado com `ESCALA_INDETERMINADA`. O IVV por
localidade vem em pontos percentuais (12,5) e é guardado em fração. Colunas publicadas sem campo
próprio (acumulados, variações) ficam em `extras`, sem perda. IVV publicado que diverge do
recalculado (vendas ÷ oferta) em mais de 0,5% vira achado `IVV_DIVERGENTE`; o publicado vale. O
desfazer apaga as linhas da série (não há lixeira para série publicada).

**FipeZap** aceita o vocabulário da planilha (`RESIDENCIAL`, `VENDA`, `DF_TOTAL`…) e o traduz;
a localidade casa pela `ra_geo_id` ou pelo nome da RA na fonte, e o nome da fonte fica sempre
(Asa Sul continua Asa Sul, nunca vira Plano Piloto). **Procedências** pedem a coluna `familia`
(`fipezap_fonte`, `fipezap_nota` ou `pdad_guia`), que pode ser declarada como valor padrão na prévia.

**PDAD** (`PDAD_A_DATA`): a localidade casa pela `ra_geo_id` (`RA_01`); `estimate_pct` vem em
pontos percentuais e é guardado em fração; `published`/`partial`/`suppressed` viram
`publicado`/`parcial`/`suprimido`, e suprimido nunca vira zero. Linha cuja categoria é só dígitos
(resquício de extração antiga) é rejeitada com `CATEGORIA_NUMERICA`. As colunas `figure_*` vão
juntas em `metodologia`.

**Áreas de estudo** entram pela própria tela (Estudos de área): KML, KMZ ou GeoJSON criam uma área
por feição (ponto ou polígono, sem duplicar a geometria), e o CSV (tabela "Áreas de estudo") completa
os demais campos e os atributos `atr_<codigo>` de áreas pelo nome; linha nova precisa de `latitude` e
`longitude` (a prévia já a recusa sem elas). Linha de área própria só entra para o curador, e
estágio de decisão (iniciativa em diante, encerrada) só pela tela, com motivo. No modo
"Atualizar", a linha só altera a área que quem importa pode editar (autor ou curador; área própria,
só o curador); a área própria que a pessoa não enxerga não casa com a linha, e a prévia não diz
que ela existe.

**Precisão da coordenada.** Além das precisões já aceitas, a planilha traz geocodificação externa
(`quad_centroid_external_geocode`, `street_centroid_external_geocode`, `conjunto_centroid_external_geocode` e
`condominium_centroid_external_geocode`); entram como `geocode_externo_quadra`, `_rua`, `_conjunto` e `_condominio`
e valem como localização **aproximada** no mapa (não servem para distância). A edição manual do cadastro também oferece esses valores ao curador técnico; a coluna de lançamentos não foi alterada.

**Telemetria da coleta antiga.** O CSV de anúncios aceita `last_checked_at`, `last_price_change_at`,
`content_hash`, `parser_version`, `verification_failures`, `last_check_status` (`error` vira `erro`),
`last_check_http_code` e `last_check_message`; o de lançamentos aceita `first_seen_at`, `last_checked_at`,
`content_hash`, `parser_version`, `last_check_status`, `last_check_http_code` e `last_check_message`; o de
contornos reconhece `source_layer_name` como camada de origem. No IVV mensal, o
escopo de mercado da planilha ("Mercado formal do DF - incorporadoras associadas à instituição que gera
este relatório") entra como "Mercado formal do DF - incorporadoras associadas", porque a coluna aceita
até 60 caracteres. `search_urls` das fontes ainda não é importável (a tabela `buscas_portal` existe,
mas não está entre as importáveis) e os cabeçalhos de requisição das fontes só se editam pela tela.

**Grade territorial (recorte da Fase 4A).** "Células da grade" recebe `grade` (`h3_r9`, `ibge_200m` ou
`ibge_1km`), `codigo`, a localidade (`ra_geo_id`), o centroide, `geometria` (Polygon ou MultiPolygon em
GeoJSON) e `area_km2`. "Métricas por célula" vem depois e aponta a célula por `grade` + `celula`;
célula que não existe rejeita a linha com `CELULA_NAO_RESOLVIDA`. A `classe` é a do pipeline (0 a n);
sem ela, o mapa classifica por quintis (precisa de 5 ou mais células com valor; com menos, as células ficam sem
classe). O índice H3 é gravado em minúsculas. **Desfazer** uma importação de células apaga também as métricas
ligadas a elas, mesmo as de outras importações: desfaça as métricas antes, ou reimporte-as depois. A leitura da
prévia aceita até 300 mil células e 1,5 milhão de métricas por tabela. A **centralidade viária** entra como contornos de tipo
`trecho_rodoviario` (linhas), com `grupo_camada` `road_network`, `estilo` por classe e
`propriedades` com a métrica.

Reimportar o mesmo arquivo com "Ignorar" não duplica nada: a chave natural de cada tabela está
em [Dados](dados.md).

**Contornos em KML, KMZ ou GeoJSON** entram pelo Cadastro › Contornos: a prévia lista as feições
(nome, tipo, vértices, erros); aplicar cria os contornos sem duplicar pela geometria.

## Migração da planilha

A migração nunca importa a planilha viva: importa um **retrato datado**, gerado por
`node scripts/exportar-planilha.mjs [AAAA-MM-DD]` na raiz do repositório (GViz, a mesma consulta do
site; a planilha precisa estar compartilhada para leitura). O retrato fica em
`migracao/AAAA-MM-DD/<aba>.csv` com `SHA256SUMS`, **fora do git**. Cada passo é uma importação pela
Operação › Importações (ou pela carga por agente), sem edição manual do CSV:

| Passo | Aba | Tabela | Observação |
|---|---|---|---|
| 0 | — | `cidades`, `localidades` (37 RAs) | semente da app, automática |
| 1 | `RA_PROFILES` | `localidade_perfis` (e `localidades` em "Atualizar", para nomes e área) | o ano do perfil está vazio na planilha: declare `ano_referencia` como valor padrão |
| 2 | `ra_crosswalk.json` | `localidades.codigo_legado` | já vem na semente |
| 3 | `FIPEZAP_LOCALITY_MAP` | `localidades` | vira submercado (ou agregado) com a RA como pai; o nome da fonte fica em `nome_fonte` |
| 4 | `POLYGONS` | `contornos` | |
| 5 | `ANCHORS` | `ancoras` | |
| 6 | `LISTING_SOURCES` | `fontes_portal` | se faltar, a importação de anúncios cria a fonte, inativa |
| 7 | `LISTINGS` | `anuncios` | grava o evento `criado` de cada anúncio |
| 10 | `DEVELOPMENTS` | `lancamentos` | |

Aceite de cada passo: `total_linhas = inseridas + atualizadas + ignoradas + rejeitadas`, e cada
rejeição listada com motivo. Até a coleta automática (fase 3), a planilha continua sendo a fonte de
verdade dos anúncios: manter a app em dia é reimportar o retrato seguinte em "Atualizar" pela chave
natural (`id_legado`). Cada aplicar registra uma execução em Operação › Execuções.

## Para o administrador

- Importar exige o papel **operador**; desfazer, nível **admin** da app.
- O arquivo da importação fica guardado (não expira) como evidência da carga.

## Carga por agente (spec 11.5)

Uma sessão do Claude completa dados pela API da app com o token de um usuário de serviço
"Carga" (nível escrita, papel operador; sem curador, estratégico nem admin). O token mora no
ambiente da sessão, nunca no repositório. Passos:

1. `POST /api/dados/inteligencia_imobiliaria/importacoes/__upload?coluna=arquivo` (multipart,
   um arquivo) → `{ upload_id }`. O `upload_id` vale 10 minutos.
2. `POST /api/inteligencia_imobiliaria/importacoes/previa`
   `{ tabela_alvo, upload_id, modo_duplicata: "ignorar" | "atualizar", padroes? }` → contagens,
   `colunas_ignoradas` e as primeiras 50 rejeições.
3. **Ler a prévia.** Rejeição ou coluna ignorada que a sessão não sabe explicar: parar e voltar ao
   dono, sem aplicar.
4. `POST /api/inteligencia_imobiliaria/importacoes/:id/aplicar`.

Regras: nunca aplicar sem ler a prévia; só `ignorar` ou `atualizar`; a importação aparece na
Operação com o autor "Carga" e o admin pode desfazê-la.

## Para agentes (referência)

| Método | Rota | Papel |
|---|---|---|
| GET | `/importacoes/tabelas` | leitura |
| GET | `/importacoes/modelo/:tabela` | leitura |
| GET | `/importacoes`, `/importacoes/:id` | leitura |
| POST | `/importacoes/previa` | operador |
| POST | `/importacoes/:id/previa` (refaz com outro modo ou `padroes`) | operador |
| POST | `/importacoes/:id/aplicar`, `/importacoes/:id/cancelar` | operador |
| POST | `/importacoes/:id/desfazer` | admin |
| GET | `/qualidade?tabela&codigo&severidade&resolvido=false\|true\|todos` | leitura |
| PATCH | `/qualidade/:id/resolver` | operador |
| POST | `/contornos/importar` `{ upload_id }`, `/contornos/importar/:id/aplicar` `{ indices?, categoria?, localidade_id? }` | curador |
