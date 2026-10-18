/**
 * Infraestrutura de teste sem instância (spec 18.1): um `req.dados` falso em
 * memória, tipado pelos verbos de `HelperDados` que a app usa, e um servidor
 * Express que monta os Routers da app com `req.contexto` e `req.dados`
 * injetados. A semântica segue `banco-de-dados.md` do SDK: `null` em vez de
 * lançar no não-encontrado, `atualizar` alcança removido, `buscar` não,
 * filtros com vírgula viram IN, `por_pagina` do backend é obedecido.
 */
import express, { type Router } from 'express';
import type { AddressInfo } from 'node:net';
import type { HelperDados, OpcoesListar, RespostaDados } from '@urbiverso/sdk';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

type Linha = Record<string, any>;

interface DefColuna {
  tipo: string;
  obrigatorio?: boolean;
  unico?: boolean;
  padrao?: unknown;
  opcoes?: (string | number)[];
  tabela_ref?: string;
  ao_deletar?: string;
  limite?: number;
  intervalo?: { min?: number; max?: number };
}

interface GrupoUnico {
  colunas: string[];
  onde?: { coluna: string; operador: string; valor?: unknown }[];
  nulos_distintos?: boolean;
}

interface DefTabela {
  colunas: Record<string, DefColuna>;
  soft_delete?: boolean;
  unicos?: (string[] | GrupoUnico)[];
}

export interface SchemaTeste {
  tabelas: Record<string, DefTabela>;
}

const AQUI = dirname(fileURLToPath(import.meta.url));
export const RAIZ_APP = join(AQUI, '..');

export function lerSchemaDaApp(): SchemaTeste {
  const caminho = join(RAIZ_APP, 'schema.json');
  if (!existsSync(caminho)) return { tabelas: {} };
  return JSON.parse(readFileSync(caminho, 'utf8')) as SchemaTeste;
}

const AUTOMATICAS = new Set(['id', 'criado_em', 'atualizado_em', 'removido_em', 'removido_por_id']);

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function comparavel(v: unknown): number | string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  const d = /^\d{4}-\d{2}-\d{2}T/.test(s) ? Date.parse(s) : NaN;
  return Number.isNaN(d) ? s : d;
}

function igual(a: unknown, b: unknown): boolean {
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b);
  const ca = comparavel(a);
  const cb = comparavel(b);
  if (ca === null || cb === null) return false;
  if (typeof ca === 'number' && typeof cb === 'number') return ca === cb;
  return String(ca) === String(cb);
}

/** Valores de um filtro de igualdade: vírgula separa sempre, elementos vazios somem (filtro-in). */
function valoresIgualdade(v: unknown): string[] {
  const lista = Array.isArray(v) ? v : [v];
  return lista
    .flatMap((x) => (x === null || x === undefined ? [] : String(x instanceof Date ? x.toISOString() : x).split(',')))
    .map((x) => x.trim())
    .filter((x) => x !== '');
}

export class ErroDadosFalso extends Error {
  constructor(public codigo: string, mensagem: string) {
    super(mensagem);
    this.name = 'ErroDadosFalso';
  }
}

export class DadosFalsos {
  private tabelas = new Map<string, Linha[]>();
  private proximoId = new Map<string, number>();
  private relogio = Date.parse('2026-10-18T12:00:00Z');
  readonly consultas = new Map<string, (params: Record<string, any>, dados: DadosFalsos) => Linha[]>();

  constructor(readonly schema: SchemaTeste = lerSchemaDaApp()) {
    for (const nome of Object.keys(schema.tabelas)) {
      this.tabelas.set(nome, []);
      this.proximoId.set(nome, 1);
    }
  }

  /** O helper com a forma de `HelperDados` que a app recebe em `req.dados`. */
  helper(): HelperDados {
    return this as unknown as HelperDados;
  }

  /** Acesso direto às linhas (para asserções). */
  linhas(tabela: string): Linha[] {
    return this.tab(tabela).map((l) => ({ ...l }));
  }

  private agora(): Date {
    this.relogio += 1000;
    return new Date(this.relogio);
  }

  private def(tabela: string): DefTabela {
    const d = this.schema.tabelas[tabela];
    if (!d) throw new ErroDadosFalso('DADOS_TABELA_INEXISTENTE', `Tabela inexistente: ${tabela}`);
    return d;
  }

  private tab(tabela: string): Linha[] {
    this.def(tabela);
    return this.tabelas.get(tabela)!;
  }

