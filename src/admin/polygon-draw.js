// Geometria do desenho de contornos (issue #37).
//
// Só funções puras: nada aqui toca o DOM, o Leaflet ou a rede. É de propósito — o
// servidor rejeita geometria inválida com `INVALID_PAYLOAD`, e descobrir isso só
// depois de uma ida ao Apps Script é caro e opaco para quem está desenhando. As
// mesmas regras do `validateGeoJsonPolygon_()` do Code.gs valem aqui, aplicadas antes
// de enviar, para o erro aparecer em português e no lugar certo.
//
// A paridade com o servidor é cobrada por tests/polygon-draw.test.js, que executa o
// Code.gs real no sandbox e confronta as duas validações caso a caso.

/** Número de posições que o GeoJSON exige num anel fechado. */
export const MIN_RING_POSITIONS = 4;

/** Posições DISTINTAS que o servidor exige — um triângulo é o mínimo com área. */
export const MIN_DISTINCT_POSITIONS = 3;

/**
 * Converte os vértices do desenho em um anel GeoJSON.
 *
 * Duas conversões acontecem aqui, e as duas são fonte clássica de bug:
 *
 * 1. **A ordem inverte.** O Leaflet trabalha em `[latitude, longitude]`; o GeoJSON
 *    exige `[longitude, latitude]`. Trocar isso põe Brasília na Somália.
 * 2. **O anel fecha.** O GeoJSON exige que a última posição repita a primeira. O
 *    desenho não repete — quem desenha clica em cada canto uma vez.
 */
export function ringFromLatLngs(latlngs) {
  // `Array.isArray`, não `latlngs || []`: uma string tem `length` mas não tem
  // `.filter`, e o `|| []` deixaria passar direto para o TypeError.
  const points = (Array.isArray(latlngs) ? latlngs : [])
    .filter((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lng))
    .map((point) => [point.lng, point.lat]);

  if (points.length === 0) return [];

  const [first] = points;
  const last = points[points.length - 1];
  const closed = first[0] === last[0] && first[1] === last[1];
  return closed ? points : [...points, [first[0], first[1]]];
}

/** Quantas posições distintas o anel tem, ignorando o fechamento. */
export function distinctCount(ring) {
  const seen = new Set();
  for (const [lon, lat] of ring || []) seen.add(`${lon}|${lat}`);
  return seen.size;
}

/**
 * Valida o anel com as mesmas regras do servidor. Devolve `null` quando está bom, ou
 * uma mensagem em português dizendo o que falta — nunca um código de erro cru.
 */
export function validateRing(ring) {
  if (!Array.isArray(ring) || ring.length === 0) {
    return 'Clique no mapa para marcar os cantos do contorno.';
  }
  // A contagem de DISTINTOS vem primeiro, e a ordem importa. Três cliques no mesmo
  // lugar produzem um anel de comprimento 3 — que também falha no teste de tamanho,
  // mas por lá a mensagem seria "faltam 2 cantos" para quem acabou de marcar três.
  // Dizer "os cantos não formam uma área" é a explicação verdadeira.
  const distinct = distinctCount(ring);
  if (distinct < MIN_DISTINCT_POSITIONS) {
    return `Os cantos marcados não formam uma área — ${distinct} ponto(s) distinto(s). ` +
      `Marque pelo menos ${MIN_DISTINCT_POSITIONS} cantos em posições diferentes.`;
  }
  if (ring.length < MIN_RING_POSITIONS) {
    return `Um contorno precisa de pelo menos ${MIN_DISTINCT_POSITIONS} cantos.`;
  }

  for (const [lon, lat] of ring) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return 'Algum canto ficou sem coordenada. Refaça o desenho.';
    }
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      return 'Algum canto caiu fora da faixa válida de longitude/latitude.';
    }
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return 'O contorno não fechou. Refaça o desenho.';
  }
  return null;
}

/**
 * Monta o objeto GeoJSON do desenho. `null` quando o anel não passa na validação —
 * quem chama mostra a mensagem de `validateRing()`, não uma geometria pela metade.
 */
export function buildPolygonGeoJSON(latlngs) {
  const ring = ringFromLatLngs(latlngs);
  if (validateRing(ring) !== null) return null;
  return { type: 'Polygon', coordinates: [ring] };
}

/**
 * Campos da linha de POLYGONS a partir do desenho e do formulário.
 *
 * `polygon_id`, `imported_at` e `source_file` ficam de fora de propósito: quem os
 * define é o servidor (ver `doWrite_` em Code.gs). Mandá-los daqui seria o cliente
 * disputando com o backend a autoria de campo que não é dele.
 */
export function buildPolygonFields({ name, category, color, description, latlngs }) {
  const geometry = buildPolygonGeoJSON(latlngs);
  if (!geometry) return null;

  const fields = {
    name: String(name || '').trim(),
    geometry_geojson: JSON.stringify(geometry),
    status: 'active',
  };
  if (category) fields.category = String(category).trim();
  if (color) fields.color = String(color).trim();
  if (description) fields.description = String(description).trim();
  return fields;
}
