// Leitor mínimo de .xlsx para teste.
//
// Existe para que a checagem de cobertura de colunas interrogue a SEMENTE DE VERDADE
// (`migration/imob-intelligence-backend.xlsx`) em vez de uma lista copiada à mão — uma lista
// copiada afirma sobre um arquivo que ela nunca leu, que é exatamente o modo de falha da R8.46.
//
// Lê só o que o teste precisa: cabeçalho e primeira linha de dados de uma aba. Sem dependência.

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

function readEntries(buffer) {
  // Fim do diretório central: assinatura PK\x05\x06, procurada de trás para frente.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('xlsx: fim do diretório central não encontrado');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('xlsx: diretório central corrompido');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readFile(buffer, entries, name) {
  const entry = entries.get(name);
  if (!entry) throw new Error(`xlsx: entrada ausente: ${name}`);
  const local = entry.localOffset;
  if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error('xlsx: cabeçalho local corrompido');
  const nameLength = buffer.readUInt16LE(local + 26);
  const extraLength = buffer.readUInt16LE(local + 28);
  const start = local + 30 + nameLength + extraLength;
  const raw = buffer.subarray(start, start + entry.compressedSize);
  return (entry.method === 0 ? raw : inflateRawSync(raw)).toString('utf8');
}

function textOf(xml) {
  return (xml.match(/<(?:x:)?t[ >][^]*?<\/(?:x:)?t>|<(?:x:)?t\/>/g) || [])
    .map((chunk) => chunk.replace(/<[^>]*>/g, ''))
    .join('')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

/**
 * Devolve `{ headers, firstDataRow }` de uma aba do .xlsx.
 * `firstDataRow` é um objeto cabeçalho → valor bruto (string).
 */
export function readSheet(path, sheetName) {
  const buffer = readFileSync(path);
  const entries = readEntries(buffer);
  const workbook = readFile(buffer, entries, 'xl/workbook.xml');
  const rels = readFile(buffer, entries, 'xl/_rels/workbook.xml.rels');

  const sheetTag = workbook.match(new RegExp(`<[^>]*sheet [^>]*name="${sheetName}"[^>]*>`));
  if (!sheetTag) throw new Error(`xlsx: aba ausente: ${sheetName}`);
  const relId = sheetTag[0].match(/r:id="([^"]+)"/)[1];
  const relTag = rels.match(new RegExp(`<Relationship[^>]*Id="${relId}"[^>]*>`));
  const target = relTag[0].match(/Target="([^"]+)"/)[1].replace(/^\/?(xl\/)?/, 'xl/');

  const strings = (readFile(buffer, entries, 'xl/sharedStrings.xml').match(/<(?:x:)?si>[^]*?<\/(?:x:)?si>/g) || [])
    .map(textOf);
  const sheet = readFile(buffer, entries, target);
  const rows = sheet.match(/<(?:x:)?row[^]*?<\/(?:x:)?row>/g) || [];

  const parseRow = (xml) => {
    const cells = new Map();
    for (const cell of xml.match(/<(?:x:)?c [^>]*\/>|<(?:x:)?c [^>]*>[^]*?<\/(?:x:)?c>/g) || []) {
      const ref = cell.match(/r="([A-Z]+)\d+"/);
      if (!ref) continue;
      const type = cell.match(/t="([^"]+)"/);
      const value = cell.match(/<(?:x:)?v>([^]*?)<\/(?:x:)?v>/);
      let text = null;
      if (value) {
        text = type && type[1] === 's' ? strings[Number(value[1])] : value[1];
      } else if (/<(?:x:)?is>/.test(cell)) {
        text = textOf(cell);
      }
      cells.set(ref[1], text);
    }
    return cells;
  };

  const columnOrder = (map) => [...map.keys()].sort((a, b) => {
    const num = (col) => [...col].reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0);
    return num(a) - num(b);
  });

  const headerCells = parseRow(rows[0] || '');
  const headers = columnOrder(headerCells).map((col) => headerCells.get(col));
  const dataCells = rows[1] ? parseRow(rows[1]) : new Map();
  const firstDataRow = {};
  columnOrder(headerCells).forEach((col) => {
    firstDataRow[headerCells.get(col)] = dataCells.get(col) ?? null;
  });

  return { headers, firstDataRow };
}
