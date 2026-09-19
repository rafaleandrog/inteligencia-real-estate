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
vazia (R2.5). `PRIMARY_OFFERS` não é lida pela tela ainda. `RA_PROFILES` passou a ser lida a partir
da issue #33/#34, `IVV_MONTHLY` a partir da issue #56 e `IVV_REGION` a partir da issue #87 — ver as
seções dedicadas abaixo. `FIPEZAP_MONTHLY`/`FIPEZAP_LOCALITY_MONTHLY` passaram a ser lidas nesta
mudança (preço de venda/locação do FipeZap) — ver `§FIPEZAP_MONTHLY` e `§FIPEZAP_LOCALITY_MONTHLY`
abaixo. `FIPEZAP_LOCALITY_MAP`/`FIPEZAP_SOURCES`/`FIPEZAP_NOTES` existem na planilha
(procedência/metodologia) mas não são lidas ainda, mesmo tratamento de `PRIMARY_OFFERS`.
`PDAD_A_DATA` passa a ser lida nesta mudança (aba Diagnóstico) — ver `§PDAD_A_DATA` abaixo.

| Aba | Chave | Linhas | Papel |
|---|---|---|---|
| `PRIMARY_OFFERS` | `observation_id` | 29 | Observações unitárias do mercado primário, previstas para uma fase futura |
| `IVV_MONTHLY` | `reference_date` | 1 na semente, 66 na planilha | Série mensal do mercado residencial do DF (IVV) — **lida pela tela** |
| `IVV_REGION` | `reference_month` + `market_region` + `bedroom_bucket` | 95 | IVV por região e faixa de quartos — **lida pela tela** |
| `RA_PROFILES` | `ra_geo_id` | 35 | Indicadores territoriais por Região Administrativa (censo + PDAD) — **lida pela tela** |
| `POLYGONS` | `polygon_id` | 0 | Contornos: KML/KMZ, Regiões Administrativas e rodovias — criada pelo `setupProject()` v2.0.0, ampliada para A:AP na v2.2.1 |
| `ROAD_SEGMENTS` | `road_segment_id` | 0 | Trecho rodoviário oficial do DER/DF — criada pelo `setupProject()` v2.2.1 |
| `ROAD_SEGMENT_ALIASES` | `alias_id` | 0 | Ponte entre o código de trecho da fonte de tráfego e o `road_segment_id` |
| `TRAFFIC_DAILY_TEST` | `traffic_daily_id` | 0 | Contagem diária de tráfego por trecho |
| `FIPEZAP_MONTHLY` | `fipezap_id` | 0 na semente, 3369 na planilha | Preço de venda/locação FipeZap, DF inteiro e por localidade, desde 2011 — **lida pela tela** |
| `FIPEZAP_LOCALITY_MONTHLY` | `locality_monthly_id` | 0 na semente, 1714 na planilha | Venda × locação pareadas por localidade/RA, desde 2019 — **lida pela tela** |
| `FIPEZAP_LOCALITY_MAP` | `locality_map_id` | 0 na semente, 30 na planilha | De-para localidade → RA e metodologia de classificação — não lida ainda |
| `FIPEZAP_SOURCES` | `source_id` | 0 na semente, 1214 na planilha | Procedência por período/segmento dos relatórios FipeZap — não lida ainda |
| `FIPEZAP_NOTES` | `note_id` | 0 na semente, 33 na planilha | Notas metodológicas referenciadas por `note_id` — não lida ainda |
| `PDAD_A_DATA` | `ra_geo_id`+`pdad_year`+`indicator_code`+`segment_value`+`category_standard` | 12.190 na planilha | Extração longa do PDAD-A (35 RAs × indicadores × categorias) — **lida pela tela** |

