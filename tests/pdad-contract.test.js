// Aba PDAD_A_DATA — extração longa do PDAD-A (issue #100).
//
// Três coisas caras que este arquivo impede: categoria suprimida virando barra de
// tamanho zero (afirma "não tem" onde o dado diz "não publicou"); `ra_geo_id` desta aba
// (`RA_01`…`RA_35`) sendo tratado como equivalente ao das demais abas (`RA2026_RA-I`)
// sem de-para nenhum; e `figure_number` não numérico (`"A71"`) derrubando a linha por
// ser lido como inteiro.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PDAD_COLUMNS, normalizePdadData, pdadYearsAvailable } from '../src/pdad/normalize-pdad.js';
import { PDAD_INDICATORS } from '../src/pdad/indicators.js';
import { DATASET_PERCENT_SCALE, PERCENT_SCALES } from '../src/format.js';

const linha = (over = {}) => ({
  pdad_year: '2024',
  geography_scope: 'RA',
  ra_geo_id: 'RA_01',
  ra_name: 'Plano Piloto',
  figure_number: '6',
  table_number: '5',
  section: 'Moradores',
  indicator_code: 'marital_status',
  indicator_name: 'Estado civil',
  universe: 'Moradores',
  segment_dimension: '',
  segment_value: '',
  response_category: 'Casado',
  estimate_total: '93701',
  estimate_pct: '52.1',
  source_value_status: 'published',
  figure_pdf_page: '20',
  table_pdf_page: '80',
  source_file: 'plano_piloto.pdf',
  source_institution: 'IPEDF/DIEPS/COEPS/PDAD-A 2024',
  extraction_basis: '',
  notes: '',
  figure_segmentation: '',
  figure_data_structure: '',
  figure_fields_to_capture: '',
  figure_preferred: '',
  figure_extraction_rule: '',
  figure_quality_notes: '',
  figure_map_status: '',
  value_origin: 'published',
  source_locator: 'source_file=plano_piloto.pdf;figure=6;table=5',
  category_raw: 'Casado',
  category_standard: 'casado',
  ...over,
});

// --- Escala: ponto percentual, mesma família de RA_PROFILES/IVV_REGION -----------------

test('PDAD_A_DATA é ponto percentual, nunca decimal', () => {
  assert.equal(DATASET_PERCENT_SCALE.PDAD_A_DATA, PERCENT_SCALES.POINTS);
  const { rows } = normalizePdadData([linha({ estimate_pct: '52.1' })]);
  assert.equal(rows[0].estimatePct, 52.1, 'o valor chega como veio, sem conversão calada');
});

// --- figure_number não numérico não derruba a linha -------------------------------------

test('figure_number com código de apêndice não numérico ("A71") é preservado', () => {
  const { rows } = normalizePdadData([
    linha({ indicator_code: 'lot_regularization', figure_number: 'A71', response_category: 'Sim' }),
  ]);
  assert.equal(rows[0].figureNumber, 'A71', 'tratar como inteiro descartaria esta linha em silêncio');
});

// --- Linha-total é marcada, não é mais uma categoria -------------------------------------

test('response_category "Total" é marcada como categoria-total, não vira barra', () => {
  const { rows } = normalizePdadData([
    linha({ response_category: 'Total', category_standard: 'total', estimate_pct: '100' }),
    linha({ response_category: 'Casado', category_standard: 'casado' }),
  ]);
  assert.equal(rows[0].isCategoryTotal, true);
  assert.equal(rows[1].isCategoryTotal, false);
});

// --- Linha sem RA ou sem indicador é descartada com aviso --------------------------------

test('linha sem RA ou sem indicador é descartada com aviso, nunca vira cartão anônimo', () => {
  const { rows, warnings } = normalizePdadData([
    linha({ ra_geo_id: '' }),
    linha({ indicator_code: '' }),
    linha(),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(warnings.filter((w) => /sem RA ou sem indicador/.test(w)).length, 2);
});

test('coluna que a aba trouxer e o schema não declarar é NOMEADA em aviso', () => {
  const { warnings } = normalizePdadData([linha({ coluna_nova: '1' })]);
  assert.ok(warnings.some((w) => /coluna_nova/.test(w)), warnings.join(' · '));
});

test('entrada inválida não estoura', () => {
  assert.deepEqual(normalizePdadData(null).rows, []);
  assert.deepEqual(normalizePdadData([null, 3]).rows, []);
  assert.deepEqual(pdadYearsAvailable([]), []);
});

test('os anos disponíveis vêm do mais recente para o mais antigo', () => {
  const { rows } = normalizePdadData([
    linha({ pdad_year: '2021' }),
    linha({ pdad_year: '2024' }),
  ]);
  assert.deepEqual(pdadYearsAvailable(rows), [2024, 2021]);
});

// --- O triângulo com o contrato -----------------------------------------------------------

test('as 33 colunas declaradas em src/pdad/normalize-pdad.js estão no contrato', () => {
  const contrato = readFileSync(new URL('../docs/DATA_CONTRACT.md', import.meta.url), 'utf8');
  assert.match(contrato, /`PDAD_A_DATA`/);
  for (const coluna of PDAD_COLUMNS) {
    assert.ok(
      contrato.includes(`\`${coluna.key}\``),
      `${coluna.key} declarado em normalize-pdad.js mas fora do contrato`,
    );
  }
});

test('todo indicator_code do registro de exibição aparece citado no contrato', () => {
  const contrato = readFileSync(new URL('../docs/DATA_CONTRACT.md', import.meta.url), 'utf8');
  for (const codigo of Object.keys(PDAD_INDICATORS)) {
    assert.ok(
      contrato.includes(`\`${codigo}\``) || contrato.includes(codigo),
      `${codigo} declarado em src/pdad/indicators.js mas não citado no contrato`,
    );
  }
});
