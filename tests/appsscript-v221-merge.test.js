import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAppsScriptSandbox, readJsonOutput } from './helpers/appsScriptSandbox.mjs';
import { normalizePolygon } from '../src/normalize.js';

// A v2.2.1 é uma fusão de três vias: corpo e funcionalidades da v2.2.0 (que a planilha
// roda) mais as quatro correções da v2.0.2 (que a v2.2.0 regredia, por ter sido
// construída a partir da v2.0.0 — R8.48). O risco central de uma fusão assim é
// SILENCIOSO: colar o arquivo inteiro por cima não gera conflito nem erro, e uma
// correção perdida só aparece comparando função a função.
//
// Estes testes travam a forma de cada correção preservada, além do comportamento que
// os testes da PR #41 já cobrem. Se alguém recolar uma versão futura por cima, é aqui
// que a regressão aparece.

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('APP_VERSION é a da fusão, não a da planilha nem a do repositório antigo', () => {
  const { context } = createAppsScriptSandbox();
  assert.equal(context.APP_VERSION, '2.2.1');
});

test('as quatro correções da v2.0.2 sobreviveram à fusão, na forma certa', () => {
  const { context } = createAppsScriptSandbox();

  // R8.40 — ensureHeaders_ de três argumentos. A v2.2.0 tem a de dois: com ela, um
  // cabeçalho apagado por engano numa aba obrigatória é recriado VAZIO e a validação
  // para de reclamar, enquanto o dado antigo fica órfão sob o nome renomeado.
  assert.equal(context.ensureHeaders_.length, 3,
    'ensureHeaders_ voltou à assinatura de 2 argumentos da v2.2.0');
  assert.ok(context.PROVISIONABLE_COLUMNS, 'PROVISIONABLE_COLUMNS sumiu');

  // R8.38 — checkVersionConflict_ recebe a versão observada ANTES do provisionamento.
  // Sem ela, a primeira escrita depois de uma migração de schema devolve
  // VERSION_CONFLICT por causa do incremento que a própria requisição causou.
  assert.equal(context.checkVersionConflict_.length, 2,
    'checkVersionConflict_ perdeu o parâmetro baselineVersion');

  // Coordenada nula/vazia: `Number(null)` é 0, e 0 passa em isFinite e na faixa válida.
  assert.equal(typeof context.isNumericPosition_, 'function', 'isNumericPosition_ sumiu');

  // Derivação de group/segment/sales_stage no caminho de escrita.
  assert.equal(typeof context.applyClassificationDerivations_, 'function',
    'applyClassificationDerivations_ sumiu');

  // R8.41 — a revogação do token legado é o oposto de promovê-lo a credencial válida.
  const src = read('../optional-apps-script/Code.gs');
  assert.match(src, /LEGACY_ADMIN_TOKEN_REVOKED_AT/,
    'a revogação do token legado voltou a ser uma promoção');
});

