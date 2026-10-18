import type { HelperDados } from '@urbiverso/sdk';
import { OBJETOS, OBJETO_TIPOS, TETO_ATRIBUTOS_ATIVOS, TIPOS_VALOR, UNIDADES, ehObjetoTipo, type ObjetoTipo, type TipoValor } from '../../comum/objetos';
import { dataISO, numero, urlSegura } from '../../comum/normalizar';
import { ErroApp } from '../rotas/comum';

type Linha = Record<string, any>;

/**
 * Tabelas de objeto que existem nesta fase. O vocabulário de `comum/objetos.ts`
 * nasce completo (spec 5.24); a rota só aceita o tipo cuja tabela já está no
 * `schema.json` — o teste de estrutura confere este conjunto contra ele.
 */
export const OBJETOS_ATIVOS = new Set<ObjetoTipo>(['anuncio', 'lancamento', 'ancora', 'contorno', 'area_estudo']);

export function objetoAtivo(tipo: unknown): ObjetoTipo {
  if (!ehObjetoTipo(tipo) || !OBJETOS_ATIVOS.has(tipo)) {
    throw new ErroApp(404, 'OBJETO_TIPO_DESCONHECIDO', 'Tipo de objeto desconhecido nesta versão da app.', [`Tipos aceitos: ${[...OBJETOS_ATIVOS].join(', ')}.`]);
  }
  return tipo;
}

export interface Opcao { valor: string; rotulo: string; ativo: boolean }

export function aplicaA(def: Linha): string[] {
  const v = typeof def.aplica_a === 'string' ? JSON.parse(def.aplica_a) : def.aplica_a;
  return Array.isArray(v) ? v.map(String) : [];
}

export function opcoesDe(def: Linha): Opcao[] {
  const v = typeof def.opcoes === 'string' ? JSON.parse(def.opcoes) : def.opcoes;
  return Array.isArray(v) ? v : [];
}

/** Valida a definição inteira (criar, ou o resultado do patch); devolve a lista de erros por campo. */
export function errosDefinicao(d: Linha): string[] {
  const erros: string[] = [];
  if (typeof d.codigo !== 'string' || !/^[a-z][a-z0-9_]*$/.test(d.codigo) || d.codigo.length > 60) erros.push('codigo: snake_case, começando por letra, até 60 caracteres.');
  if (typeof d.nome !== 'string' || !d.nome.trim()) erros.push('nome é obrigatório.');
  if (!TIPOS_VALOR.includes(d.tipo_valor)) erros.push(`tipo_valor: um de ${TIPOS_VALOR.join(', ')}.`);
  if (d.tipo_valor === 'numero' && !d.unidade) erros.push(`unidade é obrigatória em número (${UNIDADES.join(', ')}…).`);
  const aplica = Array.isArray(d.aplica_a) ? d.aplica_a : null;
  if (!aplica || !aplica.length) erros.push('aplica_a: lista com ao menos um tipo de objeto.');
  else for (const t of aplica) if (!ehObjetoTipo(t)) erros.push(`aplica_a: tipo desconhecido "${t}" (${OBJETO_TIPOS.join(', ')}).`);
  if (d.tipo_valor === 'opcao') {
    const ops = Array.isArray(d.opcoes) ? d.opcoes : null;
    if (!ops || !ops.length) erros.push('opcoes: obrigatória em opção, lista de { valor, rotulo, ativo }.');
    else {
      const vistos = new Set<string>();
      for (const o of ops) {
        if (!o || typeof o.valor !== 'string' || !o.valor.trim() || typeof o.rotulo !== 'string') erros.push('opcoes: cada item com valor e rotulo de texto.');
        else if (vistos.has(o.valor)) erros.push(`opcoes: valor repetido "${o.valor}".`);
        else vistos.add(o.valor);
      }
    }
  } else if (d.opcoes !== null && d.opcoes !== undefined && !(Array.isArray(d.opcoes) && !d.opcoes.length)) {
    erros.push('opcoes: só em atributo do tipo opção.');
  }
  return erros;
}

/** Normaliza as opções (ativo padrão true). */
export function normalizarOpcoes(ops: unknown): Opcao[] | null {
  if (!Array.isArray(ops)) return null;
  return ops.map((o: any) => ({ valor: String(o.valor).trim(), rotulo: String(o.rotulo ?? o.valor).trim(), ativo: o.ativo !== false }));
}

export async function contarAtivos(dados: HelperDados): Promise<number> {
  return (await dados.varrerTudo('atributos_def', { filtros: { ativo: true } })).length;
}

export function exigirTeto(ativos: number): void {
  if (ativos >= TETO_ATRIBUTOS_ATIVOS) {
    throw new ErroApp(422, 'ATRIBUTO_DEF_INVALIDA', `Já há ${TETO_ATRIBUTOS_ATIVOS} atributos ativos.`, ['Inative um atributo antes de criar ou reativar outro.']);
  }
}

export type ColunasValor = { valor_num: number | null; valor_texto: string | null; valor_data: string | null; valor_bool: boolean | null };
const VAZIO: ColunasValor = { valor_num: null, valor_texto: null, valor_data: null, valor_bool: null };

