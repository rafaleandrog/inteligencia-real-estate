// Motor de agregação de período do IVV.
//
// O erro que este arquivo existe para impedir é caro e invisível: somar uma métrica de estoque
// devolve um número plausível, bem formatado e errado.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  aggregatePeriod, aggregateMetric, monthlySeries, prepareRows,
  IvvAggregationError, VALUE_ORIGINS,
} from '../src/ivv/aggregate.js';
import { IVV_METRICS, METRIC_KEYS, METRIC_KINDS, METRIC_BY_KEY } from '../src/ivv/metrics.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ivv-monthly.json', import.meta.url)));
const rows = fixture.rows;
const year2024 = rows.filter((row) => row.reference_month.startsWith('2024'));
const close = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `esperado ${expected}, recebido ${actual}`);
};

test('o fixture é declaradamente sintético', () => {
  assert.ok(fixture._comment.join(' ').includes('SINTÉTICO'));
  assert.equal(rows.length, 24);
});

test('agregar UM mês devolve exatamente os valores daquele mês, para toda métrica', () => {
  for (const row of [rows[0], rows[7], rows[23]]) {
    const result = aggregatePeriod([row]);
    assert.deepEqual(result.unsupported, {}, 'mês único não recusa nenhuma métrica');
    assert.equal(result.period.months, 1);
    for (const key of METRIC_KEYS) {
      assert.equal(result.values[key].value, row[key], `${key} em ${row.reference_month}`);
      assert.equal(result.values[key].origin, VALUE_ORIGINS.PUBLICADO, key);
    }
  }
});

test('estoque agrega por MÉDIA, nunca por soma — 12 meses', () => {
  const result = aggregatePeriod(year2024);
  assert.equal(result.period.months, 12);
  for (const metric of IVV_METRICS.filter((m) => m.kind === METRIC_KINDS.ESTOQUE)) {
    const values = year2024.map((row) => row[metric.key]);
    const sum = values.reduce((acc, value) => acc + value, 0);
    const mean = sum / values.length;
    const got = result.values[metric.key];
    close(got.value, mean, 1e-6);
    assert.equal(got.origin, VALUE_ORIGINS.MEDIA);
    assert.notEqual(got.value, sum);
    // A prova do estrago que se evita: a soma é ~12× a média.
    close(sum / got.value, 12, 1e-9);
    assert.ok(got.value < sum, `${metric.key}: média deveria ser muito menor que a soma`);
  }
});

test('fluxo agrega por SOMA', () => {
  const result = aggregatePeriod(year2024, { preferYtd: false });
  for (const metric of IVV_METRICS.filter((m) => m.kind === METRIC_KINDS.FLUXO)) {
    const sum = year2024.reduce((acc, row) => acc + row[metric.key], 0);
    close(result.values[metric.key].value, sum, 1e-6);
    assert.equal(result.values[metric.key].origin, VALUE_ORIGINS.SOMA);
  }
});

test('preço do período é razão ponderada e DIFERE da média simples quando as áreas diferem', () => {
  const result = aggregatePeriod(year2024);

  const asking = METRIC_BY_KEY.asking_price_brl_m2;
  const vgo = year2024.reduce((acc, row) => acc + row.vgo_brl_million, 0);
  const area = year2024.reduce((acc, row) => acc + row.offer_area_m2, 0);
  const weighted = (vgo * 1e6) / area;
  const simple = year2024.reduce((acc, row) => acc + row[asking.key], 0) / year2024.length;

  close(result.values[asking.key].value, weighted, 1e-6);
  assert.equal(result.values[asking.key].origin, VALUE_ORIGINS.RAZAO_PONDERADA);

  // As áreas mensais diferem de verdade — sem isso o teste não provaria nada.
  const areas = year2024.map((row) => row.offer_area_m2);
  assert.ok(Math.max(...areas) - Math.min(...areas) > 0, 'áreas idênticas: teste sem valor');
  assert.notEqual(weighted, simple);
  assert.ok(Math.abs(weighted - simple) > 0.01,
    `ponderada ${weighted} vs média simples ${simple}: diferença precisa ser visível`);

  // Mesmo raciocínio para o preço de venda.
  const sale = METRIC_BY_KEY.sale_price_brl_m2;
  const vgv = year2024.reduce((acc, row) => acc + row.vgv_brl_million, 0);
  const soldArea = year2024.reduce((acc, row) => acc + row.sold_area_m2, 0);
  close(result.values[sale.key].value, (vgv * 1e6) / soldArea, 1e-6);
});

