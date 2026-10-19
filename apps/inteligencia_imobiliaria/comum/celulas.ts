/**
 * Catálogo das métricas de grade que o mapa sabe rotular (recorte da Fase 4A, spec 5.13).
 * O pipeline publica a classe de cada célula; o rótulo e a unidade vêm daqui.
 */

export interface MetricaGrade {
  conjunto_codigo: string;
  metrica: string;
  rotulo: string;
  unidade: string;
  procedencia: string;
}

export const METRICAS_GRADE: MetricaGrade[] = [
  { conjunto_codigo: 'households_grid', metrica: 'households_delta_per_km2', rotulo: 'Domicílios novos por km² (2010→2022)', unidade: 'dom./km²', procedencia: 'IBGE, Grade Estatística (Censo 2010 e 2022)' },
  { conjunto_codigo: 'jobs_hex', metrica: 'jobs_total', rotulo: 'Empregos formais', unidade: 'empregos', procedencia: 'Ipea, Acesso a Oportunidades (RAIS)' },
];

export function rotuloMetrica(conjunto: string, metrica: string): MetricaGrade {
  return METRICAS_GRADE.find((m) => m.conjunto_codigo === conjunto && m.metrica === metrica)
    ?? { conjunto_codigo: conjunto, metrica, rotulo: `${conjunto} · ${metrica}`, unidade: '', procedencia: '' };
}

/** Classe por quantis quando a linha não traz a do pipeline (n classes, 0 a n-1). */
export function classesPorQuantis(valores: number[], n: number): number[] {
  const ns = valores.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (ns.length < n) return [];
  return Array.from({ length: n - 1 }, (_, i) => ns[Math.min(ns.length - 1, Math.floor(((i + 1) / n) * ns.length))]);
}
