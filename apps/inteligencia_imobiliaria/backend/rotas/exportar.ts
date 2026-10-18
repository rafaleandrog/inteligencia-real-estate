import type { Request, Response } from 'express';
import { gerarCsv } from '../../comum/csv';
import { ErroApp } from './comum';

export const TETO_EXPORTACAO = 50_000;

export function querCsv(req: Request): boolean {
  return req.query.formato === 'csv';
}

/**
 * Exportação CSV de uma lista (spec 6, 11.2): BOM, `;`, sem paginação, teto de
 * 50 000 linhas, e o nome do arquivo com tabela, recorte e data.
 */
export function responderCsv(res: Response, base: string, colunas: string[], linhas: Record<string, unknown>[], recorte = ''): void {
  if (linhas.length > TETO_EXPORTACAO) {
    throw new ErroApp(413, 'EXPORTACAO_GRANDE', `A exportação passa de ${TETO_EXPORTACAO} linhas.`, ['Estreite o filtro e exporte de novo.']);
  }
  const data = new Date().toISOString().slice(0, 10);
  const nome = [base, recorte.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase(), data].filter(Boolean).join('_');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}.csv"`);
  res.send(gerarCsv(colunas, linhas));
}
