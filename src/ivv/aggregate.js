// Motor de agregação de período do IVV_MONTHLY.
//
// Recebe as linhas mensais de um período e devolve um valor por métrica, aplicando a operação
// declarada em `metrics.js`. Nenhuma decisão de metodologia mora aqui: o motor lê o `kind` e
// obedece. Coluna sem entrada no registro não é agregada — é recusada (R5.7).
//
// Funções puras. Sem DOM, sem rede.

import { toNumber, toDateISO } from '../normalize.js';
import {
  METRIC_KINDS, METRIC_KEYS, METRIC_BY_KEY, IVV_PCT_SCALE, DIVERGENCE_TOLERANCE,
  classifyColumn, COLUMN_ROLES,
} from './metrics.js';

/** Origem do valor agregado — o que a tela precisa saber para não mentir sobre o número. */
export const VALUE_ORIGINS = Object.freeze({
  PUBLICADO: 'publicado',           // valor do backend, mês único
  SOMA: 'soma',                     // fluxo somado
  MEDIA: 'media',                   // estoque, média do período
  RAZAO_PONDERADA: 'razao_ponderada', // preço e taxa
  YTD_BACKEND: 'ytd_backend',       // acumulado do ano pronto, não recalculado
  INDISPONIVEL: 'indisponivel',
});

/** Erro de agregação com mensagem legível em português. */
export class IvvAggregationError extends Error {
  constructor(message, { code, metric } = {}) {
    super(message);
    this.name = 'IvvAggregationError';
    this.code = code || 'AGGREGATION_REFUSED';
    this.metric = metric || null;
  }
}

function warning(code, metricKey, message, detail) {
  const item = { code, metric: metricKey, message };
  if (detail !== undefined) item.detail = detail;
  return item;
}

function relativeDiff(a, b) {
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0) return 0;
  return Math.abs(a - b) / scale;
}

/**
 * Prepara as linhas: converte números, resolve o eixo temporal e ordena.
 *
 * `reference_date` é o eixo canônico. Linha sem data utilizável é descartada com aviso —
 * um mês sem data não pode ser posicionado no período, e derrubar a tela por causa dela
 * seria pior (R2.6).
 */
const PREPARED = Symbol('ivvPreparedRows');

/** Verdadeiro para o array devolvido por `prepareRows` — sem heurística sobre o formato. */
function isPrepared(rows) {
  return Array.isArray(rows) && rows[PREPARED] === true;
}

export function prepareRows(rows) {
  const warnings = [];
  const prepared = [];
  const seen = new Map();

  for (const [index, row] of (Array.isArray(rows) ? rows : []).entries()) {
    if (!row || typeof row !== 'object') {
      warnings.push(warning('LINHA_INVALIDA', null, `Linha ${index + 1} ignorada: não é um registro.`));
      continue;
    }
    const date = toDateISO(row.reference_date) || toDateISO(row.reference_month);
    if (!date) {
      warnings.push(warning(
        'MES_SEM_DATA', null,
        `Linha ${index + 1} ignorada: sem \`reference_date\` utilizável.`,
      ));
      continue;
    }
    const month = date.slice(0, 7);
    if (seen.has(month)) {
      warnings.push(warning(
        'MES_DUPLICADO', null,
        `Mês ${month} aparece mais de uma vez; a primeira ocorrência foi mantida.`,
      ));
      continue;
    }
    seen.set(month, true);
    prepared.push({ date, month, year: Number(date.slice(0, 4)), row });
  }

  prepared.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  Object.defineProperty(prepared, PREPARED, { value: true });
  return { rows: prepared, warnings };
}

function numberAt(prepared, key) {
  if (!key) return null;
  return toNumber(prepared.row[key]);
}

function seriesOf(prepared, key) {
  const values = [];
  for (const item of prepared) {
    const value = numberAt(item, key);
    if (value !== null) values.push({ month: item.month, value });
  }
  return values;
}

function sumOf(prepared, key) {
  const values = seriesOf(prepared, key);
  if (values.length === 0) return null;
  return values.reduce((acc, item) => acc + item.value, 0);
}

/**
 * O período vai de janeiro até um mês do MESMO ano — única situação em que os campos
 * `*_ytd_*` do backend descrevem exatamente o recorte pedido.
 */
