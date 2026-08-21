/**
 * Imob Intelligence — camada de operação, automação, validação e governança.
 *
 * Este script NÃO é o ponto de leitura da aplicação. O site lê a planilha direto
 * via Google Visualization Query enquanto isso for simples e confiável; aqui ficam
 * setup, validação, log de mudanças, versionamento de dataset e manutenção.
 *
 * Prioridade de projeto: correção → idempotência → segurança → observabilidade →
 * simplicidade. Ver .agents/skills/imob-appscript/SKILL.md.
 *
 * Instalação:
 *   1. Extensões → Apps Script na planilha
 *   2. Cole este arquivo
 *   3. Execute setupProject() uma vez
 *   4. Execute validateAll()
 *   5. Execute installTriggers()
 *   6. Para habilitar a área administrativa (escrita), defina ADMIN_TOKEN em Script
 *      Properties — ver docs/SHEET_SETUP.md §8. Sem ele, doPost() recusa toda escrita.
 */

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

var APP_VERSION = '1.0.0';

/** Abas obrigatórias da V1. Ausência é erro crítico. */
var REQUIRED_SHEETS = ['LISTINGS', 'DEVELOPMENTS', 'ANCHORS'];

/** Abas previstas para as próximas fases. Ausência é aviso, nunca erro. */
var OPTIONAL_SHEETS = ['PRIMARY_OFFERS', 'IVV_MONTHLY', 'IVV_REGION', 'RA_PROFILES'];

/** Abas operacionais mantidas por este script. */
var META_SHEET = 'APP_META';
var QUALITY_SHEET = 'DATA_QUALITY';
var CHANGELOG_SHEET = 'CHANGE_LOG';

var OPERATIONAL_HEADERS = {
  APP_META: ['key', 'value', 'updated_at'],
  DATA_QUALITY: ['severity', 'sheet', 'row', 'record_id', 'field', 'code', 'message', 'detected_at'],
  /**
   * `correlation_id`, `result` e `error_reason` foram acrescentadas na issue #5 para
   * cobrir o pedido de auditoria da API de escrita ("timestamp; aba; operação;
   * intervalo/campos; record_id; valor anterior; valor novo; editor; correlation_id;
   * resultado; motivo de erro"). Só o gatilho de edição manual (`logChange_`) e o
   * caminho de sucesso da API de escrita preenchem as 7 colunas antigas sem as novas
   * três — `appendChangeLogRow_` aceita linha com 7 ou 10 células, então planilhas já
   * provisionadas com o cabeçalho antigo continuam funcionando até `upgradeChangeLogHeader_()`
   * rodar (ver setupProject()).
   */
  CHANGE_LOG: [
    'timestamp', 'sheet', 'range', 'record_id', 'old_value', 'new_value', 'editor',
    'correlation_id', 'result', 'error_reason'
  ]
};

/** Cabeçalho do CHANGE_LOG antes da issue #5 — usado só por upgradeChangeLogHeader_(). */
var CHANGE_LOG_HEADERS_V1 = ['timestamp', 'sheet', 'range', 'record_id', 'old_value', 'new_value', 'editor'];

/** Coluna que identifica o registro em cada aba de dados. */
var ID_FIELD = {
  LISTINGS: 'listing_id',
  DEVELOPMENTS: 'development_id',
  ANCHORS: 'place_id',
  PRIMARY_OFFERS: 'observation_id'
};

/** Colunas de coordenada por aba. */
var COORD_FIELDS = {
  LISTINGS: ['latitude', 'longitude'],
  DEVELOPMENTS: ['latitude', 'longitude'],
  ANCHORS: ['latitude', 'longitude'],
  PRIMARY_OFFERS: ['latitude', 'longitude']
};

/**
 * Cabecalhos criticos por aba, conforme docs/DATA_CONTRACT.md.
 *
 * Existe porque validar so a coluna de ID deixa passar o pior caso do projeto: apagar
 * ou renomear `latitude` em LISTINGS nao gera nenhum achado — a validacao de
 * coordenada simplesmente e pulada por falta de indice — enquanto o navegador
 * normaliza todas as coordenadas para null e o mapa fica vazio. Cabecalho renomeado
 * em silencio quebra producao sem erro de compilacao.
 *
 * NAO EDITE A MAO. A lista e derivada mecanicamente da uniao entre os campos que
 * docs/DATA_CONTRACT.md marca como obrigatorios e os que src/normalize.js le de fato,
 * intersectada com as colunas que o contrato declara para cada aba — sem a intersecao,
 * coordinate_precision seria exigido em DEVELOPMENTS, que nao tem essa coluna, e a
 * validacao acusaria erro numa planilha correta.
 *
 * tests/contract.test.js recalcula a derivacao e falha se esta lista divergir, entao
 * mudanca no contrato ou no normalizador obriga a atualizar aqui na mesma PR.
 */
var REQUIRED_HEADERS = {
  LISTINGS: [
    'address', 'area_basis', 'area_m2', 'asking_price_brl', 'asking_price_brl_m2', 'bedrooms',
    'condo_fee_brl', 'confidence_flag', 'coordinate_precision', 'iptu_brl', 'last_seen_at',
    'latitude', 'listing_id', 'locality', 'longitude', 'observed_at', 'parking_spaces',
    'portal', 'property_type', 'quality_flag', 'ra_geo_id', 'source_page_verified_at',
    'source_url', 'source_url_type', 'status', 'suites', 'title', 'transaction_type'
  ],
  DEVELOPMENTS: [
    'address', 'area_max_m2', 'area_min_m2', 'confidence_flag', 'coordinate_status',
    'current_price_brl', 'current_price_brl_m2', 'developer_name', 'development_id',
    'expected_delivery', 'last_verified_at', 'latitude', 'longitude', 'name', 'neighborhood',
    'product', 'quality_flag', 'ra_geo_id', 'segment', 'source_url', 'spatial_usable',
    'status', 'unit_mix', 'units_total', 'work_progress_pct'
  ],
  ANCHORS: [
    'address', 'category', 'confidence_flag', 'coordinate_precision', 'coordinate_source_url',
    'last_verified_at', 'latitude', 'longitude', 'name', 'neighborhood', 'operator_name',
    'place_id', 'ra_geo_id', 'scale_capacity', 'source_url', 'status', 'subcategory'
  ],
};

/** Datasets que o endpoint read-only pode servir. Allowlist — nunca aceite nome livre. */
var ALLOWED_DATASETS = REQUIRED_SHEETS.concat(OPTIONAL_SHEETS);

/** Teto do histórico de mudanças. Diagnóstico operacional, não auditoria corporativa. */
var CHANGELOG_LIMIT = 5000;

/** Divergência tolerada entre preço/m² informado e calculado, antes de virar alerta. */
var PRICE_M2_TOLERANCE = 0.05;

var LOCK_TIMEOUT_MS = 30000;

/**
 * Sessão administrativa (issue #5, comentário do dono do repo): o token não é
 * reenviado em toda escrita — só uma vez, para trocar por uma sessão temporária.
 * TTL deslizante: cada uso válido renova por mais SESSION_TTL_SECONDS, até o teto
 * absoluto SESSION_MAX_LIFETIME_SECONDS a partir da criação.
 */
