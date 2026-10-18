import type { HelperDados } from '@urbiverso/sdk';
import type { Request } from 'express';
import { conflitoVersao, ErroApp, naoEncontrado, usuarioId } from './comum';

type Linha = Record<string, any>;

function igual(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) return new Date(a as any).getTime() === new Date(b as any).getTime();
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  if (!Number.isNaN(Number(a)) && !Number.isNaN(Number(b)) && String(a).trim() !== '' && String(b).trim() !== '') return Number(a) === Number(b);
  return String(a) === String(b);
}

/** `{ campo: { antes, depois } }` só do que mudou. */
export function diferenca(antes: Linha | null, depois: Record<string, unknown>): Record<string, { antes: unknown; depois: unknown }> {
  const d: Record<string, { antes: unknown; depois: unknown }> = {};
  for (const [k, v] of Object.entries(depois)) {
    if (k === 'versao' || k === 'atualizado_em') continue;
    const a = antes ? antes[k] : null;
    if (!igual(a, v)) d[k] = { antes: a ?? null, depois: v ?? null };
  }
  return d;
}

/** Grava a linha de `alteracoes_cadastro` (spec 5.11), sempre dentro da transação da escrita. */
export async function registrarAlteracao(
  trx: HelperDados,
  req: Request,
  tabela: string,
  registroId: number,
  acao: 'criado' | 'editado' | 'removido' | 'restaurado' | 'destruido',
  campos: Record<string, unknown> | null,
  motivo?: string | null,
): Promise<void> {
  await trx.criar('alteracoes_cadastro', {
    tabela,
    registro_id: registroId,
    acao,
    campos,
    autor_id: usuarioId(req),
    em: new Date().toISOString(),
    motivo: motivo ? String(motivo).slice(0, 500) : null,
  });
}

/** Só os campos permitidos, sem `undefined`. */
export function escolher(corpo: unknown, permitidos: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!corpo || typeof corpo !== 'object') return out;
  for (const k of permitidos) {
    const v = (corpo as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v === '' ? null : v;
  }
  return out;
}

export function versaoDoCorpo(req: Request): number {
  const v = Number(req.body?.versao);
  if (!Number.isInteger(v) || v < 1) throw new ErroApp(422, 'VERSAO_OBRIGATORIA', 'Informe a versão do registro que a tela leu (versao).');
  return v;
}

/** Cria um registro de cadastro e a alteração `criado`, numa transação. */
export async function criarCadastro(req: Request, tabela: string, dados: Record<string, unknown>, depois?: (trx: HelperDados, criado: Linha) => Promise<void>): Promise<Linha> {
  return req.dados!.transaction(async (trx) => {
    const criado = await trx.criar(tabela, dados);
    await registrarAlteracao(trx, req, tabela, Number(criado.id), 'criado', diferenca(null, dados));
    if (depois) await depois(trx, criado);
    return criado;
  });
}

/**
 * Edita com lock otimista (spec 6, D-88): `buscar` antes (o `atualizar` do
 * framework alcança removido), `atualizarSe` com `{ versao }` e a versão
 * incrementada; perdeu a corrida → `409 CONFLITO_VERSAO`.
 */
export async function editarCadastro(
  req: Request,
  tabela: string,
  id: number,
  patch: Record<string, unknown>,
  depois?: (trx: HelperDados, antes: Linha, atualizado: Linha) => Promise<void>,
): Promise<Linha> {
  const versao = versaoDoCorpo(req);
  const atual = await req.dados!.buscar(tabela, id);
  if (!atual) {
    const removido = await req.dados!.buscar(tabela, id, { incluir_removidos: true });
    if (removido) throw new ErroApp(404, 'REGISTRO_REMOVIDO', 'O registro foi removido; restaure-o antes de editar.');
    throw naoEncontrado();
  }
  if (Number(atual.versao) !== versao) throw conflitoVersao();
  const campos = diferenca(atual, patch);
  return req.dados!.transaction(async (trx) => {
    const r = await trx.atualizarSe(tabela, id, { ...patch, versao: versao + 1 }, { versao });
    if (!r) throw conflitoVersao();
    if (Object.keys(campos).length) await registrarAlteracao(trx, req, tabela, id, 'editado', campos, req.body?.motivo);
    if (depois) await depois(trx, atual, r);
    return r;
  });
}

export async function removerCadastro(req: Request, tabela: string, id: number): Promise<Linha> {
  const atual = await req.dados!.buscar(tabela, id, { incluir_removidos: true });
  if (!atual) throw naoEncontrado();
  if (atual.removido_em) return atual;
  return req.dados!.transaction(async (trx) => {
    const r = await trx.remover(tabela, id, usuarioId(req));
    if (!r) throw naoEncontrado();
    await registrarAlteracao(trx, req, tabela, id, 'removido', null, req.body?.motivo);
    return r;
  });
}

export async function restaurarCadastro(req: Request, tabela: string, id: number): Promise<Linha> {
  const atual = await req.dados!.buscar(tabela, id, { incluir_removidos: true });
  if (!atual) throw naoEncontrado();
  if (!atual.removido_em) return atual;
  return req.dados!.transaction(async (trx) => {
    const r = await trx.restaurar(tabela, id);
    if (!r) throw naoEncontrado();
    await registrarAlteracao(trx, req, tabela, id, 'restaurado', null, req.body?.motivo);
    return r;
  });
}

/** Histórico de um registro (spec 10.6). */
export async function historico(req: Request, tabela: string, id: number): Promise<Linha[]> {
  const r = await req.dados!.listar('alteracoes_cadastro', { filtros: { tabela, registro_id: id }, ordenar: 'id', ordem: 'desc', por_pagina: 100 });
  return r.dados;
}