function isYearToDate(prepared) {
  if (prepared.length === 0) return false;
  const first = prepared[0];
  const last = prepared[prepared.length - 1];
  if (first.year !== last.year) return false;
  if (first.month.slice(5) !== '01') return false;
  // Sem buraco no meio: 12 linhas de janeiro a dezembro, e assim por diante.
  const expected = Number(last.month.slice(5)) - Number(first.month.slice(5)) + 1;
  return prepared.length === expected;
}

function baseResult(metric, prepared) {
  return {
    key: metric.key,
    label: metric.label,
    unit: metric.unit,
    kind: metric.kind,
    value: null,
    origin: VALUE_ORIGINS.INDISPONIVEL,
    monthsInPeriod: prepared.length,
    monthsWithData: 0,
    warnings: [],
  };
}

function checkPublishedAgainstDerived(metric, prepared, result) {
  // `*_calc_*` e `*_diff_*` SINALIZAM divergência; nunca substituem o valor publicado.
  // União das colunas de todos os meses: um mês sem a coluna de conferência não pode
  // desligar a conferência dos outros.
  const columns = new Set();
  for (const item of prepared) for (const column of Object.keys(item.row)) columns.add(column);
  const calcKeys = [...columns].filter((column) => {
    const info = classifyColumn(column);
    return info.role === COLUMN_ROLES.VERIFICACAO && info.canonicalKey === metric.key;
  });
  for (const item of prepared) {
    const published = numberAt(item, metric.key);
    if (published === null) continue;
    for (const calcKey of calcKeys) {
      if (/_(?:diff|variance)(?:_|$)/.test(calcKey)) continue; // é a própria divergência
      const calc = numberAt(item, calcKey);
      if (calc === null) continue;
      if (relativeDiff(published, calc) > DIVERGENCE_TOLERANCE) {
        result.warnings.push(warning(
          'DIVERGENCIA_BACKEND', metric.key,
          `${metric.label}: valor publicado (${published}) diverge de \`${calcKey}\` (${calc}) em `
          + `${item.month}. O publicado prevalece.`,
          { month: item.month, published, calc, column: calcKey },
        ));
      }
    }
  }
}

function aggregateFluxo(metric, prepared, result, { preferYtd }) {
  const values = seriesOf(prepared, metric.key);
  result.monthsWithData = values.length;

  if (preferYtd && metric.ytdColumn && prepared.length > 1 && isYearToDate(prepared)) {
    const last = prepared[prepared.length - 1];
    const ytd = numberAt(last, metric.ytdColumn);
    if (ytd !== null) {
      result.value = ytd;
      result.origin = VALUE_ORIGINS.YTD_BACKEND;
      const sum = values.reduce((acc, item) => acc + item.value, 0);
      if (values.length === prepared.length && relativeDiff(ytd, sum) > DIVERGENCE_TOLERANCE) {
        result.warnings.push(warning(
          'DIVERGENCIA_YTD', metric.key,
          `${metric.label}: acumulado do backend (${ytd}) diverge da soma dos meses (${sum}). `
          + 'O acumulado publicado prevalece.',
          { ytd, sum },
        ));
      }
      return result;
    }
  }

  if (values.length === 0) return result;
  result.value = values.reduce((acc, item) => acc + item.value, 0);
  result.origin = prepared.length === 1 ? VALUE_ORIGINS.PUBLICADO : VALUE_ORIGINS.SOMA;
  if (values.length < prepared.length) {
    result.warnings.push(warning(
      'MESES_INCOMPLETOS', metric.key,
      `${metric.label}: somados ${values.length} de ${prepared.length} meses do período.`,
      { monthsWithData: values.length, monthsInPeriod: prepared.length },
    ));
  }
  return result;
}

function aggregateEstoque(metric, prepared, result) {
  const values = seriesOf(prepared, metric.key);
  result.monthsWithData = values.length;
  if (values.length === 0) return result;
  const sum = values.reduce((acc, item) => acc + item.value, 0);
  result.value = sum / values.length;
  result.origin = prepared.length === 1 ? VALUE_ORIGINS.PUBLICADO : VALUE_ORIGINS.MEDIA;
  if (values.length < prepared.length) {
    result.warnings.push(warning(
      'MESES_INCOMPLETOS', metric.key,
      `${metric.label}: média sobre ${values.length} de ${prepared.length} meses do período.`,
      { monthsWithData: values.length, monthsInPeriod: prepared.length },
    ));
  }
  return result;
}

