import '@urbiverso/sdk/express';
import { Router } from 'express';
import { inicio } from './rotas/inicio';

/** Router autenticado, montado pelo shell em /api/inteligencia_imobiliaria/ (spec 4.2). */
export const rotas: Router = Router();

rotas.use(inicio);
