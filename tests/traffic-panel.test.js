import test from 'node:test';
import assert from 'node:assert/strict';
import { trafficSegmentRow, trafficPanelRows } from '../src/traffic/panel.js';
import { linkTrafficDataset } from '../src/traffic/link.js';
import {
  normalizeRoadSegments, normalizeRoadSegmentAliases, normalizeTrafficDailyRecords,
} from '../src/traffic/normalize.js';

function trecho(overrides = {}) {
  return {
    roadSegmentId: 'RS-1',
    name: 'DF-001',
    roadCode: 'DF-001',
    sourceSegmentCode: 'DER-001',
    segmentType: 'rodovia',
    jurisdiction: 'DER-DF',
    currentPolygonId: null,
    polygon: null,
    traffic: { crescente: [], decrescente: [], semSentido: [] },
    ...overrides,
  };
}

test('trafficSegmentRow devolve null para trecho ausente', () => {
  assert.equal(trafficSegmentRow(null), null);
});

test('trafficSegmentRow expõe hasGeometry=false quando current_polygon_id está vazio', () => {
  const row = trafficSegmentRow(trecho());
  assert.equal(row.hasGeometry, false);
  assert.equal(row.polygonId, null);
});

test('trafficSegmentRow expõe hasGeometry=true e o id do polígono quando linkado', () => {
  const row = trafficSegmentRow(trecho({ polygon: { id: 'POLY-9' } }));
  assert.equal(row.hasGeometry, true);
  assert.equal(row.polygonId, 'POLY-9');
});

test('trafficSegmentRow separa o resumo por sentido — crescente e decrescente não se somam', () => {
  const row = trafficSegmentRow(trecho({
    traffic: {
      crescente: [
        { date: '2026-04-01', flow: 1000, intervalsObserved: 96 },
        { date: '2026-04-02', flow: 1200, intervalsObserved: 96 },
      ],
      decrescente: [
        { date: '2026-04-01', flow: 500, intervalsObserved: 96 },
      ],
      semSentido: [],
    },
  }));

  assert.equal(row.porSentido.crescente.avgDailyFlow, 1100);
  assert.equal(row.porSentido.decrescente.avgDailyFlow, 500);
  // O resumo geral mistura os sentidos só para o total de dias com alguma medição —
  // nunca é usado como "o" fluxo médio do trecho.
  assert.equal(row.geral.daysUsed, 3);
});

test('trafficSegmentRow devolve porSentido null quando o sentido não tem registro', () => {
  const row = trafficSegmentRow(trecho());
  assert.equal(row.porSentido.crescente, null);
  assert.equal(row.porSentido.decrescente, null);
});

test('trafficSegmentRow acha o fluxo mais recente e a janela de datas pelo maior/menor dia', () => {
  const row = trafficSegmentRow(trecho({
    traffic: {
      crescente: [
        { date: '2026-04-05', flow: 900, intervalsObserved: 96 },
        { date: '2026-04-01', flow: 800, intervalsObserved: 96 },
        { date: '2026-04-03', flow: 850, intervalsObserved: 96 },
      ],
      decrescente: [],
      semSentido: [],
    },
  }));

  assert.equal(row.porSentido.crescente.latestFlow, 900);
  assert.equal(row.porSentido.crescente.latestDate, '2026-04-05');
  assert.equal(row.porSentido.crescente.windowStart, '2026-04-01');
  assert.equal(row.porSentido.crescente.windowEnd, '2026-04-05');
});

test('trafficSegmentRow propaga dias parciais e excluídos declarados por averageFlow', () => {
  const row = trafficSegmentRow(trecho({
    traffic: {
      crescente: [
        { date: '2026-04-01', flow: 1000, intervalsObserved: 96 },
        // dia parcial: 90/96 intervalos — entra na média, mas é contado à parte.
        { date: '2026-04-02', flow: 900, intervalsObserved: 90 },
        // zero intervalos observados é ausência de medição, não dia parcial — excluído.
        { date: '2026-04-03', flow: null, intervalsObserved: 0 },
      ],
      decrescente: [],
      semSentido: [],
    },
  }));

  const resumo = row.porSentido.crescente;
  assert.equal(resumo.daysUsed, 2);
  assert.equal(resumo.partialDaysUsed, 1);
  assert.equal(resumo.daysExcluded, 1);
});

test('trafficPanelRows ordena por nome, e por id quando o nome falta', () => {
  const rows = trafficPanelRows(new Map([
    ['RS-2', trecho({ roadSegmentId: 'RS-2', name: 'DF-003' })],
    ['RS-1', trecho({ roadSegmentId: 'RS-1', name: 'DF-001' })],
    ['RS-3', trecho({ roadSegmentId: 'RS-3', name: '' })],
  ]));

  assert.deepEqual(rows.map((r) => r.id), ['RS-1', 'RS-2', 'RS-3']);
});

test('trafficPanelRows devolve lista vazia sem lançar quando não há trechos', () => {
  assert.deepEqual(trafficPanelRows(new Map()), []);
  assert.deepEqual(trafficPanelRows(undefined), []);
});

test('integração com linkTrafficDataset: painel reflete o piloto de 5 trechos sem geometria', () => {
  const segments = normalizeRoadSegments([
    { road_segment_id: 'RS-1', road_name: 'DF-001', road_code: 'DF-001', jurisdiction: 'DER-DF' },
  ]).records;
  const aliases = normalizeRoadSegmentAliases([
    { road_segment_id: 'RS-1', source_segment_code: 'DER-001' },
  ]).records;
  const trafficRecords = normalizeTrafficDailyRecords([
    {
      trecho: 'DER-001', dia: '2026-04-01', sentido: 'crescente',
      fluxo_total: 1000, intervalos_15min_observados: 96,
    },
  ]).records;

  const { bySegmentId } = linkTrafficDataset(segments, [], trafficRecords, aliases);
  const rows = trafficPanelRows(bySegmentId);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].hasGeometry, false);
  assert.equal(rows[0].porSentido.crescente.avgDailyFlow, 1000);
});
