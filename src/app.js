// Interação, mapa e ligação entre filtros e dados.
//
// A lógica testável mora nos módulos puros (normalize, filters, format). Aqui fica
// apenas o que precisa do DOM e do Leaflet.
//
// Regra de segurança que vale para o arquivo inteiro: nenhuma string vinda dos dados
// entra em innerHTML. Todo texto vai por textContent e todo elemento é criado com
// createElement (docs/ENGINEERING_RULES.md, R4.4).

import { loadDataset, flattenEntities } from './data.js';
import { isApproximateLocation, appMetaRows } from './normalize.js';
import { ivvProvenance, IVV_SCOPE_NOTICE } from './ivv/scope.js';
import {
  buildRegionRanking, faixasDisponiveis, regionMonths, REGIAO_TOTAL, FAIXA_TOTAL,
} from './ivv/region.js';
import { aggregatePeriod } from './ivv/aggregate.js';
import { buildMarketDashboard, formatMetricValue } from './ivv/cards.js';
import {
  PERIOD_MODE_OPTIONS, PERIOD_MODES, availableYears, availableMonths, controlDisabledReason,
  defaultPeriodSelection, selectIvvPeriod, chartRowsForSelection, periodSummary,
  monthYearLabel, mesAnterior, mesmoMesAnoAnterior,
} from './ivv/period.js';
import {
  buildHistoryCharts, buildSeasonality, buildSparkline, SERIES_MODES,
} from './ivv/history.js';
import { CHART_TYPES } from './ivv/chart-model.js';
import { chartGeometry, chartViewport, sparkViewport } from './ivv/chart-layout.js';
import {
  anchorLegendGroups, applyFilters, computeKpis, createFilterState, distinctAnchorGroups,
  distinctAnchorSegments, distinctLocalities, distinctPropertyTypes, distinctRegions,
  distinctRegularizationStatuses, distinctSalesStages, LAYERS,
  groupPolygonsForLegend, polygonPassesLayerFilters, raProfileForPolygon,
} from './filters.js';
import {
  formatBRL, formatBRLCompact, formatM2, formatNumber, formatPriceM2, formatDate,
  formatPropertyType, formatSpatialPrecision, formatBuildingOrientation, safeExternalUrl,
  hostnameOf, anchorColor, anchorLegendEntries, formatAnchorCategory, formatAnchorGroup,
  formatAnchorSegment, formatSalesStage, formatRegularizationStatus, formatPercent,
  percentFromPoints, raAgeBands, polygonStyle, sortPolygonsForDraw, raProfileEssentials,
  raProfileUnavailability, polygonEssentials, polygonPropertyTiers, polygonEssentialKeys,
  polygonEntityType,
} from './format.js';

const CONFIG = window.APP_CONFIG || {};

const el = (id) => document.getElementById(id);

const dom = {
  search: el('search'), locality: el('locality'), ptype: el('ptype'),
  raFilter: el('raFilter'), raProfile: el('raProfile'),
  buildingOrientation: el('buildingOrientation'),
  anchorGroup: el('anchorGroup'), anchorSegment: el('anchorSegment'),
  salesStage: el('salesStage'), regularizationStatus: el('regularizationStatus'),
  priceMin: el('priceMin'), priceMax: el('priceMax'), beds: el('beds'),
  clearFilters: el('clearFilters'), layers: el('layersSection'),
  kpiVisible: el('kpiVisible'), kpiMedian: el('kpiMedian'), kpiNote: el('kpiNote'),
  loadingState: el('loadingState'), errorState: el('errorState'),
  errorTitle: el('errorTitle'), errorDetail: el('errorDetail'), retryBtn: el('retryBtn'),
  sourceBadge: el('sourceBadge'),
  dataWarnings: el('dataWarnings'), dataWarningsSummary: el('dataWarningsSummary'),
  dataWarningsList: el('dataWarningsList'),
  datasetMeta: el('datasetMeta'), datasetMetaList: el('datasetMetaList'),
  datasetMetaSummary: el('datasetMetaSummary'),
  detail: el('detail'), detailTitle: el('detailTitle'), detailBody: el('detailBody'),
  closeDetail: el('closeDetail'),
  anchorLegend: el('anchorLegend'),
  polygonLayers: el('polygonLayers'), polygonLayerLabel: el('polygonLayerLabel'),
  polygonMasterLayer: el('polygonMasterLayer'), countPolygon: el('countPolygon'),
  viewSwitch: el('viewSwitch'), marketTab: el('marketTab'),
  mapView: el('mapView'), marketView: el('marketView'),
  marketScope: el('marketScope'), marketBody: el('marketBody'),
  marketPeriodChips: el('marketPeriodChips'), marketYear: el('marketYear'),
  marketMonth: el('marketMonth'),
  marketStart: el('marketStart'), marketEnd: el('marketEnd'),
  marketPeriodLabel: el('marketPeriodLabel'), marketPeriodBase: el('marketPeriodBase'),
  marketDestaques: el('marketDestaques'), marketCharts: el('marketCharts'),
  marketSeriesMode: el('marketSeriesMode'),
  marketRegioes: el('marketRegioes'), marketRegioesFaixa: el('marketRegioesFaixa'),
  marketRegioesLista: el('marketRegioesLista'), marketRegioesNote: el('marketRegioesNote'),
  marketRegioesAusentes: el('marketRegioesAusentes'),
  marketHistoryNote: el('marketHistoryNote'),
  marketProvenance: el('marketProvenance'), marketProvenanceList: el('marketProvenanceList'),
  marketSource: el('marketSource'),
};

const state = {
  records: [],
  filters: createFilterState(),
  markers: new Map(),
  selectedId: null,
  // Indicadores por RA (issue #33/#34): mapa ra_geo_id -> perfil, vazio quando
  // RA_PROFILES está ausente/indisponível — o filtro de RA continua funcionando,
  // só sem nome/população/densidade.
  raProfiles: {},
  // Série mensal do IVV (issue #56). Lista vazia significa "a aba não veio", que é
  // estado normal — o botão do Mercado fica desabilitado, com o motivo escrito.
  ivvMonthly: [],
  // IVV por Região Administrativa (issue #87). Lista vazia é estado normal: a aba pode não
  // vir, e a seção territorial simplesmente não aparece.
  ivvRegion: [],
  marketRegionBucket: null,
  marketSelection: null,
  marketSeriesMode: null,
  baseWarnings: [],
  // Contornos importados de KML/KMZ (issue #28). Lista vazia é o estado normal de
  // quem ainda não importou nenhum arquivo — a camada só não aparece.
  polygons: [],
};

let map = null;
let markerLayer = null;
let polygonLayer = null;

/** Raio do marcador por camada: anúncio é o dado principal, âncora é contexto. */
const MARKER_RADIUS = { listing: 6, development: 7, anchor: 4 };

const LAYER_LABEL = {
  listing: 'Anúncio secundário',
  development: 'Empreendimento',
  anchor: 'Âncora',
};

// --- Mapa -----------------------------------------------------------------

function initMap() {
  map = L.map('map', {
    center: CONFIG.defaultCenter || [-15.78, -47.93],
    zoom: CONFIG.defaultZoom || 10,
    zoomControl: true,
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; colaboradores do <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
  }).addTo(map);

  // Duas camadas separadas, e os polígonos entram ANTES: o Leaflet empilha na ordem
  // de adição, então um contorno criado depois cobriria os marcadores e roubaria o
  // clique deles.
  polygonLayer = L.layerGroup().addTo(map);
  markerLayer = L.layerGroup().addTo(map);
}

/**
 * Desenha a camada de contornos (issues #28, #51, #52).
 *
 * Três coisas acontecem aqui, e as três são decisões:
 *
 * 1. **Filtro por grupo e tipo** (#51). Rodovia não é camada nova: é uma linha de
 *    `POLYGONS` com `layer_group: 'road_network'`. Filtrar por `layer_group` +
 *    `entity_type` é o que faz o mapa distinguir uma RA de um trecho rodoviário.
 * 2. **Ordem de desenho declarada** (#52). Sem ela, o Leaflet empilha na ordem em que
 *    as linhas chegam da planilha — e uma RA cobre uma rodovia por sorteio, roubando
 *    também o clique dela.
 * 3. **Estilo do backend, validado** (#52). A cor vem de `fillColor`/`color` no JS,
 *    nunca de regra de classe no CSS: regra de classe vence o atributo que o Leaflet
 *    escreve no SVG, e foi assim que todas as âncoras acabaram verdes na PR #40.
 *
 * `geometry_geojson` só é parseado aqui — não no normalizador —, e o erro é isolado
 * por registro: um contorno malformado some do mapa e vira aviso, sem derrubar os
 * outros nem o carregamento (R2.6). `source_geometry_geojson` NUNCA é desenhado: para
 * rodovia ela é a LineString do eixo oficial, que esta camada não sabe desenhar.
 */
function renderPolygons() {
  if (!polygonLayer) return;
  polygonLayer.clearLayers();
  if (!state.filters.layers.has('polygon')) return;

  // Ordem primeiro, filtro depois: ordenar só o que sobrou daria um empilhamento que
  // muda conforme o que está ligado, e a mesma RA subiria ou desceria ao desligar uma
  // camada vizinha.
  for (const polygon of sortPolygonsForDraw(state.polygons)) {
    if (!polygonPassesLayerFilters(polygon, state.filters)) continue;

    let geometry = null;
    try {
      geometry = JSON.parse(polygon.geometry_geojson);
    } catch (error) {
      continue; // geometria ilegível: este contorno não é desenhado, os outros seguem
    }
    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) continue;

    const style = polygonStyle(polygon);
    let shape = null;
    try {
      shape = L.geoJSON(geometry, {
        // `className` serve só para achar o contorno no DOM (teste e depuração): a cor
        // continua vindo daqui, por `color`/`fillColor`. Nenhuma regra de CSS pode
        // pintar `.polygon-shape` — regra de classe vence o atributo que o Leaflet
        // escreve no SVG, que foi como todas as âncoras acabaram verdes na PR #40.
        style: {
          className: 'polygon-shape',
          color: style.color,
          weight: style.weight,
          opacity: 0.9,
          fillColor: style.fillColor,
          fillOpacity: style.fillOpacity,
        },
      });
    } catch (error) {
      continue; // coordenada fora de faixa faz o Leaflet lançar; mesmo tratamento
    }

    const tooltip = document.createElement('span');
    tooltip.textContent = polygon.name || polygon.id;
    shape.bindTooltip(tooltip, { sticky: true });
    shape.on('click', () => openPolygonDetail(polygon));

    shape.addTo(polygonLayer);
  }
}

/**
 * Painel de detalhe de um contorno.
 *
 * Tudo por `textContent`: `properties_json` vem de atributo de KML de terceiro, que é
 * entrada não confiável tanto quanto o título de um anúncio (R4.4).
 *
 * Contorno de Região Administrativa lê o perfil de `RA_PROFILES`, que é a fonte
 * canônica (issue #53). O `properties_json` de uma RA é um retrato tirado na
 * sincronização e envelhece sozinho, sem sintoma — por isso, quando o perfil existe,
 * ele NÃO é despejado embaixo: as duas listas mostrariam os mesmos fatos com valores
 * que podem já ter divergido, e quem lê não tem como saber qual está certo.
 */
