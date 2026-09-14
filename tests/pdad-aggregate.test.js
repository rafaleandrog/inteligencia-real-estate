// Agregação de PDAD_A_DATA por RA (issue #100).
//
// Duas coisas caras que este arquivo impede: categoria suprimida virando `0` na tela
// (R5.7), e "Todas as RAs" somando percentual em vez de tirar média — a soma de dois
// percentuais de RAs diferentes não descreve nada real.

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePdadData } from '../src/pdad/normalize-pdad.js';
import {
  buildPdadIndex, rasForYear, summarizeKpis, indicatorSeries, categoryLabel,
} from '../src/pdad/aggregate.js';

const idade = (ra, year, categoria, categoriaPadrao, total, over = {}) => ({
  pdad_year: String(year),
  ra_geo_id: ra,
  ra_name: ra === 'RA_01' ? 'Plano Piloto' : 'Ceilândia',
  indicator_code: 'age_sex_distribution',
  segment_dimension: 'Sexo',
  segment_value: 'Feminino',
  response_category: categoria,
  category_standard: categoriaPadrao,
  estimate_total: String(total),
  estimate_pct: '50',
  source_value_status: 'published',
  ...over,
});

const domicilio = (ra, year, categoria, total, over = {}) => ({
  pdad_year: String(year),
  ra_geo_id: ra,
  ra_name: ra === 'RA_01' ? 'Plano Piloto' : 'Ceilândia',
  indicator_code: 'dwelling_type',
  response_category: categoria,
  category_standard: categoria.toLowerCase(),
  estimate_total: String(total),
  estimate_pct: '0',
  source_value_status: 'published',
  ...over,
});

const marital = (ra, year, categoria, pct, status = 'published', over = {}) => ({
  pdad_year: String(year),
  ra_geo_id: ra,
  ra_name: ra === 'RA_01' ? 'Plano Piloto' : 'Ceilândia',
  indicator_code: 'marital_status',
  response_category: categoria,
  category_standard: categoria.toLowerCase(),
  estimate_pct: pct === null ? '' : String(pct),
  estimate_total: pct === null ? '' : String(pct * 100),
  source_value_status: status,
  ...over,
});

function index(rows) {
  return buildPdadIndex(normalizePdadData(rows).rows);
}

// --- KPIs de contagem: somam a partir das categorias exaustivas -------------------------

test('população soma estimate_total de age_sex_distribution, excluindo a linha Total', () => {
  const rows = [
    idade('RA_01', 2024, 'até 4 anos', 'ate_4_anos', 100),
    idade('RA_01', 2024, '5 a 9 anos', '5_a_9_anos', 200),
    idade('RA_01', 2024, 'Total', 'total', 999999, { response_category: 'Total', category_standard: 'total' }),
  ];
  const idx = index(rows);
  assert.equal(idx[2024].RA_01.population, 300, 'a linha Total não pode entrar na soma');
});

test('domicílios soma estimate_total de dwelling_type, excluindo a linha Total', () => {
  const rows = [
    domicilio('RA_01', 2024, 'Apartamento', 700),
    domicilio('RA_01', 2024, 'Casa', 300),
    domicilio('RA_01', 2024, 'Total', 999999, { response_category: 'Total', category_standard: 'total' }),
  ];
  const idx = index(rows);
  assert.equal(idx[2024].RA_01.households, 1000);
});

test('moradores por domicílio é população ÷ domicílios, calculado — nunca lido da planilha', () => {
  const rows = [
    idade('RA_01', 2024, 'até 4 anos', 'ate_4_anos', 1000),
    domicilio('RA_01', 2024, 'Apartamento', 500),
  ];
  const idx = index(rows);
  assert.equal(idx[2024].RA_01.avgHouseholdSize, 2);
});

test('RA sem domicílios publicados não produz Infinity nem NaN', () => {
  const rows = [idade('RA_01', 2024, 'até 4 anos', 'ate_4_anos', 1000)];
  const idx = index(rows);
  assert.equal(idx[2024].RA_01.households, 0);
  assert.equal(idx[2024].RA_01.avgHouseholdSize, null);
});

// --- Faixa etária: bucket de exibição fixo, nunca ordenado por valor --------------------

test('faixa etária re-agrupa as 17 faixas quinquenais nas 5 de exibição, em ordem cronológica', () => {
  const rows = [
    idade('RA_01', 2024, 'até 4 anos', 'ate_4_anos', 10),
    idade('RA_01', 2024, '60 a 64 anos', '60_a_64_anos', 10),
    idade('RA_01', 2024, '80 anos ou mais', '80_anos_ou_mais', 10),
  ];
  const valores = index(rows)[2024].RA_01.indicators.age.values;
  assert.deepEqual(valores.map((v) => v.label), ['0–14', '15–29', '30–44', '45–59', '60+']);
  assert.equal(valores[0].pct, (10 / 30) * 100);
  assert.equal(valores[4].pct, (20 / 30) * 100, 'as duas faixas 60+ (60–64 e 80+) somam no mesmo grupo');
  assert.equal(valores[1].pct, null, 'faixa sem nenhuma linha publicada fica ausente, não zero');
});

// --- Categoria suprimida nunca vira zero --------------------------------------------------

