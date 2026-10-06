// Agregados por RA de data/public (issue #149): publicado prevalece, escala declarada,
// coluna fora do contrato vira aviso nomeado, unidade desconhecida lança.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  normalizeRaAggregates, RA_AGGREGATE_COLUMNS, TERRITORY_INDICATORS, formatByUnit, territoryProfileRows,
} from '../src/territorio/aggregates.js';
import { buildRaCrosswalk, EMPTY_CROSSWALK } from '../src/territorio/ra-keys.js';
import { formatBRL } from '../src/format.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const ROWS = read('./fixtures/public/ra_aggregates.json').rows;
const CW = buildRaCrosswalk(read('./fixtures/public/ra_crosswalk.json').rows);
const SCHEMA = read('../data/public/schemas/ra_aggregates.schema.json');

test('as colunas declaradas são exatamente as do schema publicado pelo pipeline', () => {
  const noSchema = Object.keys(SCHEMA.properties.rows.items.properties).sort();
  assert.deepEqual([...RA_AGGREGATE_COLUMNS].sort(), noSchema);
});

test('o ra_aggregates.json de fixture normaliza sem aviso, com fontes e anos', () => {
  const out = normalizeRaAggregates(ROWS, CW);
  assert.deepEqual(out.warnings, []);
  assert.deepEqual(out.rows.map((r) => r.raGeoId), ['RA_11', 'RA_19']);
  assert.equal(out.byRa.RA_11.householdsGrowthPct, 0.1143);
  assert.equal(out.byRa.RA_11.jobsPer1000Residents, 18000);
  assert.equal(out.byRa.RA_19.cellsPartial, 4);   // 2 de sempre + as duas filhas de 2022 sem 2010 (célula que mudou de resolução, #167)
  assert.deepEqual(out.byRa.RA_19.qualityFlags, ['partial_children']);
  assert.equal(out.byRa.RA_19.edgesCount, 3);
  assert.match(out.sources.households, /IBGE/);
  assert.match(out.sources.jobs, /Ipea/);
  assert.match(out.sources.centrality, /OpenStreetMap/);
  assert.deepEqual(out.years, [2019]);
});

test('RA fora da ponte é descartada; sem ponte carregada, tudo entra', () => {
  const extra = { ...ROWS[0], ra_geo_id: 'RA_07', ra_geo_id_roman: 'RA2026_RA-VII' };
  const comPonte = normalizeRaAggregates([...ROWS, extra], CW);
  assert.equal(comPonte.rows.length, 2);
  assert.ok(comPonte.warnings.some((w) => /RA_07/.test(w) && /ponte/.test(w)));
  const semPonte = normalizeRaAggregates([...ROWS, extra], EMPTY_CROSSWALK);
  assert.equal(semPonte.rows.length, 3);
  const duplicada = normalizeRaAggregates([...ROWS, { ...ROWS[0] }], CW);
  assert.equal(duplicada.rows.length, 2);
  assert.ok(duplicada.warnings.some((w) => /duas vezes/.test(w)));
  const invalida = normalizeRaAggregates([{ ra_geo_id: 'RA2026_RA-XI' }], CW);
  assert.equal(invalida.rows.length, 0);
  assert.ok(invalida.warnings.some((w) => /fora do padrão/.test(w)));
  assert.equal(normalizeRaAggregates(null).rows.length, 0);
});

test('coluna que o contrato não declara vira aviso COLUNA_NAO_DECLARADA', () => {
  const out = normalizeRaAggregates([{ ...ROWS[0], jobs_median_brl: 1 }], CW);
  assert.ok(out.warnings.some((w) => /^COLUNA_NAO_DECLARADA: .*"jobs_median_brl"/.test(w)), out.warnings.join('\n'));
  assert.equal(out.rows.length, 1, 'a linha continua — a coluna extra é ignorada, não a RA');
});

