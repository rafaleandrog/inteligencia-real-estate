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

**`property_type`:** `apartamento`, `casa`, `casa_condominio`, `kitnet`, `predio`, `terreno`.
**`coordinate_precision`:** `locality_centroid_deterministic_jitter`, `locality_centroid_jitter`.
**`confidence_flag`:** `low_spatial_high_attribute` — atributos confiáveis, localização aproximada.

`asking_price_brl_m2` é **derivado**: calculado por `asking_price_brl / area_m2` quando vazio.
Valor já preenchido não é sobrescrito; divergência grande vira alerta em `DATA_QUALITY` (§17).

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

> **7 dos 22 empreendimentos não têm coordenada** (`spatial_usable = 0`). Eles continuam
> existindo como registro, aparecem na contagem e na busca, e **não vão ao mapa**. Metade de uma
> coordenada é pior que nenhuma — colocaria o ponto no lugar errado. `computeKpis` expõe isso em
> `withoutCoord` para que o buraco fique visível em vez de silencioso.

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

**`category`:** `escola`, `mobilidade`, `parque_equipamento_publico`, `saude`, `shopping_center`,
`supermercado_atacarejo`, `universidade`.

Diferente dos anúncios, âncoras têm coordenada **precisa** (`school_polygon_reference_point` e
similares, `confidence_flag: high`).

---

## Abas opcionais

Ausência gera **warning**, nunca erro. A aplicação não pode cair porque uma aba futura está
vazia (R2.5). Nenhuma delas é lida pela tela da V1.

| Aba | Chave | Linhas | Papel |
|---|---|---|---|
| `PRIMARY_OFFERS` | `observation_id` | 29 | Observações unitárias do mercado primário, previstas para uma fase futura |
| `IVV_MONTHLY` | `reference_month` | 1 | Índice de Velocidade de Vendas mensal do DF |
| `IVV_REGION` | `reference_month` + `market_region` + `bedroom_bucket` | 95 | IVV por região e faixa de quartos |
| `RA_PROFILES` | `ra_geo_id` | 35 | Indicadores territoriais por Região Administrativa (censo + PDAD) |

> **Divergência D2 — `IVV_REGION` tem `ivv_pct` e `ivv_pct_published`.** `ivv_pct` é alias de
> compatibilidade consumido pelo Apps Script; `ivv_pct_published` é o valor do dataset original.
> Manter os dois em sincronia é responsabilidade de quem edita a aba.

---

## Abas operacionais (Apps Script)

Não são lidas pelo mapa. Existem na planilha com cabeçalho e sem linhas — é o Apps Script que
as preenche. `setupProject()` deve completá-las **sem sobrescrever** o que já existir.

### APP_META
`key | value | updated_at`

Chaves: `app_version`, `dataset_version`, `last_data_change_at`, `last_validation_at`,
`validation_status`, `validation_errors`, `validation_warnings`, `last_meta_refresh_at`,
`rows_listings`, `rows_developments`, `rows_anchors`.

### DATA_QUALITY
`severity | sheet | row | record_id | field | code | message | detected_at`

Validações mínimas: aba obrigatória ausente · cabeçalho ausente · ID vazio · ID duplicado ·
latitude inválida · longitude inválida · apenas uma coordenada preenchida · URL suspeita ou
inválida · preço não positivo · área não positiva · divergência grande de preço/m² · campo
crítico ausente.

**Registro ruim é sinalizado, nunca apagado automaticamente.** A decisão de remover é humana.

### CHANGE_LOG
`timestamp | sheet | range | record_id | old_value | new_value | editor`

Diagnóstico operacional, não auditoria corporativa. Histórico limitado a **5.000 eventos**.

---

## Divergências registradas

| # | Onde | O quê |
|---|---|---|
| **D2** | `IVV_REGION` | `ivv_pct` é alias de compatibilidade de `ivv_pct_published` |
| **D3** | `reference/index-v3.html` × planilha | No V3, `primaryMarket` traz ofertas aninhadas. Na migração futura, elas podem ser preservadas na aba opcional `PRIMARY_OFFERS`; não formam uma aba obrigatória do runtime |
| **D4** | `DEVELOPMENTS` | 22 linhas na planilha × 10 no V3: 12 registros do mercado primário foram incorporados usando apenas campos semanticamente equivalentes |

Divergência se registra. Não se resolve em silêncio (R8.3).
