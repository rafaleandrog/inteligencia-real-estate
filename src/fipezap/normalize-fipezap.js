// Normalizadores das abas FIPEZAP_MONTHLY e FIPEZAP_LOCALITY_MONTHLY.
//
// Preço de venda e locação por m², residencial e comercial, publicados pelo FipeZap:
// série longa do DF inteiro (`FIPEZAP_MONTHLY`, 2011 em diante) e série por
// localidade/Região Administrativa (`FIPEZAP_LOCALITY_MONTHLY`, 2019 em diante).
//
// Cabeçalhos confirmados AO VIVO contra o GViz da planilha real em 2026-09-03 — as duas
// abas batem exatamente com o `.xlsx` de referência, sem a divergência de nomes que o
// IVV_MONTHLY teve historicamente. Desde o Code.gs v2.4.0 as abas TÊM contrato no Apps
// Script (`REQUIRED_HEADERS`/`FIELD_SCHEMA`), mas coluna não declarada aqui continua virando
// aviso NOMEADO, nunca falha silenciosa — mesmo mecanismo do IVV_MONTHLY.
//
// Período (issue #122): o contrato é `period_id = YYYY-MM` e `reference_date = YYYY-MM-01`.
// A planilha guarda os dois como célula Date, o GViz os serializa como `Date(y,m,d)`, e o
// `.xlsx` como serial — o normalizador aceita as três formas e NUNCA depende da
// representação interna do Google. `period_id` é sempre derivado do eixo; quando a aba
// traz um `period_id` que discorda da data, isso vira aviso, não escolha silenciosa.
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

/** Vocabulários fechados da série (docs/DATA_CONTRACT.md). Valor fora deles é aviso nomeado. */
export const FIPEZAP_SEGMENT_SCOPES = Object.freeze(['RESIDENCIAL', 'COMERCIAL']);
export const FIPEZAP_TRANSACTION_TYPES = Object.freeze(['VENDA', 'LOCACAO']);
export const FIPEZAP_GEOGRAPHY_SCOPES = Object.freeze(['DF_TOTAL', 'LOCALIDADE']);

/**
 * `YYYY-MM` a partir de qualquer forma de período: texto `YYYY-MM`, ISO, `Date(y,m,d)` do
 * GViz, Date real ou serial de planilha. `null` quando não há período legível.
 */
