import test from 'node:test';
import assert from 'node:assert/strict';
import {
  median, applyFilters, matchesFilters, computeKpis, createFilterState,
  distinctLocalities, distinctPropertyTypes, distinctRegions, normalizeSearchText, LAYERS,
  distinctAnchorGroups, distinctAnchorSegments, anchorLegendGroups,
  distinctSalesStages, distinctRegularizationStatuses,
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

// --- Âncoras: grupo e segmento (issue #26) ---------------------------------

/** Âncora de teste. `group`/`segment` vazios são o estado da planilha antes do backend. */
const anchor = (over = {}) => rec({
  kind: 'anchor', property_type: '', price: null, price_m2: null, bedrooms: null,
  category: '', subcategory: '', group: '', segment: '', ...over,
});

test('filtro de grupo de âncora restringe à camada de âncoras (issue #26)', () => {
  const state = { ...createFilterState(), anchorGroup: 'infraestrutura' };
  assert.equal(matchesFilters(anchor({ group: 'infraestrutura' }), state), true);
  assert.equal(matchesFilters(anchor({ group: 'comercio_servico' }), state), false);
  assert.equal(matchesFilters(anchor({ group: '' }), state), false, 'âncora sem grupo some com o filtro ativo');

  // Anúncio e empreendimento não têm grupo: filtrar por grupo esconde essas camadas,
  // mesma regra do filtro de tipo de imóvel.
  assert.equal(matchesFilters(rec({ kind: 'listing' }), state), false);
  assert.equal(matchesFilters(rec({ kind: 'development' }), state), false);
});

test('filtro de segmento de âncora não pega o `segment` de empreendimento (issue #26)', () => {
  // DEVELOPMENTS também tem uma coluna `segment` — "alto padrão" — com significado
  // completamente diferente. Sem a checagem de `kind` antes da comparação, filtrar
  // âncoras por segmento traria empreendimentos junto.
  const state = { ...createFilterState(), anchorSegment: 'alto padrão' };
  assert.equal(matchesFilters(rec({ kind: 'development', segment: 'alto padrão' }), state), false);

  const escolas = { ...createFilterState(), anchorSegment: 'escola' };
  assert.equal(matchesFilters(anchor({ segment: 'escola' }), escolas), true);
  assert.equal(matchesFilters(anchor({ segment: 'universidade' }), escolas), false);
  assert.equal(matchesFilters(anchor({ segment: '' }), escolas), false);
});

test('grupo e segmento se combinam por E, não por OU', () => {
  const state = { ...createFilterState(), anchorGroup: 'infraestrutura', anchorSegment: 'estacao_metro' };
  assert.equal(matchesFilters(anchor({ group: 'infraestrutura', segment: 'estacao_metro' }), state), true);
  assert.equal(matchesFilters(anchor({ group: 'infraestrutura', segment: 'aeroporto' }), state), false);
  assert.equal(matchesFilters(anchor({ group: 'comercio_servico', segment: 'estacao_metro' }), state), false);
});

test('sem grupo/segmento preenchidos, os filtros novos não escondem nada (issue #26)', () => {
  // É o estado real da planilha até o backend derivar as colunas: o filtro existe,
  // está vazio, e portanto não restringe (R2.5 — coluna futura vazia não derruba nada).
  const records = [anchor(), rec({ kind: 'listing' }), rec({ kind: 'development' })];
  assert.equal(applyFilters(records, createFilterState()).length, 3);
});

test('distinctAnchorGroups põe o enum na ordem da interface e ignora âncora sem grupo', () => {
  const records = [
    anchor({ group: 'comercio_servico' }), anchor({ group: 'infraestrutura' }),
    anchor({ group: 'comercio_servico' }), anchor({ group: '' }),
    rec({ kind: 'listing', group: 'infraestrutura' }),
  ];
  // `infraestrutura` antes de `comercio_servico`: é a ordem do enum, não a alfabética.
  assert.deepEqual(distinctAnchorGroups(records), ['infraestrutura', 'comercio_servico']);
  assert.deepEqual(distinctAnchorGroups([]), []);

  // Valor fora do enum não é descartado — aparece depois dos conhecidos.
  assert.deepEqual(
    distinctAnchorGroups([anchor({ group: 'lazer_urbano' }), anchor({ group: 'infraestrutura' })]),
    ['infraestrutura', 'lazer_urbano'],
  );
});

test('distinctAnchorSegments restringe ao grupo escolhido (issue #26)', () => {
  const records = [
    anchor({ group: 'infraestrutura', segment: 'estacao_metro' }),
    anchor({ group: 'infraestrutura', segment: 'aeroporto' }),
    anchor({ group: 'comercio_servico', segment: 'escola' }),
    anchor({ group: 'comercio_servico', segment: 'escola' }),
    anchor({ group: 'comercio_servico', segment: '' }),
    rec({ kind: 'development', segment: 'alto padrão' }),
  ];

  assert.deepEqual(distinctAnchorSegments(records), ['aeroporto', 'escola', 'estacao_metro'],
    'sem grupo informado, todos os segmentos de âncora — e nenhum de empreendimento');
  assert.deepEqual(distinctAnchorSegments(records, 'infraestrutura'), ['aeroporto', 'estacao_metro']);
  assert.deepEqual(distinctAnchorSegments(records, 'comercio_servico'), ['escola']);
  assert.deepEqual(distinctAnchorSegments(records, 'grupo_que_nao_existe'), []);
});

test('anchorLegendGroups monta a legenda em dois níveis e deixa o não classificado por último', () => {
  const records = [
    anchor({ group: 'comercio_servico', segment: 'escola' }),
    anchor({ group: 'comercio_servico', segment: 'escola' }),
    anchor({ group: 'infraestrutura', segment: 'estacao_metro' }),
    anchor({ group: '', category: 'saude' }),
    rec({ kind: 'listing' }),
  ];
  const groups = anchorLegendGroups(records);

  assert.deepEqual(groups.map((g) => g.group), ['infraestrutura', 'comercio_servico', ''],
    'enum na ordem da interface; "sem grupo" no fim, porque é ausência de classe');

  const comercio = groups.find((g) => g.group === 'comercio_servico');
  assert.deepEqual(comercio.entries, [{ segment: 'escola', category: '', count: 2 }],
    'entradas iguais são agrupadas, não repetidas');

  // Sem segmento, a entrada guarda a categoria — que é o que colore o marcador hoje.
  const semGrupo = groups.find((g) => g.group === '');
  assert.deepEqual(semGrupo.entries, [{ segment: '', category: 'saude', count: 1 }]);
});

test('anchorLegendGroups não esconde a âncora sem nenhuma classificação', () => {
  // Ela ESTÁ no mapa, com o verde padrão. Omiti-la da legenda deixaria um ponto
  // visível sem explicação (R5.7).
  const groups = anchorLegendGroups([anchor(), anchor()]);
  assert.deepEqual(groups, [{ group: '', entries: [{ segment: '', category: '', count: 2 }] }]);

  // Sem âncora nenhuma, legenda vazia — quem renderiza esconde a seção inteira.
  assert.deepEqual(anchorLegendGroups([rec({ kind: 'listing' })]), []);
  assert.deepEqual(anchorLegendGroups(undefined), []);
});

test('anchorLegendGroups preserva o par (segment, category) inteiro', () => {
  // REGRESSÃO REPRODUZIDA NO NAVEGADOR antes da correção: guardando só o `segment`,
  // uma âncora `segment: "food_hall"` + `category: "escola"` saía âmbar no mapa (a cor
  // cai para a categoria quando o segmento é desconhecido) e verde na legenda. Guardar
  // o par inteiro é o que permite a `anchorLegendEntries` resolver a MESMA cor dos
  // dois lados — ver o teste correspondente em tests/format.test.js.
  const groups = anchorLegendGroups([
    anchor({ group: 'comercio_servico', segment: 'food_hall', category: 'escola' }),
    anchor({ group: 'comercio_servico', segment: 'hospital', category: 'saude' }),
  ]);
  assert.deepEqual(groups[0].entries, [
    { segment: 'food_hall', category: 'escola', count: 1 },
    { segment: 'hospital', category: 'saude', count: 1 },
  ]);
});

// --- Classificação de imóveis (issues #30, #31, #32) -----------------------

/** Empreendimento de teste, com os campos que os filtros novos examinam. */
const dev = (over = {}) => rec({
  kind: 'development', property_type: '', bedrooms: null,
  sales_stage: '', building_orientation: null, regularization_status: '', ...over,
});

test('filtro de estágio de comercialização restringe aos empreendimentos (issue #30)', () => {
  const state = { ...createFilterState(), salesStage: 'em_construcao' };
  assert.equal(matchesFilters(dev({ sales_stage: 'em_construcao' }), state), true);
  assert.equal(matchesFilters(dev({ sales_stage: 'oferta' }), state), false);
  assert.equal(matchesFilters(dev({ sales_stage: '' }), state), false, 'empreendimento sem estágio some com o filtro ativo');

  // Só DEVELOPMENTS tem `sales_stage`: filtrar por ele esconde as outras camadas.
  assert.equal(matchesFilters(rec({ kind: 'listing' }), state), false);
  assert.equal(matchesFilters(rec({ kind: 'anchor' }), state), false);
});

test('filtro de regularização cobre anúncio E empreendimento, sem restringir camada (issue #32)', () => {
  const state = { ...createFilterState(), regularizationStatus: 'regularizado' };
  assert.equal(matchesFilters(rec({ regularization_status: 'regularizado' }), state), true);
  assert.equal(matchesFilters(dev({ regularization_status: 'regularizado' }), state), true);
  assert.equal(matchesFilters(rec({ regularization_status: 'nao_regularizado' }), state), false);
  assert.equal(matchesFilters(rec({ regularization_status: '' }), state), false);

  // Âncora não tem o campo: some quando o filtro está ativo, como no filtro de RA.
  assert.equal(matchesFilters(rec({ kind: 'anchor' }), state), false);
});

test('filtro vertical/horizontal cobre empreendimento, não só anúncio (issue #31)', () => {
  const vertical = { ...createFilterState(), buildingOrientation: 'vertical' };
  const horizontal = { ...createFilterState(), buildingOrientation: 'horizontal' };

  // Anúncio: derivado de property_type pelo normalizador, sempre canônico.
  assert.equal(matchesFilters(rec({ building_orientation: 'vertical' }), vertical), true);

  // Empreendimento: coluna própria da planilha.
  assert.equal(matchesFilters(dev({ building_orientation: 'vertical' }), vertical), true);
  assert.equal(matchesFilters(dev({ building_orientation: 'horizontal' }), vertical), false);
  assert.equal(matchesFilters(dev({ building_orientation: 'horizontal' }), horizontal), true);
  assert.equal(matchesFilters(dev({ building_orientation: null }), vertical), false);
});

test('vertical/horizontal tolera caixa e espaço vindos da célula (issue #31)', () => {
  // As opções deste filtro são FIXAS no index.html, então o valor comparado não vem
  // dos dados — e `building_orientation` de DEVELOPMENTS é célula digitada à mão.
  // Sem tolerância, "Vertical" aparecia como Vertical no card e sumia do filtro.
  const state = { ...createFilterState(), buildingOrientation: 'vertical' };
  assert.equal(matchesFilters(dev({ building_orientation: 'Vertical' }), state), true);
  assert.equal(matchesFilters(dev({ building_orientation: ' vertical ' }), state), true);
  assert.equal(matchesFilters(dev({ building_orientation: 'VERTICAL' }), state), true);
  assert.equal(matchesFilters(dev({ building_orientation: 'Horizontal' }), state), false);
});

test('sem os campos novos preenchidos, nada é escondido (issues #30, #32)', () => {
  // Estado da planilha até o backend publicar as colunas (R2.5).
  const records = [rec(), dev(), rec({ kind: 'anchor' })];
  assert.equal(applyFilters(records, createFilterState()).length, 3);
});

test('distinctSalesStages só olha empreendimento, ordenado e sem repetição (issue #30)', () => {
  const records = [
    dev({ sales_stage: 'oferta' }), dev({ sales_stage: 'em_construcao' }),
    dev({ sales_stage: 'em_construcao' }), dev({ sales_stage: '' }),
    rec({ kind: 'listing', sales_stage: 'em_lancamento' }),
  ];
  assert.deepEqual(distinctSalesStages(records), ['em_construcao', 'oferta']);
  assert.deepEqual(distinctSalesStages([]), []);
});

test('distinctRegularizationStatuses vem dos dados, não de lista fixa (issue #32)', () => {
  // O campo é texto livre: uma lista fixa deixaria de fora qualquer valor que a
  // planilha inventasse, e o registro sumiria do filtro sem explicação.
  const records = [
    rec({ regularization_status: 'regularizado' }),
    dev({ regularization_status: 'em_regularizacao' }),
    rec({ regularization_status: 'regularizado' }),
    rec({ regularization_status: 'processo_judicial' }),
    rec({ regularization_status: '' }),
  ];
  assert.deepEqual(distinctRegularizationStatuses(records),
    ['em_regularizacao', 'processo_judicial', 'regularizado']);
});