var SESSION_TTL_SECONDS = 1800; // 30 min de inatividade
var SESSION_MAX_LIFETIME_SECONDS = 8 * 3600; // 8h mesmo com uso contínuo

/**
 * Limitação de tentativas de autenticação (issue #5). CacheService não dá acesso ao
 * IP de quem chama um Web App do Apps Script, então o limite é necessariamente
 * GLOBAL — todas as tentativas erradas de qualquer origem compartilham o mesmo
 * contador. É uma mitigação real contra força bruta, mas não isola um atacante de um
 * usuário legítimo digitando errado; documentado assim de propósito, não fingindo
 * granularidade por pessoa que a plataforma não oferece.
 */
var MAX_AUTH_ATTEMPTS = 10;
var AUTH_WINDOW_SECONDS = 900; // 15 min

// ---------------------------------------------------------------------------
// Escrita (admin) — R4.9
// ---------------------------------------------------------------------------
//
// Campos editáveis pela API de escrita, por aba. V1 cobre só LISTINGS e reaproveita
// REQUIRED_HEADERS como base: são as colunas críticas já mantidas em sincronia com
// docs/DATA_CONTRACT.md e cross-checadas por tests/contract.test.js. `listing_id`
// (chave primária, imutável após criação) e `asking_price_brl_m2` (campo derivado,
// calculado pelo servidor) ficam de fora — nunca aceitos como valor de entrada.
//
// Campos de cauda longa que não estão em REQUIRED_HEADERS (`external_id`,
// `portal_listing_code`, `portal_date_text`, `property_id`, `published_days`,
// `views_count`, `interested_count`) não são editáveis nesta PR — ver Pendências.
var WRITE_ALLOWLIST = {
  LISTINGS: REQUIRED_HEADERS.LISTINGS.filter(function (f) {
    return f !== 'listing_id' && f !== 'asking_price_brl_m2';
  })
};

/** Campos que docs/DATA_CONTRACT.md marca como obrigatórios (Obrig. = sim) para LISTINGS. */
var REQUIRED_FOR_CREATE = {
  LISTINGS: [
    'portal', 'transaction_type', 'title', 'source_url', 'source_url_type',
    'source_page_verified_at', 'status', 'last_seen_at', 'property_type', 'address',
    'locality', 'ra_geo_id', 'latitude', 'longitude', 'coordinate_precision',
    'confidence_flag', 'observed_at', 'asking_price_brl', 'area_m2', 'area_basis',
    'bedrooms', 'quality_flag'
  ]
};

/** Vocabulário fechado de `property_type`, conforme docs/DATA_CONTRACT.md. */
var PROPERTY_TYPE_VALUES = ['apartamento', 'casa', 'casa_condominio', 'kitnet', 'predio', 'terreno'];

/**
 * Tipo de cada campo editável, para coerção e validação no servidor.
 *
 * `coordinate_precision` e `confidence_flag` ficam como `text`: o contrato só documenta
 * parte do vocabulário em uso (R8.3-style — a fonte real é a planilha), e tratá-los como
 * enum fechado rejeitaria valores legítimos que o contrato ainda não lista.
 */
var FIELD_SCHEMA = {
  LISTINGS: {
    address: 'text', area_basis: 'text', area_m2: 'number', asking_price_brl: 'number',
    bedrooms: 'int', condo_fee_brl: 'number', confidence_flag: 'text',
    coordinate_precision: 'text', iptu_brl: 'number', last_seen_at: 'date', latitude: 'number',
    locality: 'text', longitude: 'number', observed_at: 'date', parking_spaces: 'int',
    portal: 'text', property_type: 'enum:property_type', quality_flag: 'text',
    ra_geo_id: 'text', source_page_verified_at: 'date', source_url: 'url',
    source_url_type: 'text', status: 'text', suites: 'int', title: 'text',
    transaction_type: 'text'
  }
};

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Imob Intelligence')
    .addItem('Configurar projeto', 'setupProject')
    .addItem('Validar dados agora', 'validateAll')
    .addItem('Recalcular campos derivados', 'recalculateDerivedFields')
    .addItem('Instalar gatilhos', 'installTriggers')
    .addItem('Atualizar metadados', 'refreshMeta')
    .addItem('Limpar cache', 'clearCache')
    .addToUi();
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function props_() {
  return PropertiesService.getScriptProperties();
}

/**
 * Executa `fn` sob lock do documento.
 *
 * O gatilho de edição e o job de manutenção escrevem nas mesmas abas operacionais.
 * Sem lock, uma execução sobrescreve a outra e o CHANGE_LOG perde eventos.
 */
function withLock_(fn) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    Logger.log('lock não obtido em %s ms; execução ignorada', LOCK_TIMEOUT_MS);
    return null;
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Cabeçalhos de uma aba, como array de strings. Aba ausente devolve lista vazia. */
function headersOf_(sheet) {
  if (!sheet || sheet.getLastColumn() === 0) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function (h) { return String(h).trim(); });
}

/** Índice de cada cabeçalho, base zero. */
function headerIndex_(headers) {
  var index = {};
  for (var i = 0; i < headers.length; i++) index[headers[i]] = i;
  return index;
}

/** Linhas de dados de uma aba, sem o cabeçalho. */
function dataRowsOf_(sheet) {
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() === 0) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
}

/** Data e hora corrente em ISO. */
function nowISO_() {
  return new Date().toISOString();
}

/**
 * Número a partir de uma célula.
 *
 * Aceita number, decimal com ponto e formato brasileiro ("R$ 1.234,56"). Devolve
 * null quando não há número — nunca NaN, para que ausência tenha uma representação só.
 * Espelha toNumber() de src/normalize.js: mudou lá, muda aqui.
 */
function toNumber_(value) {
  if (typeof value === 'number') return isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;

  var s = String(value).replace(/[R$\s ]/gi, '');
  if (s === '') return null;

  var lastComma = s.lastIndexOf(',');
  var lastDot = s.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    s = (s.length - lastComma - 1) === 3 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '');
  }

  var n = Number(s);
  return isFinite(n) ? n : null;
}

/**
 * Compara duas strings sem atalho por tamanho ou por primeira divergência
 * (issue #5, comentário do dono: "falhas de token não poderão revelar se o token
 * está correto parcialmente").
 *
 * `a !== b` do JavaScript sai assim que encontra a primeira diferença — em teoria dá
 * para medir por tempo de resposta até onde um valor tentado bate com o segredo.
 * Aqui sempre percorremos o comprimento do maior dos dois e acumulamos as
 * divergências com OU bit a bit, sem `return` antecipado nem `if` que dependa do
 * conteúdo comparado. Não é uma primitiva criptográfica formalmente time-safe (V8
 * pode otimizar de formas que este código não controla), mas é estritamente melhor
 * que `===`, que é garantidamente vulnerável ao atalho.
 */
