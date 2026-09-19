import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, buildHash, intParam, URL_KEYS, URL_VIEWS } from '../src/url-state.js';

// Estado da análise na URL (issue #127). O que este arquivo impede: chave desconhecida
// entrando no estado; view inventada; valor com caractere de controle; e `#mapa` sem
// filtro virando `#mapa?` — o hash de sempre precisa continuar igual.

test('hash vazio, só a view, view desconhecida e lixo', () => {
  assert.deepEqual(parseHash(''), { view: 'mapa', params: {} });
  assert.deepEqual(parseHash(null), { view: 'mapa', params: {} });
  assert.deepEqual(parseHash('#mercado'), { view: 'mercado', params: {} });
  assert.deepEqual(parseHash('#inventada?ra=RA_01'), { view: 'mapa', params: { ra: 'RA_01' } });
  assert.deepEqual(parseHash('#mapa?'), { view: 'mapa', params: {} });
  assert.deepEqual(parseHash('lixo?type=casa'), { view: 'mapa', params: { type: 'casa' } });
});

test('chave desconhecida é descartada; chave de outra view também', () => {
  assert.deepEqual(parseHash('#mapa?ra=RA_01&token=abc&tema=domicilios'), { view: 'mapa', params: { ra: 'RA_01' } });
  assert.deepEqual(parseHash('#diagnostico?ra=RA_20&ano=2024&tema=domicilios&beds=2'),
    { view: 'diagnostico', params: { ra: 'RA_20', ano: '2024', tema: 'domicilios' } });
});

test('valor inválido: vazio some, controle é removido, comprimento é limitado, repetido fica o primeiro', () => {
  assert.deepEqual(parseHash('#mapa?ra=&type=apartamento'), { view: 'mapa', params: { type: 'apartamento' } });
  assert.deepEqual(parseHash('#mapa?q=a%00b%1fc'), { view: 'mapa', params: { q: 'abc' } });
  const longo = 'x'.repeat(200);
  assert.equal(parseHash(`#mapa?q=${longo}`).params.q.length, 80);
  assert.deepEqual(parseHash('#mapa?ra=RA_01&ra=RA_02').params, { ra: 'RA_01' });
  assert.equal(intParam('2'), 2);
  assert.equal(intParam('2.5'), null);
  assert.equal(intParam(''), null);
  assert.equal(intParam('abc'), null);
  assert.equal(intParam(null), null);
});

test('round-trip: buildHash → parseHash devolve os mesmos parâmetros, na ordem declarada', () => {
  const params = { beds: '2', type: 'apartamento', ra: 'RA_01', price_max: '1500000' };
  const hash = buildHash('mapa', params);
  assert.equal(hash, '#mapa?ra=RA_01&type=apartamento&beds=2&price_max=1500000');
  assert.deepEqual(parseHash(hash), { view: 'mapa', params });
  const diag = buildHash('diagnostico', { ra: 'RA_20', ano: 2024, tema: 'domicilios' });
  assert.equal(diag, '#diagnostico?ra=RA_20&ano=2024&tema=domicilios');
  assert.deepEqual(parseHash(diag).params, { ra: 'RA_20', ano: '2024', tema: 'domicilios' });
});

test('sem parâmetro, o hash é só a view — nunca "#mapa?"', () => {
  assert.equal(buildHash('mapa', {}), '#mapa');
  assert.equal(buildHash('mapa', { ra: '', type: null, beds: undefined }), '#mapa');
  assert.equal(buildHash('mercado'), '#mercado');
  assert.equal(buildHash('view_inventada', { ra: 'x' }), '#mapa?ra=x');
  assert.equal(buildHash('mapa', { tema: 'x' }), '#mapa', 'chave de outra view não entra');
});

test('valores com espaço e acento sobrevivem ao round-trip', () => {
  const hash = buildHash('mapa', { locality: 'Asa Norte', q: 'Águas Claras' });
  assert.deepEqual(parseHash(hash).params, { locality: 'Asa Norte', q: 'Águas Claras' });
});

test('o vocabulário de views e chaves é fechado e congelado', () => {
  assert.deepEqual([...URL_VIEWS], ['mapa', 'mercado', 'diagnostico', 'ranking', 'comparar', 'base']);
  assert.ok(Object.isFrozen(URL_KEYS));
  for (const view of URL_VIEWS) assert.ok(Array.isArray(URL_KEYS[view]), view);
});
