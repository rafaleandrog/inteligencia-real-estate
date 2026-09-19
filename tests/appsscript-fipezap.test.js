import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppsScriptSandbox, readJsonOutput } from './helpers/appsScriptSandbox.mjs';

// v2.4.0 (issue #120): o adendo FipeZAP que rodava só no script instalado exigia
// `period_id` como texto `^\d{4}-\d{2}$`. O Google converte "2011-01" em Date, e o
// resultado eram 3369 FIPEZAP_INVALID_PERIOD para um dado correto — um por linha. Estes
// testes fixam o contrato de leitura de período e as regras semânticas da série.

const MONTHLY_HEADERS = [
  'fipezap_id', 'period_id', 'reference_date', 'year', 'month', 'month_label', 'quarter',
  'is_latest_period', 'segment_scope', 'transaction_type', 'geography_scope',
  'source_locality_name', 'ra_name', 'ra_geo_id', 'geography_classification', 'price_unit',
  'sample_n', 'price_brl_m2', 'official_yield_monthly_pct', 'official_yield_annual_pct',
  'price_mom_pct_change', 'price_ytd_pct_change', 'price_yoy_pct_change',
  'calculated_yield_monthly_pct', 'calculated_yield_annual_pct', 'price_to_rent_months',
  'diff_vs_df_pct', 'rank_price', 'rank_yoy', 'source_publisher', 'source_type', 'source_url',
  'source_page', 'notes', 'quality_flag', 'imported_at', 'source_workbook', 'source_id', 'note_id',
];

function monthlyRow(over = {}) {
  const base = {
    fipezap_id: 'FZ_201101_RESIDENCIAL_VENDA_DF_TOTAL_BRASILIA',
    period_id: new Date(Date.UTC(2011, 0, 1)),
    reference_date: new Date(Date.UTC(2011, 0, 1)),
    year: 2011, month: 1, month_label: 'jan./2011', quarter: '1T', is_latest_period: false,
    segment_scope: 'RESIDENCIAL', transaction_type: 'VENDA', geography_scope: 'DF_TOTAL',
    source_locality_name: 'BRASILIA', ra_name: 'Distrito Federal', ra_geo_id: '',
    geography_classification: 'AGREGADO_DF', price_unit: 'BRL_M2', sample_n: '',
    price_brl_m2: 7004, source_publisher: 'Fipe', source_type: 'PDF', source_url: 'https://fipe.org.br/x.pdf',
    source_page: '2', notes: '', quality_flag: 'ok', imported_at: '2026-09-02',
    source_workbook: 'FipeZAP_Brasilia_Base_Final.xlsx', source_id: 'FZSRC_0001', note_id: '',
  };
  const row = { ...base, ...over };
  // Linha coerente por padrão: quem sobrescreve só o período ganha a data do mesmo mês.
  if (over.period_id !== undefined && over.reference_date === undefined && /^\d{4}-\d{2}$/.test(String(over.period_id))) {
    row.reference_date = `${over.period_id}-01`;
  }
  return MONTHLY_HEADERS.map((h) => (row[h] === undefined ? '' : row[h]));
}

// As três abas obrigatórias entram com o cabeçalho completo do contrato, senão cada uma
// gera MISSING_HEADER e o teste de "zero erros" mede a coisa errada.
const CONTRACT_HEADERS = (() => {
  const { context } = createAppsScriptSandbox();
  return Object.fromEntries(['LISTINGS', 'DEVELOPMENTS', 'ANCHORS', 'RA_PROFILES'].map((s) => [s, [...context.REQUIRED_HEADERS[s]]]));
})();

