/**
 * Mercado: FipeZap (spec 6.5, 10.3 item 7). Os gráficos do DF, a lista de
 * localidades desambiguada e os gráficos venda × locação por localidade são os
 * do site (`comum/site/fipezap/`). A visão pareada por localidade
 * (`FIPEZAP_LOCALITY_MONTHLY`) não é tabela (D-11): é montada aqui, em
 * leitura, das linhas de localidade de `fipezap_mensal`.
 */
import { normalizeFipezapMonthly, normalizeFipezapLocality } from '../../comum/site/fipezap/normalize-fipezap.js';
import { buildFipezapHistoryCharts, fipezapRowsInRange } from '../../comum/site/fipezap/history.js';
import { localitiesAvailable, buildLocalityCharts, formatLocalityDisplayName } from '../../comum/site/fipezap/locality.js';

type Linha = Record<string, any>;

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const SEG: Record<string, string> = { residencial: 'RESIDENCIAL', comercial: 'COMERCIAL' };
const TRANS: Record<string, string> = { venda: 'VENDA', locacao: 'LOCACAO' };
const ESC: Record<string, string> = { total: 'DF_TOTAL', localidade: 'LOCALIDADE' };

/** Linha de `fipezap_mensal` no formato da aba `FIPEZAP_MONTHLY`. */
export function linhaFipezapParaSite(l: Linha): Linha {
  return {
    reference_date: String(l.mes_referencia).slice(0, 10),
    period_id: String(l.mes_referencia).slice(0, 7),
    segment_scope: SEG[l.segmento] ?? l.segmento,
    transaction_type: TRANS[l.tipo_transacao] ?? l.tipo_transacao,
    geography_scope: ESC[l.escopo_geografico] ?? l.escopo_geografico,
    source_locality_name: l.escopo_geografico === 'total' ? null : l.nome_localidade_fonte,
    ra_name: l.nome_ra_fonte ?? null,
    ra_geo_id: l.localidade_codigo ?? null,
    geography_classification: l.classificacao_geografica ?? null,
    price_unit: l.unidade_preco === 'brl_m2_mes' ? 'BRL_M2_MES' : 'BRL_M2',
    sample_n: num(l.amostra_n),
    price_brl_m2: num(l.preco_m2_brl),
    official_yield_monthly_pct: num(l.yield_mensal_oficial_frac),
    official_yield_annual_pct: num(l.yield_anual_oficial_frac),
    calculated_yield_monthly_pct: num(l.yield_mensal_calc_frac),
    calculated_yield_annual_pct: num(l.yield_anual_calc_frac),
    price_mom_pct_change: num(l.variacao_mom_frac),
    price_ytd_pct_change: num(l.variacao_ytd_frac),
    price_yoy_pct_change: num(l.variacao_yoy_frac),
    price_to_rent_months: num(l.meses_aluguel_para_pagar),
    diff_vs_df_pct: num(l.diff_vs_total_frac),
    rank_price: num(l.rank_preco),
    rank_yoy: num(l.rank_yoy),
    source_publisher: l.fonte_publicador ?? null,
    source_id: l.fonte_codigo ?? null,
    note_id: l.nota_codigo ?? null,
    quality_flag: l.qualidade ?? null,
  };
}

export function linhasFipezap(linhas: Linha[]): { linhas: Linha[]; avisos: string[] } {
  const r = normalizeFipezapMonthly(linhas.map(linhaFipezapParaSite));
  return { linhas: r.rows, avisos: r.warnings };
}

/**
 * Visão pareada (D-11): uma linha por mês × segmento × localidade, com venda e
 * locação do MESMO mês, o yield calculado (aluguel × 12 ÷ venda) e as
 * diferenças contra o total do DF publicadas na própria linha.
 */
