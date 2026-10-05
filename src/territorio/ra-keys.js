// A ponte entre as duas grafias de Região Administrativa — módulo puro (issue #149, R2.9).
//
// `RA_nn` (RA_PROFILES, POLYGONS, PDAD_A_DATA, arquivos públicos) e `RA2026_RA-<romano>`
// (LISTINGS, DEVELOPMENTS, ANCHORS) só se cruzam por `data/public/ra_crosswalk.json`, que o
// pipeline deriva dos atributos oficiais do GeoPortal. Sem a ponte carregada, um id romano
// resolve `null`: NÃO existe aritmética de algarismos romanos neste cliente, de propósito —
// um fallback que adivinha recriaria o join por semelhança que a ponte existe para impedir
// (R8.30, R8.51). Conflito de nome entre a ponte e as outras abas BLOQUEIA o join daquela RA
// (falha fechado, R8.16).

import { toInteger, toNumber, toText } from '../normalize.js';

const NN_RE = /^RA_\d{2}$/;
const ROMAN_KEY_RE = /^RA2026_RA-[IVXLC]+$/;
const CODE_RE = /^RA-[IVXLC]+$/;

export const EMPTY_CROSSWALK = Object.freeze({
  byNn: new Map(), byRoman: new Map(), byCode: new Map(), byNumber: new Map(), rows: [], warnings: [],
});

function pad2(n) {
  return `RA_${String(n).padStart(2, '0')}`;
}

/** Normaliza uma linha crua de `ra_crosswalk.json`; devolve `null` + motivo quando inválida. */
export function normalizeCrosswalkRow(raw) {
  const raNumber = toInteger(raw?.ra_number);
  const raGeoId = toText(raw?.ra_geo_id);
  const raGeoIdRoman = toText(raw?.ra_geo_id_roman).toUpperCase();
  const raCode = toText(raw?.ra_code).toUpperCase();
  if (raNumber === null || raNumber < 1) return { row: null, reason: 'ra_number ausente ou inválido' };
  if (!NN_RE.test(raGeoId) || raGeoId !== pad2(raNumber)) return { row: null, reason: `ra_geo_id ${JSON.stringify(raGeoId)} não casa com ra_number ${raNumber}` };
  if (!ROMAN_KEY_RE.test(raGeoIdRoman)) return { row: null, reason: `ra_geo_id_roman inválido ${JSON.stringify(raw?.ra_geo_id_roman)}` };
  if (!CODE_RE.test(raCode) || raGeoIdRoman !== `RA2026_${raCode}`) return { row: null, reason: `ra_code ${JSON.stringify(raw?.ra_code)} não casa com ra_geo_id_roman` };
  return {
    row: {
      raNumber,
      raGeoId,
      raCode,
      raGeoIdRoman,
      raName: toText(raw?.ra_name) || raGeoId,
      raNameSource: toText(raw?.ra_name_source) || null,
      raSlug: toText(raw?.ra_slug) || null,
      raAreaKm2: toNumber(raw?.ra_area_km2),
      geoportalObjectId: toInteger(raw?.geoportal_objectid),
    },
    reason: null,
  };
}

/**
 * Constrói os índices da ponte. Linha inválida ou que repete chave de outra é descartada com
 * aviso nomeado — as DUAS linhas do conflito saem, porque não há como saber qual está certa.
 */
export function buildRaCrosswalk(rawRows) {
  const warnings = [];
  const rows = [];
  if (!Array.isArray(rawRows)) {
    return { ...EMPTY_CROSSWALK, warnings: ['Território (ponte de RAs): rows não é uma lista.'] };
  }
  for (const raw of rawRows) {
    const { row, reason } = normalizeCrosswalkRow(raw);
    if (!row) {
      warnings.push(`Território (ponte de RAs): linha descartada — ${reason}.`);
      continue;
    }
    rows.push(row);
  }
  const conflicted = new Set();
  for (const key of ['raNumber', 'raGeoId', 'raGeoIdRoman', 'raCode']) {
    const seen = new Map();
    for (const row of rows) {
      const value = row[key];
      if (seen.has(value)) { conflicted.add(seen.get(value)); conflicted.add(row); }
      else seen.set(value, row);
    }
  }
  const kept = rows.filter((row) => !conflicted.has(row));
  for (const row of conflicted) {
    warnings.push(`Território (ponte de RAs): ${row.raGeoId} / ${row.raGeoIdRoman} repete uma chave de outra linha; as duas foram descartadas.`);
  }
  kept.sort((a, b) => a.raNumber - b.raNumber);
  return {
    byNn: new Map(kept.map((r) => [r.raGeoId, r])),
    byRoman: new Map(kept.map((r) => [r.raGeoIdRoman, r])),
    byCode: new Map(kept.map((r) => [r.raCode, r])),
    byNumber: new Map(kept.map((r) => [r.raNumber, r])),
    rows: kept,
    warnings,
  };
}