  private validarColunas(tabela: string, dados: Linha): void {
    const def = this.def(tabela);
    for (const [col, valor] of Object.entries(dados)) {
      if (AUTOMATICAS.has(col)) continue;
      const c = def.colunas[col];
      if (!c) throw new ErroDadosFalso('VOCABULARIO_INVALIDO', `Coluna inexistente em ${tabela}: ${col}`);
      if (valor === null || valor === undefined) continue;
      if (c.opcoes && !c.opcoes.map(String).includes(String(valor))) {
        throw new ErroDadosFalso('DADOS_VALIDACAO_FALHOU', `Erros de validação: ${tabela}.${col} fora das opções (${String(valor)})`);
      }
      if (c.tipo === 'texto' && c.limite && String(valor).length > c.limite) {
        throw new ErroDadosFalso('DADOS_VALIDACAO_FALHOU', `Erros de validação: ${tabela}.${col} acima do limite ${c.limite}`);
      }
      if ((c.tipo === 'inteiro' || c.tipo === 'decimal' || c.tipo === 'referencia') && Number.isNaN(Number(valor))) {
        throw new ErroDadosFalso('DADOS_VALIDACAO_FALHOU', `Erros de validação: ${tabela}.${col} não é número`);
      }
      if (c.tipo === 'inteiro' && !Number.isInteger(Number(valor))) {
        throw new ErroDadosFalso('DADOS_VALIDACAO_FALHOU', `Erros de validação: ${tabela}.${col} não é inteiro`);
      }
      if (c.intervalo) {
        const n = Number(valor);
        if ((c.intervalo.min !== undefined && n < c.intervalo.min) || (c.intervalo.max !== undefined && n > c.intervalo.max)) {
          throw new ErroDadosFalso('DADOS_VALIDACAO_FALHOU', `Erros de validação: ${tabela}.${col} fora da faixa`);
        }
      }
      if (c.tipo === 'data' && !/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) {
        throw new ErroDadosFalso('DADOS_VALIDACAO_FALHOU', `Erros de validação: ${tabela}.${col} não é data AAAA-MM-DD`);
      }
      if (c.tipo === 'referencia' && c.tabela_ref && !c.tabela_ref.includes('.')) {
        const alvo = this.tab(c.tabela_ref).find((l) => l.id === Number(valor));
        if (!alvo) throw new ErroDadosFalso('DADOS_REFERENCIA_INVALIDA', `Referência inválida: ${tabela}.${col} → ${c.tabela_ref}#${valor}`);
      }
    }
  }

  private normalizar(tabela: string, dados: Linha): Linha {
    const def = this.def(tabela);
    const out: Linha = {};
    for (const [col, valor] of Object.entries(dados)) {
      const c = def.colunas[col];
      if (valor === undefined) continue;
      if (c && valor !== null && (c.tipo === 'inteiro' || c.tipo === 'referencia')) out[col] = Number(valor);
      else if (c && valor !== null && c.tipo === 'decimal') out[col] = String(Number(valor).toFixed(c && (c as any).escala !== undefined ? (c as any).escala : 2));
      else if (c && valor !== null && c.tipo === 'datahora') out[col] = valor instanceof Date ? valor : new Date(String(valor));
      else if (c && valor !== null && c.tipo === 'json') out[col] = JSON.parse(JSON.stringify(valor));
      else out[col] = valor;
    }
    return out;
  }

  private conferirUnicos(tabela: string, linha: Linha, ignorarId?: number): void {
    const def = this.def(tabela);
    const grupos: GrupoUnico[] = [];
    for (const [col, c] of Object.entries(def.colunas)) if (c.unico) grupos.push({ colunas: [col] });
    for (const g of def.unicos ?? []) grupos.push(Array.isArray(g) ? { colunas: g } : g);
    for (const g of grupos) {
      if (g.onde && !this.satisfazOnde(linha, g.onde)) continue;
      const valores = g.colunas.map((c) => linha[c]);
      if (g.nulos_distintos !== false && valores.some((v) => v === null || v === undefined)) continue;
      const colide = this.tab(tabela).some(
        (o) =>
          o.id !== ignorarId &&
          (!g.onde || this.satisfazOnde(o, g.onde)) &&
          g.colunas.every((c, i) => (o[c] ?? null) === null ? (valores[i] ?? null) === null : igual(o[c], valores[i])),
      );
      if (colide) {
        const e = new ErroDadosFalso('DADOS_UNICO_VIOLADO', `Violação de único em ${tabela}: ${g.colunas.join(', ')}`);
        (e as any).code = '23505';
        throw e;
      }
    }
  }

