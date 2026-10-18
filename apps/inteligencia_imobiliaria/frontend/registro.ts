/**
 * Registro de custom elements da app (spec 3.1, D-111). O "Tentar novamente"
 * do shell reavalia o bundle com cache-bust, e `customElements.define` de tag
 * já definida lança — por isso só define o que ainda não existe. Toda tag,
 * salvo a raiz `app-inteligencia-imobiliaria`, leva o prefixo `intel-imob-`.
 */
export const PREFIXO_TAG = 'intel-imob-';
export const TAG_RAIZ = 'app-inteligencia-imobiliaria';

export const tagsRegistradas: string[] = [];

export function definir(tag: string, classe: CustomElementConstructor): void {
  if (tag !== TAG_RAIZ && !tag.startsWith(PREFIXO_TAG)) {
    throw new Error(`Tag fora do prefixo da app: ${tag}`);
  }
  if (!tagsRegistradas.includes(tag)) tagsRegistradas.push(tag);
  if (typeof customElements === 'undefined') return;
  if (customElements.get(tag) === undefined) customElements.define(tag, classe);
}
