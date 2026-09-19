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

// --- Período: contrato `period_id = YYYY-MM`, `reference_date = YYYY-MM-01` (issue #122) ---

import { periodIdOf, normalizeFipezapLocalityMap, FIPEZAP_LOCALITY_MAP_COLUMNS } from '../src/fipezap/normalize-fipezap.js';

test('periodIdOf lê texto YYYY-MM, ISO, Date(y,m,d) e Date(y,m) do GViz, Date real e serial', () => {
  assert.equal(periodIdOf('2026-07'), '2026-07');
  assert.equal(periodIdOf('2026-07-01'), '2026-07');
  assert.equal(periodIdOf('Date(2026,6,1)'), '2026-07');
  assert.equal(periodIdOf('Date(2026,6)'), '2026-07');
  assert.equal(periodIdOf(new Date(Date.UTC(2011, 0, 1))), '2011-01');
  assert.equal(periodIdOf(46143), '2026-05', 'serial de planilha');
  for (const bad of ['', null, undefined, 'jul/2026', 'abc']) assert.equal(periodIdOf(bad), null);
});

test('period_id sai sempre YYYY-MM e reference_date YYYY-MM-01, venha a célula como Date, ISO, GViz ou serial', () => {
  const formas = [
    { reference_date: new Date(Date.UTC(2011, 0, 15)), period_id: new Date(Date.UTC(2011, 0, 1)) },
    { reference_date: '2011-01-01', period_id: '2011-01' },
    { reference_date: 'Date(2011,0,1)', period_id: 'Date(2011,0,1)' },
    { reference_date: 40544, period_id: 40544 }, // serial de 2011-01-01
  ];
  for (const forma of formas) {
    const { rows, warnings } = normalizeFipezapMonthly([linhaMensal(forma)]);
    assert.equal(rows[0].period_id, '2011-01', JSON.stringify(forma));
    assert.equal(rows[0].reference_date, '2011-01-01');
    assert.equal(warnings.length, 0, warnings.join(' · '));
  }
});

test('sem reference_date, period_id sozinho vale como eixo; sem os dois, a linha cai com aviso', () => {
  const { rows, warnings } = normalizeFipezapMonthly([
    linhaMensal({ fipezap_id: 'so_periodo', reference_date: '', period_id: '2019-03' }),
    linhaMensal({ fipezap_id: 'nada', reference_date: '', period_id: '' }),
  ]);
  assert.deepEqual(rows.map((r) => r.fipezap_id), ['so_periodo']);
  assert.equal(rows[0].reference_date, '2019-03-01');
  assert.equal(rows[0].period_id, '2019-03');
  assert.ok(warnings.some((w) => /sem `reference_date` nem `period_id`/.test(w)), warnings.join(' · '));
});

test('period_id da aba discordando da data vira aviso; o eixo é o da data', () => {
  const { rows, warnings } = normalizeFipezapMonthly([
    linhaMensal({ reference_date: '2011-02-01', period_id: '2011-01' }),
  ]);
  assert.equal(rows[0].period_id, '2011-02');
  assert.ok(warnings.some((w) => /`period_id` diferente do mês/.test(w) && /2011-01 × 2011-02/.test(w)), warnings.join(' · '));
});

test('observação repetida (mesmo período × segmento × operação × geografia × localidade) sai com aviso; a primeira fica', () => {
  const { rows, warnings } = normalizeFipezapMonthly([
    linhaMensal({ fipezap_id: 'primeira', price_brl_m2: '8000' }),
    linhaMensal({ fipezap_id: 'repetida', price_brl_m2: '9000' }),
    linhaMensal({ fipezap_id: 'outra_operacao', transaction_type: 'LOCACAO', price_brl_m2: '30' }),
    linhaMensal({ fipezap_id: 'outro_mes', reference_date: 'Date(2026,1,1)' }),
  ]);
  assert.deepEqual(rows.map((r) => r.fipezap_id), ['primeira', 'outra_operacao', 'outro_mes']);
  assert.equal(rows[0].price_brl_m2, 8000);
  assert.ok(warnings.some((w) => /1 observação\(ões\) repetida/.test(w)), warnings.join(' · '));
});

