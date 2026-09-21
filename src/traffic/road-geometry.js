// Geometria dos trechos rodoviários oficiais do DER/DF — funções puras (issue #131).
//
// A aba POLYGONS carrega DOIS tipos de desenho que não são a mesma coisa e não podem ser
// desenhados pelo mesmo caminho:
//
//   Região Administrativa  território  `Polygon`/`MultiPolygon`  área com preenchimento
//   Trecho rodoviário      eixo        `LineString`              linha, sem área nenhuma
//
// Até esta issue o render aceitava só área, e as cinco linhas de trecho sumiam do mapa sem
// erro nenhum — o pior sintoma possível, porque o dado estava lá o tempo todo. O que este
// módulo existe para impedir é a volta disso em qualquer uma das duas direções: linha
// tratada como área (um eixo com 24 pontos vira um polígono degenerado, que é geografia
// falsa) e área tratada como linha (a RA perde o preenchimento e o clique).
//
// TUDO aqui é classificação POR CAMPO, nunca por posição de linha na planilha. As cinco
// linhas de trecho estão hoje nas linhas 39-43 da aba; amanhã alguém insere uma linha
// acima e elas estão em 40-44. Um seletor por índice quebraria em silêncio nesse dia.

/**
 * Códigos DER/DF do piloto, para a validação declarar o que ESPERA encontrar.
 *
 * Não é filtro: o seletor é por campo (`isRoadSegmentPolygon`), e um sexto trecho que o
 * backend sincronize amanhã é desenhado normalmente. Esta lista só existe para que a
 * AUSÊNCIA de um dos cinco vire aviso nomeado em vez de uma camada silenciosamente menor —
 * "sumiu sem erro" é exatamente a falha que esta issue conserta.
 */
export const PILOT_ROAD_SEGMENT_CODES = Object.freeze([
  '001EDF0070', '001EDF0090', '001EDF0110', '001EDF0116', '001EDF0130',
]);

/** Sistema e camada oficiais da geometria. Qualquer outra origem é aviso, nunca desenho mudo. */
export const OFFICIAL_SOURCE_SYSTEM = 'DER_DF';
export const OFFICIAL_SOURCE_LAYER = 'Rodovias_2025';

/** Tipos de geometria que um eixo rodoviário pode ter. Área NUNCA entra aqui. */
const LINE_TYPES = new Set(['LineString', 'MultiLineString']);

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

/**
 * É um trecho rodoviário?
 *
 * Dois caminhos, em OU, porque os dois são campos declarados do contrato e um deles pode
 * legitimamente faltar numa linha gravada por outra versão do backend. Casar por nome
 * ("DF-001", "trecho") seria correspondência aproximada por texto — o que a issue proíbe
 * explicitamente e o que faria uma RA chamada "Rodoviária" virar trecho rodoviário.
 */
export function isRoadSegmentPolygon(polygon) {
  if (!polygon) return false;
  return text(polygon.entity_type) === 'road_segment'
    || text(polygon.category) === 'trecho_rodoviario';
}

/** As linhas de trecho de uma lista de contornos, preservando a ordem recebida. */
export function selectRoadSegmentPolygons(polygons) {
  return (polygons || []).filter(isRoadSegmentPolygon);
}

/**
 * `road_segment_id` de um trecho — a chave que liga POLYGONS a ROAD_SEGMENTS e a
 * TRAFFIC_DAILY_TEST.
 *
 * `properties_json.road_segment_id` primeiro porque é a declaração explícita do backend;
 * `entity_id` depois, que é a coluna do contrato para "a qual entidade esta geometria
 * pertence". `polygon_id` NÃO entra: ele identifica o desenho, não o trecho, e hoje os dois
 * coincidirem é conveniência da sincronização, não garantia do contrato.
 */
export function roadSegmentIdOf(polygon) {
  if (!polygon) return null;
  const fromProps = text(polygon.properties && polygon.properties.road_segment_id);
  if (fromProps) return fromProps;
  return text(polygon.entity_id) || null;
}

/** Código do trecho na fonte do DER (`001EDF0070`), como a planilha o grava. */
export function roadSegmentCodeOf(polygon) {
  if (!polygon) return null;
  const props = polygon.properties || {};
  return text(props.cod_distrital) || text(props.source_segment_code) || null;
}

