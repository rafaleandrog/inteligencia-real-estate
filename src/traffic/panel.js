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

/**
 * O maior pico de 15 min do recorte, com o dia e a janela em que aconteceu (issue #134).
 *
 * O pico NÃO é somado nem promediado entre dias: `pico_15min_fluxo` é o maior quarto de
 * hora DAQUELE dia, e somar máximos de dias diferentes produz um número que nunca foi
 * medido. O que se pode dizer do período é qual foi o maior deles — e quando.
 */
function picoDoPeriodo(records) {
  let melhor = null;
  for (const record of records || []) {
    if (!Number.isFinite(record?.peakFlow)) continue;
    if (melhor === null || record.peakFlow > melhor.flow) {
      melhor = { flow: record.peakFlow, interval: record.peakInterval || null, date: record.date };
    }
  }
  return melhor;
}

/**
 * `2026-04-03` -> `2026-04`. Qualquer outra coisa devolve `null`.
 *
 * Valida a data INTEIRA, inclusive se o dia existe naquele mês. `toDateISO`
 * (src/normalize.js) devolve `2026-04-31` e `2026-02-30` intactos — ela reconhece o
 * FORMATO, não o calendário —, e uma versão anterior desta função olhava só os sete
 * primeiros caracteres. O efeito era um 31 de abril entrar no balde de abril e contar
 * como um dia distinto: com lixo suficiente o painel dizia "31 de 30 dias medidos", que é
 * exatamente a afirmação que esta issue existe para não fazer (achado P2 do Codex na
 * PR #139).
 *
 * `toDateISO` fica como está de propósito: anúncios, empreendimentos, IVV e FipeZap
 * dependem dela, e endurecê-la aqui mudaria o comportamento de quatro datasets numa
 * mudança sobre o painel do trecho.
 */
function mesDe(date) {
  if (typeof date !== 'string') return null;
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) return null;
  const mes = date.slice(0, 7);
  return Number(date.slice(8, 10)) <= diasNoMes(mes) ? mes : null;
}

/**
 * Quantos dias tem o mês, lido do próprio mês — nunca de constante.
 *
 * É o que faz o rótulo se corrigir sozinho: fevereiro diz 28 (ou 29 em ano bissexto) sem
 * ninguém tocar no código, e o dia 0 do mês seguinte em UTC é a definição que não depende
 * do fuso de quem abre a página.
 */
function diasNoMes(mes) {
  const ano = Number(mes.slice(0, 4));
  const indice = Number(mes.slice(5, 7));
  return new Date(Date.UTC(ano, indice, 0)).getUTCDate();
}

const NOME_DO_MES = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });

/** `2026-04` -> `Abril/2026`. */
function rotuloDoMes(mes) {
  const nome = NOME_DO_MES.format(new Date(`${mes}-01T00:00:00Z`));
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}/${mes.slice(0, 4)}`;
}

/**
 * Fluxo por mês de calendário: uma linha por mês presente, com quantos dias do mês
 * foram medidos (issue #138).
 *
 * `total` é SOMA DOS DIAS MEDIDOS, nunca projeção. Um mês com 20 dos 30 dias medidos
 * mostra o que passou nesses 20 dias e declara que são 20 de 30 — multiplicar a média
 * por 30 inventaria dez dias que ninguém contou, e num trecho com dias parciais o viés
 * da média entraria multiplicado.
 *
 * A contagem de dias é de DIAS DO CALENDÁRIO, não de registros: num trecho com os dois
 * sentidos medidos o mesmo dia aparece em dois registros, e contar registros diria "40 de
 * 30 dias" em abril. O total, esse sim, soma os dois sentidos — é o fluxo do trecho.
 *
 * Dia sem `fluxo_total` numérico não vira zero: ele fica fora da soma e fora da contagem
 * de dias medidos, pela mesma regra de `fluxoTotal` e das classes (R5.7).
 */
export function monthlyTotals(records) {
  const meses = new Map();

  for (const record of records || []) {
    const mes = mesDe(record?.date);
    if (mes === null) continue;
    if (!meses.has(mes)) meses.set(mes, new Map());
    const dias = meses.get(mes);
    if (!dias.has(record.date)) dias.set(record.date, { total: null, completos: 0, parciais: 0, desconhecidos: 0 });
    const dia = dias.get(record.date);

    const { status } = classifyDayCoverage(record?.intervalsObserved);
    if (status === 'complete') dia.completos += 1;
    else if (status === 'partial') dia.parciais += 1;
    else dia.desconhecidos += 1;

    if (!Number.isFinite(record?.flow)) continue;
    dia.total = (dia.total === null ? 0 : dia.total) + record.flow;
  }

  const linhas = [];
  for (const [mes, dias] of meses) {
    let total = null;
    let medidos = 0;
    let excluidos = 0;
    let completos = 0;
    let parciais = 0;
    let desconhecidos = 0;

    for (const dia of dias.values()) {
      // Um dia do calendário com os dois sentidos medidos só conta como completo quando
      // NENHUM dos registros dele é parcial: bastar um sentido completo diria "dia
      // completo" sobre uma via medida pela metade.
      if (dia.parciais > 0) parciais += 1;
      else if (dia.completos > 0) completos += 1;
      else desconhecidos += 1;

      if (dia.total === null) { excluidos += 1; continue; }
      total = (total === null ? 0 : total) + dia.total;
      medidos += 1;
    }

    linhas.push({
      month: mes,
      label: rotuloDoMes(mes),
      total,
      days: medidos,
      daysInMonth: diasNoMes(mes),
      daysExcluded: excluidos,
      complete: completos,
      partial: parciais,
      unknown: desconhecidos,
    });
  }

  // Ordem cronológica, para a lista não trocar de posição entre carregamentos.
  return linhas.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}

/**
 * Quantos registros do recorte trazem uma data que não existe no calendário (issue #138).
 *
 * Eles continuam no total do período — é o comportamento que já existia, e esta contagem
 * não o muda. O que ela evita é a diferença SILENCIOSA: sem ela, o total do período
 * incluiria um registro que nenhuma linha de mês contabiliza, e as duas contas
 * divergiriam sem nada na tela explicando por quê.
 */
export function invalidDateDays(records) {
  // Datas DISTINTAS, pela mesma razão de `monthlyTotals`: com os dois sentidos medidos o
  // mesmo dia aparece em dois registros, e "2 dias com data inválida" sobre um único
  // 31 de abril seria mais um número inventado ao lado do que já está errado.
  const datas = new Set();
  for (const record of records || []) {
    if (typeof record?.date !== 'string') continue;
    if (mesDe(record.date) === null) datas.add(record.date);
  }
  return datas.size;
}

/**
 * Os dias em que a conferência do backend entre `fluxo_total` e a soma das classes NÃO
 * fecha, e a soma dessas diferenças. `null` quando fecha em todos — o caso normal.
 *
 * O número não é recalculado aqui: `divergencia_total_classes` é a conta da FONTE, e
 * refazê-la substituiria a conferência dela pela nossa, apagando exatamente a divergência
 * que o campo existe para denunciar.
 */
export function divergenceSummary(records) {
  let days = 0;
  let total = 0;
  for (const record of records || []) {
    const diferenca = record?.classDivergence;
    if (!Number.isFinite(diferenca) || diferenca === 0) continue;
    days += 1;
    total += diferenca;
  }
  return days === 0 ? null : { days, total };
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
    pico: picoDoPeriodo(ordenados),
    porMes: monthlyTotals(ordenados),
    diasSemDataValida: invalidDateDays(ordenados),
    divergencia: divergenceSummary(ordenados),
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
