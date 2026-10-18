import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { rotas } from '../backend/rotas';
import { RAIZ_APP, rotasRegistradas, servidor } from './infra';
import { rota } from '../backend/rotas/comum';

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : p.endsWith('.ts') ? [p] : [];
  });
}

test('toda rota registrada passa por rota() (spec 6, T2)', () => {
  const lista = rotasRegistradas(rotas);
  assert.ok(lista.length > 0);
  const soltas = lista.filter((r) => !r.envolvida).map((r) => `${r.metodo} ${r.caminho}`);
  assert.deepEqual(soltas, []);
});

test('exceção num handler resolve a request em vez de pendurá-la', async () => {
  const r = express.Router();
  r.get('/boom', rota(async () => {
    throw new Error('boom');
  }));
  const s = await servidor(r);
  try {
    const resp = await s.chamar('GET', '/boom');
    assert.equal(resp.status, 500);
  } finally {
    await s.fechar();
  }
});

test('toda tag registrada no frontend tem o prefixo da app (D-111)', () => {
  const tags = arquivos(join(RAIZ_APP, 'frontend')).flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(/definir\(\s*'([^']+)'/g)].map((m) => m[1]),
  );
  assert.ok(tags.length > 0);
  for (const t of tags) assert.ok(t.startsWith('intel-imob-'), t);
});

test('frontend não importa valor de @urbiverso/ui nem do backend', () => {
  for (const f of arquivos(join(RAIZ_APP, 'frontend'))) {
    const s = readFileSync(f, 'utf8');
    assert.ok(!/import\s+[^t][^;]*from\s+'@urbiverso\/(ui|sdk)'/.test(s), `${f} importa valor do SDK/UI`);
    assert.ok(!/from\s+'\.\.\/(\.\.\/)?backend/.test(s), `${f} importa do backend`);
  }
});

test('manifesto: identidade, pisos copiados do SDK instalado e nav dentro do teto', () => {
  const m = JSON.parse(readFileSync(join(RAIZ_APP, 'manifesto.json'), 'utf8'));
  const sdk = JSON.parse(readFileSync(join(RAIZ_APP, 'node_modules/@urbiverso/sdk/package.json'), 'utf8'));
  assert.equal(m.identidade, 'rafaleandrog/inteligencia-real-estate::inteligencia_imobiliaria');
  assert.equal(m.sdk_min, Number(sdk.version.split('.')[0]));
  assert.equal(m.shell_min, sdk.urbiverso.shell);
  assert.ok(m.nav.length <= 20);
});

test('Início responde a versão do manifesto', async () => {
  const s = await servidor(rotas);
  try {
    const r = await s.chamar('GET', '/inicio');
    assert.equal(r.status, 200);
    assert.match(r.corpo.versao, /^\d+\.\d+\.\d+$/);
    assert.ok(Array.isArray(r.corpo.atalhos));
  } finally {
    await s.fechar();
  }
});

test('conteúdo de terceiro: sem unsafeHTML e link externo com noopener (spec 10.1)', () => {
  for (const f of arquivos(join(RAIZ_APP, 'frontend'))) {
    const s = readFileSync(f, 'utf8');
    assert.ok(!s.includes('unsafeHTML'), `${f} usa unsafeHTML`);
    for (const m of s.matchAll(/<a [^>]*target="_blank"[^>]*>/g)) assert.ok(m[0].includes('rel="noopener noreferrer"'), `${f}: ${m[0]}`);
  }
});
