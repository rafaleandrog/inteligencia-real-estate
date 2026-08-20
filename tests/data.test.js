import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseGvizResponse, gvizTableToRows, gvizUrl, resolveStrategy, flattenEntities,
  REQUIRED_ENTITIES,
} from '../src/data.js';
import { normalizeAll } from '../src/normalize.js';
import { computeKpis, applyFilters, createFilterState } from '../src/filters.js';

const demo = JSON.parse(readFileSync(new URL('../data/demo.json', import.meta.url)));

test('parseGvizResponse recorta o envelope do GViz', () => {
  const body = `/*O_o*/\ngoogle.visualization.Query.setResponse({"status":"ok","table":{"cols":[],"rows":[]}});`;
  assert.equal(parseGvizResponse(body).status, 'ok');
});

test('parseGvizResponse falha de forma legível com resposta inesperada', () => {
  // Acontece quando a planilha não é pública: vem HTML de login, não JSON.
  assert.throws(() => parseGvizResponse('<html>login</html>'), /formato inesperado/);
  assert.throws(() => parseGvizResponse(''), /formato inesperado/);
});

test('gvizTableToRows usa o label da coluna e prefere o valor bruto', () => {
  const rows = gvizTableToRows({
    cols: [{ id: 'A', label: 'listing_id' }, { id: 'B', label: 'asking_price_brl' }],
    rows: [{ c: [{ v: 'LIST_1' }, { v: 2500000, f: 'R$ 2.500.000' }] }],
  });

  // O bruto traz o número; o formatado traria a string já com pontuação da planilha.
  assert.deepEqual(rows, [{ listing_id: 'LIST_1', asking_price_brl: 2500000 }]);
});

test('gvizTableToRows tolera célula nula e coluna sem label', () => {
  const rows = gvizTableToRows({
    cols: [{ id: 'A', label: '' }, { id: 'B', label: 'x' }],
    rows: [{ c: [null, undefined] }, { c: [] }],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].A, '');
  assert.equal(rows[0].x, '');
});

test('gvizTableToRows devolve lista vazia para tabela ausente', () => {
  assert.deepEqual(gvizTableToRows(null), []);
  assert.deepEqual(gvizTableToRows({}), []);
});

test('gvizUrl escapa nome de aba', () => {
  const url = gvizUrl('ABC123', 'PRIMARY MARKET');
  assert.match(url, /\/d\/ABC123\/gviz\/tq/);
  assert.match(url, /sheet=PRIMARY%20MARKET/);
});

test('resolveStrategy: demoMode vence e valor inválido cai em gviz', () => {
  assert.equal(resolveStrategy({ demoMode: true, dataSource: 'gviz' }), 'demo');
  assert.equal(resolveStrategy({ demoMode: false, dataSource: 'gviz' }), 'gviz');
  assert.equal(resolveStrategy({ dataSource: 'appsscript' }), 'appsscript');

  // Erro de digitação não pode fazer o site servir demo achando que é produção (R2.3).
  assert.equal(resolveStrategy({ dataSource: 'gvis' }), 'gviz');
  assert.equal(resolveStrategy({}), 'gviz');
});

test('demo.json tem as quatro entidades obrigatórias preenchidas', () => {
  for (const entity of REQUIRED_ENTITIES) {
    assert.ok(Array.isArray(demo[entity]), `${entity} deve ser array`);
    assert.ok(demo[entity].length > 0, `${entity} não pode estar vazia`);
  }
  assert.match(demo.meta.note, /DEMONSTRAÇÃO/, 'o demo precisa se identificar como demo');
});

test('demo.json normaliza sem descartar registro', () => {
  for (const entity of REQUIRED_ENTITIES) {
    const { records, dropped } = normalizeAll(entity, demo[entity]);
    assert.equal(dropped, 0, `${entity}: ${dropped} registro(s) sem ID`);
    assert.equal(records.length, demo[entity].length);

    // IDs únicos são requisito do contrato (R3.3).
    const ids = new Set(records.map((r) => r.id));
    assert.equal(ids.size, records.length, `${entity} tem ID duplicado`);
  }
});

