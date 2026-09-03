// Camadas de contorno: identidade (layer_group / entity_type), estilo cartográfico
// vindo do backend e ordem de desenho declarada — issues #51 e #52.
//
// O que este arquivo existe para impedir tem duas formas, e as duas são silenciosas:
// um contorno que SOME do mapa sem erro nenhum (dado antigo sem `layer_group`, estilo
// que vira atributo SVG inválido) e um contorno que COBRE outro por sorteio, roubando
// o clique junto com a cor.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  polygonLayerGroup, polygonEntityType, formatLayerGroup, formatEntityType,
  polygonStyle, POLYGON_FALLBACK_STYLE, POLYGON_UNCLASSIFIED,
  comparePolygonDrawOrder, sortPolygonsForDraw,
} from '../src/format.js';
import {
  createFilterState, groupPolygonsForLegend, polygonPassesLayerFilters, polygonTypeKey,
} from '../src/filters.js';
import { normalizePolygon } from '../src/normalize.js';

const poly = (over = {}) => ({ id: 'P', status: 'active', ...over });

// --- Identidade: vocabulário aberto, e nada some por não estar classificado ---------

test('contorno sem layer_group/entity_type cai em "Outros", nunca some', () => {
  assert.equal(polygonLayerGroup(poly()), POLYGON_UNCLASSIFIED);
  assert.equal(polygonEntityType(poly()), POLYGON_UNCLASSIFIED);
  assert.equal(formatLayerGroup(POLYGON_UNCLASSIFIED), 'Outros');
  assert.equal(formatEntityType(POLYGON_UNCLASSIFIED), 'Sem tipo declarado');
  // String vazia e espaço em branco são a mesma ausência que `undefined`.
  assert.equal(polygonLayerGroup(poly({ layer_group: '   ' })), POLYGON_UNCLASSIFIED);
});

test('grupo desconhecido é humanizado, não vaza o slug nem some', () => {
  // O vocabulário é aberto de propósito: o backend pode criar um grupo novo sem que
  // ninguém edite este repositório, e ele precisa aparecer legível na legenda.
  assert.equal(formatLayerGroup('hidrografia_df'), 'Hidrografia df');
  assert.equal(formatEntityType('corpo_dagua'), 'Corpo dagua');
  assert.equal(formatLayerGroup('road_network'), 'Malha rodoviária');
  assert.equal(formatEntityType('road_segment'), 'Trecho rodoviário');
});

// --- Estilo: o que o backend declara vale; o que não é utilizável vira fallback -----

test('estilo declarado pelo backend chega inteiro ao mapa', () => {
  const style = polygonStyle(poly({
    fill_color: '#2f6f4f', stroke_color: '#123456', fill_opacity: 0.28, stroke_width: 1.2,
  }));
  assert.deepEqual(style, {
    color: '#123456', fillColor: '#2f6f4f', fillOpacity: 0.28, weight: 1.2, dashArray: null,
  });
});

test('cor inutilizável cai no fallback em vez de virar atributo SVG inválido', () => {
  // Este é o modo de falha caro: o navegador ignora `fill="vermelho"` em silêncio, e o
  // contorno fica invisível sem UMA linha no console apontando para a célula errada.
  for (const bad of ['vermelho', 'rgb(1,2,3)', '#12', '#1234567', '', null, 42]) {
    const style = polygonStyle(poly({ fill_color: bad, stroke_color: bad }));
    assert.equal(style.fillColor, POLYGON_FALLBACK_STYLE.fillColor, String(bad));
    assert.equal(style.color, POLYGON_FALLBACK_STYLE.color, String(bad));
  }
  // `#rgb` e maiúsculas são hex legítimos.
  assert.equal(polygonStyle(poly({ fill_color: '#ABC' })).fillColor, '#ABC');
});

