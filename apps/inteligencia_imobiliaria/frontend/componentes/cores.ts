import { CLASSES_PRECO, rampa, TOKENS_MAPA, type ChaveCor, type Paleta } from '../../comum/mapa';

let contexto: CanvasRenderingContext2D | null = null;

/** Normaliza qualquer cor CSS para `[r, g, b]` pelo próprio canvas. */
function rgb(cor: string): [number, number, number] {
  contexto ??= document.createElement('canvas').getContext('2d');
  if (!contexto) return [128, 128, 128];
  contexto.fillStyle = 'gray';
  contexto.fillStyle = cor;
  const v = String(contexto.fillStyle);
  if (v.startsWith('#')) return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)) as [number, number, number];
  const n = v.match(/[\d.]+/g)?.map(Number) ?? [128, 128, 128];
  return [n[0], n[1], n[2]];
}

/** Resolve os tokens do mapa uma vez por ciclo (ui.md § Resolver cor em JS). */
export function amostrarPaleta(): Paleta {
  const estilo = getComputedStyle(document.documentElement);
  const cores = Object.fromEntries(
    (Object.keys(TOKENS_MAPA) as ChaveCor[]).map((k) => {
      const valor = estilo.getPropertyValue(TOKENS_MAPA[k]).trim();
      const [r, g, b] = rgb(valor || 'gray');
      return [k, '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')];
    }),
  ) as Record<ChaveCor, string>;
  return { ...cores, rampa: rampa(rgb(cores.rampaInicio), rgb(cores.rampaFim), CLASSES_PRECO) };
}

/** Reamostra quando o usuário troca de tema; devolve a função que desconecta. */
export function aoTrocarTema(cb: () => void): () => void {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => obs.disconnect();
}
