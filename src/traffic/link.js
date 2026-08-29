// Encadeamento das três abas de tráfego — funções puras (issue #62).
//
//   TRAFFIC_DAILY_TEST.road_segment_id → ROAD_SEGMENTS.road_segment_id → POLYGONS.polygon_id
//
// Tráfego é sempre indexado por `road_segment_id`, nunca por `trecho`/`source_segment_code`:
// o código externo do DER é volátil por design (pode ser renumerado na fonte), e é
// exatamente para isso que ROAD_SEGMENT_ALIASES existe. Uma linha antiga de
// TRAFFIC_DAILY_TEST pode ter `road_segment_id` vazio e só `source_segment_code`
// preenchido — `resolveTrafficSegmentId` cobre esse caso.

/** Índice `source_segment_code → road_segment_id`, a partir de ROAD_SEGMENT_ALIASES. */
export function buildAliasIndex(aliases) {
  const index = new Map();
  for (const alias of aliases || []) {
    if (!alias || !alias.sourceSegmentCode || !alias.roadSegmentId) continue;
    index.set(alias.sourceSegmentCode, alias.roadSegmentId);
  }
  return index;
}

/**
 * `road_segment_id` efetivo de um registro de tráfego: o próprio campo quando
 * presente; senão, o alias resolvido a partir de `source_segment_code`. Devolve
 * `null` quando nenhum dos dois resolve — o registro fica órfão, e cabe a quem chama
 * decidir se isso vira aviso (nunca erro fatal, R2.5).
 */
export function resolveTrafficSegmentId(trafficRecord, aliasIndex) {
  if (!trafficRecord) return null;
  if (trafficRecord.roadSegmentId) return trafficRecord.roadSegmentId;
  if (trafficRecord.sourceSegmentCode && aliasIndex) {
    return aliasIndex.get(trafficRecord.sourceSegmentCode) || null;
  }
  return null;
}

/**
 * Indexa os registros de tráfego por `road_segment_id`, resolvendo alias quando
 * necessário, e separando por **sentido** dentro de cada trecho — `crescente` e
 * `decrescente` são medições diferentes da mesma via; somá-las às cegas mistura dois
 * fluxos que não são o mesmo dado (contexto da issue #62/#63).
 *
 * @returns {{ bySegment: Map<string, {crescente: object[], decrescente: object[], semSentido: object[]}>, orphaned: object[] }}
 */
export function indexTrafficBySegment(trafficRecords, aliases) {
  const aliasIndex = buildAliasIndex(aliases);
  const bySegment = new Map();
  const orphaned = [];

  for (const record of trafficRecords || []) {
    const segmentId = resolveTrafficSegmentId(record, aliasIndex);
    if (!segmentId) {
      orphaned.push(record);
      continue;
    }

    if (!bySegment.has(segmentId)) {
      bySegment.set(segmentId, { crescente: [], decrescente: [], semSentido: [] });
    }
    const bucket = bySegment.get(segmentId);
    if (record.direction === 'crescente') bucket.crescente.push(record);
    else if (record.direction === 'decrescente') bucket.decrescente.push(record);
    else bucket.semSentido.push(record);
  }

  return { bySegment, orphaned };
}

/**
 * Liga trecho (ROAD_SEGMENTS) → geometria (POLYGONS), via `current_polygon_id`.
 * Um trecho sem `current_polygon_id`, ou cujo `polygon_id` não existe em POLYGONS
 * (geometria ainda não sincronizada — `road_sync_synced_count = 0` no piloto), é
 * carregado normalmente com `polygon: null`: só não tem onde ser desenhado no mapa,
 * o que não é motivo para descartar o trecho (issue #62, critério de aceite).
 */
export function linkSegmentToPolygon(segment, polygonsById) {
  if (!segment) return null;
  const polygon = segment.currentPolygonId ? (polygonsById?.get(segment.currentPolygonId) || null) : null;
  return { ...segment, polygon };
}

/**
 * Monta a visão completa por trecho: identidade + geometria (se houver) + tráfego
 * indexado por sentido. É o formato que o painel da issue #63 consome.
 *
 * @param {object[]} segments        ROAD_SEGMENTS normalizados
 * @param {object[]} polygons        POLYGONS normalizados (de src/normalize.js)
 * @param {object[]} trafficRecords  TRAFFIC_DAILY_TEST normalizados
 * @param {object[]} aliases         ROAD_SEGMENT_ALIASES normalizados
 */
export function linkTrafficDataset(segments, polygons, trafficRecords, aliases) {
  // POLYGONS normalizado por src/normalize.js expõe o identificador como `id`
  // (a coluna da planilha é `polygon_id`; `normalizePolygon` já a renomeia).
  const polygonsById = new Map((polygons || []).map((p) => [p.id, p]));
  const { bySegment, orphaned } = indexTrafficBySegment(trafficRecords, aliases);

  const bySegmentId = new Map();
  for (const segment of segments || []) {
    const linked = linkSegmentToPolygon(segment, polygonsById);
    const traffic = bySegment.get(segment.roadSegmentId) || { crescente: [], decrescente: [], semSentido: [] };
    bySegmentId.set(segment.roadSegmentId, { ...linked, traffic });
  }

  // Tráfego cujo road_segment_id (direto ou via alias) não bate com nenhum
  // ROAD_SEGMENTS conhecido: não é descartado silenciosamente, fica disponível para
  // quem chama decidir como avisar (R2.5/R2.6 — dado ruim é sinalizado, não fatal).
  const unmatchedSegmentIds = [...bySegment.keys()].filter((id) => !bySegmentId.has(id));

  return { bySegmentId, orphaned, unmatchedSegmentIds };
}
