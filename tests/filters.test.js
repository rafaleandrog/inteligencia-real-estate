import test from 'node:test';
import assert from 'node:assert/strict';
import {
  median, applyFilters, matchesFilters, computeKpis, createFilterState,
  distinctLocalities, distinctPropertyTypes, distinctRegions, normalizeSearchText, LAYERS,
} from '../src/filters.js';

/** Registro de teste com os campos que os filtros examinam. */
const rec = (over = {}) => ({
  kind: 'listing', id: 'X', title: 'Apartamento', locality: 'Asa Norte',
  property_type: 'apartamento', price: 1000000, price_m2: 10000, bedrooms: 3,
  coord: { lat: -15.79, lon: -47.88 },
  confidence_flag: 'low_spatial_high_attribute',
  coordinate_precision: 'locality_centroid_deterministic_jitter',
  ...over,
});

test('median: par, ímpar, vazio e valores inválidos', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([7]), 7);

  // Lista vazia devolve null. NaN vazaria para a tela como "NaN/m²".
  assert.equal(median([]), null);
  assert.equal(median(undefined), null);
  assert.equal(median([null, undefined, NaN, Infinity]), null);

  // Valores inválidos são ignorados, não contaminam o resultado.
  assert.equal(median([10, null, 20, undefined, 30]), 20);
});

test('median não depende da ordem de entrada', () => {
  assert.equal(median([5, 3, 9, 1, 7]), 5);
  assert.equal(median([9, 7, 5, 3, 1]), 5);
});

test('filtro vazio não restringe nada', () => {
  const state = createFilterState();
  const records = [rec(), rec({ kind: 'anchor', price: null }), rec({ kind: 'development' })];
  assert.equal(applyFilters(records, state).length, 3);
});

test('busca ignora acento e maiúscula', () => {
  const state = { ...createFilterState(), search: 'aguas' };
  assert.equal(matchesFilters(rec({ locality: 'Águas Claras' }), state), true);
  assert.equal(matchesFilters(rec({ locality: 'Asa Norte' }), state), false);
  assert.equal(normalizeSearchText('Águas Claras'), 'aguas claras');
});

test('filtro de preço exclui registro sem preço quando ativo', () => {
  const semPreco = rec({ price: null });

  // Sem filtro de preço, aparece.
  assert.equal(matchesFilters(semPreco, createFilterState()), true);

  // Com filtro ativo, não: quem pediu "até R$ 500 mil" não quer ver imóvel sem preço.
  assert.equal(matchesFilters(semPreco, { ...createFilterState(), priceMax: 500000 }), false);
  assert.equal(matchesFilters(semPreco, { ...createFilterState(), priceMin: 100000 }), false);
});

test('filtro de quartos é "pelo menos"', () => {
  assert.equal(matchesFilters(rec({ bedrooms: 3 }), { ...createFilterState(), bedrooms: 3 }), true);
  assert.equal(matchesFilters(rec({ bedrooms: 4 }), { ...createFilterState(), bedrooms: 3 }), true);
  assert.equal(matchesFilters(rec({ bedrooms: 2 }), { ...createFilterState(), bedrooms: 3 }), false);
  assert.equal(matchesFilters(rec({ bedrooms: null }), { ...createFilterState(), bedrooms: 3 }), false);
});

test('filtro de tipo restringe aos anúncios', () => {
  const state = { ...createFilterState(), propertyType: 'casa' };
  assert.equal(matchesFilters(rec({ property_type: 'casa' }), state), true);
  assert.equal(matchesFilters(rec({ property_type: 'apartamento' }), state), false);

  // Âncora não tem tipo de imóvel: filtrar por tipo esconde a camada.
  assert.equal(matchesFilters(rec({ kind: 'anchor' }), state), false);
});

test('camadas desligadas escondem a entidade', () => {
  const state = { ...createFilterState(), layers: new Set(['listing']) };
  assert.equal(matchesFilters(rec({ kind: 'listing' }), state), true);
  assert.equal(matchesFilters(rec({ kind: 'anchor' }), state), false);
  assert.equal(matchesFilters(rec({ kind: 'development' }), state), false);
});

