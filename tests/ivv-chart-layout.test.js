// Geometria dos gráficos do Mercado (issue #83).
//
// O que se afirma aqui é o que o renderizador NÃO decide: onde cada coisa cai, quantos
// rótulos cabem, o que acontece com um buraco e quando uma coluna deixa de ser coluna.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CHART_TYPES, buildChartModel } from '../src/ivv/chart-model.js';
import { VIEWPORTS, chartViewport, chartGeometry, tipoEfetivo } from '../src/ivv/chart-layout.js';

const base = { key: 'g', titulo: 'G', formatar: (v) => `${v}`, rotuloCategoria: (c) => c };

function modelo(tipo, series, meses = 12) {
  return buildChartModel({ ...base, tipo }, series.map((s, i) => ({
    chave: s.chave, rotulo: s.chave, cat: i + 1,
    pontos: Array.from({ length: meses }, (_, m) => ({
      categoria: `2026-${String(m + 1).padStart(2, '0')}`,
      valor: s.valores ? s.valores[m] : m + 1,
    })),
  })));
}

test('a faixa estreita começa no mesmo ponto de quebra dos cards', () => {
  assert.equal(chartViewport(390).nome, 'estreito');
  assert.equal(chartViewport(560).nome, 'estreito');
  assert.equal(chartViewport(561).nome, 'padrao');
  assert.equal(chartViewport(1100).nome, 'padrao');
});

test('a margem esquerda nasce da largura do maior rótulo do eixo Y', () => {
  const curto = chartGeometry(modelo(CHART_TYPES.LINHA, [{ chave: 'a' }]));
  const longo = chartGeometry(buildChartModel(
    { ...base, formatar: (v) => `R$ ${v}.000.000,00/m²` },
    [{ chave: 'a', rotulo: 'a', cat: 1, pontos: [{ categoria: '2026-01', valor: 1 }] }],
  ));
  assert.ok(longo.plot.x > curto.plot.x, 'rótulo maior não abriu espaço');
  assert.ok(curto.plot.largura > 0 && longo.plot.largura > 0);
});

test('o buraco interrompe o traço em vez de inventar uma reta', () => {
  const g = chartGeometry(modelo(CHART_TYPES.LINHA, [{ chave: 'a', valores: [1, 2, null, 4, 5, 6, 7, 8, 9, 10, 11, 12] }]));
  assert.equal(g.series[0].segmentos.length, 2, 'devia haver dois trechos');
  assert.equal(g.series[0].marcadores.length, 11, 'o mês ausente não vira marcador');
});

test('categoria única fica no centro da área de plotagem', () => {
  const g = chartGeometry(modelo(CHART_TYPES.LINHA, [{ chave: 'a' }], 1));
  const centro = g.plot.x + g.plot.largura / 2;
  assert.ok(Math.abs(g.series[0].marcadores[0].cx - centro) < 1.5);
  assert.ok(g.series[0].segmentos[0].startsWith('M'), 'ponto único ainda desenha algo');
});

test('o traço de ponto único não invade a coluna dos rótulos do eixo', () => {
  const g = chartGeometry(buildChartModel(
    { ...base, formatar: (v) => `R$ ${v}` },
    [{ chave: 'a', rotulo: 'a', cat: 1, pontos: [{ categoria: '2026-01', valor: 5 }] }],
  ));
  const xs = [...g.series[0].segmentos[0].matchAll(/[ML](-?[\d.]+),/g)].map((m) => Number(m[1]));
  assert.ok(Math.min(...xs) >= g.plot.x, 'o traço começou antes da área de plotagem');
});

