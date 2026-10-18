import { Router, type Request } from 'express';
import { graficosDf, linhasFipezap, localidadesFipezap, pareadoFipezap, pareadoPorLocalidade } from '../mercado/fipezap';
import { acumuladoIvv, mesesIvv, METRICAS_IVV, periodoIvv, regionalIvv, sazonalidadeIvv, serieMensal } from '../mercado/ivv';
import { ErroApp, numeroQuery, ordenarEmMemoria, rota, textoQuery } from './comum';
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
  return ordenarEmMemoria(await req.dados!.varrerTudo('ivv_mensal', { filtros }), 'mes_referencia');
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

// ------------------------------------------------------------------ FipeZap

async function linhasFipezapDaCidade(req: Request): Promise<Linha[]> {
  const cidade = await cidadeDoRequest(req);
  const linhas = ordenarEmMemoria(await req.dados!.varrerTudo('fipezap_mensal', { filtros: { cidade_id: cidade.id } }), 'mes_referencia');
  // O código da localidade (ra_geo_id) vai junto para o rótulo; nada é fundido.
  const ids = [...new Set(linhas.map((l) => l.localidade_id).filter(Boolean))];
  const locs = ids.length ? await req.dados!.varrerTudo('localidades', { filtros: { id: ids } }) : [];
  const codigo = new Map(locs.map((l) => [l.id, l.codigo]));
  return linhas.map((l) => ({ ...l, localidade_codigo: codigo.get(l.localidade_id) ?? null }));
}

function segmentoQuery(req: Request): string {
  const s = textoQuery(req, 'segmento') ?? 'residencial';
  if (!['residencial', 'comercial'].includes(s)) throw new ErroApp(400, 'FILTRO_INVALIDO', 'segmento: residencial ou comercial.');
  return s;
}

/** Série (6.5): `total` e `localidade` separados; os oito gráficos do DF do site. */
mercado.get('/mercado/fipezap', rota(async (req, res) => {
  const brutas = await linhasFipezapDaCidade(req);
  const { linhas, avisos } = linhasFipezap(brutas);
  const de = mesQuery(req, 'de');
  const ate = mesQuery(req, 'ate');
  const filtro = (r: Linha) => (!de || r.period_id >= de) && (!ate || r.period_id <= ate)
    && (!textoQuery(req, 'segmento') || r.segment_scope === segmentoQuery(req).toUpperCase())
    && (!textoQuery(req, 'tipo_transacao') || r.transaction_type === String(textoQuery(req, 'tipo_transacao')).toUpperCase())
    && (!textoQuery(req, 'localidade') || r.source_locality_name === textoQuery(req, 'localidade'));
  const recorte = linhas.filter(filtro);
  const meses = [...new Set(linhas.filter((r: Linha) => r.geography_scope === 'DF_TOTAL').map((r: Linha) => r.period_id))].sort();
  res.json({
    meses,
    total: recorte.filter((r: Linha) => r.geography_scope === 'DF_TOTAL'),
    localidade: textoQuery(req, 'escopo') === 'total' ? [] : recorte.filter((r: Linha) => r.geography_scope === 'LOCALIDADE'),
    graficos_df: graficosDf(linhas, de, ate),
    avisos,
  });
}));

/** Localidades com dado no segmento, com classificação e rótulo desambiguado (submercado dentro de RA). */
mercado.get('/mercado/fipezap/localidades', rota(async (req, res) => {
  const { linhas } = linhasFipezap(await linhasFipezapDaCidade(req));
  res.json({ dados: localidadesFipezap(pareadoPorLocalidade(linhas), segmentoQuery(req)) });
}));

/** Venda × locação do mesmo mês por localidade, com yield e o ranking do mês. */
mercado.get('/mercado/fipezap/pareado', rota(async (req, res) => {
  const localidade = textoQuery(req, 'localidade');
  if (!localidade) throw new ErroApp(400, 'FILTRO_INVALIDO', 'Informe a localidade (nome da fonte).');
  const { linhas } = linhasFipezap(await linhasFipezapDaCidade(req));
  res.json({ localidade, ...pareadoFipezap(pareadoPorLocalidade(linhas), segmentoQuery(req), localidade) });
}));
