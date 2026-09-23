// Filtros do fluxo rodoviário (issue #142) — funções puras.
//
// Um único estado de filtro governa as três leituras do mesmo dado: a cor/espessura do
// eixo no mapa, a lista de trechos do painel lateral e o detalhe do trecho. Filtrar num
// lugar e não no outro faria o mapa dizer uma coisa e o painel outra sobre o mesmo recorte.
//
// O filtro NÃO descarta trecho: um trecho sem nenhum dia no recorte continua na estrutura,
// com os baldes vazios — é isso que o mapa pinta de cinza ("sem dado no filtro escolhido"),
// que é diferente de o trecho não existir.
import { VEHICLE_CLASSES } from './panel.js';
import { corridorLabel, PROJECT_DIRECTIONS } from './direction.js';
import { isRealCalendarDate } from '../normalize.js';

export const EMPTY_TRAFFIC_FILTERS = Object.freeze({
  month: '',
  day: '',
  dateFrom: '',
  dateTo: '',
  road: '',
  segment: '',
  corridor: '',
  officialDirection: '',
  projectDirection: '',
  vehicleClass: '',
  quality: '',
});

/** Quantos filtros de fluxo estão ativos — o resumo da gaveta mostra isso. */
export function activeTrafficFilterCount(filters) {
  return Object.keys(EMPTY_TRAFFIC_FILTERS).filter((k) => Boolean(filters?.[k])).length;
}

/** O recorte temporal de um registro com `date` ISO. Vale para as duas abas. */
export function datePasses(date, filters) {
  if (!filters) return true;
  if (typeof date !== 'string') return !(filters.month || filters.day || filters.dateFrom || filters.dateTo);
  if (filters.month && date.slice(0, 7) !== filters.month) return false;
  if (filters.day && date !== filters.day) return false;
  if (filters.dateFrom && date < filters.dateFrom) return false;
  if (filters.dateTo && date > filters.dateTo) return false;
  return true;
}

/** Rótulo de uma classe de veículo; string vazia é "todas as classes" (fluxo total). */
export function vehicleClassLabel(key) {
  if (!key) return 'Todos os veículos';
  return VEHICLE_CLASSES.find((c) => c.key === key)?.label || key;
}

/**
 * O registro com `flow` trocado pela classe escolhida.
 *
 * É assim que "classe de veículo" muda TODOS os indicadores do recorte de uma vez — total,
 * média, por mês, cor do eixo — sem uma segunda implementação de cada um. Classe ausente
 * vira `null`, nunca zero (R5.7). O pico de 15 min e a divergência de classes são do
 * TOTAL; com uma classe escolhida eles deixam de descrever o que está na tela e saem.
 */
function withMetric(record, vehicleClass) {
  if (!vehicleClass) return record;
  const value = record?.classes?.[vehicleClass];
  return {
    ...record,
    flow: Number.isFinite(value) ? value : null,
    peakFlow: null,
    peakInterval: null,
    classDivergence: null,
  };
}

function segmentPasses(linked, filters, directionCtx) {
  if (filters.road && (linked.roadCode || '') !== filters.road) return false;
  if (filters.segment && (linked.sourceSegmentCode || '') !== filters.segment) return false;
  if (filters.corridor) {
    const c = directionCtx?.corridorByCode?.get(linked.sourceSegmentCode);
    if (!c || c.corridorId !== filters.corridor) return false;
  }
  return true;
}

function recordPasses(record, code, filters, directionCtx) {
  if (!datePasses(record.date, filters)) return false;
  if (filters.officialDirection && record.direction !== filters.officialDirection) return false;
  if (filters.quality && (record.qualityFlag || '') !== filters.quality) return false;
  if (filters.projectDirection) {
    const { projectDirection } = directionCtx?.projectOf?.(code, record.direction) || {};
    if (projectDirection !== filters.projectDirection) return false;
  }
  return true;
}

function filterBuckets(traffic, code, filters, directionCtx, keep) {
  const out = { crescente: [], decrescente: [], semSentido: [] };
  if (!keep || !traffic) return out;
  for (const key of Object.keys(out)) {
    for (const record of traffic[key] || []) {
      const recordCode = record.sourceSegmentCode || code;
      if (!recordPasses(record, recordCode, filters, directionCtx)) continue;
      out[key].push(withMetric(record, filters.vehicleClass));
    }
  }
  return out;
}

