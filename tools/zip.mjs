// Leitor mínimo de ZIP, para abrir o .xlsx de migração sem dependência externa.
//
// Um .xlsx é um ZIP de XMLs. O Node traz `zlib` embutido, então ler o arquivo é
// questão de percorrer o diretório central do ZIP e inflar cada entrada — o que
// evita acrescentar uma dependência só para uma tarefa de migração (R1.5).

import { inflateRawSync } from 'node:zlib';

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/** Localiza o End of Central Directory, que fica no fim do arquivo. */
function findEocd(buf) {
  // O comentário final pode ter até 65.535 bytes; a busca começa do fim.
  const start = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= start; i -= 1) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  throw new Error('não parece um arquivo ZIP: EOCD não encontrado');
}

/**
 * Lê um ZIP e devolve um Map de nome do arquivo para Buffer descomprimido.
 * Suporta os dois métodos que o Excel e o Google Sheets usam: stored (0) e deflate (8).
 */
export function readZip(buf) {
  const eocd = findEocd(buf);
  const entryCount = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  const files = new Map();
  for (let i = 0; i < entryCount; i += 1) {
    if (buf.readUInt32LE(offset) !== SIG_CENTRAL) {
      throw new Error(`entrada ${i} do diretório central com assinatura inválida`);
    }
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLength);

    if (buf.readUInt32LE(localOffset) !== SIG_LOCAL) {
      throw new Error(`cabeçalho local inválido para "${name}"`);
    }
    // O cabeçalho local tem os próprios campos de tamanho de nome e extra, que podem
    // divergir dos do diretório central. São estes que valem para achar os dados.
    const localNameLength = buf.readUInt16LE(localOffset + 26);
    const localExtraLength = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buf.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) files.set(name, Buffer.from(raw));
    else if (method === 8) files.set(name, inflateRawSync(raw));
    else throw new Error(`método de compressão ${method} não suportado em "${name}"`);

    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}
