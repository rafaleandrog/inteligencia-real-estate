/**
 * Catálogo das métricas de grade que o mapa sabe rotular (recorte da Fase 4A, spec 5.13).
 * O pipeline publica a classe de cada célula; o rótulo, a unidade e a grade vêm daqui.
 * Só as métricas listadas aparecem no seletor: o catálogo lê cada uma por filtro, nunca a tabela toda.
 */

export interface MetricaGrade {
  conjunto_codigo: string;
  metrica: string;
  /** Grade das células que carregam a métrica (limita a leitura das células). */
  grade: 'h3_r9' | 'ibge_200m' | 'ibge_1km';
  rotulo: string;
  unidade: string;
  procedencia: string;
}

const IBGE = 'IBGE, Grade Estatística (Censo 2010 e 2022)';
const AOP = 'Ipea, Acesso a Oportunidades (RAIS)';

export const METRICAS_GRADE: MetricaGrade[] = [
  { conjunto_codigo: 'households_grid', metrica: 'households_delta_per_km2', grade: 'ibge_200m', rotulo: 'Domicílios novos por km² (2010→2022)', unidade: 'dom./km²', procedencia: IBGE },
  { conjunto_codigo: 'households_grid', metrica: 'dom_ocu', grade: 'ibge_200m', rotulo: 'Domicílios ocupados', unidade: 'domicílios', procedencia: IBGE },
  { conjunto_codigo: 'households_grid', metrica: 'pop', grade: 'ibge_200m', rotulo: 'População', unidade: 'pessoas', procedencia: IBGE },
  { conjunto_codigo: 'jobs_hex', metrica: 'jobs_total', grade: 'h3_r9', rotulo: 'Empregos formais', unidade: 'empregos', procedencia: AOP },
  { conjunto_codigo: 'jobs_hex', metrica: 'jobs_low', grade: 'h3_r9', rotulo: 'Empregos formais · baixa escolaridade', unidade: 'empregos', procedencia: AOP },
  { conjunto_codigo: 'jobs_hex', metrica: 'jobs_mid', grade: 'h3_r9', rotulo: 'Empregos formais · média escolaridade', unidade: 'empregos', procedencia: AOP },
  { conjunto_codigo: 'jobs_hex', metrica: 'jobs_high', grade: 'h3_r9', rotulo: 'Empregos formais · alta escolaridade', unidade: 'empregos', procedencia: AOP },
  { conjunto_codigo: 'jobs_hex', metrica: 'pop_total', grade: 'h3_r9', rotulo: 'População (Ipea)', unidade: 'pessoas', procedencia: AOP },
  { conjunto_codigo: 'jobs_hex', metrica: 'income_avg_brl', grade: 'h3_r9', rotulo: 'Renda média', unidade: 'R$', procedencia: AOP },
];

export function rotuloMetrica(conjunto: string, metrica: string): MetricaGrade {
  return METRICAS_GRADE.find((m) => m.conjunto_codigo === conjunto && m.metrica === metrica)
    ?? { conjunto_codigo: conjunto, metrica, grade: 'h3_r9', rotulo: `${conjunto} · ${metrica}`, unidade: '', procedencia: '' };
}

/** Cortes por quantis para `n` classes; vazio quando há menos valores que classes. */
export function classesPorQuantis(valores: number[], n: number): number[] {
  const ns = valores.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (ns.length < n) return [];
  return Array.from({ length: n - 1 }, (_, i) => ns[Math.min(ns.length - 1, Math.floor(((i + 1) / n) * ns.length))]);
}
