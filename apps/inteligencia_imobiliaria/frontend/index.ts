import { LitElement, html } from 'lit';
import { state } from 'lit/decorators.js';
import { definir, TAG_RAIZ } from './registro';
import { estiloPagina } from './estilos';
import { uv } from './api';
import './telas/em-construcao';
import './telas/inicio';
import './telas/operacao';
import './telas/cadastro';
import './telas/mapa';
import './telas/estudos';
import './telas/mercado';
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
    this.registrarUso(this.sub);
    this.cancelar = uv().escutarRota((sub) => {
      if (areaDaSubRota(sub) !== areaDaSubRota(this.sub) || sub.split('/').length !== this.sub.split('/').length) this.registrarUso(sub);
      this.sub = sub;
    });
  }

  /** Telemetria mínima de uso (spec 5.23, D-72): uma chamada por troca de tela; falha é ignorada. */
  private registrarUso(sub: string) {
    const rota = sub.replace(/\/\d+(?=\/|$)/g, '/:id');
    uv().api('/pessoal/uso', { method: 'POST', body: JSON.stringify({ sub_rota: rota, acao: 'abrir' }) }).catch(() => undefined);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.cancelar?.();
  }

  render() {
    const area = areaDaSubRota(this.sub);
    if (area === '/') return html`<intel-imob-inicio></intel-imob-inicio>`;
    if (area === '/operacao') return html`<intel-imob-operacao .sub=${this.sub}></intel-imob-operacao>`;
    if (area === '/mapa') return html`<intel-imob-mapa></intel-imob-mapa>`;
    if (area === '/cadastro') return html`<intel-imob-cadastro .sub=${this.sub}></intel-imob-cadastro>`;
    if (area === '/estudos') return html`<intel-imob-estudos .sub=${this.sub}></intel-imob-estudos>`;
    if (area === '/mercado') return html`<intel-imob-mercado .sub=${this.sub}></intel-imob-mercado>`;
    const def = AREAS.find((a) => a.rota === area);
    if (!def) return html`<intel-imob-nao-encontrada></intel-imob-nao-encontrada>`;
    return html`<intel-imob-em-construcao titulo=${def.titulo} quando=${def.quando}></intel-imob-em-construcao>`;
  }
}
definir(TAG_RAIZ, AppInteligenciaImobiliaria);
