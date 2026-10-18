import type { Request } from 'express';
import { ErroApp, textoQuery } from './comum';

/**
 * Cidade do request (spec 6): `?cidade=<slug>`; com uma cidade só, é opcional
 * e resolve para ela.
 */
export async function cidadeDoRequest(req: Request): Promise<Record<string, any>> {
  const slug = textoQuery(req, 'cidade') ?? (typeof req.body?.cidade === 'string' ? req.body.cidade : undefined);
  const r = await req.dados!.listar('cidades', { filtros: { ativa: true, ...(slug ? { slug } : {}) }, ordenar: 'id', ordem: 'asc', por_pagina: 2 });
  if (r.dados.length === 0) throw new ErroApp(404, 'REGISTRO_NAO_ENCONTRADO', slug ? `Cidade não encontrada: ${slug}` : 'Nenhuma cidade ativa.');
  if (!slug && r.total > 1) throw new ErroApp(400, 'CIDADE_OBRIGATORIA', 'Há mais de uma cidade: informe ?cidade=<slug>.');
  return r.dados[0];
}
