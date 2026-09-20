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

import { CHART_TYPES, CHART_SOURCES, DIMENSOES, buildChartModel } from './chart-model.js';
import {
  monthlySeries, derivedSeries, runningSeries, prepareRows, aggregateMetric, VALUE_ORIGINS,
} from './aggregate.js';
import { getPlottable, METRIC_KINDS } from './metrics.js';
import { formatMetricValue, formatMetricCompact } from './cards.js';
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
    acumulavel: true,
    titulo: 'Velocidade de vendas (IVV)',
    tituloAcumulado: 'Velocidade de vendas no período (IVV)',
    pergunta: 'O mercado está mais rápido?',
    tipo: CHART_TYPES.AREA,
    fonte: CHART_SOURCES.JANELA,
    baseZero: true,
    series: Object.freeze([{ key: 'ivv_pct', cat: 1 }]),
  },
  {
    key: 'precos',
    acumulavel: true,
    titulo: 'Preço pedido × preço de venda',
    tituloAcumulado: 'Preço pedido × preço de venda — ponderados no período',
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
    acumulavel: true,
    titulo: 'Vendas e lançamentos por mês',
    tituloAcumulado: 'Vendas e lançamentos acumulados no período',
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
    acumulavel: true,
    titulo: 'Unidades em oferta',
    tituloAcumulado: 'Unidades em oferta — média do período',
    pergunta: 'Quanto sobra na prateleira?',
    tipo: CHART_TYPES.AREA,
    fonte: CHART_SOURCES.JANELA,
    baseZero: true,
    series: Object.freeze([{ key: 'offers_units', cat: 4 }]),
  },
  {
    key: 'vgv',
    acumulavel: true,
    titulo: 'VGV por mês',
    tituloAcumulado: 'VGV acumulado no período',
    pergunta: 'Quanto de dinheiro girou?',
    tipo: CHART_TYPES.COLUNAS,
    fonte: CHART_SOURCES.JANELA,
    baseZero: true,
    series: Object.freeze([{ key: 'vgv_brl_million', cat: 5 }]),
  },
  {
    key: 'distratos',
    // Razão publicada por mês, sem natureza de agregação declarada — o mesmo motivo pelo
    // qual ela não vira card de período. Acumulá-la seria média de razões, que é o erro que
    // a política de agregação existe para impedir; então em modo acumulado ela diz isso em
    // vez de inventar uma curva.
    acumulavel: false,
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
  acumulavel: true,
  titulo: 'IVV por mês do ano',
  tituloAcumulado: 'IVV acumulado até cada mês',
  pergunta: 'Isto é tendência ou é a época do ano?',
  tipo: CHART_TYPES.LINHA,
  fonte: CHART_SOURCES.COMPLETA,
  baseZero: true,
  dimensao: DIMENSOES.ORDINAL,
  metrica: 'ivv_pct',
  /**
   * Quantos anos a sazonalidade compara — decisão de produto, e ao mesmo tempo o teto da
   * rampa ordinal do CSS (`--ano-1..4`).
   *
   * Pedir mais anos do que a rampa tem degraus não dá erro nenhum: sairia `ano-5`, que não
   * existe como regra, `--serie-cor` ficaria indefinido e a quinta série sumiria da tela em
   * silêncio — a família de falha da R8.70. Por isso este número é o clamp, e
   * `tests/ui-tokens.test.js` conta as regras `.ano-N` do CSS e cobra a igualdade com ele,
   * por contagem exata: degrau a mais e degrau a menos quebram.
   */
  anos: 4,
});

/**
 * Tamanho da paleta CATEGÓRICA (`--cat-1..8`). Exportado porque o teste que confere o
 * intervalo dos índices digitava o 8 à mão, e contagem digitada envelhece calada (R8.72).
 */
export const CAT_MAXIMA = 8;

/**
 * Os dois jeitos de olhar a mesma série (issue #85).
 *
 * `MENSAL` responde "como foi o mês?"; `ACUMULADO` responde "como está o ano?". São
 * perguntas diferentes e números de ordem de grandeza diferente — por isso o modo TROCA a
 * série em vez de sobrepor as duas: um segundo eixo Y para acomodar as duas escalas
 * inventaria uma correlação que o dado não tem.
 */
export const SERIES_MODES = Object.freeze({ MENSAL: 'mensal', ACUMULADO: 'acumulado' });