test('opacidade e espessura fora de faixa caem no fallback', () => {
  for (const bad of [5, -0.5, Number.NaN, null, '0.4']) {
    assert.equal(polygonStyle(poly({ fill_opacity: bad })).fillOpacity,
      POLYGON_FALLBACK_STYLE.fillOpacity, String(bad));
  }
  // Espessura de 400 por erro de digitação cobriria o mapa inteiro, e o sintoma (mapa
  // cinza) não aponta para a célula que o causou.
  for (const bad of [0, -2, 999, Number.NaN, null]) {
    assert.equal(polygonStyle(poly({ stroke_width: bad })).weight,
      POLYGON_FALLBACK_STYLE.weight, String(bad));
  }
  assert.equal(polygonStyle(poly({ fill_opacity: 0 })).fillOpacity, 0);
  assert.equal(polygonStyle(poly({ stroke_width: 12 })).weight, 12);
});

test('a coluna legada `color` ainda vale, antes da constante', () => {
  // Contorno importado de KML antes da v2.2.1 não tem fill_color/stroke_color. Perder a
  // cor que ele já tinha seria regressão visível de uma mudança que ninguém pediu.
  const style = polygonStyle(poly({ color: '#aa3344' }));
  assert.equal(style.fillColor, '#aa3344');
  assert.equal(style.color, '#aa3344');
  // Mas o que o backend declara vence a coluna legada.
  assert.equal(polygonStyle(poly({ color: '#aa3344', fill_color: '#2f6f4f' })).fillColor, '#2f6f4f');
});

test('polygonStyle lê o que normalizePolygon produz, não um formato inventado', () => {
  // O normalizador devolve número em fill_opacity/stroke_width e texto no resto. Se as
  // duas camadas discordassem do tipo, o estilo cairia no fallback em produção e os
  // testes acima continuariam verdes — é a mesma armadilha da R8.44.
  const normalized = normalizePolygon({
    polygon_id: 'P1', layer_group: 'road_network', entity_type: 'road_segment',
    fill_color: '#53606b', stroke_color: '#374151', fill_opacity: '0,35', stroke_width: '1,5',
    z_index: '40', status: 'active',
  });
  assert.equal(polygonLayerGroup(normalized), 'road_network');
  assert.deepEqual(polygonStyle(normalized), {
    color: '#374151', fillColor: '#53606b', fillOpacity: 0.35, weight: 1.5, dashArray: null,
  });
  assert.equal(normalized.z_index, 40);
});

// --- Tracejado: distinguir corredor desenhado à mão do sincronizado oficialmente ----

test('trecho_importante_manual sai tracejado — nunca confundível com rodovia oficial do DER', () => {
  const manual = polygonStyle(poly({ subcategory: 'trecho_importante_manual' }));
  assert.equal(manual.dashArray, '6,4');

  // A rodovia sincronizada de verdade (`rodovia_der`, gravada por `upsertRoadPolygon_`) e
  // qualquer contorno sem essa subcategory continuam sólidos.
  assert.equal(polygonStyle(poly({ subcategory: 'rodovia_der' })).dashArray, null);
  assert.equal(polygonStyle(poly({ layer_group: 'road_network' })).dashArray, null);
  assert.equal(polygonStyle(poly()).dashArray, null);
});

// --- Ordem de desenho ---------------------------------------------------------------

test('z_index declarado manda, e ausente perde para declarado', () => {
  const ordered = sortPolygonsForDraw([
    poly({ id: 'c', z_index: 30 }), poly({ id: 'a', z_index: 10 }),
    poly({ id: 'sem' }), poly({ id: 'b', z_index: 20 }),
  ]).map((p) => p.id);
  assert.deepEqual(ordered, ['a', 'b', 'c', 'sem']);
});

