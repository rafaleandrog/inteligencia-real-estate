import { Router } from 'express';
import { METRICAS_GRADE, rotuloMetrica, classesPorQuantis } from '../../comum/celulas';
import { ErroApp, rota, textoQuery } from './comum';

export const celulas: Router = Router();

/** Teto de células por resposta do mapa; acima dele a resposta diz que foi cortada. */
export const TETO_CELULAS = 30000;
const CLASSES_PADRAO = 5;

/** O que há carregado: conjunto, métrica, ano e quantas células (para o seletor da camada). */
celulas.get('/celulas/catalogo', rota(async (req, res) => {
  const linhas = await req.dados!.varrerTudo('celula_metricas', { maximo: 300000 });
  const grupos = new Map<string, { conjunto_codigo: string; metrica: string; ano: number; n: number }>();
  for (const l of linhas) {
    const k = `${l.conjunto_codigo}|${l.metrica}|${l.ano}`;
    const g = grupos.get(k) ?? { conjunto_codigo: String(l.conjunto_codigo), metrica: String(l.metrica), ano: Number(l.ano), n: 0 };
    g.n += 1;
    grupos.set(k, g);
  }
  res.json({
    dados: [...grupos.values()].map((g) => ({ ...g, ...rotuloMetrica(g.conjunto_codigo, g.metrica) })),
    conhecidas: METRICAS_GRADE,
  });
}));

/** Células de uma métrica como GeoJSON, com a classe de cada uma e a legenda. */
celulas.get('/celulas/mapa', rota(async (req, res) => {
  const conjunto = textoQuery(req, 'conjunto');
  const metrica = textoQuery(req, 'metrica');
  const ano = Number(textoQuery(req, 'ano'));
  if (!conjunto || !metrica || !Number.isInteger(ano)) {
    throw new ErroApp(422, 'PARAMETROS_INVALIDOS', 'Informe conjunto, métrica e ano.', ['conjunto, metrica e ano são obrigatórios.']);
  }
  const metricas = await req.dados!.varrerTudo('celula_metricas', { filtros: { conjunto_codigo: conjunto, metrica, ano }, maximo: 300000 });
  const porCelula = new Map<number, Record<string, any>>(metricas.map((m: Record<string, any>) => [Number(m.celula_id), m]));
  const cels = await req.dados!.varrerTudo('celulas', { maximo: 300000 });
  const doConjunto = cels.filter((c: Record<string, any>) => porCelula.has(Number(c.id)));
  const truncado = doConjunto.length > TETO_CELULAS;
  const usadas = truncado ? doConjunto.slice(0, TETO_CELULAS) : doConjunto;

  const temClasse = usadas.every((c: Record<string, any>) => porCelula.get(Number(c.id))!.classe !== null && porCelula.get(Number(c.id))!.classe !== undefined);
  const valores = usadas.map((c: Record<string, any>) => Number(porCelula.get(Number(c.id))!.valor)).filter((v: number) => Number.isFinite(v));
  const cortes = temClasse ? [] : classesPorQuantis(valores, CLASSES_PADRAO);
  const classeDe = (m: Record<string, any>): number | null => {
    if (m.classe !== null && m.classe !== undefined) return Number(m.classe);
    const v = Number(m.valor);
    if (!Number.isFinite(v) || !cortes.length) return null;
    let i = 0;
    while (i < cortes.length && v >= cortes[i]) i++;
    return i;
  };

  const faixas = new Map<number, { classe: number; n: number; min: number; max: number }>();
  const features = usadas.map((c: Record<string, any>) => {
    const m = porCelula.get(Number(c.id))!;
    const classe = classeDe(m);
    const valor = m.valor === null || m.valor === undefined ? null : Number(m.valor);
    if (classe !== null && valor !== null) {
      const f = faixas.get(classe) ?? { classe, n: 0, min: valor, max: valor };
      f.n += 1;
      f.min = Math.min(f.min, valor);
      f.max = Math.max(f.max, valor);
      faixas.set(classe, f);
    }
    return {
      type: 'Feature',
      id: `celula:${c.id}`,
      geometry: c.geometria,
      properties: { id: `celula:${c.id}`, codigo: c.codigo, grade: c.grade, localidade_id: c.localidade_id ?? null, valor, classe, qualidade: m.qualidade ?? null },
    };
  });
  const info = rotuloMetrica(conjunto, metrica);
  res.json({
    type: 'FeatureCollection',
    features,
    metrica: { ...info, ano },
    legenda: [...faixas.values()].sort((a, b) => a.classe - b.classe),
    total: doConjunto.length,
    truncado,
  });
}));
