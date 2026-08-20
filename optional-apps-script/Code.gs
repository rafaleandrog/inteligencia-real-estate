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
  CHANGE_LOG: ['timestamp', 'sheet', 'range', 'record_id', 'old_value', 'new_value', 'editor']
};

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

    refreshMeta();

    var message = 'Abas criadas: ' + (created.length ? created.join(', ') : 'nenhuma') +
      '\nAbas preservadas: ' + (kept.length ? kept.join(', ') : 'nenhuma') +
      '\n\nPróximos passos: Validar dados agora, depois Instalar gatilhos.';
    Logger.log(message);
    notify_('Configuração concluída', message);
    return message;
  });
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

/** Registra a edição no CHANGE_LOG, aparando o histórico quando passa do teto. */
function logChange_(sheet, e) {
  var book = ss_();
  var log = book.getSheetByName(CHANGELOG_SHEET);
  if (!log) return;

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

  log.appendRow([
    nowISO_(),
    name,
    e.range.getA1Notation(),
    recordId,
    single ? String(e.oldValue === undefined ? '' : e.oldValue) : '(múltiplas células)',
    single ? String(e.value === undefined ? '' : e.value) : '(múltiplas células)',
    editor
  ]);

  var rows = log.getLastRow() - 1;
  if (rows > CHANGELOG_LIMIT) {
    log.deleteRows(2, rows - CHANGELOG_LIMIT);
  }
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
 * Não existe doPost na V1, nem endpoint de administração: a planilha é pública para
 * leitura e não pode aceitar escrita vinda da internet (R4.7).
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

function meta_() {
  var sheet = ss_().getSheetByName(META_SHEET);
  var out = {};
  dataRowsOf_(sheet).forEach(function (row) {
    var key = String(row[0]).trim();
    if (key) out[key] = row[1];
  });
  return out;
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
