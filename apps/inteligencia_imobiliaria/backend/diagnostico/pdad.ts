/**
 * Diagnóstico (spec 6.6, 10.4): perfil, ranking, comparar e dispersão da PDAD.
 * A consolidação é a do site (`comum/site/pdad/`): índice ano → RA →
 * indicador, "todas" como média entre localidades (população e domicílios
 * somam), suprimido fora com status. A app só traduz a linha de
 * `pdad_observacoes` para o formato da aba `PDAD_A_DATA`.
 */
import { normalizePdadData, pdadYearsAvailable } from '../../comum/site/pdad/normalize-pdad.js';
import { buildPdadIndex, rasForYear, summarizeKpis, indicatorSeries, indicatorGroups, buildFigureMeta, detailRowsForKey, rankScalar } from '../../comum/site/pdad/aggregate.js';
import { PDAD_TEMAS, PDAD_VIZ, PDAD_RANK_SET, PDAD_COMPARE_KITS, PDAD_SCATTER_VIEWS, INDICATORS_BY_TEMA, PDAD_INDICATOR_LIST } from '../../comum/site/pdad/indicators.js';
import { raRealEstateProfile, compactIndicators, profileItemsForTema, RA_PROFILE_ITEMS } from '../../comum/site/pdad/insights.js';

type Linha = Record<string, any>;

const STATUS: Record<string, string> = { publicado: 'published', parcial: 'partial', suprimido: 'suppressed' };
const ORIGEM: Record<string, string> = { publicado: 'published', parcial_publicado: 'partial_published', calculado: 'calculated', suprimido: 'suppressed' };
const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

/** Linha de `pdad_observacoes` no formato da aba (`estimate_pct` em pontos percentuais). */
export function linhaPdadParaSite(l: Linha, loc: { codigo: string; nome: string } | undefined): Linha {
  const met = (typeof l.metodologia === 'string' ? JSON.parse(l.metodologia) : l.metodologia) ?? {};
  const frac = num(l.estimativa_frac);
  return {
    pdad_year: Number(l.ano), geography_scope: l.escopo_geografia ?? null, ra_geo_id: loc?.codigo ?? `ID:${l.localidade_id}`, ra_name: loc?.nome ?? null,
    figure_number: l.numero_figura ?? null, table_number: l.numero_tabela ?? null, section: l.secao ?? null,
    indicator_code: l.codigo_indicador, indicator_name: l.nome_indicador ?? null, universe: l.universo ?? null,
    segment_dimension: l.dimensao_segmento ?? null, segment_value: l.valor_segmento ?? null, response_category: l.categoria_resposta ?? null,
    estimate_total: num(l.estimativa_total), estimate_pct: frac === null ? null : Math.round(frac * 100 * 1e6) / 1e6,
    source_value_status: STATUS[l.status_valor] ?? l.status_valor, value_origin: ORIGEM[l.origem_valor] ?? l.origem_valor ?? null,
    figure_pdf_page: num(l.pagina_figura), table_pdf_page: num(l.pagina_tabela), source_file: l.arquivo_fonte ?? null,
    source_institution: l.instituicao_fonte ?? null, extraction_basis: l.base_extracao ?? null, notes: l.notas ?? null,
    source_locator: l.localizador_fonte ?? null, category_raw: l.categoria_bruta ?? null, category_standard: l.categoria_padrao,
    ...met,
  };
}

export interface IndicePdad {
  index: Linha;
  linhas: Linha[];
  avisos: string[];
  /** codigo da localidade → id, cv e procedência por indicador. */
  idDe: Map<string, number>;
  cvAlto: Map<string, number>;
}

/**
 * Monta o índice do site. `renda` (código da localidade → renda per capita do
 * perfil) entra como `incomePerCapita`, o atributo que o ranking e a dispersão leem.
 */