function timingSafeEqual_(a, b) {
  var sa = String(a === null || a === undefined ? '' : a);
  var sb = String(b === null || b === undefined ? '' : b);
  var len = Math.max(sa.length, sb.length);
  var diff = sa.length ^ sb.length;
  for (var i = 0; i < len; i++) {
    var ca = i < sa.length ? sa.charCodeAt(i) : 0;
    var cb = i < sb.length ? sb.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

/** Texto normalizado. `null`/`undefined` viram string vazia. Espelha toText() de src/normalize.js. */
function toText_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** URL http(s) válida? Qualquer outro esquema é suspeito numa planilha pública. */
function isValidUrl_(value) {
  var s = String(value === null || value === undefined ? '' : value).trim();
  if (s === '') return true; // vazio é ausência, tratada por outra validação
  return /^https?:\/\/[^\s]+$/i.test(s);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * Prepara a planilha. Idempotente: pode rodar quantas vezes for preciso.
 *
 * As abas operacionais já existem na planilha importada do .xlsx de migração, com os
 * cabeçalhos corretos. Esta função cria o que falta e NÃO sobrescreve o que existe.
 */
function setupProject() {
  return withLock_(function () {
    var book = ss_();
    var created = [];
    var kept = [];

    Object.keys(OPERATIONAL_HEADERS).forEach(function (name) {
      var sheet = book.getSheetByName(name);
      if (!sheet) {
        sheet = book.insertSheet(name);
        sheet.getRange(1, 1, 1, OPERATIONAL_HEADERS[name].length).setValues([OPERATIONAL_HEADERS[name]]);
        sheet.setFrozenRows(1);
        created.push(name);
        return;
      }
      // Aba existente: completa apenas cabeçalho ausente, preservando os dados.
      if (headersOf_(sheet).join('') === '') {
        sheet.getRange(1, 1, 1, OPERATIONAL_HEADERS[name].length).setValues([OPERATIONAL_HEADERS[name]]);
        sheet.setFrozenRows(1);
        created.push(name + ' (cabeçalho)');
      } else {
        kept.push(name);
      }
    });

    if (!props_().getProperty('DATASET_VERSION')) props_().setProperty('DATASET_VERSION', '1');
    props_().setProperty('APP_VERSION', APP_VERSION);

    var changeLogUpgraded = upgradeChangeLogHeader_();
    refreshMeta();

    var message = 'Abas criadas: ' + (created.length ? created.join(', ') : 'nenhuma') +
      '\nAbas preservadas: ' + (kept.length ? kept.join(', ') : 'nenhuma') +
      (changeLogUpgraded ? '\nCHANGE_LOG: cabeçalho estendido para as colunas novas da issue #5.' : '') +
      '\n\nPróximos passos: Validar dados agora, depois Instalar gatilhos.';
    Logger.log(message);
    notify_('Configuração concluída', message);
    return message;
  });
}

/**
 * Migração idempotente do cabeçalho do CHANGE_LOG (issue #5): planilhas já
 * provisionadas antes desta PR têm as 7 colunas antigas (CHANGE_LOG_HEADERS_V1). Só
 * estende o cabeçalho — nunca reescreve linha de dado existente — e só quando o
 * cabeçalho é EXATAMENTE o antigo, para nunca sobrescrever um cabeçalho já
 * customizado à mão de um jeito inesperado. Devolve `true` se estendeu algo.
 */
function upgradeChangeLogHeader_() {
  var sheet = ss_().getSheetByName(CHANGELOG_SHEET);
  if (!sheet) return false;

  var current = headersOf_(sheet);
  if (current.join('|') !== CHANGE_LOG_HEADERS_V1.join('|')) return false;

  var target = OPERATIONAL_HEADERS.CHANGE_LOG;
  var extra = target.slice(current.length);
  sheet.getRange(1, current.length + 1, 1, extra.length).setValues([extra]);
  return true;
}

/** Mostra alerta quando há interface; caso contrário só registra no log. */
function notify_(title, message) {
  try {
    SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    Logger.log('%s: %s', title, message);
  }
}

// ---------------------------------------------------------------------------
// Gatilhos
// ---------------------------------------------------------------------------

/**
 * Instala os gatilhos instaláveis. Idempotente: remove os anteriores deste script
 * antes de criar, para não acumular duplicatas a cada execução.
 *
 * onEdit simples não serve aqui: não tem permissão para escrever em outras abas
 * nem para usar Script Properties.
 */
function installTriggers() {
  var book = ss_();
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    var fn = trigger.getHandlerFunction();
    if (fn === 'handleEdit' || fn === 'maintenanceJob') ScriptApp.deleteTrigger(trigger);
  });

  ScriptApp.newTrigger('handleEdit').forSpreadsheet(book).onEdit().create();
  ScriptApp.newTrigger('maintenanceJob').timeBased().everyHours(6).create();

  var message = 'Gatilhos instalados: handleEdit (a cada edição) e maintenanceJob (a cada 6 horas).';
  Logger.log(message);
  notify_('Gatilhos', message);
  return message;
}

/**
 * Reage a uma edição em aba de dados.
 *
 * Faz o mínimo de propósito: registrar → incrementar versão → marcar dirty →
 * invalidar cache. Validar o dataset inteiro a cada célula editada consumiria a
 * cota de execução rapidamente. A validação completa fica no job periódico.
 */
function handleEdit(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  var name = sheet.getName();
  if (REQUIRED_SHEETS.indexOf(name) === -1 && OPTIONAL_SHEETS.indexOf(name) === -1) return;
  if (e.range.getRow() === 1) return; // edição de cabeçalho é tratada pela validação

  withLock_(function () {
    logChange_(sheet, e);
    bumpDatasetVersion_();
    setMeta_('validation_status', 'dirty');
    setMeta_('last_data_change_at', nowISO_());
    clearCache();
  });
}

/**
 * Adiciona uma linha ao CHANGE_LOG e apara o histórico quando passa do teto.
 *
 * Único ponto de escrita no CHANGE_LOG: tanto o gatilho de edição (`logChange_`)
 * quanto a API de escrita (`logWriteChange_`) passam por aqui, para que o teto de
 * `CHANGELOG_LIMIT` valha para os dois caminhos igualmente.
 */
function appendChangeLogRow_(row) {
  var log = ss_().getSheetByName(CHANGELOG_SHEET);
  if (!log) return;

  log.appendRow(row);

  var rows = log.getLastRow() - 1;
  if (rows > CHANGELOG_LIMIT) {
    log.deleteRows(2, rows - CHANGELOG_LIMIT);
  }
}

/** Registra a edição manual (via planilha) no CHANGE_LOG. */
function logChange_(sheet, e) {
  var name = sheet.getName();
  var headers = headersOf_(sheet);
  var idColumn = headers.indexOf(ID_FIELD[name] || '') + 1;
  var recordId = '';
  if (idColumn > 0 && e.range.getRow() > 1) {
    recordId = String(sheet.getRange(e.range.getRow(), idColumn).getValue() || '');
  }

  var editor = '';
  try { editor = Session.getActiveUser().getEmail() || ''; } catch (err) { editor = ''; }

  // Só registra valor de célula única: uma colagem de 500 linhas viraria 500 eventos
  // e estouraria o histórico útil.
  var single = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1;

  appendChangeLogRow_([
    nowISO_(),
    name,
    e.range.getA1Notation(),
    recordId,
    single ? String(e.oldValue === undefined ? '' : e.oldValue) : '(múltiplas células)',
    single ? String(e.value === undefined ? '' : e.value) : '(múltiplas células)',
    editor,
    '', // correlation_id: só existe para escritas via API
    'ok',
    ''
  ]);
}

/**
 * Registra uma mudança feita pela API de escrita (admin) no CHANGE_LOG, incluindo
 * `correlation_id` (issue #5: rastrear uma operação inteira através de várias linhas
 * de log, uma por campo alterado) e `result`/`error_reason`.
 *
 * `editor`: prioriza a identidade Google quando o Apps Script consegue resolvê-la
 * (`Session.getActiveUser()` — funciona quando o Web App está implantado como
 * "Executar como: usuário que acessa"; costuma vir vazio em outras configurações, daí
 * o try/catch e o fallback). Sem isso, cai para o valor autodeclarado no formulário —
 * o modelo de auth por token compartilhado (R4.9) não identifica pessoa por si só.
 */
function logWriteChange_(sheetName, recordId, field, oldValue, newValue, editor, correlationId, result, errorReason) {
  var googleEmail = '';
  try { googleEmail = Session.getActiveUser().getEmail() || ''; } catch (err) { googleEmail = ''; }
  var who = googleEmail || toText_(editor) || '(não informado)';

  appendChangeLogRow_([
    nowISO_(),
    sheetName,
    field,
    recordId,
    oldValue === null || oldValue === undefined ? '' : String(oldValue),
    newValue === null || newValue === undefined ? '' : String(newValue),
    who,
    toText_(correlationId),
    result || 'ok',
    toText_(errorReason)
  ]);
}

/** Incrementa e devolve a versão do dataset. */
function bumpDatasetVersion_() {
  var current = parseInt(props_().getProperty('DATASET_VERSION') || '1', 10);
  if (isNaN(current)) current = 1;
  var next = current + 1;
  props_().setProperty('DATASET_VERSION', String(next));
  setMeta_('dataset_version', String(next));
  return next;
}

/**
 * Manutenção periódica: recalcula derivados, valida e atualiza metadados.
 *
 * Se o dataset crescer muito, reavalie a frequência de 6 horas e o custo de execução.
 */
function maintenanceJob() {
  try {
    recalculateDerivedFields();
    validateAll();
    refreshMeta();
    Logger.log('manutenção concluída em %s', nowISO_());
  } catch (error) {
    Logger.log('manutenção falhou: %s', error && error.message);
    setMeta_('validation_status', 'error');
  }
}

// ---------------------------------------------------------------------------
// Campos derivados
// ---------------------------------------------------------------------------

/**
 * Calcula asking_price_brl_m2 nas linhas de LISTINGS em que ele está vazio.
 *
 * Valor já preenchido NÃO é sobrescrito na V1: a planilha pode ter um preço/m² vindo
 * da fonte que difere do cálculo por diferença de critério de área. Divergência grande
 * vira alerta em DATA_QUALITY, não sobrescrita silenciosa.
 */
function recalculateDerivedFields() {
  return withLock_(function () {
    var sheet = ss_().getSheetByName('LISTINGS');
    if (!sheet) return 'Aba LISTINGS ausente.';

    var headers = headersOf_(sheet);
    var index = headerIndex_(headers);
    if (index.asking_price_brl === undefined || index.area_m2 === undefined ||
        index.asking_price_brl_m2 === undefined) {
      return 'LISTINGS sem as colunas necessárias para o cálculo.';
    }

    var rows = dataRowsOf_(sheet);
    if (rows.length === 0) return 'LISTINGS sem linhas.';

    var column = [];
    var filled = 0;

    for (var i = 0; i < rows.length; i++) {
      var current = rows[i][index.asking_price_brl_m2];

      // Preserva QUALQUER celula nao vazia, inclusive 0, negativo ou texto.
      // Checar "e um numero positivo" faria a manutencao de 6 horas sobrescrever
      // justamente os valores invalidos, apagando a evidencia do dado ruim antes que
      // validateAll() pudesse registra-la em DATA_QUALITY. O contrato e "so quando
      // vazio", e vazio quer dizer vazio.
      if (String(current === null || current === undefined ? '' : current).trim() !== '') {
        column.push([current]);
        continue;
      }

      var price = toNumber_(rows[i][index.asking_price_brl]);
      var area = toNumber_(rows[i][index.area_m2]);

      if (price !== null && price > 0 && area !== null && area > 0) {
        column.push([price / area]);
        filled++;
      } else {
        column.push([current]); // sem dado suficiente: preserva o que está lá
      }
    }

    // Escrita em bloco único: célula a célula estouraria a cota em datasets grandes.
    sheet.getRange(2, index.asking_price_brl_m2 + 1, column.length, 1).setValues(column);

    var message = filled + ' valor(es) de preço/m² calculado(s).';
    Logger.log(message);
    return message;
  });
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

/**
 * Valida o dataset inteiro e reescreve DATA_QUALITY.
 *
 * Registro ruim é SINALIZADO, nunca apagado. A decisão de remover é humana.
 */
function validateAll() {
  return withLock_(function () {
    var book = ss_();
    var findings = [];
    var detectedAt = nowISO_();

    function report(severity, sheetName, row, recordId, field, code, message) {
      findings.push([severity, sheetName, row, recordId, field, code, message, detectedAt]);
    }

    // Abas ausentes: obrigatória é erro, opcional é aviso (R2.5).
    REQUIRED_SHEETS.forEach(function (name) {
      if (!book.getSheetByName(name)) {
        report('error', name, '', '', '', 'MISSING_SHEET', 'Aba obrigatória ausente.');
      }
    });
    OPTIONAL_SHEETS.forEach(function (name) {
      if (!book.getSheetByName(name)) {
        report('warning', name, '', '', '', 'MISSING_OPTIONAL_SHEET',
          'Aba opcional ausente. A aplicação continua funcionando.');
      }
    });

    REQUIRED_SHEETS.forEach(function (name) {
      var sheet = book.getSheetByName(name);
      if (!sheet) return;
      validateSheet_(sheet, name, report);
    });

    writeQuality_(findings);

    var errors = findings.filter(function (f) { return f[0] === 'error'; }).length;
    var warnings = findings.filter(function (f) { return f[0] === 'warning'; }).length;

    setMeta_('last_validation_at', detectedAt);
    setMeta_('validation_status', errors > 0 ? 'error' : (warnings > 0 ? 'warning' : 'ok'));
    setMeta_('validation_errors', String(errors));
    setMeta_('validation_warnings', String(warnings));

    var message = errors + ' erro(s) e ' + warnings + ' aviso(s). Detalhes em ' + QUALITY_SHEET + '.';
    Logger.log(message);
    return message;
  });
}

/** Validações de uma aba de dados. */
function validateSheet_(sheet, name, report) {
  var headers = headersOf_(sheet);
  var index = headerIndex_(headers);

  // Todos os cabeçalhos críticos, não só o do ID.
  var required = REQUIRED_HEADERS[name] || [];
  var missing = [];
  for (var h = 0; h < required.length; h++) {
    if (index[required[h]] === undefined) missing.push(required[h]);
  }
  if (missing.length > 0) {
    report('error', name, 1, '', missing.join(', '), 'MISSING_HEADER',
      'Cabeçalho(s) obrigatório(s) ausente(s): ' + missing.join(', ') +
      '. Renomear ou apagar coluna quebra a aplicação sem erro visível.');
  }

  var idField = ID_FIELD[name];
  if (idField && index[idField] === undefined) {
    return; // sem coluna de ID não dá para validar linha a linha
  }

  var coords = COORD_FIELDS[name] || [];
  var latField = coords[0];
  var lonField = coords[1];

  var rows = dataRowsOf_(sheet);
  var seen = {};

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var rowNumber = i + 2;
    var id = idField ? String(row[index[idField]] || '').trim() : '';

    if (idField && id === '') {
      report('error', name, rowNumber, '', idField, 'EMPTY_ID', 'Identificador vazio.');
    } else if (idField) {
      if (seen[id]) {
        report('error', name, rowNumber, id, idField, 'DUPLICATE_ID',
          'Identificador duplicado (primeira ocorrência na linha ' + seen[id] + ').');
      } else {
        seen[id] = rowNumber;
      }
    }

    if (latField && index[latField] !== undefined && index[lonField] !== undefined) {
      validateCoordinate_(row, index, latField, lonField, name, rowNumber, id, report);
    }

    if (index.source_url !== undefined && !isValidUrl_(row[index.source_url])) {
      report('warning', name, rowNumber, id, 'source_url', 'INVALID_URL',
        'URL de fonte suspeita ou inválida.');
    }

    validatePrice_(row, index, name, rowNumber, id, report);
  }
}

/** Latitude e longitude: faixa, e o caso de só uma das duas preenchida. */
function validateCoordinate_(row, index, latField, lonField, name, rowNumber, id, report) {
  var rawLat = row[index[latField]];
  var rawLon = row[index[lonField]];
  var hasLat = String(rawLat === null || rawLat === undefined ? '' : rawLat).trim() !== '';
  var hasLon = String(rawLon === null || rawLon === undefined ? '' : rawLon).trim() !== '';

  if (hasLat !== hasLon) {
    report('error', name, rowNumber, id, hasLat ? lonField : latField, 'HALF_COORDINATE',
      'Apenas uma das coordenadas está preenchida. O registro não pode ir ao mapa.');
    return;
  }
  if (!hasLat) return; // sem coordenada é situação prevista, não erro

  var lat = toNumber_(rawLat);
  var lon = toNumber_(rawLon);

  if (lat === null || lat < -90 || lat > 90) {
    report('error', name, rowNumber, id, latField, 'INVALID_LATITUDE',
      'Latitude inválida: ' + rawLat);
  }
  if (lon === null || lon < -180 || lon > 180) {
    report('error', name, rowNumber, id, lonField, 'INVALID_LONGITUDE',
      'Longitude inválida: ' + rawLon);
  }
}

/** Preço, área e coerência do preço/m² informado. */
function validatePrice_(row, index, name, rowNumber, id, report) {
  var priceField = index.asking_price_brl !== undefined ? 'asking_price_brl' :
    (index.price_min_brl !== undefined ? 'price_min_brl' : null);

  if (priceField) {
    var raw = row[index[priceField]];
    if (String(raw === null || raw === undefined ? '' : raw).trim() !== '') {
      var price = toNumber_(raw);
      if (price === null || price <= 0) {
        report('error', name, rowNumber, id, priceField, 'NON_POSITIVE_PRICE',
          'Preço não positivo ou não numérico: ' + raw);
      }
    }
  }

  if (index.area_m2 !== undefined) {
    var rawArea = row[index.area_m2];
    if (String(rawArea === null || rawArea === undefined ? '' : rawArea).trim() !== '') {
      var area = toNumber_(rawArea);
      if (area === null || area <= 0) {
        report('error', name, rowNumber, id, 'area_m2', 'NON_POSITIVE_AREA',
          'Área não positiva ou não numérica: ' + rawArea);
      }
    }
  }

  // Preço/m² informado que diverge muito do calculado: alerta, nunca sobrescrita.
  if (index.asking_price_brl !== undefined && index.area_m2 !== undefined &&
      index.asking_price_brl_m2 !== undefined) {
    var p = toNumber_(row[index.asking_price_brl]);
    var a = toNumber_(row[index.area_m2]);
    var informed = toNumber_(row[index.asking_price_brl_m2]);
    if (p !== null && a !== null && a > 0 && informed !== null && informed > 0) {
      var expected = p / a;
      if (Math.abs(expected - informed) / informed > PRICE_M2_TOLERANCE) {
        report('warning', name, rowNumber, id, 'asking_price_brl_m2', 'PRICE_M2_MISMATCH',
          'Preço/m² informado (' + Math.round(informed) + ') diverge do calculado (' +
          Math.round(expected) + ').');
      }
    }
  }
}

/** Reescreve DATA_QUALITY com os achados desta execução. */
function writeQuality_(findings) {
  var sheet = ss_().getSheetByName(QUALITY_SHEET);
  if (!sheet) return;

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, OPERATIONAL_HEADERS.DATA_QUALITY.length).clearContent();
  }
  if (findings.length > 0) {
    sheet.getRange(2, 1, findings.length, OPERATIONAL_HEADERS.DATA_QUALITY.length).setValues(findings);
  }
}

