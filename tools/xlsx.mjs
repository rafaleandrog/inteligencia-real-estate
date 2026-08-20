// Leitura das abas de um .xlsx como linhas com chave por cabeçalho.
//
// Cobre apenas o que o arquivo de migração usa: strings inline, números e a tabela de
// strings compartilhadas. Não é um parser de Excel de propósito geral, e não precisa ser.

import { readZip } from './zip.mjs';

/** Decodifica as cinco entidades XML que aparecem em conteúdo de planilha. */
function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&'); // por último, para não desfazer as anteriores
}

/** "C" -> 2, "AB" -> 27. Converte a referência de coluna em índice base zero. */
function columnIndex(ref) {
  const letters = /^([A-Z]+)/.exec(ref);
  if (!letters) return 0;
  let n = 0;
  for (const ch of letters[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Tabela de strings compartilhadas (`sharedStrings.xml`), quando existe. */
function readSharedStrings(files) {
  const xml = files.get('xl/sharedStrings.xml');
  if (!xml) return [];
  const out = [];
  for (const si of xml.toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    // Uma string pode vir partida em vários <t> (rich text); concatena todos.
    const parts = [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]));
    out.push(parts.join(''));
  }
  return out;
}

/** Nome e id de cada aba, na ordem do workbook. */
function readSheetIndex(files) {
  const xml = files.get('xl/workbook.xml').toString('utf8');
  return [...xml.matchAll(/name="([^"]+)"[^>]*sheetId="(\d+)"/g)].map((m) => ({
    name: decodeXml(m[1]),
    sheetId: m[2],
  }));
}

/** Células de uma aba, como matriz de strings. */
function readSheetCells(files, sheetId, shared) {
  const entry = files.get(`xl/worksheets/sheet${sheetId}.xml`);
  if (!entry) return [];
  const xml = entry.toString('utf8');
  const rows = [];

  for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map();
    for (const cellMatch of rowMatch[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const [, ref, attrs, body] = cellMatch;
      const type = /t="([^"]+)"/.exec(attrs)?.[1] || 'n';
      let value = '';
      if (type === 'inlineStr') {
        value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');
      } else if (type === 's') {
        const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1]);
        value = shared[idx] ?? '';
      } else {
        value = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '');
      }
      cells.set(columnIndex(ref), value);
    }
    if (cells.size === 0) { rows.push([]); continue; }
    const width = Math.max(...cells.keys()) + 1;
    rows.push(Array.from({ length: width }, (_, i) => cells.get(i) ?? ''));
  }
  return rows;
}

/**
 * Lê um .xlsx e devolve `{ [aba]: { headers, rows } }`, onde `rows` são objetos com
 * chave por cabeçalho. Linhas totalmente vazias são descartadas.
 */
export function readXlsx(buffer) {
  const files = readZip(buffer);
  const shared = readSharedStrings(files);
  const out = {};

  for (const { name, sheetId } of readSheetIndex(files)) {
    const cells = readSheetCells(files, sheetId, shared);
    if (cells.length === 0) { out[name] = { headers: [], rows: [] }; continue; }

    const headers = cells[0].map((h) => String(h).trim());
    const rows = cells
      .slice(1)
      .filter((r) => r.some((c) => String(c).trim() !== ''))
      .map((r) => {
        const obj = {};
        headers.forEach((h, i) => { if (h) obj[h] = r[i] ?? ''; });
        return obj;
      });
    out[name] = { headers, rows };
  }
  return out;
}
