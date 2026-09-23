// Sentido oficial das vias e visão diária do corredor (issue #142) — funções puras.
//
// Duas abas novas do backend 2026-09-23.1, as duas somente leitura:
//
// ROAD_DIRECTION_MAP (20 colunas) — o que `crescente`/`decrescente` significam em CADA via.
//   direction_map_id, road_segment_id, source_segment_code, source_direction, road_code,
//   normalized_road_code, origin_official, destination_official, km_start, km_end,
//   project_direction, corridor_id, corridor_role, mapping_status, direction_rule,
//   confidence, geometry_source_org, geometry_source_layer, geometry_feature_id, notes
//
//   Regra oficial do DER/DF: crescente = Km_I → Km_F; decrescente = Km_F → Km_I. A chave é
//   `source_segment_code + source_direction` — NUNCA o nome da rodovia, que se repete em
//   vários trechos.
//
// TRAFFIC_CORRIDOR_DAILY (25 colunas) — um dia de um ponto de medição do corredor.
//   corridor_daily_id, corridor_id, dia, mes_ref, measurement_segment_id,
//   source_segment_code, road_name, measurement_point_role, sentido_para_plano,
//   sentido_para_sobradinho, fluxo_para_plano, fluxo_para_sobradinho, fluxo_bidirecional,
//   carro_para_plano, carro_para_sobradinho, carro_bidirecional, motos_bidirecional,
//   onibus_bidirecional, caminhoes_bidirecional, intervalos_minimos_15min,
//   cobertura_min_pct, quality_flag, source_rows_count, source_files, aggregation_rule
//
// A tradução "decrescente = para o Plano Piloto" é do CORREDOR, não da via: ela vale só
// para os códigos que a própria TRAFFIC_CORRIDOR_DAILY declara (colunas
// `sentido_para_plano`/`sentido_para_sobradinho`) ou que ROAD_DIRECTION_MAP marcar com
// `project_direction`. Nenhum código fica fixado aqui — um corredor novo na planilha
// entra sozinho, e uma via fora dele continua só com o sentido oficial.
import { toText, toNumber, toInteger, toDateISO } from '../normalize.js';

/** Sentido do projeto, em forma canônica. Qualquer outro valor vira `null`. */
export const PROJECT_DIRECTIONS = Object.freeze({
  para_plano: 'Para o Plano Piloto',
  para_sobradinho: 'Para Sobradinho',
});

const OFFICIAL_DIRECTIONS = new Set(['crescente', 'decrescente']);

function officialDirection(value) {
  const s = toText(value).toLowerCase();
  return OFFICIAL_DIRECTIONS.has(s) ? s : null;
}

/** `para_plano`, `Para o Plano Piloto`, `plano` → `para_plano`; idem Sobradinho. */
export function canonicalProjectDirection(value) {
  const token = toText(value)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
  if (['para_plano', 'plano', 'plano_piloto', 'para_o_plano_piloto', 'para_o_plano'].includes(token)) {
    return 'para_plano';
  }
  if (['para_sobradinho', 'sobradinho'].includes(token)) return 'para_sobradinho';
  return null;
}

/** Chave de junção fluxo ↔ sentido. Código exato (zeros e hífens preservados) + sentido. */
export function directionKey(sourceSegmentCode, direction) {
  return `${toText(sourceSegmentCode)}|${toText(direction).toLowerCase()}`;
}

/**
 * Uma linha de ROAD_DIRECTION_MAP. Sem `source_segment_code` não há o que ligar, e a linha
 * é descartada (contada). `source_direction` vazio é LEGÍTIMO: é assim que chegam os cinco
 * códigos `unmatched_official_layer`, que precisam continuar visíveis como tais.
 */
export function normalizeRoadDirection(row) {
  const sourceSegmentCode = toText(row?.source_segment_code);
  if (sourceSegmentCode === '') return null;

  return {
    directionMapId: toText(row?.direction_map_id) || null,
    roadSegmentId: toText(row?.road_segment_id) || null,
    sourceSegmentCode,
    sourceDirection: officialDirection(row?.source_direction),
    roadCode: toText(row?.road_code) || null,
    normalizedRoadCode: toText(row?.normalized_road_code) || null,
    originOfficial: toText(row?.origin_official) || null,
    destinationOfficial: toText(row?.destination_official) || null,
    kmStart: toNumber(row?.km_start),
    kmEnd: toNumber(row?.km_end),
    projectDirection: canonicalProjectDirection(row?.project_direction),
    corridorId: toText(row?.corridor_id) || null,
    corridorRole: toText(row?.corridor_role) || null,
    mappingStatus: toText(row?.mapping_status) || null,
    directionRule: toText(row?.direction_rule) || null,
  };
}

