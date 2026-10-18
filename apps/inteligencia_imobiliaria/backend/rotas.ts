import '@urbiverso/sdk/express';
import { Router } from 'express';
import { garantirSemente } from './semente';
import { inicio } from './rotas/inicio';
import { importacoes } from './rotas/importacoes';
import { territorio } from './rotas/territorio';
import { qualidade } from './rotas/qualidade';

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
