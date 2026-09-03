// Normalizadores das abas FIPEZAP_MONTHLY e FIPEZAP_LOCALITY_MONTHLY.
//
// Preço de venda e locação por m², residencial e comercial, publicados pelo FipeZap:
// série longa do DF inteiro (`FIPEZAP_MONTHLY`, 2011 em diante) e série por
// localidade/Região Administrativa (`FIPEZAP_LOCALITY_MONTHLY`, 2019 em diante).
//
// Cabeçalhos confirmados AO VIVO contra o GViz da planilha real em 2026-09-03 — as duas
// abas batem exatamente com o `.xlsx` de referência, sem a divergência de nomes que o
// IVV_MONTHLY teve historicamente. Mesmo assim, nenhuma aba tem contrato no Apps Script
// (não está em `REQUIRED_HEADERS`/`FIELD_SCHEMA` do `Code.gs`), então coluna não declarada
// aqui vira aviso NOMEADO, nunca falha silenciosa — mesmo mecanismo do IVV_MONTHLY.
//
// As chaves de saída são as MESMAS da planilha (snake_case, 1:1), de propósito: é o que
// permite reaproveitar `src/ivv/period.js` (via `prepareRows` de `src/ivv/aggregate.js`,
// que lê `row.reference_date` direto) sem duplicar nem reescrever o módulo de período só
// porque o dataset é outro.

import { toText, toNumber, toInteger, toBoolean, toDateISO } from '../normalize.js';
import { safeExternalUrl } from '../format.js';

const T = Object.freeze({
  TEXTO: 'texto', DATA: 'data', INTEIRO: 'inteiro', NUMERO: 'numero',
  FRACAO: 'fracao', BOOLEANO: 'booleano', URL: 'url',
});

/**
 * `official_yield_annual_pct`/`calculated_yield_annual_pct`/`*_pct_change` são fração
 * DECIMAL (`0.042` = 4,2%) — confirmado nos dados reais. Acima disto não é plausível como
 * fração e vira aviso, nunca conversão silenciosa (mesmo espírito do R8.44/R8.60 que já
 * existe para não confundir a escala do IVV_MONTHLY com a do IVV_REGION — aqui é o mesmo
 * risco, um dataset novo a mais convivendo na mesma planilha).
 */
const FRACAO_MAXIMA_PLAUSIVEL = 1.5;

export const FIPEZAP_MONTHLY_COLUMNS = Object.freeze([
  { key: 'fipezap_id', type: T.TEXTO },
  { key: 'period_id', type: T.TEXTO },
  { key: 'reference_date', type: T.DATA },
  { key: 'year', type: T.INTEIRO },
  { key: 'month', type: T.INTEIRO },
  { key: 'month_label', type: T.TEXTO },
  { key: 'quarter', type: T.TEXTO },
  { key: 'is_latest_period', type: T.BOOLEANO },
  { key: 'segment_scope', type: T.TEXTO },
  { key: 'transaction_type', type: T.TEXTO },
  { key: 'geography_scope', type: T.TEXTO },
  { key: 'source_locality_name', type: T.TEXTO },
  { key: 'ra_name', type: T.TEXTO },
  { key: 'ra_geo_id', type: T.TEXTO },
  { key: 'geography_classification', type: T.TEXTO },
  { key: 'price_unit', type: T.TEXTO },
  { key: 'sample_n', type: T.INTEIRO },
  { key: 'price_brl_m2', type: T.NUMERO },
  { key: 'official_yield_monthly_pct', type: T.FRACAO },
  { key: 'official_yield_annual_pct', type: T.FRACAO },
  { key: 'price_mom_pct_change', type: T.FRACAO },
  { key: 'price_ytd_pct_change', type: T.FRACAO },
  { key: 'price_yoy_pct_change', type: T.FRACAO },
  { key: 'calculated_yield_monthly_pct', type: T.FRACAO },
  { key: 'calculated_yield_annual_pct', type: T.FRACAO },
  { key: 'price_to_rent_months', type: T.NUMERO },
  { key: 'diff_vs_df_pct', type: T.FRACAO },
  { key: 'rank_price', type: T.INTEIRO },
  { key: 'rank_yoy', type: T.INTEIRO },
  { key: 'source_publisher', type: T.TEXTO },
  { key: 'source_type', type: T.TEXTO },
  { key: 'source_url', type: T.URL },
  { key: 'source_page', type: T.TEXTO },
  { key: 'notes', type: T.TEXTO },
  { key: 'quality_flag', type: T.TEXTO },
  { key: 'imported_at', type: T.DATA },
  { key: 'source_workbook', type: T.TEXTO },
  { key: 'source_id', type: T.TEXTO },
  { key: 'note_id', type: T.TEXTO },
]);