  private satisfazOnde(linha: Linha, onde: NonNullable<GrupoUnico['onde']>): boolean {
    return onde.every((c) => {
      const v = linha[c.coluna] ?? null;
      switch (c.operador) {
        case 'igual': return igual(v, c.valor);
        case 'diferente': return !igual(v, c.valor);
        case 'nulo': return v === null;
        case 'nao_nulo': return v !== null;
        default: throw new Error(`operador ${c.operador}`);
      }
    });
  }

  private casaFiltros(linha: Linha, filtros: Record<string, any> = {}, estrito = false): boolean {
    for (const [chave, valor] of Object.entries(filtros)) {
      const m = /^([a-z_][a-z0-9_]*)\[(gt|gte|lt|lte|neq|busca|nulo)\]$/.exec(chave);
      const col = m ? m[1] : chave;
      const op = m ? m[2] : 'eq';
      const atual = linha[col] ?? null;
      if (op === 'eq') {
        const vals = valoresIgualdade(valor);
        if (vals.length === 0) {
          if (estrito) throw new ErroDadosFalso('VOCABULARIO_INVALIDO', `Filtro sem condição: ${chave}`);
          continue;
        }
        if (!vals.some((v) => igual(atual, v))) return false;
        continue;
      }
      const v = Array.isArray(valor) ? valor[0] : valor;
      if (op === 'nulo') {
        const quer = String(v) === 'true';
        if ((atual === null) !== quer) return false;
        continue;
      }
      if (op === 'busca') {
        if (atual === null) return false;
        if (!semAcento(String(atual)).includes(semAcento(String(v)))) return false;
        continue;
      }
      const a = comparavel(atual);
      const b = comparavel(v);
      if (op === 'neq') {
        if (a !== null && b !== null && String(a) === String(b)) return false;
        continue;
      }
      if (a === null || b === null) return false;
      if (op === 'gt' && !(a > b)) return false;
      if (op === 'gte' && !(a >= b)) return false;
      if (op === 'lt' && !(a < b)) return false;
      if (op === 'lte' && !(a <= b)) return false;
    }
    return true;
  }

  private filtrar(tabela: string, opcoes: OpcoesListar & { removidos?: string } = {}): Linha[] {
    const def = this.def(tabela);
    let linhas = this.tab(tabela).filter((l) => this.casaFiltros(l, opcoes.filtros));
    if (def.soft_delete) {
      const modo = opcoes.removidos ?? 'excluir';
      if (modo === 'excluir') linhas = linhas.filter((l) => l.removido_em === null);
      if (modo === 'apenas') linhas = linhas.filter((l) => l.removido_em !== null);
    }
    if (opcoes.busca_ou) {
      const termo = semAcento(opcoes.busca_ou.termo);
      linhas = linhas.filter((l) => opcoes.busca_ou!.colunas.some((c) => l[c] != null && semAcento(String(l[c])).includes(termo)));
    }
    const ordenar = opcoes.ordenar && (def.colunas[opcoes.ordenar] || AUTOMATICAS.has(opcoes.ordenar)) ? opcoes.ordenar : 'criado_em';
    const dir = opcoes.ordem === 'asc' ? 1 : opcoes.ordenar ? (opcoes.ordem === 'desc' ? -1 : 1) : -1;
    linhas = [...linhas].sort((x, y) => {
      const a = comparavel(x[ordenar]);
      const b = comparavel(y[ordenar]);
      if (a === b) return x.id - y.id;
      if (a === null) return 1;
      if (b === null) return -1;
      return (a < b ? -1 : 1) * dir;
    });
    return linhas;
  }

  async listar(tabela: string, opcoes: OpcoesListar = {}): Promise<RespostaDados> {
    const linhas = this.filtrar(tabela, opcoes);
    const por_pagina = opcoes.por_pagina ?? 20;
    const pagina = opcoes.pagina ?? 1;
    const dados = linhas.slice((pagina - 1) * por_pagina, pagina * por_pagina).map((l) => ({ ...l }));
    return { dados, total: linhas.length, pagina, por_pagina, paginas: Math.max(1, Math.ceil(linhas.length / por_pagina)) };
  }

  async varrerTudo(tabela: string, opcoes: OpcoesListar = {}): Promise<Linha[]> {
    return this.filtrar(tabela, opcoes).map((l) => ({ ...l }));
  }