test('preço ponderado é sensível ao peso: mês grande e barato puxa mais que mês pequeno e caro', () => {
  const barato = {
    reference_date: '2025-01-01', vgo_brl_million: 900, offer_area_m2: 90000,
    asking_price_brl_m2: 10000,
  };
  const caro = {
    reference_date: '2025-02-01', vgo_brl_million: 20, offer_area_m2: 1000,
    asking_price_brl_m2: 20000,
  };
  const value = aggregateMetric([barato, caro], 'asking_price_brl_m2').value;
  close(value, (920 * 1e6) / 91000, 1e-9);   // ≈ 10.110,99
  assert.ok(value < 11000, 'a média simples daria 15.000 — errado por 48%');
});

test('preço sem ponderador não vira média simples: recusa com aviso (R5.7)', () => {
  const semArea = [
    { reference_date: '2025-01-01', asking_price_brl_m2: 10000 },
    { reference_date: '2025-02-01', asking_price_brl_m2: 20000 },
  ];
  const result = aggregateMetric(semArea, 'asking_price_brl_m2');
  assert.equal(result.value, null);
  assert.equal(result.origin, VALUE_ORIGINS.INDISPONIVEL);
  assert.equal(result.warnings[0].code, 'SEM_PONDERADOR');
  assert.match(result.warnings[0].message, /média simples/i);
});

test('launches_developments recusa agregação entre meses, com mensagem legível', () => {
  assert.throws(
    () => aggregateMetric(year2024, 'launches_developments'),
    (error) => {
      assert.ok(error instanceof IvvAggregationError);
      assert.equal(error.code, 'METRICA_NAO_SOMAVEL');
      assert.equal(error.metric, 'launches_developments');
      assert.match(error.message, /Empreendimentos lançados/);
      assert.match(error.message, /não pode ser agregado entre meses \(12 meses no período\)/);
      assert.match(error.message, /Consulte mês a mês/);
      return true;
    },
  );

  // No período inteiro a recusa não derruba nada: vira entrada em `unsupported`.
  const result = aggregatePeriod(year2024);
  assert.equal(result.values.launches_developments, undefined);
  assert.equal(result.unsupported.launches_developments.code, 'METRICA_NAO_SOMAVEL');
  assert.equal(result.unsupported.launches_developments.label, 'Empreendimentos lançados');
  // E as demais métricas continuam agregadas.
  assert.ok(result.values.sales_units.value > 0);
});

test('métrica fora do registro é recusada — nunca somada por omissão', () => {
  assert.throws(
    () => aggregateMetric(year2024, 'indicador_novo_units'),
    (error) => {
      assert.equal(error.code, 'METRICA_NAO_DECLARADA');
      assert.match(error.message, /não está declarada em src\/ivv\/metrics\.js/);
      return true;
    },
  );
  assert.throws(() => monthlySeries(year2024, 'indicador_novo_units'), IvvAggregationError);
});

test('acumulado de janeiro a um mês do mesmo ano usa o campo *_ytd do backend', () => {
  const janJun = year2024.slice(0, 6);
  const result = aggregatePeriod(janJun);
  assert.equal(result.period.yearToDate, true);
  const sales = result.values.sales_units;
  assert.equal(sales.origin, VALUE_ORIGINS.YTD_BACKEND);
  assert.equal(sales.value, janJun[5].sales_units_ytd);

  // Estoque e preço não têm acumulado: continuam média e razão ponderada.
  assert.equal(result.values.offers_units.origin, VALUE_ORIGINS.MEDIA);
  assert.equal(result.values.asking_price_brl_m2.origin, VALUE_ORIGINS.RAZAO_PONDERADA);
});