> **Divergência D2 — `IVV_REGION` tem `ivv_pct` e `ivv_pct_published`.** `ivv_pct` é alias de
> compatibilidade consumido pelo Apps Script; `ivv_pct_published` é o valor do dataset original.
> Manter os dois em sincronia é responsabilidade de quem edita a aba. O normalizador lê a
> **publicada** primeiro e só cai no alias quando ela não vem (issue #87).

### IVV_REGION — IVV por Região Administrativa e faixa de quartos (issue #87)

Aba **opcional**, sem contrato de cabeçalho em `REQUIRED_HEADERS`: como a `IVV_MONTHLY`, ela não está
em `REQUIRED_HEADERS` nem em `FIELD_SCHEMA` (a chave é composta, não há `ID_FIELD`), então a rede de
teste é o triângulo schema (`src/ivv/region.js`) ↔ semente (`migration/imob-intelligence-backend.xlsx`)
↔ esta seção, fechado por `tests/ivv-region.test.js`. A partir da v2.4.0 o `Code.gs` a **provisiona**
(`provisionIvvRegion()`, só cabeçalho — `IVV_REGION_HEADERS`) e a **valida** (`validateIvvRegion_()`:
faixa no vocabulário, `reference_month` legível, mês × região × faixa único, IVV em 0–100 p.p.,
`ivv_pct` = `ivv_pct_published`, conferência `sold/offered` com tolerância de 0,05 p.p. como aviso).
O dado é colado à mão a partir da semente; `DF Total` nunca é comparado com a soma das partes.

**Forma do dado.** 95 linhas, **um único mês** (mai/2026 na semente), 19 regiões — incluindo a
linha agregada `DF Total` — e 5 faixas de quartos: `1Q`, `2Q`, `3Q`, `4+Q` e a agregada `TOTAL`.
É **retrato, não série**: a tela compara regiões entre si e não promete histórico por RA.

| Coluna | Tipo | Papel |
|---|---|---|
| `reference_month` | data | Mês do retrato |
| `market_region` | texto | Região Administrativa, ou `DF Total` para a linha agregada |
| `bedroom_bucket` | texto | Faixa de quartos, ou `TOTAL` para a linha agregada |
| `offered_units` | inteiro | Unidades em oferta no recorte |
| `sold_units` | inteiro | Unidades vendidas no recorte |
| `ivv_pct_published` | **ponto percentual** | IVV publicado — `12.5` significa 12,5% |
| `ivv_pct` | **ponto percentual** | Alias de compatibilidade da coluna acima (divergência D2) |
| `ivv_pct_check` | ponto percentual | Recálculo do backend: SINALIZA divergência, nunca substitui |
| `ivv_variance_pp` | número | Diferença entre publicado e recálculo, em pontos percentuais |
| `offer_price_brl_m2` | número | Preço pedido por m² no recorte |
| `sale_price_brl_m2` | número | Preço de venda por m² no recorte |
| `source_id` | texto | Procedência da linha |

> **A escala é OPOSTA à da `IVV_MONTHLY`.** Aqui `ivv_pct = 12.5` significa 12,5%; lá `0.057`
> significa 5,7%. As duas convivem na mesma planilha e **nunca se unificam**: a conversão "de
> conveniência" entre elas erra por 100× em silêncio, e nem 1250% nem 0,125% parecem bug de código
> (R8.44/R8.60). A escala é declarada por dataset em `DATASET_PERCENT_SCALE` (`src/format.js`),
> nunca inferida do valor.

> **`DF Total` e `TOTAL` são agregados misturados com as partes.** Ranquear ou somar sem
> separá-los conta o mesmo mercado duas vezes. O normalizador os marca (`isRegiaoTotal`,
> `isFaixaTotal`) e a tela usa `DF Total` como **régua**, não como barra.

Célula vazia é frequente — há região sem nenhuma unidade ofertada numa faixa — e vira **frase de
ausência**, nunca zero: "não publicou" e "vendeu nada" são afirmações diferentes (R5.7).

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
| `ra_code` | texto | não | sync | código romano oficial (`RA-XXIII`), do GeoPortal/SEDUH |
| `ra_number` | inteiro | não | sync | número da RA, do GeoPortal/SEDUH |
| `area_km2` | número | não | sync | área oficial publicada, do GeoPortal/SEDUH |
| `average_age` | número | não | 0/35 | idade média (PDAD) |
| `female_pct` | número | não | 0/35 | composição por sexo (PDAD) |
| `male_pct` | número | não | 0/35 | composição por sexo (PDAD) |
| `households_total` | inteiro | não | 0/35 | domicílios (PDAD) |
| `avg_household_size` | número | não | 0/35 | moradores por domicílio (PDAD) |
| `dominant_dwelling_type` | texto | não | 0/35 | tipologia residencial dominante (PDAD) |
| `dominant_dwelling_type_pct` | número | não | 0/35 | participação da tipologia dominante (PDAD) |
| `dominant_tenure` | texto | não | 0/35 | forma de ocupação dominante (PDAD) |
| `dominant_tenure_pct` | número | não | 0/35 | participação da ocupação dominante (PDAD) |
| `deed_registered_pct` | número | não | 0/35 | escritura registrada (PDAD) |
| `profile_reference_year` | texto | não | 0/35 | ano de referência do perfil |
| `profile_status` | texto | não | sync | `official_geometry_only_profile_pending` quando só há geometria |
| `profile_source_url` | url | não | 0/35 | fonte do perfil |
| `geometry_source_url` | url | não | sync | camada do GeoPortal de onde veio o limite |
| `created_after_pdad_2024` | texto | não | 0/35 | RA criada depois do PDAD 2024 não tem perfil |
| `predecessor_ra` | texto | não | 0/35 | RA de origem, quando desmembrada |
| `legal_reference` | texto | não | 0/35 | norma de criação |
| `quality_flag` | texto | não | sync | `official_geometry_profile_not_loaded` quando o perfil falta |
| `notes` | texto | não | 0/35 | observação livre |

**`sync` na coluna "Preenchimento"** quer dizer preenchido pela sincronização das Regiões
Administrativas (menu do Apps Script, v2.2.1), não pela semente nem pelo PDAD.

Uma RA que existe no limite oficial mas ainda não tem perfil PDAD nasce com
`profile_status = 'official_geometry_only_profile_pending'` e
`quality_flag = 'official_geometry_profile_not_loaded'`. A distinção importa: **"não publicado"
não é "zero"**, e a tela precisa omitir o indicador em vez de mostrar zero.

As seis primeiras faixas/renda foram provisionadas pelo Apps Script v2.0.0. **A coluna existe; o dado pode não
existir** — a cobertura do PDAD é esparsa e a própria semente avisa `"PDAD-A report-level seed;
not yet all 35 RAs"`. Cada indicador só aparece na tela quando tem valor.

O servidor valida semanticamente: renda não pode ser negativa, cada faixa etária fica entre 0 e
100, e as cinco somadas precisam dar aproximadamente 100% (ou 1, em escala decimal) — divergência
vira aviso `AGE_DISTRIBUTION_SUM` em `DATA_QUALITY`, nunca sobrescrita.

> **A tabela acima não é o inventário da aba.** A planilha tem 38 colunas da semente mais as
> provisionadas depois; estas 32 são as que o contrato declara e o loader lê. As demais são indicadores PDAD e censitários
> (`avg_residents_private_occupied`, `pdad_*_pct`, `primary_work_location`, `sector_count`,
> `coverage_note` e outros) que existem na planilha e ainda não são consumidos pela tela. Estão
> fora desta tabela **de propósito**: documentá-los aqui os tornaria cabeçalhos exigidos por
> `tests/contract.test.js`. Ver `migration/README.md` para o inventário completo.

### PDAD_A_DATA — extração longa do PDAD-A (issue #100)

Aba **opcional**, sem contrato de cabeçalho no `Code.gs` (mesma situação de `IVV_MONTHLY`/
`IVV_REGION`: está fora de `REQUIRED_HEADERS`/`FIELD_SCHEMA`, então a rede de teste é o triângulo
schema (`src/pdad/normalize-pdad.js`) ↔ este contrato ↔ comportamento do normalizador, fechado por
`tests/pdad-contract.test.js`). Ausência vira aviso, nunca erro (R2.5) — a aba Diagnóstico fica
desabilitada, dizendo por quê, do mesmo jeito que o Mercado fica sem `IVV_MONTHLY`.

**Formato longo**, não wide: uma linha por RA × indicador × segmento × categoria de resposta —
diferente de `RA_PROFILES`, que é uma linha por RA. 33 colunas, **12.190 linhas** na planilha viva.
Chave composta: `ra_geo_id` + `pdad_year` + `indicator_code` + `segment_value` +
`category_standard`.

> **`ra_geo_id` aqui é `RA_01`…`RA_35` — uma convenção PRÓPRIA desta aba, diferente da usada em
> `LISTINGS`/`DEVELOPMENTS`/`ANCHORS`/`RA_PROFILES` (que usam `RA2026_RA-I`, código romano
> prefixado por ano de sincronização).** As duas convenções **não são assumidas equivalentes** em
> lugar nenhum do código: `PDAD_A_DATA` é consumida como universo fechado em si mesma (a aba
> Diagnóstico não cruza `ra_geo_id` dela com o das outras abas). Cruzar as duas exigiria um de-para
> explícito, que não existe hoje — inventá-lo por semelhança de nome seria o mesmo erro que R8.44
> nomeia para escala: dois valores parecidos que não são a mesma coisa.
>
> **Estado da planilha viva (lido em 2026-09, issue #105):** `RA_PROFILES` e `POLYGONS`
> (`administrative_regions`) já usam `RA_01`…`RA_37` — a mesma chave desta aba — e é essa a
> convenção que `syncAdministrativeRegions_` (`Code.gs` v2.3.0) grava em `ra_geo_id`. Só
> `LISTINGS`/`DEVELOPMENTS`/`ANCHORS` continuam em `RA2026_RA-I`. O cruzamento entre
> `PDAD_A_DATA` e `RA_PROFILES` passa a ser possível por chave igual, mas ainda **não é feito**
> no cliente (ver "Renda per capita" abaixo).

**Cobertura por ano, confirmada no dataset real, não assumida**: `2024` publica as 35 RAs;
`2021` publica **só o Plano Piloto** (`RA_01`) — é o lote histórico anterior à pesquisa virar
censitária nas demais RAs. A tela trata isso como fato do dado, não como bug: selecionar outra RA
em 2021 mostra ausência, nunca RA errada nem zero.

| Campo | Tipo | Observação |
|---|---|---|
| `pdad_year` | inteiro | `2021` ou `2024` — eixo do filtro "Ano de referência" |
| `geography_scope` | texto | `RA` em 100% das linhas observadas |
| `ra_geo_id` | texto | `RA_01`…`RA_35` — convenção própria desta aba, ver nota acima |
| `ra_name` | texto | nome de exibição da RA |
| `figure_number` | texto | número da Figura de origem no relatório PDAD-A. **Não é inteiro**: ao menos um código de apêndice não numérico existe no dataset real (`"A71"`, indicador `lot_regularization`) |
| `table_number` | texto | número da Tabela do apêndice que confere os valores da figura |
| `section` | texto | seção do relatório (`Moradores`, `Trabalho`, `Domicílios`, `Infraestrutura domiciliar`, `Compras`, `Migração`, `Educação`, `Saúde`, `Animais de estimação`, `PDAD-A 2021`) |
| `indicator_code` | texto | identificador estável do indicador — 39 valores distintos observados; ver `src/pdad/indicators.js` para os que a tela desenha na Fase 1 |
| `indicator_name` | texto | nome de exibição do indicador |
| `universe` | texto | universo da pergunta (ex.: "População total; cada faixa etária; sexo") |
| `segment_dimension` | texto | nome do segundo eixo, quando o indicador cruza duas perguntas (ex.: `Sexo`, `Modalidade x resposta`) — vazio em indicador de eixo único |
| `segment_value` | texto | valor do segundo eixo (ex.: `Feminino`, `Rede Geral`) — vazio quando `segment_dimension` é vazio |
| `response_category` | texto | categoria de resposta — o eixo principal do gráfico |
| `estimate_total` | número | contagem estimada publicada |
| `estimate_pct` | número | **ponto percentual** (`49` = 49%) — mesma escala de `RA_PROFILES`/`IVV_REGION`, nunca a decimal de `IVV_MONTHLY`/FipeZap (R8.44) |
| `source_value_status` | enum | `published`, `partial` ou `suppressed` — suprimido nunca vira `0` na tela |
| `figure_pdf_page` / `table_pdf_page` | inteiro | página do PDF de origem, para rastreabilidade |
| `source_file` | texto | PDF de origem (um por RA) |
| `source_institution` | texto | `IPEDF/DIEPS/COEPS/PDAD-A 2024` ou equivalente 2021 |
| `extraction_basis` | texto | nota livre sobre a base da extração |
| `notes` | texto | nota livre |
| `figure_segmentation` / `figure_data_structure` / `figure_fields_to_capture` / `figure_preferred` / `figure_extraction_rule` / `figure_quality_notes` / `figure_map_status` | texto | metodologia de extração da figura — procedência, não dado de mercado |
| `value_origin` | enum | `published`, `partial_published`, `calculated` ou `suppressed` |
| `source_locator` | texto | localizador da fonte (arquivo + figura/tabela + páginas), formato `chave=valor;chave=valor` |
| `category_raw` | texto | categoria como veio da figura, antes de padronizar |
| `category_standard` | texto | categoria em `snake_case`, estável entre RAs — é a chave de agrupamento entre RAs, não `category_raw` (que pode variar em capitalização/acentuação entre extrações) |

#### Como a tela consolida o formato longo

`src/pdad/aggregate.js` agrupa as linhas em `ano -> RA -> indicador -> categorias`. Duas regras que
não podem se perder:

- **`suppressed`/`partial` nunca vira `0`.** Uma categoria sem valor publicado sai da lista com o
  status preservado; a tela mostra ausência, nunca uma barra vazia (R5.7).
- **"Todas as RAs" é MÉDIA das categorias entre as RAs selecionadas, nunca soma.** Os dois KPIs de
  contagem — população e domicílios — são a exceção: esses somam, porque são contagem, não
  percentual.

Os dois KPIs de contagem (população, domicílios ocupados) **não têm `indicator_code` dedicado** na
planilha. São somados a partir de `estimate_total` de `age_sex_distribution` (17 faixas etárias × 2
sexos, partição exaustiva da população) e `dwelling_type` (tipos de domicílio, partição exaustiva
dos domicílios ocupados) — sempre excluindo a linha `response_category = "Total"` que a própria
figura publica, para não contar em dobro.

#### Indicadores lidos pela tela (issue #100/#102)

`src/pdad/indicators.js` declara 30 chaves de exibição a partir de 34 dos 39 `indicator_code`
observados, agrupadas nos mesmos temas do filtro da tela (`Moradores`, `Saúde`, `Educação`,
`Trabalho`, `Domicílios`, `Infraestrutura`, `Consumo e centralidade`):

| `indicator_code` | Tema | Card |
|---|---|---|
| `age_sex_distribution` | Moradores | Faixa etária |
| `marital_status` | Moradores | Estado civil |
| `drivers_license` | Moradores | Carteira de habilitação |
| `state_of_origin` | Moradores | Estado de origem |
| `move_reason` | Moradores | Motivação de mudança |
| `health_insurance` | Saúde | Plano de saúde |
| `healthcare_need_any` | Saúde | Atendimento de saúde |
| `healthcare_consultation` | Saúde | Rede de atendimento |
| `school_transport` | Educação | Transporte escolar |
| `school_commute_time` | Educação | Tempo até a escola |
| `pea_status` | Trabalho | Participação na PEA |
| `work_location` | Trabalho | Local do trabalho |
| `job_position` | Trabalho | Posição no trabalho |
| `work_regime` | Trabalho | Regime de trabalho |
| `work_transport` | Trabalho | Transporte casa-trabalho |
| `work_commute_time` | Trabalho | Tempo casa-trabalho |
| `tenure_status` | Domicílios | Situação de ocupação |
| `registered_deed` | Domicílios | Escritura registrada |
| `dwelling_type` | Domicílios | Tipo de domicílio (e KPI "Domicílios ocupados") |
| `dwelling_species` | Domicílios | Espécie do domicílio |
| `household_arrangement` | Domicílios | Arranjo domiciliar |
| `domestic_services` | Domicílios | Serviços domésticos |
| `pets` | Domicílios | Animais no domicílio |
| `internet_access` | Infraestrutura | Acesso à internet |
| `vehicles` | Infraestrutura | Posse de veículos |
| `water_supply` | Infraestrutura | Abastecimento de água |
| `sewage` | Infraestrutura | Esgotamento sanitário |
| `electricity_supply` | Infraestrutura | Abastecimento de energia |
| `waste_collection` | Infraestrutura | Coleta de resíduos |
| `purchase_locations` | Consumo e centralidade | Local de compras |
| `purchase_appliances` | Consumo e centralidade | Local de compras |
| `purchase_construction` | Consumo e centralidade | Local de compras |
| `purchase_food` | Consumo e centralidade | Local de compras |
| `purchase_services` | Consumo e centralidade | Local de compras |

Os cinco `purchase_*` compartilham a chave de exibição `shopping` (Figura 59 fatiada por tipo de
compra) e viram card único, com o gráfico próprio `groups` (grupo × destino) — ver
"`purchase_*`: dois formatos de linha para a mesma Figura" abaixo. Fora do card, de propósito — a
linha continua sendo lida e normalizada:

- `domestic_services_frequency` (5 linhas) e `lot_regularization` (3 linhas, `figure_number` não
  numérico `"A71"`): volume baixo demais para um card próprio.
- `labor_force_status`, `internet_type`, `internet_access_any`: perguntas relacionadas às já
  mapeadas (`pea_status`, `internet_access`) — evita duas leituras do mesmo tema na mesma tela.

##### `purchase_*`: dois formatos de linha para a mesma Figura

Achado real na planilha: as cinco linhas de "Local de compras" (Figura 59) não têm o mesmo
formato. `purchase_locations` já publica o tipo de compra em `segment_value` (slug, ex.:
`alimentacao_higiene_limpeza`) e o destino em `response_category` — direto. As outras quatro
(`purchase_appliances`/`purchase_construction`/`purchase_food`/`purchase_services`) têm o tipo de
compra implícito no próprio `indicator_code`; quando o destino foi **publicado**, ele mora em
`response_category` (e `segment_value` repete o tipo de compra, redundante); quando é
**suprimido**, `response_category` vem vazio e o destino sobra em `segment_value` — os dois
formatos coexistem para o mesmo indicador. `src/pdad/aggregate.js` (`shoppingGroupAndDestination`)
resolve os dois formatos antes de agrupar.

Além disso, 17 linhas (`purchase_appliances`/`purchase_construction`/`purchase_food`/
`purchase_services`/`healthcare_consultation`) têm `category_standard` só dígitos — resquício de
uma extração corrigida depois sem remover as linhas antigas, gravando a **contagem** onde deveria
estar o nome da categoria. `src/pdad/normalize-pdad.js` descarta essas linhas com aviso nomeado
(`hasNumericCategory`), antes de chegarem à agregação.

#### Tipos de gráfico por indicador (`PDAD_VIZ`, issue #102)

`src/pdad/charts.js` desenha cada indicador pelo tipo declarado em `PDAD_VIZ`
(`src/pdad/indicators.js`) — mesmo recorte do `VIZ` do protótipo de referência: colunas (`age`),
barra empilhada (`marital`), rosca (`cnh`, `healthPlan`, `healthVisit`, `workRegime`,
`dwellingSpecies`, `deed`, `internet`), pizza (`tenure`), colunas + linha acumulada (`schoolTime`,
`workTime`, ordem fixa em `PDAD_TIME_ORDER`), grupo × destino (`shopping`), barras horizontais
para o restante — com `yesOnly` filtrando as perguntas de múltipla escolha (água/esgoto/energia/
lixo/animais publicam `"categoria · Sim/Não/Não sabe"`; o card resumo mostra só o "Sim", o resto
segue disponível no drill-down).

#### Ranking, Comparar RAs, dispersão e drill-down (issue #102)

Quatro peças adicionais, todas derivadas do mesmo índice agregado — nenhuma tem `indicator_code`
próprio:

- **Ranking dos territórios** (`PDAD_RANK_SET`): 10 indicadores curados de qualidade territorial.
  O item `income` (Renda per capita) usa `attr: 'incomePerCapita'`, um campo que **não existe** em
  `PDAD_A_DATA` — resolve sempre ausente (`rankScalar` devolve `null`), de propósito: `RA_PROFILES`
  usa a convenção `RA2026_RA-I` (romano) para `ra_geo_id`, `PDAD_A_DATA` usa `RA_01..RA_35` — as
  duas NÃO são a mesma chave (ver nota no topo desta seção), e um join por nome de RA seria frágil
  o bastante para preferir mostrar ausência a inventar uma correspondência.
- **Comparar RAs** (`PDAD_COMPARE_KITS`): seleção livre de 2–6 RAs × até 4 indicadores, com três
  kits prontos (`imob`, `perfil`, `infra`).
- **Dispersão territorial** (`PDAD_SCATTER_VIEWS`): 7 leituras cruzadas pré-definidas, correlação
  de Pearson descritiva sobre os pontos com os dois eixos publicados — mesma ausência-nunca-vira-
  substituição de `rankScalar` para ler cada eixo (`attr` ou `key`+`category`). Trava no ano de
  cobertura completa (o mais recente do lote), mesma leitura do protótipo de referência.
  `renda_escritura` herda a mesma ausência de `incomePerCapita` do Ranking.
- **Drill-down**: `detailRowsForKey()` devolve as linhas cruas de `PDAD_A_DATA` para uma
  RA+ano+chave de exibição — a Figura inteira, com segmentação/categoria/total/percentual/status,
  para clique em qualquer categoria de qualquer gráfico. `buildFigureMeta()` deriva o cabeçalho
  (Figura, Tabela, universo, notas de qualidade) da primeira linha vista de cada `indicator_code`.

### POLYGONS — camada única de contornos, A:AP (issues #27, #28, #50)

Aba **opcional** com contrato de cabeçalho, criada por `setupProject()`. Ausência continua sendo
aviso, nunca erro (R2.5).

**Esta é a única aba de geometria da aplicação.** Contorno importado de KML, Região Administrativa
sincronizada do GeoPortal e trecho rodoviário do DER moram todos aqui — o que os separa é
`layer_group`, não uma aba nova. Em particular, **rodovia não é camada nova**: é uma linha de
POLYGONS com `layer_group = 'road_network'`.

Chave: `polygon_id`. Para KML/KMZ, hash SHA-256 estável derivado do arquivo de origem, do índice do
Placemark e do nome — reimportar o mesmo arquivo **não duplica**. Para as sincronizações, o id
embute o hash da geometria: mudou o limite oficial, é uma linha NOVA, e a anterior fica `inactive`
com `geometry_valid_to` preenchido, nunca apagada.

As 42 colunas, em cinco grupos:

**Identidade**

| Campo | Tipo | Obrig. | Preenchimento | Observação |
|---|---|---|---|---|
| `polygon_id` | texto | **sim** | — | chave |
| `name` | texto | **sim** | — | `REQUIRED_FOR_CREATE` exige |
| `category` | texto | não | — | `poligonal` nas sincronizações |
| `subcategory` | texto | não | — | `regiao_administrativa`, `rodovia_der`, `kml_kmz` |
| `entity_type` | texto | não | — | `administrative_region`, `road_segment`, `custom_area` |
| `entity_id` | texto | não | — | id da entidade do mundo real; é por ele que uma versão anterior é superada |
| `geometry_role` | texto | não | — | `boundary` (RA e KML) ou `display_corridor` (rodovia) |
| `ra_geo_id` | texto | não | — | RA a que o contorno pertence, quando aplicável |

**Camada**

| Campo | Tipo | Obrig. | Preenchimento | Observação |
|---|---|---|---|---|
| `layer_group` | texto | não | — | `administrative_regions`, `road_network`, `poligonais_importadas` |

**Cartografia** — o estilo é declarado pelo backend; o cliente não inventa cor.

| Campo | Tipo | Obrig. | Preenchimento | Observação |
|---|---|---|---|---|
| `color` | texto | não | — | cor histórica, mantida por compatibilidade |
| `fill_color` | texto | não | — | preenchimento |
| `stroke_color` | texto | não | — | contorno |
| `fill_opacity` | número | não | — | 0 a 1 |
| `stroke_width` | número | não | — | espessura em px |
| `z_index` | número | não | — | ordem de empilhamento; vazio deixa a decisão ao cliente |
| `centroid_latitude` | número | não | — | média dos vértices — em forma de L pode cair fora do polígono |
| `centroid_longitude` | número | não | — | idem |
| `area_m2` | número | não | — | oficial quando publicada; senão **aproximada e sem descontar buracos** |
| `area_ha` | número | não | — | idem |
| `perimeter_m` | número | não | — | aproximado, só do anel externo |

> **Os três campos métricos são de apoio visual, não medida.** Quando não há valor oficial,
> `polygonMetricsApprox_()` calcula por projeção plana local: só o anel externo entra na conta
> (polígono com buraco fica com a área superestimada), o centroide é a média dos vértices e não o
> centroide de área, e o perímetro ignora os anéis internos. Nos três casos o número sai com a
> ordem de grandeza certa, que é justamente o que impede alguém de desconfiar dele — medida que
> vá ser citada tem que vir da fonte oficial. Coberto por `tests/appsscript-v221-merge.test.js`.

**Procedência**

| Campo | Tipo | Obrig. | Preenchimento | Observação |
|---|---|---|---|---|
| `description` | texto | não | — | do `<description>` do Placemark ou montada pela sincronização |
| `properties_json` | texto | não | — | atributos livres, como objeto JSON |
| `source_url` | url | não | — | validada como http(s) |
| `source_file` | texto | não | — | nome do KML/KMZ de origem |
| `source_system` | texto | não | — | `user_upload`, `GeoPortal_SEDUH_DF`, `DER_DF` |
| `source_layer_name` | texto | não | — | camada de origem |
| `source_feature_id` | texto | não | — | id da feição na fonte |
| `source_crs` | texto | não | — | sempre `EPSG:4326` na planilha |
| `source_page_verified_at` | data | não | — | data da verificação da fonte |
| `confidence_flag` | texto | não | — | confiança na geometria |
| `quality_flag` | texto | não | — | ex.: `official_boundary_simplified_for_sheet` |
| `geometry_hash` | texto | não | — | SHA-256 da geometria; é o que detecta mudança de limite |
| `geometry_valid_from` | data | não | — | início da vigência |
| `geometry_valid_to` | data | não | — | fim da vigência; vazio = vigente |
| `last_synced_at` | data | não | — | última sincronização |
| `imported_at` | data | não | — | preenchido pelo importador |
| `status` | enum | não | — | `active` ou `inactive` |

**Geometria**

| Campo | Tipo | Obrig. | Preenchimento | Observação |
|---|---|---|---|---|
| `geometry_type` | texto | não | — | tipo da geometria desenhada |
| `geometry_geojson` | texto | **sim** | — | `Polygon` ou `MultiPolygon`, `[longitude, latitude]`; **é esta que vai ao mapa** |
| `source_geometry_type` | texto | não | — | tipo da geometria original |
| `display_buffer_m` | número | não | — | buffer por lado usado para derivar o corredor rodoviário: faixa de domínio do DER quando publicada (teto 100 m), senão o valor do menu (padrão 20 m); origem em `properties_json.display_buffer_source` |
| `source_geometry_geojson` | texto | não | — | geometria ORIGINAL; ver abaixo |

#### `source_geometry_geojson` é lido e nunca desenhado

O DER publica o **eixo** do trecho rodoviário, que é `LineString`. O mapa desenha área, então o
corredor visual é derivado do eixo por um buffer de alguns metros por lado — e é esse polígono que
vai para `geometry_geojson`. O eixo original fica em `source_geometry_geojson`, como procedência.

Por isso os dois campos têm validadores diferentes no servidor: `geometry_geojson` aceita só
`Polygon`/`MultiPolygon` (`validateGeoJsonGeometry_`), enquanto `source_geometry_geojson` aceita
também `LineString`/`MultiLineString` (`validateGeoJsonSourceGeometry_`, tipo `geojson_source` em
`FIELD_SCHEMA`).

No cliente, os dois atravessam `normalizePolygon()` como **texto cru, sem `JSON.parse`** — parsear
no normalizador transformaria um blob malformado numa linha em exceção no carregamento de todas as
camadas. O parse acontece no render, por registro, isolado (R2.6). E **desenhar
`source_geometry_geojson` é erro**: para rodovia ela é de um tipo que a camada de contorno não sabe
desenhar.

**A geometria é validada no servidor** antes de ser gravada: precisa ser `Polygon` ou
`MultiPolygon`, cada anel precisa de ao menos quatro posições e três distintas, o anel precisa
estar fechado (primeira posição igual à última), e longitude/latitude precisam estar na faixa
válida. Ordem é sempre `[longitude, latitude]`, como manda o GeoJSON — invertida seria o Golfo da
Guiné em vez do Distrito Federal.

Contornos entram na planilha por três caminhos: a **importação de KML/KMZ** pelo menu do Apps
Script, as duas **sincronizações oficiais** (Regiões Administrativas e rodovias DER, também pelo
menu), e o **desenho no mapa** dentro da área administrativa (issue #37). No desenho, o cliente
monta a geometria em `src/admin/polygon-draw.js` — invertendo para `[longitude, latitude]` e
fechando o anel — e valida com as mesmas regras do servidor antes de enviar, para o erro sair em
português; o servidor revalida de qualquer forma. `polygon_id`, `imported_at` e `source_file` são
sempre do servidor: o cliente não os envia.

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

### IVV_MONTHLY — série mensal do mercado residencial (issues #56, #57, #68)

Aba **opcional**, buscada de verdade a partir da issue #56 (`config.ivvMonthlySheet`), com o mesmo
tratamento de `RA_PROFILES`/`POLYGONS`: promessa iniciada antes do lote obrigatório, teto de tempo
dedicado, e falha ou ausência virando **aviso, nunca erro** (R2.5). O mapa não depende dela.

Chave: `reference_date`. 66 meses (jan/2021 a jun/2026) na planilha viva; **1 linha e 18 colunas**
na semente. Sem recorte por Região Administrativa — a série descreve o DF inteiro.

> **Esta aba não tem contrato no Apps Script, e esta seção é o único que existe.** Na v2.2.1 ela
> está em `OPTIONAL_SHEETS` e `ALLOWED_DATASETS`, mas **não** em `REQUIRED_HEADERS`, **não** em
> `MANAGED_EXTENSION_SHEETS` e **não** em `FIELD_SCHEMA`: `setupProject()` não a provisiona e
> `validateAll()` nunca a valida. Não há lado servidor para cruzar, então a rede é o **triângulo**
> registro (`src/ivv/metrics.js`) ↔ normalizador (`src/ivv/normalize-ivv.js`) ↔ esta seção, fechado
> nos três sentidos por `tests/ivv-contract.test.js`. Esse teste também **verifica no `Code.gs` de
> verdade** que a aba continua sem contrato de backend: no dia em que ganhar um, ele quebra e cobra
> o cruzamento que hoje não existe.

#### Quanto disto é verificado, e quanto é convenção

Em 2026-09-01 o frontend confrontou diretamente a aba pública: **66 meses e 79 cabeçalhos**.
Os nomes reais estão registrados no de-para abaixo. O modelo interno mantém chaves canônicas
estáveis — por exemplo, `sales_units_ytd` — e o normalizador traduz o cabeçalho publicado
`sales_ytd_units` antes de qualquer filtro, soma ou gráfico. Assim o backend não precisa mudar e
o restante do frontend não aprende duas grafias para a mesma grandeza.

Duas consequências práticas, e nenhuma delas é silenciosa:

1. O normalizador **nomeia em aviso** (`COLUNA_NAO_DECLARADA`) toda coluna que a aba trouxer e esta
   seção não declare, e o aviso vai para a **tela**, não só para o console. A primeira carga real
   corrige a convenção em vez de deixá-la como palpite mudo (R5.7).
2. Coluna declarada que não vier é simplesmente ausente — nenhum caminho depende dela para
   funcionar. Os `*_ytd`, antes convencionais, foram confirmados com outra ordem de palavras no
   cabeçalho real e agora entram pelo de-para observado (R8.56).

#### Escala: `ivv_pct` é fração decimal

`ivv_pct = 0.057` significa **5,7%**. É o **oposto** de `RA_PROFILES`, onde `54` significa 54%. As
duas escalas nunca se unificam (R8.44) — trocá-las erra por 100× sem nenhum sintoma.

A escala canônica interna é a decimal. A semente grava `6.5` (ponto percentual), e o normalizador
converte **com aviso nomeado** — coluna, quantos meses, e um exemplo com valor original e
convertido —, nunca em silêncio. Valor que não é plausível em nenhuma das duas escalas é mantido
como veio e sinalizado (`ESCALA_INDETERMINADA`), porque adivinhar ali seria inventar dado.

Os campos `*_pct_change` usam a mesma escala decimal: `-0.1207` significa **-12,07%**. A interface
converte a fração somente ao formatar. Já `ivv_mom_pp` e `ivv_yoy_pp` permanecem em pontos
percentuais; misturar essas duas famílias produz um erro silencioso de 100× (R8.69).

#### Eixo temporal

`reference_date` é o eixo canônico: ordenação e filtro por data saem dele, **nunca** de
`period_id`. O normalizador o fixa no dia 1º do mês — a série é mensal, e uma data no meio do mês
faria dois recortes iguais parecerem períodos diferentes. `year`, `month`, `period_id` e `quarter`
são preenchidos a partir dele **apenas quando a planilha não os trouxer**; publicado nunca é
sobrescrito.

#### Agregação de período

A coluna "Agregação de período" abaixo é a política de `src/ivv/metrics.js`, e ela **não é
uniforme**: fluxo soma, estoque tira média, preço e taxa são razão ponderada **pareada por mês**, e
`launches_developments` recusa. Somar `offers_units` de doze meses devolve doze vezes o estoque
real — plausível, formatado e errado (R8.53). Razão cujos dois lados são somados sobre conjuntos de
meses diferentes erra pelo mesmo tipo de caminho (R8.55).

#### Nomes do schema v1.0.0 na semente

A semente `migration/imob-intelligence-backend.xlsx` é anterior ao schema em vigor e usa outros
nomes para as mesmas grandezas. São traduzidos pelo normalizador, com aviso:

| Nome na semente (v1.0.0) | Nome canônico |
|---|---|
| `offered_units` | `offers_units` |
| `sold_units` | `sales_units` |
| `launched_units` | `launches_units` |
| `launched_projects` | `launches_developments` |
| `offer_price_brl_m2` | `asking_price_brl_m2` |
| `offered_area_m2` | `offer_area_m2` |

#### Cabeçalhos observados na planilha pública

| Nome publicado | Chave canônica do frontend |
|---|---|
| `ivv_ytd_avg_pct` | `ivv_ytd_pct` |
| `offers_ytd_avg_units` | `offers_units_ytd_avg` |
| `sales_ytd_units` | `sales_units_ytd` |
| `launches_ytd_units` | `launches_units_ytd` |
| `offer_area_ytd_avg_m2` | `offer_area_m2_ytd_avg` |
| `sold_area_ytd_m2` | `sold_area_m2_ytd` |
| `asking_price_ytd_calc_brl_m2` | `asking_price_ytd_brl_m2` |
| `sale_price_ytd_calc_brl_m2` | `sale_price_ytd_brl_m2` |
| `vgo_ytd_avg_brl_million` | `vgo_brl_million_ytd_avg` |
| `vgv_ytd_brl_million` | `vgv_brl_million_ytd` |
| `vgl_ytd_brl_million` | `vgl_brl_million_ytd` |
| `cancellations_ytd_units` | `cancellations_units_ytd` |
| `offers_mom_pct_change` | `offers_units_mom_pct_change` |
| `offers_yoy_pct_change` | `offers_units_yoy_pct_change` |
| `sales_mom_pct_change` | `sales_units_mom_pct_change` |
| `sales_yoy_pct_change` | `sales_units_yoy_pct_change` |
| `launches_mom_pct_change` | `launches_units_mom_pct_change` |
| `launches_yoy_pct_change` | `launches_units_yoy_pct_change` |
| `asking_price_mom_pct_change` | `asking_price_brl_m2_mom_pct_change` |
| `asking_price_yoy_pct_change` | `asking_price_brl_m2_yoy_pct_change` |
| `sale_price_mom_pct_change` | `sale_price_brl_m2_mom_pct_change` |
| `sale_price_yoy_pct_change` | `sale_price_brl_m2_yoy_pct_change` |
| `vgo_mom_pct_change` | `vgo_brl_million_mom_pct_change` |
| `vgo_yoy_pct_change` | `vgo_brl_million_yoy_pct_change` |
| `vgv_mom_pct_change` | `vgv_brl_million_mom_pct_change` |
| `vgv_yoy_pct_change` | `vgv_brl_million_yoy_pct_change` |
| `vgl_mom_pct_change` | `vgl_brl_million_mom_pct_change` |
| `vgl_yoy_pct_change` | `vgl_brl_million_yoy_pct_change` |
| `cancellations_mom_pct_change` | `cancellations_units_mom_pct_change` |
| `cancellations_yoy_pct_change` | `cancellations_units_yoy_pct_change` |
| `offer_area_mom_pct_change` | `offer_area_m2_mom_pct_change` |
| `offer_area_yoy_pct_change` | `offer_area_m2_yoy_pct_change` |
| `sold_area_mom_pct_change` | `sold_area_m2_mom_pct_change` |
| `sold_area_yoy_pct_change` | `sold_area_m2_yoy_pct_change` |
| `avg_offer_unit_area_m2` | `avg_offer_area_m2` |
| `avg_sold_unit_area_m2` | `avg_sold_area_m2` |

#### Colunas

**Identificação e filtro** — 8 colunas

| Campo | Tipo | Agregação de período | Origem do nome |
|---|---|---|---|
| `period_id` | texto | — | **convenção** |
| `reference_date` | data (YYYY-MM-DD) | — | **convenção** |
| `year` | inteiro | — | **convenção** |
| `month` | inteiro | — | **convenção** |
| `month_label` | texto | — | **convenção** |
| `quarter` | texto | — | **convenção** |
| `is_latest_period` | booleano | — | **convenção** |
| `reference_month` | data (YYYY-MM-DD) | — | observado na semente |

**Escopo e procedência** — 12 colunas

| Campo | Tipo | Agregação de período | Origem do nome |
|---|---|---|---|
| `geography_scope` | texto | — | **convenção** |
| `market_scope` | texto | — | **convenção** |
| `segment_scope` | texto | — | **convenção** |
| `source_publisher` | texto | — | **convenção** |
| `source_report_generated_at` | texto ISO | — | observado na planilha pública |
| `source_file` | texto | — | **convenção** |
| `source_url` | URL | — | **convenção** |
| `report_filter` | texto | — | **convenção** |
| `quality_flag` | texto | — | **convenção** |
| `source_id` | texto | — | observado na semente |
| `source_locator` | texto | — | observado na semente |
| `verified_at` | data (YYYY-MM-DD) | — | observado na semente |
| `coverage_note` | texto | — | observado na semente |

**Métricas mensais** — 13 colunas

| Campo | Tipo | Agregação de período | Origem do nome |
|---|---|---|---|
| `ivv_pct` | fração decimal | razão ponderada pareada | observado na semente |
| `offers_units` | inteiro | média do período | observado como `offered_units` |
| `sales_units` | inteiro | soma | observado como `sold_units` |
| `launches_units` | inteiro | soma | observado como `launched_units` |
| `launches_developments` | inteiro | **não agregável** | observado como `launched_projects` |
| `cancellations_units` | inteiro | soma | observado na semente |
| `offer_area_m2` | número | média do período | observado como `offered_area_m2` |
| `sold_area_m2` | número | soma | observado na semente |
| `asking_price_brl_m2` | número | razão ponderada pareada | observado como `offer_price_brl_m2` |
| `sale_price_brl_m2` | número | razão ponderada pareada | observado na semente |
| `vgo_brl_million` | número | média do período | observado na semente |
| `vgv_brl_million` | número | soma | observado na semente |
| `vgl_brl_million` | número | soma | observado na semente |

**Derivadas e validação** — 12 colunas

| Campo | Tipo | Agregação de período | Origem do nome |
|---|---|---|---|
| `ivv_pct_check` | fração decimal | não agregável | observado em `IVV_REGION` |
| `ivv_variance_pp` | número | não agregável | observado em `IVV_REGION` |
| `ivv_calc_pct` | fração decimal | não agregável | **convenção** |
| `ivv_diff_pp` | número | não agregável | **convenção** |
| `asking_price_calc_brl_m2` | número | não agregável | **convenção** |
| `asking_price_diff_brl_m2` | número | não agregável | **convenção** |
| `asking_price_diff_pct` | fração decimal | não agregável | observado na planilha pública |
| `sale_price_calc_brl_m2` | número | não agregável | **convenção** |
| `sale_price_diff_brl_m2` | número | não agregável | **convenção** |
| `sale_price_diff_pct` | fração decimal | não agregável | observado na planilha pública |
| `avg_offer_ticket_brl` | número | não agregável | **convenção** |
| `avg_sale_ticket_brl` | número | não agregável | **convenção** |
| `avg_launch_ticket_brl` | número | não agregável | observado na planilha pública |
| `avg_offer_area_m2` | número | não agregável | **convenção** |
| `avg_sold_area_m2` | número | não agregável | **convenção** |
| `cancellations_to_sales_pct` | fração decimal | não agregável | observado na planilha pública |

`cancellations_to_sales_pct` é a única coluna derivada **consumida pela tela** (issue #83): ela
alimenta o gráfico "Distratos sobre vendas" e nada além dele. Está declarada em
`IVV_DERIVED_SERIES` (`src/ivv/metrics.js`), um registro separado do de métricas e **sem
natureza de agregação** — é razão publicada por mês, então dá uma linha honesta no gráfico e não
dá card de período: agregar razão de meses diferentes produziria média de razões, que é
exatamente o erro que a política de agregação por natureza existe para impedir. A escala é
decimal (`0.12` = 12%), como todo `*_pct` desta aba.

**Acumulados do ano civil** — 12 colunas

| Campo | Tipo | Agregação de período | Origem do nome |
|---|---|---|---|
| `sales_units_ytd` | inteiro | lê-se o último mês | **convenção** |
| `launches_units_ytd` | inteiro | lê-se o último mês | **convenção** |
| `cancellations_units_ytd` | inteiro | lê-se o último mês | **convenção** |
| `sold_area_m2_ytd` | número | lê-se o último mês | **convenção** |
| `vgv_brl_million_ytd` | número | lê-se o último mês | **convenção** |
| `vgl_brl_million_ytd` | número | lê-se o último mês | **convenção** |
| `ivv_ytd_pct` | fração decimal | lê-se o último mês | **convenção** |
| `offers_units_ytd_avg` | número | lê-se o último mês | **convenção** |
| `offer_area_m2_ytd_avg` | número | lê-se o último mês | **convenção** |
| `vgo_brl_million_ytd_avg` | número | lê-se o último mês | **convenção** |
| `asking_price_ytd_brl_m2` | número | lê-se o último mês | **convenção** |
| `sale_price_ytd_brl_m2` | número | lê-se o último mês | **convenção** |

**Variações** — 26 colunas

| Campo | Tipo | Agregação de período | Origem do nome |
|---|---|---|---|
| `ivv_mom_pp` | número | não agregável | **convenção** |
| `ivv_yoy_pp` | número | não agregável | **convenção** |
| `ivv_mom_pct_change` | número | não agregável | **convenção** |
| `ivv_yoy_pct_change` | número | não agregável | **convenção** |
| `offers_units_mom_pct_change` | número | não agregável | **convenção** |
| `offers_units_yoy_pct_change` | número | não agregável | **convenção** |
| `sales_units_mom_pct_change` | número | não agregável | **convenção** |
| `sales_units_yoy_pct_change` | número | não agregável | **convenção** |
| `launches_units_mom_pct_change` | número | não agregável | **convenção** |
| `launches_units_yoy_pct_change` | número | não agregável | **convenção** |
| `cancellations_units_mom_pct_change` | número | não agregável | **convenção** |
| `cancellations_units_yoy_pct_change` | número | não agregável | **convenção** |
| `offer_area_m2_mom_pct_change` | número | não agregável | **convenção** |
| `offer_area_m2_yoy_pct_change` | número | não agregável | **convenção** |
| `sold_area_m2_mom_pct_change` | número | não agregável | **convenção** |
| `sold_area_m2_yoy_pct_change` | número | não agregável | **convenção** |
| `asking_price_brl_m2_mom_pct_change` | número | não agregável | **convenção** |
| `asking_price_brl_m2_yoy_pct_change` | número | não agregável | **convenção** |
| `sale_price_brl_m2_mom_pct_change` | número | não agregável | **convenção** |
| `sale_price_brl_m2_yoy_pct_change` | número | não agregável | **convenção** |
| `vgo_brl_million_mom_pct_change` | número | não agregável | **convenção** |
| `vgo_brl_million_yoy_pct_change` | número | não agregável | **convenção** |
| `vgv_brl_million_mom_pct_change` | número | não agregável | **convenção** |
| `vgv_brl_million_yoy_pct_change` | número | não agregável | **convenção** |
| `vgl_brl_million_mom_pct_change` | número | não agregável | **convenção** |
| `vgl_brl_million_yoy_pct_change` | número | não agregável | **convenção** |

> **`*_calc_*`, `*_check` e `*_diff_*` sinalizam divergência; não substituem o valor publicado.**
> `ivv_pct` vence `ivv_calc_pct` sempre (R8.54). E `ivv_mom_pp` e `ivv_mom_pct_change` são grandezas
> **diferentes**, que nunca se misturam: +1 p.p. e +20% podem descrever o mesmo movimento.

---

### FIPEZAP_MONTHLY — preço de venda/locação FipeZap, DF e por localidade

Aba **opcional**, sem contrato no Apps Script — mesmo tratamento de `IVV_MONTHLY`: não está em
`REQUIRED_HEADERS`/`FIELD_SCHEMA`, `setupProject()` não a provisiona e `validateAll()` nunca a
valida. Ausência ou falha vira aviso, nunca erro (R2.5); o mapa e o IVV continuam funcionando sem
ela.

Chave: `fipezap_id`. 3369 linhas na planilha viva, jan/2011 a jun/2026 conforme o segmento (a
série residencial de venda é a mais longa; comercial começa em 2019). Cabeçalhos confirmados **ao
vivo** contra o GViz da planilha em 2026-09-03 — batem exatamente com o `.xlsx` de referência,
sem divergência de nomes conhecida (diferente do histórico do IVV_MONTHLY).

**Duas linhas por mês, por segmento e por âmbito geográfico**: `geography_scope = DF_TOTAL`
(agregado do Distrito Federal — o único âmbito que forma série temporal utilizável) e
`geography_scope = LOCALIDADE` (uma linha por localidade, mesmo dado que
`FIPEZAP_LOCALITY_MONTHLY` republica em formato largo — ver seção seguinte). `segment_scope`
(`RESIDENCIAL`/`COMERCIAL`) × `transaction_type` (`VENDA`/`LOCACAO`) formam os quatro cortes de
`DF_TOTAL`: 187 meses (venda residencial, 2011+), 139 (locação residencial, 2015+), 91 e 91
(venda e locação comercial, ambas 2019+).

| Coluna | Tipo | Papel |
|---|---|---|
| `fipezap_id` | texto | chave |
| `reference_date` | data | eixo temporal canônico — mesmo tratamento de `IVV_MONTHLY`, normalizado para o dia 1º do mês |
| `segment_scope` | texto | `RESIDENCIAL` / `COMERCIAL` |
| `transaction_type` | texto | `VENDA` / `LOCACAO` |
| `geography_scope` | texto | `DF_TOTAL` / `LOCALIDADE` |
| `source_locality_name`, `ra_name`, `ra_geo_id` | texto | preenchidos só quando `geography_scope = LOCALIDADE` |
| `price_unit` | texto | `BRL_M2` (venda) ou `BRL_M2_MES` (locação) |
| `price_brl_m2` | número | preço publicado do mês — venda ou locação, conforme `transaction_type` |
| `official_yield_monthly_pct`, `official_yield_annual_pct` | fração decimal | **só preenchidos em linhas `LOCACAO`** (confirmado: 0/187 em VENDA, 137–139/139 em LOCACAO) — é onde a razão aluguel/preço existe, não ausência de dado |
| `calculated_yield_monthly_pct`, `calculated_yield_annual_pct` | fração decimal | recálculo do backend FipeZap; mesmo escopo de `LOCACAO` |
| `price_mom_pct_change`, `price_ytd_pct_change`, `price_yoy_pct_change` | fração decimal | variações já publicadas |
| `price_to_rent_months` | número | meses de aluguel para pagar o imóvel — só em `LOCACAO` |
| `diff_vs_df_pct` | fração decimal | diferença da localidade contra o `DF_TOTAL` do mesmo mês/segmento/transação — só em linhas `LOCALIDADE` |
| `rank_price`, `rank_yoy` | inteiro | ranking entre localidades do mesmo mês — só em linhas `LOCALIDADE` |
| `sample_n`, `source_publisher`, `source_type`, `source_url`, `source_page`, `notes`, `quality_flag`, `source_workbook`, `source_id`, `note_id` | texto/url | procedência — `source_id`/`note_id` apontam para `FIPEZAP_SOURCES`/`FIPEZAP_NOTES`, não lidas ainda |

> **Escala do yield é fração DECIMAL** (`0.042` = 4,2%) — confirmado nos dados reais, mesma
> convenção de `IVV_MONTHLY` (oposta à de `IVV_REGION`, que é ponto percentual). As duas escalas
> nunca se unificam (R8.44/R8.60): o normalizador (`src/fipezap/normalize-fipezap.js`) sinaliza,
> nunca converte às cegas, todo valor de fração fora da faixa plausível.

O normalizador nomeia em aviso toda coluna que a aba trouxer e esta seção não declare
(`COLUNA_NAO_DECLARADA`), mesmo mecanismo do IVV_MONTHLY.

### FIPEZAP_LOCALITY_MONTHLY — venda × locação por localidade/RA

Aba **opcional**, mesmo tratamento de `FIPEZAP_MONTHLY`. Chave: `locality_monthly_id`. 1714
linhas, 2019–2026, 29 localidades (26 com dado residencial, algumas só comercial — `SIA` é zona
comercial/industrial e não tem série residencial, por exemplo).

**Diferente de `FIPEZAP_MONTHLY`**, que publica venda e locação em LINHAS separadas
(`transaction_type`), esta aba já vem **rebuilt** (`rebuilt_at`) num formato largo — uma linha por
localidade/mês/segmento com `sale_price_brl_m2` e `rent_price_brl_m2_month` lado a lado —
justamente para permitir o gráfico de duas séries pareadas sem juntar linhas em tempo de execução.

| Coluna | Tipo | Papel |
|---|---|---|
| `locality_monthly_id` | texto | chave |
| `reference_date` | data | eixo temporal canônico, mesmo tratamento das demais abas mensais |
| `segment_scope` | texto | `RESIDENCIAL` / `COMERCIAL` |
| `source_locality_name`, `ra_name`, `ra_geo_id` | texto | identidade territorial |
| `geography_classification` | texto | `RA_OU_LOCALIDADE_FIPE` ou `SUBMERCADO_FIPE` — ver nota abaixo |
| `sale_price_brl_m2` | número | preço de venda do mês |
| `rent_price_brl_m2_month` | número | preço de locação do mês |
| `calculated_yield_monthly_pct`, `calculated_yield_annual_pct` | fração decimal | mesma escala decimal de `FIPEZAP_MONTHLY` |
| `sale_yoy_pct_change`, `rent_yoy_pct_change` | fração decimal | variação ano contra ano |
| `sale_diff_vs_df_pct`, `rent_diff_vs_df_pct` | fração decimal | diferença contra o `DF_TOTAL` de `FIPEZAP_MONTHLY` |
| `sale_price_rank`, `rent_price_rank` | inteiro | ranking entre localidades do mesmo mês |
| `quality_flag`, `source_workbook`, `rebuilt_at` | texto/data | procedência |

Este é o único dataset do projeto com **série temporal por Região Administrativa** — `IVV_REGION`
é retrato de um mês só. É por isso que ele abre a comparação "como o preço evoluiu nesta RA?", que
o IVV_REGION não pode responder.

> **`source_locality_name` mistura dois níveis geográficos, e `ra_name` sozinho não desambigua.**
> Das 29 localidades, 11 são a RA inteira (`geography_classification = RA_OU_LOCALIDADE_FIPE`,
> ex.: Gama, Lago Sul, SIA) e 18 são submercado DENTRO de uma RA
> (`SUBMERCADO_FIPE`) — Asa Sul, Asa Norte, Setor Noroeste e Vila Planalto são as quatro dentro do
> Plano Piloto, por exemplo. Sete valores de `ra_name` cobrem essas 18 localidades: agrupar ou
> listar por `ra_name` sem tratar isso mostra "Plano Piloto" repetido quatro vezes, indistinguível.
> `src/fipezap/locality.js` (`localitiesAvailable`) resolve isso agrupando por `ra_name` só quando
> ambíguo e rotulando pelo nome do submercado (`source_locality_name`) nesses casos — nunca infere
> a hierarquia por conta própria; lê o que `geography_classification` já declara.

---

## Abas rodoviárias e de tráfego (Apps Script v2.2.1, issue #50)

Três abas **opcionais** criadas por `setupProject()` a partir da v2.2.1. Elas têm contrato de
cabeçalho em `REQUIRED_HEADERS` e schema de tipos em `FIELD_SCHEMA`, mas **não têm normalizador no
cliente ainda** e **não estão em `WRITE_ALLOWLIST`**: nenhuma delas é gravável pela API de escrita.
São preenchidas pela sincronização rodoviária do menu e pela importação de tráfego.

A rodovia que aparece no mapa **não vem daqui**: vem de `POLYGONS`, com
`layer_group = 'road_network'`. Estas abas guardam o cadastro do trecho e a contagem; `POLYGONS`
guarda a geometria desenhável.

### ROAD_SEGMENTS — cadastro do trecho rodoviário

Chave: `road_segment_id`, canônico `ROADSEG_<código do trecho normalizado>`.

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `road_segment_id` | texto | **sim** | chave |
| `current_polygon_id` | texto | não | aponta para a linha vigente em `POLYGONS` |
| `source_segment_code` | texto | não | código do posto de contagem em `TRAFFIC_DAILY_TEST.trecho` (DER-DF/DNIT); é o `cod_distrital` da camada `Rodovias_2025`, ver nota abaixo |
| `road_name` | texto | não | nome da rodovia |
| `road_code` | texto | não | sigla (ex.: `DF-075`); extraída do código do posto quando `sigla` não vem da camada (sempre o caso hoje) |
| `segment_type` | texto | não | tipo do trecho |
| `jurisdiction` | texto | não | jurisdição |
| `administration` | texto | não | administração |
| `length_m` | número | não | comprimento do eixo, por haversine |
| `source_system` | texto | não | `DER_DF` |
| `source_layer_name` | texto | não | camada de origem |
| `source_feature_id` | texto | não | ids das feições, separados por vírgula |
| `source_crs` | texto | não | `EPSG:4326` na planilha (nativo `EPSG:31983`) |
| `valid_from` / `valid_to` | texto | não | vigência |
| `is_current` | booleano | não | trecho vigente |
| `properties_json` | texto | não | atributos do DER e resumo de tráfego |
| `confidence_flag` | texto | não | confiança na geometria |
| `quality_flag` | texto | não | qualidade |
| `last_synced_at` | texto | não | última sincronização |

> **Casamento exato por código do posto, na camada do DER/DF no ArcGIS Hub (v2.3.0, issue #105).**
> `fetchDerRoadByCode_` (`optional-apps-script/Code.gs`) consulta
> `Rodovias_2025/FeatureServer/0` (`DER_ROAD_LAYER_URL`, serviço `services7.arcgis.com/mLiYCaoVbEXk2abA`)
> com `cod_distrital = '<código>' OR cod_distrital2 = '<código>'` — o campo `cod_distrital` carrega
> exatamente os códigos usados em `TRAFFIC_DAILY_TEST.trecho` (`001EDF0070`, `001EDF0090`, …),
> verificado ao vivo. Código sem feição → trecho `skipped` com aviso; **não há mais fallback por
> rota** (`nome LIKE '%DF-NNN%'`), que produzia o corredor da rota inteira em vez do trecho do posto.
> A camada anterior (`SISTEMA_VIARIO/MapServer/9`, campo `codtrechorodov` vazio em todos os registros)
> deixou de ser usada. Resultado: `quality_flag: official_centerline_synced` /
> `confidence_flag: high_official_der_geometry` (aqui e na linha de `POLYGONS`).
>
> `road_code` vem de `rodovia` (`DF001` → `DF-001`), `road_name` de `descricao_inicial → descricao_final`
> e `properties_json` carrega os atributos oficiais com prefixo `der_`: `der_tmd` (tráfego médio
> diário do DER), `der_lanes_total` (`fx_total`), `der_speed_limit_kmh`, `der_class_ctb`,
> `der_physical_status`, `der_extension_km`, `der_km_start`/`der_km_end`, `der_description_start`/`der_description_end`,
> `der_fd_right_m`/`der_fd_left_m` (faixa de domínio por lado, com `der_fd_group` e `der_fd_legislation`), `der_lanes_left`/`der_lanes_right`, `der_surface`, `der_jurisdiction`, `der_administration`, `der_source_layer`
> (`Rodovias_2025`) e `der_feature_id`. O resumo de tráfego (`traffic_*`) continua sendo um
> **snapshot** da sincronização; o valor vivo vem de `TRAFFIC_DAILY_TEST`.
>
> A largura do corredor em `POLYGONS.display_buffer_m` é a **faixa de domínio oficial por lado**
> (média de `fd_direita_larg`/`fd_esquerda_largu`, 65 m na DF-001), com teto de 100 m; sem esse dado,
> vale o buffer informado no menu (padrão 20 m). A origem fica em
> `properties_json.display_buffer_source` (`der_faixa_de_dominio` ou `default_buffer`).

### ROAD_SEGMENT_ALIASES — ponte entre códigos

Chave: `alias_id`. Existe porque o código do trecho na fonte de tráfego e o do DER podem divergir
ao longo do tempo; sem uma tabela de ponte, uma renomeação de código quebraria a relação em
silêncio.

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `alias_id` | texto | **sim** | chave |
| `road_segment_id` | texto | não | trecho de destino |
| `source_segment_code` | texto | não | código na fonte |
| `source_system` | texto | não | sistema de origem |
| `valid_from` / `valid_to` | texto | não | vigência do apelido |
| `match_method` | texto | não | `official_code` quando a relação é direta |
| `match_confidence` | texto | não | confiança da relação |
| `source_file` | texto | não | arquivo/serviço de origem |
| `notes` | texto | não | observação |
| `imported_at` | texto | não | carimbo de importação |

### TRAFFIC_DAILY_TEST — contagem diária por trecho

Chave: `traffic_daily_id`. `trecho` é o código bruto da fonte; `road_segment_id` é carimbado pela
sincronização rodoviária a partir dele.

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `traffic_daily_id` | texto | **sim** | chave |
| `trecho` | texto | não | código do trecho na fonte |
| `sentido` | texto | não | sentido da via |
| `dia` | data | não | dia da contagem |
| `fluxo_total` | número | não | fluxo total do dia |
| `carro` / `moto` / `onibus` / `caminhao` / `medio` / `indefinido` | número | não | fluxo por classe |
| `intervalos_15min_observados` | inteiro | não | intervalos com observação |
| `cobertura_dia_pct` | número | não | cobertura do dia |
| `pico_15min_fluxo` | número | não | pico de 15 minutos |
| `pico_15min_intervalo` | texto | não | intervalo do pico |
| `soma_classes` | número | não | soma das classes |
| `divergencia_total_classes` | número | não | diferença entre total e soma das classes |
| `quality_flag` | texto | não | qualidade |
| `imported_at` | texto | não | carimbo de importação |
| `road_segment_id` | texto | não | preenchido pela sincronização rodoviária |
| `source_file` | texto | não | arquivo de origem |
| `source_total_policy` | texto | não | política usada para o total |
| `traffic_schema_version` | texto | não | versão do schema da fonte |
| `profile_total_15m_json` | texto | não | perfil de 15 em 15 minutos, total |
| `profile_classes_15m_json` | texto | não | perfil de 15 em 15 minutos, por classe |

> Os nomes de coluna destas três abas estão em português porque vieram assim da fonte de tráfego.
> Renomeá-los seria mudança de contrato sem ganho — o resto do schema segue em inglês.

---

## Provisionamento pós-semente (Apps Script v2.0.0 e v2.2.1)

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
| `RA_PROFILES` | `ra_code` | issue #50 |
| `RA_PROFILES` | `ra_number` | issue #50 |
| `RA_PROFILES` | `area_km2` | issue #50 |
| `RA_PROFILES` | `average_age` | issue #50 |
| `RA_PROFILES` | `female_pct` | issue #50 |
| `RA_PROFILES` | `male_pct` | issue #50 |
| `RA_PROFILES` | `households_total` | issue #50 |
| `RA_PROFILES` | `avg_household_size` | issue #50 |
| `RA_PROFILES` | `dominant_dwelling_type` | issue #50 |
| `RA_PROFILES` | `dominant_dwelling_type_pct` | issue #50 |
| `RA_PROFILES` | `dominant_tenure` | issue #50 |
| `RA_PROFILES` | `dominant_tenure_pct` | issue #50 |
| `RA_PROFILES` | `deed_registered_pct` | issue #50 |
| `RA_PROFILES` | `profile_reference_year` | issue #50 |
| `RA_PROFILES` | `profile_status` | issue #50 |
| `RA_PROFILES` | `profile_source_url` | issue #50 |
| `RA_PROFILES` | `geometry_source_url` | issue #50 |
| `RA_PROFILES` | `created_after_pdad_2024` | issue #50 |
| `RA_PROFILES` | `predecessor_ra` | issue #50 |
| `RA_PROFILES` | `legal_reference` | issue #50 |
| `RA_PROFILES` | `quality_flag` | issue #50 |
| `RA_PROFILES` | `notes` | issue #50 |
| `POLYGONS` | *(aba inteira)* | issues #27, #28 |
| `ROAD_SEGMENTS` | *(aba inteira)* | issue #50 |
| `ROAD_SEGMENT_ALIASES` | *(aba inteira)* | issue #50 |
| `TRAFFIC_DAILY_TEST` | *(aba inteira)* | issue #50 |
| `FIPEZAP_MONTHLY` | *(aba inteira)* | issue #120 (v2.4.0) |
| `FIPEZAP_LOCALITY_MONTHLY` | *(aba inteira)* | issue #120 (v2.4.0) |
| `FIPEZAP_LOCALITY_MAP` | *(aba inteira)* | issue #120 (v2.4.0) |
| `FIPEZAP_SOURCES` | *(aba inteira)* | issue #120 (v2.4.0) |
| `FIPEZAP_NOTES` | *(aba inteira)* | issue #120 (v2.4.0) |

---

## Abas operacionais (Apps Script)

Não são lidas pelo mapa. Existem na planilha com cabeçalho e sem linhas — é o Apps Script que
as preenche. `setupProject()` deve completá-las **sem sobrescrever** o que já existir.

### APP_META
`key | value | updated_at`

Chaves: `app_version`, `dataset_version`, `last_data_change_at`, `last_validation_at`,
`validation_status`, `validation_errors`, `validation_warnings`, `last_meta_refresh_at`,
`rows_listings`, `rows_developments`, `rows_anchors`, `rows_ra_profiles`, `rows_polygons`,
`rows_road_segments`, `rows_road_segment_aliases`, `rows_traffic_daily_test`.

Chaves da v2.4.0 (`refreshMeta()`): `rows_ivv_monthly`, `rows_ivv_region`, `rows_fipezap_monthly`,
`rows_fipezap_locality_monthly`, `rows_fipezap_locality_map`, `rows_fipezap_sources`,
`rows_fipezap_notes`, `rows_pdad_data`, `rows_pdad_coverage`, `rows_listings_coverage`,
`rows_polygons_active`, `fipezap_period_start`, `fipezap_period_end`. Para estas, **aba ausente
publica valor vazio, não `0`**: "não existe" e "existe vazia" são estados diferentes. As chaves
`fipezap_*` de procedência (`fipezap_schema_version`, `fipezap_expected_rows_*`,
`fipezap_data_load_status`, `fipezap_view_status`, `last_fipezap_*`) são escritas pela sincronização
FipeZAP; `fipezap_expected_rows_*` é o que `validateAll()` usa para cobrar contagem — atualize-as
quando a série crescer de propósito.

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
`severity | sheet | row | record_id | field | code | message | detected_at | category`

Validações mínimas: aba obrigatória ausente · cabeçalho ausente · ID vazio · ID duplicado ·
latitude inválida · longitude inválida · apenas uma coordenada preenchida · URL suspeita ou
inválida · preço não positivo · área não positiva · divergência grande de preço/m² · campo
crítico ausente · (v2.4.0) período FipeZAP ilegível, observação FipeZAP duplicada, fonte FipeZAP
inexistente, faixa/mês/escala de IVV_REGION, fila de pesquisa de DEVELOPMENTS.

`category` (v2.4.0) é derivada do `code` por `qualityCategoryOf_()` e agrupa os achados num
vocabulário fechado: `schema`, `data_type`, `missing_value`, `duplicate`, `invalid_url`, `spatial`,
`price`, `date`, `source`, `coverage` (e `other` para código desconhecido). A aba sai **ordenada por
severidade → aba → categoria → linha**, para funcionar como painel de manutenção. A semente
(`migration/*.xlsx`) tem 8 colunas; `setupProject()` acrescenta a nona.

`severity = warning` com `category = coverage` é **fila de pesquisa**, não defeito: registra o que
falta (coordenada, preço, unidades, entrega, estágio de um empreendimento; mês sem linha na série
FipeZAP) para orientar a pesquisa manual do Plano 02. Não se corrige inventando valor.

**Registro ruim é sinalizado, nunca apagado automaticamente.** A decisão de remover é humana.

### LISTINGS_COVERAGE (v2.4.0)
`ra_geo_id | ra_name | property_type | bedroom_bucket | price_bucket | active_count | with_price_count | with_area_count | with_valid_price_m2_count | portals_count | latest_observed_at | coverage_status | computed_at`

Matriz de cobertura de anúncios, reescrita por inteiro por `buildListingsCoverage()`. Duas
granularidades na mesma aba: uma linha `TODOS`/`TODOS` para **cada** RA de `RA_PROFILES` × tipo do
vocabulário (inclusive com zero — é assim que a lacuna aparece) e linhas detalhadas só para as
combinações observadas. `bedroom_bucket` ∈ `studio_kitnet`, `1Q`, `2Q`, `3Q`, `4+Q`, `sem_info`;
`price_bucket` ∈ `ate_300k`, `300k_500k`, `500k_750k`, `750k_1M`, `1M_2M`, `2M_5M`, `5M_mais`,
`sem_preco`; `coverage_status` ∈ `none` (0 ativo), `single` (1), `thin` (2), `single_portal` (≥3 de um
portal só), `ok`. `ra_geo_id` usa a convenção de LISTINGS (`RA2026_RA-I`), construída a partir de
`RA_PROFILES.ra_code`. Nunca editada à mão; nunca lida pelo mapa.

### PDAD_A_COVERAGE (v2.4.0)
`ra_geo_id | ra_name | pdad_year | indicator_code | indicator_name | figure_number | table_number | categories_expected | categories_loaded | published_count | suppressed_count | has_figure | has_table_check | coverage_status | quality_status | last_checked_at | notes`

Uma linha por RA × ano × indicador **autorizado em `PDAD_A_FIGURE_MAP`**, reescrita por
`buildPdadCoverage()`. `coverage_status` ∈ `complete`, `partial`, `suppressed_source` (só linhas
suprimidas), `missing` (nenhuma linha), `needs_review` (indicador presente em `PDAD_A_DATA` mas fora
do mapa canônico — nunca aceito em silêncio). `categories_expected` é o **máximo observado** entre as
RAs para o mesmo indicador e ano: o mapa de figuras não publica a contagem, e a heurística é declarada
em vez de inventada. Uma RA só é "completa" quando todos os indicadores autorizados têm status
conhecido — não porque tem muitas linhas (Plano 02 §9.3).

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
