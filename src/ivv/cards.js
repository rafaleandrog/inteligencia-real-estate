// Cards do Mercado Residencial DF — issue #59.
//
// Funções puras: recebem a saída de `aggregatePeriod` mais a série de meses, devolvem o
// modelo dos cards. Nenhuma decisão de agregação mora aqui — quem soma, tira média ou
// pondera é o motor (issue #57). Este arquivo decide APRESENTAÇÃO: o que aparece
// primeiro, o que a variação significa, e o que fazer quando o dado não existe.

import { METRIC_BY_KEY, METRIC_KEYS, getPlottable } from './metrics.js';
import {
  formatNumber, formatM2, formatPriceM2, formatPercent, percentFromDecimal,
} from '../format.js';

/**
 * As três linhas de cards, na ordem de leitura pedida pelo dono do repositório:
 * **preços e volume de vendas primeiro**, ao longo do período inteiro.
 *
 * A ordem é dado, não `if`. Mudar a prioridade da tela é editar esta lista, e não
 * caçar a ordem em que alguém escreveu os `append` no DOM.
 */
export const CARD_ROWS = Object.freeze([
  Object.freeze(['sale_price_brl_m2', 'asking_price_brl_m2', 'sales_units', 'sold_area_m2']),
  Object.freeze(['ivv_pct', 'offers_units', 'launches_units', 'vgv_brl_million']),
  Object.freeze(['vgo_brl_million', 'vgl_brl_million', 'cancellations_units', 'offer_area_m2']),
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

  if (metricKey === 'ivv_pct') {
    push('vs mês anterior', formatPoints(numberAt(lastMonth, 'ivv_mom_pp')), numberAt(lastMonth, 'ivv_mom_pp'));
    push('vs mês anterior, em %', formatChange(numberAt(lastMonth, 'ivv_mom_pct_change')),
      numberAt(lastMonth, 'ivv_mom_pct_change'));
    push('vs mesmo mês do ano anterior', formatPoints(numberAt(lastMonth, 'ivv_yoy_pp')),
      numberAt(lastMonth, 'ivv_yoy_pp'));
  } else {
    push('vs mês anterior', formatChange(numberAt(lastMonth, `${metricKey}_mom_pct_change`)),
      numberAt(lastMonth, `${metricKey}_mom_pct_change`));
    push('vs mesmo mês do ano anterior', formatChange(numberAt(lastMonth, `${metricKey}_yoy_pct_change`)),
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
 * O modelo completo dos cards (issue #59).
 *
 * Métrica sem valor no período aparece como AUSENTE, com o motivo, nunca como zero:
 * "0 unidades vendidas" e "não publicado" são afirmações diferentes, e a segunda é a
 * verdadeira quando a coluna está vazia (R5.7).
 *
 * Métrica que o motor RECUSA agregar (`launches_developments` entre meses) não vira card
 * silenciosamente vazio: ela carrega a mensagem da recusa.
 */
export function buildMarketCards(aggregated, months) {
  const lastMonth = (months || []).length > 0 ? months[months.length - 1] : null;

  return CARD_ROWS.map((row) => row.map((key) => {
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
      // Uma frase, não um travessão: travessão numa grade de doze cards é indistinguível
      // de um card que não carregou.
      absent: valor !== null ? null
        : (recusa ? recusa.message : 'Sem valor publicado para o período selecionado.'),
    };
  }));
}

/** Toda métrica do registro tem sentimento declarado? Usado por teste. */
export function metricsWithoutSentiment() {
  return METRIC_KEYS.filter((key) => !METRIC_SENTIMENT[key]);
}
