// Normalizador da aba IVV_MONTHLY — série mensal do mercado residencial do DF.
//
// Arquivo próprio, fora de `src/normalize.js`, para não colidir com o bloco do mapa.
//
// ESTE ARQUIVO É O PRIMEIRO LUGAR DO PROJETO A DECLARAR AS COLUNAS DE IVV_MONTHLY.
// No `Code.gs` v2.2.0 a aba está em `OPTIONAL_SHEETS` e `ALLOWED_DATASETS`, mas NÃO em
// `REQUIRED_HEADERS`, `MANAGED_EXTENSION_SHEETS` nem `FIELD_SCHEMA`: `setupProject()` não a
// provisiona e `validateAll()` nunca a valida. Não existe lado servidor para cruzar, então a
// rede de teste é o triângulo registro (`metrics.js`) ↔ normalizador (aqui) ↔
// `docs/DATA_CONTRACT.md`, fechado nos três sentidos por `tests/ivv-contract.test.js`.
//
// CONVENÇÃO, NÃO VERIFICAÇÃO: os nomes abaixo descrevem o dataset como o backend o publica,
// mas nada neste repositório pôde confrontá-los com a planilha viva. Por isso o normalizador
// NOMEIA no aviso toda coluna que a aba trouxer e que não esteja declarada aqui — a primeira
// carga real corrige a convenção em vez de escondê-la (R5.7).

import { toText, toNumber, toInteger, toBoolean, toDateISO } from '../normalize.js';
import { safeExternalUrl } from '../format.js';
import {
  classifyColumn, COLUMN_ROLES, LEGACY_COLUMN_ALIASES, PUBLISHED_COLUMN_ALIASES,
  METRIC_BY_KEY,
} from './metrics.js';

/** Grupos do schema, na ordem em que a issue #56 os descreve. */
export const IVV_COLUMN_GROUPS = Object.freeze({
  IDENTIFICACAO: 'identificacao',
  ESCOPO: 'escopo',
  METRICA: 'metrica',
  DERIVADA: 'derivada',
  ACUMULADO: 'acumulado',
  VARIACAO: 'variacao',
});

const G = IVV_COLUMN_GROUPS;

/**
 * Tipos de coluna. `fracao` é percentual em escala DECIMAL (`0.057` = 5,7%) — o oposto de
 * `RA_PROFILES`, onde `54` significa 54%. As duas escalas nunca se unificam (R8.44).
 */
const T = Object.freeze({
  TEXTO: 'texto', DATA: 'data', INTEIRO: 'inteiro', NUMERO: 'numero',
  FRACAO: 'fracao', BOOLEANO: 'booleano', URL: 'url',
});

const metricColumn = (key) => ({
  key, group: G.METRICA, type: METRIC_BY_KEY[key].unit === 'fracao' ? T.FRACAO
    : METRIC_BY_KEY[key].unit === 'unidades' ? T.INTEIRO : T.NUMERO,
  autoScale: METRIC_BY_KEY[key].unit === 'fracao',
});

/**
 * Schema declarado da aba. `autoScale` marca as colunas em que um valor acima de 1 só pode
 * ser ponto percentual — e é ali, e só ali, que a conversão de escala acontece, sempre com
 * aviso nomeado.
 */
