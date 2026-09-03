// Preço FipeZap por Região Administrativa — seletor de localidade e gráfico venda × locação.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIPEZAP_SEGMENTS, localitiesAvailable, buildLocalityCharts, formatLocalityDisplayName,
} from '../src/fipezap/locality.js';

const linha = (over = {}) => ({
  reference_date: '2026-01-01',
  segment_scope: 'RESIDENCIAL',
  source_locality_name: 'AGUAS CLARAS',
  ra_name: 'Águas Claras',
  sale_price_brl_m2: 6000,
  rent_price_brl_m2_month: 30,
  sale_diff_vs_df_pct: null,
  rent_diff_vs_df_pct: null,
  ...over,
});

test('FIPEZAP_SEGMENTS tem os dois segmentos, residencial primeiro', () => {
  assert.deepEqual(FIPEZAP_SEGMENTS.map((s) => s.value), ['RESIDENCIAL', 'COMERCIAL']);
});

test('localitiesAvailable só lista localidades com dado no segmento pedido, sem repetir', () => {
  const rows = [
    linha({ source_locality_name: 'AGUAS CLARAS' }),
    linha({ source_locality_name: 'AGUAS CLARAS', reference_date: '2026-02-01' }),
    linha({ source_locality_name: 'GAMA', ra_name: 'Gama' }),
    linha({ source_locality_name: 'SIA', ra_name: 'SIA', segment_scope: 'COMERCIAL' }),
  ];
  const residencial = localitiesAvailable(rows, 'RESIDENCIAL');
  assert.deepEqual(residencial.map((i) => i.locality).sort(), ['AGUAS CLARAS', 'GAMA']);

  const comercial = localitiesAvailable(rows, 'COMERCIAL');
  assert.deepEqual(comercial.map((i) => i.locality), ['SIA']);
});

test('localitiesAvailable ordena por nome de RA, não pelo nome cru da fonte', () => {
  const rows = [
    linha({ source_locality_name: 'TAGUATINGA NORTE', ra_name: 'Taguatinga' }),
    linha({ source_locality_name: 'AGUAS CLARAS', ra_name: 'Águas Claras' }),
  ];
  const lista = localitiesAvailable(rows, 'RESIDENCIAL');
  assert.deepEqual(lista.map((i) => i.raName), ['Águas Claras', 'Taguatinga']);
});

test('buildLocalityCharts monta venda e locação como DOIS gráficos de uma série, não um de duas', () => {
  const rows = [
    linha(),
    linha({ source_locality_name: 'GAMA', ra_name: 'Gama', sale_price_brl_m2: 4000, rent_price_brl_m2_month: 20 }),
  ];
  const [venda, locacao] = buildLocalityCharts(rows, { locality: 'AGUAS CLARAS', segmentScope: 'RESIDENCIAL' });
  assert.equal(venda.vazio, false);
  assert.equal(venda.series.length, 1);
  assert.equal(locacao.series.length, 1);
  assert.equal(venda.series[0].pontos[0].valor, 6000);
  assert.equal(locacao.series[0].pontos[0].valor, 30);
  // Gama não deveria vazar para o gráfico de Águas Claras.
  assert.equal(venda.series[0].pontos.length, 1);
});

test('formatLocalityDisplayName capitaliza sem inventar acento', () => {
  assert.equal(formatLocalityDisplayName('ASA SUL'), 'Asa Sul');
  assert.equal(formatLocalityDisplayName('AGUAS CLARAS'), 'Aguas Claras');
});

test('localitiesAvailable marca ambiguous quando duas localidades caem na mesma RA', () => {
  const rows = [
    linha({ source_locality_name: 'ASA SUL', ra_name: 'Plano Piloto' }),
    linha({ source_locality_name: 'ASA NORTE', ra_name: 'Plano Piloto' }),
    linha({ source_locality_name: 'GAMA', ra_name: 'Gama' }),
  ];
  const lista = localitiesAvailable(rows, 'RESIDENCIAL');
  const porLocalidade = Object.fromEntries(lista.map((i) => [i.locality, i]));
  assert.equal(porLocalidade['ASA SUL'].ambiguous, true);
  assert.equal(porLocalidade['ASA NORTE'].ambiguous, true);
  assert.equal(porLocalidade['GAMA'].ambiguous, false);
  assert.equal(porLocalidade['ASA SUL'].displayName, 'Asa Sul');
});

test('resumo mostra a diferença vs. DF do mês mais recente, com direção explícita', () => {
  const rows = [
    linha({ reference_date: '2025-12-01', sale_diff_vs_df_pct: -0.5 }),
    linha({ reference_date: '2026-01-01', sale_diff_vs_df_pct: -0.1017, rent_diff_vs_df_pct: 0.032 }),
  ];
  const [venda, locacao] = buildLocalityCharts(rows, { locality: 'AGUAS CLARAS', segmentScope: 'RESIDENCIAL' });
  assert.equal(venda.resumo.valor, '−10,2%');
  assert.match(venda.resumo.rotulo, /abaixo da média do DF em jan\.\/2026/);
  assert.equal(locacao.resumo.valor, '+3,2%');
  assert.match(locacao.resumo.rotulo, /acima da média do DF/);
});

test('sem diff publicado, o resumo some em vez de mostrar zero', () => {
  const [venda] = buildLocalityCharts([linha({ sale_diff_vs_df_pct: null })], {
    locality: 'AGUAS CLARAS', segmentScope: 'RESIDENCIAL',
  });
  assert.equal(venda.resumo, null);
});

test('localidade sem nenhuma linha no segmento produz os dois gráficos vazios, não erro', () => {
  const [venda, locacao] = buildLocalityCharts([linha()], { locality: 'INEXISTENTE', segmentScope: 'RESIDENCIAL' });
  assert.equal(venda.vazio, true);
  assert.equal(locacao.vazio, true);
});