test('área fecha no piso e volta, uma vez por trecho', () => {
  const g = chartGeometry(modelo(CHART_TYPES.AREA, [{ chave: 'a', valores: [1, null, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }]));
  assert.equal(g.series[0].areas.length, 2);
  assert.ok(g.series[0].areas.every((d) => d.endsWith('Z')), 'área aberta não preenche');
  assert.equal(chartGeometry(modelo(CHART_TYPES.LINHA, [{ chave: 'a' }])).series[0].areas.length, 0);
});

test('colunas de séries diferentes não se sobrepõem', () => {
  const g = chartGeometry(modelo(CHART_TYPES.COLUNAS, [{ chave: 'a' }, { chave: 'b' }]));
  const [a, b] = [g.series[0].colunas[0], g.series[1].colunas[0]];
  assert.ok(a.x + a.largura <= b.x + 0.01, `colunas sobrepostas: ${a.x + a.largura} > ${b.x}`);
  assert.ok(a.largura >= 1 && b.largura >= 1);
});

test('coluna sem valor não vira coluna de altura zero', () => {
  const valores = [1, null, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const g = chartGeometry(modelo(CHART_TYPES.COLUNAS, [{ chave: 'a', valores }]));
  assert.equal(g.series[0].colunas.length, 11);
});

test('coluna estreita demais degrada para linha, e a decisão é do layout', () => {
  const longo = modelo(CHART_TYPES.COLUNAS, [{ chave: 'a' }], 66);
  assert.equal(tipoEfetivo(longo, VIEWPORTS.ESTREITO), CHART_TYPES.LINHA);
  assert.equal(chartGeometry(longo, VIEWPORTS.ESTREITO).series[0].colunas.length, 0);
  assert.ok(chartGeometry(longo, VIEWPORTS.ESTREITO).series[0].segmentos.length > 0);
  assert.equal(tipoEfetivo(modelo(CHART_TYPES.COLUNAS, [{ chave: 'a' }], 12), VIEWPORTS.PADRAO), CHART_TYPES.COLUNAS);
});

test('a faixa estreita desenha menos rótulos e menos marcadores', () => {
  const m = modelo(CHART_TYPES.LINHA, [{ chave: 'a' }], 24);
  const padrao = chartGeometry(m, VIEWPORTS.PADRAO);
  const estreito = chartGeometry(m, VIEWPORTS.ESTREITO);
  assert.ok(estreito.eixoX.length < padrao.eixoX.length);
  assert.equal(padrao.series[0].marcadores.length, 24);
  assert.equal(estreito.series[0].marcadores.length, 0, 'acima do teto, marcador nenhum');
  assert.equal(estreito.viewBox, '0 0 360 260');
});

test('o sparkline não tem eixo, grade nem rótulo', () => {
  const g = chartGeometry(modelo(CHART_TYPES.LINHA, [{ chave: 'a' }]), VIEWPORTS.SPARK);
  assert.deepEqual(g.grade, []);
  assert.deepEqual(g.eixoX, []);
  assert.equal(g.plot.x, 0);
  assert.equal(g.viewBox, '0 0 120 32');
});

test('domínio que cruza zero ganha linha de base', () => {
  const m = buildChartModel({ ...base, baseZero: false }, [{
    chave: 'a', rotulo: 'a', cat: 1,
    pontos: [{ categoria: '2026-01', valor: -40 }, { categoria: '2026-02', valor: 40 }],
  }]);
  assert.ok(chartGeometry(m).zeroY > 0);
  assert.equal(chartGeometry(modelo(CHART_TYPES.LINHA, [{ chave: 'a' }])).zeroY, null);
});

test('nenhuma cor, espessura ou raio atravessa a geometria', () => {
  const serializado = JSON.stringify(chartGeometry(modelo(CHART_TYPES.AREA, [{ chave: 'a' }])));
  assert.equal(/#[0-9a-f]{3}|stroke|fill|radius/i.test(serializado), false);
});

test('geometria de modelo vazio não estoura', () => {
  const vazio = buildChartModel(base, []);
  const g = chartGeometry(vazio);
  assert.deepEqual(g.series, []);
  assert.deepEqual(g.eixoX, []);
});
