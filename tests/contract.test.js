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
// omitindo bedrooms_min/bedrooms_max de PRIMARY_MARKET. Apagar essas colunas não
// geraria achado, o normalizador as viraria null e o filtro de quartos excluiria os
// registros do mercado primário — tudo com validateAll() reportando dataset saudável.

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const normalizeSrc = read('../src/normalize.js');
const contractMd = read('../docs/DATA_CONTRACT.md');
const scriptSrc = read('../optional-apps-script/Code.gs');

test('REQUIRED_HEADERS cobre exatamente o que contrato e normalizadores exigem', () => {
  const expected = expectedRequiredHeaders(normalizeSrc, contractMd);
  const declared = declaredRequiredHeaders(scriptSrc);

  assert.deepEqual(Object.keys(declared).sort(), [...SHEETS].sort(),
    'as quatro abas obrigatórias precisam ter cabeçalhos declarados');

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

test('PRIMARY_MARKET valida lat/lon e as faixas de área e quartos', () => {
  const declared = declaredRequiredHeaders(scriptSrc);

  // Divergência D1: esta aba usa lat/lon. Exigir latitude/longitude acusaria erro em
  // toda linha de uma aba correta.
  for (const field of ['lat', 'lon']) assert.ok(declared.PRIMARY_MARKET.includes(field));
  for (const field of ['latitude', 'longitude']) {
    assert.ok(!declared.PRIMARY_MARKET.includes(field), `${field} não existe nesta aba`);
  }

  // Regressão do achado: estas cinco estavam fora da lista escrita à mão.
  for (const field of ['bedrooms_min', 'bedrooms_max', 'area_min_m2', 'area_max_m2', 'observed_at']) {
    assert.ok(declared.PRIMARY_MARKET.includes(field), `${field} precisa ser validado`);
  }

  for (const sheet of ['LISTINGS', 'DEVELOPMENTS', 'ANCHORS']) {
    for (const field of ['latitude', 'longitude']) {
      assert.ok(declared[sheet].includes(field), `${sheet} usa ${field}`);
    }
  }
});

test('o contrato declara colunas para as quatro abas obrigatórias', () => {
  const { all, required } = contractColumns(contractMd);
  for (const sheet of SHEETS) {
    assert.ok(all[sheet] && all[sheet].size > 0, `${sheet} sem tabela de colunas no contrato`);
    assert.ok(required[sheet].size > 0, `${sheet} sem nenhum campo obrigatório declarado`);
  }
});
