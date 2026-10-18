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
  /** Modos permitidos; `substituir_tudo` só em série publicada. */
  modos: ModoDuplicata[];
}

export type ModoDuplicata = 'ignorar' | 'atualizar' | 'substituir_tudo' | 'falhar';
export const MODOS_CADASTRO: ModoDuplicata[] = ['ignorar', 'atualizar', 'falhar'];

/** Automáticas do framework e de controle: sempre derivadas na importação. */
export const DERIVADAS_COMUNS = ['id', 'criado_em', 'atualizado_em', 'versao', 'removido_em', 'removido_por_id', 'importacao_id'];

const LOCALIDADE_REF: CampoImport = {
  coluna: 'localidade',
  tipo: 'texto',
  virtual: true,
  aliases: ['ra_geo_id', 'localidade_codigo', 'ra'],
};

export const TABELAS_IMPORT: Record<string, TabelaImport> = {
  localidades: {
    tabela: 'localidades',
    titulo: 'Localidades',
    chave: ['tipo', 'codigo'],
    derivadas: ['cidade', 'localidade_pai_nome', 'perfil_ano'],
    temVersao: true,
    modos: MODOS_CADASTRO,
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
  motivo: 'derivada' | 'desconhecida' | 'repetida';
}

/**
 * Mapeia o cabeçalho do CSV para os campos da tabela: nome exato primeiro,
 * depois alias. Coluna derivada ou desconhecida é ignorada com aviso, nunca
 * rejeita a linha (T9). `atr_<codigo>` fica para o motor (atributos).
 */
export function mapearCabecalho(def: TabelaImport, cabecalho: string[]): { colunas: MapeamentoColuna[]; ignoradas: ColunaIgnorada[]; atributos: { indice: number; codigo: string }[] } {
  const colunas: MapeamentoColuna[] = [];
  const ignoradas: ColunaIgnorada[] = [];
  const atributos: { indice: number; codigo: string }[] = [];
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
    ignoradas.push({ cabecalho: bruto, motivo: derivadas.has(nome) ? 'derivada' : 'desconhecida' });
  }
  colunas.sort((a, b) => a.indice - b.indice);
  ignoradas.sort((a, b) => cabecalho.indexOf(a.cabecalho) - cabecalho.indexOf(b.cabecalho));
  return { colunas, ignoradas, atributos };
}

/** Cabeçalho do modelo baixável: as colunas canônicas, na ordem do catálogo. */
export function cabecalhoModelo(def: TabelaImport, atributos: string[] = []): string[] {
  return [...def.campos.map((c) => c.coluna), ...atributos.map((a) => `atr_${a}`)];
}
