// Guard: as três abas de tráfego precisam estar na allowlist do Apps Script.
//
// Achado real do Codex na PR #67: ALLOWED_DATASETS = REQUIRED_SHEETS.concat(
// OPTIONAL_SHEETS), e o OPTIONAL_SHEETS deste repositório (Code.gs v2.0.2, desatualizado
// em relação à v2.2.0 real que roda na planilha) não listava ROAD_SEGMENTS,
// ROAD_SEGMENT_ALIASES nem TRAFFIC_DAILY_TEST. Com dataSource: 'appsscript',
// dataset_() recusava as três com "dataset não permitido", o erro virava aviso
// (comportamento correto para aba opcional — R2.5) e loadDataset() reportava sucesso
// com `traffic` sempre vazio. Nenhum erro aparecia: exatamente o "plausível e errado"
// que este projeto existe para evitar.
//
// Roda o Code.gs de verdade no sandbox de vm (tests/helpers/appsScriptSandbox.mjs),
// não uma cópia da lista — se alguém reescrever OPTIONAL_SHEETS e deixar uma das três
// de fora (inclusive a reescrita completa da issue #50/v2.2.1), este teste quebra na
// hora em vez de o resultado virar `traffic` vazio em silêncio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppsScriptSandbox, readJsonOutput } from './helpers/appsScriptSandbox.mjs';

const TRAFFIC_SHEETS = ['ROAD_SEGMENTS', 'ROAD_SEGMENT_ALIASES', 'TRAFFIC_DAILY_TEST'];

test('as três abas de tráfego estão em ALLOWED_DATASETS', () => {
  const { context } = createAppsScriptSandbox({ sheets: {} });
  for (const sheet of TRAFFIC_SHEETS) {
    assert.ok(
      context.ALLOWED_DATASETS.indexOf(sheet) !== -1,
      `${sheet} precisa estar em ALLOWED_DATASETS (OPTIONAL_SHEETS), senão dataset_() a recusa em silêncio`
    );
  }
});

test('dataset_() aceita as três abas de tráfego em vez de "dataset não permitido"', () => {
  const { context } = createAppsScriptSandbox({
    sheets: {
      ROAD_SEGMENTS: [['road_segment_id', 'road_name'], ['RS-1', 'DF-001']],
      ROAD_SEGMENT_ALIASES: [['road_segment_id', 'source_segment_code'], ['RS-1', 'DER-001']],
      TRAFFIC_DAILY_TEST: [['road_segment_id', 'dia'], ['RS-1', '2026-04-01']],
    },
  });

  for (const sheet of TRAFFIC_SHEETS) {
    const result = context.dataset_(sheet);
    assert.notEqual(result.error, 'dataset não permitido', `${sheet} não pode ser recusado pela allowlist`);
    assert.equal(result.rows.length, 1, `${sheet} devia devolver a linha carregada`);
  }
});

test('doGet ?resource=dataset&name=ROAD_SEGMENTS não devolve erro de allowlist (endpoint real)', () => {
  const { context } = createAppsScriptSandbox({
    sheets: { ROAD_SEGMENTS: [['road_segment_id', 'road_name'], ['RS-1', 'DF-001']] },
  });

  const res = readJsonOutput(context.doGet({
    parameter: { resource: 'dataset', name: 'ROAD_SEGMENTS' },
  }));
  assert.notEqual(res.error, 'dataset não permitido');
  assert.ok(Array.isArray(res.rows), 'endpoint real precisa devolver rows para ROAD_SEGMENTS');
});