// ---------------------------------------------------------------------------
// APP_META
// ---------------------------------------------------------------------------

/** Escreve uma chave em APP_META, atualizando a linha existente se houver. */
function setMeta_(key, value) {
  var sheet = ss_().getSheetByName(META_SHEET);
  if (!sheet) return;

  var rows = dataRowsOf_(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key) {
      sheet.getRange(i + 2, 2, 1, 2).setValues([[value, nowISO_()]]);
      return;
    }
  }
  sheet.appendRow([key, value, nowISO_()]);
}

/** Atualiza os metadados derivados do estado atual da planilha. */
function refreshMeta() {
  var book = ss_();

  setMeta_('app_version', APP_VERSION);
  setMeta_('dataset_version', props_().getProperty('DATASET_VERSION') || '1');
  setMeta_('last_meta_refresh_at', nowISO_());

  var countKey = {
    LISTINGS: 'rows_listings',
    DEVELOPMENTS: 'rows_developments',
    ANCHORS: 'rows_anchors'
  };

  REQUIRED_SHEETS.forEach(function (name) {
    var sheet = book.getSheetByName(name);
    var count = sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
    setMeta_(countKey[name], String(count));
  });

  Logger.log('metadados atualizados em %s', nowISO_());
  return 'Metadados atualizados.';
}

