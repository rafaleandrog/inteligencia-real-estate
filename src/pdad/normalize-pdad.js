// Aba PDAD_A_DATA — extração longa do PDAD-A (issue #100, tela Diagnóstico).
//
// Formato longo: uma linha por RA × indicador × segmento × categoria de resposta,
// 33 colunas, ~12.190 linhas na planilha viva (35 RAs em 2024, só o Plano Piloto em
// 2021 — confirmado no dataset real, não assumido). Diferente de `IVV_REGION`, não há
// série nem faixa de quartos: a chave composta é
// `ra_geo_id + pdad_year + indicator_code + segment_value + category_standard`.
//
// Funções puras. Sem DOM, sem rede.

import { toText, toNumber, toInteger } from '../normalize.js';

const T = Object.freeze({ TEXTO: 'texto', INTEIRO: 'inteiro', NUMERO: 'numero' });

/**
 * Schema declarado das 33 colunas observadas na planilha.
 *
 * `figure_number` é texto, não inteiro: a maioria é numérica ("3", "39"), mas o dataset
 * real tem ao menos um código de apêndice não numérico ("A71", `lot_regularization`).
 * Tratar como inteiro descartaria essa linha em silêncio.
 */
export const PDAD_COLUMNS = Object.freeze([
  { key: 'pdad_year', type: T.INTEIRO, campo: 'pdadYear' },
  { key: 'geography_scope', type: T.TEXTO, campo: 'geographyScope' },
  { key: 'ra_geo_id', type: T.TEXTO, campo: 'raGeoId' },
  { key: 'ra_name', type: T.TEXTO, campo: 'raName' },
  { key: 'figure_number', type: T.TEXTO, campo: 'figureNumber' },
  { key: 'table_number', type: T.TEXTO, campo: 'tableNumber' },
  { key: 'section', type: T.TEXTO, campo: 'section' },
  { key: 'indicator_code', type: T.TEXTO, campo: 'indicatorCode' },
  { key: 'indicator_name', type: T.TEXTO, campo: 'indicatorName' },
  { key: 'universe', type: T.TEXTO, campo: 'universe' },
  { key: 'segment_dimension', type: T.TEXTO, campo: 'segmentDimension' },
  { key: 'segment_value', type: T.TEXTO, campo: 'segmentValue' },
  { key: 'response_category', type: T.TEXTO, campo: 'responseCategory' },
  { key: 'estimate_total', type: T.NUMERO, campo: 'estimateTotal' },
  { key: 'estimate_pct', type: T.NUMERO, campo: 'estimatePct' },
  { key: 'source_value_status', type: T.TEXTO, campo: 'sourceValueStatus' },
  { key: 'figure_pdf_page', type: T.INTEIRO, campo: 'figurePdfPage' },
  { key: 'table_pdf_page', type: T.INTEIRO, campo: 'tablePdfPage' },
  { key: 'source_file', type: T.TEXTO, campo: 'sourceFile' },
  { key: 'source_institution', type: T.TEXTO, campo: 'sourceInstitution' },
  { key: 'extraction_basis', type: T.TEXTO, campo: 'extractionBasis' },
  { key: 'notes', type: T.TEXTO, campo: 'notes' },
  { key: 'figure_segmentation', type: T.TEXTO, campo: 'figureSegmentation' },
  { key: 'figure_data_structure', type: T.TEXTO, campo: 'figureDataStructure' },
  { key: 'figure_fields_to_capture', type: T.TEXTO, campo: 'figureFieldsToCapture' },
  { key: 'figure_preferred', type: T.TEXTO, campo: 'figurePreferred' },
  { key: 'figure_extraction_rule', type: T.TEXTO, campo: 'figureExtractionRule' },
  { key: 'figure_quality_notes', type: T.TEXTO, campo: 'figureQualityNotes' },
  { key: 'figure_map_status', type: T.TEXTO, campo: 'figureMapStatus' },
  { key: 'value_origin', type: T.TEXTO, campo: 'valueOrigin' },
  { key: 'source_locator', type: T.TEXTO, campo: 'sourceLocator' },
  { key: 'category_raw', type: T.TEXTO, campo: 'categoryRaw' },
  { key: 'category_standard', type: T.TEXTO, campo: 'categoryStandard' },
]);

const PDAD_COLUMN_KEYS = Object.freeze(PDAD_COLUMNS.map((c) => c.key));

/** Vocabulário observado de `source_value_status`/`value_origin` — texto livre, não fechado. */
export const SOURCE_VALUE_STATUS = Object.freeze({
  PUBLISHED: 'published',
  PARTIAL: 'partial',
  SUPPRESSED: 'suppressed',
});

function valorDe(row, coluna) {
  const bruto = row[coluna.key];
  switch (coluna.type) {
    case T.INTEIRO: return toInteger(bruto);
    case T.NUMERO: return toNumber(bruto);
    default: return toText(bruto);
  }
}

/** `true` quando a categoria é a linha-total publicada da figura, não uma categoria de resposta. */
function isTotalCategory(item) {
  const valor = (item.categoryStandard || item.responseCategory || '').toLowerCase();
  return valor === 'total';
}

/**
 * Normaliza as linhas de `PDAD_A_DATA`.
 *
 * Linha sem `ra_geo_id` ou `indicator_code` é descartada com aviso: sem os dois não dá
 * para agrupar por RA nem por indicador, e mantê-la só produziria um cartão anônimo.
 * Valor `suppressed`/`partial` é preservado como veio — nunca vira `0` — para que quem
 * agrega decida como representar ausência (R5.7).
 */
export function normalizePdadData(rows) {
  const warnings = [];
  const normalizadas = [];
  const naoDeclaradas = new Set();

  for (const [indice, row] of (Array.isArray(rows) ? rows : []).entries()) {
    if (!row || typeof row !== 'object') {
      warnings.push(`Linha ${indice + 1} de PDAD_A_DATA ignorada: não é um registro.`);
      continue;
    }
    for (const coluna of Object.keys(row)) {
      if (!PDAD_COLUMN_KEYS.includes(coluna)) naoDeclaradas.add(coluna);
    }

    const item = {};
    for (const coluna of PDAD_COLUMNS) item[coluna.campo] = valorDe(row, coluna);

    if (!item.raGeoId || !item.indicatorCode) {
      warnings.push(`Linha ${indice + 1} de PDAD_A_DATA ignorada: sem RA ou sem indicador.`);
      continue;
    }

    item.isCategoryTotal = isTotalCategory(item);
    normalizadas.push(item);
  }

  if (naoDeclaradas.size > 0) {
    warnings.push(
      `PDAD_A_DATA trouxe coluna(s) não declarada(s) em src/pdad/normalize-pdad.js: `
      + `${[...naoDeclaradas].sort().join(', ')}.`,
    );
  }

  return { rows: normalizadas, warnings };
}

/** Os anos distintos presentes na aba, ordenados do mais recente para o mais antigo. */
export function pdadYearsAvailable(rows) {
  return [...new Set((rows || []).map((item) => item.pdadYear).filter(Number.isFinite))]
    .sort((a, b) => b - a);
}