test('computeKpis separa visível de mapeável', () => {
  const kpis = computeKpis([
    rec({ price_m2: 10000 }),
    rec({ price_m2: 20000 }),
    rec({ kind: 'development', price_m2: null, coord: null }),
    rec({ kind: 'anchor', price_m2: null }),
  ]);

  assert.equal(kpis.visible, 4);
  assert.equal(kpis.mappable, 3, 'o empreendimento sem coordenada não vai ao mapa');
  assert.equal(kpis.withoutCoord, 1, 'o buraco no dado é contado, não escondido');
  assert.equal(kpis.medianPriceM2, 15000);
  assert.equal(kpis.medianPriceM2Sample, 2, 'âncora e empreendimento sem preço ficam fora');
  assert.equal(kpis.byKind.listing, 2);
  assert.equal(kpis.byKind.anchor, 1);
});

test('computeKpis com conjunto vazio devolve zeros e mediana nula', () => {
  const kpis = computeKpis([]);
  assert.equal(kpis.visible, 0);
  assert.equal(kpis.medianPriceM2, null, 'null, nunca NaN');
  for (const layer of LAYERS) assert.equal(kpis.byKind[layer], 0);
});

test('computeKpis conta localização aproximada', () => {
  const kpis = computeKpis([
    rec({ coordinate_precision: 'locality_centroid_deterministic_jitter' }),
    rec({ kind: 'anchor', coordinate_precision: 'school_polygon_reference_point', confidence_flag: 'high' }),
  ]);
  assert.equal(kpis.approximate, 1);
});

test('listas de opções vêm ordenadas e sem repetição', () => {
  const records = [
    rec({ locality: 'Sudoeste' }), rec({ locality: 'Asa Norte' }),
    rec({ locality: 'Asa Norte' }), rec({ locality: '' }),
    rec({ kind: 'anchor', locality: 'Lago Sul', property_type: 'ignorado' }),
  ];
  assert.deepEqual(distinctLocalities(records), ['Asa Norte', 'Lago Sul', 'Sudoeste']);
  assert.deepEqual(distinctPropertyTypes(records), ['apartamento'], 'só anúncios têm tipo');
});

test('distinctRegions devolve o código bruto de ra_geo_id, ordenado e sem repetição (issue #33)', () => {
  const records = [
    rec({ ra_geo_id: 'RA2026_RA-III' }), rec({ ra_geo_id: 'RA2026_RA-I' }),
    rec({ ra_geo_id: 'RA2026_RA-I' }), rec({ ra_geo_id: '' }),
    rec({ kind: 'anchor', ra_geo_id: 'RA2026_RA-II' }),
  ];
  assert.deepEqual(distinctRegions(records), ['RA2026_RA-I', 'RA2026_RA-II', 'RA2026_RA-III']);
});

test('filtro de Região Administrativa restringe por ra_geo_id, nos três tipos de registro (issue #33)', () => {
  const state = { ...createFilterState(), ra: 'RA2026_RA-I' };
  assert.equal(matchesFilters(rec({ ra_geo_id: 'RA2026_RA-I' }), state), true);
  assert.equal(matchesFilters(rec({ ra_geo_id: 'RA2026_RA-II' }), state), false);
  assert.equal(matchesFilters(rec({ kind: 'anchor', ra_geo_id: 'RA2026_RA-I' }), state), true);
  assert.equal(matchesFilters(rec({ ra_geo_id: '' }), state), false, 'registro sem RA some quando o filtro está ativo');
});

test('filtro vertical/horizontal exclui registro sem a classificação quando ativo (issue #31)', () => {
  const state = { ...createFilterState(), buildingOrientation: 'vertical' };
  assert.equal(matchesFilters(rec({ building_orientation: 'vertical' }), state), true);
  assert.equal(matchesFilters(rec({ building_orientation: 'horizontal' }), state), false);
  assert.equal(matchesFilters(rec({ building_orientation: null }), state), false);
  assert.equal(matchesFilters(rec({ kind: 'anchor' }), state), false, 'âncora não tem a classificação');
});

test('applyFilters tolera entrada ausente', () => {
  assert.deepEqual(applyFilters(undefined, createFilterState()), []);
  assert.equal(matchesFilters(null, createFilterState()), false);
});