export const IVV_COLUMNS = Object.freeze([
  // ---------- identificação e filtro ----------
  { key: 'period_id', group: G.IDENTIFICACAO, type: T.TEXTO },
  { key: 'reference_date', group: G.IDENTIFICACAO, type: T.DATA },
  { key: 'year', group: G.IDENTIFICACAO, type: T.INTEIRO },
  { key: 'month', group: G.IDENTIFICACAO, type: T.INTEIRO },
  { key: 'month_label', group: G.IDENTIFICACAO, type: T.TEXTO },
  { key: 'quarter', group: G.IDENTIFICACAO, type: T.TEXTO },
  { key: 'is_latest_period', group: G.IDENTIFICACAO, type: T.BOOLEANO },

  // ---------- escopo e procedência ----------
  { key: 'geography_scope', group: G.ESCOPO, type: T.TEXTO },
  { key: 'market_scope', group: G.ESCOPO, type: T.TEXTO },
  { key: 'segment_scope', group: G.ESCOPO, type: T.TEXTO },
  { key: 'source_publisher', group: G.ESCOPO, type: T.TEXTO },
  { key: 'source_report_generated_at', group: G.ESCOPO, type: T.TEXTO },
  { key: 'source_file', group: G.ESCOPO, type: T.TEXTO },
  { key: 'source_url', group: G.ESCOPO, type: T.URL },
  { key: 'report_filter', group: G.ESCOPO, type: T.TEXTO },
  { key: 'quality_flag', group: G.ESCOPO, type: T.TEXTO },
  // Procedência do schema v1.0.0, ainda presente na semente.
  { key: 'source_id', group: G.ESCOPO, type: T.TEXTO },
  { key: 'source_locator', group: G.ESCOPO, type: T.TEXTO },
  { key: 'verified_at', group: G.ESCOPO, type: T.DATA },
  { key: 'coverage_note', group: G.ESCOPO, type: T.TEXTO },
  { key: 'reference_month', group: G.IDENTIFICACAO, type: T.DATA },

  // ---------- métricas mensais (as 13 do registro da B2) ----------
  metricColumn('ivv_pct'),
  metricColumn('offers_units'),
  metricColumn('sales_units'),
  metricColumn('launches_units'),
  metricColumn('launches_developments'),
  metricColumn('cancellations_units'),
  metricColumn('offer_area_m2'),
  metricColumn('sold_area_m2'),
  metricColumn('asking_price_brl_m2'),
  metricColumn('sale_price_brl_m2'),
  metricColumn('vgo_brl_million'),
  metricColumn('vgv_brl_million'),
  metricColumn('vgl_brl_million'),

  // ---------- derivadas e validação ----------
  // Recalculadas pelo backend. SINALIZAM divergência; nunca substituem o publicado (R8.54).
  //
  // NOMES OBSERVADOS × NOMES DE CONVENÇÃO. A aba `IVV_REGION` da semente é o único lugar
  // deste repositório onde dá para VER como o publicador nomeia a família de conferência:
  // ela traz `ivv_pct_check` e `ivv_variance_pp`. `IVV_MONTHLY` vem do mesmo publicador e
  // do mesmo relatório, então esses dois nomes entram declarados como observados. Os pares
  // `ivv_calc_pct`/`ivv_diff_pp` ficam declarados como convenção, porque foi assim que a
  // issue #57 os descreveu e não custa nada aceitar as duas grafias: coluna declarada que
  // não vem é simplesmente ausente, e coluna que vem sem declaração vira aviso nomeado.
  { key: 'ivv_pct_check', group: G.DERIVADA, type: T.FRACAO, autoScale: true, observed: 'IVV_REGION' },
  { key: 'ivv_variance_pp', group: G.DERIVADA, type: T.NUMERO, observed: 'IVV_REGION' },
  { key: 'ivv_calc_pct', group: G.DERIVADA, type: T.FRACAO, autoScale: true },
  { key: 'ivv_diff_pp', group: G.DERIVADA, type: T.NUMERO },
  { key: 'asking_price_calc_brl_m2', group: G.DERIVADA, type: T.NUMERO },
  { key: 'asking_price_diff_brl_m2', group: G.DERIVADA, type: T.NUMERO },
  { key: 'asking_price_diff_pct', group: G.DERIVADA, type: T.FRACAO, autoScale: true },
  { key: 'sale_price_calc_brl_m2', group: G.DERIVADA, type: T.NUMERO },
  { key: 'sale_price_diff_brl_m2', group: G.DERIVADA, type: T.NUMERO },
  { key: 'sale_price_diff_pct', group: G.DERIVADA, type: T.FRACAO, autoScale: true },
  // A divergência vem na unidade da própria métrica: p.p. para uma fração, R$/m² para um
  // preço. Uma coluna `_diff_pct` sobre um preço seria ambígua entre as duas leituras.
  // Tickets e áreas médias: valor por unidade, já dividido pelo backend. Não são família
  // derivada de nenhuma métrica do registro — são colunas próprias, e por isso declaradas
  // aqui uma a uma em vez de reconhecidas por padrão.
  { key: 'avg_offer_ticket_brl', group: G.DERIVADA, type: T.NUMERO },
  { key: 'avg_sale_ticket_brl', group: G.DERIVADA, type: T.NUMERO },
  { key: 'avg_launch_ticket_brl', group: G.DERIVADA, type: T.NUMERO },
  { key: 'avg_offer_area_m2', group: G.DERIVADA, type: T.NUMERO },
  { key: 'avg_sold_area_m2', group: G.DERIVADA, type: T.NUMERO },
  { key: 'cancellations_to_sales_pct', group: G.DERIVADA, type: T.FRACAO, autoScale: true },

  // ---------- acumulados do ano civil (zeram em janeiro) ----------
  { key: 'sales_units_ytd', group: G.ACUMULADO, type: T.INTEIRO },
  { key: 'launches_units_ytd', group: G.ACUMULADO, type: T.INTEIRO },
  { key: 'cancellations_units_ytd', group: G.ACUMULADO, type: T.INTEIRO },
  { key: 'sold_area_m2_ytd', group: G.ACUMULADO, type: T.NUMERO },
  { key: 'vgv_brl_million_ytd', group: G.ACUMULADO, type: T.NUMERO },
  { key: 'vgl_brl_million_ytd', group: G.ACUMULADO, type: T.NUMERO },
  { key: 'ivv_ytd_pct', group: G.ACUMULADO, type: T.FRACAO, autoScale: true },
  // Estoque não acumula: o "acumulado" dele é média do que já passou.
  { key: 'offers_units_ytd_avg', group: G.ACUMULADO, type: T.NUMERO },
  { key: 'offer_area_m2_ytd_avg', group: G.ACUMULADO, type: T.NUMERO },
  { key: 'vgo_brl_million_ytd_avg', group: G.ACUMULADO, type: T.NUMERO },
  { key: 'asking_price_ytd_brl_m2', group: G.ACUMULADO, type: T.NUMERO },
  { key: 'sale_price_ytd_brl_m2', group: G.ACUMULADO, type: T.NUMERO },

  // ---------- variações ----------
  // `_pp` e `_pct_change` são grandezas DIFERENTES e nunca se misturam: +1 p.p. e +20%
  // podem descrever o mesmo movimento. Nenhuma das duas é agregável entre meses.
  { key: 'ivv_mom_pp', group: G.VARIACAO, type: T.NUMERO },
  { key: 'ivv_yoy_pp', group: G.VARIACAO, type: T.NUMERO },
  { key: 'ivv_mom_pct_change', group: G.VARIACAO, type: T.FRACAO, autoScale: true },
  { key: 'ivv_yoy_pct_change', group: G.VARIACAO, type: T.FRACAO, autoScale: true },
  ...[
    'offers_units', 'sales_units', 'launches_units', 'cancellations_units',
    'offer_area_m2', 'sold_area_m2', 'asking_price_brl_m2', 'sale_price_brl_m2',
    'vgo_brl_million', 'vgv_brl_million', 'vgl_brl_million',
  ].flatMap((base) => [
    { key: `${base}_mom_pct_change`, group: G.VARIACAO, type: T.FRACAO, autoScale: true },
    { key: `${base}_yoy_pct_change`, group: G.VARIACAO, type: T.FRACAO, autoScale: true },
  ]),
]);