function weightedRatio(metric, prepared) {
  const numerator = sumOf(prepared, metric.numerator);
  const denominator = sumOf(prepared, metric.denominator);
  if (numerator === null || denominator === null || denominator === 0) return null;
  return (numerator * (metric.numeratorScale ?? 1)) / denominator;
}

function aggregatePreco(metric, prepared, result) {
  const published = seriesOf(prepared, metric.key);
  result.monthsWithData = published.length;
  const ratio = weightedRatio(metric, prepared);

  if (prepared.length === 1) {
    // Mês único: o valor publicado é o valor do mês. Não se recalcula o que o backend validou.
    if (published.length === 1) {
      result.value = published[0].value;
      result.origin = VALUE_ORIGINS.PUBLICADO;
      if (ratio !== null && relativeDiff(published[0].value, ratio) > DIVERGENCE_TOLERANCE) {
        result.warnings.push(warning(
          'DIVERGENCIA_RAZAO', metric.key,
          `${metric.label}: publicado (${published[0].value}) diverge da razão `
          + `${metric.numerator}/${metric.denominator} (${ratio}). O publicado prevalece.`,
          { published: published[0].value, ratio },
        ));
      }
      return result;
    }
    if (ratio !== null) {
      result.value = ratio;
      result.origin = VALUE_ORIGINS.RAZAO_PONDERADA;
    }
    return result;
  }

  if (ratio === null) {
    // Sem área para ponderar não existe preço do período. Cair na média simples produziria
    // um número plausível e metodologicamente errado — exatamente o que esta PR evita (R5.7).
    result.warnings.push(warning(
      'SEM_PONDERADOR', metric.key,
      `${metric.label}: sem \`${metric.denominator}\` no período; a média simples das razões `
      + 'mensais NÃO é uma alternativa válida.',
    ));
    return result;
  }
  result.value = ratio;
  result.origin = VALUE_ORIGINS.RAZAO_PONDERADA;
  // O que sustenta o número é o ponderador, não o preço publicado: é ele que se conta.
  result.monthsWithData = seriesOf(prepared, metric.denominator).length;
  return result;
}

function checkIvvScale(metric, prepared, result) {
  for (const item of seriesOf(prepared, metric.key)) {
    if (Math.abs(item.value) > IVV_PCT_SCALE.maxPlausible) {
      result.warnings.push(warning(
        'ESCALA_INESPERADA', metric.key,
        `${metric.label}: ${item.month} tem ${item.value}, fora da escala decimal esperada `
        + '(0.057 = 5,7%). Provável valor em pontos percentuais — converter no normalizador, '
        + 'nunca aqui.',
        { month: item.month, value: item.value },
      ));
    }
  }
}

function aggregateTaxa(metric, prepared, result) {
  const published = seriesOf(prepared, metric.key);
  result.monthsWithData = published.length;
  checkIvvScale(metric, prepared, result);
  checkPublishedAgainstDerived(metric, prepared, result);

  if (prepared.length === 1) {
    if (published.length === 1) {
      result.value = published[0].value;
      result.origin = VALUE_ORIGINS.PUBLICADO;
      return result;
    }
    const single = weightedRatio(metric, prepared);
    if (single !== null) {
      result.value = single;
      result.origin = VALUE_ORIGINS.RAZAO_PONDERADA;
    }
    return result;
  }

  // Período: razão ponderada vendas/oferta — equivale à média das taxas mensais ponderada
  // pelo estoque de cada mês. A média aritmética das taxas daria peso igual a um mês de
  // 200 unidades e a um de 6.000.
  const ratio = weightedRatio(metric, prepared);
  if (ratio === null) {
    result.warnings.push(warning(
      'SEM_PONDERADOR', metric.key,
      `${metric.label}: sem \`${metric.numerator}\`/\`${metric.denominator}\` no período; `
      + 'a média aritmética das taxas mensais NÃO é uma alternativa válida.',
    ));
    return result;
  }
  result.value = ratio;
  result.origin = VALUE_ORIGINS.RAZAO_PONDERADA;
  result.monthsWithData = seriesOf(prepared, metric.denominator).length;
  return result;
}

