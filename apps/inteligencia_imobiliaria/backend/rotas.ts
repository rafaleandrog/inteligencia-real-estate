import '@urbiverso/sdk/express';
import { Router } from 'express';
import type { AoIniciarApp } from '@urbiverso/sdk';
import { garantirSemente } from './semente';
import { inicio } from './rotas/inicio';
import { importacoes } from './rotas/importacoes';
import { territorio } from './rotas/territorio';
import { qualidade } from './rotas/qualidade';
import { mercadoCadastro } from './rotas/mercado-cadastro';
import { mapa } from './rotas/mapa';
import { coletas } from './rotas/coletas';
import { CONTAGENS_LOCALIDADE } from './rotas/territorio';
export { rotasPessoais } from './rotas/pessoais';

/**
 * Hook de ciclo de vida (spec 4.2): dispara a semente memoizada no boot. As
 * rotas aguardam a mesma promise, porque o aoIniciar roda depois do listen.
 */
export const aoIniciar: AoIniciarApp = async (ctx) => {
  if (!ctx.dados) return;
  await garantirSemente(ctx.dados).catch(() => undefined);
};

/** Router autenticado, montado pelo shell em /api/inteligencia_imobiliaria/ (spec 4.2). */
export const rotas: Router = Router();

// O aoIniciar roda depois do listen: toda rota aguarda a mesma semente memoizada (spec 4.2, D-112).
rotas.use((req, _res, next) => {
  if (!req.dados) return next();
  garantirSemente(req.dados).then(() => next(), next);
});

rotas.use(inicio);
rotas.use(importacoes);
rotas.use(territorio);
rotas.use(qualidade);
rotas.use(coletas);
// O mapa vem antes do cadastro: `/anuncios/mapa` não pode cair em `/anuncios/:id`.
rotas.use(mapa);
rotas.use(mercadoCadastro);

CONTAGENS_LOCALIDADE.push(
  { chave: 'anuncios_ativos', tabela: 'anuncios', filtros: { status: 'ativo' } },
  { chave: 'lancamentos', tabela: 'lancamentos' },
  { chave: 'ancoras', tabela: 'ancoras' },
);
