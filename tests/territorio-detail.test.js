// Painel de detalhe das feições territoriais (issue #150): essencial ≤ 6 linhas (R8.61),
// RA pelo nome só pela ponte, procedência no nível técnico, nada inventado.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { territoryDetailTiers, territoryTooltipText, ESSENTIAL_MAX_ROWS } from '../src/territorio/detail.js';
import { layerById, metricFor } from '../src/territorio/layers.js';
import { normalizeManifest, datasetById, fileFor } from '../src/territorio/manifest.js';
import { buildRaCrosswalk, EMPTY_CROSSWALK } from '../src/territorio/ra-keys.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const { manifest } = normalizeManifest(read('./fixtures/public/manifest.json'));
const CW = buildRaCrosswalk(read('./fixtures/public/ra_crosswalk.json').rows);
const OVERVIEW = read('./fixtures/public/households_grid/overview_1km.json');
const SHARD = read('./fixtures/public/households_grid/detail_200m/RA_11.json');

test('célula de 200 m: título, essencial com ano/fonte, RA pelo nome, classe e procedência', () => {
  const layer = layerById('households_grid');
  const dataset = datasetById(manifest, 'households_grid');
  const file = fileFor(dataset, { role: 'overview' });
  const feature = SHARD.features[0];
  const tiers = territoryDetailTiers(layer, feature.properties, { dataset, file, integrity: 'sha256 conferido', crosswalk: CW });
  assert.match(tiers.title, /^Célula de 200 m · /);
  assert.ok(tiers.essencial.length >= 1 && tiers.essencial.length <= ESSENTIAL_MAX_ROWS, `${tiers.essencial.length} linhas`);
  const labels = tiers.essencial.map((r) => r.label);
  assert.ok(labels.includes('Domicílios novos por km² (2010→2022)'));
  assert.ok(labels.includes('Região Administrativa'));
  const ra = tiers.essencial.find((r) => r.label === 'Região Administrativa');
  assert.equal(ra.value, 'Cruzeiro (RA_11)');
  const classe = tiers.essencial.find((r) => r.label === 'Classe no mapa');
  assert.match(classe.value, /^\d de 6 · /);
  assert.ok(tiers.essencial.every((r) => !/_/.test(r.label)), 'nenhuma chave crua no essencial');
  assert.ok(tiers.essencial.some((r) => r.title && /IBGE/.test(r.title)), 'a fonte viaja no title');
  const tecnico = tiers.tecnico.map((r) => r.label);
  assert.deepEqual(tecnico.slice(0, 3), ['Conjunto', 'Versão publicada', 'Gerado em']);
  assert.ok(tecnico.includes('Fonte') && tecnico.includes('Licença') && tecnico.includes('Arquivo') && tecnico.includes('Integridade'));
  assert.ok(tiers.complementar.some((r) => r.label === 'Tamanho da célula' && r.value === '200 m'));
});

test('célula de 1 km (overview) mostra as filhas somadas; sem ponte, a RA sai como chave crua', () => {
  const layer = layerById('households_grid');
  const dataset = datasetById(manifest, 'households_grid');
  const feature = OVERVIEW.features.find((f) => f.properties.children > 0) || OVERVIEW.features[0];
  const tiers = territoryDetailTiers(layer, feature.properties, { dataset, crosswalk: EMPTY_CROSSWALK });
  assert.match(tiers.title, /^Célula de 1 km · /);
  const ra = tiers.essencial.find((r) => r.label === 'Região Administrativa');
  assert.ok(ra && (/^RA_\d{2}$/.test(ra.value) || ra.value === 'fora dos limites oficiais'), ra && ra.value);
  if (feature.properties.children > 0) {
    assert.ok(tiers.complementar.some((r) => r.label === 'Células de 200 m somadas'));
  }
});

test('ausência vira linha omitida, nunca travessão nem zero; sem dataset o técnico fica vazio', () => {
  const layer = layerById('households_grid');
  const tiers = territoryDetailTiers(layer, { cell_id: 'X', cell_size: '200M', dom_ocu_2010: null, dom_ocu_2022: null, households_delta_per_km2: null, ra_geo_id: null, quality_flags: ['cell_missing_2010'] });
  assert.ok(!tiers.essencial.some((r) => r.label.startsWith('Domicílios novos')));
  assert.ok(!tiers.essencial.some((r) => r.label === 'Classe no mapa'));
  assert.equal(tiers.essencial.find((r) => r.label === 'Região Administrativa').value, 'fora dos limites oficiais');
  assert.equal(tiers.complementar.find((r) => r.label === 'Qualidade').value, 'célula ausente na grade de 2010');
  assert.deepEqual(tiers.tecnico, []);
  assert.deepEqual(territoryDetailTiers({ id: 'desconhecida', title: 'X' }, {}).essencial, []);
});

