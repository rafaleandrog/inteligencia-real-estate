// Legenda das camadas territoriais — módulo puro (issue #150).
//
// Devolve LINHAS (índice da classe + rótulo), nunca cor: quem pinta a amostra é o mesmo
// `territoryColor` que pinta o mapa, lendo o token `--<rampa>-<n>` do CSS (R8.42). O texto
// segue a convenção dos mapas de referência: "até 100", "100 a 350", "mais de 2.000", e a
// linha "sem dado" fecha a lista porque ausência tem presença na tela (R5.7).

import { formatNumber } from '../format.js';
import { classCount } from './classes.js';

/**
 * Linhas da legenda para cortes crescentes: uma por classe (índice 0..k) e uma final para
 * ausência (`classIndex: null`). `formatValue` formata cada corte; `unit` vai no título,
 * não em cada linha — repetir "dom./km²" seis vezes é ruído.
 */
export function legendRows(breaks, { formatValue = formatNumber, zeroIsAbsent = false } = {}) {
  if (!Array.isArray(breaks) || breaks.length === 0) return [];
  const rows = [];
  const total = classCount(breaks);
  for (let index = 0; index < total; index += 1) {
    let label;
    if (index === 0) label = `até ${formatValue(breaks[0])}`;
    else if (index === breaks.length) label = `mais de ${formatValue(breaks[breaks.length - 1])}`;
    else label = `${formatValue(breaks[index - 1])} a ${formatValue(breaks[index])}`;
    rows.push({ classIndex: index, label });
  }
  rows.push({ classIndex: null, label: zeroIsAbsent ? 'sem dado (inclui zero)' : 'sem dado' });
  return rows;
}

/** Título da legenda: métrica e unidade, com o ano quando o dataset o declara. */
export function legendTitle(layer, metric, dataset) {
  if (!layer || !metric) return '';
  const years = dataset && Array.isArray(dataset.years) && dataset.years.length > 0 ? dataset.years : null;
  const periodo = years ? (years.length > 1 ? `${years[0]}→${years[years.length - 1]}` : String(years[0])) : '';
  const unidade = metric.unit ? ` (${metric.unit})` : '';
  return `${metric.label}${unidade}${periodo && !/\d{4}/.test(metric.label) ? ` · ${periodo}` : ''}`;
}

/**
 * Linhas da legenda de LINHAS (centralidade, issue #152): além do rótulo da classe, o peso e
 * a opacidade com que o mapa desenha cada degrau — números, nunca cor.
 */
export function lineLegendRows(breaks, line, { formatValue = formatNumber } = {}) {
  const rows = legendRows(breaks, { formatValue });
  if (!line || !Array.isArray(line.weight) || !Array.isArray(line.opacity)) return rows;
  return rows.map((row) => (row.classIndex === null
    ? row
    : { ...row, weight: line.weight[row.classIndex] ?? line.weight[line.weight.length - 1], opacity: line.opacity[row.classIndex] ?? line.opacity[line.opacity.length - 1] }));
}

/**
 * A linha de procedência sob a legenda: "Fonte · coletado em · versão". Só o que o manifest
 * declara; nada é inventado quando falta.
 */
export function provenanceLine(dataset) {
  if (!dataset) return '';
  const partes = [];
  const fonte = (dataset.sources || []).map((s) => s.name).filter(Boolean);
  if (fonte.length > 0) partes.push(`Fonte: ${fonte.join('; ')}`);
  const coletas = [...new Set((dataset.sources || []).map((s) => s.retrievedAt).filter(Boolean))];
  if (coletas.length > 0) partes.push(`coletado em ${coletas.join(', ')}`);
  if (dataset.version) partes.push(`versão ${dataset.version}`);
  return partes.join(' · ');
}
