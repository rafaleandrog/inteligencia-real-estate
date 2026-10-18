import { LitElement, html } from 'lit';
import { property } from 'lit/decorators.js';
import { definir } from '../registro';
import { uv } from '../api';
import { COMO_LER } from '../../comum/ajuda';

/** Botão "Como ler" (spec 10.1, D-77), no slot de ações da página. */
export class IntelImobComoLer extends LitElement {
  @property() tela = '';

  render() {
    const ajuda = COMO_LER[this.tela];
    if (!ajuda) return html``;
    return html`<urbi-botao variante="texto" pequeno icone="fa-solid fa-circle-question"
      @click=${() => uv().alertar({ titulo: ajuda.titulo, mensagem: ajuda.texto })}>Como ler</urbi-botao>`;
  }
}
definir('intel-imob-como-ler', IntelImobComoLer);