/** Índice por chave. */
export const IVV_COLUMN_BY_KEY = Object.freeze(
  Object.fromEntries(IVV_COLUMNS.map((column) => [column.key, column])),
);

/** Chaves declaradas, na ordem do schema. */
export const IVV_COLUMN_KEYS = Object.freeze(IVV_COLUMNS.map((column) => column.key));

/** Colunas de uma família. */
export function ivvColumnsOfGroup(group) {
  return IVV_COLUMNS.filter((column) => column.group === group);
}

/** Percentual em ponto percentual só é conversível dentro desta faixa. */
const MAX_PERCENTAGE_POINTS = 100;

function pushWarning(warnings, code, message, detail) {
  const item = { code, message };
  if (detail !== undefined) item.detail = detail;
  warnings.push(item);
}

/**
 * Traz um percentual para a escala decimal canônica.
 *
 * A escala interna do projeto é a decimal (`0.057` = 5,7%), como o contrato do backend
 * declara. A semente `.xlsx` (schema v1.0.0) grava `6.5` — ponto percentual. Converter é
 * necessário, converter em SILÊNCIO não é aceitável: nenhuma parte deste repositório pôde
 * conferir a planilha viva, então a conversão é registrada com mês, coluna, valor original e
 * valor convertido, para o dono do repositório conferir contra a planilha em vez de confiar
 * na inferência (R5.7, R8.44, mesma família da issue #54).
 */