/** Invalida o cache do endpoint. */
function clearCache() {
  CacheService.getScriptCache().removeAll(
    ALLOWED_DATASETS.map(function (name) { return 'dataset_' + name; }).concat(['meta'])
  );
  Logger.log('cache limpo');
  return 'Cache limpo.';
}

// ---------------------------------------------------------------------------
// Endpoint read-only
// ---------------------------------------------------------------------------

/**
 * Web App read-only.
 *
 *   ?resource=health
 *   ?resource=meta
 *   ?resource=dataset&name=LISTINGS
 *
 * Leitura pública, sem autenticação (R4.7). A escrita é um endpoint separado —
 * `doPost`, abaixo — e exige token (R4.9). Os dois nunca compartilham lógica de acesso.
 */
function doGet(e) {
  var params = (e && e.parameter) || {};
  var resource = String(params.resource || 'health');

  try {
    if (resource === 'health') return json_(health_(), params);
    if (resource === 'meta') return json_(meta_(), params);
    if (resource === 'dataset') return json_(dataset_(String(params.name || '')), params);
    return json_({ error: 'recurso desconhecido: ' + resource }, params);
  } catch (error) {
    return json_({ error: String(error && error.message ? error.message : error) }, params);
  }
}

function health_() {
  return {
    status: 'ok',
    app_version: APP_VERSION,
    dataset_version: props_().getProperty('DATASET_VERSION') || '1',
    server_time: nowISO_()
  };
}

