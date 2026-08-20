// Interação, mapa e ligação entre filtros e dados.
//
// A lógica testável mora nos módulos puros (normalize, filters, format). Aqui fica
// apenas o que precisa do DOM e do Leaflet.
//
// Regra de segurança que vale para o arquivo inteiro: nenhuma string vinda dos dados
// entra em innerHTML. Todo texto vai por textContent e todo elemento é criado com
// createElement (docs/ENGINEERING_RULES.md, R4.4).

import { loadDataset, flattenEntities } from './data.js';
import { isApproximateLocation } from './normalize.js';
import {
  applyFilters, computeKpis, createFilterState, distinctLocalities,
  distinctPropertyTypes, LAYERS,
} from './filters.js';
import {
  formatBRL, formatBRLCompact, formatM2, formatNumber, formatPriceM2, formatDate,
  formatPropertyType, safeExternalUrl, hostnameOf,
} from './format.js';

const CONFIG = window.APP_CONFIG || {};

const el = (id) => document.getElementById(id);

const dom = {
  search: el('search'), locality: el('locality'), ptype: el('ptype'),
  priceMin: el('priceMin'), priceMax: el('priceMax'), beds: el('beds'),
  clearFilters: el('clearFilters'), layers: el('layers'),
  kpiVisible: el('kpiVisible'), kpiMedian: el('kpiMedian'), kpiNote: el('kpiNote'),
  loadingState: el('loadingState'), errorState: el('errorState'),
  errorTitle: el('errorTitle'), errorDetail: el('errorDetail'), retryBtn: el('retryBtn'),
  warnings: el('warnings'), sourceBadge: el('sourceBadge'),
  detail: el('detail'), detailTitle: el('detailTitle'), detailBody: el('detailBody'),
  closeDetail: el('closeDetail'),
};

const state = {
  records: [],
  filters: createFilterState(),
  markers: new Map(),
  selectedId: null,
};

let map = null;
let markerLayer = null;

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

  markerLayer = L.layerGroup().addTo(map);
}

