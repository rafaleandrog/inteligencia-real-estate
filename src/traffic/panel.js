// Modelo do painel de trechos rodoviários com tráfego (issue #63) — funções puras.
//
// Consome `linkTrafficDataset()` (src/traffic/link.js) e devolve uma linha por trecho,
// pronta para a tela: identidade, se tem geometria sincronizada, e o resumo de fluxo por
// sentido. Nenhuma decisão de agregação mora aqui — `averageFlow` (src/traffic/coverage.js)
// já declara sobre quantos dias o número foi calculado e quantos eram parciais, e este
// módulo só reusa isso por sentido e no total do trecho.
//
// `road_sync_synced_count = 0` hoje: nenhum trecho tem geometria ainda. Um trecho sem
// `polygon` continua aparecendo na lista, com `hasGeometry: false` — a tela decide o que
// fazer com isso (Recomendação 8 do backend: nunca desenhar traço inventado, mas a tabela
// não é o mapa).

import { averageFlow } from './coverage.js';

function ordenadosPorData(records) {
  return [...(records || [])]
    .filter((r) => r && typeof r.date === 'string')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Resumo de um conjunto de dias de tráfego (um sentido, ou o trecho inteiro): fluxo
 * médio (com a mesma declaração de dias/parciais de `averageFlow`), fluxo do dia mais
 * recente e a janela de datas coberta.
 */
function resumoDias(records) {
  const ordenados = ordenadosPorData(records);
  const media = averageFlow(
    ordenados.map((r) => ({ flow: r.flow, intervalsObserved: r.intervalsObserved }))
  );
  const ultimo = ordenados.at(-1) || null;

  return {
    avgDailyFlow: media.average,
    daysUsed: media.daysUsed,
    partialDaysUsed: media.partialDaysUsed,
    daysExcluded: media.daysExcluded,
    latestFlow: ultimo && Number.isFinite(ultimo.flow) ? ultimo.flow : null,
    latestDate: ultimo?.date || null,
    windowStart: ordenados[0]?.date || null,
    windowEnd: ordenados.at(-1)?.date || null,
  };
}

/**
 * Uma linha do painel, a partir de um trecho já ligado por `linkTrafficDataset`.
 *
 * O resumo "geral" mistura os dois sentidos apenas para o card de topo (quantos dias
 * o trecho tem alguma medição); `porSentido` é o número que se pode citar, porque
 * `crescente` e `decrescente` são medições diferentes da mesma via (issue #62/#63) e
 * somá-las às cegas mistura dois fluxos que não são o mesmo dado.
 */
export function trafficSegmentRow(linked) {
  if (!linked) return null;
  const traffic = linked.traffic || { crescente: [], decrescente: [], semSentido: [] };
  const todos = [...traffic.crescente, ...traffic.decrescente, ...traffic.semSentido];

  return {
    id: linked.roadSegmentId,
    name: linked.name || null,
    roadCode: linked.roadCode || null,
    sourceSegmentCode: linked.sourceSegmentCode || null,
    segmentType: linked.segmentType || null,
    jurisdiction: linked.jurisdiction || null,
    hasGeometry: Boolean(linked.polygon),
    polygonId: linked.polygon ? linked.polygon.id : null,
    geral: resumoDias(todos),
    porSentido: {
      crescente: traffic.crescente.length > 0 ? resumoDias(traffic.crescente) : null,
      decrescente: traffic.decrescente.length > 0 ? resumoDias(traffic.decrescente) : null,
    },
    semSentidoCount: traffic.semSentido.length,
  };
}

/**
 * Todas as linhas do painel, ordenadas por nome da via (e pelo id quando o nome faltar,
 * para a ordem não pular a cada carregamento).
 */
export function trafficPanelRows(bySegmentId) {
  const linked = bySegmentId ? [...bySegmentId.values()] : [];
  return linked
    .map(trafficSegmentRow)
    .filter(Boolean)
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, 'pt-BR'));
}
