import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Erro de domínio da app (spec 6.22). O invólucro `rota()` o transforma em
 * `{ erro: true, codigo, mensagem, detalhes }` com o status dele. `detalhes`
 * é sempre lista de texto acionável (C-69), nunca objeto.
 */
export class ErroApp extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly detalhes?: string[];

  constructor(status: number, codigo: string, mensagem: string, detalhes?: string[]) {
    super(mensagem);
    this.name = 'ErroApp';
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}

export const naoEncontrado = (): ErroApp =>
  new ErroApp(404, 'REGISTRO_NAO_ENCONTRADO', 'Registro não encontrado.');

export const conflitoVersao = (): ErroApp =>
  new ErroApp(409, 'CONFLITO_VERSAO', 'Outra pessoa alterou este registro depois que você o abriu.', [
    'Recarregue o registro e refaça a sua alteração sobre a versão atual.',
  ]);

/** Marca que o roteador usa para conferir, por teste, que toda rota passa por `rota()`. */
export const MARCA_ROTA = Symbol.for('intel-imob.rota');

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;

/**
 * Invólucro de toda rota da app (spec 6, T2). O Express 4 do SDK não captura
 * promessa rejeitada: sem isto, exceção num handler async deixa a request
 * pendurada. `ErroApp` vira o envelope da app; erro de plataforma com
 * `status` e `codigo` segue com eles; violação de CHECK (23514) vira
 * `422 DADOS_VALOR_INVALIDO`; chave única (23505) vira `409 DADOS_UNIQUE_VIOLADO`;
 * a validação do `req.dados` ("Erros de validação: …", referência que não
 * existe) vira `422 DADOS_VALIDACAO_FALHOU`; o resto vai a `next(erro)` e o shell responde
 * `500 ERRO_INTERNO` com o id da ocorrência.
 */
export function rota(fn: Handler): RequestHandler {
  const envolvida: RequestHandler = async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (erro) {
      responderErro(erro, res, next);
    }
  };
  (envolvida as unknown as Record<symbol, boolean>)[MARCA_ROTA] = true;
  return envolvida;
}

export function responderErro(erro: unknown, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(erro);
    return;
  }
  const e = erro as { name?: string; status?: unknown; codigo?: unknown; message?: string; detalhes?: unknown; code?: unknown; constraint?: unknown };
  if (e?.name === 'ErroApp' && typeof e.status === 'number' && typeof e.codigo === 'string') {
    res.status(e.status).json({ erro: true, codigo: e.codigo, mensagem: e.message, ...(e.detalhes ? { detalhes: e.detalhes } : {}) });
    return;
  }
  if (e?.code === '23514') {
    const restricao = typeof e.constraint === 'string' ? e.constraint : '';
    res.status(422).json({
      erro: true,
      codigo: 'DADOS_VALOR_INVALIDO',
      mensagem: 'Um valor não respeita a regra declarada da coluna.',
      ...(restricao ? { detalhes: [`Restrição violada: ${restricao}`] } : {}),
    });
    return;
  }
  if (e?.code === '23505') {
    const restricao = typeof e.constraint === 'string' ? e.constraint : '';
    res.status(409).json({
      erro: true,
      codigo: 'DADOS_UNIQUE_VIOLADO',
      mensagem: 'Já existe um registro com esse valor único.',
      ...(restricao ? { detalhes: [`Restrição violada: ${restricao}`] } : {}),
    });
    return;
  }
  // banco-de-dados.md: no `req.dados`, opções, intervalo, obrigatório e geometria chegam como exceção "Erros de validação: …".
  if (typeof e?.message === 'string' && e.status === undefined && /^Erros de validação|não encontrado em "|DADOS_REFERENCIA_INVALIDA/.test(e.message)) {
    res.status(422).json({ erro: true, codigo: 'DADOS_VALIDACAO_FALHOU', mensagem: 'Dados recusados pela validação.', detalhes: [e.message] });
    return;
  }
  if (typeof e?.status === 'number' && e.status >= 400 && e.status < 500 && typeof e.codigo === 'string') {
    const detalhes = Array.isArray(e.detalhes) ? e.detalhes.map((d) => (typeof d === 'string' ? d : JSON.stringify(d))) : undefined;
    res.status(e.status).json({ erro: true, codigo: e.codigo, mensagem: e.message ?? e.codigo, ...(detalhes ? { detalhes } : {}) });
    return;
  }
  next(erro);
}

/** Papéis declarados no manifesto (spec 4.1). */
export type Papel = 'estrategico' | 'decisor' | 'curador' | 'operador';

export function temPapel(req: Request, papel: Papel): boolean {
  if (req.contexto?.nivelApp === 'admin') return true;
  return req.contexto?.rolesApp?.includes(papel) ?? false;
}

/**
 * Gate de papel (3ª camada). O admin da app passa sempre: `nivelApp: 'admin'`
 * não confere os papéis declarados, então a regra "no MVP o admin faz tudo"
 * (spec 4.1) é escrita aqui.
 */
export function exigirPapel(req: Request, ...papeis: Papel[]): void {
  if (papeis.some((p) => temPapel(req, p))) return;
  throw new ErroApp(403, 'PAPEL_EXIGIDO', `Esta ação exige o papel ${papeis.join(' ou ')}.`);
}

export function usuarioId(req: Request): number {
  const id = req.contexto?.usuario?.id;
  if (typeof id !== 'number') throw new ErroApp(401, 'SEM_USUARIO', 'Requisição sem usuário.');
  return id;
}

/** `por_pagina` limitado a 100 na borda da app (spec 6). */
export function paginacao(req: Request): { pagina: number; por_pagina: number } {
  const pagina = Math.max(1, Math.trunc(Number(req.query.pagina)) || 1);
  const por_pagina = Math.min(Math.max(1, Math.trunc(Number(req.query.por_pagina)) || 20), 100);
  return { pagina, por_pagina };
}

export function idDaRota(req: Request, nome = 'id'): number {
  const id = Number(req.params[nome]);
  if (!Number.isInteger(id) || id <= 0) throw naoEncontrado();
  return id;
}

export function textoQuery(req: Request, nome: string): string | undefined {
  const v = req.query[nome];
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

export function numeroQuery(req: Request, nome: string): number | undefined {
  const t = textoQuery(req, nome);
  if (t === undefined) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Ordena em memória o resultado de `varrerTudo`. A varredura pagina por
 * OFFSET e só é estável na ordem padrão (`id asc`); passar `ordenar` por
 * coluna não única pode repetir ou pular linha (banco-de-dados.md, varrerTudo).
 */
export function ordenarEmMemoria<T extends Record<string, unknown>>(linhas: T[], coluna: string, ordem: 'asc' | 'desc' = 'asc'): T[] {
  const chave = (v: unknown): number | string | null => {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number') return v;
    const n = Number(v);
    return typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && Number.isFinite(n) ? n : String(v);
  };
  const sinal = ordem === 'desc' ? -1 : 1;
  return [...linhas].sort((a, b) => {
    const x = chave(a[coluna]);
    const y = chave(b[coluna]);
    if (x === null || y === null) return x === y ? Number(a.id) - Number(b.id) : x === null ? 1 : -1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR');
    return c ? c * sinal : Number(a.id) - Number(b.id);
  });
}
