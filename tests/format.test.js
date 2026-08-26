import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatBRL, formatBRLCompact, formatM2, formatPriceM2, formatNumber, formatDate,
  escapeHtml, safeExternalUrl, hostnameOf, formatPropertyType, formatSpatialPrecision,
  formatBuildingOrientation, formatAnchorGroup, formatAnchorSegment, formatAnchorCategory,
  anchorColor, anchorLegendColor, anchorLegendEntries, ANCHOR_FALLBACK_COLOR,
  formatSalesStage, formatRegularizationStatus, formatPercent, raAgeBands,
} from '../src/format.js';

test('ausência vira travessão, não zero', () => {
  // "R$ 0" afirma que o imóvel é de graça; "—" afirma que não se sabe.
  for (const fn of [formatBRL, formatM2, formatPriceM2, formatNumber]) {
    assert.equal(fn(null), '—');
    assert.equal(fn(undefined), '—');
    assert.equal(fn(NaN), '—');
    assert.equal(fn(Infinity), '—');
  }
  // Intl separa "R$" do número com espaço inseparável (U+00A0), não espaço comum —
  // comparar com literal falharia de forma invisível no diff.
  assert.match(formatBRL(0), /^R\$\s0$/, 'zero explícito continua sendo zero');
});

test('formatBRLCompact encurta sem perder a ordem de grandeza', () => {
  assert.match(formatBRLCompact(2500000), /2,5 mi/);
  assert.match(formatBRLCompact(320000), /320 mil/);
  assert.equal(formatBRLCompact(null), '—');
});

test('formatDate converte ISO para o formato brasileiro', () => {
  assert.equal(formatDate('2026-08-18'), '18/08/2026');
  assert.equal(formatDate(''), '—');
  assert.equal(formatDate(null), '—');
  assert.equal(formatDate('18/08/2026'), '—', 'entrada fora do contrato não é adivinhada');
});

test('escapeHtml neutraliza os cinco caracteres perigosos', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
  assert.equal(escapeHtml('"aspas"'), '&quot;aspas&quot;');
  assert.equal(escapeHtml("'simples'"), '&#39;simples&#39;');
  assert.equal(escapeHtml(null), '');

  // O & é escapado primeiro; escapá-lo por último produziria &amp;lt;.
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
});

test('safeExternalUrl deixa passar apenas http e https', () => {
  assert.equal(safeExternalUrl('https://exemplo.com/x'), 'https://exemplo.com/x');
  assert.equal(safeExternalUrl('http://exemplo.com'), 'http://exemplo.com/');

  // Uma célula da planilha não pode virar execução de script no navegador (R4.6).
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('JavaScript:alert(1)'), null);
  assert.equal(safeExternalUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(safeExternalUrl('vbscript:msgbox(1)'), null);
  assert.equal(safeExternalUrl('file:///etc/passwd'), null);

  assert.equal(safeExternalUrl(''), null);
  assert.equal(safeExternalUrl('   '), null);
  assert.equal(safeExternalUrl(null), null);
  assert.equal(safeExternalUrl('não é url'), null);
});

test('hostnameOf rotula a fonte e recusa URL insegura', () => {
  assert.equal(hostnameOf('https://www.quintoandar.com.br/imovel/1'), 'quintoandar.com.br');
  assert.equal(hostnameOf('https://reservajardimbotanico.com/x'), 'reservajardimbotanico.com');
  assert.equal(hostnameOf('javascript:alert(1)'), '');
  assert.equal(hostnameOf(''), '');
});

test('formatPropertyType traduz o vocabulário do dataset', () => {
  assert.equal(formatPropertyType('apartamento'), 'Apartamento');
  assert.equal(formatPropertyType('casa_condominio'), 'Casa em condomínio');
  assert.equal(formatPropertyType('kitnet'), 'Kitnet');
  assert.equal(formatPropertyType(''), '—');

  // Tipo novo na planilha não pode virar tela em branco.
  assert.equal(formatPropertyType('loft_duplex'), 'Loft duplex');
});

test('formatSpatialPrecision nunca expõe o identificador cru de pipeline (issue #21)', () => {
  assert.equal(
    formatSpatialPrecision('locality_centroid_deterministic_jitter'),
    'Centro da localidade, com variação controlada',
  );
  assert.equal(formatSpatialPrecision('high_attributes'), 'Atributos confiáveis');
  assert.equal(formatSpatialPrecision(''), '');
  assert.equal(formatSpatialPrecision(null), '');

  // Vocabulário não documentado (o contrato é explícito: não é fechado) ainda assim
  // não pode voltar cru, com underscore, para a tela.
  assert.equal(formatSpatialPrecision('some_new_vocabulary_term'), 'Some new vocabulary term');
  assert.doesNotMatch(formatSpatialPrecision('some_new_vocabulary_term'), /_/);
});

