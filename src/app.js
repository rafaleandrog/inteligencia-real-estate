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
import {
  anchorLegendGroups, applyFilters, computeKpis, createFilterState, distinctAnchorGroups,
  distinctAnchorSegments, distinctLocalities, distinctPropertyTypes, distinctRegions,
  distinctRegularizationStatuses, distinctSalesStages, LAYERS,
} from './filters.js';
import {
  formatBRL, formatBRLCompact, formatM2, formatNumber, formatPriceM2, formatDate,
  formatPropertyType, formatSpatialPrecision, formatBuildingOrientation, safeExternalUrl,
  hostnameOf, anchorColor, anchorLegendEntries, formatAnchorCategory, formatAnchorGroup,
  formatAnchorSegment, formatSalesStage, formatRegularizationStatus, formatPercent,
  raAgeBands,
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
  warnings: el('warnings'), sourceBadge: el('sourceBadge'),
  datasetMeta: el('datasetMeta'), datasetMetaList: el('datasetMetaList'),
  datasetMetaSummary: el('datasetMetaSummary'),
  detail: el('detail'), detailTitle: el('detailTitle'), detailBody: el('detailBody'),
  closeDetail: el('closeDetail'),
  anchorLegend: el('anchorLegend'),
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

  const dl = document.createElement('dl');

  if (record.kind === 'listing') {
    addRow(dl, 'Tipo', formatPropertyType(record.property_type));
    // Derivada de Tipo, sem depender do backend (issue #31) — o empreendimento traz a
    // mesma linha, vinda da coluna própria dele.
    addRow(dl, 'Vertical / horizontal', formatBuildingOrientation(record.building_orientation));
    addRow(dl, 'Localidade', record.locality);
    addRow(dl, 'Endereço', record.address);
    addRow(dl, 'Preço pedido', formatBRL(record.price));
    addRow(dl, 'Área', formatM2(record.area_m2));
    addRow(dl, 'Preço/m²', formatPriceM2(record.price_m2));
    addRow(dl, 'Quartos', record.bedrooms === null ? '' : formatNumber(record.bedrooms));
    addRow(dl, 'Suítes', record.suites === null ? '' : formatNumber(record.suites));
    addRow(dl, 'Vagas', record.parking_spaces === null ? '' : formatNumber(record.parking_spaces));
    addRow(dl, 'Condomínio', formatBRL(record.condo_fee_brl));
    addRow(dl, 'IPTU', formatBRL(record.iptu_brl));
    // Exibição pública decidida pelo dono do repositório na issue #32. A ressalva de
    // procedência vai logo abaixo da lista, em `buildRegularizationNotice`.
    addRow(dl, 'Regularização', formatRegularizationStatus(record.regularization_status));
    addRow(dl, 'Portal', record.source);
    addRow(dl, 'Observado em', formatDate(record.observed_at));
  } else if (record.kind === 'development') {
    addRow(dl, 'Incorporadora', record.developer_name);
    addRow(dl, 'Bairro', record.locality);
    addRow(dl, 'Endereço', record.address);
    addRow(dl, 'Situação', record.status);
    // O estágio de comercialização (issue #30) aparece como selo no topo do card, não
    // como linha aqui — ver `buildDetailBody`.
    addRow(dl, 'Vertical / horizontal', formatBuildingOrientation(record.building_orientation));
    addRow(dl, 'Regularização', formatRegularizationStatus(record.regularization_status));
    addRow(dl, 'Segmento', record.segment);
    addRow(dl, 'Produto', record.product);
    addRow(dl, 'Unidades', record.units_total === null ? '' : formatNumber(record.units_total));
    addRow(dl, 'Área', record.area_min_m2 === null ? ''
      : `${formatM2(record.area_min_m2)} – ${formatM2(record.area_max_m2)}`);
    addRow(dl, 'Obra', record.work_progress_pct === null ? '' : `${record.work_progress_pct}%`);
    addRow(dl, 'Entrega prevista', record.expected_delivery);
    addRow(dl, 'Verificado em', formatDate(record.observed_at));
  } else {
    // Classificação em dois eixos (issue #26) primeiro, `category`/`subcategory`
    // depois: o vocabulário novo é o que a legenda e o mapa usam, o antigo continua
    // visível enquanto a planilha ainda o carrega. `addRow` omite o que estiver vazio,
    // então uma âncora sem grupo/segmento mostra exatamente o que mostrava antes.
    addRow(dl, 'Grupo', formatAnchorGroup(record.group));
    addRow(dl, 'Segmento', formatAnchorSegment(record.segment));
    addRow(dl, 'Categoria', formatAnchorCategory(record.category));
    addRow(dl, 'Subcategoria', record.subcategory);
    addRow(dl, 'Marca', record.brand_name);
    addRow(dl, 'Área ocupada', formatM2(record.occupied_area_m2));
    addRow(dl, 'Operador', record.operator_name);
    addRow(dl, 'Bairro', record.locality);
    addRow(dl, 'Endereço', record.address);
    addRow(dl, 'Verificado em', formatDate(record.observed_at));
  }

  if (dl.childElementCount > 0) frag.append(dl);

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
  const { bands, total } = raAgeBands(profile);
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

async function load() {
  showLoading(true);
  dom.errorState.hidden = true;
  dom.warnings.hidden = true;

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
