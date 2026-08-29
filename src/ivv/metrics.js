// Registro de métricas do IVV_MONTHLY — a série mensal do mercado residencial do DF.
//
// PROPÓSITO: a política de agregação por período é DADO, não `if` espalhado pelo código.
// Somar `offers_units` de doze meses devolve doze vezes o estoque real — um número plausível,
// bem formatado e errado, que ninguém percebe olhando a tela. A única defesa possível é
// declarar a natureza de cada coluna num lugar só, auditável, e recusar agregar o que não
// estiver declarado (R5.7: nada de fallback silencioso — coluna desconhecida não cai em SUM).
//
// Funções puras. Sem DOM, sem rede.

/**
 * Vocabulário FECHADO de naturezas de métrica. Acrescentar um valor aqui é uma decisão
 * de metodologia, não de implementação — e obriga `aggregate.js` a saber o que fazer com ele.
 */
export const METRIC_KINDS = Object.freeze({
  /** Fluxo do mês: acontece dentro do mês e se acumula. Agrega por SOMA. */
  FLUXO: 'fluxo',
  /** Estoque: fotografia do mês, não se acumula. Agrega por MÉDIA do período. */
  ESTOQUE: 'estoque',
  /** Preço: razão ponderada SUM(valor)/SUM(área). NUNCA média simples das razões mensais. */
  PRECO: 'preco',
  /** Taxa: metodologia própria (razão ponderada de fluxo sobre estoque). Nunca média cega. */
  TAXA: 'taxa',
  /** Não somável entre meses: agregar produziria um número sem significado. */
  NAO_SOMAVEL: 'nao_somavel',
});

const KIND_VALUES = Object.freeze(Object.values(METRIC_KINDS));

/**
 * Papéis de coluna. Só `metrica` participa da agregação de período; os demais existem para
 * serem lidos ou confrontados, nunca agregados.
 */
export const COLUMN_ROLES = Object.freeze({
  /** Métrica publicada, com entrada em IVV_METRICS. */
  METRICA: 'metrica',
  /** Acumulado do ano já pronto no backend (`*_ytd`). Não se soma: lê-se o último mês. */
  ACUMULADO_ANO: 'acumulado_ano',
  /** Recálculo/divergência do backend (`*_calc_*`, `*_diff_*`). SINALIZA, nunca substitui. */
  VERIFICACAO: 'verificacao',
  /** Variação entre períodos (`*_mom_*`, `*_yoy_*`). Grandezas distintas, nunca agregadas. */
  VARIACAO: 'variacao',
  /** Texto, data ou procedência. Não é número de mercado. */
  METADADO: 'metadado',
  /** Coluna que ninguém declarou. Agregar é proibido — ver `aggregate.js`. */
  DESCONHECIDO: 'desconhecido',
});

/**
 * ESCALA — armadilha documentada, não detalhe.
 *
 * Em IVV_MONTHLY, `ivv_pct = 0.057` significa 5,7% (fração decimal). Isso é o OPOSTO de
 * RA_PROFILES, onde `54` significa 54%. As duas escalas NUNCA se unificam: uma conversão
 * "de conveniência" entre elas erra por 100× em silêncio (mesma família de R8.44).
 *
 * A semente `migration/imob-intelligence-backend.xlsx` (schema v1.0.0, 1 linha) grava a taxa
 * como `6.5`, ou seja, em pontos percentuais. Trazer o valor para a escala decimal é
 * responsabilidade do normalizador (issue #56); aqui o registro apenas declara a escala
 * esperada e `aggregate.js` avisa quando o dado chega fora dela.
 */
export const IVV_PCT_SCALE = Object.freeze({
  unit: 'fracao',
  /** Acima disto o valor certamente não é fração decimal — 100% de IVV mensal já é irreal. */
  maxPlausible: 1,
});

/** Tolerância relativa ao confrontar valor publicado com valor recalculado. */
export const DIVERGENCE_TOLERANCE = 0.005; // 0,5%

