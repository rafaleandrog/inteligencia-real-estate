import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { CampoFormulario, UrbiColunaTabela } from '@urbiverso/sdk';
import { definir } from '../registro';
import { estiloPrimitivo } from '../estilos';
import { json, mensagemDeErro, patch, temPapel, uv } from '../api';
import { OBJETOS, OBJETO_TIPOS, TIPOS_VALOR, UNIDADES, type ObjetoTipo } from '../../comum/objetos';
import { formatar } from './cadastro';

const ROTULO_TIPO_VALOR: Record<string, string> = { numero: 'Número', texto: 'Texto', data: 'Data', booleano: 'Sim/não', opcao: 'Opção' };
const ROTULO_UNIDADE: Record<string, string> = { m2: 'm²', brl: 'R$', brl_m2: 'R$/m²', frac: 'fração (0,12 = 12%)', un: 'unidades', m: 'm', km: 'km', ha: 'ha', anos: 'anos', dias: 'dias' };

/** Valor de atributo para leitura, com a unidade (ausência é frase; spec 10.1). */
export function formatarAtributo(a: { tipo_valor: string; unidade?: string | null; opcoes?: { valor: string; rotulo: string }[] | null }, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (a.tipo_valor === 'booleano') return v ? 'sim' : 'não';
  if (a.tipo_valor === 'data') return formatar({ tipo: 'data' }, v);
  if (a.tipo_valor === 'opcao') return a.opcoes?.find((o) => o.valor === v)?.rotulo ?? String(v);
  if (a.tipo_valor === 'numero') {
    if (a.unidade === 'brl' || a.unidade === 'brl_m2') return `${formatar({ tipo: 'brl' }, v)}${a.unidade === 'brl_m2' ? '/m²' : ''}`;
    if (a.unidade === 'frac') return formatar({ tipo: 'frac' }, v);
    return `${formatar({ tipo: 'numero' }, v)}${a.unidade && a.unidade !== 'un' ? ` ${ROTULO_UNIDADE[a.unidade] ?? a.unidade}` : ''}`;
  }
  return String(v);
}

function campoDoAtributo(item: any): CampoFormulario {
  const a = item.atributo;
  const nome = `a${a.id}`;
  const rotulo = `${a.nome}${a.unidade ? ` (${ROTULO_UNIDADE[a.unidade] ?? a.unidade})` : ''}`;
  switch (a.tipo_valor) {
    case 'numero':
      return { nome, rotulo, tipo: 'numero', valor: item.valor ?? null, ...(a.unidade === 'frac' ? { min: -1, max: 1, step: 0.01 } : {}) };
    case 'data':
      return { nome, rotulo, tipo: 'data', valor: item.valor ?? null };
    case 'booleano':
      // Sim/não com vazio: a caixa do formulário não distingue "não" de "sem valor".
      return { nome, rotulo, tipo: 'selecao', opcoes: [{ valor: 'sim', rotulo: 'Sim' }, { valor: 'nao', rotulo: 'Não' }], valor: item.valor === null ? null : item.valor ? 'sim' : 'nao' };
    case 'opcao':
      return { nome, rotulo, tipo: 'selecao', opcoes: (a.opcoes ?? []).filter((o: any) => o.ativo !== false || o.valor === item.valor).map((o: any) => ({ valor: o.valor, rotulo: o.rotulo })), valor: item.valor ?? null };
    default:
      return { nome, rotulo, tipo: 'texto_longo', valor: item.valor ?? '' };
  }
}

function valorDoFormulario(item: any, v: unknown): unknown {
  if (v === '' || v === undefined) return null;
  if (item.atributo.tipo_valor === 'booleano') return v === null ? null : v === 'sim';
  return v;
}

/** Bloco "Atributos" da ficha (spec 10.14): extensíveis por grupo, com unidade, fonte e data; editável pelo curador. */
export class IntelImobAtributosObjeto extends LitElement {
  static styles = [estiloPrimitivo];
  @property() tipo: ObjetoTipo = 'contorno';
  @property({ type: Number }) objetoId = 0;
  @property({ type: Boolean }) removido = false;
  @state() private dados: any = null;
  @state() private erro = '';

  connectedCallback() {
    super.connectedCallback();
    this.carregar();
  }

  private async carregar() {
    try {
      this.dados = await uv().api(`/objetos/${this.tipo}/${this.objetoId}/atributos`);
      this.erro = '';
    } catch (e) {
      this.erro = mensagemDeErro(e);
    }
  }

