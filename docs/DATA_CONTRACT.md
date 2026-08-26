# Contrato de dados

**Fonte de verdade do schema.** Código que diverge deste documento é o código que está errado —
até que o contrato seja atualizado deliberadamente.

Alterar estrutura exige os sete passos de `.agents/skills/imob-data-contract/SKILL.md`, na
mesma PR: comparar schema → identificar impacto → atualizar contrato → atualizar loader →
atualizar validação → atualizar migração → adicionar teste.

## Regras gerais

- Uma linha = um registro observável.
- Cabeçalhos em `snake_case` e **nunca renomeados** sem versionar o contrato.
- IDs estáveis e únicos.
- Coordenadas em WGS84: `latitude`, `longitude`.
- Valores monetários são **números**, sem `R$` nem separador de milhar dentro da célula.
- Datas em `YYYY-MM-DD`.
- Toda informação de mercado guarda fonte e data de observação/verificação.
- Coordenada aproximada declara `coordinate_precision` e `confidence_flag`.

### Semântica que não pode se perder

- **`confidence_flag` e `coordinate_precision` sobrevivem da planilha até a tela.**
- **Coordenada aproximada nunca é apresentada como endereço ou lote exato.** No dataset atual
  os **141 anúncios** usam centroide de localidade com jitter determinístico — é a regra, não a
  exceção.
- **Preço anunciado é preço pedido, não transação realizada.** A interface não pode sugerir
  o contrário.

### Como os valores chegam ao código

A mesma coluna aparece em três formatos conforme a origem, e `src/normalize.js` cobre os três:

| Origem | Número | Data |
|---|---|---|
| GViz (planilha) | `2500000` | `Date(2026,7,18)` — mês base zero |
| `data/demo.json` | `2500000` | `2026-08-18` |
| `.xlsx` de migração | `2500000` | `46252` — serial desde 1899-12-30 |

Ausência é sempre `null` depois de normalizada, **nunca `NaN`** — `NaN` se propaga em silêncio
e só aparece na tela.

---

## Abas obrigatórias (V1)

Ausência de qualquer uma → **estado de erro legível**. Ver R2.5.

### LISTINGS — anúncios secundários
Chave: `listing_id`. 141 linhas no dataset atual.

| Campo | Tipo | Obrig. | Preenchimento | Exemplo |
|---|---|---|---|---|
| `listing_id` | texto | **sim** | 141/141 | `LIST_WEB_QUINTOANDAR_apartamento-4-quartos-asa-norte-brasilia` |
| `portal` | texto | sim | 141/141 | `QuintoAndar` |
| `transaction_type` | enum | sim | 141/141 | `sale` |
| `title` | texto | sim | 141/141 | `Apartamento à venda · Asa Norte` |
| `source_url` | url | **sim** | 141/141 | `https://www.quintoandar.com.br/imovel/894155475/…` |
| `source_url_type` | enum | sim | 141/141 | `individual_listing` |
| `external_id` | texto | não | 141/141 | `apartamento-4-quartos-asa-norte-brasilia` |
| `portal_listing_code` | texto | não | 141/141 | idem |
| `source_page_verified_at` | data | sim | 141/141 | `2026-08-18` |
| `portal_date_text` | texto | não | 5/141 | `03/03/2026` |
| `status` | enum | sim | 141/141 | `active` |
| `last_seen_at` | data | sim | 141/141 | `2026-08-18` |
| `property_id` | texto | não | 141/141 | `PROP_WEB_QUINTOANDAR_…` |
| `property_type` | enum | **sim** | 141/141 | `apartamento` |
| `address` | texto | sim | 141/141 | `Asa Norte` |
| `locality` | texto | **sim** | 141/141 | `Asa Norte` |
| `ra_geo_id` | texto | sim | 141/141 | `RA2026_RA-I` |
| `latitude` | número | **sim** | 141/141 | `-15.7645675` |
| `longitude` | número | **sim** | 141/141 | `-47.877685` |
| `coordinate_precision` | enum | **sim** | 141/141 | `locality_centroid_deterministic_jitter` |
| `confidence_flag` | enum | **sim** | 141/141 | `low_spatial_high_attribute` |
| `observed_at` | data | **sim** | 141/141 | `2026-08-18` |
| `asking_price_brl` | número | **sim** | 141/141 | `2500000` |
| `area_m2` | número | **sim** | 141/141 | `160` |
| `area_basis` | enum | sim | 141/141 | `portal_area_unspecified` |
| `asking_price_brl_m2` | número | derivado | 141/141 | `15625` |
| `bedrooms` | inteiro | **sim** | 141/141 | `4` |
| `suites` | inteiro | não | 48/141 | `4` |
| `parking_spaces` | inteiro | não | 54/141 | `2` |
| `condo_fee_brl` | número | não | 0/141 | — |
| `iptu_brl` | número | não | 0/141 | — |
| `published_days` | inteiro | não | 5/141 | `281` |
| `views_count` | inteiro | não | 2/141 | `3091` |
| `interested_count` | inteiro | não | 2/141 | `72` |
| `quality_flag` | enum | sim | 141/141 | `web_search_direct_item_page_indexed` |
| `regularization_status` | texto | não | 0/141 | provisionada pelo v2.0.0; sem dado ainda |