/**
 * APP_META como LINHAS, não como objeto achatado.
 *
 * Achatar aqui destruía a evidência de chave duplicada antes de a resposta sair do
 * servidor: um objeto JSON não guarda duas chaves iguais, e a última linha vencia —
 * justamente a duplicata antiga. Com `validation_status = error` na primeira linha e
 * `ok` numa duplicata abaixo, o cliente recebia `ok` e não tinha como saber.
 *
 * Devolvendo as linhas cruas, as duas estratégias de leitura (GViz e Apps Script)
 * passam pelo mesmo normalizador no cliente e tratam conflito do mesmo jeito.
 * `updated_at`, que também se perdia no achatamento, chega junto.
 */
function meta_() {
  var sheet = ss_().getSheetByName(META_SHEET);
  var rows = [];

  dataRowsOf_(sheet).forEach(function (row) {
    var key = String(row[0]).trim();
    if (!key) return;
    rows.push({ key: key, value: row[1], updated_at: row[2] });
  });

  return { rows: rows, count: rows.length };
}

/**
 * Uma aba, como lista de objetos.
 *
 * O nome pedido é conferido contra a allowlist, e não usado direto: sem isso, o
 * parâmetro serviria para ler qualquer aba da planilha, inclusive uma que alguém
 * tenha criado achando que "escondida" significa "privada" (R4.3, R4.7).
 */
function dataset_(name) {
  if (ALLOWED_DATASETS.indexOf(name) === -1) {
    return { error: 'dataset não permitido' };
  }

  var cache = CacheService.getScriptCache();
  var cacheKey = 'dataset_' + name;
  var cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (err) { /* cache corrompido: recarrega */ }
  }

  var sheet = ss_().getSheetByName(name);
  if (!sheet) return { error: 'aba ausente', name: name, rows: [] };

  var headers = headersOf_(sheet);
  var rows = dataRowsOf_(sheet).map(function (row) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) {
      if (headers[i]) obj[headers[i]] = row[i];
    }
    return obj;
  });

  var payload = {
    name: name,
    dataset_version: props_().getProperty('DATASET_VERSION') || '1',
    count: rows.length,
    rows: rows
  };

  // O cache tem teto de 100 KB por chave; payload maior simplesmente não é cacheado.
  try { cache.put(cacheKey, JSON.stringify(payload), 300); } catch (err) { /* excede o teto */ }
  return payload;
}

// ---------------------------------------------------------------------------
// Endpoint de escrita (admin) — R4.9
// ---------------------------------------------------------------------------

/**
 * Web App de escrita, em dois passos (issue #5, comentário do dono do repo: token não
 * deve ser reenviado como credencial permanente).
 *
 * Passo 1 — trocar o token por uma sessão:
 *   { action: "authenticate", token: "..." }
 *   → { ok: true, session: "...", expires_in: 1800 }
 *   Falha: { ok: false, error: { code: "UNAUTHENTICATED" | "RATE_LIMITED", message } }
 *
 * Passo 2 — usar a sessão em create/update/delete:
 *   {
 *     session: "...",                // obrigatório, devolvido pelo passo 1
 *     action: "create"|"update"|"delete",
 *     sheet: "LISTINGS",
 *     id: "...",                     // obrigatório em create/update/delete
 *     expected_version: "7",         // obrigatório em update/delete (DATASET_VERSION observado)
 *     fields: { ... },               // create/update, só campos da allowlist
 *     editor: "Nome de quem edita",  // autodeclarado; a identidade Google, quando disponível, tem prioridade
 *     correlation_id: "..."          // opcional, gerado pelo cliente; ecoado na resposta e no CHANGE_LOG
 *   }
 *
 * Resposta: { ok: true, record: {...}, dataset_version: "N", correlation_id } ou
 * { ok: false, error: { code, message }, correlation_id }, com `code` em
 * UNAUTHENTICATED, RATE_LIMITED, INVALID_PAYLOAD, UNKNOWN_SHEET, UNKNOWN_FIELD,
 * NOT_FOUND, VERSION_CONFLICT, VALIDATION_ERROR ou INTERNAL_ERROR.
 *
 * Sem ADMIN_TOKEN configurado em Script Properties, `authenticate` nunca sucede — não
 * existe modo aberto (R4.9, que supera a restrição anterior de R4.7: o endpoint só
 * deixa de ser read-only sob autenticação obrigatória).
 */
function doPost(e) {
  var params;
  try {
    params = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return errorResponse_('INVALID_PAYLOAD', 'Corpo da requisição não é JSON válido.');
  }

  try {
    var action = toText_(params.action);

    if (action === 'authenticate') return handleAuthenticate_(params);

    if (!validateSession_(params.session)) {
      return errorResponse_('UNAUTHENTICATED', 'Sessão ausente, inválida ou expirada. Autentique de novo.');
    }

    var sheetName = toText_(params.sheet);
    if (!WRITE_ALLOWLIST[sheetName]) {
      return errorResponse_('UNKNOWN_SHEET', 'Aba não permitida para escrita: ' + sheetName);
    }

    if (['create', 'update', 'delete'].indexOf(action) === -1) {
      return errorResponse_('INVALID_PAYLOAD', 'action deve ser authenticate, create, update ou delete.');
    }

    var result = withLock_(function () { return doWrite_(sheetName, action, params); });
    return result || errorResponse_('INTERNAL_ERROR', 'Não foi possível obter lock; tente novamente.');
  } catch (error) {
    return errorResponse_('INTERNAL_ERROR', String(error && error.message ? error.message : error));
  }
}

/**
 * Passo 1 do login: troca `token` por uma sessão temporária.
 *
 * Limitação de tentativas antes de checar o token — se já estourou, nem chega a
 * comparar (evita gastar tempo de execução em tentativa que já será recusada, e
 * mantém a mensagem igual independente de o token estar certo ou errado).
 */
function handleAuthenticate_(params) {
  if (authFailureCount_() >= MAX_AUTH_ATTEMPTS) {
    return errorResponse_('RATE_LIMITED', 'Muitas tentativas de autenticação. Aguarde alguns minutos.');
  }

  var expected = props_().getProperty('ADMIN_TOKEN');
  var provided = params && params.token ? String(params.token) : '';
  var ok = !!expected && timingSafeEqual_(provided, expected);

  if (!ok) {
    registerAuthFailure_();
    return errorResponse_('UNAUTHENTICATED', 'Token inválido ou ausente.');
  }

  resetAuthFailures_();
  var session = createSession_();
  return json_({ ok: true, session: session, expires_in: SESSION_TTL_SECONDS }, {});
}

/** Cria uma sessão nova em CacheService, com o instante de criação como valor. */
function createSession_() {
  var id = Utilities.getUuid();
  CacheService.getScriptCache().put('session_' + id, String(Date.now()), SESSION_TTL_SECONDS);
  return id;
}

