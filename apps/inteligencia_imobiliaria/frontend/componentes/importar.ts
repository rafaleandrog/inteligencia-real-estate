import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { UrbiColunaTabela } from '@urbiverso/sdk';
import { definir } from '../registro';
import { baixar, enviarArquivo, json, mensagemDeErro, temPapel, uv } from '../api';

interface TabelaImportavel {
  tabela: string;
  titulo: string;
  modos: string[];
}

interface Rejeicao {
  linha: number;
  coluna: string;
  codigo: string;
  mensagem: string;
}

interface Previa {
  id: number;
  status: string;
  tabela_alvo: string;
  total_linhas: number;
  rejeitadas: number;
  inseridas?: number;
  atualizadas?: number;
  ignoradas?: number;
  previstas: { inserir: number; atualizar: number; ignorar: number } | null;
  colunas_ignoradas: { cabecalho: string; motivo: string }[];
  bloqueio: string | null;
  rejeicoes: Rejeicao[];
}

const ROTULO_MODO: Record<string, string> = {
  ignorar: 'Ignorar os que já existem',
  atualizar: 'Atualizar os que já existem (só as colunas do CSV)',
  falhar: 'Recusar o arquivo se algum já existir',
  substituir_tudo: 'Substituir tudo (série publicada)',
};

const COLUNAS_REJEICAO: UrbiColunaTabela[] = [
  { id: 'linha', label: 'Linha', largura: '80px', alinhamento: 'direita' },
  { id: 'coluna', label: 'Coluna', largura: '180px' },
  { id: 'codigo', label: 'Motivo', largura: '200px' },
  { id: 'mensagem', label: 'Detalhe' },
];

/**
 * Importação CSV em dois passos (spec 11.1): arquivo → prévia (nada gravado) →
 * aplicar. Com `tabela` fixa, é o "Importar CSV" da tela de um cadastro (D-144);
 * sem ela, a Operação › Importações escolhe a tabela.
 */
export class IntelImobImportar extends LitElement {
  @property() tabela = '';
  @state() private tabelas: TabelaImportavel[] = [];
  @state() private escolhida = '';
  @state() private modo = 'ignorar';
  @state() private arquivo: File | null = null;
  @state() private previa: Previa | null = null;
  @state() private ocupado = false;
  @state() private erro = '';
  @state() private aplicada = false;

  async connectedCallback() {
    super.connectedCallback();
    try {
      this.tabelas = (await uv().api('/importacoes/tabelas')).dados;
      this.escolhida = this.tabela || this.tabelas[0]?.tabela || '';
    } catch (e) {
      this.erro = mensagemDeErro(e);
    }
  }

  private get def(): TabelaImportavel | undefined {
    return this.tabelas.find((t) => t.tabela === this.escolhida);
  }

  private async gerarPrevia() {
    if (!this.arquivo) return;
    this.ocupado = true;
    this.erro = '';
    try {
      const upload_id = await enviarArquivo('importacoes', 'arquivo', this.arquivo);
      this.previa = await uv().api('/importacoes/previa', json({ tabela_alvo: this.escolhida, upload_id, modo_duplicata: this.modo }));
      this.aplicada = false;
    } catch (e) {
      this.erro = mensagemDeErro(e);
      const detalhes = (e as { detalhes?: string[] }).detalhes;
      if (detalhes?.length) this.erro += ` ${detalhes.join(' ')}`;
    } finally {
      this.ocupado = false;
    }
  }

  /** Coluna obrigatória vazia em todas as rejeições: oferece declarar um valor padrão. */
  private get colunaSemValor(): string | null {
    const r = this.previa?.rejeicoes ?? [];
    if (!r.length) return null;
    const cols = new Set(r.filter((x) => x.codigo === 'OBRIGATORIO').map((x) => x.coluna));
    return cols.size === 1 ? [...cols][0] : null;
  }

  private async declararPadrao(coluna: string) {
    const valor = await uv().prompt({ titulo: 'Valor padrão', mensagem: `Valor para "${coluna}" nas linhas em que a célula está vazia. Ele fica registrado na importação.` });
    if (!valor || !this.previa) return;
    await this.refazer({ padroes: { [coluna]: valor } });
  }

  private async refazer(corpo: Record<string, unknown>) {
    if (!this.previa) return;
    this.ocupado = true;
    try {
      this.previa = await uv().api(`/importacoes/${this.previa.id}/previa`, json(corpo));
    } catch (e) {
      this.erro = mensagemDeErro(e);
    } finally {
      this.ocupado = false;
    }
  }

  private async aplicar() {
    if (!this.previa) return;
    const ok = await uv().confirmar({ titulo: 'Aplicar importação', mensagem: 'Gravar as linhas válidas na tabela? A importação pode ser desfeita depois pelo admin da app.' });
    if (!ok) return;
    this.ocupado = true;
    try {
      this.previa = await uv().api(`/importacoes/${this.previa.id}/aplicar`, json({}));
      this.aplicada = true;
      uv().notificar('Importação aplicada.', 'sucesso');
      this.dispatchEvent(new CustomEvent('intel-imob:importacao-aplicada', { detail: { id: this.previa?.id }, bubbles: true, composed: true }));
    } catch (e) {
      this.erro = mensagemDeErro(e);
    } finally {
      this.ocupado = false;
    }
  }

  private async cancelar() {
    if (this.previa) await uv().api(`/importacoes/${this.previa.id}/cancelar`, json({})).catch(() => undefined);
    this.previa = null;
    this.arquivo = null;
  }

