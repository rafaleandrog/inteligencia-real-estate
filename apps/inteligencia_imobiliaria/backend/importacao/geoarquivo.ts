import { strFromU8, unzipSync } from 'fflate';
import { validarGeometria, type Geometria, type Posicao } from '../../comum/geo';

/** Uma feição lida de KML, KMZ ou GeoJSON (spec 6.1, `/contornos/importar`). */
export interface FeicaoLida {
  nome: string;
  geometria: Geometria;
  propriedades: Record<string, unknown>;
  erros: string[];
}

export type FormatoGeo = 'kml' | 'kmz' | 'geojson';

/** O navegador nem sempre rotula KMZ: o formato é conferido pelos bytes (C-38). */
export function detectarFormato(bytes: Uint8Array): FormatoGeo | null {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'kmz';
  const inicio = strFromU8(bytes.subarray(0, 2000)).replace(/^﻿/, '').trimStart();
  if (inicio.startsWith('{') || inicio.startsWith('[')) return 'geojson';
  if (inicio.startsWith('<')) return /<kml[\s>]/i.test(strFromU8(bytes.subarray(0, 20000))) ? 'kml' : null;
  return null;
}

export function lerGeoArquivo(bytes: Uint8Array): { formato: FormatoGeo; feicoes: FeicaoLida[] } {
  const formato = detectarFormato(bytes);
  if (!formato) throw new Error('arquivo não é KML, KMZ nem GeoJSON');
  if (formato === 'geojson') return { formato, feicoes: lerGeoJson(JSON.parse(strFromU8(bytes).replace(/^﻿/, ''))) };
  if (formato === 'kml') return { formato, feicoes: lerKml(strFromU8(bytes)) };
  const arquivos = unzipSync(bytes);
  const nomeKml = Object.keys(arquivos).find((n) => /(^|\/)doc\.kml$/i.test(n)) ?? Object.keys(arquivos).find((n) => /\.kml$/i.test(n));
  if (!nomeKml) throw new Error('KMZ sem arquivo .kml dentro');
  return { formato, feicoes: lerKml(strFromU8(arquivos[nomeKml])) };
}

function feicao(nome: string, geometria: Geometria, propriedades: Record<string, unknown> = {}): FeicaoLida {
  return { nome: nome || 'Sem nome', geometria, propriedades, erros: validarGeometria(geometria) };
}

export function lerGeoJson(obj: any): FeicaoLida[] {
  if (!obj || typeof obj !== 'object') return [];
  if (obj.type === 'FeatureCollection') return (obj.features ?? []).flatMap((f: any) => lerGeoJson(f));
  if (obj.type === 'Feature') {
    if (!obj.geometry) return [];
    const props = obj.properties ?? {};
    const nome = String(props.nome ?? props.name ?? props.Name ?? props.NOME ?? '');
    return geometriasSimples(obj.geometry).map((g) => feicao(nome, g, props));
  }
  return geometriasSimples(obj).map((g) => feicao('', g));
}

/** `GeometryCollection` vira uma feição por geometria. */
function geometriasSimples(g: any): Geometria[] {
  if (!g) return [];
  if (g.type === 'GeometryCollection') return (g.geometries ?? []).flatMap(geometriasSimples);
  return [g as Geometria];
}

function decodificarXml(t: string): string {
  return t
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function coordenadasKml(t: string): Posicao[] {
  return t
    .trim()
    .split(/\s+/)
    .map((tripla) => tripla.split(',').map(Number))
    .filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map((p) => [p[0], p[1]] as Posicao);
}

function blocos(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[a-z0-9]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[a-z0-9]+:)?${tag}>`, 'gi');
  return [...xml.matchAll(re)].map((m) => m[1]);
}

function primeiro(xml: string, tag: string): string | null {
  return blocos(xml, tag)[0] ?? null;
}

function poligonoKml(xml: string): Posicao[][] {
  const externo = primeiro(primeiro(xml, 'outerBoundaryIs') ?? '', 'coordinates');
  const internos = blocos(xml, 'innerBoundaryIs').map((b) => primeiro(b, 'coordinates') ?? '');
  return [externo ?? '', ...internos].filter(Boolean).map(coordenadasKml);
}

/** KML: Placemark com Polygon, LineString ou MultiGeometry (sem XML externo, por regex). */
export function lerKml(xml: string): FeicaoLida[] {
  const saida: FeicaoLida[] = [];
  for (const pm of blocos(xml, 'Placemark')) {
    const nome = decodificarXml(primeiro(pm, 'name') ?? '');
    const props: Record<string, unknown> = {};
    for (const m of pm.matchAll(/<(?:[a-z0-9]+:)?SimpleData\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/(?:[a-z0-9]+:)?SimpleData>/gi)) props[m[1]] = decodificarXml(m[2]);
    for (const m of pm.matchAll(/<(?:[a-z0-9]+:)?Data\s+name="([^"]+)"[^>]*>[\s\S]*?<(?:[a-z0-9]+:)?value>([\s\S]*?)<\/(?:[a-z0-9]+:)?value>/gi)) props[m[1]] = decodificarXml(m[2]);
    const descricao = primeiro(pm, 'description');
    if (descricao) props.descricao = decodificarXml(descricao);
    const poligonos = blocos(pm, 'Polygon').map(poligonoKml);
    const linhas = blocos(pm, 'LineString').map((b) => coordenadasKml(primeiro(b, 'coordinates') ?? ''));
    if (poligonos.length === 1) saida.push(feicao(nome, { type: 'Polygon', coordinates: poligonos[0] }, props));
    else if (poligonos.length > 1) saida.push(feicao(nome, { type: 'MultiPolygon', coordinates: poligonos }, props));
    if (linhas.length === 1) saida.push(feicao(nome, { type: 'LineString', coordinates: linhas[0] }, props));
    else if (linhas.length > 1) saida.push(feicao(nome, { type: 'MultiLineString', coordinates: linhas }, props));
    if (!poligonos.length && !linhas.length) {
      const ponto = primeiro(pm, 'Point');
      const c = ponto ? coordenadasKml(primeiro(ponto, 'coordinates') ?? '') : [];
      if (c.length) saida.push(feicao(nome, { type: 'Point', coordinates: c[0] }, props));
    }
  }
  return saida;
}
