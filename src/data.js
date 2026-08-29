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

/** Entidades obrigatórias na V1. Ausência de qualquer uma é erro. */
export const REQUIRED_ENTITIES = ['listings', 'developments', 'anchors'];

/** Formato de `traffic` quando as três abas de tráfego não carregaram — nunca `undefined`. */
const EMPTY_TRAFFIC = { bySegmentId: new Map(), orphaned: [], unmatchedSegmentIds: [] };

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

/** `fetch` com timeout, para que falha de rede vire erro tratável e não espera infinita. */
async function fetchWithTimeout(url, { timeoutMs = FETCH_TIMEOUT_MS, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
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
  const { segments, aliases, trafficRecords, warnings: trafficWarnings } = await trafficPromise;
  const traffic = linkTrafficDataset(segments, polygons, trafficRecords, aliases);
  return {
    raw,
    errors,
    warnings: [...warnings, ...raProfileWarnings, ...polygonWarnings, ...trafficWarnings],
    meta: { spreadsheetId: config.spreadsheetId, ...meta },
    raProfiles,
    polygons,
    traffic,
  };
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
  ];

  const settled = await Promise.allSettled(
    jobs.map(([, sheetName]) => (
      sheetName
        ? fetchGvizSheet(config.spreadsheetId, sheetName, { timeoutMs: META_FETCH_TIMEOUT_MS })
        : Promise.resolve(null)
    ))
  );

  const warnings = [];
  const rowsByJob = {};
  settled.forEach((result, i) => {
    const [key, sheetName] = jobs[i];
    if (!sheetName) { rowsByJob[key] = []; return; }
    if (result.status === 'fulfilled') {
      rowsByJob[key] = result.value || [];
    } else {
      rowsByJob[key] = [];
      warnings.push(`Tráfego (${sheetName}) indisponível: ${result.reason?.message || result.reason}`);
    }
  });

  return {
    segments: normalizeRoadSegments(rowsByJob.segments).records,
    aliases: normalizeRoadSegmentAliases(rowsByJob.aliases).records,
    trafficRecords: normalizeTrafficDailyRecords(rowsByJob.traffic).records,
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
  return {
    raw,
    errors: [],
    warnings: metaConflictWarnings(payload.meta),
    meta: { ...normalizeAppMeta(payload.meta), demo: payload.meta || {} },
    // Mesmo tratamento de `raw`: aba ausente no demo.json vira mapa vazio, não erro.
    raProfiles: normalizeRaProfiles(payload.ra_profiles || []),
    // `polygons: []` é o conteúdo esperado do demo — ver o comentário em
    // tools/build-demo.mjs. O caminho que precisa nunca quebrar é o da camada vazia.
    polygons: normalizePolygons(payload.polygons || []),
    // Mesmo tratamento: o demo.json de hoje não traz nenhuma das três chaves de
    // tráfego, e o caminho que precisa funcionar é o de painel vazio, não erro.
    traffic: linkTrafficDataset(
      normalizeRoadSegments(payload.road_segments || []).records,
      normalizePolygons(payload.polygons || []),
      normalizeTrafficDailyRecords(payload.traffic_daily || []).records,
      normalizeRoadSegmentAliases(payload.road_segment_aliases || []).records
    ),
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
  const {
    segments, aliases, trafficRecords, warnings: trafficWarnings,
  } = await trafficPromise;
  warnings.push(...trafficWarnings);
  const traffic = linkTrafficDataset(segments, polygons, trafficRecords, aliases);

  return {
    raw, errors, warnings, meta, raProfiles, polygons, traffic,
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
  ];

  const warnings = [];
  const rowsByJob = {};

  await Promise.all(jobs.map(async ([key, sheetName]) => {
    if (!sheetName) { rowsByJob[key] = []; return; }
    try {
      const url = `${config.appsScriptUrl}?resource=dataset&name=${encodeURIComponent(sheetName)}`;
      const response = await fetchWithTimeout(url, { timeoutMs: META_FETCH_TIMEOUT_MS });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.error) throw new Error(payload.error);
      rowsByJob[key] = payload.rows || [];
    } catch (error) {
      rowsByJob[key] = [];
      warnings.push(`Tráfego (${sheetName}) indisponível: ${error?.message || error}`);
    }
  }));

  return {
    segments: normalizeRoadSegments(rowsByJob.segments).records,
    aliases: normalizeRoadSegmentAliases(rowsByJob.aliases).records,
    trafficRecords: normalizeTrafficDailyRecords(rowsByJob.traffic).records,
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
export async function loadDataset(config) {
  const strategy = resolveStrategy(config);
  const warnings = [];
  const errors = [];

  let result;
  try {
    result = await STRATEGIES[strategy](config);
  } catch (error) {
    return {
      entities: { listings: [], developments: [], anchors: [] },
      meta: {},
      raProfiles: {},
      polygons: [],
      traffic: EMPTY_TRAFFIC,
      source: strategy,
      warnings,
      errors: [error?.message || String(error)],
      ok: false,
    };
  }

  errors.push(...(result.errors || []));
  // Avisos da própria estratégia — por exemplo, APP_META inacessível, que não impede
  // a aplicação de abrir mas o operador precisa saber.
  warnings.push(...(result.warnings || []));

  const entities = {};
  for (const entity of REQUIRED_ENTITIES) {
    const { records, dropped } = normalizeAll(entity, result.raw[entity]);
    entities[entity] = records;

    if (dropped > 0) {
      warnings.push(`${dropped} registro(s) de ${entity} ignorado(s) por não terem identificador.`);
    }
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