test('período que não começa em janeiro, ou cruza o ano, NÃO usa *_ytd', () => {
  const marAgo = year2024.slice(2, 8);
  const marAgoResult = aggregatePeriod(marAgo);
  assert.equal(marAgoResult.period.yearToDate, false);
  assert.equal(marAgoResult.values.sales_units.origin, VALUE_ORIGINS.SOMA);
  close(marAgoResult.values.sales_units.value,
    marAgo.reduce((acc, row) => acc + row.sales_units, 0), 1e-9);

  const cruzaAno = rows.slice(6, 18); // jul/2024 a jun/2025
  const cruzado = aggregatePeriod(cruzaAno);
  assert.equal(cruzado.period.yearToDate, false);
  assert.equal(cruzado.values.sales_units.origin, VALUE_ORIGINS.SOMA);
  // O acumulado do backend zera em janeiro: usá-lo aqui perderia o segundo semestre inteiro.
  assert.ok(cruzado.values.sales_units.value > cruzaAno[11].sales_units_ytd);
});

test('acumulado do backend prevalece, mas divergência com a soma vira aviso', () => {
  const janMar = year2024.slice(0, 3).map((row) => ({ ...row }));
  const somaReal = janMar.reduce((acc, row) => acc + row.sales_units, 0);
  janMar[2].sales_units_ytd = somaReal + 500;
  const result = aggregateMetric(janMar, 'sales_units');
  assert.equal(result.value, somaReal + 500, 'o publicado prevalece (Recomendação 9)');
  assert.equal(result.origin, VALUE_ORIGINS.YTD_BACKEND);
  const aviso = result.warnings.find((item) => item.code === 'DIVERGENCIA_YTD');
  assert.ok(aviso, 'divergência precisa ser sinalizada');
  assert.match(aviso.message, /prevalece/);
});

test('ivv_pct do período é razão ponderada, não média aritmética das taxas', () => {
  // `preferYtd: false` isola a propriedade sob teste: com o atalho ligado, um ano civil
  // completo devolve o acumulado publicado pelo backend — coberto no teste seguinte.
  const result = aggregatePeriod(year2024, { preferYtd: false });
  const ivv = result.values.ivv_pct;
  const sales = year2024.reduce((acc, row) => acc + row.sales_units, 0);
  const offers = year2024.reduce((acc, row) => acc + row.offers_units, 0);
  close(ivv.value, sales / offers, 1e-12);
  assert.equal(ivv.origin, VALUE_ORIGINS.RAZAO_PONDERADA);
  assert.ok(ivv.value > 0 && ivv.value < 1, 'resultado permanece na escala decimal');

  const mediaCega = year2024.reduce((acc, row) => acc + row.ivv_pct, 0) / year2024.length;
  assert.notEqual(ivv.value, mediaCega);
});

test('a razão ponderada do IVV pesa o estoque de cada mês', () => {
  // Mês grande com IVV baixo + mês pequeno com IVV alto: a média cega daria 27,5%.
  const grande = { reference_date: '2025-01-01', sales_units: 250, offers_units: 5000, ivv_pct: 0.05 };
  const pequeno = { reference_date: '2025-02-02', sales_units: 50, offers_units: 100, ivv_pct: 0.5 };
  const value = aggregateMetric([grande, pequeno], 'ivv_pct').value;
  close(value, 300 / 5100, 1e-12); // ≈ 5,88%
  assert.ok(value < 0.07, `média aritmética (0,275) seria 4,7× maior; obtido ${value}`);
});

test('ivv_pct publicado vence ivv_calc_pct, e a divergência é sinalizada', () => {
  const mes = { ...rows[0], ivv_calc_pct: rows[0].ivv_pct * 1.2 };
  const result = aggregateMetric([mes], 'ivv_pct');
  assert.equal(result.value, mes.ivv_pct, 'o valor publicado nunca é substituído');
  const aviso = result.warnings.find((item) => item.code === 'DIVERGENCIA_BACKEND');
  assert.ok(aviso);
  assert.match(aviso.message, /publicado/);
  assert.equal(aviso.detail.column, 'ivv_calc_pct');
});

