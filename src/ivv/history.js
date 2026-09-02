// Gráficos históricos do Mercado Residencial DF — definição e montagem.
//
// Aqui mora só a DECLARAÇÃO: que gráficos existem, que pergunta cada um responde, de que
// recorte de meses ele lê e que índice de paleta cada série usa. O modelo é montado por
// `chart-model.js` e a geometria por `chart-layout.js`; nenhuma cor, nenhum pixel e
// nenhum acesso ao estado da aplicação passam por este arquivo.
//
// Antes da issue #83 este módulo cravava `#55d99a`, `#8eb8ff`, `#d6a449` e `#9f7aea`:
// quatro cores fixas, iguais nos dois temas, decididas dentro do módulo PURO — o lugar
// onde mora significado — e fora do alcance de qualquer teste. Agora a série declara
// `cat: 3` e quem resolve o índice em cor é o CSS.

import { CHART_TYPES, CHART_SOURCES, buildChartModel } from './chart-model.js';
import { monthlySeries, derivedSeries, prepareRows } from './aggregate.js';
import { getPlottable } from './metrics.js';
import { formatMetricValue } from './cards.js';
import { monthYearLabel, monthShortLabel } from './period.js';

/**
 * Os seis gráficos do histórico, cada um respondendo uma pergunta que alguém faz.
 *
 * A lista é curta de propósito. VGL, VGO, área vendida e área ofertada continuam como
 * indicador com variação: promovê-las a gráfico recriaria, em outra forma, o mesmo muro
 * de doze objetos iguais que este redesign existe para desfazer.
 */
export const HISTORY_CHARTS = Object.freeze([
  {
    key: 'ivv',
    titulo: 'Velocidade de vendas (IVV)',
    pergunta: 'O mercado está mais rápido?',
    tipo: CHART_TYPES.AREA,
    fonte: CHART_SOURCES.JANELA,
    baseZero: true,
    series: Object.freeze([{ key: 'ivv_pct', cat: 1 }]),
  },
  {
    key: 'precos',
    titulo: 'Preço pedido × preço de venda',
    pergunta: 'Quanto se pede e quanto se realiza?',
    tipo: CHART_TYPES.LINHA,
    fonte: CHART_SOURCES.JANELA,
    // Preço por m² não começa no zero: a variação que interessa vive numa faixa estreita
    // e um eixo desde zero achataria a série numa reta.
    baseZero: false,
    series: Object.freeze([
      { key: 'sale_price_brl_m2', cat: 1 },
      { key: 'asking_price_brl_m2', cat: 2 },
    ]),
  },
  {
    key: 'atividade',
    titulo: 'Vendas e lançamentos por mês',
    pergunta: 'Entra ou sai mais unidade do mercado?',
    // Contagem de evento do mês é coluna, não linha: a linha sugere continuidade entre
    // dois meses, e não há nada acontecendo entre eles.
    tipo: CHART_TYPES.COLUNAS,
    fonte: CHART_SOURCES.JANELA,
    baseZero: true,
    series: Object.freeze([
      { key: 'sales_units', cat: 1 },
      { key: 'launches_units', cat: 3 },
    ]),
  },
  {
    key: 'estoque',
    titulo: 'Unidades em oferta',
    pergunta: 'Quanto sobra na prateleira?',
    tipo: CHART_TYPES.AREA,
    fonte: CHART_SOURCES.JANELA,
    baseZero: true,
    series: Object.freeze([{ key: 'offers_units', cat: 4 }]),
  },
  {
    key: 'vgv',
    titulo: 'VGV por mês',
    pergunta: 'Quanto de dinheiro girou?',
    tipo: CHART_TYPES.COLUNAS,
    fonte: CHART_SOURCES.JANELA,
    baseZero: true,
    series: Object.freeze([{ key: 'vgv_brl_million', cat: 5 }]),
  },
  {
    key: 'distratos',
    titulo: 'Distratos sobre vendas',
    pergunta: 'Quanto do que vendeu voltou?',
    tipo: CHART_TYPES.LINHA,
    fonte: CHART_SOURCES.JANELA,
    baseZero: true,
    series: Object.freeze([{ key: 'cancellations_to_sales_pct', cat: 6, derivada: true }]),
  },
]);

/**
 * A sazonalidade é o único gráfico que lê FORA da janela do filtro: ele compara o mesmo
 * mês em anos diferentes, e para isso precisa de anos inteiros. Por isso declara a fonte
 * `completa` — e por isso a fonte é declaração, não busca: se este módulo fosse atrás das
 * linhas por conta própria, precisaria conhecer o estado da aplicação.
 */
export const SEASONALITY_CHART = Object.freeze({
  key: 'sazonalidade',
  titulo: 'IVV por mês do ano',
  pergunta: 'Isto é tendência ou é a época do ano?',
  tipo: CHART_TYPES.LINHA,
  fonte: CHART_SOURCES.COMPLETA,
  baseZero: true,
  metrica: 'ivv_pct',
  anos: 4,
});

