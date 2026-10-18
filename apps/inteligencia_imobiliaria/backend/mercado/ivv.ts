/**
 * Mercado: IVV mensal e por localidade (spec 6.5, 10.3 itens 1 a 6). Toda
 * agregação é a do site, pelo motor copiado em `comum/site/` (agregação por
 * natureza, derivados, recortes de período): a app só traduz a linha da tabela
 * (`ivv_mensal`, `ivv_regional`) para o formato que o motor lê.
 */
import { normalizeIvvMonthly } from '../../comum/site/ivv/normalize-ivv.js';
import { aggregatePeriod, monthlySeries, runningSeries } from '../../comum/site/ivv/aggregate.js';
import { buildMicroKpis } from '../../comum/site/ivv/derived.js';
import { selectIvvPeriod, PERIOD_MODES } from '../../comum/site/ivv/period.js';
import { IVV_METRICS, METRIC_BY_KEY } from '../../comum/site/ivv/metrics.js';
import { normalizeIvvRegion, buildRegionRanking, buildRegionScatter, REGION_SCATTER_MODES, faixasDisponiveis, regionMonths, FAIXA_TOTAL } from '../../comum/site/ivv/region.js';

type Linha = Record<string, any>;

/** Coluna da app → coluna da aba `IVV_MONTHLY`, que é o que o motor do site lê. */
export const IVV_PARA_SITE: Record<string, string> = {
  ivv_frac: 'ivv_pct', oferta_unidades: 'offers_units', vendas_unidades: 'sales_units', lancamentos_unidades: 'launches_units',
  lancamentos_empreendimentos: 'launches_developments', distratos_unidades: 'cancellations_units', oferta_area_m2: 'offer_area_m2',
  area_vendida_m2: 'sold_area_m2', preco_pedido_m2_brl: 'asking_price_brl_m2', preco_venda_m2_brl: 'sale_price_brl_m2',
  vgo_brl_milhoes: 'vgo_brl_million', vgv_brl_milhoes: 'vgv_brl_million', vgl_brl_milhoes: 'vgl_brl_million',
  distratos_sobre_vendas_frac: 'cancellations_to_sales_pct', escopo_geografico: 'geography_scope', escopo_mercado: 'market_scope',
  escopo_segmento: 'segment_scope', fonte_publicador: 'source_publisher', fonte_arquivo: 'source_file', fonte_url: 'source_url',
  fonte_relatorio_gerado_em: 'source_report_generated_at', filtro_relatorio: 'report_filter', fonte_codigo: 'source_id',
  localizador_fonte: 'source_locator', verificado_em: 'verified_at', nota_cobertura: 'coverage_note', qualidade: 'quality_flag',
};

const numeroOuNulo = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

/** Linha de `ivv_mensal` no formato da aba: as colunas próprias por cima de `extras`. */
export function linhaIvvParaSite(l: Linha): Linha {
  const extras = typeof l.extras === 'string' ? JSON.parse(l.extras) : l.extras ?? {};
  const out: Linha = { ...extras, reference_date: String(l.mes_referencia).slice(0, 10) };
  for (const [app, site] of Object.entries(IVV_PARA_SITE)) {
    const v = l[app];
    if (v === undefined) continue;
    out[site] = v === null ? null : typeof v === 'string' && /^-?\d/.test(v) && !/[a-z/]/i.test(v) && !site.startsWith('source') ? Number(v) : v;
  }
  return out;
}

/** Os meses normalizados pelo site, a partir das linhas da tabela. */
export function mesesIvv(linhas: Linha[]): { meses: Linha[]; avisos: Linha[] } {
  const r = normalizeIvvMonthly(linhas.map(linhaIvvParaSite));
  return { meses: r.months, avisos: r.warnings };
}

export const METRICAS_IVV = IVV_METRICS.map((m: Linha) => ({ chave: m.key, rotulo: m.label, unidade: m.unit, natureza: m.kind, nota: m.note ?? null }));

export function serieMensal(meses: Linha[], de?: string, ate?: string) {
  const recorte = meses.filter((m) => (!de || m.reference_date.slice(0, 7) >= de) && (!ate || m.reference_date.slice(0, 7) <= ate));
  const porMes = new Map<string, Linha>();
  for (const m of IVV_METRICS as readonly Linha[]) {
    for (const p of monthlySeries(recorte, m.key)) {
      const linha = porMes.get(p.month) ?? { mes: p.month, valores: {} as Linha };
      linha.valores[m.key] = p.value;
      porMes.set(p.month, linha);
    }
  }
  return [...porMes.values()];
}

export interface Selecao { modo?: string; ano?: number; mes?: number; de?: string; ate?: string }

function agregar(linhas: Linha[]) {
  const a = aggregatePeriod(linhas);
  return { periodo: a.period, valores: a.values, nao_agregaveis: a.unsupported, avisos: a.warnings, derivados: buildMicroKpis(a, linhas) };
}

/** `AAAA-MM` + n meses. */
function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Agregação do período (6.5): o recorte é o `selectIvvPeriod` do site; a
 * comparação é o mesmo número de meses imediatamente antes (`anterior`) ou os
 * mesmos meses um ano antes (`ano_anterior`).
 */