function openPolygonDetail(polygon) {
  const frag = document.createDocumentFragment();
  const raProfile = raProfileForPolygon(polygon, state.raProfiles);

  const essencial = polygonEssentials(polygon, raProfile);
  const { complementar, tecnico } = polygonPropertyTiers(polygon, {
    skip: polygonEssentialKeys(polygon),
  });

  if (raProfile) {
    // Com perfil canônico, o `properties_json` da RA é um retrato que envelhece sozinho
    // e NÃO é despejado embaixo (R8.52). O que resta dele é procedência do desenho.
    complementar.length = 0;
    tecnico.length = 0;
    if (raProfile.ra_code) complementar.push({ label: 'Código da RA', value: raProfile.ra_code });
    // Dizer de onde veio o número é o que permite conferir na planilha certa quando
    // alguém discordar do valor (R5.7).
    complementar.push({ label: 'Fonte do perfil', value: 'RA_PROFILES' });
  }

  // Campos do próprio registro que são informação de usuário.
  if (polygon.category && polygonEntityType(polygon) === 'administrative_region') {
    complementar.push({ label: 'Categoria', value: polygon.category });
  }
  if (polygon.subcategory) complementar.push({ label: 'Subcategoria', value: polygon.subcategory });

  // Procedência do desenho: existe para auditar de onde veio a geometria, e é
  // exatamente o que não pode ocupar o topo do painel.
  const proveniencia = [
    ['Sistema de origem', polygon.source_system],
    ['Camada de origem', polygon.source_layer_name],
    ['Arquivo de origem', polygon.source_file],
    ['Importado em', dateOrNull(polygon.imported_at)],
    ['Sincronizado em', dateOrNull(polygon.last_synced_at)],
    ['Verificado em', dateOrNull(polygon.source_page_verified_at)],
    ['Confiança', polygon.confidence_flag],
    ['Qualidade', polygon.quality_flag],
    ['Sistema de coordenadas', polygon.source_crs],
    ['Papel da geometria', polygon.geometry_role],
    ['Buffer de exibição', polygon.display_buffer_m === null || polygon.display_buffer_m === undefined
      ? null : `${formatNumber(polygon.display_buffer_m)} m por lado`],
    ['Hash da geometria', polygon.geometry_hash],
  ];
  for (const [label, value] of proveniencia) {
    if (value) tecnico.push({ label, value });
  }

  appendTiers(frag, { essencial, complementar, tecnico });

  // A descrição deixa de ser linha de lista dentro de um `<dd>` alinhado à direita: ela
  // é um parágrafo de prosa, e um parágrafo numa coluna de valores fica ilegível. Some
  // quando existe perfil canônico, porque `buildRaDescription_` no backend repete em
  // prosa exatamente o que as linhas estruturadas já dizem (R8.52).
  if (polygon.description && !raProfile) {
    const p = document.createElement('p');
    p.className = 'detail-description';
    p.textContent = polygon.description;
    frag.append(p);
  }

  const source = buildPolygonSourceLink(polygon);
  if (source) frag.append(source);

  // `selectedId` fica nulo: ele identifica um REGISTRO plotável, e o `render()` fecha
  // o detalhe quando o id selecionado sai do filtro. Um contorno não passa pelos
  // filtros de registro, então guardá-lo ali faria o painel fechar sozinho no
  // primeiro render.
  state.selectedId = null;
  dom.detailTitle.textContent = polygon.name || polygon.id;
  dom.detailBody.replaceChildren(frag);
  dom.detail.hidden = false;
  dom.closeDetail.focus();
}

/** Data formatada, ou `null` quando não há data — o travessão não é informação. */
function dateOrNull(iso) {
  const text = formatDate(iso);
  return text === '\u2014' ? null : text;
}

/** Link para a fonte de um contorno, quando a URL é utilizável. */
function buildPolygonSourceLink(polygon) {
  const href = safeExternalUrl(polygon.source_url);
  if (!href) return null;
  const p = document.createElement('p');
  p.className = 'detail-source';
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = `Fonte: ${hostnameOf(href) || 'abrir'}`;
  p.append(link);
  return p;
}

/** Desenha os marcadores dos registros filtrados que têm coordenada. */
function renderMarkers(records) {
  markerLayer.clearLayers();
  state.markers.clear();

  for (const record of records) {
    if (!record.coord) continue; // sem coordenada o registro existe, mas não é mapeável

    const fillColor = anchorColor(record);
    const marker = L.circleMarker([record.coord.lat, record.coord.lon], {
      radius: MARKER_RADIUS[record.kind] || 6,
      className: `marker marker-${record.kind}`,
      color: '#fff',
      weight: 2,
      fillOpacity: 0.9,
      // listing/development continuam pegando a cor de `assets/styles.css`
      // (`.marker-listing`/`.marker-development`); âncora sempre recebe `fillColor`
      // explícito (segmento → categoria → verde padrão) — ver a nota de
      // `ANCHOR_FALLBACK_COLOR` em src/format.js.
      ...(fillColor ? { fillColor } : {}),
    });

    // O tooltip recebe um ELEMENTO, nunca uma string. O Leaflet faz
    // `contentNode.innerHTML = conteudo` quando o conteúdo é string
    // (DivOverlay._updateContent), então um title vindo da planilha com
    // `<img onerror=...>` viraria markup ativo ao passar o mouse. Com um nó, ele
    // cai no ramo de appendChild e o texto permanece texto (R4.4).
    const tooltip = document.createElement('span');
    tooltip.textContent = record.title || record.id;
    marker.bindTooltip(tooltip, { direction: 'top' });

    // Seleção por (kind, id): o contrato garante unicidade dentro de cada entidade,
    // não entre entidades diferentes.
    marker.on('click', () => selectRecord(recordKey(record)));

    marker.addTo(markerLayer);
    state.markers.set(recordKey(record), marker);
  }
}

// --- Painel de detalhe ----------------------------------------------------

/** Linha de definição do painel. Omite o campo quando não há valor. */
/**
 * Uma seção recolhida do painel de detalhe (issue #55).
 *
 * Reusa o padrão que `#datasetMeta` usa desde a issue #19: `<details>` fechado, com o
 * resumo dizendo quantos itens estão lá dentro. Saber que existem 12 linhas escondidas
 * é o que faz alguém abrir; um "Mais informações" mudo não dá motivo nenhum.
 *
 * Seção vazia não é renderizada — um `<details>` que abre para o nada é pior que a
 * ausência dele.
 */
function detailSection(title, rows, className) {
  if (!rows || rows.length === 0) return null;

  const box = document.createElement('details');
  box.className = className;

  const summary = document.createElement('summary');
  summary.textContent = `${title} (${rows.length})`;
  box.append(summary);

  const dl = document.createElement('dl');
  dl.className = 'detail-list';
  for (const row of rows) addRow(dl, row.label, row.value);
  box.append(dl);
  return box;
}

/**
 * Monta o painel em três níveis: essencial visível, o resto recolhido.
 *
 * O essencial é o contrato desta issue e tem checagem fixa no smoke: **cabe sem rolagem
 * em 390 px**. Sem essa trava o painel volta a crescer na próxima issue que precisar
 * mostrar mais um campo, que foi exatamente como ele chegou a ~30 linhas de peso visual
 * idêntico.
 */
function appendTiers(frag, { essencial, complementar, tecnico }) {
  if (essencial && essencial.length > 0) {
    const dl = document.createElement('dl');
    dl.className = 'detail-list detail-essential';
    for (const row of essencial) addRow(dl, row.label, row.value);
    if (dl.childElementCount > 0) frag.append(dl);
  }

  const more = detailSection('Mais informações', complementar, 'detail-more');
  if (more) frag.append(more);

  const tech = detailSection('Origem e qualidade', tecnico, 'detail-provenance');
  if (tech) frag.append(tech);
}

function addRow(dl, label, value) {
  if (value === null || value === undefined || value === '' || value === '—') return;
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  dl.append(dt, dd);
}

/**
 * Aviso de precisão espacial.
 *
 * Obrigatório em todo detalhe: apresentar centroide de localidade como se fosse o
 * endereço do imóvel é desinformação, e no dataset atual os 141 anúncios são
 * exatamente isso (R3.6).
 */
function buildPrecisionNotice(record) {
  const approximate = isApproximateLocation(record);
  const box = document.createElement('p');
  box.className = approximate ? 'precision' : 'precision precision-exact';

  const strong = document.createElement('strong');
  strong.textContent = approximate ? 'Localização aproximada. ' : 'Localização verificada. ';
  box.append(strong);

  box.append(document.createTextNode(
    approximate
      ? 'O ponto no mapa representa a região, não o endereço exato do imóvel.'
      : 'A coordenada foi verificada na fonte indicada.'
  ));

  const precision = record.coordinate_precision || record.confidence_flag;
  if (precision) {
    const label = formatSpatialPrecision(precision);
    if (label) {
      box.append(document.createElement('br'));
      const code = document.createElement('code');
      code.textContent = label;
      // Identificador técnico cru fica só no atributo, para suporte/depuração —
      // nunca como texto visível (issue #21).
      code.title = precision;
      box.append(code);
    }
  }
  return box;
}

/** Link para a fonte, com esquema validado e rel de segurança (R4.5, R4.6). */
function buildSourceLink(record) {
  const url = safeExternalUrl(record.source_url);
  if (!url) return null;

  const wrap = document.createElement('p');
  const label = document.createElement('span');
  label.className = 'field';
  label.textContent = 'Fonte';
  wrap.append(label);

  const link = document.createElement('a');
  link.className = 'detail-source';
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = hostnameOf(url) || url;
  wrap.append(link);
  return wrap;
}

/**
 * Ressalva de procedência da regularização (issue #32).
 *
 * A decisão de mostrar `regularization_status` na tela pública é do dono do
 * repositório, mas o valor é **declarado por quem cadastra**, não certidão de
 * cartório — e "não regularizado" é afirmação pesada para exibir sem dizer de onde
 * veio. Mesma família de R8.15 e do aviso de precisão espacial: quando um número ou
 * rótulo pode ser lido como mais forte do que é, a interface declara o que ele é.
 *
 * Só aparece quando há valor; sem o campo, nada é dito.
 */
function buildRegularizationNotice(record) {
  if (!formatRegularizationStatus(record.regularization_status)) return null;
  const note = document.createElement('p');
  note.className = 'field-note field-note-inline';
  note.textContent = 'Regularização informada por quem cadastra o registro, não certidão oficial.';
  return note;
}

/**
 * Card de um registro (anúncio, empreendimento, âncora), em três níveis (issue #55).
 *
 * O essencial responde à pergunta que fez a pessoa clicar no ponto: quanto custa, que
 * tamanho tem, onde fica. O resto é consulta, e consulta pode estar a um clique de
 * distância. Antes desta issue eram ~15 linhas de peso visual idêntico, com "Portal" e
 * "Observado em" ocupando o mesmo destaque que o preço.
 *
 * As ressalvas — precisão espacial, procedência da regularização, registro sem
 * coordenada — continuam SEMPRE visíveis. Recolher uma ressalva é o mesmo que apagá-la:
 * quem não sabe que ela existe nunca abre a seção.
 */
