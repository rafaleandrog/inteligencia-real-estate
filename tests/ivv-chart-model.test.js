// Modelo semântico dos gráficos do Mercado (issue #83).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHART_TYPES, CHART_SOURCES, buildChartModel, chartTable, niceTicks, thinLabels,
} from '../src/ivv/chart-model.js';

const definicao = {
  key: 'teste',
  titulo: 'Teste',
  formatar: (v) => `${v}`,
  rotuloCategoria: (c) => c.replace('2026-', ''),
};

const serie = (chave, pontos, cat = 1) => ({
  chave, rotulo: chave.toUpperCase(), cat,
  pontos: pontos.map(([categoria, valor]) => ({ categoria, valor })),
});

test('vocabulários são fechados e congelados', () => {
  assert.deepEqual(Object.values(CHART_TYPES).sort(), ['area', 'colunas', 'linha']);
  assert.deepEqual(Object.values(CHART_SOURCES).sort(), ['completa', 'janela', 'periodo']);
  assert.ok(Object.isFrozen(CHART_TYPES) && Object.isFrozen(CHART_SOURCES));
});

test('niceTicks devolve múltiplos redondos dentro do domínio', () => {
  assert.deepEqual(niceTicks(0, 2375, 4), [0, 1000, 2000]);
  for (const marca of niceTicks(11800, 14400, 4)) {
    assert.ok(marca >= 11800 && marca <= 14400, `marca fora do domínio: ${marca}`);
  }
});

test('niceTicks não estoura em domínio degenerado', () => {
  assert.deepEqual(niceTicks(5, 5, 4), [5]);
  assert.deepEqual(niceTicks(0, 0, 4), [0]);
  assert.deepEqual(niceTicks(Number.NaN, 3, 4), []);
  assert.ok(niceTicks(-40, 40, 4).includes(0), 'domínio que cruza zero marca o zero');
});

test('niceTicks não devolve dízima do acumulador de ponto flutuante', () => {
  for (const marca of niceTicks(0, 0.35, 4)) {
    assert.equal(String(marca).length <= 5, true, `marca com resíduo binário: ${marca}`);
  }
});

test('thinLabels mantém o primeiro e o último rótulo', () => {
  const indices = thinLabels(66, 8);
  assert.equal(indices[0], 0);
  assert.equal(indices.at(-1), 65);
  assert.ok(indices.length <= 9, `rótulos demais: ${indices.length}`);
  assert.deepEqual(thinLabels(4, 8), [0, 1, 2, 3]);
  assert.deepEqual(thinLabels(0, 8), []);
  assert.deepEqual(thinLabels(10, 0), []);
});

test('ausência preserva a categoria e vira frase, nunca zero', () => {
  const modelo = buildChartModel(definicao, [
    serie('a', [['2026-01', 10], ['2026-02', null], ['2026-03', 30]]),
  ]);
  assert.equal(modelo.categorias.length, 3, 'o mês sem valor continua no eixo');
  const ausente = modelo.series[0].pontos[1];
  assert.equal(ausente.valor, null);
  assert.equal(ausente.rotulo, null);
  assert.match(ausente.titulo, /sem valor publicado/);
  assert.equal(modelo.y.min, 0);
  assert.equal(modelo.y.max, 30);
});

test('categoria presente em uma série e ausente na outra vira buraco, não deslocamento', () => {
  const modelo = buildChartModel(definicao, [
    serie('a', [['2026-01', 1], ['2026-02', 2]]),
    serie('b', [['2026-02', 20]], 2),
  ]);
  assert.deepEqual(modelo.categorias.map((c) => c.chave), ['2026-01', '2026-02']);
  assert.equal(modelo.series[1].pontos[0].valor, null);
  assert.equal(modelo.series[1].pontos[1].valor, 20);
});

test('série inteiramente sem valor é vazia declarada, com mensagem', () => {
  const modelo = buildChartModel(definicao, [serie('a', [['2026-01', null]])]);
  assert.equal(modelo.vazio, true);
  assert.match(modelo.mensagemVazio, /Sem valores mensais/);
  assert.match(modelo.ariaLabel, /Teste/);
});

test('baseZero decide o piso do eixo, e sem ele o domínio ganha folga', () => {
  const pontos = [['2026-01', 11800], ['2026-02', 12670]];
  assert.equal(buildChartModel(definicao, [serie('a', pontos)]).y.min, 0);
  const solto = buildChartModel({ ...definicao, baseZero: false }, [serie('a', pontos)]);
  assert.ok(solto.y.min > 0 && solto.y.min < 11800, `piso inesperado: ${solto.y.min}`);
  assert.ok(solto.y.max > 12670);
});

test('o eixo Y usa o formatador da métrica, não o número cru', () => {
  const modelo = buildChartModel(
    { ...definicao, formatar: (v) => `R$ ${v}` },
    [serie('a', [['2026-01', 100], ['2026-02', 400]])],
  );
  assert.ok(modelo.y.ticks.every((t) => t.rotulo.startsWith('R$ ')), 'tick sem formatação');
});

test('a série declara índice de paleta, nunca cor', () => {
  const modelo = buildChartModel(definicao, [serie('a', [['2026-01', 1]], 3)]);
  assert.equal(modelo.series[0].cat, 3);
  assert.equal(JSON.stringify(modelo).includes('#'), false, 'cor literal vazou para o modelo');
});

test('chartTable devolve uma linha por categoria, com frase na ausência', () => {
  const modelo = buildChartModel(definicao, [
    serie('a', [['2026-01', 10], ['2026-02', null]]),
    serie('b', [['2026-01', 1], ['2026-02', 2]], 2),
  ]);
  assert.deepEqual(chartTable(modelo).colunas, ['Mês', 'A', 'B']);
  assert.deepEqual(chartTable(modelo).linhas, [
    ['01', '10', '1'],
    ['02', 'sem valor publicado', '2'],
  ]);
  assert.deepEqual(modelo.tabela, chartTable(modelo));
});

test('modelo sem série nenhuma não estoura', () => {
  const modelo = buildChartModel(definicao, []);
  assert.equal(modelo.vazio, true);
  assert.deepEqual(modelo.categorias, []);
  assert.deepEqual(modelo.tabela.linhas, []);
});
