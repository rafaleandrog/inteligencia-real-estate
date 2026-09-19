import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePdadData } from '../src/pdad/normalize-pdad.js';
import { buildPdadIndex } from '../src/pdad/aggregate.js';
import {
  RA_PROFILE_ITEMS, PROFILE_STATUS, readCategories, referenceAcrossRas, deltaVsReference, raRank,
  raRealEstateProfile, dominantCategory, compactIndicators,
} from '../src/pdad/insights.js';

// Perfil imobiliário da RA (issue #126). O que este arquivo impede: suprimido virando 0;
// ranking contando RA sem dado; "até 30 min" somando uma faixa suprimida; e a referência
// deixando de dizer sobre quantas RAs foi calculada.

const linha = (ra, code, categoria, pct, status = 'published', over = {}) => ({
  pdad_year: '2024', ra_geo_id: ra, ra_name: { RA_01: 'Plano Piloto', RA_09: 'Ceilândia', RA_20: 'Águas Claras', RA_16: 'Lago Sul' }[ra] || ra,
  indicator_code: code, response_category: categoria, category_standard: categoria.toLowerCase().replace(/\s+/g, '_'),
  estimate_pct: pct === null ? '' : String(pct), estimate_total: pct === null ? '' : String(pct * 10),
  source_value_status: status, ...over,
});

function fixture() {
  return buildPdadIndex(normalizePdadData([
    linha('RA_01', 'dwelling_type', 'Apartamento', 72), linha('RA_01', 'dwelling_type', 'Casa', 25), linha('RA_01', 'dwelling_type', 'Cômodo', 3),
    linha('RA_09', 'dwelling_type', 'Apartamento', 20), linha('RA_09', 'dwelling_type', 'Casa', 78),
    linha('RA_20', 'dwelling_type', 'Apartamento', 76), linha('RA_20', 'dwelling_type', 'Casa', 19.1),
    linha('RA_16', 'dwelling_type', 'Apartamento', null, 'suppressed'), linha('RA_16', 'dwelling_type', 'Casa', 95),
    linha('RA_01', 'tenure_status', 'Alugado', 31.2), linha('RA_01', 'tenure_status', 'Próprio já pago', 54.2),
    linha('RA_09', 'tenure_status', 'Alugado', 23), linha('RA_20', 'tenure_status', 'Alugado', 40),
    linha('RA_01', 'work_commute_time', 'Até 15 min', 30), linha('RA_01', 'work_commute_time', 'Mais de 15 até 30 minutos', 24.8),
    linha('RA_09', 'work_commute_time', 'Até 15 min', 10), linha('RA_09', 'work_commute_time', 'Mais de 15 até 30 minutos', null, 'suppressed'),
    linha('RA_01', 'registered_deed', 'Sim', 93), linha('RA_01', 'registered_deed', 'Não', 7),
  ]).rows);
}

test('as sete leituras do perfil são as do plano e apontam para chaves de indicador reais', () => {
  assert.deepEqual(RA_PROFILE_ITEMS.map((i) => i.id),
    ['verticalizacao', 'locacao', 'escritura', 'ocupacao', 'ate30min', 'automovel', 'internet']);
  assert.ok(Object.isFrozen(RA_PROFILE_ITEMS));
});

test('readCategories: publicado, suprimido (nunca 0) e ausente', () => {
  const idx = fixture();
  assert.deepEqual(readCategories(idx[2024].RA_01, 'dwelling', ['Apartamento']), { value: 72, status: PROFILE_STATUS.PUBLISHED });
  assert.deepEqual(readCategories(idx[2024].RA_16, 'dwelling', ['Apartamento']), { value: null, status: PROFILE_STATUS.SUPPRESSED });
  assert.deepEqual(readCategories(idx[2024].RA_09, 'deed', ['Sim']), { value: null, status: PROFILE_STATUS.MISSING });
  assert.deepEqual(readCategories(idx[2024].RA_01, 'dwelling', ['Categoria inexistente']), { value: null, status: PROFILE_STATUS.MISSING });
  assert.deepEqual(readCategories(null, 'dwelling', ['Apartamento']), { value: null, status: PROFILE_STATUS.MISSING });
  // "Até 30 min" soma duas faixas — e só quando as duas foram publicadas.
  assert.deepEqual(readCategories(idx[2024].RA_01, 'workTime', ['Até 15 min', 'Mais de 15 até 30 minutos']), { value: 54.8, status: PROFILE_STATUS.PUBLISHED });
  assert.deepEqual(readCategories(idx[2024].RA_09, 'workTime', ['Até 15 min', 'Mais de 15 até 30 minutos']), { value: null, status: PROFILE_STATUS.SUPPRESSED });
});

test('a referência é a mediana das RAs com dado publicado, e diz quantas são', () => {
  const idx = fixture();
  const vert = RA_PROFILE_ITEMS.find((i) => i.id === 'verticalizacao');
  const ref = referenceAcrossRas(idx, 2024, vert);
  assert.equal(ref.n, 3, 'Lago Sul (suprimida) não entra');
  assert.equal(ref.median, 72);
  // Uma RA só publicada: a mediana é ela mesma, com n = 1.
  const deed = RA_PROFILE_ITEMS.find((i) => i.id === 'escritura');
  assert.deepEqual([referenceAcrossRas(idx, 2024, deed).median, referenceAcrossRas(idx, 2024, deed).n], [93, 1]);
  // Nenhuma publicada: mediana null, n 0.
  const auto = RA_PROFILE_ITEMS.find((i) => i.id === 'automovel');
  assert.deepEqual([referenceAcrossRas(idx, 2024, auto).median, referenceAcrossRas(idx, 2024, auto).n], [null, 0]);
  assert.deepEqual([referenceAcrossRas({}, 2024, vert).median, referenceAcrossRas({}, 2024, vert).n], [null, 0]);
});

