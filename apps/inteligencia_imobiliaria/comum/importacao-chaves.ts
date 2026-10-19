/**
 * Catálogo de importação por tabela (spec 11.1): colunas aceitas, aliases da
 * planilha antiga, chave natural e colunas derivadas (que a exportação
 * acrescenta e a importação ignora com aviso). Código puro: o backend valida
 * por ele e o "Baixar modelo" gera o cabeçalho dele.
 */

export type TipoCampo = 'texto' | 'texto_longo' | 'inteiro' | 'decimal' | 'fracao' | 'booleano' | 'data' | 'datahora' | 'json' | 'url';

export interface CampoImport {
  /** Coluna da tabela (ou campo virtual de referência, ex.: `localidade`). */
  coluna: string;
  tipo: TipoCampo;
  obrigatorio?: boolean;
  /** Cabeçalhos alternativos (planilha antiga). */
  aliases?: string[];
  /** Cabeçalhos alternativos em pontos percentuais: o valor é dividido por 100 (D-12). */
  aliasesPct?: string[];
  opcoes?: string[];
  /** Tradução de valores da planilha antiga para o vocabulário da app. */
  traducao?: Record<string, string>;
  /** Tradução por função, quando o vocabulário antigo é aberto (ex.: `active_verified_*`). */
  traduzir?: (valor: string) => string;
  limite?: number;
  /** Campo que não vira coluna: é resolvido pelo motor (referência por código). */
  virtual?: boolean;
}

export interface TabelaImport {
  tabela: string;
  titulo: string;
  campos: CampoImport[];
  /** Chave natural, em colunas da tabela, depois de resolvidas as referências. */
  chave: string[];
  /** Colunas que a exportação acrescenta; na importação são ignoradas com aviso. */
  derivadas: string[];
  /** A tabela tem `versao` (desfazer compara com a da criação). */
  temVersao: boolean;
  /** Colunas não mapeadas vão para `extras` (json), sem aviso de perda. */
  extras?: boolean;
  /** A tabela não tem `soft_delete` (série publicada): o desfazer apaga a linha. */
  semLixeira?: boolean;
  /** Modos permitidos; `substituir_tudo` só em série publicada. */
  modos: ModoDuplicata[];
  /**
   * Variantes de cabeçalho: quando o CSV traz a coluna `detecta`, os aliases dos
   * campos listados são trocados (a mesma aba antiga usa `ra_geo_id` como código
   * numa e como pai noutra).
   */
  variantes?: { nome: string; detecta: string; aliases: Record<string, string[]>; opcionais?: string[] }[];
}

export type ModoDuplicata = 'ignorar' | 'atualizar' | 'substituir_tudo' | 'falhar';
export const MODOS_CADASTRO: ModoDuplicata[] = ['ignorar', 'atualizar', 'falhar'];

/** Automáticas do framework e de controle: sempre derivadas na importação. */
export const DERIVADAS_COMUNS = ['id', 'criado_em', 'atualizado_em', 'versao', 'removido_em', 'removido_por_id', 'importacao_id'];

const LOCALIDADE_REF: CampoImport = {
  coluna: 'localidade',
  tipo: 'texto',
  virtual: true,
  aliases: ['ra_geo_id', 'localidade_codigo', 'ra', 'localidade_id'],
};

