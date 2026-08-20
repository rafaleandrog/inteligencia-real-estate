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

import { normalizeAll } from './normalize.js';

/** Entidades obrigatórias na V1. Ausência de qualquer uma é erro. */
export const REQUIRED_ENTITIES = ['listings', 'developments', 'anchors', 'primaryMarket'];

/** Timeout de rede. Sem isso, uma planilha inacessível deixa a página em "carregando" para sempre. */
const FETCH_TIMEOUT_MS = 20000;

/** `fetch` com timeout, para que falha de rede vire erro tratável e não espera infinita. */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
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
export function gvizUrl(spreadsheetId, sheetName) {
  const base = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/gviz/tq`;
  return `${base}?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
}

/** Busca uma aba via GViz e devolve as linhas já com chave por cabeçalho. */
async function fetchSheet(spreadsheetId, sheetName) {
  const response = await fetchWithTimeout(gvizUrl(spreadsheetId, sheetName));
  if (!response.ok) {
    throw new Error(`aba "${sheetName}": HTTP ${response.status}`);
  }
  const parsed = parseGvizResponse(await response.text());

  // O GViz responde 200 com status "error" no corpo — aba inexistente cai aqui.
  if (parsed.status === 'error') {
    const detail = (parsed.errors || []).map((e) => e.detailed_message || e.message).join('; ');
    throw new Error(`aba "${sheetName}": ${detail || 'erro do GViz'}`);
  }
  return gvizTableToRows(parsed.table);
}

/**
 * Estratégia `gviz`. Caminho principal da V1.
 *
 * As quatro abas obrigatórias são buscadas em paralelo. `allSettled` em vez de `all`:
 * com `all`, uma aba com problema descartaria as outras três que chegaram bem, e a
 * tela ficaria vazia em vez de parcialmente útil.
 */
async function loadFromGviz(config) {
  const entries = Object.entries(config.sheets);
  const settled = await Promise.allSettled(
    entries.map(([, sheetName]) => fetchSheet(config.spreadsheetId, sheetName))
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

  return { raw, errors, meta: { spreadsheetId: config.spreadsheetId } };
}

/** Estratégia `demo`. Lê o dataset estático do repositório. */
async function loadFromDemo(config) {
  const response = await fetchWithTimeout(config.demoUrl);
  if (!response.ok) throw new Error(`demo.json: HTTP ${response.status}`);
  const payload = await response.json();

  const raw = {};
  for (const entity of Object.keys(config.sheets)) raw[entity] = payload[entity] || [];
  return { raw, errors: [], meta: payload.meta || {} };
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

  return { raw, errors, meta: {} };
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
      entities: { listings: [], developments: [], anchors: [], primaryMarket: [] },
      meta: {},
      source: strategy,
      warnings,
      errors: [error?.message || String(error)],
      ok: false,
    };
  }

  errors.push(...(result.errors || []));

  const entities = {};
  for (const entity of REQUIRED_ENTITIES) {
    const { records, dropped } = normalizeAll(entity, result.raw[entity]);
    entities[entity] = records;

    if (dropped > 0) {
      warnings.push(`${dropped} registro(s) de ${entity} ignorado(s) por não terem identificador.`);
    }
    // Aba que respondeu mas veio vazia não é o mesmo que aba que falhou: a primeira
    // é aviso, a segunda já está em `errors`.
    if (records.length === 0 && !(result.errors || []).some((e) => e.includes(config.sheets[entity]))) {
      warnings.push(`A aba ${config.sheets[entity]} está vazia.`);
    }
  }

  const totalRecords = REQUIRED_ENTITIES.reduce((sum, e) => sum + entities[e].length, 0);

  return {
    entities,
    meta: result.meta || {},
    source: strategy,
    warnings,
    errors,
    ok: totalRecords > 0,
  };
}

/** Junta todas as entidades em uma lista única, que é como o mapa e os filtros operam. */
export function flattenEntities(entities) {
  return [
    ...(entities.listings || []),
    ...(entities.primaryMarket || []),
    ...(entities.developments || []),
    ...(entities.anchors || []),
  ];
}
