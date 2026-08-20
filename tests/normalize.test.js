import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toText, toNumber, toInteger, toBoolean, toDateISO, toCoord, pricePerM2,
  isApproximateLocation, normalizeListing, normalizeDevelopment, normalizeAnchor,
  normalizeAll,
} from '../src/normalize.js';

test('toNumber: formatos que realmente chegam da planilha', () => {
  assert.equal(toNumber(2500000), 2500000);
  assert.equal(toNumber('2500000'), 2500000);
  assert.equal(toNumber('19117.64705882353'), 19117.64705882353);

  // Formato brasileiro, com e sem símbolo de moeda.
  assert.equal(toNumber('1.234,56'), 1234.56);
  assert.equal(toNumber('R$ 1.234,56'), 1234.56);
  assert.equal(toNumber('R$ 2.500.000'), 2500000, 'dois ou mais pontos só podem ser milhar');

  // Um ponto só é ambíguo — "2.500" é 2500 em pt-BR e 2.5 em JavaScript. Fica como
  // decimal, o que preserva os valores de precisão cheia do dataset. O contrato
  // exige número sem formatação na célula, então o caso ambíguo é erro de dado.
  assert.equal(toNumber('2.500'), 2.5, 'ambiguidade documentada: um ponto é decimal');

  // Formato inglês.
  assert.equal(toNumber('1,234.56'), 1234.56);

  // Vírgula sozinha: 3 casas é milhar, o resto é decimal.
  assert.equal(toNumber('1,234'), 1234);
  assert.equal(toNumber('1,5'), 1.5);

  assert.equal(toNumber('-15.7645675'), -15.7645675);
  assert.equal(toNumber(0), 0, 'zero é um número, não ausência');
  assert.equal(toNumber('0'), 0);
});

test('toNumber: ausência devolve null, nunca NaN', () => {
  // NaN se propaga em silêncio por todo o pipeline e só aparece na tela.
  for (const empty of ['', '   ', null, undefined, 'abc', 'R$', NaN, Infinity, {}, []]) {
    assert.equal(toNumber(empty), null, `esperado null para ${JSON.stringify(empty)}`);
  }
});

test('toInteger trunca em direção a zero', () => {
  assert.equal(toInteger('4'), 4);
  assert.equal(toInteger(3.9), 3);
  assert.equal(toInteger(-3.9), -3);
  assert.equal(toInteger(''), null);
});

test('toBoolean cobre as representações do dataset', () => {
  assert.equal(toBoolean('1'), true);
  assert.equal(toBoolean('0'), false, 'spatial_usable = "0" precisa ser falso');
  assert.equal(toBoolean(''), false);
  assert.equal(toBoolean('sim'), true);
  assert.equal(toBoolean('não'), false);
  assert.equal(toBoolean(true), true);
});

test('toDateISO: ISO, GViz, serial de planilha e formato brasileiro', () => {
  assert.equal(toDateISO('2026-08-18'), '2026-08-18');
  assert.equal(toDateISO('2026-08-18T10:00:00Z'), '2026-08-18');

  // Como o GViz serializa coluna de data. Mês é base zero: 7 = agosto.
  assert.equal(toDateISO('Date(2026,7,18)'), '2026-08-18');

  // Serial do .xlsx de migração, inteiro e fracionário.
  assert.equal(toDateISO('46252'), '2026-08-18');
  assert.equal(toDateISO('46252.775'), '2026-08-18');

  assert.equal(toDateISO('18/08/2026'), '2026-08-18');
  assert.equal(toDateISO(''), null);
  assert.equal(toDateISO('não é data'), null);

  // Um ano solto não pode ser confundido com serial.
  assert.equal(toDateISO('2026'), null);
});

