import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readXlsx } from '../tools/xlsx.mjs';

// A validação do Apps Script depende de uma lista de cabeçalhos críticos que não é
// executável aqui — Apps Script não importa módulo ES. Este teste lê essa lista do
// próprio Code.gs e confere contra a planilha de migração, para que a lista não
// derive em silêncio do schema real e passe a acusar erro em coluna que existe,
// ou a ignorar coluna que sumiu.

const source = readFileSync(new URL('../optional-apps-script/Code.gs', import.meta.url), 'utf8');

function requiredHeadersFromScript() {
  const block = source.match(/var REQUIRED_HEADERS = \{([\s\S]*?)\n\};/);
  assert.ok(block, 'REQUIRED_HEADERS não encontrado em Code.gs');

  const out = {};
  for (const entry of block[1].matchAll(/(\w+):\s*\[([\s\S]*?)\]/g)) {
    out[entry[1]] = [...entry[2].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  }
  return out;
}

test('REQUIRED_HEADERS do Apps Script existe na planilha de migração', () => {
  const workbook = readXlsx(readFileSync(new URL('../migration/imob-intelligence-backend.xlsx', import.meta.url)));
  const required = requiredHeadersFromScript();

  assert.deepEqual(
    Object.keys(required).sort(),
    ['ANCHORS', 'DEVELOPMENTS', 'LISTINGS', 'PRIMARY_MARKET'],
    'as quatro abas obrigatórias precisam ter cabeçalhos críticos declarados'
  );

  for (const [sheet, fields] of Object.entries(required)) {
    const headers = new Set(workbook[sheet].headers);
    const missing = fields.filter((f) => !headers.has(f));
    assert.deepEqual(missing, [], `${sheet}: cabeçalho(s) exigido(s) que não existem na planilha`);
  }
});

test('PRIMARY_MARKET exige lat/lon, e não latitude/longitude', () => {
  // Divergência D1 do contrato. Exigir o nome errado faria a validação acusar erro
  // em toda linha de uma aba que está correta.
  const required = requiredHeadersFromScript();
  assert.ok(required.PRIMARY_MARKET.includes('lat'));
  assert.ok(required.PRIMARY_MARKET.includes('lon'));
  assert.ok(!required.PRIMARY_MARKET.includes('latitude'));
  assert.ok(!required.PRIMARY_MARKET.includes('longitude'));

  for (const sheet of ['LISTINGS', 'DEVELOPMENTS', 'ANCHORS']) {
    assert.ok(required[sheet].includes('latitude'), `${sheet} usa latitude`);
    assert.ok(required[sheet].includes('longitude'), `${sheet} usa longitude`);
  }
});