export function indicePdad(observacoes: Linha[], localidades: Linha[], renda: Map<string, number>, cvAlerta: number): IndicePdad {
  const porId = new Map(localidades.map((l) => [Number(l.id), { codigo: String(l.codigo), nome: String(l.nome) }]));
  const { rows, warnings } = normalizePdadData(observacoes.map((o) => linhaPdadParaSite(o, porId.get(Number(o.localidade_id)))));
  const index: Linha = buildPdadIndex(rows);
  for (const ano of Object.keys(index)) for (const ra of Object.values(index[ano]) as Linha[]) {
    const r = renda.get(ra.raGeoId);
    if (Number.isFinite(r)) ra.incomePerCapita = r;
  }
  const cvAlto = new Map<string, number>();
  for (const o of observacoes) {
    const cv = num(o.cv_frac);
    if (cv !== null && cv > cvAlerta) {
      const k = `${porId.get(Number(o.localidade_id))?.codigo}|${o.ano}|${o.codigo_indicador}`;
      cvAlto.set(k, Math.max(cv, cvAlto.get(k) ?? 0));
    }
  }
  return { index, linhas: rows, avisos: warnings, idDe: new Map([...porId.entries()].map(([id, l]) => [l.codigo, id])), cvAlto };
}

export function anosPdad(ix: IndicePdad) {
  return pdadYearsAvailable(ix.linhas).map((ano: number) => {
    const ras = rasForYear(ix.index, ano).map((r: Linha) => ({ codigo: r.raGeoId, nome: r.raName, localidade_id: ix.idDe.get(r.raGeoId) ?? null }));
    return { ano, localidades: ras, cobertura: ras.length };
  });
}

export const CATALOGO_PDAD = {
  temas: PDAD_TEMAS, viz: PDAD_VIZ, ranking: PDAD_RANK_SET, kits: PDAD_COMPARE_KITS,
  dispersao: (PDAD_SCATTER_VIEWS as readonly Linha[]).map(({ insight, ...v }) => ({ ...v, leitura: insight })),
  indicadores: PDAD_INDICATOR_LIST, perfil_imobiliario: RA_PROFILE_ITEMS,
};

function codigosDoRecorte(ix: IndicePdad, ano: number, localidade: string): string[] {
  if (localidade === 'todas') return rasForYear(ix.index, ano).map((r: Linha) => r.raGeoId);
  return ix.index[ano]?.[localidade] ? [localidade] : [];
}

/**
 * Perfil (6.6): KPIs, cartões do tema (série consolidada e tipo de gráfico do
 * catálogo), perfil imobiliário (valor, diferença contra a mediana, `n`,
 * posição) e a lista compacta dos demais indicadores.
 */
export function perfilPdad(ix: IndicePdad, ano: number, localidade: string, tema: string | null) {
  const codigos = codigosDoRecorte(ix, ano, localidade);
  const temas = tema ? [tema] : Object.keys(PDAD_TEMAS);
  const cartoes = temas.flatMap((t) => ((INDICATORS_BY_TEMA as Linha)[t] ?? []).map((meta: Linha) => {
    const viz = (PDAD_VIZ as Linha)[meta.key] ?? { kind: 'hbars' };
    const serie = meta.key === 'shopping' ? null : indicatorSeries(ix.index, ano, codigos, meta.key);
    const grupos = meta.key === 'shopping' ? indicatorGroups(ix.index, ano, codigos, meta.key) : null;
    const cautela = codigos.length === 1 ? Object.entries(Object.fromEntries(ix.cvAlto)).filter(([k]) => k.startsWith(`${codigos[0]}|${ano}|`)).length > 0 : false;
    return { chave: meta.key, rotulo: meta.label, tema: t, unidade: meta.unit, viz, serie, grupos, cautela };
  }).filter((c: Linha) => (c.serie && c.serie.length) || (c.grupos && c.grupos.length)));
  const perfil = codigos.length === 1 ? raRealEstateProfile(ix.index, ano, codigos[0]) : null;
  return {
    ano, localidade, tema,
    kpis: summarizeKpis(ix.index, ano, codigos),
    cartoes,
    perfil_imobiliario: perfil ? (tema ? profileItemsForTema(perfil, tema) : perfil.items) : null,
    demais: codigos.length === 1 ? compactIndicators(ix.index, ano, codigos[0], [], tema as any) : [],
  };
}