test('toCoord rejeita coordenada parcial em vez de aproximar', () => {
  assert.deepEqual(toCoord(-15.7645675, -47.877685), { lat: -15.7645675, lon: -47.877685 });
  assert.deepEqual(toCoord('-15.79', '-47.88'), { lat: -15.79, lon: -47.88 });

  // Sete dos 22 empreendimentos do dataset estão exatamente assim.
  assert.equal(toCoord('', '-47.88'), null, 'só longitude preenchida');
  assert.equal(toCoord('-15.79', ''), null, 'só latitude preenchida');
  assert.equal(toCoord('', ''), null);
  assert.equal(toCoord(null, null), null);

  assert.equal(toCoord(0, 0), null, 'a ilha nula não é o Distrito Federal');
  assert.equal(toCoord(91, 0), null, 'latitude fora da faixa');
  assert.equal(toCoord(0, 181), null, 'longitude fora da faixa');
});

test('pricePerM2 usa o informado e calcula quando falta', () => {
  assert.equal(pricePerM2(2500000, 160, 15625), 15625, 'valor informado tem precedência');
  assert.equal(pricePerM2(2500000, 160, ''), 15625, 'calcula quando não informado');
  assert.equal(pricePerM2(2500000, 160, null), 15625);

  // Divisão por área ausente ou zero devolve null, nunca Infinity.
  assert.equal(pricePerM2(2500000, 0, ''), null);
  assert.equal(pricePerM2(2500000, '', ''), null);
  assert.equal(pricePerM2(2500000, -10, ''), null);
  assert.equal(pricePerM2('', 160, ''), null);
});

test('isApproximateLocation trata ausência de declaração como aproximada', () => {
  assert.equal(isApproximateLocation({ coordinate_precision: 'locality_centroid_deterministic_jitter' }), true);
  assert.equal(isApproximateLocation({ coordinate_precision: 'locality_centroid_jitter' }), true);
  assert.equal(isApproximateLocation({ confidence_flag: 'low_spatial_high_attribute' }), true);
  assert.equal(isApproximateLocation({ coordinate_precision: 'pending_exact_parcel' }), true);

  // Sem declaração, assuma o pior: nunca apresentar como endereço exato (R3.6).
  assert.equal(isApproximateLocation({}), true);

  assert.equal(isApproximateLocation({ coordinate_precision: 'school_polygon_reference_point', confidence_flag: 'high' }), false);
});

test('normalizeListing preserva a qualidade espacial e deriva preço/m²', () => {
  const record = normalizeListing({
    listing_id: 'LIST_1', title: 'Apartamento à venda', property_type: 'apartamento',
    locality: 'Asa Norte', latitude: '-15.7645675', longitude: '-47.877685',
    asking_price_brl: '2500000', area_m2: '160', asking_price_brl_m2: '',
    bedrooms: '4', observed_at: '46252', source_url: 'https://exemplo.com/x',
    coordinate_precision: 'locality_centroid_deterministic_jitter',
    confidence_flag: 'low_spatial_high_attribute', portal: 'QuintoAndar',
  });

  assert.equal(record.kind, 'listing');
  assert.equal(record.id, 'LIST_1');
  assert.equal(record.price, 2500000);
  assert.equal(record.price_m2, 15625);
  assert.equal(record.bedrooms, 4);
  assert.equal(record.observed_at, '2026-08-18');
  assert.deepEqual(record.coord, { lat: -15.7645675, lon: -47.877685 });

  // Estes dois precisam sobreviver da planilha até a tela (R3.5).
  assert.equal(record.confidence_flag, 'low_spatial_high_attribute');
  assert.equal(record.coordinate_precision, 'locality_centroid_deterministic_jitter');
});

test('normalizeDevelopment lida com empreendimento sem coordenada', () => {
  const record = normalizeDevelopment({
    development_id: 'DEV_1', name: 'Nexus 710', latitude: '', longitude: '',
    spatial_usable: '0', neighborhood: 'Noroeste', units_total: '550',
    work_progress_pct: '78.88', last_verified_at: '46252',
    coordinate_status: 'pending_exact_parcel_or_poi_validation',
  });

  assert.equal(record.id, 'DEV_1');
  assert.equal(record.coord, null, 'sem coordenada o registro existe, mas não vai ao mapa');
  assert.equal(record.spatial_usable, false);
  assert.equal(record.units_total, 550);
  assert.equal(record.work_progress_pct, 78.88);
  assert.equal(record.price_m2, null, 'sem preço não há preço/m²');
});

