import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { CampoFormulario, UrbiColunaTabela, UrbiInboxSecao } from '@urbiverso/sdk';
import { definir } from '../registro';
import { estiloPrimitivo } from '../estilos';
import { baixar, json, mensagemDeErro, patch, temPapel, uv } from '../api';
import { formatar } from '../componentes/cadastro';
import { ESTAGIOS, ESTAGIOS_DECISAO, TIPOS_AREA } from '../../comum/regras-objeto';
import '../componentes/contornos';
import '../componentes/atributos';
import '../componentes/nucleo';
import '../componentes/importar';
import '../componentes/como-ler';

export const ROTULO_ESTAGIO: Record<string, string> = {
  sinal: 'Sinal', hipotese: 'Hipótese', oportunidade: 'Oportunidade', iniciativa: 'Iniciativa', projeto: 'Projeto', negocio_ativo: 'Negócio / ativo', encerrada: 'Encerrada',
};
export const ROTULO_TIPO_AREA: Record<string, string> = { propria: 'Própria', prospeccao: 'Prospecção', referencia: 'Referência' };

/** Tipos que o usuário pode escolher: área própria é do curador (5.16). */
function tiposPermitidos() {
  return TIPOS_AREA.filter((t) => t !== 'propria' || temPapel('curador')).map((t) => ({ valor: t, rotulo: ROTULO_TIPO_AREA[t] }));
}
const decide = () => temPapel('decisor');
/** Estágios que o usuário pode escolher sem decisão; o decisor vê a escada inteira. */
function estagiosPermitidos(atual: string | null) {
  return ESTAGIOS.filter((e) => decide() || !ESTAGIOS_DECISAO.includes(e) || e === atual).map((e) => ({ valor: e, rotulo: ROTULO_ESTAGIO[e] }));
}

const COLUNAS_HISTORICO: UrbiColunaTabela[] = [
  { id: 'em', label: 'Quando', largura: '140px', valor: (l: any) => formatar({ tipo: 'datahora' }, l.em) },
  { id: 'acao', label: 'Ação', largura: '110px' },
  { id: 'autor_nome', label: 'Quem', largura: '160px', valor: (l: any) => l.autor_nome ?? `#${l.autor_id}` },
  { id: 'campos', label: 'O que mudou', valor: (l: any) => [l.campos ? Object.entries(l.campos).map(([k, d]: [string, any]) => `${k}: ${formatar({ tipo: 'texto' }, d.antes)} → ${formatar({ tipo: 'texto' }, d.depois)}`).join('; ') : '', l.motivo ? `motivo: ${l.motivo}` : ''].filter(Boolean).join(' · ') },
];

/** Ficha da área (10.10 na 15.1b): mapa, campos, estágio, Núcleo, Atributos e histórico. */
export class IntelImobEstudoFicha extends LitElement {
  static styles = [estiloPrimitivo];
  @property({ type: Number }) areaId = 0;
  @state() private area: any = null;
  @state() private historico: any[] = [];
  @state() private erro = '';

  connectedCallback() {
    super.connectedCallback();
    this.carregar();
  }

  updated(m: Map<string, unknown>) {
    if (m.has('areaId') && m.get('areaId') !== undefined) this.carregar();
  }

  private async carregar() {
    try {
      this.area = await uv().api(`/estudos/${this.areaId}`);
      this.historico = (await uv().api(`/estudos/${this.areaId}/historico`)).dados;
      this.erro = '';
    } catch (e) {
      this.area = null;
      this.erro = (e as any).status === 404 ? 'Área não encontrada.' : mensagemDeErro(e);
    }
  }

  private avisar() {
    this.dispatchEvent(new CustomEvent('intel-imob:area-alterada', { bubbles: true, composed: true }));
  }

  private async salvar(corpo: Record<string, unknown>) {
    try {
      await uv().api(`/estudos/${this.areaId}`, patch({ ...corpo, versao: this.area.versao }));
      uv().notificar('Área salva.', 'sucesso');
      await this.carregar();
      this.avisar();
    } catch (e) {
      await uv().alertar({ tipo: 'erro', titulo: 'Não foi possível salvar', mensagem: [mensagemDeErro(e), ...((e as any).detalhes ?? [])].join('\n') });
      await this.carregar();
    }
  }