test('divergência dentro da tolerância não vira ruído', () => {
  const result = aggregateMetric([rows[0]], 'ivv_pct');
  assert.equal(result.warnings.length, 0, 'arredondamento normal não deve gerar aviso');
});

test('IVV em escala de pontos percentuais é sinalizado, não convertido em silêncio', () => {
  // É exatamente o que a semente .xlsx grava: ivv_pct = 6.5 para 6,5%.
  const result = aggregateMetric([{ reference_date: '2026-05-01', ivv_pct: 6.5 }], 'ivv_pct');
  assert.equal(result.value, 6.5, 'o motor não converte escala — quem converte é o normalizador');
  const aviso = result.warnings.find((item) => item.code === 'ESCALA_INESPERADA');
  assert.ok(aviso);
  assert.match(aviso.message, /escala decimal/);
});

test('mês faltando no meio do período vira aviso, e o número diz sobre quantos meses foi feito', () => {
  const comBuraco = year2024.map((row, index) => (index === 5
    ? { ...row, sales_units: null, offers_units: null }
    : row));
  const result = aggregatePeriod(comBuraco, { preferYtd: false });
  assert.equal(result.values.sales_units.monthsWithData, 11);
  assert.equal(result.values.sales_units.monthsInPeriod, 12);
  assert.ok(result.warnings.some((item) => item.code === 'MESES_INCOMPLETOS'
    && item.metric === 'sales_units'));
  // Média de estoque sobre 11 meses, não sobre 12 — dividir por 12 subestimaria o estoque.
  const offers = comBuraco.filter((row) => row.offers_units !== null)
    .reduce((acc, row) => acc + row.offers_units, 0);
  close(result.values.offers_units.value, offers / 11, 1e-9);
});

test('dado sujo não derruba o motor (R2.6)', () => {
  const sujas = [
    null,
    { reference_date: 'não é data', sales_units: 10 },
    {
      reference_date: '2025-03-01',
      sales_units: '1234',
      offers_units: '5 000',
      // Formato brasileiro com moeda e NBSP, como o Sheets exporta uma célula formatada.
      vgv_brl_million: 'R$\u00a01.234,56',
      ivv_pct: '0,05',
    },
    { reference_date: '2025-03-15', sales_units: 7 }, // mesmo mês: duplicata
  ];
  const result = aggregatePeriod(sujas);
  assert.equal(result.period.months, 1);
  assert.equal(result.values.sales_units.value, 1234);
  assert.equal(result.values.offers_units.value, 5000);
  assert.equal(result.values.vgv_brl_million.value, 1234.56, 'formato brasileiro com moeda é lido');
  assert.equal(result.values.ivv_pct.value, 0.05);
  const codigos = result.warnings.map((item) => item.code);
  assert.ok(codigos.includes('LINHA_INVALIDA'));
  assert.ok(codigos.includes('MES_SEM_DATA'));
  assert.ok(codigos.includes('MES_DUPLICADO'));
});

test('período vazio devolve estrutura utilizável, não exceção', () => {
  for (const entrada of [[], null, undefined]) {
    const result = aggregatePeriod(entrada);
    assert.equal(result.period.months, 0);
    assert.equal(result.period.start, null);
    assert.equal(result.values.sales_units.value, null);
    assert.equal(result.values.sales_units.origin, VALUE_ORIGINS.INDISPONIVEL);
    assert.deepEqual(result.unsupported, {});
  }
});

