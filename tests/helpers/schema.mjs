import { createAppsScriptSandbox } from './appsScriptSandbox.mjs';

/**
 * Abas obrigatórias da V1: ausência de qualquer uma é erro legível na tela (R2.5).
 */
export const REQUIRED_SHEETS = ['LISTINGS', 'DEVELOPMENTS', 'ANCHORS'];

/**
 * Abas **opcionais** que ganharam contrato de cabeçalho no Apps Script v2.0.0.
 *
 * Ter `REQUIRED_HEADERS` não as promove a obrigatórias: continuam sendo aba cuja
 * ausência é aviso, nunca erro. O que `REQUIRED_HEADERS` diz sobre elas é "se a aba
 * existir, estes são os cabeçalhos" — e é `setupProject()` quem as cria.
 */
export const OPTIONAL_SCHEMA_SHEETS = ['RA_PROFILES', 'POLYGONS'];

/**
 * Todas as abas com contrato de cabeçalho declarado — o domínio de `REQUIRED_HEADERS`.
 *
 * Antes da v2.0.0 este conceito coincidia com "abas obrigatórias" e havia uma constante
 * só. São coisas diferentes: uma fala de criticidade (o que derruba a aplicação), a
 * outra de schema (o que tem cabeçalho contratado).
 */
export const SHEETS = [...REQUIRED_SHEETS, ...OPTIONAL_SCHEMA_SHEETS];

/**
 * Abas com contrato de cabeçalho **só no backend** (Apps Script v2.2.1, issue #50).
 *
 * Elas existem em `REQUIRED_HEADERS` porque a sincronização rodoviária as cria e as
 * preenche, mas ainda não têm normalizador em `src/normalize.js` — a camada de tráfego
 * no cliente é trabalho separado. Ficam fora de `SHEETS` porque as travas de
 * `tests/contract.test.js` que valem para `SHEETS` (contrato ↔ normalizador ↔ semente)
 * exigem justamente o normalizador que ainda não existe.
 *
 * Isto **não é uma exceção permanente**: no dia em que a aba ganhar normalizador, ela
 * migra para `OPTIONAL_SCHEMA_SHEETS` e passa a ser cobrada como todas as outras. Até
 * lá, `tests/contract.test.js` cobra delas o que dá para cobrar sem cliente: cabeçalho
 * não vazio, chave primária declarada, aba opcional e gerenciada, e ausência de qualquer
 * caminho de erro fatal.
 */
export const BACKEND_SCHEMA_SHEETS = ['ROAD_SEGMENTS', 'ROAD_SEGMENT_ALIASES', 'TRAFFIC_DAILY_TEST'];

/** Domínio completo de `REQUIRED_HEADERS` no Code.gs. */
export const SCHEMA_SHEETS = [...SHEETS, ...BACKEND_SCHEMA_SHEETS];

/**
 * O delta entre a semente congelada e o schema em vigor.
 *
 * `migration/imob-intelligence-backend.xlsx` é um bootstrap histórico de uma vez só
 * (ver `migration/README.md`), não um espelho do schema. O Apps Script v2.0.0 passou a
 * **provisionar** colunas e abas via `ensureHeaders_()`, então a planilha viva tem coisas
 * que a semente nunca teve — e isso é o comportamento correto, não uma divergência a
 * corrigir.
 *
 * Esta lista NÃO é uma lista de exceções. `tests/contract.test.js` exige que cada entrada
 * esteja de fato **ausente** da semente, **presente** em `REQUIRED_HEADERS` e
 * **documentada** na tabela "Provisionamento pós-semente" do `docs/DATA_CONTRACT.md`.
 * No dia em que alguém reexportar a planilha, o teste obriga a lista a encolher.
 */