function toDecimalFraction(value, { column, month, warnings }) {
  const n = toNumber(value);
  if (n === null) return null;
  if (Math.abs(n) <= 1) return n;
  if (Math.abs(n) <= MAX_PERCENTAGE_POINTS) {
    const converted = n / 100;
    pushWarning(warnings, 'ESCALA_CONVERTIDA', 'escala convertida',
      { month, column, original: n, converted });
    return converted;
  }
  pushWarning(warnings, 'ESCALA_INDETERMINADA', 'escala indeterminada',
    { month, column, value: n });
  return n;
}

function coerce(column, value, context) {
  switch (column.type) {
    case T.TEXTO: return toText(value) || null;
    case T.DATA: return toDateISO(value);
    case T.INTEIRO: return toInteger(value);
    case T.BOOLEANO: return toBoolean(value);
    case T.URL: return safeExternalUrl(value); // só http/https chega à tela (R4.5)
    case T.FRACAO:
      return column.autoScale ? toDecimalFraction(value, context) : toNumber(value);
    default: return toNumber(value);
  }
}

/** Traduz os nomes do schema v1.0.0 (semente) para as chaves canônicas. */
function applyAliases(row, warnings, month) {
  const out = { ...row };
  for (const [legacy, canonical] of Object.entries(LEGACY_COLUMN_ALIASES)) {
    if (!(legacy in out)) continue;
    const legacyValue = out[legacy];
    delete out[legacy];
    if (out[canonical] !== undefined && toText(out[canonical]) !== '') continue;
    out[canonical] = legacyValue;
    pushWarning(warnings, 'COLUNA_LEGADA', 'coluna do schema v1.0.0',
      { month, legacy, canonical });
  }
  for (const [published, canonical] of Object.entries(PUBLISHED_COLUMN_ALIASES)) {
    if (!(published in out)) continue;
    const publishedValue = out[published];
    delete out[published];
    if (out[canonical] !== undefined && toText(out[canonical]) !== '') continue;
    out[canonical] = publishedValue;
  }
  return out;
}

/**
 * Normaliza uma linha da aba.
 *
 * Devolve um objeto PLANO, com as chaves canônicas — é exatamente o formato que
 * `src/ivv/aggregate.js` consome, para que a série que a tela lê e a série que o motor agrega
 * sejam a mesma coisa, e não duas leituras do mesmo dado.
 *
 * `reference_date` é o eixo temporal canônico: ordenação e filtro saem dele, nunca de
 * `period_id`. Linha sem data utilizável não vira mês — é descartada com aviso, porque um mês
 * que não se posiciona no tempo não pode ser somado nem desenhado.
 */
export function normalizeIvvMonth(row, { warnings = [] } = {}) {
  if (!row || typeof row !== 'object') return null;

  const rawDate = toDateISO(row.reference_date)
    || toDateISO(row.reference_month)
    || toDateISO(row.period_id);
  const monthLabelForWarning = rawDate ? rawDate.slice(0, 7) : (toText(row.period_id) || 'linha sem data');

  const source = applyAliases(row, warnings, monthLabelForWarning);
  if (!rawDate) {
    pushWarning(warnings, 'MES_SEM_DATA', 'linha sem data utilizável',
      { row: monthLabelForWarning });
    return null;
  }

  // O eixo canônico é normalizado para o primeiro dia do mês: a série é mensal, e uma data
  // no meio do mês faria dois recortes iguais parecerem períodos diferentes.
  const referenceDate = `${rawDate.slice(0, 7)}-01`;
  const out = { reference_date: referenceDate };

  for (const column of IVV_COLUMNS) {
    if (column.key === 'reference_date') continue;
    if (!(column.key in source)) continue;
    const value = coerce(column, source[column.key], {
      column: column.key, month: referenceDate.slice(0, 7), warnings,
    });
    if (value === null || value === '') continue;
    out[column.key] = value;
  }

  // Derivados do próprio eixo: preenchidos só quando a planilha não os trouxer, para que a
  // tela não precise recalcular data em três lugares. Nunca sobrescrevem o publicado.
  const [year, month] = referenceDate.split('-');
  if (out.year === undefined) out.year = Number(year);
  if (out.month === undefined) out.month = Number(month);
  if (out.period_id === undefined) out.period_id = `${year}-${month}`;
  if (out.quarter === undefined) out.quarter = `${year}-T${Math.ceil(Number(month) / 3)}`;

  return out;
}