test('as linhas são ordenadas pelo eixo temporal canônico, venham na ordem que vierem', () => {
  const embaralhado = [rows[5], rows[0], rows[11], rows[3]];
  const { rows: prepared } = prepareRows(embaralhado);
  assert.deepEqual(prepared.map((item) => item.month),
    ['2024-01', '2024-04', '2024-06', '2024-12']);
  const result = aggregatePeriod(embaralhado);
  assert.equal(result.period.start, '2024-01');
  assert.equal(result.period.end, '2024-12');
  assert.equal(result.period.yearToDate, false, 'quatro meses salteados não são acumulado do ano');
});

test('monthlySeries devolve a série mensal ordenada, sem agregar', () => {
  const serie = monthlySeries(year2024, 'offers_units');
  assert.equal(serie.length, 12);
  assert.deepEqual(serie.map((item) => item.value), year2024.map((row) => row.offers_units));
});

test('o resultado carrega rótulo, unidade e natureza — a tela não reconstrói metodologia', () => {
  const result = aggregatePeriod(year2024);
  const ivv = result.values.ivv_pct;
  assert.equal(ivv.label, 'IVV (índice de velocidade de vendas)');
  assert.equal(ivv.unit, 'fracao');
  assert.equal(ivv.kind, METRIC_KINDS.TAXA);
  assert.equal(result.values.offers_units.kind, METRIC_KINDS.ESTOQUE);
  assert.equal(result.values.sales_units.kind, METRIC_KINDS.FLUXO);
});

test('mês sem a coluna de conferência não desliga a conferência dos outros meses', () => {
  const semColuna = { reference_date: '2025-01-01', ivv_pct: 0.05, sales_units: 250, offers_units: 5000 };
  const comDivergencia = {
    reference_date: '2025-02-01', ivv_pct: 0.06, sales_units: 300, offers_units: 5000,
    ivv_calc_pct: 0.09,
  };
  const result = aggregateMetric([semColuna, comDivergencia], 'ivv_pct');
  const aviso = result.warnings.find((item) => item.code === 'DIVERGENCIA_BACKEND');
  assert.ok(aviso, 'a divergência do segundo mês precisa ser vista');
  assert.equal(aviso.detail.month, '2025-02');
});

test('aggregateMetric aceita tanto linhas cruas quanto o resultado de prepareRows', () => {
  const cruas = year2024.slice(0, 3);
  const { rows: preparadas } = prepareRows(cruas);
  assert.equal(
    aggregateMetric(cruas, 'offers_units').value,
    aggregateMetric(preparadas, 'offers_units').value,
  );
});

// ---------------------------------------------------------------------------
// Issue #68 — dois defeitos que passaram por 339 testes verdes.
//
// Nenhum dos testes acima exercitava (a) um ano civil completo com a coluna de acumulado
// publicada, nem (b) um mês com só um lado da razão presente. Os dois defeitos produziam
// número plausível, formatado e errado — sem exceção, sem aviso, sem sintoma.
// ---------------------------------------------------------------------------

test('#68 · ano civil completo devolve o IVV acumulado publicado, não o recálculo', () => {
  const result = aggregateMetric(year2024, 'ivv_pct');
  assert.equal(result.origin, VALUE_ORIGINS.YTD_BACKEND,
    'publicado vence recalculado também para `taxa`, não só para `fluxo`');
  assert.equal(result.value, year2024[11].ivv_ytd_pct);

  // E o recálculo continua acessível, explicitamente.
  const recalculado = aggregateMetric(year2024, 'ivv_pct', { preferYtd: false });
  assert.equal(recalculado.origin, VALUE_ORIGINS.RAZAO_PONDERADA);
  const sales = year2024.reduce((acc, row) => acc + row.sales_units, 0);
  const offers = year2024.reduce((acc, row) => acc + row.offers_units, 0);
  close(recalculado.value, sales / offers, 1e-12);

  // O defeito era invisível justamente porque os dois números são próximos: 0,058 contra
  // 0,05795…. Nada na tela denunciaria a troca.
  assert.notEqual(result.value, recalculado.value);
});

test('#68 · janeiro→junho também usa o acumulado publicado do IVV', () => {
  const janJun = year2024.slice(0, 6);
  const result = aggregateMetric(janJun, 'ivv_pct');
  assert.equal(result.origin, VALUE_ORIGINS.YTD_BACKEND);
  assert.equal(result.value, janJun[5].ivv_ytd_pct);
});

