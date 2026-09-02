// Aba IVV_REGION — IVV por Região Administrativa e faixa de quartos (issue #87).
//
// Esta aba existia na planilha desde o começo e nunca era buscada. Ela é a ÚNICA fonte de
// recorte territorial do IVV, e é o que faz a tela do Mercado deixar de dizer que a fonte
// não publica nada por RA.
//
// Três coisas que este arquivo existe para não deixar passar:
//
// 1. **A escala é OPOSTA à da IVV_MONTHLY.** Aqui `ivv_pct = 12.5` significa 12,5%; lá
//    `0.057` significa 5,7%. Unificar as duas erra por 100× em silêncio — 12,5% viraria
//    1250% ou 0,125%, e nenhum dos dois parece bug de código (R8.44/R8.60). A escala é
//    declarada por dataset em `DATASET_PERCENT_SCALE`, nunca inferida do valor.
// 2. **`DF Total` e `TOTAL` são linhas AGREGADAS misturadas com as partes.** Ranquear ou
//    somar sem separá-las conta o mesmo mercado duas vezes. Elas saem marcadas na
//    normalização, e não por comparação de string espalhada pelo resto do código.
// 3. **Não é série temporal.** A aba publica UM mês. Tratá-la como série produziria um
//    gráfico de um ponto; ela alimenta comparação ENTRE regiões.
//
// Funções puras. Sem DOM, sem rede.

import { toText, toNumber, toInteger, toDateISO } from '../normalize.js';

/** A linha que agrega o território inteiro — referência, nunca mais uma barra do ranking. */
export const REGIAO_TOTAL = 'DF Total';

/** A faixa que agrega todas as outras. Mesmo motivo: referência, não parte. */
export const FAIXA_TOTAL = 'TOTAL';

/**
 * As faixas de quartos, na ordem de leitura. `TOTAL` abre a lista porque é o recorte que
 * responde "e no geral?", que é a primeira pergunta de quem chega.
 */
export const FAIXAS_DE_QUARTOS = Object.freeze([FAIXA_TOTAL, '1Q', '2Q', '3Q', '4+Q']);

const T = Object.freeze({ TEXTO: 'texto', DATA: 'data', INTEIRO: 'inteiro', NUMERO: 'numero' });

/**
 * Schema declarado da aba, nas 12 colunas observadas na semente.
 *
 * `ivv_pct` é alias de `ivv_pct_published` (divergência D2 do contrato): as duas trazem o
 * mesmo número, e o normalizador lê a publicada primeiro. `ivv_pct_check` e
 * `ivv_variance_pp` são conferência do backend — SINALIZAM divergência, nunca substituem.
 */
export const REGION_COLUMNS = Object.freeze([
  { key: 'reference_month', type: T.DATA, campo: 'month' },
  { key: 'market_region', type: T.TEXTO, campo: 'region' },
  { key: 'bedroom_bucket', type: T.TEXTO, campo: 'bucket' },
  { key: 'offered_units', type: T.INTEIRO, campo: 'offeredUnits' },
  { key: 'sold_units', type: T.INTEIRO, campo: 'soldUnits' },
  { key: 'ivv_pct_published', type: T.NUMERO, campo: 'ivvPct' },
  { key: 'ivv_pct', type: T.NUMERO, campo: 'ivvPctAlias' },
  { key: 'ivv_pct_check', type: T.NUMERO, campo: 'ivvCheckPct' },
  { key: 'ivv_variance_pp', type: T.NUMERO, campo: 'variancePp' },
  { key: 'offer_price_brl_m2', type: T.NUMERO, campo: 'offerPriceM2' },
  { key: 'sale_price_brl_m2', type: T.NUMERO, campo: 'salePriceM2' },
  { key: 'source_id', type: T.TEXTO, campo: 'sourceId' },
]);

const REGION_COLUMN_KEYS = Object.freeze(REGION_COLUMNS.map((c) => c.key));

/** Acima disto o valor não pode ser ponto percentual de IVV mensal — é erro de escala. */
const IVV_MAXIMO_PLAUSIVEL = 100;

function valorDe(row, coluna) {
  const bruto = row[coluna.key];
  switch (coluna.type) {
    case T.DATA: return toDateISO(bruto);
    case T.INTEIRO: return toInteger(bruto);
    case T.NUMERO: return toNumber(bruto);
    default: return toText(bruto);
  }
}

