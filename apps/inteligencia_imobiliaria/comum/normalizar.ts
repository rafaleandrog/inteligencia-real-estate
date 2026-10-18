/**
 * Normalização portada do site (`src/normalize.js`) com os mesmos casos de teste
 * (spec 11.4). Função pura: entra valor bruto da planilha ou do CSV, sai valor
 * tipado, e `null` significa "ausente" em todo lugar — nunca `NaN`.
 */

const MS_POR_DIA = 86400000;
/** Epoch do serial de data do Excel/Sheets: 1899-12-30. */
const EPOCH_PLANILHA = Date.UTC(1899, 11, 30);

export function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  return String(valor).trim();
}

const MOEDA_PREFIXO = /^\s*(R\$|BRL)\s*/i;
const MOEDA_SUFIXO = /\s*(R\$|BRL)\s*$/i;
const UNIDADE_SUFIXO = /\s*(m²|m2|km²|km2|%|p\.p\.|pp)\s*$/i;

/**
 * Número de qualquer representação do pipeline: `19117.647`, `1.234,56`,
 * `R$ 2.500.000`, `2,500,000.50`, `120 m²`, `8,6%`. O último separador decide
 * pt-BR × en; com marcador de moeda, ponto único com três dígitos é milhar.
 */
export function numero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const bruto = texto(valor);
  if (bruto === '') return null;
  const moeda = MOEDA_PREFIXO.test(bruto) || MOEDA_SUFIXO.test(bruto);
  let s = bruto.replace(MOEDA_PREFIXO, '').replace(MOEDA_SUFIXO, '').replace(UNIDADE_SUFIXO, '').replace(/[\s ]/g, '');
  if (s === '' || !/^[-+]?[0-9.,]+$/.test(s)) return null;
  const ultimaVirgula = s.lastIndexOf(',');
  const ultimoPonto = s.lastIndexOf('.');
  const pontos = (s.match(/\./g) || []).length;
  if (ultimaVirgula !== -1 && ultimoPonto !== -1) {
    s = ultimaVirgula > ultimoPonto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (ultimaVirgula !== -1) {
    const virgulas = (s.match(/,/g) || []).length;
    const decimais = s.length - ultimaVirgula - 1;
    s = virgulas > 1 || decimais === 3 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (pontos > 1 || (pontos === 1 && moeda && /\.\d{3}$/.test(s))) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function inteiro(valor: unknown): number | null {
  const n = numero(valor);
  return n === null ? null : Math.trunc(n);
}

const VERDADEIROS = ['1', 'true', 'sim', 'yes', 'y', 'x', 'verdadeiro', 's'];
const FALSOS = ['0', 'false', 'nao', 'não', 'no', 'n', 'falso'];

/** Booleano tolerante; `null` quando vazio (a app distingue "não informado" de "não"). */
export function booleano(valor: unknown): boolean | null {
  if (typeof valor === 'boolean') return valor;
  const s = texto(valor).toLowerCase();
  if (s === '') return null;
  if (VERDADEIROS.includes(s)) return true;
  if (FALSOS.includes(s)) return false;
  const n = numero(s);
  return n === null ? null : n !== 0;
}

/** A data existe no calendário? `2026-02-30` passa no formato e não existe. */
export function dataReal(iso: string): boolean {
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!p) return false;
  const [ano, mes, dia] = [Number(p[1]), Number(p[2]), Number(p[3])];
  if (mes < 1 || mes > 12 || dia < 1) return false;
  return dia <= new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Data `AAAA-MM-DD` de ISO, `Date(a,m,d)` do GViz, `dd/mm/aaaa` ou serial de planilha. */
export function dataISO(valor: unknown): string | null {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10);
  const bruto = texto(valor);
  if (bruto === '') return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(bruto);
  if (iso) {
    const t = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return dataReal(t) ? t : null;
  }
  const gviz = /^Date\((\d+),(\d+),(\d+)/.exec(bruto);
  if (gviz) {
    const [a, m, d] = [Number(gviz[1]), Number(gviz[2]), Number(gviz[3])];
    const dt = new Date(Date.UTC(a, m, d));
    if (Number.isNaN(dt.getTime()) || dt.getUTCMonth() !== m || dt.getUTCDate() !== d) return null;
    return dt.toISOString().slice(0, 10);
  }
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(bruto);
  if (br) {
    const t = `${br[3]}-${br[2]}-${br[1]}`;
    return dataReal(t) ? t : null;
  }
  const serial = numero(bruto);
  if (serial !== null && serial > 20000 && serial < 80000) {
    const dt = new Date(EPOCH_PLANILHA + Math.floor(serial) * MS_POR_DIA);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
  }
  return null;
}

/** Instante ISO de data-hora ISO, ou de data pura (meia-noite UTC). */
export function dataHoraISO(valor: unknown): string | null {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.toISOString();
  const bruto = texto(valor);
  if (bruto === '') return null;
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(bruto)) {
    const t = Date.parse(bruto.replace(' ', 'T'));
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  const d = dataISO(bruto);
  return d ? `${d}T00:00:00.000Z` : null;
}

/** Par de coordenadas, ou `null`: metade de coordenada e a ilha nula (0, 0) são recusadas. */
export function coordenada(lat: unknown, lon: unknown): { lat: number; lon: number } | null {
  const la = numero(lat);
  const lo = numero(lon);
  if (la === null || lo === null) return null;
  if (la < -90 || la > 90 || lo < -180 || lo > 180) return null;
  if (la === 0 && lo === 0) return null;
  return { lat: la, lon: lo };
}

/** Divergência tolerada entre preço/m² informado e calculado (mesmo valor do site). */
export const TOLERANCIA_PRECO_M2 = 0.05;

export interface ConferenciaPrecoM2 {
  valor: number | null;
  informado: number | null;
  calculado: number | null;
  divergencia_frac: number | null;
  divergente: boolean;
}

/** Preço/m² com conferência: o informado nunca é sobrescrito, a divergência vira aviso. */
export function precoM2(preco: unknown, area: unknown, informado: unknown): ConferenciaPrecoM2 {
  const inf = numero(informado);
  const informadoOk = inf !== null && inf > 0 ? inf : null;
  const p = numero(preco);
  const a = numero(area);
  const calculado = p === null || a === null || a <= 0 || p <= 0 ? null : p / a;
  const divergencia = informadoOk !== null && calculado !== null ? Math.abs(calculado - informadoOk) / informadoOk : null;
  return {
    valor: informadoOk ?? calculado,
    informado: informadoOk,
    calculado,
    divergencia_frac: divergencia,
    divergente: divergencia !== null && divergencia > TOLERANCIA_PRECO_M2,
  };
}

/**
 * Preço monetário resolvendo o ponto único ambíguo (`385.000`) pela âncora de
 * preço/m² informado × área, quando ela existe (site, `toPriceNumber`).
 */
export function precoNumero(bruto: unknown, ancora: { area?: unknown; precoM2Informado?: unknown } = {}): number | null {
  const comoDecimal = numero(bruto);
  if (comoDecimal === null) return null;
  const t = texto(bruto);
  if (MOEDA_PREFIXO.test(t) || MOEDA_SUFIXO.test(t)) return comoDecimal;
  if (!/^-?\d{1,3}\.\d{3}$/.test(t.replace(/[\s ]/g, ''))) return comoDecimal;
  const area = numero(ancora.area);
  const pm2 = numero(ancora.precoM2Informado);
  if (area === null || area <= 0 || pm2 === null || pm2 <= 0) return comoDecimal;
  const esperado = pm2 * area;
  return Math.abs(comoDecimal * 1000 - esperado) < Math.abs(comoDecimal - esperado) ? comoDecimal * 1000 : comoDecimal;
}

/** Slug sem acento, minúsculo, `_` como separador. */
export function slug(valor: unknown): string {
  return texto(valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Comparação de nomes sem caixa e sem acento. */
export function chaveNome(valor: unknown): string {
  return slug(valor).replace(/_/g, ' ');
}

/** URL só `http`/`https`; senão `null` (spec 10.1, T3). */
export function urlSegura(valor: unknown): string | null {
  const t = texto(valor);
  if (t === '') return null;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}
