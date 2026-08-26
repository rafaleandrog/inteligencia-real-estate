import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppsScriptSandbox, readJsonOutput } from './helpers/appsScriptSandbox.mjs';
import {
  ringFromLatLngs, distinctCount, validateRing, buildPolygonGeoJSON, buildPolygonFields,
} from '../src/admin/polygon-draw.js';

// A validação do cliente existe para o erro aparecer em português, no lugar certo, sem
// uma ida ao Apps Script. Isso só vale se ela concordar com o servidor: uma validação
// mais frouxa deixa passar o que o servidor rejeita (erro opaco), e uma mais estrita
// recusa o que o servidor aceitaria (funcionalidade perdida em silêncio). Estes testes
// executam o Code.gs real no sandbox e confrontam os dois lados caso a caso.

const POLYGON_HEADERS = [
  'polygon_id', 'name', 'category', 'geometry_geojson', 'color', 'description',
  'properties_json', 'source_url', 'source_file', 'imported_at', 'status',
];

function serverAccepts(geometry) {
  const { context } = createAppsScriptSandbox({
    sheets: { POLYGONS: [POLYGON_HEADERS], APP_META: [['key', 'value', 'updated_at']] },
    scriptProperties: { ADMIN_TOKEN: 'secret-token', DATASET_VERSION: '1' },
  });
  const res = readJsonOutput(context.doPost({
    postData: {
      contents: JSON.stringify({
        token: 'secret-token', action: 'create', sheet: 'POLYGONS', expected_version: '1',
        fields: { name: 'Teste', geometry_geojson: JSON.stringify(geometry) },
      }),
    },
  }));
  return res.ok === true;
}

const ll = (lat, lng) => ({ lat, lng });

const TRIANGULO = [ll(-15.8, -47.9), ll(-15.8, -47.8), ll(-15.7, -47.8)];

test('ringFromLatLngs inverte para [longitude, latitude]', () => {
  const ring = ringFromLatLngs([ll(-15.8, -47.9), ll(-15.8, -47.8), ll(-15.7, -47.8)]);
  // Longitude primeiro. Trocar isto põe Brasília na Somália.
  assert.deepEqual(ring[0], [-47.9, -15.8]);
});

test('ringFromLatLngs fecha o anel repetindo a primeira posição', () => {
  const ring = ringFromLatLngs(TRIANGULO);
  assert.equal(ring.length, 4, 'três cantos viram quatro posições');
  assert.deepEqual(ring[0], ring[ring.length - 1]);
});

test('ringFromLatLngs não fecha duas vezes um anel já fechado', () => {
  const jaFechado = [...TRIANGULO, ll(-15.8, -47.9)];
  assert.equal(ringFromLatLngs(jaFechado).length, 4);
});

test('ringFromLatLngs descarta ponto sem coordenada em vez de gerar NaN', () => {
  const ring = ringFromLatLngs([ll(-15.8, -47.9), null, ll(-15.8, NaN), ll(-15.8, -47.8), ll(-15.7, -47.8)]);
  assert.equal(ring.length, 4);
  assert.equal(ring.flat().every(Number.isFinite), true);
});

test('ringFromLatLngs aguenta entrada vazia ou inválida sem lançar', () => {
  for (const input of [null, undefined, [], 'texto', 42]) {
    assert.deepEqual(ringFromLatLngs(input), [], JSON.stringify(input));
  }
});

test('distinctCount ignora o fechamento', () => {
  assert.equal(distinctCount(ringFromLatLngs(TRIANGULO)), 3);
});

test('validateRing devolve null para um triângulo fechado', () => {
  assert.equal(validateRing(ringFromLatLngs(TRIANGULO)), null);
});

test('validateRing recusa desenho com menos de três cantos, com mensagem legível', () => {
  for (const pontos of [[], [ll(-15.8, -47.9)], [ll(-15.8, -47.9), ll(-15.8, -47.8)]]) {
    const message = validateRing(ringFromLatLngs(pontos));
    assert.ok(message, `${pontos.length} canto(s) deveria ser recusado`);
    assert.equal(/[A-Z]/.test(message[0]), true, 'a mensagem é texto, não código de erro');
    assert.equal(/INVALID_PAYLOAD|undefined|NaN/.test(message), false, message);
  }
});

test('validateRing recusa três cliques no mesmo lugar — não há área', () => {
  const message = validateRing(ringFromLatLngs([ll(-15.8, -47.9), ll(-15.8, -47.9), ll(-15.8, -47.9)]));
  assert.ok(message);
  assert.match(message, /área|distinto/i);
});