  private async editar(grupo: any) {
    const itens = grupo.itens.filter((i: any) => i.atributo.ativo);
    const campos: CampoFormulario[] = [
      ...itens.map(campoDoAtributo),
      { nome: '__fonte', rotulo: 'Fonte (documento, campo, URL)', tipo: 'texto', valor: '' },
      { nome: '__observado_em', rotulo: 'Data a que os valores se referem', tipo: 'data', valor: null },
    ];
    const valores = await uv().formulario({ titulo: `Atributos${grupo.grupo ? ` · ${grupo.grupo}` : ''}`, campos });
    if (!valores) return;
    const lote = itens
      .map((i: any) => ({ item: i, novo: valorDoFormulario(i, valores[`a${i.atributo.id}`]) }))
      .filter(({ item, novo }: any) => JSON.stringify(item.valor ?? null) !== JSON.stringify(novo ?? null))
      .map(({ item, novo }: any) => ({ atributo_id: item.atributo.id, valor: novo, versao: item.versao, fonte: valores.__fonte || item.fonte, observado_em: valores.__observado_em || item.observado_em }));
    if (!lote.length) return;
    try {
      await uv().api(`/objetos/${this.tipo}/${this.objetoId}/atributos`, { method: 'PUT', body: JSON.stringify({ valores: lote }) });
      uv().notificar('Atributos salvos.', 'sucesso');
      await this.carregar();
      this.dispatchEvent(new CustomEvent('intel-imob:atributos-salvos', { bubbles: true, composed: true }));
    } catch (e) {
      const erro = e as { codigo?: string; detalhes?: string[] };
      await uv().alertar({
        tipo: erro.codigo === 'CONFLITO_VERSAO' ? 'alerta' : 'erro',
        titulo: erro.codigo === 'CONFLITO_VERSAO' ? 'Outra pessoa salvou antes' : 'Não foi possível salvar',
        mensagem: [mensagemDeErro(e), ...(erro.detalhes ?? [])].join('\n'),
      });
      await this.carregar();
    }
  }

  render() {
    if (this.erro) return html`<urbi-banner variante="erro">${this.erro}</urbi-banner>`;
    if (!this.dados) return html`<urbi-loading></urbi-loading>`;
    const pode = temPapel('curador') && !this.removido;
    const grupos = this.dados.grupos as any[];
    if (!grupos.length) {
      return html`<urbi-prosa papel="dica">Nenhum atributo extensível se aplica a ${OBJETOS[this.tipo].rotulo.toLowerCase()}. ${temPapel('curador') ? html`Crie em <a href=${uv().href('/cadastro/atributos')}>Cadastro › Atributos</a>.` : nothing}</urbi-prosa>`;
    }
    return html`<urbi-stack>
      ${grupos.map((g) => html`<urbi-stack>
        <urbi-linha justificar="entre">
          <urbi-prosa papel="subtitulo">${g.grupo ?? 'Sem grupo'}</urbi-prosa>
          ${pode && g.itens.some((i: any) => i.atributo.ativo) ? html`<urbi-botao variante="secundario" pequeno icone="fa-solid fa-pen" @click=${() => this.editar(g)}>Editar</urbi-botao>` : nothing}
        </urbi-linha>
        <urbi-grid min="200px">
          ${g.itens.map((i: any) => html`<urbi-stack>
            <urbi-prosa papel="dica">${i.atributo.nome}${i.atributo.ativo ? '' : ' (inativo)'}</urbi-prosa>
            <urbi-prosa>${formatarAtributo(i.atributo, i.valor)}</urbi-prosa>
            ${i.valor !== null && (i.fonte || i.observado_em) ? html`<urbi-prosa papel="dica">${[i.fonte, i.observado_em ? `em ${formatar({ tipo: 'data' }, i.observado_em)}` : ''].filter(Boolean).join(' · ')}</urbi-prosa>` : nothing}
          </urbi-stack>`)}
        </urbi-grid>
      </urbi-stack>`)}
    </urbi-stack>`;
  }
}
definir('intel-imob-atributos-objeto', IntelImobAtributosObjeto);

// ------------------------------------------------------------- catálogo

const COLUNAS_CATALOGO: UrbiColunaTabela[] = [
  { id: 'nome', label: 'Atributo', valor: (l: any) => `${l.nome} · ${l.codigo}` },
  { id: 'tipo_valor', label: 'Tipo', largura: '110px', valor: (l: any) => `${ROTULO_TIPO_VALOR[l.tipo_valor] ?? l.tipo_valor}${l.unidade ? ` (${ROTULO_UNIDADE[l.unidade] ?? l.unidade})` : ''}` },
  { id: 'aplica_a', label: 'Aplica a', valor: (l: any) => (l.aplica_a ?? []).map((t: string) => OBJETOS[t as ObjetoTipo]?.rotulo ?? t).join(', ') },
  { id: 'grupo', label: 'Grupo', largura: '130px', valor: (l: any) => l.grupo ?? '—' },
  { id: 'ativo', label: 'Estado', largura: '100px', valor: (l: any) => (l.removido_em ? 'removido' : l.ativo ? 'ativo' : 'inativo') },
];

