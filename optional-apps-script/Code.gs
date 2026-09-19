/**
 * Imob Intelligence — camada de operação, automação, validação e governança.
 *
 * Este script NÃO é o ponto de leitura da aplicação. O site lê a planilha direto
 * via Google Visualization Query enquanto isso for simples e confiável; aqui ficam
 * setup, validação, log de mudanças, versionamento de dataset e manutenção.
 *
 * Prioridade de projeto: correção → idempotência → segurança → observabilidade →
 * simplicidade. Ver .agents/skills/imob-appscript/SKILL.md.
 *
 * Versão 2.0.0:
 *   - migração aditiva de classificações e indicadores previstos nas issues #26/#30/#31/#32/#35/#39;
 *   - aba POLYGONS, importação KML/KMZ idempotente e escrita autenticada de GeoJSON;
 *   - compatibilidade simultânea com action/sheet e resource/entity/method;
 *   - remoção segura de credenciais legadas expostas em APP_META.
 *
 * Versão 2.0.1:
 *   - concorrência otimista deixa de conflitar com o provisionamento de schema da
 *     própria requisição (R8.17). Sem isso, a primeira escrita administrativa depois
 *     de uma migração devolvia VERSION_CONFLICT mesmo sem ninguém ter tocado no dado.
 *
 * Versão 2.0.2:
 *   - provisionamento de cabeçalho restrito a PROVISIONABLE_COLUMNS (R8.40);
 *   - coordenada nula/vazia deixa de virar 0 e de ser persistida como geografia real;
 *   - token administrativo já exposto em APP_META é REVOGADO, nunca repromovido (R8.41);
 *   - `applyClassificationDerivations_()` deriva group/segment/sales_stage na escrita.
 *
 * Versão 2.2.1 (fusão de três vias — issue #50):
 *   - traz da v2.2.0 o contrato POLYGONS A:AP (42 colunas), RA_PROFILES expandida, as
 *     abas ROAD_SEGMENTS / ROAD_SEGMENT_ALIASES / TRAFFIC_DAILY_TEST, a sincronização
 *     das Regiões Administrativas (GeoPortal/SEDUH) e a sincronização rodoviária DER/DF;
 *   - PRESERVA as quatro correções da v2.0.2, que a v2.2.0 regredia por ter sido
 *     construída a partir da v2.0.0 (R8.48). Toda chamada de `ensureHeaders_()` usa a
 *     assinatura de três argumentos; `checkVersionConflict_()` continua recebendo
 *     `baselineVersion`; `isNumericPosition_()` continua guardando o anel de coordenadas;
 *     `migrateLegacyAdminToken_()` continua revogando o token legado.
 *
 * Versão 2.3.0 (sincronização territorial — issue #105):
 *   - Regiões Administrativas por código no GeoPortal, faixa de domínio do DER, escada de
 *     simplificação e faixas etárias agregadas de PDAD_A_DATA em RA_PROFILES.
 *
 * Versão 2.4.0 (sincronização com o script instalado + saneamento — issues #120, #119):
 *   - incorpora como código de primeira classe o adendo FipeZAP que rodava só na planilha
 *     (abas FIPEZAP_*, sincronização a partir do staging, visão de localidades, endpoint
 *     `?resource=fipezap`, validação). O adendo sobrescrevia `validateAll`/`refreshMeta`/
 *     `doGet` por monkey-patch e nunca chegou ao repositório (R8.48 de novo, ao contrário);
 *   - `period_id`/`reference_date` FipeZAP aceitam célula Date, ISO ou `YYYY-MM`
 *     (`periodIdOf_`) — a exigência de texto puro produzia 3369 erros falsos;
 *   - `toNumber_` lê moeda brasileira com prefixo `R$` e ponto único de milhar
 *     ("R$ 290.000" é 290000, não 290) — eram 61 PRICE_M2_MISMATCH falsos;
 *   - saneamento pelo menu: `normalizeMonetaryCells()`, `normalizeFipezapPeriodCells()`,
 *     `provisionIvvRegion()`, `buildListingsCoverage()`, `buildPdadCoverage()`;
 *   - DATA_QUALITY ganha `category` e sai ordenada por severidade → aba → categoria;
 *     DEVELOPMENTS sem coordenada/preço/unidades/entrega vira fila de pesquisa (coverage);
 *   - `refreshMeta()` publica contagens de IVV, FipeZAP, PDAD, cobertura e polígonos ativos;
 *   - PDAD_A_DATA, PDAD_A_FIGURE_MAP e PDAD_A_GUIDE entram em ALLOWED_DATASETS.
 *
 * Instalação:
 *   1. Extensões → Apps Script na planilha
 *   2. Cole este arquivo
 *   3. Execute setupProject() uma vez
 *   4. Execute validateAll()
 *   5. Execute installTriggers()
 *   6. Para habilitar a área administrativa, use o menu "Configurar / trocar token".
 *      Sem ADMIN_TOKEN em Script Properties, doPost() recusa toda escrita.
 */

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

var APP_VERSION = '2.4.0';

/**
 * Protocolo da API de escrita que este script fala, exposto em `health_()`.
 *
 * A tela administrativa consulta `?resource=health` antes do login e compara com o
 * valor que ela própria espera (WRITE_API_PROTOCOL em src/admin/admin-service.js).
 * É assim que uma implantação presa numa versão antiga do Web App é detectada e
 * reportada — em vez de virar um erro de autenticação genérico, que não aponta para a
 * causa real (editar o Code.gs não reimplanta o /exec).
 *
 * Só mude este valor junto com uma mudança incompatível no formato de doPost.
 */
var WRITE_API_PROTOCOL = 'token-direct-v1';

/** Abas obrigatórias da V1. Ausência é erro crítico. */
var REQUIRED_SHEETS = ['LISTINGS', 'DEVELOPMENTS', 'ANCHORS'];

/** Abas previstas para as próximas fases. Ausência é aviso, nunca erro. */
var OPTIONAL_SHEETS = [
  'PRIMARY_OFFERS', 'IVV_MONTHLY', 'IVV_REGION', 'RA_PROFILES', 'POLYGONS',
  'ROAD_SEGMENTS', 'ROAD_SEGMENT_ALIASES', 'TRAFFIC_DAILY_TEST',
  // v2.4.0 — série FipeZAP (sincronizada do staging) e PDAD-A (carregada à mão). Todas
  // são lidas pelo navegador; sem elas aqui `dataset_()` recusava o nome na estratégia
  // appsscript e o carregamento reportava sucesso com dado vazio.
  'FIPEZAP_MONTHLY', 'FIPEZAP_LOCALITY_MONTHLY', 'FIPEZAP_LOCALITY_MAP', 'FIPEZAP_SOURCES',
  'FIPEZAP_NOTES', 'PDAD_A_DATA', 'PDAD_A_FIGURE_MAP', 'PDAD_A_GUIDE'
];

/** Abas FipeZAP: nascem da sincronização, são somente-leitura para a API de escrita. */
var FIPEZAP_SHEETS = [
  'FIPEZAP_MONTHLY', 'FIPEZAP_LOCALITY_MONTHLY', 'FIPEZAP_LOCALITY_MAP', 'FIPEZAP_SOURCES',
  'FIPEZAP_NOTES'
];

/**
 * Abas novas que este script cria de forma aditiva quando ainda não existem.
 *
 * Aba gerenciada nasce inteira daqui, então `ensureHeaders_()` recebe `null` como
 * `allowedToCreate` para ela: não existe "coluna que o operador apagou por engano" numa
 * aba que nenhuma pessoa provisionou à mão. É por isso que as 42 colunas de POLYGONS e as
 * três abas rodoviárias NÃO precisam de entrada em `PROVISIONABLE_COLUMNS` — a restrição
 * de R8.40 vale para as abas obrigatórias, que vieram da semente de migração.
 */
var MANAGED_EXTENSION_SHEETS = [
  'RA_PROFILES', 'POLYGONS', 'ROAD_SEGMENTS', 'ROAD_SEGMENT_ALIASES', 'TRAFFIC_DAILY_TEST',
  'FIPEZAP_MONTHLY', 'FIPEZAP_LOCALITY_MONTHLY', 'FIPEZAP_LOCALITY_MAP', 'FIPEZAP_SOURCES',
  'FIPEZAP_NOTES'
];

/**
 * Colunas que este script pode CRIAR numa aba obrigatória que já existe.
 *
 * Provisionar é poderoso e por isso é perigoso: `ensureHeaders_()` criar qualquer
 * cabeçalho ausente significa que apagar ou renomear `title`, `address` ou `latitude`
 * por acidente faz o "Configurar projeto" seguinte devolver uma coluna nova e VAZIA com
 * o nome certo. A validação deixa de emitir MISSING_HEADER (o cabeçalho está lá) e
 * `validateSchemaFields_` pula célula vazia — o dado antigo fica órfão sob o cabeçalho
 * renomeado e a tela pública perde títulos, ou todas as coordenadas, em silêncio.
 *
 * Então o provisionamento é restrito a esta lista: exatamente o delta entre a semente de
 * migração e o schema em vigor. Cabeçalho ausente que não esteja aqui CONTINUA ausente,
 * para a validação reclamar dele em voz alta. A lista espelha `POST_SEED_COLUMNS` em
 * tests/helpers/schema.mjs, e a paridade entre as duas é cobrada por teste.
 *
 * Abas gerenciadas (RA_PROFILES, POLYGONS) e operacionais não entram aqui: elas são
 * criadas inteiras por este script, então não existe "coluna que o operador apagou".
 */
var PROVISIONABLE_COLUMNS = {
  LISTINGS: ['regularization_status'],
  DEVELOPMENTS: ['building_orientation', 'regularization_status', 'sales_stage'],
  ANCHORS: ['brand_name', 'group', 'occupied_area_m2', 'segment']
};

/** Abas operacionais mantidas por este script. */
var META_SHEET = 'APP_META';
var QUALITY_SHEET = 'DATA_QUALITY';
var CHANGELOG_SHEET = 'CHANGE_LOG';

var OPERATIONAL_HEADERS = {
  APP_META: ['key', 'value', 'updated_at'],
  /**
   * `category` (v2.4.0) agrupa o `code` numa família estável — schema, data_type,
   * missing_value, duplicate, invalid_url, spatial, price, date, source, coverage — para a
   * aba funcionar como painel de manutenção, não só como lista. Ver `qualityCategoryOf_()`.
   */
  DATA_QUALITY: ['severity', 'sheet', 'row', 'record_id', 'field', 'code', 'message', 'detected_at', 'category'],
  /**
   * `correlation_id`, `result` e `error_reason` foram acrescentadas na issue #5 para
   * cobrir o pedido de auditoria da API de escrita ("timestamp; aba; operação;
   * intervalo/campos; record_id; valor anterior; valor novo; editor; correlation_id;
   * resultado; motivo de erro"). Só o gatilho de edição manual (`logChange_`) e o
   * caminho de sucesso da API de escrita preenchem as 7 colunas antigas sem as novas
   * três — `appendChangeLogRow_` aceita linha com 7 ou 10 células, então planilhas já
   * provisionadas com o cabeçalho antigo continuam funcionando até `upgradeChangeLogHeader_()`
   * rodar (ver setupProject()).
   */
  CHANGE_LOG: [
    'timestamp', 'sheet', 'range', 'record_id', 'old_value', 'new_value', 'editor',
    'correlation_id', 'result', 'error_reason'
  ]
};

/** Cabeçalho do CHANGE_LOG antes da issue #5 — usado só por upgradeChangeLogHeader_(). */
var CHANGE_LOG_HEADERS_V1 = ['timestamp', 'sheet', 'range', 'record_id', 'old_value', 'new_value', 'editor'];

/** Coluna que identifica o registro em cada aba de dados. */
var ID_FIELD = {
  LISTINGS: 'listing_id',
  DEVELOPMENTS: 'development_id',
  ANCHORS: 'place_id',
  PRIMARY_OFFERS: 'observation_id',
  RA_PROFILES: 'ra_geo_id',
  POLYGONS: 'polygon_id',
  ROAD_SEGMENTS: 'road_segment_id',
  ROAD_SEGMENT_ALIASES: 'alias_id',
  TRAFFIC_DAILY_TEST: 'traffic_daily_id',
  FIPEZAP_MONTHLY: 'fipezap_id',
  FIPEZAP_LOCALITY_MONTHLY: 'locality_monthly_id',
  FIPEZAP_LOCALITY_MAP: 'locality_map_id',
  FIPEZAP_SOURCES: 'source_id',
  FIPEZAP_NOTES: 'note_id'
};

/** Colunas de coordenada por aba. */
var COORD_FIELDS = {
  LISTINGS: ['latitude', 'longitude'],
  DEVELOPMENTS: ['latitude', 'longitude'],
  ANCHORS: ['latitude', 'longitude'],
  PRIMARY_OFFERS: ['latitude', 'longitude']
};

/**
 * Cabecalhos criticos por aba, conforme docs/DATA_CONTRACT.md.
 *
 * Existe porque validar so a coluna de ID deixa passar o pior caso do projeto: apagar
 * ou renomear `latitude` em LISTINGS nao gera nenhum achado — a validacao de
 * coordenada simplesmente e pulada por falta de indice — enquanto o navegador
 * normaliza todas as coordenadas para null e o mapa fica vazio. Cabecalho renomeado
 * em silencio quebra producao sem erro de compilacao.
 *
 * As colunas novas deste lote entram aqui porque setupProject() as cria antes da
 * validação, sem mover, renomear ou apagar nenhuma coluna já existente.
 */
var REQUIRED_HEADERS = {
  LISTINGS: [
    'address', 'area_basis', 'area_m2', 'asking_price_brl', 'asking_price_brl_m2', 'bedrooms',
    'condo_fee_brl', 'confidence_flag', 'coordinate_precision', 'iptu_brl', 'last_seen_at',
    'latitude', 'listing_id', 'locality', 'longitude', 'observed_at', 'parking_spaces',
    'portal', 'property_type', 'quality_flag', 'ra_geo_id', 'source_page_verified_at',
    'regularization_status', 'source_url', 'source_url_type', 'status', 'suites', 'title',
    'transaction_type'
  ],
  DEVELOPMENTS: [
    'address', 'area_max_m2', 'area_min_m2', 'confidence_flag', 'coordinate_status',
    'current_price_brl', 'current_price_brl_m2', 'developer_name', 'development_id',
    'expected_delivery', 'last_verified_at', 'latitude', 'longitude', 'name', 'neighborhood',
    'building_orientation', 'product', 'quality_flag', 'ra_geo_id', 'regularization_status',
    'sales_stage', 'segment', 'source_url', 'spatial_usable', 'status', 'unit_mix',
    'units_total', 'work_progress_pct'
  ],
  ANCHORS: [
    'address', 'brand_name', 'category', 'confidence_flag', 'coordinate_precision',
    'coordinate_source_url', 'group', 'last_verified_at', 'latitude', 'longitude', 'name',
    'neighborhood', 'occupied_area_m2', 'operator_name', 'place_id', 'ra_geo_id',
    'scale_capacity', 'segment', 'source_url', 'status', 'subcategory'
  ],
  RA_PROFILES: [
    'ra_geo_id', 'ra_name', 'population_total', 'population_density_km2',
    'income_per_capita_brl', 'population_age_0_14_pct', 'population_age_15_29_pct',
    'population_age_30_44_pct', 'population_age_45_59_pct', 'population_age_60_plus_pct',
    'ra_code', 'ra_number', 'area_km2', 'average_age', 'female_pct', 'male_pct',
    'households_total', 'avg_household_size', 'dominant_dwelling_type',
    'dominant_dwelling_type_pct', 'dominant_tenure', 'dominant_tenure_pct',
    'deed_registered_pct', 'profile_reference_year', 'profile_status', 'profile_source_url',
    'geometry_source_url', 'created_after_pdad_2024', 'predecessor_ra', 'legal_reference',
    'quality_flag', 'notes'
  ],
  /**
   * POLYGONS A:AP — 42 colunas, em cinco grupos: identidade da entidade, camada,
   * cartografia, procedência e geometria. Ver docs/DATA_CONTRACT.md.
   *
   * `source_geometry_geojson` guarda a geometria ORIGINAL (que pode ser LineString,
   * no caso de rodovia) e nunca é desenhada: quem vai ao mapa é sempre
   * `geometry_geojson`, já validada como Polygon/MultiPolygon.
   */
  POLYGONS: [
    'polygon_id', 'name', 'category', 'geometry_geojson', 'color', 'description',
    'properties_json', 'source_url', 'source_file', 'imported_at', 'status',
    'layer_group', 'subcategory', 'ra_geo_id', 'centroid_latitude', 'centroid_longitude',
    'area_m2', 'area_ha', 'perimeter_m', 'fill_color', 'stroke_color', 'fill_opacity',
    'stroke_width', 'z_index', 'source_page_verified_at', 'confidence_flag', 'quality_flag',
    'entity_type', 'entity_id', 'geometry_type', 'geometry_role', 'source_geometry_type',
    'display_buffer_m', 'source_system', 'source_layer_name', 'source_feature_id', 'source_crs',
    'geometry_hash', 'geometry_valid_from', 'geometry_valid_to', 'last_synced_at',
    'source_geometry_geojson'
  ],
  ROAD_SEGMENTS: [
    'road_segment_id', 'current_polygon_id', 'source_segment_code', 'road_name', 'road_code',
    'segment_type', 'jurisdiction', 'administration', 'length_m', 'source_system',
    'source_layer_name', 'source_feature_id', 'source_crs', 'valid_from', 'valid_to',
    'is_current', 'properties_json', 'confidence_flag', 'quality_flag', 'last_synced_at'
  ],
  ROAD_SEGMENT_ALIASES: [
    'alias_id', 'road_segment_id', 'source_segment_code', 'source_system', 'valid_from', 'valid_to',
    'match_method', 'match_confidence', 'source_file', 'notes', 'imported_at'
  ],
  TRAFFIC_DAILY_TEST: [
    'traffic_daily_id', 'trecho', 'sentido', 'dia', 'fluxo_total', 'carro', 'moto', 'onibus',
    'caminhao', 'medio', 'indefinido', 'intervalos_15min_observados', 'cobertura_dia_pct',
    'pico_15min_fluxo', 'pico_15min_intervalo', 'soma_classes', 'divergencia_total_classes',
    'quality_flag', 'imported_at', 'road_segment_id', 'source_file', 'source_total_policy',
    'traffic_schema_version', 'profile_total_15m_json', 'profile_classes_15m_json'
  ],
  /**
   * FipeZAP (v2.4.0) — cabeçalhos observados na planilha viva em 2026-09-19 e no script
   * instalado. `period_id` é texto `YYYY-MM` por contrato; célula Date é aceita na leitura
   * (`periodIdOf_`) e convertida por `normalizeFipezapPeriodCells()`.
   */
  FIPEZAP_MONTHLY: [
    'fipezap_id', 'period_id', 'reference_date', 'year', 'month', 'month_label', 'quarter',
    'is_latest_period', 'segment_scope', 'transaction_type', 'geography_scope',
    'source_locality_name', 'ra_name', 'ra_geo_id', 'geography_classification', 'price_unit',
    'sample_n', 'price_brl_m2', 'official_yield_monthly_pct', 'official_yield_annual_pct',
    'price_mom_pct_change', 'price_ytd_pct_change', 'price_yoy_pct_change',
    'calculated_yield_monthly_pct', 'calculated_yield_annual_pct', 'price_to_rent_months',
    'diff_vs_df_pct', 'rank_price', 'rank_yoy', 'source_publisher', 'source_type', 'source_url',
    'source_page', 'notes', 'quality_flag', 'imported_at', 'source_workbook', 'source_id', 'note_id'
  ],
  FIPEZAP_LOCALITY_MONTHLY: [
    'locality_monthly_id', 'period_id', 'reference_date', 'year', 'month', 'month_label', 'quarter',
    'is_latest_period', 'segment_scope', 'source_locality_name', 'ra_name', 'ra_geo_id',
    'geography_classification', 'sale_price_brl_m2', 'rent_price_brl_m2_month',
    'calculated_yield_monthly_pct', 'calculated_yield_annual_pct', 'sale_yoy_pct_change',
    'rent_yoy_pct_change', 'sale_diff_vs_df_pct', 'rent_diff_vs_df_pct', 'sale_price_rank',
    'rent_price_rank', 'quality_flag', 'source_workbook', 'rebuilt_at'
  ],
  FIPEZAP_LOCALITY_MAP: [
    'locality_map_id', 'source_locality_name', 'ra_name', 'ra_geo_id',
    'geography_classification', 'mapping_rule', 'methodology_note', 'valid_from', 'valid_to',
    'quality_flag', 'source_workbook', 'updated_at'
  ],
  FIPEZAP_SOURCES: [
    'source_id', 'period_id', 'reference_date', 'year', 'month', 'segment_scope', 'report_type',
    'source_type', 'source_page_brasilia', 'source_url', 'source_note', 'source_publisher',
    'source_workbook', 'quality_flag', 'imported_at'
  ],
  FIPEZAP_NOTES: [
    'note_id', 'note_text', 'note_type', 'source_workbook', 'quality_flag', 'updated_at'
  ]
};

/**
 * IVV_REGION (v2.4.0) — provisionada por `provisionIvvRegion()` e validada por
 * `validateIvvRegion_()`. Fica FORA de `REQUIRED_HEADERS` de propósito: a chave é composta
 * (mês × região × faixa), não há `ID_FIELD`, e a rede de teste dela é o triângulo
 * schema (`src/ivv/region.js`) ↔ semente ↔ docs/DATA_CONTRACT.md, como a IVV_MONTHLY.
 */
var IVV_REGION_HEADERS = [
  'reference_month', 'market_region', 'bedroom_bucket', 'offered_units', 'sold_units',
  'ivv_pct_published', 'ivv_pct', 'ivv_pct_check', 'ivv_variance_pp', 'offer_price_brl_m2',
  'sale_price_brl_m2', 'source_id'
];
var IVV_REGION_BUCKETS = ['TOTAL', '1Q', '2Q', '3Q', '4+Q'];
var IVV_REGION_TOTAL_REGION = 'DF Total';
/** Divergência tolerada, em pontos percentuais, entre IVV publicado e recalculado. */
var IVV_REGION_TOLERANCE_PP = 0.05;

/** Abas operacionais de cobertura (v2.4.0). Recalculadas por inteiro, nunca editadas à mão. */
var LISTINGS_COVERAGE_SHEET = 'LISTINGS_COVERAGE';
var LISTINGS_COVERAGE_HEADERS = [
  'ra_geo_id', 'ra_name', 'property_type', 'bedroom_bucket', 'price_bucket', 'active_count',
  'with_price_count', 'with_area_count', 'with_valid_price_m2_count', 'portals_count',
  'latest_observed_at', 'coverage_status', 'computed_at'
];
var PDAD_COVERAGE_SHEET = 'PDAD_A_COVERAGE';
var PDAD_COVERAGE_HEADERS = [
  'ra_geo_id', 'ra_name', 'pdad_year', 'indicator_code', 'indicator_name', 'figure_number',
  'table_number', 'categories_expected', 'categories_loaded', 'published_count',
  'suppressed_count', 'has_figure', 'has_table_check', 'coverage_status', 'quality_status',
  'last_checked_at', 'notes'
];
/** Faixas de preço de LISTINGS_COVERAGE, em R$. Limite superior exclusivo; o último é aberto. */
var LISTINGS_PRICE_BUCKETS = [
  { label: 'ate_300k', max: 300000 },
  { label: '300k_500k', max: 500000 },
  { label: '500k_750k', max: 750000 },
  { label: '750k_1M', max: 1000000 },
  { label: '1M_2M', max: 2000000 },
  { label: '2M_5M', max: 5000000 },
  { label: '5M_mais', max: null }
];
/** Campos de DEVELOPMENTS cuja ausência vira fila de pesquisa em DATA_QUALITY (Plano 02 §5.2). */
var DEVELOPMENT_RESEARCH_FIELDS = [
  'latitude', 'current_price_brl', 'units_total', 'area_min_m2', 'area_max_m2',
  'sales_stage', 'expected_delivery', 'work_progress_pct'
];

/** Datasets que o endpoint read-only pode servir. Allowlist — nunca aceite nome livre. */
var ALLOWED_DATASETS = REQUIRED_SHEETS.concat(OPTIONAL_SHEETS);

/** Teto do histórico de mudanças. Diagnóstico operacional, não auditoria corporativa. */
var CHANGELOG_LIMIT = 5000;

/** Divergência tolerada entre preço/m² informado e calculado, antes de virar alerta. */
var PRICE_M2_TOLERANCE = 0.05;

var LOCK_TIMEOUT_MS = 30000;
var MAX_CELL_TEXT_LENGTH = 49000;
var MAX_KML_BYTES = 10 * 1024 * 1024;
var MAX_IMPORTED_POLYGONS = 1000;

/** Teto de códigos de trecho por sincronização rodoviária — uma chamada HTTP por código. */
var MAX_ROAD_SYNC_CODES = 200;

/**
 * Teto de feições por consulta ao DER. O casamento exato por `codtrechorodov` devolve uma
 * feição; o casamento por rota (ver `routeCodeFromPostoCode_`) pode devolver centenas — uma
 * rota inteira tem muitos trechos pequenos na camada. Sem teto, uma rota muito longa vira uma
 * única chamada HTTP e um MultiPolygon com centenas de anéis.
 */
var MAX_ROAD_SYNC_ROUTE_FEATURES = 500;

/**
 * Buffer visual, por lado, do corredor rodoviário QUANDO o DER não publica a faixa de
 * domínio do trecho (issue #105). Quando publica — `fd_direita_larg`/`fd_esquerda_largu`,
 * 65 m por lado na DF-001 —, é ela que vira o corredor: a área da via é a faixa legal, não
 * um número escolhido aqui. O teto abaixo evita um valor absurdo vindo da camada.
 */
var DEFAULT_ROAD_DISPLAY_BUFFER_M = 20;
var MAX_ROAD_DISPLAY_BUFFER_M = 100;

/**
 * Camada oficial dos trechos rodoviários do DER/DF (ArcGIS Hub do DER, "Rodovias 2025").
 *
 * Trocada na issue #105: a camada da SEDUH (`SISTEMA_VIARIO/MapServer/9`) tem
 * `codtrechorodov` vazio em TODAS as feições, e o casamento caía para "toda a rota", que
 * juntava a DF-001 inteira num corredor só. Aqui `cod_distrital` é exatamente o código do
 * posto de contagem de TRAFFIC_DAILY_TEST (`001EDF0070` = DF-001, km 17,0–17,9), e cada
 * feição traz o eixo, o TMD do DER, a faixa de domínio por lado, faixas, velocidade e
 * classe CTB. Verificado ao vivo em 2026-09: os cinco códigos do piloto casam 1:1.
 */
var DER_ROAD_LAYER_URL = 'https://services7.arcgis.com/mLiYCaoVbEXk2abA/arcgis/rest/services/Rodovias_2025/FeatureServer/0';

/** Camada oficial dos limites das Regiões Administrativas (GeoPortal/SEDUH). */
var RA_BOUNDARY_LAYER_URL = 'https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/LIMITES/FeatureServer/1';

/**
 * Teto de caracteres da geometria de uma RA numa célula. Fica abaixo de
 * MAX_CELL_TEXT_LENGTH de propósito: acima disso a sincronização pede ao GeoPortal uma
 * geometria simplificada em vez de truncar — geometria truncada seria polígono inválido.
 */
var RA_SYNC_MAX_CELL_CHARS = 48000;

/**
 * Escada de simplificação (`maxAllowableOffset`, em GRAUS porque `outSR=4326`) pedida ao
 * GeoPortal. A primeira já é a busca normal: sem ela o Plano Piloto vem com 8.519 vértices
 * e 202 mil caracteres, e a escada antiga (1e-5 → 3e-5) não cabia em 48 mil nem para ele nem
 * para Planaltina — a RA era descartada em silêncio. Medido em 2026-09: com 1e-4 (~10 m)
 * o Plano Piloto fica em ~25 mil chars e todas as 37 RAs cabem; 2e-4 e 5e-4 ficam de
 * reserva. Cada degrau usado fica registrado em `properties_json`.
 */
var RA_SYNC_SIMPLIFY_OFFSETS_DEG = ['0.0001', '0.0002', '0.0005'];

// ---------------------------------------------------------------------------
// Escrita (admin) — R4.9
// ---------------------------------------------------------------------------
//
// Campos editáveis pela API de escrita, por aba. Reaproveita REQUIRED_HEADERS como
// base: são as colunas críticas já mantidas em sincronia com docs/DATA_CONTRACT.md e
// cross-checadas por tests/contract.test.js. A chave primária de cada aba (imutável
// após criação) e o campo de preço/m² derivado (calculado pelo servidor) ficam de
// fora — nunca aceitos como valor de entrada.
//
// Campos de cauda longa que não estão em REQUIRED_HEADERS (ex.: `external_id`,
// `portal_listing_code`, `portal_date_text`, `property_id`, `published_days`,
// `views_count`, `interested_count` em LISTINGS) não são editáveis ainda — ver
// Pendências das PRs que introduziram cada aba.
var WRITE_ALLOWLIST = {
  LISTINGS: REQUIRED_HEADERS.LISTINGS.filter(function (f) {
    return f !== 'listing_id' && f !== 'asking_price_brl_m2';
  }),
  DEVELOPMENTS: REQUIRED_HEADERS.DEVELOPMENTS.filter(function (f) {
    return f !== 'development_id' && f !== 'current_price_brl_m2';
  }),
  ANCHORS: REQUIRED_HEADERS.ANCHORS.filter(function (f) {
    return f !== 'place_id';
  }),
  /**
   * POLYGONS não deriva de REQUIRED_HEADERS por subtração desde a v2.2.1: das 42 colunas,
   * onze são calculadas ou carimbadas pelo servidor (métricas geométricas, hash,
   * procedência do sync) e aceitar qualquer uma como entrada deixaria o cliente
   * contradizer a geometria que ele mesmo enviou. A lista é explícita para que
   * acrescentar coluna ao contrato NÃO a torne gravável por acidente.
   */
  POLYGONS: [
    'name', 'category', 'geometry_geojson', 'color', 'description', 'properties_json',
    'source_url', 'status', 'layer_group', 'subcategory', 'ra_geo_id', 'fill_color',
    'stroke_color', 'fill_opacity', 'stroke_width', 'z_index', 'confidence_flag',
    'quality_flag', 'entity_type', 'entity_id', 'geometry_type', 'geometry_role',
    'source_geometry_type', 'display_buffer_m', 'source_system', 'source_layer_name',
    'source_feature_id', 'source_crs', 'geometry_valid_from', 'geometry_valid_to',
    'source_geometry_geojson'
  ]
};

/** Campos que docs/DATA_CONTRACT.md marca como obrigatórios (Obrig. = sim), por aba. */
var REQUIRED_FOR_CREATE = {
  LISTINGS: [
    'portal', 'transaction_type', 'title', 'source_url', 'source_url_type',
    'source_page_verified_at', 'status', 'last_seen_at', 'property_type', 'address',
    'locality', 'ra_geo_id', 'latitude', 'longitude', 'coordinate_precision',
    'confidence_flag', 'observed_at', 'asking_price_brl', 'area_m2', 'area_basis',
    'bedrooms', 'quality_flag'
  ],
  DEVELOPMENTS: [
    'name', 'address', 'neighborhood', 'confidence_flag', 'spatial_usable', 'last_verified_at'
  ],
  ANCHORS: [
    'name', 'category', 'subcategory', 'operator_name', 'latitude', 'longitude', 'ra_geo_id',
    'source_url', 'coordinate_source_url', 'confidence_flag', 'coordinate_precision',
    'last_verified_at', 'status'
  ],
  POLYGONS: ['name', 'geometry_geojson']
};

/**
 * Vocabulário fechado de campos enum, conforme docs/DATA_CONTRACT.md — só os campos em
 * que o contrato documenta a lista completa entram aqui. `coordinate_precision`,
 * `confidence_flag`, `status`, `coordinate_status`, `product`, `segment` ficam como
 * `text` em FIELD_SCHEMA: o contrato só documenta parte do vocabulário em uso
 * (R8.3-style — a fonte real é a planilha), e tratá-los como enum fechado rejeitaria
 * valores legítimos que o contrato ainda não lista.
 */