export const TABELAS_IMPORT: Record<string, TabelaImport> = {
  localidades: {
    tabela: 'localidades',
    titulo: 'Localidades',
    chave: ['tipo', 'codigo'],
    derivadas: ['cidade', 'localidade_pai_nome', 'perfil_ano'],
    temVersao: true,
    modos: MODOS_CADASTRO,
    // Migração passo 3: FIPEZAP_LOCALITY_MAP vira submercados, com `ra_geo_id` como pai.
    variantes: [{ nome: 'FIPEZAP_LOCALITY_MAP', detecta: 'locality_map_id', aliases: { codigo: ['locality_map_id'], localidade_pai: ['ra_geo_id'], nome: [], nome_fonte: ['source_locality_name'], qualidade: ['quality_flag'] }, opcionais: ['nome'] }],
    campos: [
      { coluna: 'tipo', tipo: 'texto', opcoes: ['ra', 'submercado', 'bairro', 'municipio', 'agregado'] },
      { coluna: 'codigo', tipo: 'texto', obrigatorio: true, limite: 40, aliases: ['ra_geo_id', 'locality_map_id'] },
      { coluna: 'codigo_romano', tipo: 'texto', limite: 12, aliases: ['ra_code'] },
      { coluna: 'codigo_legado', tipo: 'texto', limite: 40, aliases: ['ra_geo_id_roman'] },
      { coluna: 'numero', tipo: 'inteiro', aliases: ['ra_number'] },
      { coluna: 'nome', tipo: 'texto', obrigatorio: true, limite: 120, aliases: ['ra_name'] },
      { coluna: 'nome_fonte', tipo: 'texto', limite: 120, aliases: ['source_locality_name', 'ra_name_source'] },
      { coluna: 'localidade_pai', tipo: 'texto', virtual: true, aliases: ['localidade_pai_codigo'] },
      { coluna: 'classificacao_fonte', tipo: 'texto', limite: 40, aliases: ['geography_classification'] },
      { coluna: 'regra_mapeamento', tipo: 'texto_longo', aliases: ['mapping_rule'] },
      { coluna: 'nota_metodologica', tipo: 'texto_longo', aliases: ['methodology_note'] },
      { coluna: 'vigente_de', tipo: 'data', aliases: ['valid_from'] },
      { coluna: 'vigente_ate', tipo: 'data', aliases: ['valid_to'] },
      { coluna: 'area_km2', tipo: 'decimal', aliases: ['ra_area_km2'] },
      { coluna: 'ponto_referencia_latitude', tipo: 'decimal' },
      { coluna: 'ponto_referencia_longitude', tipo: 'decimal' },
      { coluna: 'criada_apos_pdad_2024', tipo: 'booleano', aliases: ['created_after_pdad_2024'] },
      { coluna: 'localidade_predecessora', tipo: 'texto', virtual: true, aliases: ['predecessor_ra'] },
      { coluna: 'referencia_legal', tipo: 'texto', limite: 200, aliases: ['legal_reference'] },
      { coluna: 'geometria_fonte_url', tipo: 'url', limite: 500, aliases: ['geometry_source_url'] },
      { coluna: 'perfil_fonte_url', tipo: 'url', limite: 500, aliases: ['profile_source_url'] },
      { coluna: 'qualidade', tipo: 'texto', limite: 80, aliases: ['quality_flag'] },
      { coluna: 'notas', tipo: 'texto_longo', aliases: ['notes'] },
    ],
  },
  localidade_perfis: {
    tabela: 'localidade_perfis',
    titulo: 'Perfis das localidades',
    chave: ['localidade_id', 'ano_referencia'],
    derivadas: ['localidade_nome'],
    temVersao: false,
    extras: true,
    modos: MODOS_CADASTRO,
    campos: [
      { ...LOCALIDADE_REF, obrigatorio: true },
      // Na planilha real `profile_reference_year` está vazio nas 35 linhas (DATA_CONTRACT): cai para o período da PDAD.
      { coluna: 'ano_referencia', tipo: 'inteiro', obrigatorio: true, aliases: ['profile_reference_year', 'pdad_reference_period'] },
      { coluna: 'populacao_total', tipo: 'inteiro', aliases: ['population_total'] },
      { coluna: 'densidade_hab_km2', tipo: 'decimal', aliases: ['population_density_km2'] },
      { coluna: 'renda_per_capita_brl', tipo: 'decimal', aliases: ['income_per_capita_brl'] },
      { coluna: 'faixa_0_14_frac', tipo: 'fracao', aliasesPct: ['population_age_0_14_pct'] },
      { coluna: 'faixa_15_29_frac', tipo: 'fracao', aliasesPct: ['population_age_15_29_pct'] },
      { coluna: 'faixa_30_44_frac', tipo: 'fracao', aliasesPct: ['population_age_30_44_pct'] },
      { coluna: 'faixa_45_59_frac', tipo: 'fracao', aliasesPct: ['population_age_45_59_pct'] },
      { coluna: 'faixa_60_mais_frac', tipo: 'fracao', aliasesPct: ['population_age_60_plus_pct'] },
      { coluna: 'idade_media', tipo: 'decimal', aliases: ['average_age'] },
      { coluna: 'feminino_frac', tipo: 'fracao', aliasesPct: ['female_pct'] },
      { coluna: 'masculino_frac', tipo: 'fracao', aliasesPct: ['male_pct'] },
      { coluna: 'domicilios_total', tipo: 'inteiro', aliases: ['households_total'] },
      { coluna: 'moradores_por_domicilio', tipo: 'decimal', aliases: ['avg_household_size'] },
      { coluna: 'tipologia_dominante', tipo: 'texto', limite: 40, aliases: ['dominant_dwelling_type'] },
      { coluna: 'tipologia_dominante_frac', tipo: 'fracao', aliasesPct: ['dominant_dwelling_type_pct'] },
      { coluna: 'ocupacao_dominante', tipo: 'texto', limite: 40, aliases: ['dominant_tenure'] },
      { coluna: 'ocupacao_dominante_frac', tipo: 'fracao', aliasesPct: ['dominant_tenure_pct'] },
      { coluna: 'escritura_registrada_frac', tipo: 'fracao', aliasesPct: ['deed_registered_pct'] },
      { coluna: 'status', tipo: 'texto', limite: 80, aliases: ['profile_status'] },
      { coluna: 'qualidade', tipo: 'texto', limite: 80, aliases: ['quality_flag'] },
    ],
  },
  contornos: {
    tabela: 'contornos',
    titulo: 'Contornos',
    chave: ['id_legado'],
    derivadas: ['bbox_oeste', 'bbox_sul', 'bbox_leste', 'bbox_norte', 'geometria_hash', 'metricas_aproximadas', 'localidade_nome', 'arquivo_origem'],
    temVersao: true,
    modos: MODOS_CADASTRO,
    campos: [
      { coluna: 'id_legado', tipo: 'texto', limite: 80, aliases: ['polygon_id'] },
      { coluna: 'nome', tipo: 'texto', obrigatorio: true, limite: 200, aliases: ['name'] },
      { coluna: 'categoria', tipo: 'texto', limite: 60, aliases: ['category'] },
      { coluna: 'subcategoria', tipo: 'texto', limite: 60, aliases: ['subcategory'] },
      {
        coluna: 'tipo_entidade', tipo: 'texto', aliases: ['entity_type'],
        opcoes: ['regiao_administrativa', 'trecho_rodoviario', 'area_personalizada'],
        traducao: { administrative_region: 'regiao_administrativa', road_segment: 'trecho_rodoviario', custom_area: 'area_personalizada', custom: 'area_personalizada' },
      },
      { coluna: 'entidade_codigo', tipo: 'texto', limite: 80, aliases: ['entity_id'] },
      {
        coluna: 'papel_geometria', tipo: 'texto', aliases: ['geometry_role'],
        opcoes: ['limite_exibicao', 'limite', 'eixo_rota', 'corredor_exibicao'],
        traducao: { display_boundary: 'limite_exibicao', boundary: 'limite', route_axis: 'eixo_rota', display_corridor: 'corredor_exibicao' },
      },
      LOCALIDADE_REF,
      { coluna: 'grupo_camada', tipo: 'texto', limite: 60, aliases: ['layer_group'] },
      { coluna: 'geometria', tipo: 'json', obrigatorio: true, aliases: ['geometry_geojson'] },
      { coluna: 'geometria_fonte', tipo: 'json', aliases: ['source_geometry_geojson'] },
      { coluna: 'centroide_latitude', tipo: 'decimal', aliases: ['centroid_lat', 'centroid_latitude'] },
      { coluna: 'centroide_longitude', tipo: 'decimal', aliases: ['centroid_lng', 'centroid_lon', 'centroid_longitude'] },
      { coluna: 'estilo', tipo: 'json' },
      { coluna: 'preenchimento', tipo: 'texto', virtual: true, aliases: ['fill_color'] },
      { coluna: 'contorno_cor', tipo: 'texto', virtual: true, aliases: ['stroke_color'] },
      { coluna: 'opacidade_preenchimento', tipo: 'decimal', virtual: true, aliases: ['fill_opacity'] },
      { coluna: 'espessura', tipo: 'decimal', virtual: true, aliases: ['stroke_width'] },
      { coluna: 'cor', tipo: 'texto', virtual: true, aliases: ['color'] },
      { coluna: 'ordem_camada', tipo: 'inteiro', aliases: ['z_index'] },
      { coluna: 'buffer_exibicao_m', tipo: 'decimal', aliases: ['display_buffer_m'] },
      { coluna: 'descricao', tipo: 'texto_longo', aliases: ['description'] },
      { coluna: 'propriedades', tipo: 'json', aliases: ['properties_json'] },
      { coluna: 'fonte_url', tipo: 'url', limite: 500, aliases: ['source_url'] },
      { coluna: 'fonte_arquivo', tipo: 'texto', limite: 200, aliases: ['source_file'] },
      { coluna: 'fonte_sistema', tipo: 'texto', limite: 80, aliases: ['source_system'] },
      { coluna: 'fonte_camada', tipo: 'texto', limite: 120, aliases: ['source_layer'] },
      { coluna: 'fonte_feicao_id', tipo: 'texto', limite: 120, aliases: ['source_feature_id'] },
      { coluna: 'fonte_crs', tipo: 'texto', limite: 40, aliases: ['source_crs'] },
      { coluna: 'fonte_verificada_em', tipo: 'data', aliases: ['source_page_verified_at'] },
      { coluna: 'confianca', tipo: 'texto', limite: 80, aliases: ['confidence_flag'] },
      { coluna: 'qualidade', tipo: 'texto', limite: 80, aliases: ['quality_flag'] },
      { coluna: 'vigente_de', tipo: 'data', aliases: ['geometry_valid_from'] },
      { coluna: 'vigente_ate', tipo: 'data', aliases: ['geometry_valid_to'] },
      { coluna: 'sincronizado_em', tipo: 'datahora', aliases: ['last_synced_at'] },
      { coluna: 'importado_em', tipo: 'datahora', aliases: ['imported_at'] },
      { coluna: 'status', tipo: 'texto', opcoes: ['ativo', 'inativo'], traducao: { active: 'ativo', inactive: 'inativo' } },
    ],
  },
  fontes_portal: {
    tabela: 'fontes_portal',
    titulo: 'Fontes (portais)',
    chave: ['slug'],
    derivadas: ['estado', 'bloqueada_desde', 'ultimo_sucesso_em', 'ultimo_erro_em'],
    temVersao: true,
    modos: MODOS_CADASTRO,
    campos: [
      { coluna: 'slug', tipo: 'texto', limite: 60, aliases: ['source_id'] },
      { coluna: 'nome', tipo: 'texto', obrigatorio: true, limite: 80, aliases: ['source_name', 'portal'] },
      { coluna: 'tipo', tipo: 'texto', opcoes: ['portal', 'agregador', 'manual'], aliases: ['source_type'], traducao: { aggregator: 'agregador' } },
      { coluna: 'ativa', tipo: 'booleano', aliases: ['active'] },
      { coluna: 'frequencia', tipo: 'texto', opcoes: ['diaria', 'semanal', 'manual'], aliases: ['collection_frequency'], traducao: { daily: 'diaria', weekly: 'semanal' } },
      { coluna: 'url_base', tipo: 'url', obrigatorio: true, limite: 500, aliases: ['base_url'] },
      { coluna: 'parser', tipo: 'texto', aliases: ['parser_key'], opcoes: ['generico_html', 'generico_json', 'quintoandar', 'dfimoveis', 'wimoveis', 'imovelweb', 'vivareal'], traducao: { generic_html: 'generico_html', generic_json: 'generico_json' } },
      { coluna: 'config_parser', tipo: 'json', aliases: ['parser_config_json'] },
      { coluna: 'notas', tipo: 'texto_longo', aliases: ['notes'] },
    ],
  },
  anuncios: {
    tabela: 'anuncios',
    titulo: 'Anúncios',
    chave: ['id_legado'],
    derivadas: ['orientacao', 'preco_m2', 'preco_m2_calculado', 'divergencia_preco_m2_frac', 'preco_m2_divergente', 'pode_calcular_distancia', 'localidade_nome', 'fonte_id', 'h3_r9', 'origem_cadastro', 'property_id'],
    temVersao: true,
    modos: MODOS_CADASTRO,
    campos: [
      { coluna: 'id_legado', tipo: 'texto', limite: 200, aliases: ['listing_id'] },
      { coluna: 'portal', tipo: 'texto', obrigatorio: true, limite: 80 },
      { coluna: 'tipo_transacao', tipo: 'texto', obrigatorio: true, opcoes: ['venda', 'locacao'], aliases: ['transaction_type'], traducao: { sale: 'venda', rent: 'locacao', aluguel: 'locacao' } },
      { coluna: 'titulo', tipo: 'texto', obrigatorio: true, limite: 300, aliases: ['title'] },
      { coluna: 'url_fonte', tipo: 'url', obrigatorio: true, limite: 1000, aliases: ['source_url'] },
      { coluna: 'tipo_url_fonte', tipo: 'texto', limite: 40, aliases: ['source_url_type'] },
      { coluna: 'id_externo', tipo: 'texto', limite: 120, aliases: ['external_id'] },
      { coluna: 'codigo_portal', tipo: 'texto', limite: 120, aliases: ['portal_listing_code'] },
      { coluna: 'data_texto_portal', tipo: 'texto', limite: 40, aliases: ['portal_date_text'] },
      { coluna: 'status', tipo: 'texto', opcoes: ['ativo', 'inativo'], traducao: { active: 'ativo', inactive: 'inativo' } },
      { ...LOCALIDADE_REF, obrigatorio: true },
      { coluna: 'endereco', tipo: 'texto', limite: 300, aliases: ['address'] },
      { coluna: 'localidade_texto', tipo: 'texto', obrigatorio: true, limite: 120, aliases: ['locality'] },
      { coluna: 'latitude', tipo: 'decimal', obrigatorio: true },
      { coluna: 'longitude', tipo: 'decimal', obrigatorio: true },
      {
        coluna: 'precisao_coordenada', tipo: 'texto', obrigatorio: true, aliases: ['coordinate_precision'],
        opcoes: ['exata_fonte', 'centroide_localidade_jitter_deterministico', 'centroide_localidade_jitter', 'centroide_ra_jitter_deterministico', 'manual'],
        traducao: { locality_centroid_deterministic_jitter: 'centroide_localidade_jitter_deterministico', locality_centroid_jitter: 'centroide_localidade_jitter', ra_centroid_deterministic_jitter: 'centroide_ra_jitter_deterministico', exact: 'exata_fonte', source_exact: 'exata_fonte', exact_source: 'exata_fonte' },
      },
      { coluna: 'confianca', tipo: 'texto', obrigatorio: true, limite: 60, aliases: ['confidence_flag'] },
      { coluna: 'tipo_imovel', tipo: 'texto', obrigatorio: true, aliases: ['property_type'], opcoes: ['apartamento', 'casa', 'casa_condominio', 'kitnet', 'predio', 'terreno', 'nao_classificado'], traducao: { imovel: 'nao_classificado' } },
      { coluna: 'preco_pedido_brl', tipo: 'decimal', aliases: ['asking_price_brl'] },
      { coluna: 'area_m2', tipo: 'decimal' },
      { coluna: 'base_area', tipo: 'texto', limite: 40, aliases: ['area_basis'] },
      { coluna: 'preco_m2_informado_brl', tipo: 'decimal', aliases: ['asking_price_brl_m2'] },
      { coluna: 'quartos', tipo: 'inteiro', aliases: ['bedrooms'] },
      { coluna: 'suites', tipo: 'inteiro' },
      { coluna: 'vagas', tipo: 'inteiro', aliases: ['parking_spaces'] },
      { coluna: 'condominio_brl', tipo: 'decimal', aliases: ['condo_fee_brl'] },
      { coluna: 'iptu_brl', tipo: 'decimal' },
      { coluna: 'dias_publicado', tipo: 'inteiro', aliases: ['published_days'] },
      { coluna: 'visualizacoes', tipo: 'inteiro', aliases: ['views_count'] },
      { coluna: 'interessados', tipo: 'inteiro', aliases: ['interested_count'] },
      { coluna: 'qualidade', tipo: 'texto', obrigatorio: true, limite: 80, aliases: ['quality_flag'] },
      { coluna: 'situacao_regularizacao', tipo: 'texto', limite: 40, aliases: ['regularization_status'] },
      { coluna: 'observado_em', tipo: 'data', obrigatorio: true, aliases: ['observed_at'] },
      { coluna: 'visto_em', tipo: 'data', aliases: ['last_seen_at'] },
      { coluna: 'pagina_verificada_em', tipo: 'data', aliases: ['source_page_verified_at'] },
      { coluna: 'primeiro_visto_em', tipo: 'datahora', aliases: ['first_seen_at'] },
      { coluna: 'inativo_em', tipo: 'datahora', aliases: ['inactive_at'] },
      { coluna: 'verificado_em', tipo: 'datahora', aliases: ['last_checked_at'] },
      { coluna: 'preco_alterado_em', tipo: 'datahora', aliases: ['last_price_change_at'] },
      { coluna: 'hash_conteudo', tipo: 'texto', limite: 64, aliases: ['content_hash'] },
      { coluna: 'versao_parser', tipo: 'texto', limite: 60, aliases: ['parser_version'] },
      { coluna: 'falhas_verificacao', tipo: 'inteiro', aliases: ['verification_failures'] },
      {
        coluna: 'ultimo_status_verificacao', tipo: 'texto', aliases: ['last_check_status'],
        opcoes: ['ativa', 'inativa', 'inativa_pendente', 'bloqueada', 'erro', 'nunca'],
        traducao: { error: 'erro', active: 'ativa', inactive: 'inativa', blocked: 'bloqueada', never: 'nunca' },
      },
      { coluna: 'ultimo_http', tipo: 'inteiro', aliases: ['last_check_http_code'] },
      { coluna: 'ultima_mensagem', tipo: 'texto', limite: 500, aliases: ['last_check_message'] },
    ],
  },
  lancamentos: {
    tabela: 'lancamentos',
    titulo: 'Lançamentos',
    chave: ['id_legado'],
    derivadas: ['localidade_nome', 'preco_m2_calculado'],
    temVersao: true,
    modos: MODOS_CADASTRO,
    campos: [
      { coluna: 'id_legado', tipo: 'texto', limite: 120, aliases: ['development_id'] },
      { coluna: 'nome', tipo: 'texto', obrigatorio: true, limite: 200, aliases: ['name'] },
      { coluna: 'incorporadora', tipo: 'texto', limite: 200, aliases: ['developer_name'] },
      { coluna: 'endereco', tipo: 'texto', limite: 300, aliases: ['address'] },
      { coluna: 'latitude', tipo: 'decimal' },
      { coluna: 'longitude', tipo: 'decimal' },
      { coluna: 'espacial_utilizavel', tipo: 'booleano', aliases: ['spatial_usable'] },
      { coluna: 'status_coordenada', tipo: 'texto', limite: 80, aliases: ['coordinate_status'] },
      LOCALIDADE_REF,
      { coluna: 'bairro_texto', tipo: 'texto', obrigatorio: true, limite: 120, aliases: ['neighborhood'] },
      { coluna: 'produto', tipo: 'texto', limite: 300, aliases: ['product'] },
      { coluna: 'segmento', tipo: 'texto', limite: 80, aliases: ['segment'] },
      { coluna: 'status', tipo: 'texto', limite: 60 },
      { coluna: 'estagio_vendas', tipo: 'texto', opcoes: ['em_construcao', 'em_lancamento', 'oferta', 'encerrado'], aliases: ['sales_stage'] },
      { coluna: 'unidades_total', tipo: 'inteiro', aliases: ['units_total'] },
      { coluna: 'area_min_m2', tipo: 'decimal' },
      { coluna: 'area_max_m2', tipo: 'decimal' },
      { coluna: 'preco_atual_brl', tipo: 'decimal', aliases: ['current_price_brl'] },
      { coluna: 'preco_m2_atual_brl', tipo: 'decimal', aliases: ['current_price_brl_m2'] },
      { coluna: 'url_fonte', tipo: 'url', limite: 1000, aliases: ['source_url'] },
      { coluna: 'confianca', tipo: 'texto', obrigatorio: true, limite: 80, aliases: ['confidence_flag'] },
      { coluna: 'qualidade', tipo: 'texto', limite: 80, aliases: ['quality_flag'] },
      { coluna: 'verificado_em', tipo: 'data', obrigatorio: true, aliases: ['last_verified_at'] },
      { coluna: 'obra_frac', tipo: 'fracao', aliasesPct: ['work_progress_pct'] },
      { coluna: 'mix_unidades', tipo: 'texto', limite: 300, aliases: ['unit_mix'] },
      { coluna: 'entrega_prevista', tipo: 'data', aliases: ['expected_delivery'] },
      { coluna: 'orientacao', tipo: 'texto', opcoes: ['vertical', 'horizontal'], aliases: ['building_orientation'] },
      { coluna: 'situacao_regularizacao', tipo: 'texto', limite: 40, aliases: ['regularization_status'] },
      { coluna: 'unidades_estoque', tipo: 'inteiro' },
      { coluna: 'unidades_prontas_estoque', tipo: 'inteiro' },
      { coluna: 'primeiro_visto_em', tipo: 'datahora', aliases: ['first_seen_at'] },
    ],
  },
  ancoras: {
    tabela: 'ancoras',
    titulo: 'Âncoras',
    chave: ['id_legado'],
    derivadas: ['localidade_nome'],
    temVersao: true,
    modos: MODOS_CADASTRO,
    campos: [
      { coluna: 'id_legado', tipo: 'texto', limite: 120, aliases: ['place_id'] },
      { coluna: 'nome', tipo: 'texto', obrigatorio: true, limite: 200, aliases: ['name'] },
      { coluna: 'categoria', tipo: 'texto', obrigatorio: true, aliases: ['category'], opcoes: ['escola', 'mobilidade', 'parque_equipamento_publico', 'saude', 'shopping_center', 'supermercado_atacarejo', 'universidade'] },
      { coluna: 'subcategoria', tipo: 'texto', obrigatorio: true, limite: 80, aliases: ['subcategory'] },
      { coluna: 'grupo', tipo: 'texto', opcoes: ['infraestrutura', 'comercio_servico'], aliases: ['group'] },
      { coluna: 'segmento', tipo: 'texto', limite: 60, aliases: ['segment'] },
      { coluna: 'operador', tipo: 'texto', obrigatorio: true, limite: 200, aliases: ['operator_name'] },
      { coluna: 'marca', tipo: 'texto', limite: 120, aliases: ['brand_name'] },
      { coluna: 'endereco', tipo: 'texto', limite: 300, aliases: ['address'] },
      { coluna: 'latitude', tipo: 'decimal', obrigatorio: true },
      { coluna: 'longitude', tipo: 'decimal', obrigatorio: true },
      { coluna: 'precisao_coordenada', tipo: 'texto', obrigatorio: true, limite: 80, aliases: ['coordinate_precision'] },
      { coluna: 'confianca', tipo: 'texto', obrigatorio: true, limite: 40, aliases: ['confidence_flag'] },
      LOCALIDADE_REF,
      { coluna: 'bairro_texto', tipo: 'texto', limite: 120, aliases: ['neighborhood'] },
      { coluna: 'url_fonte', tipo: 'url', obrigatorio: true, limite: 1000, aliases: ['source_url'] },
      { coluna: 'url_fonte_coordenada', tipo: 'url', obrigatorio: true, limite: 1000, aliases: ['coordinate_source_url'] },
      { coluna: 'verificado_em', tipo: 'data', obrigatorio: true, aliases: ['last_verified_at'] },
      {
        coluna: 'status', tipo: 'texto', opcoes: ['ativa', 'inativa', 'prevista'],
        traduzir: (v) => (/^(active|ativ|em_operacao)/i.test(v) ? 'ativa' : /^(inactive|inativ|closed|fechad)/i.test(v) ? 'inativa' : /^(planned|previst|futur)/i.test(v) ? 'prevista' : v),
      },
      { coluna: 'escala_capacidade', tipo: 'texto', limite: 120, aliases: ['scale_capacity'] },
      { coluna: 'area_ocupada_m2', tipo: 'decimal', aliases: ['occupied_area_m2'] },
    ],
  },
  areas_estudo: {
    tabela: 'areas_estudo',
    titulo: 'Áreas de estudo',
    // Chave pelo nome: a área nasce pela tela ou por KMZ, e o CSV completa os demais campos.
    chave: ['nome'],
    derivadas: ['localidade_nome', 'responsavel_nome', 'autor_nome', 'area_m2', 'geometria_tipo', 'bbox_oeste', 'bbox_sul', 'bbox_leste', 'bbox_norte', 'geometria_hash', 'cidade_id', 'autor_id', 'contorno_id', 'arquivo_origem', 'pode_editar'],
    temVersao: true,
    modos: MODOS_CADASTRO,
    campos: [
      { coluna: 'nome', tipo: 'texto', obrigatorio: true, limite: 200 },
      { coluna: 'tipo', tipo: 'texto', obrigatorio: true, opcoes: ['propria', 'prospeccao', 'referencia'] },
      { coluna: 'estagio', tipo: 'texto', opcoes: ['sinal', 'hipotese', 'oportunidade', 'iniciativa', 'projeto', 'negocio_ativo', 'encerrada'] },
      { coluna: 'centroide_latitude', tipo: 'decimal', aliases: ['latitude'] },
      { coluna: 'centroide_longitude', tipo: 'decimal', aliases: ['longitude'] },
      { coluna: 'geometria', tipo: 'json' },
      LOCALIDADE_REF,
      { coluna: 'responsavel_id', tipo: 'inteiro' },
      { coluna: 'motivo_encerramento', tipo: 'texto', limite: 300 },
      { coluna: 'aprendizado', tipo: 'texto_longo' },
      { coluna: 'notas', tipo: 'texto_longo' },
    ],
  },
  ivv_mensal: {
    tabela: 'ivv_mensal',
    titulo: 'IVV mensal',
    chave: ['mes_referencia', 'escopo_segmento', 'escopo_mercado'],
    derivadas: ['cidade_id'],
    temVersao: false,
    semLixeira: true,
    // As 50 colunas derivadas publicadas (acumulados, variações, checagens) vão para `extras`, verbatim (5.7).
    extras: true,
    modos: MODOS_CADASTRO,
    campos: [
      { coluna: 'mes_referencia', tipo: 'texto', obrigatorio: true, aliases: ['reference_date', 'reference_month', 'period_id'] },
      { coluna: 'escopo_geografico', tipo: 'texto', limite: 60, aliases: ['geography_scope'] },
      { coluna: 'escopo_mercado', tipo: 'texto', limite: 60, aliases: ['market_scope'], traducao: { 'Mercado formal do DF - incorporadoras associadas à instituição que gera este relatório': 'Mercado formal do DF - incorporadoras associadas' } },
      { coluna: 'escopo_segmento', tipo: 'texto', limite: 60, aliases: ['segment_scope'] },
      { coluna: 'ivv_frac', tipo: 'fracao', aliases: ['ivv_pct'] },
      { coluna: 'oferta_unidades', tipo: 'inteiro', aliases: ['offers_units', 'offered_units'] },
      { coluna: 'vendas_unidades', tipo: 'inteiro', aliases: ['sales_units', 'sold_units'] },
      { coluna: 'lancamentos_unidades', tipo: 'inteiro', aliases: ['launches_units', 'launched_units'] },
      { coluna: 'lancamentos_empreendimentos', tipo: 'inteiro', aliases: ['launches_developments', 'launched_projects'] },
      { coluna: 'distratos_unidades', tipo: 'inteiro', aliases: ['cancellations_units'] },
      { coluna: 'oferta_area_m2', tipo: 'decimal', aliases: ['offer_area_m2', 'offered_area_m2'] },
      { coluna: 'area_vendida_m2', tipo: 'decimal', aliases: ['sold_area_m2'] },
      { coluna: 'preco_pedido_m2_brl', tipo: 'decimal', aliases: ['asking_price_brl_m2', 'offer_price_brl_m2'] },
      { coluna: 'preco_venda_m2_brl', tipo: 'decimal', aliases: ['sale_price_brl_m2'] },
      { coluna: 'vgo_brl_milhoes', tipo: 'decimal', aliases: ['vgo_brl_million'] },
      { coluna: 'vgv_brl_milhoes', tipo: 'decimal', aliases: ['vgv_brl_million'] },
      { coluna: 'vgl_brl_milhoes', tipo: 'decimal', aliases: ['vgl_brl_million'] },
      { coluna: 'distratos_sobre_vendas_frac', tipo: 'fracao', aliases: ['cancellations_to_sales_pct'] },
      { coluna: 'fonte_publicador', tipo: 'texto', limite: 200, aliases: ['source_publisher'] },
      { coluna: 'fonte_arquivo', tipo: 'texto', limite: 300, aliases: ['source_file'] },
      { coluna: 'fonte_url', tipo: 'url', limite: 1000, aliases: ['source_url'] },
      { coluna: 'fonte_relatorio_gerado_em', tipo: 'texto', limite: 60, aliases: ['source_report_generated_at'] },
      { coluna: 'filtro_relatorio', tipo: 'texto', limite: 300, aliases: ['report_filter'] },
      { coluna: 'fonte_codigo', tipo: 'texto', limite: 80, aliases: ['source_id'] },
      { coluna: 'localizador_fonte', tipo: 'texto', limite: 300, aliases: ['source_locator'] },
      { coluna: 'verificado_em', tipo: 'data', aliases: ['verified_at'] },
      { coluna: 'nota_cobertura', tipo: 'texto_longo', aliases: ['coverage_note'] },
      { coluna: 'qualidade', tipo: 'texto', limite: 60, aliases: ['quality_flag'] },
    ],
  },
  ivv_regional: {
    tabela: 'ivv_regional',
    titulo: 'IVV por localidade',
    chave: ['mes_referencia', 'nome_regiao_fonte', 'faixa_quartos'],
    derivadas: ['cidade_id', 'localidade_nome', 'agregado_total'],
    temVersao: false,
    semLixeira: true,
    modos: MODOS_CADASTRO,
    campos: [
      { coluna: 'mes_referencia', tipo: 'texto', obrigatorio: true, aliases: ['reference_month', 'reference_date'] },
      { coluna: 'nome_regiao_fonte', tipo: 'texto', obrigatorio: true, limite: 120, aliases: ['market_region'] },
      { coluna: 'faixa_quartos', tipo: 'texto', obrigatorio: true, aliases: ['bedroom_bucket'], opcoes: ['1Q', '2Q', '3Q', '4+Q', 'TOTAL'] },
      { ...LOCALIDADE_REF, aliases: ['localidade_codigo', 'localidade_id'] },
      { coluna: 'ofertadas', tipo: 'inteiro', aliases: ['offered_units'] },
      { coluna: 'vendidas', tipo: 'inteiro', aliases: ['sold_units'] },
      // A aba publica em pontos percentuais (12.5 = 12,5%); a app guarda fração.
      { coluna: 'ivv_publicado_frac', tipo: 'fracao', aliasesPct: ['ivv_pct_published', 'ivv_pct'] },
      { coluna: 'ivv_recalculado_frac', tipo: 'fracao', aliasesPct: ['ivv_pct_check'] },
      { coluna: 'ivv_variancia_pp', tipo: 'decimal', aliases: ['ivv_variance_pp'] },
      { coluna: 'preco_oferta_m2_brl', tipo: 'decimal', aliases: ['offer_price_brl_m2'] },
      { coluna: 'preco_venda_m2_brl', tipo: 'decimal', aliases: ['sale_price_brl_m2'] },
      { coluna: 'fonte_codigo', tipo: 'texto', limite: 80, aliases: ['source_id'] },
    ],
  },
  fipezap_mensal: {
    tabela: 'fipezap_mensal',
    titulo: 'FipeZap mensal',
    chave: ['mes_referencia', 'segmento', 'tipo_transacao', 'escopo_geografico', 'nome_localidade_fonte'],
    derivadas: ['cidade_id', 'localidade_nome'],
    temVersao: false,
    semLixeira: true,
    modos: MODOS_CADASTRO,
    campos: [
      { coluna: 'mes_referencia', tipo: 'texto', obrigatorio: true, aliases: ['reference_date', 'period_id'] },
      { coluna: 'segmento', tipo: 'texto', obrigatorio: true, aliases: ['segment_scope'], opcoes: ['residencial', 'comercial'], traduzir: (v) => v.toLowerCase() },
      { coluna: 'tipo_transacao', tipo: 'texto', obrigatorio: true, aliases: ['transaction_type'], opcoes: ['venda', 'locacao'], traduzir: (v) => v.toLowerCase().replace('ç', 'c') },
      { coluna: 'escopo_geografico', tipo: 'texto', obrigatorio: true, aliases: ['geography_scope'], opcoes: ['total', 'localidade'], traduzir: (v) => (/^df[_ ]?total$/i.test(v) ? 'total' : v.toLowerCase()) },
      { ...LOCALIDADE_REF, aliases: ['ra_geo_id', 'localidade_codigo', 'localidade_id'] },
      { coluna: 'nome_localidade_fonte', tipo: 'texto', limite: 120, aliases: ['source_locality_name'] },
      { coluna: 'nome_ra_fonte', tipo: 'texto', limite: 120, aliases: ['ra_name'] },
      { coluna: 'classificacao_geografica', tipo: 'texto', limite: 60, aliases: ['geography_classification'] },
      { coluna: 'unidade_preco', tipo: 'texto', aliases: ['price_unit'], opcoes: ['brl_m2', 'brl_m2_mes'], traduzir: (v) => (/m[eê]s|month/i.test(v) ? 'brl_m2_mes' : 'brl_m2') },
      { coluna: 'preco_m2_brl', tipo: 'decimal', aliases: ['price_brl_m2'] },
      { coluna: 'yield_mensal_oficial_frac', tipo: 'fracao', aliases: ['official_yield_monthly_pct'] },
      { coluna: 'yield_anual_oficial_frac', tipo: 'fracao', aliases: ['official_yield_annual_pct'] },
      { coluna: 'yield_mensal_calc_frac', tipo: 'fracao', aliases: ['calculated_yield_monthly_pct'] },
      { coluna: 'yield_anual_calc_frac', tipo: 'fracao', aliases: ['calculated_yield_annual_pct'] },
      { coluna: 'variacao_mom_frac', tipo: 'decimal', aliases: ['price_mom_pct_change'] },
      { coluna: 'variacao_ytd_frac', tipo: 'decimal', aliases: ['price_ytd_pct_change'] },
      { coluna: 'variacao_yoy_frac', tipo: 'decimal', aliases: ['price_yoy_pct_change'] },
      { coluna: 'meses_aluguel_para_pagar', tipo: 'decimal', aliases: ['price_to_rent_months'] },
      { coluna: 'diff_vs_total_frac', tipo: 'decimal', aliases: ['diff_vs_df_pct'] },
      { coluna: 'rank_preco', tipo: 'inteiro', aliases: ['rank_price'] },
      { coluna: 'rank_yoy', tipo: 'inteiro', aliases: ['rank_yoy'] },
      { coluna: 'amostra_n', tipo: 'inteiro', aliases: ['sample_n'] },
      { coluna: 'fonte_publicador', tipo: 'texto', limite: 200, aliases: ['source_publisher'] },
      { coluna: 'fonte_tipo', tipo: 'texto', limite: 60, aliases: ['source_type'] },
      { coluna: 'fonte_url', tipo: 'url', limite: 1000, aliases: ['source_url'] },
      { coluna: 'fonte_pagina', tipo: 'texto', limite: 120, aliases: ['source_page'] },
      { coluna: 'fonte_pasta_trabalho', tipo: 'texto', limite: 300, aliases: ['source_workbook'] },
      { coluna: 'fonte_codigo', tipo: 'texto', limite: 80, aliases: ['source_id'] },
      { coluna: 'nota_codigo', tipo: 'texto', limite: 80, aliases: ['note_id'] },
      { coluna: 'qualidade', tipo: 'texto', limite: 60, aliases: ['quality_flag'] },
      { coluna: 'notas', tipo: 'texto_longo', aliases: ['notes'] },
    ],
  },
  procedencias: {
    tabela: 'procedencias',
    titulo: 'Procedências (fontes e notas FipeZap, guia PDAD)',
    chave: ['familia', 'codigo'],
    derivadas: [],
    temVersao: false,
    semLixeira: true,
    // As colunas de cada aba ficam verbatim em `extras` (P-03: cabeçalho exato pendente).
    extras: true,
    modos: MODOS_CADASTRO,
    campos: [
      { coluna: 'familia', tipo: 'texto', obrigatorio: true, opcoes: ['fipezap_fonte', 'fipezap_nota', 'pdad_guia'] },
      { coluna: 'codigo', tipo: 'texto', obrigatorio: true, limite: 80, aliases: ['source_id', 'note_id', 'guide_id', 'key'] },
      { coluna: 'titulo', tipo: 'texto', limite: 300, aliases: ['title', 'source_title', 'note_title'] },
      { coluna: 'texto', tipo: 'texto_longo', aliases: ['text', 'note_text', 'description'] },
      { coluna: 'url', tipo: 'url', limite: 1000, aliases: ['source_url'] },
      { coluna: 'periodo_de', tipo: 'data', aliases: ['period_start'] },
      { coluna: 'periodo_ate', tipo: 'data', aliases: ['period_end'] },
    ],
  },
  pdad_observacoes: {
    tabela: 'pdad_observacoes',
    titulo: 'PDAD (observações)',
    chave: ['localidade_id', 'ano', 'codigo_indicador', 'valor_segmento', 'categoria_padrao'],
    derivadas: ['localidade_nome', 'ra_name'],
    temVersao: false,
    semLixeira: true,
    modos: MODOS_CADASTRO,
    campos: [
      { ...LOCALIDADE_REF, obrigatorio: true },
      { coluna: 'ano', tipo: 'inteiro', obrigatorio: true, aliases: ['pdad_year'] },
      { coluna: 'escopo_geografia', tipo: 'texto', limite: 20, aliases: ['geography_scope'] },
      { coluna: 'numero_figura', tipo: 'texto', limite: 20, aliases: ['figure_number'] },
      { coluna: 'numero_tabela', tipo: 'texto', limite: 20, aliases: ['table_number'] },
      { coluna: 'secao', tipo: 'texto', limite: 80, aliases: ['section'] },
      { coluna: 'codigo_indicador', tipo: 'texto', obrigatorio: true, limite: 80, aliases: ['indicator_code'] },
      { coluna: 'nome_indicador', tipo: 'texto', limite: 200, aliases: ['indicator_name'] },
      { coluna: 'universo', tipo: 'texto', limite: 300, aliases: ['universe'] },
      { coluna: 'dimensao_segmento', tipo: 'texto', limite: 120, aliases: ['segment_dimension'] },
      { coluna: 'valor_segmento', tipo: 'texto', limite: 120, aliases: ['segment_value'] },
      { coluna: 'categoria_resposta', tipo: 'texto', limite: 200, aliases: ['response_category'] },
      { coluna: 'categoria_padrao', tipo: 'texto', obrigatorio: true, limite: 120, aliases: ['category_standard'] },
      { coluna: 'categoria_bruta', tipo: 'texto', limite: 200, aliases: ['category_raw'] },
      { coluna: 'estimativa_total', tipo: 'decimal', aliases: ['estimate_total'] },
      // A aba publica em pontos percentuais (12.5 = 12,5%); a app guarda fração.
      { coluna: 'estimativa_frac', tipo: 'fracao', aliasesPct: ['estimate_pct'] },
      { coluna: 'status_valor', tipo: 'texto', obrigatorio: true, aliases: ['source_value_status'], opcoes: ['publicado', 'parcial', 'suprimido'], traducao: { published: 'publicado', partial: 'parcial', suppressed: 'suprimido' } },
      { coluna: 'origem_valor', tipo: 'texto', aliases: ['value_origin'], opcoes: ['publicado', 'parcial_publicado', 'calculado', 'suprimido'], traducao: { published: 'publicado', partial_published: 'parcial_publicado', calculated: 'calculado', suppressed: 'suprimido' } },
      { coluna: 'pagina_figura', tipo: 'inteiro', aliases: ['figure_pdf_page'] },
      { coluna: 'pagina_tabela', tipo: 'inteiro', aliases: ['table_pdf_page'] },
      { coluna: 'arquivo_fonte', tipo: 'texto', limite: 300, aliases: ['source_file'] },
      { coluna: 'instituicao_fonte', tipo: 'texto', limite: 200, aliases: ['source_institution'] },
      { coluna: 'base_extracao', tipo: 'texto', limite: 200, aliases: ['extraction_basis'] },
      { coluna: 'localizador_fonte', tipo: 'texto', limite: 300, aliases: ['source_locator'] },
      { coluna: 'notas', tipo: 'texto_longo', aliases: ['notes'] },
      { coluna: 'erro_padrao', tipo: 'decimal', aliases: ['standard_error'] },
      { coluna: 'cv_frac', tipo: 'fracao', aliases: ['cv'] },
      { coluna: 'figure_segmentation', tipo: 'texto', virtual: true },
      { coluna: 'figure_data_structure', tipo: 'texto', virtual: true },
      { coluna: 'figure_fields_to_capture', tipo: 'texto', virtual: true },
      { coluna: 'figure_preferred', tipo: 'texto', virtual: true },
      { coluna: 'figure_extraction_rule', tipo: 'texto', virtual: true },
      { coluna: 'figure_quality_notes', tipo: 'texto', virtual: true },
      { coluna: 'figure_map_status', tipo: 'texto', virtual: true },
    ],
  },
  pdad_figuras: {
    tabela: 'pdad_figuras',
    titulo: 'PDAD (mapa de figuras)',
    chave: ['codigo_indicador'],
    derivadas: [],
    temVersao: false,
    semLixeira: true,
    extras: true,
    modos: MODOS_CADASTRO,
    campos: [
      { coluna: 'codigo_indicador', tipo: 'texto', obrigatorio: true, limite: 80, aliases: ['indicator_code'] },
      { coluna: 'numero_figura', tipo: 'texto', limite: 20, aliases: ['figure_number'] },
      { coluna: 'numero_tabela', tipo: 'texto', limite: 20, aliases: ['table_number'] },
      { coluna: 'secao', tipo: 'texto', limite: 80, aliases: ['section'] },
      { coluna: 'nome_indicador', tipo: 'texto', limite: 200, aliases: ['indicator_name'] },
    ],
  },
};

