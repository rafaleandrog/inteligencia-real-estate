import { Router } from 'express';
import { ErroApp, rota, usuarioId } from './comum';

/**
 * Rotas pessoais (spec 4.2, D-80): montadas pelo shell em
 * `/api/inteligencia_imobiliaria/pessoal/*`, liberam escrita a `leitura` e só
 * gravam em tabela `pessoal`, na linha do próprio usuário.
 */
export const rotasPessoais: Router = Router();

const ACOES = ['abrir', 'exportar', 'gerar_ficha', 'gerar_analise', 'salvar_area', 'simular'];

/** Telemetria mínima de uso por tela (spec 5.23, D-72). */
rotasPessoais.post('/uso', rota(async (req, res) => {
  const sub = typeof req.body?.sub_rota === 'string' ? req.body.sub_rota.slice(0, 200) : '';
  const acao = String(req.body?.acao ?? 'abrir');
  if (!sub.startsWith('/') || !ACOES.includes(acao)) throw new ErroApp(422, 'DADOS_VALIDACAO_FALHOU', 'Uso inválido.', ['sub_rota começa com / e acao é do vocabulário.']);
  await req.dados!.criar('uso_eventos', { usuario_id: usuarioId(req), sub_rota: sub.split('?')[0], acao, em: new Date().toISOString() });
  res.status(204).end();
}));
