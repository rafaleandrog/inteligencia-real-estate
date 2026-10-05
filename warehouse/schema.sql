-- Modelo 2 — esquema canônico (DuckDB). Esqueleto; implementação adiada (issue #154).
-- Painel LONGO: uma linha por cidade × ano × variável × fonte, com procedência por número.
-- Ausência é NULL, nunca 0.

CREATE TABLE IF NOT EXISTS dim_city (
  city_id            VARCHAR PRIMARY KEY,   -- IBGE 7 dígitos; agregados: 'AP_<ibge7 do núcleo>'
  ibge6              VARCHAR,
  city_name          VARCHAR NOT NULL,
  uf                 VARCHAR NOT NULL,
  city_kind          VARCHAR NOT NULL,      -- 'municipio' | 'arranjo_populacional'
  members            VARCHAR[],             -- só para agregados
  arranjo_name       VARCHAR,
  area_km2           DOUBLE,
  area_source_id     VARCHAR,
  centroid_lat       DOUBLE,
  centroid_lon       DOUBLE,
  is_target          BOOLEAN NOT NULL DEFAULT FALSE,
  aop_abbrev         VARCHAR,
  notes              VARCHAR
);

CREATE TABLE IF NOT EXISTS dim_source (
  source_id          VARCHAR PRIMARY KEY,
  publisher          VARCHAR NOT NULL,
  dataset_name       VARCHAR NOT NULL,
  url                VARCHAR NOT NULL,
  access_method      VARCHAR NOT NULL,      -- 'http' | 'bigquery' | 'sheet' | 'local_raster'
  license            VARCHAR,
  citation_pt        VARCHAR,
  credential_required BOOLEAN NOT NULL DEFAULT FALSE,
  cadence            VARCHAR,
  coverage_years     VARCHAR,
  last_retrieved_at  TIMESTAMP,
  last_vintage       VARCHAR,
  notes              VARCHAR
);

CREATE TABLE IF NOT EXISTS dim_variable (
  variable_id        VARCHAR PRIMARY KEY,
  label_pt           VARCHAR NOT NULL,
  unit               VARCHAR NOT NULL,      -- pessoas | domicilios | km2 | brl | brl_m2 | veiculos | vinculos | fracao | indice
  kind               VARCHAR NOT NULL,      -- stock | flow | price | ratio | index
  deflate            BOOLEAN NOT NULL DEFAULT FALSE,
  preferred_sources  VARCHAR[],
  description_pt     VARCHAR,
  method_note_pt     VARCHAR
);

CREATE TABLE IF NOT EXISTS dim_deflator (
  year               INTEGER PRIMARY KEY,
  ipca_index_annual_avg DOUBLE NOT NULL,   -- base: último ano completo = 100
  source_id          VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS fact_city_year (
  city_id            VARCHAR NOT NULL,
  year               INTEGER NOT NULL,
  variable_id        VARCHAR NOT NULL,
  source_id          VARCHAR NOT NULL,
  value              DOUBLE,                -- NULL = ausente, nunca 0
  unit               VARCHAR NOT NULL,
  value_kind         VARCHAR NOT NULL,      -- observed | estimated_official | derived | interpolated
  source_table       VARCHAR,
  vintage            VARCHAR,
  retrieved_at       TIMESTAMP,
  quality_flag       VARCHAR,               -- ok | method_break | boundary_change | partial_year | suppressed | proxy | projected
  method_note        VARCHAR,
  n                  INTEGER,
  is_preferred       BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (city_id, year, variable_id, source_id)
);

CREATE TABLE IF NOT EXISTS dim_zone (
  zone_scheme        VARCHAR NOT NULL,      -- grade_ibge_1km | grade_ibge_200m | aop_h3_r9 | udh_atlas | setor_2022
  zone_id            VARCHAR NOT NULL,
  city_id            VARCHAR NOT NULL,
  area_km2           DOUBLE,
  geometry           VARCHAR,               -- GeoJSON (GeoParquet nos marts)
  PRIMARY KEY (zone_scheme, zone_id)
);

CREATE TABLE IF NOT EXISTS fact_zone_year (
  city_id            VARCHAR NOT NULL,
  zone_scheme        VARCHAR NOT NULL,
  zone_id            VARCHAR NOT NULL,
  year               INTEGER NOT NULL,
  variable_id        VARCHAR NOT NULL,
  source_id          VARCHAR NOT NULL,
  value              DOUBLE,
  value_kind         VARCHAR NOT NULL,
  quality_flag       VARCHAR,
  coordinate_precision VARCHAR,             -- p.ex. 'cep' para RAIS geocodificada: nunca endereço exato
  PRIMARY KEY (city_id, zone_scheme, zone_id, year, variable_id, source_id)
);