function sandboxWith(monthlyRows, extra = {}) {
  return createAppsScriptSandbox({
    sheets: {
      APP_META: [['key', 'value', 'updated_at']],
      DATA_QUALITY: [['severity', 'sheet', 'row', 'record_id', 'field', 'code', 'message', 'detected_at', 'category']],
      CHANGE_LOG: [['timestamp', 'sheet', 'range', 'record_id', 'old_value', 'new_value', 'editor', 'correlation_id', 'result', 'error_reason']],
      LISTINGS: [CONTRACT_HEADERS.LISTINGS],
      DEVELOPMENTS: [CONTRACT_HEADERS.DEVELOPMENTS],
      ANCHORS: [CONTRACT_HEADERS.ANCHORS],
      FIPEZAP_MONTHLY: [MONTHLY_HEADERS, ...monthlyRows],
      FIPEZAP_SOURCES: [['source_id', 'period_id', 'reference_date', 'year', 'month', 'segment_scope', 'report_type', 'source_type', 'source_page_brasilia', 'source_url', 'source_note', 'source_publisher', 'source_workbook', 'quality_flag', 'imported_at'],
        ['FZSRC_0001', new Date(Date.UTC(2011, 0, 1)), new Date(Date.UTC(2011, 0, 1)), 2011, 1, 'RESIDENCIAL', 'VENDA', 'PDF', '2', 'https://fipe.org.br/x.pdf', '', 'Fipe', 'wb', 'ok', '2026-09-02']],
      FIPEZAP_NOTES: [['note_id', 'note_text', 'note_type', 'source_workbook', 'quality_flag', 'updated_at'], ['FZNOTE_01', 'nota', 'metodologia', 'wb', 'ok', '2026-09-02']],
      FIPEZAP_LOCALITY_MAP: [['locality_map_id', 'source_locality_name', 'ra_name', 'ra_geo_id', 'geography_classification', 'mapping_rule', 'methodology_note', 'valid_from', 'valid_to', 'quality_flag', 'source_workbook', 'updated_at'],
        ['FZMAP_AGUAS_CLARAS', 'AGUAS CLARAS', 'Águas Claras', 'RA_20', 'RA_OU_LOCALIDADE_FIPE', '', '', '2019-03-01', '', 'ok', 'wb', '2026-09-02']],
      RA_PROFILES: [CONTRACT_HEADERS.RA_PROFILES,
        CONTRACT_HEADERS.RA_PROFILES.map((h) => ({ ra_geo_id: 'RA_20', ra_name: 'Águas Claras', ra_code: 'RA-XX' })[h] ?? '')],
      ...extra,
    },
    scriptProperties: { DATASET_VERSION: '3' },
  });
}

function findings(sandbox) {
  return sandbox.sheets.DATA_QUALITY._rows.slice(1).filter((r) => r.some((v) => v !== '' && v !== undefined));
}

test('periodIdOf_ lê Date, ISO, YYYY-MM e a forma Date(y,m) do GViz; recusa o resto', () => {
  const { context } = createAppsScriptSandbox();
  assert.equal(context.periodIdOf_(new Date(Date.UTC(2011, 0, 1))), '2011-01');
  assert.equal(context.periodIdOf_('2026-07'), '2026-07');
  assert.equal(context.periodIdOf_('2026-07-01'), '2026-07');
  assert.equal(context.periodIdOf_('2026-07-01T00:00:00Z'), '2026-07');
  assert.equal(context.periodIdOf_('Date(2026,6,1)'), '2026-07');
  assert.equal(context.periodIdOf_('Date(2026,11)'), '2026-12');
  for (const bad of ['', null, undefined, 'jul/2026', '2026', '202607', new Date('x')]) {
    assert.equal(context.periodIdOf_(bad), '', JSON.stringify(String(bad)));
  }
  assert.equal(context.dateTextOf_(new Date(Date.UTC(2011, 0, 1))), '2011-01-01');
  assert.equal(context.dateTextOf_('2011-01'), '2011-01-01');
  assert.equal(context.dateTextOf_('nada'), '');
});

test('célula Date em period_id NÃO é erro — era isso que produzia 3369 FIPEZAP_INVALID_PERIOD', () => {
  const sandbox = sandboxWith([monthlyRow()]);
  sandbox.context.validateAll();
  const codes = findings(sandbox).map((r) => r[5]);
  assert.ok(!codes.includes('FIPEZAP_INVALID_PERIOD'), `período Date foi rejeitado: ${codes.join(', ')}`);
  assert.ok(!codes.includes('FIPEZAP_COVERAGE_RANGE'));
  assert.equal(sandbox.sheets.APP_META._rows.find((r) => r[0] === 'validation_errors')[1], '0');
});

test('período ilegível continua sendo erro, e reference_date fora do mês também', () => {
  const sandbox = sandboxWith([
    monthlyRow({ fipezap_id: 'A', period_id: 'jan/2011' }),
    monthlyRow({ fipezap_id: 'B', period_id: '2011-02', reference_date: '2011-03-01' }),
  ]);
  sandbox.context.validateAll();
  const byId = {};
  for (const r of findings(sandbox)) (byId[r[3]] ||= []).push(r[5]);
  assert.ok(byId.A.includes('FIPEZAP_INVALID_PERIOD'));
  assert.ok(byId.B.includes('FIPEZAP_PERIOD_MISMATCH'));
});