test('publicado prevalece: divergência de recálculo e escala suspeita só avisam', () => {
  const crescimento = normalizeRaAggregates([{ ...ROWS[0], households_growth_pct: 0.5 }], CW);
  assert.equal(crescimento.byRa.RA_11.householdsGrowthPct, 0.5, 'o publicado fica');
  assert.ok(crescimento.warnings.some((w) => /crescimento 0\.5/.test(w) && /publicado foi mantido/.test(w)));

  const escala = normalizeRaAggregates([{ ...ROWS[0], households_growth_pct: 11.43, households_delta: null }], CW);
  assert.equal(escala.byRa.RA_11.householdsGrowthPct, 11.43, 'nunca convertido');
  assert.ok(escala.warnings.some((w) => /fora da escala decimal/.test(w)));

  const empregos = normalizeRaAggregates([{ ...ROWS[0], jobs_per_1000_residents: 10 }], CW);
  assert.equal(empregos.byRa.RA_11.jobsPer1000Residents, 10);
  assert.ok(empregos.warnings.some((w) => /empregos\/mil hab/.test(w)));

  // Ausência é null, nunca zero — e não dispara recálculo nenhum.
  const ausente = normalizeRaAggregates([{ ra_geo_id: 'RA_11', ra_geo_id_roman: 'RA2026_RA-XI', ra_name: 'Cruzeiro', ra_area_km2: null, quality_flags: ['jobs_missing'] }], CW);
  assert.deepEqual(ausente.warnings, []);
  assert.equal(ausente.byRa.RA_11.jobsTotal, null);
  assert.equal(ausente.byRa.RA_11.householdsGrowthPct, null);
});

test('formatByUnit formata pela unidade declarada e LANÇA para unidade desconhecida', () => {
  assert.equal(formatByUnit('pct_decimal', 0.1143), '11,4%');
  assert.equal(formatByUnit('ratio1', 18000), '18.000,0');
  assert.equal(formatByUnit('index3', 0.55), '0,550');
  assert.equal(formatByUnit('number', 1234), '1.234');
  // Mesmo formatador da tela (o espaço entre `R$` e o número é o do Intl, não digitado aqui).
  assert.equal(formatByUnit('currency', 1500), formatBRL(1500));
  for (const unit of ['pct_decimal', 'ratio1', 'index3', 'number', 'currency']) assert.equal(formatByUnit(unit, null), '—');
  assert.throws(() => formatByUnit('pontos', 1), /unidade de indicador desconhecida: pontos/);
});

test('TERRITORY_INDICATORS apontam para campos reais da linha e trazem fórmula e fonte', () => {
  const { byRa } = normalizeRaAggregates(ROWS, CW);
  const ids = new Set();
  for (const ind of TERRITORY_INDICATORS) {
    assert.ok(!ids.has(ind.id), `id repetido ${ind.id}`);
    ids.add(ind.id);
    assert.ok(ind.attr in byRa.RA_11, `${ind.attr} não existe na linha normalizada`);
    assert.ok(ind.formula && ind.source && ind.tema && ind.label);
    assert.doesNotThrow(() => formatByUnit(ind.unit, byRa.RA_11[ind.attr]));
  }
});

test('territoryProfileRows leva ano e fonte no rótulo e omite o que está ausente', () => {
  const { byRa } = normalizeRaAggregates(ROWS, CW);
  const linhas = territoryProfileRows(byRa.RA_11);
  assert.deepEqual(linhas.map((l) => l.label), [
    'Domicílios 2022 (IBGE)', 'Crescimento de domicílios 2010→2022 (IBGE)', 'Empregos formais 2019 (Ipea)',
    'Empregos por mil moradores (Ipea)', 'Centralidade viária média (OSM)',
  ]);
  assert.equal(linhas[0].value, '390');
  assert.equal(linhas[1].value, '11,4%');
  assert.ok(linhas.every((l) => l.title));
  const parcial = territoryProfileRows({ ...byRa.RA_11, jobsTotal: null, jobsPer1000Residents: null, centralityMean: null });
  assert.equal(parcial.length, 2);
  assert.deepEqual(territoryProfileRows(null), []);
});

// --- Cruzamento com o PDAD e com RA_PROFILES (issue #153) ---------------------------------

import { attachTerritory, attachRaProfiles, raProfileFor, raTerritoryProfile, TERRITORY_ATTRS } from '../src/territorio/aggregates.js';
import { toRaRoman, excludeRas } from '../src/territorio/ra-keys.js';

