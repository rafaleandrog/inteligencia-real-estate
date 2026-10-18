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

const destino = resolve('apps/inteligencia_imobiliaria/testes/fixtures/paridade');
mkdirSync(destino, { recursive: true });
const arquivo = join(destino, `${data}.json`);
writeFileSync(arquivo, JSON.stringify({ gerado_em: data, site_commit: commit, entrada: 'data/demo.json', mapa, mercado: [], diagnostico: [] }, null, 2) + '\n');
console.log(`paridade: ${mapa.length} cenários de mapa → ${arquivo} (site ${commit.slice(0, 12)})`);