/**
 * ROAD_DIRECTION_MAP inteira. Duplicata de `source_segment_code + source_direction` fica
 * com a PRIMEIRA ocorrência e é contada: duas leituras para a mesma chave seriam dois
 * sentidos possíveis para o mesmo fluxo, e escolher em silêncio apagaria o conflito.
 */
export function normalizeRoadDirections(rows) {
  const records = [];
  const seen = new Set();
  let dropped = 0;
  let duplicates = 0;
  for (const row of rows || []) {
    const record = normalizeRoadDirection(row);
    if (!record) { dropped += 1; continue; }
    // Linha sem sentido não disputa chave com ninguém: é o registro do código sem geometria.
    if (record.sourceDirection) {
      const key = directionKey(record.sourceSegmentCode, record.sourceDirection);
      if (seen.has(key)) { duplicates += 1; continue; }
      seen.add(key);
    }
    records.push(record);
  }
  return { records, dropped, duplicates };
}

/** `unmatched_official_layer`: o código existe no CSV, mas não na camada oficial do DER. */
export function isUnmatchedOfficialLayer(direction) {
  return direction?.mappingStatus === 'unmatched_official_layer';
}

/**
 * Um dia de um ponto de medição do corredor.
 *
 * A cobertura sai de `intervalos_minimos_15min / 96`, nunca de `cobertura_min_pct`: pelo
 * GViz ela chega como fração, mas em CSV chega como texto `"100,0%"` — a mesma coluna com
 * duas leituras possíveis é o problema que a R8.58 já resolveu em TRAFFIC_DAILY_TEST.
 *
 * `fluxo_bidirecional` é lido, não recalculado: a conferência `para_plano +
 * para_sobradinho` é feita à parte (`corridorSumMismatch`) para denunciar divergência em
 * vez de escondê-la.
 */
export function normalizeCorridorDaily(row) {
  const date = toDateISO(row?.dia);
  const sourceSegmentCode = toText(row?.source_segment_code);
  if (date === null || sourceSegmentCode === '') return null;

  return {
    id: toText(row?.corridor_daily_id) || null,
    corridorId: toText(row?.corridor_id) || null,
    date,
    monthRef: toText(row?.mes_ref) || date.slice(0, 7),
    measurementSegmentId: toText(row?.measurement_segment_id) || null,
    sourceSegmentCode,
    roadName: toText(row?.road_name) || null,
    measurementPointRole: toText(row?.measurement_point_role) || null,
    sentidoParaPlano: officialDirection(row?.sentido_para_plano),
    sentidoParaSobradinho: officialDirection(row?.sentido_para_sobradinho),
    paraPlano: toNumber(row?.fluxo_para_plano),
    paraSobradinho: toNumber(row?.fluxo_para_sobradinho),
    bidirecional: toNumber(row?.fluxo_bidirecional),
    carroParaPlano: toNumber(row?.carro_para_plano),
    carroParaSobradinho: toNumber(row?.carro_para_sobradinho),
    classes: {
      carro: toNumber(row?.carro_bidirecional),
      moto: toNumber(row?.motos_bidirecional),
      onibus: toNumber(row?.onibus_bidirecional),
      caminhao: toNumber(row?.caminhoes_bidirecional),
    },
    intervalsObserved: toInteger(row?.intervalos_minimos_15min),
    qualityFlag: toText(row?.quality_flag) || null,
  };
}

/**
 * TRAFFIC_CORRIDOR_DAILY inteira, sem duplicidade.
 *
 * Duas chaves impedem duplicata, e as duas são contadas separadamente: `corridor_daily_id`
 * repetido, e o mesmo ponto no mesmo dia do mesmo corredor sob ids diferentes (que seria o
 * mesmo dia somado duas vezes no total do período).
 */