export function detalhePdad(ix: IndicePdad, ano: number, localidade: string, indicador: string) {
  const linhas = detailRowsForKey(ix.linhas, { raGeoId: localidade, year: ano, key: indicador });
  const meta = buildFigureMeta(linhas);
  return { cabecalho: [...meta.values()], linhas };
}

/** Ranking (6.6): localidades ordenadas, com a fórmula, a fonte, `n` e as ressalvas. */
export function rankingPdad(ix: IndicePdad, ano: number, id: string) {
  const item = (PDAD_RANK_SET as readonly Linha[]).find((r) => r.id === id);
  if (!item) return null;
  const ras = rasForYear(ix.index, ano) as Linha[];
  const pontos = ras.map((ra) => ({ codigo: ra.raGeoId, nome: ra.raName, localidade_id: ix.idDe.get(ra.raGeoId) ?? null, valor: rankScalar(ra, item) }));
  const com = pontos.filter((p) => p.valor !== null).sort((a, b) => (b.valor as number) - (a.valor as number) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const sem = pontos.filter((p) => p.valor === null).map((p) => p.nome);
  const ressalvas: string[] = [];
  if (item.attr === 'incomePerCapita' && !com.length) ressalvas.push('Renda per capita vem do perfil das localidades (RA_PROFILES), que ainda não publica a coluna para estas RAs.');
  if (item.attr && item.attr !== 'incomePerCapita' && item.attr !== 'population' && !com.length) ressalvas.push('Indicador de conjunto público, que entra na fase de dados públicos.');
  return { indicador: item, ano, n: com.length, dados: com.map((p, i) => ({ posicao: i + 1, ...p })), sem_valor: sem, ressalvas };
}

/** Comparar (6.6): 2 a 6 localidades × até 4 indicadores, ou um kit pronto. */
export function compararPdad(ix: IndicePdad, ano: number, codigos: string[], chaves: string[]) {
  return {
    ano,
    localidades: codigos.map((c) => ({ codigo: c, nome: ix.index[ano]?.[c]?.raName ?? c, publicou: Boolean(ix.index[ano]?.[c]) })),
    indicadores: chaves.map((k) => ({
      chave: k,
      rotulo: (PDAD_INDICATOR_LIST as readonly Linha[]).find((m) => m.key === k)?.label ?? k,
      por_localidade: Object.fromEntries(codigos.map((c) => [c, indicatorSeries(ix.index, ano, [c], k)])),
    })),
  };
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
}

/** Dispersão (6.6): pontos com os dois eixos publicados e a correlação descritiva. */
export function dispersaoPdad(ix: IndicePdad, ano: number, leitura: string) {
  const v = (PDAD_SCATTER_VIEWS as readonly Linha[]).find((x) => x.id === leitura);
  if (!v) return null;
  const pontos: Linha[] = [];
  const sem: string[] = [];
  for (const ra of rasForYear(ix.index, ano) as Linha[]) {
    const x = rankScalar(ra, v.x);
    const y = rankScalar(ra, v.y);
    if (x === null || y === null) sem.push(ra.raName);
    else pontos.push({ codigo: ra.raGeoId, nome: ra.raName, x, y });
  }
  return { leitura: v.id, rotulo: v.label, x: v.x.label, y: v.y.label, texto: v.insight, ano, pontos, sem_valor: sem, pearson: pearson(pontos.map((p) => p.x), pontos.map((p) => p.y)), n: pontos.length };
}
