// Formatação para exibição e utilidades de saneamento.
//
// Funções puras. As de segurança (escapeHtml, safeExternalUrl) existem porque todo
// texto aqui vem de uma planilha pública que qualquer editor pode alterar — tratamos
// o dado como não confiável por princípio (R4.4, R4.6).

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const DECIMAL = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** Valor em reais. `null` vira travessão, não "R$ 0" — ausência não é zero. */
export function formatBRL(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return BRL.format(value);
}

/** Valor compacto em reais, para KPI: "R$ 2,5 mi", "R$ 320 mil". */
export function formatBRLCompact(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e6) return `R$ ${(value / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1e3) return `R$ ${(value / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return BRL.format(value);
}

/** Área em metros quadrados. */
export function formatM2(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${DECIMAL.format(value)} m²`;
}

/** Preço por metro quadrado. */
export function formatPriceM2(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${BRL.format(value)}/m²`;
}

/** Número inteiro com separador de milhar. */
export function formatNumber(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return DECIMAL.format(value);
}

/** Data ISO em formato brasileiro. Entrada inválida devolve travessão. */
export function formatDate(iso) {
  if (!iso) return '—';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Escapa os cinco caracteres que quebram contexto HTML.
 *
 * A defesa principal contra XSS neste projeto é construir DOM com `textContent`
 * (R4.4). Esta função existe para os poucos lugares onde uma string precisa ser
 * concatenada em markup — e para deixar o teste de segurança explícito.
 */
export function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * URL externa segura, ou `null`.
 *
 * Só `http:` e `https:` passam. `javascript:`, `data:`, `vbscript:` e afins viram
 * `null` — sem isso, uma célula da planilha viraria execução de script no navegador
 * de quem abre o site (R4.6).
 */
export function safeExternalUrl(value) {
  const raw = String(value === null || value === undefined ? '' : value).trim();
  if (raw === '') return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.href;
}

/** Domínio de uma URL, para rotular o link da fonte. */
export function hostnameOf(value) {
  const safe = safeExternalUrl(value);
  if (!safe) return '';
  try {
    return new URL(safe).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Rótulo legível de tipo de imóvel. O dataset usa snake_case ("casa_condominio");
 * a interface mostra "Casa em condomínio".
 */
const PROPERTY_TYPE_LABELS = {
  apartamento: 'Apartamento',
  casa: 'Casa',
  casa_condominio: 'Casa em condomínio',
  kitnet: 'Kitnet',
  predio: 'Prédio',
  terreno: 'Terreno',
};

export function formatPropertyType(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === '') return '—';
  if (PROPERTY_TYPE_LABELS[key]) return PROPERTY_TYPE_LABELS[key];
  const spaced = key.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Rótulo de `building_orientation` (issue #31). Valor fora do vocabulário some, não quebra. */
const BUILDING_ORIENTATION_LABELS = { vertical: 'Vertical', horizontal: 'Horizontal' };

export function formatBuildingOrientation(value) {
  const key = String(value || '').trim().toLowerCase();
  return BUILDING_ORIENTATION_LABELS[key] || '';
}

/**
 * Vocabulário conhecido de `coordinate_precision`/`confidence_flag`/`coordinate_status`,
 * documentado em `docs/DATA_CONTRACT.md`. O contrato é explícito: esse vocabulário
 * **não é fechado** — a planilha pode trazer valor novo a qualquer momento. Por isso
 * `formatSpatialPrecision` sempre devolve algo legível: usa a tradução conhecida
 * quando existe e cai para "sem underscore, com maiúscula inicial" quando não —
 * nunca o identificador cru de pipeline (issue #21).
 */
const SPATIAL_PRECISION_LABELS = {
  locality_centroid_deterministic_jitter: 'Centro da localidade, com variação controlada',
  locality_centroid_jitter: 'Centro da localidade, com variação',
  low_spatial_high_attribute: 'Atributos confiáveis, localização aproximada',
  low_spatial_high_attributes: 'Atributos confiáveis, localização aproximada',
  medium_spatial_high_attributes: 'Atributos confiáveis, localização parcialmente apurada',
  high_attributes: 'Atributos confiáveis',
  polygon_reference_point: 'Geometria oficial do lote',
  building_reference_point: 'Referência oficial da edificação',
  official_wfs_point: 'Ponto de serviço geográfico oficial',
  school_polygon_reference_point: 'Geometria oficial do lote (escola)',
  user_supplied_reference: 'Referência informada manualmente',
  pending_exact_parcel_or_poi_validation: 'Aguardando validação exata do lote/local',
};

/** Traduz um código técnico de precisão espacial para texto legível em pt-BR. */
export function formatSpatialPrecision(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === '') return '';
  if (SPATIAL_PRECISION_LABELS[key]) return SPATIAL_PRECISION_LABELS[key];
  const spaced = key.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Humaniza um slug: `estacao_metro` → "Estacao metro". Último recurso de rótulo. */
function humanizeSlug(key) {
  const spaced = key.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Rótulo de `sales_stage` de DEVELOPMENTS (issue #30). Vocabulário **fechado** no
 * contrato — mas a planilha é pública e editável, então valor fora do enum é
 * humanizado em vez de sumir: um estágio digitado errado precisa ficar visível para
 * ser corrigido, não desaparecer da tela.
 */
const SALES_STAGE_LABELS = {
  em_construcao: 'Em construção',
  em_lancamento: 'Em lançamento',
  oferta: 'Oferta',
};

export function formatSalesStage(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === '') return '';
  return SALES_STAGE_LABELS[key] || humanizeSlug(key);
}

/**
 * Rótulo de `regularization_status` (issue #32).
 *
 * Diferente de `sales_stage`, este campo é **texto livre** no backend: o Apps Script
 * não o valida contra enum nenhum. Os três valores abaixo são os esperados, não os
 * únicos possíveis — qualquer outro é humanizado, nunca tratado como se fosse um dos
 * três (mesma lição de R8.16: vocabulário que ninguém previu cai no lado conservador).
 */
const REGULARIZATION_LABELS = {
  regularizado: 'Regularizado',
  nao_regularizado: 'Não regularizado',
  em_regularizacao: 'Em regularização',
};

export function formatRegularizationStatus(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === '') return '';
  return REGULARIZATION_LABELS[key] || humanizeSlug(key);
}

// --- Âncoras: grupo, segmento e cor no mapa (issues #22, #26, #39) ----------
//
// A classificação de âncora tem dois eixos, provisionados pelo Apps Script v2.0.0:
//
//   `group`    enum FECHADO: `infraestrutura` × `comercio_servico`
//   `segment`  vocabulário ABERTO: o backend infere 12 tipos a partir de
//              category/subcategory/name, e o resto é digitado à mão na planilha
//
// Como a planilha é pública e editável, nenhum dos dois pode ser tratado como
// vocabulário garantido: valor desconhecido é **humanizado**, nunca descartado nem
// exibido como slug cru — mesma escolha de `formatSpatialPrecision` (issue #21).

const ANCHOR_GROUP_LABELS = {
  infraestrutura: 'Infraestrutura',
  comercio_servico: 'Comércio e serviço',
};

/** Rótulo de `group`. Vazio devolve string vazia; valor fora do enum é humanizado. */
export function formatAnchorGroup(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === '') return '';
  return ANCHOR_GROUP_LABELS[key] || humanizeSlug(key);
}

const ANCHOR_SEGMENT_LABELS = {
  // Inferidos pelo backend (Code.gs, `inferAnchorSegment_`).
  escola: 'Escola',
  universidade: 'Universidade',
  supermercado: 'Supermercado',
  atacado: 'Atacado',
  hospital: 'Hospital',
  laboratorio: 'Laboratório',
  clinica: 'Clínica',
  estacao_metro: 'Estação de metrô',
  estacao_trem: 'Estação de trem',
  terminal_rodoviario: 'Terminal rodoviário',
  aeroporto: 'Aeroporto',
  ponto_onibus: 'Ponto de ônibus',
  // Digitados à mão na planilha (lista fornecida pelo usuário na issue #26).
  department_store: 'Loja de departamento',
  material_construcao: 'Material de construção',
  vestuario: 'Vestuário',
  livraria: 'Livraria',
  cinema: 'Cinema',
  moveis: 'Móveis',
  artigos_esportivos: 'Artigos esportivos',
  academia: 'Academia',
  restaurantes: 'Restaurantes',
  loja_pet: 'Loja de animais',
  posto_combustivel: 'Posto de combustível',
  hotelaria: 'Hotelaria',
};

/**
 * Rótulo de `segment`. Vocabulário aberto: termo que ninguém previu vira texto
 * legível ("food_hall" → "Food hall"), nunca o slug cru na tela.
 */
export function formatAnchorSegment(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === '') return '';
  return ANCHOR_SEGMENT_LABELS[key] || humanizeSlug(key);
}

/** Vocabulário de `category` de ANCHORS (anterior a `segment`, ver DATA_CONTRACT). */
const ANCHOR_CATEGORY_LABELS = {
  escola: 'Escola',
  mobilidade: 'Mobilidade',
  parque_equipamento_publico: 'Parque / equipamento público',
  saude: 'Saúde',
  shopping_center: 'Shopping center',
  supermercado_atacarejo: 'Supermercado / atacarejo',
  universidade: 'Universidade',
};

/** Rótulo de `category`; categoria fora do vocabulário conhecido também é humanizada. */
export function formatAnchorCategory(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === '') return '';
  return ANCHOR_CATEGORY_LABELS[key] || humanizeSlug(key);
}

/**
 * Verde padrão da âncora sem classificação reconhecida. Precisa bater com `--anchor`
 * em `assets/styles.css` — não dá para referenciar a variável CSS aqui porque o
 * Leaflet escreve `fill` como atributo de apresentação SVG (`setAttribute`), que uma
 * regra de folha de estilo (`.marker-anchor { fill: ... }`) sempre vence, mesmo vindo
 * de JS. Por isso essa regra de CSS foi removida (review do PR #40: antes disso, TODA
 * âncora saía verde, porque a regra da classe sobrepunha silenciosamente qualquer
 * `fillColor` passado ao marcador) e a cor — inclusive a de fallback — vem sempre daqui.
 */
export const ANCHOR_FALLBACK_COLOR = '#397d53';

/**
 * Cor por SEGMENTO.
 *
 * A paleta é organizada em famílias de matiz — a família diz "que tipo de coisa é
 * isto" num relance no mapa, e o passo dentro da família separa os segmentos irmãos.
 * O rótulo da legenda é o canal de identidade (nunca a cor sozinha), o que é o que
 * permite mais de 20 entradas sem exigir 20 matizes distinguíveis.
 *
 * As famílias herdam as cores que `category` já usava, para não reeducar quem
 * aprendeu o mapa atual: âmbar = educação, vermelho = saúde, turquesa =
 * abastecimento, azul = mobilidade, roxo = varejo, verde = equipamento público.
 * As famílias novas (magenta = lazer/hospedagem, marrom = construção) foram
 * escolhidas com `scripts/validate_palette.js` da skill `dataviz` — ver a seção
 * "Cores" da PR para a saída real do validador e os pares que continuam próximos.
 */
const ANCHOR_SEGMENT_COLORS = {
  // Mobilidade — azul. Quanto maior a capacidade do modal, mais escuro o tom.
  estacao_metro: '#1f4e79',
  estacao_trem: '#3e7cb1',
  aeroporto: '#4a5da3',
  terminal_rodoviario: '#6d9fcb',
  ponto_onibus: '#93b6d9',
  // Educação e cultura — âmbar.
  escola: '#c9862c',
  universidade: '#8a7a2c',
  livraria: '#b8993d',
  // Saúde — vermelho.
  hospital: '#b1473e',
  clinica: '#d3796d',
  laboratorio: '#83322a',
  // Abastecimento — turquesa.
  supermercado: '#2c9aa3',
  atacado: '#1b6d75',
  posto_combustivel: '#5cb8bf',
  // Varejo — roxo.
  department_store: '#8a4fae',
  vestuario: '#a97cc7',
  moveis: '#673889',
  artigos_esportivos: '#5d2f7d',
  loja_pet: '#c2a3da',
  // Construção e reforma — marrom.
  material_construcao: '#7d5a3c',
  // Lazer, alimentação e hospedagem — magenta.
  cinema: '#8e2f5e',
  academia: '#d16fa8',
  restaurantes: '#b3437f',
  hotelaria: '#e09ac4',
};

/** Cor por CATEGORIA — vocabulário anterior, ainda usado como fallback do segmento. */
const ANCHOR_CATEGORY_COLORS = {
  escola: '#c9862c',
  mobilidade: '#3e7cb1',
  parque_equipamento_publico: '#4f9d5b',
  saude: '#b1473e',
  shopping_center: '#8a4fae',
  supermercado_atacarejo: '#2c9aa3',
  universidade: '#8a7a2c',
};

/**
 * Cor de preenchimento de uma âncora, na ordem em que a informação fica mais fina:
 * `segment` → `category` → verde padrão. Registro que não é âncora devolve `null`,
 * e quem desenha o marcador deixa a cor com o CSS da camada.
 */
export function anchorColor(record) {
  if (!record || record.kind !== 'anchor') return null;
  const segment = String(record.segment || '').trim().toLowerCase();
  if (ANCHOR_SEGMENT_COLORS[segment]) return ANCHOR_SEGMENT_COLORS[segment];
  const category = String(record.category || '').trim().toLowerCase();
  if (ANCHOR_CATEGORY_COLORS[category]) return ANCHOR_CATEGORY_COLORS[category];
  return ANCHOR_FALLBACK_COLOR;
}

/**
 * Cor de uma entrada da legenda. Recebe o par (`segment`, `category`) e passa pela
 * MESMA função do marcador — legenda e mapa não podem resolver cor por caminhos
 * diferentes, ou divergem no primeiro segmento fora do vocabulário.
 */
export function anchorLegendColor({ segment, category }) {
  return anchorColor({ kind: 'anchor', segment, category });
}

/**
 * Entradas de legenda prontas para renderizar, a partir das entradas cruas de
 * `anchorLegendGroups` (`src/filters.js`).
 *
 * Resolve rótulo e cor pela cadeia do marcador e **funde** as entradas que caem no
 * mesmo par (rótulo, cor): `{segment:'escola', category:'escola'}` e
 * `{segment:'escola', category:''}` são a mesma linha da legenda e o mesmo ponto no
 * mapa. O que NÃO se funde é o mesmo rótulo com cores diferentes — aí são de fato
 * dois tons distintos no mapa, e esconder um deixaria um marcador sem legenda.
 *
 * Sai ordenado por rótulo, em pt-BR.
 */
export function anchorLegendEntries(entries) {
  const merged = new Map();

  for (const entry of entries || []) {
    const label = formatAnchorSegment(entry.segment)
      || formatAnchorCategory(entry.category)
      || 'Sem classificação';
    const color = anchorLegendColor(entry);
    const key = `${label}\u0000${color}`;
    if (!merged.has(key)) merged.set(key, { label, color, count: 0 });
    merged.get(key).count += entry.count || 0;
  }

  return [...merged.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}
