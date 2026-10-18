import { Router, type Request } from 'express';
import { precoM2 } from '../../comum/normalizar';
import { orientacao } from '../../comum/anuncios';
import { resumo } from '../metricas/estatistica';
import { rota, textoQuery } from './comum';
import { filtrosAnuncios } from './mercado-cadastro';

export const mapa: Router = Router();

/** Teto de pontos de anúncio por resposta; acima disso, contagens por localidade (spec 6.2). */
export const TETO_PONTOS = 5000;

async function anunciosDoRecorte(req: Request) {
  const { filtros, busca, buscaColunas } = await filtrosAnuncios(req);
  return req.dados!.varrerTudo('anuncios', { filtros, ...(busca && buscaColunas ? { busca_ou: { colunas: buscaColunas, termo: busca } } : {}) });
}

const exata = (p: unknown) => p === 'exata_fonte' || p === 'manual';

/** Versão enxuta para o mapa (spec 6.2). */
mapa.get('/anuncios/mapa', rota(async (req, res) => {
  const linhas = await anunciosDoRecorte(req);
  if (linhas.length > TETO_PONTOS) {
    const porLocalidade = new Map<number, number>();
    for (const a of linhas) porLocalidade.set(a.localidade_id, (porLocalidade.get(a.localidade_id) ?? 0) + 1);
    res.json({ agrupado: true, total: linhas.length, contagens: [...porLocalidade].map(([localidade_id, n]) => ({ localidade_id, n })) });
    return;
  }
  res.json({
    agrupado: false,
    total: linhas.length,
    dados: linhas.map((a) => ({
      id: a.id,
      latitude: Number(a.latitude),
      longitude: Number(a.longitude),
      preco_m2: precoM2(a.preco_pedido_brl, a.area_m2, a.preco_m2_informado_brl).valor,
      preco_pedido_brl: a.preco_pedido_brl === null ? null : Number(a.preco_pedido_brl),
      tipo_imovel: a.tipo_imovel,
      orientacao: orientacao(a.tipo_imovel),
      status: a.status,
      precisao_coordenada: a.precisao_coordenada,
      titulo: a.titulo,
      quartos: a.quartos,
      localidade_id: a.localidade_id,
    })),
  });
}));

/**
 * KPIs do recorte (spec 6.2, 10.2): contagem, mediana de preço e de preço/m²,
 * P25–P75 e "sem coordenada exata", com a supressão por amostra.
 */
mapa.get('/anuncios/kpis', rota(async (req, res) => {
  const linhas = await anunciosDoRecorte(req);
  const precosM2 = linhas.map((a) => precoM2(a.preco_pedido_brl, a.area_m2, a.preco_m2_informado_brl).valor);
  const precos = linhas.map((a) => a.preco_pedido_brl);
  const pm2 = resumo(precosM2);
  const preco = resumo(precos);
  res.json({
    anuncios: linhas.length,
    sem_coordenada_exata: linhas.filter((a) => !exata(a.precisao_coordenada)).length,
    amostra_n: pm2.n,
    preco_m2: pm2,
    preco: preco,
    retratos: null,
    indisponivel: { retratos: { motivo: 'fase_futura', fase: '3' } },
  });
}));

function pontosDe(linhas: Record<string, any>[], campos: string[]) {
  return linhas
    .filter((l) => l.latitude !== null && l.longitude !== null)
    .map((l) => ({ id: l.id, latitude: Number(l.latitude), longitude: Number(l.longitude), ...Object.fromEntries(campos.map((c) => [c, l[c] ?? null])) }));
}

mapa.get('/lancamentos/mapa', rota(async (req, res) => {
  const filtros: Record<string, unknown> = { espacial_utilizavel: true };
  const estagio = textoQuery(req, 'estagio_vendas');
  if (estagio) filtros.estagio_vendas = estagio;
  const linhas = await req.dados!.varrerTudo('lancamentos', { filtros });
  res.json({ total: linhas.length, dados: pontosDe(linhas, ['nome', 'estagio_vendas', 'incorporadora', 'preco_atual_brl', 'localidade_id']) });
}));

mapa.get('/ancoras/mapa', rota(async (req, res) => {
  const filtros: Record<string, unknown> = {};
  for (const k of ['grupo', 'segmento', 'categoria']) {
    const v = textoQuery(req, k);
    if (v) filtros[k] = v;
  }
  const linhas = await req.dados!.varrerTudo('ancoras', { filtros });
  res.json({ total: linhas.length, dados: pontosDe(linhas, ['nome', 'categoria', 'grupo', 'segmento', 'operador', 'localidade_id']) });
}));