function buildDetailBody(record) {
  const frag = document.createDocumentFragment();

  const kind = document.createElement('span');
  kind.className = 'detail-kind';
  kind.dataset.kind = record.kind;
  kind.textContent = LAYER_LABEL[record.kind] || record.kind;
  frag.append(kind);

  // Estágio de comercialização como selo, ao lado do rótulo de camada (issue #30).
  // Fica fora da lista de definições porque é o estado do produto, não um atributo
  // dele — e some inteiro quando a planilha não classificou.
  const stage = formatSalesStage(record.sales_stage);
  if (stage) {
    const badge = document.createElement('span');
    badge.className = 'detail-stage';
    badge.textContent = stage;
    frag.append(badge);
  }

  frag.append(buildPrecisionNotice(record));

  const num = (value) => (value === null || value === undefined ? null : formatNumber(value));
  const essencial = [];
  const complementar = [];
  const tecnico = [];
  const push = (list, label, value) => { if (value) list.push({ label, value }); };

  if (record.kind === 'listing') {
    push(essencial, 'Preço pedido', formatBRL(record.price));
    push(essencial, 'Área', formatM2(record.area_m2));
    push(essencial, 'Preço/m²', formatPriceM2(record.price_m2));
    push(essencial, 'Tipo', formatPropertyType(record.property_type));
    push(essencial, 'Localidade', record.locality);

    push(complementar, 'Quartos', num(record.bedrooms));
    push(complementar, 'Suítes', num(record.suites));
    push(complementar, 'Vagas', num(record.parking_spaces));
    push(complementar, 'Condomínio', formatBRL(record.condo_fee_brl));
    push(complementar, 'IPTU', formatBRL(record.iptu_brl));
    push(complementar, 'Endereço', record.address);
    // Derivada de Tipo, sem depender do backend (issue #31).
    push(complementar, 'Vertical / horizontal', formatBuildingOrientation(record.building_orientation));
    // Exibição pública decidida pelo dono do repositório na issue #32. A ressalva de
    // procedência continua fora da seção recolhida, logo abaixo.
    push(complementar, 'Regularização', formatRegularizationStatus(record.regularization_status));

    push(tecnico, 'Portal', record.source);
    push(tecnico, 'Observado em', dateOrNull(record.observed_at));
  } else if (record.kind === 'development') {
    push(essencial, 'Incorporadora', record.developer_name);
    push(essencial, 'Unidades', num(record.units_total));
    push(essencial, 'Área', record.area_min_m2 === null ? null
      : `${formatM2(record.area_min_m2)} a ${formatM2(record.area_max_m2)}`);
    push(essencial, 'Situação', record.status);
    push(essencial, 'Bairro', record.locality);

    push(complementar, 'Endereço', record.address);
    push(complementar, 'Vertical / horizontal', formatBuildingOrientation(record.building_orientation));
    push(complementar, 'Regularização', formatRegularizationStatus(record.regularization_status));
    push(complementar, 'Segmento', record.segment);
    push(complementar, 'Produto', record.product);
    push(complementar, 'Obra', record.work_progress_pct === null ? null : `${record.work_progress_pct}%`);
    push(complementar, 'Entrega prevista', record.expected_delivery);

    push(tecnico, 'Verificado em', dateOrNull(record.observed_at));
  } else {
    // Classificação em dois eixos (issue #26) primeiro, `category`/`subcategory`
    // depois: o vocabulário novo é o que a legenda e o mapa usam, o antigo continua
    // visível enquanto a planilha ainda o carrega.
    push(essencial, 'Grupo', formatAnchorGroup(record.group));
    push(essencial, 'Segmento', formatAnchorSegment(record.segment));
    push(essencial, 'Marca', record.brand_name);
    push(essencial, 'Bairro', record.locality);

    push(complementar, 'Categoria', formatAnchorCategory(record.category));
    push(complementar, 'Subcategoria', record.subcategory);
    push(complementar, 'Área ocupada', formatM2(record.occupied_area_m2));
    push(complementar, 'Operador', record.operator_name);
    push(complementar, 'Endereço', record.address);

    push(tecnico, 'Verificado em', dateOrNull(record.observed_at));
  }

  appendTiers(frag, { essencial, complementar, tecnico });

  const regularization = buildRegularizationNotice(record);
  if (regularization) frag.append(regularization);

  if (!record.coord) {
    const note = document.createElement('p');
    note.className = 'precision';
    note.textContent = 'Este registro não tem coordenada e por isso não aparece no mapa.';
    frag.append(note);
  }

  const source = buildSourceLink(record);
  if (source) frag.append(source);

  return frag;
}

/**
 * Chave de identificação de um registro na interface.
 *
 * `id` sozinho não serve: o contrato garante unicidade **dentro** de cada aba, não
 * entre entidades diferentes.
 */
function recordKey(record) {
  return `${record.kind}:${record.id}`;
}

function selectRecord(key) {
  const record = state.records.find((r) => recordKey(r) === key);
  if (!record) return;

  state.selectedId = key;
  dom.detailTitle.textContent = record.title || record.id;
  dom.detailBody.replaceChildren(buildDetailBody(record));
  dom.detail.hidden = false;

  if (record.coord && map) map.panTo([record.coord.lat, record.coord.lon]);
  dom.closeDetail.focus();
}

function closeDetail() {
  state.selectedId = null;
  dom.detail.hidden = true;
}

// --- Filtros e render -----------------------------------------------------

