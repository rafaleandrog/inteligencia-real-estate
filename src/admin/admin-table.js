// Busca, ordenação e paginação da tabela administrativa — funções puras, testáveis
// sem DOM (mesmo padrão de src/filters.js). admin-ui.js/admin-app.js só chamam.
//
// Issue #5, critério de aceite: "permitir busca, filtros, ordenação e
// paginação/virtualização para datasets maiores" — nenhum dos quatro existia na
// primeira rodada da PR-C.

/**
 * Filtra registros por um termo de busca livre, comparando contra o texto de todos
 * os campos visíveis (não só um subconjunto) — coerente com o outro critério da
 * issue, "exibir os dados completos". Case-insensitive, sem acento-sensibilidade
 * (comparação simples de substring, como o restante do projeto já faz em
 * src/filters.js).
 */
export function filterRecords(records, fields, term) {
  const needle = String(term || '').trim().toLowerCase();
  if (!needle) return records;

  return records.filter((record) => fields.some((field) => {
    const value = record[field.key];
    if (value === null || value === undefined) return false;
    return String(value).toLowerCase().includes(needle);
  }));
}

/**
 * Ordena por um campo, estável, com números comparados como número (não como texto —
 * "9" < "10" numericamente, mas "10" < "9" como string) e o resto como texto.
 * `direction` é `'asc'` ou `'desc'`. Não muta o array recebido.
 */
export function sortRecords(records, field, direction = 'asc') {
  if (!field) return records;
  const sign = direction === 'desc' ? -1 : 1;

  return [...records].sort((a, b) => {
    const va = a[field];
    const vb = b[field];
    const na = typeof va === 'number' ? va : Number(va);
    const nb = typeof vb === 'number' ? vb : Number(vb);
    const bothNumeric = va !== '' && vb !== '' && va !== null && vb !== null
      && Number.isFinite(na) && Number.isFinite(nb);

    if (bothNumeric) return sign * (na - nb);

    const sa = String(va === null || va === undefined ? '' : va);
    const sb = String(vb === null || vb === undefined ? '' : vb);
    return sign * sa.localeCompare(sb, 'pt-BR');
  });
}

/**
 * Uma página de `records`. `page` é 1-based. Página fora do intervalo (ex.: depois de
 * um filtro reduzir o total) volta para a última página válida em vez de devolver
 * lista vazia sem explicação.
 */
export function paginateRecords(records, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    rows: records.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    totalRecords: records.length,
  };
}
