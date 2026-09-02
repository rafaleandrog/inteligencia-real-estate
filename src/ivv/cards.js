// Cards do Mercado Residencial DF — issue #59.
//
// Funções puras: recebem a saída de `aggregatePeriod` mais a série de meses, devolvem o
// modelo dos cards. Nenhuma decisão de agregação mora aqui — quem soma, tira média ou
// pondera é o motor (issue #57). Este arquivo decide APRESENTAÇÃO: o que aparece
// primeiro, o que a variação significa, e o que fazer quando o dado não existe.

import { METRIC_BY_KEY, METRIC_KEYS, getPlottable } from './metrics.js';
import { monthYearLabel, mesAnterior, mesmoMesAnoAnterior } from './period.js';
import {
  formatNumber, formatM2, formatPriceM2, formatPercent, percentFromDecimal, compactNumber,
} from '../format.js';

/**
 * Os quatro indicadores que ABREM a tela (issue #83).
 *
 * Doze cards do mesmo tamanho não são hierarquia: são doze coisas igualmente importantes,
 * o que na prática é nenhuma. Estes quatro respondem, juntos, "como está o mercado" —
 * quanto custa, quanto vendeu, quão rápido girou e quanto de dinheiro isso moveu — e são
 * os únicos que ganham corpo grande, variação em destaque e sparkline.
 *
 * A ordem continua sendo a pedida pelo dono do repositório: **preço e volume de vendas
 * primeiro**. E continua sendo DADO: mudar a prioridade da tela é editar esta lista, não
 * caçar a ordem dos `append` no DOM.
 */
export const CARD_DESTAQUES = Object.freeze([
  'sale_price_brl_m2', 'sales_units', 'ivv_pct', 'vgv_brl_million',
]);

/**
 * O restante, agrupado pelo que a métrica COMPÕE — não por afinidade de nome.
 *
 * `asking_price_brl_m2` mora em oferta porque é VGO sobre área ofertada: o grupo é
 * literalmente o numerador, o denominador e a razão entre eles. Ler os três juntos explica
 * o preço pedido; lê-los separados obriga quem olha a remontar a conta de cabeça.
 */
export const CARD_GRUPOS = Object.freeze([
  Object.freeze({
    key: 'oferta',
    label: 'Oferta e estoque',
    metricas: Object.freeze([
      'asking_price_brl_m2', 'offers_units', 'offer_area_m2', 'vgo_brl_million',
    ]),
  }),
  Object.freeze({
    key: 'vendas',
    label: 'Vendas e distratos',
    metricas: Object.freeze(['sold_area_m2', 'cancellations_units']),
  }),
  Object.freeze({
    key: 'lancamentos',
    label: 'Lançamentos',
    metricas: Object.freeze(['launches_units', 'vgl_brl_million']),
  }),
]);

/**
 * O que significa a métrica SUBIR — e é isso que dá cor e ícone à variação, nunca o
 * sinal aritmético.
 *
 * Distrato subindo não é bom. Estoque subindo não é bom nem ruim: depende de o mercado
 * estar aquecendo ou esfriando, e a tela não tem como saber. Pintar de verde toda seta
 * para cima transformaria um alerta em elogio, com a mesma aparência de um número certo.
 *
 * O mapa é COMPLETO por construção — há teste exigindo entrada para toda métrica do
 * registro —, então uma métrica nova não herda "subir é bom" por omissão.
 */
export const SENTIMENTS = Object.freeze({
  POSITIVO: 'subir_e_bom',
  NEGATIVO: 'subir_e_ruim',
  NEUTRO: 'neutro',
});

export const METRIC_SENTIMENT = Object.freeze({
  sales_units: SENTIMENTS.POSITIVO,
  sold_area_m2: SENTIMENTS.POSITIVO,
  vgv_brl_million: SENTIMENTS.POSITIVO,
  launches_units: SENTIMENTS.POSITIVO,
  vgl_brl_million: SENTIMENTS.POSITIVO,
  ivv_pct: SENTIMENTS.POSITIVO,
  launches_developments: SENTIMENTS.POSITIVO,

  cancellations_units: SENTIMENTS.NEGATIVO,

  // Preço subindo é bom para quem vende e ruim para quem compra; estoque subindo é
  // oferta farta ou demanda fraca. Esta tela não sabe de que lado está quem lê.
  sale_price_brl_m2: SENTIMENTS.NEUTRO,
  asking_price_brl_m2: SENTIMENTS.NEUTRO,
  offers_units: SENTIMENTS.NEUTRO,
  offer_area_m2: SENTIMENTS.NEUTRO,
  vgo_brl_million: SENTIMENTS.NEUTRO,
});

