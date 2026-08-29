// Normalizadores das três abas de tráfego do backend v2.2.0 — funções puras.
//
// Vive fora de src/normalize.js de propósito (issue #62): aquele arquivo pertence ao
// bloco de mapa/listagens e roda em paralelo com este. Duplicar `toText`/`toNumber`/
// `toDateISO` aqui criaria duas fontes da mesma regra de parsing (R8.7); por isso eles
// são importados dali — são utilitários genéricos de tipo, sem nada específico de
// listagem, e reusá-los é o oposto de acoplar as duas fases.
//
// ROAD_SEGMENTS   — identidade permanente do trecho. NÃO é a geometria.
// POLYGONS        — geometria, referenciada por ROAD_SEGMENTS.current_polygon_id.
//                   Normalizada por src/normalize.js (normalizePolygons); aqui só se lê
//                   `polygon_id` para o encadeamento (issue #62).
// TRAFFIC_DAILY_TEST — série temporal. Nunca duplica geometria.
// ROAD_SEGMENT_ALIASES — ponte entre código externo do DER (`source_segment_code`) e o
//                   `road_segment_id` permanente.
import { toText, toNumber, toInteger, toDateISO } from '../normalize.js';

/**
 * Trecho de rodovia (identidade). `road_segment_id` é a chave permanente; um registro
 * sem ela é descartado (R2.6 — dado inválido não derruba a aplicação, mas também não
 * é fingido como válido).
 */
export function normalizeRoadSegment(row) {
  const roadSegmentId = toText(row?.road_segment_id);
  if (roadSegmentId === '') return null;

  return {
    roadSegmentId,
    name: toText(row?.name || row?.nome || row?.nome_trecho || row?.descricao),
    // Referência para a geometria. Pode legitimamente estar vazia: um trecho sem
    // geometria sincronizada ainda é um trecho válido, só não tem onde ser desenhado
    // (issue #62, critério de aceite). road_sync_synced_count = 0 hoje.
    currentPolygonId: toText(row?.current_polygon_id) || null,
    raw: row,
  };
}

export function normalizeRoadSegments(rows) {
  const out = [];
  let dropped = 0;
  for (const row of rows || []) {
    const record = normalizeRoadSegment(row);
    if (record) out.push(record);
    else dropped += 1;
  }
  return { records: out, dropped };
}

/**
 * Alias entre um código externo do DER (`source_segment_code`) e o `road_segment_id`
 * permanente. Existe para que uma renumeração na fonte não quebre a série histórica —
 * ver nota de arquitetura na issue #62.
 */
export function normalizeRoadSegmentAlias(row) {
  const roadSegmentId = toText(row?.road_segment_id);
  const sourceSegmentCode = toText(row?.source_segment_code);
  if (roadSegmentId === '' || sourceSegmentCode === '') return null;

  return { roadSegmentId, sourceSegmentCode, raw: row };
}

export function normalizeRoadSegmentAliases(rows) {
  const out = [];
  let dropped = 0;
  for (const row of rows || []) {
    const record = normalizeRoadSegmentAlias(row);
    if (record) out.push(record);
    else dropped += 1;
  }
  return { records: out, dropped };
}

/** Sentidos válidos observados no piloto. Qualquer outro valor vira `null` — nunca adivinhado. */
const DIRECTIONS = new Set(['crescente', 'decrescente']);

function normalizeDirection(value) {
  const s = toText(value).toLowerCase();
  return DIRECTIONS.has(s) ? s : null;
}

/**
 * Um dia de tráfego observado, num sentido, num trecho.
 *
 * `road_segment_id` pode vir vazio numa linha antiga — quem resolve o alias é
 * `resolveTrafficSegmentId` em src/traffic/link.js, não este normalizador, porque a
 * resolução depende da tabela de aliases (estado externo a esta função pura).
 *
 * Não lê `cobertura_dia_pct` (ver src/traffic/coverage.js e R8.58): o campo bruto de
 * cobertura que sai daqui é `intervalsObserved`, e quem deriva a cobertura real é
 * `dailyCoverage`/`classifyDayCoverage`.
 */
export function normalizeTrafficDaily(row) {
  const date = toDateISO(row?.date || row?.data);
  if (date === null) return null;

  return {
    roadSegmentId: toText(row?.road_segment_id) || null,
    sourceSegmentCode: toText(row?.source_segment_code || row?.trecho) || null,
    date,
    direction: normalizeDirection(row?.sentido || row?.direction),
    intervalsObserved: toInteger(row?.intervalos_15min_observados),
    // Fluxo diário — nome de coluna ainda não confirmado no backend v2.2.0; aceita as
    // variações plausíveis sem adivinhar um valor quando nenhuma existir.
    flow: toNumber(row?.fluxo_total ?? row?.veiculos_dia ?? row?.flow),
    qualityFlag: toText(row?.quality_flag) || null,
    raw: row,
  };
}

export function normalizeTrafficDailyRecords(rows) {
  const out = [];
  let dropped = 0;
  for (const row of rows || []) {
    const record = normalizeTrafficDaily(row);
    if (record) out.push(record);
    else dropped += 1;
  }
  return { records: out, dropped };
}
