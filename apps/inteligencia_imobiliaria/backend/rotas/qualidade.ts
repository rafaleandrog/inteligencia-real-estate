import { Router } from 'express';
import { ErroApp, exigirPapel, idDaRota, idsQuery, naoEncontrado, paginacao, rota, textoQuery, usuarioId } from './comum';
import { querCsv, responderCsv } from './exportar';

export const qualidade: Router = Router();

const COLUNAS = ['id', 'tabela', 'registro_id', 'campo', 'codigo', 'severidade', 'mensagem', 'valor', 'origem', 'detectado_em', 'resolvido_em', 'resolvido_por_nome', 'importacao_id'];

/** Achados de qualidade (spec 6.9): por padrão, os em aberto. */
qualidade.get('/qualidade', rota(async (req, res) => {
  const filtros: Record<string, unknown> = {};
  for (const k of ['tabela', 'codigo', 'severidade', 'origem']) {
    const v = textoQuery(req, k);
    if (v) filtros[k] = v;
  }
  const importacao = idsQuery(req, 'importacao_id');
  if (importacao) filtros.importacao_id = importacao;
  const resolvido = textoQuery(req, 'resolvido') ?? 'false';
  if (resolvido !== 'todos') filtros['resolvido_em[nulo]'] = resolvido === 'false' ? 'true' : 'false';
  if (querCsv(req)) {
    responderCsv(res, 'qualidade', COLUNAS, (await req.dados!.varrerTudo('achados_qualidade', { filtros })).reverse());
    return;
  }
  const { pagina, por_pagina } = paginacao(req);
  res.json(await req.dados!.listar('achados_qualidade', { filtros, pagina, por_pagina, ordenar: 'id', ordem: 'desc' }));
}));

qualidade.patch('/qualidade/:id/resolver', rota(async (req, res) => {
  exigirPapel(req, 'operador');
  const id = idDaRota(req);
  const atual = await req.dados!.buscar('achados_qualidade', id);
  if (!atual) throw naoEncontrado();
  if (atual.resolvido_em) throw new ErroApp(409, 'ACHADO_JA_RESOLVIDO', 'Este achado já foi resolvido.');
  const r = await req.dados!.atualizarSe('achados_qualidade', id, { resolvido_em: new Date().toISOString(), resolvido_por_id: usuarioId(req) }, { 'resolvido_em[nulo]': 'true' });
  if (!r) throw new ErroApp(409, 'ACHADO_JA_RESOLVIDO', 'Este achado já foi resolvido.');
  res.json(r);
}));
