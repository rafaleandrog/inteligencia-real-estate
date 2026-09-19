// Definição e montagem dos gráficos do Mercado (issues #81 e #83).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_CHARTS, SEASONALITY_CHART, SERIES_MODES, CAT_MAXIMA,
  buildHistoryCharts, buildSeasonality, buildSparkline,
} from '../src/ivv/history.js';
import { CHART_TYPES, CHART_SOURCES, DIMENSOES } from '../src/ivv/chart-model.js';
import { METRIC_BY_KEY, DERIVED_SERIES_BY_KEY } from '../src/ivv/metrics.js';

const rows = [
  {
    reference_date: '2026-02-01', ivv_pct: 0.06,
    sale_price_brl_m2: 10000, asking_price_brl_m2: 12000,
    sales_units: 300, launches_units: 500, offers_units: 4000,
    vgv_brl_million: 900, cancellations_to_sales_pct: 0.12,
  },
  {
    reference_date: '2026-01-01', ivv_pct: 0.05,
    sale_price_brl_m2: 9800, asking_price_brl_m2: 11800,
    sales_units: 250, launches_units: 350, offers_units: 4200,
    vgv_brl_million: 800, cancellations_to_sales_pct: 0.1,
  },
];

const janela = (linhas = rows) => ({ periodo: linhas, janela: linhas, completa: linhas });

test('a lista de gráficos é dado congelado, com chaves estáveis', () => {
  assert.deepEqual(HISTORY_CHARTS.map((item) => item.key),
    ['ivv', 'precos', 'atividade', 'estoque', 'vgv', 'distratos']);
  assert.ok(Object.isFrozen(HISTORY_CHARTS));
  assert.ok(HISTORY_CHARTS.every((item) => Object.isFrozen(item.series)));
});

test('toda definição declara tipo e fonte do vocabulário fechado, e uma pergunta', () => {
  for (const definicao of [...HISTORY_CHARTS, SEASONALITY_CHART]) {
    assert.ok(Object.values(CHART_TYPES).includes(definicao.tipo), `${definicao.key}: tipo`);
    assert.ok(Object.values(CHART_SOURCES).includes(definicao.fonte), `${definicao.key}: fonte`);
    assert.ok(definicao.pergunta?.endsWith('?'), `${definicao.key}: sem pergunta`);
  }
});

test('toda série plotada existe num dos dois registros, e nenhuma carrega cor', () => {
  for (const definicao of HISTORY_CHARTS) {
    for (const serie of definicao.series) {
      const registro = serie.derivada ? DERIVED_SERIES_BY_KEY : METRIC_BY_KEY;
      assert.ok(registro[serie.key], `${serie.key} fora do registro esperado`);
      assert.ok(Number.isInteger(serie.cat) && serie.cat >= 1 && serie.cat <= CAT_MAXIMA,
        `${serie.key}: cat fora da paleta`);
      assert.equal('color' in serie, false, `${serie.key} ainda carrega cor`);
    }
  }
});

test('a sazonalidade é o único gráfico que lê a série completa', () => {
  assert.equal(SEASONALITY_CHART.fonte, CHART_SOURCES.COMPLETA);
  assert.ok(HISTORY_CHARTS.every((item) => item.fonte !== CHART_SOURCES.COMPLETA));
});

test('cada gráfico lê a fonte que declarou, e não outra', () => {
  const fontes = { periodo: [], janela: rows, completa: [] };
  const graficos = buildHistoryCharts(fontes);
  assert.ok(graficos.every((g) => g.categorias.length === 2), 'gráfico leu fonte errada');
  assert.deepEqual(buildHistoryCharts({}).map((g) => g.vazio), Array(6).fill(true));
});

test('gráfico usa valor mensal ordenado, nunca acumulado repetido', () => {
  const atividade = buildHistoryCharts(janela()).find((g) => g.key === 'atividade');
  const vendas = atividade.series.find((s) => s.chave === 'sales_units');
  assert.deepEqual(vendas.pontos.map((p) => p.valor), [250, 300]);
  assert.deepEqual(atividade.categorias.map((c) => c.chave), ['2026-01', '2026-02']);
});