/** Lê o número de um campo, tratando vazio como "sem filtro". */
function numberFieldValue(input) {
  const raw = input.value.trim();
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function readFilters() {
  state.filters.search = dom.search.value.trim();
  state.filters.locality = dom.locality.value;
  state.filters.ra = dom.raFilter.value;
  state.filters.propertyType = dom.ptype.value;
  state.filters.buildingOrientation = dom.buildingOrientation.value;
  state.filters.salesStage = dom.salesStage.value;
  state.filters.regularizationStatus = dom.regularizationStatus.value;
  state.filters.anchorGroup = dom.anchorGroup.value;
  state.filters.anchorSegment = dom.anchorSegment.value;
  state.filters.priceMin = numberFieldValue(dom.priceMin);
  state.filters.priceMax = numberFieldValue(dom.priceMax);

  const beds = dom.beds.value;
  state.filters.bedrooms = beds === '' ? null : Number(beds);

  const layers = new Set();
  for (const input of dom.layers.querySelectorAll('input[data-layer]')) {
    if (input.checked) layers.add(input.dataset.layer);
  }
  state.filters.layers = layers;

  // Grupos e tipos de contorno (issue #51). A legenda é montada a partir do dado, então
  // aqui não há lista fixa para conferir: o que existe no DOM é o vocabulário real.
  // Sem nenhuma caixa montada, os filtros ficam `null` — "mostre tudo" —, e não um
  // Set vazio, que significaria "o operador desligou tudo" (ver createFilterState).
  const groupInputs = dom.polygonLayers.querySelectorAll('input[data-polygon-group]');
  const typeInputs = dom.polygonLayers.querySelectorAll('input[data-polygon-type]');

  state.filters.polygonGroups = groupInputs.length === 0
    ? null
    : new Set([...groupInputs].filter((i) => i.checked).map((i) => i.dataset.polygonGroup));
  state.filters.polygonTypes = typeInputs.length === 0
    ? null
    : new Set([...typeInputs].filter((i) => i.checked).map((i) => i.dataset.polygonType));
}

function renderKpis(kpis) {
  dom.kpiVisible.textContent = formatNumber(kpis.visible);
  dom.kpiMedian.textContent = kpis.medianPriceM2 === null
    ? '—'
    : `${formatBRLCompact(kpis.medianPriceM2)}/m²`;

  for (const layer of LAYERS) {
    const node = el(`count${layer.charAt(0).toUpperCase()}${layer.slice(1)}`);
    if (node) node.textContent = formatNumber(kpis.byKind[layer] || 0);
  }

  // O que o mapa não consegue mostrar precisa ficar visível, não sumir (R5.7).
  const notes = [];
  if (kpis.medianPriceM2 !== null) {
    notes.push(`Mediana sobre ${formatNumber(kpis.medianPriceM2Sample)} registro(s) com preço/m².`);
    // Sem filtro de tipo, a mediana junta terreno, casa e apartamento — que no dataset
    // atual vão de R$ 1,3 mil a R$ 9,8 mil por m². O número está certo, mas comparar
    // tipos diferentes num só indicador engana; filtrar por tipo é o caminho honesto.
    if (!state.filters.propertyType) {
      notes.push('Inclui tipos de imóvel diferentes — filtre por tipo para comparar semelhantes.');
    }
  }
  if (kpis.withoutCoord > 0) {
    notes.push(`${formatNumber(kpis.withoutCoord)} registro(s) sem coordenada não aparecem no mapa.`);
  }
  dom.kpiNote.textContent = notes.join(' ');
}

/** Uma linha "rótulo → valor" do bloco de indicadores da RA. */
function raStatRow(label, value) {
  const li = document.createElement('li');
  const name = document.createElement('span');
  name.className = 'ra-stat-label';
  name.textContent = label;
  const figure = document.createElement('span');
  figure.className = 'ra-stat-value';
  figure.textContent = value;
  li.append(name, figure);
  return li;
}

/**
 * Distribuição por faixa etária, como barras horizontais.
 *
 * Escolhas que valem explicar, porque são as que um gráfico erra:
 *
 * - **Uma série só, uma cor só.** As cinco faixas não são cinco categorias
 *   concorrentes: são a mesma medida (percentual da população) em cinco recortes de
 *   idade. Pintar cada barra de uma cor pediria uma paleta categórica de cinco
 *   matizes para não informar nada — a identidade da faixa já está escrita ao lado.
 * - **Barras ancoradas em zero, escala até a maior faixa.** O comprimento é
 *   proporcional ao valor desde o zero; o que a maior faixa define é só o alcance do
 *   eixo. Numa escala fixa de 0 a 100 % as cinco barras ficariam com menos de um
 *   terço da régua num painel de 300 px, e diferenças de 5 pontos sumiriam.
 * - **O número fica em cada linha.** São cinco linhas, não cinquenta: rotular todas
 *   custa pouco e evita que quem lê tenha que estimar a partir do comprimento.
 * - **Faixa sem valor não vira barra de zero** — ela simplesmente não aparece.
 */
function buildRaAgeChart(profile) {
  const { bands, total, scaleWarning } = raAgeBands(profile);
  if (bands.length === 0) return null;

  const figure = document.createElement('figure');
  figure.className = 'ra-ages';

  const caption = document.createElement('figcaption');
  caption.textContent = 'População por faixa etária';
  figure.append(caption);

  const max = Math.max(...bands.map((b) => b.pct));
  const list = document.createElement('ul');

  for (const band of bands) {
    const li = document.createElement('li');

    const label = document.createElement('span');
    label.className = 'ra-age-label';
    label.textContent = band.label;

    // A trilha é decoração: o valor já está escrito ao lado, em texto.
    const track = document.createElement('span');
    track.className = 'ra-age-track';
    track.setAttribute('aria-hidden', 'true');
    const bar = document.createElement('span');
    bar.className = 'ra-age-bar';
    // Número calculado, nunca string de dado — e limitado a 0–100 para uma célula
    // absurda não empurrar a barra para fora do painel.
    const ratio = max > 0 ? (band.pct / max) * 100 : 0;
    bar.style.width = `${Math.max(0, Math.min(100, ratio))}%`;
    track.append(bar);

    const value = document.createElement('span');
    value.className = 'ra-age-value';
    value.textContent = formatPercent(band.pct);

    li.append(label, track, value);
    list.append(li);
  }
  figure.append(list);

  // Composição incompleta se declara. Cinco faixas que somam 87 % descrevem 87 % da
  // população, e apresentá-las como se fossem o todo seria o mesmo erro da mediana
  // que mistura tipos de imóvel (R8.15).
  if (total !== null && Math.abs(total - 100) > 1) {
    const note = document.createElement('p');
    note.className = 'ra-ages-note';
    note.textContent = `As faixas publicadas somam ${formatPercent(total)} da população.`;
    figure.append(note);
  }

  // Escala fora da canônica do dataset se declara. A conversão está certa hoje — o
  // servidor aceita as duas escalas e o cliente espelha isso de propósito (R8.44) —,
  // mas conversão calada esconderia o dia em que a causa deixar de ser convenção e
  // passar a ser coluna trocada (issue #54).
  if (scaleWarning) {
    const note = document.createElement('p');
    note.className = 'ra-ages-note ra-scale-note';
    note.textContent = scaleWarning;
    figure.append(note);
  }

  return figure;
}

/**
 * Bloco de indicadores da RA selecionada (issues #34, #35).
 *
 * Só aparece quando há RA selecionada E `RA_PROFILES` trouxe dado para ela. Cada
 * indicador é independente: a coluna de renda e as de faixa etária existem na planilha
 * desde a v2.0.0, mas o dado pode não existir (`0/35` hoje), e indicador sem valor é
 * OMITIDO — não vira travessão nem espaço vazio. Sem nenhum deles, o bloco inteiro
 * some, e o filtro por RA continua funcionando igual: ele depende só do `ra_geo_id`
 * que os registros já carregam.
 */
function renderRaProfile() {
  const profile = state.filters.ra ? state.raProfiles[state.filters.ra] : null;
  const frag = document.createDocumentFragment();

  const stats = document.createElement('ul');
  stats.className = 'ra-stats';
  if (profile) {
    if (profile.population_total !== null) {
      stats.append(raStatRow('População', formatNumber(profile.population_total)));
    }
    if (profile.population_density_km2 !== null) {
      stats.append(raStatRow('Densidade', `${formatNumber(Math.round(profile.population_density_km2))} hab/km²`));
    }
    if (profile.income_per_capita_brl !== null) {
      stats.append(raStatRow('Renda per capita', formatBRL(profile.income_per_capita_brl)));
    }
  }
  if (stats.childElementCount > 0) frag.append(stats);

  const chart = profile ? buildRaAgeChart(profile) : null;
  if (chart) frag.append(chart);

  // RA criada depois da PDAD-A 2024 não tem perfil e não vai ter até a próxima
  // pesquisa. Sem esta nota o bloco inteiro simplesmente some, e "some" é
  // indistinguível de "o carregamento falhou": o operador fica sem saber se procura o
  // dado ou o defeito (issue #54).
  const unavailable = raProfileUnavailability(profile);
  if (unavailable) {
    const note = document.createElement('p');
    note.className = 'ra-profile-pending';
    note.textContent = unavailable.message;
    frag.append(note);
  }

  if (frag.childElementCount === 0) {
    dom.raProfile.hidden = true;
    dom.raProfile.replaceChildren();
    return;
  }
  dom.raProfile.replaceChildren(frag);
  dom.raProfile.hidden = false;
}

function render() {
  readFilters();
  const visible = applyFilters(state.records, state.filters);
  renderMarkers(visible);
  renderPolygons();
  renderKpis(computeKpis(visible));
  renderRaProfile();

  // Detalhe aberto de um registro que saiu do filtro deixa de fazer sentido.
  if (state.selectedId && !visible.some((r) => recordKey(r) === state.selectedId)) closeDetail();
}

/**
 * Legenda das âncoras em dois níveis (issue #26): o grupo (`Infraestrutura` ×
 * `Comércio e serviço`) e, dentro dele, o segmento que dá a cor ao marcador.
 *
 * Calculada uma vez no carregamento — a classificação existente não muda com os
 * filtros de busca, e recalculá-la a cada tecla faria a legenda piscar. Por isso ela
 * NÃO exibe contagem: um número aqui seria confundido com o de "Camadas", que é o que
 * sobrou dos filtros (mesma armadilha de R8.26).
 *
 * Enquanto nenhuma âncora tiver `group` — o estado da planilha antes de o backend
 * derivar a coluna — a legenda sai plana, sem título de grupo, exatamente como antes.
 */
function renderAnchorLegend(records) {
  const groups = anchorLegendGroups(records);
  if (groups.length === 0) {
    dom.anchorLegend.hidden = true;
    dom.anchorLegend.replaceChildren();
    return;
  }

  // Um grupo só, e vazio, significa "ninguém classificou nada": título nenhum é mais
  // honesto que um "Sem classificação" cobrindo a legenda inteira.
  const showTitles = groups.some((g) => g.group !== '');

  const frag = document.createDocumentFragment();
  for (const { group, entries } of groups) {
    const section = document.createElement('div');
    section.className = 'anchor-legend-group';

    if (showTitles) {
      const title = document.createElement('p');
      title.className = 'anchor-legend-title';
      title.textContent = group ? formatAnchorGroup(group) : 'Sem classificação';
      section.append(title);
    }

    const list = document.createElement('ul');
    list.className = 'anchor-categories';

    for (const entry of anchorLegendEntries(entries)) {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = entry.color;
      li.append(dot, document.createTextNode(entry.label));
      list.append(li);
    }

    section.append(list);
    frag.append(section);
  }

  dom.anchorLegend.replaceChildren(frag);
  dom.anchorLegend.hidden = false;
}

/**
 * Legenda de contornos em dois níveis: grupo → tipo de entidade (issue #51).
 *
 * A caixa só existe quando há contorno. Uma camada permanentemente vazia na legenda é
 * ruído: sugere que algo deveria estar ali e não está. A planilha sem nenhum contorno é
 * o estado normal hoje, não um defeito — então a ausência é silenciosa (R2.5).
 *
 * O vocabulário é **aberto**: os grupos saem do dado, não de uma lista aqui. Um
 * `layer_group` novo criado no backend aparece sozinho, e um contorno antigo sem
 * `layer_group` cai em "Outros" — nunca some, que é a falha que ninguém percebe.
 *
 * Montada uma vez, no carregamento, e não a cada `render()`: recriar as caixas a cada
 * tecla digitada na busca apagaria o estado de quem acabou de desligar um grupo. A
 * contagem é a de contornos ATIVOS, que é o que o mapa pode desenhar.
 */
function renderPolygonLegend() {
  const groups = groupPolygonsForLegend(state.polygons);
  const total = groups.reduce((acc, g) => acc + g.count, 0);
  const visible = groups.length > 0;

  dom.polygonLayerLabel.hidden = !visible;
  dom.polygonMasterLayer.hidden = !visible;
  dom.polygonLayers.hidden = !visible;
  if (!visible) {
    dom.polygonLayers.replaceChildren();
    return;
  }
  dom.countPolygon.textContent = formatNumber(total);

  const frag = document.createDocumentFragment();

  for (const group of groups) {
    const list = document.createElement('ul');
    list.className = 'layers polygon-group';

    list.append(polygonLegendRow({
      attribute: 'data-polygon-group',
      value: group.key,
      label: group.label,
      count: group.count,
      sample: group.sample,
      className: 'polygon-group-row',
    }));

    // Um grupo com um tipo só não ganha sublista: a linha do tipo repetiria a do grupo
    // e daria duas caixas para a mesma decisão.
    if (group.types.length > 1) {
      for (const type of group.types) {
        list.append(polygonLegendRow({
          attribute: 'data-polygon-type',
          value: type.key,
          label: type.label,
          count: type.count,
          sample: type.first,
          className: 'polygon-type-row',
        }));
      }
    } else if (group.types.length === 1) {
      // Mesmo sem caixa própria, o tipo precisa existir no DOM: `readFilters()` monta o
      // Set de tipos a partir dele, e um tipo ausente do Set filtraria o grupo inteiro.
      const holder = document.createElement('li');
      holder.hidden = true;
      const hidden = document.createElement('input');
      hidden.type = 'checkbox';
      hidden.checked = true;
      hidden.hidden = true;
      hidden.setAttribute('data-polygon-type', group.types[0].key);
      holder.append(hidden);
      list.append(holder);
    }

    frag.append(list);
  }

  dom.polygonLayers.replaceChildren(frag);
}

/**
 * Uma linha da legenda de contornos: caixa, amostra de cor e contagem.
 *
 * A amostra usa o estilo REAL do primeiro contorno daquele grupo/tipo — a mesma
 * `polygonStyle()` que desenha no mapa —, não uma cor decorativa. Legenda com cor
 * diferente da do mapa é pior que legenda nenhuma: ela afirma uma correspondência que
 * não existe (issue #52).
 */
function polygonLegendRow({ attribute, value, label, count, sample, className }) {
  const li = document.createElement('li');
  li.className = className;

  const labelEl = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = true;
  input.setAttribute(attribute, value);
  input.addEventListener('change', render);

  const dot = document.createElement('span');
  dot.className = 'dot dot-polygon-sample';
  const style = polygonStyle(sample);
  // Estilo inline, como no mapa: a cor de um contorno é dado, não tema (R8.31, R8.45).
  dot.style.borderColor = style.color;
  dot.style.background = style.fillColor;
  dot.style.opacity = '0.95';

  const text = document.createElement('span');
  text.className = 'polygon-legend-label';
  text.textContent = label;

  const countEl = document.createElement('span');
  countEl.className = 'count';
  countEl.textContent = formatNumber(count);

  labelEl.append(input, dot, text, countEl);
  li.append(labelEl);
  return li;
}

function populateSelect(select, values, formatter = (v) => v) {
  const keep = select.firstElementChild; // a opção "Todas"/"Todos"
  select.replaceChildren(keep);
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = formatter(value);
    select.append(option);
  }
}

/**
 * Repopula o select de segmento com os segmentos do grupo escolhido (issue #26).
 *
 * Sem isso, escolher "Infraestrutura" e "Escola" ao mesmo tempo devolveria conjunto
 * vazio sem explicar por quê. A seleção atual é preservada quando ainda existe no
 * novo grupo, e zerada quando não — deixá-la valendo escondida no estado seria um
 * filtro ativo invisível.
 *
 * `keepSelection: false` é para quem está LIMPANDO. Preservar a seleção é o trabalho
 * desta função, então "limpar filtros" não pode delegar a limpeza a ela sem dizer que
 * agora o trabalho é o oposto: com a lista completa, o segmento escolhido sempre
 * continua presente e sempre era restaurado (P1 do review do Codex na PR #42, R8.43).
 */
function populateAnchorSegments(group, { keepSelection = true } = {}) {
  const previous = keepSelection ? dom.anchorSegment.value : '';
  const segments = distinctAnchorSegments(state.records, group);
  populateSelect(dom.anchorSegment, segments, formatAnchorSegment);
  dom.anchorSegment.value = segments.includes(previous) ? previous : '';
}

function clearFilters() {
  dom.search.value = '';
  dom.locality.value = '';
  dom.raFilter.value = '';
  dom.ptype.value = '';
  dom.buildingOrientation.value = '';
  dom.salesStage.value = '';
  dom.regularizationStatus.value = '';
  dom.anchorGroup.value = '';
  populateAnchorSegments('', { keepSelection: false });
  dom.priceMin.value = '';
  dom.priceMax.value = '';
  dom.beds.value = '';
  for (const input of dom.layers.querySelectorAll('input[data-layer]')) input.checked = true;
  render();
}

// --- Estados de carregamento e erro ---------------------------------------

function showLoading(visible) {
  dom.loadingState.hidden = !visible;
}

/**
 * Estado de erro legível, com o detalhe técnico no console.
 *
 * Nunca deixar tela branca, e nunca cair em demo silenciosamente fingindo que é
 * produção (R5.6, R5.7, R2.3).
 */
function showError(messages) {
  dom.errorDetail.textContent = messages.length > 0
    ? messages.join(' ')
    : 'Verifique a conexão ou tente novamente.';
  dom.errorState.hidden = false;
  console.error('[imob] falha ao carregar o dataset:', messages);
}

function showWarnings(messages) {
  if (messages.length === 0) {
    dom.dataWarnings.hidden = true;
    dom.dataWarnings.open = false;
    dom.dataWarningsList.replaceChildren();
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const message of messages) {
    const item = document.createElement('li');
    item.textContent = message;
    fragment.append(item);
  }
  dom.dataWarningsSummary.textContent = `${messages.length} aviso${messages.length === 1 ? '' : 's'} técnico${messages.length === 1 ? '' : 's'}`;
  dom.dataWarningsList.replaceChildren(fragment);
  dom.dataWarnings.open = false;
  dom.dataWarnings.hidden = false;
  console.warn('[imob] avisos:', messages);
}