/**
 * Comparação temporal (issue #127, Plano 01 §8): a mesma série num segundo recorte,
 * sobreposta NO MESMO EIXO — nunca num segundo eixo Y, que inventaria uma escala. A série
 * comparada é tracejada e alinhada por POSIÇÃO (1º mês contra 1º mês), que é o que
 * "período anterior" e "mesmo período do ano anterior" significam.
 */
export const COMPARE_MODES = Object.freeze({
  NENHUM: 'nenhum',
  PERIODO_ANTERIOR: 'periodo_anterior',
  ANO_ANTERIOR: 'mesmo_periodo_ano_anterior',
});
export const COMPARE_MODE_OPTIONS = Object.freeze([
  Object.freeze({ value: COMPARE_MODES.NENHUM, chip: 'Nenhum', label: 'Sem comparação' }),
  Object.freeze({ value: COMPARE_MODES.PERIODO_ANTERIOR, chip: 'Período anterior', label: 'Comparar com o período imediatamente anterior, de mesma duração' }),
  Object.freeze({ value: COMPARE_MODES.ANO_ANTERIOR, chip: 'Ano anterior', label: 'Comparar com o mesmo período do ano anterior' }),
]);
/** Sufixo da chave da série comparada — é como o renderizador a reconhece para tracejar. */
export const COMPARE_SUFFIX = '::comparacao';

/** `2026-03` + (−12) = `2025-03`. `null` para mês ilegível. */
export function shiftMonth(mesISO, delta) {
  if (!/^\d{4}-\d{2}$/.test(mesISO || '')) return null;
  const [ano, mes] = mesISO.split('-').map(Number);
  const total = ano * 12 + (mes - 1) + delta;
  const novoAno = Math.floor(total / 12);
  const novoMes = (total % 12) + 1;
  return `${novoAno}-${String(novoMes).padStart(2, '0')}`;
}

function monthsBetween(start, end) {
  const [a1, m1] = start.split('-').map(Number);
  const [a2, m2] = end.split('-').map(Number);
  return (a2 * 12 + m2) - (a1 * 12 + m1) + 1;
}

/**
 * As linhas do recorte de comparação, dado o recorte desenhado (`start`/`end`, `YYYY-MM`).
 *
 * @returns {{ rows: object[], start: string|null, end: string|null, mode: string }} — janela
 *   vazia quando não há mês publicado nela; o gráfico então diz que não há comparação.
 */
export function comparisonRows(allRows, { start, end } = {}, mode = COMPARE_MODES.NENHUM) {
  const vazio = { rows: [], start: null, end: null, mode };
  if (mode === COMPARE_MODES.NENHUM || !start || !end || start > end) return vazio;
  let alvoInicio;
  let alvoFim;
  if (mode === COMPARE_MODES.ANO_ANTERIOR) {
    alvoInicio = shiftMonth(start, -12);
    alvoFim = shiftMonth(end, -12);
  } else if (mode === COMPARE_MODES.PERIODO_ANTERIOR) {
    const n = monthsBetween(start, end);
    alvoFim = shiftMonth(start, -1);
    alvoInicio = shiftMonth(start, -n);
  } else {
    return vazio;
  }
  if (!alvoInicio || !alvoFim) return vazio;
  const prepared = prepareRows(allRows).rows.filter((item) => item.month >= alvoInicio && item.month <= alvoFim);
  return { rows: prepared.map((item) => item.row), start: alvoInicio, end: alvoFim, mode };
}

function rotuloDaComparacao(comparacao) {
  const modo = COMPARE_MODE_OPTIONS.find((o) => o.value === comparacao.mode);
  const intervalo = comparacao.start && comparacao.end
    ? (comparacao.start === comparacao.end
      ? monthYearLabel(comparacao.start)
      : `${monthYearLabel(comparacao.start)}–${monthYearLabel(comparacao.end)}`)
    : '';
  return `${modo ? modo.chip.toLowerCase() : 'comparação'}${intervalo ? ` (${intervalo})` : ''}`;
}

/**
 * Pontos da série comparada alinhados POR MÊS às categorias do recorte desenhado: cada mês
 * atual recebe o valor do mês correspondente na comparação (−12 no ano anterior; −N no
 * período anterior de N meses). Mês sem par vira `null`.
 *
 * Alinhar por posição parecia equivalente e não é: um mês ausente em qualquer dos dois
 * recortes deslocava todos os pontos seguintes, e mar/2025 aparecia sob fev/2026 com o
 * rótulo garantindo "mesmo período do ano anterior" (R8.92).
 */