  private resumo(p: Previa) {
    const aplicada = this.aplicada || p.status === 'aplicada';
    return html`
      <urbi-grid min="140px">
        <urbi-kpi rotulo="Linhas no arquivo" .valor=${p.total_linhas}></urbi-kpi>
        ${aplicada
          ? html`<urbi-kpi rotulo="Inseridas" .valor=${p.inseridas ?? 0} variante="sucesso"></urbi-kpi>
              <urbi-kpi rotulo="Atualizadas" .valor=${p.atualizadas ?? 0}></urbi-kpi>
              <urbi-kpi rotulo="Ignoradas" .valor=${p.ignoradas ?? 0}></urbi-kpi>`
          : html`<urbi-kpi rotulo="A inserir" .valor=${p.previstas?.inserir ?? 0}></urbi-kpi>
              <urbi-kpi rotulo="A atualizar" .valor=${p.previstas?.atualizar ?? 0}></urbi-kpi>
              <urbi-kpi rotulo="A ignorar" .valor=${p.previstas?.ignorar ?? 0}></urbi-kpi>`}
        <urbi-kpi rotulo="Rejeitadas" .valor=${p.rejeitadas} variante=${p.rejeitadas ? 'alerta' : ''}></urbi-kpi>
      </urbi-grid>
    `;
  }

  render() {
    const p = this.previa;
    const podeImportar = temPapel('operador');
    return html`
      <urbi-stack>
        ${this.erro ? html`<urbi-banner variante="erro">${this.erro}</urbi-banner>` : nothing}
        ${!podeImportar ? html`<urbi-banner variante="info">Importar exige o papel operador.</urbi-banner>` : nothing}
        ${!p
          ? html`
              ${this.tabela
                ? nothing
                : html`<urbi-select label="Tabela" .valor=${this.escolhida}
                    .opcoes=${this.tabelas.map((t) => ({ valor: t.tabela, rotulo: t.titulo }))}
                    @urbi:select-change=${(e: CustomEvent) => (this.escolhida = e.detail.valor)}></urbi-select>`}
              <urbi-select label="Se o registro já existir" .valor=${this.modo}
                .opcoes=${(this.def?.modos ?? ['ignorar']).map((m) => ({ valor: m, rotulo: ROTULO_MODO[m] ?? m }))}
                @urbi:select-change=${(e: CustomEvent) => (this.modo = e.detail.valor)}></urbi-select>
              <urbi-seletor-arquivo drop accept=".csv,text/csv" dica="CSV com ; ou , (UTF-8). O modelo traz o cabeçalho esperado."
                ?desabilitado=${!podeImportar}
                @urbi:seletor-arquivo-change=${(e: CustomEvent) => (this.arquivo = e.detail.arquivo)}></urbi-seletor-arquivo>
              <urbi-linha>
                <urbi-botao variante="primario" ?carregando=${this.ocupado} ?desabilitado=${!this.arquivo || !podeImportar}
                  @click=${this.gerarPrevia}>Gerar prévia</urbi-botao>
                <urbi-botao variante="texto" icone="fa-solid fa-download"
                  @click=${() => baixar(`/importacoes/modelo/${this.escolhida}`, `modelo_${this.escolhida}.csv`).catch((e) => (this.erro = mensagemDeErro(e)))}>Baixar modelo</urbi-botao>
              </urbi-linha>
            `
          : html`
              ${this.resumo(p)}
              ${p.bloqueio ? html`<urbi-banner variante="erro">${p.bloqueio}</urbi-banner>` : nothing}
              ${p.colunas_ignoradas.length
                ? html`<urbi-banner variante="alerta">Colunas sem campo próprio: ${p.colunas_ignoradas.map((c) => `${c.cabecalho} (${c.motivo === 'derivada' ? 'derivada' : c.motivo === 'extras' ? 'guardada em extras' : 'desconhecida'})`).join(', ')}.</urbi-banner>`
                : nothing}
              ${p.rejeicoes.length
                ? html`<urbi-prosa papel="secao">Linhas rejeitadas${p.rejeitadas > p.rejeicoes.length ? ` (primeiras ${p.rejeicoes.length} de ${p.rejeitadas})` : ''}</urbi-prosa>
                    <urbi-tabela .colunas=${COLUNAS_REJEICAO} .linhas=${p.rejeicoes}></urbi-tabela>`
                : nothing}
              ${this.colunaSemValor && !this.aplicada
                ? html`<urbi-banner variante="info">A coluna obrigatória "${this.colunaSemValor}" está vazia nas linhas rejeitadas.
                    <urbi-botao slot="acao" pequeno variante="secundario" @click=${() => this.declararPadrao(this.colunaSemValor!)}>Declarar valor padrão</urbi-botao></urbi-banner>`
                : nothing}
              <urbi-linha>
                ${this.aplicada || p.status === 'aplicada'
                  ? html`<urbi-botao variante="secundario" @click=${() => { this.previa = null; this.arquivo = null; }}>Nova importação</urbi-botao>`
                  : html`<urbi-botao variante="primario" ?carregando=${this.ocupado} ?desabilitado=${Boolean(p.bloqueio) || !podeImportar} @click=${this.aplicar}>Aplicar</urbi-botao>
                      <urbi-botao variante="texto" @click=${this.cancelar}>Cancelar</urbi-botao>`}
              </urbi-linha>
            `}
      </urbi-stack>
    `;
  }
}
definir('intel-imob-importar', IntelImobImportar);
