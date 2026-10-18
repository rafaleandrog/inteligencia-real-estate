import { LitElement, html, nothing, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { UrbiColunaTabela } from '@urbiverso/sdk';
import { definir } from '../registro';
import { estiloPrimitivo } from '../estilos';
import { mensagemDeErro, temPapel, uv } from '../api';
import '../componentes/como-ler';
import '../componentes/importar';

type Linha = Record<string, any>;

const nf = (d = 1) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d });
const pp = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${nf(1).format(v)}%`);
const ABAS = [
  { id: 'perfil', label: 'Perfil territorial', icone: 'fa-solid fa-city' },
  { id: 'ranking', label: 'Ranking', icone: 'fa-solid fa-ranking-star' },
  { id: 'comparar', label: 'Comparar', icone: 'fa-solid fa-code-compare' },
  { id: 'dispersao', label: 'Dispersão', icone: 'fa-solid fa-chart-line' },
  { id: 'base', label: 'Base de dados', icone: 'fa-solid fa-database' },
];

/** Um cartão de indicador com o tipo de gráfico do catálogo do site (coluna, pizza, barras). */
function cartao(c: Linha, aoDetalhar: (chave: string) => void): TemplateResult {
  const cap = c.viz?.cap ?? 8;
  let serie = (c.serie ?? []) as Linha[];
  if (c.viz?.yesOnly) serie = serie.filter((v) => /· Sim$/.test(v.label) || v.label === 'Sim');
  const publicadas = serie.filter((v) => v.pct !== null).slice(0, cap);
  const suprimidas = serie.filter((v) => v.pct === null);
  const pizza = c.viz?.kind === 'donut' || c.viz?.kind === 'pie';
  const corpo = c.grupos
    ? html`${c.grupos.map((g: Linha) => html`<urbi-prosa papel="dica">${g.group}</urbi-prosa>
        <urbi-grafico-colunas .categorias=${g.items.slice(0, cap).map((i: Linha) => i.label)} .series=${[{ rotulo: '%', valores: g.items.slice(0, cap).map((i: Linha) => i.pct) }]} altura="160px" legenda="nunca"></urbi-grafico-colunas>`)}`
    : pizza
      ? html`<urbi-grafico-pizza .categorias=${publicadas.map((v) => v.label)} .series=${[{ rotulo: c.unidade, valores: publicadas.map((v) => v.pct) }]} altura="200px"></urbi-grafico-pizza>`
      : html`<urbi-grafico-colunas .categorias=${publicadas.map((v) => v.label)} .series=${[{ rotulo: c.unidade, valores: publicadas.map((v) => v.pct) }]} altura="200px" legenda="nunca"></urbi-grafico-colunas>`;
  return html`<urbi-card titulo=${c.rotulo}>
    <urbi-stack>
      ${corpo}
      <urbi-prosa papel="dica">${c.unidade}${serie.length > cap ? ` · +${serie.length - cap} no detalhe` : ''}${suprimidas.length ? ` · ${suprimidas.length} categoria(s) suprimida(s) pela fonte` : ''}</urbi-prosa>
      ${c.cautela ? html`<urbi-banner variante="alerta">Coeficiente de variação alto: leia com cautela.</urbi-banner>` : nothing}
      <urbi-linha><urbi-botao variante="texto" pequeno icone="fa-solid fa-table" @click=${() => aoDetalhar(c.chave)}>Ver a figura</urbi-botao></urbi-linha>
    </urbi-stack>
  </urbi-card>`;
}

/** Diagnóstico (spec 10.4): perfil, ranking, comparar, dispersão e base de dados, pelo motor da PDAD do site. */
export class IntelImobDiagnostico extends LitElement {
  static styles = [estiloPrimitivo];
  @property() sub = '/diagnostico';
  @state() private anos: Linha[] = [];
  @state() private catalogo: Linha | null = null;
  @state() private ano = 0;
  @state() private localidade = 'todas';
  @state() private tema = '';
  @state() private dados: Linha | null = null;
  @state() private detalhe: Linha | null = null;
  @state() private indicadorRanking = 'deed';
  @state() private comparados: string[] = [];
  @state() private kit = 'imob';
  @state() private leitura = 'vert_loc';
  @state() private erro = '';
  @state() private importando = '';

  private get aba(): string {
    return this.sub.split('?')[0].split('/')[2] || 'perfil';
  }

  connectedCallback() {
    super.connectedCallback();
    this.iniciar();
  }

  updated(m: Map<string, unknown>) {
    if (m.has('sub') && m.get('sub') !== undefined) this.carregar();
  }

  private async iniciar() {
    try {
      const [anos, catalogo] = await Promise.all([uv().api('/diagnostico/anos'), uv().api('/diagnostico/catalogo')]);
      this.anos = anos.dados;
      this.catalogo = catalogo;
      const melhor = [...this.anos].sort((a, b) => b.cobertura - a.cobertura || b.ano - a.ano)[0];
      this.ano = melhor?.ano ?? 0;
      this.comparados = (melhor?.localidades ?? []).slice(0, 3).map((l: Linha) => l.codigo);
      await this.carregar();
    } catch (e) {
      this.erro = mensagemDeErro(e);
    }
  }

  private async carregar() {
    if (this.aba === 'base') {
      this.dados = await uv().api('/diagnostico/base').catch((e: unknown) => ((this.erro = mensagemDeErro(e)), null));
      return;
    }
    if (!this.ano) return;
    const q = (o: Record<string, string>) => new URLSearchParams({ ano: String(this.ano), ...o }).toString();
    try {
      this.erro = '';
      if (this.aba === 'perfil') this.dados = await uv().api(`/diagnostico/perfil?${q({ localidade: this.localidade, ...(this.tema ? { tema: this.tema } : {}) })}`);
      else if (this.aba === 'ranking') this.dados = await uv().api(`/diagnostico/ranking?${q({ indicador: this.indicadorRanking })}`);
      else if (this.aba === 'comparar') this.dados = this.comparados.length >= 2 ? await uv().api(`/diagnostico/comparar?${q({ localidades: this.comparados.join(','), kit: this.kit })}`) : null;
      else if (this.aba === 'dispersao') this.dados = await uv().api(`/diagnostico/dispersao?${q({ leitura: this.leitura })}`);
    } catch (e) {
      this.erro = mensagemDeErro(e);
    }
  }

  private async detalhar(chave: string) {
    if (this.localidade === 'todas') {
      await uv().alertar({ tipo: 'info', titulo: 'Escolha uma localidade', mensagem: 'A figura de origem é por localidade: escolha uma para ver as linhas publicadas.' });
      return;
    }
    this.detalhe = await uv().api(`/diagnostico/perfil/detalhe?ano=${this.ano}&localidade=${this.localidade}&indicador=${chave}`);
  }

  private localidadesDoAno(): Linha[] {
    return this.anos.find((a) => a.ano === this.ano)?.localidades ?? [];
  }

  private seletorAno(): TemplateResult {
    return html`<urbi-select label="Ano" .valor=${String(this.ano)} .opcoes=${this.anos.map((a) => ({ valor: String(a.ano), rotulo: `${a.ano} (${a.cobertura} localidade${a.cobertura === 1 ? '' : 's'})` }))}
      @urbi:select-change=${(e: CustomEvent) => { this.ano = Number(e.detail.valor); this.carregar(); }}></urbi-select>`;
  }

  private perfil(): TemplateResult {
    const d = this.dados;
    const temas = Object.entries((this.catalogo?.temas ?? {}) as Record<string, string>);
    return html`<urbi-stack>
      <urbi-linha quebrar>
        ${this.seletorAno()}
        <urbi-select label="Localidade" pesquisavel .valor=${this.localidade} .opcoes=${[{ valor: 'todas', rotulo: 'Todas (média entre localidades)' }, ...this.localidadesDoAno().map((l) => ({ valor: l.codigo, rotulo: l.nome }))]}
          @urbi:select-change=${(e: CustomEvent) => { this.localidade = e.detail.valor; this.carregar(); }}></urbi-select>
        <urbi-select label="Tema" .valor=${this.tema} .opcoes=${[{ valor: '', rotulo: 'Todos' }, ...temas.map(([valor, rotulo]) => ({ valor, rotulo }))]}
          @urbi:select-change=${(e: CustomEvent) => { this.tema = e.detail.valor ?? ''; this.carregar(); }}></urbi-select>
      </urbi-linha>
      ${this.localidadesDoAno().length < 2 && this.ano ? html`<urbi-banner variante="info">${this.ano} publica só ${this.localidadesDoAno().map((l) => l.nome).join(', ')}.</urbi-banner>` : nothing}
      ${d?.kpis ? html`<urbi-grid min="160px">
        <urbi-kpi rotulo="População" .valor=${d.kpis.population}></urbi-kpi>
        <urbi-kpi rotulo="Domicílios ocupados" .valor=${d.kpis.households}></urbi-kpi>
        <urbi-kpi rotulo="Moradores por domicílio" formato="texto" .valor=${d.kpis.avgHouseholdSize === null ? '—' : nf(2).format(d.kpis.avgHouseholdSize)}></urbi-kpi>
        <urbi-kpi rotulo="Localidades no recorte" .valor=${d.kpis.raCount}></urbi-kpi>
      </urbi-grid>` : nothing}
      ${d?.perfil_imobiliario ? html`<urbi-card titulo="Perfil imobiliário" icone="fa-solid fa-house">
        <urbi-grid min="180px">${d.perfil_imobiliario.map((i: Linha) => html`<urbi-stack>
          <urbi-kpi rotulo=${i.label} formato="texto" .valor=${i.status === 'published' ? pp(i.value) : i.status === 'suppressed' ? 'suprimido' : 'não publicado'}></urbi-kpi>
          <urbi-prosa papel="dica">${i.deltaPp === null ? i.hint : `${i.deltaPp > 0 ? '+' : ''}${nf(1).format(i.deltaPp)} p.p. contra a mediana (${pp(i.reference.median)}, n = ${i.reference.n})${i.rank ? ` · ${i.rank.position}º de ${i.rank.total}` : ''}`}</urbi-prosa>
        </urbi-stack>`)}</urbi-grid>
      </urbi-card>` : nothing}
      <urbi-grid min="320px">${(d?.cartoes ?? []).map((c: Linha) => cartao(c, (k) => this.detalhar(k)))}</urbi-grid>
      ${d && !(d.cartoes ?? []).length ? html`<urbi-prosa papel="dica">Sem indicador publicado neste recorte.</urbi-prosa>` : nothing}
    </urbi-stack>`;
  }

  private ranking(): TemplateResult {
    const d = this.dados;
    const itens = (this.catalogo?.ranking ?? []) as Linha[];
    const colunas: UrbiColunaTabela[] = [
      { id: 'posicao', label: '#', largura: '50px', alinhamento: 'direita', valor: (l: any) => String(l.posicao) },
      { id: 'nome', label: 'Localidade' },
      { id: 'valor', label: 'Valor', alinhamento: 'direita', largura: '140px', valor: (l: any) => (d?.indicador?.unit === 'pct' ? pp(l.valor) : nf(2).format(l.valor)) },
    ];
    return html`<urbi-stack>
      <urbi-linha quebrar>
        ${this.seletorAno()}
        <urbi-select label="Indicador" .valor=${this.indicadorRanking} .opcoes=${itens.map((i) => ({ valor: i.id, rotulo: `${i.label} (${i.tema})` }))}
          @urbi:select-change=${(e: CustomEvent) => { this.indicadorRanking = e.detail.valor; this.carregar(); }}></urbi-select>
      </urbi-linha>
      ${d?.indicador ? html`<urbi-prosa papel="dica">${d.indicador.formula ?? (d.indicador.category ? `% "${d.indicador.category}" em ${d.indicador.key}` : d.indicador.attr)} · fonte: ${d.indicador.source ?? 'PDAD (IPEDF)'} · n = ${d.n}</urbi-prosa>` : nothing}
      ${(d?.ressalvas ?? []).map((r: string) => html`<urbi-banner variante="alerta">${r}</urbi-banner>`)}
      <urbi-tabela responsivo="multiline" .colunas=${colunas} .linhas=${d?.dados ?? []} mensagem-vazio="Sem valor publicado neste ano."></urbi-tabela>
      ${d?.sem_valor?.length ? html`<urbi-prosa papel="dica">Sem valor: ${d.sem_valor.join(', ')}.</urbi-prosa>` : nothing}
    </urbi-stack>`;
  }

  private comparar(): TemplateResult {
    const d = this.dados;
    const kits = Object.entries((this.catalogo?.kits ?? {}) as Record<string, Linha>);
    return html`<urbi-stack>
      <urbi-linha quebrar>
        ${this.seletorAno()}
        <urbi-chips-atalho .opcoes=${kits.map(([id, k]) => ({ id, rotulo: k.label }))} ativo=${this.kit} @urbi:chip-atalho:click=${(e: CustomEvent) => { this.kit = e.detail.id; this.carregar(); }}></urbi-chips-atalho>
      </urbi-linha>
      <urbi-grid min="140px">${this.localidadesDoAno().map((l) => html`<urbi-checkbox label=${l.nome} .marcado=${this.comparados.includes(l.codigo)}
        @urbi:checkbox-change=${(e: CustomEvent) => {
          const sel = e.detail.marcado ? [...this.comparados, l.codigo] : this.comparados.filter((c) => c !== l.codigo);
          this.comparados = sel.slice(0, 6);
          this.carregar();
        }}></urbi-checkbox>`)}</urbi-grid>
      <urbi-prosa papel="dica">Escolha de 2 a 6 localidades.</urbi-prosa>
      ${d?.indicadores ? html`<urbi-grid min="360px">${d.indicadores.map((ind: Linha) => {
        const rotulos = [...new Set(Object.values(ind.por_localidade as Record<string, Linha[]>).flatMap((s) => s.map((v) => v.label)))].slice(0, 6);
        return html`<urbi-card titulo=${ind.rotulo}><urbi-grafico-colunas .categorias=${rotulos}
          .series=${d.localidades.map((l: Linha) => ({ rotulo: l.nome, valores: rotulos.map((r) => (ind.por_localidade[l.codigo] ?? []).find((v: Linha) => v.label === r)?.pct ?? null) }))} altura="220px"></urbi-grafico-colunas></urbi-card>`;
      })}</urbi-grid>` : nothing}
    </urbi-stack>`;
  }

  private dispersao(): TemplateResult {
    const d = this.dados;
    const leituras = (this.catalogo?.dispersao ?? []) as Linha[];
    const colunas: UrbiColunaTabela[] = [
      { id: 'nome', label: 'Localidade' },
      { id: 'x', label: d?.x ?? 'x', alinhamento: 'direita', valor: (p: any) => nf(1).format(p.x) },
      { id: 'y', label: d?.y ?? 'y', alinhamento: 'direita', valor: (p: any) => nf(1).format(p.y) },
    ];
    return html`<urbi-stack>
      <urbi-linha quebrar>
        ${this.seletorAno()}
        <urbi-select label="Leitura" .valor=${this.leitura} .opcoes=${leituras.map((l) => ({ valor: l.id, rotulo: l.label }))}
          @urbi:select-change=${(e: CustomEvent) => { this.leitura = e.detail.valor; this.carregar(); }}></urbi-select>
      </urbi-linha>
      ${d?.texto ? html`<urbi-prosa>${d.texto}</urbi-prosa>` : nothing}
      ${d ? html`<urbi-prosa papel="dica">n = ${d.n}${d.pearson === null ? '' : ` · correlação de Pearson ${nf(2).format(d.pearson)} (descritiva, não causal)`}</urbi-prosa>` : nothing}
      <urbi-tabela responsivo="multiline" .colunas=${colunas} .linhas=${d?.pontos ?? []} mensagem-vazio="Sem localidade com os dois eixos publicados."></urbi-tabela>
      ${d?.sem_valor?.length ? html`<urbi-prosa papel="dica">Fora do gráfico (falta um eixo): ${d.sem_valor.join(', ')}.</urbi-prosa>` : nothing}
    </urbi-stack>`;
  }

  private base(): TemplateResult {
    const d = this.dados;
    const colunas: UrbiColunaTabela[] = [
      { id: 'rotulo', label: 'Fonte' },
      { id: 'linhas', label: 'Linhas', alinhamento: 'direita', largura: '90px', valor: (l: any) => nf(0).format(l.linhas) },
      { id: 'ultima', label: 'Última importação', largura: '170px', valor: (l: any) => (l.ultima_importacao ? new Date(l.ultima_importacao.aplicada_em).toLocaleDateString('pt-BR') : '—') },
      { id: 'achados', label: 'Achados abertos', alinhamento: 'direita', largura: '120px', valor: (l: any) => String(l.achados_abertos) },
      { id: 'metodo', label: 'Método' },
    ];
    return html`<urbi-stack>
      <urbi-tabela responsivo="multiline" .colunas=${colunas} .linhas=${d?.fontes ?? []}></urbi-tabela>
      ${d ? html`<urbi-prosa papel="dica">${d.achados_abertos} achado(s) de qualidade em aberto — <a href=${uv().href('/operacao/qualidade')}>Operação › Qualidade</a>. Conjuntos públicos (IBGE, Ipea, GeoPortal) entram na fase de dados públicos.</urbi-prosa>` : nothing}
      ${temPapel('operador') ? html`<urbi-linha>
        <urbi-botao variante="secundario" icone="fa-solid fa-file-import" @click=${() => (this.importando = 'pdad_observacoes')}>Importar PDAD</urbi-botao>
        <urbi-botao variante="secundario" icone="fa-solid fa-file-import" @click=${() => (this.importando = 'pdad_figuras')}>Importar mapa de figuras</urbi-botao>
      </urbi-linha>` : nothing}
    </urbi-stack>`;
  }

  render() {
    const aba = this.aba;
    const corpo = !this.anos.length && aba !== 'base' && this.catalogo
      ? html`<urbi-banner variante="info">Nenhuma PDAD importada. Importe a aba PDAD_A_DATA (Base de dados › Importar PDAD).</urbi-banner>`
      : aba === 'ranking' ? this.ranking() : aba === 'comparar' ? this.comparar() : aba === 'dispersao' ? this.dispersao() : aba === 'base' ? this.base() : this.perfil();
    const det = this.detalhe;
    return html`
      <urbi-shell-page titulo="Diagnóstico" dashboard>
        <intel-imob-como-ler slot="actions" tela="diagnostico"></intel-imob-como-ler>
        <urbi-abas .abas=${ABAS} ativa=${aba} @urbi:aba-selecionar=${(e: CustomEvent) => uv().navegarSub(e.detail.id === 'perfil' ? '/diagnostico' : `/diagnostico/${e.detail.id}`)}>
          ${ABAS.map((a) => html`<div slot=${a.id}>${a.id === aba ? html`<urbi-stack>${this.erro ? html`<urbi-banner variante="erro">${this.erro}</urbi-banner>` : nothing}${corpo}</urbi-stack>` : nothing}</div>`)}
        </urbi-abas>
        ${det ? html`<urbi-modal title="Figura de origem" maxWidth="900px" @urbi-modal:close=${() => (this.detalhe = null)}>
          <urbi-stack>
            ${det.cabecalho.map((c: Linha) => html`<urbi-prosa papel="dica">${[c.indicatorName, c.figureNumber ? `Figura ${c.figureNumber}` : '', c.tableNumber ? `Tabela ${c.tableNumber}` : '', c.universe, c.notes].filter(Boolean).join(' · ')}</urbi-prosa>`)}
            <urbi-tabela responsivo="multiline" .colunas=${[
              { id: 'categoryStandard', label: 'Categoria', valor: (l: any) => [l.segmentValue, l.responseCategory ?? l.categoryStandard].filter(Boolean).join(' · ') },
              { id: 'estimatePct', label: '%', alinhamento: 'direita', valor: (l: any) => pp(l.estimatePct) },
              { id: 'estimateTotal', label: 'Total', alinhamento: 'direita', valor: (l: any) => (l.estimateTotal === null ? '—' : nf(0).format(l.estimateTotal)) },
              { id: 'sourceValueStatus', label: 'Status', valor: (l: any) => ({ published: 'publicado', partial: 'parcial', suppressed: 'suprimido' } as Record<string, string>)[l.sourceValueStatus] ?? l.sourceValueStatus ?? '—' },
            ]} .linhas=${det.linhas}></urbi-tabela>
          </urbi-stack>
        </urbi-modal>` : nothing}
        ${this.importando ? html`<urbi-modal title="Importar CSV" maxWidth="860px" @urbi-modal:close=${() => { this.importando = ''; this.iniciar(); }}>
          <intel-imob-importar tabela=${this.importando} @intel-imob:importacao-aplicada=${() => { this.importando = ''; this.iniciar(); }}></intel-imob-importar>
        </urbi-modal>` : nothing}
      </urbi-shell-page>
    `;
  }
}
definir('intel-imob-diagnostico', IntelImobDiagnostico);
