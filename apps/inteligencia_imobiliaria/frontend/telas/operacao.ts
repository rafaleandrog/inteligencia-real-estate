import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { UrbiColunaTabela } from '@urbiverso/sdk';
import { definir } from '../registro';
import { estiloPrimitivo } from '../estilos';
import { ehAdmin, json, mensagemDeErro, uv } from '../api';
import '../componentes/importar';
import '../componentes/como-ler';
import './qualidade';

const ROTULO_STATUS: Record<string, string> = {
  previa: 'Prévia', anexada: 'Anexada', extraindo: 'Extraindo', aplicando: 'Aplicando', aplicada: 'Aplicada',
  falhou: 'Falhou', cancelada: 'Cancelada', desfeita: 'Desfeita',
};

function dataHora(v: unknown): string {
  if (!v) return '';
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const COLUNAS: UrbiColunaTabela[] = [
  { id: 'id', label: '#', largura: '70px', alinhamento: 'direita' },
  { id: 'criado_em', label: 'Quando', largura: '140px', valor: (l: any) => dataHora(l.criado_em) },
  { id: 'tabela_alvo', label: 'Tabela', largura: '160px' },
  { id: 'status', label: 'Status', largura: '110px', valor: (l: any) => ROTULO_STATUS[l.status] ?? l.status },
  { id: 'autor_nome', label: 'Autor', largura: '160px', valor: (l: any) => l.autor_nome ?? `#${l.autor_id}` },
  { id: 'total_linhas', label: 'Linhas', alinhamento: 'direita', largura: '80px' },
  { id: 'inseridas', label: 'Inseridas', alinhamento: 'direita', largura: '90px' },
  { id: 'atualizadas', label: 'Atualizadas', alinhamento: 'direita', largura: '100px' },
  { id: 'ignoradas', label: 'Ignoradas', alinhamento: 'direita', largura: '90px' },
  { id: 'rejeitadas', label: 'Rejeitadas', alinhamento: 'direita', largura: '100px' },
];

const COLUNAS_REJEICAO: UrbiColunaTabela[] = [
  { id: 'linha', label: 'Linha', largura: '80px', alinhamento: 'direita' },
  { id: 'coluna', label: 'Coluna', largura: '180px' },
  { id: 'codigo', label: 'Motivo', largura: '200px' },
  { id: 'mensagem', label: 'Detalhe' },
];

/** Operação › Importações: nova importação e histórico (spec 10.7). */
export class IntelImobImportacoes extends LitElement {
  @state() private lista: any[] = [];
  @state() private total = 0;
  @state() private pagina = 1;
  @state() private carregando = true;
  @state() private erro = '';
  @state() private nova = false;

  connectedCallback() {
    super.connectedCallback();
    this.carregar();
  }

  private async carregar() {
    this.carregando = true;
    try {
      const r = await uv().api(`/importacoes?pagina=${this.pagina}&por_pagina=50`);
      this.lista = r.dados;
      this.total = r.total;
    } catch (e) {
      this.erro = mensagemDeErro(e);
    } finally {
      this.carregando = false;
    }
  }

  render() {
    return html`
      <urbi-hospedeiro>
        <urbi-stack>
          ${this.erro ? html`<urbi-banner variante="erro">${this.erro}</urbi-banner>` : nothing}
          <urbi-linha justificar="entre">
            <urbi-prosa papel="secao">${this.total} ${this.total === 1 ? "importação" : "importações"}</urbi-prosa>
            <urbi-botao variante=${this.nova ? 'texto' : 'primario'} icone=${this.nova ? 'fa-solid fa-xmark' : 'fa-solid fa-file-import'}
              @click=${() => (this.nova = !this.nova)}>${this.nova ? 'Fechar' : 'Nova importação'}</urbi-botao>
          </urbi-linha>
          ${this.nova
            ? html`<urbi-card titulo="Nova importação" icone="fa-solid fa-file-csv">
                <intel-imob-importar @intel-imob:importacao-aplicada=${() => this.carregar()}></intel-imob-importar>
              </urbi-card>`
            : nothing}
          <urbi-tabela .colunas=${COLUNAS} .linhas=${this.lista} ?carregando=${this.carregando} clicavel
            mensagem-vazio="Nenhuma importação ainda."
            @urbi:tabela-click=${(e: CustomEvent) => uv().navegarSub(`/operacao/importacoes/${e.detail.linha.id}`)}></urbi-tabela>
          ${this.total > 50
            ? html`<urbi-linha>
                <urbi-botao variante="texto" ?desabilitado=${this.pagina <= 1} @click=${() => { this.pagina--; this.carregar(); }}>Anterior</urbi-botao>
                <urbi-prosa papel="dica" inline>Página ${this.pagina} de ${Math.ceil(this.total / 50)}</urbi-prosa>
                <urbi-botao variante="texto" ?desabilitado=${this.pagina * 50 >= this.total} @click=${() => { this.pagina++; this.carregar(); }}>Próxima</urbi-botao>
              </urbi-linha>`
            : nothing}
        </urbi-stack>
      </urbi-hospedeiro>
    `;
  }
}
definir('intel-imob-importacoes', IntelImobImportacoes);

/** Detalhe de uma importação, com o relatório e o "Desfazer" do admin (11.3.2). */
export class IntelImobImportacaoDetalhe extends LitElement {
  @property({ type: Number }) importacaoId = 0;
  @state() private imp: any = null;
  @state() private erro = '';
  @state() private ocupado = false;

  connectedCallback() {
    super.connectedCallback();
    this.carregar();
  }

  private async carregar() {
    try {
      this.imp = await uv().api(`/importacoes/${this.importacaoId}`);
    } catch (e) {
      this.erro = mensagemDeErro(e);
    }
  }

  private async desfazer() {
    const ok = await uv().confirmar({
      titulo: 'Desfazer importação',
      mensagem: 'Remove (lógico, vai para a lixeira) as linhas que esta importação criou e que ninguém editou depois. Linhas atualizadas por ela não voltam ao valor anterior.',
      rotuloConfirmar: 'Desfazer',
      perigo: true,
    });
    if (!ok) return;
    this.ocupado = true;
    try {
      this.imp = { ...(await uv().api(`/importacoes/${this.importacaoId}/desfazer`, json({}))), relatorio: this.imp.relatorio };
      uv().notificar('Importação desfeita.', 'sucesso');
    } catch (e) {
      this.erro = mensagemDeErro(e);
    } finally {
      this.ocupado = false;
    }
  }

  render() {
    const i = this.imp;
    if (this.erro) return html`<urbi-hospedeiro><urbi-banner variante="erro">${this.erro}</urbi-banner></urbi-hospedeiro>`;
    if (!i) return html`<urbi-loading></urbi-loading>`;
    const desfeito = i.relatorio_desfazer;
    return html`
      <urbi-hospedeiro>
        <urbi-stack>
          <urbi-linha justificar="entre">
            <urbi-botao variante="texto" icone="fa-solid fa-arrow-left" href=${uv().href('/operacao/importacoes')}>Importações</urbi-botao>
            ${ehAdmin() && i.status === 'aplicada'
              ? html`<urbi-botao variante="perigo" icone="fa-solid fa-rotate-left" ?carregando=${this.ocupado} @click=${this.desfazer}>Desfazer importação</urbi-botao>`
              : nothing}
          </urbi-linha>
          <urbi-prosa papel="titulo">Importação #${i.id} · ${i.tabela_alvo}</urbi-prosa>
          <urbi-prosa papel="dica">${ROTULO_STATUS[i.status] ?? i.status} · ${i.autor_nome ?? `#${i.autor_id}`} · ${dataHora(i.criado_em)}
            ${i.mapeamento?.arquivo ? ` · ${i.mapeamento.arquivo}` : ''}${i.arquivo_sha256 ? ` · sha256 ${String(i.arquivo_sha256).slice(0, 12)}…` : ''}</urbi-prosa>
          <urbi-grid min="140px">
            <urbi-kpi rotulo="Linhas" .valor=${i.total_linhas ?? 0}></urbi-kpi>
            <urbi-kpi rotulo="Inseridas" .valor=${i.inseridas ?? 0}></urbi-kpi>
            <urbi-kpi rotulo="Atualizadas" .valor=${i.atualizadas ?? 0}></urbi-kpi>
            <urbi-kpi rotulo="Ignoradas" .valor=${i.ignoradas ?? 0}></urbi-kpi>
            <urbi-kpi rotulo="Rejeitadas" .valor=${i.rejeitadas ?? 0} variante=${i.rejeitadas ? 'alerta' : ''}></urbi-kpi>
          </urbi-grid>
          ${i.status === 'aplicada' && (i.total_linhas ?? 0) !== (i.inseridas ?? 0) + (i.atualizadas ?? 0) + (i.ignoradas ?? 0) + (i.rejeitadas ?? 0)
            ? html`<urbi-banner variante="erro">A contagem não fecha: importadas + rejeitadas ≠ linhas do arquivo.</urbi-banner>`
            : nothing}
          ${i.mapeamento?.padroes && Object.keys(i.mapeamento.padroes).length
            ? html`<urbi-prosa papel="dica">Valores padrão declarados: ${Object.entries(i.mapeamento.padroes).map(([k, v]) => `${k} = ${v}`).join(', ')}.</urbi-prosa>`
            : nothing}
          ${desfeito
            ? html`<urbi-banner variante="info">Desfeita: ${desfeito.removidas.length} linhas removidas, ${desfeito.mantidas.length} mantidas por terem sido editadas depois.</urbi-banner>`
            : nothing}
          ${i.rejeicoes?.length
            ? html`<urbi-prosa papel="secao">Linhas rejeitadas</urbi-prosa>
                <urbi-tabela .colunas=${COLUNAS_REJEICAO} .linhas=${i.rejeicoes}></urbi-tabela>`
            : nothing}
        </urbi-stack>
      </urbi-hospedeiro>
    `;
  }
}
definir('intel-imob-importacao-detalhe', IntelImobImportacaoDetalhe);

/** Área Operação (spec 10.7): uma aba por sub-rota, no path para links abrirem a aba certa. */
export class IntelImobOperacao extends LitElement {
  static styles = [estiloPrimitivo];
  @property() sub = '/operacao';

  private get aba(): string {
    return this.sub.split('/')[2] || 'importacoes';
  }

  render() {
    const partes = this.sub.split('/');
    const detalheId = this.aba === 'importacoes' && partes[3] ? Number(partes[3]) : 0;
    return html`
      <urbi-shell-page titulo="Operação" dashboard>
        <intel-imob-como-ler slot="actions" tela="operacao"></intel-imob-como-ler>
        <urbi-abas .abas=${[
          { id: 'importacoes', label: 'Importações', icone: 'fa-solid fa-file-import' },
          { id: 'qualidade', label: 'Qualidade', icone: 'fa-solid fa-clipboard-check' },
        ]} ativa=${this.aba}
          @urbi:aba-selecionar=${(e: CustomEvent) => uv().navegarSub(`/operacao/${e.detail.id}`)}>
          <div slot="importacoes">
            ${this.aba === 'importacoes'
              ? detalheId
                ? html`<intel-imob-importacao-detalhe .importacaoId=${detalheId}></intel-imob-importacao-detalhe>`
                : html`<intel-imob-importacoes></intel-imob-importacoes>`
              : nothing}
          </div>
          <div slot="qualidade">
            ${this.aba === 'qualidade' ? html`<intel-imob-qualidade></intel-imob-qualidade>` : nothing}
          </div>
        </urbi-abas>
      </urbi-shell-page>
    `;
  }
}
definir('intel-imob-operacao', IntelImobOperacao);