/** Como uma variação deve ser lida: `bom`, `ruim` ou `neutro`. Zero é sempre neutro. */
export function deltaTone(metricKey, delta) {
  if (delta === null || delta === undefined || !Number.isFinite(delta) || delta === 0) return 'neutro';
  const sentimento = METRIC_SENTIMENT[metricKey] || SENTIMENTS.NEUTRO;
  if (sentimento === SENTIMENTS.NEUTRO) return 'neutro';
  const subiu = delta > 0;
  return (subiu === (sentimento === SENTIMENTS.POSITIVO)) ? 'bom' : 'ruim';
}

/** Valor formatado pela unidade declarada no registro. Ausência devolve `null`. */
export function formatMetricValue(metricKey, value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  // Série derivada (issue #83) tem unidade declarada como qualquer métrica, e é aqui que
  // ela precisa ser conhecida: o gráfico de distratos não pode cair no formato padrão de
  // contagem e mostrar "0" onde o dado diz 12,4%.
  const metric = getPlottable(metricKey);
  switch (metric && metric.unit) {
    case 'brl_m2': return formatPriceM2(value);
    case 'm2': return formatM2(value);
    case 'brl_milhoes': return `R$ ${formatNumber(Math.round(value))} mi`;
    // A escala interna do IVV é decimal (0.057 = 5,7%); a conversão é declarada, não um
    // `* 100` solto (R8.60).
    case 'fracao': return formatPercent(percentFromDecimal(value));
    default: return formatNumber(Math.round(value));
  }
}

/**
 * O mesmo valor, em forma curta, para rótulo de eixo (issue #85).
 *
 * Só a magnitude é compactada; a UNIDADE continua inteira, porque é ela que diz o que o
 * eixo está medindo. `R$ 14 mil/m²` e `509 mil m²` são lidos de relance; `14.404` e
 * `509.218` obrigam a contar casas. Percentual não compacta: já é curto por natureza, e
 * arredondar `6,4%` para `6%` perderia justamente a casa que interessa.
 */
export function formatMetricCompact(metricKey, value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const metric = getPlottable(metricKey);
  switch (metric && metric.unit) {
    case 'brl_m2': return `R$ ${compactNumber(value)}/m²`;
    case 'm2': return `${compactNumber(value)} m²`;
    case 'brl_milhoes': return `R$ ${compactNumber(value * 1e6)}`;
    case 'fracao': return formatPercent(percentFromDecimal(value));
    default: return compactNumber(value);
  }
}

/** Variação percentual formatada com sinal explícito. `+0,0%` nunca vira `0,0%`. */
function formatChange(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  // `*_pct_change` segue a escala decimal do backend: -0.1207 significa -12,07%.
  // Pontos percentuais (`*_pp`) continuam na função separada abaixo.
  const texto = formatPercent(percentFromDecimal(Math.abs(value)));
  return value < 0 ? `−${texto}` : `+${texto}`;
}

/** Variação em pontos percentuais. Grandeza DIFERENTE de variação percentual. */
function formatPoints(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const texto = `${Math.abs(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  })} p.p.`;
  return value < 0 ? `−${texto}` : `+${texto}`;
}

function numberAt(row, key) {
  const value = row ? row[key] : null;
  return Number.isFinite(value) ? value : null;
}

/**
 * As variações de um card, lidas dos campos JÁ VALIDADOS do último mês do período.
 *
 * Nunca recalculadas quando existe campo próprio: `*_mom_pct_change` e `*_yoy_pct_change`
 * são publicados pelo backend, e recalcular por cima trocaria um número que alguém assina
 * por um que a tela inventou (R8.54).
 *
 * O rótulo NOMEIA o mês de referência. "MoM +3,2%" sobre um período de 66 meses é
 * ambíguo de um jeito perigoso: parece variação do período e é variação do último mês.
 *
 * Para o IVV saem DUAS variações, porque `ivv_mom_pp` e `ivv_mom_pct_change` são
 * grandezas diferentes — +1 p.p. e +20% podem descrever o mesmo movimento, e apresentar
 * as duas com o mesmo rótulo faria a tela mentir sobre a magnitude.
 */
