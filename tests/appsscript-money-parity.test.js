import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppsScriptSandbox } from './helpers/appsScriptSandbox.mjs';
import { toNumber, pricePerM2 } from '../src/normalize.js';

// `toNumber_()` do Code.gs é cópia à mão de `toNumber()` de src/normalize.js — a única
// duplicação de lógica aceita no projeto (optional-apps-script/README.md). Cópia à mão só
// é aceitável com um teste que a cobre: aqui o Code.gs REAL roda no sandbox de vm e as
// duas implementações são comparadas entrada por entrada, inclusive nos casos que já
// divergiram em produção (issue #121: "R$ 290.000" lido como 290 num lado só).

const { context } = createAppsScriptSandbox({ sheets: {}, scriptProperties: {} });

const INPUTS = [
  2500000, 0, -1, 1.5, NaN, Infinity, null, undefined, '', '   ', 'abc', 'R$', '12abc',
  '2500000', '19117.64705882353', '1.234,56', 'R$ 1.234,56', 'R$ 2.500.000', 'R$ 2.500.000,50',
  'R$ 290.000', 'R$ 385.000', '290.000 BRL', 'R$ 7.837,84', 'R$ 0,00', 'R$ -1.500', 'R$ 1234.5',
  '2.500', '385.000', '2.500.000', '1.234.567', '1,234.56', '2,500,000.50', '2,500,000', '1,234',
  '1,5', '-15.7645675', '0', '-0', '120 m²', '37,5 m2', '8,6%', '2,5 p.p.', '1.2.3,4,5',
  ' R$ 2.500.000 ', ' 42 ', '+10', '10-', '.5', '5.',
];

test('toNumber() e toNumber_() concordam em toda entrada, inclusive as que já divergiram', () => {
  for (const input of INPUTS) {
    const client = toNumber(input);
    const server = context.toNumber_(input);
    assert.ok(
      Object.is(client, server) || (Number.isNaN(client) && Number.isNaN(server)),
      `${JSON.stringify(String(input))}: cliente ${client} × Apps Script ${server}`,
    );
  }
});

test('o caso real da planilha resolve para o mesmo preço nos dois lados', () => {
  assert.equal(toNumber('R$ 290.000'), 290000);
  assert.equal(context.toNumber_('R$ 290.000'), 290000);
  // E, por consequência, a conferência de preço/m² fecha nos dois lados.
  assert.equal(pricePerM2('R$ 290.000', '37', ''), 290000 / 37);
  assert.equal(context.pricePerM2_(context.toNumber_('R$ 290.000'), context.toNumber_('37')), 290000 / 37);
});
