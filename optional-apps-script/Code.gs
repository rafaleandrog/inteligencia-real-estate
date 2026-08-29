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

var APP_VERSION = '2.2.1';

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
  'ROAD_SEGMENTS', 'ROAD_SEGMENT_ALIASES', 'TRAFFIC_DAILY_TEST'
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
  'RA_PROFILES', 'POLYGONS', 'ROAD_SEGMENTS', 'ROAD_SEGMENT_ALIASES', 'TRAFFIC_DAILY_TEST'
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
  DATA_QUALITY: ['severity', 'sheet', 'row', 'record_id', 'field', 'code', 'message', 'detected_at'],
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
  TRAFFIC_DAILY_TEST: 'traffic_daily_id'
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
  ]
};

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

/** Buffer visual padrão, por lado, do corredor rodoviário derivado do eixo oficial. */
var DEFAULT_ROAD_DISPLAY_BUFFER_M = 8;

/** Camada oficial do eixo do trecho rodoviário (DER/DF), via ArcGIS REST. */
var DER_ROAD_LAYER_URL = 'https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/SISTEMA_VIARIO/MapServer/9';

/** Camada oficial dos limites das Regiões Administrativas (GeoPortal/SEDUH). */
var RA_BOUNDARY_LAYER_URL = 'https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/LIMITES/FeatureServer/1';

/**
 * Teto de caracteres da geometria de uma RA numa célula. Fica abaixo de
 * MAX_CELL_TEXT_LENGTH de propósito: acima disso a sincronização pede ao GeoPortal uma
 * geometria simplificada em vez de truncar — geometria truncada seria polígono inválido.
 */
var RA_SYNC_MAX_CELL_CHARS = 48000;

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
    .addItem('Importar polígonos de KML/KMZ', 'importPolygonsFromDriveFile_UI')
    .addItem('Sincronizar Regiões Administrativas', 'syncAdministrativeRegions_UI')
    .addItem('Sincronizar trechos rodoviários DER', 'syncRoadSegmentsFromTraffic_UI')
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
 * Aceita number, decimal com ponto e formato brasileiro ("R$ 1.234,56"). Devolve
 * null quando não há número — nunca NaN, para que ausência tenha uma representação só.
 * Espelha toNumber() de src/normalize.js: mudou lá, muda aqui.
 */