test('modo acumulado respeita a natureza da métrica: soma fluxo, média estoque e pondera IVV', () => {
  const graficos = buildHistoryCharts(janela(), SERIES_MODES.ACUMULADO);
  const atividade = graficos.find((g) => g.key === 'atividade');
  const estoque = graficos.find((g) => g.key === 'estoque');
  const ivv = graficos.find((g) => g.key === 'ivv');

  assert.deepEqual(atividade.series.find((s) => s.chave === 'sales_units').pontos.map((p) => p.valor),
    [250, 550]);
  assert.deepEqual(estoque.series[0].pontos.map((p) => p.valor), [4200, 4100]);
  assert.deepEqual(ivv.series[0].pontos.map((p) => p.valor), [0.05, 550 / 8200]);
  assert.equal(estoque.titulo, 'Unidades em oferta — média do período');
});

test('acumulado continua pelo período visível quando ele atravessa janeiro', () => {
  const atravessandoAno = [
    { reference_date: '2025-07-01', vgv_brl_million: 400 },
    { reference_date: '2025-12-01', vgv_brl_million: 500 },
    { reference_date: '2026-01-01', vgv_brl_million: 600 },
  ];
  const vgv = buildHistoryCharts(janela(atravessandoAno), SERIES_MODES.ACUMULADO)
    .find((g) => g.key === 'vgv');

  assert.deepEqual(vgv.series[0].pontos.map((p) => p.valor), [400, 900, 1500]);
  assert.equal(vgv.titulo, 'VGV acumulado no período');
  assert.equal(vgv.notaModo, 'Soma desde o início do período mostrado.');
});

test('a série derivada é plotada com a unidade dela, não com a de contagem', () => {
  const distratos = buildHistoryCharts(janela()).find((g) => g.key === 'distratos');
  assert.equal(distratos.vazio, false);
  assert.equal(distratos.series[0].pontos[0].rotulo, '10,0%');
});

test('dado ausente não vira zero no gráfico', () => {
  const graficos = buildHistoryCharts(janela([{ reference_date: '2026-01-01', sales_units: null }]));
  const ivv = graficos.find((g) => g.key === 'ivv');
  assert.equal(ivv.vazio, true);
  assert.equal(ivv.series[0].pontos[0].valor, null);
  assert.match(ivv.series[0].pontos[0].titulo, /sem valor publicado/);
});

test('preço não tem piso em zero; contagem tem', () => {
  const graficos = buildHistoryCharts(janela());
  assert.ok(graficos.find((g) => g.key === 'precos').y.min > 0);
  assert.equal(graficos.find((g) => g.key === 'estoque').y.min, 0);
});

test('a sazonalidade põe jan..dez no eixo e um ano por série', () => {
  const dois = [
    { reference_date: '2025-01-01', ivv_pct: 0.04 },
    { reference_date: '2025-02-01', ivv_pct: 0.05 },
    { reference_date: '2026-01-01', ivv_pct: 0.06 },
  ];
  const modelo = buildSeasonality(dois);
  assert.equal(modelo.categorias.length, 12);
  assert.deepEqual(modelo.categorias.map((c) => c.rotulo).slice(0, 2), ['jan.', 'fev.']);
  assert.deepEqual(modelo.series.map((s) => s.rotulo), ['2025', '2026']);
});

// A sazonalidade é o único gráfico de dimensão ORDINAL do repositório (issue #97): ano é
// ordem, não identidade, e a cor carrega essa ordem numa rampa de um matiz só (R8.76).
const anosDe = (lista) => Object.fromEntries(
  buildSeasonality(lista.map((ano) => ({ reference_date: `${ano}-01-01`, ivv_pct: 0.05 })))
    .series.map((s) => [s.rotulo, s.cat]),
);

test('a sazonalidade se declara ORDINAL; os outros gráficos ficam categóricos', () => {
  assert.equal(buildSeasonality([{ reference_date: '2026-01-01', ivv_pct: 0.05 }]).dimensao,
    DIMENSOES.ORDINAL);
  for (const modelo of buildHistoryCharts({}, SERIES_MODES.MENSAL)) {
    assert.equal(modelo.dimensao, DIMENSOES.CATEGORICA, `${modelo.key} não é categórico`);
  }
});