  async buscar(tabela: string, id: number, opcoes?: string[] | { incluir_removidos?: boolean }): Promise<Linha | null> {
    const l = this.tab(tabela).find((x) => x.id === Number(id));
    if (!l) return null;
    const incluirRemovidos = !Array.isArray(opcoes) && opcoes?.incluir_removidos;
    if (this.def(tabela).soft_delete && l.removido_em !== null && !incluirRemovidos) return null;
    return { ...l };
  }

  async criar(tabela: string, dados: Linha): Promise<Linha> {
    const def = this.def(tabela);
    this.validarColunas(tabela, dados);
    const base: Linha = {};
    for (const [col, c] of Object.entries(def.colunas)) base[col] = c.padrao !== undefined ? c.padrao : null;
    const linha: Linha = { ...base, ...this.normalizar(tabela, dados) };
    for (const [col, c] of Object.entries(def.colunas)) {
      if (c.obrigatorio && (linha[col] === null || linha[col] === undefined || linha[col] === '')) {
        throw new ErroDadosFalso('DADOS_VALIDACAO_FALHOU', `Erros de validação: ${tabela}.${col} é obrigatório`);
      }
    }
    const id = this.proximoId.get(tabela)!;
    const agora = this.agora();
    Object.assign(linha, { id, criado_em: agora, atualizado_em: agora });
    if (def.soft_delete) Object.assign(linha, { removido_em: null, removido_por_id: null });
    this.conferirUnicos(tabela, linha);
    this.proximoId.set(tabela, id + 1);
    this.tab(tabela).push(linha);
    return { ...linha };
  }

  async atualizar(tabela: string, id: number, dados: Linha): Promise<Linha | null> {
    const l = this.tab(tabela).find((x) => x.id === Number(id));
    if (!l) return null;
    this.validarColunas(tabela, dados);
    const novo: Linha = { ...l, ...this.normalizar(tabela, dados), atualizado_em: this.agora() };
    for (const [col, c] of Object.entries(this.def(tabela).colunas)) {
      if (c.obrigatorio && col in dados && (novo[col] === null || novo[col] === '')) {
        throw new ErroDadosFalso('DADOS_VALIDACAO_FALHOU', `Erros de validação: ${tabela}.${col} é obrigatório`);
      }
    }
    this.conferirUnicos(tabela, novo, l.id);
    Object.assign(l, novo);
    return { ...l };
  }

  async atualizarSe(tabela: string, id: number, dados: Linha, condicoes: Record<string, any>): Promise<Linha | null> {
    if (!condicoes || Object.keys(condicoes).length === 0) throw new ErroDadosFalso('VOCABULARIO_INVALIDO', 'atualizarSe sem condição');
    const l = this.tab(tabela).find((x) => x.id === Number(id));
    if (!l) return null;
    if (this.def(tabela).soft_delete && l.removido_em !== null) return null;
    if (!this.casaFiltros(l, condicoes, true)) return null;
    return this.atualizar(tabela, id, dados);
  }

  async incrementar(tabela: string, id: number, incrementos: Record<string, number>, condicoes?: Record<string, any>): Promise<Linha | null> {
    const l = this.tab(tabela).find((x) => x.id === Number(id));
    if (!l || (this.def(tabela).soft_delete && l.removido_em !== null)) return null;
    if (condicoes && !this.casaFiltros(l, condicoes, true)) return null;
    const dados: Linha = {};
    for (const [c, n] of Object.entries(incrementos)) dados[c] = Number(l[c] ?? 0) + n;
    return this.atualizar(tabela, id, dados);
  }

  async deletar(tabela: string, id: number): Promise<boolean> {
    const t = this.tab(tabela);
    const i = t.findIndex((x) => x.id === Number(id));
    if (i < 0) return false;
    t.splice(i, 1);
    return true;
  }

  async remover(tabela: string, id: number, removidoPorId?: number): Promise<Linha | null> {
    if (!this.def(tabela).soft_delete) throw new ErroDadosFalso('VOCABULARIO_INVALIDO', `${tabela} sem soft_delete`);
    const l = this.tab(tabela).find((x) => x.id === Number(id));
    if (!l) return null;
    if (l.removido_em === null) Object.assign(l, { removido_em: this.agora(), removido_por_id: removidoPorId ?? null });
    return { ...l };
  }