export function metricDeltas(metricKey, lastMonth) {
  if (!lastMonth) return [];
  const metric = METRIC_BY_KEY[metricKey];
  const mes = typeof lastMonth.reference_date === 'string'
    ? lastMonth.reference_date.slice(0, 7) : null;
  const deltas = [];

  const push = (label, texto, bruto) => {
    if (texto === null) return;
    deltas.push({ label, value: texto, tone: deltaTone(metricKey, bruto) });
  };

  // O rótulo nomeia o mês comparado. Sem o nome, "vs mês anterior" sob um agregado de 66
  // meses parece variação do período e é variação do último mês (R8.66). Quando a linha
  // não tem data utilizável, o rótulo genérico volta — é vago, mas não é falso.
  const rotuloMoM = mes ? `vs ${monthYearLabel(mesAnterior(mes))}` : 'vs mês anterior';
  const rotuloYoY = mes ? `vs ${monthYearLabel(mesmoMesAnoAnterior(mes))}` : 'vs mesmo mês do ano anterior';

  if (metricKey === 'ivv_pct') {
    push(rotuloMoM, formatPoints(numberAt(lastMonth, 'ivv_mom_pp')), numberAt(lastMonth, 'ivv_mom_pp'));
    push(`${rotuloMoM}, em %`, formatChange(numberAt(lastMonth, 'ivv_mom_pct_change')),
      numberAt(lastMonth, 'ivv_mom_pct_change'));
    push(rotuloYoY, formatPoints(numberAt(lastMonth, 'ivv_yoy_pp')),
      numberAt(lastMonth, 'ivv_yoy_pp'));
  } else {
    push(rotuloMoM, formatChange(numberAt(lastMonth, `${metricKey}_mom_pct_change`)),
      numberAt(lastMonth, `${metricKey}_mom_pct_change`));
    push(rotuloYoY, formatChange(numberAt(lastMonth, `${metricKey}_yoy_pct_change`)),
      numberAt(lastMonth, `${metricKey}_yoy_pct_change`));
  }

  if (metric && metric.ytdColumn) {
    const ytd = numberAt(lastMonth, metric.ytdColumn);
    const texto = formatMetricValue(metricKey, ytd);
    // O acumulado do ano não é variação: é um VALOR, e por isso nunca ganha cor de
    // bom/ruim. Pintá-lo pelo sinal afirmaria uma comparação que ninguém fez.
    if (texto !== null) deltas.push({ label: 'Acumulado do ano', value: texto, tone: 'neutro' });
  }

  return { deltas, mes };
}

/**
 * Um indicador: rótulo, valor, variações e o que dizer quando o valor não existe.
 *
 * Métrica sem valor no período aparece como AUSENTE, com o motivo, nunca como zero:
 * "0 unidades vendidas" e "não publicado" são afirmações diferentes, e a segunda é a
 * verdadeira quando a coluna está vazia (R5.7).
 *
 * Métrica que o motor RECUSA agregar (`launches_developments` entre meses) não vira card
 * silenciosamente vazio: ela carrega a mensagem da recusa.
 */
function cardDe(key, aggregated, lastMonth) {
  const metric = METRIC_BY_KEY[key];
  const result = aggregated && aggregated.values ? aggregated.values[key] : null;
  const recusa = aggregated && aggregated.unsupported ? aggregated.unsupported[key] : null;

  const valor = result ? formatMetricValue(key, result.value) : null;
  const { deltas, mes } = valor === null ? { deltas: [], mes: null } : metricDeltas(key, lastMonth);

  return {
    key,
    label: metric ? metric.label : key,
    value: valor,
    origin: result ? result.origin : null,
    monthsWithData: result ? result.monthsWithData : 0,
    deltas,
    referenceMonth: mes,
    // Uma frase, não um travessão: travessão numa grade de indicadores é indistinguível
    // de um card que não carregou.
    absent: valor !== null ? null
      : (recusa ? recusa.message : 'Sem valor publicado para o período selecionado.'),
  };
}

/**
 * O modelo da tela: destaques primeiro, o resto em grupos (issues #59 e #83).
 *
 * O destaque leva a variação PRINCIPAL separada das demais — no card grande ela ganha
 * corpo, e as outras ficam abaixo, menores. A separação é aqui, e não no renderizador,
 * porque "qual é a variação principal" é decisão de leitura, não de marcação.
 */
export function buildMarketDashboard(aggregated, months) {
  const lastMonth = (months || []).length > 0 ? months[months.length - 1] : null;

  const destaques = CARD_DESTAQUES.map((key) => {
    const card = cardDe(key, aggregated, lastMonth);
    return {
      ...card,
      destaque: true,
      deltaPrincipal: card.deltas[0] || null,
      deltasSecundarios: card.deltas.slice(1),
    };
  });

  return {
    destaques,
    grupos: CARD_GRUPOS.map((grupo) => ({
      key: grupo.key,
      label: grupo.label,
      cards: grupo.metricas.map((key) => cardDe(key, aggregated, lastMonth)),
    })),
    mesReferencia: destaques.find((card) => card.referenceMonth)?.referenceMonth || null,
  };
}

/** Toda métrica exibida na tela, na ordem de leitura. Usado por teste e pelo renderizador. */
export function dashboardMetricKeys() {
  return [...CARD_DESTAQUES, ...CARD_GRUPOS.flatMap((grupo) => grupo.metricas)];
}

/** Toda métrica do registro tem sentimento declarado? Usado por teste. */
export function metricsWithoutSentiment() {
  return METRIC_KEYS.filter((key) => !METRIC_SENTIMENT[key]);
}
