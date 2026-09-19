// Estado da análise na URL — módulo puro (issue #127, Plano 01 §11).
//
// `#mapa?ra=RA_01&type=apartamento&beds=2` e `#diagnostico?ra=RA_20&ano=2024&tema=domicilios`
// tornam um recorte compartilhável: quem abre o link vê o mesmo filtro. Só a VIEW e um
// vocabulário fechado de chaves entram; chave desconhecida é descartada e valor é texto
// curto sem caractere de controle — o hash é entrada de terceiro, não estado confiável.
//
// Nada aqui toca `location` nem o DOM: o app lê o hash, passa para `parseHash`, e escreve
// `buildHash` de volta. Parâmetro com valor vazio não entra na URL, para `#mapa` sem
// filtro continuar sendo `#mapa` — o que o smoke test e os links antigos esperam.

export const URL_VIEWS = Object.freeze(['mapa', 'mercado', 'diagnostico', 'ranking', 'comparar', 'base']);

/** Chaves aceitas por view. Qualquer outra é ignorada na leitura e na escrita. */
export const URL_KEYS = Object.freeze({
  mapa: Object.freeze(['ra', 'type', 'beds', 'price_min', 'price_max', 'locality', 'q']),
  mercado: Object.freeze(['periodo', 'ano', 'mes', 'de', 'ate', 'serie', 'compare', 'faixa', 'regiao_modo']),
  diagnostico: Object.freeze(['ra', 'ano', 'tema']),
  ranking: Object.freeze(['ra']),
  comparar: Object.freeze([]),
  base: Object.freeze([]),
});

const MAX_VALUE_LENGTH = 80;

function cleanValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return text.slice(0, MAX_VALUE_LENGTH);
}

/**
 * Lê `#view?chave=valor&…`. View desconhecida vira `mapa`; chave fora do vocabulário da view
 * é descartada; valor vazio não entra. Hash sem `?` é só a view (`#mercado`).
 */
export function parseHash(hash) {
  // O hash inteiro só perde caractere de controle; o teto de comprimento vale por VALOR,
  // senão um filtro longo na quarta chave seria cortado pela soma das anteriores.
  const raw = String(hash ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/^#/, '');
  const [viewPart, queryPart = ''] = raw.split('?', 2);
  const view = URL_VIEWS.includes(viewPart) ? viewPart : 'mapa';
  const allowed = URL_KEYS[view] || [];
  const params = {};
  if (queryPart) {
    let entries;
    try {
      entries = [...new URLSearchParams(queryPart).entries()];
    } catch {
      entries = [];
    }
    for (const [key, value] of entries) {
      if (!allowed.includes(key)) continue;
      const clean = cleanValue(value);
      if (clean === '') continue;
      if (!(key in params)) params[key] = clean;
    }
  }
  return { view, params };
}

/**
 * Escreve `#view?chave=valor&…` só com as chaves da view e com valor não vazio, na ordem
 * declarada em `URL_KEYS` — a mesma análise gera sempre o mesmo link.
 */
export function buildHash(view, params = {}) {
  const alvo = URL_VIEWS.includes(view) ? view : 'mapa';
  const allowed = URL_KEYS[alvo] || [];
  const search = new URLSearchParams();
  for (const key of allowed) {
    const value = cleanValue(params ? params[key] : '');
    if (value !== '') search.set(key, value);
  }
  const query = search.toString();
  return query ? `#${alvo}?${query}` : `#${alvo}`;
}

/** Número inteiro de um parâmetro, ou `null` — para `beds`, `ano`, `mes`. */
export function intParam(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).trim());
  return Number.isInteger(n) ? n : null;
}
