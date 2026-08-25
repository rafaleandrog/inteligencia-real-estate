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
