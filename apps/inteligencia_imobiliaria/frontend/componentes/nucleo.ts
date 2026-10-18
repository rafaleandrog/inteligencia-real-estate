import { LitElement, html, nothing, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { UrbiColunaTabela } from '@urbiverso/sdk';
import { definir } from '../registro';
import { estiloPrimitivo } from '../estilos';
import { json, mensagemDeErro, patch, temPapel, uv } from '../api';
import { nucleo, type EstadoNucleo, type ErroNucleo } from '../../comum/nucleo-cliente';
import { OBJETOS, type ObjetoTipo } from '../../comum/objetos';
import { COMBINACOES, ROTULO_ENTIDADE, type EntidadeNucleo } from '../../comum/vinculos';
import { formatar } from './cadastro';

/** Coleção do núcleo que resolve um vínculo (imóvel pelo subtipo). */
function colecaoDo(v: { entidade: string; nucleo_subtipo?: string | null }): string {
  return v.entidade === 'imoveis' ? `${v.nucleo_subtipo}s` : v.entidade;
}

export interface Resolvido {
  vinculo: any;
  estado: EstadoNucleo;
  erro: ErroNucleo | null;
  /** Linhas "rótulo: valor" do que o núcleo devolve agora; nada é copiado (5.25). */
  campos: { rotulo: string; valor: string }[];
  titulo: string;
}

const m2 = (v: unknown) => formatar({ tipo: 'm2' }, v);

async function matricula(id: unknown): Promise<string> {
  if (!id) return '—';
  const r = await nucleo().ler('matriculas', Number(id));
  if (!r.registro) return r.estado === 'sem_permissao' ? 'sem permissão de leitura' : 'não encontrada';
  const m = r.registro;
  return `${m.id_legivel ?? `Mat. ${m.numero}`} · confiabilidade ${m.confiabilidade ?? '—'}`;
}

async function parcelamentoESetor(id: unknown): Promise<string> {
  if (!id) return '—';
  const p = await nucleo().ler('parcelamentos', Number(id));
  if (!p.registro) return 'não encontrado';
  let setor = '';
  if (p.registro.setor_habitacional_id) {
    const s = await nucleo().ler('setores-habitacionais', Number(p.registro.setor_habitacional_id));
    setor = s.registro ? ` → ${s.registro.nome ?? s.registro.id_legivel}` : '';
  }
  return `${p.registro.id_legivel ?? p.registro.nome}${setor}`;
}

/** Resolve um vínculo ao vivo pelo cliente único (10.14): campos por entidade, ou o estado. */
export async function resolverVinculo(v: any): Promise<Resolvido> {
  const colecao = colecaoDo(v);
  const r = await nucleo().ler(colecao, Number(v.nucleo_id));
  const base = { vinculo: v, estado: r.estado, erro: r.erro, campos: [] as Resolvido['campos'], titulo: `${ROTULO_ENTIDADE[v.nucleo_subtipo ?? v.entidade] ?? v.entidade} #${v.nucleo_id}` };
  if (!r.registro) return base;
  const x = r.registro;
  const titulo = `${ROTULO_ENTIDADE[v.nucleo_subtipo ?? v.entidade]} · ${x.id_legivel ?? x.nome ?? `#${x.id}`}`;
  let campos: Resolvido['campos'] = [];
  if (colecao === 'lotes') {
    campos = [
      { rotulo: 'Área efetiva', valor: m2(x.area_efetiva) },
      { rotulo: 'Quadra', valor: x.quadra ?? '—' },
      { rotulo: 'Conjunto', valor: x.conjunto ?? '—' },
      { rotulo: 'Parcelamento → setor', valor: await parcelamentoESetor(x.parcelamento_id) },
      { rotulo: 'Matrícula', valor: await matricula(x.matricula_id) },
    ];
  } else if (colecao === 'glebas' || colecao === 'unidades') {
    campos = [
      { rotulo: 'Nome', valor: x.nome ?? x.identificador ?? '—' },
      { rotulo: 'Área efetiva', valor: m2(x.area_efetiva) },
      { rotulo: 'Matrícula', valor: await matricula(x.matricula_id) },
    ];
  } else if (colecao === 'parcelamentos') {
    const setor = x.setor_habitacional_id ? await nucleo().ler('setores-habitacionais', Number(x.setor_habitacional_id)) : null;
    campos = [
      { rotulo: 'Setor habitacional', valor: setor?.registro ? String(setor.registro.nome ?? setor.registro.id_legivel) : '—' },
      { rotulo: 'Status', valor: x.status ?? '—' },
      { rotulo: 'Registro', valor: formatar({ tipo: 'data' }, x.data_registro) },
    ];
  } else if (colecao === 'matriculas') {
    campos = [
      { rotulo: 'Número', valor: String(x.numero ?? '—') },
      { rotulo: 'CRI', valor: x.cri ? `${x.cri}° CRI/${x.uf ?? ''}` : '—' },
      { rotulo: 'Status', valor: x.status ?? '—' },
      { rotulo: 'Área', valor: m2(x.area) },
      { rotulo: 'Confiabilidade', valor: x.confiabilidade ?? '—' },
    ];
  } else {
    // Incorporação: o que a listagem traz, sem remontar nada.
    campos = Object.entries(x)
      .filter(([k, val]) => !['id', 'id_legivel', 'criado_em', 'atualizado_em', 'removido_em', 'criado_por', 'atualizado_por'].includes(k) && (typeof val === 'string' || typeof val === 'number'))
      .slice(0, 8)
      .map(([k, val]) => ({ rotulo: k.replace(/_/g, ' '), valor: String(val) }));
  }
  return { ...base, titulo, campos };
}

const ROTULO_ESTADO: Record<EstadoNucleo, string> = { resolve: 'resolve', nao_encontrado: 'não encontrado no núcleo', sem_permissao: 'sem permissão de leitura', indisponivel: 'núcleo indisponível' };

/** Pergunta entidade e registro, e grava por `POST /vinculos-nucleo` (10.14, "Vincular ao núcleo"). */
export async function vincularAoNucleo(tipo: ObjetoTipo, objetoId: number): Promise<boolean> {
  const entidades = COMBINACOES[tipo] ?? [];
  const escolhas = entidades.flatMap((e) => (e === 'imoveis' ? ['lote', 'gleba', 'unidade'] : [e]));
  const passo1 = await uv().formulario({
    titulo: 'Vincular ao núcleo',
    campos: [{ nome: 'alvo', rotulo: 'O que no núcleo', tipo: 'selecao', obrigatorio: true, opcoes: escolhas.map((e) => ({ valor: e, rotulo: ROTULO_ENTIDADE[e] ?? e })), valor: escolhas[0] ?? null }],
  });
  if (!passo1?.alvo) return false;
  const alvo = String(passo1.alvo);
  const entidade = (['lote', 'gleba', 'unidade'].includes(alvo) ? 'imoveis' : alvo) as EntidadeNucleo;
  const colecao = entidade === 'imoveis' ? `${alvo}s` : alvo;
  let aviso = '';
  const passo2 = await uv().formulario({
    titulo: `Vincular a ${ROTULO_ENTIDADE[alvo].toLowerCase()}`,
    campos: [
      {
        nome: 'nucleo_id', rotulo: `${ROTULO_ENTIDADE[alvo]} (busca por id legível, quadra ou nome; a busca do núcleo não ignora acento)`, tipo: 'busca', obrigatorio: true,
        buscar: async (termo) => {
          const r = await nucleo().listar(colecao, {}, termo || undefined);
          if (r.erro) throw new Error(r.erro.mensagem);
          if (r.grande_demais) aviso = 'Lista grande demais: refine a busca.';
          return r.linhas.slice(0, 50).map((l) => ({ valor: Number(l.id), rotulo: String(l.id_legivel ?? l.nome ?? `#${l.id}`) }));
        },
      },
      { nome: 'notas', rotulo: 'Por que o vínculo existe (ex.: "polígono 12 do Magis = lote 3 da quadra 5")', tipo: 'texto_longo', valor: '' },
    ],
  });
  if (!passo2?.nucleo_id) return false;
  try {
    await uv().api('/vinculos-nucleo', json({ objeto_tipo: tipo, objeto_id: objetoId, entidade, nucleo_subtipo: entidade === 'imoveis' ? alvo : null, nucleo_id: passo2.nucleo_id, notas: passo2.notas || null }));
    uv().notificar(aviso || 'Vínculo criado.', aviso ? 'info' : 'sucesso');
    return true;
  } catch (e) {
    await uv().alertar({ tipo: 'erro', titulo: 'Não foi possível vincular', mensagem: [mensagemDeErro(e), ...((e as any).detalhes ?? [])].join('\n') });
    return false;
  }
}

/**
 * Seção "Do núcleo imobiliário" da ficha (spec 10.14): uma linha por vínculo,
 * lida agora pelo cliente único; estado escrito em vez de seção vazia; o
 * botão "Vincular ao núcleo" para admin e curador.
 */
export class IntelImobNucleoObjeto extends LitElement {
  static styles = [estiloPrimitivo];
  @property() tipo: ObjetoTipo = 'contorno';
  @property({ type: Number }) objetoId = 0;
  @property({ type: Boolean }) compacto = false;
  @state() private itens: Resolvido[] | null = null;
  @state() private erro = '';

  connectedCallback() {
    super.connectedCallback();
    this.carregar();
  }

  private async carregar() {
    try {
      const r = await uv().api(`/vinculos-nucleo?objeto_tipo=${this.tipo}&objeto_id=${this.objetoId}&por_pagina=100`);
      this.itens = await Promise.all(r.dados.map(resolverVinculo));
      this.erro = '';
    } catch (e) {
      this.erro = mensagemDeErro(e);
    }
  }

  private async vincular() {
    if (await vincularAoNucleo(this.tipo, this.objetoId)) await this.carregar();
  }

  private async desfazer(v: any) {
    if (!(await uv().confirmar({ titulo: 'Desfazer vínculo', mensagem: 'O vínculo vai para a lixeira e pode ser restaurado. O registro do núcleo não muda.', rotuloConfirmar: 'Desfazer', perigo: true }))) return;
    try {
      await uv().api(`/vinculos-nucleo/${v.id}/remover`, patch({}));
      await this.carregar();
    } catch (e) {
      this.erro = mensagemDeErro(e);
    }
  }

  private linha(i: Resolvido): TemplateResult {
    const pode = temPapel('curador');
    return html`<urbi-stack>
      <urbi-linha justificar="entre" quebrar>
        <urbi-linha>
          <urbi-prosa papel="subtitulo">${i.titulo}</urbi-prosa>
          ${i.estado !== 'resolve' ? html`<urbi-badge cor=${i.estado === 'sem_permissao' ? 'alerta' : 'erro'}>${ROTULO_ESTADO[i.estado]}</urbi-badge>` : nothing}
        </urbi-linha>
        ${pode && !this.compacto ? html`<urbi-botao variante="texto" pequeno icone="fa-solid fa-link-slash" @click=${() => this.desfazer(i.vinculo)}>Desfazer</urbi-botao>` : nothing}
      </urbi-linha>
      ${i.erro ? html`<urbi-prosa papel="dica">${i.erro.mensagem}</urbi-prosa>` : nothing}
      ${i.campos.length
        ? html`<urbi-grid min="180px">${i.campos.map((c) => html`<urbi-stack><urbi-prosa papel="dica">${c.rotulo}</urbi-prosa><urbi-prosa>${c.valor}</urbi-prosa></urbi-stack>`)}</urbi-grid>`
        : nothing}
      ${i.vinculo.notas && !this.compacto ? html`<urbi-prosa papel="dica">${i.vinculo.notas}</urbi-prosa>` : nothing}
    </urbi-stack>`;
  }

  render() {
    if (this.erro) return html`<urbi-banner variante="erro">${this.erro}</urbi-banner>`;
    if (!this.itens) return html`<urbi-loading></urbi-loading>`;
    const semPermissao = this.itens.find((i) => i.estado === 'sem_permissao');
    return html`<urbi-stack>
      ${semPermissao ? html`<urbi-banner variante="alerta">${semPermissao.erro?.mensagem}</urbi-banner>` : nothing}
      ${this.itens.length ? this.itens.map((i) => this.linha(i)) : html`<urbi-prosa papel="dica">Sem vínculo com o núcleo.</urbi-prosa>`}
      ${temPapel('curador') && !this.compacto && COMBINACOES[this.tipo]
        ? html`<urbi-linha><urbi-botao variante="secundario" icone="fa-solid fa-link" @click=${this.vincular}>Vincular ao núcleo</urbi-botao></urbi-linha>`
        : nothing}
    </urbi-stack>`;
  }
}
definir('intel-imob-nucleo-objeto', IntelImobNucleoObjeto);

/**
 * Cadastro › Vínculos com o núcleo (spec 5.25, R-56): todos os vínculos,
 * resolvidos ao vivo, com o filtro "só os que não resolvem".
 */
export class IntelImobVinculosLista extends LitElement {
  static styles = [estiloPrimitivo];
  @state() private itens: Resolvido[] | null = null;
  @state() private soQuebrados = false;
  @state() private erro = '';

  connectedCallback() {
    super.connectedCallback();
    this.carregar();
  }

  private async carregar() {
    try {
      const r = await uv().api('/vinculos-nucleo?por_pagina=100');
      this.itens = await Promise.all(r.dados.map(resolverVinculo));
      this.erro = '';
    } catch (e) {
      this.erro = mensagemDeErro(e);
    }
  }

  private async remover(v: any) {
    if (!(await uv().confirmar({ titulo: 'Remover vínculo', mensagem: 'O vínculo vai para a lixeira; o registro do núcleo não muda.', rotuloConfirmar: 'Remover', perigo: true }))) return;
    try {
      await uv().api(`/vinculos-nucleo/${v.id}/remover`, patch({}));
      nucleo().limpar();
      await this.carregar();
    } catch (e) {
      this.erro = mensagemDeErro(e);
    }
  }

  render() {
    if (this.erro) return html`<urbi-banner variante="erro">${this.erro}</urbi-banner>`;
    if (!this.itens) return html`<urbi-loading></urbi-loading>`;
    const linhas = this.itens.filter((i) => !this.soQuebrados || i.estado !== 'resolve');
    const quebrados = this.itens.filter((i) => i.estado !== 'resolve').length;
    const colunas: UrbiColunaTabela[] = [
      { id: 'objeto', label: 'Objeto da app', render: (l: any) => html`<a href=${uv().href(`/cadastro/${OBJETOS[l.vinculo.objeto_tipo as ObjetoTipo]?.cadastro}/${l.vinculo.objeto_id}`)}>${OBJETOS[l.vinculo.objeto_tipo as ObjetoTipo]?.rotulo ?? l.vinculo.objeto_tipo} #${l.vinculo.objeto_id}</a>` },
      { id: 'nucleo', label: 'No núcleo', valor: (l: any) => l.titulo },
      { id: 'estado', label: 'Estado', largura: '190px', render: (l: any) => (l.estado === 'resolve' ? html`<urbi-badge cor="sucesso">resolve</urbi-badge>` : html`<urbi-badge cor=${l.estado === 'sem_permissao' ? 'alerta' : 'erro'}>${ROTULO_ESTADO[l.estado as EstadoNucleo]}</urbi-badge>`) },
      { id: 'quando', label: 'Vinculado em', largura: '140px', valor: (l: any) => formatar({ tipo: 'datahora' }, l.vinculo.vinculado_em) },
      ...(temPapel('curador') ? [{ id: 'acoes', label: '', largura: '120px', semRotuloMobile: true, render: (l: any) => html`<urbi-botao variante="texto" pequeno icone="fa-solid fa-link-slash" @click=${() => this.remover(l.vinculo)}>Remover</urbi-botao>` }] : []),
    ];
    return html`<urbi-hospedeiro><urbi-stack>
      ${this.itens.find((i) => i.estado === 'sem_permissao') ? html`<urbi-banner variante="alerta">O admin da instância precisa ligar a leitura do imobiliário na aba Núcleo da app.</urbi-banner>` : nothing}
      <urbi-linha justificar="entre" quebrar>
        <urbi-prosa papel="dica">Cada vínculo é lido agora no núcleo; nada é copiado. ${quebrados ? `${quebrados} não resolve${quebrados > 1 ? 'm' : ''}.` : ''} Para vincular, abra a ficha do contorno ou do lançamento.</urbi-prosa>
        <urbi-checkbox label="Só os que não resolvem" .marcado=${this.soQuebrados} @urbi:checkbox-change=${(e: CustomEvent) => (this.soQuebrados = e.detail.marcado)}></urbi-checkbox>
      </urbi-linha>
      <urbi-tabela responsivo="multiline" .colunas=${colunas} .linhas=${linhas} mensagem-vazio=${this.soQuebrados ? 'Todos os vínculos resolvem.' : 'Nenhum vínculo com o núcleo.'}></urbi-tabela>
    </urbi-stack></urbi-hospedeiro>`;
  }
}
definir('intel-imob-vinculos-lista', IntelImobVinculosLista);
