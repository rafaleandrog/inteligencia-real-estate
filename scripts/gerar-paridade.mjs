#!/usr/bin/env node
// Fixture de paridade da app (spec 18.1, D-103): roda o código do SITE sobre o retrato
// de dados e grava os números que a app tem de reproduzir. Recebe por argumento um
// checkout do site num commit fixado (uma `git worktree` deste repositório) e grava o
// commit no arquivo, para a fixture dizer de que código saiu.
//
//   git worktree add /tmp/site-<sha> <sha>
//   node scripts/gerar-paridade.mjs /tmp/site-<sha> [AAAA-MM-DD]
//
// A entrada é o `data/demo.json` daquele checkout (o mesmo recorte das fixtures da app);
// com o retrato datado da planilha em `migracao/AAAA-MM-DD/`, troque a leitura abaixo.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const site = resolve(process.argv[2] ?? '.');
const data = process.argv[3] ?? new Date().toISOString().slice(0, 10);
const commit = execFileSync('git', ['-C', site, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const { normalizeListing } = await import(pathToFileURL(join(site, 'src/normalize.js')).href);
const { createFilterState, applyFilters, computeKpis } = await import(pathToFileURL(join(site, 'src/filters.js')).href);

const demo = JSON.parse(readFileSync(join(site, 'data/demo.json'), 'utf8'));
const anuncios = demo.listings.map(normalizeListing);

// Os cenários de mapa: filtro do site → querystring da app (vocabulário fechado, spec 10.1).
const CENARIOS = [
  { nome: 'todos', site: {}, app: {} },
  { nome: 'plano_piloto', site: { ra: 'RA2026_RA-I' }, app: { localidade: 'RA_01' } },
  { nome: 'apartamentos', site: { propertyType: 'apartamento' }, app: { tipo_imovel: 'apartamento' } },
  { nome: 'casas', site: { propertyType: 'casa' }, app: { tipo_imovel: 'casa' } },
  { nome: 'terrenos', site: { propertyType: 'terreno' }, app: { tipo_imovel: 'terreno' } },
  { nome: 'ate_1_milhao', site: { priceMax: 1000000 }, app: { preco_max: '1000000' } },
  { nome: 'acima_2_milhoes', site: { priceMin: 2000000 }, app: { preco_min: '2000000' } },
  { nome: 'tres_quartos_ou_mais', site: { bedrooms: 3 }, app: { quartos_min: '3' } },
  { nome: 'busca_asa_norte', site: { search: 'asa norte' }, app: { q: 'asa norte' } },
  { nome: 'apartamentos_plano_piloto', site: { ra: 'RA2026_RA-I', propertyType: 'apartamento' }, app: { localidade: 'RA_01', tipo_imovel: 'apartamento' } },
];

const mapa = CENARIOS.map((c) => {
  const estado = { ...createFilterState(), ...c.site, layers: new Set(['listing']) };
  const visiveis = applyFilters(anuncios, estado);
  const k = computeKpis(visiveis);
  return { nome: c.nome, query: c.app, anuncios: k.visible, mediana_preco_m2: k.medianPriceM2, amostra_preco_m2: k.medianPriceM2Sample };
});

// Mercado (spec 15.2): o motor do IVV do site sobre a série sintética dos testes do site
// (`tests/fixtures/ivv-monthly.json`, 24 meses) e o retrato regional do `data/demo.json`.
const { normalizeIvvMonthly } = await import(pathToFileURL(join(site, 'src/ivv/normalize-ivv.js')).href);
const { aggregatePeriod } = await import(pathToFileURL(join(site, 'src/ivv/aggregate.js')).href);
const { buildMicroKpis } = await import(pathToFileURL(join(site, 'src/ivv/derived.js')).href);
const { selectIvvPeriod } = await import(pathToFileURL(join(site, 'src/ivv/period.js')).href);
const { normalizeIvvRegion, buildRegionRanking } = await import(pathToFileURL(join(site, 'src/ivv/region.js')).href);
const ivvEntrada = JSON.parse(readFileSync(join(site, 'tests/fixtures/ivv-monthly.json'), 'utf8')).rows;
const meses = normalizeIvvMonthly(ivvEntrada).months;
const METRICAS = ['sales_units', 'launches_units', 'offers_units', 'cancellations_units', 'ivv_pct', 'asking_price_brl_m2', 'sale_price_brl_m2', 'vgv_brl_million'];
const PERIODOS = [
  { nome: 'mes_2025_06', site: { mode: 'month', year: 2025, month: 6 }, app: { modo: 'month', ano: '2025', mes: '6' } },
  { nome: 'ano_ate_2025_06', site: { mode: 'ytd', year: 2025, month: 6 }, app: { modo: 'ytd', ano: '2025', mes: '6' } },
  { nome: 'ultimos_12_2025_12', site: { mode: 'last_12', year: 2025, month: 12 }, app: { modo: 'last_12', ano: '2025', mes: '12' } },
  { nome: 'ano_2024', site: { mode: 'year', year: 2024, month: 1 }, app: { modo: 'year', ano: '2024', mes: '1' } },
];
const mercado = PERIODOS.map((p) => {
  const escolhido = selectIvvPeriod(meses, p.site);
  const a = aggregatePeriod(escolhido.rows);
  const valores = Object.fromEntries(METRICAS.map((k) => [k, a.values[k]?.value ?? null]));
  const derivados = Object.fromEntries(buildMicroKpis(a, escolhido.rows).map((d) => [d.key, d.raw]));
  return { nome: p.nome, query: p.app, valores, derivados };
});
const regional = normalizeIvvRegion(demo.ivv_region).rows;
const ranking = ['TOTAL', '2Q', '3Q'].map((faixa) => {
  const r = buildRegionRanking(regional, { bucket: faixa });
  return { faixa, mes: r.mes, referencia_ivv_pp: r.referencia?.ivvPct ?? null, primeira: r.regioes[0]?.region ?? null, primeira_ivv_pp: r.regioes[0]?.ivvPct ?? null, regioes: r.regioes.length, sem_valor: r.semValor.length };
});

// FipeZap (spec 15.2): série sintética determinística no formato da aba (o retrato real ainda
// não foi exportado), passada pelo código do site: os oito gráficos do DF, a lista de
// localidades desambiguada e os gráficos venda × locação de uma localidade.
const { normalizeFipezapMonthly, normalizeFipezapLocality } = await import(pathToFileURL(join(site, 'src/fipezap/normalize-fipezap.js')).href);
const { buildFipezapHistoryCharts } = await import(pathToFileURL(join(site, 'src/fipezap/history.js')).href);
const { localitiesAvailable, buildLocalityCharts } = await import(pathToFileURL(join(site, 'src/fipezap/locality.js')).href);
const LOCS = [
  { nome: 'AGUAS CLARAS', ra: 'Águas Claras', geo: 'RA_20', base: 9000 },
  { nome: 'ASA SUL', ra: 'Plano Piloto', geo: 'RA_01', base: 14000 },
  { nome: 'ASA NORTE', ra: 'Plano Piloto', geo: 'RA_01', base: 13000 },
  { nome: 'GAMA', ra: 'Gama', geo: 'RA_02', base: 5000 },
];
const fipeEntrada = [];
for (let m = 1; m <= 12; m++) {
  const ref = `2025-${String(m).padStart(2, '0')}-01`;
  for (const seg of ['RESIDENCIAL', 'COMERCIAL']) {
    const fator = seg === 'RESIDENCIAL' ? 1 : 1.2;
    const venda = Math.round(10000 * fator * (1 + m / 200) * 100) / 100;
    const aluguel = Math.round(venda * 0.0045 * 100) / 100;
    fipeEntrada.push({ reference_date: ref, segment_scope: seg, transaction_type: 'VENDA', geography_scope: 'DF_TOTAL', price_unit: 'BRL_M2', price_brl_m2: venda, source_id: 'SRC_SINTETICO' });
    fipeEntrada.push({ reference_date: ref, segment_scope: seg, transaction_type: 'LOCACAO', geography_scope: 'DF_TOTAL', price_unit: 'BRL_M2_MES', price_brl_m2: aluguel,
      official_yield_annual_pct: m % 4 === 0 ? null : Math.round((aluguel * 12 / venda) * 1e6) / 1e6, calculated_yield_annual_pct: Math.round((aluguel * 12 / venda) * 1e6) / 1e6,
      price_to_rent_months: Math.round((venda / aluguel) * 100) / 100, source_id: 'SRC_SINTETICO' });
  }
  for (const l of LOCS) {
    const venda = Math.round(l.base * (1 + m / 150) * 100) / 100;
    const aluguel = Math.round(venda * 0.005 * 100) / 100;
    fipeEntrada.push({ reference_date: ref, segment_scope: 'RESIDENCIAL', transaction_type: 'VENDA', geography_scope: 'LOCALIDADE', source_locality_name: l.nome, ra_name: l.ra, ra_geo_id: l.geo, price_unit: 'BRL_M2', price_brl_m2: venda, diff_vs_df_pct: Math.round((venda / 10000 - 1) * 1e6) / 1e6 });
    if (l.nome !== 'GAMA' || m > 6) fipeEntrada.push({ reference_date: ref, segment_scope: 'RESIDENCIAL', transaction_type: 'LOCACAO', geography_scope: 'LOCALIDADE', source_locality_name: l.nome, ra_name: l.ra, ra_geo_id: l.geo, price_unit: 'BRL_M2_MES', price_brl_m2: aluguel });
  }
}
const fipe = normalizeFipezapMonthly(fipeEntrada).rows;
const ultimo = (g) => g.series.map((s) => s.pontos.filter((p) => p.valor !== null).at(-1)?.valor ?? null);
const graficosDf = buildFipezapHistoryCharts(fipe).map((g) => ({ chave: g.key, pontos: g.series[0].pontos.filter((p) => p.valor !== null).length, ultimo: ultimo(g)[0] }));
// A visão pareada do site é a aba FIPEZAP_LOCALITY_MONTHLY; aqui ela é montada das linhas acima, no mesmo mês.
const pareadas = [];
for (const r of fipe.filter((x) => x.geography_scope === 'LOCALIDADE')) {
  let p = pareadas.find((x) => x.period_id === r.period_id && x.source_locality_name === r.source_locality_name && x.segment_scope === r.segment_scope);
  if (!p) pareadas.push(p = { reference_date: r.reference_date, period_id: r.period_id, segment_scope: r.segment_scope, source_locality_name: r.source_locality_name, ra_name: r.ra_name, ra_geo_id: r.ra_geo_id, sale_price_brl_m2: null, rent_price_brl_m2_month: null, sale_diff_vs_df_pct: null });
  if (r.transaction_type === 'VENDA') Object.assign(p, { sale_price_brl_m2: r.price_brl_m2, sale_diff_vs_df_pct: r.diff_vs_df_pct });
  else p.rent_price_brl_m2_month = r.price_brl_m2;
}
const loc = normalizeFipezapLocality(pareadas).rows;
const localidades = localitiesAvailable(loc, 'RESIDENCIAL').map((i) => ({ locality: i.locality, displayName: i.displayName, ambiguous: i.ambiguous, raName: i.raName }));
const graficosLocalidade = ['GAMA', 'ASA SUL'].map((nome) => {
  const [venda, locacao] = buildLocalityCharts(loc, { locality: nome, segmentScope: 'RESIDENCIAL' });
  return { localidade: nome, venda_pontos: venda.series[0].pontos.filter((p) => p.valor !== null).length, venda_ultimo: ultimo(venda)[0], locacao_pontos: locacao.series[0].pontos.filter((p) => p.valor !== null).length, locacao_ultimo: ultimo(locacao)[0], resumo_venda: venda.resumo?.valor ?? null };
});

// Diagnóstico (spec 15.2): PDAD sintética determinística no formato de PDAD_A_DATA, com
// suprimido, categoria numérica (resquício) e "Local de compras", passada pelo código do site.
const { normalizePdadData } = await import(pathToFileURL(join(site, 'src/pdad/normalize-pdad.js')).href);
const pdadAgg = await import(pathToFileURL(join(site, 'src/pdad/aggregate.js')).href);
const pdadInd = await import(pathToFileURL(join(site, 'src/pdad/indicators.js')).href);
const { raRealEstateProfile } = await import(pathToFileURL(join(site, 'src/pdad/insights.js')).href);
const RAS_PDAD = [
  { id: 'RA_01', nome: 'Plano Piloto', k: 0 }, { id: 'RA_02', nome: 'Gama', k: 1 }, { id: 'RA_03', nome: 'Taguatinga', k: 2 },
  { id: 'RA_04', nome: 'Brazlândia', k: 3 }, { id: 'RA_05', nome: 'Sobradinho', k: 4 }, { id: 'RA_20', nome: 'Águas Claras', k: 5 },
];
const pdadEntrada = [];
const obs = (ra, ano, code, cat, total, pct, extra = {}) => pdadEntrada.push({ pdad_year: ano, ra_geo_id: ra.id, ra_name: ra.nome, indicator_code: code, category_standard: cat, response_category: cat, estimate_total: total, estimate_pct: pct, source_value_status: 'published', ...extra });
const IDADES = ['ate_4_anos', '10_a_14_anos', '20_a_24_anos', '35_a_39_anos', '50_a_54_anos', '65_a_69_anos'];
for (const ra of RAS_PDAD) {
  const ano = 2024;
  IDADES.forEach((cat, i) => obs(ra, ano, 'age_sex_distribution', cat, 1000 * (ra.k + 1) + i * 37, 50));
  const apto = 20 + ra.k * 9;
  obs(ra, ano, 'dwelling_type', 'Apartamento', 400 * (ra.k + 1), apto);
  obs(ra, ano, 'dwelling_type', 'Casa', 300 * (ra.k + 1), 100 - apto);
  obs(ra, ano, 'tenure_status', 'Alugado', null, 15 + ra.k * 4);
  obs(ra, ano, 'tenure_status', 'Próprio', null, 85 - ra.k * 4);
  if (ra.k === 3) obs(ra, ano, 'registered_deed', 'Sim', null, null, { source_value_status: 'suppressed' });
  else obs(ra, ano, 'registered_deed', 'Sim', null, 40 + ra.k * 7);
  obs(ra, ano, 'health_insurance', 'Sim', null, 30 + ra.k * 6);
  obs(ra, ano, 'pea_status', 'Ocupado', null, 50 + ra.k * 2);
  obs(ra, ano, 'internet_access', 'Próprio', null, 70 + ra.k * 3);
  obs(ra, ano, 'water_supply', 'Sim', null, 90 - ra.k, { segment_value: 'Rede Geral', segment_dimension: 'fonte' });
  obs(ra, ano, 'purchase_food', 'Na própria RA', null, 60 - ra.k * 5, { segment_value: 'alimentacao' });
  obs(ra, ano, 'purchase_food', 'Plano Piloto', null, 20 + ra.k * 3, { segment_value: 'alimentacao' });
  if (ra.k === 0) obs(ra, ano, 'purchase_food', '56022', 56022, null);
}
// 2021: só o Plano Piloto (a cobertura do ano é parcial).
obs(RAS_PDAD[0], 2021, 'dwelling_type', 'Apartamento', 380, 70);
obs(RAS_PDAD[0], 2021, 'dwelling_type', 'Casa', 160, 30);
const pdadRows = normalizePdadData(pdadEntrada).rows;
const ix = pdadAgg.buildPdadIndex(pdadRows);
const todos = pdadAgg.rasForYear(ix, 2024).map((r) => r.raGeoId);
const kpisTodas = pdadAgg.summarizeKpis(ix, 2024, todos);
const serieTodas = Object.fromEntries(['dwelling', 'tenure', 'deed', 'age'].map((k) => [k, pdadAgg.indicatorSeries(ix, 2024, todos, k).map((v) => ({ label: v.label, pct: v.pct }))]));
const perfil = raRealEstateProfile(ix, 2024, 'RA_03').items.map((i) => ({ id: i.id, value: i.value, status: i.status, mediana: i.reference.median, n: i.reference.n, posicao: i.rank?.position ?? null }));
const rankingPdad = ['deed', 'health', 'internet'].map((id) => {
  const item = pdadInd.PDAD_RANK_SET.find((r) => r.id === id);
  const ordem = pdadAgg.rasForYear(ix, 2024).map((ra) => ({ codigo: ra.raGeoId, valor: pdadAgg.rankScalar(ra, item) })).filter((p) => p.valor !== null).sort((a, b) => b.valor - a.valor);
  return { id, n: ordem.length, primeira: ordem[0]?.codigo ?? null, primeira_valor: ordem[0]?.valor ?? null, ultima: ordem.at(-1)?.codigo ?? null };
});
const vista = pdadInd.PDAD_SCATTER_VIEWS.find((v) => v.id === 'vert_loc');
const pontosDispersao = pdadAgg.rasForYear(ix, 2024).map((ra) => ({ codigo: ra.raGeoId, x: pdadAgg.rankScalar(ra, vista.x), y: pdadAgg.rankScalar(ra, vista.y) })).filter((p) => p.x !== null && p.y !== null);
const diagnostico = { kpis_todas: kpisTodas, serie_todas: serieTodas, perfil_ra_03: perfil, ranking: rankingPdad, dispersao_vert_loc: pontosDispersao, compras_ra_01: pdadAgg.indicatorGroups(ix, 2024, ['RA_01']).map((g) => ({ grupo: g.group, itens: g.items.map((i) => ({ label: i.label, pct: i.pct })) })) };

const destino = resolve('apps/inteligencia_imobiliaria/testes/fixtures/paridade');
mkdirSync(destino, { recursive: true });
const arquivo = join(destino, `${data}.json`);
writeFileSync(arquivo, JSON.stringify({ gerado_em: data, site_commit: commit, entrada: 'data/demo.json', entrada_ivv: 'tests/fixtures/ivv-monthly.json', mapa, mercado, ivv_regional: ranking, fipezap: { graficos_df: graficosDf, localidades, graficos_localidade: graficosLocalidade }, diagnostico }, null, 2) + '\n');
// A entrada sintética do IVV vai junto, para o teste da app importar exatamente o que o site leu.
writeFileSync(join(resolve('apps/inteligencia_imobiliaria/testes/fixtures/planilha'), 'ivv_monthly_sintetico.json'), JSON.stringify(ivvEntrada, null, 2) + '\n');
writeFileSync(join(resolve('apps/inteligencia_imobiliaria/testes/fixtures/planilha'), 'fipezap_monthly_sintetico.json'), JSON.stringify(fipeEntrada, null, 2) + '\n');
writeFileSync(join(resolve('apps/inteligencia_imobiliaria/testes/fixtures/planilha'), 'pdad_a_data_sintetico.json'), JSON.stringify(pdadEntrada, null, 2) + '\n');
console.log(`paridade: ${mapa.length} cenários de mapa, ${mercado.length} períodos do IVV, ${ranking.length} faixas regionais → ${arquivo} (site ${commit.slice(0, 12)})`);
