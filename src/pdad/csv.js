// Exportação CSV das telas de Diagnóstico Territorial (issue #102).
//
// Funções puras de formatação (`rowsToCsv`) separadas do único ponto que toca o DOM
// (`downloadCsv`), mesma separação que o resto do módulo `pdad/` já segue.

/** Uma célula, escapada para CSV (RFC 4180): aspas duplicadas, campo entre aspas se precisar. */
function csvCell(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  if (/[",\n;]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

/** Monta o texto CSV (cabeçalho + linhas) a partir de arrays de células. */
export function rowsToCsv(header, linhas) {
  const todas = [header, ...linhas];
  return todas.map((linha) => linha.map(csvCell).join(',')).join('\r\n');
}

/** Dispara o download de um CSV no navegador — único ponto deste módulo que toca o DOM. */
export function downloadCsv(nomeArquivo, csvTexto) {
  const blob = new Blob([`﻿${csvTexto}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