/**
 * Sessão válida? TTL deslizante: cada chamada bem-sucedida renova por mais
 * SESSION_TTL_SECONDS, mas nunca além de SESSION_MAX_LIFETIME_SECONDS desde a criação
 * — o timestamp de criação (guardado como valor da chave) não muda entre renovações.
 */
function validateSession_(sessionId) {
  var id = toText_(sessionId);
  if (!id) return false;

  var cache = CacheService.getScriptCache();
  var key = 'session_' + id;
  var createdRaw = cache.get(key);
  if (!createdRaw) return false;

  var created = parseInt(createdRaw, 10);
  if (isNaN(created)) return false;

  if (Date.now() - created > SESSION_MAX_LIFETIME_SECONDS * 1000) {
    cache.remove(key);
    return false;
  }

  cache.put(key, createdRaw, SESSION_TTL_SECONDS);
  return true;
}

/** Tentativas de autenticação falhas na janela atual — contador GLOBAL, ver MAX_AUTH_ATTEMPTS. */
function authFailureCount_() {
  var n = parseInt(CacheService.getScriptCache().get('auth_fail_count') || '0', 10);
  return isNaN(n) ? 0 : n;
}

function registerAuthFailure_() {
  var cache = CacheService.getScriptCache();
  cache.put('auth_fail_count', String(authFailureCount_() + 1), AUTH_WINDOW_SECONDS);
}

function resetAuthFailures_() {
  CacheService.getScriptCache().remove('auth_fail_count');
}

/** Orquestra create/update/delete para uma aba já validada contra a allowlist. */
function doWrite_(sheetName, action, params) {
  var sheet = ss_().getSheetByName(sheetName);
  var correlationId = toText_(params.correlation_id);
  var editor = params.editor;
  var id = toText_(params.id);

  if (!sheet) return writeError_(sheetName, id, correlationId, editor, 'UNKNOWN_SHEET', 'Aba ausente na planilha: ' + sheetName);

  var headers = headersOf_(sheet);
  var index = headerIndex_(headers);
  var idField = ID_FIELD[sheetName];

  if (action === 'create') {
    if (!id) return writeError_(sheetName, id, correlationId, editor, 'INVALID_PAYLOAD', 'id é obrigatório para create.');

    var validatedCreate = validateWritePayload_(sheetName, 'create', params.fields || {});
    if (!validatedCreate.ok) {
      return writeError_(sheetName, id, correlationId, editor, validatedCreate.error.code, validatedCreate.error.message);
    }
    applyDerivedFields_(sheetName, validatedCreate.fields, null);

    if (findRowById_(sheet, headers, index, idField, id)) {
      return writeError_(sheetName, id, correlationId, editor, 'VALIDATION_ERROR', 'Já existe um registro com este id: ' + id);
    }

    var created = applyCreate_(sheet, headers, idField, id, validatedCreate.fields);
    return finishWrite_(sheetName, id, [
      { field: '*', oldValue: '', newValue: JSON.stringify(validatedCreate.fields) }
    ], editor, correlationId, created);
  }

  if (!id) return writeError_(sheetName, id, correlationId, editor, 'INVALID_PAYLOAD', 'id é obrigatório.');

  var found = findRowById_(sheet, headers, index, idField, id);
  if (!found) return writeError_(sheetName, id, correlationId, editor, 'NOT_FOUND', 'Registro não encontrado: ' + id);

  var conflict = checkVersionConflict_(params.expected_version);
  if (conflict) return writeError_(sheetName, id, correlationId, editor, conflict.code, conflict.message);

  if (action === 'delete') {
    sheet.deleteRow(found.rowNumber);
    return finishWrite_(sheetName, id, [
      { field: '*', oldValue: JSON.stringify(found.record), newValue: '' }
    ], editor, correlationId, { id: id });
  }

  // update
  var validatedUpdate = validateWritePayload_(sheetName, 'update', params.fields || {});
  if (!validatedUpdate.ok) {
    return writeError_(sheetName, id, correlationId, editor, validatedUpdate.error.code, validatedUpdate.error.message);
  }
  applyDerivedFields_(sheetName, validatedUpdate.fields, found.record);

  var changes = applyUpdate_(sheet, headers, found.rowNumber, validatedUpdate.fields);
  if (changes.length === 0) {
    return writeError_(sheetName, id, correlationId, editor, 'INVALID_PAYLOAD', 'Nenhum campo mudou de valor.');
  }

  var updated = readRecord_(sheet, headers, found.rowNumber);
  return finishWrite_(sheetName, id, changes, editor, correlationId, updated);
}

/**
 * Registra no CHANGE_LOG uma tentativa de escrita que passou da autenticação mas foi
 * recusada (payload inválido, conflito de versão, registro não encontrado etc.) e
 * devolve a resposta de erro. Só aqui, depois de `validateSession_` já ter aceitado a
 * sessão — falha de autenticação/rate-limit nunca chega a este ponto, então não vira
 * ruído de tentativa de força bruta no log operacional (issue #5: log cobre
 * "resultado" e "motivo de erro" das operações de escrita, não das tentativas de login).
 */
function writeError_(sheetName, id, correlationId, editor, code, message) {
  logWriteChange_(sheetName, id, '*', '', '', editor, correlationId, 'error', code + (message ? ': ' + message : ''));
  return errorResponse_(code, message, correlationId);
}

/** Bump de versão, log de auditoria por campo, metadados dirty e invalidação de cache. */
function finishWrite_(sheetName, id, changes, editor, correlationId, record) {
  var version = bumpDatasetVersion_();
  changes.forEach(function (change) {
    logWriteChange_(sheetName, id, change.field, change.oldValue, change.newValue, editor, correlationId, 'ok', '');
  });
  setMeta_('validation_status', 'dirty');
  setMeta_('last_data_change_at', nowISO_());
  clearCache();
  return successResponse_(record, version, correlationId);
}

/**
 * Compara `expected_version` do payload contra o DATASET_VERSION atual.
 *
 * Concorrência otimista de granularidade grosseira (todo o dataset, não por registro):
 * mais simples, sem mudança de schema, aceitável para o volume de edição concorrente
 * esperado numa ferramenta interna (ver plano da PR). Devolve `{code, message}` do
 * erro, ou `null` quando não há conflito — quem chama decide como responder/logar.
 */
function checkVersionConflict_(expectedVersion) {
  var current = props_().getProperty('DATASET_VERSION') || '1';
  var expected = expectedVersion === undefined || expectedVersion === null ? '' : String(expectedVersion);

  if (expected === '') {
    return { code: 'INVALID_PAYLOAD', message: 'expected_version é obrigatório para update e delete.' };
  }
  if (expected !== current) {
    return {
      code: 'VERSION_CONFLICT',
      message: 'O dataset mudou desde que este registro foi carregado (versão atual: ' + current + ').'
    };
  }
  return null;
}

/**
 * Valida e coage `fields` contra a allowlist/schema da aba.
 *
 * Campo fora da allowlist é UNKNOWN_FIELD — é assim que `asking_price_brl_m2` (campo
 * derivado) é recusado quando submetido diretamente: ele nunca entra em
 * WRITE_ALLOWLIST, só é calculado aqui a partir de asking_price_brl/area_m2 quando os
 * dois estão presentes no payload.
 */