/**
 * Geometria de LINHA de um contorno, ou `null`.
 *
 * O `JSON.parse` acontece aqui e não no normalizador pela mesma razão de sempre (R2.6): um
 * blob malformado numa linha precisa isolar aquele trecho, não derrubar o carregamento das
 * outras camadas. E o tipo é conferido antes de devolver: uma `Polygon` que chegue por esta
 * porta devolve `null` em vez de ser desenhada como linha.
 *
 * `source_geometry_geojson` NUNCA é lido aqui — é procedência, e ler os dois campos daria
 * dois desenhos possíveis para o mesmo trecho sem ninguém saber qual está na tela.
 */
export function parseLineGeometry(geometryText) {
  let geometry = null;
  try {
    geometry = JSON.parse(geometryText);
  } catch (error) {
    return null;
  }
  if (!geometry || !LINE_TYPES.has(geometry.type)) return null;
  if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) return null;
  return geometry;
}

/**
 * Este contorno é desenhado como LINHA?
 *
 * A pergunta é sobre a GEOMETRIA, não sobre o tipo da entidade — e a diferença não é
 * sutil: um corredor rodoviário da v2.2.1 é `entity_type: road_segment` com geometria
 * `Polygon` (o eixo já com buffer), e ele é desenhado como área. Confundir as duas
 * perguntas foi o que, numa versão anterior desta issue, apagou do mapa todo corredor
 * antigo — e faria a legenda anunciar um traço onde o mapa desenha uma área.
 */
export function drawsAsLine(polygon) {
  return parseLineGeometry(polygon && polygon.geometry_geojson) !== null;
}

/**
 * As partes de uma geometria de linha como lista de listas de posições.
 *
 * `LineString` tem uma parte; `MultiLineString` tem várias. Achatar as duas no mesmo
 * formato aqui evita que cada consumidor (limites do mapa, contagem de vértices) repita o
 * `if` do tipo — e é o `if` do tipo que, esquecido em um lugar só, faz metade de um trecho
 * partido sumir da tela.
 */