function refuseNaoSomavel(metric, prepared) {
  return new IvvAggregationError(
    `${metric.label} não pode ser agregado entre meses (${prepared.length} meses no período): `
    + `${metric.note} Consulte mês a mês.`,
    { code: 'METRICA_NAO_SOMAVEL', metric: metric.key },
  );
}

/**
 * Agrega UMA métrica sobre as linhas já preparadas ou cruas.
 *
 * @throws {IvvAggregationError} métrica fora do registro, ou não somável com mais de um mês.
 */
export function aggregateMetric(rows, key, options = {}) {
  const metric = METRIC_BY_KEY[key];
  if (!metric) {
    throw new IvvAggregationError(
      `Métrica \`${key}\` não está declarada em src/ivv/metrics.js. Coluna sem natureza `
      + 'declarada não é agregada — declare o `kind` antes de usá-la.',
      { code: 'METRICA_NAO_DECLARADA', metric: key },
    );
  }

  const prepared = isPrepared(rows) ? rows : prepareRows(rows).rows;

  const preferYtd = options.preferYtd !== false;
  const result = baseResult(metric, prepared);
  if (prepared.length === 0) return result;

  switch (metric.kind) {
    case METRIC_KINDS.FLUXO:
      checkPublishedAgainstDerived(metric, prepared, result);
      return aggregateFluxo(metric, prepared, result, { preferYtd });
    case METRIC_KINDS.ESTOQUE:
      checkPublishedAgainstDerived(metric, prepared, result);
      return aggregateEstoque(metric, prepared, result);
    case METRIC_KINDS.PRECO:
      checkPublishedAgainstDerived(metric, prepared, result);
      return aggregatePreco(metric, prepared, result);
    case METRIC_KINDS.TAXA:
      return aggregateTaxa(metric, prepared, result);
    case METRIC_KINDS.NAO_SOMAVEL: {
      if (prepared.length > 1) throw refuseNaoSomavel(metric, prepared);
      const value = numberAt(prepared[0], metric.key);
      if (value === null) return result;
      result.value = value;
      result.origin = VALUE_ORIGINS.PUBLICADO;
      result.monthsWithData = 1;
      return result;
    }
    default:
      // Vocabulário fechado: um `kind` novo chega aqui em vez de virar soma por omissão.
      throw new IvvAggregationError(
        `Natureza \`${metric.kind}\` de \`${metric.key}\` não tem operação definida no motor.`,
        { code: 'KIND_SEM_OPERACAO', metric: metric.key },
      );
  }
}

/**
 * Agrega um período inteiro.
 *
 * @param {object[]} rows linhas mensais do IVV_MONTHLY, na ordem que vierem
 * @param {{metrics?: string[], preferYtd?: boolean}} [options]
 * @returns {{period: {start: string|null, end: string|null, months: number},
 *            values: Record<string, object>, unsupported: Record<string, object>,
 *            warnings: object[]}}
 */
export function aggregatePeriod(rows, options = {}) {
  const { rows: prepared, warnings } = prepareRows(rows);
  const keys = options.metrics || METRIC_KEYS;
  const values = {};
  const unsupported = {};
  const collected = warnings.slice();

  for (const key of keys) {
    try {
      const result = aggregateMetric(prepared, key, options);
      values[key] = result;
      collected.push(...result.warnings);
    } catch (error) {
      if (!(error instanceof IvvAggregationError)) throw error;
      const metric = METRIC_BY_KEY[key];
      unsupported[key] = {
        key,
        label: metric ? metric.label : key,
        code: error.code,
        message: error.message,
      };
    }
  }

  return {
    period: {
      start: prepared.length ? prepared[0].month : null,
      end: prepared.length ? prepared[prepared.length - 1].month : null,
      months: prepared.length,
      yearToDate: isYearToDate(prepared),
    },
    values,
    unsupported,
    warnings: collected,
  };
}

/** Série mensal de uma métrica, para gráfico. Não agrega — só ordena e converte. */
export function monthlySeries(rows, key) {
  const metric = METRIC_BY_KEY[key];
  if (!metric) {
    throw new IvvAggregationError(
      `Métrica \`${key}\` não está declarada em src/ivv/metrics.js.`,
      { code: 'METRICA_NAO_DECLARADA', metric: key },
    );
  }
  const { rows: prepared } = prepareRows(rows);
  return prepared.map((item) => ({ month: item.month, value: numberAt(item, key) }));
}