var ENUM_VALUES = {
  property_type: ['apartamento', 'casa', 'casa_condominio', 'kitnet', 'predio', 'terreno'],
  category: [
    'escola', 'mobilidade', 'parque_equipamento_publico', 'saude', 'shopping_center',
    'supermercado_atacarejo', 'universidade'
  ],
  group: ['infraestrutura', 'comercio_servico'],
  building_orientation: ['vertical', 'horizontal'],
  sales_stage: ['em_construcao', 'em_lancamento', 'oferta'],
  polygon_status: ['active', 'inactive']
};

/** Tipo de cada campo editável, por aba, para coerção e validação no servidor. */
var FIELD_SCHEMA = {
  LISTINGS: {
    address: 'text', area_basis: 'text', area_m2: 'number', asking_price_brl: 'number',
    bedrooms: 'int', condo_fee_brl: 'number', confidence_flag: 'text',
    coordinate_precision: 'text', iptu_brl: 'number', last_seen_at: 'date', latitude: 'number',
    locality: 'text', longitude: 'number', observed_at: 'date', parking_spaces: 'int',
    portal: 'text', property_type: 'enum:property_type', quality_flag: 'text',
    ra_geo_id: 'text', source_page_verified_at: 'date', source_url: 'url',
    regularization_status: 'text', source_url_type: 'text', status: 'text', suites: 'int',
    title: 'text', transaction_type: 'text'
  },
  DEVELOPMENTS: {
    address: 'text', area_max_m2: 'number', area_min_m2: 'number', confidence_flag: 'text',
    coordinate_status: 'text', current_price_brl: 'number', developer_name: 'text',
    expected_delivery: 'date', last_verified_at: 'date', latitude: 'number', longitude: 'number',
    building_orientation: 'enum:building_orientation', name: 'text', neighborhood: 'text',
    product: 'text', quality_flag: 'text', ra_geo_id: 'text', regularization_status: 'text',
    sales_stage: 'enum:sales_stage', segment: 'text', source_url: 'url', spatial_usable: 'bool',
    status: 'text', unit_mix: 'text', units_total: 'int', work_progress_pct: 'number'
  },
  ANCHORS: {
    address: 'text', brand_name: 'text', category: 'enum:category', confidence_flag: 'text',
    coordinate_precision: 'text', coordinate_source_url: 'url', last_verified_at: 'date',
    group: 'enum:group', latitude: 'number', longitude: 'number', name: 'text',
    neighborhood: 'text', occupied_area_m2: 'number', operator_name: 'text',
    ra_geo_id: 'text', scale_capacity: 'text', segment: 'text', source_url: 'url',
    status: 'text', subcategory: 'text'
  },
  RA_PROFILES: {
    ra_geo_id: 'text', ra_name: 'text', population_total: 'int',
    population_density_km2: 'number', income_per_capita_brl: 'number',
    population_age_0_14_pct: 'number', population_age_15_29_pct: 'number',
    population_age_30_44_pct: 'number', population_age_45_59_pct: 'number',
    population_age_60_plus_pct: 'number'
  },
  POLYGONS: {
    name: 'text', category: 'text', geometry_geojson: 'geojson', color: 'text',
    description: 'text', properties_json: 'json_object', source_url: 'url',
    status: 'enum:polygon_status', layer_group: 'text', subcategory: 'text', ra_geo_id: 'text',
    fill_color: 'text', stroke_color: 'text', fill_opacity: 'number', stroke_width: 'number',
    z_index: 'number', confidence_flag: 'text', quality_flag: 'text', entity_type: 'text',
    entity_id: 'text', geometry_type: 'text', geometry_role: 'text', source_geometry_type: 'text',
    display_buffer_m: 'number', source_system: 'text', source_layer_name: 'text',
    source_feature_id: 'text', source_crs: 'text', geometry_valid_from: 'text',
    geometry_valid_to: 'text', source_geometry_geojson: 'geojson_source'
  },
  ROAD_SEGMENTS: {
    road_segment_id: 'text', current_polygon_id: 'text', source_segment_code: 'text',
    road_name: 'text', road_code: 'text', segment_type: 'text', jurisdiction: 'text',
    administration: 'text', length_m: 'number', source_system: 'text', source_layer_name: 'text',
    source_feature_id: 'text', source_crs: 'text', valid_from: 'text', valid_to: 'text',
    is_current: 'bool', properties_json: 'json_object', confidence_flag: 'text',
    quality_flag: 'text', last_synced_at: 'text'
  },
  ROAD_SEGMENT_ALIASES: {
    alias_id: 'text', road_segment_id: 'text', source_segment_code: 'text', source_system: 'text',
    valid_from: 'text', valid_to: 'text', match_method: 'text', match_confidence: 'text',
    source_file: 'text', notes: 'text', imported_at: 'text'
  },
  TRAFFIC_DAILY_TEST: {
    traffic_daily_id: 'text', trecho: 'text', sentido: 'text', dia: 'date', fluxo_total: 'number',
    carro: 'number', moto: 'number', onibus: 'number', caminhao: 'number', medio: 'number',
    indefinido: 'number', intervalos_15min_observados: 'int', cobertura_dia_pct: 'number',
    pico_15min_fluxo: 'number', pico_15min_intervalo: 'text', soma_classes: 'number',
    divergencia_total_classes: 'number', quality_flag: 'text', imported_at: 'text',
    road_segment_id: 'text', source_file: 'text', source_total_policy: 'text',
    traffic_schema_version: 'text'
  }
};

/**
 * Campo de preço/m² derivado, por aba, e os dois campos-fonte usados para calculá-lo.
 * Só LISTINGS e DEVELOPMENTS têm essa noção — ANCHORS não tem preço. Mesmo padrão de
 * `pricePerM2()` em src/normalize.js: usa o valor informado quando existe, senão
 * calcula a partir de preço e área.
 */
var DERIVED_PRICE_M2_FIELD = {
  LISTINGS: { price: 'asking_price_brl', area: 'area_m2', target: 'asking_price_brl_m2' },
  DEVELOPMENTS: { price: 'current_price_brl', area: 'area_min_m2', target: 'current_price_brl_m2' }
};

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Imob Intelligence')
    .addItem('Configurar projeto', 'setupProject')
    .addItem('Validar dados agora', 'validateAll')
    .addItem('Recalcular campos derivados', 'recalculateDerivedFields')
    .addSeparator()
    .addItem('Saneamento: normalizar células monetárias', 'normalizeMonetaryCells')
    .addItem('Saneamento: normalizar períodos FipeZAP', 'normalizeFipezapPeriodCells')
    .addItem('Saneamento: provisionar IVV_REGION', 'provisionIvvRegion')
    .addItem('Cobertura: recalcular LISTINGS_COVERAGE', 'buildListingsCoverage')
    .addItem('Cobertura: recalcular PDAD_A_COVERAGE', 'buildPdadCoverage')
    .addSeparator()
    .addItem('Sincronizar base FipeZAP', 'syncFipezapFromStaging_UI')
    .addItem('Recalcular visão FipeZAP', 'rebuildFipezapLocalityMonthly_UI')
    .addSeparator()
    .addItem('Importar polígonos de KML/KMZ', 'importPolygonsFromDriveFile_UI')
    .addItem('Sincronizar Regiões Administrativas', 'syncAdministrativeRegions_UI')
    .addItem('Sincronizar trechos rodoviários DER', 'syncRoadSegmentsFromTraffic_UI')
    .addSeparator()
    .addItem('Instalar gatilhos', 'installTriggers')
    .addItem('Atualizar metadados', 'refreshMeta')
    .addItem('Configurar / trocar token de administração', 'configureAdminToken')
    .addItem('Limpar cache', 'clearCache')
    .addToUi();
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function props_() {
  return PropertiesService.getScriptProperties();
}

/**
 * Executa `fn` sob lock do documento.
 *
 * O gatilho de edição e o job de manutenção escrevem nas mesmas abas operacionais.
 * Sem lock, uma execução sobrescreve a outra e o CHANGE_LOG perde eventos.
 */
function withLock_(fn) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    Logger.log('lock não obtido em %s ms; execução ignorada', LOCK_TIMEOUT_MS);
    return null;
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Cabeçalhos de uma aba, como array de strings. Aba ausente devolve lista vazia. */
function headersOf_(sheet) {
  if (!sheet || sheet.getLastColumn() === 0) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function (h) { return String(h).trim(); });
}

/** Índice de cada cabeçalho, base zero. */
function headerIndex_(headers) {
  var index = {};
  for (var i = 0; i < headers.length; i++) index[headers[i]] = i;
  return index;
}

/** Linhas de dados de uma aba, sem o cabeçalho. */
function dataRowsOf_(sheet) {
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() === 0) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
}

/** Data e hora corrente em ISO. */
function nowISO_() {
  return new Date().toISOString();
}

/**
 * Número a partir de uma célula.
 *
 * Aceita number, decimal com ponto, formato brasileiro ("R$ 1.234,56"), formato
 * americano ("2,500,000.50") e sufixo de unidade ("120 m²", "8,6%"). Devolve null
 * quando não há número — nunca NaN, para que ausência tenha uma representação só.
 * Espelha toNumber() de src/normalize.js: mudou lá, muda aqui (tests/appsscript-money-parity).
 *
 * Ponto único é ambíguo ("2.500" pode ser 2,5 ou 2500). A regra: com marcador de moeda
 * (`R$`, `BRL`) o ponto é SEMPRE milhar — "R$ 290.000" é 290000, não 290, que era o que
 * produzia 61 PRICE_M2_MISMATCH falsos na planilha (v2.4.0). Sem marcador, ponto único
 * continua decimal, e a correção por âncora fica com `toPriceNumber()` no cliente.
 */
function toNumber_(value) {
  if (typeof value === 'number') return isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;

  var raw = String(value).trim();
  var currency = /^\s*(R\$|BRL)\s*/i.test(raw) || /\s*(R\$|BRL)\s*$/i.test(raw);
  var s = raw
    .replace(/^\s*(R\$|BRL)\s*/i, '')
    .replace(/\s*(R\$|BRL)\s*$/i, '')
    .replace(/\s*(m²|m2|km²|km2|%|p\.p\.|pp)\s*$/i, '')
    .replace(/[\s\u00a0]/g, '');
  if (s === '' || !/^[-+]?[0-9.,]+$/.test(s)) return null;

  var lastComma = s.lastIndexOf(',');
  var lastDot = s.lastIndexOf('.');
  var dots = (s.match(/\./g) || []).length;

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    var commas = (s.match(/,/g) || []).length;
    s = (commas > 1 || (s.length - lastComma - 1) === 3) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (dots > 1 || (dots === 1 && currency && /\.\d{3}$/.test(s))) {
    s = s.replace(/\./g, '');
  }

  var n = Number(s);
  return isFinite(n) ? n : null;
}

/** Texto normalizado. `null`/`undefined` viram string vazia. Espelha toText() de src/normalize.js. */
function toText_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Booleano tolerante — mesmos literais aceitos por toBoolean() de src/normalize.js,
 * para que um `spatial_usable` escrito pela API leia igual, tanto pelo GViz quanto
 * pelo Apps Script.
 */
function toBoolean_(value) {
  if (typeof value === 'boolean') return value;
  var s = toText_(value).toLowerCase();
  if (s === '') return false;
  if (['1', 'true', 'sim', 'yes', 'y', 'x', 'verdadeiro'].indexOf(s) !== -1) return true;
  if (['0', 'false', 'nao', 'não', 'no', 'n', 'falso'].indexOf(s) !== -1) return false;
  var n = toNumber_(s);
  return n !== null && n !== 0;
}

/** URL http(s) válida? Qualquer outro esquema é suspeito numa planilha pública. */
function isValidUrl_(value) {
  var s = String(value === null || value === undefined ? '' : value).trim();
  if (s === '') return true; // vazio é ausência, tratada por outra validação
  return /^https?:\/\/[^\s]+$/i.test(s);
}

function isBlank_(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function normalizeSlug_(value) {
  var text = toText_(value).toLowerCase();
  try { text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (err) { /* V8 antigo */ }
  return text.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function isISODate_(value) {
  if (isDateValue_(value)) return !isNaN(value.getTime());
  var text = toText_(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  var parts = text.split('-').map(Number);
  var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 &&
    date.getUTCDate() === parts[2];
}

/** SHA-256 de um valor, em hex minúsculo. */
function sha256Hex_(value) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value === null || value === undefined ? '' : value),
    Utilities.Charset.UTF_8
  );
  // computeDigest devolve bytes COM sinal (-128..127); reconverter para 0..255 antes do hex.
  return digest.map(function (byte) {
    var n = byte < 0 ? byte + 256 : byte;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}

/**
 * Texto de terceiro reduzido a texto puro antes de virar célula.
 *
 * As duas sincronizações trazem strings de APIs externas (nome de RA, nome de rodovia,
 * jurisdição) direto para a planilha, que é lida pelo navegador de qualquer visitante.
 * Marcação vinda de fora não tem por que sobreviver até o cliente — a defesa no render
 * continua valendo, esta é a segunda camada, na entrada.
 */
function sanitizePlainText_(value) {
  var text = toText_(value);
  if (!text) return '';
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, MAX_CELL_TEXT_LENGTH);
}

/** `ROADSEG_` + código do trecho normalizado. Devolve '' quando não há código. */
function canonicalRoadSegmentId_(code) {
  var clean = toText_(code).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return clean ? 'ROADSEG_' + clean : '';
}

/** Chaves cujo valor nunca pode sair de Script Properties para a planilha pública. */
function isSecretMetaKey_(key) {
  var normalized = normalizeSlug_(key);
  return normalized === 'admin_token' || normalized === 'admin_token_value' ||
    normalized === 'api_key' || normalized === 'password' || normalized === 'secret' ||
    /(_token_value|_password|_secret|_api_key)$/.test(normalized);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * Prepara a planilha. Idempotente: pode rodar quantas vezes for preciso.
 *
 * As abas operacionais já existem na planilha importada do .xlsx de migração, com os
 * cabeçalhos corretos. Esta função cria o que falta e NÃO sobrescreve o que existe.
 */
function setupProject() {
  return withLock_(function () {
    var book = ss_();
    var created = [];
    var kept = [];
    var addedHeaders = [];
    var blockedHeaders = [];

    Object.keys(OPERATIONAL_HEADERS).forEach(function (name) {
      var sheet = book.getSheetByName(name);
      if (!sheet) {
        sheet = book.insertSheet(name);
        created.push(name);
      } else {
        kept.push(name);
      }
      // Aba operacional é criada e mantida inteira por este script: não há coluna que
      // o operador possa ter apagado por engano, então não há o que restringir.
      var operational = ensureHeaders_(sheet, OPERATIONAL_HEADERS[name], null);
      if (operational.added.length) addedHeaders.push(name + ': ' + operational.added.join(', '));
    });

    MANAGED_EXTENSION_SHEETS.forEach(function (name) {
      var sheet = book.getSheetByName(name);
      if (!sheet) {
        sheet = book.insertSheet(name);
        created.push(name);
      } else {
        kept.push(name);
      }
      // Idem: RA_PROFILES e POLYGONS nascem deste script.
      var managed = ensureHeaders_(sheet, REQUIRED_HEADERS[name], null);
      if (managed.added.length) addedHeaders.push(name + ': ' + managed.added.join(', '));
    });

    REQUIRED_SHEETS.forEach(function (name) {
      var sheet = book.getSheetByName(name);
      if (!sheet) return; // a validação registra MISSING_SHEET; não mascara criando aba vazia
      // Aqui SIM a criação é restrita: ver o comentário de PROVISIONABLE_COLUMNS.
      var result = ensureHeaders_(sheet, REQUIRED_HEADERS[name], PROVISIONABLE_COLUMNS[name] || []);
      if (result.added.length) addedHeaders.push(name + ': ' + result.added.join(', '));
      if (result.blocked.length) blockedHeaders.push(name + ': ' + result.blocked.join(', '));
    });

    if (!props_().getProperty('DATASET_VERSION')) props_().setProperty('DATASET_VERSION', '1');
    props_().setProperty('APP_VERSION', APP_VERSION);

    // Publica em APP_META o estado do schema de POLYGONS, para o cliente e o operador
    // saberem se a planilha já roda o contrato de 42 colunas ou ainda o de 11.
    setMeta_('polygon_schema_version', '2.1');
    setMeta_('pending_appscript_polygon_schema_sync', 'false');
    setMeta_('appscript_target_version', APP_VERSION);
    if (!getMeta_('road_sync_status')) setMeta_('road_sync_status', 'ready_manual_sync');
    // FipeZAP: só publica o estado do schema. A sincronização a partir do staging é ação
    // manual do menu — o script instalado a disparava daqui quando a aba estava vazia, e um
    // "Configurar projeto" que lê OUTRA planilha por ID é efeito colateral demais.
    setMeta_('fipezap_schema_version', FIPEZAP_SCHEMA_VERSION);
    if (!getMeta_('fipezap_data_load_status')) setMeta_('fipezap_data_load_status', 'pending_manual_sync');

    var tokenMigration = migrateLegacyAdminToken_();
    var developmentUpdates = populateDevelopmentSalesStage_();
    var anchorUpdates = populateAnchorClassification_();
    var datasetChanged = addedHeaders.some(function (item) {
      return /^(LISTINGS|DEVELOPMENTS|ANCHORS|RA_PROFILES|POLYGONS|ROAD_SEGMENTS|ROAD_SEGMENT_ALIASES|TRAFFIC_DAILY_TEST|FIPEZAP_[A-Z_]+):/.test(item);
    }) || developmentUpdates > 0 || anchorUpdates > 0;

    if (datasetChanged) {
      bumpDatasetVersion_();
      setMeta_('validation_status', 'dirty');
      setMeta_('last_data_change_at', nowISO_());
      clearCache();
    }
    refreshMeta();

    var message = 'Abas criadas: ' + (created.length ? created.join(', ') : 'nenhuma') +
      '\nAbas preservadas: ' + (kept.length ? kept.join(', ') : 'nenhuma') +
      '\nCabeçalhos adicionados sem alterar os existentes: ' +
      (addedHeaders.length ? addedHeaders.join(' | ') : 'nenhum') +
      (blockedHeaders.length
        ? '\n\n⚠️ CABEÇALHOS DO CONTRATO AUSENTES E NÃO CRIADOS: ' + blockedHeaders.join(' | ') +
          '\nEstas colunas fazem parte do contrato mas não estão na lista de provisionamento. ' +
          'Provavelmente foram apagadas ou renomeadas. Restaure o nome original — criar uma ' +
          'coluna vazia no lugar esconderia a perda do dado. Rode "Validar dados agora" para o ' +
          'relatório completo.'
        : '') +
      '\nClassificações preenchidas a partir de dados existentes: ' +
      (developmentUpdates + anchorUpdates) +
      (tokenMigration ? '\nCredencial legada movida de APP_META para Script Properties.' : '') +
      '\n\nPróximos passos: Validar dados agora, depois Instalar gatilhos.';
    Logger.log(message);
    notify_('Configuração concluída', message);
    return message;
  });
}

/** Acrescenta somente cabeçalhos ausentes à direita; nunca reordena nem sobrescreve. */
/**
 * Garante os cabeçalhos de uma aba. `allowedToCreate` limita o que pode ser CRIADO:
 * `null` libera tudo (aba gerenciada por este script), um array restringe à lista
 * (aba obrigatória, onde criar cabeçalho não previsto mascara erro do operador).
 * Devolve `{ added, blocked }` — `blocked` é o que faltava e NÃO foi criado, para
 * `setupProject()` avisar em vez de deixar a omissão passar despercebida.
 */
function ensureHeaders_(sheet, desiredHeaders, allowedToCreate) {
  if (!sheet) return { added: [], blocked: [] };
  var current = headersOf_(sheet);
  var index = headerIndex_(current);
  var absent = desiredHeaders.filter(function (header) { return index[header] === undefined; });

  var missing = absent;
  var blocked = [];
  if (allowedToCreate) {
    missing = [];
    for (var m = 0; m < absent.length; m++) {
      if (allowedToCreate.indexOf(absent[m]) === -1) blocked.push(absent[m]);
      else missing.push(absent[m]);
    }
  }

  if (!missing.length) {
    sheet.setFrozenRows(1);
    return { added: [], blocked: blocked };
  }

  var startColumn = Math.max(1, sheet.getLastColumn() + 1);
  if (current.join('') === '' && sheet.getLastRow() <= 1) startColumn = 1;
  sheet.getRange(1, startColumn, 1, missing.length).setValues([missing]);

  if (startColumn > 1) {
    try {
      sheet.getRange(1, startColumn - 1, 1, 1)
        .copyFormatToRange(sheet, startColumn, startColumn + missing.length - 1, 1, 1);
    } catch (err) { Logger.log('Não foi possível copiar formato do cabeçalho de %s: %s', sheet.getName(), err.message); }
  } else {
    sheet.getRange(1, 1, 1, missing.length).setFontWeight('bold');
  }
  sheet.setFrozenRows(1);
  return { added: missing, blocked: blocked };
}

/** Move uma credencial legada da aba pública para Script Properties e limpa a exposição. */
function migrateLegacyAdminToken_() {
  var sheet = ss_().getSheetByName(META_SHEET);
  if (!sheet) return false;
  var rows = dataRowsOf_(sheet);
  var migrated = false;

  for (var i = 0; i < rows.length; i++) {
    var key = toText_(rows[i][0]);
    if (!isSecretMetaKey_(key)) continue;
    var value = toText_(rows[i][1]);
    var normalized = normalizeSlug_(key);
    var isAdminToken = (normalized === 'admin_token' || normalized === 'admin_token_value');

    // Um segredo que esteve no APP_META esteve PÚBLICO: a aba é lida pelo navegador de
    // qualquer visitante, via GViz. Copiá-lo para a Script Property transformaria um
    // valor já vazado em credencial válida do endpoint de escrita, e limpar a célula
    // depois não revoga cópia que alguém já leu ou que ficou em cache. O valor é
    // apagado e NUNCA reaproveitado — o administrador gera um token novo pelo menu.
    if (isAdminToken && value) {
      props_().setProperty('LEGACY_ADMIN_TOKEN_REVOKED_AT', nowISO_());
      Logger.log('Token administrativo legado encontrado no APP_META e descartado. ' +
        'Gere um novo em "Configurar / trocar token de administração".');
    } else if (value && !props_().getProperty('MIGRATED_' + normalized.toUpperCase())) {
      props_().setProperty('MIGRATED_' + normalized.toUpperCase(), value);
    }
    sheet.getRange(i + 2, 1, 1, 3)
      .setNumberFormat('@')
      .setValues([['legacy_secret_migrated_at', nowISO_(), nowISO_()]]);
    migrated = true;
  }
  return migrated;
}

/** Preenche sales_stage só quando vazio e quando o status existente permite inferência direta. */
function populateDevelopmentSalesStage_() {
  var sheet = ss_().getSheetByName('DEVELOPMENTS');
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var headers = headersOf_(sheet);
  var index = headerIndex_(headers);
  if (index.status === undefined || index.sales_stage === undefined) return 0;
  var rows = dataRowsOf_(sheet);
  var changed = 0;

  rows.forEach(function (row, i) {
    if (!isBlank_(row[index.sales_stage])) return;
    var stage = inferSalesStage_(row[index.status]);
    if (!stage) return;
    sheet.getRange(i + 2, index.sales_stage + 1).setValue(stage);
    changed++;
  });
  return changed;
}

function inferSalesStage_(status) {
  var slug = normalizeSlug_(status);
  if (!slug) return '';
  if (/lancamento/.test(slug)) return 'em_lancamento';
  if (/(em_obra|em_obras|construcao|em_construcao|inicio_de_obras)/.test(slug)) return 'em_construcao';
  if (/(oferta|pronto|estoque|entregue)/.test(slug)) return 'oferta';
  return '';
}

/** Classifica âncoras somente por sinais explícitos já presentes em category/subcategory/name. */
function populateAnchorClassification_() {
  var sheet = ss_().getSheetByName('ANCHORS');
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var headers = headersOf_(sheet);
  var index = headerIndex_(headers);
  if (index.group === undefined || index.segment === undefined) return 0;
  var rows = dataRowsOf_(sheet);
  var changed = 0;

  rows.forEach(function (row, i) {
    var category = index.category === undefined ? '' : row[index.category];
    var subcategory = index.subcategory === undefined ? '' : row[index.subcategory];
    var name = index.name === undefined ? '' : row[index.name];
    if (isBlank_(row[index.group])) {
      var group = inferAnchorGroup_(category);
      if (group) {
        sheet.getRange(i + 2, index.group + 1).setValue(group);
        changed++;
      }
    }
    if (isBlank_(row[index.segment])) {
      var segment = inferAnchorSegment_(category, subcategory, name);
      if (segment) {
        sheet.getRange(i + 2, index.segment + 1).setValue(segment);
        changed++;
      }
    }
  });
  return changed;
}

function inferAnchorGroup_(category) {
  var slug = normalizeSlug_(category);
  if (slug === 'mobilidade' || slug === 'parque_equipamento_publico') return 'infraestrutura';
  if (['escola', 'saude', 'shopping_center', 'supermercado_atacarejo', 'universidade'].indexOf(slug) !== -1) {
    return 'comercio_servico';
  }
  return '';
}

function inferAnchorSegment_(category, subcategory, name) {
  var categorySlug = normalizeSlug_(category);
  var detail = normalizeSlug_([subcategory, name].join(' '));
  if (categorySlug === 'escola') return 'escola';
  if (categorySlug === 'universidade') return 'universidade';
  if (categorySlug === 'supermercado_atacarejo') return /atac/.test(detail) ? 'atacado' : 'supermercado';
  if (categorySlug === 'saude') {
    if (/hospital/.test(detail)) return 'hospital';
    if (/laboratorio/.test(detail)) return 'laboratorio';
    if (/clinica/.test(detail)) return 'clinica';
  }
  if (categorySlug === 'mobilidade') {
    if (/metro/.test(detail)) return 'estacao_metro';
    if (/trem/.test(detail)) return 'estacao_trem';
    if (/rodovi/.test(detail)) return 'terminal_rodoviario';
    if (/aeroporto/.test(detail)) return 'aeroporto';
    if (/onibus/.test(detail)) return 'ponto_onibus';
  }
  return '';
}

/**
 * Migração idempotente do cabeçalho do CHANGE_LOG (issue #5): planilhas já
 * provisionadas antes desta PR têm as 7 colunas antigas (CHANGE_LOG_HEADERS_V1). Só
 * estende o cabeçalho — nunca reescreve linha de dado existente — e só quando o
 * cabeçalho é EXATAMENTE o antigo, para nunca sobrescrever um cabeçalho já
 * customizado à mão de um jeito inesperado. Devolve `true` se estendeu algo.
 */
function upgradeChangeLogHeader_() {
  var sheet = ss_().getSheetByName(CHANGELOG_SHEET);
  if (!sheet) return false;

  var current = headersOf_(sheet);
  if (current.join('|') !== CHANGE_LOG_HEADERS_V1.join('|')) return false;

  var target = OPERATIONAL_HEADERS.CHANGE_LOG;
  var extra = target.slice(current.length);
  sheet.getRange(1, current.length + 1, 1, extra.length).setValues([extra]);
  return true;
}

/** Mostra alerta quando há interface; caso contrário só registra no log. */
function notify_(title, message) {
  try {
    SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    Logger.log('%s: %s', title, message);
  }
}

// ---------------------------------------------------------------------------
// Gatilhos
// ---------------------------------------------------------------------------

/**
 * Instala os gatilhos instaláveis. Idempotente: remove os anteriores deste script
 * antes de criar, para não acumular duplicatas a cada execução.
 *
 * onEdit simples não serve aqui: não tem permissão para escrever em outras abas
 * nem para usar Script Properties.
 */
function installTriggers() {
  var book = ss_();
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    var fn = trigger.getHandlerFunction();
    if (fn === 'handleEdit' || fn === 'maintenanceJob') ScriptApp.deleteTrigger(trigger);
  });

  ScriptApp.newTrigger('handleEdit').forSpreadsheet(book).onEdit().create();
  ScriptApp.newTrigger('maintenanceJob').timeBased().everyHours(6).create();

  var message = 'Gatilhos instalados: handleEdit (a cada edição) e maintenanceJob (a cada 6 horas).';
  Logger.log(message);
  notify_('Gatilhos', message);
  return message;
}

/**
 * Reage a uma edição em aba de dados.
 *
 * Faz o mínimo de propósito: registrar → incrementar versão → marcar dirty →
 * invalidar cache. Validar o dataset inteiro a cada célula editada consumiria a
 * cota de execução rapidamente. A validação completa fica no job periódico.
 */
function handleEdit(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  var name = sheet.getName();
  if (REQUIRED_SHEETS.indexOf(name) === -1 && OPTIONAL_SHEETS.indexOf(name) === -1) return;
  if (e.range.getRow() === 1) return; // edição de cabeçalho é tratada pela validação

  withLock_(function () {
    logChange_(sheet, e);
    bumpDatasetVersion_();
    setMeta_('validation_status', 'dirty');
    setMeta_('last_data_change_at', nowISO_());
    // A visão de localidades é derivada da série mensal: editar a série a torna obsoleta.
    if (name === 'FIPEZAP_MONTHLY') setMeta_('fipezap_view_status', 'dirty');
    clearCache();
  });
}

/**
 * Adiciona uma linha ao CHANGE_LOG e apara o histórico quando passa do teto.
 *
 * Único ponto de escrita no CHANGE_LOG: tanto o gatilho de edição (`logChange_`)
 * quanto a API de escrita (`logWriteChange_`) passam por aqui, para que o teto de
 * `CHANGELOG_LIMIT` valha para os dois caminhos igualmente.
 */
function appendChangeLogRow_(row) {
  var log = ss_().getSheetByName(CHANGELOG_SHEET);
  if (!log) return;

  log.appendRow(row);

  var rows = log.getLastRow() - 1;
  if (rows > CHANGELOG_LIMIT) {
    log.deleteRows(2, rows - CHANGELOG_LIMIT);
  }
}

/** Registra a edição manual (via planilha) no CHANGE_LOG. */
function logChange_(sheet, e) {
  var name = sheet.getName();
  var headers = headersOf_(sheet);
  var idColumn = headers.indexOf(ID_FIELD[name] || '') + 1;
  var recordId = '';
  if (idColumn > 0 && e.range.getRow() > 1) {
    recordId = String(sheet.getRange(e.range.getRow(), idColumn).getValue() || '');
  }

  var editor = '';
  try { editor = Session.getActiveUser().getEmail() || ''; } catch (err) { editor = ''; }

  // Só registra valor de célula única: uma colagem de 500 linhas viraria 500 eventos
  // e estouraria o histórico útil.
  var single = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1;

  appendChangeLogRow_([
    nowISO_(),
    name,
    e.range.getA1Notation(),
    recordId,
    single ? String(e.oldValue === undefined ? '' : e.oldValue) : '(múltiplas células)',
    single ? String(e.value === undefined ? '' : e.value) : '(múltiplas células)',
    editor,
    '', // correlation_id: só existe para escritas via API
    'ok',
    ''
  ]);
}

/**
 * Registra uma mudança feita pela API de escrita (admin) no CHANGE_LOG, incluindo
 * `correlation_id` (issue #5: rastrear uma operação inteira através de várias linhas
 * de log, uma por campo alterado) e `result`/`error_reason`.
 *
 * `editor`: prioriza a identidade Google quando o Apps Script consegue resolvê-la
 * (`Session.getActiveUser()` — funciona quando o Web App está implantado como
 * "Executar como: usuário que acessa"; costuma vir vazio em outras configurações, daí
 * o try/catch e o fallback). Sem isso, cai para o valor autodeclarado no formulário —
 * o modelo de auth por token compartilhado (R4.9) não identifica pessoa por si só.
 */
function logWriteChange_(sheetName, recordId, field, oldValue, newValue, editor, correlationId, result, errorReason) {
  var googleEmail = '';
  try { googleEmail = Session.getActiveUser().getEmail() || ''; } catch (err) { googleEmail = ''; }
  var who = googleEmail || toText_(editor) || '(não informado)';

  appendChangeLogRow_([
    nowISO_(),
    sheetName,
    field,
    recordId,
    oldValue === null || oldValue === undefined ? '' : String(oldValue),
    newValue === null || newValue === undefined ? '' : String(newValue),
    who,
    toText_(correlationId),
    result || 'ok',
    toText_(errorReason)
  ]);
}

/** Incrementa e devolve a versão do dataset. */
function bumpDatasetVersion_() {
  var current = parseInt(props_().getProperty('DATASET_VERSION') || '1', 10);
  if (isNaN(current)) current = 1;
  var next = current + 1;
  props_().setProperty('DATASET_VERSION', String(next));
  setMeta_('dataset_version', String(next));
  return next;
}

/**
 * Manutenção periódica: recalcula derivados, valida e atualiza metadados.
 *
 * Se o dataset crescer muito, reavalie a frequência de 6 horas e o custo de execução.
 */
function maintenanceJob() {
  try {
    recalculateDerivedFields();
    if (getMeta_('fipezap_view_status') === 'dirty') rebuildFipezapLocalityMonthly_();
    validateAll();
    refreshMeta();
    Logger.log('manutenção concluída em %s', nowISO_());
  } catch (error) {
    Logger.log('manutenção falhou: %s', error && error.message);
    setMeta_('validation_status', 'error');
  }
}

// ---------------------------------------------------------------------------
// Campos derivados
// ---------------------------------------------------------------------------

/**
 * Calcula asking_price_brl_m2 nas linhas de LISTINGS em que ele está vazio.
 *
 * Valor já preenchido NÃO é sobrescrito na V1: a planilha pode ter um preço/m² vindo
 * da fonte que difere do cálculo por diferença de critério de área. Divergência grande
 * vira alerta em DATA_QUALITY, não sobrescrita silenciosa.
 */
function recalculateDerivedFields() {
  return withLock_(function () {
    var sheet = ss_().getSheetByName('LISTINGS');
    if (!sheet) return 'Aba LISTINGS ausente.';

    var headers = headersOf_(sheet);
    var index = headerIndex_(headers);
    if (index.asking_price_brl === undefined || index.area_m2 === undefined ||
        index.asking_price_brl_m2 === undefined) {
      return 'LISTINGS sem as colunas necessárias para o cálculo.';
    }

    var rows = dataRowsOf_(sheet);
    if (rows.length === 0) return 'LISTINGS sem linhas.';

    var column = [];
    var filled = 0;

    for (var i = 0; i < rows.length; i++) {
      var current = rows[i][index.asking_price_brl_m2];

      // Preserva QUALQUER celula nao vazia, inclusive 0, negativo ou texto.
      // Checar "e um numero positivo" faria a manutencao de 6 horas sobrescrever
      // justamente os valores invalidos, apagando a evidencia do dado ruim antes que
      // validateAll() pudesse registra-la em DATA_QUALITY. O contrato e "so quando
      // vazio", e vazio quer dizer vazio.
      if (String(current === null || current === undefined ? '' : current).trim() !== '') {
        column.push([current]);
        continue;
      }

      var price = toNumber_(rows[i][index.asking_price_brl]);
      var area = toNumber_(rows[i][index.area_m2]);

      if (price !== null && price > 0 && area !== null && area > 0) {
        column.push([price / area]);
        filled++;
      } else {
        column.push([current]); // sem dado suficiente: preserva o que está lá
      }
    }

    // Escrita em bloco único: célula a célula estouraria a cota em datasets grandes.
    sheet.getRange(2, index.asking_price_brl_m2 + 1, column.length, 1).setValues(column);

    var message = filled + ' valor(es) de preço/m² calculado(s).';
    Logger.log(message);
    return message;
  });
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

/**
 * Valida o dataset inteiro e reescreve DATA_QUALITY.
 *
 * Registro ruim é SINALIZADO, nunca apagado. A decisão de remover é humana.
 */
function validateAll() {
  return withLock_(function () {
    var book = ss_();
    var findings = [];
    var detectedAt = nowISO_();

    function report(severity, sheetName, row, recordId, field, code, message) {
      findings.push([severity, sheetName, row, recordId, field, code, message, detectedAt,
        qualityCategoryOf_(code)]);
    }

    // Abas ausentes: obrigatória é erro, opcional é aviso (R2.5).
    REQUIRED_SHEETS.forEach(function (name) {
      if (!book.getSheetByName(name)) {
        report('error', name, '', '', '', 'MISSING_SHEET', 'Aba obrigatória ausente.');
      }
    });
    OPTIONAL_SHEETS.forEach(function (name) {
      if (!book.getSheetByName(name)) {
        report('warning', name, '', '', '', 'MISSING_OPTIONAL_SHEET',
          'Aba opcional ausente. A aplicação continua funcionando.');
      }
    });

    REQUIRED_SHEETS.forEach(function (name) {
      var sheet = book.getSheetByName(name);
      if (!sheet) return;
      validateSheet_(sheet, name, report);
    });
    MANAGED_EXTENSION_SHEETS.forEach(function (name) {
      var sheet = book.getSheetByName(name);
      if (!sheet) return;
      validateSheet_(sheet, name, report);
    });

    // v2.4.0 — validações semânticas fora do schema genérico.
    validateFipezapDataset_(report);
    validateIvvRegion_(report);
    validateDevelopmentCoverage_(report);

    sortFindings_(findings);
    writeQuality_(findings);

    var errors = findings.filter(function (f) { return f[0] === 'error'; }).length;
    var warnings = findings.filter(function (f) { return f[0] === 'warning'; }).length;

    setMeta_('last_validation_at', detectedAt);
    setMeta_('last_fipezap_validation_at', detectedAt);
    setMeta_('validation_status', errors > 0 ? 'error' : (warnings > 0 ? 'warning' : 'ok'));
    setMeta_('validation_errors', String(errors));
    setMeta_('validation_warnings', String(warnings));

    var message = errors + ' erro(s) e ' + warnings + ' aviso(s). Detalhes em ' + QUALITY_SHEET + '.';
    Logger.log(message);
    return message;
  });
}

/** Validações de uma aba de dados. */
function validateSheet_(sheet, name, report) {
  var headers = headersOf_(sheet);
  var index = headerIndex_(headers);

  var headerSeen = {};
  headers.forEach(function (header) {
    if (!header) return;
    headerSeen[header] = (headerSeen[header] || 0) + 1;
  });
  Object.keys(headerSeen).forEach(function (header) {
    if (headerSeen[header] > 1) {
      report('error', name, 1, '', header, 'DUPLICATE_HEADER',
        'Cabeçalho duplicado: ' + header + '. A leitura por objeto perderia uma das colunas.');
    }
  });

  // Todos os cabeçalhos críticos, não só o do ID.
  var required = REQUIRED_HEADERS[name] || [];
  var missing = [];
  for (var h = 0; h < required.length; h++) {
    if (index[required[h]] === undefined) missing.push(required[h]);
  }
  if (missing.length > 0) {
    report('error', name, 1, '', missing.join(', '), 'MISSING_HEADER',
      'Cabeçalho(s) obrigatório(s) ausente(s): ' + missing.join(', ') +
      '. Renomear ou apagar coluna quebra a aplicação sem erro visível.');
  }

  var idField = ID_FIELD[name];
  if (idField && index[idField] === undefined) {
    return; // sem coluna de ID não dá para validar linha a linha
  }

  var coords = COORD_FIELDS[name] || [];
  var latField = coords[0];
  var lonField = coords[1];

  var rows = dataRowsOf_(sheet);
  var seen = {};

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var rowNumber = i + 2;
    var id = idField ? String(row[index[idField]] || '').trim() : '';

    if (idField && id === '') {
      report('error', name, rowNumber, '', idField, 'EMPTY_ID', 'Identificador vazio.');
    } else if (idField) {
      if (seen[id]) {
        report('error', name, rowNumber, id, idField, 'DUPLICATE_ID',
          'Identificador duplicado (primeira ocorrência na linha ' + seen[id] + ').');
      } else {
        seen[id] = rowNumber;
      }
    }

    if (latField && index[latField] !== undefined && index[lonField] !== undefined) {
      validateCoordinate_(row, index, latField, lonField, name, rowNumber, id, report);
    }

    validateSchemaFields_(row, index, name, rowNumber, id, report);
    validatePrice_(row, index, name, rowNumber, id, report);
    if (name === 'RA_PROFILES') validateRaProfile_(row, index, rowNumber, id, report);
    if (name === 'POLYGONS') validatePolygonRow_(row, index, rowNumber, id, report);
  }
}

function validateSchemaFields_(row, index, name, rowNumber, id, report) {
  var schema = FIELD_SCHEMA[name] || {};
  Object.keys(schema).forEach(function (field) {
    if (index[field] === undefined || isBlank_(row[index[field]])) return;
    if (['asking_price_brl', 'current_price_brl', 'area_m2', 'area_min_m2', 'area_max_m2',
      'occupied_area_m2', 'income_per_capita_brl', 'population_age_0_14_pct',
      'population_age_15_29_pct', 'population_age_30_44_pct', 'population_age_45_59_pct',
      'population_age_60_plus_pct'].indexOf(field) !== -1) return; // validação semântica específica abaixo
    var result = coerceField_(schema[field], row[index[field]]);
    if (result.ok) return;
    var code = schema[field].indexOf('enum:') === 0 ? 'INVALID_ENUM' :
      (schema[field] === 'geojson' ? 'INVALID_GEOMETRY' :
        (schema[field] === 'url' ? 'INVALID_URL' : 'INVALID_FIELD_VALUE'));
    report(schema[field] === 'url' ? 'warning' : 'error', name, rowNumber, id, field, code,
      field + ': ' + result.message);
  });
}

function validateRaProfile_(row, index, rowNumber, id, report) {
  if (index.income_per_capita_brl !== undefined && !isBlank_(row[index.income_per_capita_brl])) {
    var income = toNumber_(row[index.income_per_capita_brl]);
    if (income === null || income < 0) {
      report('error', 'RA_PROFILES', rowNumber, id, 'income_per_capita_brl',
        'INVALID_INCOME', 'Renda per capita deve ser um número não negativo.');
    }
  }

  var fields = [
    'population_age_0_14_pct', 'population_age_15_29_pct', 'population_age_30_44_pct',
    'population_age_45_59_pct', 'population_age_60_plus_pct'
  ];
  var values = [];
  fields.forEach(function (field) {
    if (index[field] === undefined || isBlank_(row[index[field]])) return;
    var value = toNumber_(row[index[field]]);
    if (value === null || value < 0 || value > 100) {
      report('error', 'RA_PROFILES', rowNumber, id, field, 'INVALID_PERCENTAGE',
        'Percentual deve estar entre 0 e 100.');
      return;
    }
    values.push(value);
  });
  if (values.length === fields.length) {
    var sum = values.reduce(function (total, value) { return total + value; }, 0);
    var validScale = Math.abs(sum - 100) <= 2 || Math.abs(sum - 1) <= 0.02;
    if (!validScale) {
      report('warning', 'RA_PROFILES', rowNumber, id, fields.join(', '), 'AGE_DISTRIBUTION_SUM',
        'As cinco faixas etárias somam ' + sum + '; esperado aproximadamente 100% (ou 1 em escala decimal).');
    }
  }
}

function validatePolygonRow_(row, index, rowNumber, id, report) {
  ['name', 'geometry_geojson'].forEach(function (field) {
    if (index[field] === undefined || !isBlank_(row[index[field]])) return;
    report('error', 'POLYGONS', rowNumber, id, field, 'MISSING_REQUIRED_VALUE',
      'Campo obrigatório vazio: ' + field);
  });
}

/** Latitude e longitude: faixa, e o caso de só uma das duas preenchida. */
function validateCoordinate_(row, index, latField, lonField, name, rowNumber, id, report) {
  var rawLat = row[index[latField]];
  var rawLon = row[index[lonField]];
  var hasLat = String(rawLat === null || rawLat === undefined ? '' : rawLat).trim() !== '';
  var hasLon = String(rawLon === null || rawLon === undefined ? '' : rawLon).trim() !== '';

  if (hasLat !== hasLon) {
    report('error', name, rowNumber, id, hasLat ? lonField : latField, 'HALF_COORDINATE',
      'Apenas uma das coordenadas está preenchida. O registro não pode ir ao mapa.');
    return;
  }
  if (!hasLat) return; // sem coordenada é situação prevista, não erro

  var lat = toNumber_(rawLat);
  var lon = toNumber_(rawLon);

  if (lat === null || lat < -90 || lat > 90) {
    report('error', name, rowNumber, id, latField, 'INVALID_LATITUDE',
      'Latitude inválida: ' + rawLat);
  }
  if (lon === null || lon < -180 || lon > 180) {
    report('error', name, rowNumber, id, lonField, 'INVALID_LONGITUDE',
      'Longitude inválida: ' + rawLon);
  }
}

/** Preço, área e coerência do preço/m² informado. */
function validatePrice_(row, index, name, rowNumber, id, report) {
  var priceField = index.asking_price_brl !== undefined ? 'asking_price_brl' :
    (index.current_price_brl !== undefined ? 'current_price_brl' :
      (index.price_min_brl !== undefined ? 'price_min_brl' : null));

  if (priceField) {
    var raw = row[index[priceField]];
    if (String(raw === null || raw === undefined ? '' : raw).trim() !== '') {
      var price = toNumber_(raw);
      if (price === null || price <= 0) {
        report('error', name, rowNumber, id, priceField, 'NON_POSITIVE_PRICE',
          'Preço não positivo ou não numérico: ' + raw);
      }
    }
  }

  var areaFields = ['area_m2', 'area_min_m2', 'area_max_m2', 'occupied_area_m2'];
  areaFields.forEach(function (areaField) {
    if (index[areaField] === undefined) return;
    var rawArea = row[index[areaField]];
    if (String(rawArea === null || rawArea === undefined ? '' : rawArea).trim() !== '') {
      var area = toNumber_(rawArea);
      if (area === null || area <= 0) {
        report('error', name, rowNumber, id, areaField, 'NON_POSITIVE_AREA',
          'Área não positiva ou não numérica: ' + rawArea);
      }
    }
  });

  // Preço/m² informado que diverge muito do calculado: alerta, nunca sobrescrita.
  if (index.asking_price_brl !== undefined && index.area_m2 !== undefined &&
      index.asking_price_brl_m2 !== undefined) {
    var p = toNumber_(row[index.asking_price_brl]);
    var a = toNumber_(row[index.area_m2]);
    var informed = toNumber_(row[index.asking_price_brl_m2]);
    if (p !== null && a !== null && a > 0 && informed !== null && informed > 0) {
      var expected = p / a;
      if (Math.abs(expected - informed) / informed > PRICE_M2_TOLERANCE) {
        report('warning', name, rowNumber, id, 'asking_price_brl_m2', 'PRICE_M2_MISMATCH',
          'Preço/m² informado (' + Math.round(informed) + ') diverge do calculado (' +
          Math.round(expected) + ').');
      }
    }
  }

  if (index.current_price_brl !== undefined && index.area_min_m2 !== undefined &&
      index.current_price_brl_m2 !== undefined) {
    var currentPrice = toNumber_(row[index.current_price_brl]);
    var minArea = toNumber_(row[index.area_min_m2]);
    var currentPriceM2 = toNumber_(row[index.current_price_brl_m2]);
    if (currentPrice !== null && minArea !== null && minArea > 0 &&
        currentPriceM2 !== null && currentPriceM2 > 0) {
      var currentExpected = currentPrice / minArea;
      if (Math.abs(currentExpected - currentPriceM2) / currentPriceM2 > PRICE_M2_TOLERANCE) {
        report('warning', name, rowNumber, id, 'current_price_brl_m2', 'PRICE_M2_MISMATCH',
          'Preço/m² informado (' + Math.round(currentPriceM2) + ') diverge do calculado (' +
          Math.round(currentExpected) + ').');
      }
    }
  }
}

/** Reescreve DATA_QUALITY com os achados desta execução. */
function writeQuality_(findings) {
  var sheet = ss_().getSheetByName(QUALITY_SHEET);
  if (!sheet) return;

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, OPERATIONAL_HEADERS.DATA_QUALITY.length).clearContent();
  }
  if (findings.length > 0) {
    sheet.getRange(2, 1, findings.length, OPERATIONAL_HEADERS.DATA_QUALITY.length).setValues(findings);
  }
}

