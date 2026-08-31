// Escala percentual declarada por dataset, e ausência que não vira zero — issue #54.
//
// O mesmo backend usa as duas convenções ao mesmo tempo: `RA_PROFILES.female_pct = 54`
// é 54%, e `IVV_MONTHLY.ivv_pct = 0.057` é 5,7%. Trocar uma pela outra erra por 100×
// sem exceção e sem sintoma — 5,7% vira 0,057% e 54% vira 5400%. Nenhum dos dois parece
// bug de código olhando a tela.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERCENT_SCALES, DATASET_PERCENT_SCALE, percentFromPoints, percentFromDecimal,
  raProfileUnavailability, RA_PROFILE_PENDING_STATUS, raAgeBands, formatPercent,
} from '../src/format.js';
import { normalizeRaProfile } from '../src/normalize.js';

test('as duas escalas do backend estão declaradas, e são opostas', () => {
  assert.equal(DATASET_PERCENT_SCALE.RA_PROFILES, PERCENT_SCALES.POINTS);
  assert.equal(DATASET_PERCENT_SCALE.IVV_MONTHLY, PERCENT_SCALES.DECIMAL);
  assert.notEqual(DATASET_PERCENT_SCALE.RA_PROFILES, DATASET_PERCENT_SCALE.IVV_MONTHLY);
});

test('cada conversor faz uma coisa só, e o erro de 100× é visível ao trocá-los', () => {
  // `female_pct = 54` em RA_PROFILES.
  assert.equal(percentFromPoints(54), 54);
  assert.equal(percentFromDecimal(54), 5400); // o estrago, se alguém trocar
  // `ivv_pct = 0.057` em IVV_MONTHLY.
  assert.equal(percentFromDecimal(0.057), 5.7000000000000005);
  assert.equal(percentFromPoints(0.057), 0.057); // o estrago na outra direção
  assert.equal(formatPercent(percentFromDecimal(0.057)), '5,7%');
  assert.equal(formatPercent(percentFromPoints(0.057)), '0,1%');
});

test('ausência devolve null nos dois conversores, nunca zero', () => {
  // Campo vazio não é "0% da população". Zero afirmaria que ninguém está naquela faixa.
  for (const conv of [percentFromPoints, percentFromDecimal]) {
    for (const ausente of [null, undefined, '', '54', Number.NaN, Infinity]) {
      assert.equal(conv(ausente), null, `${conv.name}(${String(ausente)})`);
    }
    assert.equal(conv(0), 0, `${conv.name}(0) é valor publicado, não ausência`);
  }
});

// --- A tolerância dupla continua, e agora avisa -------------------------------------

const comFaixas = (over) => normalizeRaProfile({ ra_geo_id: 'RA_X', ...over });

test('distribuição em escala decimal continua sendo convertida, como antes', () => {
  // `validateRaProfile_()` do backend aceita as duas escalas: |soma-100|<=2 OU
  // |soma-1|<=0,02. O cliente espelha o servidor de propósito — remover a tolerância
  // criaria divergência cliente/servidor, que é exatamente o erro da R8.44.
  const decimal = comFaixas({
    population_age_0_14_pct: 0.182, population_age_15_29_pct: 0.231,
    population_age_30_44_pct: 0.244, population_age_45_59_pct: 0.196,
    population_age_60_plus_pct: 0.147,
  });
  const out = raAgeBands(decimal);
  assert.equal(out.scaledFromDecimal, true);
  assert.equal(Math.round(out.bands[0].pct * 10) / 10, 18.2);
  assert.ok(Math.abs(out.total - 100) < 0.001);
});

test('a conversão de escala decimal gera AVISO, não acontece em silêncio', () => {
  // Hoje a causa é convenção e a conversão está certa. Amanhã a causa pode ser coluna
  // trocada, e aí o número continuaria plausível. O aviso é a diferença entre "o
  // cliente se virou" e "alguém precisa olhar isto".
  const out = raAgeBands(comFaixas({
    population_age_0_14_pct: 0.182, population_age_15_29_pct: 0.231,
  }));
  assert.equal(out.scaledFromDecimal, true);
  assert.match(out.scaleWarning, /escala decimal/);
  assert.match(out.scaleWarning, /pontos percentuais/);
});

