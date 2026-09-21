// Interação, mapa e ligação entre filtros e dados.
//
// A lógica testável mora nos módulos puros (normalize, filters, format). Aqui fica
// apenas o que precisa do DOM e do Leaflet.
//
// Regra de segurança que vale para o arquivo inteiro: nenhuma string vinda dos dados
// entra em innerHTML. Todo texto vai por textContent e todo elemento é criado com
// createElement (docs/ENGINEERING_RULES.md, R4.4).

import { loadDataset, flattenEntities } from './data.js';
import { isApproximateLocation, canUseForDistance, appMetaRows } from './normalize.js';
import { comparableSample, comparableStats, positionVsMedian, rulerPosition, RECENT_DAYS } from './map/comparables.js';
import { ivvProvenance, IVV_SCOPE_NOTICE } from './ivv/scope.js';
import {
  buildRegionRanking, faixasDisponiveis, regionMonths, REGIAO_TOTAL, FAIXA_TOTAL,
} from './ivv/region.js';
import { aggregatePeriod } from './ivv/aggregate.js';
import { buildMarketDashboard, formatMetricValue } from './ivv/cards.js';
import { buildMicroKpis } from './ivv/derived.js';
import { raRealEstateProfile, compactIndicators, RA_PROFILE_ITEMS, PROFILE_STATUS } from './pdad/insights.js';
import { parseHash, buildHash, intParam } from './url-state.js';
import { buildRegionScatter, REGION_SCATTER_MODES } from './ivv/region.js';
import {
  PERIOD_MODE_OPTIONS, PERIOD_MODES, availableYears, availableMonths, controlDisabledReason,
  defaultPeriodSelection, selectIvvPeriod, chartRowsForSelection, periodSummary,
  monthYearLabel, mesAnterior, mesmoMesAnoAnterior,
} from './ivv/period.js';
import {
  buildHistoryCharts, buildSeasonality, buildSparkline, SERIES_MODES,
  COMPARE_MODES, COMPARE_MODE_OPTIONS, COMPARE_SUFFIX, comparisonRows, historyMonths,
} from './ivv/history.js';
import { CHART_TYPES, DIMENSOES } from './ivv/chart-model.js';
import { chartGeometry, chartViewport, sparkViewport } from './ivv/chart-layout.js';
import {
  buildFipezapHistoryCharts, fipezapMonthlyIndex, fipezapRowsInRange,
} from './fipezap/history.js';
import { localitiesAvailable, buildLocalityCharts, FIPEZAP_SEGMENTS } from './fipezap/locality.js';
import { pdadYearsAvailable } from './pdad/normalize-pdad.js';
import {
  buildPdadIndex, rasForYear, summarizeKpis, indicatorSeries, indicatorGroups,
  buildFigureMeta, detailRowsForKey, rankScalar, categoryLabel,
} from './pdad/aggregate.js';
import {
  PDAD_TEMAS, INDICATORS_BY_TEMA, PDAD_VIZ, PDAD_TIME_ORDER, PDAD_RANK_SET,
  PDAD_COMPARE_KITS, PDAD_SCATTER_VIEWS, PDAD_INDICATOR_LIST, INDICATOR_CODES_BY_KEY,
  SHOPPING_GROUP_BY_CODE, SHOPPING_GROUP_TITLE_BY_SLUG,
} from './pdad/indicators.js';
import { buildChart, buildGroups } from './pdad/charts.js';
import { rowsToCsv, downloadCsv } from './pdad/csv.js';
import {
  anchorLegendGroups, applyFilters, computeKpis, createFilterState, distinctAnchorGroups,
  distinctAnchorSegments, distinctLocalities, distinctPropertyTypes, distinctRegions,
  distinctRegularizationStatuses, distinctSalesStages, LAYERS,
  groupPolygonsForLegend, polygonPassesLayerFilters, raProfileForPolygon,
} from './filters.js';
import {
  formatBRL, formatBRLCompact, formatM2, formatNumber, formatPriceM2, formatDate,
  formatPropertyType, formatSpatialPrecision, formatBuildingOrientation, safeExternalUrl,
  datasetSourceLink,
  hostnameOf, anchorColor, markerIcon, anchorLegendEntries, formatAnchorCategory, formatAnchorGroup,
  formatAnchorSegment, formatSalesStage, formatRegularizationStatus, formatPercent,
  percentFromPoints, raAgeBands, polygonStyle, sortPolygonsForDraw, raProfileEssentials,
  raProfileUnavailability, polygonEssentials, polygonPropertyTiers, polygonEssentialKeys,
  polygonEntityType, polygonLayerGroup, compactNumber,
} from './format.js';
import { trafficPanelRows, roadSegmentTrafficDetail } from './traffic/panel.js';
import { segmentIdsWithTraffic } from './traffic/link.js';
import {
  drawsAsLine, isRoadSegmentPolygon, roadAxisGeometry, roadSegmentBounds, roadSegmentIdOf,
  roadSegmentCodeOf, selectRoadSegmentPolygons, validateRoadSegmentLayer,
} from './traffic/road-geometry.js';
import { ANCHOR_ICONS, ANCHOR_FALLBACK_ICON } from './icons.js';

const CONFIG = window.APP_CONFIG || {};

const el = (id) => document.getElementById(id);

const dom = {
  search: el('search'), locality: el('locality'), ptype: el('ptype'),
  raFilter: el('raFilter'), raProfile: el('raProfile'),
  buildingOrientation: el('buildingOrientation'),
  anchorGroup: el('anchorGroup'), anchorSegment: el('anchorSegment'),
  salesStage: el('salesStage'), regularizationStatus: el('regularizationStatus'),
  priceMin: el('priceMin'), priceMax: el('priceMax'), beds: el('beds'),
  clearFilters: el('clearFilters'),
  moreFilters: el('moreFilters'), moreFiltersSummary: el('moreFiltersSummary'), layers: el('layersSection'),
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
  trafficSection: el('trafficSection'), trafficList: el('trafficList'),
  viewSwitch: el('viewSwitch'), marketTab: el('marketTab'),
  railToggle: el('railToggle'), panelToggle: el('panelToggle'),
  mapView: el('mapView'), marketView: el('marketView'),
  marketScope: el('marketScope'), marketBody: el('marketBody'),
  marketPeriodChips: el('marketPeriodChips'), marketYear: el('marketYear'),
  marketMonth: el('marketMonth'),
  marketStart: el('marketStart'), marketEnd: el('marketEnd'),
  marketPeriodLabel: el('marketPeriodLabel'), marketPeriodBase: el('marketPeriodBase'),
  marketDestaques: el('marketDestaques'), marketMicroKpis: el('marketMicroKpis'), marketCharts: el('marketCharts'),
  marketSeriesMode: el('marketSeriesMode'),
  marketRegioes: el('marketRegioes'), marketRegioesFaixa: el('marketRegioesFaixa'),
  marketRegioesLista: el('marketRegioesLista'), marketRegioesNote: el('marketRegioesNote'),
  marketRegioesScatter: el('marketRegioesScatter'), marketRegioesModo: el('marketRegioesModo'),
  marketCompare: el('marketCompare'), copyLink: el('copyLink'),
  marketRegioesAusentes: el('marketRegioesAusentes'),
  marketHistoryNote: el('marketHistoryNote'),
  marketProvenance: el('marketProvenance'), marketProvenanceList: el('marketProvenanceList'),
  marketSource: el('marketSource'),
  fipezapSection: el('fipezapSection'), fipezapHistoryNote: el('fipezapHistoryNote'),
  fipezapPeriodChips: el('fipezapPeriodChips'), fipezapYear: el('fipezapYear'),
  fipezapStart: el('fipezapStart'), fipezapEnd: el('fipezapEnd'),
  fipezapPeriodLabel: el('fipezapPeriodLabel'),
  fipezapChartsResidencial: el('fipezapChartsResidencial'),
  fipezapChartsComercial: el('fipezapChartsComercial'),
  fipezapRaSection: el('fipezapRaSection'), fipezapRaNote: el('fipezapRaNote'),
  fipezapSegment: el('fipezapSegment'), fipezapLocality: el('fipezapLocality'),
  fipezapLocalityChart: el('fipezapLocalityChart'),
  pdadTab: el('pdadTab'), pdadView: el('pdadView'), pdadScope: el('pdadScope'),
  pdadRa: el('pdadRa'), pdadYear: el('pdadYear'), pdadTema: el('pdadTema'),
  pdadReset: el('pdadReset'), pdadKpis: el('pdadKpis'), pdadYearNote: el('pdadYearNote'),
  pdadTemaBlocks: el('pdadTemaBlocks'), pdadProfile: el('pdadProfile'),
  pdadScatterSection: el('pdadScatterSection'), pdadScatterMeta: el('pdadScatterMeta'),
  pdadScatterView: el('pdadScatterView'), pdadScatterInsight: el('pdadScatterInsight'),
  pdadScatterPlot: el('pdadScatterPlot'), pdadScatterNote: el('pdadScatterNote'),

  pdadRankingTab: el('pdadRankingTab'), pdadRankingView: el('pdadRankingView'),
  pdadRankRa: el('pdadRankRa'), pdadRankCards: el('pdadRankCards'),
  pdadRankIndicator: el('pdadRankIndicator'), pdadRankMode: el('pdadRankMode'),
  pdadRankExport: el('pdadRankExport'), pdadRankTableHead: el('pdadRankTableHead'),
  pdadRankTableBody: el('pdadRankTableBody'),

  pdadCompareTab: el('pdadCompareTab'), pdadCompareView: el('pdadCompareView'),
  pdadCvCount: el('pdadCvCount'),
  pdadCvRaSelect: el('pdadCvRaSelect'), pdadCvRaAdd: el('pdadCvRaAdd'), pdadCvRaTop: el('pdadCvRaTop'),
  pdadCvRas: el('pdadCvRas'),
  pdadCvIndSelect: el('pdadCvIndSelect'), pdadCvIndAdd: el('pdadCvIndAdd'), pdadCvKits: el('pdadCvKits'),
  pdadCvInds: el('pdadCvInds'),
  pdadCvClear: el('pdadCvClear'), pdadCvExport: el('pdadCvExport'),
  pdadCvSummary: el('pdadCvSummary'), pdadCvBlocks: el('pdadCvBlocks'),

  pdadBaseTab: el('pdadBaseTab'), pdadBaseView: el('pdadBaseView'),
  pdadBaseDescription: el('pdadBaseDescription'), pdadBaseKpis: el('pdadBaseKpis'),

  pdadDrillOverlay: el('pdadDrillOverlay'), pdadDrillTitle: el('pdadDrillTitle'),
  pdadDrillSub: el('pdadDrillSub'), pdadDrillClose: el('pdadDrillClose'),
  pdadDrillRa: el('pdadDrillRa'), pdadDrillYear: el('pdadDrillYear'),
  pdadDrillExport: el('pdadDrillExport'), pdadDrillAudit: el('pdadDrillAudit'),
  pdadDrillRows: el('pdadDrillRows'), pdadDrillRank: el('pdadDrillRank'),
  pdadDrillMeta: el('pdadDrillMeta'),
};

const state = {
  records: [],
  // Registros que passaram no filtro na última renderização — é o "recorte selecionado"
  // contra o qual o painel de detalhe posiciona um imóvel (issue #124).
  visible: [],
  // Comparação temporal dos gráficos (issue #127) e modo da matriz por RA.
  marketCompare: COMPARE_MODES.NENHUM,
  marketRegionScatterMode: null,
  // Parâmetros lidos da URL na abertura (issue #127); consumidos por quem monta cada view.
  pendingUrl: null,
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
  // Preço FipeZap — DF inteiro (issue pendente de registro) e por localidade. Listas vazias
  // são o estado normal enquanto a aba não veio; as duas seções somem dizendo por quê,
  // mesmo tratamento de `ivvRegion` (R2.5).
  fipezapMonthly: [],
  fipezapLocality: [],
  fipezapLocalityMap: [],
  fipezapSelection: null,
  fipezapLocalitySegment: null,
  fipezapLocalityChoice: null,
  baseWarnings: [],
  // Contornos importados de KML/KMZ (issue #28). Lista vazia é o estado normal de
  // quem ainda não importou nenhum arquivo — a camada só não aparece.
  polygons: [],
  // Trechos rodoviários com tráfego ligado (issue #62/#63). `bySegmentId` vazio é o
  // estado normal enquanto ROAD_SEGMENTS não vier — o painel simplesmente não aparece.
  traffic: { bySegmentId: new Map(), orphaned: [], unmatchedSegmentIds: [] },
  /**
   * `polygon_id` do trecho rodoviário em destaque (issue #134), ou `null`.
   *
   * Fica fora de `selectedId`, que identifica um REGISTRO plotável e é zerado pelo
   * `render()` quando o id sai do filtro — um contorno não passa pelos filtros de
   * registro, e guardá-lo ali faria o destaque piscar no primeiro render.
   */
  selectedRoadId: null,
  // Diagnóstico Territorial PDAD-A (issue #100). `pdadData` são as linhas normalizadas
  // (formato longo); `pdadIndex` é `buildPdadIndex(pdadData)`, calculado uma vez no
  // carregamento — recalcular a cada troca de filtro custaria as ~12 mil linhas de novo
  // para um resultado que não muda com o filtro. Lista/índice vazios são o estado normal
  // enquanto a aba PDAD_A_DATA não vier — a aba Diagnóstico fica desabilitada dizendo
  // por quê, mesmo tratamento de `ivvMonthly`/`marketTab` (R2.5).
  pdadData: [],
  pdadIndex: {},
  pdadFilters: null,
  // Metadados de figura/tabela por `indicator_code` (issue #102), montados uma vez no
  // carregamento — alimenta o cabeçalho do drill-down sem precisar de um `FIGURE_MAP`
  // separado, porque cada linha do PDAD_A_DATA já carrega a própria procedência.
  pdadFigureMeta: new Map(),
  // Filtros da tela Ranking dos territórios: RA de referência dos cartões, indicador e
  // critério (%/absoluto) da tabela comparativa. `null` até a primeira carga com dado.
  pdadRankState: null,
  // Seleção da tela Comparar RAs: RAs (2 a 6) e indicadores (até 4), com uma cor fixa por
  // RA enquanto ela estiver selecionada — mesma leitura do protótipo de referência.
  pdadCompareState: { ras: [], inds: [], colors: {} },
  // Recorte aberto no modal de drill-down (issue #102). `null` quando o modal está fechado.
  pdadDrillState: null,
};

let map = null;
let markerLayer = null;
let polygonLayer = null;
/**
 * Camada dos eixos rodoviários (issue #131), separada da de contornos.
 *
 * Separada porque são objetos geométricos diferentes — área com preenchimento clicável
 * contra linha de 4 px — e porque o empilhamento entre as duas é uma DECISÃO (ver o pane
 * em `initMap`), não a ordem em que a planilha devolveu as linhas.
 */
let roadLayer = null;

/** Raio do marcador por camada: anúncio é o dado principal, âncora é contexto. */
/**
 * Lado do disco de cada marcador no mapa, em px (issues #112, #115). O Leaflet precisa
 * do número para ancorar o ícone no centro da coordenada e o balão acima dele; o CSS
 * de `.marker-icon-<kind>` repete o mesmo valor. Se um mudar sem o outro, o disco fica
 * descentrado do ponto. O anúncio é menor de propósito: os agrupamentos de anúncios
 * (centroide de localidade com jitter) já se sobrepõem, e um disco grande ali vira uma
 * mancha. Os valores caíram de 18/22 para 13/16 na issue #116, a pedido do dono; a
 * amostra da legenda tem tamanho próprio no CSS e não acompanha o mapa.
 */
