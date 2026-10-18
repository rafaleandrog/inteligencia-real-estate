import { Router } from 'express';
import { idDaRota, naoEncontrado, paginacao, rota, textoQuery } from './comum';

export const coletas: Router = Router();

/** Execuções com contadores (spec 6.9, 10.7): importações hoje; rotinas a partir da fase 3. */
coletas.get('/coletas', rota(async (req, res) => {
  const filtros: Record<string, unknown> = {};
  for (const k of ['tipo', 'status', 'disparo']) {
    const v = textoQuery(req, k);
    if (v) filtros[k] = v;
  }
  const { pagina, por_pagina } = paginacao(req);
  res.json(await req.dados!.listar('coletas', { filtros, pagina, por_pagina, ordenar: 'id', ordem: 'desc' }));
}));

coletas.get('/coletas/:id', rota(async (req, res) => {
  const c = await req.dados!.buscar('coletas', idDaRota(req));
  if (!c) throw naoEncontrado();
  res.json(c);
}));
