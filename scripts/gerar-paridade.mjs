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

const destino = resolve('apps/inteligencia_imobiliaria/testes/fixtures/paridade');
mkdirSync(destino, { recursive: true });
const arquivo = join(destino, `${data}.json`);
writeFileSync(arquivo, JSON.stringify({ gerado_em: data, site_commit: commit, entrada: 'data/demo.json', entrada_ivv: 'tests/fixtures/ivv-monthly.json', mapa, mercado, ivv_regional: ranking, diagnostico: [] }, null, 2) + '\n');
// A entrada sintética do IVV vai junto, para o teste da app importar exatamente o que o site leu.
writeFileSync(join(resolve('apps/inteligencia_imobiliaria/testes/fixtures/planilha'), 'ivv_monthly_sintetico.json'), JSON.stringify(ivvEntrada, null, 2) + '\n');
console.log(`paridade: ${mapa.length} cenários de mapa, ${mercado.length} períodos do IVV, ${ranking.length} faixas regionais → ${arquivo} (site ${commit.slice(0, 12)})`);