test('setupProject() cria as 42 colunas de POLYGONS e as três abas rodoviárias', () => {
  // A hipótese na abertura da issue era que PROVISIONABLE_COLUMNS precisaria ganhar as
  // colunas novas, senão o provisionamento restrito recusaria o que a v2.2.0 cria de
  // forma legítima. Não precisou: POLYGONS e as três abas rodoviárias são
  // MANAGED_EXTENSION_SHEETS, e aba gerenciada recebe `null` como `allowedToCreate` —
  // a restrição de R8.40 existe para aba obrigatória, que veio da semente. Este teste
  // é a verificação daquela hipótese, e a trava para o dia em que alguém mover uma
  // dessas abas para fora de MANAGED_EXTENSION_SHEETS.
  const sandbox = createAppsScriptSandbox({
    sheets: { APP_META: [['key', 'value', 'updated_at']] },
    scriptProperties: {},
  });
  sandbox.context.setupProject();

  const headersOf = (name) => sandbox.sheets[name]._rows[0].map(String);
  // Array vindo do contexto de vm não é reference-equal a um array deste realm.
  const declared = (name) => [...sandbox.context.REQUIRED_HEADERS[name]].map(String);

  const polygons = headersOf('POLYGONS');
  assert.equal(polygons.length, 42, 'POLYGONS precisa ter as 42 colunas do contrato A:AP');
  assert.deepEqual(polygons, declared('POLYGONS'));

  for (const sheet of ['ROAD_SEGMENTS', 'ROAD_SEGMENT_ALIASES', 'TRAFFIC_DAILY_TEST']) {
    assert.ok(sandbox.sheets[sheet], `${sheet} não foi criada`);
    assert.deepEqual(headersOf(sheet), declared(sheet), sheet);
  }

  // E nenhuma delas precisou de entrada em PROVISIONABLE_COLUMNS para isso.
  for (const sheet of ['POLYGONS', 'ROAD_SEGMENTS', 'ROAD_SEGMENT_ALIASES', 'TRAFFIC_DAILY_TEST']) {
    assert.equal(sandbox.context.PROVISIONABLE_COLUMNS[sheet], undefined,
      `${sheet} é aba gerenciada e não deve depender de PROVISIONABLE_COLUMNS`);
  }
});

test('o endpoint read-only serve as três abas novas', () => {
  // ALLOWED_DATASETS nasce de REQUIRED_SHEETS + OPTIONAL_SHEETS. Aba fora dali é
  // recusada por `dataset_()`, o erro vira aviso no cliente, e o carregamento reporta
  // sucesso com a camada sempre vazia — falha que não parece falha.
  const { context } = createAppsScriptSandbox();
  for (const sheet of ['POLYGONS', 'RA_PROFILES', 'ROAD_SEGMENTS', 'ROAD_SEGMENT_ALIASES', 'TRAFFIC_DAILY_TEST']) {
    assert.ok(context.ALLOWED_DATASETS.includes(sheet), `${sheet} fora de ALLOWED_DATASETS`);
  }
});

test('validateGeoJsonSourceGeometry_ aceita linha, e geometry_geojson continua recusando', () => {
  const { context } = createAppsScriptSandbox();
  const line = { type: 'LineString', coordinates: [[-47.9, -15.8], [-47.8, -15.7]] };

  const source = context.validateGeoJsonSourceGeometry_(JSON.stringify(line));
  assert.equal(source.ok, true, source.message);
  assert.equal(source.geometry.type, 'LineString');

  // O eixo do DER é linha e precisa sobreviver como procedência; o que vai ao MAPA
  // continua tendo que ser área fechada.
  const drawable = context.validateGeoJsonGeometry_(JSON.stringify(line));
  assert.equal(drawable.ok, false);
  assert.match(drawable.message, /Polygon ou MultiPolygon/);
});

test('a geometria-fonte recusa coordenada nula pela mesma razão que a desenhável', () => {
  // Sem esta guarda, `Number(null)` é 0 e a linha vira geografia real no golfo da
  // Guiné — agora pela porta da geometria-fonte, que a v2.2.0 abriu.
  const { context } = createAppsScriptSandbox();
  const result = context.validateGeoJsonSourceGeometry_(JSON.stringify({
    type: 'LineString',
    coordinates: [[null, null], [-47.8, -15.7]],
  }));
  assert.equal(result.ok, false);
  assert.match(result.message, /numérica/);
});

test('coerceField_ roteia geojson_source para o validador de linha', () => {
  const { context } = createAppsScriptSandbox();
  assert.equal(context.FIELD_SCHEMA.POLYGONS.source_geometry_geojson, 'geojson_source');
  const result = context.coerceField_('geojson_source', JSON.stringify({
    type: 'LineString',
    coordinates: [[-47.9, -15.8], [-47.8, -15.7]],
  }));
  assert.equal(result.ok, true, result.message);
});

