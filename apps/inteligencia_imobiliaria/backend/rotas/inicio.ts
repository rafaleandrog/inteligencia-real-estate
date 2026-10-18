import { Router } from 'express';
import { rota } from './comum';
import { AREAS } from '../../comum/telas';
import manifesto from '../../manifesto.json';

export const inicio: Router = Router();

// Tela Início (spec 10.9): versão e atalhos para as áreas que já existem.
inicio.get(
  '/inicio',
  rota((_req, res) => {
    res.json({
      versao: manifesto.versao,
      atalhos: AREAS.map(({ titulo, rota: r, icone, descricao, disponivel }) => ({ titulo, rota: r, icone, descricao, disponivel })),
    });
  }),
);