// ---------------------------------------------------------------------------
// APP_META
// ---------------------------------------------------------------------------

/** Escreve uma chave em APP_META, atualizando a linha existente se houver. */
function setMeta_(key, value) {
  var sheet = ss_().getSheetByName(META_SHEET);
  if (!sheet) return;
  if (isSecretMetaKey_(key)) {
    Logger.log('Chave sensível recusada em APP_META: %s', key);
    return;
  }

  var rows = dataRowsOf_(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key) {
      sheet.getRange(i + 2, 1, 1, 3).setNumberFormat('@');
      sheet.getRange(i + 2, 2, 1, 2).setValues([[String(value), nowISO_()]]);
      return;
    }
  }
  sheet.appendRow([key, String(value), nowISO_()]);
  sheet.getRange(sheet.getLastRow(), 1, 1, 3).setNumberFormat('@');
}

/** Lê uma chave de APP_META. Devolve '' quando ausente. */
function getMeta_(key) {
  var sheet = ss_().getSheetByName(META_SHEET);
  if (!sheet) return '';
  var rows = dataRowsOf_(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key) return toText_(rows[i][1]);
  }
  return '';
}

/** Atualiza os metadados derivados do estado atual da planilha. */
function refreshMeta() {
  var book = ss_();

  setMeta_('app_version', APP_VERSION);
  setMeta_('dataset_version', props_().getProperty('DATASET_VERSION') || '1');
  setMeta_('last_meta_refresh_at', nowISO_());

  var countKey = {
    LISTINGS: 'rows_listings',
    DEVELOPMENTS: 'rows_developments',
    ANCHORS: 'rows_anchors',
    RA_PROFILES: 'rows_ra_profiles',
    POLYGONS: 'rows_polygons',
    ROAD_SEGMENTS: 'rows_road_segments',
    ROAD_SEGMENT_ALIASES: 'rows_road_segment_aliases',
    TRAFFIC_DAILY_TEST: 'rows_traffic_daily_test'
  };

  Object.keys(countKey).forEach(function (name) {
    var sheet = book.getSheetByName(name);
    var count = sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
    setMeta_(countKey[name], String(count));
  });

  // v2.4.0 — bases analíticas e operacionais (Plano 02 §21). Aba ausente publica '' em vez
  // de '0': "não existe" e "existe vazia" são estados diferentes, e o cliente omite chave
  // vazia em vez de mostrar zero.
  var extraCountKey = {
    IVV_MONTHLY: 'rows_ivv_monthly',
    IVV_REGION: 'rows_ivv_region',
    FIPEZAP_MONTHLY: 'rows_fipezap_monthly',
    FIPEZAP_LOCALITY_MONTHLY: 'rows_fipezap_locality_monthly',
    FIPEZAP_LOCALITY_MAP: 'rows_fipezap_locality_map',
    FIPEZAP_SOURCES: 'rows_fipezap_sources',
    FIPEZAP_NOTES: 'rows_fipezap_notes',
    PDAD_A_DATA: 'rows_pdad_data',
    PDAD_A_COVERAGE: 'rows_pdad_coverage',
    LISTINGS_COVERAGE: 'rows_listings_coverage'
  };
  Object.keys(extraCountKey).forEach(function (name) {
    var sheet = book.getSheetByName(name);
    setMeta_(extraCountKey[name], sheet ? String(Math.max(0, sheet.getLastRow() - 1)) : '');
  });
  setMeta_('rows_polygons_active', String(countActivePolygons_(book)));

  var fipezap = book.getSheetByName('FIPEZAP_MONTHLY');
  if (fipezap && fipezap.getLastRow() > 1) {
    var range = fipezapPeriodRange_(fipezap);
    if (range.start) setMeta_('fipezap_period_start', range.start);
    if (range.end) setMeta_('fipezap_period_end', range.end);
  }

  Logger.log('metadados atualizados em %s', nowISO_());
  return 'Metadados atualizados.';
}

/** Invalida o cache do endpoint. */
function clearCache() {
  CacheService.getScriptCache().removeAll(
    ALLOWED_DATASETS.map(function (name) { return 'dataset_' + name; }).concat(['meta'])
  );
  Logger.log('cache limpo');
  return 'Cache limpo.';
}

// ---------------------------------------------------------------------------
// Polígonos — importação KML/KMZ e persistência idempotente
// ---------------------------------------------------------------------------

function importPolygonsFromDriveFile_UI() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt(
    'Importar polígonos de KML/KMZ',
    'Cole o ID ou a URL do arquivo no Google Drive. A planilha é pública: importe somente dados publicáveis.',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var fileId = extractDriveFileId_(response.getResponseText());
  if (!fileId) {
    ui.alert('Não foi possível identificar o arquivo. Cole o ID ou uma URL /d/ID/view do Google Drive.');
    return;
  }

  try {
    var result = importPolygonsFromDriveFile_(fileId);
    ui.alert(
      'Importação concluída',
      result.inserted + ' polígono(s) adicionado(s); ' + result.skipped +
        ' já existente(s) preservado(s). Arquivo: ' + result.fileName,
      ui.ButtonSet.OK
    );
  } catch (error) {
    ui.alert('Falha na importação', String(error && error.message ? error.message : error), ui.ButtonSet.OK);
  }
}

function extractDriveFileId_(input) {
  var text = toText_(input);
  var fromUrl = text.match(/\/d\/([A-Za-z0-9_-]{15,})/);
  if (fromUrl) return fromUrl[1];
  var plain = text.match(/^[A-Za-z0-9_-]{15,}$/);
  return plain ? plain[0] : '';
}

function importPolygonsFromDriveFile_(fileId) {
  var file = DriveApp.getFileById(fileId);
  var fileName = file.getName();
  var kmlText = kmlTextFromDriveFile_(file);
  var placemarks = parseKmlPolygonPlacemarks_(kmlText);
  if (!placemarks.length) {
    throw new Error('Nenhum Placemark com Polygon/MultiGeometry de polígonos foi encontrado.');
  }
  if (placemarks.length > MAX_IMPORTED_POLYGONS) {
    throw new Error('O arquivo contém ' + placemarks.length + ' polígonos; limite por importação: ' +
      MAX_IMPORTED_POLYGONS + '. Divida o arquivo antes de importar.');
  }

  var result = withLock_(function () {
    return writePolygonsToSheet_(placemarks, fileName, fileId);
  });
  if (!result) throw new Error('Não foi possível obter lock de escrita; tente novamente.');
  return result;
}

function kmlTextFromDriveFile_(file) {
  var blob = file.getBlob();
  if (blob.getBytes().length > MAX_KML_BYTES) {
    throw new Error('Arquivo maior que ' + Math.round(MAX_KML_BYTES / 1024 / 1024) + ' MB.');
  }
  var lowerName = file.getName().toLowerCase();
  var isKmz = /\.kmz$/.test(lowerName) ||
    blob.getContentType() === 'application/vnd.google-earth.kmz';
  if (!isKmz) return blob.getDataAsString('UTF-8');

  var parts = Utilities.unzip(blob).filter(function (part) {
    return /\.kml$/i.test(part.getName());
  });
  if (!parts.length) throw new Error('KMZ sem arquivo .kml.');
  parts.sort(function (a, b) {
    var aDoc = /(^|\/)doc\.kml$/i.test(a.getName()) ? 0 : 1;
    var bDoc = /(^|\/)doc\.kml$/i.test(b.getName()) ? 0 : 1;
    return aDoc - bDoc;
  });
  if (parts[0].getBytes().length > MAX_KML_BYTES) {
    throw new Error('KML descompactado maior que o limite de segurança.');
  }
  return parts[0].getDataAsString('UTF-8');
}

function parseKmlPolygonPlacemarks_(kmlText) {
  var document;
  try { document = XmlService.parse(String(kmlText).replace(/^\uFEFF/, '')); }
  catch (err) { throw new Error('KML inválido: ' + err.message); }

  var placemarkElements = collectElementsByName_(document.getRootElement(), 'Placemark', []);
  var placemarks = [];
  placemarkElements.forEach(function (placemark, sourceIndex) {
    var polygonElements = collectElementsByName_(placemark, 'Polygon', []);
    if (!polygonElements.length) return;

    var polygonCoordinates = polygonElements.map(kmlPolygonElementToRings_);
    var geometry = polygonCoordinates.length === 1
      ? { type: 'Polygon', coordinates: polygonCoordinates[0] }
      : { type: 'MultiPolygon', coordinates: polygonCoordinates };
    var valid = validateGeoJsonGeometry_(geometry);
    if (!valid.ok) {
      throw new Error('Placemark ' + (sourceIndex + 1) + ': ' + valid.message);
    }

    var properties = extractKmlProperties_(placemark);
    var name = directChildText_(placemark, 'name') || 'Polígono ' + (sourceIndex + 1);
    var description = directChildText_(placemark, 'description') ||
      propertyByAliases_(properties, ['description', 'descricao']);
    var sourceUrl = propertyByAliases_(properties, ['source_url', 'url_fonte', 'fonte_url']);
    if (sourceUrl && !isValidUrl_(sourceUrl)) sourceUrl = '';
    var propertiesResult = validateJsonObject_(properties);
    if (!propertiesResult.ok) throw new Error('Placemark ' + (sourceIndex + 1) + ': ' + propertiesResult.message);
    [name, description].forEach(function (text) {
      if (toText_(text).length > MAX_CELL_TEXT_LENGTH) {
        throw new Error('Placemark ' + (sourceIndex + 1) + ': texto excede o limite da célula.');
      }
    });
    placemarks.push({
      sourceIndex: sourceIndex,
      name: name,
      category: propertyByAliases_(properties, ['category', 'categoria']),
      color: propertyByAliases_(properties, ['color', 'cor']),
      description: description,
      sourceUrl: sourceUrl,
      properties: properties,
      propertiesJson: propertiesResult.value,
      geometry: valid.geometry
    });
  });
  return placemarks;
}

function collectElementsByName_(element, name, out) {
  if (!element) return out;
  if (element.getName && element.getName() === name) out.push(element);
  var children = element.getChildren ? element.getChildren() : [];
  children.forEach(function (child) { collectElementsByName_(child, name, out); });
  return out;
}

function directChildText_(element, name) {
  var children = element.getChildren ? element.getChildren() : [];
  for (var i = 0; i < children.length; i++) {
    if (children[i].getName() === name) return toText_(children[i].getText());
  }
  return '';
}

function firstDescendantText_(element, name) {
  var found = collectElementsByName_(element, name, []);
  return found.length ? toText_(found[0].getText()) : '';
}

function kmlPolygonElementToRings_(polygonElement) {
  var outerElements = collectElementsByName_(polygonElement, 'outerBoundaryIs', []);
  if (!outerElements.length) throw new Error('Polygon sem outerBoundaryIs.');
  var outerCoordinates = firstDescendantText_(outerElements[0], 'coordinates');
  if (!outerCoordinates) throw new Error('Polygon sem coordenadas externas.');
  var rings = [coordsTextToRing_(outerCoordinates)];

  collectElementsByName_(polygonElement, 'innerBoundaryIs', []).forEach(function (inner) {
    var coordinates = firstDescendantText_(inner, 'coordinates');
    if (coordinates) rings.push(coordsTextToRing_(coordinates));
  });
  return rings;
}

function coordsTextToRing_(coordsText) {
  return toText_(coordsText).split(/\s+/).filter(Boolean).map(function (tuple) {
    var parts = tuple.split(',');
    return [Number(parts[0]), Number(parts[1])];
  });
}

function extractKmlProperties_(placemark) {
  var properties = Object.create(null);
  collectElementsByName_(placemark, 'Data', []).forEach(function (element) {
    var attribute = element.getAttribute('name');
    var key = attribute ? safePropertyKey_(attribute.getValue()) : '';
    if (key) properties[key] = firstDescendantText_(element, 'value');
  });
  collectElementsByName_(placemark, 'SimpleData', []).forEach(function (element) {
    var attribute = element.getAttribute('name');
    var key = attribute ? safePropertyKey_(attribute.getValue()) : '';
    if (key) properties[key] = toText_(element.getText());
  });
  return properties;
}

function safePropertyKey_(key) {
  var text = toText_(key).slice(0, 100);
  if (['__proto__', 'prototype', 'constructor'].indexOf(text) !== -1) return '';
  return text;
}

function propertyByAliases_(properties, aliases) {
  var normalized = {};
  Object.keys(properties || {}).forEach(function (key) { normalized[normalizeSlug_(key)] = properties[key]; });
  for (var i = 0; i < aliases.length; i++) {
    var value = normalized[normalizeSlug_(aliases[i])];
    if (!isBlank_(value)) return toText_(value);
  }
  return '';
}

function stablePolygonId_(fileId, placemark) {
  var seed = fileId + '|' + placemark.sourceIndex + '|' + normalizeSlug_(placemark.name);
  return 'POLY_' + sha256Hex_(seed).slice(0, 24);
}

function writePolygonsToSheet_(placemarks, sourceFileName, fileId) {
  var book = ss_();
  var sheet = book.getSheetByName('POLYGONS') || book.insertSheet('POLYGONS');
  ensureHeaders_(sheet, REQUIRED_HEADERS.POLYGONS, null); // aba gerenciada: pode criar tudo
  var headers = headersOf_(sheet);
  var index = headerIndex_(headers);
  var existingIds = {};
  dataRowsOf_(sheet).forEach(function (row) {
    var id = toText_(row[index.polygon_id]);
    if (id) existingIds[id] = true;
  });

  var rowsToAppend = [];
  var skipped = 0;
  var importedAt = nowISO_();
  placemarks.forEach(function (placemark) {
    var id = stablePolygonId_(fileId, placemark);
    if (existingIds[id]) { skipped++; return; }
    var geometryJson = JSON.stringify(placemark.geometry);
    var metrics = polygonMetricsApprox_(placemark.geometry);
    var fillColor = placemark.color || '#4C8BF5';
    // Uma coluna nova do contrato A:AP nunca é escrita "às cegas": só quando existe no
    // cabeçalho. Planilha ainda no schema de 11 colunas continua importando sem quebrar.
    var values = {
      polygon_id: id,
      name: placemark.name,
      category: placemark.category,
      geometry_geojson: geometryJson,
      color: placemark.color,
      description: placemark.description,
      properties_json: placemark.propertiesJson || '{}',
      source_url: placemark.sourceUrl,
      source_file: sourceFileName,
      imported_at: importedAt,
      status: 'active',
      layer_group: 'poligonais_importadas',
      subcategory: 'kml_kmz',
      centroid_latitude: metrics.centroid_latitude,
      centroid_longitude: metrics.centroid_longitude,
      area_m2: metrics.area_m2,
      area_ha: metrics.area_ha,
      perimeter_m: metrics.perimeter_m,
      fill_color: fillColor,
      confidence_flag: 'high_geometry_from_source_file',
      quality_flag: 'valid_geometry',
      entity_type: 'custom_area',
      entity_id: 'AREA_' + normalizeSlug_(placemark.name) + '_' + id.slice(-8),
      geometry_type: placemark.geometry.type,
      geometry_role: 'boundary',
      source_geometry_type: placemark.geometry.type,
      source_system: 'user_upload',
      source_layer_name: sourceFileName,
      source_feature_id: String(placemark.sourceIndex),
      source_crs: 'EPSG:4326',
      geometry_hash: sha256Hex_(geometryJson),
      last_synced_at: importedAt,
      source_geometry_geojson: geometryJson
    };
    var row = new Array(headers.length).fill('');
    Object.keys(values).forEach(function (field) {
      if (index[field] === undefined) return;
      var value = values[field];
      row[index[field]] = value === null || value === undefined ? '' : value;
    });
    rowsToAppend.push(row.map(safeCellValue_));
    existingIds[id] = true;
  });

  if (rowsToAppend.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, headers.length).setValues(rowsToAppend);
    var version = bumpDatasetVersion_();
    setMeta_('validation_status', 'dirty');
    setMeta_('last_data_change_at', importedAt);
    setMeta_('rows_polygons', String(Math.max(0, sheet.getLastRow() - 1)));
    clearCache();
    logWriteChange_('POLYGONS', '*', 'import', '', rowsToAppend.length + ' polígono(s)',
      'importador KML/KMZ', 'kml-' + version, 'ok', '');
  }
  return { inserted: rowsToAppend.length, skipped: skipped, fileName: sourceFileName };
}

function safeCellValue_(value) {
  if (typeof value !== 'string') return value;
  if (/^[=+@]/.test(value) || /^-[A-Za-z]/.test(value)) return "'" + value;
  return value;
}

// ---------------------------------------------------------------------------
// Regiões Administrativas — sincronização com o GeoPortal/SEDUH
// ---------------------------------------------------------------------------
//
// Traz o limite oficial de cada RA para POLYGONS e completa RA_PROFILES com o que a
// camada oficial sabe (código, número, área). O PERFIL continua canônico em
// RA_PROFILES: POLYGONS.properties_json recebe apenas um snapshot enxuto, para o mapa
// não precisar de um segundo fetch só para montar o cartão da RA.