test('formatBuildingOrientation traduz o vocabulário fechado (issue #31)', () => {
  assert.equal(formatBuildingOrientation('vertical'), 'Vertical');
  assert.equal(formatBuildingOrientation('horizontal'), 'Horizontal');
  assert.equal(formatBuildingOrientation(''), '');
  assert.equal(formatBuildingOrientation(null), '');
  assert.equal(formatBuildingOrientation('valor_desconhecido'), '', 'sem fallback humanizado: não é vocabulário aberto');
});

// --- Âncoras: grupo, segmento e cor (issues #26, #39) ----------------------

test('formatAnchorGroup traduz o enum e humaniza valor inesperado (issue #26)', () => {
  assert.equal(formatAnchorGroup('infraestrutura'), 'Infraestrutura');
  assert.equal(formatAnchorGroup('comercio_servico'), 'Comércio e serviço');

  // Ausência é ausência: quem renderiza omite a linha em vez de escrever travessão.
  assert.equal(formatAnchorGroup(''), '');
  assert.equal(formatAnchorGroup(null), '');
  assert.equal(formatAnchorGroup(undefined), '');

  // `group` é enum fechado NO CONTRATO, mas a planilha é pública e editável: valor
  // fora do enum vira texto legível, nunca o slug cru e nunca sumiço silencioso.
  assert.equal(formatAnchorGroup('lazer_urbano'), 'Lazer urbano');
  assert.equal(formatAnchorGroup('  INFRAESTRUTURA  '), 'Infraestrutura');
});

test('formatAnchorSegment cobre os 12 inferidos, os digitados à mão e o desconhecido', () => {
  // Inferidos pelo backend (Code.gs, inferAnchorSegment_).
  for (const [slug, label] of [
    ['escola', 'Escola'], ['universidade', 'Universidade'], ['supermercado', 'Supermercado'],
    ['atacado', 'Atacado'], ['hospital', 'Hospital'], ['laboratorio', 'Laboratório'],
    ['clinica', 'Clínica'], ['estacao_metro', 'Estação de metrô'],
    ['estacao_trem', 'Estação de trem'], ['terminal_rodoviario', 'Terminal rodoviário'],
    ['aeroporto', 'Aeroporto'], ['ponto_onibus', 'Ponto de ônibus'],
  ]) assert.equal(formatAnchorSegment(slug), label, slug);

  // Digitados à mão na planilha.
  assert.equal(formatAnchorSegment('department_store'), 'Loja de departamento');
  assert.equal(formatAnchorSegment('material_construcao'), 'Material de construção');
  assert.equal(formatAnchorSegment('posto_combustivel'), 'Posto de combustível');

  // Vocabulário ABERTO: termo que ninguém previu não pode vazar o slug para a tela
  // (mesma regra de formatSpatialPrecision, issue #21).
  assert.equal(formatAnchorSegment('food_hall'), 'Food hall');
  assert.equal(formatAnchorSegment('coworking'), 'Coworking');
  assert.equal(formatAnchorSegment(''), '');
});

test('anchorColor: segmento vence categoria, categoria vence o verde padrão (issue #26)', () => {
  const anchor = (over) => ({ kind: 'anchor', ...over });

  // Segmento reconhecido manda, mesmo com categoria também reconhecida.
  const porSegmento = anchorColor(anchor({ segment: 'hospital', category: 'escola' }));
  assert.notEqual(porSegmento, ANCHOR_FALLBACK_COLOR);
  assert.notEqual(porSegmento, anchorColor(anchor({ category: 'escola' })));

  // Sem segmento, a categoria ainda colore — nenhuma âncora do dataset atual tem
  // segmento preenchido, então este é o caminho que roda hoje em produção.
  assert.equal(anchorColor(anchor({ category: 'escola' })), anchorColor(anchor({ segment: 'escola' })));

  // Segmento desconhecido cai para a categoria, não para o verde padrão.
  assert.equal(
    anchorColor(anchor({ segment: 'food_hall', category: 'saude' })),
    anchorColor(anchor({ category: 'saude' })),
  );

  // Sem nada reconhecível, verde padrão — nunca `undefined` virando marcador preto.
  assert.equal(anchorColor(anchor({})), ANCHOR_FALLBACK_COLOR);
  assert.equal(anchorColor(anchor({ segment: 'food_hall', category: 'algo_novo' })), ANCHOR_FALLBACK_COLOR);

  // Quem não é âncora devolve null: listing/development pegam a cor do CSS da camada,
  // e devolver uma cor aqui sobrescreveria essa codificação.
  assert.equal(anchorColor({ kind: 'listing', segment: 'hospital' }), null);
  assert.equal(anchorColor({ kind: 'development', segment: 'alto padrão' }), null);
  assert.equal(anchorColor(null), null);
});