**`property_type`:** `apartamento`, `casa`, `casa_condominio`, `kitnet`, `predio`, `terreno`.
**`coordinate_precision`:** `locality_centroid_deterministic_jitter`, `locality_centroid_jitter`.
**`confidence_flag`:** `low_spatial_high_attribute` — atributos confiáveis, localização aproximada.

`asking_price_brl_m2` é **derivado**: calculado por `asking_price_brl / area_m2` quando vazio.
Valor já preenchido não é sobrescrito; divergência grande vira alerta em `DATA_QUALITY` (§17).

#### `building_orientation` — classificação vertical/horizontal (issue #31)

**Não é uma coluna da planilha.** `normalizeListing()` deriva `building_orientation`
(`vertical`/`horizontal`/`null`) a partir de `property_type`, que já é vocabulário fechado:
`apartamento`, `predio`, `kitnet` → `vertical`; `casa`, `casa_condominio`, `terreno` →
`horizontal`. Não precisa de mudança de backend.

#### `regularization_status` — situação de regularização (issue #32)

Coluna provisionada pelo Apps Script v2.0.0. Vocabulário **aberto**, com três valores previstos —
`regularizado`, `nao_regularizado`, `em_regularizacao` — mas tipada como `text` no servidor, e não
como enum fechado: travar o vocabulário antes de a planilha estar preenchida rejeitaria valor
legítimo que ninguém previu.

A decisão de visibilidade foi tomada: o campo será **público** — card de detalhe e filtro no mapa.
**Ainda não está na tela**: a coluna e o carregamento existem desde a sincronização com o v2.0.0, e
a exibição entra na issue #32. Até lá o valor é lido e normalizado, mas não renderizado.

#### Escrita pela área administrativa (issue #5, R4.9)

A API de escrita do Apps Script (`doPost`) cobre, na primeira PR, só `LISTINGS`. Editável é
exatamente `REQUIRED_HEADERS.LISTINGS` (as colunas críticas, já mantidas em sincronia com esta
tabela e cross-checadas por `tests/contract.test.js`) **menos** `listing_id` e
`asking_price_brl_m2`:

- **Imutável após criação:** `listing_id` — só entra pelo campo `id` da requisição, nunca por
  `fields`.
- **Somente leitura, calculado pelo servidor:** `asking_price_brl_m2` — enviá-lo em `fields` é
  recusado com `UNKNOWN_FIELD`. Ver `pricePerM2_()` em `optional-apps-script/Code.gs`.
- **Fora do escopo desta PR:** campos de cauda longa que não estão em `REQUIRED_HEADERS`
  (`external_id`, `portal_listing_code`, `portal_date_text`, `property_id`, `published_days`,
  `views_count`, `interested_count`) não são editáveis pela API ainda — só pela planilha direta.
- `property_type` é o único campo validado contra vocabulário fechado no servidor
  (`apartamento`, `casa`, `casa_condominio`, `kitnet`, `predio`, `terreno`); `coordinate_precision`
  e `confidence_flag` aceitam qualquer texto, porque o vocabulário completo em uso na planilha
  não está totalmente documentado aqui.

### DEVELOPMENTS — empreendimentos
Chave: `development_id`. 22 linhas.

