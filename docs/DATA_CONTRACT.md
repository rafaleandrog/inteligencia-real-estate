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
vazia (R2.5). `PRIMARY_OFFERS` e `IVV_REGION` não são lidas pela tela ainda. `RA_PROFILES` passou a
ser lida a partir da issue #33/#34 e `IVV_MONTHLY` a partir da issue #56 — ver as seções dedicadas
abaixo.

| Aba | Chave | Linhas | Papel |
|---|---|---|---|
| `PRIMARY_OFFERS` | `observation_id` | 29 | Observações unitárias do mercado primário, previstas para uma fase futura |
| `IVV_MONTHLY` | `reference_date` | 1 na semente, 66 na planilha | Série mensal do mercado residencial do DF (IVV) — **lida pela tela** |
| `IVV_REGION` | `reference_month` + `market_region` + `bedroom_bucket` | 95 | IVV por região e faixa de quartos |
| `RA_PROFILES` | `ra_geo_id` | 35 | Indicadores territoriais por Região Administrativa (censo + PDAD) — **lida pela tela** |
| `POLYGONS` | `polygon_id` | 0 | Contornos: KML/KMZ, Regiões Administrativas e rodovias — criada pelo `setupProject()` v2.0.0, ampliada para A:AP na v2.2.1 |
| `ROAD_SEGMENTS` | `road_segment_id` | 0 | Trecho rodoviário oficial do DER/DF — criada pelo `setupProject()` v2.2.1 |
| `ROAD_SEGMENT_ALIASES` | `alias_id` | 0 | Ponte entre o código de trecho da fonte de tráfego e o `road_segment_id` |
| `TRAFFIC_DAILY_TEST` | `traffic_daily_id` | 0 | Contagem diária de tráfego por trecho |

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
| `display_buffer_m` | número | não | — | buffer por lado usado para derivar o corredor rodoviário |
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
| `source_segment_code` | texto | não | `codtrechorodov` do DER |
| `road_name` | texto | não | nome da rodovia |
| `road_code` | texto | não | sigla (ex.: `DF-075`) |
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
