// Encadeamento das três abas de tráfego — funções puras (issue #62).
//
//   TRAFFIC_DAILY_TEST.road_segment_id → ROAD_SEGMENTS.road_segment_id → POLYGONS.polygon_id
//
// Tráfego é sempre indexado por `road_segment_id`, nunca por `trecho`/`source_segment_code`:
// o código externo do DER é volátil por design (pode ser renumerado na fonte), e é
// exatamente para isso que ROAD_SEGMENT_ALIASES existe. Uma linha antiga de
// TRAFFIC_DAILY_TEST pode ter `road_segment_id` vazio e só `source_segment_code`
// preenchido — `resolveTrafficSegmentId` cobre esse caso.
//
// `isActivePolygon` vem de src/filters.js de propósito: é a MESMA função que decide se o
// renderizador desenha o contorno. Uma cópia da regra aqui é o que produziu o achado P1
// da PR #133 — ver a nota na própria função.
import { isActivePolygon } from '../filters.js';

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
 * Liga trecho (ROAD_SEGMENTS) → geometria (POLYGONS).
 *
 * DOIS caminhos, nesta ordem, e os dois são vínculo por IDENTIFICADOR DECLARADO — nunca
 * por nome de rodovia nem por texto de descrição, que é o que a issue #131 proíbe:
 *
 * 1. `ROAD_SEGMENTS.current_polygon_id` → `POLYGONS.polygon_id`. É o caminho canônico e
 *    continua tendo precedência: é a coluna que o contrato criou para isso.
 * 2. `POLYGONS.entity_type = 'road_segment'` + `POLYGONS.entity_id` → `road_segment_id`.
 *    É a declaração, do lado da geometria, de a qual entidade ela pertence.
 *
 * O segundo existe porque a sincronização do DER grava a linha em POLYGONS com
 * `entity_id` preenchido e **deixa `current_polygon_id` vazio** em ROAD_SEGMENTS. Sem
 * este caminho, os cinco trechos do piloto ficam com `polygon: null` e o painel lateral
 * diz "Geometria pendente" para trechos cuja geometria está na planilha, desenhada no
 * mapa, a uma coluna de distância. A correção canônica é o backend preencher
 * `current_polygon_id`; até lá, não fingir que a geometria não existe é o mínimo.
 *
 * A exigência de `entity_type === 'road_segment'` não é formalidade — é a mesma lição de
 * `raProfileForPolygon`: um contorno qualquer também carrega `entity_id`, e casar só por
 * ele colaria a geometria errada num trecho com todos os campos plausíveis.
 *
 * Um trecho que não resolve por nenhum dos dois é carregado normalmente com
 * `polygon: null`: só não tem onde ser desenhado no mapa, o que não é motivo para
 * descartá-lo (issue #62, critério de aceite).
 */
export function linkSegmentToPolygon(segment, polygonsById, polygonsByEntityId) {
  if (!segment) return null;
  const canonico = segment.currentPolygonId ? (polygonsById?.get(segment.currentPolygonId) || null) : null;
  const porEntidade = segment.roadSegmentId ? (polygonsByEntityId?.get(segment.roadSegmentId) || null) : null;
  return { ...segment, polygon: canonico || porEntidade };
}

/**
 * Ids dos trechos que têm PELO MENOS UM dia medido (issue #131).
 *
 * `bySegmentId` tem uma entrada para cada linha de ROAD_SEGMENTS, com ou sem tráfego —
 * um trecho sem nenhum dia medido continua sendo um trecho válido, só sem série. Por
 * isso `bySegmentId.has(id)` NÃO responde "este trecho tem fluxo", e usá-lo como se
 * respondesse faria a conferência da camada aprovar em silêncio exatamente o caso que
 * ela existe para apontar.
 */
export function segmentIdsWithTraffic(bySegmentId) {
  const ids = [];
  for (const [id, linked] of bySegmentId || []) {
    const t = linked?.traffic;
    if (!t) continue;
    if (t.crescente.length + t.decrescente.length + t.semSentido.length > 0) ids.push(id);
  }
  return ids;
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
  // Os DOIS índices só aceitam contorno ATIVO, pela mesma regra do renderizador.
  //
  // `supersedePolygonsOfEntity_` no Apps Script não apaga a geometria antiga de um trecho:
  // ela vira `status: inactive` e continua na aba, ao lado da nova. Ligar um trecho a uma
  // dessas faz o painel prometer o que o mapa não entrega — `hasGeometry: true`, botão
  // "ver no mapa", e um clique que enquadra e abre um desenho que `renderPolygons`
  // deliberadamente não desenhou. Um trecho sem geometria ATIVA precisa dizer "pendente",
  // que é a verdade, em vez de oferecer um atalho para lugar nenhum.
  const polygonsById = new Map();
  // Índice do caminho 2 de `linkSegmentToPolygon`. Só geometria de trecho entra: um
  // `entity_id` de RA aqui poderia casar com um `road_segment_id` homônimo e colar o
  // contorno de um território num trecho de rodovia.
  const polygonsByEntityId = new Map();
  for (const polygon of polygons || []) {
    if (!isActivePolygon(polygon)) continue;
    if (!polygonsById.has(polygon.id)) polygonsById.set(polygon.id, polygon);
    if (polygon.entity_type !== 'road_segment') continue;
    const entityId = polygon.entity_id;
    if (!entityId || polygonsByEntityId.has(entityId)) continue;
    polygonsByEntityId.set(entityId, polygon);
  }
  const { bySegment, orphaned } = indexTrafficBySegment(trafficRecords, aliases);

  const bySegmentId = new Map();
  for (const segment of segments || []) {
    const linked = linkSegmentToPolygon(segment, polygonsById, polygonsByEntityId);
    const traffic = bySegment.get(segment.roadSegmentId) || { crescente: [], decrescente: [], semSentido: [] };
    bySegmentId.set(segment.roadSegmentId, { ...linked, traffic });
  }

  // Tráfego cujo road_segment_id (direto ou via alias) não bate com nenhum
  // ROAD_SEGMENTS conhecido: não é descartado silenciosamente, fica disponível para
  // quem chama decidir como avisar (R2.5/R2.6 — dado ruim é sinalizado, não fatal).
  const unmatchedSegmentIds = [...bySegment.keys()].filter((id) => !bySegmentId.has(id));

  return { bySegmentId, orphaned, unmatchedSegmentIds };
}
