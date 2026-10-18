import { LitElement, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import type { UrbiColunaTabela } from '@urbiverso/sdk';
import { definir } from '../registro';
import { mensagemDeErro, uv } from '../api';
import { formatar } from '../componentes/cadastro';

const COLUNAS: UrbiColunaTabela[] = [
  { id: 'id', label: '#', largura: '70px', alinhamento: 'direita' },
  { id: 'iniciado_em', label: 'Início', largura: '140px', valor: (l: any) => formatar({ tipo: 'datahora' }, l.iniciado_em) },
  { id: 'tipo', label: 'Tipo', largura: '140px', filtro: { tipo: 'select', placeholder: 'Todos', opcoes: [{ valor: 'importacao', rotulo: 'Importação' }] } },
  { id: 'disparo', label: 'Disparo', largura: '100px' },
  { id: 'status', label: 'Status', largura: '110px', filtro: { tipo: 'select', placeholder: 'Todos', opcoes: ['executando', 'sucesso', 'parcial', 'falha', 'interrompida', 'pausada', 'adiada'].map((v) => ({ valor: v, rotulo: v })) } },
  { id: 'disparado_por_nome', label: 'Quem', largura: '150px', valor: (l: any) => l.disparado_por_nome ?? (l.disparado_por_id ? `#${l.disparado_por_id}` : 'rotina') },
  { id: 'novos', label: 'Novos', largura: '80px', alinhamento: 'direita' },
  { id: 'atualizados', label: 'Atualizados', largura: '100px', alinhamento: 'direita' },
  { id: 'erros', label: 'Erros', largura: '80px', alinhamento: 'direita' },
];

/** Operação › Execuções (spec 10.7): `coletas` com contadores; detalhe com os erros. */
export class IntelImobExecucoes extends LitElement {
  @state() private linhas: any[] = [];
  @state() private carregando = true;
  @state() private erro = '';
  @state() private aberta: any = null;
  private filtros: Record<string, string> = {};

  connectedCallback() {
    super.connectedCallback();
    this.carregar();
  }

  private async carregar() {
    this.carregando = true;
    try {
      const q = new URLSearchParams({ por_pagina: '100', ...Object.fromEntries(Object.entries(this.filtros).filter(([, v]) => v)) });
      this.linhas = (await uv().api(`/coletas?${q}`)).dados;
    } catch (e) {
      this.erro = mensagemDeErro(e);
    } finally {
      this.carregando = false;
    }
  }

  render() {
    return html`<urbi-hospedeiro><urbi-stack>
      ${this.erro ? html`<urbi-banner variante="erro">${this.erro}</urbi-banner>` : nothing}
      <urbi-prosa papel="dica">O log das rotinas e o "Rodar agora" ficam na aba Rotinas da Config da app (admin).</urbi-prosa>
      ${this.aberta
        ? html`<urbi-card titulo=${`Execução #${this.aberta.id} · ${this.aberta.tipo}`}>
            <urbi-prosa>${this.aberta.status} · ${formatar({ tipo: 'datahora' }, this.aberta.iniciado_em)} → ${formatar({ tipo: 'datahora' }, this.aberta.finalizado_em)}</urbi-prosa>
            ${this.aberta.detalhes_erros ? html`<urbi-prosa papel="mono" pre>${this.aberta.detalhes_erros}</urbi-prosa>` : html`<urbi-prosa papel="dica">Sem erros registrados.</urbi-prosa>`}
            <urbi-botao variante="texto" @click=${() => (this.aberta = null)}>Fechar</urbi-botao>
          </urbi-card>`
        : nothing}
      <urbi-tabela responsivo="multiline" .colunas=${COLUNAS} .linhas=${this.linhas} ?carregando=${this.carregando} clicavel mensagem-vazio="Nenhuma execução registrada."
        @urbi:tabela-filtro=${(e: CustomEvent) => { this.filtros = e.detail.filtros; this.carregar(); }}
        @urbi:tabela-click=${(e: CustomEvent) => (this.aberta = e.detail.linha)}></urbi-tabela>
    </urbi-stack></urbi-hospedeiro>`;
  }
}
definir('intel-imob-execucoes', IntelImobExecucoes);