/**
 * Registro de métricas. Uma entrada por métrica publicada.
 *
 * Campos:
 * - `key`     nome da coluna no dataset
 * - `label`   rótulo em português, para a tela
 * - `unit`    'unidades' | 'm2' | 'brl_milhoes' | 'brl_m2' | 'fracao'
 * - `kind`    natureza (METRIC_KINDS) — define a operação de agregação
 * - `ytdColumn` coluna de acumulado do ano pronta no backend, quando existe
 * - `numerator`/`denominator`  só para `preco` e `taxa`: as colunas da razão ponderada
 * - `numeratorScale` fator que leva o numerador à unidade do resultado (VGO em milhões → reais)
 * - `note`    por que a operação é essa
 *
 * ATENÇÃO ao acrescentar coluna: uma métrica sem entrada aqui é recusada pelo motor e quebra
 * `tests/ivv-metrics.test.js`. É de propósito.
 */
export const IVV_METRICS = Object.freeze([
  // ---------- FLUXO: soma ----------
  {
    key: 'sales_units',
    label: 'Unidades vendidas',
    unit: 'unidades',
    kind: METRIC_KINDS.FLUXO,
    ytdColumn: 'sales_units_ytd',
    note: 'Venda ocorre dentro do mês; doze meses de vendas são a venda do ano.',
  },
  {
    key: 'launches_units',
    label: 'Unidades lançadas',
    unit: 'unidades',
    kind: METRIC_KINDS.FLUXO,
    ytdColumn: 'launches_units_ytd',
    note: 'Lançamento é evento datado.',
  },
  {
    key: 'sold_area_m2',
    label: 'Área vendida',
    unit: 'm2',
    kind: METRIC_KINDS.FLUXO,
    ytdColumn: 'sold_area_m2_ytd',
    note: 'Área das unidades vendidas no mês.',
  },
  {
    key: 'vgv_brl_million',
    label: 'VGV (valor geral de vendas)',
    unit: 'brl_milhoes',
    kind: METRIC_KINDS.FLUXO,
    ytdColumn: 'vgv_brl_million_ytd',
    note: 'Valor das vendas realizadas no mês.',
  },
  {
    key: 'vgl_brl_million',
    label: 'VGL (valor geral de lançamentos)',
    unit: 'brl_milhoes',
    kind: METRIC_KINDS.FLUXO,
    ytdColumn: 'vgl_brl_million_ytd',
    note: 'Valor dos lançamentos do mês.',
  },
  {
    key: 'cancellations_units',
    label: 'Unidades distratadas',
    unit: 'unidades',
    kind: METRIC_KINDS.FLUXO,
    ytdColumn: 'cancellations_units_ytd',
    note: 'Distrato é evento do mês.',
  },

  // ---------- ESTOQUE: média do período ----------
  {
    key: 'offers_units',
    label: 'Unidades em oferta',
    unit: 'unidades',
    kind: METRIC_KINDS.ESTOQUE,
    note: 'Fotografia do estoque no mês. Somar doze meses devolve doze vezes o estoque real.',
  },
  {
    key: 'offer_area_m2',
    label: 'Área em oferta',
    unit: 'm2',
    kind: METRIC_KINDS.ESTOQUE,
    note: 'Estoque de área, não área acumulada.',
  },
  {
    key: 'vgo_brl_million',
    label: 'VGO (valor geral de oferta)',
    unit: 'brl_milhoes',
    kind: METRIC_KINDS.ESTOQUE,
    note: 'Valor do estoque ofertado no mês.',
  },

  // ---------- PREÇO: razão ponderada ----------
  {
    key: 'asking_price_brl_m2',
    label: 'Preço pedido por m²',
    unit: 'brl_m2',
    kind: METRIC_KINDS.PRECO,
    numerator: 'vgo_brl_million',
    numeratorScale: 1e6,
    denominator: 'offer_area_m2',
    note: 'SUM(VGO)×1e6 / SUM(área ofertada). Média simples ignoraria o peso de cada mês.',
  },
  {
    key: 'sale_price_brl_m2',
    label: 'Preço de venda por m²',
    unit: 'brl_m2',
    kind: METRIC_KINDS.PRECO,
    numerator: 'vgv_brl_million',
    numeratorScale: 1e6,
    denominator: 'sold_area_m2',
    note: 'SUM(VGV)×1e6 / SUM(área vendida). É preço realizado, não preço pedido (R3.7).',
  },

  // ---------- TAXA ----------
  {
    key: 'ivv_pct',
    label: 'IVV (índice de velocidade de vendas)',
    unit: 'fracao',
    kind: METRIC_KINDS.TAXA,
    numerator: 'sales_units',
    numeratorScale: 1,
    denominator: 'offers_units',
    ytdColumn: 'ivv_ytd_pct',
    note:
      'Mês a mês é vendas/oferta. No período, razão ponderada SUM(vendas)/SUM(oferta) — que é a '
      + 'média das taxas mensais ponderada pelo estoque, não a média aritmética cega. '
      + 'Escala decimal: 0.057 = 5,7%.',
  },

  // ---------- NÃO SOMÁVEL ----------
  {
    key: 'launches_developments',
    label: 'Empreendimentos lançados',
    unit: 'unidades',
    kind: METRIC_KINDS.NAO_SOMAVEL,
    note:
      'Um mesmo empreendimento pode aparecer em mais de um mês; somar conta o mesmo prédio '
      + 'duas vezes. Sem o identificador do empreendimento não há como deduplicar.',
  },
]);

