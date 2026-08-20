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
  for (const si of xml.toString('utf8').matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)) {
    // Uma string pode vir partida em vários <t> (rich text); concatena todos.
    const parts = [...si[1].matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)]
      .map((m) => decodeXml(m[1]));
    out.push(parts.join(''));
  }
  return out;
}

/**
 * Nome e caminho do arquivo de cada aba, na ordem do workbook.
 *
 * O caminho vem de `r:id` -> `xl/_rels/workbook.xml.rels` -> `Target`, e NÃO de
 * `sheetId`. Os dois coincidem enquanto as abas forem criadas em sequência e nenhuma
 * for apagada — apagar uma deixa um buraco na numeração dos ids, enquanto os arquivos
 * `sheetN.xml` são renumerados sem buraco, e a partir dali cada aba passa a ler o
 * conteúdo da anterior. Foi o que aconteceu ao remover PRIMARY_MARKET (id 5): os ids
 * pularam de 4 para 6 e `APP_META` passou a devolver as linhas de `DATA_QUALITY`.
 */
function readSheetIndex(files) {
  const xml = files.get('xl/workbook.xml').toString('utf8');
  const relsEntry = files.get('xl/_rels/workbook.xml.rels');
  const rels = new Map();

  if (relsEntry) {
    // Os atributos aparecem em qualquer ordem conforme o gerador do arquivo.
    for (const rel of relsEntry.toString('utf8').matchAll(/<Relationship\b[^>]*\/?>/g)) {
      const id = /Id="([^"]+)"/.exec(rel[0])?.[1];
      const target = /Target="([^"]+)"/.exec(rel[0])?.[1];
      if (id && target) rels.set(id, decodeXml(target));
    }
  }

  return [...xml.matchAll(/<(?:\w+:)?sheet\b[^>]*\/?>/g)].map((tag) => {
    const name = /name="([^"]+)"/.exec(tag[0])?.[1];
    const rid = /r:id="([^"]+)"/.exec(tag[0])?.[1];
    const sheetId = /sheetId="(\d+)"/.exec(tag[0])?.[1];

    // Sem `r:id` resolvido não existe mapeamento confiável. Cair para
    // `sheet${sheetId}.xml` recriaria exatamente o deslocamento que esta função
    // corrige, e em silêncio — melhor recusar o arquivo do que devolver a aba errada.
    const target = rid ? rels.get(rid) : undefined;
    if (!target) {
      throw new Error(
        `aba "${decodeXml(name || `sheetId=${sheetId}`)}": relacionamento r:id ausente em ` +
        'xl/_rels/workbook.xml.rels; sem ele não há como localizar a planilha com segurança'
      );
    }

    // Target pode vir absoluto ("/xl/worksheets/sheet1.xml") ou relativo ao xl/.
    const path = `xl/${target.replace(/^\/?(xl\/)?/, '')}`;
    return { name: decodeXml(name || ''), path };
  }).filter((sheet) => sheet.name);
}

/** Células de uma aba, como matriz de strings. */
function readSheetCells(files, path, shared) {
  const entry = files.get(path);
  if (!entry) return [];
  const xml = entry.toString('utf8');
  const rows = [];

  for (const rowMatch of xml.matchAll(/<(?:\w+:)?row[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const cells = new Map();
    for (const cellMatch of rowMatch[1].matchAll(
      /<(?:\w+:)?c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g
    )) {
      const [, ref, attrs, body = ''] = cellMatch;
      const type = /t="([^"]+)"/.exec(attrs)?.[1] || 'n';
      let value = '';
      if (type === 'inlineStr') {
        value = [...body.matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)]
          .map((m) => decodeXml(m[1])).join('');
      } else if (type === 's') {
        const idx = Number(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1]);
        value = shared[idx] ?? '';
      } else {
        value = decodeXml(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1] ?? '');
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

  for (const { name, path } of readSheetIndex(files)) {
    const cells = readSheetCells(files, path, shared);
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