function syncAdministrativeRegions_UI() {
  var ui = SpreadsheetApp.getUi();
  try {
    var result = syncAdministrativeRegions_();
    var message = result.synced + ' RA(s) sincronizada(s) em POLYGONS.';
    if (result.failed) message += '\nFalhas: ' + result.failed + '.';
    if (result.kmzUrl) message += '\nKMZ criado no Drive: ' + result.kmzUrl;
    message += '\n\nAs propriedades continuam canônicas em RA_PROFILES e um snapshot enxuto foi copiado para POLYGONS.properties_json.';
    ui.alert('Regiões Administrativas', message, ui.ButtonSet.OK);
  } catch (error) {
    ui.alert('Falha na sincronização das RAs', String(error && error.message ? error.message : error), ui.ButtonSet.OK);
  }
}

function syncAdministrativeRegions_() {
  var collection = fetchAdministrativeRegionsGeoJson_();
  var features = collection.features || [];
  if (!features.length) throw new Error('GeoPortal não retornou Regiões Administrativas.');

  var colors = fetchAdministrativeRegionColors_();
  // Faixas etárias vêm da própria planilha (aba PDAD_A_DATA), calculadas uma vez para
  // todas as RAs antes do lock — leitura de 12 mil linhas não é coisa para repetir 37 vezes.
  var ageBands = ageBandsByRaFromPdad_();
  var prepared = [];
  var failed = 0;

  features.forEach(function (feature) {
    try {
      var attrs = feature.properties || {};
      var raNumber = toNumber_(attrs.ra_cira);
      if (raNumber === null) raNumber = raNumberFromCode_(attrs.ra_codigo);
      if (raNumber === null || raNumber <= 0) throw new Error('ra_cira/ra_codigo ausente ou inválido.');
      var raGeoId = 'RA_' + ('0' + Math.round(raNumber)).slice(-2);
      var raName = titleCaseRaName_(sanitizePlainText_(attrs.ra_nome || attrs.ra_codigo || raGeoId));
      var geometry = feature.geometry;
      var geometryJson = JSON.stringify(geometry || {});
      var toleranceDeg = RA_SYNC_SIMPLIFY_OFFSETS_DEG[0];

      // Célula do Sheets tem teto. Acima dele a saída NÃO é truncar (geometria truncada é
      // polígono inválido gravado como se fosse válido), é pedir ao GeoPortal a mesma
      // feição com o próximo degrau de simplificação, e desistir da RA se nenhum couber.
      // O tamanho é medido ANTES de validar: `validateGeoJsonGeometry_` também recusa
      // geometria acima do teto, e validar primeiro fazia a escada nunca rodar — a RA
      // grande caía direto em "falha" (era o que acontecia com o Plano Piloto).
      for (var step = 1; step < RA_SYNC_SIMPLIFY_OFFSETS_DEG.length && geometryJson.length > RA_SYNC_MAX_CELL_CHARS; step++) {
        var simplified = fetchAdministrativeRegionFeature_(attrs.objectid, RA_SYNC_SIMPLIFY_OFFSETS_DEG[step]);
        if (!simplified || !simplified.geometry) throw new Error('geometria excede limite da célula e simplificação falhou.');
        geometry = simplified.geometry;
        geometryJson = JSON.stringify(geometry);
        toleranceDeg = RA_SYNC_SIMPLIFY_OFFSETS_DEG[step];
      }
      if (geometryJson.length > RA_SYNC_MAX_CELL_CHARS) throw new Error('geometria excede 48 mil caracteres mesmo após simplificação.');
      var validation = validateGeoJsonGeometry_(geometry);
      if (!validation.ok) throw new Error('geometria inválida: ' + validation.message);
      geometryJson = JSON.stringify(validation.geometry);

      prepared.push({
        ra_geo_id: raGeoId,
        ra_number: Math.round(raNumber),
        ra_code: sanitizePlainText_(attrs.ra_codigo),
        ra_name: raName,
        ra_area_km2: toNumber_(attrs.ra_areakm2),
        ra_path: sanitizePlainText_(attrs.ra_path),
        source_feature_id: toText_(attrs.objectid),
        geometry: validation.geometry,
        geometry_json: geometryJson,
        geometry_hash: sha256Hex_(geometryJson),
        simplification_tolerance_deg: toleranceDeg,
        age_bands: ageBands[raGeoId] || null,
        fill_color: colors[normalizeSlug_(attrs.ra_nome)] || '#8AA6B8',
        synced_at: nowISO_()
      });
    } catch (error) {
      // Uma RA que falha não pode derrubar as outras 34: conta como falha e segue.
      failed++;
      Logger.log('RA sync falhou: %s', error && error.message ? error.message : error);
    }
  });

  if (!prepared.length) throw new Error('Nenhuma RA pôde ser preparada para sincronização.');

  var kmz = createAdministrativeRegionsKmz_(prepared);
  var result = withLock_(function () {
    ensureAdministrativeRegionSchemas_();
    var synced = 0;
    prepared.forEach(function (ra) {
      updateRaProfileFromGeometry_(ra);
      upsertAdministrativeRegionPolygon_(ra, kmz);
      synced++;
    });
    setMeta_('ra_geometry_sync_status', failed ? 'synced_with_warnings' : 'synced');
    setMeta_('ra_geometry_sync_last_synced_at', nowISO_());
    setMeta_('ra_geometry_sync_count', String(synced));
    setMeta_('ra_geometry_sync_failed_count', String(failed));
    setMeta_('ra_geometry_kmz_file_id', kmz.fileId || '');
    setMeta_('ra_geometry_kmz_url', kmz.url || '');
    setMeta_('validation_status', 'dirty');
    setMeta_('last_data_change_at', nowISO_());
    var version = bumpDatasetVersion_();
    clearCache();
    refreshMeta();
    logWriteChange_('POLYGONS', '*', 'ra_geometry_sync', '', synced + ' RA(s)',
      'sincronizador GeoPortal/SEDUH', 'ra-geoportal-' + version, 'ok', failed ? failed + ' falha(s)' : '');
    return { synced: synced, failed: failed, kmzUrl: kmz.url || '' };
  });
  if (!result) throw new Error('Não foi possível obter lock de escrita.');
  return result;
}

/** RA_PROFILES e POLYGONS são abas gerenciadas: `null` libera a criação de qualquer coluna. */
function ensureAdministrativeRegionSchemas_() {
  var book = ss_();
  ['RA_PROFILES', 'POLYGONS'].forEach(function (name) {
    var sheet = book.getSheetByName(name) || book.insertSheet(name);
    ensureHeaders_(sheet, REQUIRED_HEADERS[name], null);
  });
}

function fetchAdministrativeRegionsGeoJson_() {
  var params = {
    where: '1=1',
    outFields: 'objectid,ra_cira,ra_codigo,ra_nome,ra_path,ra_areakm2',
    returnGeometry: 'true',
    returnTrueCurves: 'false',
    outSR: '4326',
    geometryPrecision: '6',
    maxAllowableOffset: RA_SYNC_SIMPLIFY_OFFSETS_DEG[0],
    f: 'geojson'
  };
  var url = RA_BOUNDARY_LAYER_URL + '/query?' + encodeQueryParams_(params);
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (response.getResponseCode() !== 200) throw new Error('HTTP ' + response.getResponseCode() + ' ao consultar limites das RAs.');
  var payload = JSON.parse(response.getContentText('UTF-8'));
  if (payload.error) throw new Error('GeoPortal: ' + (payload.error.message || JSON.stringify(payload.error)));
  return payload;
}

function fetchAdministrativeRegionFeature_(objectId, maxOffset) {
  if (isBlank_(objectId)) return null;
  var params = {
    where: 'objectid=' + Number(objectId),
    outFields: 'objectid,ra_cira,ra_codigo,ra_nome,ra_path,ra_areakm2',
    returnGeometry: 'true',
    returnTrueCurves: 'false',
    outSR: '4326',
    geometryPrecision: '6',
    maxAllowableOffset: String(maxOffset),
    f: 'geojson'
  };
  var response = UrlFetchApp.fetch(RA_BOUNDARY_LAYER_URL + '/query?' + encodeQueryParams_(params), {
    muteHttpExceptions: true,
    followRedirects: true
  });
  if (response.getResponseCode() !== 200) return null;
  var payload = JSON.parse(response.getContentText('UTF-8'));
  return payload && payload.features && payload.features.length ? payload.features[0] : null;
}

/** Cores oficiais do renderer da camada. Indisponibilidade é aceitável: há cor padrão. */
function fetchAdministrativeRegionColors_() {
  var out = {};
  try {
    var response = UrlFetchApp.fetch(RA_BOUNDARY_LAYER_URL + '?f=json', {
      muteHttpExceptions: true,
      followRedirects: true
    });
    if (response.getResponseCode() !== 200) return out;
    var payload = JSON.parse(response.getContentText('UTF-8'));
    var infos = payload && payload.drawingInfo && payload.drawingInfo.renderer
      ? (payload.drawingInfo.renderer.uniqueValueInfos || []) : [];
    infos.forEach(function (info) {
      var rgba = info && info.symbol ? info.symbol.color : null;
      if (!rgba || rgba.length < 3) return;
      out[normalizeSlug_(info.value || info.label)] = rgbToHex_(rgba[0], rgba[1], rgba[2]);
    });
  } catch (error) {
    Logger.log('Cores oficiais das RAs indisponíveis: %s', error && error.message);
  }
  return out;
}

function encodeQueryParams_(params) {
  return Object.keys(params).map(function (key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
  }).join('&');
}

function rgbToHex_(r, g, b) {
  function h(v) { return ('0' + Math.max(0, Math.min(255, Number(v) || 0)).toString(16)).slice(-2); }
  return '#' + h(r) + h(g) + h(b);
}

/**
 * "RA-XXIII" -> 23. Devolve null quando o código não é um romano VÁLIDO.
 *
 * A soma-e-subtração ingênua não basta: ela devolve um número perfeitamente plausível
 * para um romano malformado — `IIII` vira 4 e `IXX` vira 19 — e esse número vira
 * `ra_geo_id`, ou seja, uma RA ERRADA gravada em silêncio. O round-trip é o que
 * distingue "li corretamente" de "consegui somar alguma coisa": só aceita o código cuja
 * forma canônica é exatamente o que veio.
 */
function raNumberFromCode_(code) {
  var text = toText_(code).toUpperCase();
  var roman = text.replace(/^RA[-\s]*/i, '').trim();
  if (!roman) return null;
  var map = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  var total = 0;
  var prev = 0;
  for (var i = roman.length - 1; i >= 0; i--) {
    var v = map[roman.charAt(i)] || 0;
    if (!v) return null;
    if (v < prev) total -= v; else { total += v; prev = v; }
  }
  if (!total || total < 1) return null;
  return numberToRoman_(total) === roman ? total : null;
}

/** Forma canônica de um inteiro positivo em algarismos romanos. */
function numberToRoman_(value) {
  var table = [
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];
  var n = Math.round(value);
  var out = '';
  for (var i = 0; i < table.length && n > 0; i++) {
    while (n >= table[i][0]) { out += table[i][1]; n -= table[i][0]; }
  }
  return out;
}

function titleCaseRaName_(name) {
  var text = toText_(name).toLocaleLowerCase();
  var keepLower = { 'de': true, 'da': true, 'do': true, 'das': true, 'dos': true, 'e': true };
  return text.split(/\s+/).map(function (part, i) {
    if (i > 0 && keepLower[part]) return part;
    return part ? part.charAt(0).toLocaleUpperCase() + part.slice(1) : part;
  }).join(' ')
    .replace(/Scia/g, 'SCIA')
    .replace(/Sia/g, 'SIA');
}

/**
 * Completa RA_PROFILES com o que a camada oficial sabe. NÃO toca em indicador de perfil:
 * o PDAD é a fonte daquilo e sobrescrevê-lo aqui apagaria dado melhor com dado pior.
 */
function updateRaProfileFromGeometry_(ra) {
  var sheet = ss_().getSheetByName('RA_PROFILES');
  var headers = headersOf_(sheet);
  var index = headerIndex_(headers);
  var found = findRowById_(sheet, headers, index, 'ra_geo_id', ra.ra_geo_id);
  var existing = found ? found.record : {};
  var population = toNumber_(existing.population_total);
  var areaKm2 = ra.ra_area_km2;
  var fields = {
    ra_geo_id: ra.ra_geo_id,
    ra_name: ra.ra_name,
    ra_code: ra.ra_code,
    ra_number: ra.ra_number,
    geometry_source_url: RA_BOUNDARY_LAYER_URL
  };
  // Valor que não dá para calcular NÃO vira célula vazia: `applyUpdate_` grava tudo que
  // recebe, então mandar '' aqui APAGARIA uma densidade que já estava na planilha só
  // porque a camada oficial não trouxe a área nesta execução. Ausência de dado novo é
  // ausência de escrita, não escrita de ausência.
  if (areaKm2 !== null) fields.area_km2 = areaKm2;
  if (population !== null && areaKm2 !== null && areaKm2 > 0) {
    fields.population_density_km2 = population / areaKm2;
  }
  // Faixas etárias agregadas da PDAD_A_DATA (issue #105): só quando as 17 categorias × 2
  // sexos vieram publicadas para a RA; senão a célula fica como estava. `income_per_capita_brl`
  // nunca é tocada aqui — renda só entra quando o IPEDF publica, e é gravada à mão.
  if (ra.age_bands) {
    fields.population_age_0_14_pct = ra.age_bands.age_0_14;
    fields.population_age_15_29_pct = ra.age_bands.age_15_29;
    fields.population_age_30_44_pct = ra.age_bands.age_30_44;
    fields.population_age_45_59_pct = ra.age_bands.age_45_59;
    fields.population_age_60_plus_pct = ra.age_bands.age_60_plus;
    fields.notes = 'Faixas etárias agregadas da aba PDAD_A_DATA (Figura 3, 17 categorias × sexo, PDAD-A ' +
      ra.age_bands.year + ') na sincronização de ' + nowISO_().slice(0, 10) +
      '. Renda per capita só quando publicada pelo IPEDF (Informe Distrital de Rendimentos).';
  }
  if (found) applyUpdate_(sheet, headers, found.rowNumber, fields);
  else {
    // RA que existe no limite oficial mas ainda não tem perfil PDAD nasce marcada como
    // tal, para a tela distinguir "sem dado publicado" de "dado igual a zero".
    fields.profile_status = 'official_geometry_only_profile_pending';
    fields.quality_flag = 'official_geometry_profile_not_loaded';
    applyCreate_(sheet, headers, 'ra_geo_id', ra.ra_geo_id, fields);
  }
}

/**
 * Faixas etárias de RA_PROFILES a partir da aba PDAD_A_DATA (issue #105).
 *
 * Lê `age_sex_distribution` do ano mais recente por RA, soma `estimate_total` das 17
 * categorias quinquenais × 2 sexos nas cinco faixas da tela (0–14, 15–29, 30–44, 45–59,
 * 60+) e devolve pontos percentuais com uma decimal — a mesma escala da aba (R3.4/§D2).
 * Uma RA só entra quando as 34 linhas vieram `published`: categoria suprimida ou ausente
 * faria a soma parecer completa sem ser, e a divergência silenciosa é justamente o que a
 * tela não pode carregar. Reproduz os valores já gravados à mão para o Plano Piloto
 * (14,2 / 16,6 / 27,8 / 21,0 / 20,4).
 */
function ageBandsByRaFromPdad_() {
  var sheet = ss_().getSheetByName('PDAD_A_DATA');
  if (!sheet || sheet.getLastRow() < 2) return {};
  var headers = headersOf_(sheet);
  var index = headerIndex_(headers);
  var needed = ['ra_geo_id', 'pdad_year', 'indicator_code', 'segment_dimension', 'segment_value',
    'category_standard', 'estimate_total', 'source_value_status'];
  for (var i = 0; i < needed.length; i++) if (index[needed[i]] === undefined) return {};

  var perRa = {};
  dataRowsOf_(sheet).forEach(function (row) {
    if (toText_(row[index.indicator_code]) !== 'age_sex_distribution') return;
    if (toText_(row[index.segment_dimension]) !== 'Sexo') return;
    var raGeoId = toText_(row[index.ra_geo_id]);
    var year = toNumber_(row[index.pdad_year]);
    if (!raGeoId || year === null) return;
    var slot = perRa[raGeoId] || (perRa[raGeoId] = {});
    var byYear = slot[year] || (slot[year] = { rows: 0, invalid: 0, seen: {}, bands: { age_0_14: 0, age_15_29: 0, age_30_44: 0, age_45_59: 0, age_60_plus: 0 }, total: 0 });
    var band = ageBandOfCategory_(row[index.category_standard]);
    if (!band) return;
    // Uma linha só conta como completa quando é publicada, numérica e única por
    // (categoria, sexo): linha `published` sem `estimate_total`, ou repetida, faria o
    // contador chegar a 34 com um denominador errado — e o resultado pareceria certo.
    var key = toText_(row[index.category_standard]).toLowerCase() + '|' + toText_(row[index.segment_value]).toLowerCase();
    var value = toNumber_(row[index.estimate_total]);
    if (toText_(row[index.source_value_status]) !== 'published' || value === null || byYear.seen[key]) {
      byYear.invalid++;
      return;
    }
    byYear.seen[key] = true;
    byYear.rows++;
    byYear.bands[band] += value;
    byYear.total += value;
  });

  var out = {};
  Object.keys(perRa).forEach(function (raGeoId) {
    var years = Object.keys(perRa[raGeoId]).map(Number).sort(function (a, b) { return b - a; });
    var latest = perRa[raGeoId][years[0]];
    // 17 categorias × 2 sexos, todas válidas: qualquer linha a menos, ou qualquer linha
    // inválida no lote, é lote incompleto para esta RA.
    if (!latest || latest.rows !== 34 || latest.invalid !== 0 || latest.total <= 0) return;
    var pct = function (v) { return Math.round((v / latest.total) * 1000) / 10; };
    out[raGeoId] = {
      year: years[0],
      age_0_14: pct(latest.bands.age_0_14),
      age_15_29: pct(latest.bands.age_15_29),
      age_30_44: pct(latest.bands.age_30_44),
      age_45_59: pct(latest.bands.age_45_59),
      age_60_plus: pct(latest.bands.age_60_plus)
    };
  });
  return out;
}

/** "ate_4_anos" → 0–14; "15_a_19_anos" → 15–29; "80_anos_ou_mais" → 60+. Categoria estranha → null. */
function ageBandOfCategory_(category) {
  var text = toText_(category).toLowerCase();
  if (!text) return null;
  if (/^ate_/.test(text)) return 'age_0_14';
  var match = text.match(/^(\d+)/);
  if (!match) return null;
  var start = Number(match[1]);
  if (start < 15) return 'age_0_14';
  if (start < 30) return 'age_15_29';
  if (start < 45) return 'age_30_44';
  if (start < 60) return 'age_45_59';
  return 'age_60_plus';
}

function profileSnapshotForRa_(raGeoId) {
  var sheet = ss_().getSheetByName('RA_PROFILES');
  if (!sheet) return {};
  var headers = headersOf_(sheet);
  var index = headerIndex_(headers);
  var found = findRowById_(sheet, headers, index, 'ra_geo_id', raGeoId);
  if (!found) return {};
  var r = found.record;
  return {
    population_total: r.population_total || '',
    population_density_km2: r.population_density_km2 || '',
    income_per_capita_brl: r.income_per_capita_brl || '',
    average_age: r.average_age || '',
    female_pct: r.female_pct || '',
    male_pct: r.male_pct || '',
    households_total: r.households_total || '',
    avg_household_size: r.avg_household_size || '',
    dominant_dwelling_type: r.dominant_dwelling_type || '',
    dominant_dwelling_type_pct: r.dominant_dwelling_type_pct || '',
    dominant_tenure: r.dominant_tenure || '',
    dominant_tenure_pct: r.dominant_tenure_pct || '',
    deed_registered_pct: r.deed_registered_pct || '',
    profile_reference_year: r.profile_reference_year || '',
    profile_status: r.profile_status || '',
    quality_flag: r.quality_flag || ''
  };
}

function buildRaDescription_(ra, profile) {
  var parts = ['Região Administrativa ' + ra.ra_code + ' — ' + ra.ra_name + '.'];
  if (!isBlank_(profile.population_total)) parts.push('População: ' + profile.population_total + '.');
  if (!isBlank_(profile.households_total)) parts.push('Domicílios: ' + profile.households_total + '.');
  if (!isBlank_(profile.avg_household_size)) parts.push('Moradores/domicílio: ' + profile.avg_household_size + '.');
  if (!isBlank_(profile.average_age)) parts.push('Idade média: ' + profile.average_age + ' anos.');
  if (!isBlank_(profile.income_per_capita_brl)) parts.push('Renda per capita: R$ ' + profile.income_per_capita_brl + '.');
  if (!isBlank_(profile.dominant_dwelling_type)) parts.push('Tipologia residencial dominante: ' + profile.dominant_dwelling_type + '.');
  if (!isBlank_(profile.dominant_tenure)) parts.push('Ocupação dominante: ' + profile.dominant_tenure + '.');
  return parts.join(' ');
}

/**
 * Grava (ou atualiza) a linha de POLYGONS da RA.
 *
 * O `polygon_id` embute o hash da geometria: mudou o limite oficial, é uma linha NOVA, e
 * a anterior é marcada `inactive` com `geometry_valid_to` preenchido em vez de apagada.
 * Histórico de fronteira administrativa é dado, não lixo.
 */
function upsertAdministrativeRegionPolygon_(ra, kmz) {
  var sheet = ss_().getSheetByName('POLYGONS');
  var headers = headersOf_(sheet);
  var index = headerIndex_(headers);
  var polygonId = 'POLY_RA_' + ('0' + ra.ra_number).slice(-2) + '_' + ra.geometry_hash.slice(0, 12);
  var found = findRowById_(sheet, headers, index, 'polygon_id', polygonId);
  var today = ra.synced_at.slice(0, 10);
  var metrics = polygonMetricsApprox_(ra.geometry);
  var profile = profileSnapshotForRa_(ra.ra_geo_id);
  var properties = {
    ra_geo_id: ra.ra_geo_id,
    ra_code: ra.ra_code,
    ra_number: ra.ra_number,
    ra_name: ra.ra_name,
    official_area_km2: ra.ra_area_km2,
    official_path: ra.ra_path,
    display_simplification_tolerance_deg: ra.simplification_tolerance_deg || '',
    profile: profile
  };
  var values = {
    polygon_id: polygonId,
    name: ra.ra_name,
    category: 'poligonal',
    geometry_geojson: ra.geometry_json,
    color: ra.fill_color,
    description: buildRaDescription_(ra, profile),
    properties_json: JSON.stringify(properties),
    source_url: RA_BOUNDARY_LAYER_URL,
    source_file: kmz && kmz.name ? kmz.name : '',
    imported_at: ra.synced_at,
    status: 'active',
    layer_group: 'administrative_regions',
    subcategory: 'regiao_administrativa',
    ra_geo_id: ra.ra_geo_id,
    centroid_latitude: metrics.centroid_latitude,
    centroid_longitude: metrics.centroid_longitude,
    // A área oficial vence a calculada: a projeção local aqui é aproximação, a do
    // GeoPortal é a medida publicada.
    area_m2: ra.ra_area_km2 !== null ? ra.ra_area_km2 * 1000000 : metrics.area_m2,
    area_ha: ra.ra_area_km2 !== null ? ra.ra_area_km2 * 100 : metrics.area_ha,
    perimeter_m: metrics.perimeter_m,
    fill_color: ra.fill_color,
    stroke_color: '#6E6E6E',
    fill_opacity: 0.28,
    stroke_width: 1.2,
    z_index: '',
    source_page_verified_at: today,
    confidence_flag: 'high_official_geoportal_geometry',
    // Toda geometria chega simplificada (a busca já pede `maxAllowableOffset`), então o
    // rótulo diz isso sempre; a tolerância usada fica em `properties_json`.
    quality_flag: 'official_boundary_simplified_for_sheet',
    entity_type: 'administrative_region',
    entity_id: ra.ra_geo_id,
    geometry_type: ra.geometry.type,
    geometry_role: 'boundary',
    source_geometry_type: ra.geometry.type,
    display_buffer_m: '',
    source_system: 'GeoPortal_SEDUH_DF',
    source_layer_name: 'Regiões Administrativas',
    source_feature_id: ra.source_feature_id,
    source_crs: 'EPSG:4326',
    geometry_hash: ra.geometry_hash,
    geometry_valid_from: today,
    geometry_valid_to: '',
    last_synced_at: ra.synced_at,
    source_geometry_geojson: ra.geometry_json
  };

  if (!found) {
    supersedePolygonsOfEntity_(sheet, index, ra.ra_geo_id, today);
    applyCreate_(sheet, headers, 'polygon_id', polygonId, values);
  } else {
    applyUpdate_(sheet, headers, found.rowNumber, values);
  }
}

/**
 * Marca como `inactive` as linhas ativas de POLYGONS da mesma entidade e fecha a
 * vigência delas. Nada é apagado — a versão anterior da fronteira continua auditável.
 */
function supersedePolygonsOfEntity_(sheet, index, entityId, today) {
  if (index.entity_id === undefined) return;
  dataRowsOf_(sheet).forEach(function (row, i) {
    if (toText_(row[index.entity_id]) !== entityId) return;
    if (index.status !== undefined && toText_(row[index.status]) === 'active') {
      sheet.getRange(i + 2, index.status + 1).setValue('inactive');
    }
    if (index.geometry_valid_to !== undefined && isBlank_(row[index.geometry_valid_to])) {
      sheet.getRange(i + 2, index.geometry_valid_to + 1).setValue(today);
    }
  });
}

function createAdministrativeRegionsKmz_(regions) {
  var kml = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Regioes Administrativas DF</name>'];
  regions.forEach(function (ra) {
    kml.push('<Placemark><name>' + xmlEscape_(ra.ra_name) + '</name><description>' +
      xmlEscape_(ra.ra_code + ' | ' + ra.ra_geo_id) + '</description>' + geoJsonToKmlGeometry_(ra.geometry) + '</Placemark>');
  });
  kml.push('</Document></kml>');
  var kmlBlob = Utilities.newBlob(kml.join(''), 'application/vnd.google-earth.kml+xml', 'Regioes_Administrativas_DF.kml');
  var kmzName = 'Regioes_Administrativas_DF_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Sao_Paulo', 'yyyyMMdd_HHmmss') + '.kmz';
  var kmzBlob = Utilities.zip([kmlBlob], kmzName);
  var file = DriveApp.createFile(kmzBlob);
  return { fileId: file.getId(), url: file.getUrl(), name: file.getName() };
}

function geoJsonToKmlGeometry_(geometry) {
  if (!geometry) return '';
  if (geometry.type === 'Polygon') return polygonCoordinatesToKml_(geometry.coordinates);
  if (geometry.type === 'MultiPolygon') {
    return '<MultiGeometry>' + geometry.coordinates.map(function (poly) {
      return polygonCoordinatesToKml_(poly);
    }).join('') + '</MultiGeometry>';
  }
  return '';
}

function polygonCoordinatesToKml_(coordinates) {
  if (!coordinates || !coordinates.length) return '';
  var outer = coordinates[0] || [];
  var xml = '<Polygon><outerBoundaryIs><LinearRing><coordinates>' + kmlCoordinateString_(outer) +
    '</coordinates></LinearRing></outerBoundaryIs>';
  for (var i = 1; i < coordinates.length; i++) {
    xml += '<innerBoundaryIs><LinearRing><coordinates>' + kmlCoordinateString_(coordinates[i]) +
      '</coordinates></LinearRing></innerBoundaryIs>';
  }
  return xml + '</Polygon>';
}

function kmlCoordinateString_(ring) {
  return (ring || []).map(function (p) { return Number(p[0]) + ',' + Number(p[1]) + ',0'; }).join(' ');
}

