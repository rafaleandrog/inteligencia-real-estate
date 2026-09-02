// Aba IVV_REGION — IVV por Região Administrativa e faixa de quartos (issue #87).
//
// Três coisas caras que este arquivo impede: a escala em ponto percentual sendo confundida
// com a escala decimal da IVV_MONTHLY (erro de 100× em silêncio); a linha agregada entrando
// no ranking junto das partes (o mesmo mercado contado duas vezes); e região sem valor
// publicado virando barra de tamanho zero, que afirma "vendeu nada" onde o dado diz
// "não publicou".

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readXlsx } from '../tools/xlsx.mjs';
import {
  REGION_COLUMNS, REGIAO_TOTAL, FAIXA_TOTAL, FAIXAS_DE_QUARTOS,
  normalizeIvvRegion, buildRegionRanking, faixasDisponiveis, regionMonths,
} from '../src/ivv/region.js';
import { DATASET_PERCENT_SCALE, PERCENT_SCALES, percentFromPoints, formatPercent } from '../src/format.js';

const linha = (over = {}) => ({
  reference_month: '2026-05-01',
  market_region: 'Asa Norte',
  bedroom_bucket: FAIXA_TOTAL,
  offered_units: '100',
  sold_units: '12',
  ivv_pct_published: '12',
  ivv_pct: '12',
  ivv_pct_check: '12',
  ivv_variance_pp: '0',
  offer_price_brl_m2: '24736',
  sale_price_brl_m2: '24981.61',
  source_id: 'SRC_IVV_MAY26_PDF',
  ...over,
});

const semente = () => readXlsx(readFileSync(
  new URL('../migration/imob-intelligence-backend.xlsx', import.meta.url),
));

// --- Escala: a armadilha que dá nome à regra -----------------------------------------

test('IVV_REGION é ponto percentual e IVV_MONTHLY é decimal — as duas NUNCA se unificam', () => {
  // `12.5` aqui é 12,5%; `0.057` lá é 5,7%. Unificar erra por 100×, e nenhum dos dois
  // resultados parece bug de código: 1250% passa por erro de digitação na planilha e
  // 0,125% passa por número pequeno (R8.44/R8.60).
  assert.equal(DATASET_PERCENT_SCALE.IVV_REGION, PERCENT_SCALES.POINTS);
  assert.equal(DATASET_PERCENT_SCALE.IVV_MONTHLY, PERCENT_SCALES.DECIMAL);
  assert.notEqual(DATASET_PERCENT_SCALE.IVV_REGION, DATASET_PERCENT_SCALE.IVV_MONTHLY);

  const { rows } = normalizeIvvRegion([linha({ ivv_pct_published: '12.5', ivv_pct: '12.5' })]);
  assert.equal(rows[0].ivvPct, 12.5, 'o valor é preservado como veio, sem conversão calada');
  assert.equal(formatPercent(percentFromPoints(rows[0].ivvPct)), '12,5%');
});

test('valor acima de 100 pontos é sinalizado, nunca convertido às cegas', () => {
  const { rows, warnings } = normalizeIvvRegion([linha({ ivv_pct_published: '1250', ivv_pct: '1250' })]);
  assert.equal(rows[0].ivvPct, 1250, 'o dado chega à tela como veio');
  assert.ok(warnings.some((w) => /acima de 100/.test(w)), warnings.join(' · '));
});

// --- As linhas agregadas ---------------------------------------------------------------

test('DF Total e TOTAL saem marcados na normalização, não por comparação de string solta', () => {
  const { rows } = normalizeIvvRegion([
    linha({ market_region: REGIAO_TOTAL, bedroom_bucket: FAIXA_TOTAL }),
    linha({ market_region: 'Gama', bedroom_bucket: '2Q' }),
  ]);
  assert.equal(rows[0].isRegiaoTotal, true);
  assert.equal(rows[0].isFaixaTotal, true);
  assert.equal(rows[1].isRegiaoTotal, false);
  assert.equal(rows[1].isFaixaTotal, false);
});

test('o agregado do território é RÉGUA, nunca mais uma barra do ranking', () => {
  // Uma barra de `DF Total` junto das partes contaria o mesmo mercado duas vezes — e
  // esmagaria a escala, porque o agregado costuma superar cada parte.
  const { rows } = normalizeIvvRegion([
    linha({ market_region: REGIAO_TOTAL, ivv_pct_published: '6.7', ivv_pct: '6.7' }),
    linha({ market_region: 'Gama', ivv_pct_published: '1.9', ivv_pct: '1.9' }),
    linha({ market_region: 'Sobradinho', ivv_pct_published: '27.7', ivv_pct: '27.7' }),
  ]);
  const ranking = buildRegionRanking(rows, { bucket: FAIXA_TOTAL });

  assert.deepEqual(ranking.regioes.map((r) => r.region), ['Sobradinho', 'Gama'],
    'ordenado por IVV, e sem o agregado');
  assert.equal(ranking.referencia.region, REGIAO_TOTAL);
  assert.equal(ranking.maximo, 27.7, 'a escala das barras é a maior PARTE, não o agregado');
});