test('normalizeAnchor mapeia place_id e neighborhood', () => {
  const record = normalizeAnchor({
    place_id: 'ANCHOR_CMB', name: 'Colegio Militar de Brasilia', category: 'escola',
    latitude: '-15.77957', longitude: '-47.89293', neighborhood: 'Asa Norte',
    confidence_flag: 'high', coordinate_precision: 'school_polygon_reference_point',
  });

  assert.equal(record.kind, 'anchor');
  assert.equal(record.id, 'ANCHOR_CMB');
  assert.equal(record.locality, 'Asa Norte');
  assert.equal(record.category, 'escola');
  assert.equal(isApproximateLocation(record), false);
});

test('normalizeAll descarta registro sem ID e conta o descarte', () => {
  const { records, dropped } = normalizeAll('listings', [
    { listing_id: 'A', title: 'ok' },
    { listing_id: '', title: 'sem id' },
    { title: 'sem campo de id' },
    null,
    'não é objeto',
  ]);

  assert.equal(records.length, 1);
  assert.equal(dropped, 4, 'o descarte é contado para virar aviso, não some em silêncio');
});

test('normalizeAll não quebra com entrada ausente ou entidade inválida', () => {
  assert.deepEqual(normalizeAll('listings', undefined), { records: [], dropped: 0 });
  assert.deepEqual(normalizeAll('listings', []), { records: [], dropped: 0 });
  assert.throws(() => normalizeAll('inexistente', []), /entidade desconhecida/);
});

test('toText normaliza ausência para string vazia', () => {
  assert.equal(toText(null), '');
  assert.equal(toText(undefined), '');
  assert.equal(toText('  x  '), 'x');
  assert.equal(toText(0), '0');
});

test('expected_delivery é normalizado como data, não copiado cru', () => {
  // Regressão: o campo guarda serial de planilha ("46569") e não termina em _at,
  // então escapava da conversão e chegava cru na tela, que exibia "—".
  const dev = normalizeDevelopment({ development_id: 'D1', expected_delivery: '46569' });
  assert.equal(dev.expected_delivery, '2027-07-01');

  assert.equal(normalizeDevelopment({ development_id: 'D2', expected_delivery: '' }).expected_delivery, null);
});

test('isApproximateLocation falha fechado: só precisão explícita é verificada', () => {
  // Regressão P0: a versão anterior procurava marcadores de imprecisão e assumia
  // exatidão na ausência deles, então os 15 empreendimentos mapeáveis — todos com
  // coordinate_precision vazio — eram anunciados como "Localização verificada".

  // Vocabulário real do dataset que NÃO pode ser declarado verificado:
  const aproximados = [
    { confidence_flag: 'medium_spatial_high_attributes', coordinate_status: 'address_geocode_operational' },
    { confidence_flag: 'user_supplied_reference' },
    { confidence_flag: 'high_attributes', coordinate_status: 'pending_exact_parcel_or_poi_validation' },
    { coordinate_precision: 'locality_centroid_deterministic_jitter', confidence_flag: 'low_spatial_high_attribute' },
    { coordinate_precision: 'park_centroid', confidence_flag: 'high' },
    { coordinate_precision: 'endereco_cep', confidence_flag: 'high' },
    // Precisão boa, mas o flag rebaixa a coordenada:
    { coordinate_precision: 'building_polygon_reference_point', confidence_flag: 'high_attributes_medium_coordinate' },
    {},
    { coordinate_precision: 'formato_novo_que_ninguem_previu', confidence_flag: 'high' },
  ];
  for (const record of aproximados) {
    assert.equal(isApproximateLocation(record), true,
      `deveria ser aproximado: ${JSON.stringify(record)}`);
  }

  // Só geometria de fato apurada, sem flag que rebaixe:
  const exatos = [
    { coordinate_precision: 'school_polygon_reference_point', confidence_flag: 'high' },
    { coordinate_precision: 'official_wfs_point', confidence_flag: 'high' },
    { coordinate_precision: 'facility_polygon_reference_point', confidence_flag: 'high' },
  ];
  for (const record of exatos) {
    assert.equal(isApproximateLocation(record), false,
      `deveria ser exato: ${JSON.stringify(record)}`);
  }
});