/** Cabeçalho normalizado para comparação: minúsculo, sem acento, sem espaço nas pontas. */
export function normalizarCabecalho(c: string): string {
  return c
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export interface MapeamentoColuna {
  indice: number;
  cabecalho: string;
  campo: CampoImport;
  /** Veio por um alias em pontos percentuais: dividir por 100. */
  pct: boolean;
  /** Outros cabeçalhos do mesmo campo, lidos em ordem quando a célula principal está vazia. */
  alternativas: { indice: number; pct: boolean }[];
}

export interface ColunaIgnorada {
  cabecalho: string;
  /** `extras`: coluna sem campo próprio guardada verbatim no json `extras` da linha (sem perda). */
  motivo: 'derivada' | 'desconhecida' | 'repetida' | 'extras';
}

/**
 * Mapeia o cabeçalho do CSV para os campos da tabela: nome exato primeiro,
 * depois alias. Coluna derivada ou desconhecida é ignorada com aviso, nunca
 * rejeita a linha (T9). `atr_<codigo>` fica para o motor (atributos).
 */
export function mapearCabecalho(def: TabelaImport, cabecalho: string[]): { colunas: MapeamentoColuna[]; ignoradas: ColunaIgnorada[]; atributos: { indice: number; codigo: string }[]; extras: { indice: number; nome: string }[]; variante: string | null; campos: CampoImport[] } {
  const normalizados = cabecalho.map(normalizarCabecalho);
  const variante = def.variantes?.find((v) => normalizados.includes(v.detecta)) ?? null;
  if (variante) {
    def = {
      ...def,
      campos: def.campos.map((c) => ({
        ...c,
        ...(variante.aliases[c.coluna] ? { aliases: variante.aliases[c.coluna], aliasesPct: [] } : {}),
        ...(variante.opcionais?.includes(c.coluna) ? { obrigatorio: false } : {}),
      })),
    };
  }
  const colunas: MapeamentoColuna[] = [];
  const ignoradas: ColunaIgnorada[] = [];
  const atributos: { indice: number; codigo: string }[] = [];
  const extras: { indice: number; nome: string }[] = [];
  const usados = new Set<string>();
  const derivadas = new Set([...DERIVADAS_COMUNS, ...def.derivadas]);
  const porNome = new Map<string, { campo: CampoImport; pct: boolean; prioridade: number }>();
  for (const campo of def.campos) {
    porNome.set(campo.coluna, { campo, pct: false, prioridade: 0 });
    for (const a of campo.aliases ?? []) if (!porNome.has(a)) porNome.set(a, { campo, pct: false, prioridade: 1 });
    for (const a of campo.aliasesPct ?? []) if (!porNome.has(a)) porNome.set(a, { campo, pct: true, prioridade: 1 });
  }
  const candidatos = cabecalho.map((bruto, indice) => ({ bruto, indice, nome: normalizarCabecalho(bruto) }));
  // Nome exato vence alias quando os dois aparecem (ex.: `codigo` e `ra_geo_id`).
  const prioridade = (nome: string) => {
    const alvo = porNome.get(nome);
    if (!alvo) return 99;
    if (alvo.prioridade === 0) return 0;
    const ordemAlias = [...(alvo.campo.aliases ?? []), ...(alvo.campo.aliasesPct ?? [])].indexOf(nome);
    return 1 + (ordemAlias < 0 ? 50 : ordemAlias);
  };
  const ordem = [...candidatos].sort((a, b) => prioridade(a.nome) - prioridade(b.nome));
  for (const { bruto, indice, nome } of ordem) {
    if (nome === '') continue;
    const atr = /^atr_([a-z][a-z0-9_]*)$/.exec(nome);
    if (atr) {
      atributos.push({ indice, codigo: atr[1] });
      continue;
    }
    const alvo = porNome.get(nome);
    if (alvo) {
      if (usados.has(alvo.campo.coluna)) {
        const principal = colunas.find((c) => c.campo.coluna === alvo.campo.coluna)!;
        principal.alternativas.push({ indice, pct: alvo.pct });
        continue;
      }
      usados.add(alvo.campo.coluna);
      colunas.push({ indice, cabecalho: bruto, campo: alvo.campo, pct: alvo.pct, alternativas: [] });
      continue;
    }
    if (def.extras && !derivadas.has(nome)) {
      extras.push({ indice, nome });
      ignoradas.push({ cabecalho: bruto, motivo: 'extras' });
      continue;
    }
    ignoradas.push({ cabecalho: bruto, motivo: derivadas.has(nome) ? 'derivada' : 'desconhecida' });
  }
  colunas.sort((a, b) => a.indice - b.indice);
  ignoradas.sort((a, b) => cabecalho.indexOf(a.cabecalho) - cabecalho.indexOf(b.cabecalho));
  return { colunas, ignoradas, atributos, extras, variante: variante?.nome ?? null, campos: def.campos };
}

/** Cabeçalho do modelo baixável: as colunas canônicas, na ordem do catálogo. */
export function cabecalhoModelo(def: TabelaImport, atributos: string[] = []): string[] {
  return [...def.campos.map((c) => c.coluna), ...atributos.map((a) => `atr_${a}`)];
}