export function lineParts(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

/**
 * Limites `[lat, lon]` de todos os vértices dos trechos, para o enquadramento do mapa.
 *
 * GeoJSON é `[longitude, latitude]` e o Leaflet é `[latitude, longitude]`. A inversão é a
 * troca clássica, e o sintoma dela aqui seria o mapa enquadrando o Golfo da Guiné — por
 * isso a conversão mora num lugar só. Posição que não seja um par de números finitos é
 * descartada: um vértice corrompido não pode arrastar o enquadramento para o oceano.
 */
export function roadSegmentBounds(polygons) {
  const bounds = [];
  for (const polygon of selectRoadSegmentPolygons(polygons)) {
    const geometry = parseLineGeometry(polygon.geometry_geojson);
    for (const part of lineParts(geometry)) {
      for (const position of part || []) {
        if (!Array.isArray(position) || position.length < 2) continue;
        const [lon, lat] = position;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
        bounds.push([lat, lon]);
      }
    }
  }
  return bounds;
}

/**
 * Confere a camada rodoviária contra o que o contrato promete e devolve um aviso por
 * desvio — nunca uma exceção.
 *
 * O contrato inteiro desta camada é opcional (R2.5): a aba pode estar fora do ar, o backend
 * pode ainda não ter sincronizado. Nada disso pode derrubar o mapa. Mas o oposto —
 * "carregou zero trecho e ninguém percebeu" — é o defeito que esta issue conserta, e por
 * isso o silêncio também não é resposta: cada desvio vira uma frase que diz QUAL trecho e
 * QUAL campo, no mesmo canal de avisos das outras abas opcionais.
 *
 * `trafficSegmentIds` é o conjunto de `road_segment_id` que `linkTrafficDataset` indexou.
 * A conferência é por ID, nunca por nome de rodovia — é a mesma regra que governa o
 * vínculo em si (src/traffic/link.js).
 *
 * @param {object[]} polygons          POLYGONS normalizados
 * @param {object}   [options]
 * @param {Iterable<string>} [options.trafficSegmentIds] ids com tráfego indexado
 * @param {string[]} [options.expectedCodes] códigos esperados (padrão: o piloto)
 * @returns {{ segments: object[], warnings: string[] }}
 */
export function validateRoadSegmentLayer(polygons, options = {}) {
  const expectedCodes = options.expectedCodes || PILOT_ROAD_SEGMENT_CODES;
  const trafficIds = new Set(options.trafficSegmentIds || []);
  const segments = selectRoadSegmentPolygons(polygons);
  const warnings = [];

  // Camada inteira ausente é o estado normal de quem ainda não sincronizou: um aviso só,
  // sem enumerar os cinco códigos que faltam. Cinco linhas dizendo a mesma coisa afogariam
  // os avisos das outras abas.
  if (segments.length === 0) {
    warnings.push(
      'Trechos rodoviários: nenhum encontrado na aba POLYGONS '
      + `(esperados ${expectedCodes.length}). A camada não é desenhada.`
    );
    return { segments, warnings };
  }

  // A contagem é dos trechos DO PILOTO, não de tudo que tem `entity_type: road_segment`:
  // um corredor legado ou um trecho novo que o backend sincronize amanhã não são erro.
  const doPiloto = segments.filter((s) => expectedCodes.includes(roadSegmentCodeOf(s)));
  if (doPiloto.length !== expectedCodes.length) {
    warnings.push(
      `Trechos rodoviários: encontrados ${doPiloto.length} dos ${expectedCodes.length} do piloto.`
    );
  }

  const esperados = new Set(expectedCodes);
  const vistos = new Map();
  for (const segment of segments) {
    const codigo = roadSegmentCodeOf(segment) || segment.id || '(sem código)';
    const id = roadSegmentIdOf(segment);

    // Código duplicado não é detalhe de catálogo: dois desenhos para o mesmo trecho põem
    // duas linhas no mesmo lugar, e o clique cai em qualquer uma das duas sem regra.
    if (vistos.has(codigo)) {
      warnings.push(
        `Trecho rodoviário ${codigo}: código duplicado na aba POLYGONS `
        + `(${vistos.get(codigo)} e ${segment.id}).`
      );
    } else {
      vistos.set(codigo, segment.id);
    }

    // A partir daqui a conferência é sobre os trechos DO PILOTO. Um trecho rodoviário
    // fora da lista não é reprovado por não ser LineString: o corredor com buffer da
    // v2.2.1 é `entity_type: road_segment` com geometria `Polygon`, e ele é um registro
    // legítimo — só não é um eixo oficial do DER. Cobrá-lo pelo contrato do eixo encheria
    // o canal de avisos de acusações falsas, que é o jeito mais rápido de fazer todo
    // mundo parar de ler os avisos verdadeiros.
    if (!esperados.has(codigo)) continue;

    const declarado = text(segment.geometry_type);
    if (declarado !== 'LineString') {
      warnings.push(
        `Trecho rodoviário ${codigo}: geometry_type "${declarado || 'vazio'}", esperado LineString.`
      );
    }

    // Geometria ilegível ou de tipo de área: o trecho não é desenhado, e o motivo é dito.
    // Converter uma dessas em linha "para não sumir" seria inventar geografia.
    if (parseLineGeometry(segment.geometry_geojson) === null) {
      warnings.push(
        `Trecho rodoviário ${codigo}: geometria ausente, ilegível ou fora de `
        + 'LineString/MultiLineString — não será desenhado.'
      );
    }

    const sistema = text(segment.source_system);
    if (sistema !== OFFICIAL_SOURCE_SYSTEM) {
      warnings.push(
        `Trecho rodoviário ${codigo}: source_system "${sistema || 'vazio'}", `
        + `esperado ${OFFICIAL_SOURCE_SYSTEM}.`
      );
    }

    const camada = text(segment.source_layer_name);
    if (camada !== OFFICIAL_SOURCE_LAYER) {
      warnings.push(
        `Trecho rodoviário ${codigo}: source_layer_name "${camada || 'vazio'}", `
        + `esperado ${OFFICIAL_SOURCE_LAYER}.`
      );
    }

    if (!id) {
      warnings.push(`Trecho rodoviário ${codigo}: sem road_segment_id — o fluxo não pode ser ligado.`);
    } else if (trafficIds.size > 0 && !trafficIds.has(id)) {
      warnings.push(`Trecho rodoviário ${codigo}: ${id} não tem fluxo em TRAFFIC_DAILY_TEST.`);
    }
  }

  // Código esperado que não apareceu — dito pelo nome, não por uma contagem. "4 de 5" não
  // diz a ninguém qual conferir na planilha.
  for (const codigo of expectedCodes) {
    if (!vistos.has(codigo)) {
      warnings.push(`Trecho rodoviário ${codigo}: esperado no piloto e ausente da aba POLYGONS.`);
    }
  }

  return { segments, warnings };
}
