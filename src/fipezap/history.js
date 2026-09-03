// Gráficos FipeZap — Distrito Federal: preço de venda/locação e yield, série longa.
//
// Mesmo espírito de `src/ivv/history.js`: só DECLARAÇÃO — que gráfico existe, que pergunta
// responde, de que corte de `FIPEZAP_MONTHLY` filtra. O modelo é montado por
// `src/ivv/chart-model.js`, reaproveitado sem nenhuma mudança: ele não conhece IVV, só
// categoria/série/formatação.
//
// SEM motor de agregação por período. Preço não é grandeza que se soma mês a mês — não
// existe "acumulado" honesto para uma destas séries — então cada gráfico plota o valor
// PUBLICADO de cada mês dentro da janela do período escolhido. A janela em si vem de
// `src/ivv/period.js`, também reaproveitado: ele só depende de `reference_date`, que este
// normalizador produz com o mesmo formato do IVV_MONTHLY.

import { buildChartModel, CHART_TYPES } from '../ivv/chart-model.js';
import { formatPriceM2, formatPercent, percentFromDecimal, compactNumber } from '../format.js';
import { monthYearLabel } from '../ivv/period.js';

/** Só o DF inteiro entra numa série temporal — o recorte por localidade é outro gráfico. */
const GEOGRAFIA_DF = 'DF_TOTAL';

const FORMATO_PRECO = Object.freeze({
  formatar: (valor) => formatPriceM2(valor),
  formatarCurto: (valor) => `R$ ${compactNumber(valor)}/m²`,
});

const FORMATO_PERCENTUAL = Object.freeze({
  // Escala decimal (`0.042` = 4,2%) — ver nota de escala em normalize-fipezap.js.
  formatar: (valor) => formatPercent(percentFromDecimal(valor)),
  formatarCurto: (valor) => formatPercent(percentFromDecimal(valor)),
});

// Sem abreviar para "m": a tela já usa "m" para metro quadrado (R$/m²) em todo o resto da
// página, e um eixo dizendo "200 m" ao lado de gráficos em R$/m² leria como metro, não mês.
// O número já é curto (dezenas a poucas centenas) — não precisa de forma compacta.
const FORMATO_MESES = Object.freeze({
  formatar: (valor) => `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} meses`,
});

/** Vocabulário fechado — os únicos dois valores de `segment_scope` na aba. */
export const SEGMENTOS = Object.freeze({ RESIDENCIAL: 'RESIDENCIAL', COMERCIAL: 'COMERCIAL' });

/**
 * Os oito gráficos do DF — quatro por segmento, sempre no mesmo par de perguntas (preço
 * de venda, preço de locação, yield, meses de aluguel para pagar o imóvel). `segmento` é
 * declarado, não deduzido do filtro da série: é ele que a tela usa para separar a grade em
 * duas seções ("Residencial"/"Comercial") sem ter que abrir o filtro de cada série para
 * adivinhar de qual tema o gráfico é.
 */
