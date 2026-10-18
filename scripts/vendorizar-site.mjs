#!/usr/bin/env node
/**
 * Copia, sem editar, os módulos puros do site (`src/`) que a app usa para
 * calcular Mercado e Diagnóstico (spec 15.2: "portados de src/ivv com os
 * testes"), para `apps/inteligencia_imobiliaria/comum/site/`. Copiar em vez de
 * reescrever faz a paridade sair por construção; o teste de paridade confere
 * os números. Rode de novo quando o site mudar a regra de cálculo.
 *
 *   node scripts/vendorizar-site.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const RAIZ = resolve(dirname(new URL(import.meta.url).pathname), '..');
const ORIGEM = join(RAIZ, 'src');
const DESTINO = join(RAIZ, 'apps/inteligencia_imobiliaria/comum/site');

const ENTRADAS = [
  'ivv/aggregate.js', 'ivv/derived.js', 'ivv/metrics.js', 'ivv/period.js', 'ivv/region.js', 'ivv/normalize-ivv.js', 'ivv/scope.js',
  'fipezap/normalize-fipezap.js', 'fipezap/locality.js', 'fipezap/history.js',
  'pdad/aggregate.js', 'pdad/indicators.js', 'pdad/normalize-pdad.js', 'pdad/insights.js',
];

const vistos = new Set();
function visitar(rel) {
  if (vistos.has(rel)) return;
  vistos.add(rel);
  const texto = readFileSync(join(ORIGEM, rel), 'utf8');
  for (const m of texto.matchAll(/^\s*(?:import|export)[^'"]*?from\s+['"](\.[^'"]+)['"]/gm)) {
    visitar(relative(ORIGEM, resolve(dirname(join(ORIGEM, rel)), m[1])));
  }
}
ENTRADAS.forEach(visitar);

const commit = execSync('git log -1 --format=%h -- src', { cwd: RAIZ }).toString().trim();
rmSync(DESTINO, { recursive: true, force: true });
for (const rel of [...vistos].sort()) {
  const alvo = join(DESTINO, rel);
  mkdirSync(dirname(alvo), { recursive: true });
  writeFileSync(alvo, `// Copiado sem edição de src/${rel} (site, commit ${commit}) por scripts/vendorizar-site.mjs.\n${readFileSync(join(ORIGEM, rel), 'utf8')}`);
}
writeFileSync(join(DESTINO, 'ORIGEM.json'), JSON.stringify({ commit, arquivos: [...vistos].sort() }, null, 2) + '\n');
console.log(`${vistos.size} módulos copiados de src/ (commit ${commit}).`);
