/**
 * Geometria em GeoJSON `[lng, lat]` EPSG:4326 (spec 5.1, 5.3). Sem PostGIS para
 * app: validação, caixa envolvente, centroide e métricas aproximadas por
 * projeção plana local (apoio visual, não medida; `metricas_aproximadas`).
 */

export type Posicao = [number, number];
export interface Geometria {
  type: 'Point' | 'LineString' | 'MultiLineString' | 'Polygon' | 'MultiPolygon';
  coordinates: any;
}

export const TIPOS_GEOMETRIA = ['Point', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'] as const;

export interface Caixa {
  oeste: number;
  sul: number;
  leste: number;
  norte: number;
}

function posicaoValida(p: unknown): p is Posicao {
  return Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
}

function conferirPosicao(p: unknown, erros: string[]): void {
  if (!posicaoValida(p)) {
    erros.push('posição sem dois números');
    return;
  }
  const [lng, lat] = p;
  if (lat < -90 || lat > 90) erros.push('latitude fora de [-90, 90]: a ordem deve ser [longitude, latitude]');
  if (lng < -180 || lng > 180) erros.push('longitude fora de [-180, 180]');
}

function conferirAnel(anel: unknown, erros: string[]): void {
  if (!Array.isArray(anel) || anel.length < 4) {
    erros.push('anel com menos de quatro posições');
    return;
  }
  anel.forEach((p) => conferirPosicao(p, erros));
  const distintas = new Set(anel.map((p: Posicao) => `${p[0]},${p[1]}`));
  if (distintas.size < 3) erros.push('anel com menos de três posições distintas');
  const [a, z] = [anel[0], anel[anel.length - 1]];
  if (!posicaoValida(a) || !posicaoValida(z) || a[0] !== z[0] || a[1] !== z[1]) erros.push('anel não fechado');
}

function conferirLinha(linha: unknown, erros: string[]): void {
  if (!Array.isArray(linha) || linha.length < 2) {
    erros.push('linha com menos de duas posições');
    return;
  }
  linha.forEach((p) => conferirPosicao(p, erros));
}

/** Erros de uma geometria (mesmas regras do `Code.gs`); lista vazia é geometria válida. */
export function validarGeometria(g: unknown): string[] {
  const erros: string[] = [];
  const geo = g as Geometria;
  if (!geo || typeof geo !== 'object' || !TIPOS_GEOMETRIA.includes(geo.type as any) || !Array.isArray(geo.coordinates)) {
    return ['geometria não é GeoJSON Point, LineString, MultiLineString, Polygon ou MultiPolygon'];
  }
  switch (geo.type) {
    case 'Point':
      conferirPosicao(geo.coordinates, erros);
      break;
    case 'LineString':
      conferirLinha(geo.coordinates, erros);
      break;
    case 'MultiLineString':
      if (geo.coordinates.length === 0) erros.push('MultiLineString vazia');
      geo.coordinates.forEach((l: unknown) => conferirLinha(l, erros));
      break;
    case 'Polygon':
      if (geo.coordinates.length === 0) erros.push('Polygon sem anel');
      geo.coordinates.forEach((a: unknown) => conferirAnel(a, erros));
      break;
    case 'MultiPolygon':
      if (geo.coordinates.length === 0) erros.push('MultiPolygon vazio');
      geo.coordinates.forEach((poli: unknown) => {
        if (!Array.isArray(poli) || poli.length === 0) erros.push('polígono sem anel');
        else poli.forEach((a: unknown) => conferirAnel(a, erros));
      });
      break;
  }
  return [...new Set(erros)];
}

/** Todas as posições, em qualquer profundidade. */
export function posicoes(g: Geometria): Posicao[] {
  const saida: Posicao[] = [];
  const visitar = (v: any) => {
    if (posicaoValida(v) && typeof v[0] === 'number') saida.push([v[0], v[1]]);
    else if (Array.isArray(v)) v.forEach(visitar);
  };
  visitar(g.coordinates);
  return saida;
}

export function caixa(g: Geometria): Caixa {
  const ps = posicoes(g);
  return {
    oeste: Math.min(...ps.map((p) => p[0])),
    sul: Math.min(...ps.map((p) => p[1])),
    leste: Math.max(...ps.map((p) => p[0])),
    norte: Math.max(...ps.map((p) => p[1])),
  };
}

export function caixasCruzam(a: Caixa, b: Caixa): boolean {
  return a.oeste <= b.leste && a.leste >= b.oeste && a.sul <= b.norte && a.norte >= b.sul;
}

const RAIO_TERRA_M = 6371008.8;
const RAD = Math.PI / 180;

/** Projeção plana local (equiretangular na latitude de referência), em metros. */
function projetar(p: Posicao, lat0: number): [number, number] {
  return [p[0] * RAD * RAIO_TERRA_M * Math.cos(lat0 * RAD), p[1] * RAD * RAIO_TERRA_M];
}

function areaAnel(anel: Posicao[], lat0: number): number {
  let s = 0;
  for (let i = 0; i < anel.length - 1; i++) {
    const [x1, y1] = projetar(anel[i], lat0);
    const [x2, y2] = projetar(anel[i + 1], lat0);
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

function comprimento(linha: Posicao[], lat0: number): number {
  let s = 0;
  for (let i = 0; i < linha.length - 1; i++) {
    const [x1, y1] = projetar(linha[i], lat0);
    const [x2, y2] = projetar(linha[i + 1], lat0);
    s += Math.hypot(x2 - x1, y2 - y1);
  }
  return s;
}

export interface Metricas {
  area_m2: number | null;
  perimetro_m: number | null;
  centroide: { lat: number; lon: number };
}

/** Área, perímetro (ou comprimento, em linha) e centroide aproximados. */
export function metricas(g: Geometria): Metricas {
  const cx = caixa(g);
  const lat0 = (cx.sul + cx.norte) / 2;
  const poligonos: Posicao[][][] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  if (poligonos.length > 0) {
    let area = 0;
    let perimetro = 0;
    let cxSoma = 0;
    let cySoma = 0;
    for (const poli of poligonos) {
      poli.forEach((anel, i) => {
        const a = Math.abs(areaAnel(anel, lat0));
        area += i === 0 ? a : -a;
        perimetro += comprimento(anel, lat0);
      });
      const externo = poli[0];
      const a = Math.abs(areaAnel(externo, lat0));
      const pts = externo.slice(0, -1);
      const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      cxSoma += mx * a;
      cySoma += my * a;
    }
    const pesos = poligonos.reduce((s, poli) => s + Math.abs(areaAnel(poli[0], lat0)), 0) || 1;
    return { area_m2: Math.max(0, area), perimetro_m: perimetro, centroide: { lon: cxSoma / pesos, lat: cySoma / pesos } };
  }
  const linhas: Posicao[][] = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  const ps = posicoes(g);
  const centroide = { lon: ps.reduce((s, p) => s + p[0], 0) / ps.length, lat: ps.reduce((s, p) => s + p[1], 0) / ps.length };
  return { area_m2: null, perimetro_m: linhas.length ? linhas.reduce((s, l) => s + comprimento(l, lat0), 0) : null, centroide };
}

/** Ponto dentro de polígono (par-ímpar), para filtro fino depois do filtro de caixa. */
export function pontoNoPoligono(lon: number, lat: number, g: Geometria): boolean {
  const poligonos: Posicao[][][] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  const noAnel = (anel: Posicao[]) => {
    let dentro = false;
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const [xi, yi] = anel[i];
      const [xj, yj] = anel[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  };
  return poligonos.some((poli) => noAnel(poli[0]) && !poli.slice(1).some(noAnel));
}

/** Serialização canônica para o hash da geometria (`geometria_hash`). */
export function geometriaCanonica(g: Geometria): string {
  const arred = (v: any): any => (typeof v === 'number' ? Math.round(v * 1e7) / 1e7 : Array.isArray(v) ? v.map(arred) : v);
  return JSON.stringify({ type: g.type, coordinates: arred(g.coordinates) });
}