  async restaurar(tabela: string, id: number): Promise<Linha | null> {
    if (!this.def(tabela).soft_delete) throw new ErroDadosFalso('VOCABULARIO_INVALIDO', `${tabela} sem soft_delete`);
    const l = this.tab(tabela).find((x) => x.id === Number(id));
    if (!l) return null;
    if (l.removido_em !== null) {
      this.conferirUnicos(tabela, { ...l, removido_em: null }, l.id);
      Object.assign(l, { removido_em: null, removido_por_id: null });
    }
    return { ...l };
  }

  async existe(tabela: string, filtros: Record<string, any> = {}): Promise<boolean> {
    const def = this.def(tabela);
    return this.tab(tabela).some((l) => (!def.soft_delete || l.removido_em === null) && this.casaFiltros(l, filtros, true));
  }

  async criarOuAtualizar(tabela: string, chave: string[], dados: Linha): Promise<Linha> {
    const existente = this.tab(tabela).find((l) => chave.every((c) => igual(l[c], dados[c])));
    if (existente) {
      const r = await this.atualizar(tabela, existente.id, dados);
      if (this.def(tabela).soft_delete) Object.assign(existente, { removido_em: null, removido_por_id: null });
      return { ...r!, ...(this.def(tabela).soft_delete ? { removido_em: null, removido_por_id: null } : {}) };
    }
    return this.criar(tabela, dados);
  }

  private selecionar(tabela: string, seletor: { ids?: number[]; filtros?: Record<string, any> }): Linha[] {
    const def = this.def(tabela);
    if (seletor.ids) return this.tab(tabela).filter((l) => seletor.ids!.map(Number).includes(l.id) && (!def.soft_delete || l.removido_em === null));
    if (!seletor.filtros || Object.keys(seletor.filtros).length === 0) throw new ErroDadosFalso('VOCABULARIO_INVALIDO', 'seletor vazio');
    return this.tab(tabela).filter((l) => (!def.soft_delete || l.removido_em === null) && this.casaFiltros(l, seletor.filtros, true));
  }

  async atualizarVarios(tabela: string, seletor: { ids?: number[]; filtros?: Record<string, any> }, dados: Linha): Promise<number> {
    const alvo = this.selecionar(tabela, seletor);
    for (const l of alvo) await this.atualizar(tabela, l.id, dados);
    return alvo.length;
  }

  async removerVarios(tabela: string, seletor: { ids?: number[]; filtros?: Record<string, any> }, removidoPorId?: number): Promise<number> {
    const alvo = this.selecionar(tabela, seletor);
    for (const l of alvo) await this.remover(tabela, l.id, removidoPorId);
    return alvo.length;
  }

  async deletarVarios(tabela: string, seletor: { ids?: number[]; filtros?: Record<string, any> }): Promise<number> {
    const alvo = this.selecionar(tabela, seletor);
    for (const l of alvo) await this.deletar(tabela, l.id);
    return alvo.length;
  }

  async sqlDeclarado(nome: string, params: Record<string, any> = {}): Promise<Linha[]> {
    const f = this.consultas.get(nome);
    if (!f) throw new ErroDadosFalso('SQL_DECLARADO_INVALIDO', `Consulta não registrada no teste: ${nome}`);
    return f(params, this);
  }

  /** Transação: snapshot e ROLLBACK em exceção. O helper de dentro é o mesmo objeto. */
  async transaction<T>(callback: (trx: HelperDados) => Promise<T>): Promise<T> {
    const snapshot = new Map([...this.tabelas].map(([k, v]) => [k, v.map((l) => ({ ...l }))]));
    const ids = new Map(this.proximoId);
    try {
      return await callback(this.helper());
    } catch (e) {
      this.tabelas = snapshot;
      this.proximoId = ids;
      throw e;
    }
  }
}

/** Contexto de request de teste. */
export interface PerfilTeste {
  id?: number;
  nome?: string;
  nivel?: 'leitura' | 'escrita' | 'admin';
  papeis?: string[];
}