/** Opções de opção em texto: uma por linha, `valor | rótulo`; `-` no começo marca retirada. */
function opcoesEmTexto(ops: any[] | null): string {
  return (ops ?? []).map((o) => `${o.ativo === false ? '-' : ''}${o.valor}${o.rotulo && o.rotulo !== o.valor ? ` | ${o.rotulo}` : ''}`).join('\n');
}
function textoEmOpcoes(t: string): { valor: string; rotulo: string; ativo: boolean }[] {
  return t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const retirada = l.startsWith('-');
    const [valor, rotulo] = l.replace(/^-/, '').split('|').map((x) => x.trim());
    return { valor, rotulo: rotulo || valor, ativo: !retirada };
  });
}

/** Cadastro › Atributos (spec 10.6, 5.24): o catálogo, sem release. Definição: admin ou curador. */
export class IntelImobAtributosCatalogo extends LitElement {
  static styles = [estiloPrimitivo];
  @state() private linhas: any[] = [];
  @state() private erro = '';
  @state() private removidos = false;
  @state() private distribuicao: any = null;

  connectedCallback() {
    super.connectedCallback();
    this.carregar();
  }

  private async carregar() {
    try {
      this.linhas = (await uv().api(`/atributos${this.removidos ? '?removidos=incluir' : ''}`)).dados;
      this.erro = '';
    } catch (e) {
      this.erro = mensagemDeErro(e);
    }
  }

