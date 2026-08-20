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
