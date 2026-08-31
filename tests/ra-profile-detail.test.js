// Perfil socioeconômico de uma Região Administrativa no painel de detalhe — issue #53.
//
// `RA_PROFILES` é a fonte canônica. O `properties_json` do contorno é um retrato tirado
// no momento da sincronização: ele envelhece sozinho, sem sintoma, enquanto a aba
// continua sendo atualizada. O erro que este arquivo impede é mostrar duas verdades
// para o mesmo fato — ou, pior, colar a demografia de uma RA inteira num quarteirão.

import test from 'node:test';
import assert from 'node:assert/strict';
import { raProfileForPolygon } from '../src/filters.js';
import { raProfileEssentials } from '../src/format.js';
import { normalizeRaProfile } from '../src/normalize.js';

const PERFIS = {
  RA_III: { ra_geo_id: 'RA_III', ra_name: 'Taguatinga', population_total: 222598 },
  RA_I: { ra_geo_id: 'RA_I', ra_name: 'Plano Piloto', population_total: 221326 },
};

const contornoDeRa = (over = {}) => ({
  id: 'POLY_RA_III', entity_type: 'administrative_region',
  ra_geo_id: 'RA_III', entity_id: 'RA_III', ...over,
});

test('contorno de RA acha o perfil pelo ra_geo_id', () => {
  assert.equal(raProfileForPolygon(contornoDeRa(), PERFIS).ra_name, 'Taguatinga');
});

test('entity_id é o segundo caminho, para o perfil não sumir por um campo vazio', () => {
  // O backend grava os dois com o mesmo valor na linha de RA (`entity_id: ra.ra_geo_id`).
  assert.equal(
    raProfileForPolygon(contornoDeRa({ ra_geo_id: '' }), PERFIS).ra_name, 'Taguatinga',
  );
  assert.equal(raProfileForPolygon(contornoDeRa({ ra_geo_id: '   ' }), PERFIS).ra_name, 'Taguatinga');
});

test('contorno que NÃO é RA nunca recebe perfil, mesmo carregando ra_geo_id', () => {
  // É o defeito caro desta issue. Uma área desenhada à mão e um trecho rodoviário também
  // têm `ra_geo_id`, mas ali o campo diz "está DENTRO desta RA", não "É esta RA". Casar
  // só pelo `ra_geo_id` colaria os 222 mil habitantes de Taguatinga num quarteirão — com
  // todos os números plausíveis e nenhum deles sobre o objeto clicado.
  for (const tipo of ['custom_area', 'road_segment', '', undefined]) {
    const poly = contornoDeRa({ entity_type: tipo });
    assert.equal(raProfileForPolygon(poly, PERFIS), null, String(tipo));
  }
});

test('RA sem perfil publicado devolve null, não o perfil de outra RA', () => {
  assert.equal(raProfileForPolygon(contornoDeRa({ ra_geo_id: 'RA_XXXIII', entity_id: '' }), PERFIS), null);
  assert.equal(raProfileForPolygon(contornoDeRa({ ra_geo_id: '', entity_id: '' }), PERFIS), null);
  assert.equal(raProfileForPolygon(null, PERFIS), null);
  assert.equal(raProfileForPolygon(contornoDeRa(), null), null);
  assert.equal(raProfileForPolygon(contornoDeRa(), {}), null);
});

// --- Os indicadores essenciais ------------------------------------------------------

const perfilCheio = normalizeRaProfile({
  ra_geo_id: 'RA_III', ra_name: 'Taguatinga', ra_code: 'RA III',
  population_total: '222598', population_density_km2: '2938,4',
  income_per_capita_brl: '2145,50', average_age: '38,24',
  households_total: '78412', area_km2: '75,75',
});

test('os essenciais saem na ordem de leitura, não em ordem alfabética de chave', () => {
  // Antes desta issue a primeira linha de uma RA era `avg_household_size`, e
  // `population_total` aparecia depois de `geometry_source_hash`.
  assert.deepEqual(raProfileEssentials(perfilCheio).map((r) => r.label), [
    'População', 'Densidade', 'Renda per capita', 'Idade média', 'Domicílios', 'Área',
  ]);
});

test('os valores saem formatados em pt-BR, com a unidade junto', () => {
  const porRotulo = Object.fromEntries(raProfileEssentials(perfilCheio).map((r) => [r.label, r.value]));
  assert.equal(porRotulo['População'], '222.598');
  assert.equal(porRotulo['Densidade'], '2.938 hab/km²');
  // `formatBRL` arredonda para reais inteiros — é a convenção do repositório e a mesma
  // que o bloco de indicadores da RA já usa. Centavos numa renda per capita seriam
  // precisão que a fonte não tem.
  assert.match(porRotulo['Renda per capita'], /^R\$\s?2\.146$/);
  // Uma casa decimal: "38 anos" no lugar de "38,2 anos" apaga a única casa que
  // distingue duas RAs vizinhas.
  assert.equal(porRotulo['Idade média'], '38,2 anos');
  assert.equal(porRotulo['Domicílios'], '78.412');
  assert.equal(porRotulo['Área'], '76 km²');
});

test('indicador não publicado é OMITIDO, nunca vira travessão ou zero', () => {
  // A cobertura do PDAD é esparsa: `null` significa "não publicado", que não é zero.
  // Um travessão numa lista de seis linhas ocupa o mesmo espaço de um dado real.
  const parcial = normalizeRaProfile({
    ra_geo_id: 'RA_XXX', population_total: '4210', income_per_capita_brl: '',
    population_density_km2: '', average_age: '', households_total: '', area_km2: '',
  });
  const rows = raProfileEssentials(parcial);
  assert.deepEqual(rows.map((r) => r.label), ['População']);
  assert.equal(rows.some((r) => r.value === '—'), false);
});

test('perfil sem nenhum indicador devolve lista vazia — não existe "perfil vazio" na tela', () => {
  assert.deepEqual(raProfileEssentials(normalizeRaProfile({ ra_geo_id: 'RA_XXX' })), []);
  assert.deepEqual(raProfileEssentials(null), []);
});

test('zero é valor publicado e aparece; ausência não', () => {
  // Distinguir os dois é o ponto inteiro da issue #35, e continua valendo aqui.
  const zerado = normalizeRaProfile({ ra_geo_id: 'RA_X', population_total: '0' });
  assert.deepEqual(raProfileEssentials(zerado), [{ label: 'População', value: '0' }]);
});

test('raProfileEssentials lê o que normalizeRaProfile produz, não um formato inventado', () => {
  // Se as duas camadas discordassem do tipo, o painel ficaria vazio em produção e os
  // testes acima continuariam verdes por usarem objetos montados à mão (R8.44).
  assert.equal(typeof perfilCheio.population_total, 'number');
  assert.equal(typeof perfilCheio.average_age, 'number');
  assert.equal(raProfileEssentials(perfilCheio).length, 6);
});