test('sem z_index, área grande fica embaixo e corredor estreito por cima', () => {
  // Cobrir rouba o clique junto com a cor: uma RA por cima de um trecho rodoviário
  // torna o trecho inalcançável, e nada na tela explica por quê.
  const ordered = sortPolygonsForDraw([
    poly({ id: 'estrada', layer_group: 'road_network' }),
    poly({ id: 'ra', layer_group: 'administrative_regions' }),
    poly({ id: 'kml', layer_group: 'poligonais_importadas' }),
    poly({ id: 'novo', layer_group: 'hidrografia_df' }),
    poly({ id: 'legado' }),
  ]).map((p) => p.id);
  // `legado` é contorno anterior à v2.2.1, sem `layer_group`. Ele desenha junto dos KML
  // importados — que é o que ele é —, e NÃO no topo com os grupos desconhecidos: no topo
  // ele cobriria as rodovias, e cobrir rouba o clique.
  assert.deepEqual(ordered, ['ra', 'kml', 'legado', 'estrada', 'novo']);
});

test('o empilhamento não depende da ordem das linhas da planilha', () => {
  // Inserir uma linha na planilha mudaria a ordem de entrada. Se o empilhamento
  // dependesse dela, o mapa mudaria entre recarregamentos sem nada ter mudado no dado.
  const grupo = [
    poly({ id: 'z9', layer_group: 'road_network' }),
    poly({ id: 'a1', layer_group: 'road_network' }),
    poly({ id: 'm5', layer_group: 'road_network' }),
  ];
  const direta = sortPolygonsForDraw(grupo).map((p) => p.id);
  const invertida = sortPolygonsForDraw([...grupo].reverse()).map((p) => p.id);
  assert.deepEqual(direta, invertida);
  assert.deepEqual(direta, ['a1', 'm5', 'z9']);
});

test('sortPolygonsForDraw não muta a lista recebida', () => {
  const original = [poly({ id: 'b', z_index: 2 }), poly({ id: 'a', z_index: 1 })];
  sortPolygonsForDraw(original);
  assert.deepEqual(original.map((p) => p.id), ['b', 'a']);
  assert.deepEqual(sortPolygonsForDraw(null), []);
});

test('comparePolygonDrawOrder é antissimétrico', () => {
  const a = poly({ id: 'a', layer_group: 'administrative_regions' });
  const b = poly({ id: 'b', layer_group: 'road_network' });
  assert.ok(comparePolygonDrawOrder(a, b) < 0);
  assert.ok(comparePolygonDrawOrder(b, a) > 0);
  assert.equal(comparePolygonDrawOrder(a, a), 0);
});

// --- Legenda ------------------------------------------------------------------------

const cenario = [
  poly({ id: 'ra1', layer_group: 'administrative_regions', entity_type: 'administrative_region' }),
  poly({ id: 'tr1', layer_group: 'road_network', entity_type: 'road_segment' }),
  poly({ id: 'tr2', layer_group: 'road_network', entity_type: 'road_segment' }),
  poly({ id: 'en1', layer_group: 'road_network', entity_type: 'road_junction' }),
  poly({ id: 'antigo' }),
];

test('a legenda agrupa por layer_group e conta por tipo', () => {
  const groups = groupPolygonsForLegend(cenario);
  // "Outros" antes da malha rodoviária porque a legenda lê na ordem de DESENHO, e
  // contorno legado desenha junto dos KML importados, abaixo das rodovias.
  assert.deepEqual(groups.map((g) => [g.label, g.count]), [
    ['Regiões administrativas', 1],
    ['Outros', 1],
    ['Malha rodoviária', 3],
  ]);
  // `road_junction` não está na tabela de rótulos de propósito: o backend v2.2.1 não
  // produz esse tipo. Ele aparece humanizado, que é o vocabulário aberto funcionando
  // ponta a ponta — inventar um rótulo aqui seria fixar um nome que ninguém escreve.
  const rodovia = groups.find((g) => g.key === 'road_network');
  assert.deepEqual(rodovia.types.map((t) => [t.label, t.count]),
    [['Road junction', 1], ['Trecho rodoviário', 2]]);
});