/**
 * Aplica o filtro sobre o resultado de `linkTrafficDataset`, devolvendo a MESMA forma.
 *
 * Quem consome (`roadSegmentTrafficDetail`, `trafficPanelRows`, `segmentIdsWithTraffic`)
 * não precisa saber que houve filtro. `unmatchedTraffic` (fluxo cujo trecho não tem
 * geometria oficial) passa pelo mesmo recorte.
 */
export function filterLinkedTraffic(traffic, filters, directionCtx) {
  const f = { ...EMPTY_TRAFFIC_FILTERS, ...(filters || {}) };
  const bySegmentId = new Map();
  for (const [id, linked] of traffic?.bySegmentId || []) {
    const keep = segmentPasses(linked, f, directionCtx);
    bySegmentId.set(id, {
      ...linked,
      traffic: filterBuckets(linked.traffic, linked.sourceSegmentCode, f, directionCtx, keep),
    });
  }

  const unmatchedTraffic = new Map();
  for (const [id, entry] of traffic?.unmatchedTraffic || []) {
    const pseudo = { roadCode: entry.roadCode || '', sourceSegmentCode: entry.sourceSegmentCode || '' };
    const keep = segmentPasses(pseudo, f, directionCtx);
    unmatchedTraffic.set(id, {
      ...entry,
      traffic: filterBuckets(entry.traffic, entry.sourceSegmentCode, f, directionCtx, keep),
    });
  }

  return { ...traffic, bySegmentId, unmatchedTraffic };
}

/**
 * Linhas de TRAFFIC_CORRIDOR_DAILY que passam no recorte (sem a troca de classe).
 *
 * `roadCodeOf(record)` resolve a rodovia pelo trecho declarado (`measurement_segment_id`);
 * sem ele, cai no `road_name` da própria linha.
 */
export function filterCorridorDaily(records, filters, roadCodeOf = () => null) {
  const f = { ...EMPTY_TRAFFIC_FILTERS, ...(filters || {}) };
  return (records || []).filter((r) => {
    if (!datePasses(r.date, f)) return false;
    if (f.corridor && r.corridorId !== f.corridor) return false;
    if (f.segment && r.sourceSegmentCode !== f.segment) return false;
    if (f.road && (roadCodeOf(r) || r.roadName) !== f.road) return false;
    if (f.quality && (r.qualityFlag || '') !== f.quality) return false;
    return true;
  });
}

function sortedUnique(values, compare) {
  return [...new Set(values.filter(Boolean))].sort(compare);
}

const NOME_DO_MES = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });

