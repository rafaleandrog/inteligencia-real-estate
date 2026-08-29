// Carregamento das três abas de tráfego via loadDataset (issue #62).
//
// Cobre o critério de aceite "npm test verde, com teste do encadeamento tráfego →
// trecho → geometria" fim a fim, através da estratégia `gviz` de verdade (JSONP
// simulado), não só das funções puras de src/traffic/link.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDataset } from '../src/data.js';

const BASE_CONFIG = {
  spreadsheetId: 'SHEET1',
  dataSource: 'gviz',
  sheets: { listings: 'LISTINGS', developments: 'DEVELOPMENTS', anchors: 'ANCHORS' },
  polygonsSheet: 'POLYGONS',
  roadSegmentsSheet: 'ROAD_SEGMENTS',
  roadSegmentAliasesSheet: 'ROAD_SEGMENT_ALIASES',
  trafficDailySheet: 'TRAFFIC_DAILY_TEST',
};

/** cols/rows do GViz a partir de um array de objetos simples. */
function table(headers, rows) {
  return {
    cols: headers.map((h) => ({ id: h, label: h })),
    rows: rows.map((row) => ({ c: headers.map((h) => ({ v: row[h] ?? '' })) })),
  };
}

/** documentRef que responde por aba conforme o parâmetro `sheet` da URL do JSONP. */
function documentRefFor(tablesBySheet, { failFor = [] } = {}) {
  return {
    createElement: () => ({ remove() {} }),
    head: {
      append(script) {
        const url = new URL(script.src);
        const sheetName = url.searchParams.get('sheet');
        const tqx = url.searchParams.get('tqx');
        const callback = tqx.split('responseHandler:')[1];
        queueMicrotask(() => {
          if (failFor.includes(sheetName)) {
            script.onerror?.();
            return;
          }
          const t = tablesBySheet[sheetName] || { cols: [], rows: [] };
          globalThis[callback]({ status: 'ok', table: t });
        });
      },
    },
  };
}

test('loadDataset (gviz) encadeia TRAFFIC_DAILY_TEST → ROAD_SEGMENTS → POLYGONS', async () => {
  const tablesBySheet = {
    LISTINGS: table(['listing_id'], [{ listing_id: 'L1' }]),
    DEVELOPMENTS: table(['development_id'], [{ development_id: 'D1' }]),
    ANCHORS: table(['place_id'], [{ place_id: 'A1' }]),
    POLYGONS: table(
      ['polygon_id', 'category', 'geometry_geojson'],
      [{ polygon_id: 'POLY-9', category: 'road_network', geometry_geojson: '{"type":"LineString","coordinates":[[-47.9,-15.8],[-47.8,-15.7]]}' }]
    ),
    ROAD_SEGMENTS: table(
      ['road_segment_id', 'name', 'current_polygon_id'],
      [{ road_segment_id: 'RS-1', name: 'DF-001', current_polygon_id: 'POLY-9' }]
    ),
    ROAD_SEGMENT_ALIASES: table(
      ['road_segment_id', 'source_segment_code'],
      [{ road_segment_id: 'RS-1', source_segment_code: 'DER-001' }]
    ),
    TRAFFIC_DAILY_TEST: table(
      ['road_segment_id', 'source_segment_code', 'date', 'sentido', 'intervalos_15min_observados'],
      [
        { road_segment_id: 'RS-1', date: '2026-04-01', sentido: 'crescente', intervalos_15min_observados: 96 },
        // linha "antiga": sem road_segment_id, só o código externo — precisa resolver via alias.
        { road_segment_id: '', source_segment_code: 'DER-001', date: '2026-04-02', sentido: 'decrescente', intervalos_15min_observados: 90 },
      ]
    ),
  };

  const documentRef = documentRefFor(tablesBySheet);
  const originalDocument = globalThis.document;
  globalThis.document = documentRef;

  try {
    const result = await loadDataset(BASE_CONFIG);
    assert.equal(result.ok, true, `dataset devia carregar ok: ${result.errors.join('; ')}`);

    const trecho = result.traffic.bySegmentId.get('RS-1');
    assert.ok(trecho, 'RS-1 precisa aparecer no encadeamento');
    assert.equal(trecho.polygon.id, 'POLY-9', 'trecho precisa chegar até a geometria');
    assert.equal(trecho.traffic.crescente.length, 1);
    assert.equal(trecho.traffic.decrescente.length, 1, 'linha antiga resolvida por alias entra no sentido certo');
    assert.equal(result.traffic.orphaned.length, 0);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('loadDataset (gviz): as três abas de tráfego ausentes viram aviso, nunca erro (R2.5)', async () => {
  const tablesBySheet = {
    LISTINGS: table(['listing_id'], [{ listing_id: 'L1' }]),
    DEVELOPMENTS: table(['development_id'], [{ development_id: 'D1' }]),
    ANCHORS: table(['place_id'], [{ place_id: 'A1' }]),
  };

  const documentRef = documentRefFor(tablesBySheet, {
    failFor: ['ROAD_SEGMENTS', 'ROAD_SEGMENT_ALIASES', 'TRAFFIC_DAILY_TEST'],
  });
  const originalDocument = globalThis.document;
  globalThis.document = documentRef;

  try {
    const result = await loadDataset(BASE_CONFIG);
    assert.equal(result.ok, true, 'ausência das três abas de tráfego não pode impedir o dataset de carregar');
    assert.equal(result.traffic.bySegmentId.size, 0);
    assert.ok(
      result.warnings.some((w) => /ROAD_SEGMENTS/.test(w)),
      'a falha precisa aparecer como aviso, não silenciosamente'
    );
    assert.equal(result.errors.length, 0, 'aba opcional nunca vira erro fatal');
  } finally {
    globalThis.document = originalDocument;
  }
});

test('loadDataset (demo): traffic vem vazio mas presente quando o demo.json não traz as três abas', async () => {
  const config = {
    demoMode: true,
    demoUrl: 'inline',
    sheets: { listings: 'LISTINGS', developments: 'DEVELOPMENTS', anchors: 'ANCHORS' },
  };

  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      listings: [{ listing_id: 'A' }],
      developments: [{ development_id: 'B' }],
      anchors: [{ place_id: 'C' }],
    }),
  });

  try {
    const result = await loadDataset(config);
    assert.equal(result.ok, true);
    assert.ok(result.traffic, 'traffic nunca é undefined');
    assert.equal(result.traffic.bySegmentId.size, 0);
  } finally {
    globalThis.fetch = original;
  }
});