test('distribuição já em pontos percentuais não é convertida nem avisada', () => {
  const out = raAgeBands(comFaixas({
    population_age_0_14_pct: '18,2', population_age_15_29_pct: '23,1',
    population_age_30_44_pct: '24,4', population_age_45_59_pct: '19,6',
    population_age_60_plus_pct: '14,7',
  }));
  assert.equal(out.scaledFromDecimal, false);
  assert.equal(out.scaleWarning, null);
  assert.equal(out.bands[0].pct, 18.2);
});

test('faixa ausente é omitida, nunca vira barra de zero', () => {
  const out = raAgeBands(comFaixas({
    population_age_0_14_pct: '18,2', population_age_60_plus_pct: '14,7',
  }));
  assert.deepEqual(out.bands.map((b) => b.key),
    ['population_age_0_14_pct', 'population_age_60_plus_pct']);
  assert.equal(out.bands.some((b) => b.pct === 0), false);
});

test('faixa publicada como zero aparece — zero é dado, ausência não', () => {
  const out = raAgeBands(comFaixas({
    population_age_0_14_pct: '0', population_age_15_29_pct: '100',
  }));
  assert.equal(out.bands.length, 2);
  assert.equal(out.bands[0].pct, 0);
  // Uma faixa em 0 e outra em 100 NÃO é escala decimal: `100 > 1`.
  assert.equal(out.scaledFromDecimal, false);
});

// --- RA sem perfil publicado --------------------------------------------------------

test('RA criada depois da PDAD-A 2024 diz isso, com o motivo e a RA de origem', () => {
  const pendente = comFaixas({
    ra_name: '26 de Setembro',
    profile_status: RA_PROFILE_PENDING_STATUS,
    predecessor_ra: 'Ceilândia',
  });
  const out = raProfileUnavailability(pendente);
  assert.match(out.message, /Dados estatísticos ainda não disponíveis/);
  assert.match(out.message, /criada depois da PDAD-A 2024/);
  assert.match(out.message, /Ceilândia/);
  assert.equal(out.predecessor, 'Ceilândia');
});

test('sem RA de origem a nota não inventa uma', () => {
  const out = raProfileUnavailability(comFaixas({ profile_status: RA_PROFILE_PENDING_STATUS }));
  assert.match(out.message, /Dados estatísticos ainda não disponíveis/);
  assert.equal(out.predecessor, null);
  assert.equal(/parte de/.test(out.message), false);
});

test('RA com perfil normal não recebe a nota de indisponibilidade', () => {
  assert.equal(raProfileUnavailability(comFaixas({ population_total: '4210' })), null);
  assert.equal(raProfileUnavailability(comFaixas({ profile_status: 'published' })), null);
  assert.equal(raProfileUnavailability(null), null);
});

test('RA pendente não mostra zero em indicador nenhum', () => {
  // Critério de aceite literal da issue: `26 de Setembro` e `Ponte Alta` não podem
  // exibir zero em lugar nenhum. As colunas existem e estão vazias; vazio vira `null`
  // no normalizador, e `null` é omitido — nunca formatado como 0.
  const pendente = comFaixas({
    ra_name: 'Ponte Alta', profile_status: RA_PROFILE_PENDING_STATUS,
    predecessor_ra: 'Gama',
    population_total: '', income_per_capita_brl: '', population_density_km2: '',
    population_age_0_14_pct: '', population_age_60_plus_pct: '',
  });
  assert.equal(pendente.population_total, null);
  assert.equal(pendente.income_per_capita_brl, null);
  assert.deepEqual(raAgeBands(pendente).bands, []);
  assert.ok(raProfileUnavailability(pendente));
});

test('valor acima de 100% é denunciado, não desenhado como se fosse dado', () => {
  // Achado da própria verificação desta issue, não da issue: `toNumber('0,182')` devolve
  // 182 — vírgula com exatamente três casas é separador de milhar pela heurística
  // documentada do normalizador. A célula "0,182" numa RA_PROFILES real produziria uma
  // faixa etária de 182% da população, com barra desenhada e número formatado.
  const perfil = normalizeRaProfile({
    ra_geo_id: 'RA_X', population_age_0_14_pct: '0,182', population_age_15_29_pct: '23,1',
  });
  assert.equal(perfil.population_age_0_14_pct, 182, 'a ambiguidade de toNumber mudou');

  const out = raAgeBands(perfil);
  assert.match(out.scaleWarning, /acima de 100%/);
  assert.match(out.scaleWarning, /confira a célula/);
  // O aviso de valor impossível VENCE o de escala: dizer "convertemos de decimal"
  // sobre um 182 seria explicar errado o que aconteceu.
  assert.equal(/escala decimal/.test(out.scaleWarning), false);
});
