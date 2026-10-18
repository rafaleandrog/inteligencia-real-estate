import { LitElement, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import type { UrbiColunaTabela } from '@urbiverso/sdk';
import { definir } from '../registro';
import { baixar, mensagemDeErro, patch, temPapel, uv } from '../api';

const COLUNAS: UrbiColunaTabela[] = [
  { id: 'severidade', label: 'Severidade', largura: '100px', filtro: { tipo: 'select', placeholder: 'Todas', opcoes: [{ valor: 'erro', rotulo: 'Erro' }, { valor: 'aviso', rotulo: 'Aviso' }, { valor: 'info', rotulo: 'Info' }] } },
  { id: 'codigo', label: 'Código', largura: '220px', filtro: { tipo: 'texto', placeholder: 'Código' } },
  { id: 'tabela', label: 'Tabela', largura: '150px', valor: (l: any) => `${l.tabela}${l.registro_id ? ` #${l.registro_id}` : ''}`, filtro: { tipo: 'texto', placeholder: 'Tabela' } },
  { id: 'mensagem', label: 'Mensagem' },
  { id: 'importacao_id', label: 'Importação', largura: '100px', valor: (l: any) => (l.importacao_id ? `#${l.importacao_id}` : '') },
  { id: 'resolvido_em', label: 'Situação', largura: '120px', valor: (l: any) => (l.resolvido_em ? `resolvido${l.resolvido_por_nome ? ` por ${l.resolvido_por_nome}` : ''}` : 'em aberto'),
    filtro: { tipo: 'toggle', rotulo: 'Incluir resolvidos' } },
];

/** Operação › Qualidade (spec 10.7): achados em aberto; clicar resolve. */
export class IntelImobQualidade extends LitElement {
  @state() private linhas: any[] = [];
  @state() private total = 0;
  @state() private carregando = true;
  @state() private erro = '';
  private filtros: Record<string, string> = {};

  connectedCallback() {
    super.connectedCallback();
    this.carregar();
  }

  private query(): string {
    const q = new URLSearchParams({ por_pagina: '100' });
    if (this.filtros.severidade) q.set('severidade', this.filtros.severidade);
    if (this.filtros.codigo) q.set('codigo', this.filtros.codigo.toUpperCase());
    if (this.filtros.tabela) q.set('tabela', this.filtros.tabela);
    q.set('resolvido', this.filtros.resolvido_em === 'true' ? 'todos' : 'false');
    return q.toString();
  }

  private async carregar() {
    this.carregando = true;
    try {
      const r = await uv().api(`/qualidade?${this.query()}`);
      this.linhas = r.dados;
      this.total = r.total;
    } catch (e) {
      this.erro = mensagemDeErro(e);
    } finally {
      this.carregando = false;
    }
  }

  private async resolver(linha: any) {
    if (linha.resolvido_em || !temPapel('operador')) return;
    const ok = await uv().confirmar({ titulo: 'Resolver achado', mensagem: `${linha.codigo}\n\n${linha.mensagem}\n\nMarcar como resolvido?`, rotuloConfirmar: 'Resolver' });
    if (!ok) return;
    try {
      await uv().api(`/qualidade/${linha.id}/resolver`, patch({}));
      uv().notificar('Achado resolvido.', 'sucesso');
      this.carregar();
    } catch (e) {
      this.erro = mensagemDeErro(e);
    }
  }

  render() {
    return html`
      <urbi-hospedeiro>
        <urbi-stack>
          ${this.erro ? html`<urbi-banner variante="erro">${this.erro}</urbi-banner>` : nothing}
          <urbi-linha justificar="entre">
            <urbi-prosa papel="secao">${this.total} achados</urbi-prosa>
            <urbi-botao variante="texto" icone="fa-solid fa-download" @click=${() => baixar(`/qualidade?formato=csv&${this.query()}`, 'qualidade.csv').catch((e) => (this.erro = mensagemDeErro(e)))}>Baixar CSV</urbi-botao>
          </urbi-linha>
          <urbi-tabela .colunas=${COLUNAS} .linhas=${this.linhas} ?carregando=${this.carregando} ?clicavel=${temPapel('operador')}
            mensagem-vazio="Nenhum achado em aberto."
            @urbi:tabela-filtro=${(e: CustomEvent) => { this.filtros = e.detail.filtros; this.carregar(); }}
            @urbi:tabela-click=${(e: CustomEvent) => this.resolver(e.detail.linha)}></urbi-tabela>
        </urbi-stack>
      </urbi-hospedeiro>
    `;
  }
}
definir('intel-imob-qualidade', IntelImobQualidade);