test('hexágono de empregos e aresta de centralidade têm construtores próprios', () => {
  const jobs = layerById('jobs_hex');
  const hex = read('./fixtures/public/jobs_hex/detail_r9/RA_11.json').features[0];
  const tj = territoryDetailTiers(jobs, hex.properties, { dataset: datasetById(manifest, 'jobs_hex'), crosswalk: CW });
  assert.match(tj.title, /^Hexágono H3 · /);
  assert.ok(tj.essencial.some((r) => /^Empregos formais/.test(r.label)));
  assert.ok(tj.essencial.length <= ESSENTIAL_MAX_ROWS);
  const vias = layerById('road_centrality');
  const edge = read('./fixtures/public/road_centrality/detail.json').features[0];
  const tv = territoryDetailTiers(vias, edge.properties, { dataset: datasetById(manifest, 'road_centrality'), crosswalk: CW });
  assert.ok(tv.essencial.some((r) => r.label === 'Centralidade (percentil)'));
  assert.ok(tv.essencial.length <= ESSENTIAL_MAX_ROWS);
});

test('territoryTooltipText: valor com unidade e RA; "sem dado" quando falta', () => {
  const layer = layerById('households_grid');
  const metric = metricFor(layer);
  assert.equal(territoryTooltipText(layer, metric, { households_delta_per_km2: 1234.56, ra_geo_id: 'RA_19' }, { crosswalk: CW }),
    'Domicílios novos por km²: 1.234,6 dom./km² · Candangolândia (RA_19)');
  assert.equal(territoryTooltipText(layer, metric, { households_delta_per_km2: null, ra_geo_id: null }),
    'Domicílios novos por km²: sem dado · fora dos limites oficiais');
  const abs = metricFor(layer, 'households_delta');
  assert.equal(territoryTooltipText(layer, abs, { households_delta: 42, ra_geo_id: 'RA_11' }), 'Domicílios novos (absoluto): 42 dom. · RA_11');
});

test('a linha "Classe no mapa" é da métrica ATIVA, não da padrão (achado da revisão da PR #157)', () => {
  const layer = layerById('households_grid');
  const dataset = datasetById(manifest, 'households_grid');
  const props = { ...SHARD.features[0].properties, households_delta: 100, households_delta_per_km2: 2500 };
  const padrao = territoryDetailTiers(layer, props, { dataset, crosswalk: CW });
  assert.equal(padrao.essencial.find((r) => r.label === 'Classe no mapa').value, '6 de 6 · mais de 2.000');
  const absoluto = territoryDetailTiers(layer, props, { dataset, crosswalk: CW, metric: metricFor(layer, 'households_delta') });
  const linha = absoluto.essencial.find((r) => r.label.startsWith('Classe no mapa'));
  assert.equal(linha.label, 'Classe no mapa (Domicílios novos (absoluto))');
  assert.equal(linha.value, '6 de 6 · mais de 80');
  const jobs = layerById('jobs_hex');
  const hex = { ...read('./fixtures/public/jobs_hex/detail_r9/RA_11.json').features[0].properties, jobs_total: 6000, jobs_high: 30 };
  const alta = territoryDetailTiers(jobs, hex, { dataset: datasetById(manifest, 'jobs_hex'), crosswalk: CW, metric: metricFor(jobs, 'jobs_high') });
  assert.equal(alta.essencial.find((r) => r.label.startsWith('Classe no mapa')).value, '2 de 10 · 25 a 50');
  const zero = territoryDetailTiers(jobs, { ...hex, jobs_high: 0 }, { dataset: datasetById(manifest, 'jobs_hex'), crosswalk: CW, metric: metricFor(jobs, 'jobs_high') });
  assert.ok(!zero.essencial.some((r) => r.label.startsWith('Classe no mapa')), 'zero é ausência: sem classe');
});

test('tooltip: zero numa métrica com zero-ausente diz "sem dado (zero)"', () => {
  const jobs = layerById('jobs_hex');
  assert.equal(territoryTooltipText(jobs, metricFor(jobs, 'jobs_high'), { jobs_high: 0, ra_geo_id: 'RA_11' }, { crosswalk: CW }), 'Empregos · renda alta: sem dado (zero) · Cruzeiro (RA_11)');
  assert.equal(territoryTooltipText(jobs, metricFor(jobs, 'jobs_high'), { jobs_high: 7, ra_geo_id: 'RA_11' }, { crosswalk: CW }), 'Empregos · renda alta: 7 empregos · Cruzeiro (RA_11)');
});