test('a legenda lê na mesma ordem em que o mapa empilha, não em ordem alfabética', () => {
  // Ordem alfabética não corresponde a nada visível na tela.
  const keys = groupPolygonsForLegend(cenario).map((g) => g.key);
  assert.deepEqual(keys, ['administrative_regions', POLYGON_UNCLASSIFIED, 'road_network']);
});

test('contorno inativo não entra na legenda — o mapa também não o desenha', () => {
  const groups = groupPolygonsForLegend([
    ...cenario, poly({ id: 'morto', layer_group: 'road_network', status: 'inactive' }),
  ]);
  assert.equal(groups.find((g) => g.key === 'road_network').count, 3);
});

test('a legenda de lista vazia é vazia, sem estourar', () => {
  assert.deepEqual(groupPolygonsForLegend([]), []);
  assert.deepEqual(groupPolygonsForLegend(null), []);
  assert.deepEqual(groupPolygonsForLegend([null, undefined]), []);
});

// --- Filtro -------------------------------------------------------------------------

test('sem legenda montada, tudo passa — null não é Set vazio', () => {
  // `null` é "ainda não há legenda"; Set vazio é "o operador desligou tudo". Confundir
  // os dois faria a camada inteira sumir no primeiro quadro.
  const filters = createFilterState();
  assert.equal(filters.polygonGroups, null);
  for (const p of cenario) assert.equal(polygonPassesLayerFilters(p, filters), true, p.id);

  filters.polygonGroups = new Set();
  for (const p of cenario) assert.equal(polygonPassesLayerFilters(p, filters), false, p.id);
});

test('desligar um grupo tira só aquele grupo', () => {
  const filters = createFilterState();
  filters.polygonGroups = new Set(['administrative_regions', POLYGON_UNCLASSIFIED]);
  const passam = cenario.filter((p) => polygonPassesLayerFilters(p, filters)).map((p) => p.id);
  assert.deepEqual(passam, ['ra1', 'antigo']);
});

test('desligar um tipo tira só aquele tipo, dentro do seu grupo', () => {
  const filters = createFilterState();
  filters.polygonTypes = new Set([
    polygonTypeKey('road_network', 'road_segment'),
    polygonTypeKey('administrative_regions', 'administrative_region'),
    polygonTypeKey(POLYGON_UNCLASSIFIED, POLYGON_UNCLASSIFIED),
  ]);
  const passam = cenario.filter((p) => polygonPassesLayerFilters(p, filters)).map((p) => p.id);
  assert.deepEqual(passam, ['ra1', 'tr1', 'tr2', 'antigo']);
});

test('a chave do tipo é composta: mesmo nome de tipo em grupos diferentes não colide', () => {
  // O vocabulário é aberto dos dois lados, então nada impede dois grupos de usarem o
  // mesmo `entity_type`. Chave só pelo tipo apagaria o do grupo vizinho junto.
  const a = poly({ id: 'a', layer_group: 'grupo_a', entity_type: 'trecho' });
  const b = poly({ id: 'b', layer_group: 'grupo_b', entity_type: 'trecho' });
  const filters = createFilterState();
  filters.polygonTypes = new Set([polygonTypeKey('grupo_a', 'trecho')]);
  assert.equal(polygonPassesLayerFilters(a, filters), true);
  assert.equal(polygonPassesLayerFilters(b, filters), false);
});

test('o interruptor mestre da camada continua vencendo os dois níveis', () => {
  const filters = createFilterState();
  filters.layers = new Set(['listing']);
  for (const p of cenario) assert.equal(polygonPassesLayerFilters(p, filters), false, p.id);
});

test('contorno inativo não passa no filtro, mesmo com tudo ligado', () => {
  const filters = createFilterState();
  assert.equal(polygonPassesLayerFilters(poly({ status: 'inactive' }), filters), false);
  assert.equal(polygonPassesLayerFilters(null, filters), false);
});