function xmlEscape_(value) {
  return toText_(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ---------------------------------------------------------------------------
// Rodovias — sincronização com o eixo oficial do DER/DF
// ---------------------------------------------------------------------------
//
// O DER publica o EIXO do trecho, que é linha. O mapa desenha área, então o corredor
// visual é derivado do eixo por um buffer de alguns metros por lado — e o eixo original
// fica guardado em `source_geometry_geojson`. A rodovia entra em POLYGONS como qualquer
// outro contorno, com `layer_group: 'road_network'`: não existe "camada de rodovia"
// separada, existe um grupo de camada dentro de POLYGONS.

function syncRoadSegmentsFromTraffic_UI() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt(
    'Sincronizar trechos rodoviários DER',
    'Informe o buffer visual por lado, em metros, usado SÓ quando o DER não publica a faixa de domínio do trecho ' +
    '(quando publica, é ela que vira o corredor). O padrão é ' + DEFAULT_ROAD_DISPLAY_BUFFER_M + ' m. A linha oficial é preservada separadamente.',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var text = toText_(response.getResponseText());
  var bufferM = text ? toNumber_(text) : DEFAULT_ROAD_DISPLAY_BUFFER_M;
  if (bufferM === null || bufferM <= 0 || bufferM > MAX_ROAD_DISPLAY_BUFFER_M) {
    ui.alert('Buffer inválido. Use um valor maior que 0 e menor ou igual a ' + MAX_ROAD_DISPLAY_BUFFER_M + ' m.');
    return;
  }
  try {
    var result = syncRoadSegmentsFromTraffic_(bufferM);
    ui.alert(
      'Sincronização concluída',
      result.synced + ' trecho(s) sincronizado(s); ' + result.skipped + ' sem feição oficial; ' +
        result.failed + ' falha(s). Corredor = faixa de domínio do DER por lado; buffer padrão ' + bufferM + ' m quando ausente.',
      ui.ButtonSet.OK
    );
  } catch (error) {
    ui.alert('Falha na sincronização', String(error && error.message ? error.message : error), ui.ButtonSet.OK);
  }
}

function syncRoadSegmentsFromTraffic_(bufferM) {
  var codes = roadCodesFromTraffic_();
  if (!codes.length) throw new Error('TRAFFIC_DAILY_TEST não contém códigos de trecho.');
  if (codes.length > MAX_ROAD_SYNC_CODES) {
    throw new Error('Há ' + codes.length + ' códigos. Limite por sincronização: ' + MAX_ROAD_SYNC_CODES + '.');
  }

  var fetched = [];
  var skippedCodes = [];
  var skipped = 0;
  var failed = 0;
  codes.forEach(function (code) {
    try {
      var record = fetchDerRoadByCode_(code, bufferM);
      if (record) fetched.push(record);
      else { skipped++; skippedCodes.push(code); }
    } catch (error) {
      failed++;
      Logger.log('DER sync %s falhou: %s', code, error && error.message);
    }
  });

  var result = withLock_(function () {
    ensureRoadSchemas_();
    var trafficSummary = trafficSummaryByCode_();
    var synced = 0;
    fetched.forEach(function (road) {
      road.trafficSummary = trafficSummary[road.source_segment_code] || null;
      upsertRoadSegment_(road);
      upsertRoadAlias_(road);
      upsertRoadPolygon_(road, bufferM);
      synced++;
    });
    // Código sem feição oficial NESTA camada: um corredor gravado por versão anterior (que
    // casava a rota inteira por heurística) continuaria ativo e desenhado como se fosse o
    // trecho do posto. Aposentar é o que torna o `skipped` verdadeiro no mapa também.
    var retired = 0;
    skippedCodes.forEach(function (code) { if (retireRoadSegment_(code)) retired++; });
    relateTrafficRowsToRoadSegments_();
    setMeta_('road_sync_status', synced ? ((skipped || failed) ? 'synced_with_warnings' : 'synced') : 'no_official_matches');
    setMeta_('road_sync_last_synced_at', nowISO_());
    // Buffer PADRÃO (fallback); o corredor de cada trecho registra o próprio em
    // `display_buffer_m`, que vem da faixa de domínio do DER quando ela existe.
    setMeta_('road_sync_buffer_m', String(bufferM));
    setMeta_('road_sync_synced_count', String(synced));
    setMeta_('road_sync_skipped_count', String(skipped));
    setMeta_('road_sync_failed_count', String(failed));
    setMeta_('road_sync_retired_count', String(retired));
    if (synced || retired) {
      var version = bumpDatasetVersion_();
      setMeta_('validation_status', 'dirty');
      setMeta_('last_data_change_at', nowISO_());
      refreshMeta();
      clearCache();
      logWriteChange_('POLYGONS', '*', 'der_road_sync', '', synced + ' trecho(s), ' + retired + ' aposentado(s)',
        'sincronizador DER', 'der-road-' + version, 'ok', '');
    }
    return { synced: synced, skipped: skipped, failed: failed, retired: retired };
  });
  if (!result) throw new Error('Não foi possível obter lock de escrita.');
  return result;
}

/** As quatro abas envolvidas são gerenciadas: `null` libera a criação de qualquer coluna. */
function ensureRoadSchemas_() {
  var book = ss_();
  ['POLYGONS', 'ROAD_SEGMENTS', 'ROAD_SEGMENT_ALIASES', 'TRAFFIC_DAILY_TEST'].forEach(function (name) {
    var sheet = book.getSheetByName(name) || book.insertSheet(name);
    ensureHeaders_(sheet, REQUIRED_HEADERS[name], null);
  });
}

function roadCodesFromTraffic_() {
  var sheet = ss_().getSheetByName('TRAFFIC_DAILY_TEST');
  if (!sheet || sheet.getLastRow() < 2) return [];
  var headers = headersOf_(sheet);
  var index = headerIndex_(headers);
  if (index.trecho === undefined) return [];
  var seen = {};
  dataRowsOf_(sheet).forEach(function (row) {
    var code = toText_(row[index.trecho]).toUpperCase();
    if (code) seen[code] = true;
  });
  return Object.keys(seen).sort();
}

/**
 * Casamento EXATO por `cod_distrital` (ou `cod_distrital2`, quando o trecho é coincidente
 * de duas rodovias) na camada "Rodovias 2025" do DER — issue #105. Sem fallback por rota:
 * a versão anterior juntava a DF-001 inteira num corredor só quando o código não casava, e
 * um corredor da rota inteira apresentado como o trecho do posto é exatamente o que a R3.6
 * proíbe. Código que não existe na camada volta `null` e conta como `skipped`, com aviso.
 */
function fetchDerRoadByCode_(code, bufferM) {
  var literal = escapeDerSql_(code);
  var exact = queryDerRoadFeatures_("cod_distrital='" + literal + "' OR cod_distrital2='" + literal + "'");
  if (!exact.length) return null;
  return buildDerRoadRecord_(code, exact, bufferM, {
    quality_flag: 'official_centerline_synced',
    confidence_flag: 'high_official_der_geometry',
  });
}

/**
 * "001EDF0070" -> "DF-001". No código do posto de contagem os três PRIMEIROS dígitos são a
 * rodovia distrital e os quatro últimos o número do trecho (`0070` = km 17,0–17,9 da
 * DF-001, confirmado no campo `rodovia` da camada do DER em 2026-09). A leitura antiga
 * ("os três dígitos depois de DF") tirava DF-007 desse mesmo código — rota errada. Serve só
 * como fallback de `road_code` quando a feição não traz `rodovia`.
 */
function routeCodeFromPostoCode_(code) {
  var match = String(code || '').toUpperCase().match(/^(\d{3})EDF\d+$/);
  return match ? 'DF-' + match[1] : null;
}

/** "DF001" (campo `rodovia` do DER) -> "DF-001"; já hifenado passa intacto. */
function formatRoadCode_(value) {
  var text = toText_(value).toUpperCase().replace(/\s+/g, '');
  var match = text.match(/^([A-Z]{2,3})-?(\d{3})$/);
  return match ? match[1] + '-' + match[2] : text;
}

/**
 * Meio-buffer do corredor: a faixa de domínio publicada pelo DER (média dos dois lados,
 * que na prática são iguais), com teto; sem faixa publicada, o padrão informado no menu.
 */
function derBufferHalfWidthM_(attrs, fallbackM) {
  var right = toNumber_(attrs.fd_direita_larg);
  var left = toNumber_(attrs.fd_esquerda_largu);
  var sides = [right, left].filter(function (v) { return v !== null && v > 0; });
  if (!sides.length) return { meters: fallbackM, source: 'default_buffer' };
  var mean = sides.reduce(function (a, v) { return a + v; }, 0) / sides.length;
  return { meters: Math.min(mean, MAX_ROAD_DISPLAY_BUFFER_M), source: 'der_faixa_de_dominio' };
}

/** Aspas simples são o terminador do literal SQL do ArcGIS: dobrar impede um valor vindo da
 * planilha de virar cláusula `where` de outra pessoa. */
function escapeDerSql_(value) {
  return String(value).replace(/'/g, "''");
}

function queryDerRoadFeatures_(whereClause) {
  var fields = [
    'OBJECTID', 'rodovia', 'cod_distrital', 'cod_distrital2', 'cod_federal', 'coincidente',
    'descricao_inicial', 'descricao_final', 'Km_I', 'Km_F', 'extensao_km', 'TMD',
    'fx_total', 'fx_direita', 'fx_esquerda', 'fd_direita_larg', 'fd_esquerda_largu', 'FD_Grupo',
    'fd_legislacao', 'velocidade_max', 'classe_ctb', 'situacao_fisica', 'tipo_revestimento',
    'administracao', 'circunscricao', 'nome_anterior', 'sigla_estrada_parque'
  ];
  var params = {
    where: whereClause,
    outFields: fields.join(','),
    returnGeometry: 'true',
    returnTrueCurves: 'false',
    outSR: '4326',
    resultRecordCount: String(MAX_ROAD_SYNC_ROUTE_FEATURES),
    f: 'json'
  };
  var response = UrlFetchApp.fetch(DER_ROAD_LAYER_URL + '/query?' + encodeQueryParams_(params), {
    muteHttpExceptions: true,
    followRedirects: true
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('HTTP ' + response.getResponseCode() + ' ao consultar DER.');
  }
  var payload = JSON.parse(response.getContentText('UTF-8'));
  if (payload.error) throw new Error('ArcGIS: ' + (payload.error.message || JSON.stringify(payload.error)));
  return payload.features || [];
}

function buildDerRoadRecord_(code, features, bufferM, flags) {
  var paths = [];
  var objectIds = [];
  features.forEach(function (feature) {
    var geometry = feature.geometry || {};
    (geometry.paths || []).forEach(function (path) { if (path && path.length >= 2) paths.push(path); });
    var oid = derObjectId_(feature.attributes || {});
    if (oid !== '') objectIds.push(oid);
  });
  if (!paths.length) return null;

  var sourceGeometry = paths.length === 1
    ? { type: 'LineString', coordinates: paths[0] }
    : { type: 'MultiLineString', coordinates: paths };
  var sourceValidation = validateGeoJsonSourceGeometry_(sourceGeometry);
  if (!sourceValidation.ok) throw new Error('Eixo inválido para ' + code + ': ' + sourceValidation.message);
  sourceGeometry = sourceValidation.geometry;

  var buffer = derBufferHalfWidthM_(features[0].attributes || {}, bufferM);
  var displayGeometry = bufferLineGeometry_(sourceGeometry, buffer.meters);
  var validation = validateGeoJsonGeometry_(displayGeometry);
  if (!validation.ok) throw new Error('Buffer inválido para ' + code + ': ' + validation.message);

  var attrs0 = features[0].attributes || {};
  var sourceJson = JSON.stringify(sourceGeometry);
  var displayJson = JSON.stringify(validation.geometry);
  var inicio = sanitizePlainText_(attrs0.descricao_inicial);
  var fim = sanitizePlainText_(attrs0.descricao_final);
  return {
    road_segment_id: canonicalRoadSegmentId_(code),
    source_segment_code: code,
    road_name: inicio && fim ? inicio + ' → ' + fim : (inicio || fim),
    road_code: formatRoadCode_(attrs0.rodovia) || routeCodeFromPostoCode_(code) || '',
    segment_type: sanitizePlainText_(attrs0.classe_ctb),
    jurisdiction: sanitizePlainText_(attrs0.circunscricao),
    administration: sanitizePlainText_(attrs0.administracao),
    length_m: lineGeometryLengthM_(sourceGeometry),
    source_feature_id: objectIds.join(','),
    source_geometry: sourceGeometry,
    source_geometry_json: sourceJson,
    display_geometry: validation.geometry,
    display_geometry_json: displayJson,
    display_buffer_m: buffer.meters,
    display_buffer_source: buffer.source,
    geometry_hash: sha256Hex_(sourceJson),
    attributes: attrs0,
    der_attributes: derAttributesForSheet_(attrs0),
    feature_count: features.length,
    synced_at: nowISO_(),
    quality_flag: flags.quality_flag,
    confidence_flag: flags.confidence_flag
  };
}

/** `OBJECTID` na camada Rodovias 2025, `objectid` em serviços mais antigos: aceita os dois. */
function derObjectId_(attrs) {
  var value = attrs.OBJECTID !== undefined && attrs.OBJECTID !== null ? attrs.OBJECTID : attrs.objectid;
  return isBlank_(value) ? '' : String(value);
}

/** Atributos do DER que vão para `properties_json` (trecho e polígono), com nome próprio e tipo. */
function derAttributesForSheet_(attrs) {
  var num = function (v) { var n = toNumber_(v); return n === null ? null : n; };
  var txt = function (v) { return sanitizePlainText_(v); };
  return {
    der_source_layer: 'Rodovias_2025',
    der_feature_id: derObjectId_(attrs),
    der_road: formatRoadCode_(attrs.rodovia),
    der_code: txt(attrs.cod_distrital),
    der_code_secondary: txt(attrs.cod_distrital2),
    der_federal_code: txt(attrs.cod_federal),
    der_coincident: num(attrs.coincidente),
    der_description_start: txt(attrs.descricao_inicial),
    der_description_end: txt(attrs.descricao_final),
    der_km_start: num(attrs.Km_I),
    der_km_end: num(attrs.Km_F),
    der_extension_km: num(attrs.extensao_km),
    // TMD = tráfego médio diário do DER (contagem/estimativa do órgão), referência
    // independente da medição de TRAFFIC_DAILY_TEST.
    der_tmd: num(attrs.TMD),
    der_lanes_total: num(attrs.fx_total),
    der_lanes_right: num(attrs.fx_direita),
    der_lanes_left: num(attrs.fx_esquerda),
    der_fd_right_m: num(attrs.fd_direita_larg),
    der_fd_left_m: num(attrs.fd_esquerda_largu),
    der_fd_group: txt(attrs.FD_Grupo),
    der_fd_legislation: txt(attrs.fd_legislacao),
    der_speed_limit_kmh: num(attrs.velocidade_max),
    der_class_ctb: txt(attrs.classe_ctb),
    der_physical_status: txt(attrs.situacao_fisica),
    der_surface: txt(attrs.tipo_revestimento),
    der_administration: txt(attrs.administracao),
    der_jurisdiction: txt(attrs.circunscricao),
    der_previous_name: txt(attrs.nome_anterior),
    der_park_road_acronym: txt(attrs.sigla_estrada_parque)
  };
}

/**
 * Corredor visual a partir do eixo: desloca cada vértice para os dois lados da normal e
 * fecha o anel. Não é um buffer geodésico de verdade (não arredonda ponta nem resolve
 * auto-interseção); é uma faixa de alguns metros para a linha ficar clicável no mapa. A
 * geometria oficial não é substituída — fica em `source_geometry_geojson`.
 */
function bufferLineGeometry_(geometry, halfWidthM) {
  var lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  var polygons = [];
  lines.forEach(function (line) {
    var ring = bufferOneLine_(line, halfWidthM);
    if (ring && ring.length >= 4) polygons.push([ring]);
  });
  if (!polygons.length) throw new Error('Nenhuma linha válida para buffer.');
  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0] }
    : { type: 'MultiPolygon', coordinates: polygons };
}

function bufferOneLine_(line, halfWidthM) {
  if (!line || line.length < 2) return null;
  var R = 6378137;
  var lon0 = 0;
  var lat0 = 0;
  line.forEach(function (p) { lon0 += Number(p[0]); lat0 += Number(p[1]); });
  lon0 /= line.length;
  lat0 /= line.length;
  var lat0Rad = lat0 * Math.PI / 180;

  function toXY(p) {
    return {
      x: R * (Number(p[0]) - lon0) * Math.PI / 180 * Math.cos(lat0Rad),
      y: R * (Number(p[1]) - lat0) * Math.PI / 180
    };
  }
  function toLonLat(p) {
    return [
      lon0 + (p.x / (R * Math.cos(lat0Rad))) * 180 / Math.PI,
      lat0 + (p.y / R) * 180 / Math.PI
    ];
  }
  function segmentNormal(a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (!len) return { x: 0, y: 0 };
    return { x: -dy / len, y: dx / len };
  }

  var pts = line.map(toXY);
  var segNormals = [];
  for (var i = 0; i < pts.length - 1; i++) segNormals.push(segmentNormal(pts[i], pts[i + 1]));
  var left = [];
  var right = [];
  for (var j = 0; j < pts.length; j++) {
    var normal;
    var scale = halfWidthM;
    if (j === 0) normal = segNormals[0];
    else if (j === pts.length - 1) normal = segNormals[segNormals.length - 1];
    else {
      var n1 = segNormals[j - 1];
      var n2 = segNormals[j];
      var sx = n1.x + n2.x;
      var sy = n1.y + n2.y;
      var sl = Math.sqrt(sx * sx + sy * sy);
      if (sl < 0.000001) normal = n2;
      else {
        normal = { x: sx / sl, y: sy / sl };
        // Curva fechada estica a mitra; o teto de 3x evita a ponta infinita clássica.
        var dot = Math.abs(normal.x * n2.x + normal.y * n2.y);
        if (dot > 0.25) scale = Math.min(halfWidthM / dot, halfWidthM * 3);
      }
    }
    left.push(toLonLat({ x: pts[j].x + normal.x * scale, y: pts[j].y + normal.y * scale }));
    right.push(toLonLat({ x: pts[j].x - normal.x * scale, y: pts[j].y - normal.y * scale }));
  }
  var ring = left.concat(right.reverse());
  ring.push([ring[0][0], ring[0][1]]);
  return ring;
}

function lineGeometryLengthM_(geometry) {
  var lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  var total = 0;
  lines.forEach(function (line) {
    for (var i = 1; i < line.length; i++) total += haversineM_(line[i - 1], line[i]);
  });
  return total;
}

function haversineM_(a, b) {
  var R = 6371008.8;
  var lat1 = Number(a[1]) * Math.PI / 180;
  var lat2 = Number(b[1]) * Math.PI / 180;
  var dLat = lat2 - lat1;
  var dLon = (Number(b[0]) - Number(a[0])) * Math.PI / 180;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Área, perímetro e centroide aproximados, por projeção plana local em torno do próprio
 * anel. Serve para ordenar e rotular no mapa; não substitui medida oficial — quando o
 * GeoPortal publica a área da RA, é ela que vai para `area_m2`.
 *
 * Três limitações que a saída NÃO denuncia sozinha, porque o número sai com a ordem de
 * grandeza certa nos três casos:
 *   1. só o anel EXTERNO entra na conta — polígono com buraco tem a área superestimada;
 *   2. o centroide é a média dos vértices, não o centroide de área, então em forma de L
 *      ele pode cair fora do próprio polígono;
 *   3. o perímetro ignora os anéis internos.
 * Por isso estes campos são de apoio visual, e `docs/DATA_CONTRACT.md` os marca como
 * aproximados. Medida que alguém vá citar tem que vir da fonte oficial.
 */
function polygonMetricsApprox_(geometry) {
  var polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  var area = 0;
  var perimeter = 0;
  var lonWeighted = 0;
  var latWeighted = 0;
  var points = 0;
  polygons.forEach(function (poly) {
    if (!poly || !poly.length) return;
    var ring = poly[0];
    if (!ring || ring.length < 4) return;
    var lon0 = 0;
    var lat0 = 0;
    ring.forEach(function (p) { lon0 += Number(p[0]); lat0 += Number(p[1]); });
    lon0 /= ring.length;
    lat0 /= ring.length;
    var R = 6378137;
    var cosLat = Math.cos(lat0 * Math.PI / 180);
    var xy = ring.map(function (p) {
      return {
        x: R * (Number(p[0]) - lon0) * Math.PI / 180 * cosLat,
        y: R * (Number(p[1]) - lat0) * Math.PI / 180
      };
    });
    var signed = 0;
    for (var i = 1; i < xy.length; i++) {
      signed += xy[i - 1].x * xy[i].y - xy[i].x * xy[i - 1].y;
      perimeter += Math.sqrt(Math.pow(xy[i].x - xy[i - 1].x, 2) + Math.pow(xy[i].y - xy[i - 1].y, 2));
    }
    area += Math.abs(signed) / 2;
    ring.forEach(function (p) { lonWeighted += Number(p[0]); latWeighted += Number(p[1]); points++; });
  });
  return {
    area_m2: area,
    area_ha: area / 10000,
    perimeter_m: perimeter,
    centroid_longitude: points ? lonWeighted / points : null,
    centroid_latitude: points ? latWeighted / points : null
  };
}

function trafficSummaryByCode_() {
  var sheet = ss_().getSheetByName('TRAFFIC_DAILY_TEST');
  if (!sheet || sheet.getLastRow() < 2) return {};
  var headers = headersOf_(sheet);
  var index = headerIndex_(headers);
  if (index.trecho === undefined) return {};
  var out = {};
  dataRowsOf_(sheet).forEach(function (row) {
    var code = toText_(row[index.trecho]).toUpperCase();
    if (!code) return;
    if (!out[code]) out[code] = { rows: 0, rowsWithFlow: 0, sum: 0, minDate: '', maxDate: '', latestFlow: null };
    var obj = out[code];
    obj.rows++;
    var flow = index.fluxo_total === undefined ? null : toNumber_(row[index.fluxo_total]);
    // Linha sem fluxo NÃO entra no denominador da média. Dividir a soma pelo total de
    // linhas devolveria uma média menor e perfeitamente plausível — o tipo de número que
    // ninguém questiona porque tem a ordem de grandeza certa.
    if (flow !== null) { obj.sum += flow; obj.rowsWithFlow++; }
    var date = index.dia === undefined ? '' : sheetDateText_(row[index.dia]);
    if (date && (!obj.minDate || date < obj.minDate)) obj.minDate = date;
    if (date && (!obj.maxDate || date > obj.maxDate)) {
      obj.maxDate = date;
      obj.latestFlow = flow;
    }
  });
  Object.keys(out).forEach(function (code) {
    out[code].avgDailyFlow = out[code].rowsWithFlow ? out[code].sum / out[code].rowsWithFlow : null;
  });
  return out;
}

function sheetDateText_(value) {
  if (isDateValue_(value) && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'America/Sao_Paulo', 'yyyy-MM-dd');
  }
  var text = toText_(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function upsertRoadSegment_(road) {
  var sheet = ss_().getSheetByName('ROAD_SEGMENTS');
  var headers = headersOf_(sheet);
  var index = headerIndex_(headers);
  var found = findRowById_(sheet, headers, index, 'road_segment_id', road.road_segment_id);
  var props = road.der_attributes || {};
  props.source_segment_code = road.source_segment_code;
  props.display_buffer_m_each_side = road.display_buffer_m;
  props.display_buffer_source = road.display_buffer_source;
  props.feature_count = road.feature_count;
  props.traffic_summary = road.trafficSummary || null;
  var values = {
    road_segment_id: road.road_segment_id,
    current_polygon_id: roadPolygonId_(road),
    source_segment_code: road.source_segment_code,
    road_name: road.road_name,
    road_code: road.road_code,
    segment_type: road.segment_type,
    jurisdiction: road.jurisdiction,
    administration: road.administration,
    length_m: road.length_m,
    source_system: 'DER_DF',
    source_layer_name: 'Rodovias 2025 (DER/DF · ArcGIS Hub)',
    source_feature_id: road.source_feature_id,
    source_crs: 'EPSG:4326',
    valid_from: '',
    valid_to: '',
    is_current: true,
    properties_json: JSON.stringify(props),
    // Vem de `fetchDerRoadByCode_` (casamento exato por código). Nunca hardcoded aqui —
    // quem decidiu a precisão foi quem buscou o dado, não quem grava a linha.
    confidence_flag: road.confidence_flag,
    quality_flag: road.quality_flag,
    last_synced_at: road.synced_at
  };
  if (found) applyUpdate_(sheet, headers, found.rowNumber, values);
  else applyCreate_(sheet, headers, 'road_segment_id', road.road_segment_id, values);
}

function upsertRoadAlias_(road) {
  var sheet = ss_().getSheetByName('ROAD_SEGMENT_ALIASES');
  var headers = headersOf_(sheet);
  var index = headerIndex_(headers);
  var aliasId = 'ALIAS_DER_' + road.source_segment_code.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  var found = findRowById_(sheet, headers, index, 'alias_id', aliasId);
  var values = {
    alias_id: aliasId,
    road_segment_id: road.road_segment_id,
    source_segment_code: road.source_segment_code,
    source_system: 'DER_DF',
    valid_from: '',
    valid_to: '',
    match_method: 'official_code',
    match_confidence: 'high',
    source_file: 'ArcGIS REST - Eixo do Trecho Rodoviário',
    notes: 'Relação direta por codtrechorodov.',
    imported_at: road.synced_at
  };
  if (found) applyUpdate_(sheet, headers, found.rowNumber, values);
  else applyCreate_(sheet, headers, 'alias_id', aliasId, values);
}

/**
 * Aposenta o trecho de um código que a camada oficial não conhece mais (issue #105): a
 * linha de ROAD_SEGMENTS deixa de ser vigente (`is_current = false`, `valid_to` = hoje,
 * `current_polygon_id` vazio) e todo polígono ativo da entidade vira `inactive` com
 * `geometry_valid_to`. Nada é apagado — a série de tráfego continua apontando para o
 * `road_segment_id`, só não há mais desenho a apresentar como oficial. Devolve `true`
 * quando havia algo vigente para aposentar.
 */
function retireRoadSegment_(code) {
  var roadSegmentId = canonicalRoadSegmentId_(code);
  if (!roadSegmentId) return false;
  var today = nowISO_().slice(0, 10);
  var touched = false;

  var segments = ss_().getSheetByName('ROAD_SEGMENTS');
  if (segments) {
    var headers = headersOf_(segments);
    var index = headerIndex_(headers);
    var found = findRowById_(segments, headers, index, 'road_segment_id', roadSegmentId);
    if (found && toBoolean_(found.record.is_current) !== false && !isBlank_(found.record.current_polygon_id)) {
      applyUpdate_(segments, headers, found.rowNumber, {
        current_polygon_id: '',
        valid_to: today,
        is_current: false,
        quality_flag: 'no_official_match_in_current_layer',
        confidence_flag: 'none_retired_no_geometry',
        last_synced_at: nowISO_()
      });
      touched = true;
    }
  }

  var polygons = ss_().getSheetByName('POLYGONS');
  if (polygons) {
    var pHeaders = headersOf_(polygons);
    var pIndex = headerIndex_(pHeaders);
    var hadActive = dataRowsOf_(polygons).some(function (row) {
      return pIndex.entity_id !== undefined && pIndex.status !== undefined &&
        toText_(row[pIndex.entity_id]) === roadSegmentId && toText_(row[pIndex.status]) === 'active';
    });
    if (hadActive) {
      supersedePolygonsOfEntity_(polygons, pIndex, roadSegmentId, today);
      touched = true;
    }
  }
  return touched;
}

function roadPolygonId_(road) {
  return 'POLY_ROAD_' + road.source_segment_code.toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_' + road.geometry_hash.slice(0, 12);
}

function upsertRoadPolygon_(road, bufferM) {
  var sheet = ss_().getSheetByName('POLYGONS');
  var headers = headersOf_(sheet);
  var index = headerIndex_(headers);
  var polygonId = roadPolygonId_(road);
  var found = findRowById_(sheet, headers, index, 'polygon_id', polygonId);
  var today = road.synced_at.slice(0, 10);
  var metrics = polygonMetricsApprox_(road.display_geometry);
  var summary = road.trafficSummary || {};
  var halfWidth = road.display_buffer_m === undefined ? bufferM : road.display_buffer_m;
  var properties = {
    road_segment_id: road.road_segment_id,
    source_segment_code: road.source_segment_code,
    road_name: road.road_name,
    road_code: road.road_code,
    segment_type: road.segment_type,
    jurisdiction: road.jurisdiction,
    administration: road.administration,
    length_m: road.length_m,
    traffic_relation_dataset: 'TRAFFIC_DAILY_TEST',
    traffic_daily_rows: summary.rows || 0,
    traffic_date_min: summary.minDate || '',
    traffic_date_max: summary.maxDate || '',
    traffic_avg_daily_flow: summary.avgDailyFlow === undefined ? null : summary.avgDailyFlow,
    traffic_latest_daily_flow: summary.latestFlow === undefined ? null : summary.latestFlow,
    display_buffer_m_each_side: halfWidth,
    display_buffer_source: road.display_buffer_source || 'default_buffer',
    native_source_crs: 'SIRGAS 2000 / UTM 23S (EPSG:31983), exportado em EPSG:4326'
  };
  var der = road.der_attributes || {};
  Object.keys(der).forEach(function (key) { properties[key] = der[key]; });

  var km = der.der_km_start !== null && der.der_km_start !== undefined && der.der_km_end !== null && der.der_km_end !== undefined
    ? ' (km ' + String(der.der_km_start).replace('.', ',') + ' a ' + String(der.der_km_end).replace('.', ',') + ')' : '';
  var descricao = 'Trecho rodoviário DER/DF ' + (road.road_code || road.source_segment_code) + km +
    (road.road_name ? ': ' + road.road_name : '') + '. ' +
    (road.display_buffer_source === 'der_faixa_de_dominio'
      ? 'A área desenhada é a faixa de domínio oficial (' + halfWidth + ' m por lado a partir do eixo).'
      : 'Corredor visual com buffer padrão de ' + halfWidth + ' m por lado a partir do eixo (DER não publica a faixa de domínio deste trecho).') +
    (der.der_tmd !== null && der.der_tmd !== undefined ? ' TMD do DER: ' + der.der_tmd + ' veíc./dia.' : '');

  var values = {
    polygon_id: polygonId,
    name: (road.road_code || road.road_name || road.source_segment_code) + ' · ' + road.source_segment_code,
    category: 'poligonal',
    geometry_geojson: road.display_geometry_json,
    color: '#53606B',
    description: descricao,
    properties_json: JSON.stringify(properties),
    source_url: DER_ROAD_LAYER_URL,
    source_file: '',
    imported_at: road.synced_at,
    status: 'active',
    layer_group: 'road_network',
    subcategory: 'rodovia_der',
    ra_geo_id: '',
    centroid_latitude: metrics.centroid_latitude,
    centroid_longitude: metrics.centroid_longitude,
    area_m2: metrics.area_m2,
    area_ha: metrics.area_ha,
    perimeter_m: metrics.perimeter_m,
    fill_color: '#53606B',
    stroke_color: '#374151',
    fill_opacity: 0.35,
    stroke_width: 1.5,
    z_index: '',
    source_page_verified_at: today,
    // Mesma origem de `upsertRoadSegment_`: reflete se o casamento foi exato ou por rota,
    // nunca hardcoded (R5.7 — precisão que o dado não tem não pode virar texto fixo).
    confidence_flag: road.confidence_flag,
    quality_flag: road.quality_flag,
    entity_type: 'road_segment',
    entity_id: road.road_segment_id,
    geometry_type: road.display_geometry.type,
    geometry_role: 'display_corridor',
    source_geometry_type: road.source_geometry.type,
    display_buffer_m: halfWidth,
    source_system: 'DER_DF',
    source_layer_name: 'Rodovias 2025 (DER/DF · ArcGIS Hub)',
    source_feature_id: road.source_feature_id,
    source_crs: 'EPSG:4326',
    geometry_hash: road.geometry_hash,
    geometry_valid_from: today,
    geometry_valid_to: '',
    last_synced_at: road.synced_at,
    source_geometry_geojson: road.source_geometry_json
  };

  if (!found) {
    supersedePolygonsOfEntity_(sheet, index, road.road_segment_id, today);
    applyCreate_(sheet, headers, 'polygon_id', polygonId, values);
  } else {
    applyUpdate_(sheet, headers, found.rowNumber, values);
  }
}

/** Carimba `road_segment_id` em cada linha de TRAFFIC_DAILY_TEST a partir de `trecho`. */
function relateTrafficRowsToRoadSegments_() {
  var sheet = ss_().getSheetByName('TRAFFIC_DAILY_TEST');
  if (!sheet || sheet.getLastRow() < 2) return 0;
  ensureHeaders_(sheet, REQUIRED_HEADERS.TRAFFIC_DAILY_TEST, null);
  var headers = headersOf_(sheet);
  var index = headerIndex_(headers);
  if (index.trecho === undefined || index.road_segment_id === undefined) return 0;
  var rows = dataRowsOf_(sheet);
  if (!rows.length) return 0;
  var values = rows.map(function (row) {
    return [canonicalRoadSegmentId_(row[index.trecho])];
  });
  sheet.getRange(2, index.road_segment_id + 1, values.length, 1).setValues(values);
  return values.length;
}

// ---------------------------------------------------------------------------
// Endpoint read-only
// ---------------------------------------------------------------------------

/**
 * Web App read-only.
 *
 *   ?resource=health
 *   ?resource=meta
 *   ?resource=dataset&name=LISTINGS
 *
 * Leitura pública, sem autenticação (R4.7). A escrita é um endpoint separado —
 * `doPost`, abaixo — e exige token (R4.9). Os dois nunca compartilham lógica de acesso.
 */
function doGet(e) {
  var params = (e && e.parameter) || {};
  var resource = String(params.resource || 'health');

  try {
    if (resource === 'health') return json_(health_(), params);
    if (resource === 'meta') return json_(meta_(), params);
    if (resource === 'dataset') return json_(dataset_(String(params.name || '')), params);
    if (resource === 'fipezap') return json_(fipezapApi_(params), params);
    return json_({ error: 'recurso desconhecido: ' + resource }, params);
  } catch (error) {
    return json_({ error: String(error && error.message ? error.message : error) }, params);
  }
}

function health_() {
  return {
    status: 'ok',
    app_version: APP_VERSION,
    // Lido pela tela administrativa para detectar implantação desatualizada.
    write_api: WRITE_API_PROTOCOL,
    dataset_version: props_().getProperty('DATASET_VERSION') || '1',
    server_time: nowISO_()
  };
}

/**
 * APP_META como LINHAS, não como objeto achatado.
 *
 * Achatar aqui destruía a evidência de chave duplicada antes de a resposta sair do
 * servidor: um objeto JSON não guarda duas chaves iguais, e a última linha vencia —
 * justamente a duplicata antiga. Com `validation_status = error` na primeira linha e
 * `ok` numa duplicata abaixo, o cliente recebia `ok` e não tinha como saber.
 *
 * Devolvendo as linhas cruas, as duas estratégias de leitura (GViz e Apps Script)
 * passam pelo mesmo normalizador no cliente e tratam conflito do mesmo jeito.
 * `updated_at`, que também se perdia no achatamento, chega junto.
 */
function meta_() {
  var sheet = ss_().getSheetByName(META_SHEET);
  var rows = [];

  dataRowsOf_(sheet).forEach(function (row) {
    var key = String(row[0]).trim();
    if (!key || isSecretMetaKey_(key)) return;
    rows.push({ key: key, value: row[1], updated_at: row[2] });
  });

  return { rows: rows, count: rows.length };
}

/**
 * Uma aba, como lista de objetos.
 *
 * O nome pedido é conferido contra a allowlist, e não usado direto: sem isso, o
 * parâmetro serviria para ler qualquer aba da planilha, inclusive uma que alguém
 * tenha criado achando que "escondida" significa "privada" (R4.3, R4.7).
 */
function dataset_(name) {
  if (ALLOWED_DATASETS.indexOf(name) === -1) {
    return { error: 'dataset não permitido' };
  }

  var cache = CacheService.getScriptCache();
  var cacheKey = 'dataset_' + name;
  var cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (err) { /* cache corrompido: recarrega */ }
  }

  var sheet = ss_().getSheetByName(name);
  if (!sheet) return { error: 'aba ausente', name: name, rows: [] };

  var headers = headersOf_(sheet);
  var rows = dataRowsOf_(sheet).map(function (row) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) {
      if (headers[i]) obj[headers[i]] = row[i];
    }
    return obj;
  });

  var payload = {
    name: name,
    dataset_version: props_().getProperty('DATASET_VERSION') || '1',
    count: rows.length,
    rows: rows
  };

  // O cache tem teto de 100 KB por chave; payload maior simplesmente não é cacheado.
  try { cache.put(cacheKey, JSON.stringify(payload), 300); } catch (err) { /* excede o teto */ }
  return payload;
}

// ---------------------------------------------------------------------------
// Endpoint de escrita (admin) — R4.9
// ---------------------------------------------------------------------------

/**
 * Web App de escrita — token direto em toda chamada, sem sessão (issue #5, mesmo
 * racional já usado no Web App de tipolis-sandbox/press-research-communications:
 * frontend estático público + Apps Script atrás de um bearer token único). O token
 * nunca é hardcoded no cliente; é digitado uma vez no `admin.html`, guardado só em
 * `sessionStorage`, e reenviado em toda requisição — igual ao Press Monitor.
 *
 *   {
 *     token: "...",                  // obrigatório em toda requisição, comparado a ADMIN_TOKEN
 *     action: "validate"|"create"|"update"|"delete",
 *     sheet: "LISTINGS",             // create/update/delete
 *     id: "...",                     // obrigatório em create/update/delete
 *     expected_version: "7",         // obrigatório em update/delete (DATASET_VERSION observado)
 *     fields: { ... },               // create/update, só campos da allowlist
 *     editor: "Nome de quem edita",  // autodeclarado; a identidade Google, quando disponível, tem prioridade
 *     correlation_id: "..."          // opcional, gerado pelo cliente; ecoado na resposta e no CHANGE_LOG
 *   }
 *
 * `action: "validate"` não lê nem escreve nada — só confirma que o token é válido,
 * para a tela de login poder dar feedback imediato sem uma escrita real.
 *
 * Resposta: { ok: true, record: {...}, dataset_version: "N", correlation_id } ou
 * { ok: false, error: { code, message }, correlation_id }, com `code` em
 * UNAUTHENTICATED, INVALID_PAYLOAD, UNKNOWN_SHEET, UNKNOWN_FIELD, NOT_FOUND,
 * VERSION_CONFLICT, VALIDATION_ERROR ou INTERNAL_ERROR.
 *
 * Sem ADMIN_TOKEN configurado em Script Properties, toda escrita é recusada — não
 * existe modo aberto (R4.9, que supera a restrição anterior de R4.7: o endpoint só
 * deixa de ser read-only sob autenticação obrigatória). Rotação: trocar o valor de
 * `ADMIN_TOKEN` invalida o token antigo na próxima chamada — a checagem é sempre ao
 * vivo contra Script Properties, nunca cacheada numa sessão.
 */
function doPost(e) {
  var params;
  try {
    params = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return errorResponse_('INVALID_PAYLOAD', 'Corpo da requisição não é JSON válido.');
  }

  try {
    if (!authenticate_(params)) {
      return errorResponse_('UNAUTHENTICATED', 'Token ausente ou inválido.');
    }

    var normalized = normalizeWriteRequest_(params);
    if (!normalized.ok) {
      var earlyError = withLock_(function () {
        return writeError_(normalized.sheet || '', toText_(params.id), toText_(params.correlation_id),
          params.editor, normalized.error.code, normalized.error.message);
      });
      return earlyError || errorResponse_(normalized.error.code, normalized.error.message, params.correlation_id);
    }
    params.action = normalized.action;
    params.sheet = normalized.sheet;

    var action = normalized.action;
    if (action === 'validate') return successResponse_({ valid: true }, props_().getProperty('DATASET_VERSION') || '1');

    var sheetName = normalized.sheet;
    if (!WRITE_ALLOWLIST[sheetName]) {
      var unknownSheet = withLock_(function () {
        return writeError_(sheetName, toText_(params.id), toText_(params.correlation_id), params.editor,
          'UNKNOWN_SHEET', 'Aba não permitida para escrita: ' + sheetName);
      });
      return unknownSheet || errorResponse_('UNKNOWN_SHEET', 'Aba não permitida para escrita: ' + sheetName,
        params.correlation_id);
    }

    var result = withLock_(function () {
      // A versão observada ANTES de qualquer provisionamento de schema. `ensureWriteSheetSchema_`
      // pode criar coluna e, ao criar, incrementa DATASET_VERSION — e aí o `expected_version`
      // que o cliente leu antes de enviar perderia para um incremento causado pela própria
      // requisição, devolvendo VERSION_CONFLICT em toda primeira escrita depois de uma
      // migração de schema. Concorrência otimista existe para detectar mudança de DADO feita
      // por outra pessoa, não mudança de schema provocada por mim mesmo (R8.17).
      var versionBeforeSchema = props_().getProperty('DATASET_VERSION') || '1';

      var schema = ensureWriteSheetSchema_(sheetName);
      if (!schema.ok) {
        return writeError_(sheetName, toText_(params.id), toText_(params.correlation_id), params.editor,
          schema.error.code, schema.error.message);
      }
      return doWrite_(sheetName, action, params, versionBeforeSchema);
    });
    return result || errorResponse_('INTERNAL_ERROR', 'Não foi possível obter lock; tente novamente.');
  } catch (error) {
    return errorResponse_('INTERNAL_ERROR', String(error && error.message ? error.message : error));
  }
}

/** Aceita o contrato atual e o alias futuro resource/entity/method sem quebrar o frontend existente. */
function normalizeWriteRequest_(params) {
  var resource = toText_(params.resource);
  if (resource && resource !== 'write') {
    return { ok: false, sheet: '', error: { code: 'INVALID_PAYLOAD', message: 'resource deve ser write.' } };
  }
  var action = toText_(params.action || params.method).toLowerCase();
  var sheet = toText_(params.sheet || params.entity).toUpperCase();
  if (action === 'validate') return { ok: true, action: action, sheet: '' };
  if (['create', 'update', 'delete'].indexOf(action) === -1) {
    return {
      ok: false,
      sheet: sheet,
      error: { code: 'INVALID_PAYLOAD', message: 'action/method deve ser validate, create, update ou delete.' }
    };
  }
  if (!sheet) {
    return { ok: false, sheet: '', error: { code: 'INVALID_PAYLOAD', message: 'sheet/entity é obrigatório.' } };
  }
  return { ok: true, action: action, sheet: sheet };
}

/** Garante as colunas de escrita de modo aditivo. Aba obrigatória ausente nunca é criada em silêncio. */
function ensureWriteSheetSchema_(sheetName) {
  var book = ss_();
  var sheet = book.getSheetByName(sheetName);
  if (!sheet && sheetName === 'POLYGONS') sheet = book.insertSheet('POLYGONS');
  if (!sheet) {
    return { ok: false, error: { code: 'UNKNOWN_SHEET', message: 'Aba ausente na planilha: ' + sheetName } };
  }
  // Mesma restrição do setupProject(): na escrita, provisionar cabeçalho não previsto
  // seria ainda pior, porque acontece sem ninguém olhando o relatório.
  var allowed = MANAGED_EXTENSION_SHEETS.indexOf(sheetName) === -1
    ? (PROVISIONABLE_COLUMNS[sheetName] || [])
    : null;
  var added = ensureHeaders_(sheet, REQUIRED_HEADERS[sheetName] || [], allowed).added;
  if (added.length) {
    bumpDatasetVersion_();
    setMeta_('validation_status', 'dirty');
    setMeta_('last_data_change_at', nowISO_());
    clearCache();
  }
  return { ok: true, sheet: sheet, addedHeaders: added };
}

/** Token do payload contra ADMIN_TOKEN em Script Properties. Sem token configurado, nunca autentica. */
function authenticate_(params) {
  var expected = props_().getProperty('ADMIN_TOKEN');
  if (!expected) return false;
  var provided = params && params.token ? String(params.token) : '';
  return provided !== '' && provided === expected;
}

/**
 * Gera um novo ADMIN_TOKEN e grava em Script Properties — mesma propriedade que
 * `authenticate_()` lê, sem sessão intermediária (R4.9). Atalho pelo menu para o passo
 * manual já documentado em docs/SHEET_SETUP.md §8 (Configurações do projeto →
 * Propriedades do Script). Gerar um token novo invalida o anterior imediatamente, na
 * próxima chamada — a checagem é sempre ao vivo, nunca cacheada (ver `authenticate_`).
 */
function configureAdminToken() {
  var token = 'imob-' + Utilities.getUuid().replace(/-/g, '');
  props_().setProperty('ADMIN_TOKEN', token);
  setMeta_('admin_token_rotated_at', nowISO_());

  var message = 'Token gerado. Copie e guarde agora em local seguro — ele não será ' +
    'mostrado de novo (mas pode ser rotacionado a qualquer momento por este menu):\n\n' + token;
  Logger.log('ADMIN_TOKEN rotacionado em %s', nowISO_());
  notify_('Token de administração', message);
  return token;
}

/**
 * Orquestra create/update/delete para uma aba já validada contra a allowlist.
 *
 * `versionBeforeSchema` é a DATASET_VERSION lida no início da requisição, antes de
 * `ensureWriteSheetSchema_()` poder ter incrementado por provisionar coluna nova. É
 * contra ela que a concorrência otimista compara — ver R8.17.
 */
function doWrite_(sheetName, action, params, versionBeforeSchema) {
  var sheet = ss_().getSheetByName(sheetName);
  var correlationId = toText_(params.correlation_id);
  var editor = params.editor;
  var id = toText_(params.id);

  if (!sheet) return writeError_(sheetName, id, correlationId, editor, 'UNKNOWN_SHEET', 'Aba ausente na planilha: ' + sheetName);

  var headers = headersOf_(sheet);
  var index = headerIndex_(headers);
  var idField = ID_FIELD[sheetName];

  if (action === 'create') {
    if (sheetName === 'POLYGONS') id = 'POLY_' + Utilities.getUuid().replace(/-/g, '');
    if (!id) return writeError_(sheetName, id, correlationId, editor, 'INVALID_PAYLOAD', 'id é obrigatório para create.');

    var validatedCreate = validateWritePayload_(sheetName, 'create', params.fields || {});
    if (!validatedCreate.ok) {
      return writeError_(sheetName, id, correlationId, editor, validatedCreate.error.code, validatedCreate.error.message);
    }
    if (sheetName === 'POLYGONS') {
      if (!validatedCreate.fields.status) validatedCreate.fields.status = 'active';
      validatedCreate.fields.imported_at = nowISO_();
      validatedCreate.fields.source_file = '';
    }
    applyDerivedFields_(sheetName, validatedCreate.fields, null);

    if (findRowById_(sheet, headers, index, idField, id)) {
      return writeError_(sheetName, id, correlationId, editor, 'VALIDATION_ERROR', 'Já existe um registro com este id: ' + id);
    }

    var created = applyCreate_(sheet, headers, idField, id, validatedCreate.fields);
    return finishWrite_(sheetName, id, [
      { field: '*', oldValue: '', newValue: JSON.stringify(validatedCreate.fields) }
    ], editor, correlationId, created);
  }

  if (!id) return writeError_(sheetName, id, correlationId, editor, 'INVALID_PAYLOAD', 'id é obrigatório.');

  var found = findRowById_(sheet, headers, index, idField, id);
  if (!found) return writeError_(sheetName, id, correlationId, editor, 'NOT_FOUND', 'Registro não encontrado: ' + id);

  var conflict = checkVersionConflict_(params.expected_version, versionBeforeSchema);
  if (conflict) return writeError_(sheetName, id, correlationId, editor, conflict.code, conflict.message);

  if (action === 'delete') {
    sheet.deleteRow(found.rowNumber);
    return finishWrite_(sheetName, id, [
      { field: '*', oldValue: JSON.stringify(found.record), newValue: '' }
    ], editor, correlationId, { id: id });
  }

  // update
  var validatedUpdate = validateWritePayload_(sheetName, 'update', params.fields || {});
  if (!validatedUpdate.ok) {
    return writeError_(sheetName, id, correlationId, editor, validatedUpdate.error.code, validatedUpdate.error.message);
  }
  applyDerivedFields_(sheetName, validatedUpdate.fields, found.record);

  var changes = applyUpdate_(sheet, headers, found.rowNumber, validatedUpdate.fields);
  if (changes.length === 0) {
    return writeError_(sheetName, id, correlationId, editor, 'INVALID_PAYLOAD', 'Nenhum campo mudou de valor.');
  }

  var updated = readRecord_(sheet, headers, found.rowNumber);
  return finishWrite_(sheetName, id, changes, editor, correlationId, updated);
}

/**
 * Registra no CHANGE_LOG uma tentativa de escrita que passou da autenticação mas foi
 * recusada (payload inválido, conflito de versão, registro não encontrado etc.) e
 * devolve a resposta de erro. Só aqui, depois de `authenticate_` já ter aceitado o
 * token — falha de autenticação nunca chega a este ponto, então não vira ruído de
 * tentativa de força bruta no log operacional (issue #5: log cobre "resultado" e
 * "motivo de erro" das operações de escrita, não das tentativas de login).
 */
function writeError_(sheetName, id, correlationId, editor, code, message) {
  logWriteChange_(sheetName, id, '*', '', '', editor, correlationId, 'error', code + (message ? ': ' + message : ''));
  return errorResponse_(code, message, correlationId);
}

/** Bump de versão, log de auditoria por campo, metadados dirty e invalidação de cache. */
function finishWrite_(sheetName, id, changes, editor, correlationId, record) {
  var version = bumpDatasetVersion_();
  changes.forEach(function (change) {
    logWriteChange_(sheetName, id, change.field, change.oldValue, change.newValue, editor, correlationId, 'ok', '');
  });
  setMeta_('validation_status', 'dirty');
  setMeta_('last_data_change_at', nowISO_());
  clearCache();
  return successResponse_(record, version, correlationId, id);
}

/**
 * Compara `expected_version` do payload contra o DATASET_VERSION atual.
 *
 * Concorrência otimista de granularidade grosseira (todo o dataset, não por registro):
 * mais simples, sem mudança de schema, aceitável para o volume de edição concorrente
 * esperado numa ferramenta interna (ver plano da PR). Devolve `{code, message}` do
 * erro, ou `null` quando não há conflito — quem chama decide como responder/logar.
 */
function checkVersionConflict_(expectedVersion, baselineVersion) {
  // Sem baseline explícita, a versão corrente é a referência — é o caso de qualquer
  // chamada que não tenha passado por provisionamento de schema.
  var current = baselineVersion === undefined || baselineVersion === null || baselineVersion === ''
    ? (props_().getProperty('DATASET_VERSION') || '1')
    : String(baselineVersion);
  var expected = expectedVersion === undefined || expectedVersion === null ? '' : String(expectedVersion);

  if (expected === '') {
    return { code: 'INVALID_PAYLOAD', message: 'expected_version é obrigatório para update e delete.' };
  }
  if (expected !== current) {
    return {
      code: 'VERSION_CONFLICT',
      message: 'O dataset mudou desde que este registro foi carregado (versão atual: ' + current + ').'
    };
  }
  return null;
}

/**
 * Valida e coage `fields` contra a allowlist/schema da aba.
 *
 * Campo fora da allowlist é UNKNOWN_FIELD — é assim que `asking_price_brl_m2` (campo
 * derivado) é recusado quando submetido diretamente: ele nunca entra em
 * WRITE_ALLOWLIST, só é calculado aqui a partir de asking_price_brl/area_m2 quando os
 * dois estão presentes no payload.
 */
function validateWritePayload_(sheetName, action, fields) {
  var allowlist = WRITE_ALLOWLIST[sheetName] || [];
  var schema = FIELD_SCHEMA[sheetName] || {};

  if (!fields || typeof fields !== 'object') {
    return { ok: false, error: { code: 'INVALID_PAYLOAD', message: 'fields deve ser um objeto.' } };
  }

  var unknown = Object.keys(fields).filter(function (f) { return allowlist.indexOf(f) === -1; });
  if (unknown.length > 0) {
    return { ok: false, error: { code: 'UNKNOWN_FIELD', message: 'Campo(s) não editável(is): ' + unknown.join(', ') } };
  }

  if (action === 'create') {
    var required = REQUIRED_FOR_CREATE[sheetName] || [];
    var missing = required.filter(function (f) {
      return fields[f] === undefined || fields[f] === null || String(fields[f]).trim() === '';
    });
    if (missing.length > 0) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Campo(s) obrigatório(s) ausente(s): ' + missing.join(', ') }
      };
    }
  }

  var coerced = {};
  for (var i = 0; i < allowlist.length; i++) {
    var field = allowlist[i];
    if (!(field in fields)) continue;

    var coercedField = coerceField_(schema[field] || 'text', fields[field]);
    if (!coercedField.ok) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: field + ': ' + coercedField.message } };
    }
    coerced[field] = coercedField.value;
  }

  return { ok: true, fields: coerced };
}

