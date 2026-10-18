#!/usr/bin/env node
// Retrato datado da planilha (spec 11.3): baixa cada aba em CSV pela mesma consulta GViz
// que o site usa e grava `migracao/AAAA-MM-DD/<aba>.csv` com o sha256 de cada arquivo em
// `SHA256SUMS`. A migração nunca importa a planilha viva: importa este retrato, aba por aba,
// pela Operação › Importações (ou pela carga por agente, docs/importacao.md da app).
//
//   node scripts/exportar-planilha.mjs [AAAA-MM-DD] [ABA ...]
//
// O retrato fica FORA do git: o validate.yml do site reprova CSV versionado fora de
// migration/ e reference/ (R2.4), e o retrato é uma cópia de dado da planilha.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/** Abas da migração, na ordem da spec 11.3 (passos 1 a 7 e 10). */
export const ABAS_MIGRACAO = ['RA_PROFILES', 'FIPEZAP_LOCALITY_MAP', 'POLYGONS', 'ANCHORS', 'LISTING_SOURCES', 'LISTINGS', 'DEVELOPMENTS'];

/** O id da planilha é público por design (AGENTS.md); vem do mesmo `src/config.js` do site. */
export function idDaPlanilha(caminho = 'src/config.js') {
  const m = /spreadsheetId:\s*'([^']+)'/.exec(readFileSync(caminho, 'utf8'));
  if (!m) throw new Error('spreadsheetId não encontrado em src/config.js');
  return m[1];
}

export function urlAba(planilha, aba) {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(planilha)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(aba)}`;
}

async function principal() {
  const data = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  const abas = process.argv.length > 3 ? process.argv.slice(3) : ABAS_MIGRACAO;
  const destino = join('migracao', data);
  mkdirSync(destino, { recursive: true });
  const somas = [];
  for (const aba of abas) {
    const r = await fetch(urlAba(idDaPlanilha(), aba));
    if (!r.ok) throw new Error(`${aba}: HTTP ${r.status}`);
    const texto = await r.text();
    if (/^\s*</.test(texto)) throw new Error(`${aba}: a planilha respondeu HTML (não está compartilhada para leitura?)`);
    const arquivo = join(destino, `${aba}.csv`);
    writeFileSync(arquivo, texto);
    const sha = createHash('sha256').update(texto).digest('hex');
    somas.push(`${sha}  ${aba}.csv`);
    console.log(`${aba}: ${texto.split('\n').length - 1} linhas · sha256 ${sha.slice(0, 12)}…`);
  }
  writeFileSync(join(destino, 'SHA256SUMS'), somas.join('\n') + '\n');
  console.log(`retrato em ${destino}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  principal().catch((e) => {
    console.error(String(e?.message ?? e));
    process.exit(1);
  });
}
