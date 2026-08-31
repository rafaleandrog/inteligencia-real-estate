// Identificador usado em src/app.js sem estar importado.
//
// Esta guarda existe por um defeito real: `openPolygonDetail` passou a chamar
// `polygonEntityType`, que não estava na lista de imports. `npm test` ficou VERDE —
// os testes de unidade importam `src/format.js` direto e nunca carregam `src/app.js` —,
// `node --check` também, porque a sintaxe é válida. O erro só apareceu no navegador,
// como `ReferenceError`, e o sintoma foi um painel de detalhe VAZIO: nenhuma exceção
// visível para quem estava olhando a tela, só a informação sumindo.
//
// `src/app.js` não é importável por teste — ele toca `document` e `L` no topo —, então
// a checagem é estática: para cada nome exportado pelos módulos que ele importa, se o
// nome aparece como CHAMADA no corpo do arquivo, ele precisa estar na lista de imports.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** Nomes exportados por um módulo, por leitura do texto — sem importar nada. */
function exportedNames(source) {
  const names = new Set();
  for (const m of source.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of source.matchAll(/^export\s+(?:const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  return names;
}

/** Nomes que `app.js` importa de um caminho específico. */
function importedFrom(appSource, path) {
  const re = new RegExp(String.raw`import\s*\{([^}]*)\}\s*from\s*'${path.replace('.', '\\.')}'`, 's');
  const match = appSource.match(re);
  if (!match) return new Set();
  return new Set(match[1].split(',').map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean));
}

/** Corpo do arquivo sem comentários nem strings — só o que o motor vai executar. */
function executableSource(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

const MODULOS = ['./format.js', './filters.js', './normalize.js'];

test('todo export chamado em src/app.js está na lista de imports dele', () => {
  const app = read('../src/app.js');
  const corpo = executableSource(app);
  const faltando = [];

  for (const caminho of MODULOS) {
    const fonte = read(`../src/${caminho.slice(2)}`);
    const importados = importedFrom(app, caminho);
    for (const nome of exportedNames(fonte)) {
      if (importados.has(nome)) continue;
      // Chamada de função: o nome seguido de `(`, não precedido por `.` (que seria
      // método de outro objeto) nem por parte de um identificador maior.
      const chamada = new RegExp(String.raw`(^|[^\w$.])${nome}\s*\(`, 'm');
      if (chamada.test(corpo)) faltando.push(`${nome} (de ${caminho})`);
    }
  }

  assert.deepEqual(faltando, [],
    `usado em src/app.js sem import — vira ReferenceError só no navegador: ${faltando.join(', ')}`);
});

test('a guarda acima é capaz de falhar', () => {
  // R8.50: asserção que não pode ficar vermelha não é asserção. Aqui a prova é direta,
  // porque a checagem é uma função pura sobre texto.
  const appFalso = "import { formatBRL } from './format.js';\nfunction f() { return polygonStyle(x); }";
  const formatReal = read('../src/format.js');
  const importados = importedFrom(appFalso, './format.js');
  assert.equal(importados.has('formatBRL'), true);
  assert.equal(importados.has('polygonStyle'), false);
  assert.equal(exportedNames(formatReal).has('polygonStyle'), true);
  assert.match(executableSource(appFalso), /(^|[^\w$.])polygonStyle\s*\(/m);
});

test('nome dentro de comentário ou string não conta como uso', () => {
  // Sem isso a guarda acusaria falso positivo em toda função citada num comentário —
  // e uma guarda que grita sem motivo é desligada na primeira semana.
  const fonte = "// chama polygonStyle(x) um dia\nconst s = 'polygonStyle(y)';\n";
  const corpo = executableSource(fonte);
  assert.equal(/(^|[^\w$.])polygonStyle\s*\(/m.test(corpo), false);
});
