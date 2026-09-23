// Resumo do período filtrado para o painel do trecho (issue #142) — funções puras.
//
// Separa, no mesmo painel, quatro coisas que parecem iguais e não são:
//
//   1. TMD oficial DER/DF — referência publicada pelo DER para a rodovia. NÃO é derivado do
//      período escolhido e não muda com filtro nenhum.
//   2. Fluxo medido no período — soma dos dias de TRAFFIC_DAILY_TEST que passam no filtro.
//   3. Sentido oficial (crescente/decrescente, com origem → destino de ROAD_DIRECTION_MAP).
//   4. Sentido do projeto (para o Plano Piloto / para Sobradinho) — só no corredor.
//
// "Bidirecional" é a soma dos dois sentidos do MESMO trecho no MESMO dia, e só é calculada
// nos dias em que os dois foram medidos. Somar pontos de medição diferentes nunca acontece
// aqui: cada resumo é de UM trecho. E nada aqui é "veículos únicos" — são passagens.
import { classifyDayCoverage } from './coverage.js';
import { classTotals, VEHICLE_CLASSES } from './panel.js';
import { corridorSumMismatch } from './direction.js';
import { toNumber } from '../normalize.js';

function somaFluxo(records) {
  let total = null;
  let dias = 0;
  for (const r of records || []) {
    if (!Number.isFinite(r?.flow)) continue;
    total = (total === null ? 0 : total) + r.flow;
    dias += 1;
  }
  return { total, days: dias };
}

function cobertura(records, intervalsOf = (r) => r?.intervalsObserved) {
  let completos = 0;
  let parciais = 0;
  let desconhecidos = 0;
  for (const r of records || []) {
    const { status } = classifyDayCoverage(intervalsOf(r));
    if (status === 'complete') completos += 1;
    else if (status === 'partial') parciais += 1;
    else desconhecidos += 1;
  }
  return { completos, parciais, desconhecidos };
}

function bandeiras(records) {
  const contagem = new Map();
  for (const r of records || []) {
    if (!r?.qualityFlag) continue;
    contagem.set(r.qualityFlag, (contagem.get(r.qualityFlag) || 0) + 1);
  }
  return [...contagem.entries()]
    .map(([flag, days]) => ({ flag, days }))
    .sort((a, b) => a.flag.localeCompare(b.flag, 'pt-BR'));
}

/**
 * TMD oficial do DER/DF para o trecho, lido de `properties_json.tmd_der` do contorno (ou do
 * trecho). `null` quando não publicado — nunca estimado a partir da medição.
 */
export function officialTmd(polygon, linked) {
  const props = polygon?.properties || {};
  const fromPolygon = toNumber(props.tmd_der);
  if (fromPolygon !== null) return fromPolygon;
  let segmentProps = null;
  try {
    segmentProps = linked?.raw?.properties_json ? JSON.parse(linked.raw.properties_json) : null;
  } catch (error) {
    segmentProps = null;
  }
  return toNumber(segmentProps?.tmd_der);
}

/**
 * Resumo do período para UM trecho, sobre os baldes JÁ filtrados (`filterLinkedTraffic`).
 *
 * @param {object} linked        entrada de `bySegmentId` (filtrada)
 * @param {object} directionCtx  `buildDirectionContext(...)`
 * @returns {null|object}
 */
