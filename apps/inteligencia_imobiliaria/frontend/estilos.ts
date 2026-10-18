import { css } from 'lit';

// Réplica local dos mixins do shell (ui.md § Como criar uma nova tela): app
// plugável não importa valor de @urbiverso/ui. Este é o único CSS das telas.
export const estiloPagina = css`:host{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}`;
export const estiloPrimitivo = css`:host{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}`;
