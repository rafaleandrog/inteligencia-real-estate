// Paridade entre a ponte publicada pelo pipeline (data/public/ra_crosswalk.json) e as funções
// do Code.gs que gravam nome, slug e código romano na planilha (R2.9, R8.44).
//
// O pipeline COPIA `titleCaseRaName_`, `normalizeSlug_`, `numberToRoman_` e `raNumberFromCode_`
// em Python; este teste executa o Code.gs REAL no sandbox `vm` sobre cada linha do arquivo
// gerado. Enquanto o arquivo não existir (antes da primeira execução do pipeline), o teste
// pula com motivo — declarar a limitação, não mascará-la (R6.6).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createAppsScriptSandbox } from './helpers/appsScriptSandbox.mjs';

const CROSSWALK = new URL('../data/public/ra_crosswalk.json', import.meta.url);

test('ra_crosswalk.json reproduz nome, slug e código romano do Code.gs', { skip: !existsSync(CROSSWALK) && 'data/public/ra_crosswalk.json ausente (pipeline ainda não rodou)' }, () => {
  const payload = JSON.parse(readFileSync(CROSSWALK, 'utf8'));
  const ctx = createAppsScriptSandbox();
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
});
