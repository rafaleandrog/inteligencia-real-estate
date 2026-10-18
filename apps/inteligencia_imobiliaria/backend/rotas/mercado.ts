import { Router, type Request } from 'express';
import { acumuladoIvv, mesesIvv, METRICAS_IVV, periodoIvv, regionalIvv, sazonalidadeIvv, serieMensal } from '../mercado/ivv';
import { ErroApp, numeroQuery, rota, textoQuery } from './comum';
import { cidadeDoRequest } from './territorio-comum';

type Linha = Record<string, any>;

export const mercado: Router = Router();

const MES = /^\d{4}-\d{2}$/;

function mesQuery(req: Request, nome: string): string | undefined {
  const v = textoQuery(req, nome);
  if (v === undefined) return undefined;
  if (!MES.test(v)) throw new ErroApp(400, 'FILTRO_INVALIDO', `${nome} deve ser AAAA-MM.`);
  return v;
}

/** Linhas de `ivv_mensal` da cidade, no escopo pedido (segmento e mercado da fonte). */
async function linhasIvv(req: Request): Promise<Linha[]> {
  const cidade = await cidadeDoRequest(req);
  const filtros: Record<string, unknown> = { cidade_id: cidade.id };
  const segmento = textoQuery(req, 'segmento');
  const mercadoQ = textoQuery(req, 'mercado');
  if (segmento) filtros.escopo_segmento = segmento;
  if (mercadoQ) filtros.escopo_mercado = mercadoQ;
  return req.dados!.varrerTudo('ivv_mensal', { filtros, ordenar: 'mes_referencia', ordem: 'asc' });
}

function procedencia(linhas: Linha[]) {
  const ult = linhas.at(-1);
  return ult ? { fonte: ult.fonte_publicador ?? ult.fonte_codigo ?? null, verificado_em: ult.verificado_em ?? null, nota: ult.nota_cobertura ?? null, importacao_id: ult.importacao_id ?? null } : null;
}

/** Série mensal com a natureza de cada métrica (6.5). */
mercado.get('/mercado/ivv', rota(async (req, res) => {
  const linhas = await linhasIvv(req);
  const { meses, avisos } = mesesIvv(linhas);
  res.json({ metricas: METRICAS_IVV, meses: serieMensal(meses, mesQuery(req, 'de'), mesQuery(req, 'ate')), avisos, procedencia: procedencia(linhas) });
}));

/** Agregação do período por natureza, os seis derivados e a comparação. */
mercado.get('/mercado/ivv/periodo', rota(async (req, res) => {
  const linhas = await linhasIvv(req);
  const { meses } = mesesIvv(linhas);
  const comparar = textoQuery(req, 'comparar') ?? 'nenhum';
  if (!['anterior', 'ano_anterior', 'nenhum'].includes(comparar)) throw new ErroApp(400, 'FILTRO_INVALIDO', 'comparar: anterior, ano_anterior ou nenhum.');
  const r = periodoIvv(meses, { modo: textoQuery(req, 'modo'), ano: numeroQuery(req, 'ano'), mes: numeroQuery(req, 'mes'), de: mesQuery(req, 'de'), ate: mesQuery(req, 'ate') }, comparar);
  res.json({ metricas: METRICAS_IVV, ...r, procedencia: procedencia(linhas) });
}));

mercado.get('/mercado/ivv/acumulado', rota(async (req, res) => {
  const { meses } = mesesIvv(await linhasIvv(req));
  const ultimo = meses.at(-1)?.reference_date?.slice(0, 4);
  const ano = numeroQuery(req, 'ano') ?? (ultimo ? Number(ultimo) : new Date().getFullYear());
  res.json({ ano, series: acumuladoIvv(meses, ano) });
}));

mercado.get('/mercado/ivv/sazonalidade', rota(async (req, res) => {
  const { meses } = mesesIvv(await linhasIvv(req));
  const metrica = textoQuery(req, 'metrica') ?? 'ivv_pct';
  const anos = sazonalidadeIvv(meses, metrica);
  if (!anos) throw new ErroApp(400, 'METRICA_DESCONHECIDA', `Métrica desconhecida: ${metrica}.`);
  res.json({ metrica, anos });
}));

/** Retrato por localidade (6.5): ranking, régua `DF Total`, matriz e mapa de calor. */
mercado.get('/mercado/ivv-regional', rota(async (req, res) => {
  const cidade = await cidadeDoRequest(req);
  const filtros: Record<string, unknown> = { cidade_id: cidade.id };
  const mes = mesQuery(req, 'mes');
  if (mes) filtros.mes_referencia = `${mes}-01`;
  const linhas = await req.dados!.varrerTudo('ivv_regional', { filtros });
  const localidadeDe = new Map<string, number | null>(linhas.map((l) => [String(l.nome_regiao_fonte), l.localidade_id ?? null]));
  const meses = [...new Set((await req.dados!.varrerTudo('ivv_regional', { filtros: { cidade_id: cidade.id, faixa_quartos: 'TOTAL' } })).map((l) => String(l.mes_referencia).slice(0, 7)))].sort();
  res.json({ meses_disponiveis: meses, ...regionalIvv(linhas, textoQuery(req, 'faixa_quartos') ?? 'TOTAL', localidadeDe) });
}));