  private async formulario(atual: any | null) {
    const campos: CampoFormulario[] = [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, valor: atual?.nome ?? '' },
      { nome: 'codigo', rotulo: 'Código (snake_case; chave do filtro e do CSV, não muda depois de ter valor)', tipo: 'texto', obrigatorio: true, valor: atual?.codigo ?? '' },
      { nome: 'tipo_valor', rotulo: 'Tipo de valor', tipo: 'selecao', obrigatorio: true, opcoes: TIPOS_VALOR.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_VALOR[t] })), valor: atual?.tipo_valor ?? null },
      { nome: 'unidade', rotulo: 'Unidade (obrigatória em número)', tipo: 'selecao', opcoes: UNIDADES.map((u) => ({ valor: u, rotulo: ROTULO_UNIDADE[u] })), valor: atual?.unidade ?? null },
      { nome: 'opcoes', rotulo: 'Opções (só em opção): uma por linha, "valor | rótulo"; "-" no começo retira', tipo: 'texto_longo', valor: opcoesEmTexto(atual?.opcoes ?? null) },
      ...OBJETO_TIPOS.map((t) => ({ nome: `aplica_${t}`, rotulo: `Aplica a: ${OBJETOS[t].rotulo}`, tipo: 'booleano' as const, valor: (atual?.aplica_a ?? []).includes(t) })),
      { nome: 'grupo', rotulo: 'Grupo na ficha (urbanistico, comercial, juridico…)', tipo: 'texto', valor: atual?.grupo ?? '' },
      { nome: 'descricao', rotulo: 'O que medir e como', tipo: 'texto_longo', valor: atual?.descricao ?? '' },
      { nome: 'ativo', rotulo: 'Ativo (aparece no formulário, no filtro e na exportação)', tipo: 'booleano', valor: atual ? Boolean(atual.ativo) : true },
    ];
    const v = await uv().formulario({ titulo: atual ? `Editar ${atual.nome}` : 'Novo atributo', campos });
    if (!v) return;
    const corpo: Record<string, unknown> = {
      nome: v.nome, codigo: String(v.codigo ?? '').trim(), tipo_valor: v.tipo_valor, unidade: v.unidade || null,
      opcoes: v.tipo_valor === 'opcao' ? textoEmOpcoes(String(v.opcoes ?? '')) : null,
      aplica_a: OBJETO_TIPOS.filter((t) => v[`aplica_${t}`]), grupo: v.grupo || null, descricao: v.descricao || null, ativo: Boolean(v.ativo),
    };
    try {
      if (atual) await uv().api(`/atributos/${atual.id}`, patch({ ...corpo, versao: atual.versao }));
      else await uv().api('/atributos', json(corpo));
      uv().notificar('Atributo salvo.', 'sucesso');
      await this.carregar();
    } catch (e) {
      await uv().alertar({ tipo: 'erro', titulo: 'Não foi possível salvar', mensagem: [mensagemDeErro(e), ...((e as any).detalhes ?? [])].join('\n') });
    }
  }

  private async remover(l: any) {
    const restaurar = Boolean(l.removido_em);
    if (!restaurar && !(await uv().confirmar({ titulo: 'Remover atributo', mensagem: 'Só sai para a lixeira um atributo sem valor gravado; com valor, inative-o.', rotuloConfirmar: 'Remover', perigo: true }))) return;
    try {
      await uv().api(`/atributos/${l.id}/${restaurar ? 'restaurar' : 'remover'}`, patch({}));
      await this.carregar();
    } catch (e) {
      await uv().alertar({ tipo: 'erro', titulo: 'Não foi possível', mensagem: [mensagemDeErro(e), ...((e as any).detalhes ?? [])].join('\n') });
    }
  }

  private async verDistribuicao(l: any) {
    try {
      this.distribuicao = await uv().api(`/atributos/${l.id}/distribuicao`);
    } catch (e) {
      this.erro = mensagemDeErro(e);
    }
  }

  render() {
    const pode = temPapel('curador');
    const colunas: UrbiColunaTabela[] = [
      ...COLUNAS_CATALOGO,
      {
        id: 'acoes', label: '', largura: '230px',
        render: (l: any) => html`<urbi-linha>
          ${l.tipo_valor === 'numero' ? html`<urbi-botao variante="texto" pequeno icone="fa-solid fa-chart-simple" @click=${() => this.verDistribuicao(l)}>Distribuição</urbi-botao>` : nothing}
          ${pode && !l.removido_em ? html`<urbi-botao variante="texto" pequeno icone="fa-solid fa-pen" @click=${() => this.formulario(l)}>Editar</urbi-botao>` : nothing}
          ${pode ? html`<urbi-botao variante="texto" pequeno icone=${l.removido_em ? 'fa-solid fa-rotate-left' : 'fa-solid fa-trash'} @click=${() => this.remover(l)}>${l.removido_em ? 'Restaurar' : 'Remover'}</urbi-botao>` : nothing}
        </urbi-linha>`,
        semRotuloMobile: true,
      },
    ];
    const d = this.distribuicao;
    const fmt = (x: number | null) => (x === null ? '—' : formatarAtributo({ tipo_valor: 'numero', unidade: d?.atributo.unidade }, x));
    return html`<urbi-hospedeiro><urbi-stack>
      ${this.erro ? html`<urbi-banner variante="erro">${this.erro}</urbi-banner>` : nothing}
      <urbi-linha justificar="entre" quebrar>
        <urbi-prosa papel="dica">Parâmetros que a equipe acrescenta aos objetos sem release. Filtram as listas por <code>atr_&lt;codigo&gt;_min/_max</code> e entram no CSV como coluna <code>atr_&lt;codigo&gt;</code>.</urbi-prosa>
        <urbi-linha>
          <urbi-checkbox label="Mostrar removidos" .marcado=${this.removidos} @urbi:checkbox-change=${(e: CustomEvent) => { this.removidos = e.detail.marcado; this.carregar(); }}></urbi-checkbox>
          ${pode ? html`<urbi-botao variante="primario" icone="fa-solid fa-plus" @click=${() => this.formulario(null)}>Novo atributo</urbi-botao>` : nothing}
        </urbi-linha>
      </urbi-linha>
      <urbi-tabela responsivo="multiline" .colunas=${colunas} .linhas=${this.linhas} mensagem-vazio="Nenhum atributo no catálogo."></urbi-tabela>
      ${d
        ? html`<urbi-modal title=${`Distribuição · ${d.atributo.nome}`} maxWidth="560px" @urbi-modal:close=${() => (this.distribuicao = null)}>
            <urbi-stack>
              <urbi-grid min="140px">
                <urbi-kpi rotulo="Objetos com valor" .valor=${d.n}></urbi-kpi>
                <urbi-kpi rotulo="Mediana" formato="texto" .valor=${d.mediana === null ? 'amostra pequena' : fmt(d.mediana)}></urbi-kpi>
                <urbi-kpi rotulo="P25–P75" formato="texto" .valor=${d.p25 === null ? 'amostra pequena' : `${fmt(d.p25)} – ${fmt(d.p75)}`}></urbi-kpi>
                <urbi-kpi rotulo="Mínimo–máximo" formato="texto" .valor=${d.minimo === null ? 'amostra pequena' : `${fmt(d.minimo)} – ${fmt(d.maximo)}`}></urbi-kpi>
              </urbi-grid>
              <urbi-prosa papel="dica">Mediana e extremos pedem 5 valores; quartis pedem 10. Objeto removido não conta.</urbi-prosa>
            </urbi-stack>
          </urbi-modal>`
        : nothing}
    </urbi-stack></urbi-hospedeiro>`;
  }
}
definir('intel-imob-atributos-catalogo', IntelImobAtributosCatalogo);