test('regras semânticas: segmento, operação, geografia, preço, fonte, nota, RA e duplicidade', () => {
  const sandbox = sandboxWith([
    monthlyRow({ fipezap_id: 'OK' }),
    monthlyRow({ fipezap_id: 'DUP' }), // mesma chave lógica da linha OK
    monthlyRow({ fipezap_id: 'SEG', period_id: '2011-02', segment_scope: 'RURAL' }),
    monthlyRow({ fipezap_id: 'OP', period_id: '2011-03', transaction_type: 'ALUGUEL' }),
    monthlyRow({ fipezap_id: 'GEO', period_id: '2011-04', geography_scope: 'BAIRRO' }),
    monthlyRow({ fipezap_id: 'PRICE', period_id: '2011-05', price_brl_m2: 0 }),
    monthlyRow({ fipezap_id: 'SRC', period_id: '2011-06', source_id: 'FZSRC_9999' }),
    monthlyRow({ fipezap_id: 'NOTE', period_id: '2011-07', note_id: 'FZNOTE_99' }),
    monthlyRow({ fipezap_id: 'RA', period_id: '2019-03', geography_scope: 'LOCALIDADE', source_locality_name: 'LAGO SUL', ra_geo_id: 'RA_99' }),
    monthlyRow({ fipezap_id: 'LOC', period_id: '2019-04', geography_scope: 'LOCALIDADE', source_locality_name: 'AGUAS CLARAS', ra_geo_id: 'RA_20' }),
  ]);
  sandbox.context.validateAll();
  const byId = {};
  for (const r of findings(sandbox)) (byId[r[3]] ||= []).push(r[5]);
  assert.equal(byId.OK, undefined, 'a linha correta não pode gerar achado');
  assert.ok(byId.DUP.includes('FIPEZAP_DUPLICATE_OBSERVATION'));
  assert.ok(byId.SEG.includes('FIPEZAP_INVALID_SEGMENT'));
  assert.ok(byId.OP.includes('FIPEZAP_INVALID_OPERATION'));
  assert.ok(byId.GEO.includes('FIPEZAP_INVALID_GEOGRAPHY'));
  assert.ok(byId.PRICE.includes('FIPEZAP_INVALID_PRICE'));
  assert.ok(byId.SRC.includes('FIPEZAP_MISSING_SOURCE'));
  assert.ok(byId.NOTE.includes('FIPEZAP_NOTE_NOT_FOUND'));
  assert.ok(byId.RA.includes('FIPEZAP_RA_NOT_MAPPED'));
  assert.ok(byId.RA.includes('FIPEZAP_LOCALITY_NOT_IN_MAP'));
  assert.equal(byId.LOC, undefined, 'localidade mapeada com RA válida não gera achado');
});

test('lacuna de mês na série agregada vira aviso de cobertura, não erro', () => {
  const sandbox = sandboxWith([
    monthlyRow({ fipezap_id: 'A', period_id: '2011-01' }),
    monthlyRow({ fipezap_id: 'B', period_id: '2011-04' }),
  ]);
  sandbox.context.validateAll();
  const gap = findings(sandbox).find((r) => r[5] === 'FIPEZAP_COVERAGE_GAP');
  assert.ok(gap, 'lacuna não sinalizada');
  assert.equal(gap[0], 'warning');
  assert.match(gap[6], /2011-02, 2011-03/);
  assert.equal(gap[8], 'coverage');
});

test('contagem esperada só é cobrada quando APP_META a publica — e é aviso', () => {
  const sandbox = sandboxWith([monthlyRow()]);
  sandbox.context.validateAll();
  assert.ok(!findings(sandbox).some((r) => r[5] === 'FIPEZAP_ROW_COUNT'));

  sandbox.context.setMeta_('fipezap_expected_rows_monthly', '3369');
  sandbox.context.validateAll();
  const count = findings(sandbox).find((r) => r[5] === 'FIPEZAP_ROW_COUNT');
  assert.ok(count);
  assert.equal(count[0], 'warning');
  assert.equal(count[8], 'schema');
});

