import { LitElement, html, nothing, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { CampoFormulario, UrbiColunaTabela } from '@urbiverso/sdk';
import { definir } from '../registro';
import { baixar, mensagemDeErro, patch, json, temPapel, uv } from '../api';
import './importar';

export type TipoCampo = 'texto' | 'texto_longo' | 'numero' | 'data' | 'booleano' | 'selecao' | 'localidade' | 'fonte' | 'url' | 'json' | 'brl' | 'm2' | 'frac' | 'datahora';
export type Nivel = 'essencial' | 'complementar' | 'tecnico';

export interface CampoFicha {
  nome: string;
  rotulo: string;
  tipo: TipoCampo;
  opcoes?: { valor: string; rotulo: string }[];
  obrigatorio?: boolean;
  /** Aparece no formulário de criar. */
  criar?: boolean;
  /** Aparece no formulário de editar. */
  editar?: boolean;
  nivel?: Nivel;
  /** Mostra outro campo da linha (ex.: `localidade_nome` para `localidade_id`). */
  mostrar?: string;
}

export interface ConfigCadastro {
  id: string;
  titulo: string;
  singular: string;
  api: string;
  /** Tabela do "Importar CSV" desta aba (D-144); ausente = sem importação na aba. */
  tabelaImport?: string;
  papel: 'curador' | 'operador';
  colunas: UrbiColunaTabela[];
  /** Filtros da tabela → querystring da rota (vocabulário fechado). */
  query?: (filtros: Record<string, string>) => Record<string, string>;
  campos: CampoFicha[];
  tituloFicha: (l: any) => string;
  eventos?: boolean;
  /** Blocos extras da ficha (mini-mapa, núcleo, atributos…). */
  blocosFicha?: (l: any, recarregar: () => void) => TemplateResult | typeof nothing;
  /** Ações extras no topo da lista (ex.: importar KML, desenhar). */
  acoesLista?: (recarregar: () => void) => TemplateResult | typeof nothing;
  /** Lista que não pagina (ex.: GeoJSON) usa outra rota. */
  apiLista?: string;
  /** `false` quando a tabela não tem remover/restaurar pela tela. */
  removivel?: boolean;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** Valor de exibição de um campo (ausência é frase, nunca zero; spec 10.1). */
export function formatar(campo: Pick<CampoFicha, 'tipo' | 'opcoes'>, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  switch (campo.tipo) {
    case 'brl':
      return brl.format(Number(v));
    case 'm2':
      return `${num.format(Number(v))} m²`;
    case 'frac':
      return `${num.format(Number(v) * 100)}%`;
    case 'numero':
      return num.format(Number(v));
    case 'booleano':
      return v === true || v === 'true' ? 'Sim' : 'Não';
    case 'datahora': {
      const d = new Date(String(v));
      return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    }
    case 'data': {
      const [a, m, d] = String(v).slice(0, 10).split('-');
      return d ? `${d}/${m}/${a}` : String(v);
    }
    case 'selecao':
      return campo.opcoes?.find((o) => o.valor === String(v))?.rotulo ?? String(v).replace(/_/g, ' ');
    case 'json':
      return typeof v === 'string' ? v : JSON.stringify(v);
    default:
      return String(v);
  }
}

let cacheLocalidades: { valor: string; rotulo: string }[] | null = null;
let cacheFontes: { valor: string; rotulo: string }[] | null = null;

async function opcoesLocalidades(): Promise<{ valor: string; rotulo: string }[]> {
  if (!cacheLocalidades) {
    const r = await uv().api('/localidades?por_pagina=100');
    cacheLocalidades = r.dados.map((l: any) => ({ valor: String(l.id), rotulo: `${l.nome} (${l.codigo})` }));
  }
  return cacheLocalidades!;
}

async function opcoesFontes(): Promise<{ valor: string; rotulo: string }[]> {
  if (!cacheFontes) {
    const r = await uv().api('/fontes?por_pagina=100');
    cacheFontes = r.dados.map((f: any) => ({ valor: String(f.id), rotulo: f.nome }));
  }
  return cacheFontes!;
}

export function esquecerOpcoes(): void {
  cacheLocalidades = null;
  cacheFontes = null;
}

/** Campos do `urbiVerso.formulario()` a partir da configuração (spec 10.6: formulários sem HTML próprio). */
async function camposFormulario(campos: CampoFicha[], valores: any | null): Promise<CampoFormulario[]> {
  const out: CampoFormulario[] = [];
  for (const c of campos) {
    const v = valores?.[c.nome];
    const base = { nome: c.nome, rotulo: c.rotulo, obrigatorio: c.obrigatorio && !valores };
    switch (c.tipo) {
      case 'numero':
      case 'brl':
      case 'm2':
      case 'frac':
        out.push({ ...base, tipo: 'numero', valor: v === null || v === undefined ? null : Number(v), ...(c.tipo === 'frac' ? { min: 0, max: 1, step: 0.01 } : {}) });
        break;
      case 'data':
        out.push({ ...base, tipo: 'data', valor: v ? String(v).slice(0, 10) : null });
        break;
      case 'booleano':
        out.push({ ...base, tipo: 'booleano', valor: v === true });
        break;
      case 'selecao':
        out.push({ ...base, tipo: 'selecao', opcoes: c.opcoes ?? [], valor: v ?? null });
        break;
      case 'localidade':
        out.push({ ...base, tipo: 'selecao', opcoes: await opcoesLocalidades(), valor: v ? String(v) : null, pesquisavel: true });
        break;
      case 'fonte':
        out.push({ ...base, tipo: 'selecao', opcoes: await opcoesFontes(), valor: v ? String(v) : null });
        break;
      case 'texto_longo':
        out.push({ ...base, tipo: 'texto_longo', valor: v ?? '' });
        break;
      case 'json':
        out.push({ ...base, tipo: 'texto_longo', valor: v ? JSON.stringify(v) : '' });
        break;
      default:
        out.push({ ...base, tipo: 'texto', valor: v ?? '' });
    }
  }
  return out;
}

/** Valores do formulário → corpo da rota (vazio vira `null`; ids e JSON convertidos). */
function corpoDoFormulario(campos: CampoFicha[], valores: Record<string, unknown>, original: any | null): Record<string, unknown> {
  const corpo: Record<string, unknown> = {};
  for (const c of campos) {
    if (!(c.nome in valores)) continue;
    let v = valores[c.nome];
    if (v === '' || v === undefined) v = null;
    if (v !== null && (c.tipo === 'localidade' || c.tipo === 'fonte')) v = Number(v);
    if (v !== null && c.tipo === 'json') {
      try {
        v = JSON.parse(String(v));
      } catch {
        throw new Error(`${c.rotulo}: JSON inválido.`);
      }
    }
    if (original && JSON.stringify(original[c.nome] ?? null) === JSON.stringify(v) && !(typeof v === 'number' && Number(original[c.nome]) !== v)) continue;
    if (original && v === null && (original[c.nome] === null || original[c.nome] === undefined)) continue;
    corpo[c.nome] = v;
  }
  return corpo;
}

const COLUNAS_HISTORICO: UrbiColunaTabela[] = [
  { id: 'em', label: 'Quando', largura: '140px', valor: (l: any) => formatar({ tipo: 'datahora' }, l.em) },
  { id: 'acao', label: 'Ação', largura: '110px' },
  { id: 'autor_nome', label: 'Quem', largura: '160px', valor: (l: any) => l.autor_nome ?? `#${l.autor_id}` },
  { id: 'campos', label: 'O que mudou', valor: (l: any) => (l.campos ? Object.entries(l.campos).map(([k, d]: [string, any]) => `${k}: ${formatar({ tipo: 'texto' }, d.antes)} → ${formatar({ tipo: 'texto' }, d.depois)}`).join('; ') : l.motivo ?? '') },
];

const COLUNAS_EVENTOS: UrbiColunaTabela[] = [
  { id: 'ocorrido_em', label: 'Quando', largura: '140px', valor: (l: any) => formatar({ tipo: 'datahora' }, l.ocorrido_em) },
  { id: 'tipo', label: 'Evento', largura: '170px', valor: (l: any) => String(l.tipo).replace(/_/g, ' ') },
  { id: 'preco', label: 'Preço', largura: '200px', valor: (l: any) => (l.preco_novo_brl ? `${l.preco_anterior_brl ? `${formatar({ tipo: 'brl' }, l.preco_anterior_brl)} → ` : ''}${formatar({ tipo: 'brl' }, l.preco_novo_brl)}` : '') },
  { id: 'detalhes', label: 'Detalhe', valor: (l: any) => [l.detalhes, Array.isArray(l.campos_alterados) ? l.campos_alterados.join(', ') : ''].filter(Boolean).join(' · ') },
];

const POR_PAGINA = 50;

/** Lista de um cadastro (spec 10.6). */
export class IntelImobCadastroLista extends LitElement {
  @property({ attribute: false }) config!: ConfigCadastro;
  @state() private linhas: any[] = [];
  @state() private total = 0;
  @state() private pagina = 1;
  @state() private carregando = true;
  @state() private erro = '';
  @state() private importando = false;
  private filtros: Record<string, string> = {};

  connectedCallback() {
    super.connectedCallback();
    this.carregar();
  }

  private query(extra: Record<string, string> = {}): string {
    const q = new URLSearchParams({ ...(this.config.query ? this.config.query(this.filtros) : this.filtros), ...extra });
    for (const [k, v] of [...q.entries()]) if (v === '') q.delete(k);
    return q.toString();
  }

  readonly recarregar = () => this.carregar();

  private async carregar() {
    this.carregando = true;
    this.erro = '';
    try {
      const r = await uv().api(`${this.config.apiLista ?? this.config.api}?${this.query({ pagina: String(this.pagina), por_pagina: String(POR_PAGINA) })}`);
      this.linhas = r.dados;
      this.total = r.total;
    } catch (e) {
      this.erro = mensagemDeErro(e);
    } finally {
      this.carregando = false;
    }
  }

  private async novo() {
    const campos = this.config.campos.filter((c) => c.criar);
    try {
      const valores = await uv().formulario({ titulo: `Novo ${this.config.singular}`, campos: await camposFormulario(campos, null), rotuloConfirmar: 'Criar' });
      if (!valores) return;
      const criado = await uv().api(this.config.api, json(corpoDoFormulario(campos, valores, null)));
      uv().notificar(`${this.config.singular} criado.`, 'sucesso');
      esquecerOpcoes();
      uv().navegarSub(`/cadastro/${this.config.id}/${criado.id}`);
    } catch (e) {
      const d = (e as { detalhes?: string[] }).detalhes;
      await uv().alertar({ tipo: 'erro', titulo: 'Não foi possível criar', mensagem: [mensagemDeErro(e), ...(d ?? [])].join('\n') });
    }
  }

  render() {
    const c = this.config;
    const pode = temPapel(c.papel);
    const paginas = Math.ceil(this.total / POR_PAGINA);
    return html`
      <urbi-hospedeiro>
        <urbi-stack>
          ${this.erro ? html`<urbi-banner variante="erro">${this.erro}</urbi-banner>` : nothing}
          <urbi-linha justificar="entre" quebrar>
            <urbi-prosa papel="secao">${this.total} ${this.total === 1 ? c.singular.toLowerCase() : c.titulo.toLowerCase()}</urbi-prosa>
            <urbi-linha quebrar>
              ${c.acoesLista ? c.acoesLista(this.recarregar) : nothing}
              ${pode && c.campos.some((x) => x.criar) ? html`<urbi-botao variante="primario" icone="fa-solid fa-plus" @click=${this.novo}>Novo</urbi-botao>` : nothing}
              <urbi-botao variante="secundario" icone="fa-solid fa-download"
                @click=${() => baixar(`${c.api}?${this.query({ formato: 'csv' })}`, `${c.id}.csv`).catch((e) => (this.erro = mensagemDeErro(e)))}>Baixar CSV</urbi-botao>
              ${c.tabelaImport
                ? html`<urbi-botao variante="secundario" icone="fa-solid fa-file-import" @click=${() => (this.importando = !this.importando)}>Importar CSV</urbi-botao>
                    <urbi-botao variante="texto" icone="fa-solid fa-table-columns"
                      @click=${() => baixar(`/importacoes/modelo/${c.tabelaImport}`, `modelo_${c.tabelaImport}.csv`).catch((e) => (this.erro = mensagemDeErro(e)))}>Baixar modelo</urbi-botao>`
                : nothing}
            </urbi-linha>
          </urbi-linha>
          ${this.importando && c.tabelaImport
            ? html`<urbi-card titulo=${`Importar CSV de ${c.titulo.toLowerCase()}`} icone="fa-solid fa-file-csv">
                <intel-imob-importar tabela=${c.tabelaImport} @intel-imob:importacao-aplicada=${() => { esquecerOpcoes(); this.carregar(); }}></intel-imob-importar>
              </urbi-card>`
            : nothing}
          <urbi-tabela responsivo="multiline" .colunas=${c.colunas} .linhas=${this.linhas} ?carregando=${this.carregando} clicavel
            mensagem-vazio=${`Nenhum ${c.singular.toLowerCase()} com esses filtros.`}
            @urbi:tabela-filtro=${(e: CustomEvent) => { this.filtros = e.detail.filtros; this.pagina = 1; this.carregar(); }}
            @urbi:tabela-click=${(e: CustomEvent) => uv().navegarSub(`/cadastro/${c.id}/${e.detail.linha.id}`)}></urbi-tabela>
          ${paginas > 1
            ? html`<urbi-linha>
                <urbi-botao variante="texto" ?desabilitado=${this.pagina <= 1} @click=${() => { this.pagina--; this.carregar(); }}>Anterior</urbi-botao>
                <urbi-prosa papel="dica" inline>Página ${this.pagina} de ${paginas}</urbi-prosa>
                <urbi-botao variante="texto" ?desabilitado=${this.pagina >= paginas} @click=${() => { this.pagina++; this.carregar(); }}>Próxima</urbi-botao>
              </urbi-linha>`
            : nothing}
        </urbi-stack>
      </urbi-hospedeiro>
    `;
  }
}
definir('intel-imob-cadastro-lista', IntelImobCadastroLista);

const ROTULO_NIVEL: Record<Nivel, string> = { essencial: 'Essencial', complementar: 'Complementar', tecnico: 'Técnico' };

/** Ficha de um registro: três níveis, editar com versão, remover/restaurar, eventos e histórico. */
export class IntelImobCadastroFicha extends LitElement {
  @property({ attribute: false }) config!: ConfigCadastro;
  @property({ type: Number }) registroId = 0;
  @state() private reg: any = null;
  @state() private historico: any[] = [];
  @state() private eventos: any[] = [];
  @state() private erro = '';
  @state() private ocupado = false;

  connectedCallback() {
    super.connectedCallback();
    this.carregar();
  }

  readonly recarregar = () => this.carregar();

  private async carregar() {
    try {
      const c = this.config;
      this.reg = await uv().api(`${c.api}/${this.registroId}`);
      this.historico = (await uv().api(`${c.api}/${this.registroId}/historico`)).dados;
      if (c.eventos) this.eventos = (await uv().api(`${c.api}/${this.registroId}/eventos`)).dados;
    } catch (e) {
      this.erro = mensagemDeErro(e);
    }
  }

  private async editar() {
    const campos = this.config.campos.filter((c) => c.editar);
    try {
      const valores = await uv().formulario({ titulo: `Editar ${this.config.singular.toLowerCase()}`, campos: await camposFormulario(campos, this.reg) });
      if (!valores) return;
      const corpo = corpoDoFormulario(campos, valores, this.reg);
      if (!Object.keys(corpo).length) return;
      await this.salvar(corpo);
    } catch (e) {
      await uv().alertar({ tipo: 'erro', titulo: 'Não foi possível salvar', mensagem: mensagemDeErro(e) });
    }
  }

  /** PATCH com a versão lida; conflito mostra as duas versões em vez de sobrescrever (D-88). */
  async salvar(corpo: Record<string, unknown>) {
    this.ocupado = true;
    try {
      this.reg = { ...this.reg, ...(await uv().api(`${this.config.api}/${this.registroId}`, patch({ ...corpo, versao: this.reg.versao }))) };
      uv().notificar('Salvo.', 'sucesso');
      await this.carregar();
    } catch (e) {
      const erro = e as { codigo?: string; detalhes?: string[] };
      if (erro.codigo === 'CONFLITO_VERSAO') {
        const atual = await uv().api(`${this.config.api}/${this.registroId}`);
        const diferencas = Object.keys(corpo).map((k) => `${k}: a sua "${formatar({ tipo: 'texto' }, corpo[k])}", a gravada "${formatar({ tipo: 'texto' }, atual[k])}"`);
        await uv().alertar({ tipo: 'alerta', titulo: 'Outra pessoa salvou antes', mensagem: `A ficha foi recarregada com a versão atual. Refaça a sua alteração se ainda fizer sentido.\n\n${diferencas.join('\n')}` });
        this.reg = atual;
      } else {
        await uv().alertar({ tipo: 'erro', titulo: 'Não foi possível salvar', mensagem: [mensagemDeErro(e), ...(erro.detalhes ?? [])].join('\n') });
      }
    } finally {
      this.ocupado = false;
    }
  }

  private async removerOuRestaurar() {
    const removido = Boolean(this.reg.removido_em);
    const ok = await uv().confirmar({
      titulo: removido ? 'Restaurar' : 'Remover',
      mensagem: removido ? 'Restaurar este registro?' : 'O registro vai para a lixeira e pode ser restaurado. Remover?',
      rotuloConfirmar: removido ? 'Restaurar' : 'Remover',
      perigo: !removido,
    });
    if (!ok) return;
    try {
      await uv().api(`${this.config.api}/${this.registroId}/${removido ? 'restaurar' : 'remover'}`, patch({}));
      await this.carregar();
    } catch (e) {
      this.erro = mensagemDeErro(e);
    }
  }

  private secao(nivel: Nivel) {
    const campos = this.config.campos.filter((c) => (c.nivel ?? 'essencial') === nivel);
    if (!campos.length) return nothing;
    return html`<urbi-card titulo=${ROTULO_NIVEL[nivel]}>
      <urbi-grid min="200px">
        ${campos.map((c) => {
          const v = this.reg[c.mostrar ?? c.nome];
          const texto = formatar(c, v);
          const url = c.tipo === 'url' && typeof v === 'string' && /^https?:\/\//.test(v) ? v : null;
          return html`<urbi-stack>
            <urbi-prosa papel="dica">${c.rotulo}</urbi-prosa>
            ${url ? html`<urbi-prosa><a href=${url} target="_blank" rel="noopener noreferrer">${texto}</a></urbi-prosa>` : html`<urbi-prosa>${texto}</urbi-prosa>`}
          </urbi-stack>`;
        })}
      </urbi-grid>
    </urbi-card>`;
  }

  render() {
    const c = this.config;
    if (this.erro) {
      return html`<urbi-hospedeiro><urbi-stack>
        <urbi-botao variante="texto" icone="fa-solid fa-arrow-left" href=${uv().href(`/cadastro/${c.id}`)}>${c.titulo}</urbi-botao>
        <urbi-banner variante="erro">${this.erro}</urbi-banner></urbi-stack></urbi-hospedeiro>`;
    }
    if (!this.reg) return html`<urbi-loading></urbi-loading>`;
    const pode = temPapel(c.papel);
    const removido = Boolean(this.reg.removido_em);
    return html`
      <urbi-hospedeiro>
        <urbi-stack>
          <urbi-linha justificar="entre" quebrar>
            <urbi-botao variante="texto" icone="fa-solid fa-arrow-left" href=${uv().href(`/cadastro/${c.id}`)}>${c.titulo}</urbi-botao>
            ${pode
              ? html`<urbi-linha>
                  ${removido ? nothing : html`<urbi-botao variante="primario" icone="fa-solid fa-pen" ?carregando=${this.ocupado} @click=${this.editar}>Editar</urbi-botao>`}
                  ${c.removivel === false
                    ? nothing
                    : html`<urbi-botao variante=${removido ? 'secundario' : 'perigo'} icone=${removido ? 'fa-solid fa-rotate-left' : 'fa-solid fa-trash'}
                        @click=${this.removerOuRestaurar}>${removido ? 'Restaurar' : 'Remover'}</urbi-botao>`}
                </urbi-linha>`
              : nothing}
          </urbi-linha>
          <urbi-linha quebrar>
            <urbi-prosa papel="titulo">${c.tituloFicha(this.reg)}</urbi-prosa>
            ${removido ? html`<urbi-badge cor="erro">removido</urbi-badge>` : nothing}
            ${this.reg.status ? html`<urbi-badge>${String(this.reg.status)}</urbi-badge>` : nothing}
            <urbi-prosa papel="mono" inline>#${this.reg.id} · versão ${this.reg.versao ?? '—'}</urbi-prosa>
          </urbi-linha>
          ${!pode ? html`<urbi-prosa papel="dica">Somente leitura: editar exige o papel ${c.papel}.</urbi-prosa>` : nothing}
          ${this.secao('essencial')}
          ${c.blocosFicha ? c.blocosFicha(this.reg, this.recarregar) : nothing}
          ${this.secao('complementar')}
          ${this.secao('tecnico')}
          ${c.eventos
            ? html`<urbi-card titulo="Eventos"><urbi-tabela responsivo="multiline" .colunas=${COLUNAS_EVENTOS} .linhas=${this.eventos} mensagem-vazio="Sem eventos."></urbi-tabela></urbi-card>`
            : nothing}
          <urbi-card titulo="Histórico de alterações">
            <urbi-tabela responsivo="multiline" .colunas=${COLUNAS_HISTORICO} .linhas=${this.historico} mensagem-vazio="Sem alterações registradas."></urbi-tabela>
          </urbi-card>
        </urbi-stack>
      </urbi-hospedeiro>
    `;
  }
}
definir('intel-imob-cadastro-ficha', IntelImobCadastroFicha);
