// Registro de métricas do IVV — cobertura e coerência.
//
// O teste mais importante deste arquivo é o de COBERTURA: uma coluna nova do backend não pode
// cair num SUM por omissão. Se aparecer coluna sem classificação declarada, este arquivo quebra.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSheet } from './helpers/xlsxSheet.mjs';
import {
  IVV_METRICS, METRIC_BY_KEY, METRIC_KEYS, METRIC_KINDS, COLUMN_ROLES,
  IVV_METADATA_COLUMNS, LEGACY_COLUMN_ALIASES, IVV_PCT_SCALE,
  classifyColumn, isDeclaredColumn, getMetric, metricsByKind, metricKindValues,
} from '../src/ivv/metrics.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ivv-monthly.json', import.meta.url)));
const fixtureRows = fixture.rows;

function columnsOf(rows) {
  const columns = new Set();
  for (const row of rows) for (const key of Object.keys(row)) columns.add(key);
  return [...columns];
}

test('toda coluna do dataset tem classificação declarada — nenhuma cai em SUM por omissão', () => {
  const undeclared = columnsOf(fixtureRows).filter((column) => !isDeclaredColumn(column));
  assert.deepEqual(
    undeclared, [],
    'coluna sem entrada no registro de src/ivv/metrics.js: declare o `kind` antes de usá-la',
  );
});

test('a semente .xlsx é lida de verdade e toda coluna dela também está classificada', () => {
  // Interroga o arquivo versionado, não uma lista copiada à mão (R8.46).
  const seed = readSheet(new URL('../migration/imob-intelligence-backend.xlsx', import.meta.url),
    'IVV_MONTHLY');
  assert.ok(seed.headers.length >= 18, 'a semente deveria ter os cabeçalhos de IVV_MONTHLY');
  const undeclared = seed.headers.filter((column) => !isDeclaredColumn(column));
  assert.deepEqual(
    undeclared, [],
    'cabeçalho da semente v1.0.0 sem classificação — acrescente o alias em LEGACY_COLUMN_ALIASES',
  );
  // A semente usa os nomes do schema v1.0.0; se um dia for reexportada com os nomes canônicos,
  // este alias vira redundante — e o teste abaixo avisa.
  assert.equal(classifyColumn('offered_units').canonicalKey, 'offers_units');
});

test('coluna que ninguém declarou é DESCONHECIDO, mesmo parecendo métrica', () => {
  for (const column of ['indicador_novo_units', 'rental_units', 'sales_unit', 'foo']) {
    assert.equal(classifyColumn(column).role, COLUMN_ROLES.DESCONHECIDO, column);
  }
  // A família derivada só reconhece o que tem base declarada: sufixo conhecido não é passe livre.
  assert.equal(classifyColumn('indicador_novo_ytd').role, COLUMN_ROLES.DESCONHECIDO);
  assert.equal(classifyColumn('rental_units_calc').role, COLUMN_ROLES.DESCONHECIDO);
});

test('famílias derivadas são reconhecidas pelo papel certo, nunca como métrica', () => {
  const cases = [
    ['sales_units_ytd', COLUMN_ROLES.ACUMULADO_ANO, 'sales_units'],
    ['ivv_ytd_pct', COLUMN_ROLES.ACUMULADO_ANO, 'ivv_pct'],
    ['ivv_calc_pct', COLUMN_ROLES.VERIFICACAO, 'ivv_pct'],
    ['ivv_pct_check', COLUMN_ROLES.VERIFICACAO, 'ivv_pct'],
    ['ivv_diff_pp', COLUMN_ROLES.VERIFICACAO, 'ivv_pct'],
    ['ivv_mom_pp', COLUMN_ROLES.VARIACAO, 'ivv_pct'],
    ['ivv_mom_pct_change', COLUMN_ROLES.VARIACAO, 'ivv_pct'],
    ['offers_units_yoy_pct_change', COLUMN_ROLES.VARIACAO, 'offers_units'],
  ];
  for (const [column, role, base] of cases) {
    const info = classifyColumn(column);
    assert.equal(info.role, role, column);
    assert.equal(info.canonicalKey, base, column);
    assert.equal(info.kind, null, `${column} não é métrica agregável`);
  }
});

test('ivv_mom_pp e ivv_mom_pct_change são grandezas distintas e nenhuma é a métrica publicada', () => {
  // +1 p.p. e +20% podem descrever o mesmo movimento: confundi-las é erro de leitura, não de conta.
  assert.notEqual(classifyColumn('ivv_mom_pp').role, COLUMN_ROLES.METRICA);
  assert.notEqual(classifyColumn('ivv_mom_pct_change').role, COLUMN_ROLES.METRICA);
  assert.equal(getMetric('ivv_mom_pp'), null);
  assert.equal(getMetric('ivv_mom_pct_change'), null);
});

test('o vocabulário de naturezas é fechado e cada métrica usa um valor dele', () => {
  const kinds = metricKindValues();
  assert.deepEqual(kinds.slice().sort(), ['estoque', 'fluxo', 'nao_somavel', 'preco', 'taxa']);
  for (const metric of IVV_METRICS) {
    assert.ok(kinds.includes(metric.kind), `${metric.key} tem kind fora do vocabulário`);
  }
});