export function periodoIvv(meses: Linha[], sel: Selecao, comparar: string) {
  const modo = (Object.values(PERIOD_MODES) as string[]).includes(sel.modo ?? "") ? sel.modo : PERIOD_MODES.YTD;
  const escolhido = selectIvvPeriod(meses, { mode: modo, year: sel.ano, month: sel.mes, start: sel.de, end: sel.ate });
  const atual = { modo: escolhido.mode, referencia: escolhido.reference ?? null, inicio: escolhido.start, fim: escolhido.end, ...agregar(escolhido.rows) };
  let comparacao: Linha | null = null;
  if (escolhido.start && escolhido.end && (comparar === 'anterior' || comparar === 'ano_anterior')) {
    const n = escolhido.rows.length;
    const [ini, fim] = comparar === 'anterior' ? [somarMeses(escolhido.start, -n), somarMeses(escolhido.start, -1)] : [somarMeses(escolhido.start, -12), somarMeses(escolhido.end, -12)];
    const linhas = meses.filter((m) => m.reference_date.slice(0, 7) >= ini && m.reference_date.slice(0, 7) <= fim);
    comparacao = { tipo: comparar, inicio: ini, fim, meses_com_dado: linhas.length, ...agregar(linhas) };
  }
  return { atual, comparacao };
}

/** Série acumulada no ano civil (6.5), mesma política de agregação. */
export function acumuladoIvv(meses: Linha[], ano: number) {
  const doAno = meses.filter((m) => Number(m.reference_date.slice(0, 4)) === ano);
  const series: Linha = {};
  for (const m of IVV_METRICS as readonly Linha[]) {
    if (m.kind === 'nao_somavel') continue;
    series[m.key] = runningSeries(doAno, m.key).map((p: Linha) => ({ mes: p.month, valor: p.value, origem: p.origin }));
  }
  return series;
}

/** IVV (ou outra métrica) por mês do ano, uma série por ano. */
export function sazonalidadeIvv(meses: Linha[], metrica: string) {
  if (!METRIC_BY_KEY[metrica]) return null;
  const anos: Record<string, (number | null)[]> = {};
  for (const p of monthlySeries(meses, metrica)) {
    const [a, m] = p.month.split('-');
    anos[a] ??= Array(12).fill(null);
    anos[a][Number(m) - 1] = p.value;
  }
  return anos;
}

/** Linha de `ivv_regional` no formato da aba `IVV_REGION` (IVV em pontos percentuais). */
export function linhaRegionalParaSite(l: Linha): Linha {
  const pp = (v: unknown) => (v === null || v === undefined || v === '' ? null : Math.round(Number(v) * 100 * 1e6) / 1e6);
  return {
    reference_month: String(l.mes_referencia).slice(0, 10),
    market_region: l.nome_regiao_fonte,
    bedroom_bucket: l.faixa_quartos,
    offered_units: numeroOuNulo(l.ofertadas),
    sold_units: numeroOuNulo(l.vendidas),
    ivv_pct_published: pp(l.ivv_publicado_frac),
    ivv_pct_check: pp(l.ivv_recalculado_frac),
    ivv_variance_pp: numeroOuNulo(l.ivv_variancia_pp),
    offer_price_brl_m2: numeroOuNulo(l.preco_oferta_m2_brl),
    sale_price_brl_m2: numeroOuNulo(l.preco_venda_m2_brl),
    source_id: l.fonte_codigo ?? null,
  };
}

/**
 * Retrato por localidade (6.5): ranking da faixa, `DF Total` como régua (nunca
 * barra), as três leituras da matriz e o mapa de calor localidade × faixa.
 */
export function regionalIvv(linhas: Linha[], faixa: string, localidadeDe: Map<string, number | null>) {
  const { rows, warnings } = normalizeIvvRegion(linhas.map(linhaRegionalParaSite));
  const f = faixa || FAIXA_TOTAL;
  const ranking = buildRegionRanking(rows, { bucket: f });
  const leituras = (REGION_SCATTER_MODES as readonly Linha[]).map((m) => ({ ...buildRegionScatter(rows, { bucket: f, mode: m.value }), rotulo: m.label, chip: m.chip }));
  const mes = regionMonths(rows).at(-1) ?? null;
  const faixas = faixasDisponiveis(rows);
  const doMes = rows.filter((r: Linha) => r.month === mes && !r.isRegiaoTotal);
  const regioes = [...new Set(doMes.map((r: Linha) => r.region))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
  const calor = regioes.map((regiao) => ({
    regiao,
    localidade_id: localidadeDe.get(String(regiao)) ?? null,
    valores: Object.fromEntries(faixas.map((fx: string) => [fx, doMes.find((r: Linha) => r.region === regiao && r.bucket === fx)?.ivvPct ?? null])),
  }));
  return {
    mes, faixa: f, faixas,
    referencia: ranking.referencia,
    ranking: ranking.regioes.map((r: Linha) => ({ ...r, localidade_id: localidadeDe.get(r.region) ?? null })),
    sem_valor: ranking.semValor,
    leituras,
    mapa_calor: calor,
    avisos: warnings,
  };
}
