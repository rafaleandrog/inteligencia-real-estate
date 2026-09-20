// Indicadores DERIVADOS do Mercado Residencial DF — módulo puro (issue #125, Plano 01 §7).
//
// Tudo aqui é razão ou diferença entre métricas já agregadas pelo motor (`aggregatePeriod`)
// ou entre colunas mensais da série. Nenhuma decisão de agregação mora aqui: quem soma o
// fluxo, tira a média do estoque ou pondera o preço é `src/ivv/aggregate.js`. Este arquivo
// só combina o que saiu de lá, e devolve `null` — nunca `Infinity`, nunca `NaN` — quando o
// denominador é zero ou o dado não foi publicado (R5.7).
//
// Cada fórmula fica escrita ao lado do resultado (`formula`) para a tela poder mostrá-la:
// metodologia transparente é requisito, não enfeite (Plano 01 §1.6).

import { formatPercent, percentFromDecimal, formatBRLCompact, formatM2 } from '../format.js';

const MILHAO = 1_000_000;

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** `numerador / denominador`, ou `null` quando qualquer um falta ou o denominador é zero. */
export function safeRatio(numerator, denominator) {
  const n = num(numerator);
  const d = num(denominator);
  if (n === null || d === null || d === 0) return null;
  return n / d;
}

/** Gap pedido × realizado: `(pedido − venda) / pedido`. Fração decimal (0,08 = 8%). */
export function askingSaleGap(askingPriceM2, salePriceM2) {
  const asking = num(askingPriceM2);
  const sale = num(salePriceM2);
  if (asking === null || sale === null || asking === 0) return null;
  return (asking - sale) / asking;
}

/** Vendas líquidas: `vendas − distratos`. `null` se qualquer um dos dois não foi publicado. */
export function netSales(salesUnits, cancellationsUnits) {
  const sales = num(salesUnits);
  const cancellations = num(cancellationsUnits);
  if (sales === null || cancellations === null) return null;
  return sales - cancellations;
}

/** Reposição da oferta: `lançamentos / vendas`. Acima de 1, lançou-se mais do que se vendeu. */
export function replacementRatio(launchesUnits, salesUnits) {
  return safeRatio(launchesUnits, salesUnits);
}

/** Ticket médio vendido: `VGV (R$ mi) × 1e6 / vendas`. */
export function avgSaleTicket(vgvMillion, salesUnits) {
  const vgv = num(vgvMillion);
  return vgv === null ? null : safeRatio(vgv * MILHAO, salesUnits);
}

/** Ticket médio lançado: `VGL (R$ mi) × 1e6 / lançamentos`. */
export function avgLaunchTicket(vglMillion, launchesUnits) {
  const vgl = num(vglMillion);
  return vgl === null ? null : safeRatio(vgl * MILHAO, launchesUnits);
}

/** Área média vendida: `área vendida / vendas`. */
export function avgSoldArea(soldAreaM2, salesUnits) {
  return safeRatio(soldAreaM2, salesUnits);
}

/** Área média ofertada: `área ofertada / ofertas`. */
export function avgOfferArea(offerAreaM2, offersUnits) {
  return safeRatio(offerAreaM2, offersUnits);
}

/** Distrato sobre venda: `distratos / vendas`. Fração decimal. */
export function cancellationsToSales(cancellationsUnits, salesUnits) {
  return safeRatio(cancellationsUnits, salesUnits);
}

/**
 * Meses de oferta: `média mensal de ofertas / média mensal de vendas`, sobre os meses da
 * série que têm os DOIS valores. Oferta é ESTOQUE (nunca se soma entre meses); vendas é
 * FLUXO — a média mensal dos dois é o que torna a razão uma duração.
 *
 * @returns {{ value: number|null, monthsUsed: number }}
 */
export function monthsOfSupply(rows) {
  const usable = (Array.isArray(rows) ? rows : []).filter((row) => row && typeof row === 'object'
    && num(row.offers_units) !== null && num(row.sales_units) !== null);
  if (usable.length === 0) return { value: null, monthsUsed: 0 };
  const avgOffers = usable.reduce((acc, row) => acc + row.offers_units, 0) / usable.length;
  const avgSales = usable.reduce((acc, row) => acc + row.sales_units, 0) / usable.length;
  return { value: safeRatio(avgOffers, avgSales), monthsUsed: usable.length };
}

function aggregatedValue(aggregated, key) {
  const entry = aggregated && aggregated.values ? aggregated.values[key] : null;
  return entry ? num(entry.value) : null;
}

function formatMonths(value) {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} meses`;
}

function formatRatio(value) {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
}

/**
 * A faixa de micro-indicadores da tela do Mercado (Plano 01 §7.9), na ordem de leitura:
 * gap pedido/venda · meses de oferta · reposição · ticket médio vendido · área média vendida ·
 * distrato/venda. Cada item traz `value` formatado (ou `null`), o número cru em `raw`, a
 * fórmula em texto e a frase de ausência — nunca zero no lugar do que não foi publicado.
 */
export function buildMicroKpis(aggregated, rows) {
  const asking = aggregatedValue(aggregated, 'asking_price_brl_m2');
  const sale = aggregatedValue(aggregated, 'sale_price_brl_m2');
  const sales = aggregatedValue(aggregated, 'sales_units');
  const launches = aggregatedValue(aggregated, 'launches_units');
  const cancellations = aggregatedValue(aggregated, 'cancellations_units');
  const vgv = aggregatedValue(aggregated, 'vgv_brl_million');
  const soldArea = aggregatedValue(aggregated, 'sold_area_m2');
  const supply = monthsOfSupply(rows);

  const items = [
    {
      key: 'asking_sale_gap', label: 'Gap pedido/venda',
      raw: askingSaleGap(asking, sale),
      format: (v) => formatPercent(percentFromDecimal(v)),
      formula: '(preço pedido/m² − preço de venda/m²) ÷ preço pedido/m²',
      absent: 'Sem preço pedido ou de venda publicado no período.',
    },
    {
      key: 'months_of_supply', label: 'Meses de oferta',
      raw: supply.value,
      format: formatMonths,
      formula: `média mensal de ofertas ÷ média mensal de vendas (${supply.monthsUsed} mês(es) com os dois valores)`,
      absent: 'Sem mês com oferta e vendas publicadas ao mesmo tempo.',
    },
    {
      key: 'replacement_ratio', label: 'Reposição da oferta',
      raw: replacementRatio(launches, sales),
      format: formatRatio,
      formula: 'lançamentos ÷ vendas',
      absent: 'Sem lançamentos ou vendas publicados no período.',
    },
    {
      key: 'avg_sale_ticket', label: 'Ticket médio vendido',
      raw: avgSaleTicket(vgv, sales),
      format: formatBRLCompact,
      formula: 'VGV × 1.000.000 ÷ vendas',
      absent: 'Sem VGV ou vendas publicados no período.',
    },
    {
      key: 'avg_sold_area', label: 'Área média vendida',
      raw: avgSoldArea(soldArea, sales),
      format: formatM2,
      formula: 'área vendida ÷ vendas',
      absent: 'Sem área vendida ou vendas publicadas no período.',
    },
    {
      key: 'cancellations_to_sales', label: 'Distrato/venda',
      raw: cancellationsToSales(cancellations, sales),
      format: (v) => formatPercent(percentFromDecimal(v)),
      formula: 'distratos ÷ vendas',
      absent: 'Sem distratos ou vendas publicados no período.',
    },
  ];

  return items.map(({ format, ...item }) => ({
    ...item,
    value: item.raw === null ? null : format(item.raw),
  }));
}