test('o ano corrente fica no último degrau da rampa, e os demais varrem até o primeiro', () => {
  // O corrente é sempre o teto — mais escuro no tema claro, mais claro no escuro, porque a
  // rampa inverte com o tema; é a série que a pessoa veio ver.
  const teto = SEASONALITY_CHART.anos;
  assert.deepEqual(anosDe([2026]), { 2026: teto });
  // Com dois anos, as PONTAS: encostar no corrente daria degraus vizinhos, com 1,7:1 de
  // contraste entre si — duas linhas quase idênticas justamente na janela mais usada.
  assert.deepEqual(anosDe([2025, 2026]), { 2025: 1, 2026: teto });
  assert.deepEqual(anosDe([2024, 2025, 2026]), { 2024: 1, 2025: 2, 2026: teto });
  assert.deepEqual(anosDe([2023, 2024, 2025, 2026]), { 2023: 1, 2024: 2, 2025: 3, 2026: teto });
});

test('nenhum degrau cai fora da rampa, nem pedindo demais nem pedindo absurdo', () => {
  // Índice fora da rampa não dá erro: sairia `ano-5`, sem regra CSS, e a série sumiria da
  // tela em silêncio (família da R8.70). O clamp é o que impede isso.
  const muitos = Array.from({ length: 9 }, (_, i) => (
    { reference_date: `${2018 + i}-01-01`, ivv_pct: 0.05 }
  ));
  for (const opcoes of [{}, { anos: 8 }, { anos: -3 }, { anos: 0 }]) {
    const series = buildSeasonality(muitos, opcoes).series;
    assert.ok(series.length >= 1 && series.length <= SEASONALITY_CHART.anos,
      `${JSON.stringify(opcoes)}: ${series.length} séries`);
    for (const s of series) {
      assert.ok(Number.isInteger(s.cat) && s.cat >= 1 && s.cat <= SEASONALITY_CHART.anos,
        `${JSON.stringify(opcoes)}: degrau ${s.cat} fora da rampa`);
    }
  }
});

test('ano incompleto deixa buraco nos meses que ainda não existem', () => {
  const modelo = buildSeasonality([{ reference_date: '2026-01-01', ivv_pct: 0.06 }]);
  assert.equal(modelo.series.length, 1, 'série única continua desenhando');
  assert.equal(modelo.series[0].pontos[0].valor, 0.06);
  assert.deepEqual(modelo.series[0].pontos.slice(1).map((p) => p.valor), Array(11).fill(null));
});

test('a sazonalidade respeita o teto de anos comparados', () => {
  const muitos = Array.from({ length: 8 }, (_, i) => (
    { reference_date: `${2019 + i}-01-01`, ivv_pct: 0.05 }
  ));
  assert.equal(buildSeasonality(muitos).series.length, SEASONALITY_CHART.anos);
  assert.equal(buildSeasonality(muitos, { anos: 2 }).series.length, 2);
  assert.deepEqual(buildSeasonality(muitos, { anos: 2 }).series.map((s) => s.rotulo), ['2025', '2026']);
});

test('o sparkline é uma série só, sem piso em zero', () => {
  const spark = buildSparkline(rows, 'sale_price_brl_m2');
  assert.equal(spark.series.length, 1);
  assert.equal(spark.y.baseZero, false);
  assert.equal(spark.series[0].pontos.length, 2);
  assert.equal(buildSparkline([], 'sale_price_brl_m2').vazio, true);
});

// --- Comparação temporal (issue #127): mesma série, segundo recorte, mesmo eixo -------------

import { COMPARE_MODES, COMPARE_MODE_OPTIONS, COMPARE_SUFFIX, shiftMonth, comparisonRows } from '../src/ivv/history.js';

const serieLonga = (() => {
  const out = [];
  for (let i = 0; i < 30; i += 1) {
    const ano = 2024 + Math.floor(i / 12);
    const mes = (i % 12) + 1;
    out.push({ reference_date: `${ano}-${String(mes).padStart(2, '0')}-01`, ivv_pct: 0.05 + i * 0.001, sales_units: 100 + i, offers_units: 4000 });
  }
  return out;
})();

test('shiftMonth: aritmética de mês, inclusive virada de ano; ilegível é null', () => {
  assert.equal(shiftMonth('2026-03', -12), '2025-03');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2025-12', 1), '2026-01');
  assert.equal(shiftMonth('2026-03', -3), '2025-12');
  assert.equal(shiftMonth('mar/26', -1), null);
  assert.equal(shiftMonth(null, -1), null);
});

