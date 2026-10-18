import { createHash } from 'node:crypto';
import type { HelperDados } from '@urbiverso/sdk';
import { caixa, geometriaCanonica, metricas, validarGeometria, type Geometria } from '../../comum/geo';
import { chaveNome } from '../../comum/normalizar';
import type { ErroLinha } from './converter';

/** Achado de qualidade não bloqueante, gravado depois de aplicar (spec 5.11). */
export interface AchadoNovo {
  codigo: string;
  severidade: 'erro' | 'aviso' | 'info';
  campo?: string;
  mensagem: string;
  valor?: string;
}

export interface CtxImportacao {
  dados: HelperDados;
  usuarioId: number;
  cidadeId: number;
  /** Cache por processo de importação (localidades, existentes…). */
  cache: Map<string, unknown>;
}

export interface LinhaPreparada {
  dados: Record<string, unknown>;
  achados: AchadoNovo[];
}

export interface GanchosTabela {
  /** Carrega o que a resolução de referências precisa, uma vez por importação. */
  carregar?(ctx: CtxImportacao): Promise<void>;
  /** Resolve referências e deriva colunas; acumula erros que rejeitam a linha. */
  preparar(valores: Record<string, unknown>, ctx: CtxImportacao, erros: ErroLinha[]): Promise<LinhaPreparada>;
  /** Chave natural da linha preparada (ou da existente), para duplicata. */
  chave(dados: Record<string, unknown>): string | null;
  /** Colunas derivadas que mudam junto quando o modo `atualizar` toca uma coluna de origem. */
  derivadasDe?: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Localidades: resolução por código, código legado ou nome (spec 5.3, 11.3).

interface LocalidadeCache {
  porCodigo: Map<string, Record<string, any>>;
}

export async function carregarLocalidades(ctx: CtxImportacao, recarregar = false): Promise<LocalidadeCache> {
  if (!recarregar && ctx.cache.has('localidades')) return ctx.cache.get('localidades') as LocalidadeCache;
  const linhas = await ctx.dados.varrerTudo('localidades', { filtros: { cidade_id: ctx.cidadeId } });
  const porCodigo = new Map<string, Record<string, any>>();
  for (const l of linhas) {
    for (const k of [l.codigo, l.codigo_legado, l.codigo_romano]) if (k) porCodigo.set(String(k).toUpperCase(), l);
  }
  // Nome só resolve quando é único (há RA e submercado com o mesmo nome).
  const nomes = new Map<string, Record<string, any>[]>();
  for (const l of linhas) for (const n of [l.nome, l.nome_fonte]) if (n) nomes.set(chaveNome(n), [...(nomes.get(chaveNome(n)) ?? []), l]);
  for (const [n, ls] of nomes) if (ls.length === 1 && !porCodigo.has(`NOME:${n}`)) porCodigo.set(`NOME:${n}`, ls[0]);
  const cache = { porCodigo };
  ctx.cache.set('localidades', cache);
  return cache;
}

export function resolverLocalidade(cache: LocalidadeCache, valor: unknown): Record<string, any> | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const t = String(valor).trim();
  return cache.porCodigo.get(t.toUpperCase()) ?? cache.porCodigo.get(`NOME:${chaveNome(t)}`) ?? null;
}

async function exigirLocalidade(ctx: CtxImportacao, valor: unknown, coluna: string, erros: ErroLinha[], obrigatoria: boolean): Promise<number | null> {
  if (valor === null || valor === undefined || valor === '') {
    if (obrigatoria) erros.push({ coluna, codigo: 'OBRIGATORIO', mensagem: 'localidade obrigatória' });
    return null;
  }
  const loc = resolverLocalidade(await carregarLocalidades(ctx), valor);
  if (!loc) {
    erros.push({ coluna, codigo: 'LOCALIDADE_NAO_RESOLVIDA', mensagem: `"${String(valor)}" não corresponde a nenhuma localidade (código, código legado ou nome)` });
    return null;
  }
  return Number(loc.id);
}

const localidades: GanchosTabela = {
  async carregar(ctx) {
    await carregarLocalidades(ctx);
  },
  async preparar(v, ctx, erros) {
    const dados: Record<string, unknown> = { ...v };
    delete dados.localidade_pai;
    delete dados.localidade_predecessora;
    dados.cidade_id = ctx.cidadeId;
    if (!dados.tipo) dados.tipo = /^RA_\d+$/i.test(String(v.codigo ?? '')) ? 'ra' : 'bairro';
    if ('localidade_pai' in v) dados.localidade_pai_id = await exigirLocalidade(ctx, v.localidade_pai, 'localidade_pai', erros, false);
    if ('localidade_predecessora' in v) dados.localidade_predecessora_id = await exigirLocalidade(ctx, v.localidade_predecessora, 'localidade_predecessora', erros, false);
    return { dados, achados: [] };
  },
  chave: (d) => (d.tipo && d.codigo ? `${d.tipo}|${String(d.codigo).toUpperCase()}` : null),
};

// ---------------------------------------------------------------------------
// Perfis: uma linha por localidade e ano; faixas etárias somam ~1 (spec 5.3).

const FAIXAS = ['faixa_0_14_frac', 'faixa_15_29_frac', 'faixa_30_44_frac', 'faixa_45_59_frac', 'faixa_60_mais_frac'];

