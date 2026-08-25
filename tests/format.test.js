import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatBRL, formatBRLCompact, formatM2, formatPriceM2, formatNumber, formatDate,
  escapeHtml, safeExternalUrl, hostnameOf, formatPropertyType, formatSpatialPrecision,
  formatBuildingOrientation,
} from '../src/format.js';

test('ausência vira travessão, não zero', () => {
  // "R$ 0" afirma que o imóvel é de graça; "—" afirma que não se sabe.
  for (const fn of [formatBRL, formatM2, formatPriceM2, formatNumber]) {
    assert.equal(fn(null), '—');
    assert.equal(fn(undefined), '—');
    assert.equal(fn(NaN), '—');
    assert.equal(fn(Infinity), '—');
  }
  // Intl separa "R$" do número com espaço inseparável (U+00A0), não espaço comum —
  // comparar com literal falharia de forma invisível no diff.
  assert.match(formatBRL(0), /^R\$\s0$/, 'zero explícito continua sendo zero');
});

test('formatBRLCompact encurta sem perder a ordem de grandeza', () => {
  assert.match(formatBRLCompact(2500000), /2,5 mi/);
  assert.match(formatBRLCompact(320000), /320 mil/);
  assert.equal(formatBRLCompact(null), '—');
});

test('formatDate converte ISO para o formato brasileiro', () => {
  assert.equal(formatDate('2026-08-18'), '18/08/2026');
  assert.equal(formatDate(''), '—');
  assert.equal(formatDate(null), '—');
  assert.equal(formatDate('18/08/2026'), '—', 'entrada fora do contrato não é adivinhada');
});

test('escapeHtml neutraliza os cinco caracteres perigosos', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
  assert.equal(escapeHtml('"aspas"'), '&quot;aspas&quot;');
  assert.equal(escapeHtml("'simples'"), '&#39;simples&#39;');
  assert.equal(escapeHtml(null), '');

  // O & é escapado primeiro; escapá-lo por último produziria &amp;lt;.
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
});

test('safeExternalUrl deixa passar apenas http e https', () => {
  assert.equal(safeExternalUrl('https://exemplo.com/x'), 'https://exemplo.com/x');
  assert.equal(safeExternalUrl('http://exemplo.com'), 'http://exemplo.com/');

  // Uma célula da planilha não pode virar execução de script no navegador (R4.6).
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('JavaScript:alert(1)'), null);
  assert.equal(safeExternalUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(safeExternalUrl('vbscript:msgbox(1)'), null);
  assert.equal(safeExternalUrl('file:///etc/passwd'), null);

  assert.equal(safeExternalUrl(''), null);
  assert.equal(safeExternalUrl('   '), null);
  assert.equal(safeExternalUrl(null), null);
  assert.equal(safeExternalUrl('não é url'), null);
});

test('hostnameOf rotula a fonte e recusa URL insegura', () => {
  assert.equal(hostnameOf('https://www.quintoandar.com.br/imovel/1'), 'quintoandar.com.br');
  assert.equal(hostnameOf('https://reservajardimbotanico.com/x'), 'reservajardimbotanico.com');
  assert.equal(hostnameOf('javascript:alert(1)'), '');
  assert.equal(hostnameOf(''), '');
});

test('formatPropertyType traduz o vocabulário do dataset', () => {
  assert.equal(formatPropertyType('apartamento'), 'Apartamento');
  assert.equal(formatPropertyType('casa_condominio'), 'Casa em condomínio');
  assert.equal(formatPropertyType('kitnet'), 'Kitnet');
  assert.equal(formatPropertyType(''), '—');

  // Tipo novo na planilha não pode virar tela em branco.
  assert.equal(formatPropertyType('loft_duplex'), 'Loft duplex');
});

test('formatSpatialPrecision nunca expõe o identificador cru de pipeline (issue #21)', () => {
  assert.equal(
    formatSpatialPrecision('locality_centroid_deterministic_jitter'),
    'Centro da localidade, com variação controlada',
  );
  assert.equal(formatSpatialPrecision('high_attributes'), 'Atributos confiáveis');
  assert.equal(formatSpatialPrecision(''), '');
  assert.equal(formatSpatialPrecision(null), '');

  // Vocabulário não documentado (o contrato é explícito: não é fechado) ainda assim
  // não pode voltar cru, com underscore, para a tela.
  assert.equal(formatSpatialPrecision('some_new_vocabulary_term'), 'Some new vocabulary term');
  assert.doesNotMatch(formatSpatialPrecision('some_new_vocabulary_term'), /_/);
});

test('formatBuildingOrientation traduz o vocabulário fechado (issue #31)', () => {
  assert.equal(formatBuildingOrientation('vertical'), 'Vertical');
  assert.equal(formatBuildingOrientation('horizontal'), 'Horizontal');
  assert.equal(formatBuildingOrientation(''), '');
  assert.equal(formatBuildingOrientation(null), '');
  assert.equal(formatBuildingOrientation('valor_desconhecido'), '', 'sem fallback humanizado: não é vocabulário aberto');
});