/** Índice por chave. */
export const METRIC_BY_KEY = Object.freeze(
  Object.fromEntries(IVV_METRICS.map((metric) => [metric.key, metric])),
);

/** Chaves das métricas, na ordem de declaração. */
export const METRIC_KEYS = Object.freeze(IVV_METRICS.map((metric) => metric.key));

/**
 * Colunas não numéricas / de procedência. Declaradas para que a checagem de cobertura
 * distinga "não é métrica" de "ninguém classificou".
 */
export const IVV_METADATA_COLUMNS = Object.freeze([
  'reference_date',   // eixo temporal canônico (YYYY-MM-DD)
  'reference_month',  // rótulo do mês, redundante com reference_date
  'source_id',
  'source_locator',
  'verified_at',
  'coverage_note',
]);

/**
 * Aliases do schema v1.0.0 (semente `.xlsx`) para as chaves canônicas.
 *
 * A semente é deliberadamente anterior ao schema em vigor (ver `migration/README.md`) e usa
 * outros nomes para as mesmas grandezas. Declarar o mapa aqui impede que uma dessas colunas
 * chegue ao motor como "desconhecida" — e, principalmente, que caia num SUM por omissão.
 * A tradução em si é trabalho do normalizador (issue #56).
 */
export const LEGACY_COLUMN_ALIASES = Object.freeze({
  offered_units: 'offers_units',
  sold_units: 'sales_units',
  launched_units: 'launches_units',
  launched_projects: 'launches_developments',
  offer_price_brl_m2: 'asking_price_brl_m2',
  offered_area_m2: 'offer_area_m2',
});

/**
 * Famílias derivadas, reconhecidas por sufixo/infixo sobre uma métrica JÁ declarada.
 *
 * A exigência de resolver a base no registro é o que impede a regra de virar peneira:
 * `sales_units_ytd` classifica porque `sales_units` existe; `indicador_novo_ytd` não classifica,
 * porque `indicador_novo` não existe. Coluna nova continua quebrando o teste de cobertura.
 */