/**
 * Converte o valor bruto pelo `tipo_valor` (spec 5.24, "um valor por tipo"):
 * só a coluna do tipo é preenchida. `null` = apagar. Erro → mensagem.
 */
export function converterValor(def: Linha, bruto: unknown): { ok: true; colunas: ColunasValor | null } | { ok: false; mensagem: string } {
  if (bruto === null || bruto === undefined || (typeof bruto === 'string' && bruto.trim() === '')) return { ok: true, colunas: null };
  const tipo = def.tipo_valor as TipoValor;
  if (tipo === 'numero') {
    const n = typeof bruto === 'number' ? bruto : numero(String(bruto));
    if (n === null || !Number.isFinite(n)) return { ok: false, mensagem: `"${bruto}" não é número` };
    if (def.unidade === 'frac' && (n < -1 || n > 1)) return { ok: false, mensagem: `${n} fora de fração decimal (−1 a 1); percentual entra como 0,12` };
    return { ok: true, colunas: { ...VAZIO, valor_num: n } };
  }
  if (tipo === 'texto') {
    const t = String(bruto).trim();
    if (t.length > 4000) return { ok: false, mensagem: 'texto acima de 4 000 caracteres' };
    return { ok: true, colunas: { ...VAZIO, valor_texto: t } };
  }
  if (tipo === 'data') {
    const d = dataISO(String(bruto));
    if (!d) return { ok: false, mensagem: `"${bruto}" não é data (AAAA-MM-DD ou DD/MM/AAAA)` };
    return { ok: true, colunas: { ...VAZIO, valor_data: d } };
  }
  if (tipo === 'booleano') {
    if (typeof bruto === 'boolean') return { ok: true, colunas: { ...VAZIO, valor_bool: bruto } };
    const t = String(bruto).trim().toLowerCase();
    if (['sim', 's', 'true', '1', 'verdadeiro', 'yes'].includes(t)) return { ok: true, colunas: { ...VAZIO, valor_bool: true } };
    if (['nao', 'não', 'n', 'false', '0', 'falso', 'no'].includes(t)) return { ok: true, colunas: { ...VAZIO, valor_bool: false } };
    return { ok: false, mensagem: `"${bruto}" não é sim/não` };
  }
  if (tipo === 'opcao') {
    const t = String(bruto).trim();
    const op = opcoesDe(def).find((o) => o.ativo !== false && (o.valor === t || o.rotulo.toLowerCase() === t.toLowerCase()));
    if (!op) return { ok: false, mensagem: `"${t}" não é opção ativa de ${def.codigo}` };
    return { ok: true, colunas: { ...VAZIO, valor_texto: op.valor } };
  }
  return { ok: false, mensagem: 'tipo de valor desconhecido' };
}

/** Valor lido de volta da linha de `atributos_valor`, no tipo do atributo. */
export function valorDe(def: Linha, l: Linha): unknown {
  switch (def.tipo_valor) {
    case 'numero': return l.valor_num === null || l.valor_num === undefined ? null : Number(l.valor_num);
    case 'data': return l.valor_data ? String(l.valor_data).slice(0, 10) : null;
    case 'booleano': return l.valor_bool ?? null;
    default: return l.valor_texto ?? null;
  }
}

/** `fonte` com URL passa por `urlSegura()` (spec 5.24). */
export function fonteSegura(fonte: unknown): string | null {
  if (fonte === null || fonte === undefined || String(fonte).trim() === '') return null;
  const t = String(fonte).trim().slice(0, 300);
  if (/^[a-z]+:/i.test(t)) return urlSegura(t);
  return t;
}

export function observadoEm(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const d = dataISO(String(v));
  if (!d) throw new ErroApp(422, 'ATRIBUTO_VALOR_INVALIDO', 'observado_em inválido.', [`"${v}" não é data.`]);
  return d;
}

/** Definições por código (vivas), carregadas uma vez por request. */
export async function definicoesPorCodigo(dados: HelperDados): Promise<Map<string, Linha>> {
  const defs = await dados.varrerTudo('atributos_def');
  return new Map(defs.map((d) => [d.codigo, d]));
}

/** Atributos ativos que se aplicam ao objeto, em ordem de grupo e nome. */
export async function ativosDoObjeto(dados: HelperDados, tipo: ObjetoTipo): Promise<Linha[]> {
  const defs = await dados.varrerTudo('atributos_def', { filtros: { ativo: true } });
  return defs.filter((d) => aplicaA(d).includes(tipo)).sort((a, b) => String(a.grupo ?? '').localeCompare(String(b.grupo ?? '')) || String(a.nome).localeCompare(String(b.nome)));
}

export function tabelaDoObjeto(tipo: ObjetoTipo): string {
  return OBJETOS[tipo].tabela;
}

/** Tipo de objeto ativo da tabela importável, ou `null`. */
export function objetoDaTabelaAtiva(tabela: string): ObjetoTipo | null {
  const t = OBJETO_TIPOS.find((x) => OBJETOS[x].tabela === tabela);
  return t && OBJETOS_ATIVOS.has(t) ? t : null;
}