const localidadePerfis: GanchosTabela = {
  async carregar(ctx) {
    await carregarLocalidades(ctx);
  },
  async preparar(v, ctx, erros) {
    const dados: Record<string, unknown> = { ...v };
    delete dados.localidade;
    dados.localidade_id = await exigirLocalidade(ctx, v.localidade, 'localidade', erros, true);
    const achados: AchadoNovo[] = [];
    if (typeof v.renda_per_capita_brl === 'number' && v.renda_per_capita_brl < 0) {
      erros.push({ coluna: 'renda_per_capita_brl', codigo: 'NUMERO_INVALIDO', mensagem: 'renda negativa' });
    }
    const faixas = FAIXAS.map((f) => v[f]).filter((x): x is number => typeof x === 'number');
    if (faixas.length === FAIXAS.length) {
      const soma = faixas.reduce((s, x) => s + x, 0);
      if (soma < 0.98 || soma > 1.02) {
        achados.push({ codigo: 'SOMA_FAIXAS_ETARIAS', severidade: 'aviso', campo: 'faixa_*_frac', mensagem: `As cinco faixas etárias somam ${soma.toFixed(3)}, fora de [0,98; 1,02].`, valor: soma.toFixed(4) });
      }
    }
    return { dados, achados };
  },
  chave: (d) => (d.localidade_id && d.ano_referencia ? `${d.localidade_id}|${d.ano_referencia}` : null),
};

// ---------------------------------------------------------------------------
// Contornos: geometria validada, caixa, métricas e hash na escrita (spec 5.3).

export function hashGeometria(g: Geometria): string {
  return createHash('sha256').update(geometriaCanonica(g)).digest('hex');
}

/** Colunas derivadas da geometria de um contorno ou área. */
export function derivarGeometria(g: Geometria): Record<string, unknown> {
  const cx = caixa(g);
  const m = metricas(g);
  return {
    geometria_tipo: g.type,
    bbox_oeste: cx.oeste,
    bbox_sul: cx.sul,
    bbox_leste: cx.leste,
    bbox_norte: cx.norte,
    centroide_latitude: m.centroide.lat,
    centroide_longitude: m.centroide.lon,
    area_m2: m.area_m2 === null ? null : Math.round(m.area_m2 * 100) / 100,
    area_ha: m.area_m2 === null ? null : Math.round(m.area_m2) / 10000,
    perimetro_m: m.perimetro_m === null ? null : Math.round(m.perimetro_m * 100) / 100,
    metricas_aproximadas: true,
    geometria_hash: hashGeometria(g),
  };
}

/** Estilo da planilha (`fill_color`…) no formato `EstiloFeicao` do `urbi-mapa` (D-87). */
export function estiloDaPlanilha(v: Record<string, unknown>, tipoGeometria: string): Record<string, unknown> | null {
  const estilo: Record<string, unknown> = {};
  if (v.preenchimento) estilo.preenchimento = v.preenchimento;
  if (typeof v.opacidade_preenchimento === 'number') estilo.opacidadePreenchimento = v.opacidade_preenchimento;
  if (v.contorno_cor) estilo.contorno = v.contorno_cor;
  if (typeof v.espessura === 'number') estilo.espessura = v.espessura;
  if (v.cor) estilo[tipoGeometria.includes('Line') ? 'contorno' : 'preenchimento'] = v.cor;
  return Object.keys(estilo).length ? estilo : null;
}

const contornos: GanchosTabela = {
  async carregar(ctx) {
    await carregarLocalidades(ctx);
  },
  async preparar(v, ctx, erros) {
    const dados: Record<string, unknown> = { ...v };
    for (const k of ['localidade', 'preenchimento', 'contorno_cor', 'opacidade_preenchimento', 'espessura', 'cor']) delete dados[k];
    if ('localidade' in v) dados.localidade_id = await exigirLocalidade(ctx, v.localidade, 'localidade', erros, false);
    const g = v.geometria as Geometria | null;
    if (g) {
      const problemas = validarGeometria(g);
      if (problemas.length) erros.push({ coluna: 'geometria', codigo: 'POLIGONO_INVALIDO', mensagem: problemas.join('; ') });
      else {
        const derivadas = derivarGeometria(g);
        Object.assign(dados, derivadas, {
          centroide_latitude: v.centroide_latitude ?? derivadas.centroide_latitude,
          centroide_longitude: v.centroide_longitude ?? derivadas.centroide_longitude,
        });
      }
    }
    if (!v.estilo) {
      const estilo = estiloDaPlanilha(v, String(dados.geometria_tipo ?? ''));
      if (estilo) dados.estilo = estilo;
    }
    dados.tipo_entidade = v.tipo_entidade ?? 'area_personalizada';
    dados.papel_geometria = v.papel_geometria ?? (String(dados.geometria_tipo ?? '').includes('Line') ? 'eixo_rota' : 'limite_exibicao');
    dados.grupo_camada = v.grupo_camada ?? (dados.tipo_entidade === 'regiao_administrativa' ? 'administrative_regions' : 'poligonais_importadas');
    dados.status = v.status ?? 'ativo';
    return { dados, achados: [] };
  },
  chave: (d) => (d.id_legado ? `legado|${d.id_legado}` : d.geometria_hash ? `geo|${d.tipo_entidade}|${d.entidade_codigo ?? ''}|${d.geometria_hash}` : null),
  derivadasDe: { geometria: ['geometria_tipo', 'bbox_oeste', 'bbox_sul', 'bbox_leste', 'bbox_norte', 'area_m2', 'area_ha', 'perimetro_m', 'metricas_aproximadas', 'geometria_hash', 'centroide_latitude', 'centroide_longitude'] },
};

export const GANCHOS: Record<string, GanchosTabela> = {
  localidades,
  localidade_perfis: localidadePerfis,
  contornos,
};