export const FIPEZAP_LOCALITY_COLUMNS = Object.freeze([
  { key: 'locality_monthly_id', type: T.TEXTO },
  { key: 'period_id', type: T.TEXTO },
  { key: 'reference_date', type: T.DATA },
  { key: 'year', type: T.INTEIRO },
  { key: 'month', type: T.INTEIRO },
  { key: 'month_label', type: T.TEXTO },
  { key: 'quarter', type: T.TEXTO },
  { key: 'is_latest_period', type: T.BOOLEANO },
  { key: 'segment_scope', type: T.TEXTO },
  { key: 'source_locality_name', type: T.TEXTO },
  { key: 'ra_name', type: T.TEXTO },
  { key: 'ra_geo_id', type: T.TEXTO },
  { key: 'geography_classification', type: T.TEXTO },
  { key: 'sale_price_brl_m2', type: T.NUMERO },
  { key: 'rent_price_brl_m2_month', type: T.NUMERO },
  { key: 'calculated_yield_monthly_pct', type: T.FRACAO },
  { key: 'calculated_yield_annual_pct', type: T.FRACAO },
  { key: 'sale_yoy_pct_change', type: T.FRACAO },
  { key: 'rent_yoy_pct_change', type: T.FRACAO },
  { key: 'sale_diff_vs_df_pct', type: T.FRACAO },
  { key: 'rent_diff_vs_df_pct', type: T.FRACAO },
  { key: 'sale_price_rank', type: T.INTEIRO },
  { key: 'rent_price_rank', type: T.INTEIRO },
  { key: 'quality_flag', type: T.TEXTO },
  { key: 'source_workbook', type: T.TEXTO },
  { key: 'rebuilt_at', type: T.DATA },
]);

function coerce(type, raw) {
  switch (type) {
    case T.DATA: return toDateISO(raw);
    case T.INTEIRO: return toInteger(raw);
    case T.NUMERO: return toNumber(raw);
    case T.FRACAO: return toNumber(raw);
    case T.BOOLEANO: return toBoolean(raw);
    case T.URL: return safeExternalUrl(raw);
    default: return toText(raw) || null;
  }
}

/**
 * Normaliza as linhas de uma das duas abas contra o schema declarado.
 *
 * `reference_date` é fixado no dia 1º do mês, mesmo tratamento do IVV_MONTHLY: a série é
 * mensal, e uma data no meio do mês faria dois recortes iguais parecerem períodos
 * diferentes. Linha sem data utilizável é descartada com aviso — sem eixo temporal ela não
 * pode ser posicionada em período nenhum (R2.6).
 */
function normalizeRows(rows, columns, { label }) {
  const warnings = [];
  const declared = new Set(columns.map((column) => column.key));
  const normalized = [];
  const naoDeclaradas = new Set();
  const fracaoForaDeEscala = new Map();

  for (const [index, row] of (Array.isArray(rows) ? rows : []).entries()) {
    if (!row || typeof row !== 'object') {
      warnings.push(`${label}: linha ${index + 1} ignorada — não é um registro.`);
      continue;
    }
    for (const column of Object.keys(row)) {
      if (!declared.has(column)) naoDeclaradas.add(column);
    }

    const rawDate = toDateISO(row.reference_date);
    if (!rawDate) {
      warnings.push(`${label}: linha ${index + 1} ignorada — sem \`reference_date\` utilizável.`);
      continue;
    }
    const referenceDate = `${rawDate.slice(0, 7)}-01`;

    const item = { reference_date: referenceDate };
    for (const column of columns) {
      if (column.key === 'reference_date') continue;
      if (!(column.key in row)) continue;
      const value = coerce(column.type, row[column.key]);
      if (value === null || value === '') continue;
      if (column.type === T.FRACAO && Math.abs(value) > FRACAO_MAXIMA_PLAUSIVEL) {
        const bucket = fracaoForaDeEscala.get(column.key) || [];
        bucket.push({ month: referenceDate.slice(0, 7), value });
        fracaoForaDeEscala.set(column.key, bucket);
      }
      item[column.key] = value;
    }
    if (item.year === undefined) item.year = Number(referenceDate.slice(0, 4));
    if (item.month === undefined) item.month = Number(referenceDate.slice(5, 7));

    normalized.push(item);
  }

  if (naoDeclaradas.size > 0) {
    warnings.push(
      `${label} trouxe coluna(s) não declarada(s) em src/fipezap/normalize-fipezap.js: `
      + `${[...naoDeclaradas].sort().join(', ')}.`,
    );
  }
  for (const [column, ocorrencias] of fracaoForaDeEscala) {
    const exemplo = ocorrencias[0];
    warnings.push(
      `${label}: \`${column}\` teve ${ocorrencias.length} mês(es) fora da escala decimal `
      + `esperada (ex.: ${exemplo.month}, ${exemplo.value}). Valor mantido como veio e não `
      + 'deve ser exibido sem conferência — conversão nunca é automática (R8.44/R8.60).',
    );
  }

  normalized.sort((a, b) => (a.reference_date < b.reference_date ? -1
    : a.reference_date > b.reference_date ? 1 : 0));
  return { rows: normalized, warnings };
}

/** Normaliza `FIPEZAP_MONTHLY` — série DF inteiro (`DF_TOTAL`) e por localidade. */
export function normalizeFipezapMonthly(rows) {
  return normalizeRows(rows, FIPEZAP_MONTHLY_COLUMNS, { label: 'FIPEZAP_MONTHLY' });
}

/** Normaliza `FIPEZAP_LOCALITY_MONTHLY` — venda × locação por localidade/RA, já pareadas. */
export function normalizeFipezapLocality(rows) {
  return normalizeRows(rows, FIPEZAP_LOCALITY_COLUMNS, { label: 'FIPEZAP_LOCALITY_MONTHLY' });
}