function toNumber_(value) {
  if (typeof value === 'number') return isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;

  var s = String(value).replace(/[R$\s ]/gi, '');
  if (s === '') return null;

  var lastComma = s.lastIndexOf(',');
  var lastDot = s.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    s = (s.length - lastComma - 1) === 3 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1) {
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
  if (value instanceof Date) return !isNaN(value.getTime());
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

    var tokenMigration = migrateLegacyAdminToken_();
    var developmentUpdates = populateDevelopmentSalesStage_();
    var anchorUpdates = populateAnchorClassification_();
    var datasetChanged = addedHeaders.some(function (item) {
      return /^(LISTINGS|DEVELOPMENTS|ANCHORS|RA_PROFILES|POLYGONS|ROAD_SEGMENTS|ROAD_SEGMENT_ALIASES|TRAFFIC_DAILY_TEST):/.test(item);
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
      findings.push([severity, sheetName, row, recordId, field, code, message, detectedAt]);
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

    writeQuality_(findings);

    var errors = findings.filter(function (f) { return f[0] === 'error'; }).length;
    var warnings = findings.filter(function (f) { return f[0] === 'warning'; }).length;

    setMeta_('last_validation_at', detectedAt);
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
      (schema[field] === 'geojson' ? 'INVALID_GEOMETRY' : 'INVALID_FIELD_VALUE');
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
      var validation = validateGeoJsonGeometry_(geometry);
      if (!validation.ok) throw new Error('geometria inválida: ' + validation.message);
      var geometryJson = JSON.stringify(validation.geometry);

      // Célula do Sheets tem teto. Acima dele a saída NÃO é truncar (geometria truncada é
      // polígono inválido gravado como se fosse válido), é pedir ao GeoPortal a mesma
      // feição com tolerância de simplificação maior, duas vezes, e desistir da RA se
      // ainda assim não couber.
      if (geometryJson.length > RA_SYNC_MAX_CELL_CHARS) {
        var simplified = fetchAdministrativeRegionFeature_(attrs.objectid, 0.00001);
        if (!simplified || !simplified.geometry) throw new Error('geometria excede limite da célula e simplificação falhou.');
        validation = validateGeoJsonGeometry_(simplified.geometry);
        if (!validation.ok) throw new Error('geometria simplificada inválida: ' + validation.message);
        geometryJson = JSON.stringify(validation.geometry);
      }
      if (geometryJson.length > RA_SYNC_MAX_CELL_CHARS) {
        var simplified2 = fetchAdministrativeRegionFeature_(attrs.objectid, 0.00003);
        if (!simplified2 || !simplified2.geometry) throw new Error('geometria continua acima do limite da célula.');
        validation = validateGeoJsonGeometry_(simplified2.geometry);
        if (!validation.ok) throw new Error('segunda simplificação inválida: ' + validation.message);
        geometryJson = JSON.stringify(validation.geometry);
      }
      if (geometryJson.length > RA_SYNC_MAX_CELL_CHARS) throw new Error('geometria excede 48 mil caracteres mesmo após simplificação.');

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
  if (found) applyUpdate_(sheet, headers, found.rowNumber, fields);
  else {
    // RA que existe no limite oficial mas ainda não tem perfil PDAD nasce marcada como
    // tal, para a tela distinguir "sem dado publicado" de "dado igual a zero".
    fields.profile_status = 'official_geometry_only_profile_pending';
    fields.quality_flag = 'official_geometry_profile_not_loaded';
    applyCreate_(sheet, headers, 'ra_geo_id', ra.ra_geo_id, fields);
  }
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
    quality_flag: ra.geometry_json.length > 45000 ? 'official_boundary_simplified_for_sheet' : 'official_boundary_geoportal',
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
    'Informe o buffer visual por lado, em metros. O padrão é ' + DEFAULT_ROAD_DISPLAY_BUFFER_M + ' m. A linha oficial é preservada separadamente.',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var text = toText_(response.getResponseText());
  var bufferM = text ? toNumber_(text) : DEFAULT_ROAD_DISPLAY_BUFFER_M;
  if (bufferM === null || bufferM <= 0 || bufferM > 100) {
    ui.alert('Buffer inválido. Use um valor maior que 0 e menor ou igual a 100 m.');
    return;
  }
  try {
    var result = syncRoadSegmentsFromTraffic_(bufferM);
    ui.alert(
      'Sincronização concluída',
      result.synced + ' trecho(s) sincronizado(s); ' + result.skipped + ' sem feição oficial; ' +
        result.failed + ' falha(s). Buffer visual: ' + bufferM + ' m por lado.',
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
  var skipped = 0;
  var failed = 0;
  codes.forEach(function (code) {
    try {
      var record = fetchDerRoadByCode_(code, bufferM);
      if (record) fetched.push(record);
      else skipped++;
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
    relateTrafficRowsToRoadSegments_();
    setMeta_('road_sync_status', synced ? ((skipped || failed) ? 'synced_with_warnings' : 'synced') : 'no_official_matches');
    setMeta_('road_sync_last_synced_at', nowISO_());
    setMeta_('road_sync_buffer_m', String(bufferM));
    setMeta_('road_sync_synced_count', String(synced));
    setMeta_('road_sync_skipped_count', String(skipped));
    setMeta_('road_sync_failed_count', String(failed));
    if (synced) {
      var version = bumpDatasetVersion_();
      setMeta_('validation_status', 'dirty');
      setMeta_('last_data_change_at', nowISO_());
      refreshMeta();
      clearCache();
      logWriteChange_('POLYGONS', '*', 'der_road_sync', '', synced + ' trecho(s)',
        'sincronizador DER', 'der-road-' + version, 'ok', '');
    }
    return { synced: synced, skipped: skipped, failed: failed };
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

function fetchDerRoadByCode_(code, bufferM) {
  var fields = [
    'objectid', 'id', 'nome', 'sigla', 'codtrechorodov', 'geometriaaproximada',
    'tipotrechorod', 'jurisdicao', 'administracao', 'concessionaria', 'revestimento',
    'operacional', 'situacaofisica', 'canteirodivisorio', 'nrpistas', 'nrfaixas', 'trafego',
    'limitevelocidade', 'trechoemperimetrourbano', 'acostamento', 'tipopavimentacao',
    'st_length_geometry_'
  ];
  // Aspas simples são o terminador do literal SQL do ArcGIS: dobrar é o que impede um
  // código de trecho vindo da planilha de virar cláusula `where` de outra pessoa.
  var safeCode = String(code).replace(/'/g, "''");
  var params = {
    where: "codtrechorodov='" + safeCode + "'",
    outFields: fields.join(','),
    returnGeometry: 'true',
    returnTrueCurves: 'false',
    outSR: '4326',
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
  var features = payload.features || [];
  if (!features.length) return null;

  var paths = [];
  var objectIds = [];
  features.forEach(function (feature) {
    var geometry = feature.geometry || {};
    (geometry.paths || []).forEach(function (path) { if (path && path.length >= 2) paths.push(path); });
    var attrs = feature.attributes || {};
    if (!isBlank_(attrs.objectid)) objectIds.push(String(attrs.objectid));
  });
  if (!paths.length) return null;

  var sourceGeometry = paths.length === 1
    ? { type: 'LineString', coordinates: paths[0] }
    : { type: 'MultiLineString', coordinates: paths };
  var sourceValidation = validateGeoJsonSourceGeometry_(sourceGeometry);
  if (!sourceValidation.ok) throw new Error('Eixo inválido para ' + code + ': ' + sourceValidation.message);
  sourceGeometry = sourceValidation.geometry;

  var displayGeometry = bufferLineGeometry_(sourceGeometry, bufferM);
  var validation = validateGeoJsonGeometry_(displayGeometry);
  if (!validation.ok) throw new Error('Buffer inválido para ' + code + ': ' + validation.message);

  var attrs0 = features[0].attributes || {};
  var sourceJson = JSON.stringify(sourceGeometry);
  var displayJson = JSON.stringify(validation.geometry);
  return {
    road_segment_id: canonicalRoadSegmentId_(code),
    source_segment_code: code,
    road_name: sanitizePlainText_(attrs0.nome),
    road_code: sanitizePlainText_(attrs0.sigla),
    segment_type: sanitizePlainText_(attrs0.tipotrechorod),
    jurisdiction: sanitizePlainText_(attrs0.jurisdicao),
    administration: sanitizePlainText_(attrs0.administracao),
    length_m: lineGeometryLengthM_(sourceGeometry),
    source_feature_id: objectIds.join(','),
    source_geometry: sourceGeometry,
    source_geometry_json: sourceJson,
    display_geometry: validation.geometry,
    display_geometry_json: displayJson,
    geometry_hash: sha256Hex_(sourceJson),
    attributes: attrs0,
    feature_count: features.length,
    synced_at: nowISO_()
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
  if (value instanceof Date && !isNaN(value.getTime())) {
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
  var attrs = road.attributes || {};
  var props = {
    source_segment_code: road.source_segment_code,
    concessionaria: sanitizePlainText_(attrs.concessionaria),
    revestimento: sanitizePlainText_(attrs.revestimento),
    operacional: sanitizePlainText_(attrs.operacional),
    situacaofisica: sanitizePlainText_(attrs.situacaofisica),
    canteirodivisorio: sanitizePlainText_(attrs.canteirodivisorio),
    nrpistas: attrs.nrpistas === null || attrs.nrpistas === undefined ? '' : attrs.nrpistas,
    nrfaixas: attrs.nrfaixas === null || attrs.nrfaixas === undefined ? '' : attrs.nrfaixas,
    trafego: sanitizePlainText_(attrs.trafego),
    limitevelocidade: attrs.limitevelocidade === null || attrs.limitevelocidade === undefined ? '' : attrs.limitevelocidade,
    trechoemperimetrourbano: sanitizePlainText_(attrs.trechoemperimetrourbano),
    acostamento: sanitizePlainText_(attrs.acostamento),
    tipopavimentacao: sanitizePlainText_(attrs.tipopavimentacao),
    geometriaaproximada: sanitizePlainText_(attrs.geometriaaproximada),
    feature_count: road.feature_count,
    traffic_summary: road.trafficSummary || null
  };
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
    source_layer_name: 'Eixo do Trecho Rodoviário',
    source_feature_id: road.source_feature_id,
    source_crs: 'EPSG:4326',
    valid_from: '',
    valid_to: '',
    is_current: true,
    properties_json: JSON.stringify(props),
    confidence_flag: 'high_official_der_geometry',
    quality_flag: 'official_centerline_synced',
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
  var properties = {
    road_segment_id: road.road_segment_id,
    source_segment_code: road.source_segment_code,
    road_name: road.road_name,
    road_code: road.road_code,
    segment_type: road.segment_type,
    jurisdiction: road.jurisdiction,
    administration: road.administration,
    traffic_relation_dataset: 'TRAFFIC_DAILY_TEST',
    traffic_daily_rows: summary.rows || 0,
    traffic_date_min: summary.minDate || '',
    traffic_date_max: summary.maxDate || '',
    traffic_avg_daily_flow: summary.avgDailyFlow === undefined ? null : summary.avgDailyFlow,
    traffic_latest_daily_flow: summary.latestFlow === undefined ? null : summary.latestFlow,
    display_buffer_m_each_side: bufferM,
    native_source_crs: 'EPSG:31983'
  };

  var values = {
    polygon_id: polygonId,
    name: (road.road_code || road.road_name || road.source_segment_code) + ' · ' + road.source_segment_code,
    category: 'poligonal',
    geometry_geojson: road.display_geometry_json,
    color: '#53606B',
    description: 'Trecho rodoviário DER/DF. Corredor visual derivado do eixo oficial com buffer de ' + bufferM + ' m por lado.',
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
    confidence_flag: 'high_official_der_geometry',
    quality_flag: 'display_buffer_from_official_centerline',
    entity_type: 'road_segment',
    entity_id: road.road_segment_id,
    geometry_type: road.display_geometry.type,
    geometry_role: 'display_corridor',
    source_geometry_type: road.source_geometry.type,
    display_buffer_m: bufferM,
    source_system: 'DER_DF',
    source_layer_name: 'Eixo do Trecho Rodoviário',
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
    return { ok: true, value: raw instanceof Date ? raw.toISOString().slice(0, 10) : text };
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