export function normalizeCorridorDailyRecords(rows) {
  const records = [];
  const ids = new Set();
  const dias = new Set();
  let dropped = 0;
  let duplicates = 0;
  for (const row of rows || []) {
    const record = normalizeCorridorDaily(row);
    if (!record) { dropped += 1; continue; }
    const dia = `${record.corridorId}|${record.sourceSegmentCode}|${record.date}`;
    if ((record.id && ids.has(record.id)) || dias.has(dia)) { duplicates += 1; continue; }
    if (record.id) ids.add(record.id);
    dias.add(dia);
    records.push(record);
  }
  return { records, dropped, duplicates };
}

/**
 * Diferença entre o `fluxo_bidirecional` publicado e `para_plano + para_sobradinho` do
 * MESMO registro (mesmo ponto, mesmo dia) — a única soma que o contrato permite. `0`
 * quando fecha; `null` quando falta alguma das três parcelas.
 */
export function corridorSumMismatch(record) {
  const { paraPlano, paraSobradinho, bidirecional } = record || {};
  if (![paraPlano, paraSobradinho, bidirecional].every(Number.isFinite)) return null;
  return bidirecional - (paraPlano + paraSobradinho);
}

/**
 * Índice `código + sentido oficial → leitura do sentido`, com o sentido do projeto
 * resolvido quando — e só quando — o corredor o declara.
 *
 * Duas fontes para o sentido do projeto, nesta ordem:
 *   1. `ROAD_DIRECTION_MAP.project_direction` + `corridor_id`, se a planilha preencher;
 *   2. `TRAFFIC_CORRIDOR_DAILY.sentido_para_plano/_sobradinho` do código.
 *
 * O resultado também guarda os códigos SEM geometria oficial, para o painel poder dizer
 * "fluxo disponível; geometria oficial não localizada" em vez de sumir com eles.
 */
export function buildDirectionContext(directions, corridorDaily) {
  const byKey = new Map();
  const unmatchedCodes = new Set();
  for (const d of directions || []) {
    if (isUnmatchedOfficialLayer(d)) unmatchedCodes.add(d.sourceSegmentCode);
    if (!d.sourceDirection) continue;
    byKey.set(directionKey(d.sourceSegmentCode, d.sourceDirection), { ...d });
  }

  // Ponto de medição → corredor. Um código só entra no corredor se a PRÓPRIA aba do
  // corredor o listar; nenhum outro trecho herda "para o Plano Piloto".
  const corridorByCode = new Map();
  for (const r of corridorDaily || []) {
    if (!r.corridorId || corridorByCode.has(r.sourceSegmentCode)) continue;
    corridorByCode.set(r.sourceSegmentCode, {
      corridorId: r.corridorId,
      measurementPointRole: r.measurementPointRole,
      sentidoParaPlano: r.sentidoParaPlano,
      sentidoParaSobradinho: r.sentidoParaSobradinho,
    });
  }

  const projectOf = (code, direction) => {
    const d = byKey.get(directionKey(code, direction));
    if (d?.projectDirection && d.corridorId) return { projectDirection: d.projectDirection, corridorId: d.corridorId };
    const c = corridorByCode.get(code);
    if (!c || !direction) return { projectDirection: null, corridorId: c?.corridorId || null };
    if (direction === c.sentidoParaPlano) return { projectDirection: 'para_plano', corridorId: c.corridorId };
    if (direction === c.sentidoParaSobradinho) return { projectDirection: 'para_sobradinho', corridorId: c.corridorId };
    return { projectDirection: null, corridorId: c.corridorId };
  };

  return {
    byKey,
    corridorByCode,
    unmatchedCodes,
    /** Leitura oficial (origem → destino) de um código + sentido, ou `null`. */
    officialOf: (code, direction) => byKey.get(directionKey(code, direction)) || null,
    /** `{projectDirection, corridorId}` — `projectDirection` só existe dentro do corredor. */
    projectOf,
  };
}

/** Rótulo humano do papel do ponto de medição, sem inventar quando o valor é desconhecido. */
export function measurementPointLabel(role) {
  if (role === 'ponto_referencia_proximo_ao_Plano_Piloto') return 'Ponto de referência próximo ao Plano Piloto';
  if (role === 'ponto_referencia_proximo_a_Sobradinho') return 'Ponto de referência próximo a Sobradinho';
  return role || null;
}

/** `SOBRADINHO_PLANO` → `Sobradinho–Plano Piloto`; outro id aparece como veio. */
export function corridorLabel(corridorId) {
  if (corridorId === 'SOBRADINHO_PLANO') return 'Sobradinho–Plano Piloto';
  return corridorId || null;
}
