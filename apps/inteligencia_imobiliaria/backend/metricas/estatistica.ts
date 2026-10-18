/**
 * Estatística de amostra (spec 5.1, 6): mediana e percentil portados do site
 * (`src/filters.js` `median`, `src/map/comparables.js` `percentile`), com a
 * supressão por amostra — mediana só com n ≥ 5; P25, P75 e dispersão só com
 * n ≥ 10. Abaixo disso o campo vem `null` com o motivo, nunca o valor com aviso.
 */

export const N_MIN_MEDIANA = 5;
export const N_MIN_QUARTIS = 10;
export const N_MIN_VARIACAO = 20;

export interface Indisponivel {
  motivo: 'amostra_pequena' | 'fase_futura';
  n?: number;
  minimo?: number;
  fase?: string;
}

export function numeros(valores: unknown[]): number[] {
  return valores.map((v) => (typeof v === 'string' ? Number(v) : v)).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

/** Mediana simples; lista vazia → `null` (site, `median`). */
export function mediana(valores: unknown[]): number | null {
  const ns = numeros(valores).sort((a, b) => a - b);
  if (!ns.length) return null;
  const meio = Math.floor(ns.length / 2);
  return ns.length % 2 === 0 ? (ns[meio - 1] + ns[meio]) / 2 : ns[meio];
}

/** Percentil `p` (0–100) por interpolação linear entre vizinhos (site, `percentile`). */
export function percentil(valores: unknown[], p: number): number | null {
  const ns = numeros(valores).sort((a, b) => a - b);
  if (!ns.length || !Number.isFinite(p)) return null;
  if (ns.length === 1) return ns[0];
  const pos = (Math.min(100, Math.max(0, p)) / 100) * (ns.length - 1);
  const baixo = Math.floor(pos);
  const alto = Math.ceil(pos);
  return baixo === alto ? ns[baixo] : ns[baixo] + (ns[alto] - ns[baixo]) * (pos - baixo);
}

export interface Resumo {
  n: number;
  mediana: number | null;
  p25: number | null;
  p75: number | null;
  indisponivel: Record<string, Indisponivel>;
}

/** Resumo com supressão: o mesmo para rota, achado e contexto de IA. */
export function resumo(valores: unknown[]): Resumo {
  const ns = numeros(valores);
  const n = ns.length;
  const indisponivel: Record<string, Indisponivel> = {};
  let med: number | null = null;
  let p25: number | null = null;
  let p75: number | null = null;
  if (n >= N_MIN_MEDIANA) med = mediana(ns);
  else indisponivel.mediana = { motivo: 'amostra_pequena', n, minimo: N_MIN_MEDIANA };
  if (n >= N_MIN_QUARTIS) {
    p25 = percentil(ns, 25);
    p75 = percentil(ns, 75);
  } else {
    indisponivel.p25 = indisponivel.p75 = { motivo: 'amostra_pequena', n, minimo: N_MIN_QUARTIS };
  }
  return { n, mediana: med, p25, p75, indisponivel };
}