export const PERFIS = {
  admin: { id: 1, nome: 'Admin', nivel: 'admin' as const, papeis: [] },
  curador: { id: 2, nome: 'Curadora', nivel: 'escrita' as const, papeis: ['curador'] },
  operador: { id: 3, nome: 'Operador', nivel: 'escrita' as const, papeis: ['operador'] },
  escrita: { id: 4, nome: 'Escrita sem papel', nivel: 'escrita' as const, papeis: [] },
  leitura: { id: 5, nome: 'Leitura', nivel: 'leitura' as const, papeis: [] },
  estrategico: { id: 6, nome: 'Direção', nivel: 'leitura' as const, papeis: ['estrategico'] },
  decisor: { id: 7, nome: 'Decisor', nivel: 'escrita' as const, papeis: ['decisor'] },
  carga: { id: 8, nome: 'Carga', nivel: 'escrita' as const, papeis: ['operador'] },
  autor: { id: 9, nome: 'Autora sem papel', nivel: 'escrita' as const, papeis: [] },
  responsavel: { id: 10, nome: 'Responsável (leitura)', nivel: 'leitura' as const, papeis: [] },
};

const NIVEL_POR_METODO: Record<string, number> = { GET: 0, HEAD: 0, POST: 1, PUT: 1, PATCH: 1, DELETE: 2 };
const ORDEM_NIVEL = { leitura: 0, escrita: 1, admin: 2 };

export interface ServidorTeste {
  url: string;
  dados: DadosFalsos;
  extras: Record<string, unknown>;
  chamar: (metodo: string, caminho: string, corpo?: unknown, perfil?: PerfilTeste) => Promise<{ status: number; corpo: any; texto: string; tipo: string | null }>;
  fechar: () => Promise<void>;
}

/**
 * Sobe um Express com os Routers da app, aplicando o gate método→nível do
 * shell (permissoes.md § contrato uniforme) e injetando `req.contexto`,
 * `req.dados` e o que vier em `extras` (ex.: `arquivos`, `modulos`).
 */
export async function servidor(rotas: Router, dados = new DadosFalsos(), extras: Record<string, unknown> = {}): Promise<ServidorTeste> {
  const app = express();
  app.set('query parser', 'simple');
  app.use(express.json({ limit: '100kb' }));
  let perfilAtual: PerfilTeste = PERFIS.admin;
  app.use((req, res, next) => {
    const nivel = perfilAtual.nivel ?? 'leitura';
    const exigido = NIVEL_POR_METODO[req.method] ?? 3;
    if (exigido > ORDEM_NIVEL[nivel]) {
      res.status(403).json({ erro: true, codigo: 'AUTH_NIVEL_INSUFICIENTE', mensagem: 'nível insuficiente' });
      return;
    }
    req.contexto = {
      usuario: { id: perfilAtual.id ?? 1, nome: perfilAtual.nome ?? 'Teste', tipo: 'nao_informado', natureza: 'nao_informado', avatar_url: null },
      nivelApp: nivel,
      rolesApp: perfilAtual.papeis ?? [],
      permissoesApps: {},
      fuso: 'America/Sao_Paulo',
    };
    req.dados = dados.helper();
    Object.assign(req, extras);
    next();
  });
  app.use(rotas);
  app.use((erro: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ erro: true, codigo: 'ERRO_INTERNO', mensagem: String(erro?.message ?? erro) });
  });
  const srv = app.listen(0);
  await new Promise<void>((ok) => srv.once('listening', () => ok()));
  const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  return {
    url,
    dados,
    extras,
    async chamar(metodo, caminho, corpo, perfil = PERFIS.admin) {
      perfilAtual = perfil;
      const r = await fetch(url + caminho, {
        method: metodo,
        headers: corpo !== undefined ? { 'content-type': 'application/json' } : {},
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      });
      const texto = await r.text();
      let json: any = null;
      try {
        json = JSON.parse(texto);
      } catch {
        json = null;
      }
      return { status: r.status, corpo: json, texto, tipo: r.headers.get('content-type') };
    },
    fechar: () => new Promise<void>((ok) => srv.close(() => ok())),
  };
}

/** Percorre a pilha de um Router e devolve as rotas registradas, com a marca de `rota()`. */
export function rotasRegistradas(router: Router): { metodo: string; caminho: string; envolvida: boolean }[] {
  const saida: { metodo: string; caminho: string; envolvida: boolean }[] = [];
  const marca = Symbol.for('intel-imob.rota');
  const visitar = (pilha: any[]) => {
    for (const camada of pilha) {
      if (camada.route) {
        for (const sub of camada.route.stack) {
          saida.push({ metodo: String(sub.method).toUpperCase(), caminho: camada.route.path, envolvida: Boolean(sub.handle?.[marca]) });
        }
      } else if (camada.handle?.stack) {
        visitar(camada.handle.stack);
      }
    }
  };
  visitar((router as any).stack);
  return saida;
}