function alinharPorMes(pontosAtuais, pontosComparados, comparacao) {
  const delta = comparacao.mode === COMPARE_MODES.ANO_ANTERIOR
    ? -12
    : -monthsBetween(comparacao.start, comparacao.end);
  const porMes = new Map(pontosComparados.map((p) => [p.categoria, p.valor]));
  return pontosAtuais.map(({ categoria }) => {
    const par = shiftMonth(categoria, delta);
    return { categoria, valor: par !== null && porMes.has(par) ? porMes.get(par) : null };
  });
}

const NOTA_MENSAL = 'Valores do mês.';
const NOTA_NAO_ACUMULA = 'Sempre mensal: razão publicada por mês não acumula.';

/**
 * O que "acumulado no período" significa depende da NATUREZA da métrica, e a nota diz qual é.
 *
 * Chamar tudo de "acumulado" seria mentira útil: estoque não se acumula — somar doze
 * fotografias devolve doze vezes o estoque real —, e preço é razão, não soma. Quem faz a
 * conta certa é o motor de agregação; esta tabela só traduz a mesma decisão para o leitor.
 */
const NOTA_ACUMULADO = Object.freeze({
  [METRIC_KINDS.FLUXO]: 'Soma desde o início do período mostrado.',
  [METRIC_KINDS.ESTOQUE]: 'Média desde o início do período mostrado.',
  [METRIC_KINDS.PRECO]: 'Razão ponderada desde o início do período mostrado.',
  [METRIC_KINDS.TAXA]: 'Razão ponderada desde o início do período mostrado.',
});

function notaDoModo(chave, acumulado) {
  if (!acumulado) return NOTA_MENSAL;
  return NOTA_ACUMULADO[getPlottable(chave)?.kind] || NOTA_ACUMULADO[METRIC_KINDS.FLUXO];
}

function rotuloDe(key) {
  return getPlottable(key)?.label || key;
}

function pontosDe(rows, { key, derivada }, acumulado = false, options = {}) {
  let serie;
  if (derivada) serie = derivedSeries(rows, key);
  else if (acumulado) serie = runningSeries(rows, key, options);
  else serie = monthlySeries(rows, key);
  return serie.map((ponto) => ({ categoria: ponto.month, valor: ponto.value }));
}

/**
 * O que o canto do card mostra: o valor da série principal NO RECORTE QUE O GRÁFICO DESENHA,
 * com o nome da operação que o produziu (issue #85).
 *
 * "R$ 8.124 mi · soma do período" responde de relance a pergunta que o desenho responde
 * devagar. E dizer a operação não é preciosismo: `soma` e `média` sobre a mesma série de
 * doze meses dão números que diferem por doze, e sem o rótulo os dois parecem igualmente
 * plausíveis — que é exatamente o erro caro que o motor de agregação existe para impedir.
 */
const ROTULO_DA_ORIGEM = Object.freeze({
  [VALUE_ORIGINS.SOMA]: 'soma do período',
  [VALUE_ORIGINS.MEDIA]: 'média do período',
  [VALUE_ORIGINS.RAZAO_PONDERADA]: 'média ponderada',
  [VALUE_ORIGINS.YTD_BACKEND]: 'acumulado no ano',
  [VALUE_ORIGINS.PUBLICADO]: 'no mês',
});

function resumoDe(definicao, rows, acumulado) {
  // No modo acumulado o último ponto da curva JÁ é esse número, e ele sai rotulado no
  // gráfico: repetir no canto é o mesmo ruído que a linha "Acumulado do ano" era no card.
  if (acumulado) return null;
  const principal = definicao.series[0];
  // Série derivada não tem natureza de agregação declarada — de propósito. Um resumo aqui
  // teria de inventar uma operação para ela.
  if (principal.derivada || rows.length === 0) return null;
  try {
    const { value, origin } = aggregateMetric(rows, principal.key);
    const texto = formatMetricValue(principal.key, value);
    if (texto === null) return null;
    return { valor: texto, rotulo: ROTULO_DA_ORIGEM[origin] || null };
  } catch {
    // Métrica que o motor recusa agregar não ganha resumo — e não derruba o gráfico.
    return null;
  }
}