/**
 * Resume os eventos por mês num aviso por assunto.
 *
 * A série tem 66 meses. Um aviso POR MÊS vira 66 linhas dizendo a mesma coisa na tela de
 * avisos, e um bloco assim não é lido por ninguém — é ruído que esconde o aviso que importa.
 * O resumo mantém a informação que permite conferir contra a planilha (coluna, quantos meses,
 * um exemplo com valor original e convertido) e descarta só a repetição.
 */
function summarizeEvents(events) {
  const warnings = [];
  const byCode = new Map();
  for (const event of events) {
    const bucket = byCode.get(event.code) || [];
    bucket.push(event);
    byCode.set(event.code, bucket);
  }

  const legacy = byCode.get('COLUNA_LEGADA');
  if (legacy) {
    const pares = [...new Map(legacy.map((e) => [e.detail.legacy, e.detail.canonical])).entries()];
    pushWarning(warnings, 'COLUNA_LEGADA',
      `IVV_MONTHLY usa ${pares.length} nome(s) do schema v1.0.0, lidos pelo nome canônico: `
      + `${pares.map(([from, to]) => `\`${from}\` → \`${to}\``).join(', ')}.`,
      { columns: Object.fromEntries(pares) });
  }

  for (const code of ['ESCALA_CONVERTIDA', 'ESCALA_INDETERMINADA']) {
    const grupo = byCode.get(code);
    if (!grupo) continue;
    const porColuna = new Map();
    for (const event of grupo) {
      const bucket = porColuna.get(event.detail.column) || [];
      bucket.push(event);
      porColuna.set(event.detail.column, bucket);
    }
    for (const [column, todos] of porColuna) {
      // Conta MESES distintos, não ocorrências: uma linha duplicada e descartada não
      // pode inflar o número que o operador vai conferir contra a planilha.
      const eventos = [...new Map(todos.map((e) => [e.detail.month, e])).values()];
      const exemplo = eventos[0].detail;
      const mensagem = code === 'ESCALA_CONVERTIDA'
        ? `\`${column}\`: ${eventos.length} mês(es) vieram em pontos percentuais e foram `
          + `convertidos para a escala decimal do projeto (ex.: ${exemplo.month}, `
          + `${exemplo.original} → ${exemplo.converted}). Confira contra a planilha.`
        : `\`${column}\`: ${eventos.length} mês(es) com valor que não é plausível nem como `
          + `fração nem como ponto percentual (ex.: ${exemplo.month}, ${exemplo.value}). `
          + 'Os valores foram mantidos como vieram e não devem ser exibidos sem conferência.';
      pushWarning(warnings, code, mensagem,
        { column, months: eventos.length, example: exemplo });
    }
  }

  const semData = byCode.get('MES_SEM_DATA');
  if (semData) {
    pushWarning(warnings, 'MES_SEM_DATA',
      `${semData.length} linha(s) de IVV_MONTHLY foram ignoradas por não terem `
      + '`reference_date` utilizável.', { rows: semData.length });
  }

  const duplicados = byCode.get('MES_DUPLICADO');
  if (duplicados) {
    const meses = duplicados.map((event) => event.detail.month.slice(0, 7));
    const amostra = meses.slice(0, 5).join(', ') + (meses.length > 5 ? `, e mais ${meses.length - 5}` : '');
    pushWarning(warnings, 'MES_DUPLICADO',
      `IVV_MONTHLY tem mais de uma linha para ${meses.length} mês(es) (${amostra}); `
      + 'a primeira de cada foi mantida.', { months: meses });
  }

  return warnings;
}