export const POST_SEED_COLUMNS = {
  LISTINGS: ['regularization_status'],
  DEVELOPMENTS: ['building_orientation', 'regularization_status', 'sales_stage'],
  ANCHORS: ['brand_name', 'group', 'occupied_area_m2', 'segment'],
  RA_PROFILES: [
    'income_per_capita_brl',
    'population_age_0_14_pct',
    'population_age_15_29_pct',
    'population_age_30_44_pct',
    'population_age_45_59_pct',
    'population_age_60_plus_pct',
    // Issue #50: as três primeiras vêm do limite oficial do GeoPortal; o resto é perfil
    // PDAD que a sincronização deixa preparado mesmo quando ainda não há dado publicado.
    'ra_code',
    'ra_number',
    'area_km2',
    'average_age',
    'female_pct',
    'male_pct',
    'households_total',
    'avg_household_size',
    'dominant_dwelling_type',
    'dominant_dwelling_type_pct',
    'dominant_tenure',
    'dominant_tenure_pct',
    'deed_registered_pct',
    'profile_reference_year',
    'profile_status',
    'profile_source_url',
    'geometry_source_url',
    'created_after_pdad_2024',
    'predecessor_ra',
    'legal_reference',
    'quality_flag',
    'notes',
  ],
};

/** Abas inteiras que só existem depois de `setupProject()`. */
export const POST_SEED_SHEETS = [
  'POLYGONS', 'ROAD_SEGMENTS', 'ROAD_SEGMENT_ALIASES', 'TRAFFIC_DAILY_TEST',
];

/**
 * Lê a tabela "Provisionamento pós-semente" do contrato, no mesmo formato que
 * `POST_SEED_COLUMNS`/`POST_SEED_SHEETS` produzem. Aba inteira é marcada com `'*'`.
 */
