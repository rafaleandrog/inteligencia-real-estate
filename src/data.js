// Carregamento do dataset.
//
// Três estratégias com a mesma assinatura, para que trocar a origem dos dados seja
// mudança de configuração e não reescrita da aplicação (instrução §19):
//
//   gviz        Google Visualization Query direto na planilha — caminho principal
//   demo        data/demo.json — demonstração e desenvolvimento offline
//   appsscript  Web App do Apps Script — estratégia alternativa
//
// Todas devolvem o mesmo formato:
//   { entities, meta, source, warnings, errors }

import { normalizeAll, normalizeAppMeta, appMetaConflicts, normalizeRaProfiles, normalizePolygons } from './normalize.js';
import {
  normalizeRoadSegments, normalizeRoadSegmentAliases, normalizeTrafficDailyRecords,
} from './traffic/normalize.js';
import { linkTrafficDataset } from './traffic/link.js';
import { normalizeRoadDirections, normalizeCorridorDailyRecords } from './traffic/direction.js';
import { normalizeIvvMonthly } from './ivv/normalize-ivv.js';
import { normalizeIvvRegion } from './ivv/region.js';
import { normalizeFipezapMonthly, normalizeFipezapLocality, normalizeFipezapLocalityMap } from './fipezap/normalize-fipezap.js';
import { normalizePdadData } from './pdad/normalize-pdad.js';
import { normalizeManifest } from './territorio/manifest.js';

/** Entidades obrigatórias na V1. Ausência de qualquer uma é erro. */
export const REQUIRED_ENTITIES = ['listings', 'developments', 'anchors'];

/** Formato de `traffic` quando as três abas de tráfego não carregaram — nunca `undefined`. */
const EMPTY_TRAFFIC = {
  bySegmentId: new Map(), orphaned: [], unmatchedSegmentIds: [], unmatchedTraffic: new Map(),
  directions: [], corridorDaily: [],
};

/**
 * Liga as abas de tráfego à geometria e anexa as duas leituras de sentido (issue #142).
 *
 * `directions` (ROAD_DIRECTION_MAP) e `corridorDaily` (TRAFFIC_CORRIDOR_DAILY) viajam junto
 * de `bySegmentId` porque a tela só as usa sobre ele: o filtro de sentido do projeto e o
 * bloco do corredor no painel do trecho. Um objeto só evita que alguém filtre um e esqueça
 * o outro.
 */
function linkTraffic(pieces, polygons) {
  const directions = pieces.directions || [];
  return {
    ...linkTrafficDataset(pieces.segments, polygons, pieces.trafficRecords, pieces.aliases, directions),
    directions,
    corridorDaily: pieces.corridorDaily || [],
    dailyLoadFailed: Boolean(pieces.dailyLoadFailed),
  };
}

/** Formato de `ivvMonthly` quando a aba não carregou — lista vazia, nunca `undefined`. */
const EMPTY_IVV_MONTHLY = [];

/** Timeout de rede. Sem isso, uma planilha inacessível deixa a página em "carregando" para sempre. */
const FETCH_TIMEOUT_MS = 20000;

/**
 * Timeout mais curto para a aba de metadados.
 *
 * Ela é opcional: nada do que o mapa precisa depende dela. Um teto menor garante que
 * uma requisição pendurada de APP_META não segure a renderização pelos 20 s das abas
 * obrigatórias.
 */
const META_FETCH_TIMEOUT_MS = 6000;

/**
 * Timeout de cada aba de tráfego (issues #175 e #185).
 *
 * Todas no teto longo. Desde a importação de julho a TRAFFIC_DAILY_TEST tem milhares de
 * linhas e o GViz passa de 6 s com frequência; e as cinco abas saem em paralelo, então o
 * cadastro de trechos (ROAD_SEGMENTS) também perdia a corrida. Sem ele nenhum fluxo se
 * vinculava ao trecho, e o painel dizia "sem dias medidos" com a série inteira carregada.
 */
function trafficTimeoutFor() {
  return FETCH_TIMEOUT_MS;
}

/**
 * `fetch` com timeout, para que falha de rede vire erro tratável e não espera infinita.
 *
 * `fetchRef` é injetável (issue #149): o carregador dos arquivos públicos recebe um `fetch`
 * de teste pelo argumento, em vez de trocar `globalThis.fetch` — a troca global é o que os
 * testes das estratégias já fazem, e dois testes disputando o mesmo global é uma corrida.
 */