test('#68 · período que não é acumulado do ano continua recalculando o IVV', () => {
  for (const recorte of [year2024.slice(2, 8), rows.slice(6, 18), [year2024[0]]]) {
    const result = aggregateMetric(recorte, 'ivv_pct');
    assert.notEqual(result.origin, VALUE_ORIGINS.YTD_BACKEND,
      `${recorte[0].reference_month}..${recorte[recorte.length - 1].reference_month}`);
  }
});

test('#68 · acumulado do IVV prevalece sobre a razão, mas a divergência é sinalizada', () => {
  const adulterado = year2024.map((row) => ({ ...row }));
  adulterado[11].ivv_ytd_pct = 0.2; // muito acima da razão real (~0,058)
  const result = aggregateMetric(adulterado, 'ivv_pct');
  assert.equal(result.value, 0.2, 'o publicado nunca é substituído (R8.54)');
  assert.equal(result.origin, VALUE_ORIGINS.YTD_BACKEND);
  const aviso = result.warnings.find((item) => item.code === 'DIVERGENCIA_YTD');
  assert.ok(aviso, 'divergência entre acumulado e razão precisa ser sinalizada');
  assert.match(aviso.message, /prevalece/);
});

test('#68 · mês com só um lado da razão sai da razão INTEIRA, não de metade dela', () => {
  // fev tem `offers_units` e não tem `sales_units`: antes, o mês entrava no denominador e
  // ficava fora do numerador, e a taxa saía 7,9% mais baixa sem nenhum aviso.
  const furado = year2024.map((row, index) => (
    index === 1 ? { ...row, sales_units: null } : row
  ));
  const result = aggregateMetric(furado, 'ivv_pct', { preferYtd: false });

  const pareados = furado.filter((row) => row.sales_units !== null && row.offers_units !== null);
  const esperado = pareados.reduce((acc, row) => acc + row.sales_units, 0)
    / pareados.reduce((acc, row) => acc + row.offers_units, 0);
  close(result.value, esperado, 1e-12);
  assert.equal(result.monthsWithData, 11, 'só os meses pareados sustentam a razão');

  const aviso = result.warnings.find((item) => item.code === 'PAREAMENTO_INCOMPLETO');
  assert.ok(aviso, 'descarte silencioso é o que a R5.7 proíbe');
  assert.equal(aviso.detail.month, '2024-02');
  assert.equal(aviso.detail.missing, 'sales_units');
  assert.match(aviso.message, /2024-02/);
  assert.match(aviso.message, /sales_units/);

  // O tamanho do estrago que o pareamento evita: a razão não pareada erra ~8%.
  const naoPareado = furado.reduce((acc, row) => acc + (row.sales_units || 0), 0)
    / furado.reduce((acc, row) => acc + row.offers_units, 0);
  assert.ok(Math.abs(naoPareado / esperado - 1) > 0.05,
    'o cenário precisa produzir erro grande o bastante para o teste ter valor');
});

test('#68 · o pareamento vale para as duas métricas de preço, dos dois lados da razão', () => {
  const casos = [
    { metric: 'asking_price_brl_m2', faltando: 'vgo_brl_million' },
    { metric: 'asking_price_brl_m2', faltando: 'offer_area_m2' },
    { metric: 'sale_price_brl_m2', faltando: 'vgv_brl_million' },
    { metric: 'sale_price_brl_m2', faltando: 'sold_area_m2' },
  ];
  for (const { metric, faltando } of casos) {
    const furado = year2024.map((row, index) => (
      index === 4 ? { ...row, [faltando]: null } : row
    ));
    const result = aggregateMetric(furado, metric);
    const info = METRIC_BY_KEY[metric];
    const pareados = furado.filter(
      (row) => row[info.numerator] !== null && row[info.denominator] !== null,
    );
    const esperado = (pareados.reduce((acc, row) => acc + row[info.numerator], 0) * 1e6)
      / pareados.reduce((acc, row) => acc + row[info.denominator], 0);
    close(result.value, esperado, 1e-6);
    assert.equal(result.monthsWithData, 11, `${metric} sem ${faltando}`);
    const aviso = result.warnings.find((item) => item.code === 'PAREAMENTO_INCOMPLETO');
    assert.ok(aviso, `${metric} sem ${faltando}: mês descartado precisa aparecer`);
    assert.equal(aviso.detail.month, '2024-05');
    assert.equal(aviso.detail.missing, faltando);
  }
});

