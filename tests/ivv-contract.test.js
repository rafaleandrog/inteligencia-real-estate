// Triângulo do IVV_MONTHLY: registro ↔ normalizador ↔ contrato.
//
// `tests/contract.test.js` cruza `Code.gs` × contrato × normalizador. Para IVV_MONTHLY falta a
// primeira ponta: a aba não tem `REQUIRED_HEADERS`, `MANAGED_EXTENSION_SHEETS` nem `FIELD_SCHEMA`
// no Apps Script — nem na v2.2.1. Sem lado servidor, a rede é o triângulo entre as três fontes que
// existem, e ele precisa fechar nos TRÊS sentidos: contrato → normalizador, normalizador →
// contrato, e métrica → registro. Fechar dois deixa exatamente o buraco que a #68 explorou.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readXlsx } from '../tools/xlsx.mjs';
import { createAppsScriptSandbox } from './helpers/appsScriptSandbox.mjs';
import { SCHEMA_SHEETS } from './helpers/schema.mjs';
import {
  DATASET_PERCENT_SCALE, PERCENT_SCALES, percentFromDecimal, formatPercent,
} from '../src/format.js';
import {
  IVV_COLUMNS, IVV_COLUMN_KEYS, IVV_COLUMN_BY_KEY, IVV_COLUMN_GROUPS, ivvColumnsOfGroup,
  normalizeIvvMonthly, normalizeIvvMonth, latestIvvMonth,
} from '../src/ivv/normalize-ivv.js';
import {
  METRIC_BY_KEY, METRIC_KEYS, LEGACY_COLUMN_ALIASES, classifyColumn, COLUMN_ROLES,
} from '../src/ivv/metrics.js';
import { aggregatePeriod } from '../src/ivv/aggregate.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const contractMd = read('../docs/DATA_CONTRACT.md');
const seed = () => readXlsx(readFileSync(
  new URL('../migration/imob-intelligence-backend.xlsx', import.meta.url),
));

