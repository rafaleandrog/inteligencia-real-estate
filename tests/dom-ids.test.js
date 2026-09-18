// Contrato entre `src/app.js` e `index.html` (issue #104, achado do Codex nas #108/#110).
//
// `bindEvents()` roda antes de `load()` e `el(id)` devolve `null` para id inexistente: um
// `dom.x.addEventListener` com `x` ausente no HTML derruba a página inteira antes do
// primeiro dado chegar, sem nenhum teste unitário reclamar — foi exatamente o que uma
// resolução de conflito mal feita produziu. Este teste lê os dois arquivos como texto e
// exige que todo id pedido em `dom = { ... el('id') ... }` exista no `index.html`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('todo id do mapa `dom` de src/app.js existe no index.html', () => {
  const app = read('../src/app.js');
  const html = read('../index.html');
  const start = app.indexOf('const dom = {');
  const end = app.indexOf('\n};', start);
  assert.ok(start > 0 && end > start, 'mapa `dom` não encontrado em src/app.js');
  const ids = [...app.slice(start, end).matchAll(/el\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 50, `poucos ids lidos do mapa dom (${ids.length})`);
  const faltando = ids.filter((id) => !new RegExp(`\\bid="${id}"`).test(html));
  assert.deepEqual(faltando, [], 'ids pedidos por src/app.js e ausentes do index.html');
});

test('todo seletor fixo lido por src/app.js via querySelector existe no index.html', () => {
  const app = read('../src/app.js');
  const html = read('../index.html');
  const attrs = [...app.matchAll(/querySelectorAll?\('\[([a-z-]+)\]'\)/g)].map((m) => m[1]);
  for (const attr of new Set(attrs)) {
    assert.ok(new RegExp(`\\s${attr}(\\s|>|=)`).test(html), `atributo [${attr}] pedido por src/app.js e ausente do index.html`);
  }
});