test('segmento, operação ou geografia fora do vocabulário ficam na linha e viram aviso nomeado', () => {
  const { rows, warnings } = normalizeFipezapMonthly([
    linhaMensal({ segment_scope: 'RURAL' }),
    linhaMensal({ transaction_type: 'ALUGUEL', reference_date: 'Date(2026,1,1)' }),
    linhaMensal({ geography_scope: 'BAIRRO', reference_date: 'Date(2026,2,1)' }),
  ]);
  assert.equal(rows.length, 3, 'nada é apagado');
  assert.equal(rows[0].segment_scope, 'RURAL');
  assert.ok(warnings.some((w) => /`segment_scope` fora do vocabulário/.test(w) && /RURAL \(1\)/.test(w)), warnings.join(' · '));
  assert.ok(warnings.some((w) => /`transaction_type` fora do vocabulário/.test(w)));
  assert.ok(warnings.some((w) => /`geography_scope` fora do vocabulário/.test(w)));
});

test('FIPEZAP_LOCALITY_MONTHLY: período incompleto (só mês) e duplicidade por período × segmento × localidade', () => {
  const { rows, warnings } = normalizeFipezapLocality([
    linhaLocalidade({ reference_date: '', period_id: '2026-01' }),
    linhaLocalidade({ locality_monthly_id: 'dup' }),
    linhaLocalidade({ locality_monthly_id: 'gama', source_locality_name: 'GAMA' }),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].period_id, '2026-01');
  assert.ok(warnings.some((w) => /repetida/.test(w)), warnings.join(' · '));
});

test('FIPEZAP_LOCALITY_MAP: preserva o nome original, a RA e o tipo de correspondência; ignora repetido e sem nome', () => {
  assert.equal(FIPEZAP_LOCALITY_MAP_COLUMNS.length, 12);
  const { rows, warnings } = normalizeFipezapLocalityMap([
    { locality_map_id: 'FZMAP_ASA_SUL', source_locality_name: 'ASA SUL', ra_name: 'Plano Piloto', ra_geo_id: 'RA_01',
      geography_classification: 'SUBMERCADO_FIPE', mapping_rule: 'Mantém submercado', valid_from: 'Date(2019,2,1)', valid_to: '' },
    { locality_map_id: 'FZMAP_ASA_SUL', source_locality_name: 'ASA SUL' },
    { locality_map_id: 'FZMAP_BRASILIA', source_locality_name: 'BRASILIA', ra_name: 'Distrito Federal', ra_geo_id: '', geography_classification: 'AGREGADO_DF' },
    { locality_map_id: 'FZMAP_X', source_locality_name: '' },
    { locality_map_id: 'FZMAP_Y', source_locality_name: 'VILA AREAL', coluna_estranha: 1 },
  ]);
  assert.deepEqual(rows.map((r) => r.source_locality_name), ['ASA SUL', 'BRASILIA', 'VILA AREAL']);
  assert.equal(rows[0].ra_geo_id, 'RA_01');
  assert.equal(rows[0].geography_classification, 'SUBMERCADO_FIPE');
  assert.equal(rows[0].valid_from, '2019-03-01');
  assert.equal(rows[0].valid_to, undefined, 'vigente: sem valid_to');
  assert.equal(rows[1].ra_geo_id, undefined, 'agregado do DF não recebe RA inventada');
  assert.ok(warnings.some((w) => /repetido/.test(w)));
  assert.ok(warnings.some((w) => /sem `source_locality_name`/.test(w)));
  assert.ok(warnings.some((w) => /coluna_estranha/.test(w)));
  assert.deepEqual(normalizeFipezapLocalityMap([]).rows, []);
  assert.deepEqual(normalizeFipezapLocalityMap(null).rows, []);
});

test('periodIdOf recusa mês fora de 01..12 — forma certa com mês errado é aviso, não período', () => {
  assert.equal(periodIdOf('2011-13'), null);
  assert.equal(periodIdOf('Date(2011,12)'), null);
  assert.equal(periodIdOf('2011-12'), '2011-12');
  assert.equal(periodIdOf('Date(2011,11)'), '2011-12');
});