test('a classificação por natureza está congelada — reclassificar exige mudar o teste', () => {
  const keysOf = (kind) => metricsByKind(kind).map((metric) => metric.key).sort();
  assert.deepEqual(keysOf(METRIC_KINDS.FLUXO), [
    'cancellations_units', 'launches_units', 'sales_units', 'sold_area_m2',
    'vgl_brl_million', 'vgv_brl_million',
  ]);
  assert.deepEqual(keysOf(METRIC_KINDS.ESTOQUE), ['offer_area_m2', 'offers_units', 'vgo_brl_million']);
  assert.deepEqual(keysOf(METRIC_KINDS.PRECO), ['asking_price_brl_m2', 'sale_price_brl_m2']);
  assert.deepEqual(keysOf(METRIC_KINDS.TAXA), ['ivv_pct']);
  assert.deepEqual(keysOf(METRIC_KINDS.NAO_SOMAVEL), ['launches_developments']);
});

test('toda métrica tem rótulo em português, unidade e justificativa', () => {
  const units = ['unidades', 'm2', 'brl_milhoes', 'brl_m2', 'fracao'];
  for (const metric of IVV_METRICS) {
    assert.equal(typeof metric.label, 'string');
    assert.ok(metric.label.length > 3, `${metric.key} sem rótulo legível`);
    assert.ok(units.includes(metric.unit), `${metric.key} com unidade fora da lista: ${metric.unit}`);
    assert.ok(metric.note && metric.note.length > 10, `${metric.key} sem justificativa da operação`);
  }
  assert.equal(new Set(METRIC_KEYS).size, METRIC_KEYS.length, 'chave duplicada no registro');
});

test('preço e taxa declaram numerador e denominador, e ambos são métricas do registro', () => {
  for (const metric of [...metricsByKind(METRIC_KINDS.PRECO), ...metricsByKind(METRIC_KINDS.TAXA)]) {
    assert.ok(METRIC_BY_KEY[metric.numerator], `${metric.key}: numerador não declarado`);
    assert.ok(METRIC_BY_KEY[metric.denominator], `${metric.key}: denominador não declarado`);
    assert.ok(Number.isFinite(metric.numeratorScale), `${metric.key}: sem escala do numerador`);
  }
  // A razão do preço mistura fluxo com fluxo e estoque com estoque — nunca cruzado.
  assert.equal(METRIC_BY_KEY.asking_price_brl_m2.numerator, 'vgo_brl_million');
  assert.equal(METRIC_BY_KEY.asking_price_brl_m2.denominator, 'offer_area_m2');
  assert.equal(METRIC_BY_KEY.sale_price_brl_m2.numerator, 'vgv_brl_million');
  assert.equal(METRIC_BY_KEY.sale_price_brl_m2.denominator, 'sold_area_m2');
});

test('a coluna de acumulado declarada existe no dataset e é classificada como acumulado', () => {
  const columns = new Set(columnsOf(fixtureRows));
  for (const metric of IVV_METRICS) {
    if (!metric.ytdColumn) continue;
    assert.equal(classifyColumn(metric.ytdColumn).role, COLUMN_ROLES.ACUMULADO_ANO, metric.ytdColumn);
    assert.ok(columns.has(metric.ytdColumn), `${metric.ytdColumn} ausente do fixture`);
  }
});

test('aliases do schema antigo apontam para métricas reais e não colidem com chave canônica', () => {
  for (const [legacy, canonical] of Object.entries(LEGACY_COLUMN_ALIASES)) {
    assert.ok(METRIC_BY_KEY[canonical], `${legacy} aponta para métrica inexistente: ${canonical}`);
    assert.equal(METRIC_BY_KEY[legacy], undefined, `${legacy} não pode ser chave canônica também`);
    assert.equal(classifyColumn(legacy).legacyOf, legacy);
  }
});

test('metadado é metadado, não métrica de mercado', () => {
  for (const column of IVV_METADATA_COLUMNS) {
    assert.equal(classifyColumn(column).role, COLUMN_ROLES.METADADO, column);
  }
  assert.equal(getMetric('reference_date'), null);
});

test('a escala do IVV é decimal e o registro diz isso', () => {
  // 0.057 = 5,7%. RA_PROFILES usa 54 para 54% — as duas escalas nunca se unificam (R8.44).
  assert.equal(METRIC_BY_KEY.ivv_pct.unit, 'fracao');
  assert.equal(IVV_PCT_SCALE.unit, 'fracao');
  assert.equal(IVV_PCT_SCALE.maxPlausible, 1);
  for (const row of fixtureRows) {
    assert.ok(row.ivv_pct > 0 && row.ivv_pct < 1, `${row.reference_month}: ivv_pct fora da escala`);
  }
});

test('o registro é imutável — política de agregação não se altera em runtime', () => {
  assert.throws(() => { IVV_METRICS.push({ key: 'x' }); });
  assert.throws(() => { METRIC_BY_KEY.sales_units = null; }, undefined,
    'METRIC_BY_KEY deveria estar congelado');
});