/**
 * Normaliza a aba inteira.
 *
 * @returns {{months: object[], warnings: object[], unknownColumns: string[],
 *            undeclaredDerivedColumns: string[]}}
 *   `months` ordenado por `reference_date`. `unknownColumns` nomeia coluna que este arquivo não
 *   declara e que o registro também não reconhece; `undeclaredDerivedColumns` nomeia a que o
 *   registro reconhece pela família mas o schema não declara — as duas viram aviso na tela, e
 *   juntas são o que transforma a convenção declarada aqui em algo corrigível pela primeira
 *   carga real, em vez de um palpite mudo.
 */
export function normalizeIvvMonthly(rows) {
  const events = [];
  const months = [];
  const seen = new Map();
  const unknown = new Set();
  const undeclaredDerived = new Map();
  const list = Array.isArray(rows) ? rows : [];

  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    for (const key of Object.keys(row)) {
      if (IVV_COLUMN_BY_KEY[key] || LEGACY_COLUMN_ALIASES[key] || PUBLISHED_COLUMN_ALIASES[key]) continue;
      // Coluna derivada que o registro reconhece pela família (`*_ytd`, `*_calc_*`, `*_mom_*`)
      // MAS que este schema não declara é o caso mais traiçoeiro dos dois: ela não é lida, e
      // reconhecer a família sem avisar a esconderia justamente de quem precisa vê-la. É por
      // aqui que o nome real de um `*_ytd` aparece — e é o que transforma a convenção
      // declarada neste arquivo em verificação (R5.7).
      const info = classifyColumn(key);
      if (info.role !== COLUMN_ROLES.DESCONHECIDO) {
        undeclaredDerived.set(key, info);
        continue;
      }
      unknown.add(key);
    }

    const month = normalizeIvvMonth(row, { warnings: events });
    if (!month) continue;
    if (seen.has(month.reference_date)) {
      pushWarning(events, 'MES_DUPLICADO', 'mês duplicado', { month: month.reference_date });
      continue;
    }
    seen.set(month.reference_date, true);
    months.push(month);
  }

  months.sort((a, b) => (a.reference_date < b.reference_date ? -1
    : a.reference_date > b.reference_date ? 1 : 0));

  const warnings = summarizeEvents(events);

  if (undeclaredDerived.size > 0) {
    const itens = [...undeclaredDerived.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    pushWarning(warnings, 'DERIVADA_NAO_DECLARADA',
      `IVV_MONTHLY publica ${itens.length} coluna(s) derivada(s) que o contrato não declara e `
      + `que por isso NÃO são lidas: ${itens.map(([key, info]) => `\`${key}\` (${info.role} de `
      + `\`${info.canonicalKey}\`)`).join(', ')}. Se alguma delas for o acumulado do ano, `
      + 'declare o nome real em src/ivv/metrics.js (`ytdColumn`), no normalizador e no contrato.',
      { columns: itens.map(([key, info]) => ({ column: key, role: info.role, base: info.canonicalKey })) });
  }

  const unknownColumns = [...unknown].sort();
  if (unknownColumns.length > 0) {
    pushWarning(warnings, 'COLUNA_NAO_DECLARADA',
      `IVV_MONTHLY trouxe coluna que o contrato não declara: ${unknownColumns.join(', ')}. `
      + 'O dado foi ignorado; declare a coluna em src/ivv/normalize-ivv.js, em '
      + 'docs/DATA_CONTRACT.md e — se for métrica — em src/ivv/metrics.js.',
      { columns: unknownColumns });
  }

  return {
    months, warnings, unknownColumns,
    undeclaredDerivedColumns: [...undeclaredDerived.keys()].sort(),
  };
}

/** Último mês da série. `is_latest_period` do backend vence a ordem, quando publicado. */
export function latestIvvMonth(months) {
  const list = Array.isArray(months) ? months : [];
  if (list.length === 0) return null;
  return list.find((month) => month.is_latest_period === true) || list[list.length - 1];
}
