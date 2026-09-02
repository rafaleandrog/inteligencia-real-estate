// Guarda do contrato de tokens da tela do Mercado (issue #83).
//
// O contrato importado do UrbiVerso tem uma regra que só se sustenta com máquina olhando:
// componente não escreve literal de cor, raio ou tipografia — tudo vem de token. Sem
// guarda, a regra dura até a primeira pressa: alguém precisa de "só um cinza aqui", o
// literal entra, ninguém percebe na revisão, e o tema escuro passa a ter um ponto morto
// que nenhum teste alcança. Foi literalmente o que aconteceu com as quatro cores cravadas
// em `src/ivv/history.js` (#55d99a, #8eb8ff, #d6a449, #9f7aea): módulo PURO — o lugar
// onde mora significado — decidindo aparência, e decidindo errado no tema escuro.
//
// O escopo é deliberadamente estreito e fechado, sem lista de exceção:
//
//   - no CSS, só as regras da superfície redesenhada (`.market*`, `.chart-*`, `.serie-*`).
//     Fora dela existem literais legítimos e antigos — `.view-tab` vive SOBRE `--brand` e
//     usa `#fff`, o Leaflet quer cor resolvida — e uma varredura global viraria uma lista
//     de perdão que envelhece calada.
//   - no JS, a guarda equivalente para `src/ivv/` entra junto com a limpeza das quatro
//     cores (mesma issue): proibição TOTAL, sem exceção e sem lista. `src/format.js`
//     mapeia categoria do mapa para cor porque o Leaflet exige valor resolvido em JS; os
//     módulos do IVV não pintam nada, então não têm por que conhecer cor nenhuma — e
//     proibição sem exceção é o eixo que não envelhece.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const RE_COR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/;
const RE_VAR_COM_FALLBACK = /var\(\s*--[\w-]+\s*,/;
const SELETORES_DA_TELA = /(^|[\s,>+~])[.](market|chart|serie)[-\w]*/;

/** CSS sem comentários. O corte é textual: o arquivo não tem `/*` dentro de string. */
export function semComentarios(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * As regras do arquivo, achatadas: `@media` some e as regras de dentro entram na lista
 * com o próprio seletor. Interessa o par (seletor, declarações), não a hierarquia.
 */
export function regrasCss(css) {
  const limpo = semComentarios(css);
  const regras = [];
  const pilha = [];
  let prelude = '';
  for (let i = 0; i < limpo.length; i += 1) {
    const c = limpo[i];
    if (c === '{') {
      pilha.push(prelude.trim());
      prelude = '';
    } else if (c === '}') {
      const seletor = pilha.pop() || '';
      if (!seletor.startsWith('@')) regras.push({ seletor, declaracoes: prelude });
      prelude = '';
    } else {
      prelude += c;
    }
  }
  return regras;
}

/** Nomes de token definidos em qualquer bloco do arquivo (`--x: valor`). */
export function tokensDefinidos(css) {
  return new Set([...semComentarios(css).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
}

/** Nomes de token consumidos (`var(--x)`). */
export function tokensConsumidos(css) {
  return [...semComentarios(css).matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
}

/** Achados do guard: uma frase por violação, com o seletor que a carrega. */
export function violacoesCss(css) {
  const achados = [];
  const definidos = tokensDefinidos(css);

  for (const token of new Set(tokensConsumidos(css))) {
    if (!definidos.has(token)) achados.push(`token consumido sem definição: ${token}`);
  }
  if (RE_VAR_COM_FALLBACK.test(semComentarios(css))) {
    achados.push('var() com fallback: o fallback esconde token inexistente do guard acima');
  }

  for (const { seletor, declaracoes } of regrasCss(css)) {
    if (!SELETORES_DA_TELA.test(seletor)) continue;
    if (RE_COR_LITERAL.test(declaracoes)) {
      achados.push(`literal de cor em "${seletor}"`);
    }
    for (const m of declaracoes.matchAll(/border(?:-[a-z]+)*-radius\s*:\s*([^;}]+)/g)) {
      const valor = m[1].trim();
      if (!valor.startsWith('var(--raio-') && valor !== '50%') {
        achados.push(`raio literal em "${seletor}": ${valor}`);
      }
    }
  }
  return achados;
}

test('todo var(--x) do CSS nomeia um token definido, e nenhum usa fallback', () => {
  const css = read('../assets/styles.css');
  const definidos = tokensDefinidos(css);
  const orfaos = [...new Set(tokensConsumidos(css))].filter((t) => !definidos.has(t));
  assert.deepEqual(orfaos, [], 'token consumido sem definição');
  assert.equal(RE_VAR_COM_FALLBACK.test(semComentarios(css)), false);
});

test('as regras da tela do Mercado não trazem literal de cor nem de raio', () => {
  assert.deepEqual(violacoesCss(read('../assets/styles.css')), []);
});

test('o guard sabe falhar', () => {
  const plantado = `
    :root { --raio-md: 8px; }
    .market-x { color: #abc; }
    .market-y { border-radius: 10px; }
    .chart-z { background: rgba(0, 0, 0, .5); }
    .market-w { color: var(--nao-existe); }
    .market-v { color: var(--raio-md, #fff); }
  `;
  const achados = violacoesCss(plantado);
  assert.ok(achados.some((a) => a.includes('literal de cor em ".market-x"')), achados.join(' · '));
  assert.ok(achados.some((a) => a.includes('raio literal em ".market-y"')), achados.join(' · '));
  assert.ok(achados.some((a) => a.includes('literal de cor em ".chart-z"')), achados.join(' · '));
  assert.ok(achados.some((a) => a.includes('--nao-existe')), achados.join(' · '));
  assert.ok(achados.some((a) => a.includes('fallback')), achados.join(' · '));

  // E sabe passar: o mesmo bloco sem os defeitos não produz achado nenhum.
  assert.deepEqual(violacoesCss(':root { --raio-md: 8px; }\n.market-x { border-radius: var(--raio-md); }'), []);
});