const DERIVED_FAMILIES = Object.freeze([
  {
    role: COLUMN_ROLES.ACUMULADO_ANO,
    pattern: /^(?<base>.+?)_ytd(?:_[a-z0-9_]+)?$/,
    reason: 'Acumulado do ano já calculado pelo backend: lê-se o último mês, não se soma.',
  },
  {
    role: COLUMN_ROLES.VERIFICACAO,
    pattern: /^(?<base>.+?)_(?:calc|check)(?:_[a-z0-9_]+)?$/,
    reason: 'Recálculo do backend. Serve para sinalizar divergência, nunca para substituir.',
  },
  {
    role: COLUMN_ROLES.VERIFICACAO,
    pattern: /^(?<base>.+?)_(?:diff|variance)(?:_[a-z0-9_]+)?$/,
    reason: 'Divergência entre publicado e recalculado. Sinaliza, não substitui.',
  },
  {
    role: COLUMN_ROLES.VARIACAO,
    pattern: /^(?<base>.+?)_(?:mom|yoy)(?:_[a-z0-9_]+)?$/,
    reason:
      'Variação entre períodos. `_pp` (pontos percentuais) e `_pct_change` (variação relativa) '
      + 'são grandezas diferentes e nunca se misturam: +1 p.p. e +20% podem descrever o mesmo '
      + 'movimento. Agregar qualquer uma das duas entre meses não tem significado.',
  },
]);

/** Nomes derivados que o backend escreve sobre `ivv_pct` sem repetir o sufixo `_pct`. */
const IVV_DERIVED_PREFIX_BASE = Object.freeze({
  ivv: 'ivv_pct',
});

function resolveBase(base) {
  if (METRIC_BY_KEY[base]) return METRIC_BY_KEY[base];
  if (IVV_DERIVED_PREFIX_BASE[base]) return METRIC_BY_KEY[IVV_DERIVED_PREFIX_BASE[base]];
  // `ivv_calc_pct`, `ivv_ytd_pct`: o sufixo de unidade fica depois do marcador da família.
  const withoutUnit = base.replace(/_pct$/, '');
  if (METRIC_BY_KEY[withoutUnit]) return METRIC_BY_KEY[withoutUnit];
  if (IVV_DERIVED_PREFIX_BASE[withoutUnit]) return METRIC_BY_KEY[IVV_DERIVED_PREFIX_BASE[withoutUnit]];
  return null;
}

/**
 * Classifica uma coluna do dataset.
 *
 * @param {string} column nome da coluna
 * @returns {{ role: string, kind: string|null, metric: object|null, canonicalKey: string|null,
 *             legacyOf: string|null, reason: string|null }}
 */
export function classifyColumn(column) {
  const empty = {
    role: COLUMN_ROLES.DESCONHECIDO, kind: null, metric: null,
    canonicalKey: null, legacyOf: null, reason: null,
  };
  if (typeof column !== 'string' || column.length === 0) return empty;

  const metric = METRIC_BY_KEY[column];
  if (metric) {
    return {
      role: COLUMN_ROLES.METRICA, kind: metric.kind, metric,
      canonicalKey: metric.key, legacyOf: null, reason: metric.note,
    };
  }

  const canonical = LEGACY_COLUMN_ALIASES[column];
  if (canonical) {
    const target = METRIC_BY_KEY[canonical];
    return {
      role: COLUMN_ROLES.METRICA, kind: target.kind, metric: target,
      canonicalKey: canonical, legacyOf: column,
      reason: `Nome do schema v1.0.0 (semente) para \`${canonical}\`.`,
    };
  }

  if (IVV_METADATA_COLUMNS.includes(column)) {
    return { ...empty, role: COLUMN_ROLES.METADADO };
  }

  for (const family of DERIVED_FAMILIES) {
    const match = family.pattern.exec(column);
    if (!match) continue;
    const base = resolveBase(match.groups.base);
    if (!base) continue;
    return {
      role: family.role, kind: null, metric: base,
      canonicalKey: base.key, legacyOf: null, reason: family.reason,
    };
  }

  return empty;
}

/** Verdadeiro quando a coluna tem classificação declarada. */
export function isDeclaredColumn(column) {
  return classifyColumn(column).role !== COLUMN_ROLES.DESCONHECIDO;
}

/** Métrica por chave, ou `null`. Não inventa entrada. */
export function getMetric(key) {
  return METRIC_BY_KEY[key] || null;
}

/** Métricas de uma natureza. */
export function metricsByKind(kind) {
  return IVV_METRICS.filter((metric) => metric.kind === kind);
}

/** Naturezas válidas — exposto para os testes fecharem o vocabulário. */
export function metricKindValues() {
  return KIND_VALUES.slice();
}