/** `2026-07` → `Julho/2026`. */
export function monthLabel(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return month || '';
  const nome = NOME_DO_MES.format(new Date(`${month}-01T00:00:00Z`));
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}/${month.slice(0, 4)}`;
}

/**
 * Opções de cada seletor, DERIVADAS dos dados carregados — nenhum mês fixo. Um CSV mensal
 * novo na planilha aparece sozinho no seletor de mês.
 *
 * Os dias oferecidos respeitam o mês escolhido (uma lista de 120 dias soltos não serve a
 * ninguém), e os trechos respeitam a rodovia escolhida.
 */
export function trafficFilterOptions(traffic, directionCtx, corridorDaily, filters = EMPTY_TRAFFIC_FILTERS) {
  const dates = [];
  const quality = [];
  const roads = [];
  const segments = [];

  const visit = (roadCode, code, buckets) => {
    let has = false;
    for (const key of ['crescente', 'decrescente', 'semSentido']) {
      for (const r of buckets?.[key] || []) {
        has = true;
        if (isRealCalendarDate(r.date)) dates.push(r.date);
        if (r.qualityFlag) quality.push(r.qualityFlag);
      }
    }
    if (!has) return;
    if (roadCode) roads.push(roadCode);
    if (code && (!filters.road || roadCode === filters.road)) segments.push(code);
  };

  for (const linked of traffic?.bySegmentId?.values() || []) {
    visit(linked.roadCode, linked.sourceSegmentCode, linked.traffic);
  }
  for (const entry of traffic?.unmatchedTraffic?.values() || []) {
    visit(entry.roadCode, entry.sourceSegmentCode, entry.traffic);
  }
  for (const r of corridorDaily || []) {
    if (isRealCalendarDate(r.date)) dates.push(r.date);
    if (r.qualityFlag) quality.push(r.qualityFlag);
  }

  const months = sortedUnique(dates.map((d) => d.slice(0, 7))).reverse();
  const days = sortedUnique(dates.filter((d) => !filters.month || d.startsWith(filters.month)));
  const corridors = sortedUnique([...(directionCtx?.corridorByCode?.values() || [])].map((c) => c.corridorId));

  return {
    months: months.map((value) => ({ value, label: monthLabel(value) })),
    days,
    roads: sortedUnique(roads, (a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
    segments: sortedUnique(segments),
    corridors: corridors.map((value) => ({ value, label: corridorLabel(value) })),
    officialDirections: [
      { value: 'crescente', label: 'Crescente (Km inicial → Km final)' },
      { value: 'decrescente', label: 'Decrescente (Km final → Km inicial)' },
    ],
    projectDirections: Object.entries(PROJECT_DIRECTIONS).map(([value, label]) => ({ value, label })),
    vehicleClasses: VEHICLE_CLASSES.map(({ key, label }) => ({ value: key, label })),
    quality: sortedUnique(quality),
  };
}

// --- Representação no mapa ----------------------------------------------------------

/**
 * Cores por sentido. O sentido do projeto tem as cores da instrução (Plano = laranja,
 * Sobradinho = azul); o sentido oficial usa outro par, de propósito: pintar "crescente" de
 * azul em toda via faria qualquer trecho parecer "para Sobradinho".
 */
export const DIRECTION_COLORS = Object.freeze({
  para_plano: '#E8590C',
  para_sobradinho: '#1C7ED6',
  crescente: '#7048E8',
  decrescente: '#0C8599',
  sem_dado: '#9AA0A6',
});

/**
 * Espessura do eixo proporcional ao fluxo do recorte, entre `min` e `max` px.
 *
 * Raiz quadrada, não linear: a DF-003 passa de 130 mil veíc./dia e um trecho rural passa
 * de poucos milhares; na escala linear quase todo o mapa ficaria no mínimo.
 */
export function flowWeight(value, maxValue, { min = 3, max = 10 } = {}) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(maxValue) || maxValue <= 0) return min;
  return min + (max - min) * Math.sqrt(Math.min(value, maxValue) / maxValue);
}

/** Soma do `flow` do recorte de um trecho (todos os baldes), ou `null` sem nenhum dia. */
export function segmentFlowTotal(linkedOrEntry) {
  const t = linkedOrEntry?.traffic;
  if (!t) return null;
  let total = null;
  for (const key of ['crescente', 'decrescente', 'semSentido']) {
    for (const r of t[key] || []) {
      if (!Number.isFinite(r.flow)) continue;
      total = (total === null ? 0 : total) + r.flow;
    }
  }
  return total;
}

/**
 * Estilo de exibição do eixo sob o filtro corrente: cor e espessura.
 *
 * - sem dado no recorte → cinza, espessura mínima, tracejado;
 * - com filtro de sentido (oficial ou do projeto) → a cor do sentido;
 * - sem filtro de sentido → a cor que a planilha declarou para o trecho (é ela que a
 *   legenda usa para dizer QUAL trecho é).
 */
export function roadFlowDisplay({ total, maxTotal, baseColor, filters }) {
  if (total === null || total === undefined) {
    return { color: DIRECTION_COLORS.sem_dado, weight: 2, dashArray: '4 4', hasData: false };
  }
  let color = baseColor;
  if (filters?.projectDirection) color = DIRECTION_COLORS[filters.projectDirection] || baseColor;
  else if (filters?.officialDirection) color = DIRECTION_COLORS[filters.officialDirection] || baseColor;
  return { color, weight: flowWeight(total, maxTotal), dashArray: null, hasData: true };
}
