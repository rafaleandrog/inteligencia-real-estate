/**
 * Classes e cores das camadas do mapa (spec 10.2). Cor de feição é dado do
 * consumidor do `urbi-mapa`, não chrome (registro de exceções do SDK e
 * `docs/ui-excecoes.md`): a mesma tabela pinta o ponto e a amostra da legenda.
 */

/** Rampa sequencial de 5 classes (claro → escuro), legível sobre satélite e ruas. */
export const RAMPA_PRECO = ['#fde68a', '#fbbf24', '#f97316', '#dc2626', '#7f1d1d'];
export const COR_SEM_PRECO = '#9ca3af';
export const COR_LANCAMENTO = '#7c3aed';
export const COR_ANCORA: Record<string, string> = { infraestrutura: '#0284c7', comercio_servico: '#059669' };
export const COR_CONTORNO_RA = '#e5e7eb';
export const COR_CONTORNO_IMPORTADO = '#22d3ee';

/** Cortes por quantis do recorte (quintis), para a classe de preço/m² de cada ponto. */
export function cortesQuintis(valores: number[]): number[] {
  const ns = valores.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (ns.length < 5) return [];
  return [0.2, 0.4, 0.6, 0.8].map((q) => ns[Math.min(ns.length - 1, Math.floor(q * ns.length))]);
}

export function classeDe(valor: number | null, cortes: number[]): number | null {
  if (valor === null || !Number.isFinite(valor) || !cortes.length) return null;
  let i = 0;
  while (i < cortes.length && valor >= cortes[i]) i++;
  return i;
}

/** Ponto de anúncio: exata cheia com contorno; aproximada transparente e tracejada (D-87, C-64). */
export function estiloAnuncio(preco_m2: number | null, cortes: number[], precisao: string) {
  const classe = classeDe(preco_m2, cortes);
  const cor = classe === null ? COR_SEM_PRECO : RAMPA_PRECO[classe];
  const exata = precisao === 'exata_fonte' || precisao === 'manual';
  return {
    preenchimento: cor,
    opacidadePreenchimento: exata ? 0.9 : 0.35,
    contorno: exata ? '#111827' : cor,
    espessura: exata ? 1 : 1.5,
    tracejado: !exata,
    marcador: { forma: 'circulo' as const, tamanho: 7 },
  };
}