export function segmentPeriodSummary(linked, directionCtx) {
  if (!linked) return null;
  const t = linked.traffic || { crescente: [], decrescente: [], semSentido: [] };
  const todos = [...t.crescente, ...t.decrescente, ...t.semSentido];
  const code = linked.sourceSegmentCode;

  // Por dia do calendário: cada sentido separado, para saber em quais dias os DOIS existem.
  const porDia = new Map();
  for (const r of todos) {
    if (typeof r.date !== 'string') continue;
    if (!porDia.has(r.date)) porDia.set(r.date, { crescente: null, decrescente: null, semSentido: null });
    const dia = porDia.get(r.date);
    const chave = r.direction || 'semSentido';
    if (Number.isFinite(r.flow)) dia[chave] = (dia[chave] ?? 0) + r.flow;
  }

  let totalDias = null;
  let diasComFluxo = 0;
  let bidirecional = null;
  let diasBidirecionais = 0;
  for (const dia of porDia.values()) {
    const partes = [dia.crescente, dia.decrescente, dia.semSentido].filter(Number.isFinite);
    if (partes.length > 0) {
      totalDias = (totalDias ?? 0) + partes.reduce((a, b) => a + b, 0);
      diasComFluxo += 1;
    }
    if (Number.isFinite(dia.crescente) && Number.isFinite(dia.decrescente)) {
      bidirecional = (bidirecional ?? 0) + dia.crescente + dia.decrescente;
      diasBidirecionais += 1;
    }
  }

  const sentido = (direction, records) => {
    const official = directionCtx?.officialOf?.(code, direction) || null;
    const { projectDirection } = directionCtx?.projectOf?.(code, direction) || {};
    const soma = somaFluxo(records);
    return {
      direction,
      total: soma.total,
      days: soma.days,
      average: soma.total !== null && soma.days > 0 ? soma.total / soma.days : null,
      origin: official?.originOfficial || null,
      destination: official?.destinationOfficial || null,
      kmStart: official?.kmStart ?? null,
      kmEnd: official?.kmEnd ?? null,
      projectDirection: projectDirection || null,
    };
  };

  const crescente = sentido('crescente', t.crescente);
  const decrescente = sentido('decrescente', t.decrescente);
  const project = {};
  for (const s of [crescente, decrescente]) {
    if (s.projectDirection) project[s.projectDirection] = s;
  }

  return {
    hasData: todos.length > 0,
    days: porDia.size,
    total: totalDias,
    // Média por DIA DO CALENDÁRIO do trecho (os sentidos medidos naquele dia somados).
    // `daysSingleDirection` diz quantos desses dias só tinham um sentido — é o que puxa a
    // média para baixo, e o painel mostra ao lado.
    average: totalDias !== null && diasComFluxo > 0 ? totalDias / diasComFluxo : null,
    daysWithFlow: diasComFluxo,
    daysSingleDirection: diasComFluxo - diasBidirecionais,
    bidirectional: bidirecional,
    bidirectionalDays: diasBidirecionais,
    crescente,
    decrescente,
    paraPlano: project.para_plano || null,
    paraSobradinho: project.para_sobradinho || null,
    corridor: directionCtx?.corridorByCode?.get(code) || null,
    classes: classTotals(todos),
    coverage: cobertura(todos),
    qualityFlags: bandeiras(todos),
  };
}

// --- TRAFFIC_CORRIDOR_DAILY ----------------------------------------------------------

/** Classes que a aba do corredor publica, e em qual coluna de cada lado. */
const CORRIDOR_SIDES = {
  '': { paraPlano: 'paraPlano', paraSobradinho: 'paraSobradinho', bidirecional: 'bidirecional' },
  carro: { paraPlano: 'carroParaPlano', paraSobradinho: 'carroParaSobradinho', bidirecional: null },
};

/**
 * Resumo de UM ponto de medição do corredor no recorte.
 *
 * Nunca recebe os dois pontos juntos: somar 003EDF0010 com 150EDF0010 contaria a mesma
 * viagem duas vezes. Quem chama agrupa por `sourceSegmentCode` — e `corridorPointSummary`
 * recusa (devolve `null`) uma lista que misture pontos.
 *
 * Classe de veículo: `carro` existe por lado; `moto`, `onibus` e `caminhao` só existem no
 * bidirecional — com uma delas escolhida os lados ficam `null` (não publicado), nunca zero.
 * `medio` e `indefinido` não existem nesta aba: tudo `null`.
 *
 * Sentido: com filtro de sentido oficial ou do projeto, o lado que não corresponde fica
 * `null` e o bidirecional também — ele deixaria de ser o que o nome diz.
 */
