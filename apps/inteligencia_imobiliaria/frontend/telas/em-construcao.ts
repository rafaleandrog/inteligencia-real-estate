import { LitElement, html } from 'lit';
import { property } from 'lit/decorators.js';
import { definir } from '../registro';
import { estiloPrimitivo } from '../estilos';
import { uv } from '../api';

/** Tela das áreas do `nav` que ainda não entraram (spec 15.1, acréscimos da v0.2). */
export class IntelImobEmConstrucao extends LitElement {
  static styles = [estiloPrimitivo];
  @property() titulo = '';
  @property() quando = '';

  render() {
    return html`
      <urbi-shell-page titulo=${this.titulo}>
        <urbi-estado-vazio
          icone="fa-solid fa-person-digging"
          mensagem="Em construção"
          submensagem=${this.quando || 'Esta área ainda não entrou na app.'}
        ></urbi-estado-vazio>
      </urbi-shell-page>
    `;
  }
}
definir('intel-imob-em-construcao', IntelImobEmConstrucao);

/** Rota desconhecida: estado vazio com link para o Início, sem redirecionar em silêncio (D-110). */
export class IntelImobNaoEncontrada extends LitElement {
  static styles = [estiloPrimitivo];

  render() {
    return html`
      <urbi-shell-page titulo="Página não encontrada">
        <urbi-estado-vazio icone="fa-solid fa-compass" mensagem="Página não encontrada"
          submensagem="O endereço não corresponde a nenhuma tela da app."></urbi-estado-vazio>
        <urbi-botao variante="texto" href=${uv().href('/')}>Ir para o Início</urbi-botao>
      </urbi-shell-page>
    `;
  }
}
definir('intel-imob-nao-encontrada', IntelImobNaoEncontrada);