/**
 * Qualquer grafia → `RA_nn`, ou `null`.
 *
 * `RA_07` só é devolvido quando tem a FORMA certa e, havendo ponte, existe nela; grafia
 * romana (`RA2026_RA-VII`, `RA-VII`) e número só resolvem pela ponte — nunca por conta.
 */
export function toRaNn(id, crosswalk = EMPTY_CROSSWALK) {
  if (id === null || id === undefined) return null;
  if (typeof id === 'number' && Number.isInteger(id)) {
    const row = crosswalk.byNumber.get(id);
    return row ? row.raGeoId : null;
  }
  const text = toText(id);
  if (NN_RE.test(text)) {
    if (crosswalk.byNn.size === 0) return text;
    return crosswalk.byNn.has(text) ? text : null;
  }
  const upper = text.toUpperCase();
  if (ROMAN_KEY_RE.test(upper)) return crosswalk.byRoman.get(upper)?.raGeoId ?? null;
  if (CODE_RE.test(upper)) return crosswalk.byCode.get(upper)?.raGeoId ?? null;
  if (/^\d+$/.test(text)) return crosswalk.byNumber.get(Number(text))?.raGeoId ?? null;
  return null;
}

/** Qualquer grafia → `RA2026_RA-<romano>`, ou `null`. Sempre pela ponte. */
export function toRaRoman(id, crosswalk = EMPTY_CROSSWALK) {
  const nn = toRaNn(id, crosswalk);
  if (!nn) return null;
  return crosswalk.byNn.get(nn)?.raGeoIdRoman ?? null;
}

/** Minúsculas, sem acento, sem espaço duplo — só para comparar nomes, nunca para exibir. */
export function normalizeRaName(text) {
  return toText(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * RAs cujo nome na ponte difere do nome em RA_PROFILES ou no PDAD. Diferença é sinal de que
 * o número aponta para outra RA em alguma das fontes — o join daquela RA fica bloqueado.
 */
export function raNameConflicts(crosswalk, { raProfiles = {}, pdadRas = [] } = {}) {
  const conflicts = [];
  const pdadByNn = new Map((pdadRas || []).map((ra) => [ra.raGeoId, ra.raName]));
  for (const row of crosswalk.rows) {
    const mine = normalizeRaName(row.raName);
    const profile = raProfiles[row.raGeoId]?.ra_name;
    const pdad = pdadByNn.get(row.raGeoId);
    const profileDiff = profile && normalizeRaName(profile) !== mine;
    const pdadDiff = pdad && normalizeRaName(pdad) !== mine;
    if (profileDiff || pdadDiff) {
      conflicts.push({ raGeoId: row.raGeoId, crosswalk: row.raName, raProfiles: profile || null, pdad: pdad || null });
    }
  }
  return conflicts;
}

/**
 * A ponte SEM as RAs indicadas — novo objeto, sem mutação. É como o conflito de nome bloqueia
 * o join de uma RA: ela sai de TODOS os índices de uma vez, para a grafia romana não continuar
 * resolvendo pelo `byRoman` enquanto o `byNn` já a recusou.
 */
export function excludeRas(crosswalk, raGeoIds) {
  const banned = new Set(raGeoIds || []);
  if (banned.size === 0) return crosswalk;
  const kept = crosswalk.rows.filter((row) => !banned.has(row.raGeoId));
  return {
    byNn: new Map(kept.map((r) => [r.raGeoId, r])),
    byRoman: new Map(kept.map((r) => [r.raGeoIdRoman, r])),
    byCode: new Map(kept.map((r) => [r.raCode, r])),
    byNumber: new Map(kept.map((r) => [r.raNumber, r])),
    rows: kept,
    warnings: crosswalk.warnings,
  };
}