/**
 * Bloco de procedência do dataset, alimentado pela aba APP_META.
 *
 * Renderiza **somente as chaves publicadas** e esconde a seção inteira quando não há
 * nenhuma — é o estado da planilha antes de `setupProject()` rodar. Preencher lacuna
 * com travessão sugeriria que o dado existe e está vazio, quando na verdade ele nunca
 * foi publicado.
 *
 * Só `visibility: 'summary'` (hoje, "Atualizado em") fica exposto de cara — é a única
 * informação de procedência que quem pesquisa imóvel precisa. O resto (versão do
 * dataset, status/contagens de validação, versão do app) é jargão de pipeline e fica
 * dentro do `<details>` "Detalhes técnicos", sem sumir, para quem opera os dados
 * (issue #19).
 *
 * Os valores vêm de uma planilha pública e editável: todos entram por `textContent`,
 * nunca por `innerHTML` (R4.4).
 */
function renderDatasetMeta(meta) {
  const rows = appMetaRows(meta);
  if (rows.length === 0) {
    dom.datasetMeta.hidden = true;
    dom.datasetMetaSummary.textContent = '';
    dom.datasetMetaList.replaceChildren();
    return;
  }

  const summaryRow = rows.find((row) => row.visibility === 'summary');
  dom.datasetMetaSummary.textContent = summaryRow
    ? `${summaryRow.label}: ${formatDate(summaryRow.value)}`
    : '';

  const frag = document.createDocumentFragment();
  for (const row of rows) {
    if (row.visibility === 'summary') continue;

    const dt = document.createElement('dt');
    dt.textContent = row.label;

    const dd = document.createElement('dd');
    if (row.tone) {
      const chip = document.createElement('span');
      chip.className = 'meta-status';
      chip.dataset.tone = row.tone;
      chip.textContent = row.value;
      dd.append(chip);
    } else {
      dd.textContent = row.type === 'date' ? formatDate(row.value) : row.value;
    }

    frag.append(dt, dd);
  }

  dom.datasetMetaList.replaceChildren(frag);
  dom.datasetMeta.hidden = false;
}

/** Rótulo da origem dos dados. Modo demo precisa ser óbvio na tela (R2.3). */
function showSourceBadge(source) {
  const label = { demo: 'Modo demonstração', gviz: 'Dados: Google Sheets', appsscript: 'Dados: Apps Script' };
  dom.sourceBadge.textContent = label[source] || source;
  dom.sourceBadge.dataset.source = source;
  dom.sourceBadge.hidden = false;
}

// --- Carregamento ---------------------------------------------------------

// --- View interna do Mercado Residencial DF (issue #58) ----------------------------

const VIEWS = ['mapa', 'mercado'];

/** A view pedida pelo hash. Hash desconhecido cai no mapa, sem erro. */
function viewFromHash() {
  const wanted = (location.hash || '').replace('#', '');
  return VIEWS.includes(wanted) ? wanted : 'mapa';
}

/**
 * Troca a view visível (issue #58).
 *
 * Duas coisas que este projeto já pagou para aprender:
 *
 * 1. **O mapa não é desmontado.** Trocar de view esconde o container; o Leaflet
 *    continua montado, com zoom, centro e camadas ligadas intactos. Recriar o mapa a
 *    cada troca perderia tudo isso e ainda custaria os tiles de novo.
 * 2. **`invalidateSize()` ao voltar.** O Leaflet mede o container quando ele está
 *    oculto e conclui que tem tamanho zero; sem a remedição o mapa volta em branco,
 *    sem erro nenhum no console.
 *
 * Pedir a view do Mercado sem série carregada volta para o mapa em vez de abrir uma
 * tela vazia — vazia é indistinguível de quebrada.
 */
function setView(name) {
  const temMercado = state.ivvMonthly.length > 0;
  const view = name === 'mercado' && temMercado ? 'mercado' : 'mapa';

  dom.mapView.hidden = view !== 'mapa';
  dom.marketView.hidden = view !== 'mercado';

  for (const tab of dom.viewSwitch.querySelectorAll('.view-tab')) {
    tab.setAttribute('aria-pressed', String(tab.dataset.view === view));
  }

  if (view === 'mapa' && map) map.invalidateSize();

  const alvo = `#${view}`;
  if (location.hash !== alvo) history.replaceState(null, '', alvo);
}

/**
 * Monta a view do Mercado: escopo declarado e procedência (issue #58).
 *
 * A tela declara território, procedência e período; cards e gráficos consomem a mesma
 * seleção temporal para não contar histórias diferentes sobre os mesmos dados.
 */
/**
 * Uma variação de um card: rótulo, valor e o tom que ela merece (issue #59).
 *
 * O tom vem do SIGNIFICADO, não do sinal: distrato subindo não é bom. E ele nunca é
 * carregado só pela cor — o ícone e o rótulo dizem a mesma coisa, para quem não
 * distingue as cores e para quem imprime em preto e branco.
 */
function marketDeltaRow(delta) {
  const li = document.createElement('li');
  li.className = `market-delta market-delta-${delta.tone}`;

  const icon = document.createElement('span');
  icon.className = 'market-delta-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = delta.tone === 'bom' ? '▲' : delta.tone === 'ruim' ? '▼' : '•';

  const label = document.createElement('span');
  label.className = 'market-delta-label';
  label.textContent = delta.label;

  const value = document.createElement('span');
  value.className = 'market-delta-value';
  value.textContent = delta.value;

  li.append(icon, label, value);
  return li;
}

/**
 * Um indicador do Mercado (issues #59 e #83).
 *
 * O valor usa figuras PROPORCIONAIS, não tabulares: `tabular-nums` dá a todo dígito a
 * largura de um zero, e num número grande isso deixa o texto frouxo. Tabular é para
 * coluna que precisa alinhar verticalmente — as variações, aqui.
 *
 * `data-metrica` é o endereço estável do card: rótulo muda, chave de métrica não.
 */
function marketCard(card, { destaque = false, spark = null, sparks = [] } = {}) {
  const box = document.createElement('article');
  box.className = destaque ? 'market-kpi' : 'market-card';
  box.dataset.metrica = card.key;

  const label = document.createElement('h3');
  label.className = destaque ? 'market-kpi-rotulo' : 'market-card-label';
  label.textContent = card.label;
  box.append(label);

  if (card.value === null) {
    // Ausência é uma frase, não um travessão: travessão numa grade de indicadores é
    // indistinguível de um card que não carregou.
    const ausente = document.createElement('p');
    ausente.className = 'market-card-absent';
    ausente.textContent = card.absent;
    box.append(ausente);
    return box;
  }

  const value = document.createElement('p');
  value.className = destaque ? 'market-kpi-valor' : 'market-card-value';
  value.textContent = card.value;
  box.append(value);

  if (spark && !spark.vazio) {
    const caixa = document.createElement('div');
    caixa.className = 'market-kpi-spark';
    box.append(caixa);
    sparks.push({ plot: caixa, model: spark, spark: true });
  }

  if (card.deltas.length > 0) {
    const list = document.createElement('ul');
    list.className = 'market-deltas';
    for (const [indice, delta] of card.deltas.entries()) {
      const linha = marketDeltaRow(delta);
      // No destaque, a primeira variação é a que a pessoa veio ver e ganha corpo; as
      // outras continuam legíveis abaixo dela, menores.
      if (destaque && indice === 0) linha.classList.add('market-delta-principal');
      list.append(linha);
    }
    box.append(list);
  }

  return box;
}

function marketGrupo(grupo) {
  const section = document.createElement('section');
  section.className = 'market-grupo';
  section.dataset.grupo = grupo.key;

  const titulo = document.createElement('h2');
  titulo.className = 'market-grupo-titulo';
  titulo.textContent = grupo.label;
  section.append(titulo);

  const grade = document.createElement('div');
  grade.className = 'market-tiles';
  for (const card of grupo.cards) grade.append(marketCard(card));
  section.append(grade);
  return section;
}

/**
 * Os indicadores do Mercado: destaques primeiro, depois os grupos (issue #83).
 *
 * Toda agregação passa pelo motor da issue #57 — nenhum card soma estoque por conta
 * própria, que é o erro caro que aquele motor existe para impedir. O sparkline vem da
 * janela de contexto, não do período agregado: ele mostra a FORMA do movimento recente,
 * e um período de um mês só teria forma nenhuma.
 */
function renderMarketCards(months, janela) {
  const aggregated = aggregatePeriod(months);
  const { destaques, grupos, mesReferencia } = buildMarketDashboard(aggregated, months);

  // Os sparklines seguem a mesma regra dos gráficos: caixa vazia agora, desenho depois de
  // medir (issue #85). Antes disso o spark tinha `viewBox` de 120×32 esticado à força num
  // card de ~250px — 2,1× na horizontal, com o traço deformando junto.
  const sparks = [];
  dom.marketDestaques.replaceChildren(...destaques.map((card) => marketCard(card, {
    destaque: true,
    spark: buildSparkline(janela, card.key),
    sparks,
  })));
  dom.marketBody.replaceChildren(...grupos.map(marketGrupo));
  return { warnings: aggregated.warnings, mesReferencia, sparks };
}

function option(value, label) {
  const node = document.createElement('option');
  node.value = String(value);
  node.textContent = label;
  return node;
}

function populateMarketMonths(year, preferred) {
  const months = availableMonths(state.ivvMonthly, year);
  dom.marketMonth.replaceChildren(...months.map((item) => option(item.value, item.label)));
  const wanted = String(preferred || '');
  dom.marketMonth.value = months.some((item) => String(item.value) === wanted)
    ? wanted : String(months.at(-1)?.value || '');
}

/**
 * Marca a pílula do período escolhido e apaga os campos que ele não usa (issue #83).
 *
 * Nenhum `if` de modo mora aqui: quem sabe que campo cada período usa é
 * `PERIOD_MODE_CONTROLS`, e o motivo do campo apagado sai de `controlDisabledReason` —
 * campo desabilitado sem motivo escrito é indistinguível de campo quebrado (R8.64).
 */
function syncMarketFilterState() {
  const mode = state.marketSelection.mode;

  for (const chip of dom.marketPeriodChips.querySelectorAll('.market-chip')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.mode === mode));
  }

  const campos = [
    ['ano', [dom.marketYear]],
    ['mes', [dom.marketMonth]],
    ['intervalo', [dom.marketStart, dom.marketEnd]],
  ];
  for (const [controle, alvos] of campos) {
    const motivo = controlDisabledReason(mode, controle);
    for (const alvo of alvos) {
      alvo.disabled = motivo !== null;
      alvo.title = motivo || '';
    }
  }
}

function periodChip(item) {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'market-chip';
  botao.dataset.mode = item.value;
  // O texto curto cabe na pílula; o leitor de tela recebe a frase inteira.
  botao.textContent = item.chip;
  botao.setAttribute('aria-label', item.label);
  botao.setAttribute('aria-pressed', 'false');
  return botao;
}