test('categoria suprimida é preservada com status, nunca convertida para 0', () => {
  const rows = [marital('RA_01', 2024, 'Viúvo', null, 'suppressed')];
  const indicador = index(rows)[2024].RA_01.indicators.marital;
  assert.equal(indicador.values[0].pct, null);
  assert.equal(indicador.values[0].status, 'suppressed');
});

test('categoria publicada substitui uma suprimida anterior para a mesma RA/ano/categoria', () => {
  const rows = [
    marital('RA_01', 2024, 'Viúvo', null, 'suppressed'),
    marital('RA_01', 2024, 'Viúvo', 6, 'published'),
  ];
  const indicador = index(rows)[2024].RA_01.indicators.marital;
  assert.equal(indicador.values.length, 1);
  assert.equal(indicador.values[0].pct, 6, 'publicado vence suprimido, nunca o contrário');
});

test('linha response_category "Total" não vira categoria do indicador', () => {
  const rows = [
    marital('RA_01', 2024, 'Total', 100),
    marital('RA_01', 2024, 'Casado', 52),
  ];
  const indicador = index(rows)[2024].RA_01.indicators.marital;
  assert.equal(indicador.values.length, 1);
  assert.equal(indicador.values[0].label, 'Casado');
});

// --- Rótulo composto para indicador de dois eixos -----------------------------------------

test('categoryLabel compõe segmento + categoria quando os dois existem e diferem', () => {
  assert.equal(
    categoryLabel({ segmentValue: 'Rede Geral', responseCategory: 'Sim' }),
    'Rede Geral · Sim',
  );
  assert.equal(
    categoryLabel({ segmentValue: '', responseCategory: 'Casado' }),
    'Casado',
    'sem segmento, o rótulo é só a categoria',
  );
});

// --- Ano 2021 restrito ao Plano Piloto, confirmado no dado real, não assumido -----------

test('rasForYear devolve só as RAs que a aba realmente publicou naquele ano', () => {
  const rows = [
    marital('RA_01', 2024, 'Casado', 52),
    marital('RA_09', 2024, 'Casado', 48),
    marital('RA_01', 2021, 'Casado', 50),
  ];
  const idx = index(rows);
  assert.deepEqual(rasForYear(idx, 2024).map((r) => r.raGeoId).sort(), ['RA_01', 'RA_09']);
  assert.deepEqual(rasForYear(idx, 2021).map((r) => r.raGeoId), ['RA_01']);
});

// --- "Todas as RAs": KPI soma, indicador tira média ---------------------------------------

test('summarizeKpis SOMA população/domicílios entre as RAs selecionadas', () => {
  const rows = [
    idade('RA_01', 2024, 'até 4 anos', 'ate_4_anos', 100),
    idade('RA_09', 2024, 'até 4 anos', 'ate_4_anos', 300),
    domicilio('RA_01', 2024, 'Apartamento', 50),
    domicilio('RA_09', 2024, 'Casa', 150),
  ];
  const idx = index(rows);
  const kpis = summarizeKpis(idx, 2024, ['RA_01', 'RA_09']);
  assert.equal(kpis.population, 400);
  assert.equal(kpis.households, 200);
  assert.equal(kpis.raCount, 2);
});

test('indicatorSeries com mais de uma RA tira MÉDIA do percentual, nunca soma', () => {
  const rows = [
    marital('RA_01', 2024, 'Casado', 40),
    marital('RA_09', 2024, 'Casado', 60),
  ];
  const idx = index(rows);
  const serie = indicatorSeries(idx, 2024, ['RA_01', 'RA_09'], 'marital');
  assert.equal(serie[0].pct, 50, 'média de 40 e 60, nunca a soma 100');
});

test('RA sem publicação naquela categoria não entra no denominador da média', () => {
  const rows = [
    marital('RA_01', 2024, 'Casado', 40),
    marital('RA_09', 2024, 'Casado', null, 'suppressed'),
  ];
  const idx = index(rows);
  const serie = indicatorSeries(idx, 2024, ['RA_01', 'RA_09'], 'marital');
  assert.equal(serie[0].pct, 40, 'a RA suprimida não pode puxar a média para baixo');
});

test('uma RA só devolve as categorias dela como vieram, sem recalcular média', () => {
  const rows = [marital('RA_01', 2024, 'Casado', 52.1)];
  const idx = index(rows);
  const serie = indicatorSeries(idx, 2024, ['RA_01'], 'marital');
  assert.equal(serie[0].pct, 52.1);
  assert.equal(serie[0].status, 'published');
});

test('indicatorSeries de "age" com várias RAs mantém a ordem cronológica das 5 faixas', () => {
  const rows = [
    idade('RA_01', 2024, 'até 4 anos', 'ate_4_anos', 10),
    idade('RA_09', 2024, '60 a 64 anos', '60_a_64_anos', 10),
  ];
  const idx = index(rows);
  const serie = indicatorSeries(idx, 2024, ['RA_01', 'RA_09'], 'age');
  assert.deepEqual(serie.map((v) => v.label), ['0–14', '15–29', '30–44', '45–59', '60+']);
});

test('entrada vazia não estoura', () => {
  assert.deepEqual(buildPdadIndex([]), {});
  assert.deepEqual(rasForYear({}, 2024), []);
  assert.deepEqual(summarizeKpis({}, 2024, []), {
    population: 0, households: 0, avgHouseholdSize: null, raCount: 0,
  });
  assert.deepEqual(indicatorSeries({}, 2024, [], 'marital'), []);
});
