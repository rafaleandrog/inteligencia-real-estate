import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readXlsx } from '../tools/xlsx.mjs';
import {
  SHEETS, expectedRequiredHeaders, declaredRequiredHeaders, contractColumns,
} from './helpers/schema.mjs';

// A validação de schema do Apps Script depende de uma lista de cabeçalhos que não é
// executável pela suíte — Apps Script não importa módulo ES. Estes testes fecham o
// cerco por dois lados:
//
//   1. tudo que a lista declara existe de fato na planilha (sem falso positivo);
//   2. tudo que o contrato exige e que o normalizador lê está na lista (sem falso
//      negativo).
//
// Só o lado (1) deixaria passar exatamente o que passou: uma lista escrita à mão
// omitindo uma coluna consumida pelo normalizador. Apagar essa coluna não geraria
// achado e o loader a transformaria em ausência silenciosa.

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const normalizeSrc = read('../src/normalize.js');
const contractMd = read('../docs/DATA_CONTRACT.md');
const scriptSrc = read('../optional-apps-script/Code.gs');

test('REQUIRED_HEADERS cobre exatamente o que contrato e normalizadores exigem', () => {
  const expected = expectedRequiredHeaders(normalizeSrc, contractMd);
  const declared = declaredRequiredHeaders(scriptSrc);

  assert.deepEqual(Object.keys(declared).sort(), [...SHEETS].sort(),
    'as três abas obrigatórias precisam ter cabeçalhos declarados');

  for (const sheet of SHEETS) {
    const faltando = expected[sheet].filter((f) => !declared[sheet].includes(f));
    assert.deepEqual(faltando, [],
      `${sheet}: exigido pelo contrato ou lido pelo normalizador, mas não validado`);

    const sobrando = declared[sheet].filter((f) => !expected[sheet].includes(f));
    assert.deepEqual(sobrando, [],
      `${sheet}: declarado sem que contrato ou normalizador precisem`);
  }
});

test('nenhum cabeçalho exigido é inexistente na planilha', () => {
  const workbook = readXlsx(readFileSync(new URL('../migration/imob-intelligence-backend.xlsx', import.meta.url)));
  const declared = declaredRequiredHeaders(scriptSrc);

  for (const sheet of SHEETS) {
    const headers = new Set(workbook[sheet].headers);
    const inexistentes = declared[sheet].filter((f) => !headers.has(f));
    assert.deepEqual(inexistentes, [],
      `${sheet}: a validação acusaria erro em coluna que não faz parte do schema`);
  }
});

test('as três abas validam latitude e longitude', () => {
  const declared = declaredRequiredHeaders(scriptSrc);
  for (const sheet of ['LISTINGS', 'DEVELOPMENTS', 'ANCHORS']) {
    for (const field of ['latitude', 'longitude']) {
      assert.ok(declared[sheet].includes(field), `${sheet} usa ${field}`);
    }
  }
});

test('o contrato declara colunas para as três abas obrigatórias', () => {
  const { all, required } = contractColumns(contractMd);
  for (const sheet of SHEETS) {
    assert.ok(all[sheet] && all[sheet].size > 0, `${sheet} sem tabela de colunas no contrato`);
    assert.ok(required[sheet].size > 0, `${sheet} sem nenhum campo obrigatório declarado`);
  }
});