test('deltaVsReference em p.p.; null sem valor ou sem referência', () => {
  assert.ok(Math.abs(deltaVsReference(76, 44.6) - 31.4) < 1e-9);
  assert.equal(deltaVsReference(null, 44.6), null);
  assert.equal(deltaVsReference(76, null), null);
  assert.equal(deltaVsReference(NaN, 44.6), null);
});

test('raRank só entre RAs publicadas; empate compartilha posição; RA sem dado não tem posição', () => {
  const idx = fixture();
  const vert = RA_PROFILE_ITEMS.find((i) => i.id === 'verticalizacao');
  assert.deepEqual(raRank(idx, 2024, vert, 'RA_20'), { position: 1, total: 3 });
  assert.deepEqual(raRank(idx, 2024, vert, 'RA_01'), { position: 2, total: 3 });
  assert.deepEqual(raRank(idx, 2024, vert, 'RA_09'), { position: 3, total: 3 });
  assert.equal(raRank(idx, 2024, vert, 'RA_16'), null, 'suprimida: sem lugar na fila');
  assert.equal(raRank(idx, 2024, vert, 'RA_99'), null);
  // Empate: duas RAs com 40% de locação dividem a 1ª posição.
  const empate = buildPdadIndex(normalizePdadData([
    linha('RA_01', 'tenure_status', 'Alugado', 40), linha('RA_09', 'tenure_status', 'Alugado', 40), linha('RA_20', 'tenure_status', 'Alugado', 10),
  ]).rows);
  const loc = RA_PROFILE_ITEMS.find((i) => i.id === 'locacao');
  assert.deepEqual(raRank(empate, 2024, loc, 'RA_01'), { position: 1, total: 3 });
  assert.deepEqual(raRank(empate, 2024, loc, 'RA_09'), { position: 1, total: 3 });
  assert.deepEqual(raRank(empate, 2024, loc, 'RA_20'), { position: 3, total: 3 });
});

test('raRealEstateProfile: sete itens com valor, status, referência, delta e posição; RA sem dado é null', () => {
  const idx = fixture();
  const perfil = raRealEstateProfile(idx, 2024, 'RA_20');
  assert.equal(perfil.raName, 'Águas Claras');
  assert.equal(perfil.items.length, 7);
  const vert = perfil.items.find((i) => i.id === 'verticalizacao');
  assert.equal(vert.value, 76);
  assert.equal(vert.status, 'published');
  assert.deepEqual(vert.reference, { median: 72, n: 3 });
  assert.equal(vert.deltaPp, 4);
  assert.deepEqual(vert.rank, { position: 1, total: 3 });
  const auto = perfil.items.find((i) => i.id === 'automovel');
  assert.equal(auto.value, null);
  assert.equal(auto.status, 'missing');
  assert.equal(auto.deltaPp, null);
  assert.equal(auto.rank, null);
  assert.equal(raRealEstateProfile(idx, 2024, 'RA_99'), null);
  assert.equal(raRealEstateProfile(idx, 2021, 'RA_01'), null);
  assert.equal(raRealEstateProfile(null, 2024, 'RA_01'), null);
});

test('dominantCategory: líder, segunda e diferença em p.p.; suprimida fora; lista vazia null', () => {
  const idx = fixture();
  const d = dominantCategory(idx[2024].RA_01.indicators.dwelling.values);
  assert.deepEqual(d, { leader: 'Apartamento', leaderPct: 72, runnerUp: 'Casa', runnerUpPct: 25, gapPp: 47 });
  const so = dominantCategory([{ label: 'A', pct: 60 }, { label: 'B', pct: null, status: 'suppressed' }]);
  assert.deepEqual(so, { leader: 'A', leaderPct: 60, runnerUp: null, runnerUpPct: null, gapPp: null });
  assert.equal(dominantCategory([]), null);
  assert.equal(dominantCategory(null), null);
  assert.equal(dominantCategory([{ label: 'X', pct: NaN }]), null);
});

test('compactIndicators lista os demais indicadores com a categoria dominante, sem os do perfil', () => {
  const idx = fixture();
  const lista = compactIndicators(idx, 2024, 'RA_01', RA_PROFILE_ITEMS.map((i) => i.key));
  const chaves = lista.map((i) => i.key);
  assert.ok(!chaves.includes('dwelling') && !chaves.includes('tenure'));
  assert.ok(chaves.includes('age'), 'faixa etária é indicador com valores e entra');
  const age = lista.find((i) => i.key === 'age');
  assert.equal(age.leader, null, 'faixa etária sem população calculada não tem líder — nunca 0');
  assert.deepEqual(compactIndicators(idx, 2024, 'RA_99'), []);
  const tudo = compactIndicators(idx, 2024, 'RA_01');
  assert.equal(tudo.find((i) => i.key === 'dwelling').leader, 'Apartamento');
  assert.equal(tudo.find((i) => i.key === 'dwelling').leaderPct, 72);
});