function modeloDe(definicao, rows, modo, comparacao = null) {
  const referencia = definicao.series[0].key;
  // Definição que não acumula ignora o modo — e DIZ que ignora, em vez de mostrar um
  // acumulado inventado ou uma curva mensal calada num painel que anuncia acumulado.
  const acumulado = modo === SERIES_MODES.ACUMULADO && definicao.acumulavel === true;
  const nota = modo === SERIES_MODES.ACUMULADO && !definicao.acumulavel
    ? NOTA_NAO_ACUMULA
    : notaDoModo(referencia, acumulado);
  const modelo = buildChartModel(
    {
      key: definicao.key,
      // Título que contradiz o desenho é pior que título genérico: "por mês" sobre uma
      // curva acumulada faz duvidar do número, não do rótulo.
      titulo: (acumulado && definicao.tituloAcumulado) || definicao.titulo,
      tipo: definicao.tipo,
      baseZero: definicao.baseZero,
      formatar: (valor) => formatMetricValue(referencia, valor),
      formatarCurto: (valor) => formatMetricCompact(referencia, valor),
      rotuloCategoria: monthYearLabel,
    },
    definicao.series.flatMap((serie) => {
      const atual = {
        chave: serie.key,
        rotulo: rotuloDe(serie.key),
        cat: serie.cat,
        pontos: pontosDe(rows, serie, acumulado, { resetAtYearBoundary: false }),
      };
      // Série comparada: mesma métrica, mesmo índice de cor, chave com sufixo — o CSS a
      // traceja pela classe que o renderizador deriva do sufixo.
      if (!comparacao || comparacao.mode === COMPARE_MODES.NENHUM || comparacao.rows.length === 0) return [atual];
      const comparados = pontosDe(comparacao.rows, serie, acumulado, { resetAtYearBoundary: false });
      return [atual, {
        chave: `${serie.key}${COMPARE_SUFFIX}`,
        rotulo: `${rotuloDe(serie.key)} · ${rotuloDaComparacao(comparacao)}`,
        cat: serie.cat,
        pontos: alinharPorMes(atual.pontos, comparados, comparacao),
      }];
    }),
  );
  for (const serie of modelo.series) serie.comparacao = serie.chave.endsWith(COMPARE_SUFFIX);
  const semComparacao = comparacao && comparacao.mode !== COMPARE_MODES.NENHUM && comparacao.rows.length === 0;
  // A pergunta viaja com o modelo: é ela que o card do gráfico mostra abaixo do título, e
  // é o que transforma "VGV por mês" em algo que se sabe por que está olhando.
  return {
    ...modelo,
    pergunta: definicao.pergunta,
    resumo: resumoDe(definicao, rows, acumulado),
    modo: acumulado ? SERIES_MODES.ACUMULADO : SERIES_MODES.MENSAL,
    notaModo: semComparacao
      ? `${nota} Sem mês publicado no recorte de comparação — nada foi sobreposto.`
      : nota,
    comparacao: comparacao && comparacao.mode !== COMPARE_MODES.NENHUM
      ? { mode: comparacao.mode, start: comparacao.start, end: comparacao.end, disponivel: comparacao.rows.length > 0 }
      : null,
  };
}

/**
 * Os modelos dos gráficos do histórico.
 *
 * @param fontes `{ periodo, janela, completa }` — os três recortes de linhas. Cada
 *   definição diz de qual se serve; quem monta os recortes é a camada de tela.
 */
export function buildHistoryCharts(fontes = {}, modo = SERIES_MODES.MENSAL, opcoes = {}) {
  // A comparação só vale para quem lê a janela do filtro: a sazonalidade já compara anos.
  const comparacao = opcoes.comparacao || null;
  return HISTORY_CHARTS.map((definicao) => modeloDe(
    definicao, fontes[definicao.fonte] || [], modo,
    definicao.fonte === CHART_SOURCES.JANELA ? comparacao : null,
  ));
}