test('o leitor de .xlsx mapeia a aba pelo r:id, não pelo sheetId', () => {
  // Regressão: o mapeamento por `sheetId` só funciona enquanto os ids forem
  // sequenciais. Com PRIMARY_MARKET (id 5) removida, os ids pulam de 4 para 6 enquanto
  // os arquivos sheetN.xml são renumerados sem buraco — e cada aba a partir dali passa
  // a devolver o conteúdo da anterior, silenciosamente.
  const workbook = readXlsx(readFileSync(new URL('../migration/imob-intelligence-backend.xlsx', import.meta.url)));

  // Estas quatro só têm a forma certa com o mapeamento correto; com o antigo,
  // IVV_MONTHLY devolvia as 95 linhas da IVV_REGION e APP_META as colunas da DATA_QUALITY.
  const esperado = {
    PRIMARY_OFFERS: { cols: 20, rows: 29 },
    IVV_MONTHLY: { cols: 18, rows: 1 },
    IVV_REGION: { cols: 12, rows: 95 },
    RA_PROFILES: { cols: 38, rows: 35 },
  };

  for (const [sheet, { cols, rows }] of Object.entries(esperado)) {
    assert.ok(workbook[sheet], `${sheet} ausente`);
    assert.equal(workbook[sheet].headers.length, cols, `${sheet}: número de colunas`);
    assert.equal(workbook[sheet].rows.length, rows, `${sheet}: número de linhas`);
  }

  // As três abas operacionais vêm com cabeçalho e sem linhas — é o Apps Script que preenche.
  const operacionais = { APP_META: 3, DATA_QUALITY: 8, CHANGE_LOG: 7 };
  for (const [sheet, cols] of Object.entries(operacionais)) {
    assert.equal(workbook[sheet].headers.length, cols, `${sheet}: número de colunas`);
    assert.equal(workbook[sheet].rows.length, 0, `${sheet} deve estar vazia`);
  }

  // APP_META precisa ter exatamente o formato que normalizeAppMeta consome.
  assert.deepEqual(workbook.APP_META.headers, ['key', 'value', 'updated_at']);
});

test('o leitor recusa workbook sem o relacionamento das abas', () => {
  // Regressão: o fallback para `sheet{sheetId}.xml` recriava, em silêncio, o mesmo
  // deslocamento que o mapeamento por r:id corrige. Sem relacionamento não existe
  // mapeamento confiável, então o parser precisa recusar o arquivo.
  const original = readFileSync(new URL('../migration/imob-intelligence-backend.xlsx', import.meta.url));

  // Reescreve o ZIP sem xl/_rels/workbook.xml.rels.
  const semRels = removeZipEntry(original, 'xl/_rels/workbook.xml.rels');
  assert.throws(() => readXlsx(semRels), /r:id ausente|relacionamento/i);

  // O arquivo íntegro continua sendo lido normalmente.
  assert.ok(readXlsx(original).APP_META);
});

/** Remove uma entrada de um ZIP reescrevendo o diretório central. Só para o teste. */
function removeZipEntry(buffer, nameToRemove) {
  const SIG_LOCAL = 0x04034b50;
  const SIG_CENTRAL = 0x02014b50;
  const SIG_EOCD = 0x06054b50;

  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === SIG_EOCD) { eocd = i; break; }
  }
  assert.ok(eocd !== -1, 'EOCD não encontrado');

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  const locals = [];
  const centrals = [];
  for (let i = 0; i < entryCount; i += 1) {
    assert.equal(buffer.readUInt32LE(offset), SIG_CENTRAL);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    const centralSize = 46 + nameLength + extraLength + commentLength;

    if (name !== nameToRemove) {
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const localSize = 30 + localNameLength + localExtraLength + compressedSize;
      locals.push({ data: buffer.subarray(localOffset, localOffset + localSize) });
      centrals.push({ header: Buffer.from(buffer.subarray(offset, offset + centralSize)) });
    }
    offset += centralSize;
  }

  const parts = [];
  let cursor = 0;
  locals.forEach((local, i) => {
    centrals[i].header.writeUInt32LE(cursor, 42); // corrige o offset do cabeçalho local
    parts.push(local.data);
    cursor += local.data.length;
  });
  const centralStart = cursor;
  for (const central of centrals) { parts.push(central.header); cursor += central.header.length; }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(SIG_EOCD, 0);
  end.writeUInt16LE(centrals.length, 8);
  end.writeUInt16LE(centrals.length, 10);
  end.writeUInt32LE(cursor - centralStart, 12);
  end.writeUInt32LE(centralStart, 16);
  parts.push(end);

  const out = Buffer.concat(parts);
  assert.equal(out.readUInt32LE(0), SIG_LOCAL, 'ZIP reescrito começa com cabeçalho local');
  return out;
}