/**
 * Recalcula o campo de preço/m² derivado da aba (ver DERIVED_PRICE_M2_FIELD) quando o
 * payload muda o preço e/ou a área-fonte, combinando o valor submetido com o valor
 * atual da linha para o campo que não mudou. ANCHORS não tem entrada no mapa — a
 * função não faz nada para essa aba.
 *
 * Em `create`, `currentRecord` é `null` e ambos os campos-fonte já são obrigatórios
 * (REQUIRED_FOR_CREATE em LISTINGS; em DEVELOPMENTS nenhum dos dois é obrigatório, e
 * o derivado simplesmente fica ausente até que preço e área sejam informados). Em
 * `update`, um payload que só muda a área precisa do preço que já está na planilha —
 * sem isso, mudar só a área deixaria o preço/m² desatualizado até a manutenção
 * periódica passar (que hoje só recalcula LISTINGS — ver Pendências desta PR).
 */
function applyDerivedFields_(sheetName, fields, currentRecord) {
  applyClassificationDerivations_(sheetName, fields, currentRecord);

  var config = DERIVED_PRICE_M2_FIELD[sheetName];
  if (!config) return;

  var touchesPrice = config.price in fields;
  var touchesArea = config.area in fields;
  if (!touchesPrice && !touchesArea) return;

  var price = touchesPrice ? fields[config.price]
    : (currentRecord ? toNumber_(currentRecord[config.price]) : null);
  var area = touchesArea ? fields[config.area]
    : (currentRecord ? toNumber_(currentRecord[config.area]) : null);
  if (price === null || area === null) return;

  fields[config.target] = pricePerM2_(price, area);
}

/**
 * Deriva `sales_stage` (DEVELOPMENTS) e `group`/`segment` (ANCHORS) no caminho de
 * escrita, não só no `setupProject()`.
 *
 * Sem isto, um create pelo admin com esses campos omitidos gravava a linha com as
 * células vazias — e a âncora nascia FORA dos filtros de grupo e segmento, invisível
 * para quem usa a legenda. Pior no update: mudar `category` de "Mobilidade" para
 * "Saúde" mantinha `segment: 'estacao_metro'`, uma classificação que passou a ser
 * mentira sobre o próprio registro.
 *
 * Valor explicitamente informado sempre vence — a mesma regra do provisionamento e do
 * gerador de demo. Só a célula que ficaria vazia é preenchida.
 */
function applyClassificationDerivations_(sheetName, fields, currentRecord) {
  var informed = function (field) {
    return field in fields && toText_(fields[field]) !== '';
  };
  // Valor de entrada de um campo: o que veio na requisição, senão o que já está na linha.
  var incoming = function (field) {
    if (field in fields) return fields[field];
    return currentRecord ? currentRecord[field] : '';
  };

  if (sheetName === 'DEVELOPMENTS' && !informed('sales_stage')) {
    var stage = inferSalesStage_(incoming('status'));
    if (stage) fields.sales_stage = stage;
  }

  if (sheetName === 'ANCHORS') {
    if (!informed('group')) {
      var group = inferAnchorGroup_(incoming('category'));
      if (group) fields.group = group;
    }
    if (!informed('segment')) {
      var segment = inferAnchorSegment_(incoming('category'), incoming('subcategory'), incoming('name'));
      if (segment) fields.segment = segment;
    }
  }
}

/**
 * Preço por m², calculado no servidor. Espelha pricePerM2() de src/normalize.js na
 * direção "sem valor informado": aqui o valor informado nunca existe, porque o campo
 * é sempre derivado na escrita — mudou lá, muda aqui.
 */
function pricePerM2_(price, area) {
  if (price === null || area === null || area <= 0 || price <= 0) return null;
  return price / area;
}

/** Coage e valida um valor bruto conforme o tipo declarado em FIELD_SCHEMA. */
function coerceField_(type, raw) {
  if (type === 'geojson') return validateGeoJsonGeometry_(raw);
  // A geometria-FONTE pode ser linha (eixo rodoviário do DER). Ela é preservada como
  // procedência e nunca desenhada — quem vai ao mapa é `geometry_geojson`.
  if (type === 'geojson_source') return validateGeoJsonSourceGeometry_(raw);
  if (type === 'json_object') return validateJsonObject_(raw);

  var text = toText_(raw);
  if (text.length > MAX_CELL_TEXT_LENGTH) {
    return { ok: false, message: 'texto excede o limite seguro de ' + MAX_CELL_TEXT_LENGTH + ' caracteres.' };
  }

  if (type === 'text') return { ok: true, value: text };

  if (type === 'url') {
    if (text !== '' && !isValidUrl_(text)) return { ok: false, message: 'URL inválida.' };
    return { ok: true, value: text };
  }

  if (type === 'date') {
    if (text !== '' && !isISODate_(raw)) {
      return { ok: false, message: 'data deve ser uma data real em YYYY-MM-DD.' };
    }
    return { ok: true, value: isDateValue_(raw) ? raw.toISOString().slice(0, 10) : text };
  }

  if (type === 'number' || type === 'int') {
    if (text === '') return { ok: true, value: null };
    var n = toNumber_(raw);
    if (n === null) return { ok: false, message: 'não é um número válido.' };
    return { ok: true, value: type === 'int' ? Math.trunc(n) : n };
  }

  if (type === 'bool') {
    if (typeof raw === 'boolean') return { ok: true, value: raw };
    var boolText = text.toLowerCase();
    if (['1', 'true', 'sim', 'yes', 'y', 'x', 'verdadeiro'].indexOf(boolText) !== -1) {
      return { ok: true, value: true };
    }
    if (['0', 'false', 'nao', 'não', 'no', 'n', 'falso'].indexOf(boolText) !== -1) {
      return { ok: true, value: false };
    }
    return { ok: false, message: 'não é um booleano válido.' };
  }

  if (type.indexOf('enum:') === 0) {
    var values = ENUM_VALUES[type.slice(5)] || [];
    if (text !== '' && values.indexOf(text) === -1) {
      return { ok: false, message: 'valor fora do vocabulário permitido (' + values.join(', ') + ').' };
    }
    return { ok: true, value: text };
  }

  return { ok: true, value: text };
}

function parseJsonValue_(raw) {
  if (raw && typeof raw === 'object') return { ok: true, value: raw };
  var text = toText_(raw);
  if (!text) return { ok: false, message: 'JSON vazio.' };
  try { return { ok: true, value: JSON.parse(text) }; }
  catch (err) { return { ok: false, message: 'JSON inválido: ' + err.message }; }
}

function validateJsonObject_(raw) {
  if (isBlank_(raw)) return { ok: true, value: '' };
  var parsed = parseJsonValue_(raw);
  if (!parsed.ok) return parsed;
  if (!parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
    return { ok: false, message: 'deve ser um objeto JSON.' };
  }
  var serialized = JSON.stringify(parsed.value);
  if (serialized.length > MAX_CELL_TEXT_LENGTH) {
    return { ok: false, message: 'JSON excede o limite da célula.' };
  }
  return { ok: true, value: serialized };
}

/** Valida e normaliza Polygon/MultiPolygon GeoJSON; a ordem é sempre [longitude, latitude]. */
function validateGeoJsonGeometry_(raw) {
  var parsed = parseJsonValue_(raw);
  if (!parsed.ok) return parsed;
  var geometry = parsed.value;
  if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) {
    return { ok: false, message: 'geometry_geojson deve ser Polygon ou MultiPolygon.' };
  }

  var canonical = { type: geometry.type, coordinates: [] };
  var positionCount = { value: 0 };
  var polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons) || polygons.length === 0) {
    return { ok: false, message: 'coordinates deve conter ao menos um polígono.' };
  }

  for (var p = 0; p < polygons.length; p++) {
    var polygonResult = validateGeoJsonPolygon_(polygons[p], positionCount);
    if (!polygonResult.ok) return polygonResult;
    if (geometry.type === 'Polygon') canonical.coordinates = polygonResult.value;
    else canonical.coordinates.push(polygonResult.value);
  }

  var serialized = JSON.stringify(canonical);
  if (serialized.length > MAX_CELL_TEXT_LENGTH) {
    return { ok: false, message: 'geometria excede o limite de uma célula do Google Sheets.' };
  }
  return { ok: true, value: serialized, geometry: canonical, position_count: positionCount.value };
}

/**
 * Valida a geometria-FONTE, que pode ser linha.
 *
 * Existe separada de `validateGeoJsonGeometry_` porque as duas respondem perguntas
 * diferentes: aquela valida o que vai ser DESENHADO (sempre área fechada), esta valida o
 * que é guardado como PROCEDÊNCIA. O eixo rodoviário do DER é LineString e continua
 * sendo linha na coluna `source_geometry_geojson` — o polígono no mapa é o corredor com
 * buffer, derivado dela. Aceitar linha em `geometry_geojson` seria desenhar uma
 * geometria que o cliente não sabe desenhar; recusá-la aqui perderia a origem oficial.
 */
function validateGeoJsonSourceGeometry_(raw) {
  var parsed = parseJsonValue_(raw);
  if (!parsed.ok) return parsed;
  var geometry = parsed.value;
  if (!geometry || ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'].indexOf(geometry.type) === -1) {
    return { ok: false, message: 'geometria-fonte deve ser Polygon, MultiPolygon, LineString ou MultiLineString.' };
  }
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') return validateGeoJsonGeometry_(geometry);

  var lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(lines) || !lines.length) return { ok: false, message: 'linha sem coordenadas.' };
  var out = [];
  for (var l = 0; l < lines.length; l++) {
    var line = lines[l];
    if (!Array.isArray(line) || line.length < 2) return { ok: false, message: 'cada linha precisa de ao menos duas posições.' };
    var normalized = [];
    for (var i = 0; i < line.length; i++) {
      var pos = line[i];
      if (!Array.isArray(pos) || pos.length < 2) return { ok: false, message: 'posição inválida; esperado [longitude, latitude].' };
      // Mesma guarda de `validateGeoJsonPolygon_`: `Number(null)` e `Number('')` são 0, e
      // 0 passa em isFinite e na faixa válida. Sem isto uma linha de coordenadas ausentes
      // vira geografia real no golfo da Guiné, agora pela porta da geometria-fonte.
      if (!isNumericPosition_(pos[0]) || !isNumericPosition_(pos[1])) {
        return { ok: false, message: 'longitude/latitude precisa ser numérica; valor vazio ou nulo não é aceito.' };
      }
      var lon = Number(pos[0]);
      var lat = Number(pos[1]);
      if (!isFinite(lon) || !isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
        return { ok: false, message: 'longitude/latitude fora da faixa válida.' };
      }
      normalized.push([lon, lat]);
    }
    out.push(normalized);
  }
  var canonical = geometry.type === 'LineString'
    ? { type: 'LineString', coordinates: out[0] }
    : { type: 'MultiLineString', coordinates: out };
  var serialized = JSON.stringify(canonical);
  if (serialized.length > MAX_CELL_TEXT_LENGTH) return { ok: false, message: 'geometria-fonte excede o limite da célula.' };
  return { ok: true, value: serialized, geometry: canonical };
}

/**
 * `true` só para número finito ou string que representa um número. Recusa
 * `null`, `undefined`, `''`, `'  '`, `true`/`false`, array e objeto — tudo que
 * `Number()` converteria em 0 ou NaN sem reclamar.
 */
function isNumericPosition_(value) {
  if (typeof value === 'number') return isFinite(value);
  if (typeof value !== 'string') return false;
  var trimmed = value.trim();
  if (!trimmed) return false;
  return isFinite(Number(trimmed));
}

function validateGeoJsonPolygon_(rings, positionCount) {
  if (!Array.isArray(rings) || rings.length === 0) {
    return { ok: false, message: 'Polygon deve conter ao menos um anel.' };
  }
  var out = [];
  for (var r = 0; r < rings.length; r++) {
    var ring = rings[r];
    if (!Array.isArray(ring) || ring.length < 4) {
      return { ok: false, message: 'cada anel deve conter ao menos quatro posições.' };
    }
    var normalizedRing = [];
    var unique = {};
    for (var i = 0; i < ring.length; i++) {
      var position = ring[i];
      if (!Array.isArray(position) || position.length < 2) {
        return { ok: false, message: 'posição inválida; esperado [longitude, latitude].' };
      }
      // `Number(null)`, `Number('')` e `Number(false)` são todos 0 — e 0 passa em
      // `isFinite` e na faixa válida. Sem esta checagem, um anel de coordenadas ausentes
      // vira um polígono perfeitamente válido perto de [0, 0], no golfo da Guiné, e é
      // PERSISTIDO como se fosse geografia real. Coordenada tem que ser número mesmo,
      // ou string numérica não vazia.
      if (!isNumericPosition_(position[0]) || !isNumericPosition_(position[1])) {
        return { ok: false, message: 'longitude/latitude precisa ser numérica; valor vazio ou nulo não é aceito.' };
      }
      var lon = Number(position[0]);
      var lat = Number(position[1]);
      if (!isFinite(lon) || !isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
        return { ok: false, message: 'longitude/latitude fora da faixa válida.' };
      }
      normalizedRing.push([lon, lat]);
      unique[lon + '|' + lat] = true;
      positionCount.value++;
    }
    if (Object.keys(unique).length < 3) {
      return { ok: false, message: 'anel precisa de ao menos três posições distintas.' };
    }
    var first = normalizedRing[0];
    var last = normalizedRing[normalizedRing.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      return { ok: false, message: 'anel GeoJSON deve estar fechado (primeira posição igual à última).' };
    }
    out.push(normalizedRing);
  }
  return { ok: true, value: out };
}

/** Busca um registro pelo ID, nunca por posição de linha. `null` quando não encontrado. */
function findRowById_(sheet, headers, index, idField, id) {
  if (!idField || index[idField] === undefined) return null;

  var rows = dataRowsOf_(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][index[idField]] || '').trim() === id) {
      return { rowNumber: i + 2, record: rowToRecord_(headers, rows[i]) };
    }
  }
  return null;
}

/** Linha bruta (array) para objeto `{header: valor}`. */
function rowToRecord_(headers, row) {
  var obj = {};
  for (var i = 0; i < headers.length; i++) {
    if (headers[i]) obj[headers[i]] = row[i];
  }
  return obj;
}

/** Lê a linha atual da planilha como registro — usado após update para devolver o valor persistido. */
function readRecord_(sheet, headers, rowNumber) {
  var values = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  return rowToRecord_(headers, values);
}

/** Cria uma linha nova. Campo não enviado fica em branco; o ID vai na coluna certa. */
function applyCreate_(sheet, headers, idField, id, fields) {
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i];
    if (header === idField) { row.push(safeCellValue_(id)); continue; }
    row.push(header in fields ? safeCellValue_(fields[header]) : '');
  }
  sheet.appendRow(row);
  return rowToRecord_(headers, row);
}

/**
 * Atualiza campo a campo, célula a célula — volume de edição administrativa é baixo,
 * então o custo de execução não compensa a complexidade de um `setValues` em lote.
 * Só grava (e só loga) o que de fato mudou de valor.
 */
function applyUpdate_(sheet, headers, rowNumber, fields) {
  var changes = [];
  Object.keys(fields).forEach(function (field) {
    var col = headers.indexOf(field);
    if (col === -1) return;

    var range = sheet.getRange(rowNumber, col + 1, 1, 1);
    var oldValue = range.getValue();
    var newValue = safeCellValue_(fields[field]);
    var oldText = oldValue === null || oldValue === undefined ? '' : String(oldValue);
    var newText = newValue === null || newValue === undefined ? '' : String(newValue);
    if (oldText === newText) return;

    range.setValue(newValue);
    changes.push({ field: field, oldValue: oldText, newValue: newText });
  });
  return changes;
}

function successResponse_(record, version, correlationId, id) {
  var payload = { ok: true, record: record, dataset_version: String(version) };
  if (correlationId) payload.correlation_id = correlationId;
  if (id) payload.id = id;
  return json_(payload, {});
}