export const FIPEZAP_HISTORY_CHARTS = Object.freeze([
  {
    key: 'fipezap-venda-residencial',
    segmento: SEGMENTOS.RESIDENCIAL,
    titulo: 'Preço de venda residencial (R$/m²)',
    pergunta: 'Como o preço pedido evoluiu desde 2011?',
    tipo: CHART_TYPES.LINHA,
    // Preço não começa em zero: a faixa que interessa é estreita, e um eixo desde zero
    // achataria quinze anos de série numa quase-reta (mesma decisão do gráfico de preço do
    // IVV, `src/ivv/history.js`).
    baseZero: false,
    ...FORMATO_PRECO,
    series: Object.freeze([
      { rotulo: 'Venda', cat: 1, filtro: { segment_scope: 'RESIDENCIAL', transaction_type: 'VENDA' }, valueKey: 'price_brl_m2' },
    ]),
  },
  {
    key: 'fipezap-locacao-residencial',
    segmento: SEGMENTOS.RESIDENCIAL,
    titulo: 'Preço de locação residencial (R$/m²/mês)',
    pergunta: 'E o aluguel, como andou?',
    tipo: CHART_TYPES.LINHA,
    baseZero: false,
    ...FORMATO_PRECO,
    series: Object.freeze([
      { rotulo: 'Locação', cat: 2, filtro: { segment_scope: 'RESIDENCIAL', transaction_type: 'LOCACAO' }, valueKey: 'price_brl_m2' },
    ]),
  },
  {
    key: 'fipezap-yield-residencial',
    segmento: SEGMENTOS.RESIDENCIAL,
    titulo: 'Yield bruto anual residencial (%)',
    pergunta: 'Alugar rende quanto ao ano, sobre o preço do imóvel?',
    tipo: CHART_TYPES.LINHA,
    baseZero: true,
    ...FORMATO_PERCENTUAL,
    // Yield e meses-de-aluguel só existem nas linhas de locação — é ali que a razão
    // aluguel/preço faz sentido (confirmado: 0/187 em VENDA, 137-139/139 em LOCACAO). Não
    // é ausência, é onde a métrica mora. O oficial vence; o calculado entra só se faltar.
    series: Object.freeze([
      {
        rotulo: 'Yield anual',
        cat: 5,
        filtro: { segment_scope: 'RESIDENCIAL', transaction_type: 'LOCACAO' },
        valueKey: 'official_yield_annual_pct',
        valueKeyFallback: 'calculated_yield_annual_pct',
      },
    ]),
  },
  {
    key: 'fipezap-price-to-rent-residencial',
    segmento: SEGMENTOS.RESIDENCIAL,
    titulo: 'Meses de aluguel para pagar o imóvel (residencial)',
    pergunta: 'Quanto tempo de aluguel equivale ao preço de venda?',
    tipo: CHART_TYPES.LINHA,
    baseZero: true,
    ...FORMATO_MESES,
    series: Object.freeze([
      { rotulo: 'Preço ÷ aluguel', cat: 7, filtro: { segment_scope: 'RESIDENCIAL', transaction_type: 'LOCACAO' }, valueKey: 'price_to_rent_months' },
    ]),
  },
  {
    // Venda (R$/m²) e locação (R$/m²/mês) NÃO dividem gráfico: são unidades de ordens de
    // grandeza diferentes (aqui, ~150×) e um eixo Y só para as duas achata a locação numa
    // linha reta perto do zero — inventaria uma leitura visual que o dado não sustenta.
    // Mesmo motivo pelo qual o projeto já recusa segundo eixo Y (ver `SERIES_MODES` em
    // `src/ivv/history.js`). Por isso comercial segue o padrão do residencial: um gráfico
    // por pergunta, não uma pergunta por eixo.
    key: 'fipezap-venda-comercial',
    segmento: SEGMENTOS.COMERCIAL,
    titulo: 'Preço de venda comercial (R$/m²)',
    pergunta: 'O comercial acompanha o residencial?',
    tipo: CHART_TYPES.LINHA,
    baseZero: false,
    ...FORMATO_PRECO,
    series: Object.freeze([
      { rotulo: 'Venda', cat: 3, filtro: { segment_scope: 'COMERCIAL', transaction_type: 'VENDA' }, valueKey: 'price_brl_m2' },
    ]),
  },
  {
    key: 'fipezap-locacao-comercial',
    segmento: SEGMENTOS.COMERCIAL,
    titulo: 'Preço de locação comercial (R$/m²/mês)',
    pergunta: 'E o aluguel comercial, como andou?',
    tipo: CHART_TYPES.LINHA,
    baseZero: false,
    ...FORMATO_PRECO,
    series: Object.freeze([
      { rotulo: 'Locação', cat: 4, filtro: { segment_scope: 'COMERCIAL', transaction_type: 'LOCACAO' }, valueKey: 'price_brl_m2' },
    ]),
  },
  {
    key: 'fipezap-yield-comercial',
    segmento: SEGMENTOS.COMERCIAL,
    titulo: 'Yield bruto anual comercial (%)',
    pergunta: 'E alugar uma sala/loja rende quanto, sobre o preço do imóvel?',
    tipo: CHART_TYPES.LINHA,
    baseZero: true,
    ...FORMATO_PERCENTUAL,
    // Mesma mecânica do yield residencial acima — confirmado: 89/91 meses com oficial.
    series: Object.freeze([
      {
        rotulo: 'Yield anual',
        cat: 6,
        filtro: { segment_scope: 'COMERCIAL', transaction_type: 'LOCACAO' },
        valueKey: 'official_yield_annual_pct',
        valueKeyFallback: 'calculated_yield_annual_pct',
      },
    ]),
  },
  {
    key: 'fipezap-price-to-rent-comercial',
    segmento: SEGMENTOS.COMERCIAL,
    titulo: 'Meses de aluguel para pagar o imóvel (comercial)',
    pergunta: 'Quanto tempo de aluguel comercial equivale ao preço de venda?',
    tipo: CHART_TYPES.LINHA,
    baseZero: true,
    ...FORMATO_MESES,
    // Confirmado: 91/91 meses com price_to_rent_months publicado.
    series: Object.freeze([
      { rotulo: 'Preço ÷ aluguel', cat: 8, filtro: { segment_scope: 'COMERCIAL', transaction_type: 'LOCACAO' }, valueKey: 'price_to_rent_months' },
    ]),
  },
]);

