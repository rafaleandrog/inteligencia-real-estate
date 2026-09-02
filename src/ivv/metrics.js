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
    ytdColumn: 'offers_units_ytd_avg',
    note: 'Fotografia do estoque no mês. Somar doze meses devolve doze vezes o estoque real.',
  },
  {
    key: 'offer_area_m2',
    label: 'Área em oferta',
    unit: 'm2',
    kind: METRIC_KINDS.ESTOQUE,
    ytdColumn: 'offer_area_m2_ytd_avg',
    note: 'Estoque de área, não área acumulada.',
  },
  {
    key: 'vgo_brl_million',
    label: 'VGO (valor geral de oferta)',
    unit: 'brl_milhoes',
    kind: METRIC_KINDS.ESTOQUE,
    ytdColumn: 'vgo_brl_million_ytd_avg',
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
    ytdColumn: 'asking_price_ytd_brl_m2',
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
    ytdColumn: 'sale_price_ytd_brl_m2',
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
 * Séries DERIVADAS plotáveis — issue #83.
 *
 * Registro separado, e separado de propósito. `cancellations_to_sales_pct` é razão que o
 * backend publica mês a mês: dá uma linha honesta no gráfico e NÃO dá um card de período,
 * porque agregar razão de meses diferentes é a armadilha que `METRIC_KINDS` existe para
 * impedir. Colocá-la em `IVV_METRICS` exigiria inventar um `kind` para ela, e o motor
 * passaria a poder somá-la; deixá-la solta faria o gráfico ler coluna não declarada.
 *
 * Por isso a entrada não tem `kind`: é o que declara, na própria forma do dado, que a
 * série existe para ser DESENHADA e nunca agregada.
 */
export const IVV_DERIVED_SERIES = Object.freeze([
  {
    key: 'cancellations_to_sales_pct',
    label: 'Distratos sobre vendas',
    unit: 'fracao',
    note: 'Razão publicada por mês. Agregá-la entre meses produziria média de razões — '
      + 'exatamente o erro que a política de agregação por natureza impede.',
  },
]);

/** Índice das séries derivadas, por chave. */
export const DERIVED_SERIES_BY_KEY = Object.freeze(
  Object.fromEntries(IVV_DERIVED_SERIES.map((serie) => [serie.key, serie])),
);

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
 * Cabeçalhos observados na planilha pública em 2026-09-01.
 *
 * O schema real posiciona a unidade depois de `ytd`/`mom`/`yoy`, enquanto as chaves
 * canônicas do frontend preservam o nome completo da métrica antes do sufixo. O de-para
 * deixa o backend intacto e faz filtros, acumulados e variações consumirem o campo que
 * realmente existe, sem duplicar essa tradução nos cards e gráficos.
 */
export const PUBLISHED_COLUMN_ALIASES = Object.freeze({
  ivv_ytd_avg_pct: 'ivv_ytd_pct',
  offers_ytd_avg_units: 'offers_units_ytd_avg',
  sales_ytd_units: 'sales_units_ytd',
  launches_ytd_units: 'launches_units_ytd',
  offer_area_ytd_avg_m2: 'offer_area_m2_ytd_avg',
  sold_area_ytd_m2: 'sold_area_m2_ytd',
  asking_price_ytd_calc_brl_m2: 'asking_price_ytd_brl_m2',
  sale_price_ytd_calc_brl_m2: 'sale_price_ytd_brl_m2',
  vgo_ytd_avg_brl_million: 'vgo_brl_million_ytd_avg',
  vgv_ytd_brl_million: 'vgv_brl_million_ytd',
  vgl_ytd_brl_million: 'vgl_brl_million_ytd',
  cancellations_ytd_units: 'cancellations_units_ytd',

  offers_mom_pct_change: 'offers_units_mom_pct_change',
  offers_yoy_pct_change: 'offers_units_yoy_pct_change',
  sales_mom_pct_change: 'sales_units_mom_pct_change',
  sales_yoy_pct_change: 'sales_units_yoy_pct_change',
  launches_mom_pct_change: 'launches_units_mom_pct_change',
  launches_yoy_pct_change: 'launches_units_yoy_pct_change',
  asking_price_mom_pct_change: 'asking_price_brl_m2_mom_pct_change',
  asking_price_yoy_pct_change: 'asking_price_brl_m2_yoy_pct_change',
  sale_price_mom_pct_change: 'sale_price_brl_m2_mom_pct_change',
  sale_price_yoy_pct_change: 'sale_price_brl_m2_yoy_pct_change',
  vgo_mom_pct_change: 'vgo_brl_million_mom_pct_change',
  vgo_yoy_pct_change: 'vgo_brl_million_yoy_pct_change',
  vgv_mom_pct_change: 'vgv_brl_million_mom_pct_change',
  vgv_yoy_pct_change: 'vgv_brl_million_yoy_pct_change',
  vgl_mom_pct_change: 'vgl_brl_million_mom_pct_change',
  vgl_yoy_pct_change: 'vgl_brl_million_yoy_pct_change',
  cancellations_mom_pct_change: 'cancellations_units_mom_pct_change',
  cancellations_yoy_pct_change: 'cancellations_units_yoy_pct_change',
  offer_area_mom_pct_change: 'offer_area_m2_mom_pct_change',
  offer_area_yoy_pct_change: 'offer_area_m2_yoy_pct_change',
  sold_area_mom_pct_change: 'sold_area_m2_mom_pct_change',
  sold_area_yoy_pct_change: 'sold_area_m2_yoy_pct_change',

  avg_offer_unit_area_m2: 'avg_offer_area_m2',
  avg_sold_unit_area_m2: 'avg_sold_area_m2',
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
    pattern: /^(?<base>.+?)_ytd(?<rest>_[a-z0-9_]+)?$/,
    reason: 'Acumulado do ano já calculado pelo backend: lê-se o último mês, não se soma.',
  },
  {
    role: COLUMN_ROLES.VERIFICACAO,
    pattern: /^(?<base>.+?)_(?:calc|check)(?<rest>_[a-z0-9_]+)?$/,
    reason: 'Recálculo do backend. Serve para sinalizar divergência, nunca para substituir.',
  },
  {
    role: COLUMN_ROLES.VERIFICACAO,
    pattern: /^(?<base>.+?)_(?:diff|variance)(?<rest>_[a-z0-9_]+)?$/,
    reason: 'Divergência entre publicado e recalculado. Sinaliza, não substitui.',
  },
  {
    role: COLUMN_ROLES.VARIACAO,
    pattern: /^(?<base>.+?)_(?:mom|yoy)(?<rest>_[a-z0-9_]+)?$/,
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

function lookup(key) {
  if (METRIC_BY_KEY[key]) return METRIC_BY_KEY[key];
  if (IVV_DERIVED_PREFIX_BASE[key]) return METRIC_BY_KEY[IVV_DERIVED_PREFIX_BASE[key]];
  return null;
}

/**
 * Resolve a métrica de origem de uma coluna derivada.
 *
 * O marcador da família aparece nas duas posições no dataset — no fim
 * (`sales_units_ytd`) e no MEIO, antes do sufixo de unidade (`ivv_calc_pct`,
 * `asking_price_ytd_brl_m2`). Por isso a busca tenta o prefixo sozinho e, depois, o
 * prefixo religado ao que sobrou: `asking_price` + `_brl_m2` reencontra
 * `asking_price_brl_m2`. Sem isso, uma coluna derivada legítima cairia em
 * `desconhecido` — e um erro de digitação continuaria caindo, que é o que se quer.
 */
function resolveBase(base, rest) {
  const direct = lookup(base);
  if (direct) return direct;
  if (rest) {
    const rejoined = lookup(`${base}${rest}`);
    if (rejoined) return rejoined;
  }
  return lookup(base.replace(/_pct$/, ''));
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

  const publishedCanonical = PUBLISHED_COLUMN_ALIASES[column];
  if (publishedCanonical) {
    const target = classifyColumn(publishedCanonical);
    return {
      ...target,
      legacyOf: column,
      reason: `Cabeçalho publicado pela planilha para \`${publishedCanonical}\`.`,
    };
  }

  if (IVV_METADATA_COLUMNS.includes(column)) {
    return { ...empty, role: COLUMN_ROLES.METADADO };
  }

  for (const family of DERIVED_FAMILIES) {
    const match = family.pattern.exec(column);
    if (!match) continue;
    const base = resolveBase(match.groups.base, match.groups.rest);
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

/**
 * Métrica OU série derivada, por chave — o que um gráfico precisa saber para rotular e
 * formatar. Existe para que quem desenha não aprenda dois registros (mesma família da
 * R8.68: a tradução acontece num lugar só).
 */
export function getPlottable(key) {
  return METRIC_BY_KEY[key] || DERIVED_SERIES_BY_KEY[key] || null;
}

/** Métricas de uma natureza. */
export function metricsByKind(kind) {
  return IVV_METRICS.filter((metric) => metric.kind === kind);
}

/** Naturezas válidas — exposto para os testes fecharem o vocabulário. */
export function metricKindValues() {
  return KIND_VALUES.slice();
}