/** Quantidade de anos comparados na sazonalidade — a paleta tem oito índices, e sobra. */
const CAT_MAXIMA = 8;

function rotuloDe(key) {
  return getPlottable(key)?.label || key;
}

function pontosDe(rows, { key, derivada }) {
  const serie = derivada ? derivedSeries(rows, key) : monthlySeries(rows, key);
  return serie.map((ponto) => ({ categoria: ponto.month, valor: ponto.value }));
}

function modeloDe(definicao, rows) {
  const referencia = definicao.series[0].key;
  const modelo = buildChartModel(
    {
      key: definicao.key,
      titulo: definicao.titulo,
      tipo: definicao.tipo,
      baseZero: definicao.baseZero,
      formatar: (valor) => formatMetricValue(referencia, valor),
      rotuloCategoria: monthYearLabel,
    },
    definicao.series.map((serie) => ({
      chave: serie.key,
      rotulo: rotuloDe(serie.key),
      cat: serie.cat,
      pontos: pontosDe(rows, serie),
    })),
  );
  // A pergunta viaja com o modelo: é ela que o card do gráfico mostra abaixo do título, e
  // é o que transforma "VGV por mês" em algo que se sabe por que está olhando.
  return { ...modelo, pergunta: definicao.pergunta };
}

/**
 * Os modelos dos gráficos do histórico.
 *
 * @param fontes `{ periodo, janela, completa }` — os três recortes de linhas. Cada
 *   definição diz de qual se serve; quem monta os recortes é a camada de tela.
 */
export function buildHistoryCharts(fontes = {}) {
  return HISTORY_CHARTS.map((definicao) => modeloDe(definicao, fontes[definicao.fonte] || []));
}

/**
 * A sazonalidade: eixo de janeiro a dezembro, uma série por ano.
 *
 * O ano mais recente recebe o índice 1 da paleta — é a série que a pessoa veio ver, e o
 * índice 1 é o mais saliente. Anos incompletos (o corrente, ou o primeiro da série)
 * deixam BURACO nos meses que ainda não existem, nunca zero: zero em dezembro diria que
 * o mercado parou.
 */
export function buildSeasonality(rows, opcoes = {}) {
  const anos = Math.min(Number(opcoes.anos ?? SEASONALITY_CHART.anos) || 1, CAT_MAXIMA);
  const metrica = SEASONALITY_CHART.metrica;
  const porAno = new Map();
  for (const ponto of monthlySeries(rows, metrica)) {
    const [ano, mes] = ponto.month.split('-');
    if (!porAno.has(ano)) porAno.set(ano, new Map());
    porAno.get(ano).set(mes, ponto.value);
  }

  const recentes = [...porAno.keys()].sort().slice(-anos);
  const meses = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

  const modelo = buildChartModel(
    {
      key: SEASONALITY_CHART.key,
      titulo: SEASONALITY_CHART.titulo,
      tipo: SEASONALITY_CHART.tipo,
      baseZero: SEASONALITY_CHART.baseZero,
      formatar: (valor) => formatMetricValue(metrica, valor),
      rotuloCategoria: (mes) => monthShortLabel(Number(mes)),
    },
    recentes.map((ano, indice) => ({
      chave: `${metrica}-${ano}`,
      rotulo: ano,
      cat: recentes.length - indice,
      pontos: meses.map((mes) => ({
        categoria: mes,
        valor: porAno.get(ano).has(mes) ? porAno.get(ano).get(mes) : null,
      })),
    })),
  );
  return { ...modelo, pergunta: SEASONALITY_CHART.pergunta };
}

/**
 * Sparkline de um indicador em destaque: uma série, sem eixo, sem rótulo, sem legenda.
 *
 * Ele não substitui o gráfico — diz apenas a FORMA do movimento ao lado do número, que é
 * o que falta a um número sozinho. O valor exato continua no card e nos gráficos.
 */
export function buildSparkline(rows, metricKey) {
  const derivada = !getPlottable(metricKey)?.kind;
  return buildChartModel(
    {
      key: `spark-${metricKey}`,
      titulo: rotuloDe(metricKey),
      tipo: CHART_TYPES.LINHA,
      // Sem eixo, o piso em zero só achataria a forma — e forma é a única coisa que um
      // sparkline comunica.
      baseZero: false,
      formatar: (valor) => formatMetricValue(metricKey, valor),
      rotuloCategoria: monthYearLabel,
    },
    [{
      chave: metricKey,
      rotulo: rotuloDe(metricKey),
      cat: 1,
      pontos: pontosDe(rows, { key: metricKey, derivada }),
    }],
  );
}

/** Meses distintos presentes nas linhas — usado para dizer se há histórico para desenhar. */
export function historyMonths(rows) {
  return prepareRows(rows).rows.map((item) => item.month);
}
