import { LitElement, html } from 'lit';
import { state } from 'lit/decorators.js';
import { definir, TAG_RAIZ } from './registro';
import { estiloPagina } from './estilos';
import { uv } from './api';
import './telas/em-construcao';
import './telas/inicio';
import './telas/operacao';
import { AREAS } from '../comum/telas';

/** Primeiro segmento da sub-rota: `/operacao/importacoes/3` → `/operacao`. */
export function areaDaSubRota(sub: string): string {
  const seg = sub.split('?')[0].split('/').filter(Boolean)[0];
  return seg ? `/${seg}` : '/';
}

/** Raiz da app: roteador de sub-rotas (overview.md § navegação SPA). */
export class AppInteligenciaImobiliaria extends LitElement {
  static styles = [estiloPagina];
  @state() private sub = '/';
  private cancelar?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.sub = uv().subRota();
    this.cancelar = uv().escutarRota((sub) => {
      this.sub = sub;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.cancelar?.();
  }

  render() {
    const area = areaDaSubRota(this.sub);
    if (area === '/') return html`<intel-imob-inicio></intel-imob-inicio>`;
    if (area === '/operacao') return html`<intel-imob-operacao .sub=${this.sub}></intel-imob-operacao>`;
    const def = AREAS.find((a) => a.rota === area);
    if (!def) return html`<intel-imob-nao-encontrada></intel-imob-nao-encontrada>`;
    return html`<intel-imob-em-construcao titulo=${def.titulo} quando=${def.quando}></intel-imob-em-construcao>`;
  }
}
definir(TAG_RAIZ, AppInteligenciaImobiliaria);