function errorResponse_(code, message, correlationId) {
  var payload = { ok: false, error: { code: code, message: message } };
  if (correlationId) payload.correlation_id = correlationId;
  return json_(payload, {});
}

/**
 * Resposta JSON, com JSONP opcional.
 *
 * O nome do callback é validado contra um identificador JavaScript simples. Sem essa
 * checagem o parâmetro seria injeção de script direta na página que consome o endpoint.
 */
function json_(payload, params) {
  var body = JSON.stringify(payload);
  var callback = params && params.callback ? String(params.callback) : '';

  if (callback) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(callback)) {
      return ContentService
        .createTextOutput(JSON.stringify({ error: 'callback inválido' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService
      .createTextOutput(callback + '(' + body + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// v2.4.0 — FipeZAP, saneamento e cobertura
// ---------------------------------------------------------------------------
//
// O bloco abaixo incorpora o adendo FipeZAP que rodava só no script instalado na planilha
// (arquivo "Imob_Intelligence_Code_v2.3.0_FipeZAP.txt" no Drive) e acrescenta as rotinas
// de saneamento e as filas de cobertura do Plano 02. Nada aqui sobrescreve função de
// cima por reatribuição: cada ponto de extensão (validateAll, refreshMeta, doGet,
// handleEdit, maintenanceJob, onOpen) chama estas funções pelo nome.

/**
 * Script Property com o ID da planilha de staging de onde `syncFipezapFromStaging_()` copia
 * as cinco abas. Identificador operacional fica em Script Properties, nunca no código nem em
 * APP_META (R8.88): o repositório e o `/exec` são públicos, o staging não.
 */
var FIPEZAP_STAGING_PROPERTY = 'FIPEZAP_STAGING_SPREADSHEET_ID';
/** Chave que versões anteriores publicavam em APP_META; o sync a remove ao rodar. */
var FIPEZAP_LEGACY_SOURCE_ID_META_KEY = 'fipezap_import_source_spreadsheet_id';
var FIPEZAP_IMPORT_SOURCE_TITLE = 'FipeZAP Import Temp - Inteligência Real Estate';
var FIPEZAP_SOURCE_WORKBOOK = 'FipeZAP_Brasilia_Base_Final.xlsx';
var FIPEZAP_SCHEMA_VERSION = '1.1';
var FIPEZAP_SEGMENTS = ['RESIDENCIAL', 'COMERCIAL'];
var FIPEZAP_OPERATIONS = ['VENDA', 'LOCACAO'];
var FIPEZAP_GEOGRAPHIES = ['DF_TOTAL', 'LOCALIDADE'];
/** Abas FipeZAP que carregam período; as outras duas (mapa, notas) não têm eixo temporal. */
var FIPEZAP_PERIOD_SHEETS = ['FIPEZAP_MONTHLY', 'FIPEZAP_LOCALITY_MONTHLY', 'FIPEZAP_SOURCES'];

FIELD_SCHEMA.FIPEZAP_MONTHLY = {
  fipezap_id: 'text', period_id: 'text', reference_date: 'date', year: 'int', month: 'int',
  month_label: 'text', quarter: 'text', is_latest_period: 'bool', segment_scope: 'text',
  transaction_type: 'text', geography_scope: 'text', source_locality_name: 'text',
  ra_name: 'text', ra_geo_id: 'text', geography_classification: 'text', price_unit: 'text',
  sample_n: 'int', price_brl_m2: 'number', official_yield_monthly_pct: 'number',
  official_yield_annual_pct: 'number', price_mom_pct_change: 'number',
  price_ytd_pct_change: 'number', price_yoy_pct_change: 'number',
  calculated_yield_monthly_pct: 'number', calculated_yield_annual_pct: 'number',
  price_to_rent_months: 'number', diff_vs_df_pct: 'number', rank_price: 'int', rank_yoy: 'int',
  source_publisher: 'text', source_type: 'text', source_url: 'url', source_page: 'text',
  notes: 'text', quality_flag: 'text', imported_at: 'text', source_workbook: 'text',
  source_id: 'text', note_id: 'text'
};
FIELD_SCHEMA.FIPEZAP_LOCALITY_MONTHLY = {
  locality_monthly_id: 'text', period_id: 'text', reference_date: 'date', year: 'int',
  month: 'int', month_label: 'text', quarter: 'text', is_latest_period: 'bool',
  segment_scope: 'text', source_locality_name: 'text', ra_name: 'text', ra_geo_id: 'text',
  geography_classification: 'text', sale_price_brl_m2: 'number',
  rent_price_brl_m2_month: 'number', calculated_yield_monthly_pct: 'number',
  calculated_yield_annual_pct: 'number', sale_yoy_pct_change: 'number',
  rent_yoy_pct_change: 'number', sale_diff_vs_df_pct: 'number', rent_diff_vs_df_pct: 'number',
  sale_price_rank: 'int', rent_price_rank: 'int', quality_flag: 'text', source_workbook: 'text',
  rebuilt_at: 'text'
};
FIELD_SCHEMA.FIPEZAP_LOCALITY_MAP = {
  locality_map_id: 'text', source_locality_name: 'text', ra_name: 'text', ra_geo_id: 'text',
  geography_classification: 'text', mapping_rule: 'text', methodology_note: 'text',
  valid_from: 'date', valid_to: 'date', quality_flag: 'text', source_workbook: 'text',
  updated_at: 'text'
};
FIELD_SCHEMA.FIPEZAP_SOURCES = {
  source_id: 'text', period_id: 'text', reference_date: 'date', year: 'int', month: 'int',
  segment_scope: 'text', report_type: 'text', source_type: 'text', source_page_brasilia: 'text',
  source_url: 'url', source_note: 'text', source_publisher: 'text', source_workbook: 'text',
  quality_flag: 'text', imported_at: 'text'
};
FIELD_SCHEMA.FIPEZAP_NOTES = {
  note_id: 'text', note_text: 'text', note_type: 'text', source_workbook: 'text',
  quality_flag: 'text', updated_at: 'text'
};

// --- Datas e períodos ---------------------------------------------------------------

/**
 * `YYYY-MM` a partir de uma célula de período, seja ela o que for.
 *
 * O Google converte "2011-01" digitado numa célula para Date com formato `yyyy-mm`; o
 * validador instalado exigia texto puro e produzia 3369 FIPEZAP_INVALID_PERIOD — um por
 * linha — para um dado correto. Aceita Date, texto `YYYY-MM`, texto ISO `YYYY-MM-DD…` e a
 * forma `Date(y,m,d)` do GViz. Devolve '' quando não dá para ler um período.
 */
/**
 * Date de qualquer realm. `instanceof Date` falha para um Date criado fora do contexto
 * (é o que o sandbox de teste faz); no Apps Script real as duas formas coincidem.
 */
function isDateValue_(value) {
  return value instanceof Date ||
    (value !== null && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Date]');
}

function periodIdOf_(value) {
  if (isDateValue_(value)) {
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'America/Sao_Paulo', 'yyyy-MM');
  }
  var text = toText_(value);
  if (/^\d{4}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 7);
  var gviz = /^Date\((\d{4}),(\d{1,2})(?:,\d{1,2})?\)$/.exec(text);
  if (gviz) return gviz[1] + '-' + ('0' + (Number(gviz[2]) + 1)).slice(-2);
  return '';
}

/** `YYYY-MM-DD` a partir de Date, ISO ou `YYYY-MM` (dia 1). '' quando não há data. */
function dateTextOf_(value) {
  var iso = sheetDateText_(value);
  if (iso) return iso;
  var period = periodIdOf_(value);
  return period ? period + '-01' : '';
}

/** Menor e maior `period_id` de uma aba FipeZAP com coluna de período. */
function fipezapPeriodRange_(sheet) {
  var headers = headersOf_(sheet);
  var ix = headerIndex_(headers);
  if (ix.period_id === undefined) return { start: '', end: '' };
  var start = '';
  var end = '';
  dataRowsOf_(sheet).forEach(function (row) {
    var period = periodIdOf_(row[ix.period_id]);
    if (!period) return;
    if (!start || period < start) start = period;
    if (!end || period > end) end = period;
  });
  return { start: start, end: end };
}

// --- DATA_QUALITY como painel -----------------------------------------------------

/** Família estável de um código de achado. Vocabulário fechado (docs/DATA_CONTRACT.md). */
function qualityCategoryOf_(code) {
  var c = toText_(code).toUpperCase();
  if (/^(MISSING_SHEET|MISSING_OPTIONAL_SHEET|DUPLICATE_HEADER|MISSING_HEADER)$/.test(c) || /_ROW_COUNT$/.test(c)) return 'schema';
  if (/^(EMPTY_ID|MISSING_REQUIRED_VALUE)$/.test(c)) return 'missing_value';
  if (/DUPLICATE/.test(c)) return 'duplicate';
  if (/URL/.test(c)) return 'invalid_url';
  if (/^(HALF_COORDINATE|INVALID_LATITUDE|INVALID_LONGITUDE|FIPEZAP_RA_NOT_MAPPED)$/.test(c)) return 'spatial';
  if (/^(NON_POSITIVE_PRICE|NON_POSITIVE_AREA|PRICE_M2_MISMATCH|FIPEZAP_INVALID_PRICE)$/.test(c) || /_PRICE$/.test(c)) return 'price';
  if (/PERIOD|_MONTH$|COVERAGE_RANGE|_DATE$/.test(c)) return 'date';
  if (/SOURCE|NOTE_NOT_FOUND/.test(c)) return 'source';
  if (/^COVERAGE_|COVERAGE_GAP|UNEXPECTED_HISTORICAL/.test(c)) return 'coverage';
  if (/INVALID|MISMATCH|_SUM$|SCALE/.test(c)) return 'data_type';
  return 'other';
}

/** Ordena achados por severidade → aba → categoria → linha → código, no lugar. */
function sortFindings_(findings) {
  var rank = { error: 0, warning: 1 };
  findings.sort(function (a, b) {
    var sa = rank[a[0]] === undefined ? 2 : rank[a[0]];
    var sb = rank[b[0]] === undefined ? 2 : rank[b[0]];
    if (sa !== sb) return sa - sb;
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    var ca = toText_(a[8]);
    var cb = toText_(b[8]);
    if (ca !== cb) return ca < cb ? -1 : 1;
    var ra = Number(a[2]) || 0;
    var rb = Number(b[2]) || 0;
    if (ra !== rb) return ra - rb;
    if (a[5] !== b[5]) return a[5] < b[5] ? -1 : 1;
    return 0;
  });
  return findings;
}

/** Polígonos com `status = active` — a contagem que interessa ao mapa. */
function countActivePolygons_(book) {
  var sheet = book.getSheetByName('POLYGONS');
  if (!sheet) return 0;
  var ix = headerIndex_(headersOf_(sheet));
  if (ix.status === undefined) return Math.max(0, sheet.getLastRow() - 1);
  return dataRowsOf_(sheet).filter(function (row) {
    return toText_(row[ix.status]).toLowerCase() === 'active';
  }).length;
}

/**
 * Várias linhas no CHANGE_LOG numa escrita só, respeitando o teto de CHANGELOG_LIMIT.
 * `appendChangeLogRow_` continua sendo o caminho para UMA linha; célula a célula, o
 * saneamento monetário geraria centenas de `appendRow`, que é o que estoura a cota.
 */
function appendChangeLogRows_(rows) {
  if (!rows || !rows.length) return;
  var log = ss_().getSheetByName(CHANGELOG_SHEET);
  if (!log) return;
  var width = OPERATIONAL_HEADERS.CHANGE_LOG.length;
  var block = rows.map(function (row) {
    var line = row.slice(0, width);
    while (line.length < width) line.push('');
    return line;
  });
  log.getRange(log.getLastRow() + 1, 1, block.length, width).setValues(block);
  var total = log.getLastRow() - 1;
  if (total > CHANGELOG_LIMIT) log.deleteRows(2, total - CHANGELOG_LIMIT);
}

/** Cria (se preciso) e reescreve por inteiro uma aba operacional derivada. */
function writeOperationalTable_(name, headers, rows) {
  var book = ss_();
  var sheet = book.getSheetByName(name) || book.insertSheet(name);
  ensureSheetSize_(sheet, rows.length + 1, headers.length);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
  return sheet;
}

function ensureSheetSize_(sheet, rows, cols) {
  if (typeof sheet.getMaxRows === 'function' && sheet.getMaxRows() < rows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
  }
  if (typeof sheet.getMaxColumns === 'function' && sheet.getMaxColumns() < cols) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), cols - sheet.getMaxColumns());
  }
}

/** Conjunto de IDs de uma aba, para checagem de referência. Aba ausente devolve vazio. */
function idSetFromSheet_(sheetName, idField) {
  var sheet = ss_().getSheetByName(sheetName);
  var set = {};
  if (!sheet || sheet.getLastRow() < 2) return set;
  var ix = headerIndex_(headersOf_(sheet));
  if (ix[idField] === undefined) return set;
  dataRowsOf_(sheet).forEach(function (row) {
    var id = toText_(row[ix[idField]]);
    if (id) set[id] = true;
  });
  return set;
}

// --- FipeZAP: sincronização e visão de localidades ---------------------------------

function syncFipezapFromStaging_UI() {
  try {
    var result = syncFipezapFromStaging_();
    validateAll();
    refreshMeta();
    notify_('FipeZAP',
      'Sincronização concluída.\nFIPEZAP_MONTHLY: ' + result.rowsMonthly +
      '\nFIPEZAP_LOCALITY_MONTHLY: ' + result.rowsLocality +
      '\nFIPEZAP_SOURCES: ' + result.rowsSources +
      '\nFIPEZAP_LOCALITY_MAP: ' + result.rowsMap +
      '\nFIPEZAP_NOTES: ' + result.rowsNotes);
    return result;
  } catch (error) {
    notify_('Falha FipeZAP', String(error && error.message ? error.message : error));
    throw error;
  }
}

/** ID da planilha de staging FipeZAP, lido de Script Properties. Ausente → erro claro. */
function fipezapStagingSpreadsheetId_() {
  var id = toText_(props_().getProperty(FIPEZAP_STAGING_PROPERTY));
  if (!id) {
    throw new Error('Script Property ' + FIPEZAP_STAGING_PROPERTY + ' não configurada. ' +
      'Defina-a em Configurações do projeto → Propriedades do script com o ID da planilha de staging.');
  }
  return id;
}

/** Remove uma chave de APP_META, se existir. Sem chave, não faz nada. */
function deleteMeta_(key) {
  var sheet = ss_().getSheetByName(META_SHEET);
  if (!sheet) return;
  var rows = dataRowsOf_(sheet);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][0]).trim() === key) sheet.deleteRow(i + 2);
  }
}

/**
 * Copia as cinco abas FipeZAP da planilha de staging para esta, por inteiro.
 *
 * Duas fases, e nesta ordem (R8.89): primeiro LÊ e valida as cinco abas do staging; só
 * depois escreve. Escrever aba a aba enquanto lê deixaria um retrato misto na planilha
 * pública se a terceira aba faltasse — as duas primeiras já limpas e trocadas, as
 * demais antigas, e os metadados nunca atualizados. Se a escrita falhar no meio, o
 * conteúdo anterior de cada aba já escrita é restaurado antes de propagar o erro.
 *
 * As contagens esperadas ficam em APP_META (`fipezap_expected_rows_*`) a partir do que o
 * staging trouxe — o script instalado as tinha fixas em 3369/1714, o que faria a primeira
 * atualização legítima da série (um mês novo) ser rejeitada como erro.
 */
function syncFipezapFromStaging_() {
  var result = withLock_(function () {
    var source = SpreadsheetApp.openById(fipezapStagingSpreadsheetId_());
    var target = ss_();
    var counts = {};

    // Fase 1: ler tudo. Nenhuma aba de destino é tocada até as cinco leituras passarem.
    var snapshots = FIPEZAP_SHEETS.map(function (name) {
      var src = source.getSheetByName(name);
      if (!src) throw new Error('Staging FipeZAP sem a aba ' + name + '. Nada foi alterado.');
      var values = src.getDataRange().getValues();
      if (!values.length || !values[0].length || !toText_(values[0][0])) {
        throw new Error('Staging FipeZAP vazio em ' + name + '. Nada foi alterado.');
      }
      return { name: name, values: values };
    });

    // Fase 2: escrever, guardando o conteúdo anterior para restaurar se algo falhar.
    var previous = [];
    try {
      snapshots.forEach(function (snap) {
        var values = snap.values;
        var dst = target.getSheetByName(snap.name) || target.insertSheet(snap.name);
        var before = dst.getLastRow() > 0 ? dst.getDataRange().getValues() : [];
        previous.push({ sheet: dst, values: before });
        ensureSheetSize_(dst, values.length, values[0].length);
        dst.clearContents();
        dst.getRange(1, 1, values.length, values[0].length).setValues(values);
        styleFipezapSheet_(dst, values.length, values[0].length);
        counts[snap.name] = Math.max(0, values.length - 1);
      });
    } catch (error) {
      previous.forEach(function (entry) {
        try {
          entry.sheet.clearContents();
          if (entry.values.length && entry.values[0].length) {
            entry.sheet.getRange(1, 1, entry.values.length, entry.values[0].length).setValues(entry.values);
          }
        } catch (restoreError) {
          Logger.log('Falha ao restaurar %s após erro no sync FipeZAP: %s', entry.sheet.getName(), restoreError.message);
        }
      });
      throw new Error('Sincronização FipeZAP interrompida e conteúdo anterior restaurado: ' +
        (error && error.message ? error.message : error));
    }

    // Períodos chegam como Date do staging; o contrato é texto (`YYYY-MM`).
    normalizeFipezapPeriodCells_();

    var now = nowISO_();
    setMeta_('fipezap_schema_version', FIPEZAP_SCHEMA_VERSION);
    setMeta_('fipezap_source_workbook', FIPEZAP_SOURCE_WORKBOOK);
    // O ID do staging não é publicado: versões anteriores o gravavam em APP_META.
    deleteMeta_(FIPEZAP_LEGACY_SOURCE_ID_META_KEY);
    setMeta_('fipezap_import_source_title', FIPEZAP_IMPORT_SOURCE_TITLE);
    setMeta_('fipezap_expected_rows_monthly', String(counts.FIPEZAP_MONTHLY || 0));
    setMeta_('fipezap_expected_rows_locality', String(counts.FIPEZAP_LOCALITY_MONTHLY || 0));
    setMeta_('fipezap_expected_rows_sources', String(counts.FIPEZAP_SOURCES || 0));
    setMeta_('fipezap_expected_rows_map', String(counts.FIPEZAP_LOCALITY_MAP || 0));
    setMeta_('fipezap_expected_rows_notes', String(counts.FIPEZAP_NOTES || 0));
    setMeta_('fipezap_data_load_status', 'loaded');
    setMeta_('fipezap_view_status', 'ok');
    setMeta_('pending_appscript_fipezap_schema_sync', 'false');
    setMeta_('last_fipezap_refresh_at', now);
    setMeta_('last_data_change_at', now);
    setMeta_('validation_status', 'dirty');
    var version = bumpDatasetVersion_();
    clearCache();
    logWriteChange_('FIPEZAP_MONTHLY', '*', 'fipezap_full_sync', '', (counts.FIPEZAP_MONTHLY || 0) + ' registros',
      'sincronizador FipeZAP', 'fipezap-sync-' + version, 'ok', '');

    return {
      rowsMonthly: counts.FIPEZAP_MONTHLY || 0,
      rowsLocality: counts.FIPEZAP_LOCALITY_MONTHLY || 0,
      rowsSources: counts.FIPEZAP_SOURCES || 0,
      rowsMap: counts.FIPEZAP_LOCALITY_MAP || 0,
      rowsNotes: counts.FIPEZAP_NOTES || 0
    };
  });
  if (!result) throw new Error('Não foi possível obter lock para sincronizar FipeZAP.');
  return result;
}

function styleFipezapSheet_(sheet, rows, cols) {
  sheet.setFrozenRows(1);
  if (cols > 0) {
    try {
      sheet.getRange(1, 1, 1, cols).setFontWeight('bold');
    } catch (err) { Logger.log('Cabeçalho FipeZAP sem formato em %s: %s', sheet.getName(), err.message); }
  }
  try {
    var filter = sheet.getFilter();
    if (filter) filter.remove();
    if (rows > 1 && cols > 0) sheet.getRange(1, 1, rows, cols).createFilter();
  } catch (err) {
    Logger.log('Filtro FipeZAP não aplicado em %s: %s', sheet.getName(), err.message);
  }
  var ix = headerIndex_(headersOf_(sheet));
  function money(field) {
    if (ix[field] !== undefined && rows > 1) sheet.getRange(2, ix[field] + 1, rows - 1, 1).setNumberFormat('R$ #,##0.00');
  }
  function pct(field) {
    if (ix[field] !== undefined && rows > 1) sheet.getRange(2, ix[field] + 1, rows - 1, 1).setNumberFormat('0.00%');
  }
  if (sheet.getName() === 'FIPEZAP_MONTHLY') {
    money('price_brl_m2');
    ['official_yield_monthly_pct', 'official_yield_annual_pct', 'price_mom_pct_change',
      'price_ytd_pct_change', 'price_yoy_pct_change', 'calculated_yield_monthly_pct',
      'calculated_yield_annual_pct', 'diff_vs_df_pct'].forEach(pct);
  }
  if (sheet.getName() === 'FIPEZAP_LOCALITY_MONTHLY') {
    money('sale_price_brl_m2');
    money('rent_price_brl_m2_month');
    ['calculated_yield_monthly_pct', 'calculated_yield_annual_pct', 'sale_yoy_pct_change',
      'rent_yoy_pct_change', 'sale_diff_vs_df_pct', 'rent_diff_vs_df_pct'].forEach(pct);
  }
}

function fipezapRowCounts_() {
  function count(name) {
    var sh = ss_().getSheetByName(name);
    return sh ? Math.max(0, sh.getLastRow() - 1) : 0;
  }
  return {
    monthly: count('FIPEZAP_MONTHLY'),
    locality: count('FIPEZAP_LOCALITY_MONTHLY'),
    map: count('FIPEZAP_LOCALITY_MAP'),
    sources: count('FIPEZAP_SOURCES'),
    notes: count('FIPEZAP_NOTES')
  };
}

function rebuildFipezapLocalityMonthly_UI() {
  var result = rebuildFipezapLocalityMonthly_();
  validateAll();
  refreshMeta();
  notify_('FipeZAP', result + ' registros reconstruídos na visão de localidades.');
  return result;
}

/**
 * Reconstrói FIPEZAP_LOCALITY_MONTHLY a partir de FIPEZAP_MONTHLY: uma linha por
 * período × segmento × localidade, com venda e locação lado a lado. Não agrega submercados
 * (Asa Norte e Asa Sul continuam separados) — a unidade é `source_locality_name`.
 */
function rebuildFipezapLocalityMonthly_() {
  var result = withLock_(function () {
    var src = ss_().getSheetByName('FIPEZAP_MONTHLY');
    if (!src || src.getLastRow() < 2) return 0;
    var dst = ss_().getSheetByName('FIPEZAP_LOCALITY_MONTHLY') || ss_().insertSheet('FIPEZAP_LOCALITY_MONTHLY');

    var ix = headerIndex_(headersOf_(src));
    var pairs = {};
    dataRowsOf_(src).forEach(function (row) {
      if (toText_(row[ix.geography_scope]) !== 'LOCALIDADE') return;
      var period = periodIdOf_(row[ix.period_id]) || periodIdOf_(row[ix.reference_date]);
      var segment = toText_(row[ix.segment_scope]);
      var locality = toText_(row[ix.source_locality_name]);
      if (!period || !segment || !locality) return;
      var key = period + '|' + segment + '|' + locality;
      if (!pairs[key]) pairs[key] = {};
      pairs[key][toText_(row[ix.transaction_type])] = row;
    });

    var targetHeaders = REQUIRED_HEADERS.FIPEZAP_LOCALITY_MONTHLY;
    var out = [];
    Object.keys(pairs).sort().forEach(function (key) {
      var pair = pairs[key];
      var sale = pair.VENDA || null;
      var rent = pair.LOCACAO || null;
      var base = sale || rent;
      if (!base) return;
      var period = key.split('|')[0];
      var segment = key.split('|')[1];
      var locality = key.split('|')[2];
      var salePrice = sale ? toNumber_(sale[ix.price_brl_m2]) : null;
      var rentPrice = rent ? toNumber_(rent[ix.price_brl_m2]) : null;
      var yieldMonthly = salePrice && rentPrice ? rentPrice / salePrice : null;
      var fields = {
        locality_monthly_id: 'FZLOC_' + period.replace('-', '') + '_' + normalizeSlug_(segment).toUpperCase() + '_' + normalizeSlug_(locality).toUpperCase(),
        period_id: period,
        reference_date: dateTextOf_(base[ix.reference_date]) || (period + '-01'),
        year: base[ix.year],
        month: base[ix.month],
        month_label: base[ix.month_label],
        quarter: base[ix.quarter],
        is_latest_period: base[ix.is_latest_period],
        segment_scope: segment,
        source_locality_name: locality,
        ra_name: base[ix.ra_name],
        ra_geo_id: base[ix.ra_geo_id],
        geography_classification: base[ix.geography_classification],
        sale_price_brl_m2: salePrice === null ? '' : salePrice,
        rent_price_brl_m2_month: rentPrice === null ? '' : rentPrice,
        calculated_yield_monthly_pct: yieldMonthly === null ? '' : yieldMonthly,
        calculated_yield_annual_pct: yieldMonthly === null ? '' : yieldMonthly * 12,
        sale_yoy_pct_change: sale ? sale[ix.price_yoy_pct_change] : '',
        rent_yoy_pct_change: rent ? rent[ix.price_yoy_pct_change] : '',
        sale_diff_vs_df_pct: sale ? sale[ix.diff_vs_df_pct] : '',
        rent_diff_vs_df_pct: rent ? rent[ix.diff_vs_df_pct] : '',
        sale_price_rank: sale ? sale[ix.rank_price] : '',
        rent_price_rank: rent ? rent[ix.rank_price] : '',
        quality_flag: sale && rent ? 'ok' : (sale ? 'partial_sale_only' : 'partial_rent_only'),
        source_workbook: FIPEZAP_SOURCE_WORKBOOK,
        rebuilt_at: nowISO_()
      };
      out.push(targetHeaders.map(function (h) { return fields[h] === undefined ? '' : fields[h]; }));
    });

    ensureSheetSize_(dst, out.length + 1, targetHeaders.length);
    dst.clearContents();
    dst.getRange(1, 1, 1, targetHeaders.length).setValues([targetHeaders]);
    if (out.length) {
      var ixDst = headerIndex_(targetHeaders);
      dst.getRange(2, ixDst.period_id + 1, out.length, 1).setNumberFormat('@');
      dst.getRange(2, ixDst.reference_date + 1, out.length, 1).setNumberFormat('@');
      dst.getRange(2, 1, out.length, targetHeaders.length).setValues(out);
    }
    styleFipezapSheet_(dst, out.length + 1, targetHeaders.length);
    setMeta_('fipezap_view_status', 'ok');
    setMeta_('last_fipezap_view_rebuild_at', nowISO_());
    clearCache();
    return out.length;
  });
  if (result === null) throw new Error('Não foi possível obter lock para reconstruir a visão FipeZAP.');
  return result;
}

// --- FipeZAP: validação -------------------------------------------------------------

/**
 * Regras semânticas da série FipeZAP, além do schema genérico de `validateSheet_`.
 *
 * Contagem esperada só é cobrada quando APP_META a publica (`fipezap_expected_rows_*`),
 * e a cobertura é conferida por lacuna de mês na série agregada — não por datas fixas,
 * que envelhecem a cada informe novo.
 */
function validateFipezapDataset_(report) {
  var book = ss_();
  var monthly = book.getSheetByName('FIPEZAP_MONTHLY');
  if (!monthly || monthly.getLastRow() < 2) return;

  var sourceIds = idSetFromSheet_('FIPEZAP_SOURCES', 'source_id');
  var noteIds = idSetFromSheet_('FIPEZAP_NOTES', 'note_id');
  var raIds = idSetFromSheet_('RA_PROFILES', 'ra_geo_id');
  var mappedLocalities = idSetFromSheet_('FIPEZAP_LOCALITY_MAP', 'source_locality_name');
  var ix = headerIndex_(headersOf_(monthly));
  var rows = dataRowsOf_(monthly);
  var required = ['fipezap_id', 'period_id', 'segment_scope', 'transaction_type', 'geography_scope',
    'price_brl_m2', 'source_id', 'ra_geo_id', 'note_id', 'source_locality_name'];
  for (var r = 0; r < required.length; r++) {
    if (ix[required[r]] === undefined) return; // MISSING_HEADER já foi reportado por validateSheet_
  }

  var expectedCounts = {
    FIPEZAP_MONTHLY: getMeta_('fipezap_expected_rows_monthly'),
    FIPEZAP_LOCALITY_MONTHLY: getMeta_('fipezap_expected_rows_locality'),
    FIPEZAP_SOURCES: getMeta_('fipezap_expected_rows_sources'),
    FIPEZAP_LOCALITY_MAP: getMeta_('fipezap_expected_rows_map'),
    FIPEZAP_NOTES: getMeta_('fipezap_expected_rows_notes')
  };
  Object.keys(expectedCounts).forEach(function (name) {
    var expected = parseInt(expectedCounts[name], 10);
    if (!isFinite(expected) || expected <= 0) return;
    var sheet = book.getSheetByName(name);
    var found = sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
    if (found !== expected) {
      report('warning', name, '', '', '', 'FIPEZAP_ROW_COUNT',
        'Quantidade esperada em APP_META: ' + expected + '; encontrada ' + found +
        '. Atualize fipezap_expected_rows_* se a série cresceu de propósito.');
    }
  });

  var totalPeriods = {};
  var seenKeys = {};
  var commercialBefore2019 = 0;
  var localityBefore201903 = 0;

  rows.forEach(function (row, i) {
    var rn = i + 2;
    var id = toText_(row[ix.fipezap_id]);
    var period = periodIdOf_(row[ix.period_id]);
    var segment = toText_(row[ix.segment_scope]);
    var operation = toText_(row[ix.transaction_type]);
    var geo = toText_(row[ix.geography_scope]);
    var price = toNumber_(row[ix.price_brl_m2]);
    var raId = toText_(row[ix.ra_geo_id]);
    var locality = toText_(row[ix.source_locality_name]);
    var sourceId = toText_(row[ix.source_id]);
    var noteId = toText_(row[ix.note_id]);

    if (!period) {
      report('error', 'FIPEZAP_MONTHLY', rn, id, 'period_id', 'FIPEZAP_INVALID_PERIOD',
        'Período inválido: ' + toText_(row[ix.period_id]) + ' (esperado YYYY-MM, ou célula de data).');
    } else if (ix.reference_date !== undefined) {
      var refPeriod = periodIdOf_(row[ix.reference_date]);
      if (refPeriod && refPeriod !== period) {
        report('error', 'FIPEZAP_MONTHLY', rn, id, 'reference_date', 'FIPEZAP_PERIOD_MISMATCH',
          'reference_date (' + refPeriod + ') não pertence ao period_id (' + period + ').');
      }
    }
    if (FIPEZAP_SEGMENTS.indexOf(segment) === -1) {
      report('error', 'FIPEZAP_MONTHLY', rn, id, 'segment_scope', 'FIPEZAP_INVALID_SEGMENT', 'Segmento inválido: ' + segment);
    }
    if (FIPEZAP_OPERATIONS.indexOf(operation) === -1) {
      report('error', 'FIPEZAP_MONTHLY', rn, id, 'transaction_type', 'FIPEZAP_INVALID_OPERATION', 'Operação inválida: ' + operation);
    }
    if (FIPEZAP_GEOGRAPHIES.indexOf(geo) === -1) {
      report('error', 'FIPEZAP_MONTHLY', rn, id, 'geography_scope', 'FIPEZAP_INVALID_GEOGRAPHY', 'Geografia inválida: ' + geo);
    }
    if (price === null || price <= 0) {
      report('error', 'FIPEZAP_MONTHLY', rn, id, 'price_brl_m2', 'FIPEZAP_INVALID_PRICE', 'Preço/m² deve ser positivo.');
    }
    if (!sourceId || !sourceIds[sourceId]) {
      report('error', 'FIPEZAP_MONTHLY', rn, id, 'source_id', 'FIPEZAP_MISSING_SOURCE', 'source_id ausente ou inexistente em FIPEZAP_SOURCES: ' + sourceId);
    }
    if (noteId && !noteIds[noteId]) {
      report('warning', 'FIPEZAP_MONTHLY', rn, id, 'note_id', 'FIPEZAP_NOTE_NOT_FOUND', 'note_id não encontrado em FIPEZAP_NOTES: ' + noteId);
    }
    if (geo === 'LOCALIDADE') {
      if (!raId || !raIds[raId]) {
        report('error', 'FIPEZAP_MONTHLY', rn, id, 'ra_geo_id', 'FIPEZAP_RA_NOT_MAPPED',
          'Localidade FipeZAP sem ra_geo_id válido em RA_PROFILES: ' + raId);
      }
      if (locality && Object.keys(mappedLocalities).length && !mappedLocalities[locality]) {
        report('warning', 'FIPEZAP_MONTHLY', rn, id, 'source_locality_name', 'FIPEZAP_LOCALITY_NOT_IN_MAP',
          'Localidade sem linha em FIPEZAP_LOCALITY_MAP: ' + locality);
      }
      if (period && period < '2019-03') localityBefore201903++;
    }
    if (segment === 'COMERCIAL' && period && period < '2019-01') commercialBefore2019++;

    // Duplicidade lógica: mesmo período × segmento × operação × geografia × localidade.
    var key = [period, segment, operation, geo, locality].join('|');
    if (period && seenKeys[key]) {
      report('error', 'FIPEZAP_MONTHLY', rn, id, 'period_id', 'FIPEZAP_DUPLICATE_OBSERVATION',
        'Observação repetida (primeira na linha ' + seenKeys[key] + '): ' + key);
    } else if (period) {
      seenKeys[key] = rn;
    }
    if (period && geo === 'DF_TOTAL' && segment === 'RESIDENCIAL' && operation === 'VENDA') {
      totalPeriods[period] = true;
    }
  });

  // Lacuna de mês na série agregada residencial de venda — a espinha dorsal do índice.
  var periods = Object.keys(totalPeriods).sort();
  if (periods.length > 1) {
    var missing = [];
    var cursor = periods[0];
    while (cursor < periods[periods.length - 1]) {
      var y = parseInt(cursor.slice(0, 4), 10);
      var m = parseInt(cursor.slice(5, 7), 10) + 1;
      if (m > 12) { m = 1; y++; }
      cursor = y + '-' + ('0' + m).slice(-2);
      if (!totalPeriods[cursor]) missing.push(cursor);
    }
    if (missing.length) {
      report('warning', 'FIPEZAP_MONTHLY', '', '', 'period_id', 'FIPEZAP_COVERAGE_GAP',
        missing.length + ' mês(es) sem linha DF_TOTAL/RESIDENCIAL/VENDA entre ' + periods[0] +
        ' e ' + periods[periods.length - 1] + ': ' + missing.slice(0, 12).join(', ') +
        (missing.length > 12 ? '…' : ''));
    }
  }
  if (commercialBefore2019) {
    report('warning', 'FIPEZAP_MONTHLY', '', '', 'segment_scope', 'FIPEZAP_UNEXPECTED_HISTORICAL_COMMERCIAL',
      commercialBefore2019 + ' linha(s) comerciais antes de 2019; Brasília/DF não tinha cobertura comercial nessa série. Confirme a fonte.');
  }
  if (localityBefore201903) {
    report('warning', 'FIPEZAP_MONTHLY', '', '', 'geography_scope', 'FIPEZAP_UNEXPECTED_HISTORICAL_LOCALITY',
      localityBefore201903 + ' linha(s) de localidade antes de 2019-03; não inferir localidades nos informes agregados antigos.');
  }
}