function initializeMarketFilters() {
  state.marketSelection = defaultPeriodSelection(state.ivvMonthly);
  dom.marketPeriodChips.replaceChildren(...PERIOD_MODE_OPTIONS.map(periodChip));

  const years = availableYears(state.ivvMonthly);
  dom.marketYear.replaceChildren(...years.map((year) => option(year, String(year))));
  dom.marketYear.value = String(state.marketSelection.year || '');
  populateMarketMonths(state.marketSelection.year, state.marketSelection.month);

  const first = state.ivvMonthly[0]?.reference_date?.slice(0, 7) || '';
  const last = state.ivvMonthly.at(-1)?.reference_date?.slice(0, 7) || '';
  for (const input of [dom.marketStart, dom.marketEnd]) {
    input.min = first;
    input.max = last;
  }
  dom.marketStart.value = state.marketSelection.start || first;
  dom.marketEnd.value = state.marketSelection.end || last;
  syncMarketFilterState();
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgNode(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

/**
 * Desenha um modelo de gráfico (issue #83).
 *
 * A função NÃO calcula nada: recebe a geometria pronta de `chart-layout.js` e só cria
 * nós. Foi assim que a última parte não testável do gráfico virou o `createElementNS`.
 *
 * COR NÃO PASSA POR AQUI. `stroke="var(--cat-1)"` como atributo de apresentação é aceito
 * pelo parser, descartado em silêncio pelo browser e o resultado é a série sumir do
 * gráfico — sem erro no console, sem nada. Cada série sai num `<g class="serie-N">`, a
 * classe define `--serie-cor`, e as classes de forma consomem. A legenda usa a MESMA
 * classe do traço, então as duas não têm como divergir.
 */
function chartSvg(model, viewport) {
  const geometria = chartGeometry(model, viewport);
  // O sparkline não tem eixo nem grade: ele não leva linha de base nem rótulo final.
  const semEixo = geometria.grade.length === 0 && geometria.eixoX.length === 0;
  // Sem `preserveAspectRatio="none"`: com o `viewBox` na medida da caixa a escala é 1:1 e
  // uniforme. Forçar o preenchimento não-uniforme era o que achatava o traço do sparkline
  // e transformava o marcador redondo em elipse.
  const svg = svgNode('svg', {
    viewBox: geometria.viewBox,
    class: 'market-chart-svg',
    role: 'img',
    'aria-label': model.ariaLabel,
  });

  for (const linha of geometria.grade) {
    svg.append(svgNode('line', {
      x1: geometria.plot.x,
      x2: geometria.plot.x + geometria.plot.largura,
      y1: linha.y,
      y2: linha.y,
      class: 'chart-grid-line',
    }));
    const texto = svgNode('text', { x: geometria.plot.x - 6, y: linha.y + 3.5, class: 'chart-axis-value' });
    texto.textContent = linha.rotulo || '';
    svg.append(texto);
  }

  if (geometria.zeroY !== null) {
    svg.append(svgNode('line', {
      x1: geometria.plot.x,
      x2: geometria.plot.x + geometria.plot.largura,
      y1: geometria.zeroY,
      y2: geometria.zeroY,
      class: 'chart-zero-line',
    }));
  }

  for (const serie of geometria.series) {
    const grupo = svgNode('g', { class: `market-serie serie-${serie.cat}` });
    for (const area of serie.areas) grupo.append(svgNode('path', { d: area, class: 'market-serie-area' }));
    for (const segmento of serie.segmentos) {
      grupo.append(svgNode('path', { d: segmento, class: 'market-serie-linha' }));
    }
    for (const coluna of serie.colunas) {
      const barra = svgNode('rect', {
        x: coluna.x, y: coluna.y, width: coluna.largura, height: coluna.altura,
        rx: 2, class: 'market-serie-coluna',
      });
      barra.append(tituloSvg(coluna.titulo));
      grupo.append(barra);
    }
    for (const marcador of serie.marcadores) {
      const ponto = svgNode('circle', {
        cx: marcador.cx, cy: marcador.cy, r: 3.5, class: 'market-serie-marcador',
      });
      ponto.append(tituloSvg(marcador.titulo));
      grupo.append(ponto);
    }
    svg.append(grupo);
  }

  // Linha de base do eixo X: é ela que ancora as colunas e diz onde o plot termina. Sem
  // ela, coluna e área ficam pairando sobre o nada.
  if (!semEixo) {
    svg.append(svgNode('line', {
      x1: geometria.plot.x,
      x2: geometria.plot.x + geometria.plot.largura,
      y1: geometria.plot.y + geometria.plot.altura,
      y2: geometria.plot.y + geometria.plot.altura,
      class: 'chart-axis-line',
    }));
  }

  for (const rotulo of geometria.eixoX) {
    const texto = svgNode('text', {
      x: rotulo.x, y: geometria.eixoXBaseY, 'text-anchor': rotulo.ancora, class: 'chart-axis-month',
    });
    texto.textContent = rotulo.texto;
    svg.append(texto);
  }

  // Rótulo direto SÓ no último ponto de cada série. Número em todo ponto é ruído que
  // ninguém lê; no último ele responde "e agora, quanto está?" sem passar pelo eixo.
  if (!semEixo) {
    for (const serie of geometria.series) {
      if (!serie.ultimoPonto?.rotulo) continue;
      const texto = svgNode('text', {
        x: serie.ultimoPonto.rotuloX,
        y: serie.ultimoPonto.rotuloY,
        'text-anchor': 'end',
        class: `chart-rotulo-final serie-${serie.cat}`,
      });
      texto.textContent = serie.ultimoPonto.rotulo;
      svg.append(texto);
    }
  }

  return { svg, geometria };
}

function tituloSvg(texto) {
  const titulo = svgNode('title');
  titulo.textContent = texto;
  return titulo;
}

/**
 * A legenda. O quadradinho recebe a mesma classe de série do traço — nada de cor por
 * `style`, que era a segunda verdade sobre a cor da série e divergiria no primeiro tema
 * novo.
 */
function marketChartLegend(model) {
  const legenda = document.createElement('ul');
  legenda.className = 'market-chart-legend';
  for (const serie of model.series) {
    const item = document.createElement('li');
    const cor = document.createElement('span');
    // A chave espelha a marca: traço para linha, retângulo para área e coluna. Um quadrado
    // ao lado de uma linha faz procurar no gráfico uma forma que não está lá.
    const forma = model.tipo === CHART_TYPES.LINHA ? 'traco' : 'bloco';
    cor.className = `market-legenda-cor market-legenda-${forma} serie-${serie.cat}`;
    cor.setAttribute('aria-hidden', 'true');
    item.append(cor, document.createTextNode(serie.rotulo));
    legenda.append(item);
  }
  return legenda;
}

/**
 * Os mesmos números em tabela, recolhidos.
 *
 * Existe por duas razões que se somam: acima de 24 meses o gráfico não desenha marcador,
 * e sem marcador não há `title` para consultar o valor de um mês; e quem lê por leitor de
 * tela recebe do `<svg role="img">` uma frase, não a série.
 */
function marketChartTable(model) {
  const bloco = document.createElement('details');
  bloco.className = 'market-chart-valores';
  const resumo = document.createElement('summary');
  resumo.textContent = 'Valores mês a mês';
  bloco.append(resumo);

  const tabela = document.createElement('table');
  const cabecalho = document.createElement('tr');
  for (const coluna of model.tabela.colunas) {
    const celula = document.createElement('th');
    celula.setAttribute('scope', 'col');
    celula.textContent = coluna;
    cabecalho.append(celula);
  }
  const topo = document.createElement('thead');
  topo.append(cabecalho);
  tabela.append(topo);

  const corpo = document.createElement('tbody');
  for (const linha of model.tabela.linhas) {
    const tr = document.createElement('tr');
    for (const [indice, valor] of linha.entries()) {
      const celula = document.createElement(indice === 0 ? 'th' : 'td');
      if (indice === 0) celula.setAttribute('scope', 'row');
      celula.textContent = valor;
      tr.append(celula);
    }
    corpo.append(tr);
  }
  tabela.append(corpo);
  bloco.append(tabela);
  return bloco;
}

/**
 * O card do gráfico, montado SEM o desenho (issue #85).
 *
 * O SVG entra numa segunda passada, depois que o card já está no DOM e dá para MEDIR a
 * caixa. Enquanto o `viewBox` era um número fixo (640) e a caixa real tinha ~498px, o
 * navegador escalava a arte inteira por 0,78 — rótulo de 10px chegando com 7,8px, traço
 * de 2px com 1,56px — e nada denunciava (R8.74).
 *
 * Medir é melhor que calcular: deduzir a largura pelo número de colunas obrigaria a repetir
 * em JS os pontos de quebra que já estão no CSS, e duas verdades sobre a mesma grade
 * divergem no primeiro ajuste.
 */
function marketChart(model) {
  const article = document.createElement('article');
  article.className = 'market-chart';
  article.dataset.chart = model.key;

  const cabecalho = document.createElement('header');
  cabecalho.className = 'market-chart-head';

  const titulos = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = model.titulo;
  titulos.append(title);
  if (model.pergunta) {
    const pergunta = document.createElement('p');
    pergunta.className = 'market-chart-pergunta';
    pergunta.textContent = model.pergunta;
    titulos.append(pergunta);
  }
  if (model.notaModo) {
    // Que série está na tela é informação do gráfico, não do controle lá em cima: quem
    // rola até aqui não vê mais a pílula que escolheu o modo.
    const nota = document.createElement('p');
    nota.className = 'market-chart-modo';
    nota.textContent = model.notaModo;
    titulos.append(nota);
  }
  cabecalho.append(titulos);

  // O valor no canto responde de relance a pergunta que o desenho responde devagar — e diz
  // QUE OPERAÇÃO o produziu, porque soma e média sobre a mesma série de doze meses dão
  // números que diferem por doze e parecem igualmente plausíveis sem o rótulo.
  if (model.resumo) {
    const resumo = document.createElement('p');
    resumo.className = 'market-chart-resumo';
    const valor = document.createElement('strong');
    valor.textContent = model.resumo.valor;
    resumo.append(valor);
    if (model.resumo.rotulo) {
      const nota = document.createElement('span');
      nota.textContent = model.resumo.rotulo;
      resumo.append(nota);
    }
    cabecalho.append(resumo);
  }
  article.append(cabecalho);

  if (model.vazio) {
    // Ausência é frase, não gráfico vazio: um desenho sem traço é indistinguível de um
    // gráfico que não carregou (R5.7).
    const empty = document.createElement('p');
    empty.className = 'market-chart-empty';
    empty.textContent = model.mensagemVazio;
    article.append(empty);
    return { article, plot: null, model };
  }

  const plot = document.createElement('div');
  plot.className = 'market-chart-plot';
  // Legenda ANTES do plot: ela é a chave de leitura, e chave se lê antes do que ela abre.
  article.append(marketChartLegend(model), plot, marketChartTable(model));
  return { article, plot, model };
}

/**
 * Segunda passada: mede a caixa e desenha dentro dela.
 *
 * `clientWidth` de um elemento fora do DOM é 0 — daí a ordem obrigatória: inserir, medir,
 * desenhar. Quando a medida vem 0 mesmo assim (container oculto), o viewport cai no
 * fallback do perfil em vez de produzir um `viewBox` degenerado.
 */
function desenharGraficos(cards) {
  for (const card of cards) {
    if (!card.plot) continue;
    const largura = card.plot.clientWidth;
    // Redesenhar com a mesma medida é trabalho jogado fora — e, dentro do observador de
    // tamanho, é o que realimentaria o laço.
    if (Math.abs(largura - (card.larguraDesenhada || 0)) < TOLERANCIA_DE_REDESENHO) continue;
    card.larguraDesenhada = largura;
    const viewport = card.spark ? sparkViewport(largura) : chartViewport(largura);
    const { svg, geometria } = chartSvg(card.model, viewport);
    if (card.spark) {
      prepararSpark(svg);
      card.plot.replaceChildren(svg);
      continue;
    }
    card.plot.replaceChildren(svg);
    ligarLeitura(card.plot, svg, card.model, geometria);
  }
}

/** Abaixo disto a diferença de largura não muda o desenho o bastante para valer o reflow. */
const TOLERANCIA_DE_REDESENHO = 8;

/**
 * A camada de leitura do gráfico: linha guia + balão com TODAS as séries do mês (issue #85).
 *
 * Três decisões que ela carrega:
 *
 * 1. **O ponteiro mira um MÊS, não um traço.** Um retângulo transparente cobre o plot
 *    inteiro e a categoria mais próxima vence — ninguém acerta uma linha de 2px de
 *    propósito. É `categoriasX`, publicado pela geometria, que faz essa conta.
 * 2. **O balão mostra o mês inteiro, não a série sob o cursor.** Comparar duas séries é a
 *    razão de elas dividirem o gráfico; obrigar a passar por cima de cada uma desfaz isso.
 * 3. **O teclado vê o que o mouse vê.** O `<svg>` é focável e as setas andam pelos meses.
 *    Sem isso o balão viraria informação exclusiva de quem usa mouse — e o balão nunca é o
 *    único caminho: os mesmos números estão no `<details>` abaixo.
 */
function ligarLeitura(plot, svg, model, geometria) {
  if (geometria.categoriasX.length === 0) return;

  const guia = svgNode('line', {
    class: 'chart-guia',
    y1: geometria.plot.y,
    y2: geometria.plot.y + geometria.plot.altura,
    x1: 0,
    x2: 0,
  });
  guia.setAttribute('hidden', 'hidden');
  svg.append(guia);

  const focos = geometria.series.map((serie) => {
    const foco = svgNode('circle', { class: `chart-foco serie-${serie.cat}`, r: 4.5, cx: 0, cy: 0 });
    foco.setAttribute('hidden', 'hidden');
    svg.append(foco);
    return { serie, foco };
  });

  const captura = svgNode('rect', {
    class: 'chart-captura',
    x: geometria.plot.x,
    y: geometria.plot.y,
    width: geometria.plot.largura,
    height: geometria.plot.altura,
  });
  svg.append(captura);

  const balao = document.createElement('div');
  balao.className = 'market-chart-tooltip';
  balao.hidden = true;
  plot.append(balao);

  let indiceAtivo = -1;

  const esconder = () => {
    indiceAtivo = -1;
    balao.hidden = true;
    guia.setAttribute('hidden', 'hidden');
    for (const { foco } of focos) foco.setAttribute('hidden', 'hidden');
  };

  const mostrar = (indice) => {
    if (indice < 0 || indice >= geometria.categoriasX.length) return;
    indiceAtivo = indice;
    const x = geometria.categoriasX[indice];

    guia.setAttribute('x1', String(x));
    guia.setAttribute('x2', String(x));
    guia.removeAttribute('hidden');

    for (const { serie, foco } of focos) {
      const ponto = model.series.find((item) => item.chave === serie.chave)?.pontos[indice];
      const marca = serie.marcadores.find((m) => Math.abs(m.cx - x) < 0.5);
      const coluna = serie.colunas.find((c) => x >= c.x - 1 && x <= c.x + c.largura + 1);
      if (!ponto || ponto.valor === null || (!marca && !coluna)) {
        foco.setAttribute('hidden', 'hidden');
        continue;
      }
      foco.setAttribute('cx', String(marca ? marca.cx : coluna.x + coluna.largura / 2));
      foco.setAttribute('cy', String(marca ? marca.cy : coluna.y));
      foco.removeAttribute('hidden');
    }

    preencherBalao(balao, model, indice);
    balao.hidden = false;
    posicionarBalao(balao, plot, svg, geometria, x);
  };

  captura.addEventListener('pointermove', (evento) => {
    const caixa = svg.getBoundingClientRect();
    if (caixa.width === 0) return;
    // O `viewBox` tem a largura da caixa, mas a escala é reconferida: o card pode ter
    // mudado de tamanho entre o desenho e o ponteiro.
    const escala = geometria.largura / caixa.width;
    const alvo = (evento.clientX - caixa.left) * escala;
    mostrar(indiceMaisProximo(geometria.categoriasX, alvo));
  });
  captura.addEventListener('pointerleave', esconder);

  svg.setAttribute('tabindex', '0');
  svg.addEventListener('focus', () => mostrar(indiceAtivo >= 0 ? indiceAtivo : geometria.categoriasX.length - 1));
  svg.addEventListener('blur', esconder);
  svg.addEventListener('keydown', (evento) => {
    const passo = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity }[evento.key];
    if (passo === undefined) {
      if (evento.key === 'Escape') esconder();
      return;
    }
    evento.preventDefault();
    const ultimo = geometria.categoriasX.length - 1;
    const base = indiceAtivo >= 0 ? indiceAtivo : ultimo;
    mostrar(Math.min(ultimo, Math.max(0, passo === -Infinity ? 0 : (passo === Infinity ? ultimo : base + passo))));
  });
}

function indiceMaisProximo(posicoes, alvo) {
  let melhor = 0;
  for (let i = 1; i < posicoes.length; i += 1) {
    if (Math.abs(posicoes[i] - alvo) < Math.abs(posicoes[melhor] - alvo)) melhor = i;
  }
  return melhor;
}

/**
 * O balão. Valor em destaque e nome da série secundário — é o inverso da legenda, porque
 * aqui quem lê já sabe qual é a série e quer o número.
 */
function preencherBalao(balao, model, indice) {
  const titulo = document.createElement('p');
  titulo.className = 'market-tooltip-mes';
  titulo.textContent = model.categorias[indice].rotulo;

  const lista = document.createElement('ul');
  for (const serie of model.series) {
    const ponto = serie.pontos[indice];
    const item = document.createElement('li');
    const chave = document.createElement('span');
    chave.className = `market-tooltip-chave serie-${serie.cat}`;
    chave.setAttribute('aria-hidden', 'true');
    const valor = document.createElement('strong');
    valor.textContent = ponto.rotulo ?? 'sem valor publicado';
    const nome = document.createElement('span');
    nome.className = 'market-tooltip-serie';
    nome.textContent = serie.rotulo;
    item.append(chave, valor, nome);
    lista.append(item);
  }
  balao.replaceChildren(titulo, lista);
}

/** O balão segue o mês e não sai da caixa: perto da borda direita ele vira para a esquerda. */
function posicionarBalao(balao, plot, svg, geometria, x) {
  const caixa = svg.getBoundingClientRect();
  const escala = caixa.width / geometria.largura;
  const meio = geometria.largura / 2;
  balao.classList.toggle('market-chart-tooltip-esquerda', x > meio);
  balao.style.left = `${Math.round(x * escala)}px`;
  balao.style.top = `${Math.round(geometria.plot.y * escala)}px`;
}

/** O sparkline não é gráfico: é a forma do movimento ao lado do número. */
function prepararSpark(svg) {
  svg.setAttribute('class', 'market-spark-svg');
  // O valor e a variação já estão em texto no card; repetir a série no leitor de tela
  // só atrapalharia.
  svg.setAttribute('aria-hidden', 'true');
  svg.removeAttribute('role');
  svg.removeAttribute('aria-label');
}

/**
 * IVV por Região Administrativa (issue #87).
 *
 * Barra horizontal, não gráfico de linha: a aba publica UM mês, e a pergunta que ela
 * responde é "onde gira mais rápido?", que é comparação entre regiões.
 *
 * `DF Total` sai da lista e vira RÉGUA: ele é a soma do território, e uma barra dele junto
 * das partes contaria o mesmo mercado duas vezes — além de esmagar a escala, já que o
 * agregado quase sempre é maior que cada parte.
 */
function marketRegiaoBarra(item, maximo, referencia) {
  const linha = document.createElement('li');
  linha.className = 'market-regiao';
  linha.dataset.regiao = item.region;

  const nome = document.createElement('span');
  nome.className = 'market-regiao-nome';
  nome.textContent = item.region;

  const trilho = document.createElement('span');
  trilho.className = 'market-regiao-trilho';
  const barra = document.createElement('span');
  barra.className = 'market-regiao-barra';
  // A barra é proporcional ao MAIOR valor da faixa, não a 100%: um IVV de 12,5% contra um
  // teto de 100 daria um fiapo em toda região, e a comparação entre elas some.
  barra.style.width = `${maximo > 0 ? Math.max(2, (item.ivvPct / maximo) * 100) : 0}%`;
  if (referencia && item.ivvPct >= referencia.ivvPct) barra.classList.add('market-regiao-acima');
  trilho.append(barra);

  const valor = document.createElement('span');
  valor.className = 'market-regiao-valor';
  valor.textContent = formatPercent(percentFromPoints(item.ivvPct));

  const detalhe = document.createElement('span');
  detalhe.className = 'market-regiao-detalhe';
  detalhe.textContent = item.soldUnits !== null && item.offeredUnits !== null
    ? `${formatNumber(item.soldUnits)} de ${formatNumber(item.offeredUnits)} em oferta`
    : 'contagem não publicada';

  linha.append(nome, trilho, valor, detalhe);
  return linha;
}

function renderMarketRegioes() {
  const linhas = state.ivvRegion || [];
  // Aba ausente não deixa uma seção vazia na tela: a seção inteira some, e o aviso do
  // carregamento já disse por quê (R2.5).
  dom.marketRegioes.hidden = linhas.length === 0;
  if (linhas.length === 0) return;

  const faixas = faixasDisponiveis(linhas);
  if (dom.marketRegioesFaixa.childElementCount === 0) {
    dom.marketRegioesFaixa.replaceChildren(...faixas.map((faixa) => {
      const botao = periodChip({
        value: faixa,
        chip: faixa === FAIXA_TOTAL ? 'Todas' : faixa,
        label: faixa === FAIXA_TOTAL ? 'Todas as faixas de quartos' : `Apartamentos de ${faixa}`,
      });
      botao.dataset.faixa = faixa;
      delete botao.dataset.mode;
      return botao;
    }));
  }
  const faixa = faixas.includes(state.marketRegionBucket) ? state.marketRegionBucket : faixas[0];
  state.marketRegionBucket = faixa;
  for (const chip of dom.marketRegioesFaixa.querySelectorAll('.market-chip')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.faixa === faixa));
  }

  const ranking = buildRegionRanking(linhas, { bucket: faixa });
  const meses = regionMonths(linhas);
  const quando = ranking.mes ? monthYearLabel(ranking.mes.slice(0, 7)) : 'mês não publicado';
  dom.marketRegioesNote.textContent = meses.length > 1
    ? `Retrato de ${quando}, o mês mais recente publicado por região.`
    : `Retrato de ${quando} — a fonte publica um único mês por região, não uma série.`;

  const lista = document.createElement('ul');
  lista.className = 'market-regioes-lista';
  for (const item of ranking.regioes) {
    lista.append(marketRegiaoBarra(item, ranking.maximo, ranking.referencia));
  }
  dom.marketRegioesLista.replaceChildren(lista);

  if (ranking.referencia) {
    const regua = document.createElement('p');
    regua.className = 'market-regioes-regua';
    regua.textContent = `${REGIAO_TOTAL}: `
      + `${formatPercent(percentFromPoints(ranking.referencia.ivvPct))} — as barras acima dessa `
      + 'marca giram mais rápido que o DF inteiro.';
    dom.marketRegioesLista.append(regua);
  }

  // Região sem valor é NOMEADA, não some e não vira barra de zero: "não publicou" e
  // "vendeu nada" são afirmações diferentes (R5.7).
  dom.marketRegioesAusentes.textContent = ranking.semValor.length > 0
    ? `Sem IVV publicado nesta faixa: ${ranking.semValor.join(', ')}.`
    : '';
}

