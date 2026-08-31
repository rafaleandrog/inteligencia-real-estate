// Escopo e procedência da série do IVV — issue #58.
//
// Funções puras. O que elas existem para impedir é a tela afirmar um recorte que o dado
// não tem: `IVV_MONTHLY` descreve o **Distrito Federal inteiro**, sem separação por
// Região Administrativa. Uma tela que oferecesse um filtro de RA aqui estaria mentindo
// sobre a granularidade da fonte, e o número continuaria plausível.

import { formatDate } from '../format.js';

/** Escopo declarado pelo próprio dado, quando as linhas concordam entre si. */
function agreedValue(months, key) {
  const values = new Set();
  for (const month of months || []) {
    const value = month && month[key];
    if (typeof value === 'string' && value.trim() !== '') values.add(value.trim());
  }
  if (values.size === 1) return [...values][0];
  return null;
}

/**
 * Período coberto pela série, em `AAAA-MM`.
 *
 * As linhas já chegam ordenadas de `normalizeIvvMonthly`, mas confiar nessa ordem aqui
 * acoplaria as duas funções por um detalhe que ninguém declarou. Min e max são baratos.
 */
export function ivvPeriodCovered(months) {
  const dates = (months || [])
    .map((m) => (m && typeof m.reference_date === 'string' ? m.reference_date : null))
    .filter(Boolean)
    .sort();
  if (dates.length === 0) return null;
  return { first: dates[0], last: dates[dates.length - 1], months: dates.length };
}

/**
 * Procedência da série, pronta para a tela (issue #58).
 *
 * Campo em que as linhas DIVERGEM não vira uma linha só com o valor da primeira: ele
 * some, e a divergência vira aviso. Mostrar "Fonte: X" quando metade da série diz Y é
 * pior que não mostrar fonte nenhuma, porque dá confiança a uma afirmação errada.
 */
export function ivvProvenance(months) {
  const rows = [];
  const warnings = [];
  const list = months || [];

  const declare = (label, key) => {
    const value = agreedValue(list, key);
    if (value) { rows.push({ label, value }); return; }
    const distintos = new Set(list.map((m) => (m && m[key]) || '').filter((v) => String(v).trim() !== ''));
    if (distintos.size > 1) {
      warnings.push(`A série do IVV traz mais de um valor para \`${key}\`: `
        + `${[...distintos].join(', ')}. O campo não é exibido enquanto divergir.`);
    }
  };

  declare('Publicado por', 'source_publisher');
  declare('Abrangência', 'geography_scope');
  declare('Mercado', 'market_scope');
  declare('Segmento', 'segment_scope');
  declare('Qualidade', 'quality_flag');

  const period = ivvPeriodCovered(list);
  if (period) {
    rows.push({
      label: 'Período coberto',
      value: period.first === period.last
        ? formatDate(period.first)
        : `${formatDate(period.first)} a ${formatDate(period.last)} (${period.months} meses)`,
    });
  }

  const url = agreedValue(list, 'source_url');
  return { rows, warnings, sourceUrl: url };
}

/**
 * A frase que declara o recorte na própria tela.
 *
 * Não é decoração. O dashboard mostra preço e volume do DF inteiro, e quem chega nele
 * vindo de um mapa com filtro de Região Administrativa espera, por continuidade, que os
 * números respondam ao mesmo recorte. Eles não respondem, e nada além desta frase diz
 * isso.
 */
export const IVV_SCOPE_NOTICE = 'Estes números descrevem o Distrito Federal inteiro. '
  + 'A fonte não publica a série por Região Administrativa, então os filtros do mapa '
  + 'não se aplicam aqui.';