/** Desenha os marcadores dos registros filtrados que têm coordenada. */
function renderMarkers(records) {
  markerLayer.clearLayers();
  state.markers.clear();

  for (const record of records) {
    if (!record.coord) continue; // sem coordenada o registro existe, mas não é mapeável

    const marker = L.circleMarker([record.coord.lat, record.coord.lon], {
      radius: MARKER_RADIUS[record.kind] || 6,
      className: `marker marker-${record.kind}`,
      color: '#fff',
      weight: 2,
      fillOpacity: 0.9,
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
    box.append(document.createElement('br'));
    const code = document.createElement('code');
    code.textContent = precision;
    box.append(code);
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

function buildDetailBody(record) {
  const frag = document.createDocumentFragment();

  const kind = document.createElement('span');
  kind.className = 'detail-kind';
  kind.dataset.kind = record.kind;
  kind.textContent = LAYER_LABEL[record.kind] || record.kind;
  frag.append(kind);

  frag.append(buildPrecisionNotice(record));

  const dl = document.createElement('dl');

  if (record.kind === 'listing') {
    addRow(dl, 'Tipo', formatPropertyType(record.property_type));
    addRow(dl, 'Localidade', record.locality);
    addRow(dl, 'Preço pedido', formatBRL(record.price));
    addRow(dl, 'Área', formatM2(record.area_m2));
    addRow(dl, 'Preço/m²', formatPriceM2(record.price_m2));
    addRow(dl, 'Quartos', record.bedrooms === null ? '' : formatNumber(record.bedrooms));
    addRow(dl, 'Suítes', record.suites === null ? '' : formatNumber(record.suites));
    addRow(dl, 'Vagas', record.parking_spaces === null ? '' : formatNumber(record.parking_spaces));
    addRow(dl, 'Condomínio', formatBRL(record.condo_fee_brl));
    addRow(dl, 'IPTU', formatBRL(record.iptu_brl));
    addRow(dl, 'Portal', record.source);
    addRow(dl, 'Observado em', formatDate(record.observed_at));
  } else if (record.kind === 'development') {
    addRow(dl, 'Incorporadora', record.developer_name);
    addRow(dl, 'Bairro', record.locality);
    addRow(dl, 'Situação', record.status);
    addRow(dl, 'Segmento', record.segment);
    addRow(dl, 'Produto', record.product);
    addRow(dl, 'Unidades', record.units_total === null ? '' : formatNumber(record.units_total));
    addRow(dl, 'Área', record.area_min_m2 === null ? ''
      : `${formatM2(record.area_min_m2)} – ${formatM2(record.area_max_m2)}`);
    addRow(dl, 'Obra', record.work_progress_pct === null ? '' : `${record.work_progress_pct}%`);
    addRow(dl, 'Entrega prevista', record.expected_delivery);
    addRow(dl, 'Verificado em', formatDate(record.observed_at));
  } else {
    addRow(dl, 'Categoria', record.category);
    addRow(dl, 'Subcategoria', record.subcategory);
    addRow(dl, 'Operador', record.operator_name);
    addRow(dl, 'Bairro', record.locality);
    addRow(dl, 'Endereço', record.address);
    addRow(dl, 'Verificado em', formatDate(record.observed_at));
  }

  if (dl.childElementCount > 0) frag.append(dl);

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
  state.filters.propertyType = dom.ptype.value;
  state.filters.priceMin = numberFieldValue(dom.priceMin);
  state.filters.priceMax = numberFieldValue(dom.priceMax);

  const beds = dom.beds.value;
  state.filters.bedrooms = beds === '' ? null : Number(beds);

  const layers = new Set();
  for (const input of dom.layers.querySelectorAll('input[data-layer]')) {
    if (input.checked) layers.add(input.dataset.layer);
  }
  state.filters.layers = layers;
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

function render() {
  readFilters();
  const visible = applyFilters(state.records, state.filters);
  renderMarkers(visible);
  renderKpis(computeKpis(visible));

  // Detalhe aberto de um registro que saiu do filtro deixa de fazer sentido.
  if (state.selectedId && !visible.some((r) => recordKey(r) === state.selectedId)) closeDetail();
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

function clearFilters() {
  dom.search.value = '';
  dom.locality.value = '';
  dom.ptype.value = '';
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
  if (messages.length === 0) { dom.warnings.hidden = true; return; }

  const title = document.createElement('strong');
  title.textContent = 'Avisos sobre os dados';
  const list = document.createElement('ul');
  for (const message of messages) {
    const li = document.createElement('li');
    li.textContent = message;
    list.append(li);
  }
  dom.warnings.replaceChildren(title, list);
  dom.warnings.hidden = false;
  console.warn('[imob] avisos:', messages);
}

/** Rótulo da origem dos dados. Modo demo precisa ser óbvio na tela (R2.3). */
function showSourceBadge(source) {
  const label = { demo: 'Modo demonstração', gviz: 'Dados: Google Sheets', appsscript: 'Dados: Apps Script' };
  dom.sourceBadge.textContent = label[source] || source;
  dom.sourceBadge.dataset.source = source;
  dom.sourceBadge.hidden = false;
}

// --- Carregamento ---------------------------------------------------------

async function load() {
  showLoading(true);
  dom.errorState.hidden = true;
  dom.warnings.hidden = true;

  const result = await loadDataset(CONFIG);
  showLoading(false);
  showSourceBadge(result.source);

  if (!result.ok) {
    showError(result.errors);
    return;
  }

  state.records = flattenEntities(result.entities);

  populateSelect(dom.locality, distinctLocalities(state.records));
  populateSelect(dom.ptype, distinctPropertyTypes(state.records), formatPropertyType);

  showWarnings([...result.warnings, ...result.errors]);
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
  for (const node of [dom.locality, dom.ptype, dom.beds]) {
    node.addEventListener('change', render);
  }
  dom.layers.addEventListener('change', render);
  dom.clearFilters.addEventListener('click', clearFilters);
  dom.closeDetail.addEventListener('click', closeDetail);
  dom.retryBtn.addEventListener('click', () => { load().catch(reportFatal); });

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