/**
 * A sazonalidade: eixo de janeiro a dezembro, uma série por ano.
 *
 * É o único gráfico do repositório com dimensão ORDINAL. Ano não é identidade, é ordem:
 * 2023 vem antes de 2024, e a cor pode carregar essa ordem em vez de desperdiçá-la em
 * quatro matizes sem relação (R8.76).
 *
 * O ÍNDICE VARRE A RAMPA INTEIRA, e não os degraus finais. O ano corrente fica sempre no
 * último degrau — o mais escuro no tema claro, o mais claro no escuro, porque a rampa
 * inverte com o tema; é ele que a pessoa veio ver e é ele que precisa saltar. Os demais se
 * distribuem até o primeiro degrau, em vez de se amontoarem ao lado do corrente:
 *
 *     1 ano  → [4]          2 anos → [1, 4]
 *     3 anos → [1, 2, 4]    4 anos → [1, 2, 3, 4]
 *
 * A diferença importa justamente onde mais se olha. Com dois anos, encostar no corrente
 * daria os degraus 3 e 4, que têm 1,7:1 de contraste entre si — duas linhas quase idênticas
 * —, contra 3,9:1 usando as duas pontas. A rampa foi dimensionada com o passo MÍNIMO para
 * quatro séries; gastá-lo numa janela de duas é jogar fora dois terços dela.
 *
 * A rampa ordena os anos MOSTRADOS, não mede distância no tempo: se um ano faltar no meio
 * da série, os vizinhos ficam em degraus adjacentes. É o comportamento aceito — a
 * alternativa, indexar por distância até o ano corrente, precisa de clamp e o clamp põe
 * dois anos no MESMO degrau, o que faz a cor mentir em vez de apenas não informar.
 *
 * Anos incompletos (o corrente, ou o primeiro da série) deixam BURACO nos meses que ainda
 * não existem, nunca zero: zero em dezembro diria que o mercado parou.
 */
function degrauDoAno(indice, total) {
  // Com um ano só não há intervalo para distribuir: ele é o corrente, e vai para o fim.
  if (total <= 1) return SEASONALITY_CHART.anos;
  const doFim = total - 1 - indice;
  return SEASONALITY_CHART.anos - Math.round((doFim * (SEASONALITY_CHART.anos - 1)) / (total - 1));
}

export function buildSeasonality(rows, opcoes = {}) {
  // `Math.max(1, …)` porque um valor negativo é truthy e passaria pelo `|| 1`: `slice(-anos)`
  // com `anos = -3` vira `slice(3)`, que DESCARTA os três mais antigos em vez de manter os
  // três mais recentes — e, pior, deixa `recentes.length` imprevisível para a conta do índice.
  const anos = Math.max(1, Math.min(Number(opcoes.anos ?? SEASONALITY_CHART.anos) || 1,
    SEASONALITY_CHART.anos));
  const metrica = SEASONALITY_CHART.metrica;
  const acumulado = opcoes.modo === SERIES_MODES.ACUMULADO;
  const porAno = new Map();
  for (const ponto of (acumulado ? runningSeries(rows, metrica) : monthlySeries(rows, metrica))) {
    const [ano, mes] = ponto.month.split('-');
    if (!porAno.has(ano)) porAno.set(ano, new Map());
    porAno.get(ano).set(mes, ponto.value);
  }

  const recentes = [...porAno.keys()].sort().slice(-anos);
  const meses = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

  const modelo = buildChartModel(
    {
      key: SEASONALITY_CHART.key,
      titulo: acumulado ? SEASONALITY_CHART.tituloAcumulado : SEASONALITY_CHART.titulo,
      tipo: SEASONALITY_CHART.tipo,
      dimensao: SEASONALITY_CHART.dimensao,
      baseZero: SEASONALITY_CHART.baseZero,
      formatar: (valor) => formatMetricValue(metrica, valor),
      formatarCurto: (valor) => formatMetricCompact(metrica, valor),
      rotuloCategoria: (mes) => monthShortLabel(Number(mes)),
    },
    recentes.map((ano, indice) => ({
      chave: `${metrica}-${ano}`,
      rotulo: ano,
      cat: degrauDoAno(indice, recentes.length),
      pontos: meses.map((mes) => ({
        categoria: mes,
        valor: porAno.get(ano).has(mes) ? porAno.get(ano).get(mes) : null,
      })),
    })),
  );
  return {
    ...modelo,
    pergunta: SEASONALITY_CHART.pergunta,
    modo: acumulado ? SERIES_MODES.ACUMULADO : SERIES_MODES.MENSAL,
    notaModo: acumulado
      ? 'Cada ano no ano até o mês — é a corrida de um ano contra o outro.'
      : NOTA_MENSAL,
  };
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
      formatarCurto: (valor) => formatMetricCompact(metricKey, valor),
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