  private async editar() {
    const a = this.area;
    const campos: CampoFormulario[] = [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, valor: a.nome },
      { nome: 'tipo', rotulo: 'Tipo', tipo: 'selecao', obrigatorio: true, opcoes: a.tipo === 'propria' && !temPapel('curador') ? [{ valor: 'propria', rotulo: 'Própria' }] : tiposPermitidos(), valor: a.tipo },
      { nome: 'responsavel_id', rotulo: 'Responsável (id do usuário)', tipo: 'numero', valor: a.responsavel_id ?? null },
      { nome: 'notas', rotulo: 'Notas', tipo: 'texto_longo', valor: a.notas ?? '' },
      { nome: 'aprendizado', rotulo: 'O que a área ensinou', tipo: 'texto_longo', valor: a.aprendizado ?? '' },
    ];
    const v = await uv().formulario({ titulo: `Editar ${a.nome}`, campos });
    if (!v) return;
    const corpo: Record<string, unknown> = {};
    for (const k of ['nome', 'tipo', 'responsavel_id', 'notas', 'aprendizado']) {
      const novo = v[k] === '' ? null : v[k];
      if ((a[k] ?? null) !== novo) corpo[k] = novo;
    }
    if (Object.keys(corpo).length) await this.salvar(corpo);
  }

  /** Estágio: de iniciativa em diante, e encerrar, é decisão com motivo (D-130). */
  private async mudarEstagio() {
    const a = this.area;
    const v = await uv().formulario({
      titulo: 'Mudar estágio',
      campos: [
        { nome: 'estagio', rotulo: 'Estágio', tipo: 'selecao', obrigatorio: true, opcoes: estagiosPermitidos(a.estagio), valor: a.estagio },
        { nome: 'motivo', rotulo: 'Motivo (obrigatório de iniciativa em diante e para encerrar)', tipo: 'texto_longo', valor: '' },
        { nome: 'motivo_encerramento', rotulo: 'Motivo do encerramento (só ao encerrar)', tipo: 'texto', valor: a.motivo_encerramento ?? '' },
      ],
    });
    if (!v || v.estagio === a.estagio) return;
    await this.salvar({ estagio: v.estagio, motivo: v.motivo || undefined, ...(v.estagio === 'encerrada' ? { motivo_encerramento: v.motivo_encerramento || null } : {}) });
  }

  private async removerOuRestaurar() {
    const removida = Boolean(this.area.removido_em);
    if (!(await uv().confirmar({ titulo: removida ? 'Restaurar área' : 'Remover área', mensagem: removida ? 'Restaurar esta área?' : 'A área vai para a lixeira e pode ser restaurada.', rotuloConfirmar: removida ? 'Restaurar' : 'Remover', perigo: !removida }))) return;
    try {
      await uv().api(`/estudos/${this.areaId}/${removida ? 'restaurar' : 'remover'}`, patch({}));
      await this.carregar();
      this.avisar();
    } catch (e) {
      this.erro = mensagemDeErro(e);
    }
  }

  render() {
    if (this.erro) return html`<urbi-hospedeiro><urbi-banner variante="erro">${this.erro}</urbi-banner></urbi-hospedeiro>`;
    const a = this.area;
    if (!a) return html`<urbi-loading></urbi-loading>`;
    const removida = Boolean(a.removido_em);
    const pode = a.pode_editar && !removida;
    const podeDecidir = decide() && !removida;
    const campo = (rotulo: string, valor: string) => html`<urbi-stack><urbi-prosa papel="dica">${rotulo}</urbi-prosa><urbi-prosa>${valor}</urbi-prosa></urbi-stack>`;
    return html`<urbi-hospedeiro><urbi-stack>
      <urbi-linha justificar="entre" quebrar>
        <urbi-linha quebrar>
          <urbi-prosa papel="titulo">${a.nome}</urbi-prosa>
          <urbi-badge cor=${a.tipo === 'propria' ? 'alerta' : 'padrao'}>${ROTULO_TIPO_AREA[a.tipo] ?? a.tipo}</urbi-badge>
          <urbi-badge cor="info">${ROTULO_ESTAGIO[a.estagio] ?? a.estagio}</urbi-badge>
          ${removida ? html`<urbi-badge cor="erro">removida</urbi-badge>` : nothing}
        </urbi-linha>
        <urbi-linha>
          ${pode ? html`<urbi-botao variante="primario" icone="fa-solid fa-pen" @click=${this.editar}>Editar</urbi-botao>` : nothing}
          ${pode || podeDecidir ? html`<urbi-botao variante="secundario" icone="fa-solid fa-stairs" @click=${this.mudarEstagio}>Estágio</urbi-botao>` : nothing}
          ${a.pode_editar ? html`<urbi-botao variante=${removida ? 'secundario' : 'perigo'} icone=${removida ? 'fa-solid fa-rotate-left' : 'fa-solid fa-trash'} @click=${this.removerOuRestaurar}>${removida ? 'Restaurar' : 'Remover'}</urbi-botao>` : nothing}
        </urbi-linha>
      </urbi-linha>
      <urbi-card titulo="Área" icone="fa-solid fa-draw-polygon">
        <urbi-stack>
          <intel-imob-mini-mapa .geometria=${a.geometria} rotulo=${a.nome}></intel-imob-mini-mapa>
          <urbi-grid min="180px">
            ${campo('Localidade', a.localidade_nome ?? '—')}
            ${campo('Responsável', a.responsavel_nome ?? (a.responsavel_id ? `#${a.responsavel_id}` : '—'))}
            ${campo('Área (aproximada)', a.geometria_tipo === 'Point' ? 'ponto' : formatar({ tipo: 'm2' }, a.area_m2))}
            ${campo('Criada por', a.autor_nome ?? '—')}
            ${a.estagio === 'encerrada' ? campo('Motivo do encerramento', a.motivo_encerramento ?? '—') : nothing}
          </urbi-grid>
          ${a.notas ? html`<urbi-prosa>${a.notas}</urbi-prosa>` : nothing}
          ${a.aprendizado ? html`<urbi-prosa papel="dica">Aprendizado: ${a.aprendizado}</urbi-prosa>` : nothing}
        </urbi-stack>
      </urbi-card>
      <urbi-card titulo="Do núcleo imobiliário" icone="fa-solid fa-landmark">
        <urbi-stack>
          <urbi-linha><urbi-badge cor="info">cadastro oficial · lido agora</urbi-badge></urbi-linha>
          <intel-imob-nucleo-objeto tipo="area_estudo" .objetoId=${a.id} ?compacto=${removida}></intel-imob-nucleo-objeto>
        </urbi-stack>
      </urbi-card>
      <urbi-card titulo="Atributos" icone="fa-solid fa-list-check">
        <urbi-stack>
          <urbi-linha><urbi-badge cor="padrao">app</urbi-badge></urbi-linha>
          <intel-imob-atributos-objeto tipo="area_estudo" .objetoId=${a.id} ?removido=${removida} .podeEditar=${Boolean(a.pode_editar)}></intel-imob-atributos-objeto>
        </urbi-stack>
      </urbi-card>
      <urbi-prosa papel="dica">Dossiê nas quatro escalas, anéis e fichas: disponíveis numa fase seguinte (4B).</urbi-prosa>
      <urbi-card titulo="Histórico">
        <urbi-tabela responsivo="multiline" .colunas=${COLUNAS_HISTORICO} .linhas=${this.historico} mensagem-vazio="Sem alterações registradas."></urbi-tabela>
      </urbi-card>
    </urbi-stack></urbi-hospedeiro>`;
  }
}
definir('intel-imob-estudo-ficha', IntelImobEstudoFicha);

/** Nova área por desenho no `urbi-mapa`, ou por ponto. */
export class IntelImobEstudoDesenhar extends LitElement {
  @property() modo: 'desenhar-poligono' | 'desenhar-ponto' = 'desenhar-poligono';
  @state() private erro = '';

  private async concluir(e: CustomEvent) {
    const v = await uv().formulario({
      titulo: 'Nova área de estudo',
      campos: [
        { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
        { nome: 'tipo', rotulo: 'Tipo', tipo: 'selecao', obrigatorio: true, opcoes: tiposPermitidos(), valor: 'prospeccao' },
        { nome: 'notas', rotulo: 'Notas', tipo: 'texto_longo', valor: '' },
      ],
    });
    if (!v) return;
    try {
      const a = await uv().api('/estudos', json({ nome: v.nome, tipo: v.tipo, notas: v.notas || null, geometria: e.detail.geometry }));
      uv().notificar('Área criada.', 'sucesso');
      uv().navegarSub(`/estudos/${a.id}`);
    } catch (err) {
      this.erro = [mensagemDeErro(err), ...((err as any).detalhes ?? [])].join(' ');
    }
  }

  render() {
    return html`<urbi-stack>
      ${this.erro ? html`<urbi-banner variante="erro">${this.erro}</urbi-banner>` : nothing}
      <urbi-prosa papel="dica">${this.modo === 'desenhar-ponto' ? 'Clique no ponto da área.' : 'Clique para marcar os vértices e use Concluir. Esc cancela.'}</urbi-prosa>
      <urbi-mapa modo=${this.modo} mapa-base="hibrido" centro="[-15.78,-47.93]" zoom="11" altura-minima="420px"
        aria-label="Desenhar área de estudo" @urbi:mapa-geometria=${this.concluir}></urbi-mapa>
    </urbi-stack>`;
  }
}
definir('intel-imob-estudo-desenhar', IntelImobEstudoDesenhar);

/** Estudos de área (10.10, recorte da 15.1b): inbox por estágio, ficha ao lado. */
export class IntelImobEstudos extends LitElement {
  static styles = [estiloPrimitivo];
  @property() sub = '/estudos';
  @state() private areas: any[] = [];
  @state() private total = 0;
  @state() private tipo = '';
  @state() private erro = '';
  @state() private modal: '' | 'desenhar' | 'ponto' | 'kmz' | 'csv' = '';

  connectedCallback() {
    super.connectedCallback();
    this.carregar();
  }

  private get selecionada(): number {
    return Number(this.sub.split('?')[0].split('/')[2]) || 0;
  }

  private async carregar() {
    try {
      const r = await uv().api(`/estudos?por_pagina=100${this.tipo ? `&tipo=${this.tipo}` : ''}`);
      this.areas = r.dados;
      this.total = r.total;
      this.erro = '';
    } catch (e) {
      this.erro = mensagemDeErro(e);
    }
  }

  private secoes(): UrbiInboxSecao[] {
    return ESTAGIOS.map((e) => ({
      label: ROTULO_ESTAGIO[e],
      itens: this.areas.filter((a) => a.estagio === e).map((a) => ({
        id: String(a.id),
        titulo: a.nome,
        subtitulo: [ROTULO_TIPO_AREA[a.tipo], a.localidade_nome].filter(Boolean).join(' · '),
        icone: a.geometria_tipo === 'Point' ? 'fa-solid fa-location-dot' : 'fa-solid fa-draw-polygon',
      })),
    })).filter((s) => s.itens.length);
  }

  private fechar(recarregar = false) {
    this.modal = '';
    if (recarregar) this.carregar();
  }

  private modalConteudo() {
    switch (this.modal) {
      case 'desenhar':
        return html`<intel-imob-estudo-desenhar modo="desenhar-poligono"></intel-imob-estudo-desenhar>`;
      case 'ponto':
        return html`<intel-imob-estudo-desenhar modo="desenhar-ponto"></intel-imob-estudo-desenhar>`;
      case 'kmz':
        return html`<intel-imob-contornos-importar base="/estudos" .tiposArea=${tiposPermitidos()} @intel-imob:importacao-aplicada=${() => this.fechar(true)}></intel-imob-contornos-importar>`;
      case 'csv':
        return html`<urbi-stack>
          <urbi-prosa papel="dica">CSV para os demais campos e os atributos (colunas atr_&lt;codigo&gt;) de áreas pelo nome; linha nova precisa de latitude e longitude. Área própria só entra para o curador; estágio de decisão só pela tela.</urbi-prosa>
          <intel-imob-importar tabela="areas_estudo" @intel-imob:importacao-aplicada=${() => this.fechar(true)}></intel-imob-importar>
        </urbi-stack>`;
      default:
        return nothing;
    }
  }

  render() {
    const escreve = uv().contexto().nivel !== 'leitura';
    const id = this.selecionada;
    const TITULOS = { desenhar: 'Nova área por desenho', ponto: 'Nova área por ponto', kmz: 'Importar KML, KMZ ou GeoJSON', csv: 'Importar CSV de áreas' } as const;
    return html`
      <urbi-shell-page titulo="Estudos de área" dashboard>
        <intel-imob-como-ler slot="actions" tela="estudos"></intel-imob-como-ler>
        <urbi-stack>
          ${this.erro ? html`<urbi-banner variante="erro">${this.erro}</urbi-banner>` : nothing}
          <urbi-linha justificar="entre" quebrar>
            <urbi-linha quebrar>
              <urbi-select label="Tipo" .valor=${this.tipo} .opcoes=${[{ valor: '', rotulo: 'Todos' }, ...TIPOS_AREA.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_AREA[t] }))]}
                @urbi:select-change=${(e: CustomEvent) => { this.tipo = e.detail.valor ?? ''; this.carregar(); }}></urbi-select>
              <urbi-prosa papel="dica">${this.total} área${this.total === 1 ? '' : 's'}</urbi-prosa>
            </urbi-linha>
            <urbi-linha quebrar>
              ${escreve
                ? html`<urbi-botao variante="primario" icone="fa-solid fa-draw-polygon" @click=${() => (this.modal = 'desenhar')}>Nova área</urbi-botao>
                  <urbi-botao variante="secundario" icone="fa-solid fa-location-dot" @click=${() => (this.modal = 'ponto')}>Por ponto</urbi-botao>
                  <urbi-botao variante="secundario" icone="fa-solid fa-map" @click=${() => (this.modal = 'kmz')}>KML/KMZ</urbi-botao>`
                : nothing}
              ${temPapel('operador') ? html`<urbi-botao variante="secundario" icone="fa-solid fa-file-import" @click=${() => (this.modal = 'csv')}>Importar CSV</urbi-botao>` : nothing}
              <urbi-botao variante="texto" icone="fa-solid fa-download" @click=${() => baixar('/estudos?formato=csv', 'areas_estudo.csv').catch((e) => (this.erro = mensagemDeErro(e)))}>Baixar CSV</urbi-botao>
            </urbi-linha>
          </urbi-linha>
          <urbi-inbox .secoes=${this.secoes()} ativo=${id ? String(id) : ''} ?detalhe-visivel=${Boolean(id)} texto-voltar="Áreas" largura-sidebar="300px"
            @urbi:inbox-selecionar=${(e: CustomEvent) => uv().navegarSub(`/estudos/${e.detail.id}`)}
            @urbi:inbox-voltar=${() => uv().navegarSub('/estudos')}>
            ${id
              ? html`<intel-imob-estudo-ficha slot="detalhe" .areaId=${id} @intel-imob:area-alterada=${() => this.carregar()}></intel-imob-estudo-ficha>`
              : html`<urbi-hospedeiro slot="detalhe"><urbi-prosa papel="dica">${this.areas.length ? 'Escolha uma área na lista.' : 'Nenhuma área ainda. Crie por desenho, ponto ou KMZ.'}</urbi-prosa></urbi-hospedeiro>`}
          </urbi-inbox>
        </urbi-stack>
        ${this.modal
          ? html`<urbi-modal title=${TITULOS[this.modal]} maxWidth="860px" @urbi-modal:close=${() => this.fechar(true)}>${this.modalConteudo()}</urbi-modal>`
          : nothing}
      </urbi-shell-page>
    `;
  }
}
definir('intel-imob-estudos', IntelImobEstudos);
