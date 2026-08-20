import { readFileSync } from 'node:fs';
export const SHEETS = ['LISTINGS', 'DEVELOPMENTS', 'ANCHORS', 'PRIMARY_MARKET'];

/** Campos que cada normalizador lê de fato. spatialQuality lê os dois de qualidade. */
export function fieldsReadByNormalizers(src) {
  const fns = { LISTINGS: 'normalizeListing', DEVELOPMENTS: 'normalizeDevelopment',
                ANCHORS: 'normalizeAnchor', PRIMARY_MARKET: 'normalizePrimaryMarket' };
  const out = {};
  for (const [sheet, fn] of Object.entries(fns)) {
    const start = src.indexOf(`export function ${fn}`);
    const body = src.slice(start, src.indexOf('\n}', start));
    out[sheet] = new Set([...body.matchAll(/row\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
    out[sheet].add('confidence_flag');
    out[sheet].add('coordinate_precision');
  }
  return out;
}

/** Tabelas do contrato: todas as colunas e as marcadas como obrigatórias. */
export function contractColumns(md) {
  const all = {}; const required = {};
  for (const section of md.split(/\n### /).slice(1)) {
    const name = section.split(/[ \n—]/)[0].trim();
    if (!SHEETS.includes(name)) continue;
    all[name] = new Set(); required[name] = new Set();
    for (const line of section.split('\n')) {
      const m = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
      if (!m) continue;
      const field = m[1].replace(/\*/g, '');
      const obrig = m[3].replace(/\*/g, '').trim().toLowerCase();
      if (!field.includes('`')) continue;
      for (const part of field.split(/[\/,]/)) {
        const f = part.replace(/[`\s]/g, '');
        if (!f) continue;
        all[name].add(f);
        if (obrig === 'sim' || obrig === 'derivado') required[name].add(f);
      }
    }
  }
  return { all, required };
}

/**
 * Cabeçalhos que a validação do Apps Script deve exigir.
 *
 * União do que o contrato marca como obrigatório com o que os normalizadores leem,
 * intersectada com as colunas que o contrato declara para aquela aba — sem a
 * interseção, `coordinate_precision` seria exigido em DEVELOPMENTS e PRIMARY_MARKET,
 * que não têm essa coluna, e a validação acusaria erro numa planilha correta.
 */
export function expectedRequiredHeaders(normalizeSrc, contractMd) {
  const read = fieldsReadByNormalizers(normalizeSrc);
  const { all, required } = contractColumns(contractMd);
  const out = {};
  for (const sheet of SHEETS) {
    out[sheet] = [...new Set([...required[sheet], ...read[sheet]])]
      .filter((f) => all[sheet].has(f))
      .sort();
  }
  return out;
}

/** Lê o REQUIRED_HEADERS declarado no Code.gs. */
export function declaredRequiredHeaders(gsSrc) {
  const block = gsSrc.match(/var REQUIRED_HEADERS = \{([\s\S]*?)\n\};/);
  if (!block) throw new Error('REQUIRED_HEADERS não encontrado em Code.gs');
  const out = {};
  for (const entry of block[1].matchAll(/(\w+):\s*\[([\s\S]*?)\]/g)) {
    out[entry[1]] = [...entry[2].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  }
  return out;
}