test('demo.json preserva a qualidade espacial dos anúncios', () => {
  const { records } = normalizeAll('listings', demo.listings);
  const semDeclaracao = records.filter((r) => !r.confidence_flag && !r.coordinate_precision);
  assert.equal(semDeclaracao.length, 0, 'todo anúncio declara confiança e precisão (R3.5)');
});

test('demo.json produz KPIs coerentes', () => {
  const entities = {};
  for (const entity of REQUIRED_ENTITIES) entities[entity] = normalizeAll(entity, demo[entity]).records;

  const all = flattenEntities(entities);
  const kpis = computeKpis(all);

  assert.equal(kpis.visible, all.length);
  assert.equal(kpis.mappable + kpis.withoutCoord, kpis.visible);
  assert.ok(kpis.medianPriceM2 > 0, 'a mediana de preço/m² precisa ser positiva');
  assert.ok(Number.isFinite(kpis.medianPriceM2), 'nunca NaN');

  // Empreendimentos sem coordenada existem de verdade neste dataset. Se um dia
  // sumirem, este teste avisa que a suposição mudou.
  assert.ok(kpis.withoutCoord > 0, 'o dataset tem registro sem coordenada');
});

test('filtrar o demo reduz o conjunto de forma monotônica', () => {
  const entities = {};
  for (const entity of REQUIRED_ENTITIES) entities[entity] = normalizeAll(entity, demo[entity]).records;
  const all = flattenEntities(entities);

  const semFiltro = applyFilters(all, createFilterState()).length;
  const comLocalidade = applyFilters(all, { ...createFilterState(), locality: 'Asa Norte' }).length;
  const comTeto = applyFilters(all, { ...createFilterState(), priceMax: 1000000 }).length;

  assert.equal(semFiltro, all.length);
  assert.ok(comLocalidade > 0 && comLocalidade < semFiltro, 'filtrar por localidade reduz');
  assert.ok(comTeto > 0 && comTeto < semFiltro, 'filtrar por preço reduz');
});

test('flattenEntities tolera entidade ausente', () => {
  assert.deepEqual(flattenEntities({}), []);
  assert.deepEqual(flattenEntities({ listings: [{ id: 'a' }] }), [{ id: 'a' }]);
});

test('ok é falso quando falta entidade obrigatória', async () => {
  // Regressão: `ok` se baseava no total de registros, então uma aba obrigatória
  // ausente com as outras carregadas ainda devolvia ok=true, e a interface
  // apresentava dataset parcial como sucesso.
  const { loadDataset } = await import('../src/data.js');

  const config = {
    demoMode: true,
    demoUrl: 'inline',
    sheets: { listings: 'LISTINGS', developments: 'DEVELOPMENTS', anchors: 'ANCHORS', primaryMarket: 'PRIMARY_MARKET' },
  };

  const original = globalThis.fetch;
  const respondWith = (payload) => {
    globalThis.fetch = async () => ({ ok: true, json: async () => payload });
  };

  try {
    // Falta primaryMarket: as outras três carregam, mas o dataset está incompleto.
    respondWith({
      listings: [{ listing_id: 'A' }],
      developments: [{ development_id: 'B' }],
      anchors: [{ place_id: 'C' }],
    });
    const partial = await loadDataset(config);
    assert.equal(partial.ok, false, 'dataset parcial não pode ser ok');
    assert.ok(partial.errors.some((e) => /PRIMARY_MARKET/.test(e)), 'a aba faltante precisa aparecer em errors');

    // Com as quatro presentes, ok.
    respondWith({
      listings: [{ listing_id: 'A' }],
      developments: [{ development_id: 'B' }],
      anchors: [{ place_id: 'C' }],
      primaryMarket: [{ id: 'D' }],
    });
    const complete = await loadDataset(config);
    assert.equal(complete.ok, true);
    assert.deepEqual(complete.errors, []);
  } finally {
    globalThis.fetch = original;
  }
});

test('demo.json entrega expected_delivery como data ISO', () => {
  const comEntrega = demo.developments.filter((r) => r.expected_delivery);
  assert.ok(comEntrega.length > 0, 'o dataset tem entrega prevista');
  for (const row of comEntrega) {
    assert.match(String(row.expected_delivery), /^\d{4}-\d{2}-\d{2}$/,
      `expected_delivery cru: ${row.expected_delivery}`);
  }
});
