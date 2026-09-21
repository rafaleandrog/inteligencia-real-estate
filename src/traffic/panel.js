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

import { averageFlow, classifyDayCoverage } from './coverage.js';

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

// --- Bloco de fluxo no painel do trecho no mapa (issue #131) -------------------------
//
// O painel lateral acima é uma LISTA de trechos; isto aqui é o detalhe de UM trecho,
// aberto ao clicar no eixo dele no mapa. Os dois consomem o mesmo `linkTrafficDataset`,
// e é por isso que este modelo mora no mesmo arquivo: uma segunda fonte para "o fluxo
// deste trecho" seria duas verdades sobre o mesmo dado (R8.7).

/** Classes de veículo do contrato, na ordem em que a tela as mostra. */
export const VEHICLE_CLASSES = Object.freeze([
  { key: 'carro', label: 'Carro' },
  { key: 'moto', label: 'Moto' },
  { key: 'onibus', label: 'Ônibus' },
  { key: 'caminhao', label: 'Caminhão' },
  { key: 'medio', label: 'Médio' },
  { key: 'indefinido', label: 'Indefinido' },
]);

/**
 * Soma de cada classe de veículo sobre um conjunto de dias, declarando sobre quantos
 * dias cada soma foi feita.
 *
 * Dia sem medição de uma classe NÃO entra como zero — é a mesma regra do fluxo total
 * (R5.7, issue #64): zero caminhões é uma via por onde caminhão não passa, ausência de
 * medição é outra afirmação. Por isso a contagem de dias é POR CLASSE: uma classe medida
 * em 3 de 20 dias não pode ser somada como se tivesse 20.
 *
 * Classe sem nenhum dia medido devolve `total: null`, nunca `0`.
 */
export function classTotals(records) {
  const out = [];
  for (const { key, label } of VEHICLE_CLASSES) {
    let total = null;
    let days = 0;
    for (const record of records || []) {
      const value = record?.classes?.[key];
      if (!Number.isFinite(value)) continue;
      total = (total === null ? 0 : total) + value;
      days += 1;
    }
    out.push({ key, label, total, days });
  }
  return out;
}

/**
 * Cobertura de um conjunto de dias, derivada SEMPRE de `intervalos_15min_observados`.
 *
 * `cobertura_dia_pct` continua sem ser lido em lugar nenhum — ver a nota de topo de
 * src/traffic/coverage.js e a R8.58: o campo tem bug de locale em 9 dos 100 registros do
 * piloto, e é o pior tipo de coluna, porque acerta na maioria e só denuncia o bug num dia
 * parcial.
 */
function resumoCobertura(records) {
  let completos = 0;
  let parciais = 0;
  let desconhecidos = 0;
  for (const record of records || []) {
    const { status } = classifyDayCoverage(record?.intervalsObserved);
    if (status === 'complete') completos += 1;
    else if (status === 'partial') parciais += 1;
    else desconhecidos += 1;
  }
  return { completos, parciais, desconhecidos };
}

/** Sinalizações de qualidade presentes no conjunto, com quantos dias cada uma cobre. */
function bandeirasDeQualidade(records) {
  const contagem = new Map();
  for (const record of records || []) {
    const flag = record?.qualityFlag;
    if (!flag) continue;
    contagem.set(flag, (contagem.get(flag) || 0) + 1);
  }
  return [...contagem.entries()]
    .map(([flag, days]) => ({ flag, days }))
    .sort((a, b) => a.flag.localeCompare(b.flag, 'pt-BR'));
}

/**
 * Fluxo total do período — a soma dos totais diários medidos.
 *
 * Dia sem `flow` numérico não vira zero: ele é excluído e contado em `daysExcluded`, pela
 * mesma razão das classes. `null` quando nenhum dia tem total.
 */
function fluxoTotal(records) {
  let total = null;
  let daysUsed = 0;
  let daysExcluded = 0;
  for (const record of records || []) {
    if (!Number.isFinite(record?.flow)) { daysExcluded += 1; continue; }
    total = (total === null ? 0 : total) + record.flow;
    daysUsed += 1;
  }
  return { total, daysUsed, daysExcluded };
}

/** Um recorte de dias (um sentido, ou o trecho inteiro) pronto para a tela. */
function recorte(label, records) {
  const ordenados = ordenadosPorData(records);
  return {
    label,
    days: ordenados.length,
    resumo: resumoDias(ordenados),
    total: fluxoTotal(ordenados),
    classes: classTotals(ordenados),
    cobertura: resumoCobertura(ordenados),
    qualityFlags: bandeirasDeQualidade(ordenados),
  };
}

/**
 * Detalhe de fluxo de UM trecho, para o painel do mapa.
 *
 * `crescente` e `decrescente` são medições diferentes da mesma via (issue #62/#63): elas
 * aparecem SEPARADAS, e o recorte "geral" existe só para responder "quantos dias este
 * trecho tem alguma medição" — nunca para ser citado como o fluxo do trecho.
 *
 * Nenhuma seta direcional sai daqui, e é deliberado: a ordem dos vértices da geometria do
 * DER é a ordem de digitalização da feição, e não há nada no dado que garanta que ela
 * corresponda ao sentido "crescente" do tráfego. Desenhar a seta seria afirmar isso.
 *
 * @returns {null|{ segmentId, hasTraffic, geral, porSentido, orphanDays }}
 */
export function roadSegmentTrafficDetail(linked) {
  if (!linked) return null;
  const traffic = linked.traffic || { crescente: [], decrescente: [], semSentido: [] };
  const todos = [...traffic.crescente, ...traffic.decrescente, ...traffic.semSentido];

  const porSentido = [];
  if (traffic.crescente.length > 0) porSentido.push(recorte('Crescente', traffic.crescente));
  if (traffic.decrescente.length > 0) porSentido.push(recorte('Decrescente', traffic.decrescente));
  // Dia sem sentido declarado não é descartado nem fundido num dos dois: ele vira um
  // recorte próprio, com o nome do que é. Somá-lo a um sentido escolhido por conveniência
  // seria atribuir uma direção que o registro não tem.
  if (traffic.semSentido.length > 0) porSentido.push(recorte('Sem sentido declarado', traffic.semSentido));

  return {
    segmentId: linked.roadSegmentId || null,
    hasTraffic: todos.length > 0,
    geral: recorte('Todos os sentidos', todos),
    porSentido,
  };
}
