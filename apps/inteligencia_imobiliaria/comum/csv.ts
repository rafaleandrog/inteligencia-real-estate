/**
 * Leitura e escrita de CSV (spec 11.1, 11.2). Leitura: separador detectado
 * (`;` ou `,`), aspas RFC 4180, UTF-8 com ou sem BOM, e o `'` de proteção
 * contra fórmula retirado. Escrita: BOM, `;`, e `'` na frente da célula de
 * texto que começa com `=`, `+`, `-`, `@`, tabulação ou retorno (T3).
 */

export interface CsvLido {
  separador: ';' | ',';
  cabecalho: string[];
  linhas: string[][];
}

export function detectarSeparador(primeiraLinha: string): ';' | ',' {
  let pv = 0;
  let vg = 0;
  let aspas = false;
  for (const c of primeiraLinha) {
    if (c === '"') aspas = !aspas;
    else if (!aspas && c === ';') pv++;
    else if (!aspas && c === ',') vg++;
  }
  return pv >= vg && pv > 0 ? ';' : ',';
}

export function lerCsv(conteudo: string): CsvLido {
  const s = conteudo.charCodeAt(0) === 0xfeff ? conteudo.slice(1) : conteudo;
  const fimPrimeira = s.search(/\r?\n/);
  const separador = detectarSeparador(fimPrimeira === -1 ? s : s.slice(0, fimPrimeira));
  const registros: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (aspas) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += c;
      continue;
    }
    if (c === '"' && campo === '') aspas = true;
    else if (c === separador) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      linha.push(campo);
      registros.push(linha);
      linha = [];
      campo = '';
    } else campo += c;
  }
  if (campo !== '' || linha.length > 0) {
    linha.push(campo);
    registros.push(linha);
  }
  const naoVazios = registros.filter((r) => r.some((c) => c.trim() !== ''));
  const [cabecalho = [], ...linhas] = naoVazios;
  return { separador, cabecalho: cabecalho.map((c) => c.trim()), linhas: linhas.map((l) => l.map(retirarProtecao)) };
}

/** Retira o `'` que a exportação põe na frente de célula que pareceria fórmula. */
export function retirarProtecao(celula: string): string {
  return /^'[=+\-@\t\r]/.test(celula) ? celula.slice(1) : celula;
}

function protegerCelula(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : '';
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';
  if (valor instanceof Date) return valor.toISOString();
  let t = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
  if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t = `'${t}`;
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** CSV com BOM e `;`, pronto para Excel pt-BR. */
export function gerarCsv(colunas: string[], linhas: Record<string, unknown>[]): string {
  const corpo = [colunas.join(';'), ...linhas.map((l) => colunas.map((c) => protegerCelula(l[c])).join(';'))];
  return '﻿' + corpo.join('\r\n') + '\r\n';
}
