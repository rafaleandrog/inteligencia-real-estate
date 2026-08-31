// Escopo e procedência da série do IVV — issue #58.
//
// O erro que este arquivo impede não é de cálculo: é a tela AFIRMAR um recorte que o
// dado não tem. `IVV_MONTHLY` descreve o Distrito Federal inteiro; quem chega no
// dashboard vindo de um mapa com filtro de Região Administrativa espera, por
// continuidade, que os números respondam ao mesmo recorte. Eles não respondem.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ivvProvenance, ivvPeriodCovered, IVV_SCOPE_NOTICE } from '../src/ivv/scope.js';

const mes = (data, over = {}) => ({
  reference_date: data,
  source_publisher: 'Sinduscon-DF',
  geography_scope: 'Distrito Federal',
  market_scope: 'Residencial novo',
  segment_scope: 'Vertical e horizontal',
  quality_flag: 'published',
  source_url: 'https://exemplo.org/ivv.pdf',
  ...over,
});

test('a frase de escopo diz que o recorte por RA não existe', () => {
  // É a única coisa na tela que impede a leitura errada por continuidade com o mapa.
  assert.match(IVV_SCOPE_NOTICE, /Distrito Federal inteiro/);
  assert.match(IVV_SCOPE_NOTICE, /Região Administrativa/);
  assert.match(IVV_SCOPE_NOTICE, /não se aplicam/);
});

test('período coberto sai do primeiro ao último mês, com a contagem', () => {
  const out = ivvPeriodCovered([mes('2024-03-01'), mes('2024-01-01'), mes('2024-02-01')]);
  assert.deepEqual(out, { first: '2024-01-01', last: '2024-03-01', months: 3 });
});

test('período de um mês só não vira intervalo', () => {
  const { rows } = ivvProvenance([mes('2024-01-01')]);
  const periodo = rows.find((r) => r.label === 'Período coberto');
  assert.equal(periodo.value, '01/01/2024');
  assert.equal(/ a /.test(periodo.value), false);
});

test('série vazia não tem período nem procedência, e não estoura', () => {
  assert.equal(ivvPeriodCovered([]), null);
  assert.equal(ivvPeriodCovered(null), null);
  const { rows, warnings, sourceUrl } = ivvProvenance([]);
  assert.deepEqual(rows, []);
  assert.deepEqual(warnings, []);
  assert.equal(sourceUrl, null);
});

test('campo em que todos os meses concordam vira linha', () => {
  const { rows, sourceUrl } = ivvProvenance([mes('2024-01-01'), mes('2024-02-01')]);
  const porRotulo = Object.fromEntries(rows.map((r) => [r.label, r.value]));
  assert.equal(porRotulo['Publicado por'], 'Sinduscon-DF');
  assert.equal(porRotulo['Abrangência'], 'Distrito Federal');
  assert.equal(porRotulo['Mercado'], 'Residencial novo');
  assert.equal(porRotulo['Qualidade'], 'published');
  assert.equal(sourceUrl, 'https://exemplo.org/ivv.pdf');
});

test('campo em que os meses DIVERGEM some da tela e vira aviso', () => {
  // Mostrar "Publicado por: Sinduscon-DF" quando metade da série diz outra coisa é pior
  // que não mostrar fonte nenhuma: dá confiança a uma afirmação errada.
  const { rows, warnings } = ivvProvenance([
    mes('2024-01-01'),
    mes('2024-02-01', { source_publisher: 'Outro instituto' }),
  ]);
  assert.equal(rows.some((r) => r.label === 'Publicado por'), false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /source_publisher/);
  assert.match(warnings[0], /Sinduscon-DF/);
  assert.match(warnings[0], /Outro instituto/);
  // Os campos que continuam concordando seguem aparecendo.
  assert.equal(rows.some((r) => r.label === 'Abrangência'), true);
});

test('campo vazio em todos os meses não vira linha nem aviso', () => {
  // Ausência é o estado normal de várias colunas de escopo; um aviso por coluna vazia
  // encheria a tela e esconderia a divergência, que é o que importa.
  const { rows, warnings } = ivvProvenance([
    mes('2024-01-01', { market_scope: '', segment_scope: '   ' }),
    mes('2024-02-01', { market_scope: '', segment_scope: '' }),
  ]);
  assert.equal(rows.some((r) => r.label === 'Mercado'), false);
  assert.equal(rows.some((r) => r.label === 'Segmento'), false);
  assert.deepEqual(warnings, []);
});

test('campo presente em alguns meses e vazio em outros não é divergência', () => {
  // Um mês sem o campo não contradiz os que têm — só não acrescenta. Tratar isso como
  // divergência apagaria a fonte de uma série inteira por causa de uma célula vazia.
  const { rows, warnings } = ivvProvenance([
    mes('2024-01-01'),
    mes('2024-02-01', { source_publisher: '' }),
  ]);
  assert.equal(rows.find((r) => r.label === 'Publicado por').value, 'Sinduscon-DF');
  assert.deepEqual(warnings, []);
});

test('linha inválida na série não derruba a procedência', () => {
  const { rows } = ivvProvenance([null, mes('2024-01-01'), undefined, {}]);
  assert.equal(rows.find((r) => r.label === 'Publicado por').value, 'Sinduscon-DF');
  assert.equal(rows.find((r) => r.label === 'Período coberto').value, '01/01/2024');
});
