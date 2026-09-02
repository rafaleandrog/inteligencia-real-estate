// Geometria dos gráficos do Mercado (issue #83).
//
// O que se afirma aqui é o que o renderizador NÃO decide: onde cada coisa cai, quantos
// rótulos cabem, o que acontece com um buraco e quando uma coluna deixa de ser coluna.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CHART_TYPES, buildChartModel } from '../src/ivv/chart-model.js';
import {
  VIEWPORTS, chartViewport, sparkViewport, chartGeometry, tipoEfetivo,
} from '../src/ivv/chart-layout.js';

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

test('o perfil é escolhido pela caixa do gráfico, não pela janela', () => {
  // A entrada é a largura do CARD. Um card de 498px num desktop de 1440 comporta os oito
  // rótulos; a mesma tela em 390px dá ~338px de card, onde oito rótulos viram tarja.
  assert.equal(chartViewport(338).nome, 'estreito');
  assert.equal(chartViewport(419).nome, 'estreito');
  assert.equal(chartViewport(420).nome, 'padrao');
  assert.equal(chartViewport(498).nome, 'padrao');
});

test('o viewBox acompanha a largura medida — é o desenho que cabe na caixa', () => {
  // Sem isto o `viewBox` fixo de 640 dentro de uma caixa de 498 escalava a arte inteira
  // por 0,78: rótulo de 10px chegando com 7,8px, traço de 2px com 1,56px (R8.74).
  for (const largura of [338, 420, 498, 528, 900]) {
    const viewport = chartViewport(largura);
    assert.equal(viewport.largura, largura, `largura de ${largura}`);
    const g = chartGeometry(modelo(CHART_TYPES.LINHA, [{ chave: 'a' }]), viewport);
    assert.equal(g.viewBox, `0 0 ${largura} ${viewport.altura}`);
    assert.ok(g.plot.x + g.plot.largura <= largura, 'o plot vazou da caixa');
  }
});

test('medida degenerada cai no fallback do perfil, nunca num viewBox de zero', () => {
  // `clientWidth` de container oculto é 0 — e um `viewBox` de largura 0 some da tela.
  assert.equal(chartViewport(0).largura, 360);
  assert.equal(chartViewport(Number.NaN).largura, 640);
  assert.equal(chartViewport(5000).largura, 1000, 'largura absurda é limitada');
  assert.equal(sparkViewport(0).largura, 160);
});

test('o sparkline tem perfil próprio e acompanha a largura do card', () => {
  assert.equal(sparkViewport(250).nome, 'spark');
  assert.equal(sparkViewport(250).largura, 250);
  const g = chartGeometry(modelo(CHART_TYPES.LINHA, [{ chave: 'a' }]), sparkViewport(250));
  assert.equal(g.viewBox, '0 0 250 40');
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
  assert.equal(g.viewBox, '0 0 160 40');
});

test('a coluna tem teto de espessura e vão entre vizinhas', () => {
  // Coluna que ocupa a banda inteira vira bloco: engorda a marca e come o ar. O que separa
  // duas colunas é um vão na cor do fundo, nunca um contorno desenhado em volta.
  const larga = chartGeometry(modelo(CHART_TYPES.COLUNAS, [{ chave: 'a' }], 4), chartViewport(900));
  assert.ok(larga.series[0].colunas.every((c) => c.largura <= 24),
    `coluna acima do teto: ${larga.series[0].colunas[0].largura}`);

  const duas = chartGeometry(modelo(CHART_TYPES.COLUNAS, [{ chave: 'a' }, { chave: 'b' }]), chartViewport(498));
  const [a, b] = [duas.series[0].colunas[0], duas.series[1].colunas[0]];
  assert.ok(Math.abs((b.x - (a.x + a.largura)) - 2) < 0.05, 'o vão entre vizinhas não é de 2px');
});

test('categoriasX dá a posição de cada mês, e casa com os marcadores', () => {
  // É por ela que o crosshair acha o mês mais próximo do ponteiro. Se divergir da posição
  // real da marca, a linha guia aponta para um mês e o balão mostra outro.
  const g = chartGeometry(modelo(CHART_TYPES.LINHA, [{ chave: 'a' }]), chartViewport(498));
  assert.equal(g.categoriasX.length, 12);
  assert.deepEqual(g.categoriasX, g.series[0].marcadores.map((m) => m.cx));
  const colunas = chartGeometry(modelo(CHART_TYPES.COLUNAS, [{ chave: 'a' }]), chartViewport(498));
  assert.equal(colunas.categoriasX.length, 12);
  assert.ok(colunas.categoriasX[0] > colunas.plot.x, 'a categoria cai no centro da banda');
});

test('o último ponto com valor é a âncora do rótulo direto', () => {
  const valores = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null, null];
  const g = chartGeometry(modelo(CHART_TYPES.LINHA, [{ chave: 'a', valores }]), chartViewport(498));
  const ultimo = g.series[0].ultimoPonto;
  // O último COM VALOR, não o último do eixo: série que acaba em buraco não pendura o
  // rótulo no vazio.
  assert.equal(ultimo.rotulo, '10');
  assert.equal(ultimo.cx, g.categoriasX[9]);
  assert.equal(chartGeometry(modelo(CHART_TYPES.COLUNAS, [{ chave: 'a' }]), chartViewport(498))
    .series[0].ultimoPonto, null, 'coluna não tem ponto final');
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