test('#68 · mês sem NENHUM dos dois lados é ausência de dado, não descarte de pareamento', () => {
  // A distinção importa: um mês vazio já aparece em `monthsWithData`, e avisar sobre ele
  // encheria a tela de ruído justamente onde o aviso precisa ser lido.
  const vazio = year2024.map((row, index) => (
    index === 3 ? { ...row, sales_units: null, offers_units: null } : row
  ));
  const result = aggregateMetric(vazio, 'ivv_pct', { preferYtd: false });
  assert.equal(result.warnings.filter((item) => item.code === 'PAREAMENTO_INCOMPLETO').length, 0);
  assert.equal(result.monthsWithData, 11);
  assert.ok(result.value > 0);
});

test('#68 · nenhum mês pareado devolve null com aviso, nunca média simples', () => {
  const semPar = [
    { reference_date: '2025-01-01', sales_units: 100, ivv_pct: 0.05 },
    { reference_date: '2025-02-01', offers_units: 5000, ivv_pct: 0.06 },
  ];
  const result = aggregateMetric(semPar, 'ivv_pct');
  assert.equal(result.value, null);
  assert.equal(result.origin, VALUE_ORIGINS.INDISPONIVEL);
  assert.ok(result.warnings.some((item) => item.code === 'SEM_PONDERADOR'));
  assert.equal(result.warnings.filter((item) => item.code === 'PAREAMENTO_INCOMPLETO').length, 2);
});

test('#68 · o preço ainda não tem coluna de acumulado publicada, e o caminho fica declarado', () => {
  // `asking_price_brl_m2` não declara `ytdColumn` no registro: o atalho é inerte hoje e passa
  // a valer no dia em que a coluna for confirmada na planilha, sem mudar o motor.
  assert.equal(METRIC_BY_KEY.asking_price_brl_m2.ytdColumn, undefined);
  assert.equal(aggregateMetric(year2024, 'asking_price_brl_m2').origin,
    VALUE_ORIGINS.RAZAO_PONDERADA);
});

test('#68 · coluna de acumulado existente e ZERADA não vira "0%" com cara de publicado', () => {
  // O caminho mais perigoso que o atalho YTD abre: a coluna existe, o backend ainda não a
  // preencheu, e o publicado passa a valer 0. O valor continua prevalecendo — publicado é
  // publicado — mas a divergência contra a razão precisa aparecer, senão a tela afirma que
  // o mercado vendeu zero com toda a formatação de um número correto.
  const zerado = year2024.map((row) => ({ ...row }));
  zerado[11].ivv_ytd_pct = 0;
  const result = aggregateMetric(zerado, 'ivv_pct');
  assert.equal(result.value, 0);
  assert.equal(result.origin, VALUE_ORIGINS.YTD_BACKEND);
  const aviso = result.warnings.find((item) => item.code === 'DIVERGENCIA_YTD');
  assert.ok(aviso, 'acumulado zerado precisa ser confrontado com a razão');
  assert.equal(aviso.detail.pairedMonths, 12);
});

test('#68 · no caminho do acumulado, monthsWithData descreve o período, não o recálculo', () => {
  const result = aggregateMetric(year2024, 'ivv_pct');
  assert.equal(result.origin, VALUE_ORIGINS.YTD_BACKEND);
  assert.equal(result.monthsWithData, 12);
  assert.equal(result.monthsInPeriod, 12);
});