test('buildPolygonGeoJSON devolve null em vez de geometria pela metade', () => {
  assert.equal(buildPolygonGeoJSON([ll(-15.8, -47.9), ll(-15.8, -47.8)]), null);
  assert.equal(buildPolygonGeoJSON([]), null);
});

// --- paridade com o servidor ------------------------------------------------------

test('toda geometria que o cliente monta é aceita pelo servidor', () => {
  const casos = [
    TRIANGULO,
    [ll(-15.9, -48.0), ll(-15.9, -47.7), ll(-15.6, -47.7), ll(-15.6, -48.0)],
    [ll(0, 0), ll(0, 1), ll(1, 1)],
    [ll(-89.9, -179.9), ll(-89.9, 179.9), ll(89.9, 179.9)],
  ];

  for (const pontos of casos) {
    const geometry = buildPolygonGeoJSON(pontos);
    assert.ok(geometry, `o cliente recusou um desenho válido: ${JSON.stringify(pontos)}`);
    assert.equal(serverAccepts(geometry), true, `o servidor recusou: ${JSON.stringify(geometry)}`);
  }
});

test('toda geometria que o cliente recusa, o servidor também recusaria', () => {
  const recusados = [
    [ll(-15.8, -47.9), ll(-15.8, -47.8)],                       // dois cantos
    [ll(-15.8, -47.9), ll(-15.8, -47.9), ll(-15.8, -47.9)],     // sem área
    [],
  ];

  for (const pontos of recusados) {
    assert.equal(buildPolygonGeoJSON(pontos), null, `o cliente aceitou ${JSON.stringify(pontos)}`);

    // O que o cliente recusou nem chega ao servidor — mas se chegasse, seria recusado
    // lá também. É essa concordância que faz a validação do cliente ser um atalho
    // honesto, e não uma segunda regra de negócio divergindo em silêncio.
    const ring = ringFromLatLngs(pontos);
    if (ring.length === 0) continue;
    assert.equal(serverAccepts({ type: 'Polygon', coordinates: [ring] }), false,
      `o servidor aceitaria o que o cliente recusou: ${JSON.stringify(ring)}`);
  }
});

// --- campos enviados ---------------------------------------------------------------

test('buildPolygonFields não disputa com o servidor os campos que são dele', () => {
  const fields = buildPolygonFields({ name: '  Setor X  ', latlngs: TRIANGULO });

  assert.equal(fields.name, 'Setor X', 'o nome é aparado');
  assert.equal('polygon_id' in fields, false, 'o id é gerado pelo servidor');
  assert.equal('imported_at' in fields, false, 'a data é do servidor');
  assert.equal('source_file' in fields, false, 'o arquivo de origem é do servidor');
  assert.equal(fields.status, 'active');
});

test('buildPolygonFields omite campo opcional vazio em vez de mandar string vazia', () => {
  const fields = buildPolygonFields({ name: 'X', category: '', color: '', description: '', latlngs: TRIANGULO });
  for (const key of ['category', 'color', 'description']) {
    assert.equal(key in fields, false, `${key} vazio não devia ser enviado`);
  }
});

test('buildPolygonFields devolve null quando o desenho não é válido', () => {
  assert.equal(buildPolygonFields({ name: 'X', latlngs: [ll(-15.8, -47.9)] }), null);
});

test('o payload montado pelo cliente é aceito pelo servidor de ponta a ponta', () => {
  const fields = buildPolygonFields({
    name: 'Setor de teste', category: 'estudo', color: '#336699',
    description: 'desenhado à mão', latlngs: TRIANGULO,
  });

  const { context, sheets } = createAppsScriptSandbox({
    sheets: { POLYGONS: [POLYGON_HEADERS], APP_META: [['key', 'value', 'updated_at']] },
    scriptProperties: { ADMIN_TOKEN: 'secret-token', DATASET_VERSION: '1' },
  });
  const res = readJsonOutput(context.doPost({
    postData: {
      contents: JSON.stringify({
        token: 'secret-token', action: 'create', sheet: 'POLYGONS',
        expected_version: '1', fields,
      }),
    },
  }));

  assert.equal(res.ok, true, `esperado sucesso, veio ${JSON.stringify(res.error)}`);
  assert.equal(sheets.POLYGONS._rows.length, 2, 'a linha precisa ter sido gravada');
  assert.match(res.record.polygon_id, /^POLY_/, 'o id é gerado pelo servidor');
});