export function corridorPointSummary(records, filters = {}) {
  const lista = records || [];
  if (lista.length === 0) return null;
  const codes = new Set(lista.map((r) => r.sourceSegmentCode));
  if (codes.size !== 1) return null;

  const classe = filters.vehicleClass || '';
  const lados = CORRIDOR_SIDES[classe] || { paraPlano: null, paraSobradinho: null, bidirecional: null };

  const ref = lista[0];
  let mostrarPlano = true;
  let mostrarSobradinho = true;
  if (filters.projectDirection) {
    mostrarPlano = filters.projectDirection === 'para_plano';
    mostrarSobradinho = filters.projectDirection === 'para_sobradinho';
  }
  if (filters.officialDirection) {
    mostrarPlano = mostrarPlano && ref.sentidoParaPlano === filters.officialDirection;
    mostrarSobradinho = mostrarSobradinho && ref.sentidoParaSobradinho === filters.officialDirection;
  }
  const soUmLado = !(mostrarPlano && mostrarSobradinho);

  const somar = (valueOf) => {
    let total = null;
    let dias = 0;
    for (const r of lista) {
      const v = valueOf(r);
      if (!Number.isFinite(v)) continue;
      total = (total ?? 0) + v;
      dias += 1;
    }
    return { total, days: dias };
  };
  const campo = (nome) => (nome ? (r) => r[nome] : () => null);
  const classeBidirecional = classe && classe !== 'carro' ? (r) => r.classes?.[classe] : campo(lados.bidirecional);

  const paraPlano = mostrarPlano ? somar(campo(lados.paraPlano)) : { total: null, days: 0 };
  const paraSobradinho = mostrarSobradinho ? somar(campo(lados.paraSobradinho)) : { total: null, days: 0 };
  let bidirecional = soUmLado ? { total: null, days: 0 } : somar(classeBidirecional);
  // `carro_bidirecional` existe: com classe carro o bidirecional é a coluna publicada.
  if (!soUmLado && classe === 'carro') bidirecional = somar((r) => r.classes?.carro);

  const datas = new Set(lista.map((r) => r.date));
  const divergentes = lista.filter((r) => {
    const d = corridorSumMismatch(r);
    return d !== null && d !== 0;
  });

  return {
    sourceSegmentCode: ref.sourceSegmentCode,
    corridorId: ref.corridorId,
    measurementPointRole: ref.measurementPointRole,
    sentidoParaPlano: ref.sentidoParaPlano,
    sentidoParaSobradinho: ref.sentidoParaSobradinho,
    days: datas.size,
    windowStart: [...datas].sort()[0] || null,
    windowEnd: [...datas].sort().at(-1) || null,
    paraPlano: paraPlano.total,
    paraSobradinho: paraSobradinho.total,
    bidirecional: bidirecional.total,
    // Lado fora do recorte por filtro de SENTIDO — diferente de "não publicado para esta
    // classe". A tela precisa dizer qual dos dois é (revisão do Kimi, PR #143).
    excluded: { paraPlano: !mostrarPlano, paraSobradinho: !mostrarSobradinho, bidirecional: soUmLado },
    bidirecionalDays: bidirecional.days,
    classes: VEHICLE_CLASSES
      .filter(({ key }) => ['carro', 'moto', 'onibus', 'caminhao'].includes(key))
      .map(({ key, label }) => ({ key, label, ...somar((r) => r.classes?.[key]) })),
    coverage: cobertura(lista),
    qualityFlags: bandeiras(lista),
    sumMismatchDays: divergentes.length,
  };
}

/** Agrupa as linhas do corredor por ponto de medição — um resumo por código, nunca a soma. */
export function corridorSummariesByPoint(records, filters = {}) {
  const grupos = new Map();
  for (const r of records || []) {
    if (!grupos.has(r.sourceSegmentCode)) grupos.set(r.sourceSegmentCode, []);
    grupos.get(r.sourceSegmentCode).push(r);
  }
  return [...grupos.keys()].sort().map((code) => corridorPointSummary(grupos.get(code), filters));
}
