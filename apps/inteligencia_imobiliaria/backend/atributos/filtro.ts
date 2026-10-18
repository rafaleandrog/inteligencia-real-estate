import type { Request } from 'express';
import type { HelperDados } from '@urbiverso/sdk';
import type { ObjetoTipo } from '../../comum/objetos';
import { ErroApp } from '../rotas/comum';
import { aplicaA, ativosDoObjeto, converterValor, definicoesPorCodigo, valorDe } from './catalogo';

type Linha = Record<string, any>;
const LOTE_IN = 500;

/**
 * Filtro por atributo nas listas (spec 6.23): `atr_<codigo>_min`/`_max` sobre
 * `valor_num`, `atr_<codigo>=<valor>` em opção, booleano e data. Devolve os
 * ids de objeto que passam (interseção entre atributos) ou `null` sem filtro.
 * Atributo desconhecido, inativo ou que não se aplica → `400 METRICA_DESCONHECIDA`.
 */
export async function idsPorAtributos(req: Request, tipo: ObjetoTipo): Promise<number[] | null> {
  const pedidos = new Map<string, { min?: number; max?: number; igual?: string }>();
  for (const [k, v] of Object.entries(req.query)) {
    const m = /^atr_([a-z][a-z0-9_]*?)(_min|_max)?$/.exec(k);
    if (!m || typeof v !== 'string' || v.trim() === '') continue;
    const p = pedidos.get(m[1]) ?? {};
    if (m[2]) {
      const n = Number(v.replace(',', '.'));
      if (!Number.isFinite(n)) throw new ErroApp(400, 'FILTRO_INVALIDO', `${k} não é número.`);
      if (m[2] === '_min') p.min = n; else p.max = n;
    } else p.igual = v.trim();
    pedidos.set(m[1], p);
  }
  if (!pedidos.size) return null;
  const defs = await definicoesPorCodigo(req.dados!);
  let ids: Set<number> | null = null;
  for (const [codigo, p] of pedidos) {
    const def = defs.get(codigo);
    if (!def || !def.ativo || !aplicaA(def).includes(tipo)) {
      throw new ErroApp(400, 'METRICA_DESCONHECIDA', `Atributo desconhecido ou inativo: ${codigo}.`, ['Confira o código no catálogo de atributos (Cadastro › Atributos).']);
    }
    const filtros: Record<string, unknown> = { atributo_id: def.id, objeto_tipo: tipo };
    if (p.min !== undefined || p.max !== undefined) {
      if (def.tipo_valor !== 'numero') throw new ErroApp(400, 'FILTRO_INVALIDO', `${codigo} não é numérico: use atr_${codigo}=<valor>.`);
      if (p.min !== undefined) filtros['valor_num[gte]'] = p.min;
      if (p.max !== undefined) filtros['valor_num[lte]'] = p.max;
    }
    if (p.igual !== undefined) {
      const c = converterValor(def, p.igual);
      if (!c.ok || !c.colunas) throw new ErroApp(400, 'FILTRO_INVALIDO', `atr_${codigo}: ${c.ok ? 'valor vazio' : c.mensagem}.`);
      for (const [col, val] of Object.entries(c.colunas)) if (val !== null) filtros[col] = val;
    }
    const linhas = await req.dados!.varrerTudo('atributos_valor', { filtros });
    const achados = new Set(linhas.map((l) => Number(l.objeto_id)));
    const anteriores: Set<number> | null = ids;
    ids = anteriores === null ? achados : new Set([...anteriores].filter((i: number) => achados.has(i)));
  }
  return [...(ids ?? [])];
}

/** Valores dos objetos dados, por id e código (C-23: `IN` em lotes de 500). */
export async function valoresDosObjetos(dados: HelperDados, tipo: ObjetoTipo, ids: number[], defs: Linha[]): Promise<Map<number, Record<string, unknown>>> {
  const porId = new Map(defs.map((d) => [Number(d.id), d]));
  const out = new Map<number, Record<string, unknown>>();
  if (!defs.length || !ids.length) return out;
  for (let i = 0; i < ids.length; i += LOTE_IN) {
    const lote = ids.slice(i, i + LOTE_IN);
    const linhas = await dados.varrerTudo('atributos_valor', { filtros: { objeto_tipo: tipo, objeto_id: lote, atributo_id: [...porId.keys()] } });
    for (const l of linhas) {
      const def = porId.get(Number(l.atributo_id));
      if (!def) continue;
      const o = out.get(Number(l.objeto_id)) ?? {};
      o[`atr_${def.codigo}`] = valorDe(def, l);
      out.set(Number(l.objeto_id), o);
    }
  }
  return out;
}

/** Colunas `atr_<codigo>` da exportação CSV: um por atributo ativo que se aplica (6.23). */
export async function colunasAtributosCsv(dados: HelperDados, tipo: ObjetoTipo, linhas: Linha[]): Promise<{ colunas: string[]; linhas: Linha[] }> {
  const defs = await ativosDoObjeto(dados, tipo);
  if (!defs.length) return { colunas: [], linhas };
  const valores = await valoresDosObjetos(dados, tipo, linhas.map((l) => Number(l.id)), defs);
  return { colunas: defs.map((d) => `atr_${d.codigo}`), linhas: linhas.map((l) => ({ ...l, ...(valores.get(Number(l.id)) ?? {}) })) };
}
