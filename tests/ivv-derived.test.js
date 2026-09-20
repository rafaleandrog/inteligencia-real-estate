import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  safeRatio, askingSaleGap, netSales, replacementRatio, avgSaleTicket, avgLaunchTicket,
  avgSoldArea, avgOfferArea, cancellationsToSales, monthsOfSupply, buildMicroKpis,
} from '../src/ivv/derived.js';
import { aggregatePeriod } from '../src/ivv/aggregate.js';

// Derivados do Mercado (issue #125). O que este arquivo impede: divisão por zero virando
// Infinity na tela; dado não publicado virando zero; estoque sendo somado como fluxo;
// e a fórmula sumindo do lado do número.

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ivv-monthly.json', import.meta.url), 'utf8'));
const rows = fixture.rows;

test('safeRatio: null para denominador zero, ausência, NaN e Infinity — nunca Infinity/NaN', () => {
  assert.equal(safeRatio(10, 2), 5);
  for (const [n, d] of [[10, 0], [10, null], [null, 2], [NaN, 2], [10, NaN], [Infinity, 2], [10, undefined], ['10', 2]]) {
    assert.equal(safeRatio(n, d), null, `${n}/${d}`);
  }
});

test('gap pedido/venda, vendas líquidas, reposição, tickets, áreas e distrato/venda', () => {
  assert.ok(Math.abs(askingSaleGap(10000, 9200) - 0.08) < 1e-12);
  assert.equal(askingSaleGap(0, 9200), null, 'pedido zero não é gap infinito');
  assert.equal(askingSaleGap(null, 9200), null);
  assert.equal(askingSaleGap(10000, null), null);

  assert.equal(netSales(500, 40), 460);
  assert.equal(netSales(500, null), null, 'distrato não publicado: não há como afirmar o líquido');
  assert.equal(netSales(null, 40), null);

  assert.equal(replacementRatio(800, 400), 2);
  assert.equal(replacementRatio(800, 0), null);

  assert.equal(avgSaleTicket(418.38, 462), 418.38e6 / 462);
  assert.equal(avgSaleTicket(418.38, 0), null);
  assert.equal(avgSaleTicket(null, 462), null);
  assert.equal(avgLaunchTicket(567.48, 787), 567.48e6 / 787);
  assert.equal(avgLaunchTicket(567.48, null), null);

  assert.equal(avgSoldArea(37105, 462), 37105 / 462);
  assert.equal(avgSoldArea(37105, 0), null);
  assert.equal(avgOfferArea(513445, 6248), 513445 / 6248);
  assert.equal(avgOfferArea(null, 6248), null);

  assert.equal(cancellationsToSales(86, 462), 86 / 462);
  assert.equal(cancellationsToSales(86, 0), null);
});

test('meses de oferta: média do estoque sobre média do fluxo, só nos meses com os dois valores', () => {
  const tres = [
    { offers_units: 6000, sales_units: 500 },
    { offers_units: 6200, sales_units: 300 },
    { offers_units: 6400, sales_units: 400 },
  ];
  const r = monthsOfSupply(tres);
  assert.equal(r.monthsUsed, 3);
  assert.equal(r.value, (6200) / (400));
  // Estoque nunca é somado: com um mês só, o valor é oferta/vendas daquele mês.
  assert.equal(monthsOfSupply([tres[0]]).value, 12);

  // Mês ausente (sem vendas publicadas) fica de fora e é contado como não usado.
  const comBuraco = [...tres, { offers_units: 7000, sales_units: null }, { offers_units: null, sales_units: 100 }, null];
  assert.equal(monthsOfSupply(comBuraco).monthsUsed, 3);
  assert.equal(monthsOfSupply(comBuraco).value, r.value);

  // Vazio, null, NaN, vendas zero.
  assert.deepEqual(monthsOfSupply([]), { value: null, monthsUsed: 0 });
  assert.deepEqual(monthsOfSupply(null), { value: null, monthsUsed: 0 });
  assert.deepEqual(monthsOfSupply([{ offers_units: NaN, sales_units: 1 }]), { value: null, monthsUsed: 0 });
  assert.deepEqual(monthsOfSupply([{ offers_units: 100, sales_units: 0 }]), { value: null, monthsUsed: 1 });
});

test('buildMicroKpis sobre o fixture: seis itens, na ordem da tela, com fórmula e valor formatado', () => {
  const aggregated = aggregatePeriod(rows.slice(0, 12));
  const kpis = buildMicroKpis(aggregated, rows.slice(0, 12));
  assert.deepEqual(kpis.map((k) => k.key), [
    'asking_sale_gap', 'months_of_supply', 'replacement_ratio', 'avg_sale_ticket', 'avg_sold_area', 'cancellations_to_sales',
  ]);
  for (const k of kpis) {
    assert.ok(k.label && k.formula && k.absent, k.key);
    assert.notEqual(k.raw, null, `${k.key} devia ter valor no fixture`);
    assert.equal(typeof k.value, 'string');
    assert.ok(Number.isFinite(k.raw));
  }
  const gap = kpis.find((k) => k.key === 'asking_sale_gap');
  assert.match(gap.value, /%$/);
  const supply = kpis.find((k) => k.key === 'months_of_supply');
  assert.match(supply.value, /meses$/);
  assert.match(supply.formula, /12 mês/);
  const ticket = kpis.find((k) => k.key === 'avg_sale_ticket');
  assert.match(ticket.value, /^R\$/);
  const area = kpis.find((k) => k.key === 'avg_sold_area');
  assert.match(area.value, /m²$/);
  const ratio = kpis.find((k) => k.key === 'replacement_ratio');
  assert.match(ratio.value, /×$/);
});

test('período vazio, null e período incompleto: valor null com frase de ausência, nunca zero', () => {
  for (const vazio of [aggregatePeriod([]), null, undefined, { values: {} }]) {
    const kpis = buildMicroKpis(vazio, []);
    assert.equal(kpis.length, 6);
    for (const k of kpis) {
      assert.equal(k.value, null, k.key);
      assert.equal(k.raw, null, k.key);
      assert.match(k.absent, /Sem /);
    }
  }
  // Período incompleto: meses sem distrato publicado derrubam só o indicador que depende dele.
  const semDistrato = rows.slice(0, 3).map((r) => ({ ...r, cancellations_units: null, cancellations_units_ytd: null }));
  const kpis = buildMicroKpis(aggregatePeriod(semDistrato), semDistrato);
  assert.equal(kpis.find((k) => k.key === 'cancellations_to_sales').value, null);
  assert.notEqual(kpis.find((k) => k.key === 'avg_sale_ticket').value, null);
});