test('anchorLegendColor usa exatamente a mesma cadeia do marcador', () => {
  // Legenda e mapa divergirem é o bug clássico de legenda: mesma função, mesma cor.
  for (const entry of [
    { segment: 'estacao_metro', category: '' },
    { segment: '', category: 'mobilidade' },
    { segment: '', category: '' },
    { segment: 'coworking', category: '' },
  ]) {
    assert.equal(anchorLegendColor(entry), anchorColor({ kind: 'anchor', ...entry }));
  }
});

test('cores de âncora são hex válidos e o padrão bate com --anchor do CSS', () => {
  const slugs = [
    'escola', 'universidade', 'livraria', 'hospital', 'clinica', 'laboratorio',
    'supermercado', 'atacado', 'posto_combustivel', 'estacao_metro', 'estacao_trem',
    'aeroporto', 'terminal_rodoviario', 'ponto_onibus', 'department_store', 'vestuario',
    'moveis', 'artigos_esportivos', 'loja_pet', 'material_construcao', 'cinema',
    'academia', 'restaurantes', 'hotelaria',
  ];
  for (const slug of slugs) {
    const color = anchorColor({ kind: 'anchor', segment: slug });
    assert.match(color, /^#[0-9a-f]{6}$/, `${slug} -> ${color}`);
    assert.notEqual(color, ANCHOR_FALLBACK_COLOR, `${slug} caiu no fallback`);
  }
  // O verde padrão precisa continuar igual a `--anchor` em assets/styles.css: é a
  // mesma cor do ponto "Âncoras" na lista de camadas.
  assert.equal(ANCHOR_FALLBACK_COLOR, '#397d53');
});

test('formatAnchorCategory continua legível para categoria fora do vocabulário', () => {
  assert.equal(formatAnchorCategory('supermercado_atacarejo'), 'Supermercado / atacarejo');
  assert.equal(formatAnchorCategory('parque_equipamento_publico'), 'Parque / equipamento público');
  assert.equal(formatAnchorCategory('coisa_nova'), 'Coisa nova');
  assert.equal(formatAnchorCategory(''), '');
});

test('anchorLegendEntries resolve a MESMA cor que o marcador (regressão do PR A)', () => {
  // Reproduzido no navegador: uma âncora `segment: "food_hall"` + `category: "escola"`
  // sai âmbar no mapa, porque a cor cai do segmento desconhecido para a categoria.
  // A legenda tem que sair âmbar também, ou aponta para uma cor que ninguém usa.
  const entry = { segment: 'food_hall', category: 'escola', count: 1 };
  const [linha] = anchorLegendEntries([entry]);
  assert.equal(linha.label, 'Food hall');
  assert.equal(linha.color, anchorColor({ kind: 'anchor', ...entry }));
  assert.notEqual(linha.color, ANCHOR_FALLBACK_COLOR);
});

test('anchorLegendEntries funde o que é a mesma linha e separa o que é cor diferente', () => {
  // Mesmo rótulo e mesma cor: uma linha só, com as contagens somadas.
  const fundidas = anchorLegendEntries([
    { segment: 'escola', category: 'escola', count: 2 },
    { segment: 'escola', category: '', count: 3 },
  ]);
  assert.deepEqual(fundidas.map((e) => e.label), ['Escola']);
  assert.equal(fundidas[0].count, 5);

  // Mesmo rótulo, cores diferentes: DUAS linhas. São dois tons no mapa, e esconder um
  // deixaria marcador sem legenda.
  const separadas = anchorLegendEntries([
    { segment: 'food_hall', category: 'escola', count: 1 },
    { segment: 'food_hall', category: '', count: 1 },
  ]);
  assert.equal(separadas.length, 2);
  assert.deepEqual(separadas.map((e) => e.label), ['Food hall', 'Food hall']);
  assert.notEqual(separadas[0].color, separadas[1].color);
});

test('anchorLegendEntries rotula a âncora sem classificação e ordena em pt-BR', () => {
  const entries = anchorLegendEntries([
    { segment: '', category: '', count: 1 },
    { segment: 'universidade', category: '', count: 1 },
    { segment: '', category: 'escola', count: 1 },
    { segment: 'academia', category: '', count: 1 },
  ]);
  assert.deepEqual(entries.map((e) => e.label), ['Academia', 'Escola', 'Sem classificação', 'Universidade']);
  assert.equal(entries.find((e) => e.label === 'Sem classificação').color, ANCHOR_FALLBACK_COLOR);
  assert.deepEqual(anchorLegendEntries([]), []);
  assert.deepEqual(anchorLegendEntries(undefined), []);
});

// --- Classificação de imóveis (issues #30, #31, #32) -----------------------

test('formatSalesStage traduz o enum fechado e não engole valor inesperado (issue #30)', () => {
  assert.equal(formatSalesStage('em_construcao'), 'Em construção');
  assert.equal(formatSalesStage('em_lancamento'), 'Em lançamento');
  assert.equal(formatSalesStage('oferta'), 'Oferta');

  assert.equal(formatSalesStage(''), '', 'ausência é ausência: o selo some, não vira travessão');
  assert.equal(formatSalesStage(null), '');

  // Enum fechado no contrato, planilha aberta na prática. Um estágio digitado errado
  // precisa ficar VISÍVEL para ser corrigido, não sumir da tela.
  assert.equal(formatSalesStage('pre_lancamento'), 'Pre lancamento');
  assert.equal(formatSalesStage('  OFERTA '), 'Oferta');
});

test('formatRegularizationStatus não assume vocabulário fechado (issue #32)', () => {
  assert.equal(formatRegularizationStatus('regularizado'), 'Regularizado');
  assert.equal(formatRegularizationStatus('nao_regularizado'), 'Não regularizado');
  assert.equal(formatRegularizationStatus('em_regularizacao'), 'Em regularização');
  assert.equal(formatRegularizationStatus(''), '');

  // O campo é TEXTO LIVRE no backend — o Apps Script não o valida contra enum nenhum.
  // Valor fora dos três esperados vira texto legível; tratá-lo como um dos três seria
  // afirmar sobre regularização algo que a planilha não disse (R8.16).
  assert.equal(formatRegularizationStatus('processo_judicial'), 'Processo judicial');
  assert.equal(formatRegularizationStatus('desconhecido'), 'Desconhecido');
});

// --- Indicadores por RA (issue #35) ---------------------------------------

const perfil = (over = {}) => ({
  ra_geo_id: 'RA2026_RA-I', ra_name: 'PLANO PILOTO',
  population_total: 198697, population_density_km2: 454.47,
  income_per_capita_brl: null,
  population_age_0_14_pct: null, population_age_15_29_pct: null,
  population_age_30_44_pct: null, population_age_45_59_pct: null,
  population_age_60_plus_pct: null,
  ...over,
});

const FAIXAS_CHEIAS = {
  population_age_0_14_pct: 18.2, population_age_15_29_pct: 21.4,
  population_age_30_44_pct: 24.1, population_age_45_59_pct: 19.6,
  population_age_60_plus_pct: 16.7,
};

test('formatPercent usa vírgula decimal e não confunde ausência com zero', () => {
  assert.equal(formatPercent(18.24), '18,2%');
  assert.equal(formatPercent(0), '0,0%');
  assert.equal(formatPercent(100), '100,0%');
  assert.equal(formatPercent(null), '—');
  assert.equal(formatPercent(undefined), '—');
  assert.equal(formatPercent(NaN), '—');
});

test('raAgeBands mantém a ordem da pirâmide etária, não a alfabética (issue #35)', () => {
  const { bands, total, scaledFromDecimal } = raAgeBands(perfil(FAIXAS_CHEIAS));
  assert.deepEqual(bands.map((b) => b.label), ['0–14', '15–29', '30–44', '45–59', '60+']);
  assert.equal(scaledFromDecimal, false);
  assert.equal(Math.round(total), 100);
});

test('raAgeBands omite faixa sem valor em vez de desenhar barra de zero', () => {
  // Barra de zero AFIRMA que ninguém naquela RA tem entre 0 e 14 anos. A cobertura do
  // PDAD é esparsa: "não publicado" e "zero" são estados diferentes (R8.25).
  const { bands, total } = raAgeBands(perfil({
    population_age_0_14_pct: 18.2, population_age_60_plus_pct: 16.7,
  }));
  assert.deepEqual(bands.map((b) => b.label), ['0–14', '60+']);
  assert.equal(Math.round(total * 10) / 10, 34.9, 'o total declara que a composição está incompleta');
});

test('raAgeBands devolve vazio quando não há distribuição nenhuma', () => {
  assert.deepEqual(raAgeBands(perfil()), { bands: [], total: null, scaledFromDecimal: false });
  assert.deepEqual(raAgeBands(null), { bands: [], total: null, scaledFromDecimal: false });
  assert.deepEqual(raAgeBands(undefined), { bands: [], total: null, scaledFromDecimal: false });
});

test('raAgeBands converte a escala decimal que o contrato admite (issue #35)', () => {
  // docs/DATA_CONTRACT.md aceita "aproximadamente 100%, ou 1, em escala decimal".
  // Sem converter, 0,182 viraria uma barra invisível numa régua de porcento.
  const { bands, total, scaledFromDecimal } = raAgeBands(perfil({
    population_age_0_14_pct: 0.182, population_age_15_29_pct: 0.214,
    population_age_30_44_pct: 0.241, population_age_45_59_pct: 0.196,
    population_age_60_plus_pct: 0.167,
  }));
  assert.equal(scaledFromDecimal, true);
  assert.equal(Math.round(bands[0].pct * 10) / 10, 18.2);
  assert.equal(Math.round(total), 100);
});

test('raAgeBands não converte quando a escala é ambígua', () => {
  // Uma faixa só, com valor 0,9: pode ser 0,9% ou 90%. Multiplicar seria inventar.
  const uma = raAgeBands(perfil({ population_age_0_14_pct: 0.9 }));
  assert.equal(uma.scaledFromDecimal, false);
  assert.equal(uma.bands[0].pct, 0.9);

  // Distribuição em porcento não satisfaz "todas ≤ 1", então nunca é convertida.
  const cheia = raAgeBands(perfil(FAIXAS_CHEIAS));
  assert.equal(cheia.scaledFromDecimal, false);

  // Mistura de escalas também não converte: nem toda faixa fica em 0–1.
  const mista = raAgeBands(perfil({
    population_age_0_14_pct: 0.18, population_age_15_29_pct: 21.4,
  }));
  assert.equal(mista.scaledFromDecimal, false);
});

test('raAgeBands usa o MESMO teto de escala decimal que o servidor (P2 do Codex na PR #44)', () => {
  // `validateRaProfile_()` no Apps Script aceita `Math.abs(sum - 1) <= 0.02`. Cortando
  // em 1,01, esta soma de 1,019 passava na validação do backend e saía da tela como
  // "0,2%" em vez de "20,0%" — toda faixa subestimada em 100×.
  const limite = raAgeBands(perfil({
    population_age_0_14_pct: 0.20, population_age_15_29_pct: 0.20,
    population_age_30_44_pct: 0.20, population_age_45_59_pct: 0.20,
    population_age_60_plus_pct: 0.219,
  }));
  assert.equal(limite.scaledFromDecimal, true);
  assert.equal(Math.round(limite.bands[0].pct * 10) / 10, 20);
  assert.equal(Math.round(limite.total * 10) / 10, 101.9);

  // Acima do teto do servidor continua sem converter: aí a planilha está fora do que
  // o contrato chama de "aproximadamente 1", e adivinhar seria pior que não mexer.
  const acima = raAgeBands(perfil({
    population_age_0_14_pct: 0.30, population_age_15_29_pct: 0.30,
    population_age_30_44_pct: 0.45,
  }));
  assert.equal(acima.scaledFromDecimal, false);
});

test('raAgeBands converte distribuição decimal PARCIAL, que soma bem abaixo de 1', () => {
  // O piso do servidor (`sum >= 0,98`) descreve uma distribuição completa. Aqui ela
  // pode estar parcial: duas faixas decimais somando 0,35 são escala decimal legítima
  // e precisam virar 18,2% e 16,7%, não 0,2% e 0,2%. Quem denuncia a composição
  // incompleta é o `total`, não a escala.
  const { bands, total, scaledFromDecimal } = raAgeBands(perfil({
    population_age_0_14_pct: 0.182, population_age_60_plus_pct: 0.167,
  }));
  assert.equal(scaledFromDecimal, true);
  assert.equal(Math.round(bands[0].pct * 10) / 10, 18.2);
  assert.equal(Math.round(total * 10) / 10, 34.9);
});

test('raAgeBands ignora valor não numérico sem quebrar', () => {
  const { bands } = raAgeBands(perfil({
    population_age_0_14_pct: 18.2,
    population_age_15_29_pct: NaN,
    population_age_30_44_pct: Infinity,
    population_age_45_59_pct: undefined,
  }));
  assert.deepEqual(bands.map((b) => b.label), ['0–14']);
});