const INDEX = {
  2024: {
    RA_11: { raGeoId: 'RA_11', raName: 'Cruzeiro', population: 1000, households: 400, indicators: {} },
    RA_19: { raGeoId: 'RA_19', raName: 'Candangolândia', population: 500, households: 200, indicators: {} },
    RA_01: { raGeoId: 'RA_01', raName: 'Plano Piloto', population: 9000, households: 4000, indicators: {} },
  },
};

test('attachTerritory anexa os atributos sem mutar o índice; RA sem agregado recebe null, nunca zero', () => {
  const { byRa } = normalizeRaAggregates(ROWS, CW);
  const out = attachTerritory(INDEX, byRa);
  assert.notEqual(out, INDEX);
  assert.equal(INDEX[2024].RA_11.householdsGrowthPct, undefined, 'o índice original não muda');
  assert.equal(out[2024].RA_11.householdsGrowthPct, 0.1143);
  assert.equal(out[2024].RA_11.jobsPer1000Residents, 18000);
  assert.equal(out[2024].RA_19.centralityMean, 0.466667);
  for (const attr of TERRITORY_ATTRS) assert.equal(out[2024].RA_01[attr], null, attr);
  assert.equal(out[2024].RA_11.population, 1000, 'o resto da RA continua');
  assert.equal(attachTerritory(INDEX, {}), INDEX, 'sem agregados, o mesmo índice');
  assert.equal(attachTerritory(null, byRa), null);
});

test('attachRaProfiles: RA_PROFILES sincronizada (RA_nn) cruza direto; a grafia romana só pela ponte', () => {
  // Grafia romana (demo / aba antiga): só a ponte traduz.
  const romanos = { 'RA2026_RA-XI': { income_per_capita_brl: 3250.5 }, 'RA2026_RA-XIX': { income_per_capita_brl: null } };
  const out = attachRaProfiles(INDEX, romanos, CW);
  assert.equal(toRaRoman('RA_11', CW), 'RA2026_RA-XI');
  assert.equal(out[2024].RA_11.incomePerCapita, 3250.5);
  assert.equal(out[2024].RA_19.incomePerCapita, null, 'coluna vazia é ausência');
  assert.equal(out[2024].RA_01.incomePerCapita, null, 'RA fora da ponte não cruza');
  assert.equal(INDEX[2024].RA_11.incomePerCapita, undefined, 'sem mutação');
  const semPonte = attachRaProfiles(INDEX, romanos, EMPTY_CROSSWALK);
  assert.equal(semPonte[2024].RA_11.incomePerCapita, null, 'sem ponte, a grafia romana não resolve — nenhuma aritmética de romanos');
  // Grafia publicada pela sincronização (`Code.gs`: 'RA_' + nn): mesma chave do PDAD, sem ponte
  // (achado do Codex na PR #157).
  const sincronizada = { RA_11: { income_per_capita_brl: '4100' }, RA_19: { income_per_capita_brl: 2350.5 } };
  const direto = attachRaProfiles(INDEX, sincronizada, EMPTY_CROSSWALK);
  assert.equal(direto[2024].RA_11.incomePerCapita, 4100);
  assert.equal(direto[2024].RA_19.incomePerCapita, 2350.5);
  assert.equal(direto[2024].RA_01.incomePerCapita, null);
  assert.equal(raProfileFor('RA_11', sincronizada), sincronizada.RA_11);
  assert.equal(raProfileFor('RA_11', romanos, CW), romanos['RA2026_RA-XI']);
  assert.equal(raProfileFor('RA_11', romanos), null, 'romano sem ponte: ausente');
  assert.equal(raProfileFor('RA_11', {}), null);
  assert.equal(attachRaProfiles(INDEX, null, CW), INDEX);
  assert.equal(attachRaProfiles(INDEX, {}, CW), INDEX);
});