test('comparisonRows: período anterior de mesma duração e mesmo período do ano anterior', () => {
  const anterior = comparisonRows(serieLonga, { start: '2026-01', end: '2026-06' }, COMPARE_MODES.PERIODO_ANTERIOR);
  assert.deepEqual([anterior.start, anterior.end, anterior.rows.length], ['2025-07', '2025-12', 6]);
  const anoAnterior = comparisonRows(serieLonga, { start: '2026-01', end: '2026-06' }, COMPARE_MODES.ANO_ANTERIOR);
  assert.deepEqual([anoAnterior.start, anoAnterior.end, anoAnterior.rows.length], ['2025-01', '2025-06', 6]);
  // Mês ausente na fonte: a janela é a mesma, as linhas são só as publicadas.
  const comBuraco = comparisonRows(serieLonga.filter((r) => r.reference_date !== '2025-03-01'),
    { start: '2026-01', end: '2026-06' }, COMPARE_MODES.ANO_ANTERIOR);
  assert.equal(comBuraco.rows.length, 5);
  // Antes do início da série: vazio, sem erro.
  const foraDaSerie = comparisonRows(serieLonga, { start: '2024-01', end: '2024-03' }, COMPARE_MODES.ANO_ANTERIOR);
  assert.deepEqual([foraDaSerie.rows, foraDaSerie.start], [[], '2023-01']);
  assert.deepEqual(comparisonRows(serieLonga, { start: '2026-01', end: '2026-06' }, COMPARE_MODES.NENHUM).rows, []);
  assert.deepEqual(comparisonRows(serieLonga, { start: null, end: null }, COMPARE_MODES.ANO_ANTERIOR).rows, []);
  assert.deepEqual(comparisonRows(serieLonga, { start: '2026-06', end: '2026-01' }, COMPARE_MODES.ANO_ANTERIOR).rows, []);
  assert.deepEqual(comparisonRows(serieLonga, { start: '2026-01', end: '2026-06' }, 'modo_inventado').rows, []);
});

test('buildHistoryCharts sobrepõe a série comparada no mesmo eixo, tracejada por chave, alinhada por posição', () => {
  const janela = serieLonga.slice(24, 30); // 2026-01..2026-06
  const comparacao = comparisonRows(serieLonga, { start: '2026-01', end: '2026-06' }, COMPARE_MODES.ANO_ANTERIOR);
  const graficos = buildHistoryCharts({ periodo: janela, janela, completa: serieLonga }, SERIES_MODES.MENSAL, { comparacao });
  const ivv = graficos.find((g) => g.key === 'ivv');
  assert.equal(ivv.series.length, 2, 'atual + comparada');
  const [atual, comparada] = ivv.series;
  assert.equal(comparada.chave, `ivv_pct${COMPARE_SUFFIX}`);
  assert.equal(comparada.comparacao, true);
  assert.equal(atual.comparacao, false);
  assert.equal(comparada.cat, atual.cat, 'mesma cor, traço diferente');
  assert.match(comparada.rotulo, /ano anterior \(jan\.\/2025–jun\.\/2025\)/);
  assert.deepEqual(comparada.pontos.map((p) => p.categoria), atual.pontos.map((p) => p.categoria), 'um eixo só');
  assert.equal(comparada.pontos[0].valor, serieLonga[12].ivv_pct, '1º mês contra 1º mês');
  assert.equal(ivv.comparacao.disponivel, true);
  assert.equal(ivv.y.min, 0, 'nada de segundo eixo: o domínio continua único');

  // Comparação sem mês publicado: nada sobreposto e a nota diz isso.
  const vazia = comparisonRows(serieLonga, { start: '2024-01', end: '2024-03' }, COMPARE_MODES.ANO_ANTERIOR);
  const semDado = buildHistoryCharts({ periodo: janela, janela, completa: serieLonga }, SERIES_MODES.MENSAL, { comparacao: vazia });
  assert.equal(semDado[0].series.length, 1);
  assert.match(semDado[0].notaModo, /Sem mês publicado no recorte de comparação/);
  assert.equal(semDado[0].comparacao.disponivel, false);

  // Sem comparação: modelo idêntico ao de sempre.
  const normal = buildHistoryCharts({ periodo: janela, janela, completa: serieLonga }, SERIES_MODES.MENSAL);
  assert.equal(normal[0].series.length, 1);
  assert.equal(normal[0].comparacao, null);
  assert.equal(COMPARE_MODE_OPTIONS[0].value, COMPARE_MODES.NENHUM);
});