// --- FipeZAP: endpoint de leitura ----------------------------------------------------

/**
 * `?resource=fipezap&view=monthly|locality|sources|map|notes` com filtros exatos e por
 * intervalo de período. Payload menor e contrato explícito para quem não quer GViz.
 */
function fipezapApi_(params) {
  var view = toText_(params.view || 'monthly').toLowerCase();
  var sheetByView = {
    monthly: 'FIPEZAP_MONTHLY',
    locality: 'FIPEZAP_LOCALITY_MONTHLY',
    sources: 'FIPEZAP_SOURCES',
    map: 'FIPEZAP_LOCALITY_MAP',
    notes: 'FIPEZAP_NOTES'
  };
  var sheetName = sheetByView[view];
  if (!sheetName) throw new Error('view FipeZAP inválida. Use monthly, locality, sources, map ou notes.');
  var sheet = ss_().getSheetByName(sheetName);
  if (!sheet) return { view: view, name: sheetName, count: 0, rows: [] };
  var headers = headersOf_(sheet);
  var ix = headerIndex_(headers);
  var from = periodIdOf_(params.from);
  var to = periodIdOf_(params.to);
  var exactFilters = {
    period_id: periodIdOf_(params.period_id),
    segment_scope: toText_(params.segment_scope),
    transaction_type: toText_(params.transaction_type),
    geography_scope: toText_(params.geography_scope),
    ra_geo_id: toText_(params.ra_geo_id),
    source_locality_name: toText_(params.source_locality_name),
    source_id: toText_(params.source_id),
    note_id: toText_(params.note_id)
  };
  var limit = parseInt(params.limit || '5000', 10);
  if (!isFinite(limit) || limit <= 0) limit = 5000;
  limit = Math.min(limit, 5000);

  var rows = [];
  dataRowsOf_(sheet).some(function (row) {
    var period = ix.period_id !== undefined ? periodIdOf_(row[ix.period_id]) : '';
    if (from && period && period < from) return false;
    if (to && period && period > to) return false;
    var fields = Object.keys(exactFilters);
    for (var f = 0; f < fields.length; f++) {
      var field = fields[f];
      var expected = exactFilters[field];
      if (!expected || ix[field] === undefined) continue;
      var actual = field === 'period_id' ? period : toText_(row[ix[field]]);
      if (actual !== expected) return false;
    }
    var record = rowToRecord_(headers, row);
    if (ix.period_id !== undefined) record.period_id = period;
    if (ix.reference_date !== undefined) record.reference_date = dateTextOf_(row[ix.reference_date]);
    rows.push(record);
    return rows.length >= limit;
  });
  return {
    view: view,
    name: sheetName,
    dataset_version: props_().getProperty('DATASET_VERSION') || '1',
    count: rows.length,
    limit: limit,
    filters: { from: from, to: to, exact: exactFilters },
    rows: rows
  };
}

// --- Saneamento: períodos FipeZAP como texto ---------------------------------------

/**
 * `period_id` → texto `YYYY-MM` e `reference_date` → texto `YYYY-MM-DD` nas abas FipeZAP.
 *
 * O formato `@` é aplicado ANTES de escrever: sem ele o Google reconverte "2011-01" em
 * Date no mesmo instante, e a rotina não seria idempotente. Célula que já é texto no
 * formato certo não é tocada.
 */
function normalizeFipezapPeriodCells() {
  var result = withLock_(normalizeFipezapPeriodCells_);
  if (result === null) return 'Não foi possível obter lock.';
  Logger.log(result);
  notify_('Saneamento FipeZAP', result);
  return result;
}

function normalizeFipezapPeriodCells_() {
  var book = ss_();
  var summary = [];
  var logRows = [];
  var changedTotal = 0;
  var correlation = 'fipezap-periods-' + nowISO_();

  FIPEZAP_PERIOD_SHEETS.forEach(function (name) {
    var sheet = book.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    var ix = headerIndex_(headersOf_(sheet));
    var rows = dataRowsOf_(sheet);
    var columns = [
      { field: 'period_id', convert: periodIdOf_ },
      { field: 'reference_date', convert: dateTextOf_ }
    ];
    columns.forEach(function (column) {
      if (ix[column.field] === undefined) return;
      var changed = 0;
      var unreadable = 0;
      var out = rows.map(function (row) {
        var current = row[ix[column.field]];
        if (isBlank_(current)) return [current];
        var text = column.convert(current);
        if (!text) { unreadable++; return [current]; }
        if (typeof current === 'string' && current === text) return [current];
        changed++;
        return [text];
      });
      if (changed > 0) {
        var range = sheet.getRange(2, ix[column.field] + 1, out.length, 1);
        range.setNumberFormat('@');
        range.setValues(out);
        logRows.push([nowISO_(), name, column.field, '*', 'Date/texto misto', changed + ' célula(s) como texto',
          'saneamento v2.4.0', correlation, 'ok', '']);
      }
      changedTotal += changed;
      summary.push(name + '.' + column.field + ': ' + changed + ' convertida(s)' +
        (unreadable ? ', ' + unreadable + ' ilegível(is) preservada(s)' : ''));
    });
  });

  if (changedTotal > 0) {
    appendChangeLogRows_(logRows);
    bumpDatasetVersion_();
    setMeta_('validation_status', 'dirty');
    setMeta_('last_data_change_at', nowISO_());
    clearCache();
  }
  return summary.length ? summary.join('\n') : 'Nenhuma aba FipeZAP com período encontrada.';
}

// --- Saneamento: dinheiro como número ----------------------------------------------

/** Colunas monetárias por aba. Texto "R$ 2.500.000" vira 2500000 com formato de moeda. */
var MONETARY_COLUMNS = {
  LISTINGS: ['asking_price_brl', 'asking_price_brl_m2', 'condo_fee_brl', 'iptu_brl'],
  DEVELOPMENTS: ['current_price_brl', 'current_price_brl_m2']
};

function normalizeMonetaryCells() {
  var result = withLock_(normalizeMonetaryCells_);
  if (result === null) return 'Não foi possível obter lock.';
  Logger.log(result);
  notify_('Saneamento monetário', result);
  return result;
}

/**
 * Converte célula monetária em TEXTO para número. Número já tipado não é tocado; texto
 * que não parseia é preservado e contado — a validação continua a acusá-lo. Cada célula
 * convertida vira uma linha do CHANGE_LOG com valor anterior e novo (Plano 02 §2.3).
 */
function normalizeMonetaryCells_() {
  var book = ss_();
  var summary = [];
  var logRows = [];
  var changedTotal = 0;
  var correlation = 'monetary-cells-' + nowISO_();

  Object.keys(MONETARY_COLUMNS).forEach(function (name) {
    var sheet = book.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    var ix = headerIndex_(headersOf_(sheet));
    var idField = ID_FIELD[name];
    var rows = dataRowsOf_(sheet);
    MONETARY_COLUMNS[name].forEach(function (field) {
      if (ix[field] === undefined) return;
      var changed = 0;
      var unparsed = 0;
      var out = rows.map(function (row, i) {
        var current = row[ix[field]];
        if (typeof current !== 'string' || current.trim() === '') return [current];
        var n = toNumber_(current);
        if (n === null) { unparsed++; return [current]; }
        changed++;
        logRows.push([nowISO_(), name, field, idField && ix[idField] !== undefined ? toText_(row[ix[idField]]) : String(i + 2),
          current, String(n), 'saneamento v2.4.0', correlation, 'ok', '']);
        return [n];
      });
      if (changed > 0) {
        var range = sheet.getRange(2, ix[field] + 1, out.length, 1);
        range.setNumberFormat('R$ #,##0.00');
        range.setValues(out);
      }
      changedTotal += changed;
      summary.push(name + '.' + field + ': ' + changed + ' convertida(s)' +
        (unparsed ? ', ' + unparsed + ' não numérica(s) preservada(s)' : ''));
    });
  });

  if (changedTotal > 0) {
    appendChangeLogRows_(logRows);
    bumpDatasetVersion_();
    setMeta_('validation_status', 'dirty');
    setMeta_('last_data_change_at', nowISO_());
    clearCache();
  }
  return summary.length ? summary.join('\n') : 'Nenhuma aba com coluna monetária encontrada.';
}

// --- IVV_REGION ----------------------------------------------------------------------

/**
 * Cria a aba IVV_REGION com o cabeçalho do contrato, sem dado. A semente (95 linhas,
 * mai/2026) mora em migration/imob-intelligence-backend.xlsx e é colada à mão — dado
 * operacional não mora no script (R2.3).
 */
function provisionIvvRegion() {
  var result = withLock_(function () {
    var book = ss_();
    var sheet = book.getSheetByName('IVV_REGION');
    var created = false;
    if (!sheet) {
      sheet = book.insertSheet('IVV_REGION');
      created = true;
    }
    var ensured = ensureHeaders_(sheet, IVV_REGION_HEADERS, null);
    setMeta_('ivv_region_schema_version', '1.0');
    if (created || ensured.added.length) {
      setMeta_('validation_status', 'dirty');
      clearCache();
    }
    var rows = Math.max(0, sheet.getLastRow() - 1);
    setMeta_('rows_ivv_region', String(rows));
    return (created ? 'IVV_REGION criada' : 'IVV_REGION já existia') +
      (ensured.added.length ? '; cabeçalhos adicionados: ' + ensured.added.join(', ') : '') +
      '. Linhas de dado: ' + rows +
      (rows === 0 ? '. Cole a semente (reference_month, market_region, bedroom_bucket, …) e rode "Validar dados agora".' : '.');
  });
  if (result === null) return 'Não foi possível obter lock.';
  Logger.log(result);
  notify_('IVV_REGION', result);
  return result;
}

/**
 * IVV_REGION: faixas do vocabulário, mês legível, chave composta única, IVV em ponto
 * percentual (0–100) e conferência publicado × sold/offered. `DF Total` é linha de
 * referência — nunca somada às RAs, nunca comparada com a soma delas.
 */
function validateIvvRegion_(report) {
  var sheet = ss_().getSheetByName('IVV_REGION');
  if (!sheet) return;
  var ix = headerIndex_(headersOf_(sheet));
  var missing = IVV_REGION_HEADERS.filter(function (h) { return ix[h] === undefined; });
  if (missing.length) {
    report('error', 'IVV_REGION', 1, '', missing.join(', '), 'MISSING_HEADER',
      'Cabeçalho(s) do contrato ausente(s): ' + missing.join(', '));
    return;
  }
  var seen = {};
  dataRowsOf_(sheet).forEach(function (row, i) {
    var rn = i + 2;
    var region = toText_(row[ix.market_region]);
    var bucket = toText_(row[ix.bedroom_bucket]);
    var month = periodIdOf_(row[ix.reference_month]);
    var id = [month, region, bucket].join('|');
    if (!region) {
      report('error', 'IVV_REGION', rn, id, 'market_region', 'MISSING_REQUIRED_VALUE', 'market_region vazio.');
    }
    if (IVV_REGION_BUCKETS.indexOf(bucket) === -1) {
      report('error', 'IVV_REGION', rn, id, 'bedroom_bucket', 'IVV_REGION_INVALID_BUCKET',
        'Faixa fora do vocabulário (' + IVV_REGION_BUCKETS.join(', ') + '): ' + bucket);
    }
    if (!month) {
      report('error', 'IVV_REGION', rn, id, 'reference_month', 'IVV_REGION_INVALID_MONTH',
        'reference_month ilegível: ' + toText_(row[ix.reference_month]));
    }
    if (region && bucket && month) {
      if (seen[id]) {
        report('error', 'IVV_REGION', rn, id, 'market_region', 'IVV_REGION_DUPLICATE',
          'Mês × região × faixa repetido (primeira na linha ' + seen[id] + ').');
      } else {
        seen[id] = rn;
      }
    }
    var offered = isBlank_(row[ix.offered_units]) ? null : toNumber_(row[ix.offered_units]);
    var sold = isBlank_(row[ix.sold_units]) ? null : toNumber_(row[ix.sold_units]);
    if (offered !== null && (offered < 0 || offered !== Math.trunc(offered))) {
      report('error', 'IVV_REGION', rn, id, 'offered_units', 'INVALID_FIELD_VALUE', 'offered_units deve ser inteiro não negativo.');
    }
    if (sold !== null && (sold < 0 || sold !== Math.trunc(sold))) {
      report('error', 'IVV_REGION', rn, id, 'sold_units', 'INVALID_FIELD_VALUE', 'sold_units deve ser inteiro não negativo.');
    }
    var published = isBlank_(row[ix.ivv_pct_published]) ? null : toNumber_(row[ix.ivv_pct_published]);
    var alias = isBlank_(row[ix.ivv_pct]) ? null : toNumber_(row[ix.ivv_pct]);
    if (published !== null && (published < 0 || published > 100)) {
      report('error', 'IVV_REGION', rn, id, 'ivv_pct_published', 'IVV_REGION_SCALE',
        'IVV deve estar em ponto percentual (0–100): ' + published);
    }
    if (published !== null && alias !== null && Math.abs(published - alias) > IVV_REGION_TOLERANCE_PP) {
      report('warning', 'IVV_REGION', rn, id, 'ivv_pct', 'IVV_REGION_ALIAS_MISMATCH',
        'ivv_pct (' + alias + ') diverge de ivv_pct_published (' + published + '); o publicado prevalece (D2).');
    }
    if (published !== null && offered !== null && offered > 0 && sold !== null) {
      var check = (sold / offered) * 100;
      if (Math.abs(check - published) > IVV_REGION_TOLERANCE_PP) {
        report('warning', 'IVV_REGION', rn, id, 'ivv_pct_published', 'IVV_REGION_IVV_MISMATCH',
          'IVV publicado ' + published + ' diverge de sold/offered ' + check.toFixed(2) + ' p.p.; o publicado prevalece.');
      }
    }
  });
}

// --- Cobertura: LISTINGS_COVERAGE ---------------------------------------------------

/** 'RA-I' a partir de 'RA2026_RA-I', 'RA-I' ou 'RA_01' (via RA_PROFILES). */
function raCodeFromGeoId_(value) {
  var text = toText_(value).toUpperCase();
  var m = /(RA-[IVXLC]+)$/.exec(text);
  return m ? m[1] : '';
}

function bedroomBucketOf_(propertyType, bedrooms) {
  var n = toNumber_(bedrooms);
  if (toText_(propertyType) === 'kitnet' || n === 0) return 'studio_kitnet';
  if (n === null) return 'sem_info';
  if (n <= 1) return '1Q';
  if (n === 2) return '2Q';
  if (n === 3) return '3Q';
  return '4+Q';
}

function priceBucketOf_(price) {
  var n = toNumber_(price);
  if (n === null || n <= 0) return 'sem_preco';
  for (var i = 0; i < LISTINGS_PRICE_BUCKETS.length; i++) {
    var bucket = LISTINGS_PRICE_BUCKETS[i];
    if (bucket.max === null || n < bucket.max) return bucket.label;
  }
  return LISTINGS_PRICE_BUCKETS[LISTINGS_PRICE_BUCKETS.length - 1].label;
}

function coverageStatusOf_(activeCount, portalsCount) {
  if (activeCount === 0) return 'none';
  if (activeCount === 1) return 'single';
  if (activeCount < 3) return 'thin';
  if (portalsCount === 1) return 'single_portal';
  return 'ok';
}

/** Perfis de RA como { 'RA-I': { geoId, name } }, para a cobertura mostrar RA com zero anúncio. */
function raProfilesByCode_() {
  var out = {};
  var sheet = ss_().getSheetByName('RA_PROFILES');
  if (!sheet) return out;
  var ix = headerIndex_(headersOf_(sheet));
  if (ix.ra_geo_id === undefined) return out;
  dataRowsOf_(sheet).forEach(function (row) {
    var code = ix.ra_code !== undefined ? raCodeFromGeoId_(row[ix.ra_code]) : '';
    if (!code) return;
    out[code] = {
      geoId: toText_(row[ix.ra_geo_id]),
      name: ix.ra_name !== undefined ? toText_(row[ix.ra_name]) : ''
    };
  });
  return out;
}

function buildListingsCoverage() {
  var result = withLock_(buildListingsCoverage_);
  if (result === null) return 'Não foi possível obter lock.';
  Logger.log(result);
  notify_('LISTINGS_COVERAGE', result);
  return result;
}

/**
 * Matriz de cobertura de anúncios (Plano 02 §3.1): RA × tipo × faixa de quartos × faixa
 * de preço. Duas granularidades na mesma aba: linhas `TODOS`/`TODOS` para cada RA × tipo
 * (inclusive com zero, para a lacuna aparecer) e linhas detalhadas só para combinações
 * observadas. Recalculada por inteiro; nunca editada à mão.
 */
function buildListingsCoverage_() {
  var book = ss_();
  var listings = book.getSheetByName('LISTINGS');
  if (!listings) return 'Aba LISTINGS ausente.';
  var ix = headerIndex_(headersOf_(listings));
  var needed = ['ra_geo_id', 'property_type', 'bedrooms', 'asking_price_brl', 'area_m2',
    'asking_price_brl_m2', 'status', 'portal', 'observed_at'];
  for (var i = 0; i < needed.length; i++) {
    if (ix[needed[i]] === undefined) return 'LISTINGS sem a coluna ' + needed[i] + '.';
  }

  var profiles = raProfilesByCode_();
  var cells = {};
  function cell(ra, type, beds, price) {
    var key = [ra, type, beds, price].join('|');
    if (!cells[key]) {
      cells[key] = { ra: ra, type: type, beds: beds, price: price, active: 0, withPrice: 0,
        withArea: 0, withValidM2: 0, portals: {}, latest: '' };
    }
    return cells[key];
  }

  var raCodes = {};
  Object.keys(profiles).forEach(function (code) { raCodes[code] = true; });

  dataRowsOf_(listings).forEach(function (row) {
    var code = raCodeFromGeoId_(row[ix.ra_geo_id]);
    if (!code) code = 'SEM_RA';
    raCodes[code] = true;
    var type = toText_(row[ix.property_type]) || 'sem_tipo';
    var beds = bedroomBucketOf_(type, row[ix.bedrooms]);
    var priceBucket = priceBucketOf_(row[ix.asking_price_brl]);
    var price = toNumber_(row[ix.asking_price_brl]);
    var area = toNumber_(row[ix.area_m2]);
    var informed = toNumber_(row[ix.asking_price_brl_m2]);
    var validM2 = price !== null && price > 0 && area !== null && area > 0 &&
      (informed === null || informed <= 0 || Math.abs(price / area - informed) / informed <= PRICE_M2_TOLERANCE);
    var active = toText_(row[ix.status]).toLowerCase() === 'active';
    var portal = toText_(row[ix.portal]);
    var observed = dateTextOf_(row[ix.observed_at]);

    [cell(code, type, beds, priceBucket), cell(code, type, 'TODOS', 'TODOS')].forEach(function (c) {
      if (active) c.active++;
      if (price !== null && price > 0) c.withPrice++;
      if (area !== null && area > 0) c.withArea++;
      if (validM2) c.withValidM2++;
      if (portal) c.portals[portal] = true;
      if (observed && observed > c.latest) c.latest = observed;
    });
  });

  // Toda RA × tipo do vocabulário existe como linha de resumo, mesmo com zero.
  Object.keys(raCodes).forEach(function (code) {
    ENUM_VALUES.property_type.forEach(function (type) { cell(code, type, 'TODOS', 'TODOS'); });
  });

  var computedAt = nowISO_();
  var rows = Object.keys(cells).sort().map(function (key) {
    var c = cells[key];
    var profile = profiles[c.ra] || { geoId: '', name: '' };
    var geoId = c.ra === 'SEM_RA' ? '' : 'RA2026_' + c.ra;
    var portalsCount = Object.keys(c.portals).length;
    return [
      geoId, profile.name, c.type, c.beds, c.price, c.active, c.withPrice, c.withArea,
      c.withValidM2, portalsCount, c.latest, coverageStatusOf_(c.active, portalsCount), computedAt
    ];
  });

  writeOperationalTable_(LISTINGS_COVERAGE_SHEET, LISTINGS_COVERAGE_HEADERS, rows);
  setMeta_('rows_listings_coverage', String(rows.length));
  setMeta_('listings_coverage_computed_at', computedAt);
  var gaps = rows.filter(function (r) { return r[3] === 'TODOS' && r[11] === 'none'; }).length;
  return rows.length + ' linha(s) em ' + LISTINGS_COVERAGE_SHEET + '; ' + gaps +
    ' combinação(ões) RA × tipo sem nenhum anúncio ativo.';
}

// --- Cobertura: PDAD_A_COVERAGE -----------------------------------------------------

function buildPdadCoverage() {
  var result = withLock_(buildPdadCoverage_);
  if (result === null) return 'Não foi possível obter lock.';
  Logger.log(result);
  notify_('PDAD_A_COVERAGE', result);
  return result;
}

/**
 * Cobertura PDAD-A (Plano 02 §9): RA × indicador autorizado em PDAD_A_FIGURE_MAP, com
 * categorias carregadas, publicadas e suprimidas. `categories_expected` é o máximo
 * observado entre as RAs para o mesmo indicador e ano — o mapa de figuras não publica a
 * contagem, e inventá-la seria pior que declarar a heurística. Indicador que aparece em
 * PDAD_A_DATA sem estar no mapa vira `needs_review`, nunca é silenciosamente aceito.
 */
function buildPdadCoverage_() {
  var book = ss_();
  var data = book.getSheetByName('PDAD_A_DATA');
  var figureMap = book.getSheetByName('PDAD_A_FIGURE_MAP');
  if (!data) return 'Aba PDAD_A_DATA ausente.';
  if (!figureMap) return 'Aba PDAD_A_FIGURE_MAP ausente.';

  var fx = headerIndex_(headersOf_(figureMap));
  if (fx.indicator_code === undefined) return 'PDAD_A_FIGURE_MAP sem indicator_code.';
  var authorized = {};
  var authorizedOrder = [];
  dataRowsOf_(figureMap).forEach(function (row) {
    var code = toText_(row[fx.indicator_code]);
    if (!code || authorized[code]) return;
    authorized[code] = {
      name: fx.indicator_name !== undefined ? toText_(row[fx.indicator_name]) : '',
      figure: fx.figure_number !== undefined ? toText_(row[fx.figure_number]) : '',
      table: fx.table_number !== undefined ? toText_(row[fx.table_number]) : ''
    };
    authorizedOrder.push(code);
  });

  var dx = headerIndex_(headersOf_(data));
  var needed = ['pdad_year', 'ra_geo_id', 'indicator_code', 'source_value_status'];
  for (var i = 0; i < needed.length; i++) {
    if (dx[needed[i]] === undefined) return 'PDAD_A_DATA sem a coluna ' + needed[i] + '.';
  }

  var ras = {};
  var groups = {};
  var maxCategories = {};
  dataRowsOf_(data).forEach(function (row) {
    var year = toText_(row[dx.pdad_year]);
    var ra = toText_(row[dx.ra_geo_id]);
    var code = toText_(row[dx.indicator_code]);
    if (!year || !ra || !code) return;
    var raKey = year + '|' + ra;
    if (!ras[raKey]) ras[raKey] = { year: year, ra: ra, name: dx.ra_name !== undefined ? toText_(row[dx.ra_name]) : '' };
    var key = raKey + '|' + code;
    if (!groups[key]) {
      groups[key] = { categories: {}, published: 0, suppressed: 0, partial: 0, other: 0,
        figure: '', table: '', name: dx.indicator_name !== undefined ? toText_(row[dx.indicator_name]) : '' };
    }
    var g = groups[key];
    var category = dx.category_standard !== undefined ? toText_(row[dx.category_standard]) : '';
    if (!category && dx.response_category !== undefined) category = toText_(row[dx.response_category]);
    var segment = dx.segment_value !== undefined ? toText_(row[dx.segment_value]) : '';
    if (category) g.categories[segment + '|' + category] = true;
    var status = toText_(row[dx.source_value_status]).toLowerCase();
    if (status === 'published') g.published++;
    else if (status === 'suppressed') g.suppressed++;
    else if (status === 'partial') g.partial++;
    else g.other++;
    if (!g.figure && dx.figure_number !== undefined) g.figure = toText_(row[dx.figure_number]);
    if (!g.table && dx.table_number !== undefined) g.table = toText_(row[dx.table_number]);
  });
  Object.keys(groups).forEach(function (key) {
    var parts = key.split('|');
    var indicatorKey = parts[0] + '|' + parts[2];
    var loaded = Object.keys(groups[key].categories).length;
    if (!maxCategories[indicatorKey] || loaded > maxCategories[indicatorKey]) maxCategories[indicatorKey] = loaded;
  });

  var checkedAt = nowISO_();
  var rows = [];
  Object.keys(ras).sort().forEach(function (raKey) {
    var ra = ras[raKey];
    authorizedOrder.forEach(function (code) {
      var info = authorized[code];
      var g = groups[raKey + '|' + code];
      var expected = maxCategories[ra.year + '|' + code] || '';
      if (!g) {
        rows.push([ra.ra, ra.name, ra.year, code, info.name, info.figure, info.table, expected, 0, 0, 0,
          false, false, 'missing', 'gap', checkedAt, 'nenhuma linha em PDAD_A_DATA']);
        return;
      }
      var loaded = Object.keys(g.categories).length;
      var status;
      if (g.published === 0 && g.suppressed > 0) status = 'suppressed_source';
      else if (g.suppressed > 0 || g.partial > 0 || g.other > 0 || (expected && loaded < expected)) status = 'partial';
      else status = 'complete';
      var quality = status === 'partial' ? 'review' : 'ok';
      var notes = [];
      if (g.partial) notes.push(g.partial + ' partial');
      if (g.other) notes.push(g.other + ' status desconhecido');
      if (expected && loaded < expected) notes.push('categorias ' + loaded + '/' + expected);
      rows.push([ra.ra, ra.name, ra.year, code, info.name || g.name, info.figure || g.figure,
        info.table || g.table, expected, loaded, g.published, g.suppressed,
        !!(info.figure || g.figure), !!(info.table || g.table), status, quality, checkedAt, notes.join('; ')]);
    });
    // Indicadores fora do mapa canônico: revisão explícita (Plano 02 §10).
    Object.keys(groups).forEach(function (key) {
      if (key.indexOf(raKey + '|') !== 0) return;
      var code = key.slice(raKey.length + 1);
      if (authorized[code]) return;
      var g = groups[key];
      rows.push([ra.ra, ra.name, ra.year, code, g.name, g.figure, g.table, '',
        Object.keys(g.categories).length, g.published, g.suppressed, !!g.figure, !!g.table,
        'needs_review', 'review', checkedAt, 'indicador fora de PDAD_A_FIGURE_MAP']);
    });
  });

  writeOperationalTable_(PDAD_COVERAGE_SHEET, PDAD_COVERAGE_HEADERS, rows);
  setMeta_('rows_pdad_coverage', String(rows.length));
  setMeta_('pdad_coverage_computed_at', checkedAt);
  var counts = {};
  rows.forEach(function (r) { counts[r[13]] = (counts[r[13]] || 0) + 1; });
  return rows.length + ' linha(s) em ' + PDAD_COVERAGE_SHEET + ': ' +
    Object.keys(counts).sort().map(function (k) { return k + '=' + counts[k]; }).join(', ') + '.';
}

// --- Cobertura: fila de pesquisa de DEVELOPMENTS ------------------------------------

/**
 * DEVELOPMENTS com campo de prioridade vazio vira aviso `coverage` em DATA_QUALITY — é a
 * fila de pesquisa do Plano 02 §5.2, na aba que o operador já olha. Não inventa valor.
 */
function validateDevelopmentCoverage_(report) {
  var sheet = ss_().getSheetByName('DEVELOPMENTS');
  if (!sheet) return;
  var ix = headerIndex_(headersOf_(sheet));
  var idField = ID_FIELD.DEVELOPMENTS;
  if (ix[idField] === undefined) return;
  dataRowsOf_(sheet).forEach(function (row, i) {
    var rn = i + 2;
    var id = toText_(row[ix[idField]]);
    DEVELOPMENT_RESEARCH_FIELDS.forEach(function (field) {
      if (ix[field] === undefined) return;
      var blank = isBlank_(row[ix[field]]);
      if (field === 'latitude') {
        blank = blank && (ix.longitude === undefined || isBlank_(row[ix.longitude]));
        if (!blank) return;
        report('warning', 'DEVELOPMENTS', rn, id, 'latitude, longitude', 'COVERAGE_MISSING_COORDINATE',
          'Fila de pesquisa: sem coordenada. Fonte preferida: site oficial da incorporadora ou registro público.');
        return;
      }
      if (!blank) return;
      report('warning', 'DEVELOPMENTS', rn, id, field, 'COVERAGE_MISSING_' + field.toUpperCase(),
        'Fila de pesquisa: ' + field + ' vazio. Preencher só com fonte específica (source_url).');
    });
  });
}