/** A seção do contrato dedicada à aba, do título até o próximo `###`. */
function ivvSection() {
  const start = contractMd.indexOf('### IVV_MONTHLY');
  assert.notEqual(start, -1, 'docs/DATA_CONTRACT.md precisa ter a seção `### IVV_MONTHLY`');
  const rest = contractMd.slice(start + 3);
  const end = rest.indexOf('\n### ');
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * Colunas declaradas na seção: só a PRIMEIRA célula de linha de tabela.
 *
 * Ler todo texto entre crases pegaria `src/ivv/metrics.js`, `0.057` e `R8.53` junto, e o teste
 * passaria a afirmar sobre a prosa em vez de sobre o schema — um guard que interroga a fonte
 * errada não é guard (R8.46).
 */
function contractColumnsOfSection() {
  const columns = [];
  for (const line of ivvSection().split('\n')) {
    const match = /^\|\s*`([a-z0-9_]+)`\s*\|/.exec(line);
    if (match) columns.push(match[1]);
  }
  return columns;
}

// --------------------------------------------------------------------------------------
// Sentido 1 — normalizador → contrato
// --------------------------------------------------------------------------------------

test('toda coluna do normalizador está declarada no contrato', () => {
  const declaradas = new Set(contractColumnsOfSection());
  const faltando = IVV_COLUMN_KEYS.filter((key) => !declaradas.has(key));
  assert.deepEqual(faltando, [],
    'coluna lida pelo normalizador e ausente de docs/DATA_CONTRACT.md: schema mudou em silêncio (R3.2)');
});

// --------------------------------------------------------------------------------------
// Sentido 2 — contrato → normalizador
// --------------------------------------------------------------------------------------

test('toda coluna declarada no contrato existe no normalizador', () => {
  const doContrato = contractColumnsOfSection();
  assert.ok(doContrato.length >= 80, `a seção deveria declarar as colunas; achou ${doContrato.length}`);
  // A seção também documenta os nomes do schema v1.0.0, que o normalizador lê via alias:
  // eles são código lido, não prosa, e por isso contam como declaração legítima.
  const sobrando = doContrato.filter(
    (key) => !IVV_COLUMN_BY_KEY[key] && !LEGACY_COLUMN_ALIASES[key],
  );
  assert.deepEqual(sobrando, [],
    'coluna documentada que nenhum código lê — documentação que descreve algo que não existe');

  const canonicas = doContrato.filter((key) => !LEGACY_COLUMN_ALIASES[key]);
  assert.equal(new Set(canonicas).size, canonicas.length, 'coluna repetida nas tabelas do contrato');
});

test('a tabela de aliases do contrato é exatamente LEGACY_COLUMN_ALIASES', () => {
  // Quarto fecho: a tradução documentada e a tradução executada precisam ser a mesma. Uma
  // tabela de-para que envelhece é pior que nenhuma — ela afirma um comportamento que sumiu.
  const documentados = {};
  for (const line of ivvSection().split('\n')) {
    const match = /^\|\s*`([a-z0-9_]+)`\s*\|\s*`([a-z0-9_]+)`\s*\|\s*$/.exec(line);
    if (match) documentados[match[1]] = match[2];
  }
  assert.deepEqual(documentados, { ...LEGACY_COLUMN_ALIASES });
});

// --------------------------------------------------------------------------------------
// Sentido 3 — métrica → registro
// --------------------------------------------------------------------------------------

test('toda métrica numérica do normalizador tem entrada no registro, e vice-versa', () => {
  const doNormalizador = ivvColumnsOfGroup(IVV_COLUMN_GROUPS.METRICA).map((c) => c.key).sort();
  assert.deepEqual(doNormalizador, [...METRIC_KEYS].sort(),
    'o grupo `metrica` do normalizador e o registro de src/ivv/metrics.js precisam ser o MESMO conjunto');
});

test('nenhuma coluna de outro grupo é métrica agregável por acidente', () => {
  for (const column of IVV_COLUMNS) {
    if (column.group === IVV_COLUMN_GROUPS.METRICA) continue;
    assert.equal(METRIC_BY_KEY[column.key], undefined,
      `${column.key} está no grupo ${column.group} mas é métrica do registro — decida qual dos dois`);
  }
});

test('toda coluna derivada declarada resolve para uma métrica do registro', () => {
  // É o que impede `sales_unit_ytd` (erro de digitação) de entrar como se fosse derivada real.
  const derivados = [IVV_COLUMN_GROUPS.DERIVADA, IVV_COLUMN_GROUPS.ACUMULADO, IVV_COLUMN_GROUPS.VARIACAO];
  const soltas = [];
  for (const column of IVV_COLUMNS) {
    if (!derivados.includes(column.group)) continue;
    const info = classifyColumn(column.key);
    if (info.role === COLUMN_ROLES.DESCONHECIDO) { soltas.push(column.key); continue; }
    if (!info.canonicalKey) continue;
    assert.ok(METRIC_BY_KEY[info.canonicalKey], `${column.key} → ${info.canonicalKey} fora do registro`);
  }
  // Ticket e área média não derivam de nenhuma métrica do registro: são colunas próprias, e a
  // lista é fechada para que uma coluna nova não entre aqui de carona.
  assert.deepEqual(soltas.sort(), [
    'avg_offer_area_m2', 'avg_offer_ticket_brl', 'avg_sale_ticket_brl', 'avg_sold_area_m2',
  ]);
});

test('a coluna de acumulado que cada métrica declara está no contrato e no normalizador', () => {
  // Se `ytdColumn` apontar para um nome que ninguém declarou, o atalho de acumulado do motor
  // fica inerte para sempre e o sintoma é nenhum (R8.56).
  const declaradas = new Set(contractColumnsOfSection());
  for (const key of METRIC_KEYS) {
    const metric = METRIC_BY_KEY[key];
    if (!metric.ytdColumn) continue;
    assert.ok(IVV_COLUMN_BY_KEY[metric.ytdColumn], `${key}: ytdColumn ${metric.ytdColumn} fora do normalizador`);
    assert.ok(declaradas.has(metric.ytdColumn), `${key}: ytdColumn ${metric.ytdColumn} fora do contrato`);
    assert.equal(classifyColumn(metric.ytdColumn).canonicalKey, key);
  }
});

// --------------------------------------------------------------------------------------
// A ponta que NÃO existe — verificada, não presumida
// --------------------------------------------------------------------------------------

test('IVV_MONTHLY continua sem contrato no Code.gs — e o dia em que ganhar, este teste cobra', () => {
  const { context } = createAppsScriptSandbox();

  assert.ok(context.OPTIONAL_SHEETS.includes('IVV_MONTHLY'), 'a aba precisa ser opcional no backend');
  assert.ok(!context.REQUIRED_SHEETS.includes('IVV_MONTHLY'), 'nunca obrigatória');

  // O motivo de existir um triângulo em vez do cruzamento normal. Quando qualquer uma destas
  // três asserções cair, a aba passou a ter lado servidor: mova-a para `OPTIONAL_SCHEMA_SHEETS`
  // em tests/helpers/schema.mjs e cobre dela o mesmo que se cobra das outras.
  assert.equal(context.REQUIRED_HEADERS.IVV_MONTHLY, undefined,
    'IVV_MONTHLY ganhou REQUIRED_HEADERS: agora dá para cruzar contrato × Code.gs, e é o que se deve fazer');
  assert.ok(!(context.MANAGED_EXTENSION_SHEETS || []).includes('IVV_MONTHLY'));
  assert.equal((context.FIELD_SCHEMA || {}).IVV_MONTHLY, undefined);

  // E ela não pode entrar pela porta lateral das listas de schema do teste de contrato.
  assert.ok(!SCHEMA_SHEETS.includes('IVV_MONTHLY'),
    'enquanto não houver REQUIRED_HEADERS, IVV_MONTHLY fica fora de SCHEMA_SHEETS');
});

// --------------------------------------------------------------------------------------
// Semente: o que dá para observar, e o que continua sendo convenção
// --------------------------------------------------------------------------------------

test('toda coluna da semente é lida — pelo nome canônico ou pelo alias declarado', () => {
  const headers = seed().IVV_MONTHLY.headers;
  assert.equal(headers.length, 18, 'a semente v1.0.0 tem 18 colunas em IVV_MONTHLY');
  const perdidas = headers.filter(
    (h) => !IVV_COLUMN_BY_KEY[h] && !LEGACY_COLUMN_ALIASES[h],
  );
  assert.deepEqual(perdidas, [], 'coluna da semente que o normalizador descartaria em silêncio');
});

test('a semente NÃO confirma nenhuma coluna derivada — e o contrato diz isso', () => {
  // Verificação honesta do limite: se um dia a semente for reexportada com colunas `_ytd`, este
  // teste quebra e obriga a atualizar o texto que hoje afirma que elas são convenção.
  const headers = seed().IVV_MONTHLY.headers;
  const derivadas = headers.filter((h) => /(_ytd|_calc|_diff|_mom|_yoy|variance|check)/i.test(h));
  assert.deepEqual(derivadas, [],
    'a semente passou a ter coluna derivada: confirme os nomes reais e corrija a seção do contrato');
  assert.match(ivvSection(), /\*\*convenção\*\*/,
    'o contrato precisa marcar explicitamente o que é convenção não verificada');
});

test('os nomes observados em IVV_REGION estão declarados como observados', () => {
  const naRegiao = seed().IVV_REGION.headers;
  for (const key of ['ivv_pct_check', 'ivv_variance_pp']) {
    assert.ok(naRegiao.includes(key), `${key} deveria existir em IVV_REGION`);
    assert.equal(IVV_COLUMN_BY_KEY[key].observed, 'IVV_REGION');
    assert.equal(classifyColumn(key).canonicalKey, 'ivv_pct');
  }
});

// --------------------------------------------------------------------------------------
// O normalizador na prática
// --------------------------------------------------------------------------------------

test('a linha real da semente atravessa o normalizador e chega agregável ao motor', () => {
  const rows = seed().IVV_MONTHLY.rows;
  const { months, warnings } = normalizeIvvMonthly(rows);
  assert.equal(months.length, 1);

  const mes = months[0];
  assert.equal(mes.reference_date, '2026-05-01', '`reference_date` é o eixo canônico, no dia 1º');
  assert.equal(mes.period_id, '2026-05');
  assert.equal(mes.quarter, '2026-T2');
  assert.equal(mes.offers_units, 6325, 'alias `offered_units` traduzido');
  assert.equal(mes.sales_units, 414);
  assert.equal(mes.launches_developments, 2, 'alias `launched_projects` traduzido');
  assert.equal(mes.asking_price_brl_m2, 14018.62);
  assert.equal(mes.ivv_pct, 0.065, '6.5 pontos percentuais viram 0.065 na escala decimal');

  const codigos = warnings.map((w) => w.code);
  assert.ok(codigos.includes('ESCALA_CONVERTIDA'), 'conversão de escala nunca é silenciosa');
  assert.ok(codigos.includes('COLUNA_LEGADA'), 'tradução de alias nunca é silenciosa');

  // E o resultado é exatamente o que o motor da B2 consome, sem adaptador no meio.
  const agregado = aggregatePeriod(months);
  assert.equal(agregado.period.months, 1);
  assert.equal(agregado.values.ivv_pct.value, 0.065);
  assert.equal(agregado.values.offers_units.value, 6325);
  assert.deepEqual(agregado.unsupported, {}, 'mês único não recusa métrica nenhuma');
});

test('coluna que a aba trouxer e o contrato não declarar é NOMEADA no aviso', () => {
  // É o mecanismo que transforma as 63 colunas de convenção em algo que a primeira carga real
  // corrige, em vez de palpite mudo. O aviso vai para `warnings`, que a tela renderiza.
  const { warnings } = normalizeIvvMonthly([
    { reference_date: '2026-01-01', ivv_pct: 0.05, indicador_novo_units: 7, outra_coisa: 'x' },
  ]);
  const aviso = warnings.find((w) => w.code === 'COLUNA_NAO_DECLARADA');
  assert.ok(aviso);
  assert.match(aviso.message, /indicador_novo_units/);
  assert.match(aviso.message, /outra_coisa/);
  assert.deepEqual(aviso.detail.columns, ['indicador_novo_units', 'outra_coisa']);
  assert.match(aviso.message, /docs\/DATA_CONTRACT\.md/, 'o aviso precisa dizer onde declarar');
});

test('66 meses não produzem 66 avisos iguais', () => {
  // Um aviso por mês vira um bloco que ninguém lê — e o ruído esconde o aviso que importa.
  const rows = Array.from({ length: 66 }, (_, i) => ({
    reference_date: `${2021 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`,
    ivv_pct: 5.7, offered_units: 6000, sold_units: 342,
  }));
  const { months, warnings } = normalizeIvvMonthly(rows);
  assert.equal(months.length, 66);
  assert.ok(warnings.length <= 4, `esperado resumo por assunto, veio ${warnings.length} avisos`);
  const escala = warnings.find((w) => w.code === 'ESCALA_CONVERTIDA');
  assert.match(escala.message, /66 mês\(es\)/, 'o resumo precisa dizer quantos meses');
  assert.equal(escala.detail.months, 66);
});

test('aba vazia, ausente ou suja não derruba nada (R2.5, R2.6)', () => {
  for (const entrada of [[], null, undefined, [null, 'texto', 42]]) {
    const { months, warnings, unknownColumns } = normalizeIvvMonthly(entrada);
    assert.deepEqual(months, []);
    assert.deepEqual(unknownColumns, []);
    assert.ok(Array.isArray(warnings));
  }
  assert.equal(normalizeIvvMonth(null), null);
  assert.equal(latestIvvMonth([]), null);
  assert.equal(latestIvvMonth(undefined), null);
});

test('a série sai ordenada por reference_date, e is_latest_period vence a ordem', () => {
  const { months } = normalizeIvvMonthly([
    { reference_date: '2026-03-01', ivv_pct: 0.05 },
    { reference_date: '2026-01-01', ivv_pct: 0.04, is_latest_period: 'sim' },
    { reference_date: '2026-02-01', ivv_pct: 0.06 },
  ]);
  assert.deepEqual(months.map((m) => m.period_id), ['2026-01', '2026-02', '2026-03']);
  assert.equal(latestIvvMonth(months).period_id, '2026-01',
    '`is_latest_period` publicado vence a posição na série');
});

test('source_url só chega à tela com esquema http/https (R4.4, R4.5)', () => {
  const [mes] = normalizeIvvMonthly([{
    reference_date: '2026-01-01', source_url: 'javascript:alert(1)', source_publisher: 'X',
  }]).months;
  assert.equal(mes.source_url, undefined, 'esquema perigoso não sobrevive ao normalizador');

  const [ok] = normalizeIvvMonthly([{
    reference_date: '2026-01-01', source_url: 'https://exemplo.org/rel.pdf',
  }]).months;
  assert.equal(ok.source_url, 'https://exemplo.org/rel.pdf');
});

// --- Coluna derivada que o contrato não declara (issue #56) -------------------------
//
// É o caso mais traiçoeiro dos dois. O registro RECONHECE a família pelo padrão do nome
// (`*_ytd`, `*_calc_*`, `*_mom_*`), então a coluna não cai em "desconhecida" — e sem
// aviso próprio ela seria descartada por um caminho que parece tratamento. O nome real
// de um `*_ytd` na planilha viva só aparece por aqui, e é ele que transforma a convenção
// declarada no código em verificação.

test('derivada reconhecida pela família mas não declarada vira aviso, não descarte mudo', () => {
  const { warnings } = normalizeIvvMonthly([{
    reference_date: '2024-01-01', geography_scope: 'DF',
    sales_units: 100, offers_units: 2000,
    // Nome que o registro RECONHECE como acumulado do IVV (`ivv_*_ytd_*_pct`) mas que o
    // contrato não declara — `ytdColumn` é `ivv_ytd_pct`. Se a planilha viva publicar o
    // acumulado com ESTE nome, o motor nunca o acha e recalcula em silêncio: valor
    // plausível, a poucos centésimos do publicado, exatamente o defeito da #68.
    ivv_ytd_total_pct: 0.058,
  }]);

  const aviso = warnings.find((w) => w.code === 'DERIVADA_NAO_DECLARADA');
  assert.ok(aviso, 'coluna derivada não declarada passou sem aviso');
  assert.match(aviso.message, /ivv_ytd_total_pct/);
  assert.match(aviso.message, /NÃO são lidas/);
  // O aviso precisa dizer o que fazer, não só que algo está errado.
  assert.match(aviso.message, /ytdColumn/);
  assert.deepEqual(aviso.detail.columns.map((c) => c.column), ['ivv_ytd_total_pct']);
  // O aviso diz de QUAL métrica ela é acumulado — sem isso, quem lê não sabe onde
  // declarar o nome.
  assert.equal(aviso.detail.columns[0].base, 'ivv_pct');
});

test('derivada não declarada NÃO é confundida com coluna desconhecida', () => {
  // Os dois avisos existem porque as causas são diferentes: uma coluna inteiramente nova
  // pede declaração de schema; uma derivada reconhecida pede que alguém confirme se ela é
  // o acumulado que o motor procura. Juntar os dois num aviso só apagaria essa diferença.
  const { warnings } = normalizeIvvMonthly([{
    reference_date: '2024-01-01', geography_scope: 'DF',
    ivv_ytd_total_pct: 0.058,
    coluna_totalmente_nova: 42,
  }]);

  const derivada = warnings.find((w) => w.code === 'DERIVADA_NAO_DECLARADA');
  const desconhecida = warnings.find((w) => w.code === 'COLUNA_NAO_DECLARADA');
  assert.ok(derivada && desconhecida, 'os dois avisos precisam coexistir');
  assert.equal(/coluna_totalmente_nova/.test(derivada.message), false);
  assert.equal(/ivv_ytd_total_pct/.test(desconhecida.message), false);
  assert.match(desconhecida.message, /coluna_totalmente_nova/);
});

test('coluna derivada DECLARADA não gera aviso nenhum', () => {
  // O aviso não pode disparar para o que o contrato já conhece, senão vira ruído de
  // fundo e ninguém lê o dia em que ele importar.
  const { warnings } = normalizeIvvMonthly([{
    reference_date: '2024-01-01', geography_scope: 'DF',
    sales_units: 100, offers_units: 2000, ivv_pct: 0.05,
    sales_units_ytd: 100, ivv_ytd_pct: 0.05,
  }]);
  assert.equal(warnings.some((w) => w.code === 'DERIVADA_NAO_DECLARADA'), false,
    JSON.stringify(warnings.map((w) => w.code)));
  assert.equal(warnings.some((w) => w.code === 'COLUNA_NAO_DECLARADA'), false);
});

test('a escala canônica declarada em format.js é a que o normalizador produz', () => {
  // As duas camadas foram escritas em PRs diferentes. Se discordassem, o IVV apareceria
  // 100× errado na tela e cada arquivo pareceria certo sozinho — é a R8.44 e a R8.60.
  assert.equal(DATASET_PERCENT_SCALE.IVV_MONTHLY, PERCENT_SCALES.DECIMAL);

  const { months } = normalizeIvvMonthly([{
    reference_date: '2024-01-01', geography_scope: 'DF', ivv_pct: 0.057,
  }]);
  assert.equal(months[0].ivv_pct, 0.057, 'o normalizador deixou de guardar em escala decimal');
  assert.equal(formatPercent(percentFromDecimal(months[0].ivv_pct)), '5,7%');
});
