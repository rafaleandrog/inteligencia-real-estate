import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toText, toNumber, toInteger, toBoolean, toDateISO, toCoord, pricePerM2, pricePerM2Check,
  PRICE_M2_TOLERANCE, toPriceNumber,
  buildingOrientation, isApproximateLocation, canUseForDistance, normalizeListing, normalizeDevelopment,
  normalizeAnchor, normalizeRaProfile, normalizeRaProfiles,
  normalizeAppMeta, appMetaRows, appMetaConflicts,
  normalizeAll, isRealCalendarDate,
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

test('toNumber: moeda brasileira com ponto único de milhar, formato americano e sufixo de unidade (issue #121)', () => {
  // O bug real: "R$ 290.000" lido como 290 gerava PRICE_M2_MISMATCH em 61 anúncios.
  assert.equal(toNumber('R$ 290.000'), 290000);
  assert.equal(toNumber('R$ 385.000'), 385000);
  assert.equal(toNumber('290.000 BRL'), 290000);
  assert.equal(toNumber('R$ 2.500.000,50'), 2500000.5);
  assert.equal(toNumber('R$ 7.837,84'), 7837.84);
  assert.equal(toNumber('R$ 0,00'), 0);
  assert.equal(toNumber('R$ -1.500'), -1500, 'negativo com moeda');

  // Formato americano com mais de um separador de milhar.
  assert.equal(toNumber('2,500,000.50'), 2500000.5);
  assert.equal(toNumber('2,500,000'), 2500000);

  // Sufixo de unidade não derruba a leitura.
  assert.equal(toNumber('120 m²'), 120);
  assert.equal(toNumber('37,5 m2'), 37.5);
  assert.equal(toNumber('8,6%'), 8.6);
  assert.equal(toNumber('2,5 p.p.'), 2.5);

  // Sem marcador de moeda, ponto único continua decimal (a âncora fica com toPriceNumber).
  assert.equal(toNumber('385.000'), 385);
  assert.equal(toNumber('R$ 1234.5'), 1234.5, 'ponto único sem três dígitos é decimal mesmo com moeda');

  // Lixo entre os dígitos é ausência, não número parcial.
  assert.equal(toNumber('1.2.3,4,5'), null);
  assert.equal(toNumber('12abc'), null);
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

test('pricePerM2Check confere sem sobrescrever: o informado prevalece e a divergência vira sinal', () => {
  // Bate: informado 15625 para 2.500.000 / 160.
  const ok = pricePerM2Check(2500000, 160, 15625);
  assert.deepEqual(ok, { value: 15625, informed: 15625, computed: 15625, divergence_pct: 0, mismatch: false });

  // Diverge (outro critério de área na fonte): informado continua sendo o valor.
  const off = pricePerM2Check(2500000, 160, 20000);
  assert.equal(off.value, 20000, 'nunca substitui o publicado');
  assert.equal(off.computed, 15625);
  assert.equal(off.divergence_pct, Math.abs(15625 - 20000) / 20000);
  assert.equal(off.mismatch, true);

  // Dentro da tolerância não é divergência.
  assert.equal(pricePerM2Check(2500000, 160, 15625 * (1 + PRICE_M2_TOLERANCE * 0.9)).mismatch, false);

  // Sem informado: calcula, sem divergência a medir.
  assert.deepEqual(pricePerM2Check(2500000, 160, ''), { value: 15625, informed: null, computed: 15625, divergence_pct: null, mismatch: false });

  // Divisão por zero, área negativa, preço ausente: computed null, nunca Infinity/NaN.
  for (const [p, a] of [[2500000, 0], [2500000, -10], [2500000, ''], ['', 160], [0, 160]]) {
    const r = pricePerM2Check(p, a, '');
    assert.equal(r.computed, null, `computed para ${p}/${a}`);
    assert.equal(r.value, null);
    assert.equal(r.mismatch, false);
  }
  // Informado zero ou negativo não é "publicado": cai no calculado.
  assert.equal(pricePerM2Check(2500000, 160, 0).value, 15625);
  assert.equal(pricePerM2Check(2500000, 160, -5).value, 15625);
  // Moeda brasileira como texto nos três argumentos.
  assert.equal(pricePerM2Check('R$ 290.000', '37', 'R$ 7.837,84').mismatch, false);
});

test('normalizeListing registra a divergência de preço/m² sem sobrescrever, e normalizeAll a resume em aviso', () => {
  const row = (id, informed) => ({
    listing_id: id, title: id, property_type: 'apartamento', latitude: '-15.7', longitude: '-47.9',
    asking_price_brl: 'R$ 1.500.000', area_m2: '76', asking_price_brl_m2: informed,
  });
  const fine = normalizeListing(row('OK', 'R$ 19.736,84'));
  assert.equal(fine.price, 1500000);
  assert.equal(fine.price_m2, 19736.84, 'o publicado é o valor');
  assert.equal(fine.price_m2_mismatch, false);

  const off = normalizeListing(row('OFF', '30000'));
  assert.equal(off.price_m2, 30000, 'divergente, mas o publicado continua sendo o valor');
  assert.equal(off.price_m2_computed, 1500000 / 76);
  assert.equal(off.price_m2_mismatch, true);

  const { records, warnings } = normalizeAll('listings', [row('OK', '19736.84'), row('OFF', '30000'), row('OFF2', '40000')]);
  assert.equal(records.length, 3);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /2 registro\(s\) de listings/);
  assert.match(warnings[0], /OFF, OFF2/);
  assert.match(warnings[0], /o informado prevalece/);

  assert.deepEqual(normalizeAll('listings', []).warnings, [], 'lista vazia não avisa nada');
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

test('canUseForDistance só libera ponto exato com coordenada — centroide com jitter nunca (issue #124)', () => {
  const coord = { lat: -15.76, lon: -47.88 };
  assert.equal(canUseForDistance({ coord, coordinate_precision: 'locality_centroid_deterministic_jitter' }), false);
  assert.equal(canUseForDistance({ coord, coordinate_precision: 'locality_centroid_jitter' }), false);
  assert.equal(canUseForDistance({ coord, coordinate_precision: '' }), false, 'precisão ausente é aproximada');
  assert.equal(canUseForDistance({ coord, coordinate_precision: 'pending_exact_parcel' }), false);
  assert.equal(canUseForDistance({ coord, coordinate_precision: 'street_centroid_external_geocode' }), false);
  assert.equal(canUseForDistance({ coord: null, coordinate_precision: 'school_polygon_reference_point', confidence_flag: 'high' }), false, 'sem coordenada não há distância');
  assert.equal(canUseForDistance({ coord: { lat: NaN, lon: 1 }, coordinate_precision: 'school_polygon_reference_point', confidence_flag: 'high' }), false);
  assert.equal(canUseForDistance(null), false);
  assert.equal(canUseForDistance({ coord, coordinate_precision: 'school_polygon_reference_point', confidence_flag: 'high' }), true);
  // Flag que rebaixa a precisão vence a declaração exata.
  assert.equal(canUseForDistance({ coord, coordinate_precision: 'school_polygon_reference_point', confidence_flag: 'low_spatial_high_attribute' }), false);
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

test('toPriceNumber resolve o ponto único de milhar quando há preço/m² e área para ancorar', () => {
  // Caso real: Kitnet CA 02, preço bruto "385.000" (milhar pt-BR), 42 m², R$ 9.167/m².
  // toNumber() sozinho devolveria 385 (decimal); com a âncora, resolve para 385000.
  assert.equal(
    toPriceNumber('385.000', { areaValue: '42', informedPriceM2Value: '9167' }),
    385000,
  );

  // Sem preço/m² informado (ou sem área), não há como decidir com segurança — mantém
  // o mesmo comportamento documentado de toNumber().
  assert.equal(toPriceNumber('385.000', {}), 385);
  assert.equal(toPriceNumber('385.000', { areaValue: '42' }), 385);

  // Valor que já bate como decimal não deve ser "corrigido" para milhar.
  assert.equal(
    toPriceNumber('2.500', { areaValue: '1', informedPriceM2Value: '2.5' }),
    2.5,
  );

  // Fora do padrão ambíguo (mais de um ponto, sem ponto, vírgula) segue toNumber().
  assert.equal(toPriceNumber('2.500.000', { areaValue: '100', informedPriceM2Value: '1' }), 2500000);
  assert.equal(toPriceNumber('2500000', {}), 2500000);
  assert.equal(toPriceNumber('', {}), null);
});

test('normalizeListing corrige o preço quando o bruto é ambíguo e há preço/m² informado', () => {
  const record = normalizeListing({
    listing_id: 'LIST_KITNET', title: 'Kitnet à venda', property_type: 'kitnet',
    locality: 'Lago Norte', latitude: '-15.75', longitude: '-47.85',
    asking_price_brl: '385.000', area_m2: '42', asking_price_brl_m2: '9167',
  });
  assert.equal(record.price, 385000);
  assert.equal(record.price_m2, 9167);
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

test('normalizeAnchor aceita segment opcional sem quebrar quando ausente (issue #22)', () => {
  const comSegmento = normalizeAnchor({ place_id: 'A1', name: 'X', segment: 'hospital' });
  assert.equal(comSegmento.segment, 'hospital');

  const semSegmento = normalizeAnchor({ place_id: 'A2', name: 'Y' });
  assert.equal(semSegmento.segment, '', 'coluna ainda não existe na planilha — ausência é normal');
});

test('normalizeAnchor aceita brand_name/occupied_area_m2 opcionais sem quebrar (issue #39)', () => {
  const comMarca = normalizeAnchor({
    place_id: 'A3', name: 'Farmácia X', brand_name: 'Droga Raia', occupied_area_m2: '180',
  });
  assert.equal(comMarca.brand_name, 'Droga Raia');
  assert.equal(comMarca.occupied_area_m2, 180);

  const semMarca = normalizeAnchor({ place_id: 'A4', name: 'Y' });
  assert.equal(semMarca.brand_name, '');
  assert.equal(semMarca.occupied_area_m2, null);
});

test('buildingOrientation classifica pelo vocabulário fechado de property_type (issue #31)', () => {
  assert.equal(buildingOrientation('apartamento'), 'vertical');
  assert.equal(buildingOrientation('predio'), 'vertical');
  assert.equal(buildingOrientation('kitnet'), 'vertical');
  assert.equal(buildingOrientation('casa'), 'horizontal');
  assert.equal(buildingOrientation('casa_condominio'), 'horizontal');
  assert.equal(buildingOrientation('terreno'), 'horizontal');
  assert.equal(buildingOrientation('APARTAMENTO'), 'vertical', 'ignora caixa');
  assert.equal(buildingOrientation(''), null);
  assert.equal(buildingOrientation('tipo_novo_desconhecido'), null, 'vocabulário novo não quebra, só não classifica');
});

test('normalizeListing deriva building_orientation e lê regularization_status opcional (issues #31, #32)', () => {
  const apto = normalizeListing({ listing_id: 'L1', property_type: 'apartamento' });
  assert.equal(apto.building_orientation, 'vertical');
  assert.equal(apto.regularization_status, '', 'coluna ainda não existe na planilha');

  const casa = normalizeListing({
    listing_id: 'L2', property_type: 'casa', regularization_status: 'regularizado',
  });
  assert.equal(casa.building_orientation, 'horizontal');
  assert.equal(casa.regularization_status, 'regularizado');
});

test('normalizeDevelopment lê sales_stage/building_orientation/regularization_status opcionais (issues #30, #31, #32)', () => {
  const semColunas = normalizeDevelopment({ development_id: 'D3' });
  assert.equal(semColunas.sales_stage, '');
  assert.equal(semColunas.building_orientation, null);
  assert.equal(semColunas.regularization_status, '');

  const comColunas = normalizeDevelopment({
    development_id: 'D4', sales_stage: 'em_lancamento', building_orientation: 'vertical',
    regularization_status: 'em_regularizacao',
  });
  assert.equal(comColunas.sales_stage, 'em_lancamento');
  assert.equal(comColunas.building_orientation, 'vertical');
  assert.equal(comColunas.regularization_status, 'em_regularizacao');
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
  assert.deepEqual(normalizeAll('listings', undefined), { records: [], dropped: 0, warnings: [] });
  assert.deepEqual(normalizeAll('listings', []), { records: [], dropped: 0, warnings: [] });
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

test('normalizeAppMeta aceita as linhas do GViz e o objeto do Apps Script', () => {
  // As duas origens precisam produzir o mesmo resultado, senão a tela muda de
  // comportamento conforme a estratégia de dados escolhida.
  const doGviz = normalizeAppMeta([
    { key: 'dataset_version', value: 7, updated_at: '2026-08-20' },
    { key: 'validation_status', value: 'ok' },
    { key: 'rows_listings', value: '141' },
  ]);
  const doAppsScript = normalizeAppMeta({
    dataset_version: 7, validation_status: 'ok', rows_listings: '141',
  });

  assert.deepEqual(doGviz, doAppsScript);
  assert.equal(doGviz.dataset_version, '7');
  assert.equal(doGviz.rows_listings, 141, 'contador vira inteiro');
});

test('normalizeAppMeta omite chave ausente em vez de devolver null', () => {
  // Quem renderiza precisa distinguir "não publicado" de "publicado vazio"; um null
  // no meio apagaria essa diferença e viraria travessão na tela.
  const meta = normalizeAppMeta([{ key: 'dataset_version', value: '3' }]);
  assert.deepEqual(Object.keys(meta), ['dataset_version']);
  assert.ok(!('validation_status' in meta));

  for (const vazio of [null, undefined, {}, [], 'texto', 42]) {
    assert.deepEqual(normalizeAppMeta(vazio), {}, `esperado {} para ${JSON.stringify(vazio)}`);
  }

  // Valor em branco é o mesmo que ausente.
  assert.deepEqual(normalizeAppMeta([{ key: 'dataset_version', value: '   ' }]), {});
  assert.deepEqual(normalizeAppMeta([{ key: '', value: 'x' }]), {});
});

test('normalizeAppMeta converte data de qualquer origem para ISO', () => {
  const iso = normalizeAppMeta({ last_data_change_at: '2026-08-20T02:34:41.123Z' });
  assert.equal(iso.last_data_change_at, '2026-08-20');

  // Como o GViz serializa coluna de data.
  assert.equal(normalizeAppMeta({ last_validation_at: 'Date(2026,7,18)' }).last_validation_at, '2026-08-18');

  // Serial de planilha.
  assert.equal(normalizeAppMeta({ last_validation_at: '46252' }).last_validation_at, '2026-08-18');

  // Data ilegível é omitida, não exibida crua.
  assert.deepEqual(normalizeAppMeta({ last_validation_at: 'ontem' }), {});
});

test('appMetaRows devolve nada quando não há metadados publicados', () => {
  assert.deepEqual(appMetaRows({}), []);
  assert.deepEqual(appMetaRows(null), []);
  assert.deepEqual(appMetaRows(undefined), []);

  // O demo.json atual traz meta de geração, que não são chaves de APP_META.
  assert.deepEqual(appMetaRows(normalizeAppMeta({ generated_at: '2026-08-20', note: 'x' })), []);
});

test('appMetaRows respeita a ordem de exibição e rotula em português', () => {
  const rows = appMetaRows(normalizeAppMeta({
    rows_listings: '141',
    dataset_version: '7',
    last_data_change_at: '2026-08-20',
    validation_status: 'ok',
  }));

  assert.deepEqual(rows.map((r) => r.key),
    ['last_data_change_at', 'dataset_version', 'validation_status', 'rows_listings']);
  assert.equal(rows[1].value, 'v7', 'versão recebe o prefixo v');
  assert.equal(rows[2].value, 'OK');
  assert.equal(rows[0].type, 'date', 'o tipo volta para a tela poder formatar em pt-BR');
});

test('appMetaRows marca apenas "Atualizado em" como resumo público (issue #19)', () => {
  const rows = appMetaRows(normalizeAppMeta({
    rows_listings: '141',
    dataset_version: '7',
    last_data_change_at: '2026-08-20',
    validation_status: 'ok',
  }));

  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.visibility]));
  assert.equal(byKey.last_data_change_at, 'summary');
  assert.equal(byKey.dataset_version, 'technical');
  assert.equal(byKey.validation_status, 'technical');
  assert.equal(byKey.rows_listings, 'technical');
});

test('status de validação desconhecido nunca recebe o tom de sucesso', () => {
  const tom = (status) => appMetaRows(normalizeAppMeta({ validation_status: status }))[0].tone;

  assert.equal(tom('ok'), 'ok');
  assert.equal(tom('warning'), 'warning');
  assert.equal(tom('error'), 'error');
  assert.equal(tom('dirty'), 'dirty');
  assert.equal(tom('OK'), 'ok', 'a comparação ignora caixa');

  // Vocabulário novo que ninguém previu cai no lado conservador (R8.16).
  for (const desconhecido of ['aprovado', 'green', 'passou', 'ok?']) {
    assert.equal(tom(desconhecido), 'unknown', `"${desconhecido}" não pode virar sucesso`);
  }
});

test('chave de APP_META duplicada com valores diferentes é omitida', () => {
  // Regressão: a última linha vencia, mas `setMeta_()` do Apps Script atualiza a
  // PRIMEIRA. Com uma duplicata antiga logo abaixo, a validação gravava `error` na
  // linha 1 e a tela continuava mostrando `ok` da linha 5 — afirmando aprovação
  // enquanto o dataset tinha erro.
  const raw = [
    { key: 'validation_status', value: 'error' },
    { key: 'dataset_version', value: '7' },
    { key: 'validation_status', value: 'ok' },
  ];

  const meta = normalizeAppMeta(raw);
  assert.ok(!('validation_status' in meta), 'em conflito, não afirma nada');
  assert.equal(meta.dataset_version, '7', 'as demais chaves continuam válidas');
  assert.deepEqual(appMetaConflicts(raw), ['validation_status']);

  // Nada é exibido para a chave em conflito.
  assert.deepEqual(appMetaRows(meta).map((r) => r.key), ['dataset_version']);
});

test('duplicata com o mesmo valor não é conflito', () => {
  const raw = [{ key: 'dataset_version', value: '7' }, { key: 'dataset_version', value: '7' }];
  assert.deepEqual(appMetaConflicts(raw), []);
  assert.equal(normalizeAppMeta(raw).dataset_version, '7');
});

test('a primeira ocorrência vence, acompanhando o setMeta_ do Apps Script', () => {
  // Valores iguais depois de normalizar o texto não são conflito; o que importa é que
  // a leitura siga a mesma linha que o escritor atualiza.
  const raw = [{ key: 'dataset_version', value: '9' }, { key: 'dataset_version', value: ' 9 ' }];
  assert.deepEqual(appMetaConflicts(raw), []);
  assert.equal(normalizeAppMeta(raw).dataset_version, '9');
});

test('appMetaConflicts tolera entrada que não é lista', () => {
  for (const entrada of [null, undefined, {}, { dataset_version: '7' }, 'texto', 42]) {
    assert.deepEqual(appMetaConflicts(entrada), [], `esperado [] para ${JSON.stringify(entrada)}`);
  }
});

test('normalizeRaProfile lê nome, população e densidade (issues #33, #34)', () => {
  const profile = normalizeRaProfile({
    ra_geo_id: 'RA2026_RA-I', ra_name: 'PLANO PILOTO',
    population_total: '198697', population_density_km2: '454.4747758305593',
  });
  assert.equal(profile.ra_geo_id, 'RA2026_RA-I');
  assert.equal(profile.ra_name, 'PLANO PILOTO');
  assert.equal(profile.population_total, 198697);
  assert.equal(profile.population_density_km2, 454.4747758305593);
});

test('normalizeRaProfiles indexa por ra_geo_id e descarta linha sem chave (issue #33)', () => {
  const byId = normalizeRaProfiles([
    { ra_geo_id: 'RA2026_RA-I', ra_name: 'PLANO PILOTO', population_total: '198697' },
    { ra_geo_id: '', ra_name: 'sem chave' },
    null,
  ]);
  assert.deepEqual(Object.keys(byId), ['RA2026_RA-I']);
  assert.equal(byId['RA2026_RA-I'].ra_name, 'PLANO PILOTO');
});

test('normalizeRaProfiles tolera entrada ausente', () => {
  assert.deepEqual(normalizeRaProfiles(undefined), {});
  assert.deepEqual(normalizeRaProfiles(null), {});
});

// --- Data que não existe no calendário — issue #140 -----------------------------------
//
// `toDateISO` reconhecia o FORMATO, não o calendário: `2026-04-31` atravessava intacto e
// virava um dia medido no painel do trecho, que chegava a dizer "31 de 30 dias medidos".
// O ramo do GViz era pior: `Date(2026,3,31)` rolava em silêncio para 1º de maio, trocando
// o mês do registro sem sintoma nenhum.

test('toDateISO recusa data que não existe, em todos os ramos', () => {
  assert.equal(toDateISO('2026-04-31'), null);
  assert.equal(toDateISO('2026-04-99'), null);
  assert.equal(toDateISO('2026-02-30'), null);
  assert.equal(toDateISO('2026-13-01'), null);
  assert.equal(toDateISO('31/04/2026'), null, 'ramo DD/MM/YYYY');
  assert.equal(toDateISO('Date(2026,3,31)'), null, 'ramo do GViz não pode rolar para maio');
});

test('toDateISO preserva o último dia REAL de cada mês', () => {
  // A guarda tinha que recusar o impossível sem comer o dia legítimo da borda.
  assert.equal(toDateISO('2026-01-31'), '2026-01-31');
  assert.equal(toDateISO('2026-04-30'), '2026-04-30');
  assert.equal(toDateISO('2026-02-28'), '2026-02-28');
  assert.equal(toDateISO('30/04/2026'), '2026-04-30');
  assert.equal(toDateISO('Date(2026,3,30)'), '2026-04-30');
});

test('29 de fevereiro: recusado em ano comum, aceito em bissexto', () => {
  assert.equal(toDateISO('2026-02-29'), null);
  assert.equal(toDateISO('2028-02-29'), '2028-02-29');
  assert.equal(toDateISO('Date(2028,1,29)'), '2028-02-29');
});

test('serial de planilha continua valendo — todo serial é um dia real', () => {
  assert.equal(toDateISO(46252), '2026-08-18');
});

test('isRealCalendarDate é a regra única, e responde só sobre YYYY-MM-DD', () => {
  assert.equal(isRealCalendarDate('2026-04-30'), true);
  assert.equal(isRealCalendarDate('2026-04-31'), false);
  assert.equal(isRealCalendarDate('2028-02-29'), true);
  assert.equal(isRealCalendarDate('2026-02-29'), false);
  assert.equal(isRealCalendarDate('2026-04'), false);
  assert.equal(isRealCalendarDate(null), false);
  assert.equal(isRealCalendarDate(20260430), false);
});
