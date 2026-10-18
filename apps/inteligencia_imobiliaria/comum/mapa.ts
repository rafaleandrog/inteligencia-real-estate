/**
 * Classes e cores das camadas do mapa (spec 10.2). As cores vêm dos tokens do
 * tema, resolvidos em JS pelo frontend (canvas não lê `var()`; ui.md § Resolver
 * cor em JS; C-59): aqui ficam só os nomes dos tokens e a interpolação.
 */

export const TOKENS_MAPA = {
  rampaInicio: '--cor-info',
  rampaFim: '--cor-erro',
  semPreco: '--cor-texto-fraco',
  lancamento: '--cor-categoria-3',
  ancoraInfraestrutura: '--cor-categoria-1',
  ancoraComercio: '--cor-categoria-2',
  importado: '--cor-categoria-4',
  ra: '--cor-mapa-contorno',
  bordaPonto: '--cor-fundo',
  bordaExata: '--cor-texto-forte',
} as const;

export type ChaveCor = keyof typeof TOKENS_MAPA;
export type Paleta = Record<ChaveCor, string> & { rampa: string[] };

export const CLASSES_PRECO = 5;

function hex2(n: number): string {
  return Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
}

/** Interpola duas cores `[r, g, b]` em `n` passos, devolvendo `#rrggbb`. */
export function rampa(a: [number, number, number], b: [number, number, number], n = CLASSES_PRECO): string[] {
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    return '#' + [0, 1, 2].map((k) => hex2(a[k] + (b[k] - a[k]) * t)).join('');
  });
}

/** Cortes por quantis do recorte (quintis), para a classe de preço/m² de cada ponto. */
export function cortesQuintis(valores: number[]): number[] {
  const ns = valores.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (ns.length < CLASSES_PRECO) return [];
  return [0.2, 0.4, 0.6, 0.8].map((q) => ns[Math.min(ns.length - 1, Math.floor(q * ns.length))]);
}

export function classeDe(valor: number | null, cortes: number[]): number | null {
  if (valor === null || !Number.isFinite(valor) || !cortes.length) return null;
  let i = 0;
  while (i < cortes.length && valor >= cortes[i]) i++;
  return i;
}

/** Ponto de anúncio: exata cheia com contorno; aproximada transparente e tracejada (D-87, C-64). */
export function estiloAnuncio(preco_m2: number | null, cortes: number[], precisao: string, p: Paleta) {
  const classe = classeDe(preco_m2, cortes);
  const cor = classe === null ? p.semPreco : p.rampa[classe];
  const exata = precisao === 'exata_fonte' || precisao === 'manual';
  return {
    preenchimento: cor,
    opacidadePreenchimento: exata ? 0.9 : 0.35,
    contorno: exata ? p.bordaExata : cor,
    espessura: exata ? 1 : 1.5,
    tracejado: !exata,
    marcador: { forma: 'circulo' as const, tamanho: 7 },
  };
}