| Campo | Tipo | Obrig. | Preenchimento | Observação |
|---|---|---|---|---|
| `development_id` | texto | **sim** | 22/22 | |
| `name` | texto | **sim** | 22/22 | |
| `developer_name` | texto | não | 10/22 | |
| `address` | texto | sim | 22/22 | |
| `latitude` / `longitude` | número | não | **15/22** | **7 sem coordenada** — ver abaixo |
| `ra_geo_id` | texto | não | 10/22 | |
| `neighborhood` | texto | sim | 22/22 | usado como `locality` |
| `product`, `segment`, `status` | texto | não | 10/22 | |
| `units_total` | inteiro | não | 3/22 | |
| `area_min_m2` / `area_max_m2` | número | não | 22/22 · 21/22 | |
| `current_price_brl` | número | não | **0/22** | vazio no dataset atual |
| `current_price_brl_m2` | número | não | **0/22** | vazio no dataset atual |
| `source_url` | url | não | 19/22 | |
| `confidence_flag` | enum | sim | 22/22 | `high_attributes` |
| `quality_flag` | texto | não | 10/22 | |
| `spatial_usable` | booleano | sim | 10/22 | `0`/`1` |
| `last_verified_at` | data | sim | 22/22 | |
| `coordinate_status` | texto | não | 10/22 | `pending_exact_parcel_or_poi_validation` |
| `work_progress_pct` | número | não | 6/22 | `78.88` |
| `unit_mix` | texto | não | 10/22 | |
| `expected_delivery` | data | não | 5/22 | |
| `sales_stage` | enum | derivado | 0/22 | derivado de `status` por `inferSalesStage_()` |
| `building_orientation` | enum | não | 0/22 | sem derivação segura — coluna dedicada (#31) |
| `regularization_status` | texto | não | 0/22 | mesma semântica de LISTINGS |

> **7 dos 22 empreendimentos não têm coordenada** (`spatial_usable = 0`). Eles continuam
> existindo como registro, aparecem na contagem e na busca, e **não vão ao mapa**. Metade de uma
> coordenada é pior que nenhuma — colocaria o ponto no lugar errado. `computeKpis` expõe isso em
> `withoutCoord` para que o buraco fique visível em vez de silencioso.

#### `sales_stage`, `building_orientation`, `regularization_status` (issues #30, #31, #32)

As três colunas foram provisionadas pelo Apps Script v2.0.0.

- **`sales_stage`** (#30) — estágio de comercialização. Enum fechado: `em_construcao`,
  `em_lancamento`, `oferta`. É **derivado de `status`** por `inferSalesStage_()`, mas só quando a
  célula está vazia: valor escrito à mão nunca é sobrescrito, e por isso o campo continua
  legitimamente editável pela API de escrita (diferente de `current_price_brl_m2`, que o servidor
  recalcula sempre e por isso fica fora do allowlist).
- **`building_orientation`** (#31) — `vertical` ou `horizontal`. Diferente de LISTINGS, onde
  `normalizeListing()` deriva de `property_type` (vocabulário fechado), aqui não há derivação
  segura: `product` e `unit_mix` são texto livre. Por isso a coluna é dedicada e preenchida à mão.
- **`regularization_status`** (#32) — mesma semântica e mesma decisão de visibilidade de
  LISTINGS: será público, no card e no filtro, quando a #32 for implementada.

#### Escrita pela área administrativa (issue #5, R4.9)

Editável: `REQUIRED_HEADERS.DEVELOPMENTS` menos `development_id` (imutável, só via `id` da
requisição) e `current_price_brl_m2`. Este último é tratado como derivado pela API de escrita
mesmo o contrato marcando `Obrig. = não` (e não `derivado`, como em LISTINGS): `src/normalize.js`
já o computa via `pricePerM2()` quando ausente, então a API mantém o mesmo comportamento e
recusa (`UNKNOWN_FIELD`) valor enviado diretamente — calcula sempre a partir de
`current_price_brl` / `area_min_m2` quando um dos dois muda. Diferente de LISTINGS, a manutenção
periódica (`recalculateDerivedFields()`) **não** recalcula este campo fora da API de escrita —
ver Pendências.

`spatial_usable` é `bool` (mesmos literais tolerantes de `toBoolean()`/`toBoolean_()`).
`latitude`/`longitude` **não** são obrigatórios na criação — sete dos 22 registros do dataset
atual não têm coordenada por design, e a API não pode forçar um valor que a semântica do dado
não exige.

### ANCHORS — pontos de interesse
Chave: `place_id`. 35 linhas.

| Campo | Tipo | Obrig. | Preenchimento |
|---|---|---|---|
| `place_id` | texto | **sim** | 35/35 |
| `name` | texto | **sim** | 35/35 |
| `category` | enum | **sim** | 35/35 |
| `subcategory` | texto | sim | 35/35 |
| `operator_name` | texto | sim | 35/35 |
| `address` | texto | não | 11/35 |
| `latitude` / `longitude` | número | **sim** | 35/35 |
| `ra_geo_id` | texto | sim | 35/35 |
| `neighborhood` | texto | não | 11/35 |
| `source_url` | url | sim | 35/35 |
| `coordinate_source_url` | url | sim | 35/35 |
| `confidence_flag` | enum | sim | 35/35 |
| `coordinate_precision` | enum | sim | 35/35 |
| `last_verified_at` | data | sim | 35/35 |
| `status` | enum | sim | 35/35 |
| `scale_capacity` | texto | não | 8/35 |
| `group` | enum | derivado | 0/35 | 
| `segment` | texto | não | 0/35 | 
| `brand_name` | texto | não | 0/35 | 
| `occupied_area_m2` | número | não | 0/35 | 

**`category`:** `escola`, `mobilidade`, `parque_equipamento_publico`, `saude`, `shopping_center`,
`supermercado_atacarejo`, `universidade`.

Diferente dos anúncios, âncoras têm coordenada **precisa** (`school_polygon_reference_point` e
similares, `confidence_flag: high`).

#### `group` e `segment` — classificação em dois eixos (issues #22, #26)

Provisionadas pelo Apps Script v2.0.0, que também as **deriva** de `category`, `subcategory` e
`name` quando a célula está vazia (`inferAnchorGroup_()` e `inferAnchorSegment_()`).

**`group`** é enum **fechado** e separa duas famílias que estavam misturadas em `category`:

| Valor | Cobre |
|---|---|
| `infraestrutura` | `mobilidade` e `parque_equipamento_publico` |
| `comercio_servico` | `escola`, `saude`, `shopping_center`, `supermercado_atacarejo`, `universidade` |

O caso de fronteira que a issue #26 deixou em aberto — onde entra `parque_equipamento_publico` —
foi resolvido pelo backend a favor de `infraestrutura`.

**`segment`** é mais fino que `category` e tem vocabulário **aberto**, de propósito. O backend
infere doze valores a partir do que já existe na planilha:

`escola` · `universidade` · `supermercado` · `atacado` · `hospital` · `clinica` · `laboratorio` ·
`estacao_metro` · `estacao_trem` · `terminal_rodoviario` · `aeroporto` · `ponto_onibus`

Os demais segmentos comerciais previstos — loja de departamento, material de construção, vestuário,
livraria, cinema, móveis, artigos esportivos, academia, restaurantes, loja pet, posto de
combustível, hotelaria — **não são inferíveis** do dado atual e entram à mão. Por isso `segment` é
`text` no servidor e não enum: fechar o vocabulário agora rejeitaria justamente os valores que
ainda vão ser cadastrados. Quem renderiza precisa humanizar termo desconhecido em vez de vazar o
slug.

#### `brand_name`, `occupied_area_m2` — dados comerciais (issue #39)

Provisionadas pelo v2.0.0, sem derivação: nome da marca/rede e área ocupada pelo estabelecimento.
Ficam vazias até serem cadastradas.

#### Escrita pela área administrativa (issue #5, R4.9)

Editável: `REQUIRED_HEADERS.ANCHORS` menos `place_id` (imutável, só via `id` da requisição).
ANCHORS não tem campo de preço, então não tem noção de derivado. `category` é validado contra o
vocabulário fechado acima; os demais enums (`status`, `coordinate_precision`) ficam como texto
livre pelo mesmo motivo de LISTINGS.

---

## Abas opcionais

Ausência gera **warning**, nunca erro. A aplicação não pode cair porque uma aba futura está
vazia (R2.5). `PRIMARY_OFFERS`, `IVV_MONTHLY` e `IVV_REGION` não são lidas pela tela ainda.
`RA_PROFILES` passou a ser lida a partir da issue #33/#34 — ver seção dedicada abaixo.

| Aba | Chave | Linhas | Papel |
|---|---|---|---|
| `PRIMARY_OFFERS` | `observation_id` | 29 | Observações unitárias do mercado primário, previstas para uma fase futura |
| `IVV_MONTHLY` | `reference_month` | 1 | Índice de Velocidade de Vendas mensal do DF |
| `IVV_REGION` | `reference_month` + `market_region` + `bedroom_bucket` | 95 | IVV por região e faixa de quartos |
| `RA_PROFILES` | `ra_geo_id` | 35 | Indicadores territoriais por Região Administrativa (censo + PDAD) — **lida pela tela** |
| `POLYGONS` | `polygon_id` | 0 | Geometrias importadas de KML/KMZ — criada pelo `setupProject()` v2.0.0 |

> **Divergência D2 — `IVV_REGION` tem `ivv_pct` e `ivv_pct_published`.** `ivv_pct` é alias de
> compatibilidade consumido pelo Apps Script; `ivv_pct_published` é o valor do dataset original.
> Manter os dois em sincronia é responsabilidade de quem edita a aba.

### RA_PROFILES — indicadores por Região Administrativa (issues #33, #34, #35)

Aba **opcional** com contrato de cabeçalho: `REQUIRED_HEADERS.RA_PROFILES` existe, mas a ausência
da aba continua sendo aviso, nunca erro (R2.5). Buscada por `src/data.js`
(`config.raProfilesSheet`) com o mesmo tratamento de `APP_META` — falha vira aviso, e o filtro por
RA (#33) segue funcionando com o código bruto de `ra_geo_id` como rótulo.

Chave: `ra_geo_id`. 35 linhas.

| Campo | Tipo | Obrig. | Preenchimento | Uso |
|---|---|---|---|---|
| `ra_geo_id` | texto | **sim** | 35/35 | chave, casada com `ra_geo_id` das três abas obrigatórias |
| `ra_name` | texto | não | 35/35 | rótulo do filtro por RA (#33) |
| `population_total` | inteiro | não | 35/35 | nota de população (#34) |
| `population_density_km2` | número | não | 35/35 | nota de densidade (#34) |
| `income_per_capita_brl` | número | não | 0/35 | renda per capita (#35) |
| `population_age_0_14_pct` | número | não | 0/35 | faixa etária (#35) |
| `population_age_15_29_pct` | número | não | 0/35 | faixa etária (#35) |
| `population_age_30_44_pct` | número | não | 0/35 | faixa etária (#35) |
| `population_age_45_59_pct` | número | não | 0/35 | faixa etária (#35) |
| `population_age_60_plus_pct` | número | não | 0/35 | faixa etária (#35) |

As seis últimas foram provisionadas pelo Apps Script v2.0.0. **A coluna existe; o dado pode não
existir** — a cobertura do PDAD é esparsa e a própria semente avisa `"PDAD-A report-level seed;
not yet all 35 RAs"`. Cada indicador só aparece na tela quando tem valor.

O servidor valida semanticamente: renda não pode ser negativa, cada faixa etária fica entre 0 e
100, e as cinco somadas precisam dar aproximadamente 100% (ou 1, em escala decimal) — divergência
vira aviso `AGE_DISTRIBUTION_SUM` em `DATA_QUALITY`, nunca sobrescrita.

> **A tabela acima não é o inventário da aba.** A planilha tem 38 colunas; estas dez são as que o
> contrato declara e o loader lê. As demais são indicadores PDAD e censitários
> (`avg_residents_private_occupied`, `pdad_*_pct`, `primary_work_location`, `sector_count`,
> `coverage_note` e outros) que existem na planilha e ainda não são consumidos pela tela. Estão
> fora desta tabela **de propósito**: documentá-los aqui os tornaria cabeçalhos exigidos por
> `tests/contract.test.js`. Ver `migration/README.md` para o inventário completo.

### POLYGONS — geometrias importadas de KML/KMZ (issues #27, #28)

Aba **opcional** com contrato de cabeçalho, criada por `setupProject()` do Apps Script v2.0.0.
Ausência continua sendo aviso, nunca erro (R2.5).

Chave: `polygon_id` — hash SHA-256 estável derivado do arquivo de origem, do índice do Placemark e
do nome. Reimportar o mesmo KML **não duplica**: a importação é idempotente por construção.

| Campo | Tipo | Obrig. | Preenchimento | Observação |
|---|---|---|---|---|
| `polygon_id` | texto | **sim** | — | `POLY_` + 24 hex do SHA-256 |
| `name` | texto | **sim** | — | do `<name>` do Placemark; `REQUIRED_FOR_CREATE` exige |
| `category` | texto | não | — | de `ExtendedData`, quando houver |
| `geometry_geojson` | texto | **sim** | — | `Polygon` ou `MultiPolygon`, `[longitude, latitude]`; `REQUIRED_FOR_CREATE` exige |
| `color` | texto | não | — | cor sugerida para o preenchimento |
| `description` | texto | não | — | do `<description>` do Placemark |
| `properties_json` | texto | não | — | atributos livres do KML, como objeto JSON |
| `source_url` | url | não | — | validada como http(s) na importação |
| `source_file` | texto | não | — | nome do KML/KMZ de origem |
| `imported_at` | data | não | — | preenchido pelo importador |
| `status` | enum | não | — | `active` ou `inactive` |

**A geometria é validada no servidor** antes de ser gravada: precisa ser `Polygon` ou
`MultiPolygon`, cada anel precisa de ao menos quatro posições e três distintas, o anel precisa
estar fechado (primeira posição igual à última), e longitude/latitude precisam estar na faixa
válida. Ordem é sempre `[longitude, latitude]`, como manda o GeoJSON — invertida seria o Golfo da
Guiné em vez do Distrito Federal.

A camada é renderizada por `renderPolygons()` (`src/app.js`, issue #28): caixa própria na
legenda, que **só aparece quando há contorno** — planilha sem nenhum KML importado é o estado
normal, não defeito. `geometry_geojson` é parseado **ali**, por registro e com erro isolado: um
contorno ilegível some do mapa e os outros continuam (R2.6). As propriedades de `properties_json`
vão para o painel por `textContent`, nunca `innerHTML`: são atributos de arquivo de terceiro, tão
não confiáveis quanto o título de um anúncio (R4.4).

`normalizePolygon()` (`src/normalize.js`) **não parseia** `geometry_geojson`: mantém como texto e
deixa o parse para quem for desenhar. Um blob malformado precisa isolar aquele polígono, não
interromper o carregamento do dataset inteiro (R2.6).

> **Texto vindo de KML de terceiro é entrada não confiável.** `name`, `description` e o conteúdo de
> `properties_json` são escritos por quem produziu o arquivo. Vão para a tela por `textContent`,
> nunca por `innerHTML` (R4.4). O servidor ainda prefixa `'` em valor que comece com `=`, `+`, `@`
> ou `-letra`, para que a célula nunca vire fórmula na planilha.

---

## Provisionamento pós-semente (Apps Script v2.0.0)

`migration/imob-intelligence-backend.xlsx` é a **semente histórica de importação**, não um espelho
do schema: ela inicializou a planilha uma vez e não acompanha as migrações que vieram depois. As
colunas e abas abaixo existem na planilha viva porque `setupProject()` as cria via
`ensureHeaders_()`, de forma aditiva — sem mover, renomear nem apagar nada que já existia.

`tests/contract.test.js` cobra três coisas de cada linha desta tabela: que ela esteja de fato
**ausente** da semente, **presente** em `REQUIRED_HEADERS`, e **listada** em `POST_SEED_COLUMNS`
(`tests/helpers/schema.mjs`). É o que impede a lista de virar esconderijo de erro de digitação — e
o que obriga ela a encolher no dia em que alguém reexportar a planilha (R8.39).

| Aba | Coluna | Origem |
|---|---|---|
| `LISTINGS` | `regularization_status` | issue #32 |
| `DEVELOPMENTS` | `building_orientation` | issue #31 |
| `DEVELOPMENTS` | `regularization_status` | issue #32 |
| `DEVELOPMENTS` | `sales_stage` | issue #30 |
| `ANCHORS` | `brand_name` | issue #39 |
| `ANCHORS` | `group` | issue #26 |
| `ANCHORS` | `occupied_area_m2` | issue #39 |
| `ANCHORS` | `segment` | issues #22, #26 |
| `RA_PROFILES` | `income_per_capita_brl` | issue #35 |
| `RA_PROFILES` | `population_age_0_14_pct` | issue #35 |
| `RA_PROFILES` | `population_age_15_29_pct` | issue #35 |
| `RA_PROFILES` | `population_age_30_44_pct` | issue #35 |
| `RA_PROFILES` | `population_age_45_59_pct` | issue #35 |
| `RA_PROFILES` | `population_age_60_plus_pct` | issue #35 |
| `POLYGONS` | *(aba inteira)* | issues #27, #28 |

---

## Abas operacionais (Apps Script)

Não são lidas pelo mapa. Existem na planilha com cabeçalho e sem linhas — é o Apps Script que
as preenche. `setupProject()` deve completá-las **sem sobrescrever** o que já existir.

### APP_META
`key | value | updated_at`

Chaves: `app_version`, `dataset_version`, `last_data_change_at`, `last_validation_at`,
`validation_status`, `validation_errors`, `validation_warnings`, `last_meta_refresh_at`,
`rows_listings`, `rows_developments`, `rows_anchors`.

**A interface lê esta aba** e mostra a procedência do dataset no painel esquerdo — atualização,
versão e estado da validação. É a única aba operacional exibida na tela.

Comportamento quando ela não existe ou está vazia: **o bloco simplesmente não aparece**, e a
aplicação segue funcionando normalmente. A aba só ganha conteúdo depois que `setupProject()` roda
no Apps Script; até lá o estado é "não publicado", que é diferente de "publicado como vazio" —
por isso chave ausente é omitida em vez de virar travessão.

`validation_status` aceita `ok`, `warning`, `error` e `dirty`. **Qualquer outro valor é exibido
sem o indicador de sucesso**: um vocabulário que o código não reconhece não pode ser apresentado
como aprovação.

**Chave publicada duas vezes com valores diferentes é omitida da tela** e vira aviso. A planilha
é editável à mão, e `setMeta_()` atualiza apenas a primeira ocorrência: uma duplicata esquecida
abaixo faria a interface exibir `ok` enquanto a validação gravou `error`. Em conflito, a fonte se
contradiz e a interface não afirma nada — a correção é apagar a linha duplicada na planilha.


### DATA_QUALITY
`severity | sheet | row | record_id | field | code | message | detected_at`

Validações mínimas: aba obrigatória ausente · cabeçalho ausente · ID vazio · ID duplicado ·
latitude inválida · longitude inválida · apenas uma coordenada preenchida · URL suspeita ou
inválida · preço não positivo · área não positiva · divergência grande de preço/m² · campo
crítico ausente.

**Registro ruim é sinalizado, nunca apagado automaticamente.** A decisão de remover é humana.

### CHANGE_LOG
`timestamp | sheet | range | record_id | old_value | new_value | editor | correlation_id | result | error_reason`

Diagnóstico operacional, não auditoria corporativa. Histórico limitado a **5.000 eventos**.

As três últimas colunas (`correlation_id`, `result`, `error_reason`) foram acrescentadas na
issue #5, a pedido da própria issue ("expandir o `CHANGE_LOG`... correlation_id; resultado;
motivo de erro"). Só a API de escrita as preenche de verdade:

- **Edição manual na planilha** (gatilho `onEdit`): `correlation_id` vazio, `result = 'ok'`,
  `error_reason` vazio — não há como uma edição de célula "falhar" nesse sentido.
- **API de escrita, sucesso**: `correlation_id` é o que o cliente mandou (opcional; a UI
  administrativa sempre manda um), `result = 'ok'`.
- **API de escrita, falha DEPOIS de autenticada** (payload inválido, conflito de versão,
  registro não encontrado etc.): `result = 'error'`, `error_reason` é o código do erro mais a
  mensagem. **Falha de autenticação/rate-limit nunca gera linha aqui** — logar toda tentativa de
  login errada viraria ruído de tentativa de força bruta no log operacional; ver R4.9/R8.36.

Planilha provisionada antes da issue #5 tem só as 7 colunas antigas. `setupProject()` chama
`upgradeChangeLogHeader_()`, que estende o cabeçalho em vigor (sem tocar linha nenhuma) só
quando ele for exatamente o antigo — rodar `setupProject()` de novo é seguro e é como uma
planilha existente ganha as três colunas novas.

---

## Divergências registradas

| # | Onde | O quê |
|---|---|---|
| **D2** | `IVV_REGION` | `ivv_pct` é alias de compatibilidade de `ivv_pct_published` |
| **D3** | `reference/index-v3.html` × planilha | No V3, `primaryMarket` traz ofertas aninhadas. Na migração futura, elas podem ser preservadas na aba opcional `PRIMARY_OFFERS`; não formam uma aba obrigatória do runtime |
| **D4** | `DEVELOPMENTS` | 22 linhas na planilha × 10 no V3: 12 registros do mercado primário foram incorporados usando apenas campos semanticamente equivalentes |

Divergência se registra. Não se resolve em silêncio (R8.3).