function renderMarketDashboard() {
  const selected = selectIvvPeriod(state.ivvMonthly, state.marketSelection);
  const resumo = periodSummary(selected);
  dom.marketPeriodLabel.textContent = resumo.meses > 0
    ? `Indicadores de ${resumo.intervalo} · ${resumo.meses} ${resumo.meses === 1 ? 'mês' : 'meses'}`
    : resumo.intervalo;

  // Os três recortes que os gráficos declaram consumir (issue #83). Montá-los aqui é o
  // que permite às definições serem puras: `sazonalidade` precisa de anos inteiros, e
  // pedir isso ao módulo de definição obrigaria ele a conhecer `state`.
  const janela = chartRowsForSelection(state.ivvMonthly, selected);
  const fontes = { periodo: selected.rows, janela, completa: state.ivvMonthly };

  const modo = state.marketSeriesMode || modoPadraoDaSerie(state.marketSelection);
  state.marketSeriesMode = modo;
  sincronizarModoDaSerie(modo);

  const { warnings, mesReferencia, sparks } = renderMarketCards(selected.rows, janela);

  // A base de comparação fica escrita UMA vez, junto do período, em vez de repetida em
  // doze cards. Os rótulos das variações já nomeiam o mês; esta frase diz de onde ele vem.
  dom.marketPeriodBase.textContent = mesReferencia
    ? `Variações referentes a ${monthYearLabel(mesReferencia)}, comparado com `
      + `${monthYearLabel(mesAnterior(mesReferencia))} e com `
      + `${monthYearLabel(mesmoMesAnoAnterior(mesReferencia))}.`
    : '';
  const recorte = selected.rows.length === 1
    ? `${resumo.intervalo}, com até 12 meses anteriores de contexto`
    : resumo.intervalo;
  dom.marketHistoryNote.textContent = modo === SERIES_MODES.ACUMULADO
    ? `Acumulado no ano, mês a mês, em ${recorte}.`
    : `Valores de cada mês em ${recorte}.`;

  renderMarketRegioes();

  const graficos = [
    ...buildHistoryCharts(fontes, modo),
    buildSeasonality(state.ivvMonthly, { modo }),
  ];
  const cards = graficos.map(marketChart);
  dom.marketCharts.replaceChildren(...cards.map((item) => item.article));

  // Inserido primeiro, medido depois, desenhado por último. Guardar o que está na tela é o
  // que permite redesenhar só os SVGs quando a janela muda de largura, sem refazer a
  // agregação inteira.
  cardsNaTela = [...cards, ...sparks];
  desenharGraficos(cardsNaTela);
  return warnings.map((item) => `Mercado (${item.metric || 'período'}): ${item.message}`);
}

