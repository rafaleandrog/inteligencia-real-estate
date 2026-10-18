import { LitElement, html, nothing, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { UrbiColunaTabela } from '@urbiverso/sdk';
import { definir } from '../registro';
import { estiloPrimitivo } from '../estilos';
import { mensagemDeErro, temPapel, uv } from '../api';
import '../componentes/como-ler';
import '../componentes/importar';

type Linha = Record<string, any>;

const nf = (d = 0) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const pct = (v: number, d = 1) => `${nf(d).format(v * 100)}%`;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

/** Formata o valor de uma métrica do IVV pela unidade declarada no motor do site. */
function formatarMetrica(chave: string, unidade: string, v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (chave === 'ivv_pct' || unidade === 'fracao' || unidade === 'percent') return pct(v, 2);
  if (unidade === 'brl_m2') return `${brl(v)}/m²`;
  if (unidade === 'brl_milhoes' || unidade === 'brl_million') return `R$ ${nf(1).format(v)} mi`;
  if (unidade === 'm2') return `${nf(0).format(v)} m²`;
  return nf(chave.includes('offers') ? 0 : 0).format(v);
}

const NATUREZA: Record<string, string> = {
  fluxo: 'soma no período', estoque: 'média do período', preco: 'razão ponderada (valor ÷ área)', taxa: 'razão ponderada pareada', nao_somavel: 'só mês a mês',
};

const GRUPOS: { titulo: string; chaves: string[] }[] = [
  { titulo: 'Oferta', chaves: ['offers_units', 'offer_area_m2', 'vgo_brl_million'] },
  { titulo: 'Vendas', chaves: ['sales_units', 'sold_area_m2', 'vgv_brl_million', 'ivv_pct'] },
  { titulo: 'Lançamentos', chaves: ['launches_units', 'launches_developments', 'vgl_brl_million'] },
  { titulo: 'Distratos', chaves: ['cancellations_units'] },
  { titulo: 'Preços', chaves: ['asking_price_brl_m2', 'sale_price_brl_m2'] },
];
const DESTAQUES = ['sale_price_brl_m2', 'sales_units', 'ivv_pct', 'vgv_brl_million'];

const PERIODOS = [
  { id: 'month', rotulo: 'Mês' }, { id: 'ytd', rotulo: 'No ano' }, { id: 'last_12', rotulo: '12 meses' }, { id: 'year', rotulo: 'Ano civil' }, { id: 'all', rotulo: 'Tudo' },
];
const COMPARACOES = [{ id: 'nenhum', rotulo: 'Sem comparação' }, { id: 'anterior', rotulo: 'Período anterior' }, { id: 'ano_anterior', rotulo: 'Ano anterior' }];
const FAIXAS = ['TOTAL', '1Q', '2Q', '3Q', '4+Q'];

/** Mercado (spec 10.3, itens 1 a 6 no MVP): IVV do período, derivados, gráficos e IVV por localidade. */
export class IntelImobMercado extends LitElement {
  static styles = [estiloPrimitivo];
  @property() sub = '/mercado';
  @state() private serie: Linha | null = null;
  @state() private periodo: Linha | null = null;
  @state() private sazonal: Linha | null = null;
  @state() private regional: Linha | null = null;
  @state() private modo = 'ytd';
  @state() private comparar = 'nenhum';
  @state() private referencia = '';
  @state() private faixa = 'TOTAL';
  @state() private erro = '';
  @state() private importando = '';

  connectedCallback() {
    super.connectedCallback();
    this.carregarTudo();
  }

  private async carregarTudo() {
    try {
      const [serie, sazonal, regional] = await Promise.all([
        uv().api('/mercado/ivv'),
        uv().api('/mercado/ivv/sazonalidade?metrica=ivv_pct'),
        uv().api(`/mercado/ivv-regional?faixa_quartos=${encodeURIComponent(this.faixa)}`),
      ]);
      this.serie = serie;
      this.sazonal = sazonal;
      this.regional = regional;
      this.referencia ||= serie.meses.at(-1)?.mes ?? '';
      await this.carregarPeriodo();
    } catch (e) {
      this.erro = mensagemDeErro(e);
    }
  }

  private async carregarPeriodo() {
    if (!this.referencia) return;
    const [ano, mes] = this.referencia.split('-');
    this.periodo = await uv().api(`/mercado/ivv/periodo?modo=${this.modo}&ano=${ano}&mes=${Number(mes)}&comparar=${this.comparar}`);
  }

  private async carregarRegional() {
    this.regional = await uv().api(`/mercado/ivv-regional?faixa_quartos=${encodeURIComponent(this.faixa)}`);
  }

  private meta(chave: string): Linha {
    return this.serie?.metricas.find((m: Linha) => m.chave === chave) ?? { chave, rotulo: chave, unidade: '', natureza: '' };
  }

  private valor(bloco: Linha | null | undefined, chave: string): number | null {
    const v = bloco?.valores?.[chave]?.value;
    return v === undefined ? null : v;
  }

  private kpi(chave: string, destaque = false): TemplateResult {
    const m = this.meta(chave);
    const atual = this.valor(this.periodo?.atual, chave);
    const comp = this.periodo?.comparacao ? this.valor(this.periodo.comparacao, chave) : null;
    const variacao = atual !== null && comp !== null && comp !== 0 ? (chave === 'ivv_pct' ? `${nf(2).format((atual - comp) * 100)} p.p.` : pct((atual - comp) / Math.abs(comp))) : null;
    return html`<urbi-stack>
      <urbi-kpi rotulo=${m.rotulo} formato="texto" .valor=${formatarMetrica(chave, m.unidade, atual)} variante=${destaque ? '' : ''}></urbi-kpi>
      ${variacao ? html`<urbi-prosa papel="dica">${variacao} contra ${this.periodo!.comparacao.inicio}${this.periodo!.comparacao.fim !== this.periodo!.comparacao.inicio ? `–${this.periodo!.comparacao.fim}` : ''}</urbi-prosa>` : nothing}
      ${!destaque ? html`<urbi-prosa papel="dica">${NATUREZA[m.natureza] ?? m.natureza}</urbi-prosa>` : nothing}
    </urbi-stack>`;
  }

  /** Os meses dos gráficos: o período, ou 12 meses até a referência quando o período é um mês só. */
  private mesesGrafico(): Linha[] {
    const todos = (this.serie?.meses ?? []) as Linha[];
    const ini = this.periodo?.atual?.inicio;
    const fim = this.periodo?.atual?.fim;
    if (!ini || !fim) return todos.slice(-12);
    const recorte = todos.filter((m) => m.mes >= ini && m.mes <= fim);
    if (recorte.length > 1) return recorte;
    const i = todos.findIndex((m) => m.mes === fim);
    return todos.slice(Math.max(0, i - 11), i + 1);
  }

  private graficos(): TemplateResult {
    const meses = this.mesesGrafico();
    const cats = meses.map((m) => rotuloMes(m.mes));
    const s = (chave: string, f = (v: number) => v) => meses.map((m) => (m.valores[chave] === null || m.valores[chave] === undefined ? null : f(m.valores[chave])));
    const distrato = meses.map((m) => (m.valores.cancellations_units !== null && m.valores.sales_units ? (m.valores.cancellations_units / m.valores.sales_units) * 100 : null));
    const anos = Object.entries(this.sazonal?.anos ?? {}) as [string, (number | null)[]][];
    return html`<urbi-grid min="360px">
      <urbi-card titulo="Velocidade de vendas (IVV)"><urbi-grafico-area .categorias=${cats} .series=${[{ rotulo: 'IVV', valores: s('ivv_pct', (v) => v * 100) }]} formato="porcentagem" altura="220px"></urbi-grafico-area></urbi-card>
      <urbi-card titulo="Preço pedido × preço de venda (R$/m²)"><urbi-grafico-linha .categorias=${cats} .series=${[{ rotulo: 'Pedido', valores: s('asking_price_brl_m2') }, { rotulo: 'Venda', valores: s('sale_price_brl_m2') }]} formato="moeda" altura="220px"></urbi-grafico-linha></urbi-card>
      <urbi-card titulo="Vendas e lançamentos (unidades)"><urbi-grafico-colunas .categorias=${cats} .series=${[{ rotulo: 'Vendas', valores: s('sales_units') }, { rotulo: 'Lançamentos', valores: s('launches_units') }]} altura="220px"></urbi-grafico-colunas></urbi-card>
      <urbi-card titulo="Unidades em oferta"><urbi-grafico-area .categorias=${cats} .series=${[{ rotulo: 'Oferta', valores: s('offers_units') }]} altura="220px"></urbi-grafico-area></urbi-card>
      <urbi-card titulo="VGV por mês (R$ milhões)"><urbi-grafico-colunas .categorias=${cats} .series=${[{ rotulo: 'VGV', valores: s('vgv_brl_million') }]} altura="220px"></urbi-grafico-colunas></urbi-card>
      <urbi-card titulo="Distratos sobre vendas"><urbi-grafico-linha .categorias=${cats} .series=${[{ rotulo: 'Distratos ÷ vendas', valores: distrato }]} formato="porcentagem" altura="220px"></urbi-grafico-linha>
        <urbi-prosa papel="dica">Só gráfico: razão do mês, nunca somada.</urbi-prosa></urbi-card>
      <urbi-card titulo="IVV por mês do ano"><urbi-grafico-linha .categorias=${MESES} .series=${anos.map(([a, v]) => ({ rotulo: a, valores: v.map((x) => (x === null ? null : x * 100)) }))} formato="porcentagem" altura="220px" .marcadores=${true}></urbi-grafico-linha></urbi-card>
    </urbi-grid>`;
  }

  private regionalBloco(): TemplateResult {
    const r = this.regional;
    if (!r || !r.mes) return html`<urbi-prosa papel="dica">Sem IVV por localidade importado. Importe a aba IVV_REGION em "Importar CSV".</urbi-prosa>`;
    const colunas: UrbiColunaTabela[] = [
      { id: 'region', label: 'Localidade' },
      { id: 'offeredUnits', label: 'Ofertadas', alinhamento: 'direita', largura: '100px', valor: (l: any) => (l.offeredUnits ?? '—').toString() },
      { id: 'soldUnits', label: 'Vendidas', alinhamento: 'direita', largura: '100px', valor: (l: any) => (l.soldUnits ?? '—').toString() },
      { id: 'ivvPct', label: 'IVV', alinhamento: 'direita', largura: '90px', valor: (l: any) => `${nf(1).format(l.ivvPct)}%` },
      { id: 'salePriceM2', label: 'Venda R$/m²', alinhamento: 'direita', largura: '130px', valor: (l: any) => (l.salePriceM2 ? brl(l.salePriceM2) : '—') },
      { id: 'gap', label: 'Gap pedido/venda', alinhamento: 'direita', largura: '140px', valor: (l: any) => (l.offerPriceM2 && l.salePriceM2 ? `${nf(1).format(((l.offerPriceM2 - l.salePriceM2) / l.offerPriceM2) * 100)}%` : '—') },
    ];
    const faixas = r.faixas as string[];
    return html`<urbi-stack>
      <urbi-linha quebrar>
        <urbi-chips-atalho .opcoes=${FAIXAS.filter((f) => faixas.includes(f)).map((f) => ({ id: f, rotulo: f === 'TOTAL' ? 'Todas as faixas' : f }))} ativo=${this.faixa}
          @urbi:chip-atalho:click=${(e: CustomEvent) => { this.faixa = e.detail.id; this.carregarRegional(); }}></urbi-chips-atalho>
        <urbi-prosa papel="dica">Retrato de ${rotuloMes(r.mes)}.</urbi-prosa>
      </urbi-linha>
      ${r.referencia ? html`<urbi-banner variante="info">Régua do DF: IVV ${nf(1).format(r.referencia.ivvPct)}%${r.referencia.salePriceM2 ? ` · venda ${brl(r.referencia.salePriceM2)}/m²` : ''}. Não entra no ranking nem em soma.</urbi-banner>` : nothing}
      <urbi-tabela responsivo="multiline" .colunas=${colunas} .linhas=${r.ranking}></urbi-tabela>
      ${r.sem_valor.length ? html`<urbi-prosa papel="dica">Sem IVV publicado nesta faixa: ${r.sem_valor.join(', ')}.</urbi-prosa>` : nothing}
      <urbi-card titulo="IVV por localidade e faixa de quartos (%)">
        <urbi-mapa-de-calor .linhas=${r.mapa_calor.map((l: Linha) => l.regiao)} .colunas=${faixas} .matriz=${r.mapa_calor.map((l: Linha) => faixas.map((f) => l.valores[f]))} .mostrarValores=${true}></urbi-mapa-de-calor>
      </urbi-card>
      <urbi-grid min="300px">
        ${r.leituras.map((l: Linha) => html`<urbi-card titulo=${l.rotulo}>
          <urbi-tabela responsivo="multiline" .colunas=${[
            { id: 'region', label: 'Localidade' },
            { id: 'x', label: l.xLabel, alinhamento: 'direita', valor: (p: any) => nf(1).format(p.x) },
            { id: 'y', label: l.yLabel, alinhamento: 'direita', valor: (p: any) => nf(1).format(p.y) },
          ]} .linhas=${l.pontos}></urbi-tabela>
          ${l.referencia ? html`<urbi-prosa papel="dica">DF: ${nf(1).format(l.referencia.x)} × ${nf(1).format(l.referencia.y)}</urbi-prosa>` : nothing}
        </urbi-card>`)}
      </urbi-grid>
    </urbi-stack>`;
  }

  render() {
    const meses = (this.serie?.meses ?? []) as Linha[];
    const a = this.periodo?.atual;
    return html`
      <urbi-shell-page titulo="Mercado" dashboard>
        <intel-imob-como-ler slot="actions" tela="mercado"></intel-imob-como-ler>
        <urbi-stack>
          ${this.erro ? html`<urbi-banner variante="erro">${this.erro}</urbi-banner>` : nothing}
          ${temPapel('operador')
            ? html`<urbi-linha>
                <urbi-botao variante="secundario" icone="fa-solid fa-file-import" @click=${() => (this.importando = 'ivv_mensal')}>Importar IVV mensal</urbi-botao>
                <urbi-botao variante="secundario" icone="fa-solid fa-file-import" @click=${() => (this.importando = 'ivv_regional')}>Importar IVV por localidade</urbi-botao>
              </urbi-linha>`
            : nothing}
          ${!meses.length && this.serie
            ? html`<urbi-banner variante="info">Sem IVV importado. Importe a aba IVV_MONTHLY (Operação › Importações ou o botão acima).</urbi-banner>`
            : html`
              <urbi-card titulo="Período" icone="fa-solid fa-calendar">
                <urbi-stack>
                  <urbi-linha quebrar>
                    <urbi-chips-atalho .opcoes=${PERIODOS} ativo=${this.modo} @urbi:chip-atalho:click=${(e: CustomEvent) => { this.modo = e.detail.id; this.carregarPeriodo(); }}></urbi-chips-atalho>
                    <urbi-select label="Mês de referência" .valor=${this.referencia} .opcoes=${[...meses].reverse().map((m) => ({ valor: m.mes, rotulo: rotuloMes(m.mes) }))}
                      @urbi:select-change=${(e: CustomEvent) => { this.referencia = e.detail.valor; this.carregarPeriodo(); }}></urbi-select>
                  </urbi-linha>
                  <urbi-chips-atalho .opcoes=${COMPARACOES} ativo=${this.comparar} @urbi:chip-atalho:click=${(e: CustomEvent) => { this.comparar = e.detail.id; this.carregarPeriodo(); }}></urbi-chips-atalho>
                  ${a ? html`<urbi-prosa papel="dica">Indicadores de ${a.inicio}${a.fim !== a.inicio ? ` a ${a.fim}` : ''} · ${a.periodo.months} ${a.periodo.months === 1 ? 'mês' : 'meses'}${this.serie?.procedencia?.fonte ? ` · fonte ${this.serie.procedencia.fonte}` : ''}.</urbi-prosa>` : nothing}
                </urbi-stack>
              </urbi-card>
              ${a ? html`<urbi-grid min="160px">${DESTAQUES.map((k) => this.kpi(k, true))}</urbi-grid>` : nothing}
              ${a ? html`<urbi-card titulo="Derivados do período" icone="fa-solid fa-calculator">
                <urbi-grid min="170px">${a.derivados.map((d: Linha) => html`<urbi-stack>
                  <urbi-kpi rotulo=${d.label} formato="texto" .valor=${d.value ?? '—'}></urbi-kpi>
                  <urbi-prosa papel="dica">${d.value === null ? d.absent : d.formula}</urbi-prosa>
                </urbi-stack>`)}</urbi-grid></urbi-card>` : nothing}
              ${a ? GRUPOS.map((g) => html`<urbi-card titulo=${g.titulo}><urbi-grid min="170px">${g.chaves.map((k) => this.kpi(k))}</urbi-grid></urbi-card>`) : nothing}
              ${a?.avisos?.length ? html`<urbi-banner variante="alerta">${a.avisos.slice(0, 3).map((w: Linha) => w.message).join(' · ')}</urbi-banner>` : nothing}
              ${this.graficos()}`}
          <urbi-card titulo="IVV por localidade" icone="fa-solid fa-ranking-star">${this.regionalBloco()}</urbi-card>
          <urbi-prosa papel="dica">FipeZap entra no próximo passo desta fase.</urbi-prosa>
        </urbi-stack>
        ${this.importando
          ? html`<urbi-modal title="Importar CSV" maxWidth="860px" @urbi-modal:close=${() => { this.importando = ''; this.carregarTudo(); }}>
              <intel-imob-importar tabela=${this.importando} @intel-imob:importacao-aplicada=${() => { this.importando = ''; this.carregarTudo(); }}></intel-imob-importar>
            </urbi-modal>`
          : nothing}
      </urbi-shell-page>
    `;
  }
}
definir('intel-imob-mercado', IntelImobMercado);