export function postSeedFromContract(md) {
  const start = md.indexOf('## Provisionamento pós-semente');
  if (start === -1) throw new Error('seção "Provisionamento pós-semente" ausente do DATA_CONTRACT.md');
  const section = md.slice(start).split(/\n(?=#{1,6} )/)[0];

  const out = {};
  for (const line of section.split('\n')) {
    const m = line.match(/^\|\s*`([A-Z_]+)`\s*\|\s*(.+?)\s*\|/);
    if (!m) continue;
    const [, sheet, rawColumn] = m;
    const column = rawColumn.replace(/[`*]/g, '').trim();
    // "(aba inteira)" marca uma aba que não existe na semente.
    const value = /aba inteira/i.test(column) ? '*' : column;
    (out[sheet] ||= []).push(value);
  }
  for (const sheet of Object.keys(out)) out[sheet].sort();
  return out;
}

/** Campos que cada normalizador lê de fato. spatialQuality lê os dois de qualidade. */
export function fieldsReadByNormalizers(src) {
  const fns = {
    LISTINGS: 'normalizeListing',
    DEVELOPMENTS: 'normalizeDevelopment',
    ANCHORS: 'normalizeAnchor',
    RA_PROFILES: 'normalizeRaProfile',
    POLYGONS: 'normalizePolygon',
  };
  const out = {};
  for (const [sheet, fn] of Object.entries(fns)) {
    const start = src.indexOf(`export function ${fn}`);
    if (start === -1) throw new Error(`normalizador ausente em src/normalize.js: ${fn}`);
    const body = src.slice(start, src.indexOf('\n}', start));
    out[sheet] = new Set([...body.matchAll(/row\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));

    // `spatialQuality(row)` mora fora dos corpos das funções, então estes dois nunca
    // aparecem na varredura textual. Só valem para as três abas de registro plotável:
    // RA_PROFILES e POLYGONS não têm coordenada, logo não têm qualidade espacial.
    if (REQUIRED_SHEETS.includes(sheet)) {
      out[sheet].add('confidence_flag');
      out[sheet].add('coordinate_precision');
    }
  }
  return out;
}

/**
 * Tabelas do contrato: todas as colunas e as marcadas como obrigatórias.
 *
 * A seção de uma aba termina no **próximo heading de qualquer nível**, não só no
 * próximo `###`. Separar apenas por `\n### ` fazia a seção de ANCHORS engolir tudo que
 * viesse depois dela até o próximo `###` — inclusive a tabela de `## Abas opcionais`,
 * cujos nomes de aba (`PRIMARY_OFFERS`, `IVV_MONTHLY`, `IVV_REGION`, `RA_PROFILES`)
 * entravam em `all.ANCHORS` como se fossem colunas de ANCHORS.
 *
 * Era inofensivo por acidente: nenhum deles é marcado obrigatório nem lido por
 * normalizador, então a interseção de `expectedRequiredHeaders()` os descartava. Mas
 * `all` é justamente a lista que autoriza um campo a virar cabeçalho exigido — uma
 * tabela nova colocada no lugar errado passaria a poder exigir coluna da aba errada.
 */
export function contractColumns(md) {
  const all = {}; const required = {};
  for (const chunk of md.split(/\n(?=#{1,6} )/)) {
    if (!chunk.startsWith('### ')) continue;
    const section = chunk.slice(4);
    const name = section.split(/[ \n—]/)[0].trim();
    if (!SHEETS.includes(name)) continue;
    all[name] = new Set(); required[name] = new Set();
    for (const line of section.split('\n')) {
      const m = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
      if (!m) continue;
      const field = m[1].replace(/\*/g, '');
      const obrig = m[3].replace(/\*/g, '').trim().toLowerCase();
      if (!field.includes('`')) continue;
      for (const part of field.split(/[\/,]/)) {
        const f = part.replace(/[`\s]/g, '');
        if (!f) continue;
        all[name].add(f);
        if (obrig === 'sim' || obrig === 'derivado') required[name].add(f);
      }
    }
  }
  return { all, required };
}

/**
 * Cabeçalhos que a validação do Apps Script deve exigir.
 *
 * União do que o contrato marca como obrigatório com o que os normalizadores leem,
 * intersectada com as colunas que o contrato declara para aquela aba — sem a
 * interseção, `coordinate_precision` seria exigido em DEVELOPMENTS, que não tem essa
 * coluna, e a validação acusaria erro numa planilha correta.
 */
export function expectedRequiredHeaders(normalizeSrc, contractMd) {
  const read = fieldsReadByNormalizers(normalizeSrc);
  const { all, required } = contractColumns(contractMd);
  const out = {};
  for (const sheet of SHEETS) {
    out[sheet] = [...new Set([...required[sheet], ...read[sheet]])]
      .filter((f) => all[sheet].has(f))
      .sort();
  }
  return out;
}

/**
 * Lê o `REQUIRED_HEADERS` do Code.gs **executando o arquivo**, não casando padrão nele.
 *
 * A versão anterior era um par de regexes sobre o texto (`/var REQUIRED_HEADERS = \{…\n\};/`
 * e `/(\w+):\s*\[([\s\S]*?)\]/g`). Isso impunha ao Code.gs um formato que nenhuma outra
 * parte do projeto impõe — `var` e não `const`, aspas simples e não duplas, nenhum `]`
 * dentro de comentário no bloco — e falhava de formas silenciosas: um `// POLYGONS: ['a']`
 * comentado vira chave de verdade, e aspas duplas devolvem lista vazia sem erro.
 *
 * `tests/admin-schema.test.js` já lê `context.WRITE_ALLOWLIST` do mesmo arquivo pelo
 * sandbox `vm`. Ler daqui também é o mesmo custo, é o valor que o Apps Script realmente
 * vai usar, e some com a classe de fragilidade inteira — justo quando o bloco dobra de
 * tamanho na v2.0.0.
 */
export function declaredRequiredHeaders() {
  const { context } = createAppsScriptSandbox();
  const out = {};
  for (const [sheet, headers] of Object.entries(context.REQUIRED_HEADERS)) {
    out[sheet] = [...headers].sort();
  }
  return out;
}