async function fetchWithTimeout(url, { timeoutMs = FETCH_TIMEOUT_MS, fetchRef = null, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const doFetch = fetchRef || fetch;
  try {
    return await doFetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extrai o JSON da resposta do GViz.
 *
 * O endpoint não devolve JSON puro: vem embrulhado em
 * `/*O_o* /\ngoogle.visualization.Query.setResponse({...});`
 * O parsing recorta pelo primeiro `{` e pelo último `}` em vez de casar o prefixo
 * exato, porque esse prefixo já mudou de forma entre versões do serviço.
 */
export function parseGvizResponse(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('resposta do GViz em formato inesperado');
  }
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Converte a tabela do GViz em linhas com chave por cabeçalho.
 *
 * O GViz identifica coluna por `label` (o cabeçalho da planilha) e por `id` (A, B, C…).
 * Usamos o label, que é o nome do contrato. Quando a coluna tem valor formatado (`f`)
 * e valor bruto (`v`), o bruto vence: `v` traz o número, `f` traz "R$ 1.234,56" já
 * formatado pela planilha.
 */
export function gvizTableToRows(table) {
  if (!table || !Array.isArray(table.cols) || !Array.isArray(table.rows)) return [];

  const headers = table.cols.map((col, i) => {
    const label = (col && typeof col.label === 'string' ? col.label : '').trim();
    return label || (col && col.id) || `col_${i}`;
  });

  return table.rows.map((row) => {
    const cells = (row && row.c) || [];
    const out = {};
    headers.forEach((header, i) => {
      const cell = cells[i];
      if (cell === null || cell === undefined) { out[header] = ''; return; }
      out[header] = cell.v !== null && cell.v !== undefined ? cell.v : (cell.f ?? '');
    });
    return out;
  });
}

/** URL de consulta de uma aba pela API de visualização. */
export function gvizUrl(spreadsheetId, sheetName, responseHandler = '') {
  const base = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/gviz/tq`;
  const tqx = responseHandler ? `out:json;responseHandler:${responseHandler}` : 'out:json';
  return `${base}?tqx=${encodeURIComponent(tqx)}&sheet=${encodeURIComponent(sheetName)}`;
}

let jsonpSequence = 0;

/**
 * Busca uma aba via JSONP e devolve as linhas já com chave por cabeçalho.
 *
 * O endpoint GViz público não envia `Access-Control-Allow-Origin`, então `fetch()`
 * é bloqueado pelo navegador no GitHub Pages mesmo quando a planilha está pública.
 * `responseHandler` é a interface oficial do GViz para leitura cross-origin.
 */
export function fetchGvizSheet(
  spreadsheetId,
  sheetName,
  { documentRef = globalThis.document, scope = globalThis, timeoutMs = FETCH_TIMEOUT_MS } = {}
) {
  return new Promise((resolve, reject) => {
    if (!documentRef?.head || typeof documentRef.createElement !== 'function') {
      reject(new Error(`aba "${sheetName}": JSONP exige um documento HTML`));
      return;
    }

    const callbackName = `__imobGviz_${Date.now()}_${jsonpSequence += 1}`;
    const script = documentRef.createElement('script');
    let timer;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      script.remove?.();
      delete scope[callbackName];
    };

    scope[callbackName] = (parsed) => {
      cleanup();
      if (parsed?.status === 'error') {
        const detail = (parsed.errors || [])
          .map((error) => error.detailed_message || error.message)
          .join('; ');
        reject(new Error(`aba "${sheetName}": ${detail || 'erro do GViz'}`));
        return;
      }
      resolve(gvizTableToRows(parsed?.table));
    };

    script.async = true;
    script.src = gvizUrl(spreadsheetId, sheetName, callbackName);
    script.onerror = () => {
      cleanup();
      reject(new Error(
        `aba "${sheetName}": não foi possível acessar o GViz; confirme que a planilha está pública`
      ));
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`aba "${sheetName}": tempo limite ao acessar o GViz`));
    }, timeoutMs);

    documentRef.head.append(script);
  });
}

/**
 * Estratégia `gviz`. Caminho principal da V1.
 *
 * As três abas obrigatórias são buscadas em paralelo. `allSettled` em vez de `all`:
 * com `all`, uma aba com problema descartaria as outras duas que chegaram bem, e a
 * tela ficaria vazia em vez de parcialmente útil.
 */
async function loadFromGviz(config) {
  const entries = Object.entries(config.sheets);

  // A APP_META entra no MESMO lote das abas obrigatórias. Buscá-la depois somava o
  // tempo dela ao das outras e podia segurar o mapa na tela de carregamento mesmo com
  // os dados já disponíveis. Em paralelo, o custo é o máximo e não a soma — e o
  // timeout curto dedicado limita o quanto uma aba opcional pendurada pode atrasar.
  const metaPromise = fetchAppMetaFromGviz(config);
  const raProfilesPromise = fetchRaProfilesFromGviz(config);
  const polygonsPromise = fetchPolygonsFromGviz(config);
  const trafficPromise = fetchTrafficSheetsFromGviz(config);
  const ivvPromise = fetchIvvMonthlyFromGviz(config);
  const regiaoPromise = fetchIvvRegionFromGviz(config);
  const fipezapMonthlyPromise = fetchFipezapMonthlyFromGviz(config);
  const fipezapLocalityPromise = fetchFipezapLocalityFromGviz(config);
  const fipezapLocalityMapPromise = fetchFipezapLocalityMapFromGviz(config);
  const pdadDataPromise = fetchPdadDataFromGviz(config);

  const settled = await Promise.allSettled(
    entries.map(([, sheetName]) => fetchGvizSheet(config.spreadsheetId, sheetName))
  );

  const raw = {};
  const errors = [];
  settled.forEach((result, i) => {
    const [entity, sheetName] = entries[i];
    if (result.status === 'fulfilled') raw[entity] = result.value;
    else {
      raw[entity] = [];
      errors.push(`Não foi possível ler a aba "${sheetName}": ${result.reason?.message || result.reason}`);
    }
  });

  const { meta, warnings } = await metaPromise;
  const { raProfiles, warnings: raProfileWarnings } = await raProfilesPromise;
  const { polygons, warnings: polygonWarnings } = await polygonsPromise;
  const { warnings: trafficWarnings, ...trafficPieces } = await trafficPromise;
  const traffic = linkTraffic(trafficPieces, polygons);
  const { ivvMonthly, warnings: ivvWarnings } = await ivvPromise;
  const { ivvRegion, warnings: regiaoWarnings } = await regiaoPromise;
  const { fipezapMonthly, warnings: fipezapMonthlyWarnings } = await fipezapMonthlyPromise;
  const { fipezapLocality, warnings: fipezapLocalityWarnings } = await fipezapLocalityPromise;
  const { fipezapLocalityMap, warnings: fipezapLocalityMapWarnings } = await fipezapLocalityMapPromise;
  const { pdadData, warnings: pdadDataWarnings } = await pdadDataPromise;
  return {
    raw,
    errors,
    warnings: [
      ...warnings, ...raProfileWarnings, ...polygonWarnings, ...trafficWarnings, ...ivvWarnings,
      ...regiaoWarnings, ...fipezapMonthlyWarnings, ...fipezapLocalityWarnings,
      ...fipezapLocalityMapWarnings, ...pdadDataWarnings,
    ],
    meta: { spreadsheetId: config.spreadsheetId, ...meta },
    raProfiles,
    polygons,
    traffic,
    ivvMonthly,
    ivvRegion,
    fipezapMonthly,
    fipezapLocality,
    fipezapLocalityMap,
    pdadData,
  };
}

/**
 * Converte os avisos do normalizador do IVV em texto para a tela de avisos.
 *
 * Eles chegam como `{code, message, detail}` e a interface renderiza string; o prefixo diz de
 * onde veio, porque na lista de avisos convivem APP_META, contornos, tráfego e mercado.
 * `COLUNA_NAO_DECLARADA` precisa chegar à TELA, não só ao console: é o aviso que nomeia a
 * coluna que o backend publica e o contrato ainda não declara, e é assim que a convenção
 * declarada em `src/ivv/normalize-ivv.js` se corrige na primeira carga real.
 */
function ivvWarningTexts(warnings) {
  return (warnings || []).map((warning) => `Mercado (IVV_MONTHLY): ${warning.message}`);
}

/**
 * Lê a aba opcional `IVV_MONTHLY` (issue #56): série mensal do mercado residencial do DF.
 *
 * Mesmo tratamento de `RA_PROFILES`/`POLYGONS`/tráfego — promessa iniciada **antes** do lote
 * obrigatório, teto de tempo curto e dedicado, e falha ou ausência virando **aviso, nunca
 * erro** (R2.5). O mapa não depende desta aba para nada.
 */
async function fetchIvvMonthlyFromGviz(config) {
  const sheetName = config.ivvMonthlySheet;
  if (!sheetName) return { ivvMonthly: EMPTY_IVV_MONTHLY, warnings: [] };

  try {
    const rows = await fetchGvizSheet(config.spreadsheetId, sheetName, {
      timeoutMs: META_FETCH_TIMEOUT_MS,
    });
    const { months, warnings } = normalizeIvvMonthly(rows);
    return { ivvMonthly: months, warnings: ivvWarningTexts(warnings) };
  } catch (error) {
    return {
      ivvMonthly: EMPTY_IVV_MONTHLY,
      warnings: [`Série de mercado indisponível (${sheetName}): ${error?.message || error}`],
    };
  }
}

/**
 * Lê a aba `IVV_REGION` (issue #87): IVV por Região Administrativa e faixa de quartos.
 *
 * Mesmo tratamento das demais abas fora do lote obrigatório: teto de tempo curto e
 * dedicado, e falha ou ausência virando **aviso, nunca erro** (R2.5). A tela do Mercado
 * continua inteira sem ela — o que some é a seção territorial, e ela some dizendo por quê.
 */
async function fetchIvvRegionFromGviz(config) {
  const sheetName = config.ivvRegionSheet;
  if (!sheetName) return { ivvRegion: [], warnings: [] };

  try {
    const rows = await fetchGvizSheet(config.spreadsheetId, sheetName, {
      timeoutMs: META_FETCH_TIMEOUT_MS,
    });
    const { rows: regioes, warnings } = normalizeIvvRegion(rows);
    return {
      ivvRegion: regioes,
      warnings: (warnings || []).map((texto) => `Mercado (IVV_REGION): ${texto}`),
    };
  } catch (error) {
    return {
      ivvRegion: [],
      warnings: [`IVV por região indisponível (${sheetName}): ${error?.message || error}`],
    };
  }
}

/**
 * Lê a aba `FIPEZAP_MONTHLY`: preço de venda/locação por m², residencial e comercial,
 * DF inteiro e por localidade, desde 2011. Mesmo tratamento de `IVV_REGION`: teto de
 * tempo curto e dedicado, e falha ou ausência virando **aviso, nunca erro** (R2.5) — a
 * tela do Mercado continua inteira sem ela, só sem a seção de preço FipeZap.
 */
async function fetchFipezapMonthlyFromGviz(config) {
  const sheetName = config.fipezapMonthlySheet;
  if (!sheetName) return { fipezapMonthly: [], warnings: [] };

  try {
    const rows = await fetchGvizSheet(config.spreadsheetId, sheetName, {
      timeoutMs: META_FETCH_TIMEOUT_MS,
    });
    const { rows: months, warnings } = normalizeFipezapMonthly(rows);
    return {
      fipezapMonthly: months,
      warnings: (warnings || []).map((texto) => `Mercado (${sheetName}): ${texto}`),
    };
  } catch (error) {
    return {
      fipezapMonthly: [],
      warnings: [`Preço FipeZap (DF) indisponível (${sheetName}): ${error?.message || error}`],
    };
  }
}

/**
 * Lê a aba `FIPEZAP_LOCALITY_MONTHLY`: venda × locação pareadas por localidade/Região
 * Administrativa, desde 2019. Mesmo tratamento das demais abas opcionais do Mercado.
 */
async function fetchFipezapLocalityFromGviz(config) {
  const sheetName = config.fipezapLocalitySheet;
  if (!sheetName) return { fipezapLocality: [], warnings: [] };

  try {
    const rows = await fetchGvizSheet(config.spreadsheetId, sheetName, {
      timeoutMs: META_FETCH_TIMEOUT_MS,
    });
    const { rows: locality, warnings } = normalizeFipezapLocality(rows);
    return {
      fipezapLocality: locality,
      warnings: (warnings || []).map((texto) => `Mercado (${sheetName}): ${texto}`),
    };
  } catch (error) {
    return {
      fipezapLocality: [],
      warnings: [`Preço FipeZap por RA indisponível (${sheetName}): ${error?.message || error}`],
    };
  }
}

/**
 * Lê a aba `FIPEZAP_LOCALITY_MAP` (issue #122): ponte localidade FipeZap → RA. Opcional e
 * pequena (dezenas de linhas); ausência ou falha vira aviso e a tela segue rotulando só
 * pelo que a série de localidades já traz.
 */
async function fetchFipezapLocalityMapFromGviz(config) {
  const sheetName = config.fipezapLocalityMapSheet;
  if (!sheetName) return { fipezapLocalityMap: [], warnings: [] };

  try {
    const rows = await fetchGvizSheet(config.spreadsheetId, sheetName, {
      timeoutMs: META_FETCH_TIMEOUT_MS,
    });
    const { rows: map, warnings } = normalizeFipezapLocalityMap(rows);
    return {
      fipezapLocalityMap: map,
      warnings: (warnings || []).map((texto) => `Mercado (${sheetName}): ${texto}`),
    };
  } catch (error) {
    return {
      fipezapLocalityMap: [],
      warnings: [`Mapa de localidades FipeZap indisponível (${sheetName}): ${error?.message || error}`],
    };
  }
}

/**
 * Lê a aba `PDAD_A_DATA` (issue #100): extração longa do PDAD-A que alimenta a aba
 * Diagnóstico. Mesmo tratamento das demais abas opcionais: falha ou ausência vira
 * **aviso, nunca erro** (R2.5) — a aba Diagnóstico simplesmente fica desabilitada.
 *
 * Usa o timeout LONGO (`FETCH_TIMEOUT_MS`), não o curto das demais abas opcionais:
 * ~12.190 linhas é a maior aba lida pela tela, maior até que as três obrigatórias — o
 * timeout de 6 s pensado para uma aba de dezenas/centenas de linhas cortaria a busca
 * antes dela terminar de vir.
 */
async function fetchPdadDataFromGviz(config) {
  const sheetName = config.pdadDataSheet;
  if (!sheetName) return { pdadData: [], warnings: [] };

  try {
    const rows = await fetchGvizSheet(config.spreadsheetId, sheetName, {
      timeoutMs: FETCH_TIMEOUT_MS,
    });
    const { rows: pdadData, warnings } = normalizePdadData(rows);
    return {
      pdadData,
      warnings: (warnings || []).map((texto) => `Diagnóstico (PDAD_A_DATA): ${texto}`),
    };
  } catch (error) {
    return {
      pdadData: [],
      warnings: [`Diagnóstico territorial indisponível (${sheetName}): ${error?.message || error}`],
    };
  }
}

/**
 * Lê a aba opcional `POLYGONS` (issue #28): contornos importados de KML/KMZ pelo menu
 * do Apps Script.
 *
 * Mesmo tratamento de `RA_PROFILES` — promessa iniciada **antes** do lote obrigatório,
 * teto de tempo curto e dedicado, e falha ou ausência virando **aviso, nunca erro**
 * (R2.5). A aba estar vazia é o estado normal de quem ainda não importou nenhum
 * arquivo; a camada só não aparece.
 */
async function fetchPolygonsFromGviz(config) {
  const sheetName = config.polygonsSheet;
  if (!sheetName) return { polygons: [], warnings: [] };

  try {
    const rows = await fetchGvizSheet(config.spreadsheetId, sheetName, {
      timeoutMs: META_FETCH_TIMEOUT_MS,
    });
    return { polygons: normalizePolygons(rows), warnings: [] };
  } catch (error) {
    return {
      polygons: [],
      warnings: [`Contornos indisponíveis (${sheetName}): ${error?.message || error}`],
    };
  }
}

/**
 * Avisos das linhas que a normalização das três abas de tráfego descartou (issue #140).
 *
 * `normalizeTrafficDailyRecords` já devolvia `dropped`, e os três caminhos de carga
 * (gviz, Apps Script e demo) jogavam o número fora lendo só `.records`. O efeito é o pior
 * tipo de silêncio: uma linha com `dia` que não existe no calendário some do total, some
 * da contagem por mês, e nada na tela diz que ela existiu — que é exatamente o que a R5.7
 * proíbe. O aviso nomeia a aba, quantas linhas e por quê, para dar onde procurar.
 *
 * O MOTIVO é fixo por aba, e isso só é honesto porque cada normalizador tem exatamente uma
 * causa de descarte (conferido em src/traffic/normalize.js): `normalizeRoadSegment` devolve
 * null só sem `road_segment_id`; `normalizeRoadSegmentAlias`, só sem `road_segment_id` ou
 * sem `source_segment_code`; `normalizeTrafficDaily`, só quando `toDateISO(dia)` é null.
 * Quem acrescentar uma segunda causa a qualquer um deles tem de trocar o texto aqui — senão
 * o aviso passa a atribuir a causa errada, que é pior que não avisar.
 */
function trafficDropWarnings(config, dropped) {
  const avisos = [];
  const diga = (sheet, n, motivo) => {
    if (n > 0 && sheet) avisos.push(`${n} linha(s) de ${sheet} ignorada(s): ${motivo}.`);
  };
  diga(config.roadSegmentsSheet, dropped.segments, 'sem road_segment_id');
  diga(config.roadSegmentAliasesSheet, dropped.aliases,
    'sem road_segment_id ou sem source_segment_code');
  diga(config.trafficDailySheet, dropped.traffic,
    'a coluna dia não traz uma data que existe no calendário');
  // Issue #142. Mesma regra: cada normalizador tem UMA causa de descarte, e a duplicata é
  // contada à parte porque é outra afirmação sobre o dado.
  diga(config.roadDirectionMapSheet, dropped.directions, 'sem source_segment_code');
  diga(config.roadDirectionMapSheet, dropped.directionDuplicates,
    'source_segment_code + source_direction repetido (mantida a primeira ocorrência)');
  diga(config.trafficCorridorDailySheet, dropped.corridor,
    'sem source_segment_code ou com dia que não existe no calendário');
  diga(config.trafficCorridorDailySheet, dropped.corridorDuplicates,
    'corridor_daily_id ou ponto + dia repetido (mantida a primeira ocorrência)');
  return avisos;
}

/**
 * Lê as três abas opcionais de tráfego do backend v2.2.0 (issue #62, bloco C):
 * `ROAD_SEGMENTS`, `ROAD_SEGMENT_ALIASES` e `TRAFFIC_DAILY_TEST`.
 *
 * Mesmo tratamento das outras abas opcionais: cada uma é buscada com `allSettled`
 * independente das outras, teto de tempo curto e dedicado, e falha ou ausência vira
 * **aviso, nunca erro** (R2.5) — o mapa e o dashboard continuam funcionando sem o
 * painel de tráfego. Uma aba fora do ar não derruba as outras duas: por exemplo,
 * `ROAD_SEGMENT_ALIASES` inacessível ainda deixa `ROAD_SEGMENTS` e
 * `TRAFFIC_DAILY_TEST` utilizáveis para os registros que já trazem `road_segment_id`
 * direto (sem precisar de alias).
 *
 * Devolve os três conjuntos normalizados, mas SEM ligá-los — a ligação
 * (`linkTrafficDataset`) espera pela mesma `polygons` que as outras estratégias já
 * buscam separadamente, e por isso acontece em `loadFromGviz`/`loadFromAppsScript`,
 * depois que as duas promessas convergem.
 */
async function fetchTrafficSheetsFromGviz(config) {
  const jobs = [
    ['segments', config.roadSegmentsSheet],
    ['aliases', config.roadSegmentAliasesSheet],
    ['traffic', config.trafficDailySheet],
    ['directions', config.roadDirectionMapSheet],
    ['corridor', config.trafficCorridorDailySheet],
  ];

  const settled = await Promise.allSettled(
    jobs.map(([, sheetName], i) => (
      sheetName
        ? fetchGvizSheet(config.spreadsheetId, sheetName, { timeoutMs: trafficTimeoutFor(jobs[i][0]) })
        : Promise.resolve(null)
    ))
  );

  const warnings = [];
  const rowsByJob = {};
  const failed = new Set();
  settled.forEach((result, i) => {
    const [key, sheetName] = jobs[i];
    if (!sheetName) { rowsByJob[key] = []; return; }
    if (result.status === 'fulfilled') {
      rowsByJob[key] = result.value || [];
    } else {
      failed.add(key);
      rowsByJob[key] = [];
      warnings.push(`Tráfego (${sheetName}) indisponível: ${result.reason?.message || result.reason}`);
    }
  });

  const segmentos = normalizeRoadSegments(rowsByJob.segments);
  const apelidos = normalizeRoadSegmentAliases(rowsByJob.aliases);
  const diario = normalizeTrafficDailyRecords(rowsByJob.traffic);
  const sentidos = normalizeRoadDirections(rowsByJob.directions);
  const corredor = normalizeCorridorDailyRecords(rowsByJob.corridor);
  warnings.push(...trafficDropWarnings(config, {
    segments: segmentos.dropped, aliases: apelidos.dropped, traffic: diario.dropped,
    directions: sentidos.dropped, directionDuplicates: sentidos.duplicates,
    corridor: corredor.dropped, corridorDuplicates: corredor.duplicates,
  }));

  return {
    segments: segmentos.records,
    aliases: apelidos.records,
    trafficRecords: diario.records,
    directions: sentidos.records,
    corridorDaily: corredor.records,
    dailyLoadFailed: failed.has('traffic'),
    warnings,
  };
}

/**
 * Lê a aba APP_META, que descreve o próprio dataset.
 *
 * Falha ou ausência vira **aviso, nunca erro**: APP_META é operacional e só existe
 * depois que `setupProject()` roda no Apps Script. Uma planilha sem ela precisa
 * continuar abrindo normalmente (R2.5).
 *
 * É buscada porque a interface a renderiza — diferente das abas de `optionalSheets`,
 * que ninguém exibe e por isso não são buscadas. E é uma requisição, não quatro.
 */
async function fetchAppMetaFromGviz(config) {
  const sheetName = config.metaSheet;
  if (!sheetName) return { meta: {}, warnings: [] };

  try {
    const rows = await fetchGvizSheet(config.spreadsheetId, sheetName, {
      timeoutMs: META_FETCH_TIMEOUT_MS,
    });
    return { meta: normalizeAppMeta(rows), warnings: metaConflictWarnings(rows) };
  } catch (error) {
    return {
      meta: {},
      warnings: [`Metadados do dataset indisponíveis (${sheetName}): ${error?.message || error}`],
    };
  }
}

/**
 * Lê a aba opcional `RA_PROFILES` (issue #33/#34): indicadores por Região
 * Administrativa, usados para enriquecer o filtro de RA com nome/população/
 * densidade. Mesmo tratamento de `APP_META`: falha ou ausência vira **aviso, nunca
 * erro** — o filtro de RA continua funcionando com o código bruto como rótulo
 * (R2.5).
 */
async function fetchRaProfilesFromGviz(config) {
  const sheetName = config.raProfilesSheet;
  if (!sheetName) return { raProfiles: {}, warnings: [] };

  try {
    const rows = await fetchGvizSheet(config.spreadsheetId, sheetName, {
      timeoutMs: META_FETCH_TIMEOUT_MS,
    });
    return { raProfiles: normalizeRaProfiles(rows), warnings: [] };
  } catch (error) {
    return {
      raProfiles: {},
      warnings: [`Indicadores por Região Administrativa indisponíveis (${sheetName}): ${error?.message || error}`],
    };
  }
}

/** Aviso para cada chave de APP_META publicada duas vezes com valores diferentes. */
function metaConflictWarnings(raw) {
  return appMetaConflicts(raw).map(
    (key) => `A aba de metadados tem mais de uma linha "${key}" com valores diferentes; ` +
      'o valor foi omitido até a duplicata ser resolvida na planilha.'
  );
}

/** Estratégia `demo`. Lê o dataset estático do repositório. */
async function loadFromDemo(config) {
  const response = await fetchWithTimeout(config.demoUrl);
  if (!response.ok) throw new Error(`demo.json: HTTP ${response.status}`);
  const payload = await response.json();

  const raw = {};
  for (const entity of Object.keys(config.sheets)) raw[entity] = payload[entity] || [];

  // Passa pelo mesmo normalizador das outras estratégias: se o demo.json não trouxer
  // chaves de APP_META — que é o caso hoje —, o resultado é `{}` e a tela não mostra
  // o bloco, exatamente como numa planilha sem setupProject() executado.
  //
  // O meta bruto NÃO é espalhado por cima: fazer isso devolvia as chaves que o
  // normalizador tinha rejeitado (`last_validation_at: 'ontem'` reaparecia e virava
  // "Validado em —"), destruindo a distinção entre não publicado e valor inválido.
  // Os campos de geração do demo ficam num ramo à parte, fora do vocabulário APP_META.
  const demoIvv = normalizeIvvMonthly(payload.ivv_monthly || []);
  const demoRegiao = normalizeIvvRegion(payload.ivv_region || []);
  const demoFipezapMonthly = normalizeFipezapMonthly(payload.fipezap_monthly || []);
  const demoFipezapLocality = normalizeFipezapLocality(payload.fipezap_locality_monthly || []);
  const demoFipezapLocalityMap = normalizeFipezapLocalityMap(payload.fipezap_locality_map || []);
  const demoPdadData = normalizePdadData(payload.pdad_a_data || []);

  // As três abas de tráfego do demo passam pelo mesmo tratamento do caminho real: linha
  // descartada é CONTADA e vira aviso, nunca some calada (issue #140). O demo é onde a
  // regressão apareceria primeiro, porque é o único caminho que roda sem rede.
  const demoSegmentos = normalizeRoadSegments(payload.road_segments || []);
  const demoApelidos = normalizeRoadSegmentAliases(payload.road_segment_aliases || []);
  const demoDiario = normalizeTrafficDailyRecords(payload.traffic_daily || []);
  const demoSentidos = normalizeRoadDirections(payload.road_direction_map || []);
  const demoCorredor = normalizeCorridorDailyRecords(payload.traffic_corridor_daily || []);

  return {
    raw,
    errors: [],
    warnings: [
      ...trafficDropWarnings(
        {
          roadSegmentsSheet: 'road_segments',
          roadSegmentAliasesSheet: 'road_segment_aliases',
          trafficDailySheet: 'traffic_daily',
          roadDirectionMapSheet: 'road_direction_map',
          trafficCorridorDailySheet: 'traffic_corridor_daily',
        },
        {
          segments: demoSegmentos.dropped, aliases: demoApelidos.dropped, traffic: demoDiario.dropped,
          directions: demoSentidos.dropped, directionDuplicates: demoSentidos.duplicates,
          corridor: demoCorredor.dropped, corridorDuplicates: demoCorredor.duplicates,
        }
      ),
      ...metaConflictWarnings(payload.meta),
      ...ivvWarningTexts(demoIvv.warnings),
      ...demoRegiao.warnings.map((texto) => `Mercado (IVV_REGION): ${texto}`),
      ...demoFipezapMonthly.warnings.map((texto) => `Mercado (FIPEZAP_MONTHLY): ${texto}`),
      ...demoFipezapLocality.warnings.map((texto) => `Mercado (FIPEZAP_LOCALITY_MONTHLY): ${texto}`),
      ...demoPdadData.warnings.map((texto) => `Diagnóstico (PDAD_A_DATA): ${texto}`),
    ],
    meta: { ...normalizeAppMeta(payload.meta), demo: payload.meta || {} },
    // Mesmo tratamento de `raw`: aba ausente no demo.json vira mapa vazio, não erro.
    raProfiles: normalizeRaProfiles(payload.ra_profiles || []),
    // `polygons: []` é o conteúdo esperado do demo — ver o comentário em
    // tools/build-demo.mjs. O caminho que precisa nunca quebrar é o da camada vazia.
    polygons: normalizePolygons(payload.polygons || []),
    // Mesmo tratamento: o demo.json de hoje não traz nenhuma das três chaves de
    // tráfego, e o caminho que precisa funcionar é o de painel vazio, não erro.
    traffic: linkTraffic(
      {
        segments: demoSegmentos.records,
        trafficRecords: demoDiario.records,
        aliases: demoApelidos.records,
        directions: demoSentidos.records,
        corridorDaily: demoCorredor.records,
      },
      normalizePolygons(payload.polygons || [])
    ),
    // A semente traz a linha de IVV_MONTHLY com os nomes do schema v1.0.0 e o IVV em
    // ponto percentual, então o caminho de demo exercita de verdade a tradução de alias
    // e a conversão de escala — inclusive os avisos que elas produzem.
    ivvMonthly: demoIvv.months,
    // Aba ausente no demo.json vira lista vazia, e a seção territorial some dizendo por quê.
    ivvRegion: demoRegiao.rows,
    fipezapMonthly: demoFipezapMonthly.rows,
    fipezapLocality: demoFipezapLocality.rows,
    fipezapLocalityMap: demoFipezapLocalityMap.rows,
    // Mesmo tratamento: demo.json sem `pdad_a_data` vira lista vazia, e a aba
    // Diagnóstico some dizendo por quê, em vez de abrir vazia sem explicação.
    pdadData: demoPdadData.rows,
  };
}

/**
 * Estratégia `appsscript`. Consome o endpoint read-only do Web App.
 *
 * Existe para que trocar de estratégia seja configuração, não reescrita. Não é o
 * caminho principal enquanto o GViz for simples e confiável (instrução §19).
 */
async function loadFromAppsScript(config) {
  if (!config.appsScriptUrl) throw new Error('appsScriptUrl não configurada');

  const entries = Object.entries(config.sheets);

  // RA_PROFILES é opcional e começa a ser buscada já, em paralelo com o lote
  // obrigatório — não depois dele — e com um teto menor, mesmo tratamento que o
  // caminho gviz já dá a ela e à APP_META (R2.5: aba opcional não pode empurrar a
  // tela de carregamento para além do necessário).
  const raProfilesPromise = fetchRaProfilesFromAppsScript(config);
  const polygonsPromise = fetchPolygonsFromAppsScript(config);
  const trafficPromise = fetchTrafficSheetsFromAppsScript(config);
  const ivvPromise = fetchIvvMonthlyFromAppsScript(config);
  const regiaoPromise = fetchIvvRegionFromAppsScript(config);
  const fipezapMonthlyPromise = fetchFipezapMonthlyFromAppsScript(config);
  const fipezapLocalityPromise = fetchFipezapLocalityFromAppsScript(config);
  const fipezapLocalityMapPromise = fetchFipezapLocalityMapFromAppsScript(config);
  const pdadDataPromise = fetchPdadDataFromAppsScript(config);

  const settled = await Promise.allSettled(
    entries.map(async ([, sheetName]) => {
      const url = `${config.appsScriptUrl}?resource=dataset&name=${encodeURIComponent(sheetName)}`;
      const response = await fetchWithTimeout(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.error) throw new Error(payload.error);
      return payload.rows || [];
    })
  );

  const raw = {};
  const errors = [];
  settled.forEach((result, i) => {
    const [entity, sheetName] = entries[i];
    if (result.status === 'fulfilled') raw[entity] = result.value;
    else {
      raw[entity] = [];
      errors.push(`Não foi possível ler "${sheetName}" pelo Apps Script: ${result.reason?.message || result.reason}`);
    }
  });

  // O endpoint ?resource=meta já devolve a APP_META pronta como objeto.
  const warnings = [];
  let meta = {};
  try {
    const response = await fetchWithTimeout(`${config.appsScriptUrl}?resource=meta`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error);
    // O endpoint devolve `{ rows: [...] }` para preservar chave duplicada, que um
    // objeto JSON não guarda. Um Web App implantado antes dessa mudança devolve o
    // objeto achatado: ainda é lido, mas nesse formato o conflito já se perdeu na
    // origem e não há o que detectar aqui.
    const metaRaw = Array.isArray(payload.rows) ? payload.rows : payload;
    meta = normalizeAppMeta(metaRaw);
    warnings.push(...metaConflictWarnings(metaRaw));
  } catch (error) {
    warnings.push(`Metadados do dataset indisponíveis: ${error?.message || error}`);
  }

  const { raProfiles, warnings: raProfileWarnings } = await raProfilesPromise;
  warnings.push(...raProfileWarnings);
  const { polygons, warnings: polygonWarnings } = await polygonsPromise;
  warnings.push(...polygonWarnings);
  const { warnings: trafficWarnings, ...trafficPieces } = await trafficPromise;
  warnings.push(...trafficWarnings);
  const traffic = linkTraffic(trafficPieces, polygons);
  const { ivvMonthly, warnings: ivvWarnings } = await ivvPromise;
  warnings.push(...ivvWarnings);
  const { ivvRegion, warnings: regiaoWarnings } = await regiaoPromise;
  warnings.push(...regiaoWarnings);
  const { fipezapMonthly, warnings: fipezapMonthlyWarnings } = await fipezapMonthlyPromise;
  warnings.push(...fipezapMonthlyWarnings);
  const { fipezapLocality, warnings: fipezapLocalityWarnings } = await fipezapLocalityPromise;
  warnings.push(...fipezapLocalityWarnings);
  const { fipezapLocalityMap, warnings: fipezapLocalityMapWarnings } = await fipezapLocalityMapPromise;
  warnings.push(...fipezapLocalityMapWarnings);
  const { pdadData, warnings: pdadDataWarnings } = await pdadDataPromise;
  warnings.push(...pdadDataWarnings);

  return {
    raw, errors, warnings, meta, raProfiles, polygons, traffic, ivvMonthly, ivvRegion,
    fipezapMonthly, fipezapLocality, fipezapLocalityMap, pdadData,
  };
}

/**
 * As três abas de tráfego pelo endpoint read-only do Web App — mesmo contrato de
 * `fetchTrafficSheetsFromGviz`, sem ligar ao polygons ainda (ver comentário lá).
 */
async function fetchTrafficSheetsFromAppsScript(config) {
  const jobs = [
    ['segments', config.roadSegmentsSheet],
    ['aliases', config.roadSegmentAliasesSheet],
    ['traffic', config.trafficDailySheet],
    ['directions', config.roadDirectionMapSheet],
    ['corridor', config.trafficCorridorDailySheet],
  ];

  const warnings = [];
  const rowsByJob = {};
  const failed = new Set();

  await Promise.all(jobs.map(async ([key, sheetName]) => {
    if (!sheetName) { rowsByJob[key] = []; return; }
    try {
      const url = `${config.appsScriptUrl}?resource=dataset&name=${encodeURIComponent(sheetName)}`;
      const response = await fetchWithTimeout(url, { timeoutMs: trafficTimeoutFor(key) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.error) throw new Error(payload.error);
      rowsByJob[key] = payload.rows || [];
    } catch (error) {
      failed.add(key);
      rowsByJob[key] = [];
      warnings.push(`Tráfego (${sheetName}) indisponível: ${error?.message || error}`);
    }
  }));

  const segmentos = normalizeRoadSegments(rowsByJob.segments);
  const apelidos = normalizeRoadSegmentAliases(rowsByJob.aliases);
  const diario = normalizeTrafficDailyRecords(rowsByJob.traffic);
  const sentidos = normalizeRoadDirections(rowsByJob.directions);
  const corredor = normalizeCorridorDailyRecords(rowsByJob.corridor);
  warnings.push(...trafficDropWarnings(config, {
    segments: segmentos.dropped, aliases: apelidos.dropped, traffic: diario.dropped,
    directions: sentidos.dropped, directionDuplicates: sentidos.duplicates,
    corridor: corredor.dropped, corridorDuplicates: corredor.duplicates,
  }));

  return {
    segments: segmentos.records,
    aliases: apelidos.records,
    trafficRecords: diario.records,
    directions: sentidos.records,
    corridorDaily: corredor.records,
    dailyLoadFailed: failed.has('traffic'),
    warnings,
  };
}

/** POLYGONS pelo endpoint read-only do Web App — mesmo contrato de `fetchPolygonsFromGviz`. */
async function fetchPolygonsFromAppsScript(config) {
  if (!config.polygonsSheet) return { polygons: [], warnings: [] };

  try {
    const url = `${config.appsScriptUrl}?resource=dataset&name=${encodeURIComponent(config.polygonsSheet)}`;
    const response = await fetchWithTimeout(url, { timeoutMs: META_FETCH_TIMEOUT_MS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error);
    return { polygons: normalizePolygons(payload.rows || []), warnings: [] };
  } catch (error) {
    return { polygons: [], warnings: [`Contornos indisponíveis: ${error?.message || error}`] };
  }
}

/** IVV_MONTHLY pelo endpoint read-only do Web App — mesmo contrato de `fetchIvvMonthlyFromGviz`. */
async function fetchIvvMonthlyFromAppsScript(config) {
  if (!config.ivvMonthlySheet) return { ivvMonthly: EMPTY_IVV_MONTHLY, warnings: [] };

  try {
    const url = `${config.appsScriptUrl}?resource=dataset&name=${encodeURIComponent(config.ivvMonthlySheet)}`;
    const response = await fetchWithTimeout(url, { timeoutMs: META_FETCH_TIMEOUT_MS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error);
    const { months, warnings } = normalizeIvvMonthly(payload.rows || []);
    return { ivvMonthly: months, warnings: ivvWarningTexts(warnings) };
  } catch (error) {
    return {
      ivvMonthly: EMPTY_IVV_MONTHLY,
      warnings: [`Série de mercado indisponível: ${error?.message || error}`],
    };
  }
}

/** IVV_REGION pelo endpoint read-only do Web App — mesmo contrato de `fetchIvvRegionFromGviz`. */
async function fetchIvvRegionFromAppsScript(config) {
  if (!config.ivvRegionSheet) return { ivvRegion: [], warnings: [] };

  try {
    const url = `${config.appsScriptUrl}?resource=dataset&name=${encodeURIComponent(config.ivvRegionSheet)}`;
    const response = await fetchWithTimeout(url, { timeoutMs: META_FETCH_TIMEOUT_MS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error);
    const { rows, warnings } = normalizeIvvRegion(payload.rows || []);
    return {
      ivvRegion: rows,
      warnings: (warnings || []).map((texto) => `Mercado (IVV_REGION): ${texto}`),
    };
  } catch (error) {
    return { ivvRegion: [], warnings: [`IVV por região indisponível: ${error?.message || error}`] };
  }
}

/** FIPEZAP_MONTHLY pelo endpoint read-only do Web App — mesmo contrato de `fetchFipezapMonthlyFromGviz`. */
async function fetchFipezapMonthlyFromAppsScript(config) {
  if (!config.fipezapMonthlySheet) return { fipezapMonthly: [], warnings: [] };

  try {
    const url = `${config.appsScriptUrl}?resource=dataset&name=${encodeURIComponent(config.fipezapMonthlySheet)}`;
    const response = await fetchWithTimeout(url, { timeoutMs: META_FETCH_TIMEOUT_MS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error);
    const { rows, warnings } = normalizeFipezapMonthly(payload.rows || []);
    return {
      fipezapMonthly: rows,
      warnings: (warnings || []).map((texto) => `Mercado (${config.fipezapMonthlySheet}): ${texto}`),
    };
  } catch (error) {
    return { fipezapMonthly: [], warnings: [`Preço FipeZap (DF) indisponível: ${error?.message || error}`] };
  }
}

/** FIPEZAP_LOCALITY_MONTHLY pelo endpoint read-only do Web App — mesmo contrato de `fetchFipezapLocalityFromGviz`. */
async function fetchFipezapLocalityFromAppsScript(config) {
  if (!config.fipezapLocalitySheet) return { fipezapLocality: [], warnings: [] };

  try {
    const url = `${config.appsScriptUrl}?resource=dataset&name=${encodeURIComponent(config.fipezapLocalitySheet)}`;
    const response = await fetchWithTimeout(url, { timeoutMs: META_FETCH_TIMEOUT_MS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error);
    const { rows, warnings } = normalizeFipezapLocality(payload.rows || []);
    return {
      fipezapLocality: rows,
      warnings: (warnings || []).map((texto) => `Mercado (${config.fipezapLocalitySheet}): ${texto}`),
    };
  } catch (error) {
    return { fipezapLocality: [], warnings: [`Preço FipeZap por RA indisponível: ${error?.message || error}`] };
  }
}

/** FIPEZAP_LOCALITY_MAP pelo endpoint read-only do Web App — mesmo contrato de `fetchFipezapLocalityMapFromGviz`. */
async function fetchFipezapLocalityMapFromAppsScript(config) {
  if (!config.fipezapLocalityMapSheet) return { fipezapLocalityMap: [], warnings: [] };

  try {
    const url = `${config.appsScriptUrl}?resource=dataset&name=${encodeURIComponent(config.fipezapLocalityMapSheet)}`;
    const response = await fetchWithTimeout(url, { timeoutMs: META_FETCH_TIMEOUT_MS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error);
    const { rows, warnings } = normalizeFipezapLocalityMap(payload.rows || []);
    return {
      fipezapLocalityMap: rows,
      warnings: (warnings || []).map((texto) => `Mercado (${config.fipezapLocalityMapSheet}): ${texto}`),
    };
  } catch (error) {
    return { fipezapLocalityMap: [], warnings: [`Mapa de localidades FipeZap indisponível: ${error?.message || error}`] };
  }
}

/** PDAD_A_DATA pelo endpoint read-only do Web App — mesmo contrato de `fetchPdadDataFromGviz`. */
async function fetchPdadDataFromAppsScript(config) {
  if (!config.pdadDataSheet) return { pdadData: [], warnings: [] };

  try {
    const url = `${config.appsScriptUrl}?resource=dataset&name=${encodeURIComponent(config.pdadDataSheet)}`;
    const response = await fetchWithTimeout(url, { timeoutMs: FETCH_TIMEOUT_MS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error);
    const { rows, warnings } = normalizePdadData(payload.rows || []);
    return {
      pdadData: rows,
      warnings: (warnings || []).map((texto) => `Diagnóstico (PDAD_A_DATA): ${texto}`),
    };
  } catch (error) {
    return {
      pdadData: [],
      warnings: [`Diagnóstico territorial indisponível: ${error?.message || error}`],
    };
  }
}

/** RA_PROFILES pelo endpoint read-only do Web App — mesmo formato de resposta que as abas obrigatórias. */
async function fetchRaProfilesFromAppsScript(config) {
  if (!config.raProfilesSheet) return { raProfiles: {}, warnings: [] };

  try {
    const url = `${config.appsScriptUrl}?resource=dataset&name=${encodeURIComponent(config.raProfilesSheet)}`;
    const response = await fetchWithTimeout(url, { timeoutMs: META_FETCH_TIMEOUT_MS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error);
    return { raProfiles: normalizeRaProfiles(payload.rows || []), warnings: [] };
  } catch (error) {
    return {
      raProfiles: {},
      warnings: [`Indicadores por Região Administrativa indisponíveis: ${error?.message || error}`],
    };
  }
}

// --- Arquivos públicos: data/public/ (issue #149, R2.7) --------------------------

/**
 * Teto do download de UMA camada territorial. Mais folgado que o das abas porque um shard
 * de 2 MB numa conexão móvel leva mais que 20 s, e abortar no meio só para recomeçar no
 * próximo zoom é pior do que esperar.
 */
const PUBLIC_LAYER_TIMEOUT_MS = 45000;

/** Formato de `publicData` quando nada foi configurado ou carregado — nunca `undefined`. */
export const EMPTY_PUBLIC_DATA = Object.freeze({
  available: false,
  reason: 'publicDataUrl não configurada',
  baseUrl: null,
  manifest: null,
  warnings: [],
});

/** Camadas já baixadas e conferidas, por `${dataset}/${path}@${sha256}`. */
const publicLayerCache = new Map();

/** Esvazia a memoização — para teste e para recarga explícita. */
export function clearPublicLayerCache() {
  publicLayerCache.clear();
}

/**
 * URL de um arquivo público a partir da base configurada e do caminho do manifest.
 *
 * Recusa com `null` tudo que sairia da MESMA ORIGEM: base absoluta em outro host, caminho
 * com `..`, barra inicial ou esquema. O manifest é gerado por máquina, mas chega pela rede,
 * e um caminho que escapa do diretório é exatamente o tipo de dado que não se segue (R4.6).
 * Fora do navegador (`location` ausente) a junção é textual, para o teste de nó.
 */
export function publicFileUrl(baseUrl, relPath) {
  const base = String(baseUrl || '').trim();
  const rel = String(relPath || '').trim();
  if (!base || !rel) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(rel) || rel.startsWith('/') || rel.startsWith('\\')) return null;
  if (rel.split('/').some((part) => part === '..' || part === '')) return null;
  const joined = `${base.endsWith('/') ? base : `${base}/`}${rel}`;
  if (typeof location === 'undefined' || !location.origin) {
    return /^[a-z][a-z0-9+.-]*:/i.test(base) ? null : joined;
  }
  let resolved;
  try {
    resolved = new URL(joined, location.href);
  } catch {
    return null;
  }
  if (resolved.origin !== location.origin) return null;
  return resolved.href;
}

/**
 * Busca e normaliza `manifest.json` (issue #149).
 *
 * Mesma origem do site e independente da estratégia de dados: o manifest descreve o que o
 * GitHub Pages serve ao lado do `index.html`, não o que a planilha tem. Qualquer falha —
 * configuração ausente, 404, rede, timeout, JSON inválido, versão desconhecida — vira
 * `{ available: false, reason }` com aviso, nunca erro (R2.5): o site inteiro funciona sem
 * as camadas territoriais; elas é que não funcionam sem ele.
 */
export async function fetchPublicManifest(config, { fetchRef = null } = {}) {
  const baseUrl = config?.publicDataUrl;
  if (!baseUrl) return { ...EMPTY_PUBLIC_DATA };
  const fileName = config.publicManifestFile || 'manifest.json';
  const url = publicFileUrl(baseUrl, fileName);
  const warnings = [];
  const unavailable = (reason) => ({ available: false, reason, baseUrl, manifest: null, warnings });
  if (!url) {
    warnings.push(`Arquivos públicos (data/public): publicDataUrl "${baseUrl}" não é um caminho da mesma origem; camadas territoriais desligadas.`);
    return unavailable('publicDataUrl fora da mesma origem');
  }
  let raw;
  try {
    const response = await fetchWithTimeout(url, { timeoutMs: META_FETCH_TIMEOUT_MS, fetchRef, cache: 'no-cache' });
    if (!response.ok) {
      const reason = response.status === 404
        ? 'manifest.json ainda não publicado (o pipeline não rodou)'
        : `manifest.json respondeu HTTP ${response.status}`;
      warnings.push(`Arquivos públicos (data/public): ${reason}; camadas territoriais desligadas.`);
      return unavailable(reason);
    }
    raw = await response.json();
  } catch (error) {
    const reason = error?.name === 'AbortError'
      ? 'manifest.json demorou mais que o limite'
      : `manifest.json inacessível (${error?.message || error})`;
    warnings.push(`Arquivos públicos (data/public): ${reason}; camadas territoriais desligadas.`);
    return unavailable(reason);
  }
  const { manifest, warnings: manifestWarnings } = normalizeManifest(raw);
  warnings.push(...manifestWarnings);
  if (!manifest) return unavailable('manifest.json inválido');
  if (manifest.datasets.length === 0) {
    return { available: false, reason: 'manifest.json publicado sem nenhum conjunto de dados (o pipeline ainda não rodou)', baseUrl, manifest, warnings };
  }
  return { available: true, reason: null, baseUrl, manifest, warnings };
}

async function sha256Hex(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Baixa UM arquivo listado no manifest e confere tamanho e hash antes de entregá-lo.
 *
 * Lazy e memoizado por `${dataset}/${path}@${sha256}`: a camada só é buscada quando alguém a
 * liga, e um manifest novo (hash novo) invalida a cópia antiga sozinho. A query `?v=<hash>`
 * é cache por conteúdo — a mesma ideia do `versionar-assets` — para o navegador nunca servir
 * o arquivo do mês passado com o manifest deste mês.
 *
 * Divergência de `bytes` ou de `sha256` LANÇA "não confere com o manifest" (R2.7): a tela
 * mostra o motivo e não desenha. Sem `crypto.subtle` (contexto inseguro) o hash não é
 * conferido e o resultado diz isso em `integrity`, em vez de fingir que conferiu.
 */
export async function fetchPublicLayer({ baseUrl, dataset, file }, { fetchRef = null, timeoutMs = PUBLIC_LAYER_TIMEOUT_MS } = {}) {
  if (!dataset || !file) throw new Error('fetchPublicLayer: dataset e arquivo são obrigatórios');
  const key = `${dataset.id}/${file.path}@${file.sha256}`;
  if (publicLayerCache.has(key)) return publicLayerCache.get(key);
  const url = publicFileUrl(baseUrl, file.path);
  if (!url) throw new Error(`${dataset.id}: caminho "${file.path}" recusado (fora da mesma origem)`);
  const versioned = `${url}${url.includes('?') ? '&' : '?'}v=${file.sha256.slice(0, 12)}`;
  const pending = (async () => {
    // O teto cobre o CORPO, não só os cabeçalhos: `fetchWithTimeout` limpa o timer assim que
    // a resposta começa, e um corpo de 2 MB travado deixaria a camada "carregando…" para
    // sempre (achado da revisão da PR #157). Aqui o `abort` vale até o último byte.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let bytes;
    try {
      const doFetch = fetchRef || fetch;
      const response = await doFetch(versioned, { signal: controller.signal });
      if (!response.ok) throw new Error(`${dataset.id}: ${file.path} respondeu HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      bytes = new Uint8Array(buffer);
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`${dataset.id}: ${file.path} demorou mais que ${Math.round(timeoutMs / 1000)} s`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
    if (bytes.byteLength !== file.bytes) {
      throw new Error(`${dataset.id}: ${file.path} tem ${bytes.byteLength} bytes e o manifest diz ${file.bytes} — arquivo não confere com o manifest`);
    }
    const digest = await sha256Hex(bytes);
    if (digest !== null && digest !== file.sha256) {
      throw new Error(`${dataset.id}: ${file.path} tem sha256 diferente do manifest — arquivo não confere com o manifest`);
    }
    const text = new TextDecoder('utf-8').decode(bytes);
    const payload = JSON.parse(text);
    return { payload, integrity: digest === null ? 'não verificada' : 'sha256 conferido', bytes: bytes.byteLength, file, dataset };
  })();
  publicLayerCache.set(key, pending);
  try {
    return await pending;
  } catch (error) {
    publicLayerCache.delete(key);
    throw error;
  }
}

const STRATEGIES = {
  gviz: loadFromGviz,
  demo: loadFromDemo,
  appsscript: loadFromAppsScript,
};

/**
 * Resolve a estratégia efetiva a partir da configuração.
 *
 * `demoMode: true` vence `dataSource` por ser o atalho documentado em
 * docs/SHEET_SETUP.md. Estratégia desconhecida cai em `gviz` — que é o caminho
 * principal — em vez de cair em `demo`, para que um erro de digitação na
 * configuração não faça o site servir dado de demonstração achando que é produção
 * (R2.3, R5.7).
 */
export function resolveStrategy(config) {
  if (config.demoMode === true) return 'demo';
  const requested = config.dataSource;
  return STRATEGIES[requested] ? requested : 'gviz';
}

/**
 * Carrega e normaliza o dataset.
 *
 * Nunca lança por causa de dado ruim: devolve `errors` e `warnings` para a interface
 * decidir o que mostrar. Erro que impede tudo vira estado de erro legível; registro
 * ruim isolado vira aviso. O que não pode acontecer é tela branca (R5.6).
 */
export async function loadDataset(config, { fetchRef = null } = {}) {
  const strategy = resolveStrategy(config);
  const warnings = [];
  const errors = [];

  // O manifest dos arquivos públicos parte ANTES da estratégia (R8.29): é mesma origem e não
  // depende da planilha, então esperar as abas para só então pedi-lo somaria as latências.
  // Sem `publicDataUrl` a promessa resolve na hora, sem rede (os testes das estratégias não a
  // configuram, e não devem ganhar uma requisição a mais por isso).
  const publicDataPromise = fetchPublicManifest(config, { fetchRef });

  let result;
  try {
    result = await STRATEGIES[strategy](config);
  } catch (error) {
    const publicData = await publicDataPromise;
    return {
      entities: { listings: [], developments: [], anchors: [] },
      meta: {},
      raProfiles: {},
      polygons: [],
      traffic: EMPTY_TRAFFIC,
      ivvMonthly: EMPTY_IVV_MONTHLY,
      ivvRegion: [],
      fipezapMonthly: [],
      fipezapLocality: [],
      fipezapLocalityMap: [],
      pdadData: [],
      publicData,
      source: strategy,
      warnings: [...warnings, ...publicData.warnings],
      errors: [error?.message || String(error)],
      ok: false,
    };
  }

  const publicData = await publicDataPromise;
  warnings.push(...publicData.warnings);

  errors.push(...(result.errors || []));
  // Avisos da própria estratégia — por exemplo, APP_META inacessível, que não impede
  // a aplicação de abrir mas o operador precisa saber.
  warnings.push(...(result.warnings || []));

  const entities = {};
  for (const entity of REQUIRED_ENTITIES) {
    const { records, dropped, warnings: entityWarnings } = normalizeAll(entity, result.raw[entity]);
    entities[entity] = records;

    if (dropped > 0) {
      warnings.push(`${dropped} registro(s) de ${entity} ignorado(s) por não terem identificador.`);
    }
    warnings.push(...(entityWarnings || []));
    // Entidade obrigatória sem nenhum registro é erro, não aviso: renderizar o mapa
    // sem os anúncios seria mostrar um dataset parcial como se estivesse completo.
    if (records.length === 0 && !(result.errors || []).some((e) => e.includes(config.sheets[entity]))) {
      errors.push(`A aba obrigatória ${config.sheets[entity]} não trouxe nenhum registro.`);
    }
  }

  // `ok` só é verdadeiro com TODAS as entidades obrigatórias carregadas. Bastar
  // "alguma coisa carregou" faria a interface apresentar dataset incompleto como
  // sucesso — exatamente o fallback silencioso que R5.7 proíbe.
  const complete = REQUIRED_ENTITIES.every((e) => entities[e].length > 0);

  return {
    entities,
    meta: result.meta || {},
    raProfiles: result.raProfiles || {},
    polygons: result.polygons || [],
    traffic: result.traffic || EMPTY_TRAFFIC,
    ivvMonthly: result.ivvMonthly || EMPTY_IVV_MONTHLY,
    ivvRegion: result.ivvRegion || [],
    fipezapMonthly: result.fipezapMonthly || [],
    fipezapLocality: result.fipezapLocality || [],
    fipezapLocalityMap: result.fipezapLocalityMap || [],
    pdadData: result.pdadData || [],
    publicData,
    source: strategy,
    warnings,
    errors,
    ok: errors.length === 0 && complete,
  };
}

/** Junta todas as entidades em uma lista única, que é como o mapa e os filtros operam. */
export function flattenEntities(entities) {
  return [
    ...(entities.listings || []),
    ...(entities.developments || []),
    ...(entities.anchors || []),
  ];
}