test('raTerritoryProfile: mediana entre as RAs COM dado, n, diferença e posição; ausência sem posição', () => {
  const { byRa } = normalizeRaAggregates(ROWS, CW);
  const perfil = raTerritoryProfile(byRa, 'RA_19');
  assert.equal(perfil.raName, 'Candangolândia');
  const cresc = perfil.items.find((i) => i.id === 'householdsGrowth');
  assert.equal(cresc.value, 0.3286);
  assert.equal(cresc.reference.n, 2);
  assert.equal(cresc.reference.median, (0.1143 + 0.3286) / 2);
  assert.equal(cresc.rank.position, 1);
  assert.equal(cresc.rank.total, 2);
  assert.equal(cresc.formatted, '32,9%');
  assert.ok(cresc.formula && cresc.source);
  assert.ok(Math.abs(cresc.delta - (0.3286 - (0.1143 + 0.3286) / 2)) < 1e-12);
  const semDado = raTerritoryProfile({ RA_11: { ...byRa.RA_11, centralityMean: null }, RA_19: byRa.RA_19 }, 'RA_11');
  const centr = semDado.items.find((i) => i.id === 'centrality');
  assert.equal(centr.value, null);
  assert.equal(centr.rank, null);
  assert.equal(centr.formatted, '—');
  assert.equal(centr.reference.n, 1, 'a referência conta só quem tem dado');
  assert.equal(raTerritoryProfile(byRa, 'RA_07'), null);
  assert.equal(raTerritoryProfile(null, 'RA_11'), null);
});

test('com a ponte carregada, RA excluída por conflito de nome falha fechado — inclusive pela chave direta (Codex, PR #157)', () => {
  const sincronizada = { RA_11: { income_per_capita_brl: 4100 }, RA_19: { income_per_capita_brl: 2350.5 } };
  const romanos = { 'RA2026_RA-XI': { income_per_capita_brl: 4100 } };
  const sem11 = excludeRas(CW, ['RA_11']);
  assert.equal(raProfileFor('RA_11', sincronizada, sem11), null, 'chave direta não contorna a exclusão');
  assert.equal(raProfileFor('RA2026_RA-XI', romanos, sem11), null, 'grafia romana idem');
  assert.equal(raProfileFor('RA_19', sincronizada, sem11), sincronizada.RA_19, 'as outras RAs seguem');
  assert.equal(raProfileFor('RA2026_RA-XIX', sincronizada, CW), sincronizada.RA_19, 'filtro romano acha o perfil RA_nn pela ponte');
  const out = attachRaProfiles(INDEX, sincronizada, sem11);
  assert.equal(out[2024].RA_11.incomePerCapita, null);
  assert.equal(out[2024].RA_19.incomePerCapita, 2350.5);
  // Sem ponte não há exclusão a respeitar: só a chave direta, sem tradução.
  assert.equal(raProfileFor('RA_11', sincronizada, EMPTY_CROSSWALK), sincronizada.RA_11);
  assert.equal(raProfileFor('RA2026_RA-XI', sincronizada, EMPTY_CROSSWALK), null);
});

test('ponte esvaziada por exclusões bloqueia perfil e agregados mesmo pela chave direta; attachTerritory respeita a exclusão', () => {
  const { byRa } = normalizeRaAggregates(ROWS, CW);
  const sincronizada = { RA_11: { income_per_capita_brl: 4100 }, RA_19: { income_per_capita_brl: 2350.5 } };
  const vazia = excludeRas(CW, ['RA_11', 'RA_19']);
  assert.equal(raProfileFor('RA_11', sincronizada, vazia), null, 'chave direta não contorna uma ponte esvaziada');
  assert.equal(attachRaProfiles(INDEX, sincronizada, vazia)[2024].RA_11.incomePerCapita, null);
  const sem11 = excludeRas(CW, ['RA_11']);
  const out = attachTerritory(INDEX, byRa, sem11);
  assert.equal(out[2024].RA_11.householdsGrowthPct, null, 'RA excluída não recebe agregado');
  assert.equal(out[2024].RA_19.householdsGrowthPct, 0.3286, 'as outras seguem');
  assert.equal(attachTerritory(INDEX, byRa)[2024].RA_11.householdsGrowthPct, 0.1143, 'sem ponte carregada, a chave igual cruza');
  // Agregados cuja RA foi excluída da ponte são descartados com aviso — mesma regra.
  const agregados = normalizeRaAggregates(ROWS, sem11);
  assert.deepEqual(agregados.rows.map((r) => r.raGeoId), ['RA_19']);
  assert.ok(agregados.warnings.some((w) => /RA_11 não existe na ponte/.test(w)));
});