const MARKER_ICON_SIZE = { listing: 13, development: 16, anchor: 16 };

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

  // Empilhamento explícito por pane (issues #112, #115): contorno embaixo (350),
  // âncora no meio (380), anúncio e empreendimento em cima (pane padrão de marcadores,
  // 600). Antes bastava adicionar os polígonos ANTES dos marcadores, porque tudo era
  // `<path>` num SVG só e o Leaflet empilha na ordem de adição; com `divIcon` cada
  // entidade precisa dizer onde fica. A âncora é contexto e o imóvel é o dado, então
  // um disco de âncora nunca pode cobrir um anúncio e roubar o clique dele. Contorno
  // tem preenchimento clicável, então precisa ficar ABAIXO da âncora, senão a RA que
  // cobre o DF inteiro engoliria o clique em toda âncora.
  map.createPane('polygons').style.zIndex = 350;
  // Eixo rodoviário entre o contorno e a âncora, e a posição é a única que funciona:
  // ABAIXO da RA ele fica invisível (uma linha de 4 px sob uma área que cobre a RA
  // inteira) e sem clique; ACIMA da âncora ele atravessaria o mapa roubando o clique de
  // toda âncora que cruzar a DF-001. No meio, ele cobre a área que precisa cobrir e cede
  // o clique ao ponto, que é o dado.
  map.createPane('roadSegments').style.zIndex = 360;
  map.createPane('anchors').style.zIndex = 380;

  polygonLayer = L.layerGroup().addTo(map);
  roadLayer = L.layerGroup().addTo(map);
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
 * outros nem o carregamento (R2.6). `source_geometry_geojson` NUNCA é desenhado: é
 * procedência, e ler os dois campos daria dois desenhos possíveis para o mesmo trecho
 * sem ninguém saber qual está na tela.
 *
 * 4. **Linha e área saem por portas diferentes** (#131). A aba POLYGONS carrega os dois:
 *    RA é `Polygon`/`MultiPolygon`, trecho rodoviário é o EIXO oficial do DER em
 *    `LineString`. Até esta issue a função aceitava só área, e as cinco linhas do piloto
 *    sumiam sem erro nenhum. Desenhar uma delas como `Polygon` seria pior que sumir:
 *    um eixo de 24 pontos "fechado" é geografia falsa, com a aparência de um dado bom.
 */
function renderPolygons() {
  if (!polygonLayer || !roadLayer) return;
  polygonLayer.clearLayers();
  roadLayer.clearLayers();
  if (!state.filters.layers.has('polygon')) return;

  // Ordem primeiro, filtro depois: ordenar só o que sobrou daria um empilhamento que
  // muda conforme o que está ligado, e a mesma RA subiria ou desceria ao desligar uma
  // camada vizinha.
  for (const polygon of sortPolygonsForDraw(state.polygons)) {
    if (!polygonPassesLayerFilters(polygon, state.filters)) continue;

    // Geometria de LINHA primeiro. `roadAxisGeometry` tenta `geometry_geojson` e, num
    // trecho rodoviário cuja célula principal chegou vazia ou truncada, cai para
    // `source_geometry_geojson` (issue #134) — nunca num corredor com buffer, onde os dois
    // campos guardam desenhos diferentes por construção.
    const eixo = roadAxisGeometry(polygon);
    if (eixo) {
      renderRoadSegment(polygon, eixo);
      continue;
    }

    let geometry = null;
    try {
      geometry = JSON.parse(polygon.geometry_geojson);
    } catch (error) {
      continue; // geometria ilegível: este contorno não é desenhado, os outros seguem
    }
    if (!geometry) continue;

    // Quem decide COMO desenhar é a GEOMETRIA, não o tipo da entidade.
    //
    // Uma versão anterior desta issue despachava por `entity_type === 'road_segment'`, e
    // isso apagou do mapa todo corredor rodoviário gravado pela v2.2.1 — aqueles são
    // `entity_type: road_segment` com geometria `Polygon` (o eixo já com buffer), e o
    // renderizador de linha recusa área, corretamente. O resultado foi um trecho que
    // funcionava sumir sem erro nenhum: exatamente o defeito que esta issue conserta,
    // reintroduzido pela correção dele.
    //
    // Pelo tipo da geometria, os dois convivem: corredor antigo continua área, eixo novo
    // é linha, e nenhum dos dois depende de como a outra coluna foi preenchida.
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') continue;

    const style = polygonStyle(polygon);
    let shape = null;
    try {
      shape = L.geoJSON(geometry, {
        pane: 'polygons', // ver `initMap`: abaixo das âncoras e dos marcadores
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
          // `null`/`undefined` já significa "sólido" para o Leaflet — não precisa de `if`.
          dashArray: style.dashArray,
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
 * Desenha UM trecho rodoviário como linha (issue #131).
 *
 * Duas geometrias, uma visível e uma não, e as duas existem por motivos diferentes:
 *
 * 1. **O traço oficial**, com a espessura e a cor que a planilha declarou. É o desenho —
 *    a geometria do DER, sem simplificação e sem buffer. `fill: false` explícito: uma
 *    `LineString` com `fill` ligado ganha um preenchimento entre o primeiro e o último
 *    ponto, que é uma área que a fonte nunca publicou.
 * 2. **Um alvo de clique invisível**, o mesmo traço com 14 px. Quatro pixels são um alvo
 *    impossível no toque, e engrossar o traço visível falsearia a largura da via. O alvo
 *    é desenhado ANTES, para ficar embaixo, e leva `opacity: 0` — em SVG o que decide se
 *    um traço recebe clique é `stroke` existir, não a opacidade dele.
 *
 * O alvo é largo, mas continua sendo uma LINHA: ele cobre ~7 px de cada lado do eixo, não
 * a área da RA embaixo. Um clique a 20 px do traço continua chegando na Região
 * Administrativa, como antes.
 */
function renderRoadSegment(polygon, parsed = null) {
  // `renderPolygons` já resolveu a geometria; `roadAxisGeometry` cobre a chamada direta e
  // recusa área, que é o que impede uma `Polygon` de entrar por esta porta.
  const geometry = parsed || roadAxisGeometry(polygon);
  // Geometria ausente, ilegível ou de tipo de área: o trecho não é desenhado, e
  // `validateRoadSegmentLayer` já disse o motivo no canal de avisos. Um traço inventado
  // aqui seria o mesmo que apagar a evidência de que o dado está errado.
  if (!geometry) return;

  const style = polygonStyle(polygon);
  const selecionado = state.selectedRoadId === polygon.id;

  let alvo = null;
  let traco = null;
  try {
    alvo = L.geoJSON(geometry, {
      pane: 'roadSegments',
      style: { className: 'road-segment-hit', color: style.color, weight: 14, opacity: 0, fill: false },
    });
    traco = L.geoJSON(geometry, {
      pane: 'roadSegments',
      // `className` serve só para achar a linha no DOM (teste e depuração): a cor
      // continua vindo daqui, por `color`. Nenhuma regra de CSS pode pintar
      // `.road-segment-shape` — regra de classe vence o atributo que o Leaflet escreve
      // no SVG, que foi como todas as âncoras acabaram verdes na PR #40 (R8.31, R8.45).
      style: {
        // O destaque é ESTRUTURAL (espessura), não uma troca de cor: a cor do eixo é dado
        // da planilha e identifica QUAL trecho é; trocá-la no clique faria a legenda deixar
        // de bater com o mapa no exato momento em que alguém está conferindo os dois.
        className: selecionado ? 'road-segment-shape road-segment-selected' : 'road-segment-shape',
        color: style.color,
        weight: selecionado ? style.weight + 4 : style.weight,
        opacity: selecionado ? 1 : 0.95,
        fill: false,
        dashArray: style.dashArray,
      },
    });
  } catch (error) {
    return; // coordenada fora de faixa faz o Leaflet lançar; mesmo tratamento de renderPolygons
  }

  const rotulo = roadSegmentTooltipText(polygon);
  for (const camada of [alvo, traco]) {
    const tooltip = document.createElement('span');
    tooltip.textContent = rotulo;
    camada.bindTooltip(tooltip, { sticky: true });
    camada.on('click', () => selectRoadSegment(polygon));
    camada.addTo(roadLayer);
  }
}

/**
 * Texto do balão de um eixo: nome e, quando há medição, a métrica de fluxo (issue #134).
 *
 * A métrica é a MÉDIA DIÁRIA do trecho, derivada de `TRAFFIC_DAILY_TEST` — e o balão diz
 * que é média, não "fluxo". Um número sem o que ele mede vira o número errado na cabeça de
 * quem lê. Trecho sem medição mostra só o nome: travessão ali seria ruído.
 */
function roadSegmentTooltipText(polygon) {
  const nome = polygon.name || polygon.id;
  const segmentId = roadSegmentIdOf(polygon);
  const detalhe = segmentId ? roadSegmentTrafficDetail(state.traffic.bySegmentId.get(segmentId)) : null;
  const media = detalhe && detalhe.hasTraffic ? detalhe.geral.resumo.avgDailyFlow : null;
  if (media === null || media === undefined) return nome;
  return `${nome} — média ${formatNumber(Math.round(media))} veíc./dia`;
}

/** Destaca o trecho no mapa e abre o painel dele. */
function selectRoadSegment(polygon) {
  state.selectedRoadId = polygon.id;
  renderPolygons();
  openPolygonDetail(polygon);
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
    // O OBJECTID da feição na camada oficial. É o que permite abrir a linha exata no
    // FeatureServer do DER e conferir a geometria contra a que está na tela (R5.7) —
    // sem ele, "fonte oficial" é uma URL de camada com milhares de feições.
    ['OBJECTID na camada de origem', polygon.source_feature_id],
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

  // Procedência oficial em prosa, antes do bloco de fluxo (issue #134). A planilha diz
  // `geometry_status: "official"` e `source_system: "DER_DF"`; despejar as duas chaves cruas
  // em "Origem e qualidade" é verdade, mas não é leitura — e a pergunta que essa linha
  // responde ("de onde veio esse traço?") é a primeira que um eixo desenhado sobre um mapa
  // levanta. Só aparece quando os DOIS campos confirmam: a frase afirma oficialidade, e
  // afirmá-la sem o dado seria inventá-la.
  const oficial = buildOfficialGeometryNote(polygon);
  if (oficial) frag.append(oficial);

  // Fluxo diário do trecho (issue #131), vinculado ESTRITAMENTE por `road_segment_id`.
  if (isRoadSegmentPolygon(polygon)) appendRoadTrafficBlock(frag, polygon);

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

/**
 * Bloco de fluxo diário no painel de um trecho rodoviário (issue #131).
 *
 * O vínculo é por `road_segment_id` e SÓ por ele — `roadSegmentIdOf` lê
 * `properties_json.road_segment_id` e, na falta dele, `entity_id`. Nome de rodovia e
 * texto de descrição não entram em lugar nenhum desta cadeia: "DF-001" é o nome dos cinco
 * trechos do piloto, e casar por ele colaria o fluxo de um trecho no painel de outro, com
 * todos os números plausíveis e nenhum deles sobre o que a pessoa clicou.
 *
 * Nenhum número é recalculado: os totais diários, as classes e as bandeiras de qualidade
 * saem da planilha como estão. O que este bloco deriva é agregação declarada — soma,
 * média com `daysUsed`/`partialDaysUsed` à vista, e cobertura a partir de
 * `intervalos_15min_observados` (nunca de `cobertura_dia_pct`, R8.58).
 *
 * Tudo por `textContent` (R4.4).
 */
function appendRoadTrafficBlock(frag, polygon) {
  const segmentId = roadSegmentIdOf(polygon);
  const linked = segmentId ? state.traffic.bySegmentId.get(segmentId) : null;
  const detalhe = roadSegmentTrafficDetail(linked);

  const box = document.createElement('section');
  box.className = 'detail-traffic';

  const titulo = document.createElement('h3');
  titulo.className = 'detail-traffic-title';
  titulo.textContent = 'Fluxo diário (DER/DF)';
  box.append(titulo);

  // Sem trecho correspondente, ou com trecho sem nenhum dia medido, o bloco DIZ isso.
  // Sumir seria indistinguível de um trecho cujo fluxo ninguém carregou, e a diferença
  // entre "não medido" e "não carregado" é o que permite alguém ir conferir na planilha.
  if (!detalhe || !detalhe.hasTraffic) {
    const vazio = document.createElement('p');
    vazio.className = 'detail-traffic-empty';
    const aba = CONFIG.trafficDailySheet || 'TRAFFIC_DAILY_TEST';
    vazio.textContent = segmentId
      ? `Sem dias medidos em ${aba} para ${segmentId}.`
      : 'Trecho sem road_segment_id declarado — o fluxo não pode ser vinculado.';
    box.append(vazio);
    frag.append(box);
    return;
  }

  const janela = document.createElement('p');
  janela.className = 'detail-traffic-window';
  const inicio = detalhe.geral.resumo.windowStart;
  const fim = detalhe.geral.resumo.windowEnd;
  const periodo = inicio === fim
    ? `${formatNumber(detalhe.geral.days)} dia medido em ${formatDate(inicio)}`
    : `${formatNumber(detalhe.geral.days)} dias medidos de ${formatDate(inicio)} a ${formatDate(fim)}`;
  janela.textContent = `${periodo} · trecho ${detalhe.segmentId}`;
  box.append(janela);

  // Um recorte por sentido. "Crescente" e "decrescente" são medições diferentes da mesma
  // via (issue #62/#63) e nunca são somadas às cegas — por isso cada uma tem a própria
  // caixa, com os próprios totais e a própria cobertura.
  for (const corte of detalhe.porSentido) box.append(trafficCutNode(corte));

  frag.append(box);
}

/** Veículos, arredondados e com separador de milhar. */
function veiculos(n) {
  return `${formatNumber(Math.round(n))} veíc.`;
}

/** Um sentido (ou o trecho inteiro) no bloco de fluxo: totais, classes e cobertura. */
function trafficCutNode(corte) {
  const bloco = document.createElement('div');
  bloco.className = 'detail-traffic-cut';

  const nome = document.createElement('h4');
  nome.className = 'detail-traffic-cut-title';
  nome.textContent = `${corte.label} — ${formatNumber(corte.days)} dia(s)`;
  bloco.append(nome);

  const linhas = [];

  if (corte.total.total !== null) {
    linhas.push({
      label: 'Fluxo total do período',
      value: veiculos(corte.total.total),
      title: corte.total.daysExcluded > 0
        ? `Soma de ${corte.total.daysUsed} dia(s). ${corte.total.daysExcluded} dia(s) sem total medido ficaram DE FORA — não foram contados como zero.`
        : `Soma de ${corte.total.daysUsed} dia(s).`,
    });
  }
  if (corte.resumo.latestFlow !== null) {
    linhas.push({
      label: `Último dia (${formatDate(corte.resumo.latestDate)})`,
      value: `${veiculos(corte.resumo.latestFlow)}/dia`,
    });
  }
  if (corte.resumo.avgDailyFlow !== null) {
    linhas.push({
      label: 'Média diária',
      value: `${veiculos(corte.resumo.avgDailyFlow)}/dia`,
      // A ressalva do dia parcial acompanha o número, sempre. Um dia de 90/96 intervalos
      // tem total menor por ter sido medido menos tempo, não por ter tido menos tráfego,
      // e a média não compensa isso de propósito (issue #64).
      title: corte.resumo.partialDaysUsed > 0
        ? `Média sobre ${corte.resumo.daysUsed} dia(s), sendo ${corte.resumo.partialDaysUsed} parcial(is) — dia parcial puxa a média para baixo e o cálculo não compensa isso (issue #64).`
        : `Média sobre ${corte.resumo.daysUsed} dia(s) completo(s).`,
    });
  }

  const cob = corte.cobertura;
  const cobertura = [];
  if (cob.completos > 0) cobertura.push(`${formatNumber(cob.completos)} completo(s)`);
  if (cob.parciais > 0) cobertura.push(`${formatNumber(cob.parciais)} parcial(is)`);
  if (cob.desconhecidos > 0) cobertura.push(`${formatNumber(cob.desconhecidos)} sem cobertura conhecida`);
  if (cobertura.length > 0) {
    linhas.push({
      label: 'Cobertura dos dias',
      value: cobertura.join(', '),
      title: 'Derivada de intervalos_15min_observados / 96. A coluna cobertura_dia_pct da '
        + 'planilha não é lida: ela tem erro de separador decimal em parte dos registros.',
    });
  }

  if (corte.pico) {
    // O MAIOR pico de 15 min do período, com o dia — nunca uma soma nem uma média de
    // máximos, que produziria um número que nenhum quarto de hora registrou.
    const quando = corte.pico.interval
      ? `${formatDate(corte.pico.date)}, ${corte.pico.interval}`
      : formatDate(corte.pico.date);
    linhas.push({
      label: 'Maior pico de 15 min',
      value: `${veiculos(corte.pico.flow)} (${quando})`,
      title: 'Maior quarto de hora observado no período. Não é soma nem média: cada dia tem '
        + 'o seu pico, e este é o maior deles.',
    });
  }

  if (corte.qualityFlags.length > 0) {
    linhas.push({
      label: 'Qualidade',
      value: corte.qualityFlags.map((q) => `${q.flag} (${formatNumber(q.days)})`).join(', '),
    });
  }

  const lista = document.createElement('dl');
  lista.className = 'detail-list detail-traffic-list';
  for (const linha of linhas) addRow(lista, linha.label, linha.value, { title: linha.title || '' });
  bloco.append(lista);

  // Classes de veículo. Classe sem nenhum dia medido NÃO vira zero — ela some, porque
  // "zero caminhões" e "caminhão não medido" são afirmações diferentes (R5.7). Uma classe
  // medida em menos dias que o recorte carrega isso no `title`, para o total não parecer
  // comparável aos outros.
  const medidas = corte.classes.filter((c) => c.total !== null);
  if (medidas.length > 0) {
    const classes = document.createElement('dl');
    classes.className = 'detail-list detail-traffic-classes';
    for (const classe of medidas) {
      addRow(classes, classe.label, veiculos(classe.total), {
        title: classe.days === corte.days
          ? `Soma dos ${formatNumber(classe.days)} dia(s) do recorte.`
          : `Soma de ${formatNumber(classe.days)} de ${formatNumber(corte.days)} dia(s) — os demais não trazem esta classe.`,
      });
    }
    bloco.append(classes);
  }

  return bloco;
}

/**
 * Frase declarando que a geometria é oficial do DER/DF, ou `null` (issue #134).
 *
 * Exige `geometry_status: 'official'` E `source_system: 'DER_DF'`. Um dos dois sozinho não
 * basta: `official` sem o sistema não diz oficial de quem, e o sistema sem o status
 * descreveria como oficial uma linha que a própria planilha não marcou assim.
 */
function buildOfficialGeometryNote(polygon) {
  const props = (polygon && polygon.properties) || {};
  if (props.geometry_status !== 'official') return null;
  if (polygon.source_system !== 'DER_DF') return null;

  const p = document.createElement('p');
  p.className = 'detail-official';
  const camada = polygon.source_layer_name ? ` (camada ${polygon.source_layer_name})` : '';
  p.textContent = `Geometria oficial do DER/DF${camada}, sem simplificação nem buffer.`;
  return p;
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

/**
 * O disco colorido com o glifo do marcador (issues #112, #115) — o MESMO elemento serve
 * o ponto no mapa e a amostra da legenda, para os dois não terem como divergir. `name`
 * vem de `markerIcon`; `color` só existe para a âncora (`anchorColor`, resolvida pela
 * cadeia segmento → categoria → padrão) e entra inline como `--marker-cor`. Anúncio e
 * empreendimento não passam cor: a classe `.marker-icon-<kind>` pega o token
 * `--listing`/`--development` do CSS, que é onde a identidade dessas camadas mora.
 *
 * Montado nó a nó com `createElementNS`, nunca por `innerHTML`: os traços vêm de
 * `src/icons.js` e não da planilha, mas a regra R4.4 é sobre o mecanismo, não sobre a
 * origem do dado de hoje. O traço é branco por cima do disco.
 */
function markerIconElement(kind, name, color = null) {
  const nodes = ANCHOR_ICONS[name] || ANCHOR_ICONS[ANCHOR_FALLBACK_ICON];

  const el = document.createElement('span');
  el.className = `marker-icon marker-icon-${kind}`;
  el.dataset.icon = name;
  if (color) el.style.setProperty('--marker-cor', color);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5'); // um pouco mais grosso que o 2 do Lucide: o glifo tem 8–10px no mapa
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of nodes) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    svg.append(node);
  }
  el.append(svg);
  return el;
}

/**
 * Marcador de registro: `L.marker` com `divIcon` para as três entidades (issue #115
 * estendeu à casa e ao prédio o que a #112 fez com a âncora).
 *
 * `html` recebe o ELEMENTO — o Leaflet 1.9 faz `appendChild` nesse caso e `innerHTML`
 * quando é string (`DivIcon.createIcon`). `className` substitui o `leaflet-div-icon`
 * padrão, que traria fundo branco e borda cinza da folha do Leaflet; `marker-<kind>`
 * é o que o smoke test e o CSS usam para achar cada camada.
 *
 * Só a âncora vai para o pane próprio (ver `initMap`); anúncio e empreendimento ficam
 * no pane padrão de marcadores (600), acima dela e dos contornos.
 */
function iconMarker(record) {
  const size = MARKER_ICON_SIZE[record.kind] || 22;
  const half = size / 2;
  const icon = L.divIcon({
    html: markerIconElement(record.kind, markerIcon(record), anchorColor(record)),
    className: `marker marker-${record.kind}`,
    iconSize: [size, size],
    iconAnchor: [half, half],
    tooltipAnchor: [0, -half],
  });
  const options = { icon, keyboard: false };
  if (record.kind === 'anchor') options.pane = 'anchors';
  return L.marker([record.coord.lat, record.coord.lon], options);
}

/**
 * Amostras das linhas de "Camadas" (issue #115): o mesmo disco com glifo que o mapa
 * desenha, no lugar da bolinha colorida. A da âncora usa o pino genérico no verde
 * padrão, porque a linha fala da camada inteira; o segmento aparece na legenda abaixo.
 */
function renderLayerSamples() {
  const icons = { listing: markerIcon({ kind: 'listing' }), development: markerIcon({ kind: 'development' }), anchor: ANCHOR_FALLBACK_ICON };
  for (const placeholder of dom.layers.querySelectorAll('[data-marker-sample]')) {
    const kind = placeholder.dataset.markerSample;
    if (!icons[kind]) continue;
    const sample = markerIconElement(kind, icons[kind]);
    sample.classList.add('marker-icon-legend');
    placeholder.replaceWith(sample);
  }
}

/** Desenha os marcadores dos registros filtrados que têm coordenada. */
function renderMarkers(records) {
  markerLayer.clearLayers();
  state.markers.clear();

  for (const record of records) {
    if (!record.coord) continue; // sem coordenada o registro existe, mas não é mapeável

    const marker = iconMarker(record);

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

/** Lista plana de definições com a classe dada — o que `detailSection` põe dentro do `<details>`. */
function detailList(rows, className) {
  if (!rows || rows.length === 0) return null;
  const dl = document.createElement('dl');
  dl.className = `detail-list ${className}`;
  for (const row of rows) addRow(dl, row.label, row.value, row);
  return dl.childElementCount > 0 ? dl : null;
}

/**
 * Monta o painel em três níveis: essencial visível e o resto abaixo dele.
 *
 * O essencial é o contrato da issue #55 e tem checagem fixa no smoke: **cabe sem rolagem
 * em 390 px**. Sem essa trava o painel volta a crescer na próxima issue que precisar
 * mostrar mais um campo, que foi exatamente como ele chegou a ~30 linhas de peso visual
 * idêntico.
 *
 * `collapse` decide se os dois níveis seguintes ficam recolhidos num `<details>` ou em
 * lista plana (issue #104). O registro (anúncio, empreendimento, âncora) tem meia dúzia de
 * linhas complementares e vai plano, como o dono pediu; o contorno (RA, trecho rodoviário)
 * carrega até doze linhas de procedência e continua recolhido, senão o painel volta ao
 * estado de ~30 linhas que a #55 desfez.
 */
function appendTiers(frag, { essencial, complementar, tecnico }, { collapse = true } = {}) {
  const base = detailList(essencial, 'detail-essential');
  if (base) frag.append(base);

  const more = collapse
    ? detailSection('Mais informações', complementar, 'detail-more')
    : detailList(complementar, 'detail-more');
  if (more) frag.append(more);

  const tech = collapse
    ? detailSection('Origem e qualidade', tecnico, 'detail-provenance')
    : detailList(tecnico, 'detail-provenance');
  if (tech) frag.append(tech);
}

/**
 * Uma linha `dt`/`dd`. `className`/`title` são opcionais e vão só no `dd`: é o que permite à
 * linha de precisão espacial manter o gancho `.precision` que o smoke lê e carregar a frase
 * completa da R3.6 no `title` sem virar caixa de aviso.
 */
function addRow(dl, label, value, { className = '', title = '' } = {}) {
  if (value === null || value === undefined || value === '' || value === '—') return;
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  if (className) dd.className = className;
  if (title) dd.title = title;
  dl.append(dt, dd);
}

/**
 * Linha de precisão espacial do nível essencial.
 *
 * Obrigatória em todo detalhe: apresentar centroide de localidade como se fosse o
 * endereço do imóvel é desinformação, e no dataset atual os anúncios são exatamente
 * isso (R3.6). Desde a #104 ela é uma linha da lista — "Localização: Aproximada · centro
 * da localidade" — e não mais uma caixa de aviso: o dono pediu o painel limpo, e a regra
 * continua cumprida porque a linha diz "aproximada" à vista e carrega a frase completa
 * ("não o endereço exato") no `title`, junto do rótulo da precisão declarada na planilha.
 */
function precisionRow(record) {
  const approximate = isApproximateLocation(record);
  const precision = record.coordinate_precision || record.confidence_flag;
  const detalhe = precision ? formatSpatialPrecision(precision) : '';
  const frase = approximate
    ? 'O ponto no mapa representa a região, não o endereço exato do imóvel.'
    : 'A coordenada foi verificada na fonte indicada.';
  // O método só é afirmado quando a planilha o declara (`coordinate_precision`); sem ele,
  // "Aproximada" e nada mais — `isApproximateLocation()` também vale true para precisão
  // ausente/pendente/geocodificada, e dizer "centro da localidade" ali seria inventar
  // método (achado P1 do Codex na #109; R3.6).
  const metodo = approximate && record.coordinate_precision ? formatSpatialPrecision(record.coordinate_precision) : '';
  // Distância só se mede a partir de ponto exato (issue #124): a frase deixa isso dito
  // onde a precisão é declarada, para ninguém ler "aproximada" e pedir "a quantos metros".
  const distancia = canUseForDistance(record) ? '' : ' Distâncias a âncoras não são calculadas para este ponto.';
  return {
    label: 'Localização',
    value: approximate ? (metodo ? `Aproximada · ${metodo.charAt(0).toLowerCase()}${metodo.slice(1)}` : 'Aproximada') : 'Verificada na fonte',
    className: approximate ? 'precision' : 'precision precision-exact',
    title: (detalhe ? `${frase} ${detalhe}.` : frase) + distancia,
  };
}

/**
 * "Posição no recorte" (issue #124): o preço/m² do imóvel contra a distribuição dos
 * comparáveis que estão na tela — os registros do mesmo tipo que passaram no filtro,
 * sem ele próprio. Régua P25–P50–P75 e qualidade da amostra vêm de `src/map/comparables.js`;
 * aqui só se desenha. Amostra sem preço/m² diz isso em texto — nunca "0 comparáveis"
 * como se fosse um resultado (R5.7).
 */
function buildPositionBlock(record) {
  if (record.kind !== 'listing' && record.kind !== 'development') return null;
  const sample = comparableSample(state.visible, record);
  const stats = comparableStats(sample);

  const section = document.createElement('section');
  section.className = 'detail-position';
  section.setAttribute('aria-label', 'Posição no recorte');
  const title = document.createElement('h3');
  title.textContent = 'Posição no recorte';
  section.append(title);

  if (stats.withPriceM2 === 0) {
    const empty = document.createElement('p');
    empty.className = 'detail-position-empty';
    empty.textContent = sample.length === 0
      ? 'Sem comparáveis no recorte atual — amplie os filtros.'
      : `${formatNumber(sample.length)} registro(s) no recorte, nenhum com preço/m² para comparar.`;
    section.append(empty);
    return section;
  }

  const { deltaPct, sampleN } = positionVsMedian(record.price_m2, stats);
  const head = document.createElement('p');
  head.className = 'detail-position-head';
  const value = document.createElement('strong');
  value.className = 'detail-position-value';
  value.textContent = formatPriceM2(record.price_m2);
  head.append(value);
  const delta = document.createElement('span');
  delta.className = 'detail-position-delta';
  if (deltaPct === null) {
    delta.textContent = 'sem preço/m² para posicionar';
    delta.dataset.sign = 'none';
  } else {
    const sinal = deltaPct > 0 ? '+' : (deltaPct < 0 ? '−' : '');
    delta.textContent = `${sinal}${formatPercent(Math.abs(deltaPct) * 100)} vs. mediana`;
    delta.dataset.sign = deltaPct > 0 ? 'above' : (deltaPct < 0 ? 'below' : 'equal');
  }
  head.append(delta);
  section.append(head);

  // Régua P25 ── P50 ── P75, com o imóvel como ponto. Fração em `rulerPosition`: o SVG
  // só desenha. Sem cor literal: as classes vivem em assets/styles.css.
  const ruler = document.createElement('figure');
  ruler.className = 'detail-ruler';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 14');
  svg.setAttribute('class', 'detail-ruler-svg');
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', '6'); line.setAttribute('x2', '94'); line.setAttribute('y1', '7'); line.setAttribute('y2', '7');
  line.setAttribute('class', 'detail-ruler-line');
  svg.append(line);
  for (const x of [6, 50, 94]) {
    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tick.setAttribute('x1', String(x)); tick.setAttribute('x2', String(x)); tick.setAttribute('y1', '3'); tick.setAttribute('y2', '11');
    tick.setAttribute('class', 'detail-ruler-tick');
    svg.append(tick);
  }
  const pos = rulerPosition(record.price_m2, stats);
  if (pos !== null) {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', String(6 + 88 * pos)); dot.setAttribute('cy', '7'); dot.setAttribute('r', '3.2');
    dot.setAttribute('class', 'detail-ruler-dot');
    svg.append(dot);
  }
  ruler.append(svg);
  const labels = document.createElement('figcaption');
  labels.className = 'detail-ruler-labels';
  for (const [rotulo, v] of [['P25', stats.p25], ['P50', stats.median], ['P75', stats.p75]]) {
    const item = document.createElement('span');
    const k = document.createElement('small');
    k.textContent = rotulo;
    const n = document.createElement('b');
    n.textContent = formatNumber(Math.round(v));
    item.append(k, n);
    labels.append(item);
  }
  ruler.append(labels);
  section.append(ruler);

  const quality = document.createElement('ul');
  quality.className = 'detail-position-sample';
  for (const texto of [
    `${formatNumber(sample.length)} comparáveis`,
    `${formatNumber(sampleN)} com preço/m²`,
    `${formatNumber(stats.active)} ativos`,
    `${formatNumber(stats.recent)} recentes (${RECENT_DAYS} dias)`,
  ]) {
    const li = document.createElement('li');
    li.textContent = texto;
    quality.append(li);
  }
  section.append(quality);
  return section;
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
 * tamanho tem, onde fica; ganha peso pelo TAMANHO do valor. Os níveis seguintes vêm
 * abaixo, em lista plana e corpo menor (issue #104) — sem cabeçalho recolhível, porque
 * são meia dúzia de linhas e o dono quis o painel de leitura direta.
 *
 * As ressalvas — precisão espacial (linha "Localização"), procedência da regularização,
 * registro sem coordenada — continuam SEMPRE visíveis, nunca escondidas atrás de um clique.
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

  // A precisão espacial fecha o essencial de todo registro (R3.6), como linha, não como caixa.
  essencial.push(precisionRow(record));

  appendTiers(frag, { essencial, complementar, tecnico }, { collapse: false });

  const position = buildPositionBlock(record);
  if (position) frag.append(position);

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

/**
 * Recolhe/expande o trilho de navegação (issue #104). O estado é `data-rail` em `<html>` e
 * vive só nesta página — sem `localStorage`, por decisão do dono: a tela sempre abre
 * expandida. O Leaflet só ouve `resize` da janela, e o trilho encolhendo alarga `.map-wrap`
 * sem evento nenhum: sem o `invalidateSize()` o mapa fica com uma faixa sem tile à direita.
 */
function toggleRail() {
  const recolher = document.documentElement.dataset.rail !== 'collapsed';
  if (recolher) document.documentElement.dataset.rail = 'collapsed';
  else delete document.documentElement.dataset.rail;
  const rotulo = recolher ? 'Expandir menu' : 'Recolher menu';
  dom.railToggle.setAttribute('aria-expanded', String(!recolher));
  dom.railToggle.setAttribute('aria-label', rotulo);
  dom.railToggle.title = rotulo;
  dom.railToggle.querySelector('.rail-toggle-ic').textContent = recolher ? '›' : '‹';
  dom.railToggle.querySelector('.rail-toggle-tx').textContent = rotulo;
  if (map) map.invalidateSize();
}

/** Recolhe/expande o painel lateral do mapa (issue #104). Mesmo contrato de `toggleRail`. */
function togglePanel() {
  const recolher = dom.mapView.dataset.panel !== 'collapsed';
  if (recolher) dom.mapView.dataset.panel = 'collapsed';
  else delete dom.mapView.dataset.panel;
  const rotulo = recolher ? 'Expandir painel' : 'Recolher painel';
  dom.panelToggle.setAttribute('aria-expanded', String(!recolher));
  dom.panelToggle.setAttribute('aria-label', rotulo);
  dom.panelToggle.title = rotulo;
  dom.panelToggle.firstElementChild.textContent = recolher ? '›' : '‹';
  if (map) map.invalidateSize();
}

function closeDetail() {
  state.selectedId = null;
  // Destaque aceso com o painel fechado seria um trecho marcado sem nada explicando por quê.
  const tinhaDestaque = state.selectedRoadId !== null;
  state.selectedRoadId = null;
  dom.detail.hidden = true;
  if (tinhaDestaque) renderPolygons();
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
  updateMoreFiltersSummary();

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

/**
 * "+ Mais filtros" (issue #124): os filtros secundários vivem numa gaveta recolhida.
 * O resumo diz quantos estão ativos, e a gaveta ABRE sozinha quando algum está — um
 * filtro invisível reduzindo o mapa é a forma mais barata de "plausível e errado".
 */
function updateMoreFiltersSummary() {
  if (!dom.moreFilters || !dom.moreFiltersSummary) return;
  const ativos = [
    state.filters.buildingOrientation, state.filters.salesStage, state.filters.regularizationStatus,
    state.filters.anchorGroup, state.filters.anchorSegment,
  ].filter((v) => v !== '' && v !== null && v !== undefined).length;
  dom.moreFiltersSummary.textContent = ativos > 0 ? `Mais filtros (${ativos} ativo${ativos > 1 ? 's' : ''})` : 'Mais filtros';
  if (ativos > 0) dom.moreFilters.open = true;
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
  state.visible = visible;
  renderMarkers(visible);
  renderPolygons();
  renderKpis(computeKpis(visible));
  renderRaProfile();
  if (viewFromHash() === 'mapa') syncHash();

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

    // A amostra é o mesmo disco com glifo que o mapa desenha (issue #112): a linha da
    // legenda mostra exatamente o que a pessoa vai procurar no mapa, cor e forma.
    for (const entry of anchorLegendEntries(entries)) {
      const li = document.createElement('li');
      const sample = markerIconElement('anchor', entry.icon, entry.color);
      sample.classList.add('marker-icon-legend');
      li.append(sample, document.createTextNode(entry.label));
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

    // Os códigos do piloto, um por linha, com a cor do respectivo eixo (issue #134).
    const eixos = selectRoadSegmentPolygons(
      state.polygons.filter((p) => polygonLayerGroup(p) === group.key)
    );
    for (const no of roadSegmentLegendRows(eixos)) list.append(no);

    frag.append(list);
  }

  dom.polygonLayers.replaceChildren(frag);
}

/**
 * Uma linha de legenda por TRECHO, com o código e a cor do eixo (issue #134).
 *
 * A legenda de grupo diz "Trechos rodoviários piloto — 5", e cinco linhas de cores
 * diferentes no mapa não têm como ser lidas a partir disso: a cor identifica QUAL trecho é,
 * e sem a lista ela não identifica nada. Aqui cada código aparece com a sua cor.
 *
 * São BOTÕES, não caixas de seleção: o filtro da camada é por grupo e por tipo, e uma caixa
 * por trecho prometeria um liga/desliga individual que não existe. Clicar seleciona o
 * trecho — o mesmo efeito de clicar na linha no mapa.
 *
 * Ordena por código para a lista não trocar de ordem entre carregamentos.
 */
function roadSegmentLegendRows(eixos) {
  return [...eixos]
    .sort((a, b) => String(roadSegmentCodeOf(a) || a.id).localeCompare(String(roadSegmentCodeOf(b) || b.id)))
    .map((eixo) => {
      const li = document.createElement('li');
      li.className = 'polygon-type-row road-segment-row';

      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'road-segment-legend-item';
      if (state.selectedRoadId === eixo.id) botao.setAttribute('aria-current', 'true');
      botao.addEventListener('click', () => selectRoadSegment(eixo));

      // A amostra tem a FORMA do que o mapa desenha, mesma regra de `polygonLegendRow`:
      // traço para o eixo, quadrado vazado para o corredor com buffer da v2.2.1, que é
      // `road_segment` desenhado como ÁREA. Um traço ali descreveria errado.
      const linha = drawsAsLine(eixo);
      const estilo = polygonStyle(eixo);
      const dot = document.createElement('span');
      dot.className = linha ? 'dot dot-polygon-sample dot-road-sample' : 'dot dot-polygon-sample';
      if (linha) {
        dot.style.background = estilo.color;
      } else {
        dot.style.borderColor = estilo.color;
        dot.style.background = estilo.fillColor;
      }
      dot.style.opacity = '0.95';

      const texto = document.createElement('span');
      texto.className = 'polygon-legend-label';
      // O CÓDIGO do DER, não o nome: os cinco se chamam "DF-001 · trecho NNNN", e é o
      // código que alguém procura na planilha e no cadastro do DER.
      texto.textContent = roadSegmentCodeOf(eixo) || eixo.id;

      botao.append(dot, texto);
      li.append(botao);
      return li;
    });
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

  // A amostra tem a FORMA do que o mapa desenha: quadrado vazado para área, traço para
  // eixo rodoviário (issue #131). O quadrado pintava `fillColor` ignorando `fillOpacity`,
  // e num trecho (`fill_opacity: 0`) isso desenhava um quadrado sólido — a legenda
  // afirmaria uma área preenchida que o mapa não desenha, que é exatamente a divergência
  // legenda × mapa que a issue #52 proibiu.
  // Pela GEOMETRIA da amostra, não pelo tipo da entidade: um corredor rodoviário da
  // v2.2.1 é `road_segment` desenhado como ÁREA, e um traço na legenda o descreveria
  // errado — legenda que não bate com o mapa é pior que legenda nenhuma (issue #52).
  const linha = drawsAsLine(sample);
  const dot = document.createElement('span');
  dot.className = linha ? 'dot dot-polygon-sample dot-road-sample' : 'dot dot-polygon-sample';
  const style = polygonStyle(sample);
  // Estilo inline, como no mapa: a cor de um contorno é dado, não tema (R8.31, R8.45).
  if (linha) {
    dot.style.background = style.color;
  } else {
    dot.style.borderColor = style.color;
    dot.style.background = style.fillColor;
  }
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

/**
 * Painel de trechos rodoviários com tráfego (issue #63).
 *
 * Montado uma vez, no carregamento — como a legenda de contornos —, e não a cada
 * `render()`: os números vêm de `TRAFFIC_DAILY_TEST`, que os filtros do mapa não tocam.
 *
 * Some por completo quando não há nenhum trecho (ROAD_SEGMENTS ausente ou vazia), o
 * mesmo tratamento das outras abas opcionais (R2.5). Um trecho sem geometria sincronizada
 * aparece mesmo assim, com o motivo escrito — Recomendação 8 do backend proíbe desenhar
 * traço inventado no MAPA, mas isto aqui é uma tabela, não um traço.
 */
function renderTrafficPanel() {
  const rows = trafficPanelRows(state.traffic.bySegmentId);
  dom.trafficSection.hidden = rows.length === 0;
  if (rows.length === 0) {
    dom.trafficList.replaceChildren();
    return;
  }

  const frag = document.createDocumentFragment();
  for (const row of rows) frag.append(trafficItemNode(row));
  dom.trafficList.replaceChildren(frag);
}

/** Um sentido do trecho: rótulo, fluxo médio (com a ressalva de dias parciais) e o mais recente. */
function trafficDirectionRow(label, resumo) {
  const li = document.createElement('li');
  li.className = 'traffic-direction';

  const nome = document.createElement('span');
  nome.className = 'traffic-direction-label';
  nome.textContent = label;
  li.append(nome);

  if (resumo.avgDailyFlow === null) {
    const vazio = document.createElement('span');
    vazio.className = 'traffic-direction-empty';
    vazio.textContent = 'sem medição válida';
    li.append(vazio);
    return li;
  }

  const media = document.createElement('span');
  media.className = 'traffic-direction-value';
  media.textContent = `${formatNumber(Math.round(resumo.avgDailyFlow))} veíc./dia`;
  if (resumo.partialDaysUsed > 0) {
    media.title = `Média sobre ${resumo.daysUsed} dia(s), sendo ${resumo.partialDaysUsed} parcial(is) — `
      + 'dia parcial tem cobertura menor que 24h e a média não compensa isso (ver issue #64).';
  }
  li.append(media);
  return li;
}

/**
 * Um trecho no painel. Trecho com geometria vira botão que leva ao corredor no mapa
 * (issue #63); sem geometria, a linha explica que a sincronização do DER ainda não
 * rodou com sucesso para ele — nunca finge um link que não leva a lugar nenhum.
 */
function trafficItemNode(row) {
  const li = document.createElement('li');
  li.className = 'traffic-item';

  const head = document.createElement(row.hasGeometry ? 'button' : 'div');
  head.className = 'traffic-item-head';
  if (row.hasGeometry) {
    head.type = 'button';
    head.addEventListener('click', () => focusTrafficSegment(row));
  }

  const nome = document.createElement('span');
  nome.className = 'traffic-item-name';
  nome.textContent = row.name || row.roadCode || row.id;
  head.append(nome);

  if (row.jurisdiction) {
    const jurisdicao = document.createElement('span');
    jurisdicao.className = 'traffic-item-jurisdiction';
    jurisdicao.textContent = row.jurisdiction;
    head.append(jurisdicao);
  }
  li.append(head);

  if (!row.hasGeometry) {
    const pendente = document.createElement('p');
    pendente.className = 'traffic-item-pending';
    pendente.textContent = 'Geometria pendente — a sincronização de trechos rodoviários '
      + 'do DER ainda não rodou com sucesso para este trecho.';
    li.append(pendente);
  }

  const stats = document.createElement('ul');
  stats.className = 'traffic-stats';
  if (row.porSentido.crescente) stats.append(trafficDirectionRow('Crescente', row.porSentido.crescente));
  if (row.porSentido.decrescente) stats.append(trafficDirectionRow('Decrescente', row.porSentido.decrescente));
  if (stats.children.length === 0) {
    const vazio = document.createElement('li');
    vazio.className = 'traffic-direction-empty';
    vazio.textContent = 'Sem dias medidos.';
    stats.append(vazio);
  }
  li.append(stats);

  // A janela de datas é do trecho inteiro (os dois sentidos cobrem o mesmo período no
  // piloto); o fluxo em si nunca vem daqui — isso é decisão por sentido, acima.
  if (row.geral.windowStart) {
    const janela = document.createElement('p');
    janela.className = 'traffic-item-window';
    janela.textContent = row.geral.windowStart === row.geral.windowEnd
      ? `Medido em ${formatDate(row.geral.windowStart)}`
      : `Medido de ${formatDate(row.geral.windowStart)} a ${formatDate(row.geral.windowEnd)}`;
    li.append(janela);
  }

  return li;
}

/** Leva o mapa até o corredor do trecho e abre o mesmo painel de detalhe de um clique nele. */
function focusTrafficSegment(row) {
  const polygon = state.polygons.find((p) => p.id === row.polygonId);
  if (!polygon) return;

  setView('mapa');

  let geometry = null;
  try {
    geometry = JSON.parse(polygon.geometry_geojson);
  } catch (error) {
    geometry = null;
  }
  if (geometry && map) {
    try {
      map.fitBounds(L.geoJSON(geometry).getBounds(), { padding: [40, 40] });
    } catch (error) {
      // coordenada fora de faixa: mesmo tratamento silencioso de renderPolygons — o
      // detalhe abre igual, só sem o mapa se mover.
    }
  }

  openPolygonDetail(polygon);
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
 * Como `populateSelect`, mas sem opção fixa a preservar — para seletores de escolha
 * única (RA do ranking/drill-down, indicador a adicionar) que não têm um "Todas" (issue
 * #102). `populateSelect` chamado num `<select>` vazio deixaria `null` como o primeiro
 * filho a "preservar", o que o DOM converteria na string literal "null".
 */
function populateSelectFull(select, values, formatter = (v) => v) {
  select.replaceChildren(...values.map((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = formatter(value);
    return option;
  }));
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

/**
 * Rótulo da origem dos dados. Modo demo precisa ser óbvio na tela (R2.3).
 *
 * Quando a origem é a planilha, o selo vira LINK para ela (issue #90) — conferir a fonte é
 * o ponto de um projeto de dado público. Quem decide se há link é `datasetSourceLink`, que
 * é pura e testada: `demo` e `appsscript` não linkam, porque apontar para a planilha ali
 * seria a tela afirmando uma procedência que aquele dado não tem.
 */
function showSourceBadge(source) {
  const { label, href } = datasetSourceLink(source, window.APP_CONFIG || {});
  dom.sourceBadge.dataset.source = source;
  dom.sourceBadge.hidden = false;

  if (!href) {
    dom.sourceBadge.replaceChildren(document.createTextNode(label));
    return;
  }

  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;
  link.title = 'Abrir a planilha de origem numa aba nova';
  dom.sourceBadge.replaceChildren(link);
}

// --- Carregamento ---------------------------------------------------------

// --- View interna do Mercado Residencial DF (issue #58) ----------------------------

const VIEWS = ['mapa', 'mercado', 'diagnostico', 'ranking', 'comparar', 'base'];

/** A view pedida pelo hash. Hash desconhecido cai no mapa, sem erro. */
function viewFromHash() {
  const { view } = parseHash(location.hash || '');
  return VIEWS.includes(view) ? view : 'mapa';
}

/**
 * Estado compartilhável de cada view (issue #127): só o que difere do padrão entra na
 * URL, para `#mapa` sem filtro continuar sendo `#mapa`. O vocabulário fechado de chaves
 * mora em src/url-state.js.
 */
function currentUrlParams(view) {
  if (view === 'mapa') {
    const f = state.filters;
    return {
      ra: f.ra, type: f.propertyType, beds: f.bedrooms === null ? '' : String(f.bedrooms),
      price_min: f.priceMin === null ? '' : String(f.priceMin),
      price_max: f.priceMax === null ? '' : String(f.priceMax),
      locality: f.locality, q: f.search,
    };
  }
  if (view === 'mercado') {
    const sel = state.marketSelection;
    const padrao = state.ivvMonthly.length ? defaultPeriodSelection(state.ivvMonthly) : null;
    const params = {};
    if (sel && padrao) {
      if (sel.mode !== padrao.mode) params.periodo = sel.mode;
      if (sel.mode === PERIOD_MODES.CUSTOM) { params.de = sel.start || ''; params.ate = sel.end || ''; }
      else if (sel.year !== padrao.year || sel.month !== padrao.month) {
        params.ano = sel.year ? String(sel.year) : '';
        params.mes = sel.month ? String(sel.month) : '';
      }
    }
    if (state.marketSeriesMode && sel && state.marketSeriesMode !== modoPadraoDaSerie(sel)) params.serie = state.marketSeriesMode;
    if (state.marketCompare && state.marketCompare !== COMPARE_MODES.NENHUM) params.compare = state.marketCompare;
    if (state.marketRegionBucket && state.marketRegionBucket !== FAIXA_TOTAL) params.faixa = state.marketRegionBucket;
    if (state.marketRegionScatterMode && state.marketRegionScatterMode !== REGION_SCATTER_MODES[0].value) params.regiao_modo = state.marketRegionScatterMode;
    return params;
  }
  if (view === 'diagnostico') {
    const f = state.pdadFilters;
    if (!f) return {};
    const anos = pdadYearsAvailable(state.pdadData);
    return {
      ra: f.ra && f.ra !== 'all' ? f.ra : '',
      ano: f.year && f.year !== anos[0] ? String(f.year) : '',
      tema: f.tema && f.tema !== 'all' ? f.tema : '',
    };
  }
  if (view === 'ranking') {
    // O Ranking lê `state.pdadRankState`, não `state.pdadFilters`: o link tem de refletir
    // o estado que a tela de fato renderiza (revisão da #129). Ano não entra — o ranking
    // é sempre sobre o ano mais recente publicado.
    const r = state.pdadRankState;
    return { ra: r && r.ra ? r.ra : '' };
  }
  return {};
}

/** Reescreve o hash com o estado da view corrente, sem disparar `hashchange`. */
function syncHash() {
  const view = viewFromHash();
  const alvo = buildHash(view, currentUrlParams(view));
  if (location.hash === alvo) return;
  // O WebKit limita `replaceState` a 100 chamadas por 30 s e lança SecurityError depois
  // disso; a URL é conveniência, e um erro dela não pode derrubar o render.
  try { history.replaceState(null, '', alvo); } catch { /* fica com o hash anterior */ }
}

/**
 * Lê os parâmetros da URL na abertura e os aplica ao mapa; Mercado e Diagnóstico os
 * consomem ao montar os próprios filtros (`initializeMarketFilters`, `initializePdadFilters`).
 */
function applyUrlParams() {
  const { view, params } = parseHash(location.hash || '');
  state.pendingUrl = { view, params };
  if (view !== 'mapa') return;
  const setIfOption = (select, value) => {
    if (!value) return;
    if ([...select.options].some((o) => o.value === value)) select.value = value;
  };
  setIfOption(dom.locality, params.locality);
  setIfOption(dom.raFilter, params.ra);
  setIfOption(dom.ptype, params.type);
  setIfOption(dom.beds, params.beds);
  if (intParam(params.price_min) !== null) dom.priceMin.value = String(intParam(params.price_min));
  if (intParam(params.price_max) !== null) dom.priceMax.value = String(intParam(params.price_max));
  if (params.q) dom.search.value = params.q;
}

async function copyAnalysisLink() {
  const url = location.href;
  const original = 'Copiar link desta análise';
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      ok = true;
    }
  } catch { ok = false; }
  if (!ok) {
    // Sem clipboard (http, permissão negada): mostra a URL para copiar à mão.
    window.prompt('Copie o link desta análise:', url);
  }
  dom.copyLink.textContent = ok ? 'Link copiado' : original;
  if (ok) setTimeout(() => { dom.copyLink.textContent = original; }, 2000);
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
  // As 4 telas do PDAD-A (issue #102) compartilham o mesmo dado carregado — sem ele,
  // nenhuma das quatro tem o que mostrar.
  const temDiagnostico = state.pdadData.length > 0;
  const PDAD_VIEWS = new Set(['diagnostico', 'ranking', 'comparar', 'base']);
  let view = 'mapa';
  if (name === 'mercado' && temMercado) view = 'mercado';
  else if (PDAD_VIEWS.has(name) && temDiagnostico) view = name;

  dom.mapView.hidden = view !== 'mapa';
  dom.marketView.hidden = view !== 'mercado';
  dom.pdadView.hidden = view !== 'diagnostico';
  dom.pdadRankingView.hidden = view !== 'ranking';
  dom.pdadCompareView.hidden = view !== 'comparar';
  dom.pdadBaseView.hidden = view !== 'base';

  for (const tab of dom.viewSwitch.querySelectorAll('.view-tab')) {
    tab.setAttribute('aria-pressed', String(tab.dataset.view === view));
  }

  if (view === 'mapa' && map) map.invalidateSize();
  if (view === 'ranking') renderPdadRankingView();
  if (view === 'comparar') renderPdadCompareView();
  if (view === 'base') renderPdadBaseView();

  const alvo = buildHash(view, currentUrlParams(view));
  if (location.hash !== alvo) {
    try { history.replaceState(null, '', alvo); } catch { /* idem syncHash */ }
  }
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
  // Faixa compacta de derivados (issue #125), abaixo dos destaques: razões entre o que o
  // motor já agregou — nunca mais uma linha de seis cards grandes.
  dom.marketMicroKpis.replaceChildren(...buildMicroKpis(aggregated, months).map(marketMicroKpi));
  return { warnings: aggregated.warnings, mesReferencia, sparks };
}

/**
 * Um micro-indicador: rótulo, valor (ou a frase de ausência) e a fórmula no `title` — a
 * metodologia fica a um hover de distância, no mesmo elemento que mostra o número.
 */
function marketMicroKpi(item) {
  const node = document.createElement('div');
  node.className = 'market-micro';
  node.dataset.derivado = item.key;
  node.title = item.formula;

  const label = document.createElement('span');
  label.className = 'market-micro-label';
  label.textContent = item.label;
  node.append(label);

  const value = document.createElement('span');
  value.className = item.value === null ? 'market-micro-value market-micro-absent' : 'market-micro-value';
  value.textContent = item.value === null ? 'não publicado' : item.value;
  if (item.value === null) value.title = item.absent;
  node.append(value);
  return node;
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
  const pendente = state.pendingUrl && state.pendingUrl.view === 'mercado' ? state.pendingUrl.params : null;
  if (pendente) {
    if (Object.values(PERIOD_MODES).includes(pendente.periodo)) state.marketSelection.mode = pendente.periodo;
    if (intParam(pendente.ano) !== null) state.marketSelection.year = intParam(pendente.ano);
    if (intParam(pendente.mes) !== null) state.marketSelection.month = intParam(pendente.mes);
    if (pendente.de) state.marketSelection.start = pendente.de;
    if (pendente.ate) state.marketSelection.end = pendente.ate;
    if (Object.values(SERIES_MODES).includes(pendente.serie)) state.marketSeriesMode = pendente.serie;
    if (Object.values(COMPARE_MODES).includes(pendente.compare)) state.marketCompare = pendente.compare;
    if (pendente.faixa) state.marketRegionBucket = pendente.faixa;
    if (REGION_SCATTER_MODES.some((m) => m.value === pendente.regiao_modo)) state.marketRegionScatterMode = pendente.regiao_modo;
  }
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

/**
 * Período do FipeZap: só os três modos que fazem sentido numa série de década — "1 mês" ou
 * "12 meses" são conceitos do card do IVV, não de um gráfico de preço de longo prazo.
 * "Desde o início" É o preset "tudo" (`PERIOD_MODES.ALL`): preço não é grandeza que se
 * acumula mês a mês, então não existe curva acumulada honesta para esta série — o pedido
 * "acumulado desde o início" virou "mostra a série inteira, sem corte".
 */
const FIPEZAP_PERIOD_MODE_OPTIONS = Object.freeze([
  { value: PERIOD_MODES.YEAR, chip: 'Ano fechado', label: 'Ano completo' },
  { value: PERIOD_MODES.ALL, chip: 'Desde o início', label: 'Toda a série publicada' },
  { value: PERIOD_MODES.CUSTOM, chip: 'Personalizado', label: 'Intervalo personalizado' },
]);

/** Mesmos padrões de `defaultPeriodSelection`, com o modo padrão trocado para "tudo". */
function defaultFipezapSelection(indice) {
  return { ...defaultPeriodSelection(indice), mode: PERIOD_MODES.ALL };
}

/** Mesmo papel de `syncMarketFilterState`, para o filtro de período do FipeZap. */
function syncFipezapFilterState() {
  const mode = state.fipezapSelection.mode;
  for (const chip of dom.fipezapPeriodChips.querySelectorAll('.market-chip')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.mode === mode));
  }
  const campos = [
    ['ano', [dom.fipezapYear]],
    ['intervalo', [dom.fipezapStart, dom.fipezapEnd]],
  ];
  for (const [controle, alvos] of campos) {
    const motivo = controlDisabledReason(mode, controle);
    for (const alvo of alvos) {
      alvo.disabled = motivo !== null;
      alvo.title = motivo || '';
    }
  }
}

function initializeFipezapFilters() {
  const indice = fipezapMonthlyIndex(state.fipezapMonthly);
  state.fipezapSelection = defaultFipezapSelection(indice);
  dom.fipezapPeriodChips.replaceChildren(...FIPEZAP_PERIOD_MODE_OPTIONS.map(periodChip));

  const years = availableYears(indice);
  dom.fipezapYear.replaceChildren(...years.map((year) => option(year, String(year))));
  dom.fipezapYear.value = String(state.fipezapSelection.year || '');

  const first = indice[0]?.reference_date?.slice(0, 7) || '';
  const last = indice.at(-1)?.reference_date?.slice(0, 7) || '';
  for (const input of [dom.fipezapStart, dom.fipezapEnd]) {
    input.min = first;
    input.max = last;
  }
  dom.fipezapStart.value = state.fipezapSelection.start || first;
  dom.fipezapEnd.value = state.fipezapSelection.end || last;
  syncFipezapFilterState();
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A dimensão do gráfico vira o prefixo da classe que carrega a cor — a única tradução de
 * significado para aparência no caminho inteiro, e ela mora aqui porque aqui é a camada de
 * DOM. `serie-N` puxa a paleta categórica (`--cat-N`); `ano-N` puxa a rampa ordinal
 * (`--ano-N`). Nenhum desses nomes aparece nos módulos puros: eles dizem
 * `dimensao: 'ordinal'` e param aí (R8.71).
 *
 * O DEFAULT ESTÁ NO VALOR, não na chave, e isso não é estilo. `PREFIXO[m.dimensao ?? 'x']`
 * devolveria `undefined` para qualquer valor fora do mapa — um typo, ou um renomeio que
 * esquecesse este arquivo —, a classe sairia `undefined-3`, nenhuma regra casaria,
 * `--serie-cor` ficaria indefinido e a série sumiria da tela SEM ERRO NENHUM. É exatamente
 * o modo de falha que esta correção existe para consertar; reintroduzi-lo no conserto seria
 * irônico e caro. Com `?? 'serie'` depois da busca, valor desconhecido cai no categórico,
 * que é feio mas visível.
 */
const PREFIXO_DA_DIMENSAO = Object.freeze({
  [DIMENSOES.CATEGORICA]: 'serie',
  [DIMENSOES.ORDINAL]: 'ano',
});

/**
 * A classe de cor de uma série.
 *
 * Função, e não template repetido, porque são CINCO os lugares que pintam a mesma série:
 * grupo, rótulo do último ponto, quadradinho da legenda, ponto em foco e chave do balão.
 * Cinco cópias do mesmo literal é o arranjo em que alguém conserta quatro e esquece o
 * quinto — e o quinto passa a divergir dos outros sem que nada acuse.
 */
function classeDaSerie(model, serie) {
  return `${PREFIXO_DA_DIMENSAO[model.dimensao] ?? 'serie'}-${serie.cat}`;
}

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
    const comparada = typeof serie.chave === 'string' && serie.chave.endsWith(COMPARE_SUFFIX);
    const grupo = svgNode('g', { class: `market-serie ${classeDaSerie(model, serie)}${comparada ? ' market-serie-comparacao' : ''}` });
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
        class: `chart-rotulo-final ${classeDaSerie(model, serie)}`,
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
    cor.className = `market-legenda-cor market-legenda-${forma} ${classeDaSerie(model, serie)}`;
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
    const foco = svgNode('circle', { class: `chart-foco ${classeDaSerie(model, serie)}`, r: 4.5, cx: 0, cy: 0 });
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
    chave.className = `market-tooltip-chave ${classeDaSerie(model, serie)}`;
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

  renderMarketRegioesScatter(linhas, faixa);
}

/**
 * Matriz preço × liquidez (issue #127): um ponto por RA, `DF Total` como referência
 * tracejada, três modos de leitura. Tooltip com RA, IVV, preço de venda, preço pedido,
 * oferta, vendas e gap — números, sem interpretação automática.
 */
function renderMarketRegioesScatter(linhas, faixa) {
  if (!dom.marketRegioesScatter) return;
  if (dom.marketRegioesModo.childElementCount === 0) {
    dom.marketRegioesModo.replaceChildren(...REGION_SCATTER_MODES.map((item) => {
      const botao = periodChip(item);
      botao.dataset.scatterModo = item.value;
      delete botao.dataset.mode;
      return botao;
    }));
  }
  const modo = REGION_SCATTER_MODES.some((m) => m.value === state.marketRegionScatterMode)
    ? state.marketRegionScatterMode : REGION_SCATTER_MODES[0].value;
  state.marketRegionScatterMode = modo;
  for (const chip of dom.marketRegioesModo.querySelectorAll('.market-chip')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.scatterModo === modo));
  }

  const scatter = buildRegionScatter(linhas, { bucket: faixa, mode: modo });
  const wrap = document.createElement('div');
  wrap.className = 'market-scatter';
  if (scatter.pontos.length === 0) {
    const p = document.createElement('p');
    p.className = 'market-card-absent';
    p.textContent = 'Sem RA com os dois eixos publicados nesta faixa.';
    wrap.append(p);
  } else {
    const W = 600; const H = 320; const L = 56; const R = 16; const T = 16; const B = 44;
    const { xMin, xMax, yMin, yMax } = scatter.dominio;
    const xSpan = xMax - xMin || 1; const ySpan = yMax - yMin || 1;
    const px = (x) => L + ((x - xMin) / xSpan) * (W - L - R);
    const py = (y) => T + (1 - (y - yMin) / ySpan) * (H - T - B);
    const svg = svgNode('svg', { viewBox: `0 0 ${W} ${H}`, class: 'market-chart-svg market-scatter-svg', role: 'img' });
    svg.setAttribute('aria-label', `${scatter.xLabel} × ${scatter.yLabel}, ${scatter.pontos.length} RAs.`);
    svg.append(svgNode('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, class: 'chart-axis-line' }));
    svg.append(svgNode('line', { x1: L, x2: L, y1: T, y2: H - B, class: 'chart-axis-line' }));
    const fx = (v) => (v >= 1000 ? compactNumber(v) : formatNumber(Math.round(v)));
    for (const [v, x] of [[xMin, L], [xMax, W - R]]) {
      const t = svgNode('text', { x, y: H - B + 16, class: 'chart-axis-month', 'text-anchor': x === L ? 'start' : 'end' });
      t.textContent = fx(v);
      svg.append(t);
    }
    for (const [v, y] of [[yMin, H - B], [yMax, T + 4]]) {
      const t = svgNode('text', { x: L - 6, y, class: 'chart-axis-value' });
      t.textContent = formatNumber(Math.round(v * 10) / 10);
      svg.append(t);
    }
    const xl = svgNode('text', { x: (L + W - R) / 2, y: H - 6, class: 'chart-axis-month', 'text-anchor': 'middle' });
    xl.textContent = scatter.xLabel;
    svg.append(xl);
    const yl = svgNode('text', { x: 12, y: (T + H - B) / 2, class: 'chart-axis-value', transform: `rotate(-90 12 ${(T + H - B) / 2})`, 'text-anchor': 'middle' });
    yl.textContent = scatter.yLabel;
    svg.append(yl);
    if (scatter.referencia) {
      const rx = px(Math.min(Math.max(scatter.referencia.x, xMin), xMax));
      const ry = py(Math.min(Math.max(scatter.referencia.y, yMin), yMax));
      svg.append(svgNode('line', { x1: L, x2: W - R, y1: ry, y2: ry, class: 'chart-guia market-scatter-referencia' }));
      svg.append(svgNode('line', { x1: rx, x2: rx, y1: T, y2: H - B, class: 'chart-guia market-scatter-referencia' }));
      const rt = svgNode('text', { x: W - R, y: ry - 4, class: 'chart-axis-value', 'text-anchor': 'end' });
      rt.textContent = `${REGIAO_TOTAL}`;
      svg.append(rt);
    }
    const grupo = svgNode('g', { class: 'market-serie serie-1' });
    for (const p of scatter.pontos) {
      const dot = svgNode('circle', { cx: px(p.x), cy: py(p.y), r: 5, class: 'market-serie-marcador market-scatter-ponto' });
      dot.append(tituloSvg([
        p.region,
        `IVV: ${p.ivvPct === null ? 'não publicado' : formatPercent(percentFromPoints(p.ivvPct))}`,
        `Preço de venda: ${p.salePriceM2 === null ? 'não publicado' : formatPriceM2(p.salePriceM2)}`,
        `Preço pedido: ${p.offerPriceM2 === null ? 'não publicado' : formatPriceM2(p.offerPriceM2)}`,
        `Oferta: ${p.offeredUnits === null ? 'não publicada' : formatNumber(p.offeredUnits)} un.`,
        `Vendas: ${p.soldUnits === null ? 'não publicadas' : formatNumber(p.soldUnits)} un.`,
        `Gap pedido/venda: ${p.gapPct === null ? 'não calculável' : formatPercent(p.gapPct)}`,
      ].join('\n')));
      grupo.append(dot);
      const label = svgNode('text', { x: px(p.x) + 7, y: py(p.y) + 3.5, class: 'chart-axis-value market-scatter-rotulo', 'text-anchor': 'start' });
      label.textContent = p.region;
      grupo.append(label);
    }
    svg.append(grupo);
    wrap.append(svg);
  }
  const nota = document.createElement('p');
  nota.className = 'market-regioes-ausentes';
  nota.textContent = scatter.semValor.length > 0
    ? `Fora da matriz por falta de um dos eixos: ${scatter.semValor.join(', ')}.`
    : '';
  wrap.append(nota);
  dom.marketRegioesScatter.replaceChildren(wrap);
}

/**
 * Preços FipeZap — Distrito Federal: os oito gráficos de `src/fipezap/history.js`,
 * dentro da janela do período próprio desta seção (não o do IVV, acima — ver comentário em
 * `index.html`). Residencial e comercial saem em DUAS grades separadas — você pediu para
 * nunca misturar os dois temas na tela, e uma grade só faria alguém precisar ler cada
 * título para separar o que é residencial do que é comercial. Devolve os cards para
 * `desenharGraficos`/`cardsNaTela`, mesmo protocolo dos cards do IVV.
 */
function renderFipezapDF() {
  const disponivel = state.fipezapMonthly.length > 0;
  dom.fipezapSection.hidden = !disponivel;
  if (!disponivel) return [];

  if (!state.fipezapSelection) initializeFipezapFilters();
  const indice = fipezapMonthlyIndex(state.fipezapMonthly);
  const selected = selectIvvPeriod(indice, state.fipezapSelection);
  const resumo = periodSummary(selected);
  dom.fipezapPeriodLabel.textContent = resumo.meses > 0
    ? `Preços de ${resumo.intervalo} · ${resumo.meses} ${resumo.meses === 1 ? 'mês' : 'meses'}`
    : resumo.intervalo;
  dom.fipezapHistoryNote.textContent =
    'Preço de venda e locação por m² publicados pelo FipeZap para o Distrito Federal.';
  syncFipezapFilterState();

  const janela = fipezapRowsInRange(state.fipezapMonthly, selected.start, selected.end);
  const cards = buildFipezapHistoryCharts(janela).map(marketChart);
  const residencial = cards.filter((card) => card.model.segmento === 'RESIDENCIAL');
  const comercial = cards.filter((card) => card.model.segmento === 'COMERCIAL');
  dom.fipezapChartsResidencial.replaceChildren(...residencial.map((item) => item.article));
  dom.fipezapChartsComercial.replaceChildren(...comercial.map((item) => item.article));
  return cards;
}

/**
 * Opções do seletor de localidade, agrupadas por RA quando `raName` sozinho não
 * identifica a linha (issue pendente de registro — várias localidades do FipeZap caem
 * na mesma RA, ex. Asa Sul e Asa Norte são as duas "Plano Piloto"). `localidades` já vem
 * ordenada por RA e depois por nome, então grupos consecutivos ficam juntos numa
 * passada só. Localidade sem ambiguidade fica solta, fora de `<optgroup>` — dezoito
 * grupos de um item só seriam ruído visual maior que o problema que resolvem.
 */
function localityOptionNodes(localidades) {
  const nodes = [];
  let grupoAtual = null;
  let raAtual = null;
  for (const item of localidades) {
    if (!item.ambiguous) {
      grupoAtual = null;
      raAtual = null;
      nodes.push(option(item.locality, item.raName));
      continue;
    }
    if (raAtual !== item.raName) {
      grupoAtual = document.createElement('optgroup');
      grupoAtual.label = item.raName;
      nodes.push(grupoAtual);
      raAtual = item.raName;
    }
    grupoAtual.append(option(item.locality, item.displayName));
  }
  return nodes;
}

/**
 * Preço FipeZap por Região Administrativa: dois gráficos (venda, locação) da localidade
 * escolhida — comparar é trocar o seletor (você escolheu esse modelo em vez de sobrepor
 * várias RAs no mesmo gráfico). Venda e locação não dividem um gráfico só: são ordens de
 * grandeza diferentes (R$/m² × R$/m²/mês) — ver `buildLocalityCharts`.
 */
function renderFipezapLocalidade() {
  const disponivel = state.fipezapLocality.length > 0;
  dom.fipezapRaSection.hidden = !disponivel;
  if (!disponivel) return [];

  if (dom.fipezapSegment.childElementCount === 0) {
    dom.fipezapSegment.replaceChildren(...FIPEZAP_SEGMENTS.map((item) => {
      const botao = periodChip({ value: item.value, chip: item.label, label: item.label });
      botao.dataset.segmento = item.value;
      delete botao.dataset.mode;
      return botao;
    }));
  }
  const segmento = FIPEZAP_SEGMENTS.some((item) => item.value === state.fipezapLocalitySegment)
    ? state.fipezapLocalitySegment : FIPEZAP_SEGMENTS[0].value;
  state.fipezapLocalitySegment = segmento;
  for (const chip of dom.fipezapSegment.querySelectorAll('.market-chip')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.segmento === segmento));
  }

  const localidades = localitiesAvailable(state.fipezapLocality, segmento, state.fipezapLocalityMap);
  dom.fipezapLocality.replaceChildren(...localityOptionNodes(localidades));
  const escolha = localidades.some((item) => item.locality === state.fipezapLocalityChoice)
    ? state.fipezapLocalityChoice : (localidades[0]?.locality || null);
  state.fipezapLocalityChoice = escolha;
  dom.fipezapLocality.value = escolha || '';

  dom.fipezapRaNote.textContent = escolha
    ? 'Série completa publicada para a localidade escolhida — sem corte de período.'
    : 'Nenhuma localidade publicada para este segmento ainda.';

  if (!escolha) {
    dom.fipezapLocalityChart.replaceChildren();
    return [];
  }
  const cards = buildLocalityCharts(state.fipezapLocality, { locality: escolha, segmentScope: segmento })
    .map(marketChart);
  dom.fipezapLocalityChart.replaceChildren(...cards.map((item) => item.article));
  return cards;
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
    ? `Acumulado desde o início do período mostrado, mês a mês, em ${recorte}.`
    : `Valores de cada mês em ${recorte}.`;

  renderMarketRegioes();

  // Comparação temporal (issue #127): o recorte comparado vem da janela que os gráficos
  // desenham, e a série entra tracejada NO MESMO eixo — nunca num segundo eixo Y.
  const compare = Object.values(COMPARE_MODES).includes(state.marketCompare) ? state.marketCompare : COMPARE_MODES.NENHUM;
  state.marketCompare = compare;
  sincronizarComparacao(compare);
  const mesesJanela = historyMonths(janela);
  const comparacao = comparisonRows(state.ivvMonthly, { start: mesesJanela[0], end: mesesJanela.at(-1) }, compare);

  const graficos = [
    ...buildHistoryCharts(fontes, modo, { comparacao }),
    buildSeasonality(state.ivvMonthly, { modo }),
  ];
  const cards = graficos.map(marketChart);
  dom.marketCharts.replaceChildren(...cards.map((item) => item.article));

  // Preço FipeZap (DF e por Região Administrativa) — outro dataset, outro filtro de
  // período, mesma tela: as duas seções entram na MESMA lista de cards que o observador de
  // largura redesenha, sem duplicar a lógica de "meça e desenhe" (issue #85).
  const fipezapCards = renderFipezapDF();
  const fipezapLocalidadeCards = renderFipezapLocalidade();

  // Inserido primeiro, medido depois, desenhado por último. Guardar o que está na tela é o
  // que permite redesenhar só os SVGs quando a janela muda de largura, sem refazer a
  // agregação inteira.
  cardsNaTela = [...cards, ...sparks, ...fipezapCards, ...fipezapLocalidadeCards];
  desenharGraficos(cardsNaTela);
  if (viewFromHash() === 'mercado') syncHash();
  return warnings.map((item) => `Mercado (${item.metric || 'período'}): ${item.message}`);
}

function sincronizarComparacao(compare) {
  if (!dom.marketCompare) return;
  if (dom.marketCompare.childElementCount === 0) {
    dom.marketCompare.replaceChildren(...COMPARE_MODE_OPTIONS.map((item) => {
      const botao = periodChip(item);
      botao.dataset.compare = item.value;
      delete botao.dataset.mode;
      return botao;
    }));
  }
  for (const chip of dom.marketCompare.querySelectorAll('.market-chip')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.compare === compare));
  }
}

const MODOS_DE_SERIE = Object.freeze([
  { value: SERIES_MODES.MENSAL, chip: 'Mês a mês', label: 'Valores de cada mês' },
  { value: SERIES_MODES.ACUMULADO, chip: 'Acumulado', label: 'Acumulado desde o início do período mostrado' },
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
  observador.observe(dom.fipezapChartsResidencial);
  observador.observe(dom.fipezapChartsComercial);
  observador.observe(dom.fipezapLocalityChart);
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

// --- Diagnóstico Territorial PDAD-A (issue #100, Fase 1) -------------------------

/** As RAs que entram no recorte corrente. RA escolhida sem dado no ano vira lista vazia. */
function pdadSelectedRaIds() {
  const { ra, year } = state.pdadFilters;
  const disponiveis = rasForYear(state.pdadIndex, year).map((item) => item.raGeoId);
  if (ra === 'all') return disponiveis;
  return disponiveis.includes(ra) ? [ra] : [];
}

/** Repovoa o filtro de RA para o ano corrente, preservando a escolha quando ela ainda existe. */
function populatePdadRaFilter() {
  const ras = rasForYear(state.pdadIndex, state.pdadFilters.year);
  const atual = state.pdadFilters.ra;
  const porId = new Map(ras.map((item) => [item.raGeoId, item.raName]));
  populateSelect(dom.pdadRa, [...porId.keys()], (id) => porId.get(id) || id);
  dom.pdadRa.value = porId.has(atual) ? atual : 'all';
  state.pdadFilters.ra = dom.pdadRa.value;
}

/** Monta os três filtros uma única vez, na primeira carga com dado — troca de valor não passa por aqui de novo. */
function initializePdadFilters() {
  const anos = pdadYearsAvailable(state.pdadData);
  const maisRecente = anos[0];
  dom.pdadYear.replaceChildren(...anos.map((ano) => {
    const option = document.createElement('option');
    option.value = String(ano);
    // O ano mais recente é o padrão; os demais se anunciam como histórico, mesma
    // leitura que a tela já dá ao ano mais antigo do IVV/FipeZap.
    option.textContent = ano === maisRecente ? String(ano) : `${ano} · histórico`;
    return option;
  }));
  dom.pdadYear.value = String(maisRecente);
  state.pdadFilters = { ra: 'all', year: maisRecente, tema: 'all' };
  const pendente = state.pendingUrl && state.pendingUrl.view === 'diagnostico' ? state.pendingUrl.params : null;
  if (pendente) {
    if (intParam(pendente.ano) !== null && anos.includes(intParam(pendente.ano))) {
      state.pdadFilters.year = intParam(pendente.ano);
      dom.pdadYear.value = String(state.pdadFilters.year);
    }
    if (pendente.ra) state.pdadFilters.ra = pendente.ra;
    if (pendente.tema && PDAD_TEMAS[pendente.tema]) state.pdadFilters.tema = pendente.tema;
  }
  populatePdadRaFilter();
  populateSelect(dom.pdadTema, Object.keys(PDAD_TEMAS), (key) => PDAD_TEMAS[key]);
  dom.pdadTema.value = state.pdadFilters.tema;
  // Metadados de Figura/Tabela por indicador (issue #102) — montados uma vez, igual ao
  // índice agregado: são constantes por `indicator_code`, recalcular a cada filtro
  // custaria as ~12 mil linhas de novo para o mesmo resultado.
  state.pdadFigureMeta = buildFigureMeta(state.pdadData);
}

/**
 * Cobertura do ano corrente, em frase — nunca em silêncio. 2021 publica só o Plano
 * Piloto no dataset real; escrever isso como frase evita que a pessoa leia "sem dado"
 * como defeito de carregamento.
 */
function pdadYearNoteText() {
  const { year } = state.pdadFilters;
  const todasAsRas = new Set();
  for (const ras of Object.values(state.pdadIndex)) for (const id of Object.keys(ras)) todasAsRas.add(id);
  const doAno = rasForYear(state.pdadIndex, year);
  if (doAno.length === 0 || doAno.length >= todasAsRas.size) return '';
  const nomes = doAno.map((item) => item.raName).join(', ');
  return `PDAD-A ${year} publicou ${doAno.length} de ${todasAsRas.size} Regiões Administrativas (${nomes}). `
    + 'Selecionar outra RA mostra ausência de publicação, não um erro de carregamento.';
}


/**
 * Ícones dos tiles de KPI, os mesmos quatro do protótipo (`KPI_IC`): traço, sem
 * preenchimento, 24×24. São `path`/`circle` criados com `createElementNS` — nunca
 * `innerHTML` (R4.4), mesmo sendo constante: a regra não tem exceção para "é só um ícone".
 */
const PDAD_KPI_ICONS = {
  pop: [['circle', { cx: 9, cy: 8, r: 3.2 }], ['path', { d: 'M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5' }],
    ['circle', { cx: 17, cy: 9, r: 2.4 }], ['path', { d: 'M16 19c.2-2.6 1.6-4.2 4.5-4.2' }]],
  home: [['path', { d: 'M4 11 12 4l8 7' }], ['path', { d: 'M6.5 10v9h11v-9' }]],
  avg: [['path', { d: 'M4 11 12 4l8 7' }], ['path', { d: 'M6.5 10v9h11v-9' }], ['circle', { cx: 12, cy: 14.5, r: 2.2 }]],
  share: [['circle', { cx: 12, cy: 12, r: 8 }], ['path', { d: 'M12 4v8h8' }]],
};

function pdadKpiIcon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  for (const [tag, attrs] of PDAD_KPI_ICONS[name] || PDAD_KPI_ICONS.share) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    svg.append(node);
  }
  return svg;
}

/**
 * Tile de KPI na anatomia do protótipo — a mesma `.kpi` do painel do mapa: quadrado tingido
 * com ícone à esquerda, valor grande, rótulo e nota à direita. A tinta é decorativa e
 * rotativa por posição (`tinta-1..4`), nunca semântica; quem carrega significado é o valor.
 */
function pdadKpiTile(label, value, nota, { icon = 'share', tint = 1, small = false } = {}) {
  const box = document.createElement('article');
  box.className = 'kpi';
  const ic = document.createElement('span');
  ic.className = `kpi-ic tinta-${tint}`;
  ic.setAttribute('aria-hidden', 'true');
  ic.append(pdadKpiIcon(icon));
  const tx = document.createElement('span');
  tx.className = 'kpi-tx';
  const valorEl = document.createElement('strong');
  valorEl.className = small ? 'kpi-value kpi-value-sm' : 'kpi-value';
  valorEl.textContent = value;
  const rotulo = document.createElement('span');
  rotulo.className = 'kpi-label kpi-label-texto';
  rotulo.textContent = label;
  tx.append(valorEl, rotulo);
  if (nota) {
    const notaEl = document.createElement('small');
    notaEl.className = 'pdad-kpi-nota';
    notaEl.textContent = nota;
    tx.append(notaEl);
  }
  box.append(ic, tx);
  return box;
}

function renderPdadKpis(raIds) {
  const { year } = state.pdadFilters;
  const kpis = summarizeKpis(state.pdadIndex, year, raIds);
  const avg = kpis.avgHouseholdSize === null ? '—' : kpis.avgHouseholdSize.toLocaleString('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const unica = raIds.length === 1 ? rasForYear(state.pdadIndex, year).find((r) => r.raGeoId === raIds[0]) : null;
  const escopo = unica ? unica.raName : `soma de ${kpis.raCount} RA(s)`;

  dom.pdadKpis.replaceChildren(
    pdadKpiTile('População estimada', formatNumber(kpis.population), `${escopo} · PDAD-A ${year}`, { icon: 'pop', tint: 1 }),
    pdadKpiTile('Domicílios ocupados', formatNumber(kpis.households), `${escopo} · PDAD-A ${year}`, { icon: 'home', tint: 2 }),
    pdadKpiTile('Moradores por domicílio', avg, 'população ÷ domicílios · calculado', { icon: 'avg', tint: 3 }),
    unica
      ? pdadKpiTile('Território em foco', unica.raName, `${unica.raGeoId} · PDAD-A ${year}`, { icon: 'share', tint: 4, small: true })
      : pdadKpiTile('RAs analisadas', String(kpis.raCount), `PDAD-A ${year} · lote carregado`, { icon: 'share', tint: 4 }),
  );
}

/** Parágrafo de "sem valor" — mesma classe usada por `src/pdad/charts.js`. */
function pdadEmptyPara(texto) {
  const p = document.createElement('p');
  p.className = 'pdad-empty';
  p.textContent = texto;
  return p;
}

function pdadEmptySection(texto) {
  const section = document.createElement('section');
  section.className = 'pdad-card';
  section.append(pdadEmptyPara(texto));
  return section;
}

/**
 * Um cartão de indicador (issue #102): desenha pelo tipo declarado em `PDAD_VIZ` — não
 * só barras horizontais como a Fase 1 fazia. `shopping` é o único que usa `groups`
 * (dois níveis, tipo de compra × destino) em vez da lista achatada de categorias que
 * todo o resto usa — por isso lê de `indicatorGroups()`, não `indicatorSeries()`.
 */
function pdadIndicatorCard(indicador, raIds) {
  const viz = PDAD_VIZ[indicador.key] || { kind: 'hbars' };
  const article = document.createElement('article');
  article.className = viz.span === 2 ? 'pdad-card pdad-card-wide' : 'pdad-card';
  article.dataset.pdadIndicatorKey = indicador.key;

  const head = document.createElement('div');
  head.className = 'pdad-card-head';
  const titulo = document.createElement('h3');
  titulo.className = 'pdad-card-titulo';
  titulo.textContent = indicador.label;
  const unidade = document.createElement('span');
  unidade.className = 'pdad-card-unidade';
  unidade.textContent = indicador.unit;
  head.append(titulo, unidade);
  article.append(head);

  if (indicador.key === 'shopping') {
    const grupos = indicatorGroups(state.pdadIndex, state.pdadFilters.year, raIds, 'shopping');
    article.append(grupos.length ? buildGroups(grupos, { cap: viz.cap }) : pdadEmptyPara('Sem valores publicados para esta seleção.'));
    return article;
  }

  const valores = indicatorSeries(state.pdadIndex, state.pdadFilters.year, raIds, indicador.key);
  if (valores.length === 0) {
    article.append(pdadEmptyPara('Sem valores publicados para esta seleção.'));
    return article;
  }
  const order = (indicador.key === 'schoolTime' || indicador.key === 'workTime') ? PDAD_TIME_ORDER : undefined;
  article.append(buildChart(viz, valores, { order }));
  return article;
}

/**
 * Perfil imobiliário da RA (issue #126, Plano 01 §10): sete leituras com referência
 * EXPLÍCITA — a mediana das RAs que publicaram o mesmo indicador no mesmo ano, com o `n`
 * escrito — e a posição entre elas. Só aparece com UMA RA escolhida: com várias não há
 * "a RA" para posicionar. Nunca chama a referência de "média do DF"; nunca mostra
 * suprimido como zero. Abaixo, os demais indicadores em lista compacta clicável, cada um
 * com a categoria dominante — o clique abre o detalhamento até a Figura de origem.
 */
function renderPdadProfile(raIds) {
  if (!dom.pdadProfile) return;
  const { year } = state.pdadFilters;
  const perfil = raIds.length === 1 ? raRealEstateProfile(state.pdadIndex, year, raIds[0]) : null;
  if (!perfil) {
    dom.pdadProfile.hidden = true;
    dom.pdadProfile.replaceChildren();
    return;
  }

  const frag = document.createDocumentFragment();
  const head = document.createElement('div');
  head.className = 'pdad-tema-head pdad-profile-head';
  const rotulo = document.createElement('span');
  rotulo.textContent = `Perfil imobiliário · ${perfil.raName}`;
  head.append(rotulo);
  frag.append(head);

  const grid = document.createElement('div');
  grid.className = 'pdad-profile-grid';
  for (const item of perfil.items) grid.append(pdadProfileTile(item, perfil));
  frag.append(grid);

  const nota = document.createElement('p');
  nota.className = 'pdad-footnote pdad-profile-note';
  nota.textContent = 'Referência: mediana das RAs com valor publicado para o mesmo indicador e ano '
    + '(não é a média do DF). Posição calculada só entre RAs publicadas; suprimido não entra.';
  frag.append(nota);

  const outros = compactIndicators(state.pdadIndex, year, perfil.raGeoId, RA_PROFILE_ITEMS.map((i) => i.key));
  if (outros.length) {
    const subhead = document.createElement('div');
    subhead.className = 'pdad-tema-head';
    const sub = document.createElement('span');
    sub.textContent = 'Outros indicadores';
    subhead.append(sub);
    frag.append(subhead);

    const lista = document.createElement('ul');
    lista.className = 'pdad-compact-list';
    for (const item of outros) lista.append(pdadCompactRow(item, perfil));
    frag.append(lista);
  }

  dom.pdadProfile.replaceChildren(frag);
  dom.pdadProfile.hidden = false;
}

function pdadProfileTile(item, perfil) {
  const tile = document.createElement('article');
  tile.className = 'pdad-profile-item';
  tile.dataset.profileItem = item.id;
  tile.title = item.hint;

  const label = document.createElement('span');
  label.className = 'pdad-profile-label';
  label.textContent = item.label;
  tile.append(label);

  const valor = document.createElement('strong');
  valor.className = 'pdad-profile-value';
  if (item.status === PROFILE_STATUS.PUBLISHED) {
    valor.textContent = formatPercent(item.value);
  } else {
    valor.className += ' pdad-profile-absent';
    valor.textContent = item.status === PROFILE_STATUS.SUPPRESSED ? 'suprimido' : 'não publicado';
  }
  tile.append(valor);

  const ref = document.createElement('span');
  ref.className = 'pdad-profile-ref';
  if (item.deltaPp !== null) {
    const sinal = item.deltaPp > 0 ? '+' : (item.deltaPp < 0 ? '−' : '');
    ref.textContent = `${sinal}${formatPercent(Math.abs(item.deltaPp)).replace('%', ' p.p.')} vs. mediana de ${item.reference.n} RAs`;
    ref.dataset.sign = item.deltaPp > 0 ? 'above' : (item.deltaPp < 0 ? 'below' : 'equal');
  } else if (item.status === PROFILE_STATUS.PUBLISHED) {
    ref.textContent = 'sem referência publicada';
  } else {
    ref.textContent = '';
  }
  tile.append(ref);

  if (item.rank) {
    const rank = document.createElement('span');
    rank.className = 'pdad-profile-rank';
    rank.textContent = `${item.rank.position}ª de ${item.rank.total} RAs`;
    tile.append(rank);
  }

  tile.tabIndex = 0;
  tile.setAttribute('role', 'button');
  const abrir = () => openPdadDrill({ key: item.key, raGeoId: perfil.raGeoId, year: perfil.year });
  tile.addEventListener('click', abrir);
  tile.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
  return tile;
}

function pdadCompactRow(item, perfil) {
  const li = document.createElement('li');
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'pdad-compact-row';
  botao.dataset.pdadIndicatorKey = item.key;
  const nome = document.createElement('span');
  nome.className = 'pdad-compact-label';
  nome.textContent = item.label;
  const valor = document.createElement('span');
  valor.className = 'pdad-compact-value';
  valor.textContent = item.leader !== null && Number.isFinite(item.leaderPct)
    ? `${item.leader} · ${formatPercent(item.leaderPct)}`
    : 'sem valor publicado';
  const seta = document.createElement('span');
  seta.className = 'pdad-compact-arrow';
  seta.setAttribute('aria-hidden', 'true');
  seta.textContent = '→';
  botao.append(nome, valor, seta);
  botao.addEventListener('click', () => openPdadDrill({ key: item.key, raGeoId: perfil.raGeoId, year: perfil.year }));
  li.append(botao);
  return li;
}

function renderPdadTemaBlocks(raIds) {
  const { tema } = state.pdadFilters;
  const temas = tema === 'all' ? Object.keys(PDAD_TEMAS) : [tema];

  const blocos = temas.map((chave) => {
    const indicadores = INDICATORS_BY_TEMA[chave] || [];
    const grid = document.createElement('div');
    grid.className = 'pdad-ind-grid';
    for (const indicador of indicadores) grid.append(pdadIndicatorCard(indicador, raIds));

    const wrapper = document.createDocumentFragment();
    if (tema === 'all') {
      const cabecalho = document.createElement('div');
      cabecalho.className = 'pdad-tema-head';
      const rotulo = document.createElement('span');
      rotulo.textContent = PDAD_TEMAS[chave];
      cabecalho.append(rotulo);
      wrapper.append(cabecalho);
    }
    wrapper.append(grid);
    return wrapper;
  });

  dom.pdadTemaBlocks.replaceChildren(...blocos);
}

/**
 * Monta a view do Diagnóstico Territorial PDAD-A (issue #100). Mesmo formato de
 * `renderMarketView()`: botão desabilitado com o motivo escrito quando a aba não veio,
 * filtros montados uma vez na primeira carga, e `setView` reaplicado ao final para que
 * abrir direto em `#diagnostico` funcione.
 */
function renderPdadView() {
  const temDado = state.pdadData.length > 0;

  const semAba = 'A aba PDAD_A_DATA não foi carregada, então não há diagnóstico territorial para mostrar.';
  for (const tab of [dom.pdadTab, dom.pdadRankingTab, dom.pdadCompareTab, dom.pdadBaseTab]) {
    tab.disabled = !temDado;
    tab.title = temDado ? '' : semAba;
  }

  if (!temDado) {
    if (['diagnostico', 'ranking', 'comparar', 'base'].includes(viewFromHash())) setView('mapa');
    return [];
  }

  if (!state.pdadFilters) initializePdadFilters();

  const anosDisponiveis = pdadYearsAvailable(state.pdadData);
  dom.pdadScope.textContent =
    `Explore o território, compare Regiões Administrativas e identifique oportunidades com base na PDAD-A ${anosDisponiveis[0]} — com rastreabilidade até a figura de origem.`;
  // Cartão "Fonte ativa" das quatro toplines: o lote vem do dado, e a instituição é o
  // rótulo fixo da fonte — mesmo texto do protótipo. No Diagnóstico o ano é o do FILTRO
  // (quem escolhe 2021 está lendo o lote 2021, e o cartão tem que dizer isso — achado do
  // Codex na #108); Ranking, Comparar e Base travam no ano de cobertura completa, o mais
  // recente, e o cartão delas mostra esse.
  for (const card of document.querySelectorAll('[data-pdad-source]')) {
    const noDiagnostico = dom.pdadView.contains(card);
    const ano = noDiagnostico ? state.pdadFilters.year : anosDisponiveis[0];
    const strong = card.querySelector('strong');
    strong.replaceChildren(
      document.createTextNode(`PDAD-A ${ano}`),
      document.createElement('br'),
      document.createTextNode('IPEDF / DIEPS / COEPS'),
    );
    card.hidden = false;
  }

  const raIds = pdadSelectedRaIds();
  renderPdadKpis(raIds);
  renderPdadProfile(raIds);
  dom.pdadYearNote.textContent = pdadYearNoteText();
  renderPdadTemaBlocks(raIds);
  renderPdadScatter();

  setView(viewFromHash());
  if (['diagnostico', 'ranking'].includes(viewFromHash())) syncHash();
  return [];
}

function refreshPdadView() {
  const pdadWarnings = renderPdadView();
  showWarnings([...state.baseWarnings, ...pdadWarnings]);
}

// --- Diagnóstico Territorial PDAD-A: dispersão (issue #102) -----------------------

/** O ano de cobertura completa (o mais recente do lote) — Ranking/Comparar/Dispersão travam nele. */
function pdadPrimaryYear() {
  return pdadYearsAvailable(state.pdadData)[0];
}

function populatePdadScatterSelect() {
  if (dom.pdadScatterView.options.length > 0) return;
  populateSelectFull(dom.pdadScatterView, PDAD_SCATTER_VIEWS.map((v) => v.id), (id) => PDAD_SCATTER_VIEWS.find((v) => v.id === id).label);
}

function pdadNiceTicks(min, max, n) {
  const span = (max - min) || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(t);
  return { ticks, lo, hi };
}

function pdadFmtTick(v) {
  return Math.abs(v) >= 1000
    ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
    : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function pdadAxisFmt(spec, v) {
  if (spec.attr === 'incomePerCapita') return `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
  if (spec.attr === 'population' || spec.attr === 'households') return formatNumber(v);
  return formatPercent(percentFromPoints(v));
}

function pdadPearson(pts) {
  const n = pts.length;
  if (n < 3) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (const p of pts) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  const den = Math.sqrt(sxx * syy);
  return den ? sxy / den : null;
}

/**
 * Desenha a seção de dispersão da tela Diagnóstico (issue #102): 7 leituras cruzadas
 * pré-definidas (`PDAD_SCATTER_VIEWS`), correlação de Pearson descritiva, eixos com
 * ticks "redondos". Só faz sentido no ano de cobertura completa — travado nele, mesma
 * leitura do protótipo de referência (que trava a dispersão em 2024).
 */
function renderPdadScatter() {
  populatePdadScatterSelect();
  const ano = pdadPrimaryYear();
  if (state.pdadFilters.year !== ano) {
    dom.pdadScatterSection.hidden = true;
    return;
  }
  dom.pdadScatterSection.hidden = false;

  const view = PDAD_SCATTER_VIEWS.find((v) => v.id === dom.pdadScatterView.value) || PDAD_SCATTER_VIEWS[0];
  dom.pdadScatterView.value = view.id;
  dom.pdadScatterInsight.textContent = view.insight;

  const ras = rasForYear(state.pdadIndex, ano);
  const pontos = [];
  const excluidas = [];
  for (const ra of ras) {
    const x = rankScalar(ra, view.x);
    const y = rankScalar(ra, view.y);
    if (Number.isFinite(x) && Number.isFinite(y)) pontos.push({ ra, x, y });
    else excluidas.push(ra);
  }

  if (pontos.length < 3) {
    dom.pdadScatterPlot.replaceChildren(pdadEmptyPara('Poucas RAs com valor publicado nesta leitura.'));
    dom.pdadScatterMeta.textContent = '';
    dom.pdadScatterNote.textContent = excluidas.length
      ? `Sem valor publicado: ${excluidas.map((ra) => ra.raName).join(', ')}.` : '';
    return;
  }

  const W = 700; const H = 320; const mg = { l: 58, r: 24, t: 14, b: 44 };
  const iw = W - mg.l - mg.r; const ih = H - mg.t - mg.b;
  const xt = pdadNiceTicks(Math.min(...pontos.map((p) => p.x)), Math.max(...pontos.map((p) => p.x)), 5);
  const yt = pdadNiceTicks(Math.min(...pontos.map((p) => p.y)), Math.max(...pontos.map((p) => p.y)), 4);
  const X = (v) => mg.l + ((v - xt.lo) / ((xt.hi - xt.lo) || 1)) * iw;
  const Y = (v) => mg.t + ih - ((v - yt.lo) / ((yt.hi - yt.lo) || 1)) * ih;
  const raSelecionada = state.pdadFilters.ra !== 'all' ? state.pdadFilters.ra : null;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('class', 'pdad-sc-svg');
  svg.setAttribute('aria-label', view.label);

  const eixo = document.createElementNS(svgNS, 'line');
  eixo.setAttribute('class', 'pdad-sc-axis');
  eixo.setAttribute('x1', mg.l); eixo.setAttribute('x2', W - mg.r);
  eixo.setAttribute('y1', mg.t + ih); eixo.setAttribute('y2', mg.t + ih);
  svg.append(eixo);

  for (const t of yt.ticks) {
    const linha = document.createElementNS(svgNS, 'line');
    linha.setAttribute('class', 'pdad-sc-grid');
    linha.setAttribute('x1', mg.l); linha.setAttribute('x2', W - mg.r);
    linha.setAttribute('y1', Y(t)); linha.setAttribute('y2', Y(t));
    svg.append(linha);
    const texto = document.createElementNS(svgNS, 'text');
    texto.setAttribute('class', 'pdad-sc-tick');
    texto.setAttribute('x', mg.l - 8); texto.setAttribute('y', Y(t) + 3);
    texto.setAttribute('text-anchor', 'end');
    texto.textContent = pdadFmtTick(t);
    svg.append(texto);
  }
  for (const t of xt.ticks) {
    const texto = document.createElementNS(svgNS, 'text');
    texto.setAttribute('class', 'pdad-sc-tick');
    texto.setAttribute('x', X(t)); texto.setAttribute('y', H - mg.b + 16);
    texto.setAttribute('text-anchor', 'middle');
    texto.textContent = pdadFmtTick(t);
    svg.append(texto);
  }

  for (const ponto of pontos) {
    const selecionado = ponto.ra.raGeoId === raSelecionada;
    const circulo = document.createElementNS(svgNS, 'circle');
    circulo.setAttribute('class', selecionado ? 'pdad-sc-dot sel' : 'pdad-sc-dot');
    circulo.setAttribute('cx', X(ponto.x)); circulo.setAttribute('cy', Y(ponto.y));
    circulo.setAttribute('r', selecionado ? 6 : 4.5);
    circulo.dataset.drillRa = ponto.ra.raGeoId;
    circulo.setAttribute('role', 'button');
    circulo.setAttribute('tabindex', '0');
    const titulo = document.createElementNS(svgNS, 'title');
    titulo.textContent = `${ponto.ra.raName} · ${view.x.label}: ${pdadAxisFmt(view.x, ponto.x)} · `
      + `${view.y.label}: ${pdadAxisFmt(view.y, ponto.y)} · clique para focar`;
    circulo.append(titulo);
    svg.append(circulo);
  }

  const labelX = document.createElementNS(svgNS, 'text');
  labelX.setAttribute('class', 'pdad-sc-axlabel');
  labelX.setAttribute('x', mg.l + iw / 2); labelX.setAttribute('y', H - 6);
  labelX.setAttribute('text-anchor', 'middle');
  labelX.textContent = view.x.label;
  svg.append(labelX);
  const labelY = document.createElementNS(svgNS, 'text');
  labelY.setAttribute('class', 'pdad-sc-axlabel');
  labelY.setAttribute('x', 14); labelY.setAttribute('y', mg.t + ih / 2);
  labelY.setAttribute('transform', `rotate(-90 14 ${mg.t + ih / 2})`);
  labelY.setAttribute('text-anchor', 'middle');
  labelY.textContent = view.y.label;
  svg.append(labelY);

  dom.pdadScatterPlot.replaceChildren(svg);
  const r = pdadPearson(pontos);
  dom.pdadScatterMeta.textContent = `${pontos.length} RAs${r !== null ? ` · r = ${r.toFixed(2).replace('.', ',')}` : ''}`;
  dom.pdadScatterNote.textContent = 'Correlação de Pearson descritiva sobre valores publicados — não implica causalidade.'
    + (excluidas.length ? ` Fora do gráfico (sem valor publicado): ${excluidas.map((ra) => ra.raName).join(', ')}.` : '');
}

// --- Diagnóstico Territorial PDAD-A: Ranking dos territórios (issue #102) ---------

/** Total estimado publicado da categoria do item de ranking — usado no critério "Nº absolutos". */
function pdadRankAbsValue(ra, item) {
  if (item.attr) return rankScalar(ra, item);
  const rows = detailRowsForKey(state.pdadData, { raGeoId: ra.raGeoId, year: pdadPrimaryYear(), key: item.key });
  const achado = rows.find((row) => categoryLabel(row) === item.category);
  return achado && Number.isFinite(achado.estimateTotal) ? achado.estimateTotal : null;
}

function pdadRankValues(item, mode) {
  const ano = pdadPrimaryYear();
  const ras = rasForYear(state.pdadIndex, ano);
  return ras.map((ra) => {
    const bruto = (mode === 'abs' && !item.attr) ? pdadRankAbsValue(ra, item) : rankScalar(ra, item);
    return { ra, v: Number.isFinite(bruto) ? bruto : null };
  }).filter((x) => x.v !== null).sort((a, b) => b.v - a.v);
}

function pdadRankFormat(item, v, abs) {
  if (item.unit === 'currency') return `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
  if (abs) return formatNumber(v);
  return formatPercent(percentFromPoints(v));
}

function pdadRankCard(item, raGeoId, mode) {
  const abs = mode === 'abs' && !!item.key;
  const vals = pdadRankValues(item, mode);
  const pos = vals.findIndex((x) => x.ra.raGeoId === raGeoId);
  const minha = pos >= 0 ? vals[pos].v : null;
  const pctil = (pos >= 0 && vals.length > 1) ? (1 - pos / (vals.length - 1)) * 100 : null;

  const article = document.createElement('article');
  article.className = pos < 0 ? 'pdad-rank-card pdad-rank-off' : 'pdad-rank-card';
  if (item.key) {
    article.dataset.pdadIndicatorKey = item.key;
    article.dataset.drillCategory = item.category;
    article.tabIndex = 0;
    article.setAttribute('role', 'button');
    article.title = 'Clique para rastrear até a origem do dado';
  }
  const temaEl = document.createElement('div'); temaEl.className = 'pdad-rank-tema'; temaEl.textContent = item.tema;
  const labelEl = document.createElement('div'); labelEl.className = 'pdad-rank-label'; labelEl.textContent = item.label;
  const valorEl = document.createElement('strong'); valorEl.textContent = minha === null ? '—' : pdadRankFormat(item, minha, abs);
  article.append(temaEl, labelEl, valorEl);
  if (abs && minha !== null && item.absUnit) {
    const unidadeEl = document.createElement('div'); unidadeEl.className = 'pdad-rank-pos'; unidadeEl.textContent = item.absUnit;
    article.append(unidadeEl);
  }
  const posEl = document.createElement('div'); posEl.className = 'pdad-rank-pos';
  if (pos >= 0) {
    const b = document.createElement('b'); b.textContent = `${pos + 1}ª`;
    posEl.append(b, document.createTextNode(` de ${vals.length} RAs publicadas`));
  } else {
    posEl.textContent = 'sem valor publicado para esta RA';
  }
  article.append(posEl);
  if (pctil !== null) {
    const barra = document.createElement('div'); barra.className = 'pdad-rank-bar';
    const fill = document.createElement('i'); fill.style.width = `${Math.max(3, pctil)}%`;
    barra.append(fill);
    article.append(barra);
  }
  return article;
}

function initializePdadRankState() {
  const ano = pdadPrimaryYear();
  const ras = rasForYear(state.pdadIndex, ano);
  const comFigura = PDAD_RANK_SET.filter((item) => item.key);
  // `#ranking?ra=RA_20` aplica-se AQUI, no estado que o ranking lê — não em `pdadFilters`,
  // que pertence ao Diagnóstico. RA fora do ano publicado cai no primeiro da lista.
  const pendente = state.pendingUrl && state.pendingUrl.view === 'ranking' ? state.pendingUrl.params : null;
  const pedida = pendente && pendente.ra && ras.some((r) => r.raGeoId === pendente.ra) ? pendente.ra : null;
  state.pdadRankState = { ra: pedida || ras[0]?.raGeoId || null, indicatorId: comFigura[0]?.id || null, mode: 'pct' };
}

function renderPdadRankTable() {
  const item = PDAD_RANK_SET.find((i) => i.id === state.pdadRankState.indicatorId);
  if (!item) { dom.pdadRankTableBody.replaceChildren(); return; }
  const abs = state.pdadRankState.mode === 'abs';
  dom.pdadRankTableHead.textContent = `${item.label}${abs ? ' · nº absolutos' : ' · %'}`;

  const ano = pdadPrimaryYear();
  const ras = rasForYear(state.pdadIndex, ano);
  const linhas = ras.map((ra) => {
    const bruto = abs ? pdadRankAbsValue(ra, item) : rankScalar(ra, item);
    return { ra, v: Number.isFinite(bruto) ? bruto : null };
  }).sort((a, b) => {
    if (a.v === null) return 1;
    if (b.v === null) return -1;
    return b.v - a.v;
  });

  dom.pdadRankTableBody.replaceChildren(...linhas.map(({ ra, v }) => {
    const tr = document.createElement('tr');
    const celulas = [
      ra.raName, formatNumber(ra.population), formatNumber(ra.households),
      v === null ? '—' : pdadRankFormat(item, v, abs),
    ];
    for (const texto of celulas) {
      const td = document.createElement('td'); td.textContent = texto; tr.append(td);
    }
    return tr;
  }));
}

/** Monta a tela Ranking dos territórios (issue #102): cartões de posição + tabela comparativa. */
function renderPdadRankingView() {
  if (!state.pdadData.length) return;
  if (!state.pdadFilters) initializePdadFilters();
  if (!state.pdadRankState) initializePdadRankState();

  const ano = pdadPrimaryYear();
  const ras = rasForYear(state.pdadIndex, ano);
  populateSelectFull(dom.pdadRankRa, ras.map((ra) => ra.raGeoId), (id) => ras.find((r) => r.raGeoId === id)?.raName || id);
  dom.pdadRankRa.value = ras.some((r) => r.raGeoId === state.pdadRankState.ra) ? state.pdadRankState.ra : (ras[0]?.raGeoId || '');
  state.pdadRankState.ra = dom.pdadRankRa.value;

  dom.pdadRankCards.replaceChildren(
    ...PDAD_RANK_SET.map((item) => pdadRankCard(item, state.pdadRankState.ra, state.pdadRankState.mode)),
  );

  const comFigura = PDAD_RANK_SET.filter((item) => item.key);
  populateSelectFull(dom.pdadRankIndicator, comFigura.map((item) => item.id), (id) => comFigura.find((i) => i.id === id)?.label || id);
  dom.pdadRankIndicator.value = comFigura.some((i) => i.id === state.pdadRankState.indicatorId)
    ? state.pdadRankState.indicatorId : (comFigura[0]?.id || '');
  state.pdadRankState.indicatorId = dom.pdadRankIndicator.value;

  for (const botao of dom.pdadRankMode.querySelectorAll('button')) {
    botao.classList.toggle('on', botao.dataset.mode === state.pdadRankState.mode);
  }

  renderPdadRankTable();
}

// --- Diagnóstico Territorial PDAD-A: Comparar RAs (issue #102) --------------------

const PDAD_CV_MAX_RAS = 6;
const PDAD_CV_MAX_INDS = 4;
// Séries do protótipo (`--s1`…`--s6`), família própria do PDAD-A — a categórica do Mercado
// (`--cat-*`) foi validada por script e não muda para casar com outro desenho (R8.75).
const PDAD_CV_SERIES = ['var(--pdad-serie-1)', 'var(--pdad-serie-2)', 'var(--pdad-serie-3)', 'var(--pdad-serie-4)', 'var(--pdad-serie-5)', 'var(--pdad-serie-6)'];

function pdadCvColorFor(raGeoId) {
  const cores = state.pdadCompareState.colors;
  if (cores[raGeoId] !== undefined) return cores[raGeoId];
  const usados = new Set(Object.values(cores));
  for (let i = 0; i < PDAD_CV_MAX_RAS; i += 1) {
    if (!usados.has(i)) { cores[raGeoId] = i; return i; }
  }
  cores[raGeoId] = 0;
  return 0;
}

function initializePdadCompareState() {
  const ano = pdadPrimaryYear();
  const ras = rasForYear(state.pdadIndex, ano);
  const inicial = (state.pdadFilters?.ra && state.pdadFilters.ra !== 'all') ? state.pdadFilters.ra : ras[0]?.raGeoId;
  const segunda = ras.find((ra) => ra.raGeoId !== inicial)?.raGeoId;
  state.pdadCompareState.ras = [inicial, segunda].filter(Boolean);
  state.pdadCompareState.inds = ['age'];
  state.pdadCompareState.colors = {};
  for (const raGeoId of state.pdadCompareState.ras) pdadCvColorFor(raGeoId);
}

function pdadCvAddRa(raGeoId) {
  const { ras } = state.pdadCompareState;
  if (!raGeoId || ras.includes(raGeoId) || ras.length >= PDAD_CV_MAX_RAS) return;
  ras.push(raGeoId);
  pdadCvColorFor(raGeoId);
  renderPdadCompareView();
}

function pdadCvRemoveRa(raGeoId) {
  const { ras } = state.pdadCompareState;
  const i = ras.indexOf(raGeoId);
  if (i < 0) return;
  ras.splice(i, 1);
  delete state.pdadCompareState.colors[raGeoId];
  renderPdadCompareView();
}

function pdadCvAddInd(key) {
  const { inds } = state.pdadCompareState;
  if (!key || inds.includes(key) || inds.length >= PDAD_CV_MAX_INDS) return;
  inds.push(key);
  renderPdadCompareView();
}

function pdadCvRemoveInd(key) {
  const { inds } = state.pdadCompareState;
  const i = inds.indexOf(key);
  if (i < 0) return;
  inds.splice(i, 1);
  renderPdadCompareView();
}

function pdadCvChip(texto, datasetKey, datasetValue, cor) {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'pdad-cv-chip';
  botao.title = 'Clique para remover';
  if (cor !== undefined) botao.style.setProperty('--chip', PDAD_CV_SERIES[cor % PDAD_CV_SERIES.length]);
  botao.dataset[datasetKey] = datasetValue;
  const nome = document.createElement('span'); nome.textContent = texto;
  const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕';
  botao.append(nome, x);
  return botao;
}

/** Valores de um indicador para uma RA, achatados (`shopping` compõe "grupo · destino"). */
function pdadCvValues(ra, key) {
  if (key === 'shopping') {
    return (ra.indicators.shopping?.groups || [])
      .flatMap((g) => g.items.map((it) => ({ ...it, label: `${g.group} · ${it.label}` })));
  }
  return ra.indicators[key]?.values || [];
}

function renderPdadCompareSummary(ras) {
  const secao = document.createElement('section');
  secao.className = 'pdad-card pdad-rank-table-card';
  const cabecalho = document.createElement('div'); cabecalho.className = 'pdad-card-head';
  const tituloWrap = document.createElement('div');
  const eyebrow = document.createElement('p'); eyebrow.className = 'pdad-section-label'; eyebrow.textContent = 'Perfil estrutural';
  const titulo = document.createElement('h2'); titulo.className = 'pdad-card-titulo'; titulo.textContent = 'As RAs selecionadas em números';
  tituloWrap.append(eyebrow, titulo);
  cabecalho.append(tituloWrap);
  secao.append(cabecalho);

  const wrap = document.createElement('div'); wrap.className = 'pdad-table-wrap';
  const tabela = document.createElement('table');
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  for (const texto of ['Região', 'População', 'Domicílios', 'Moradores/dom.', 'Escritura registrada']) {
    const th = document.createElement('th'); th.textContent = texto; trh.append(th);
  }
  thead.append(trh);
  const tbody = document.createElement('tbody');
  for (const ra of ras) {
    const tr = document.createElement('tr');
    tr.className = 'pdad-row-link';
    tr.dataset.drillRa = ra.raGeoId;
    tr.title = 'Abrir esta RA no diagnóstico';
    const nomeTd = document.createElement('td');
    const ponto = document.createElement('i'); ponto.className = 'pdad-cv-dot';
    ponto.style.background = PDAD_CV_SERIES[pdadCvColorFor(ra.raGeoId) % PDAD_CV_SERIES.length];
    nomeTd.append(ponto, document.createTextNode(ra.raName));
    const popTd = document.createElement('td'); popTd.textContent = formatNumber(ra.population);
    const domTd = document.createElement('td'); domTd.textContent = formatNumber(ra.households);
    const razaoTd = document.createElement('td');
    razaoTd.textContent = ra.avgHouseholdSize === null ? '—'
      : ra.avgHouseholdSize.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const escrituraTd = document.createElement('td');
    const deed = (ra.indicators.deed?.values || []).find((v) => v.label === 'Sim');
    escrituraTd.textContent = deed && Number.isFinite(deed.pct) ? formatPercent(percentFromPoints(deed.pct)) : '—';
    tr.append(nomeTd, popTd, domTd, razaoTd, escrituraTd);
    tbody.append(tr);
  }
  tabela.append(thead, tbody);
  wrap.append(tabela);
  secao.append(wrap);
  dom.pdadCvSummary.replaceChildren(secao);
}

function renderPdadCompareBlocks(ras) {
  const blocos = state.pdadCompareState.inds.map((key) => {
    const meta = PDAD_INDICATOR_LIST.find((i) => i.key === key);
    const secao = document.createElement('section');
    secao.className = 'pdad-card';
    const cabecalho = document.createElement('div'); cabecalho.className = 'pdad-card-head';
    const tituloWrap = document.createElement('div');
    const eyebrow = document.createElement('p'); eyebrow.className = 'pdad-section-label';
    eyebrow.textContent = meta ? PDAD_TEMAS[meta.tema] || '' : '';
    const titulo = document.createElement('h2'); titulo.className = 'pdad-card-titulo'; titulo.textContent = meta?.label || key;
    tituloWrap.append(eyebrow, titulo);
    const unidade = document.createElement('span'); unidade.className = 'mono';
    unidade.textContent = `${meta?.unit || ''}${meta?.multiple ? ' · categorias podem coexistir' : ''}`;
    cabecalho.append(tituloWrap, unidade);
    secao.append(cabecalho);

    const legenda = document.createElement('div'); legenda.className = 'pdad-cv-legend';
    for (const ra of ras) {
      const item = document.createElement('span'); item.className = 'pdad-cv-key';
      const ponto = document.createElement('i'); ponto.style.background = PDAD_CV_SERIES[pdadCvColorFor(ra.raGeoId) % PDAD_CV_SERIES.length];
      item.append(ponto, document.createTextNode(ra.raName));
      legenda.append(item);
    }
    secao.append(legenda);

    const porRa = ras.map((ra) => ({ ra, valores: pdadCvValues(ra, key) }));
    const categorias = [...new Set(porRa.flatMap((x) => x.valores.map((v) => v.label)))];
    const ordenadas = categorias
      .map((cat) => [cat, porRa.reduce((soma, x) => soma + (x.valores.find((v) => v.label === cat)?.pct || 0), 0)])
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat);
    const mostradas = ordenadas.slice(0, 8);
    const resto = ordenadas.length - mostradas.length;
    const maximo = Math.max(
      ...mostradas.flatMap((cat) => porRa.map((x) => x.valores.find((v) => v.label === cat)?.pct || 0)), 1,
    );

    const grade = document.createElement('div'); grade.className = 'pdad-cvb-grid';
    for (const categoria of mostradas) {
      const linhaCat = document.createElement('div'); linhaCat.className = 'pdad-cvb-cat';
      const cabecalhoCat = document.createElement('div'); cabecalhoCat.className = 'pdad-cvb-head';
      const nomeCat = document.createElement('span'); nomeCat.title = categoria; nomeCat.textContent = categoria;
      cabecalhoCat.append(nomeCat);
      linhaCat.append(cabecalhoCat);
      for (const { ra, valores } of porRa) {
        const valor = valores.find((v) => v.label === categoria);
        const linha = document.createElement('div'); linha.className = 'pdad-cvb-row';
        linha.dataset.pdadIndicatorKey = key;
        linha.dataset.drillRa = ra.raGeoId;
        if (valor) {
          linha.dataset.drillCategory = key === 'shopping' ? categoria.split(' · ').slice(1).join(' · ') : categoria;
          if (key === 'shopping') linha.dataset.drillGroup = categoria.split(' · ')[0];
        }
        const trilho = document.createElement('span'); trilho.className = 'pdad-mini-trilho';
        const fill = document.createElement('span'); fill.className = 'pdad-mini-fill';
        const pct = valor && Number.isFinite(valor.pct) ? valor.pct : null;
        fill.style.width = pct !== null ? `${Math.max(2, (pct / maximo) * 100)}%` : '0%';
        fill.style.background = PDAD_CV_SERIES[pdadCvColorFor(ra.raGeoId) % PDAD_CV_SERIES.length];
        trilho.append(fill);
        const numero = document.createElement('b');
        numero.textContent = pct !== null ? formatPercent(percentFromPoints(pct)) : (valor ? '—' : 'sem registro');
        linha.append(trilho, numero);
        linhaCat.append(linha);
      }
      grade.append(linhaCat);
    }
    secao.append(grade);
    if (resto > 0) secao.append(pdadFootnoteEl(`+${resto} categorias fora do quadro — completas no drill-down e no CSV.`));
    return secao;
  });
  dom.pdadCvBlocks.replaceChildren(...blocos);
}

function pdadYearNoteEl(texto) {
  const p = document.createElement('p');
  p.className = 'pdad-year-note';
  p.textContent = texto;
  return p;
}

/** Rodapé de cartão (`.footnote` do protótipo): nota miúda, não aviso — aviso é `pdadYearNoteEl`. */
function pdadFootnoteEl(texto) {
  const p = document.createElement('p');
  p.className = 'pdad-footnote';
  p.textContent = texto;
  return p;
}

/** Monta a tela Comparar RAs (issue #102): seleção de RAs/indicadores + comparação por categoria. */
function renderPdadCompareView() {
  if (!state.pdadData.length) return;
  if (!state.pdadFilters) initializePdadFilters();
  if (!state.pdadCompareState.ras.length) initializePdadCompareState();

  const ano = pdadPrimaryYear();
  const ras = rasForYear(state.pdadIndex, ano);
  const porId = new Map(ras.map((ra) => [ra.raGeoId, ra]));

  populateSelectFull(dom.pdadCvRaSelect, ras.map((ra) => ra.raGeoId), (id) => porId.get(id)?.raName || id);
  populateSelectFull(
    dom.pdadCvIndSelect,
    PDAD_INDICATOR_LIST.map((i) => i.key),
    (key) => PDAD_INDICATOR_LIST.find((i) => i.key === key)?.label || key,
  );

  dom.pdadCvRas.replaceChildren(...(state.pdadCompareState.ras.length
    ? state.pdadCompareState.ras.map((raGeoId) => pdadCvChip(
      porId.get(raGeoId)?.raName || raGeoId, 'raGeoId', raGeoId, pdadCvColorFor(raGeoId),
    ))
    : [pdadEmptyPara('nenhuma RA selecionada — use "+ Adicionar"')]));
  dom.pdadCvInds.replaceChildren(...(state.pdadCompareState.inds.length
    ? state.pdadCompareState.inds.map((key) => pdadCvChip(
      PDAD_INDICATOR_LIST.find((i) => i.key === key)?.label || key, 'indKey', key,
    ))
    : [pdadEmptyPara('nenhum indicador selecionado')]));

  dom.pdadCvCount.textContent =
    `${state.pdadCompareState.ras.length}/${PDAD_CV_MAX_RAS} RAs · ${state.pdadCompareState.inds.length}/${PDAD_CV_MAX_INDS} indicadores`;

  const rasEscolhidas = state.pdadCompareState.ras.map((id) => porId.get(id)).filter(Boolean);
  if (rasEscolhidas.length < 2 || !state.pdadCompareState.inds.length) {
    dom.pdadCvSummary.replaceChildren();
    dom.pdadCvBlocks.replaceChildren(pdadEmptySection('Selecione ao menos 2 RAs e 1 indicador para montar a comparação.'));
    return;
  }

  renderPdadCompareSummary(rasEscolhidas);
  renderPdadCompareBlocks(rasEscolhidas);
}

// --- Diagnóstico Territorial PDAD-A: Base de dados (issue #102) -------------------

/** Monta a tela Base de dados: como o dado chega até a tela, e a cobertura do lote atual. */
function renderPdadBaseView() {
  if (!state.pdadData.length) return;
  const anos = pdadYearsAvailable(state.pdadData);
  const totalRas = new Set(state.pdadData.map((item) => item.raGeoId)).size;
  const totalIndicadores = new Set(state.pdadData.map((item) => item.indicatorCode)).size;
  dom.pdadBaseDescription.textContent =
    'Este pipeline lê a aba PDAD_A_DATA direto da planilha viva (formato longo: uma linha por RA × '
    + 'indicador × segmento × categoria de resposta), normaliza cada linha em src/pdad/normalize-pdad.js '
    + 'e agrega por Região Administrativa e ano em src/pdad/aggregate.js. A tela consome apenas os '
    + 'indicadores com regra de exibição declarada em src/pdad/indicators.js — o restante das linhas '
    + 'segue normalizado e disponível para o drill-down.';
  dom.pdadBaseKpis.replaceChildren(
    pdadKpiTile('Linhas carregadas', formatNumber(state.pdadData.length), 'PDAD_A_DATA · lote atual', { icon: 'share', tint: 1 }),
    pdadKpiTile('Regiões administrativas', String(totalRas), 'com ao menos um registro', { icon: 'pop', tint: 2 }),
    pdadKpiTile('Indicadores na planilha', String(totalIndicadores), `${PDAD_INDICATOR_LIST.length} exibidos na tela`, { icon: 'home', tint: 3 }),
    pdadKpiTile('Anos disponíveis', anos.join(' · '), 'PDAD-A', { icon: 'avg', tint: 4, small: true }),
  );
}

// --- Diagnóstico Territorial PDAD-A: drill-down (issue #102) ----------------------

function pdadStatusBadgeText(status) {
  if (status === 'published') return 'publicado';
  if (status === 'partial') return 'parcial';
  if (status === 'suppressed') return 'suprimido';
  return status || '—';
}

/** A chave de indicador do cartão/linha mais próximo do elemento clicado, ou `null`. */
function pdadCardKeyOf(el) {
  const card = el.closest('[data-pdad-indicator-key]');
  return card ? card.dataset.pdadIndicatorKey : null;
}

function pdadDrillRankItems(key, year, category, group) {
  const ras = rasForYear(state.pdadIndex, year);
  return ras.map((ra) => {
    let achado = null;
    if (key === 'shopping') {
      if (group) {
        const grupoObj = (ra.indicators.shopping?.groups || []).find((g) => g.group === group);
        achado = grupoObj?.items.find((it) => it.label === category) || null;
      }
    } else {
      achado = (ra.indicators[key]?.values || []).find((v) => v.label === category) || null;
    }
    return { raGeoId: ra.raGeoId, raName: ra.raName, pct: achado?.pct ?? null, status: achado?.status ?? null };
  });
}

function renderPdadDrillRank() {
  const { key, category, group } = state.pdadDrillState;
  dom.pdadDrillRank.replaceChildren();
  if (!category) { dom.pdadDrillRank.hidden = true; return; }
  dom.pdadDrillRank.hidden = false;

  const itens = pdadDrillRankItems(key, state.pdadDrillState.year, category, group);
  const publicados = itens.filter((i) => i.pct !== null).sort((a, b) => b.pct - a.pct);
  const suprimidos = itens.filter((i) => i.pct === null && i.status === 'suppressed');
  const semRegistro = itens.filter((i) => i.pct === null && i.status !== 'suppressed');
  const maximo = Math.max(...publicados.map((i) => i.pct), 1);

  const titulo = document.createElement('p');
  titulo.className = 'market-eyebrow';
  titulo.textContent = `Ranking entre RAs · ${group ? `${group} · ` : ''}${category}`;
  dom.pdadDrillRank.append(titulo);

  const lista = document.createElement('ul');
  lista.className = 'pdad-bar-list';
  for (const item of publicados) {
    const li = document.createElement('li'); li.className = 'pdad-bar';
    const nome = document.createElement('span'); nome.className = 'pdad-bar-nome'; nome.title = item.raName; nome.textContent = item.raName;
    const trilho = document.createElement('span'); trilho.className = 'pdad-bar-trilho';
    const fill = document.createElement('span'); fill.className = 'pdad-bar-fill';
    fill.style.width = `${Math.min(100, (item.pct / maximo) * 100)}%`;
    trilho.append(fill);
    const numero = document.createElement('span'); numero.className = 'pdad-bar-valor';
    numero.textContent = formatPercent(percentFromPoints(item.pct));
    li.append(nome, trilho, numero);
    lista.append(li);
  }
  if (!publicados.length) lista.append(pdadEmptyPara('Nenhuma RA publica esta categoria isolada.'));
  dom.pdadDrillRank.append(lista);

  if (suprimidos.length) dom.pdadDrillRank.append(pdadYearNoteEl(`Suprimido em: ${suprimidos.map((i) => i.raName).join(', ')}.`));
  if (semRegistro.length) dom.pdadDrillRank.append(pdadYearNoteEl(`Sem registro desta categoria em: ${semRegistro.map((i) => i.raName).join(', ')}.`));
}

/** Monta o corpo do modal de drill-down a partir de `state.pdadDrillState` (issue #102). */
function renderPdadDrill() {
  const drill = state.pdadDrillState;
  const { key, raGeoId, year } = drill;
  const meta = (INDICATOR_CODES_BY_KEY[key] || []).map((codigo) => state.pdadFigureMeta.get(codigo)).find(Boolean);
  const ras = rasForYear(state.pdadIndex, year);
  const raAtual = ras.find((r) => r.raGeoId === raGeoId);
  const indicadorMeta = PDAD_INDICATOR_LIST.find((i) => i.key === key);

  dom.pdadDrillTitle.textContent = meta?.indicatorName || indicadorMeta?.label || key;
  dom.pdadDrillSub.textContent = `${raAtual?.raName || raGeoId} · ${raGeoId} · PDAD-A ${year}`;

  populateSelectFull(dom.pdadDrillRa, ras.map((r) => r.raGeoId), (id) => ras.find((r) => r.raGeoId === id)?.raName || id);
  dom.pdadDrillRa.value = raGeoId;
  const anos = pdadYearsAvailable(state.pdadData);
  populateSelectFull(dom.pdadDrillYear, anos.map(String), (v) => v);
  dom.pdadDrillYear.value = String(year);

  dom.pdadDrillAudit.replaceChildren();
  if (meta?.notes) dom.pdadDrillAudit.append(pdadYearNoteEl(`Nota da figura: ${meta.notes}`));

  const linhas = detailRowsForKey(state.pdadData, { raGeoId, year, key });
  dom.pdadDrillRows.replaceChildren(...linhas.map((item) => {
    const tr = document.createElement('tr');
    tr.className = 'pdad-row-link';
    tr.dataset.drillCategory = categoryLabel(item);
    if (key === 'shopping') {
      tr.dataset.drillGroup = SHOPPING_GROUP_BY_CODE[item.indicatorCode]
        || SHOPPING_GROUP_TITLE_BY_SLUG[item.segmentValue] || '';
    }
    const categoria = item.responseCategory || item.categoryStandard || item.categoryRaw || '—';
    const celulas = [
      item.segmentDimension || '—',
      item.segmentValue || '—',
      categoria,
      Number.isFinite(item.estimateTotal) ? formatNumber(item.estimateTotal) : '—',
      Number.isFinite(item.estimatePct) ? formatPercent(percentFromPoints(item.estimatePct)) : '—',
    ];
    for (const texto of celulas) {
      const td = document.createElement('td'); td.textContent = texto; tr.append(td);
    }
    const tdStatus = document.createElement('td');
    const badge = document.createElement('span'); badge.className = 'pdad-badge'; badge.textContent = pdadStatusBadgeText(item.sourceValueStatus);
    tdStatus.append(badge);
    tr.append(tdStatus);
    return tr;
  }));
  if (!linhas.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td'); td.colSpan = 6; td.className = 'pdad-empty';
    td.textContent = 'Sem registros desta figura para esta RA/ano.';
    tr.append(td);
    dom.pdadDrillRows.append(tr);
  }

  const contagens = linhas.reduce((acc, item) => {
    const chave = item.sourceValueStatus || 'sem_status';
    acc[chave] = (acc[chave] || 0) + 1;
    return acc;
  }, {});
  dom.pdadDrillMeta.replaceChildren(pdadFootnoteEl(
    `Universo: ${meta?.universe || '—'} · Estrutura: ${meta?.structure || '—'} · Registros: ${linhas.length} `
    + `(${contagens.published || 0} publicados · ${contagens.partial || 0} parciais · ${contagens.suppressed || 0} suprimidos)`,
  ));

  renderPdadDrillRank();
}

function openPdadDrill({ key, raGeoId, year, category = null, group = null }) {
  if (!key || !raGeoId || !Number.isFinite(year)) return;
  state.pdadDrillState = { key, raGeoId, year, category, group };
  dom.pdadDrillOverlay.hidden = false;
  renderPdadDrill();
}

function closePdadDrill() {
  state.pdadDrillState = null;
  dom.pdadDrillOverlay.hidden = true;
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
  state.fipezapMonthly = result.fipezapMonthly || [];
  state.fipezapLocality = result.fipezapLocality || [];
  state.fipezapLocalityMap = result.fipezapLocalityMap || [];
  state.pdadData = result.pdadData || [];
  state.pdadIndex = state.pdadData.length > 0 ? buildPdadIndex(state.pdadData) : {};
  state.pdadFilters = null;
  state.fipezapSelection = null;
  state.fipezapLocalitySegment = null;
  state.fipezapLocalityChoice = null;
  state.marketSelection = null;
  state.baseWarnings = [...result.warnings, ...result.errors];
  state.polygons = result.polygons || [];
  state.traffic = result.traffic || { bySegmentId: new Map(), orphaned: [], unmatchedSegmentIds: [] };
  // Confere a camada rodoviária contra o que o contrato promete (issue #131). Cada desvio
  // vira uma frase no MESMO canal das outras abas opcionais — nunca uma exceção (R2.5),
  // e nunca silêncio: "carregou zero trecho e ninguém percebeu" é o defeito que esta
  // camada inteira existe para não repetir.
  //
  // A conferência só roda quando a aba POLYGONS trouxe ALGUMA coisa. Com a aba vazia ou
  // fora do ar, quem avisa é `fetchPolygonsFromGviz`, e repetir "faltam cinco trechos"
  // por cima disso apontaria para o lugar errado — é a camada inteira que não chegou, não
  // a sincronização rodoviária.
  const avisosRodoviarios = state.polygons.length === 0 ? [] : validateRoadSegmentLayer(
    state.polygons,
    // Ids com dia medido, não as chaves do mapa: um trecho sem série continua no
    // `bySegmentId`, e passar as chaves aprovaria em silêncio o caso que a conferência
    // existe para apontar.
    { trafficSegmentIds: segmentIdsWithTraffic(state.traffic.bySegmentId) },
  ).warnings;
  state.baseWarnings = [...state.baseWarnings, ...avisosRodoviarios];
  renderPolygonLegend();
  renderTrafficPanel();

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

  applyUrlParams();
  refreshMarketView();
  refreshPdadView();
  render();

  // Enquadra o que tem coordenada, para a primeira tela não depender do zoom padrão.
  //
  // Os eixos rodoviários entram no mesmo cálculo (issue #131): um trecho desenhado fora do
  // enquadramento inicial é, para quem abre a página, indistinguível de um trecho que não
  // foi desenhado. Sem trecho nenhum, a lista de pares é a mesma de antes e o
  // enquadramento não muda.
  const pontos = [
    ...state.records.filter((r) => r.coord).map((r) => [r.coord.lat, r.coord.lon]),
    ...roadSegmentBounds(state.polygons),
  ];
  if (pontos.length > 0) {
    map.fitBounds(pontos, { padding: [40, 40] });
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
  renderLayerSamples();
  dom.clearFilters.addEventListener('click', clearFilters);
  dom.closeDetail.addEventListener('click', closeDetail);
  dom.railToggle.addEventListener('click', toggleRail);
  dom.panelToggle.addEventListener('click', togglePanel);
  dom.retryBtn.addEventListener('click', () => { load().catch(reportFatal); });

  // Delegação: as pílulas são geradas a cada carga da série, e ouvir no container evita
  // reamarrar seis ouvintes toda vez.
  dom.marketRegioesFaixa.addEventListener('click', (event) => {
    const chip = event.target.closest('.market-chip');
    if (!chip) return;
    state.marketRegionBucket = chip.dataset.faixa;
    renderMarketRegioes();
  });

  dom.marketCompare.addEventListener('click', (event) => {
    const chip = event.target.closest('.market-chip');
    if (!chip || !state.marketSelection) return;
    state.marketCompare = chip.dataset.compare;
    refreshMarketView();
  });
  dom.marketRegioesModo.addEventListener('click', (event) => {
    const chip = event.target.closest('.market-chip');
    if (!chip) return;
    state.marketRegionScatterMode = chip.dataset.scatterModo;
    renderMarketRegioes();
    syncHash();
  });
  dom.copyLink.addEventListener('click', () => { copyAnalysisLink(); });
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

  // Preço FipeZap — DF: mesmo padrão de delegação/listener do bloco do IVV acima, filtro
  // de período próprio (ver comentário em `index.html`).
  dom.fipezapPeriodChips.addEventListener('click', (event) => {
    const chip = event.target.closest('.market-chip');
    if (!chip || !state.fipezapSelection) return;
    state.fipezapSelection.mode = chip.dataset.mode;
    refreshMarketView();
  });
  dom.fipezapYear.addEventListener('change', () => {
    if (!state.fipezapSelection) return;
    state.fipezapSelection.year = Number(dom.fipezapYear.value);
    refreshMarketView();
  });
  for (const input of [dom.fipezapStart, dom.fipezapEnd]) {
    input.addEventListener('change', () => {
      if (!state.fipezapSelection) return;
      state.fipezapSelection.start = dom.fipezapStart.value;
      state.fipezapSelection.end = dom.fipezapEnd.value;
      refreshMarketView();
    });
  }

  // Preço FipeZap — por Região Administrativa: trocar o segmento reseta a localidade
  // escolhida, porque a lista de opções muda (Residencial e Comercial não publicam as
  // mesmas 29 localidades) e a escolhida pode não existir mais no novo segmento.
  dom.fipezapSegment.addEventListener('click', (event) => {
    const chip = event.target.closest('.market-chip');
    if (!chip) return;
    state.fipezapLocalitySegment = chip.dataset.segmento;
    state.fipezapLocalityChoice = null;
    refreshMarketView();
  });
  dom.fipezapLocality.addEventListener('change', () => {
    state.fipezapLocalityChoice = dom.fipezapLocality.value;
    refreshMarketView();
  });

  // A largura do desenho é medida, então quem avisa que ela mudou é o observador de
  // tamanho — e não um `matchMedia`, que só dispararia no ponto de quebra e deixaria
  // passar toda mudança de largura entre eles (issue #85).
  observarLarguraDosGraficos();

  // Diagnóstico Territorial PDAD-A (issue #100). Trocar o ano repovoa o filtro de RA
  // primeiro — a lista de RAs disponíveis muda com o ano (2021 só tem o Plano Piloto) —
  // e só então redesenha KPIs/cartões.
  dom.pdadYear.addEventListener('change', () => {
    if (!state.pdadFilters) return;
    state.pdadFilters.year = Number(dom.pdadYear.value);
    populatePdadRaFilter();
    refreshPdadView();
  });
  dom.pdadRa.addEventListener('change', () => {
    if (!state.pdadFilters) return;
    state.pdadFilters.ra = dom.pdadRa.value;
    refreshPdadView();
  });
  dom.pdadTema.addEventListener('change', () => {
    if (!state.pdadFilters) return;
    state.pdadFilters.tema = dom.pdadTema.value;
    refreshPdadView();
  });
  dom.pdadReset.addEventListener('click', () => {
    if (!state.pdadFilters) return;
    const anoPadrao = pdadYearsAvailable(state.pdadData)[0];
    state.pdadFilters = { ra: 'all', year: anoPadrao, tema: 'all' };
    dom.pdadYear.value = String(anoPadrao);
    populatePdadRaFilter();
    dom.pdadTema.value = 'all';
    refreshPdadView();
  });

  // Dispersão (issue #102): trocar a leitura redesenha o gráfico; clicar num ponto foca
  // aquela RA no filtro principal do Diagnóstico, mesma leitura do protótipo de referência.
  dom.pdadScatterView.addEventListener('change', () => {
    if (state.pdadData.length) renderPdadScatter();
  });
  dom.pdadScatterPlot.addEventListener('click', (event) => {
    const alvo = event.target.closest('[data-drill-ra]');
    if (!alvo || !state.pdadFilters) return;
    state.pdadFilters.ra = alvo.dataset.drillRa;
    dom.pdadRa.value = alvo.dataset.drillRa;
    refreshPdadView();
  });

  // Drill-down (issue #102): qualquer elemento com `data-drill-category` desenhado por
  // `src/pdad/charts.js` abre o modal por delegação — a RA usada é a única selecionada,
  // ou a primeira em ordem alfabética quando o filtro está em "Todas as RAs".
  dom.pdadTemaBlocks.addEventListener('click', (event) => {
    const alvo = event.target.closest('[data-drill-category]');
    if (!alvo || !state.pdadFilters) return;
    const key = pdadCardKeyOf(alvo);
    const raIds = pdadSelectedRaIds();
    if (!key || !raIds.length) return;
    openPdadDrill({
      key, raGeoId: raIds[0], year: state.pdadFilters.year,
      category: alvo.dataset.drillCategory, group: alvo.dataset.drillGroup || null,
    });
  });

  // Ranking dos territórios (issue #102).
  dom.pdadRankRa.addEventListener('change', () => {
    if (!state.pdadRankState) return;
    state.pdadRankState.ra = dom.pdadRankRa.value;
    renderPdadRankingView();
    if (viewFromHash() === 'ranking') syncHash();
  });
  dom.pdadRankIndicator.addEventListener('change', () => {
    if (!state.pdadRankState) return;
    state.pdadRankState.indicatorId = dom.pdadRankIndicator.value;
    renderPdadRankTable();
  });
  dom.pdadRankMode.addEventListener('click', (event) => {
    const botao = event.target.closest('button[data-mode]');
    if (!botao || !state.pdadRankState) return;
    state.pdadRankState.mode = botao.dataset.mode;
    renderPdadRankingView();
  });
  dom.pdadRankExport.addEventListener('click', () => {
    const item = PDAD_RANK_SET.find((i) => i.id === state.pdadRankState?.indicatorId);
    if (!item) return;
    const ano = pdadPrimaryYear();
    const ras = rasForYear(state.pdadIndex, ano);
    const header = ['ra_geo_id', 'ra_name', 'indicador', 'ano', 'percentual', 'total_estimado'];
    const linhas = ras.map((ra) => {
      const p = rankScalar(ra, item);
      const t = pdadRankAbsValue(ra, item);
      return [ra.raGeoId, ra.raName, item.label, ano, Number.isFinite(p) ? p : '', Number.isFinite(t) ? t : ''];
    });
    downloadCsv(`pdad_ranking_${item.id}.csv`, rowsToCsv(header, linhas));
  });
  dom.pdadRankCards.addEventListener('click', (event) => {
    const alvo = event.target.closest('[data-pdad-indicator-key]');
    if (!alvo || !state.pdadRankState) return;
    openPdadDrill({
      key: alvo.dataset.pdadIndicatorKey, raGeoId: state.pdadRankState.ra,
      year: pdadPrimaryYear(), category: alvo.dataset.drillCategory,
    });
  });

  // Comparar RAs (issue #102).
  dom.pdadCvRaAdd.addEventListener('click', () => pdadCvAddRa(dom.pdadCvRaSelect.value));
  dom.pdadCvRaTop.addEventListener('click', () => {
    const ano = pdadPrimaryYear();
    const top6 = [...rasForYear(state.pdadIndex, ano)].sort((a, b) => b.population - a.population).slice(0, 6);
    state.pdadCompareState.ras = top6.map((ra) => ra.raGeoId);
    state.pdadCompareState.colors = {};
    for (const ra of top6) pdadCvColorFor(ra.raGeoId);
    renderPdadCompareView();
  });
  dom.pdadCvIndAdd.addEventListener('click', () => pdadCvAddInd(dom.pdadCvIndSelect.value));
  dom.pdadCvKits.addEventListener('click', (event) => {
    const botao = event.target.closest('button[data-kit]');
    if (!botao) return;
    const kit = PDAD_COMPARE_KITS[botao.dataset.kit];
    if (!kit) return;
    state.pdadCompareState.inds = kit.keys.slice(0, PDAD_CV_MAX_INDS);
    renderPdadCompareView();
  });
  dom.pdadCvRas.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-ra-geo-id]');
    if (chip) pdadCvRemoveRa(chip.dataset.raGeoId);
  });
  dom.pdadCvInds.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-ind-key]');
    if (chip) pdadCvRemoveInd(chip.dataset.indKey);
  });
  dom.pdadCvClear.addEventListener('click', () => {
    state.pdadCompareState = { ras: [], inds: [], colors: {} };
    renderPdadCompareView();
  });
  dom.pdadCvExport.addEventListener('click', () => {
    const ano = pdadPrimaryYear();
    const ras = state.pdadCompareState.ras
      .map((id) => rasForYear(state.pdadIndex, ano).find((ra) => ra.raGeoId === id)).filter(Boolean);
    if (ras.length < 2 || !state.pdadCompareState.inds.length) return;
    const header = ['indicador', 'categoria', 'ra_geo_id', 'ra_name', 'percentual'];
    const linhas = [];
    for (const key of state.pdadCompareState.inds) {
      const meta = PDAD_INDICATOR_LIST.find((i) => i.key === key);
      for (const ra of ras) {
        for (const valor of pdadCvValues(ra, key)) {
          linhas.push([meta?.label || key, valor.label, ra.raGeoId, ra.raName, Number.isFinite(valor.pct) ? valor.pct : '']);
        }
      }
    }
    downloadCsv('pdad_comparacao_ras.csv', rowsToCsv(header, linhas));
  });
  dom.pdadCvSummary.addEventListener('click', (event) => {
    const linha = event.target.closest('[data-drill-ra]');
    if (!linha || !state.pdadFilters) return;
    state.pdadFilters.ra = linha.dataset.drillRa;
    dom.pdadRa.value = linha.dataset.drillRa;
    refreshPdadView();
    setView('diagnostico');
  });
  dom.pdadCvBlocks.addEventListener('click', (event) => {
    const alvo = event.target.closest('[data-drill-category]');
    if (!alvo) return;
    const key = alvo.dataset.pdadIndicatorKey;
    const raGeoId = alvo.dataset.drillRa;
    if (!key || !raGeoId) return;
    openPdadDrill({
      key, raGeoId, year: pdadPrimaryYear(),
      category: alvo.dataset.drillCategory, group: alvo.dataset.drillGroup || null,
    });
  });

  // Modal de drill-down (issue #102).
  dom.pdadDrillRows.addEventListener('click', (event) => {
    const tr = event.target.closest('[data-drill-category]');
    if (!tr || !state.pdadDrillState) return;
    state.pdadDrillState.category = tr.dataset.drillCategory;
    state.pdadDrillState.group = tr.dataset.drillGroup || null;
    renderPdadDrillRank();
  });
  dom.pdadDrillRa.addEventListener('change', () => {
    if (!state.pdadDrillState) return;
    state.pdadDrillState.raGeoId = dom.pdadDrillRa.value;
    renderPdadDrill();
  });
  dom.pdadDrillYear.addEventListener('change', () => {
    if (!state.pdadDrillState) return;
    state.pdadDrillState.year = Number(dom.pdadDrillYear.value);
    renderPdadDrill();
  });
  dom.pdadDrillClose.addEventListener('click', closePdadDrill);
  dom.pdadDrillOverlay.addEventListener('click', (event) => {
    if (event.target === dom.pdadDrillOverlay) closePdadDrill();
  });
  dom.pdadDrillExport.addEventListener('click', () => {
    const s = state.pdadDrillState;
    if (!s) return;
    const linhas = detailRowsForKey(state.pdadData, { raGeoId: s.raGeoId, year: s.year, key: s.key });
    const header = [
      'ra_geo_id', 'pdad_year', 'indicator_code', 'segment_dimension', 'segment_value',
      'categoria', 'total_estimado', 'percentual', 'status',
    ];
    const corpo = linhas.map((item) => [
      item.raGeoId, item.pdadYear, item.indicatorCode, item.segmentDimension || '', item.segmentValue || '',
      item.responseCategory || item.categoryStandard || item.categoryRaw || '',
      Number.isFinite(item.estimateTotal) ? item.estimateTotal : '',
      Number.isFinite(item.estimatePct) ? item.estimatePct : '',
      item.sourceValueStatus || '',
    ]);
    downloadCsv(`pdad_${s.year}_${s.raGeoId}_${s.key}.csv`, rowsToCsv(header, corpo));
  });

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
    if (event.key !== 'Escape') return;
    if (!dom.detail.hidden) closeDetail();
    if (!dom.pdadDrillOverlay.hidden) closePdadDrill();
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
