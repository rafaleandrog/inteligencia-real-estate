// Contrato dos arquivos públicos nos três lugares que o declaram (issue #149): schemas em
// data/public/schemas (executáveis, do pipeline), módulos do cliente e docs/DATA_CONTRACT.md.
// Quando um deles muda sozinho, este teste é o que avisa.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MANIFEST_SCHEMA_VERSION, FILE_ROLES } from '../src/territorio/manifest.js';
import { RA_AGGREGATE_COLUMNS } from '../src/territorio/aggregates.js';
import { TERRITORY_LAYERS, RAMPS } from '../src/territorio/layers.js';
import { DATASET_PERCENT_SCALE, PERCENT_SCALES } from '../src/format.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const manifestSchema = JSON.parse(read('../data/public/schemas/manifest.schema.json'));
const contrato = read('../docs/DATA_CONTRACT.md');

test('versão do manifest e papéis de arquivo: cliente e schema dizem a mesma coisa', () => {
  assert.equal(manifestSchema.properties.manifest_version.const, MANIFEST_SCHEMA_VERSION);
  const roles = manifestSchema.properties.datasets.items.properties.files.items.properties.role.enum;
  assert.deepEqual([...roles].sort(), [...FILE_ROLES].sort());
});

test('escalas declaradas: agregados em fração decimal, centralidade em pontos', () => {
  assert.equal(DATASET_PERCENT_SCALE.RA_AGGREGATES, PERCENT_SCALES.DECIMAL);
  assert.equal(DATASET_PERCENT_SCALE.PUBLIC_CENTRALITY, PERCENT_SCALES.POINTS);
  assert.notEqual(DATASET_PERCENT_SCALE.RA_AGGREGATES, DATASET_PERCENT_SCALE.PUBLIC_CENTRALITY);
  assert.match(contrato, /`RA_AGGREGATES` decimal/);
  assert.match(contrato, /`PUBLIC_CENTRALITY` pontos/);
});

test('toda coluna de ra_aggregates está documentada na seção do contrato', () => {
  const inicio = contrato.indexOf('### ra_aggregates');
  assert.ok(inicio > 0, 'seção ### ra_aggregates ausente');
  const fim = contrato.indexOf('\n---', inicio);
  const secao = contrato.slice(inicio, fim);
  const faltando = RA_AGGREGATE_COLUMNS.filter((col) => !secao.includes(`\`${col}\``));
  assert.deepEqual(faltando, [], 'colunas do cliente sem linha no contrato');
});

test('cada métrica de camada tem a chave de classe e a rampa descritas no contrato', () => {
  for (const layer of TERRITORY_LAYERS) {
    const inicio = contrato.indexOf(`### ${layer.datasetId}`);
    assert.ok(inicio > 0, `seção ### ${layer.datasetId} ausente`);
    const secao = contrato.slice(inicio, contrato.indexOf('\n---', inicio));
    for (const metric of layer.metrics) {
      assert.ok(secao.includes(`\`${metric.key}\``), `${layer.datasetId}: ${metric.key} fora do contrato`);
    }
    assert.ok(RAMPS[layer.ramp] >= 2);
  }
});

test('config.js aponta os arquivos públicos para um caminho relativo da mesma origem', () => {
  const config = read('../src/config.js');
  const url = config.match(/publicDataUrl:\s*'([^']*)'/);
  assert.ok(url, 'publicDataUrl ausente em src/config.js');
  assert.match(url[1], /^\.\/[^:]*\/$/, 'publicDataUrl precisa ser relativo e terminar em barra');
  assert.match(config, /publicManifestFile:\s*'manifest\.json'/);
});
