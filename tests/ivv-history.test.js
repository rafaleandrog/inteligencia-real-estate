// Definição e montagem dos gráficos do Mercado (issues #81 e #83).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_CHARTS, SEASONALITY_CHART, buildHistoryCharts, buildSeasonality, buildSparkline,
} from '../src/ivv/history.js';
import { CHART_TYPES, CHART_SOURCES } from '../src/ivv/chart-model.js';
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
      assert.ok(Number.isInteger(serie.cat) && serie.cat >= 1 && serie.cat <= 8,
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

test('o ano mais recente recebe o índice mais saliente da paleta', () => {
  const modelo = buildSeasonality([
    { reference_date: '2025-01-01', ivv_pct: 0.04 },
    { reference_date: '2026-01-01', ivv_pct: 0.06 },
  ]);
  assert.equal(modelo.series.find((s) => s.rotulo === '2026').cat, 1);
  assert.equal(modelo.series.find((s) => s.rotulo === '2025').cat, 2);
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