export function pareadoPorLocalidade(site: Linha[]): Linha[] {
  const porChave = new Map<string, Linha>();
  for (const r of site) {
    if (r.geography_scope !== 'LOCALIDADE' || !r.source_locality_name) continue;
    const k = `${r.period_id}|${r.segment_scope}|${r.source_locality_name}`;
    const p = porChave.get(k) ?? {
      reference_date: r.reference_date, period_id: r.period_id, segment_scope: r.segment_scope,
      source_locality_name: r.source_locality_name, ra_name: r.ra_name, ra_geo_id: r.ra_geo_id, geography_classification: r.geography_classification,
      sale_price_brl_m2: null, rent_price_brl_m2_month: null, sale_yoy_pct_change: null, rent_yoy_pct_change: null,
      sale_diff_vs_df_pct: null, rent_diff_vs_df_pct: null, sale_price_rank: null, rent_price_rank: null,
    };
    if (r.transaction_type === 'VENDA') Object.assign(p, { sale_price_brl_m2: r.price_brl_m2, sale_yoy_pct_change: r.price_yoy_pct_change, sale_diff_vs_df_pct: r.diff_vs_df_pct, sale_price_rank: r.rank_price });
    else Object.assign(p, { rent_price_brl_m2_month: r.price_brl_m2, rent_yoy_pct_change: r.price_yoy_pct_change, rent_diff_vs_df_pct: r.diff_vs_df_pct, rent_price_rank: r.rank_price });
    porChave.set(k, p);
  }
  const linhas = [...porChave.values()].map((p) => {
    const y = p.sale_price_brl_m2 && p.rent_price_brl_m2_month !== null ? p.rent_price_brl_m2_month / p.sale_price_brl_m2 : null;
    return { ...p, calculated_yield_monthly_pct: y, calculated_yield_annual_pct: y === null ? null : y * 12 };
  });
  return normalizeFipezapLocality(linhas).rows;
}

/** Modelo de gráfico do site → `{ titulo, categorias, series: [{ rotulo, valores }] }` para os `urbi-grafico-*`. */
export function graficoParaTela(m: Linha): Linha {
  return {
    chave: m.key, titulo: m.titulo, pergunta: m.pergunta ?? null, segmento: m.segmento ?? null, vazio: m.vazio,
    categorias: m.categorias.map((c: Linha) => c.chave),
    series: m.series.map((s: Linha) => ({ rotulo: s.rotulo, valores: s.pontos.map((p: Linha) => p.valor) })),
    resumo: m.resumo ?? null,
  };
}

export function graficosDf(site: Linha[], de?: string, ate?: string): Linha[] {
  const meses = site.filter((r) => r.geography_scope === 'DF_TOTAL').map((r) => r.period_id).sort();
  const ini = de ?? meses[0];
  const fim = ate ?? meses.at(-1);
  return buildFipezapHistoryCharts(fipezapRowsInRange(site, ini, fim)).map(graficoParaTela);
}

export function localidadesFipezap(pareadas: Linha[], segmento: string): Linha[] {
  return localitiesAvailable(pareadas, SEG[segmento] ?? segmento.toUpperCase());
}

/** Venda × locação de uma localidade, mais o ranking do último mês do segmento. */
export function pareadoFipezap(pareadas: Linha[], segmento: string, localidade: string) {
  const seg = SEG[segmento] ?? segmento.toUpperCase();
  const graficos = buildLocalityCharts(pareadas, { locality: localidade, segmentScope: seg }).map(graficoParaTela);
  const doSeg = pareadas.filter((r) => r.segment_scope === seg);
  const ultimo = doSeg.map((r) => r.period_id).sort().at(-1) ?? null;
  const ranking = doSeg
    .filter((r) => r.period_id === ultimo && r.sale_price_brl_m2 !== null)
    .sort((a, b) => b.sale_price_brl_m2 - a.sale_price_brl_m2)
    .map((r, i) => ({ posicao: i + 1, localidade: r.source_locality_name, rotulo: formatLocalityDisplayName(r.source_locality_name), venda: r.sale_price_brl_m2, locacao: r.rent_price_brl_m2_month ?? null, yield_anual: r.calculated_yield_annual_pct ?? null, diff_venda: r.sale_diff_vs_df_pct ?? null }));
  const serie = pareadas.filter((r) => r.segment_scope === seg && r.source_locality_name === localidade)
    .map((r) => ({ mes: r.period_id, venda: r.sale_price_brl_m2 ?? null, locacao: r.rent_price_brl_m2_month ?? null, yield_anual: r.calculated_yield_annual_pct ?? null, diff_venda: r.sale_diff_vs_df_pct ?? null, diff_locacao: r.rent_diff_vs_df_pct ?? null }));
  return { graficos, serie, ranking_mes: ultimo, ranking };
}