export function periodIdOf(value) {
  const text = toText(value);
  if (/^\d{4}-\d{2}$/.test(text)) return text;
  const gviz = text.match(/^Date\((\d{4}),(\d{1,2})\)$/);
  if (gviz) return `${gviz[1]}-${String(Number(gviz[2]) + 1).padStart(2, '0')}`;
  const iso = toDateISO(value);
  return iso ? iso.slice(0, 7) : null;
}

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
function normalizeRows(rows, columns, { label, vocabularios = {}, duplicateKey }) {
  const warnings = [];
  const declared = new Set(columns.map((column) => column.key));
  const normalized = [];
  const naoDeclaradas = new Set();
  const fracaoForaDeEscala = new Map();
  const foraDoVocabulario = new Map();
  const periodMismatch = [];
  const duplicadas = [];
  const vistos = new Set();

  for (const [index, row] of (Array.isArray(rows) ? rows : []).entries()) {
    if (!row || typeof row !== 'object') {
      warnings.push(`${label}: linha ${index + 1} ignorada — não é um registro.`);
      continue;
    }
    for (const column of Object.keys(row)) {
      if (!declared.has(column)) naoDeclaradas.add(column);
    }

    // Eixo temporal: `reference_date` quando legível; senão `period_id`, que também é
    // período válido pelo contrato. Só sem os dois a linha não tem onde ficar.
    const rawDate = toDateISO(row.reference_date);
    const declaredPeriod = periodIdOf(row.period_id);
    const axisPeriod = rawDate ? rawDate.slice(0, 7) : declaredPeriod;
    if (!axisPeriod) {
      warnings.push(`${label}: linha ${index + 1} ignorada — sem \`reference_date\` nem \`period_id\` utilizável.`);
      continue;
    }
    const referenceDate = `${axisPeriod}-01`;
    if (rawDate && declaredPeriod && declaredPeriod !== axisPeriod) {
      periodMismatch.push({ line: index + 1, declared: declaredPeriod, axis: axisPeriod });
    }

    const item = { period_id: axisPeriod, reference_date: referenceDate };
    for (const column of columns) {
      if (column.key === 'reference_date' || column.key === 'period_id') continue;
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

    // Vocabulário fechado: valor estranho fica na linha (nunca se apaga dado) e vira aviso
    // nomeado, para ser corrigido na planilha e não filtrado em silêncio pela tela.
    for (const [column, allowed] of Object.entries(vocabularios)) {
      if (item[column] !== undefined && !allowed.includes(item[column])) {
        const bucket = foraDoVocabulario.get(column) || new Map();
        bucket.set(item[column], (bucket.get(item[column]) || 0) + 1);
        foraDoVocabulario.set(column, bucket);
      }
    }

    // Duplicidade lógica: mesma observação publicada duas vezes. A primeira fica, a
    // repetida sai com aviso — duas linhas iguais dobrariam o ponto no gráfico.
    const chave = duplicateKey(item);
    if (vistos.has(chave)) {
      duplicadas.push({ line: index + 1, chave });
      continue;
    }
    vistos.add(chave);

    normalized.push(item);
  }

  if (periodMismatch.length > 0) {
    const ex = periodMismatch[0];
    warnings.push(
      `${label}: ${periodMismatch.length} linha(s) com \`period_id\` diferente do mês de `
      + `\`reference_date\` (ex.: linha ${ex.line}, ${ex.declared} × ${ex.axis}). O eixo usado é o da `
      + 'data; confira a planilha.',
    );
  }
  for (const [column, valores] of foraDoVocabulario) {
    const lista = [...valores.entries()].map(([v, n]) => `${v} (${n})`).join(', ');
    warnings.push(
      `${label}: \`${column}\` fora do vocabulário ${JSON.stringify(vocabularios[column])}: ${lista}. `
      + 'Linha mantida e sinalizada; a tela só reconhece os valores do contrato.',
    );
  }
  if (duplicadas.length > 0) {
    const ex = duplicadas[0];
    warnings.push(
      `${label}: ${duplicadas.length} observação(ões) repetida(s) ignorada(s) — mesma combinação de `
      + `período, segmento, operação, geografia e localidade (ex.: linha ${ex.line}: ${ex.chave}).`,
    );
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
  return normalizeRows(rows, FIPEZAP_MONTHLY_COLUMNS, {
    label: 'FIPEZAP_MONTHLY',
    vocabularios: {
      segment_scope: FIPEZAP_SEGMENT_SCOPES,
      transaction_type: FIPEZAP_TRANSACTION_TYPES,
      geography_scope: FIPEZAP_GEOGRAPHY_SCOPES,
    },
    duplicateKey: (item) => [
      item.period_id, item.segment_scope || '', item.transaction_type || '',
      item.geography_scope || '', item.source_locality_name || '',
    ].join('|'),
  });
}

/** Normaliza `FIPEZAP_LOCALITY_MONTHLY` — venda × locação por localidade/RA, já pareadas. */
export function normalizeFipezapLocality(rows) {
  return normalizeRows(rows, FIPEZAP_LOCALITY_COLUMNS, {
    label: 'FIPEZAP_LOCALITY_MONTHLY',
    vocabularios: { segment_scope: FIPEZAP_SEGMENT_SCOPES },
    duplicateKey: (item) => [
      item.period_id, item.segment_scope || '', item.source_locality_name || '',
    ].join('|'),
  });
}

/**
 * `FIPEZAP_LOCALITY_MAP` — a ponte explícita localidade FipeZap → Região Administrativa.
 *
 * Uma localidade FipeZap NÃO é necessariamente uma RA (Asa Sul é submercado do Plano
 * Piloto; Park Sul é mapeamento operacional para o Guará). O mapa preserva o nome original
 * (`source_locality_name`), a RA normalizada, o tipo de correspondência
 * (`geography_classification`), a regra e a nota metodológica, com validade. A tela usa o
 * mapa para ROTULAR, nunca para fundir localidades numa RA.
 */
export const FIPEZAP_LOCALITY_MAP_COLUMNS = Object.freeze([
  { key: 'locality_map_id', type: T.TEXTO },
  { key: 'source_locality_name', type: T.TEXTO },
  { key: 'ra_name', type: T.TEXTO },
  { key: 'ra_geo_id', type: T.TEXTO },
  { key: 'geography_classification', type: T.TEXTO },
  { key: 'mapping_rule', type: T.TEXTO },
  { key: 'methodology_note', type: T.TEXTO },
  { key: 'valid_from', type: T.DATA },
  { key: 'valid_to', type: T.DATA },
  { key: 'quality_flag', type: T.TEXTO },
  { key: 'source_workbook', type: T.TEXTO },
  { key: 'updated_at', type: T.DATA },
]);

export function normalizeFipezapLocalityMap(rows) {
  const label = 'FIPEZAP_LOCALITY_MAP';
  const warnings = [];
  const declared = new Set(FIPEZAP_LOCALITY_MAP_COLUMNS.map((c) => c.key));
  const naoDeclaradas = new Set();
  const vistos = new Set();
  const out = [];

  for (const [index, row] of (Array.isArray(rows) ? rows : []).entries()) {
    if (!row || typeof row !== 'object') {
      warnings.push(`${label}: linha ${index + 1} ignorada — não é um registro.`);
      continue;
    }
    for (const column of Object.keys(row)) if (!declared.has(column)) naoDeclaradas.add(column);

    const item = {};
    for (const column of FIPEZAP_LOCALITY_MAP_COLUMNS) {
      if (!(column.key in row)) continue;
      const value = coerce(column.type, row[column.key]);
      if (value === null || value === '') continue;
      item[column.key] = value;
    }
    if (!item.source_locality_name) {
      warnings.push(`${label}: linha ${index + 1} ignorada — sem \`source_locality_name\`.`);
      continue;
    }
    const chave = item.locality_map_id || item.source_locality_name;
    if (vistos.has(chave)) {
      warnings.push(`${label}: linha ${index + 1} ignorada — \`${chave}\` repetido.`);
      continue;
    }
    vistos.add(chave);
    out.push(item);
  }
  if (naoDeclaradas.size > 0) {
    warnings.push(
      `${label} trouxe coluna(s) não declarada(s) em src/fipezap/normalize-fipezap.js: `
      + `${[...naoDeclaradas].sort().join(', ')}.`,
    );
  }
  out.sort((a, b) => a.source_locality_name.localeCompare(b.source_locality_name, 'pt-BR'));
  return { rows: out, warnings };
}
