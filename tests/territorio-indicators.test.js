// Os indicadores territoriais dentro do vocabulário do PDAD (issue #153): o Ranking e a
// dispersão leem `attr` da RA do jeito que `rankScalar` já sabe, e cada número cruzado
// carrega fórmula e fonte.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PDAD_RANK_SET, PDAD_SCATTER_VIEWS } from '../src/pdad/indicators.js';
import { rankScalar } from '../src/pdad/aggregate.js';
import { TERRITORY_INDICATORS, attachTerritory, normalizeRaAggregates, formatByUnit } from '../src/territorio/aggregates.js';
import { buildRaCrosswalk } from '../src/territorio/ra-keys.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const CW = buildRaCrosswalk(read('./fixtures/public/ra_crosswalk.json').rows);
const { byRa } = normalizeRaAggregates(read('./fixtures/public/ra_aggregates.json').rows, CW);

test('PDAD_RANK_SET traz todo indicador territorial, com attr, unidade formatável, fórmula e fonte', () => {
  for (const ind of TERRITORY_INDICATORS) {
    const item = PDAD_RANK_SET.find((i) => i.id === ind.id);
    assert.ok(item, `${ind.id} fora do PDAD_RANK_SET`);
    assert.equal(item.attr, ind.attr);
    assert.equal(item.key, undefined, 'indicador territorial não tem figura do PDAD para o drill-down');
    assert.ok(item.formula && item.source && item.tema, `${ind.id} sem fórmula/fonte/tema`);
    assert.doesNotThrow(() => formatByUnit(item.unit, 1));
  }
  const ids = PDAD_RANK_SET.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'ids únicos');
});

test('rankScalar lê o valor anexado por attachTerritory, e ausência continua null', () => {
  const index = attachTerritory({ 2024: { RA_11: { raGeoId: 'RA_11', raName: 'Cruzeiro', indicators: {} }, RA_01: { raGeoId: 'RA_01', raName: 'Plano Piloto', indicators: {} } } }, byRa);
  const item = PDAD_RANK_SET.find((i) => i.id === 'jobsPer1000');
  assert.equal(rankScalar(index[2024].RA_11, item), 18000);
  assert.equal(rankScalar(index[2024].RA_01, item), null);
});

test('as leituras cruzadas da dispersão apontam para atributos que attachTerritory fornece, com unidade', () => {
  for (const id of ['cresc_vert', 'emprego_loc']) {
    const view = PDAD_SCATTER_VIEWS.find((v) => v.id === id);
    assert.ok(view, `${id} ausente`);
    assert.ok(TERRITORY_INDICATORS.some((i) => i.attr === view.x.attr), `${id}: eixo x fora dos atributos territoriais`);
    assert.ok(view.x.unit, `${id}: eixo x sem unidade declarada`);
    assert.doesNotThrow(() => formatByUnit(view.x.unit, 0.5));
    assert.ok(view.y.key && view.y.category, `${id}: eixo y precisa ser categoria do PDAD`);
    assert.match(view.insight, /IBGE|Ipea/, 'a fonte do eixo cruzado está no insight');
  }
});
