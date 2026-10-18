import { LitElement, html } from 'lit';
import { state } from 'lit/decorators.js';
import { definir } from '../registro';
import { estiloPrimitivo } from '../estilos';
import { mensagemDeErro, uv } from '../api';

interface AtalhoInicio {
  titulo: string;
  rota: string;
  icone: string;
  descricao: string;
  disponivel: boolean;
}

interface RespostaInicio {
  versao: string;
  atalhos: AtalhoInicio[];
}

/** Início em `/` (spec 10.9, D-110): atalhos para o que já existe. */
export class IntelImobInicio extends LitElement {
  static styles = [estiloPrimitivo];
  @state() private dados: RespostaInicio | null = null;
  @state() private erro = '';

  async connectedCallback() {
    super.connectedCallback();
    try {
      this.dados = await uv().api('/inicio');
    } catch (e) {
      this.erro = mensagemDeErro(e);
    }
  }

  render() {
    if (this.erro) {
      return html`<urbi-shell-page titulo="Início"><urbi-banner variante="erro">${this.erro}</urbi-banner></urbi-shell-page>`;
    }
    if (!this.dados) return html`<urbi-shell-page titulo="Início"><urbi-loading></urbi-loading></urbi-shell-page>`;
    const prontos = this.dados.atalhos.filter((a) => a.disponivel);
    return html`
      <urbi-shell-page titulo="Inteligência Imobiliária" subtitulo=${`Versão ${this.dados.versao}`}>
        <urbi-stack>
          <urbi-prosa papel="fraco">Oferta, mercado e território do Distrito Federal, com dado rastreável.</urbi-prosa>
          ${prontos.length === 0
            ? html`<urbi-estado-vazio icone="fa-solid fa-person-digging" mensagem="A app está em construção"
                submensagem="As telas aparecem aqui à medida que entram."></urbi-estado-vazio>`
            : prontos.map(
                (a) => html`<urbi-card titulo=${a.titulo} icone=${a.icone}>
                  <urbi-prosa>${a.descricao}</urbi-prosa>
                  <urbi-botao variante="secundario" href=${uv().href(a.rota)}>Abrir</urbi-botao>
                </urbi-card>`,
              )}
        </urbi-stack>
      </urbi-shell-page>
    `;
  }
}
definir('intel-imob-inicio', IntelImobInicio);