test('a API de escrita aceita a geometria-fonte de rodovia sem aceitá-la como desenhável', () => {
  const { context } = createAppsScriptSandbox({
    sheets: {
      POLYGONS: [context0Headers()],
      APP_META: [['key', 'value', 'updated_at']],
      CHANGE_LOG: [['timestamp', 'sheet', 'range', 'record_id', 'old_value', 'new_value', 'editor', 'correlation_id', 'result', 'error_reason']],
    },
    scriptProperties: { ADMIN_TOKEN: 'secret-token', DATASET_VERSION: '1' },
  });

  const response = readJsonOutput(context.doPost({
    postData: {
      contents: JSON.stringify({
        token: 'secret-token',
        action: 'create',
        sheet: 'POLYGONS',
        fields: {
          name: 'Corredor de teste',
          layer_group: 'road_network',
          entity_type: 'road_segment',
          geometry_role: 'display_corridor',
          geometry_geojson: JSON.stringify({
            type: 'Polygon',
            coordinates: [[[-47.9, -15.8], [-47.8, -15.8], [-47.8, -15.7], [-47.9, -15.8]]],
          }),
          source_geometry_geojson: JSON.stringify({
            type: 'LineString',
            coordinates: [[-47.9, -15.8], [-47.8, -15.7]],
          }),
        },
      }),
    },
  }));

  assert.equal(response.ok, true, JSON.stringify(response.error));
  assert.equal(response.record.layer_group, 'road_network');
  assert.match(response.record.source_geometry_geojson, /^\{"type":"LineString"/);
});

// Cabeçalho de POLYGONS na v2.2.1, lido do próprio Code.gs para não duplicar a lista.
function context0Headers() {
  const { context } = createAppsScriptSandbox();
  return [...context.REQUIRED_HEADERS.POLYGONS];
}

test('normalizePolygon() lê as 42 colunas e não parseia nenhuma das duas geometrias', () => {
  const { context } = createAppsScriptSandbox();
  const row = {};
  for (const header of context.REQUIRED_HEADERS.POLYGONS) row[header] = '';
  row.polygon_id = 'POLY_TESTE';
  row.name = 'Corredor';
  row.layer_group = 'road_network';
  row.entity_type = 'road_segment';
  row.entity_id = 'ROADSEG_DF075_01';
  row.geometry_role = 'display_corridor';
  row.fill_color = '#53606B';
  row.z_index = '4';
  row.geometry_geojson = '{"type":"Polygon",';
  row.source_geometry_geojson = '{"type":"LineString",';

  const polygon = normalizePolygon(row);

  // Identidade e camada chegam ao cliente — é o que a issue #51 usa para filtrar.
  assert.equal(polygon.layer_group, 'road_network');
  assert.equal(polygon.entity_type, 'road_segment');
  assert.equal(polygon.entity_id, 'ROADSEG_DF075_01');
  assert.equal(polygon.geometry_role, 'display_corridor');
  assert.equal(polygon.fill_color, '#53606B');
  assert.equal(polygon.z_index, 4);

  // As duas geometrias atravessam como TEXTO: parsear no normalizador transformaria um
  // blob malformado numa linha em exceção no carregamento de todas as camadas (R2.6).
  assert.equal(typeof polygon.geometry_geojson, 'string');
  assert.equal(typeof polygon.source_geometry_geojson, 'string');
  assert.equal(polygon.geometry_geojson, '{"type":"Polygon",');
  assert.equal(polygon.source_geometry_geojson, '{"type":"LineString",');
});

test('src/app.js nunca desenha source_geometry_geojson', () => {
  // Para rodovia, `source_geometry_geojson` é a LineString do eixo oficial: a camada de
  // contorno não sabe desenhá-la, e usá-la por engano no lugar do corredor com buffer
  // seria um mapa vazio sem nenhum erro.
  // A checagem é sobre CÓDIGO, não sobre o texto do arquivo: comentar por que o campo
  // não é desenhado é exatamente o que se quer que exista ali. Comentários saem antes.
  const appSrc = read('../src/app.js')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  assert.equal(/\bsource_geometry_geojson\b/.test(appSrc), false,
    'source_geometry_geojson é procedência, não geometria de render');
});

test('o sandbox proíbe rede: as duas sincronizações não podem virar teste que chama a internet', () => {
  const { context } = createAppsScriptSandbox();
  assert.throws(() => context.UrlFetchApp.fetch('https://exemplo.invalido'), /não é permitido/);
  assert.throws(() => context.DriveApp.createFile({}), /não é permitido/);
});

test('as duas sincronizações e seus helpers existem depois da fusão', () => {
  const { context } = createAppsScriptSandbox();
  for (const fn of [
    'syncAdministrativeRegions_', 'syncRoadSegmentsFromTraffic_', 'validateGeoJsonSourceGeometry_',
    'sha256Hex_', 'sanitizePlainText_', 'canonicalRoadSegmentId_', 'polygonMetricsApprox_',
    'bufferLineGeometry_', 'supersedePolygonsOfEntity_',
  ]) {
    assert.equal(typeof context[fn], 'function', `${fn} não sobreviveu à fusão`);
  }
});

test('canonicalRoadSegmentId_ é estável e recusa código vazio', () => {
  const { context } = createAppsScriptSandbox();
  assert.equal(context.canonicalRoadSegmentId_('df-075/01'), 'ROADSEG_DF_075_01');
  assert.equal(context.canonicalRoadSegmentId_('  '), '');
});

test('sanitizePlainText_ tira marcação de texto vindo de API externa', () => {
  // Nome de rodovia e de RA vêm de serviço de terceiro e vão direto para uma célula da
  // planilha, que é lida pelo navegador de qualquer visitante.
  const { context } = createAppsScriptSandbox();
  assert.equal(context.sanitizePlainText_('<script>alert(1)</script>DF-075'), 'DF-075');
  assert.equal(context.sanitizePlainText_('Águas  <b>Claras</b>'), 'Águas Claras');
});

test('sha256Hex_ concorda com o id estável do importador de KML', () => {
  // stablePolygonId_ passou a reusar sha256Hex_; se os dois divergissem, reimportar o
  // mesmo KML deixaria de ser idempotente e duplicaria todos os contornos.
  const { context } = createAppsScriptSandbox();
  const seed = 'arquivo|0|contorno';
  assert.equal(
    context.stablePolygonId_('arquivo', { sourceIndex: 0, name: 'contorno' }),
    `POLY_${context.sha256Hex_(seed).slice(0, 24)}`,
  );
});

// ---------------------------------------------------------------------------
// Autorrevisão: os caminhos novos que devolvem número
// ---------------------------------------------------------------------------
//
// A pergunta destes testes não é "lança?", é "qual entrada faz isto devolver algo que
// PARECE certo e não é?". Os três casos abaixo saem com a ordem de grandeza correta
// quando estão errados, que é justamente o que impede alguém de desconfiar deles.

test('raNumberFromCode_ recusa romano malformado em vez de devolver número plausível', () => {
  const { context } = createAppsScriptSandbox();

  assert.equal(context.raNumberFromCode_('RA-XXIII'), 23);
  assert.equal(context.raNumberFromCode_('RA-I'), 1);
  assert.equal(context.raNumberFromCode_('XXXV'), 35);

  // `IIII` soma 4 e `IXX` soma 19 numa leitura ingênua: números plausíveis, RA errada
  // gravada em silêncio, porque é deles que sai o `ra_geo_id`.
  assert.equal(context.raNumberFromCode_('RA-IIII'), null);
  assert.equal(context.raNumberFromCode_('RA-IXX'), null);
  assert.equal(context.raNumberFromCode_('RA-VV'), null);
  assert.equal(context.raNumberFromCode_('RA-ABC'), null);
  assert.equal(context.raNumberFromCode_(''), null);

  // Round-trip para toda RA que o DF realmente tem.
  for (let n = 1; n <= 35; n++) {
    assert.equal(context.raNumberFromCode_(`RA-${context.numberToRoman_(n)}`), n, `RA ${n}`);
  }
});

test('a média diária de fluxo não dilui no denominador as linhas sem medição', () => {
  // Duas medições de 100 e 200 em quatro linhas: a média é 150, não 75. Dividir pelo
  // total de linhas devolve um número menor e com a mesma cara de média.
  const { context } = createAppsScriptSandbox({
    sheets: {
      TRAFFIC_DAILY_TEST: [
        ['traffic_daily_id', 'trecho', 'dia', 'fluxo_total'],
        ['T1', 'DF-075/01', '2026-08-01', 100],
        ['T2', 'DF-075/01', '2026-08-02', 200],
        ['T3', 'DF-075/01', '2026-08-03', ''],
        ['T4', 'DF-075/01', '2026-08-04', ''],
      ],
    },
  });

  const summary = context.trafficSummaryByCode_()['DF-075/01'];
  assert.equal(summary.rows, 4, 'as quatro linhas continuam contadas');
  assert.equal(summary.avgDailyFlow, 150);
  assert.equal(summary.minDate, '2026-08-01');
  assert.equal(summary.maxDate, '2026-08-04');
});

test('polygonMetricsApprox_ acerta a ordem de grandeza de uma área conhecida', () => {
  // Um quadrado de ~0,01° de lado perto de Brasília tem ~1,07 km de lado em latitude.
  // Um erro de projeção (esquecer o cos(lat), trocar grau por radiano) sai com número
  // finito e positivo — só a comparação com a área esperada pega.
  const { context } = createAppsScriptSandbox();
  const square = {
    type: 'Polygon',
    coordinates: [[[-47.90, -15.80], [-47.89, -15.80], [-47.89, -15.79], [-47.90, -15.79], [-47.90, -15.80]]],
  };
  const metrics = context.polygonMetricsApprox_(square);

  const sideNS = 0.01 * 111320;
  const sideEW = 0.01 * 111320 * Math.cos(-15.795 * Math.PI / 180);
  const expected = sideNS * sideEW;

  assert.ok(Math.abs(metrics.area_m2 - expected) / expected < 0.01,
    `área ${metrics.area_m2} longe da esperada ${expected}`);
  assert.ok(Math.abs(metrics.area_ha - metrics.area_m2 / 10000) < 1e-6);
  assert.ok(Math.abs(metrics.perimeter_m - 2 * (sideNS + sideEW)) / (2 * (sideNS + sideEW)) < 0.01);

  // Centroide dentro do quadrado.
  assert.ok(metrics.centroid_latitude > -15.80 && metrics.centroid_latitude < -15.79);
  assert.ok(metrics.centroid_longitude > -47.90 && metrics.centroid_longitude < -47.89);
});

test('polygonMetricsApprox_ ignora o buraco — limitação declarada, não surpresa', () => {
  // Documentar isto num teste é o que impede alguém de citar `area_m2` como medida.
  const { context } = createAppsScriptSandbox();
  const outer = [[-47.90, -15.80], [-47.89, -15.80], [-47.89, -15.79], [-47.90, -15.79], [-47.90, -15.80]];
  const hole = [[-47.898, -15.798], [-47.892, -15.798], [-47.892, -15.792], [-47.898, -15.792], [-47.898, -15.798]];

  const semBuraco = context.polygonMetricsApprox_({ type: 'Polygon', coordinates: [outer] });
  const comBuraco = context.polygonMetricsApprox_({ type: 'Polygon', coordinates: [outer, hole] });

  assert.equal(comBuraco.area_m2, semBuraco.area_m2,
    'a área do anel externo é a que sai; o buraco não é descontado');
});

test('o corredor rodoviário tem a largura pedida, não uma largura plausível qualquer', () => {
  // Um erro de fator 2 (raio vs. diâmetro) ou de unidade sai como um polígono válido,
  // desenhável e com aparência de rodovia — só a área denuncia.
  const { context } = createAppsScriptSandbox();
  const line = { type: 'LineString', coordinates: [[-47.90, -15.80], [-47.88, -15.80]] };
  const bufferM = 8;

  const corridor = context.bufferLineGeometry_(line, bufferM);
  assert.equal(corridor.type, 'Polygon');
  assert.equal(context.validateGeoJsonGeometry_(JSON.stringify(corridor)).ok, true);

  const length = context.lineGeometryLengthM_(line);
  const expected = length * 2 * bufferM; // buffer é por LADO
  const area = context.polygonMetricsApprox_(corridor).area_m2;
  assert.ok(Math.abs(area - expected) / expected < 0.05,
    `área do corredor ${area} não bate com ${expected} (comprimento ${length} × 2 × ${bufferM})`);
});

test('sincronizar RA sem área oficial NÃO apaga a densidade já gravada', () => {
  // P2 apontado na revisão cruzada da PR #69. A correção existe — `updateRaProfileFromGeometry_`
  // só atribui `area_km2`/`population_density_km2` quando há valor, e `applyUpdate_` itera
  // `Object.keys(fields)`, então chave ausente nunca toca a célula. Mas nada na suíte
  // quebrava se alguém reintroduzisse `fields.area_km2 = areaKm2 || ''` amanhã, e o
  // estrago seria PERDA DE DADO em silêncio: a densidade da planilha vira célula vazia
  // porque a camada oficial não devolveu a área NESTA execução.
  const headers = [
    'ra_geo_id', 'ra_name', 'ra_code', 'ra_number', 'population_total',
    'population_density_km2', 'area_km2', 'geometry_source_url', 'updated_at',
  ];
  const sandbox = createAppsScriptSandbox({
    sheets: {
      RA_PROFILES: [
        headers,
        ['RA_III', 'Taguatinga', 'RA III', 3, 222598, 2938.4, 75.75, 'https://exemplo', ''],
      ],
    },
    scriptProperties: {},
  });

  sandbox.context.updateRaProfileFromGeometry_({
    ra_geo_id: 'RA_III', ra_name: 'Taguatinga', ra_code: 'RA III', ra_number: 3,
    ra_area_km2: null, // a camada oficial não trouxe a área nesta execução
  });

  const row = sandbox.sheets.RA_PROFILES._rows[1];
  const at = (name) => row[headers.indexOf(name)];
  assert.equal(at('population_density_km2'), 2938.4,
    'a densidade existente foi apagada por uma sincronização sem área');
  assert.equal(at('area_km2'), 75.75, 'a área existente foi apagada');
  // E o que a camada oficial DE FATO trouxe continua sendo gravado.
  assert.equal(at('ra_name'), 'Taguatinga');
  assert.equal(at('geometry_source_url'), sandbox.context.RA_BOUNDARY_LAYER_URL);
});

test('sincronizar RA COM área oficial recalcula a densidade', () => {
  // O outro lado: a guarda não pode ter virado "nunca escreve".
  const headers = [
    'ra_geo_id', 'ra_name', 'ra_code', 'ra_number', 'population_total',
    'population_density_km2', 'area_km2', 'geometry_source_url', 'updated_at',
  ];
  const sandbox = createAppsScriptSandbox({
    sheets: {
      RA_PROFILES: [headers, ['RA_III', 'Taguatinga', 'RA III', 3, 200000, 1000, 10, '', '']],
    },
    scriptProperties: {},
  });

  sandbox.context.updateRaProfileFromGeometry_({
    ra_geo_id: 'RA_III', ra_name: 'Taguatinga', ra_code: 'RA III', ra_number: 3,
    ra_area_km2: 50,
  });

  const row = sandbox.sheets.RA_PROFILES._rows[1];
  assert.equal(row[headers.indexOf('area_km2')], 50);
  assert.equal(row[headers.indexOf('population_density_km2')], 4000);
});
