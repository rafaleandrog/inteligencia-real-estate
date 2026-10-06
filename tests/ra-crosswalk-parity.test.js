// Paridade entre a ponte publicada pelo pipeline (data/public/ra_crosswalk.json) e as funções
// do Code.gs que gravam nome, slug e código romano na planilha (R2.9, R8.44).
//
// O pipeline COPIA `titleCaseRaName_`, `normalizeSlug_`, `numberToRoman_` e `raNumberFromCode_`
// em Python; este teste executa o Code.gs REAL no sandbox `vm` sobre cada linha do arquivo
// gerado. A fixture (saída do pipeline em modo fixture, tests/fixtures/public/) roda SEMPRE,
// para a fiação do teste e a cópia Python serem provadas antes da primeira execução real; o
// arquivo real roda quando existe e pula com motivo enquanto não existir — declarar a
// limitação, não mascará-la (R6.6, R8.100).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createAppsScriptSandbox } from './helpers/appsScriptSandbox.mjs';

const FIXTURE = new URL('./fixtures/public/ra_crosswalk.json', import.meta.url);
const REAL = new URL('../data/public/ra_crosswalk.json', import.meta.url);

function assertParity(payload) {
  // O helper devolve { context, sheets, properties, cache }: as funções de topo do Code.gs
  // moram em `context` (#160).
  const { context: ctx } = createAppsScriptSandbox();
  assert.equal(payload.roman_key_prefix, 'RA2026_');
  assert.ok(Array.isArray(payload.rows) && payload.rows.length > 0);
  for (const row of payload.rows) {
    const roman = ctx.numberToRoman_(row.ra_number);
    assert.equal(row.ra_code, `RA-${roman}`, `ra_code da RA ${row.ra_number}`);
    assert.equal(ctx.raNumberFromCode_(row.ra_code), row.ra_number, `ida-e-volta do código ${row.ra_code}`);
    assert.equal(row.ra_geo_id, 'RA_' + ('0' + row.ra_number).slice(-2), `ra_geo_id da RA ${row.ra_number}`);
    assert.equal(row.ra_geo_id_roman, `RA2026_${row.ra_code}`);
    assert.equal(row.ra_name, ctx.titleCaseRaName_(row.ra_name_source), `ra_name de ${row.ra_name_source}`);
    assert.equal(row.ra_slug, ctx.normalizeSlug_(row.ra_name_source), `ra_slug de ${row.ra_name_source}`);
  }
  return payload.rows.length;
}

test('fixture da ponte (pipeline em modo fixture) reproduz nome, slug e código romano do Code.gs', () => {
  const linhas = assertParity(JSON.parse(readFileSync(FIXTURE, 'utf8')));
  assert.ok(linhas >= 2, 'a fixture traz mais de uma RA');
});

test('ra_crosswalk.json reproduz nome, slug e código romano do Code.gs', { skip: !existsSync(REAL) && 'data/public/ra_crosswalk.json ausente (pipeline ainda não rodou)' }, () => {
  const linhas = assertParity(JSON.parse(readFileSync(REAL, 'utf8')));
  assert.equal(linhas, 37, 'o DF tem 37 RAs');
});