/**
 * Normaliza as linhas da aba.
 *
 * Linha sem região ou sem faixa é descartada com aviso: sem os dois ela não pode ser
 * posicionada em recorte nenhum, e mantê-la só produziria uma barra anônima.
 */
export function normalizeIvvRegion(rows) {
  const warnings = [];
  const normalizadas = [];
  const naoDeclaradas = new Set();

  for (const [indice, row] of (Array.isArray(rows) ? rows : []).entries()) {
    if (!row || typeof row !== 'object') {
      warnings.push(`Linha ${indice + 1} de IVV_REGION ignorada: não é um registro.`);
      continue;
    }
    for (const coluna of Object.keys(row)) {
      if (!REGION_COLUMN_KEYS.includes(coluna)) naoDeclaradas.add(coluna);
    }

    const item = {};
    for (const coluna of REGION_COLUMNS) item[coluna.campo] = valorDe(row, coluna);

    if (!item.region || !item.bucket) {
      warnings.push(`Linha ${indice + 1} de IVV_REGION ignorada: sem região ou faixa de quartos.`);
      continue;
    }

    // `ivv_pct` é alias de `ivv_pct_published`; a publicada manda, e o alias só entra
    // quando ela não veio.
    if (item.ivvPct === null) item.ivvPct = item.ivvPctAlias;
    delete item.ivvPctAlias;

    if (item.ivvPct !== null && Math.abs(item.ivvPct) > IVV_MAXIMO_PLAUSIVEL) {
      warnings.push(
        `IVV de ${item.region} (${item.bucket}) veio ${item.ivvPct}, acima de 100 pontos `
        + 'percentuais: valor mantido como veio e sinalizado, nunca convertido às cegas.',
      );
    }
    if (item.ivvCheckPct !== null && item.ivvPct !== null
      && Math.abs(item.ivvCheckPct - item.ivvPct) > 0.05) {
      warnings.push(
        `IVV de ${item.region} (${item.bucket}): publicado ${item.ivvPct} diverge da `
        + `conferência ${item.ivvCheckPct}. O publicado prevalece.`,
      );
    }

    item.isRegiaoTotal = item.region === REGIAO_TOTAL;
    item.isFaixaTotal = item.bucket === FAIXA_TOTAL;
    normalizadas.push(item);
  }

  if (naoDeclaradas.size > 0) {
    // Nomear a coluna nova é o que permite corrigir a convenção em vez de escondê-la.
    warnings.push(
      `IVV_REGION trouxe coluna(s) não declarada(s) em src/ivv/region.js: `
      + `${[...naoDeclaradas].sort().join(', ')}.`,
    );
  }

  return { rows: normalizadas, warnings };
}

/** Os meses distintos da aba. Hoje é um só, e a tela não promete histórico que não existe. */
export function regionMonths(rows) {
  return [...new Set(rows.map((item) => item.month).filter(Boolean))].sort();
}

/**
 * O ranking de uma faixa: as regiões ordenadas por IVV, mais a referência do DF.
 *
 * Região sem IVV publicado NÃO vira barra de tamanho zero — ela sai da lista ordenada e é
 * nomeada à parte. Zero e "não publicado" são afirmações diferentes, e uma barra vazia
 * afirma a primeira (R5.7).
 */
export function buildRegionRanking(rows, opcoes = {}) {
  const faixa = opcoes.bucket || FAIXA_TOTAL;
  const doRecorte = (rows || []).filter((item) => item.bucket === faixa);

  const referencia = doRecorte.find((item) => item.isRegiaoTotal) || null;
  const partes = doRecorte.filter((item) => !item.isRegiaoTotal);

  const comValor = partes.filter((item) => item.ivvPct !== null)
    .sort((a, b) => b.ivvPct - a.ivvPct || a.region.localeCompare(b.region, 'pt-BR'));
  const semValor = partes.filter((item) => item.ivvPct === null)
    .map((item) => item.region)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return {
    faixa,
    mes: doRecorte[0]?.month || null,
    referencia,
    regioes: comValor,
    semValor,
    maximo: comValor.length > 0 ? comValor[0].ivvPct : 0,
  };
}

/** As faixas que a aba realmente trouxe, na ordem declarada. */
export function faixasDisponiveis(rows) {
  const presentes = new Set((rows || []).map((item) => item.bucket));
  return FAIXAS_DE_QUARTOS.filter((faixa) => presentes.has(faixa));
}