// --- Ausência é frase, não zero ---------------------------------------------------------

test('região sem IVV publicado é nomeada, e não vira barra de tamanho zero', () => {
  const { rows } = normalizeIvvRegion([
    linha({ market_region: 'Gama', ivv_pct_published: '1.9', ivv_pct: '1.9' }),
    linha({ market_region: 'Asa Norte', ivv_pct_published: '', ivv_pct: '', ivv_pct_check: '' }),
  ]);
  const ranking = buildRegionRanking(rows, { bucket: FAIXA_TOTAL });

  assert.deepEqual(ranking.regioes.map((r) => r.region), ['Gama']);
  assert.deepEqual(ranking.semValor, ['Asa Norte'],
    '"não publicou" e "vendeu nada" são afirmações diferentes');
});

// --- Alias, conferência e colunas ------------------------------------------------------

test('`ivv_pct` é alias de `ivv_pct_published`, e a publicada manda', () => {
  const { rows } = normalizeIvvRegion([linha({ ivv_pct_published: '9', ivv_pct: '99' })]);
  assert.equal(rows[0].ivvPct, 9, 'o alias não pode vencer a coluna publicada');

  const { rows: soAlias } = normalizeIvvRegion([linha({ ivv_pct_published: '', ivv_pct: '7' })]);
  assert.equal(soAlias[0].ivvPct, 7, 'sem a publicada, o alias entra');
});

test('conferência do backend SINALIZA divergência, nunca substitui o publicado', () => {
  const { rows, warnings } = normalizeIvvRegion([
    linha({ ivv_pct_published: '12', ivv_pct: '12', ivv_pct_check: '15' }),
  ]);
  assert.equal(rows[0].ivvPct, 12, 'o publicado prevalece');
  assert.ok(warnings.some((w) => /diverge da conferência/.test(w)), warnings.join(' · '));
});

test('coluna que a aba trouxer e o schema não declarar é NOMEADA em aviso', () => {
  const { warnings } = normalizeIvvRegion([linha({ coluna_nova: '1' })]);
  assert.ok(warnings.some((w) => /coluna_nova/.test(w)), warnings.join(' · '));
});

test('linha sem região ou sem faixa é descartada com aviso, e não vira barra anônima', () => {
  const { rows, warnings } = normalizeIvvRegion([
    linha({ market_region: '' }),
    linha({ bedroom_bucket: '' }),
    linha(),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(warnings.filter((w) => /sem região ou faixa/.test(w)).length, 2);
});

test('entrada inválida não estoura', () => {
  assert.deepEqual(normalizeIvvRegion(null).rows, []);
  assert.deepEqual(normalizeIvvRegion([null, 3]).rows, []);
  assert.deepEqual(buildRegionRanking([], {}).regioes, []);
  assert.equal(buildRegionRanking([], {}).referencia, null);
});

// --- O triângulo com a semente e o contrato ---------------------------------------------

test('as 12 colunas declaradas são exatamente as da aba na semente', () => {
  const cabecalhos = semente().IVV_REGION.headers;
  const declaradas = REGION_COLUMNS.map((c) => c.key).sort();
  assert.deepEqual([...cabecalhos].sort(), declaradas,
    'schema e planilha divergiram — a coluna nova precisa ser declarada, não ignorada');
});

test('a semente inteira normaliza sem descarte, e traz um mês só', () => {
  const brutas = semente().IVV_REGION.rows;
  const { rows } = normalizeIvvRegion(brutas);
  assert.equal(rows.length, brutas.length, 'nenhuma das 95 linhas se perdeu');
  assert.equal(regionMonths(rows).length, 1,
    'a aba é RETRATO de um mês; virar série é promessa que o dado não sustenta');
});

test('as faixas declaradas cobrem as da semente, e TOTAL abre a lista', () => {
  const { rows } = normalizeIvvRegion(semente().IVV_REGION.rows);
  const presentes = faixasDisponiveis(rows);
  assert.equal(presentes[0], FAIXA_TOTAL, 'a primeira pergunta de quem chega é "e no geral?"');
  for (const faixa of presentes) assert.ok(FAIXAS_DE_QUARTOS.includes(faixa), faixa);
});

test('o contrato descreve a aba com a mesma chave composta', () => {
  const contrato = readFileSync(new URL('../docs/DATA_CONTRACT.md', import.meta.url), 'utf8');
  assert.match(contrato, /`IVV_REGION`/);
  for (const coluna of ['market_region', 'bedroom_bucket', 'ivv_pct_published']) {
    assert.ok(contrato.includes(`\`${coluna}\``), `${coluna} fora do contrato`);
  }
});