/**
 * Um pseudo-registro por mês distinto do recorte DF_TOTAL — `{ reference_date }`, nada
 * mais. `FIPEZAP_MONTHLY` publica VÁRIAS linhas por mês (um segmento × transação cada),
 * então não dá para entregá-la direto a `src/ivv/period.js`: `prepareRows` espera UMA
 * linha por mês e trataria as demais como duplicata, descartando a maior parte da aba com
 * aviso. Este índice é o que `selectIvvPeriod`/`availableYears` recebem para calcular ANO
 * e INTERVALO disponíveis; a seleção de linhas de verdade é `fipezapRowsInRange`, abaixo.
 */
export function fipezapMonthlyIndex(rows) {
  const meses = new Set();
  for (const row of rows || []) {
    if (row.geography_scope === GEOGRAFIA_DF && row.reference_date) meses.add(row.reference_date);
  }
  return [...meses].sort().map((reference_date) => ({ reference_date }));
}

/** As linhas de `FIPEZAP_MONTHLY` (todas: DF e localidade) dentro de `[start, end]` (`YYYY-MM`). */
export function fipezapRowsInRange(rows, start, end) {
  if (!start || !end) return [];
  return (rows || []).filter((row) => {
    const mes = row.reference_date?.slice(0, 7);
    return mes && mes >= start && mes <= end;
  });
}

function bate(row, filtro) {
  return Object.entries(filtro).every(([campo, esperado]) => row[campo] === esperado);
}

function pontosDe(rowsDF, serieDef) {
  return rowsDF
    .filter((row) => bate(row, serieDef.filtro))
    .map((row) => {
      const valor = row[serieDef.valueKey] ?? (serieDef.valueKeyFallback ? row[serieDef.valueKeyFallback] : null);
      return { categoria: row.reference_date.slice(0, 7), valor: valor ?? null };
    });
}

/**
 * Monta os modelos dos oito gráficos de DF a partir da janela de `FIPEZAP_MONTHLY` já
 * filtrada por período (`src/ivv/period.js`, `selectIvvPeriod`). Cada modelo carrega
 * `segmento` consigo — é o que permite à tela separar a grade em "Residencial"/
 * "Comercial" sem reabrir a definição do gráfico.
 *
 * @param rows linhas normalizadas de `FIPEZAP_MONTHLY` dentro do período escolhido.
 */
export function buildFipezapHistoryCharts(rows) {
  const rowsDF = (rows || []).filter((row) => row.geography_scope === GEOGRAFIA_DF);
  return FIPEZAP_HISTORY_CHARTS.map((definicao) => {
    const modelo = buildChartModel(
      {
        key: definicao.key,
        titulo: definicao.titulo,
        tipo: definicao.tipo,
        baseZero: definicao.baseZero,
        formatar: definicao.formatar,
        formatarCurto: definicao.formatarCurto,
        rotuloCategoria: monthYearLabel,
      },
      definicao.series.map((serie) => ({
        chave: serie.filtro.transaction_type,
        rotulo: serie.rotulo,
        cat: serie.cat,
        pontos: pontosDe(rowsDF, serie),
      })),
    );
    return { ...modelo, pergunta: definicao.pergunta, segmento: definicao.segmento };
  });
}