const MODOS_DE_SERIE = Object.freeze([
  { value: SERIES_MODES.MENSAL, chip: 'Mês a mês', label: 'Valores de cada mês' },
  { value: SERIES_MODES.ACUMULADO, chip: 'Acumulado no ano', label: 'Acumulado no ano até cada mês' },
]);

/**
 * O modo em que os gráficos abrem SEGUE O PERÍODO escolhido (issue #85).
 *
 * Quem pediu "Acumulado do ano" nos indicadores está perguntando como está o ano; abrir os
 * gráficos em mês a mês faria as duas metades da tela responderem perguntas diferentes sem
 * ninguém ter pedido isso. Nos demais períodos o mês a mês é o que responde.
 */
function modoPadraoDaSerie(selecao) {
  return selecao?.mode === PERIOD_MODES.YTD ? SERIES_MODES.ACUMULADO : SERIES_MODES.MENSAL;
}

function sincronizarModoDaSerie(modo) {
  if (dom.marketSeriesMode.childElementCount === 0) {
    dom.marketSeriesMode.replaceChildren(...MODOS_DE_SERIE.map((item) => {
      const botao = periodChip(item);
      botao.dataset.serieModo = item.value;
      delete botao.dataset.mode;
      return botao;
    }));
  }
  for (const chip of dom.marketSeriesMode.querySelectorAll('.market-chip')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.serieModo === modo));
  }
}

/** O que está desenhado na tela agora, para o redesenho por mudança de largura. */
let cardsNaTela = [];

/**
 * Redesenha os SVGs quando a caixa muda de largura (issue #85).
 *
 * A geometria é calculada em JS a partir da medida, e JS não reage a mudança de layout
 * sozinho: sem isto, estreitar a janela deixaria um desenho de 528 pontos preso numa caixa
 * de 300. O redesenho acontece DENTRO do observador de tamanho, então a guarda de
 * `TOLERANCIA_DE_REDESENHO` em `desenharGraficos` é o que impede o laço — cada card só é
 * redesenhado quando a própria caixa dele mudou de verdade.
 */
function observarLarguraDosGraficos() {
  if (typeof ResizeObserver !== 'function') return;
  const observador = new ResizeObserver(() => desenharGraficos(cardsNaTela));
  observador.observe(dom.marketCharts);
  observador.observe(dom.marketDestaques);
}

function renderMarketView() {
  const temSerie = state.ivvMonthly.length > 0;

  // Botão desabilitado com o motivo escrito, não botão que some: um controle que
  // desaparece parece bug de carregamento, e ninguém procura o que não viu.
  dom.marketTab.disabled = !temSerie;
  dom.marketTab.title = temSerie ? ''
    : 'A aba IVV_MONTHLY não foi carregada, então não há série de mercado para mostrar.';

  if (!temSerie) {
    if (viewFromHash() === 'mercado') setView('mapa');
    return [];
  }

  dom.marketScope.textContent = IVV_SCOPE_NOTICE;
  if (!state.marketSelection) initializeMarketFilters();
  const aggregationWarnings = renderMarketDashboard();

  const { rows, warnings, sourceUrl } = ivvProvenance(state.ivvMonthly);
  dom.marketProvenanceList.replaceChildren();
  for (const row of rows) addRow(dom.marketProvenanceList, row.label, row.value);

  const href = safeExternalUrl(sourceUrl);
  if (href) {
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `Fonte: ${hostnameOf(href) || 'abrir'}`;
    dom.marketSource.replaceChildren(link);
    dom.marketSource.hidden = false;
  } else {
    dom.marketSource.replaceChildren();
    dom.marketSource.hidden = true;
  }

  setView(viewFromHash());

  // Campo em que os meses divergem não vira linha; a divergência vira aviso, na mesma
  // lista do carregamento (R5.7). Devolver em vez de registrar aqui mantém uma origem
  // única no console e uma ordem determinística entre os avisos.
  return [...warnings, ...aggregationWarnings];
}

function refreshMarketView() {
  const marketWarnings = renderMarketView();
  showWarnings([...state.baseWarnings, ...marketWarnings]);
}

async function load() {
  showLoading(true);
  dom.errorState.hidden = true;
  dom.dataWarnings.hidden = true;
  dom.dataWarnings.open = false;

  const result = await loadDataset(CONFIG);
  showLoading(false);
  showSourceBadge(result.source);

  // Descreve o dataset inteiro, então é renderizado uma vez no carregamento e não a
  // cada mudança de filtro.
  renderDatasetMeta(result.meta);

  if (!result.ok) {
    showError(result.errors);
    return;
  }

  state.records = flattenEntities(result.entities);
  state.raProfiles = result.raProfiles || {};
  state.ivvMonthly = result.ivvMonthly || [];
  state.ivvRegion = result.ivvRegion || [];
  state.marketSelection = null;
  state.baseWarnings = [...result.warnings, ...result.errors];
  state.polygons = result.polygons || [];
  renderPolygonLegend();

  populateSelect(dom.locality, distinctLocalities(state.records));
  populateSelect(dom.ptype, distinctPropertyTypes(state.records), formatPropertyType);
  populateSelect(
    dom.raFilter,
    distinctRegions(state.records),
    (id) => state.raProfiles[id]?.ra_name || id,
  );
  populateSelect(dom.salesStage, distinctSalesStages(state.records), formatSalesStage);
  populateSelect(
    dom.regularizationStatus,
    distinctRegularizationStatuses(state.records),
    formatRegularizationStatus,
  );
  populateSelect(dom.anchorGroup, distinctAnchorGroups(state.records), formatAnchorGroup);
  populateAnchorSegments('');
  renderAnchorLegend(state.records);

  refreshMarketView();
  render();

  // Enquadra o que tem coordenada, para a primeira tela não depender do zoom padrão.
  const withCoord = state.records.filter((r) => r.coord);
  if (withCoord.length > 0) {
    map.fitBounds(withCoord.map((r) => [r.coord.lat, r.coord.lon]), { padding: [40, 40] });
  }
}

// --- Ligação --------------------------------------------------------------

function bindEvents() {
  for (const node of [dom.search, dom.priceMin, dom.priceMax]) {
    node.addEventListener('input', render);
  }
  for (const node of [dom.locality, dom.raFilter, dom.ptype, dom.buildingOrientation,
    dom.salesStage, dom.regularizationStatus, dom.anchorSegment, dom.beds]) {
    node.addEventListener('change', render);
  }
  // O grupo restringe a lista de segmentos antes de renderizar, então tem handler
  // próprio em vez de entrar na lista acima.
  dom.anchorGroup.addEventListener('change', () => {
    populateAnchorSegments(dom.anchorGroup.value);
    render();
  });
  dom.layers.addEventListener('change', render);
  dom.clearFilters.addEventListener('click', clearFilters);
  dom.closeDetail.addEventListener('click', closeDetail);
  dom.retryBtn.addEventListener('click', () => { load().catch(reportFatal); });

  // Delegação: as pílulas são geradas a cada carga da série, e ouvir no container evita
  // reamarrar seis ouvintes toda vez.
  dom.marketRegioesFaixa.addEventListener('click', (event) => {
    const chip = event.target.closest('.market-chip');
    if (!chip) return;
    state.marketRegionBucket = chip.dataset.faixa;
    renderMarketRegioes();
  });

  dom.marketSeriesMode.addEventListener('click', (event) => {
    const chip = event.target.closest('.market-chip');
    if (!chip) return;
    state.marketSeriesMode = chip.dataset.serieModo;
    refreshMarketView();
  });

  dom.marketPeriodChips.addEventListener('click', (event) => {
    const chip = event.target.closest('.market-chip');
    if (!chip || !state.marketSelection) return;
    state.marketSelection.mode = chip.dataset.mode;
    // Trocar de período reajusta o modo dos gráficos: quem sai do acumulado do ano para
    // "Mês" está mudando de pergunta, e a tela acompanha em vez de manter a resposta velha.
    state.marketSeriesMode = modoPadraoDaSerie(state.marketSelection);
    syncMarketFilterState();
    refreshMarketView();
  });
  dom.marketYear.addEventListener('change', () => {
    if (!state.marketSelection) return;
    state.marketSelection.year = Number(dom.marketYear.value);
    populateMarketMonths(state.marketSelection.year, state.marketSelection.month);
    state.marketSelection.month = Number(dom.marketMonth.value);
    refreshMarketView();
  });
  dom.marketMonth.addEventListener('change', () => {
    if (!state.marketSelection) return;
    state.marketSelection.month = Number(dom.marketMonth.value);
    refreshMarketView();
  });
  for (const input of [dom.marketStart, dom.marketEnd]) {
    input.addEventListener('change', () => {
      if (!state.marketSelection) return;
      state.marketSelection.start = dom.marketStart.value;
      state.marketSelection.end = dom.marketEnd.value;
      refreshMarketView();
    });
  }

  // A largura do desenho é medida, então quem avisa que ela mudou é o observador de
  // tamanho — e não um `matchMedia`, que só dispararia no ponto de quebra e deixaria
  // passar toda mudança de largura entre eles (issue #85).
  observarLarguraDosGraficos();

  // Troca de view (issue #58). O hash é a fonte da verdade: o clique escreve nele e o
  // `hashchange` aplica. Assim o botão e a barra de endereço nunca discordam, e
  // recarregar em `#mercado` abre direto no dashboard.
  dom.viewSwitch.addEventListener('click', (event) => {
    const tab = event.target.closest('.view-tab');
    if (!tab || tab.disabled) return;
    setView(tab.dataset.view);
  });
  window.addEventListener('hashchange', () => setView(viewFromHash()));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !dom.detail.hidden) closeDetail();
  });
}

/** Último recurso: qualquer falha inesperada vira estado de erro, nunca tela branca. */
function reportFatal(error) {
  showLoading(false);
  showError([error?.message || String(error)]);
}

function main() {
  // Sem tratamento, uma rejeição não capturada some no console e a tela fica em branco.
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[imob] rejeição não tratada:', event.reason);
  });

  try {
    initMap();
  } catch (error) {
    reportFatal(error);
    return;
  }

  bindEvents();
  load().catch(reportFatal);
}

main();
