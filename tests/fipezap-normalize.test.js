// Normalizadores de FIPEZAP_MONTHLY / FIPEZAP_LOCALITY_MONTHLY.
//
// O que este arquivo impede: coluna nova entrando sem aviso; `reference_date` não virando
// o dia 1º do mês; fração fora da escala decimal (yield acima de ~150%, sinal de ponto
// percentual) sendo aceita sem sinalização; linha sem data derrubando as demais.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIPEZAP_MONTHLY_COLUMNS, FIPEZAP_LOCALITY_COLUMNS,
  normalizeFipezapMonthly, normalizeFipezapLocality,
} from '../src/fipezap/normalize-fipezap.js';

const linhaMensal = (over = {}) => ({
  fipezap_id: 'FZ_202601_RESIDENCIAL_VENDA_DF_TOTAL_BRASILIA',
  reference_date: 'Date(2026,0,1)',
  segment_scope: 'RESIDENCIAL',
  transaction_type: 'VENDA',
  geography_scope: 'DF_TOTAL',
  source_locality_name: 'BRASILIA',
  price_unit: 'BRL_M2',
  price_brl_m2: '8000',
  ...over,
});

const linhaLocalidade = (over = {}) => ({
  locality_monthly_id: 'FZLOC_202601_RESIDENCIAL_AGUAS_CLARAS',
  reference_date: 'Date(2026,0,1)',
  segment_scope: 'RESIDENCIAL',
  source_locality_name: 'AGUAS CLARAS',
  ra_name: 'Águas Claras',
  ra_geo_id: 'RA_20',
  sale_price_brl_m2: '6000',
  rent_price_brl_m2_month: '30',
  ...over,
});

test('as 39 colunas de FIPEZAP_MONTHLY e as 26 de FIPEZAP_LOCALITY_MONTHLY são as observadas ao vivo', () => {
  assert.equal(FIPEZAP_MONTHLY_COLUMNS.length, 39);
  assert.equal(FIPEZAP_LOCALITY_COLUMNS.length, 26);
  assert.ok(Object.isFrozen(FIPEZAP_MONTHLY_COLUMNS));
});

test('reference_date é fixado no dia 1º do mês, como no IVV_MONTHLY', () => {
  const { rows } = normalizeFipezapMonthly([linhaMensal({ reference_date: 'Date(2026,4,18)' })]);
  assert.equal(rows[0].reference_date, '2026-05-01');
  assert.equal(rows[0].year, 2026);
  assert.equal(rows[0].month, 5);
});

test('linha sem reference_date utilizável é descartada com aviso, não derruba as demais', () => {
  const { rows, warnings } = normalizeFipezapMonthly([
    linhaMensal({ reference_date: '' }),
    linhaMensal(),
  ]);
  assert.equal(rows.length, 1);
  assert.ok(warnings.some((w) => /sem `reference_date`/.test(w)), warnings.join(' · '));
});

test('coluna não declarada vira aviso nomeado, nunca falha silenciosa', () => {
  const { warnings } = normalizeFipezapMonthly([linhaMensal({ coluna_nova_do_backend: 'x' })]);
  assert.ok(warnings.some((w) => /coluna_nova_do_backend/.test(w)), warnings.join(' · '));
});

test('yield em escala decimal plausível não gera aviso; ponto percentual (>1.5) gera', () => {
  const ok = normalizeFipezapMonthly([
    linhaMensal({ transaction_type: 'LOCACAO', official_yield_annual_pct: '0.042' }),
  ]);
  assert.equal(ok.rows[0].official_yield_annual_pct, 0.042);
  assert.equal(ok.warnings.length, 0);

  const suspeito = normalizeFipezapMonthly([
    linhaMensal({ transaction_type: 'LOCACAO', official_yield_annual_pct: '4.2' }),
  ]);
  // O valor chega como veio — nunca convertido às cegas — mas sinalizado.
  assert.equal(suspeito.rows[0].official_yield_annual_pct, 4.2);
  assert.ok(suspeito.warnings.some((w) => /fora da escala decimal/.test(w)), suspeito.warnings.join(' · '));
});

test('FIPEZAP_LOCALITY_MONTHLY: venda e locação chegam pareadas na mesma linha', () => {
  const { rows } = normalizeFipezapLocality([linhaLocalidade()]);
  assert.equal(rows[0].sale_price_brl_m2, 6000);
  assert.equal(rows[0].rent_price_brl_m2_month, 30);
  assert.equal(rows[0].ra_name, 'Águas Claras');
  assert.equal(rows[0].ra_geo_id, 'RA_20');
});

test('linhas normalizadas saem ordenadas por reference_date', () => {
  const { rows } = normalizeFipezapMonthly([
    linhaMensal({ fipezap_id: 'b', reference_date: 'Date(2026,2,1)' }),
    linhaMensal({ fipezap_id: 'a', reference_date: 'Date(2026,0,1)' }),
  ]);
  assert.deepEqual(rows.map((r) => r.fipezap_id), ['a', 'b']);
});

test('URL inválida ou sem esquema http(s) vira null, nunca é preservada como veio', () => {
  const { rows } = normalizeFipezapMonthly([linhaMensal({ source_url: 'javascript:alert(1)' })]);
  assert.equal(rows[0].source_url, undefined);
});
