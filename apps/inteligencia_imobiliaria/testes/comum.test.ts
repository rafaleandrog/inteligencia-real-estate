import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { numero, dataISO, booleano, coordenada, precoM2, precoNumero, urlSegura } from '../comum/normalizar';
import { gerarCsv, lerCsv } from '../comum/csv';
import { caixa, metricas, pontoNoPoligono, validarGeometria } from '../comum/geo';
import { lerGeoArquivo } from '../backend/importacao/geoarquivo';

test('número: os formatos que o site aceita (paridade com src/normalize.js)', () => {
  const casos: [unknown, number | null][] = [
    [1234.5, 1234.5], ['19117.647', 19117.647], ['1.234,56', 1234.56], ['R$ 1.234,56', 1234.56], ['R$ 2.500.000', 2500000],
    ['R$ 290.000', 290000], ['2,500,000.50', 2500000.5], ['1,5', 1.5], ['1,234', 1234], ['120 m²', 120], ['8,6%', 8.6],
    ['', null], ['abc', null], [NaN, null], ['2.500', 2.5],
  ];
  for (const [entrada, esperado] of casos) assert.equal(numero(entrada), esperado, String(entrada));
});

test('data: ISO, GViz, dd/mm/aaaa, serial; data inexistente é recusada', () => {
  assert.equal(dataISO('2026-08-18'), '2026-08-18');
  assert.equal(dataISO('Date(2026,7,18)'), '2026-08-18');
  assert.equal(dataISO('18/08/2026'), '2026-08-18');
  assert.equal(dataISO('46252'), '2026-08-18');
  assert.equal(dataISO('2026-02-30'), null);
  assert.equal(dataISO('Date(2026,3,31)'), null);
  assert.equal(dataISO('2026'), null);
});

test('booleano, coordenada, preço/m² e preço ambíguo', () => {
  assert.equal(booleano('sim'), true);
  assert.equal(booleano('não'), false);
  assert.equal(booleano(''), null);
  assert.equal(coordenada('0', '0'), null);
  assert.equal(coordenada('-15.7', ''), null);
  assert.deepEqual(coordenada('-15,7', '-47,9'), { lat: -15.7, lon: -47.9 });
  const c = precoM2(1000000, 100, 9000);
  assert.equal(c.valor, 9000);
  assert.equal(c.divergente, true);
  assert.equal(precoM2(100, 0, null).valor, null);
  assert.equal(precoNumero('385.000', { area: 50, precoM2Informado: 7700 }), 385000);
  assert.equal(precoNumero('385.000'), 385);
  assert.equal(urlSegura('javascript:alert(1)'), null);
  assert.equal(urlSegura('https://x.com/a'), 'https://x.com/a');
});

test('CSV: ida e volta com ; e vírgula, aspas, BOM e proteção contra fórmula', () => {
  const csv = gerarCsv(['a', 'b'], [{ a: '=SOMA(1)', b: 'x;y "z"' }, { a: -12.5, b: null }]);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes("'=SOMA(1)"));
  const lido = lerCsv(csv);
  assert.equal(lido.separador, ';');
  assert.deepEqual(lido.linhas[0], ['=SOMA(1)', 'x;y "z"']);
  assert.deepEqual(lido.linhas[1], ['-12.5', '']);
  assert.deepEqual(lerCsv('a,b\r\n1,"2,5"\r\n').linhas, [['1', '2,5']]);
});

test('geometria: validação de anel e ordem, caixa, área aproximada e ponto no polígono', () => {
  const q = { type: 'Polygon' as const, coordinates: [[[-47.9, -15.8], [-47.8, -15.8], [-47.8, -15.7], [-47.9, -15.7], [-47.9, -15.8]]] };
  assert.deepEqual(validarGeometria(q), []);
  assert.ok(validarGeometria({ type: 'Polygon', coordinates: [[[-15.8, -147.9], [-15.8, -47.8], [-15.7, -47.8], [-15.8, -147.9]]] }).some((e) => e.includes('ordem') || e.includes('longitude')));
  assert.ok(validarGeometria({ type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 0], [1, 1]]] }).length > 0);
  assert.deepEqual(caixa(q), { oeste: -47.9, sul: -15.8, leste: -47.8, norte: -15.7 });
  const m = metricas(q);
  assert.ok(m.area_m2! > 1.1e8 && m.area_m2! < 1.2e8, String(m.area_m2));
  assert.ok(pontoNoPoligono(-47.85, -15.75, q));
  assert.ok(!pontoNoPoligono(-47.7, -15.75, q));
});

const KML = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Placemark><name>Gleba &amp; Norte</name><ExtendedData><SchemaData><SimpleData name="lote">12</SimpleData></SchemaData></ExtendedData>
<Polygon><outerBoundaryIs><LinearRing><coordinates>-47.9,-15.8,0 -47.8,-15.8,0 -47.8,-15.7,0 -47.9,-15.8,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
<Placemark><name>Eixo</name><LineString><coordinates>-47.9,-15.8 -47.8,-15.7</coordinates></LineString></Placemark>
</Document></kml>`;

test('KML e KMZ: feições com nome, propriedades e geometria; formato conferido pelos bytes', () => {
  const kml = lerGeoArquivo(strToU8(KML));
  assert.equal(kml.formato, 'kml');
  assert.equal(kml.feicoes.length, 2);
  assert.equal(kml.feicoes[0].nome, 'Gleba & Norte');
  assert.equal(kml.feicoes[0].propriedades.lote, '12');
  assert.equal(kml.feicoes[0].geometria.type, 'Polygon');
  assert.equal(kml.feicoes[1].geometria.type, 'LineString');
  const kmz = lerGeoArquivo(zipSync({ 'doc.kml': strToU8(KML) }));
  assert.equal(kmz.formato, 'kmz');
  assert.equal(kmz.feicoes.length, 2);
  const gj = lerGeoArquivo(strToU8(JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'A' }, geometry: { type: 'Point', coordinates: [-47.9, -15.8] } }] })));
  assert.equal(gj.feicoes[0].nome, 'A');
  assert.throws(() => lerGeoArquivo(strToU8('não é geo')));
});
