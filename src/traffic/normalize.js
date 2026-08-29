// Normalizadores das três abas de tráfego do backend v2.2.0 — funções puras.
//
// Vive fora de src/normalize.js de propósito (issue #62): aquele arquivo pertence ao
// bloco de mapa/listagens e roda em paralelo com este. Duplicar `toText`/`toNumber`/
// `toDateISO` aqui criaria duas fontes da mesma regra de parsing (R8.7); por isso eles
// são importados dali — são utilitários genéricos de tipo, sem nada específico de
// listagem, e reusá-los é o oposto de acoplar as duas fases.
//
// Nomes de coluna abaixo vêm do `REQUIRED_HEADERS` do `Code.gs` v2.2.0 (recebido do
// coordenador, que tem o arquivo completo) — não são inferidos nem adivinhados. Uma
// versão anterior deste arquivo usava fallbacks especulativos (`row?.name || row?.nome
// || ...`, `row?.flow ?? row?.veiculos_dia`) para colunas cujo nome real não era
// conhecido ainda; isso é exatamente o que a R8.59 proíbe do outro lado — normalizar
// o inesperado em vez de recusá-lo apaga a evidência de que o nome estava errado. Uma
// coluna do contrato que sumir vira `null`, nunca um apelido da fila de `??`.
//
// ROAD_SEGMENTS (20 colunas) — identidade permanente do trecho. NÃO é a geometria.
//   road_segment_id, current_polygon_id, source_segment_code, road_name, road_code,
//   segment_type, jurisdiction, administration, length_m, source_system,
//   source_layer_name, source_feature_id, source_crs, valid_from, valid_to,
//   is_current, properties_json, confidence_flag, quality_flag, last_synced_at
//
// POLYGONS — geometria, referenciada por ROAD_SEGMENTS.current_polygon_id.
//   Normalizada por src/normalize.js (normalizePolygons); aqui só se lê `id`
//   (= polygon_id já renomeado por normalizePolygon) para o encadeamento (issue #62).
//
// TRAFFIC_DAILY_TEST (25 colunas) — série temporal. Nunca duplica geometria.
//   traffic_daily_id, trecho, sentido, dia, fluxo_total, carro, moto, onibus,
//   caminhao, medio, indefinido, intervalos_15min_observados, cobertura_dia_pct,
//   pico_15min_fluxo, pico_15min_intervalo, soma_classes, divergencia_total_classes,
//   quality_flag, imported_at, road_segment_id, source_file, source_total_policy,
//   traffic_schema_version, profile_total_15m_json, profile_classes_15m_json
//
// ROAD_SEGMENT_ALIASES (11 colunas) — ponte entre código externo (`source_segment_code`)
// e o `road_segment_id` permanente.
//   alias_id, road_segment_id, source_segment_code, source_system, valid_from,
//   valid_to, match_method, match_confidence, source_file, notes, imported_at
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
    name: toText(row?.road_name),
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
 * resolução depende da tabela de aliases (estado externo a esta função pura). O
 * código externo da linha, quando existe, está na coluna `trecho` — é o que
 * `ROAD_SEGMENT_ALIASES.source_segment_code` precisa bater para o alias resolver.
 *
 * Não lê `cobertura_dia_pct` (ver src/traffic/coverage.js e R8.58): o campo bruto de
 * cobertura que sai daqui é `intervalsObserved`, e quem deriva a cobertura real é
 * `dailyCoverage`/`classifyDayCoverage`.
 */
export function normalizeTrafficDaily(row) {
  const date = toDateISO(row?.dia);
  if (date === null) return null;

  return {
    roadSegmentId: toText(row?.road_segment_id) || null,
    sourceSegmentCode: toText(row?.trecho) || null,
    date,
    direction: normalizeDirection(row?.sentido),
    intervalsObserved: toInteger(row?.intervalos_15min_observados),
    flow: toNumber(row?.fluxo_total),
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