function validateWritePayload_(sheetName, action, fields) {
  var allowlist = WRITE_ALLOWLIST[sheetName] || [];
  var schema = FIELD_SCHEMA[sheetName] || {};

  if (!fields || typeof fields !== 'object') {
    return { ok: false, error: { code: 'INVALID_PAYLOAD', message: 'fields deve ser um objeto.' } };
  }

  var unknown = Object.keys(fields).filter(function (f) { return allowlist.indexOf(f) === -1; });
  if (unknown.length > 0) {
    return { ok: false, error: { code: 'UNKNOWN_FIELD', message: 'Campo(s) não editável(is): ' + unknown.join(', ') } };
  }

  if (action === 'create') {
    var required = REQUIRED_FOR_CREATE[sheetName] || [];
    var missing = required.filter(function (f) {
      return fields[f] === undefined || fields[f] === null || String(fields[f]).trim() === '';
    });
    if (missing.length > 0) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Campo(s) obrigatório(s) ausente(s): ' + missing.join(', ') }
      };
    }
  }

  var coerced = {};
  for (var i = 0; i < allowlist.length; i++) {
    var field = allowlist[i];
    if (!(field in fields)) continue;

    var coercedField = coerceField_(schema[field] || 'text', fields[field]);
    if (!coercedField.ok) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: field + ': ' + coercedField.message } };
    }
    coerced[field] = coercedField.value;
  }

  return { ok: true, fields: coerced };
}

/**
 * Recalcula `asking_price_brl_m2` quando o payload muda preço e/ou área, combinando
 * o valor submetido com o valor atual da linha para o campo que não mudou.
 *
 * Em `create`, `currentRecord` é `null` e ambos os campos já são obrigatórios
 * (REQUIRED_FOR_CREATE), então sempre há o par completo. Em `update`, um payload que
 * só muda `area_m2` precisa do `asking_price_brl` que já está na planilha — sem isso,
 * mudar só a área deixaria o preço/m² desatualizado até a manutenção periódica passar.
 */
function applyDerivedFields_(sheetName, fields, currentRecord) {
  if (sheetName !== 'LISTINGS') return;

  var touchesPrice = 'asking_price_brl' in fields;
  var touchesArea = 'area_m2' in fields;
  if (!touchesPrice && !touchesArea) return;

  var price = touchesPrice ? fields.asking_price_brl
    : (currentRecord ? toNumber_(currentRecord.asking_price_brl) : null);
  var area = touchesArea ? fields.area_m2
    : (currentRecord ? toNumber_(currentRecord.area_m2) : null);
  if (price === null || area === null) return;

  fields.asking_price_brl_m2 = pricePerM2_(price, area);
}

/**
 * Preço por m², calculado no servidor. Espelha pricePerM2() de src/normalize.js na
 * direção "sem valor informado": aqui o valor informado nunca existe, porque o campo
 * é sempre derivado na escrita — mudou lá, muda aqui.
 */
function pricePerM2_(price, area) {
  if (price === null || area === null || area <= 0 || price <= 0) return null;
  return price / area;
}

/** Coage e valida um valor bruto conforme o tipo declarado em FIELD_SCHEMA. */
function coerceField_(type, raw) {
  var text = toText_(raw);

  if (type === 'text') return { ok: true, value: text };

  if (type === 'url') {
    if (text !== '' && !isValidUrl_(text)) return { ok: false, message: 'URL inválida.' };
    return { ok: true, value: text };
  }

  if (type === 'date') {
    if (text !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return { ok: false, message: 'data deve estar em YYYY-MM-DD.' };
    }
    return { ok: true, value: text };
  }

  if (type === 'number' || type === 'int') {
    if (text === '') return { ok: true, value: null };
    var n = toNumber_(raw);
    if (n === null) return { ok: false, message: 'não é um número válido.' };
    return { ok: true, value: type === 'int' ? Math.trunc(n) : n };
  }

  if (type === 'enum:property_type') {
    if (text !== '' && PROPERTY_TYPE_VALUES.indexOf(text) === -1) {
      return { ok: false, message: 'valor fora do vocabulário permitido (' + PROPERTY_TYPE_VALUES.join(', ') + ').' };
    }
    return { ok: true, value: text };
  }

  return { ok: true, value: text };
}

/** Busca um registro pelo ID, nunca por posição de linha. `null` quando não encontrado. */
function findRowById_(sheet, headers, index, idField, id) {
  if (!idField || index[idField] === undefined) return null;

  var rows = dataRowsOf_(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][index[idField]] || '').trim() === id) {
      return { rowNumber: i + 2, record: rowToRecord_(headers, rows[i]) };
    }
  }
  return null;
}

/** Linha bruta (array) para objeto `{header: valor}`. */
function rowToRecord_(headers, row) {
  var obj = {};
  for (var i = 0; i < headers.length; i++) {
    if (headers[i]) obj[headers[i]] = row[i];
  }
  return obj;
}

/** Lê a linha atual da planilha como registro — usado após update para devolver o valor persistido. */
function readRecord_(sheet, headers, rowNumber) {
  var values = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  return rowToRecord_(headers, values);
}

/** Cria uma linha nova. Campo não enviado fica em branco; o ID vai na coluna certa. */
function applyCreate_(sheet, headers, idField, id, fields) {
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i];
    if (header === idField) { row.push(id); continue; }
    row.push(header in fields ? fields[header] : '');
  }
  sheet.appendRow(row);
  return rowToRecord_(headers, row);
}

/**
 * Atualiza campo a campo, célula a célula — volume de edição administrativa é baixo,
 * então o custo de execução não compensa a complexidade de um `setValues` em lote.
 * Só grava (e só loga) o que de fato mudou de valor.
 */
function applyUpdate_(sheet, headers, rowNumber, fields) {
  var changes = [];
  Object.keys(fields).forEach(function (field) {
    var col = headers.indexOf(field);
    if (col === -1) return;

    var range = sheet.getRange(rowNumber, col + 1, 1, 1);
    var oldValue = range.getValue();
    var newValue = fields[field];
    var oldText = oldValue === null || oldValue === undefined ? '' : String(oldValue);
    var newText = newValue === null || newValue === undefined ? '' : String(newValue);
    if (oldText === newText) return;

    range.setValue(newValue);
    changes.push({ field: field, oldValue: oldText, newValue: newText });
  });
  return changes;
}

function successResponse_(record, version, correlationId) {
  var payload = { ok: true, record: record, dataset_version: String(version) };
  if (correlationId) payload.correlation_id = correlationId;
  return json_(payload, {});
}

function errorResponse_(code, message, correlationId) {
  var payload = { ok: false, error: { code: code, message: message } };
  if (correlationId) payload.correlation_id = correlationId;
  return json_(payload, {});
}

/**
 * Resposta JSON, com JSONP opcional.
 *
 * O nome do callback é validado contra um identificador JavaScript simples. Sem essa
 * checagem o parâmetro seria injeção de script direta na página que consome o endpoint.
 */
function json_(payload, params) {
  var body = JSON.stringify(payload);
  var callback = params && params.callback ? String(params.callback) : '';

  if (callback) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(callback)) {
      return ContentService
        .createTextOutput(JSON.stringify({ error: 'callback inválido' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService
      .createTextOutput(callback + '(' + body + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}
