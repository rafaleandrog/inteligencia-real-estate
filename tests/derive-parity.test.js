import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAppsScriptSandbox } from './helpers/appsScriptSandbox.mjs';
import { readXlsx } from '../tools/xlsx.mjs';
import {
  normalizeSlug, inferSalesStage, inferAnchorGroup, inferAnchorSegment, deriveRow,
} from '../tools/derive.mjs';

// tools/derive.mjs é uma cópia à mão de quatro funções do optional-apps-script/Code.gs,
// porque o gerador do demo roda em Node e o Code.gs roda no Apps Script. Cópia à mão só
// é aceitável com um teste que a cobre: aqui o Code.gs REAL é executado no sandbox de vm
// e as duas implementações são comparadas entrada por entrada. Editar só um dos lados
// falha. Mesmo precedente do teste que afirma que `pricePerM2_` concorda com
// `pricePerM2`.

const { context } = createAppsScriptSandbox({ sheets: {}, scriptProperties: {} });
const workbook = readXlsx(readFileSync(new URL('../migration/imob-intelligence-backend.xlsx', import.meta.url)));

// Entradas de borda que a semente não tem — o vazio, o espaço, o acento, o nulo e um
// valor que nenhuma regra reconhece. É onde uma divergência de `''` vs `undefined`
// aparece, e é justamente o que a semente, sendo dado bem-comportado, não testaria.
const EDGE_INPUTS = ['', '   ', null, undefined, 'Lançamento', 'EM OBRAS', 'Pronto para morar',
  'valor que ninguém reconhece', 'Saúde', 'Mobilidade', 'supermercado/atacarejo'];

test('normalizeSlug() concorda com normalizeSlug_() do Code.gs', () => {
  for (const input of EDGE_INPUTS) {
    assert.equal(normalizeSlug(input), context.normalizeSlug_(input), JSON.stringify(input));
  }
});

test('inferSalesStage() concorda com inferSalesStage_() para todo status da semente', () => {
  const statuses = new Set(EDGE_INPUTS);
  for (const row of workbook.DEVELOPMENTS.rows) statuses.add(row.status);
  assert.ok(statuses.size > EDGE_INPUTS.length, 'a semente não trouxe nenhum status — teste vazio');

  for (const status of statuses) {
    assert.equal(inferSalesStage(status), context.inferSalesStage_(status), JSON.stringify(status));
  }
});

test('inferAnchorGroup()/inferAnchorSegment() concordam com o Code.gs para toda âncora da semente', () => {
  const triples = workbook.ANCHORS.rows.map((row) => [row.category, row.subcategory, row.name]);
  for (const input of EDGE_INPUTS) triples.push([input, input, input]);
  assert.ok(triples.length > EDGE_INPUTS.length, 'a semente não trouxe nenhuma âncora — teste vazio');

  for (const [category, subcategory, name] of triples) {
    const label = JSON.stringify([category, subcategory, name]);
    assert.equal(inferAnchorGroup(category), context.inferAnchorGroup_(category), label);
    assert.equal(
      inferAnchorSegment(category, subcategory, name),
      context.inferAnchorSegment_(category, subcategory, name),
      label,
    );
  }
});

// Uma derivação que produzisse valor fora do vocabulário fechado seria pior que nenhuma:
// o importador criaria linhas que o próprio servidor rejeita em `validateAll()`.
test('toda derivação de vocabulário fechado cai dentro do enum do backend', () => {
  const stages = new Set(context.ENUM_VALUES.sales_stage);
  const groups = new Set(context.ENUM_VALUES.group);

  for (const row of workbook.DEVELOPMENTS.rows) {
    const stage = inferSalesStage(row.status);
    assert.ok(stage === '' || stages.has(stage), `sales_stage inválido: ${stage}`);
  }
  for (const row of workbook.ANCHORS.rows) {
    const group = inferAnchorGroup(row.category);
    assert.ok(group === '' || groups.has(group), `group inválido: ${group}`);
  }
});

// `segment` é vocabulário ABERTO — não há enum para conferir. O que dá para exigir é que
// a derivação nunca invente um valor que o próprio backend não produziria, o que já é
// coberto acima, e que o formato seja slug: nada de acento, espaço ou maiúscula vazando
// para um campo que vira chave de filtro e de cor no mapa.
test('todo segmento derivado é um slug, não texto livre', () => {
  for (const row of workbook.ANCHORS.rows) {
    const segment = inferAnchorSegment(row.category, row.subcategory, row.name);
    if (segment === '') continue;
    assert.match(segment, /^[a-z0-9]+(_[a-z0-9]+)*$/, `segmento fora do formato slug: ${segment}`);
  }
});

test('deriveRow() só preenche célula vazia — valor informado sempre vence', () => {
  const informed = deriveRow('DEVELOPMENTS', { status: 'Em obras', sales_stage: 'oferta' });
  assert.equal(informed.sales_stage, 'oferta');

  const derived = deriveRow('DEVELOPMENTS', { status: 'Em obras', sales_stage: '' });
  assert.equal(derived.sales_stage, 'em_construcao');

  const anchor = deriveRow('ANCHORS', { category: 'Mobilidade', subcategory: 'Metrô', name: 'X', group: 'comercio_servico' });
  assert.equal(anchor.group, 'comercio_servico', 'group informado não pode ser sobrescrito');
  assert.equal(anchor.segment, 'estacao_metro');
});

test('deriveRow() não inventa coluna em aba que não tem derivação', () => {
  const row = { listing_id: 'L1', price: 100 };
  assert.deepEqual(deriveRow('LISTINGS', row), row);
});
