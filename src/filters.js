// Filtros, estatística e KPIs.
//
// Funções puras sobre registros já normalizados (ver src/normalize.js). Nada aqui
// toca o DOM nem a rede — é a camada que os testes cobrem de verdade.

import { isApproximateLocation } from './normalize.js';

/** Camadas exibíveis no mapa, na ordem em que aparecem na interface. */
export const LAYERS = ['listing', 'development', 'anchor'];

/** Estado inicial dos filtros: tudo visível, nada restrito. */
export function createFilterState() {
  return {
    search: '',
    locality: '',
    propertyType: '',
    priceMin: null,
    priceMax: null,
    bedrooms: null,
    ra: '',
    buildingOrientation: '',
    anchorGroup: '',
    anchorSegment: '',
    layers: new Set(LAYERS),
  };
}

/**
 * Mediana de uma lista de números.
 *
 * Ignora `null`, `undefined` e não-finitos em vez de deixá-los virar `NaN` — no
 * dataset real muitos registros não têm preço/m². Lista vazia devolve `null`,
 * nunca `NaN`: "não há mediana" é uma resposta, `NaN` é um bug que vaza para a tela.
 */
export function median(values) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) return null;
  nums.sort((a, b) => a - b);
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
}

/** Normaliza texto para busca: minúsculas e sem acento. */
export function normalizeSearchText(value) {
  return String(value === null || value === undefined ? '' : value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Campos que a busca livre percorre. */
function searchableText(record) {
  return normalizeSearchText(
    [record.title, record.locality, record.address, record.property_type, record.developer_name, record.category, record.segment]
      .filter(Boolean)
      .join(' ')
  );
}

/**
 * Um registro passa pelo filtro?
 *
 * Regra geral: filtro vazio não restringe. Um registro **sem** o dado que o filtro
 * examina é excluído quando o filtro está ativo — quem pediu "até R$ 500 mil" não
 * quer ver imóvel sem preço, mas quem não filtrou preço quer ver todos.
 */
export function matchesFilters(record, state) {
  if (!record) return false;
  if (state.layers && !state.layers.has(record.kind)) return false;

  if (state.search) {
    const needle = normalizeSearchText(state.search);
    if (needle && !searchableText(record).includes(needle)) return false;
  }

  if (state.locality && record.locality !== state.locality) return false;

  // Região Administrativa (issue #33): existe nos três tipos de registro, então não
  // restringe camada como o filtro de tipo de imóvel faz.
  if (state.ra && record.ra_geo_id !== state.ra) return false;

  // Vertical/horizontal (issue #31): hoje só anúncios têm o campo preenchido
  // (derivado de property_type); empreendimentos aguardam coluna do backend.
  // Registro sem o campo é excluído quando o filtro está ativo, mesma regra geral.
  if (state.buildingOrientation && record.building_orientation !== state.buildingOrientation) return false;

  // Grupo e segmento (issue #26) só existem em âncoras. Como o filtro de tipo de
  // imóvel, filtrar por eles esconde as outras camadas: quem escolheu "Infraestrutura"
  // está olhando para o entorno, não para imóveis à venda.
  //
  // `segment` também existe em DEVELOPMENTS ("alto padrão"), com significado
  // completamente diferente — daí a checagem de `kind` vir ANTES da comparação de
  // valor, e não como consequência dela.
  if (state.anchorGroup) {
    if (record.kind !== 'anchor') return false;
    if (record.group !== state.anchorGroup) return false;
  }

  if (state.anchorSegment) {
    if (record.kind !== 'anchor') return false;
    if (record.segment !== state.anchorSegment) return false;
  }

  // Tipo de imóvel só existe em anúncios. Filtrar por tipo esconde as outras camadas,
  // que é o comportamento esperado: o usuário está procurando um tipo de imóvel.
  if (state.propertyType) {
    if (record.kind !== 'listing') return false;
    if (record.property_type !== state.propertyType) return false;
  }

  if (state.priceMin !== null && state.priceMin !== undefined) {
    const ceiling = record.price_max_brl ?? record.price;
    if (ceiling === null || ceiling === undefined || ceiling < state.priceMin) return false;
  }

  if (state.priceMax !== null && state.priceMax !== undefined) {
    const floor = record.price_min_brl ?? record.price;
    if (floor === null || floor === undefined || floor > state.priceMax) return false;
  }

  if (state.bedrooms !== null && state.bedrooms !== undefined) {
    const max = record.bedrooms_max ?? record.bedrooms;
    if (max === null || max === undefined) return false;
    if (max < state.bedrooms) return false;
  }

  return true;
}

/** Aplica os filtros a um conjunto de registros. */
export function applyFilters(records, state) {
  return (records || []).filter((r) => matchesFilters(r, state));
}

/**
 * KPIs do conjunto visível.
 *
 * `mappable` conta os registros que têm coordenada; a diferença para `visible` é o
 * que o mapa não consegue mostrar — 7 dos 22 empreendimentos do dataset atual estão
 * nesse caso, e omitir esse número em silêncio seria esconder um buraco no dado (R5.7).
 *
 * A mediana de preço/m² usa apenas anúncios secundários. Empreendimentos e âncoras
 * não têm preço/m² comparável no contrato atual.
 */
export function computeKpis(records) {
  const list = records || [];
  const priced = list.filter(
    (r) => r.kind === 'listing' && typeof r.price_m2 === 'number' && Number.isFinite(r.price_m2)
  );

  return {
    visible: list.length,
    mappable: list.filter((r) => r.coord).length,
    withoutCoord: list.filter((r) => !r.coord).length,
    approximate: list.filter((r) => r.coord && isApproximateLocation(r)).length,
    medianPriceM2: median(priced.map((r) => r.price_m2)),
    medianPriceM2Sample: priced.length,
    byKind: LAYERS.reduce((acc, kind) => {
      acc[kind] = list.filter((r) => r.kind === kind).length;
      return acc;
    }, {}),
  };
}

/** Localidades distintas presentes nos dados, ordenadas para o select. */
export function distinctLocalities(records) {
  const set = new Set();
  for (const r of records || []) if (r.locality) set.add(r.locality);
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Tipos de imóvel distintos presentes nos anúncios. */
export function distinctPropertyTypes(records) {
  const set = new Set();
  for (const r of records || []) if (r.kind === 'listing' && r.property_type) set.add(r.property_type);
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Códigos de Região Administrativa (`ra_geo_id`) distintos presentes nos dados
 * (issue #33). Devolve o código bruto, não o nome — rotular com `RA_PROFILES` é
 * responsabilidade de quem renderiza (`src/app.js`), para este módulo continuar
 * puro e sem depender de outra fonte além dos próprios registros.
 */
export function distinctRegions(records) {
  const set = new Set();
  for (const r of records || []) if (r.ra_geo_id) set.add(r.ra_geo_id);
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Grupos de âncora (`group`) distintos presentes nos dados, na ordem em que a
 * interface os apresenta: os dois valores do enum primeiro, qualquer valor
 * inesperado da planilha depois (em ordem alfabética). Âncora sem `group` não
 * entra na lista — "sem grupo" não é um grupo para filtrar por ele.
 */
export const ANCHOR_GROUP_ORDER = ['infraestrutura', 'comercio_servico'];

function compareAnchorGroups(a, b) {
  const ia = ANCHOR_GROUP_ORDER.indexOf(a);
  const ib = ANCHOR_GROUP_ORDER.indexOf(b);
  if (ia !== -1 || ib !== -1) {
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  }
  return a.localeCompare(b, 'pt-BR');
}

export function distinctAnchorGroups(records) {
  const set = new Set();
  for (const r of records || []) if (r.kind === 'anchor' && r.group) set.add(r.group);
  return [...set].sort(compareAnchorGroups);
}

/**
 * Segmentos de âncora distintos. Com `group` informado, restringe aos segmentos
 * daquele grupo — é o que mantém o select de segmento coerente com o de grupo em
 * vez de oferecer combinação que devolve conjunto vazio.
 *
 * Devolve o slug bruto: traduzir é responsabilidade de quem renderiza
 * (`formatAnchorSegment`), para este módulo continuar puro.
 */
export function distinctAnchorSegments(records, group = '') {
  const set = new Set();
  for (const r of records || []) {
    if (r.kind !== 'anchor' || !r.segment) continue;
    if (group && r.group !== group) continue;
    set.add(r.segment);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Modelo da legenda de âncoras em dois níveis (issue #26): grupo → entradas.
 *
 * Cada entrada guarda o par (`segment`, `category`) INTEIRO, não só o campo mais
 * fino. Guardar só o `segment` parecia bastar e não bastava: a cor do marcador cai de
 * `segment` para `category` quando o segmento é desconhecido, então uma âncora
 * `segment: "food_hall"` + `category: "escola"` sai âmbar no mapa e sairia verde na
 * legenda — legenda e mapa divergindo exatamente no caso que o vocabulário aberto
 * torna comum. Quem resolve o par em rótulo e cor é `anchorLegendEntries` em
 * `src/format.js`, com a mesma cadeia do marcador, e é lá que entradas que caem no
 * mesmo rótulo e na mesma cor se fundem numa linha só.
 *
 * Âncora sem nenhum dos dois vira uma entrada `{ segment: '', category: '' }`, porque
 * ela ESTÁ no mapa com o verde padrão e omiti-la da legenda esconderia um ponto
 * visível (R5.7).
 *
 * `group: ''` agrupa as âncoras ainda não classificadas — o estado da planilha antes
 * de o backend derivar a coluna. Quando NENHUMA âncora tem grupo, o resultado é uma
 * lista de um grupo só, e quem renderiza omite o título em vez de escrever
 * "Sem classificação" sobre a legenda inteira.
 */
export function anchorLegendGroups(records) {
  const groups = new Map();

  for (const r of records || []) {
    if (r.kind !== 'anchor') continue;
    const group = r.group || '';
    const segment = r.segment || '';
    const category = r.category || '';
    const key = `${segment}\u0000${category}`;

    if (!groups.has(group)) groups.set(group, new Map());
    const entries = groups.get(group);
    if (!entries.has(key)) entries.set(key, { segment, category, count: 0 });
    entries.get(key).count += 1;
  }

  return [...groups.keys()]
    .sort((a, b) => {
      // Sem grupo é sempre o último: é ausência de classificação, não uma classe.
      if (a === '') return 1;
      if (b === '') return -1;
      return compareAnchorGroups(a, b);
    })
    .map((group) => ({ group, entries: [...groups.get(group).values()] }));
}
