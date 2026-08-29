import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readXlsx } from '../tools/xlsx.mjs';
import { createAppsScriptSandbox } from './helpers/appsScriptSandbox.mjs';
import {
  SHEETS, SCHEMA_SHEETS, BACKEND_SCHEMA_SHEETS, REQUIRED_SHEETS, OPTIONAL_SCHEMA_SHEETS,
  POST_SEED_COLUMNS, POST_SEED_SHEETS,
  expectedRequiredHeaders, declaredRequiredHeaders, contractColumns, postSeedFromContract,
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
const seed = () => readXlsx(readFileSync(new URL('../migration/imob-intelligence-backend.xlsx', import.meta.url)));

test('REQUIRED_HEADERS cobre exatamente o que contrato e normalizadores exigem', () => {
  const expected = expectedRequiredHeaders(normalizeSrc, contractMd);
  const declared = declaredRequiredHeaders();

  assert.deepEqual(Object.keys(declared).sort(), [...SCHEMA_SHEETS].sort(),
    'toda aba com contrato de cabeçalho precisa estar declarada, e nenhuma além');

  for (const sheet of SHEETS) {
    const faltando = expected[sheet].filter((f) => !declared[sheet].includes(f));
    assert.deepEqual(faltando, [],
      `${sheet}: exigido pelo contrato ou lido pelo normalizador, mas não validado`);

    const sobrando = declared[sheet].filter((f) => !expected[sheet].includes(f));
    assert.deepEqual(sobrando, [],
      `${sheet}: declarado sem que contrato ou normalizador precisem`);
  }
});

test('aba com schema só no backend é cobrada pelo que dá para cobrar sem cliente', () => {
  // ROAD_SEGMENTS, ROAD_SEGMENT_ALIASES e TRAFFIC_DAILY_TEST têm REQUIRED_HEADERS mas
  // ainda não têm normalizador — a camada de tráfego no cliente é trabalho separado.
  // Sem este teste elas ficariam num limbo: declaradas no Code.gs e verificadas por
  // ninguém. As asserções abaixo são o que sobra quando não há normalizador para
  // cruzar, e nenhuma delas deve ser afrouxada para acomodar uma aba nova — o caminho
  // certo é a aba ganhar normalizador e migrar para OPTIONAL_SCHEMA_SHEETS.
  const { context } = createAppsScriptSandbox();
  const declared = declaredRequiredHeaders();
  const configSrc = read('../src/config.js');

  for (const sheet of BACKEND_SCHEMA_SHEETS) {
    assert.ok(declared[sheet] && declared[sheet].length > 0, `${sheet} sem cabeçalhos declarados`);

    const idField = context.ID_FIELD[sheet];
    assert.ok(idField, `${sheet} sem ID_FIELD`);
    assert.ok(declared[sheet].includes(idField), `${sheet}: ID_FIELD fora de REQUIRED_HEADERS`);

    // Opcional e gerenciada: `setupProject()` a cria inteira, e a ausência dela é aviso.
    assert.ok(context.OPTIONAL_SHEETS.includes(sheet), `${sheet} precisa ser opcional`);
    assert.ok(context.MANAGED_EXTENSION_SHEETS.includes(sheet), `${sheet} precisa ser gerenciada`);
    assert.ok(!context.REQUIRED_SHEETS.includes(sheet), `${sheet} não pode ser obrigatória`);

    // Nenhuma delas é gravável pela API de escrita — não há tela administrativa para elas.
    assert.ok(!context.WRITE_ALLOWLIST[sheet], `${sheet} não pode estar em WRITE_ALLOWLIST`);

    // E nenhuma entra no caminho de erro fatal do loader. Estar em `src/config.js` como
    // aba própria (`roadSegmentsSheet` etc.) é esperado — o que não pode é entrar no
    // bloco `sheets:`, que é o único cuja ausência derruba a aplicação (R2.5).
    const fatalBlock = configSrc.slice(
      configSrc.indexOf('sheets: {'),
      configSrc.indexOf('}', configSrc.indexOf('sheets: {')),
    );
    assert.ok(!fatalBlock.includes(sheet),
      `${sheet} é opcional e não pode entrar em config.sheets, que é o caminho de erro fatal`);

    // Toda aba servida pelo endpoint read-only precisa estar na allowlist, senão o
    // `dataset_()` recusa e o carregamento reporta sucesso com dado sempre vazio.
    assert.ok(context.ALLOWED_DATASETS.includes(sheet), `${sheet} fora de ALLOWED_DATASETS`);
  }
});

test('obrigatória e opcional-com-schema são conceitos distintos, e o Code.gs concorda', () => {
  // O risco de uma aba opcional passar a ter REQUIRED_HEADERS é alguém concluir que ela
  // virou obrigatória e ligá-la ao caminho de erro fatal. Estas asserções fixam a
  // separação nos dois lados.
  const { context } = createAppsScriptSandbox();

  assert.deepEqual([...REQUIRED_SHEETS].sort(), [...context.REQUIRED_SHEETS].sort());
  for (const sheet of OPTIONAL_SCHEMA_SHEETS) {
    assert.ok(context.OPTIONAL_SHEETS.includes(sheet), `${sheet} precisa ser opcional no Code.gs`);
    assert.ok(!context.REQUIRED_SHEETS.includes(sheet), `${sheet} não pode ser obrigatória`);
  }

  // E o loader do navegador só pode tratar como entidade obrigatória as três de sempre.
  const configSrc = read('../src/config.js');
  const sheetsBlock = configSrc.slice(configSrc.indexOf('sheets: {'), configSrc.indexOf('}', configSrc.indexOf('sheets: {')));
  for (const sheet of OPTIONAL_SCHEMA_SHEETS) {
    assert.ok(!sheetsBlock.includes(sheet),
      `${sheet} é opcional e não pode entrar em config.sheets, que é o caminho de erro fatal`);
  }
});

test('todo cabeçalho exigido existe na semente, ou está declarado como provisionado depois dela', () => {
  // A semente é um bootstrap histórico de uma vez só (migration/README.md) e não
  // acompanha o schema. Na v1.0.0 um erro de digitação em REQUIRED_HEADERS produzia um
  // MISSING_HEADER barulhento; na v2.0.0 `ensureHeaders_()` provisiona, então o mesmo
  // erro CRIA uma coluna chamada `latitud` em silêncio. A rede não foi removida — ela
  // mudou de lugar: o delta entre semente e schema vira lista explícita, e as três
  // asserções abaixo impedem que essa lista vire esconderijo.
  const workbook = seed();
  const declared = declaredRequiredHeaders();

  for (const sheet of SHEETS) {
    const naSemente = workbook[sheet] ? new Set(workbook[sheet].headers) : null;
    const provisionadas = POST_SEED_COLUMNS[sheet] || [];

    if (!naSemente) {
      assert.ok(POST_SEED_SHEETS.includes(sheet),
        `${sheet}: ausente da semente sem estar declarada em POST_SEED_SHEETS`);
      continue;
    }

    assert.ok(!POST_SEED_SHEETS.includes(sheet),
      `${sheet}: declarada como aba pós-semente, mas existe na semente`);

    const inexistentes = declared[sheet]
      .filter((f) => !naSemente.has(f) && !provisionadas.includes(f));
    assert.deepEqual(inexistentes, [],
      `${sheet}: exigido, ausente da semente e não declarado em POST_SEED_COLUMNS`);

    // Anti-apodrecimento: se alguém reexportar a planilha, a lista é obrigada a encolher.
    const jaExistem = provisionadas.filter((f) => naSemente.has(f));
    assert.deepEqual(jaExistem, [],
      `${sheet}: POST_SEED_COLUMNS lista coluna que a semente já tem — remova-a`);

    // E nenhuma entrada órfã, que ninguém exige.
    const orfas = provisionadas.filter((f) => !declared[sheet].includes(f));
    assert.deepEqual(orfas, [],
      `${sheet}: POST_SEED_COLUMNS lista coluna que REQUIRED_HEADERS não exige`);
  }
});

test('o delta pós-semente está documentado no contrato', () => {
  // A quarta trava: a lista no código precisa bater com a tabela em prosa, para que
  // quem lê o contrato veja o mesmo que o teste vê.
  const documentado = postSeedFromContract(contractMd);
  const noCodigo = {};
  for (const [sheet, cols] of Object.entries(POST_SEED_COLUMNS)) noCodigo[sheet] = [...cols].sort();
  for (const sheet of POST_SEED_SHEETS) noCodigo[sheet] = ['*'];

  assert.deepEqual(documentado, noCodigo,
    'a tabela "Provisionamento pós-semente" do DATA_CONTRACT.md divergiu de POST_SEED_COLUMNS/POST_SEED_SHEETS');
});

test('as três abas obrigatórias validam latitude e longitude', () => {
  const declared = declaredRequiredHeaders();
  for (const sheet of REQUIRED_SHEETS) {
    for (const field of ['latitude', 'longitude']) {
      assert.ok(declared[sheet].includes(field), `${sheet} usa ${field}`);
    }
  }
});

test('o contrato declara colunas para toda aba com schema', () => {
  const { all, required } = contractColumns(contractMd);
  for (const sheet of SHEETS) {
    assert.ok(all[sheet] && all[sheet].size > 0, `${sheet} sem tabela de colunas no contrato`);
    // Toda aba tem ao menos a chave primária marcada obrigatória.
    assert.ok(required[sheet].size > 0, `${sheet} sem nenhum campo obrigatório declarado`);
  }
});

test('a seção de uma aba termina no próximo heading de qualquer nível', () => {
  // Regressão: separar as seções só por `\n### ` fazia a de ANCHORS engolir tudo até o
  // próximo `###`, inclusive a tabela de `## Abas opcionais` — e os nomes de aba dali
  // (PRIMARY_OFFERS, IVV_MONTHLY, IVV_REGION, RA_PROFILES) entravam em `all.ANCHORS`
  // como se fossem colunas de ANCHORS. `all` é a lista que autoriza um campo a virar
  // cabeçalho exigido, então uma tabela nova no lugar errado poderia exigir coluna da
  // aba errada.
  const { all } = contractColumns(contractMd);
  for (const invasor of ['PRIMARY_OFFERS', 'IVV_MONTHLY', 'IVV_REGION', 'RA_PROFILES']) {
    assert.equal(all.ANCHORS.has(invasor), false,
      `"${invasor}" é nome de aba e vazou para as colunas de ANCHORS`);
  }

  // E o contrato precisa declarar ao menos toda coluna que a semente de fato tem —
  // o corte por heading não pode ter comido uma tabela legítima.
  //
  // Só vale para as três abas obrigatórias. RA_PROFILES documenta 10 das suas 38
  // colunas de propósito: as 28 restantes são indicadores PDAD que a tela não lê, e
  // documentá-las numa tabela `|` as tornaria cabeçalhos exigidos (a tabela alimenta
  // `all`, que autoriza um campo a entrar em `expected`). POLYGONS nem existe na
  // semente.
  const workbook = seed();
  for (const sheet of REQUIRED_SHEETS) {
    const naoDeclaradas = workbook[sheet].headers.filter((h) => h && !all[sheet].has(h));
    assert.deepEqual(naoDeclaradas, [], `${sheet}: coluna da semente ausente do contrato`);
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