test('?resource=fipezap filtra por período normalizado e devolve period_id como texto', () => {
  const sandbox = sandboxWith([
    monthlyRow({ fipezap_id: 'A', period_id: new Date(Date.UTC(2011, 0, 1)) }),
    monthlyRow({ fipezap_id: 'B', period_id: '2011-02', reference_date: '2011-02-01' }),
    monthlyRow({ fipezap_id: 'C', period_id: '2011-03', reference_date: '2011-03-01' }),
  ]);
  const res = readJsonOutput(sandbox.context.doGet({ parameter: { resource: 'fipezap', view: 'monthly', from: '2011-02', to: '2011-02' } }));
  assert.equal(res.count, 1);
  assert.equal(res.rows[0].fipezap_id, 'B');
  assert.equal(res.rows[0].period_id, '2011-02');
  assert.equal(res.rows[0].reference_date, '2011-02-01');

  const all = readJsonOutput(sandbox.context.doGet({ parameter: { resource: 'fipezap' } }));
  assert.equal(all.count, 3);
  assert.equal(all.rows[0].period_id, '2011-01', 'Date sai como texto YYYY-MM');

  const bad = readJsonOutput(sandbox.context.doGet({ parameter: { resource: 'fipezap', view: 'tudo' } }));
  assert.match(bad.error, /view FipeZAP inválida/);
});

test('as cinco abas FipeZAP e as três PDAD estão em ALLOWED_DATASETS; o sync não roda no setup', () => {
  const sandbox = sandboxWith([]);
  for (const sheet of ['FIPEZAP_MONTHLY', 'FIPEZAP_LOCALITY_MONTHLY', 'FIPEZAP_LOCALITY_MAP',
    'FIPEZAP_SOURCES', 'FIPEZAP_NOTES', 'PDAD_A_DATA', 'PDAD_A_FIGURE_MAP', 'PDAD_A_GUIDE']) {
    assert.ok(sandbox.context.ALLOWED_DATASETS.includes(sheet), `${sheet} fora de ALLOWED_DATASETS`);
  }
  // `openById` lança no sandbox: se setupProject disparasse o sync, este teste explodiria.
  assert.doesNotThrow(() => sandbox.context.setupProject());
  assert.equal(sandbox.context.getMeta_('fipezap_data_load_status'), 'pending_manual_sync');
});

test('rebuildFipezapLocalityMonthly_ pareia venda e locação por período × segmento × localidade', () => {
  const sandbox = sandboxWith([
    monthlyRow({ fipezap_id: 'V', period_id: new Date(Date.UTC(2019, 2, 1)), reference_date: new Date(Date.UTC(2019, 2, 1)), geography_scope: 'LOCALIDADE', source_locality_name: 'AGUAS CLARAS', ra_geo_id: 'RA_20', price_brl_m2: 6000 }),
    monthlyRow({ fipezap_id: 'L', period_id: new Date(Date.UTC(2019, 2, 1)), reference_date: new Date(Date.UTC(2019, 2, 1)), geography_scope: 'LOCALIDADE', source_locality_name: 'AGUAS CLARAS', ra_geo_id: 'RA_20', transaction_type: 'LOCACAO', price_brl_m2: 30 }),
    monthlyRow({ fipezap_id: 'S', period_id: '2019-04', reference_date: '2019-04-01', geography_scope: 'LOCALIDADE', source_locality_name: 'LAGO SUL', ra_geo_id: 'RA_16', price_brl_m2: 8000 }),
  ]);
  const built = sandbox.context.rebuildFipezapLocalityMonthly_();
  assert.equal(built, 2);
  const rows = sandbox.sheets.FIPEZAP_LOCALITY_MONTHLY._rows;
  const headers = rows[0];
  const rec = (i) => Object.fromEntries(headers.map((h, c) => [h, rows[i][c]]));
  const aguas = rec(1);
  assert.equal(aguas.period_id, '2019-03');
  assert.equal(aguas.reference_date, '2019-03-01');
  assert.equal(aguas.sale_price_brl_m2, 6000);
  assert.equal(aguas.rent_price_brl_m2_month, 30);
  assert.equal(aguas.calculated_yield_monthly_pct, 30 / 6000);
  assert.equal(aguas.quality_flag, 'ok');
  assert.equal(rec(2).quality_flag, 'partial_sale_only');
});
