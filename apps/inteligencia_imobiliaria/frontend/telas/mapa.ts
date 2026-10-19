import { LitElement, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import type { CamadaMapa } from '@urbiverso/sdk';
import { definir } from '../registro';
import { estiloPrimitivo } from '../estilos';
import { mensagemDeErro, uv } from '../api';
import { formatar } from '../componentes/cadastro';
import { cortesQuintis, estiloAnuncio, type Paleta } from '../../comum/mapa';
import { amostrarPaleta, aoTrocarTema } from '../componentes/cores';
import '../componentes/nucleo';
import { ROTULO_PRECISAO, ROTULO_TIPO_IMOVEL, TIPOS_IMOVEL } from '../../comum/anuncios';
import '../componentes/como-ler';

/** Chaves da querystring do Mapa: o vocabulário fechado do site (spec 10.1). */
const CHAVES = ['localidade', 'type', 'transacao', 'beds', 'price_min', 'price_max', 'q', 'inativos', 'camadas'] as const;
type Filtros = Partial<Record<(typeof CHAVES)[number], string>>;

const CAMADAS = [
  { id: 'ras', rotulo: 'Regiões administrativas', icone: 'fa-solid fa-map' },
  { id: 'importados', rotulo: 'Contornos importados', icone: 'fa-solid fa-draw-polygon' },
  { id: 'ancoras', rotulo: 'Âncoras', icone: 'fa-solid fa-anchor' },
  { id: 'lancamentos', rotulo: 'Lançamentos', icone: 'fa-solid fa-building' },
  { id: 'anuncios', rotulo: 'Anúncios', icone: 'fa-solid fa-tag' },
  { id: 'nucleo', rotulo: 'Núcleo (objetos vinculados)', icone: 'fa-solid fa-landmark' },
  { id: 'grade', rotulo: 'Grade territorial', icone: 'fa-solid fa-border-all' },
  { id: 'rede_viaria', rotulo: 'Centralidade viária', icone: 'fa-solid fa-road' },
];
/** A grade e a rede viária pesam e pedem escolha de métrica: começam desligadas. */
const CAMADAS_TERRITORIAIS = ['grade', 'rede_viaria'];
const CAMADAS_PADRAO = CAMADAS.map((c) => c.id).filter((id) => !CAMADAS_TERRITORIAIS.includes(id)).join(',');

/** Cor da classe da grade na rampa da paleta (a rampa tem 5 cores; as classes do pipeline vão até 10). */
function corDaClasse(classe: number | null, maxClasse: number, p: Paleta): string {
  if (classe === null || classe === undefined) return p.semPreco;
  const i = maxClasse <= 0 ? 0 : Math.round((classe / maxClasse) * (p.rampa.length - 1));
  return p.rampa[Math.max(0, Math.min(p.rampa.length - 1, i))];
}

function lerFiltros(): Filtros {
  const q = new URLSearchParams(window.location.search);
  const f: Filtros = {};
  for (const k of CHAVES) {
    const v = q.get(k);
    if (v) f[k] = v;
  }
  return f;
}

/** Estado na URL por `replaceState` montado com `href` (refletir filtro não é navegar; C-70). */
function gravarFiltros(f: Filtros): void {
  const q = new URLSearchParams();
  for (const k of CHAVES) if (f[k]) q.set(k, f[k]!);
  const s = q.toString();
  history.replaceState(history.state, '', uv().href('/mapa') + (s ? `?${s}` : ''));
}

function queryApi(f: Filtros): string {
  const q = new URLSearchParams();
  if (f.localidade) q.set('localidade', f.localidade);
  if (f.type) q.set('tipo_imovel', f.type);
  if (f.transacao) q.set('tipo_transacao', f.transacao);
  if (f.beds) q.set('quartos_min', f.beds);
  if (f.price_min) q.set('preco_min', f.price_min);
  if (f.price_max) q.set('preco_max', f.price_max);
  if (f.q) q.set('q', f.q);
  if (f.inativos === '1') q.set('status', 'todos');
  return q.toString();
}

const brl = (v: unknown) => formatar({ tipo: 'brl' }, v);

/** Frase de ausência (spec 10.1): nunca zero, nunca o número com aviso. */
function valorOuMotivo(v: number | null, indisponivel: any, fmt: (x: number) => string): string {
  if (v !== null && v !== undefined) return fmt(v);
  if (indisponivel?.motivo === 'amostra_pequena') return `amostra pequena (n = ${indisponivel.n}; pede ${indisponivel.minimo})`;
  return '—';
}

type Selecionado = { tipo: 'anuncio' | 'lancamento' | 'ancora' | 'localidade' | 'contorno' | 'celula'; id: number; dados?: any };

/** Mapa (spec 10.2): painel de filtros, KPIs, camadas, legenda e detalhe; o mapa ao lado. */
export class IntelImobMapa extends LitElement {
  static styles = [estiloPrimitivo];
  @state() private filtros: Filtros = lerFiltros();
  @state() private localidades: { valor: string; rotulo: string }[] = [];
  @state() private anuncios: any[] = [];
  @state() private agrupado = false;
  @state() private lancamentos: any[] = [];
  @state() private ancoras: any[] = [];
  @state() private ras: any = null;
  @state() private importados: any = null;
  @state() private vinculados: any = null;
  @state() private catalogoGrade: any[] = [];
  @state() private metricaGrade = '';
  @state() private grade: any = null;
  @state() private rede: any = null;
  @state() private carregandoGrade = false;
  private geracaoGrade = 0;
  @state() private erroTerritorio = '';
  @state() private kpis: any = null;
  @state() private carregando = false;
  @state() private erro = '';
  @state() private selecionado: Selecionado | null = null;
  @state() private paleta: Paleta | null = null;
  private temporizador?: ReturnType<typeof setTimeout>;
  private pararTema?: () => void;

  firstUpdated() {
    this.paleta = amostrarPaleta();
    this.pararTema = aoTrocarTema(() => (this.paleta = amostrarPaleta()));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.pararTema?.();
  }

  private get camadasLigadas(): Set<string> {
    return new Set((this.filtros.camadas ?? CAMADAS_PADRAO).split(','));
  }

  async connectedCallback() {
    super.connectedCallback();
    try {
      const [locs, ras, imp, lanc, anc, vinc] = await Promise.all([
        uv().api('/localidades?tipo=ra&por_pagina=100'),
        uv().api('/contornos?tipo_entidade=regiao_administrativa&status=ativo'),
        uv().api('/contornos?tipo_entidade=area_personalizada&status=ativo'),
        uv().api('/lancamentos/mapa'),
        uv().api('/ancoras/mapa'),
        uv().api('/vinculos-nucleo/mapa'),
      ]);
      this.vinculados = vinc;
      this.localidades = locs.dados.map((l: any) => ({ valor: l.codigo, rotulo: l.nome }));
      this.ras = ras;
      this.importados = imp;
      this.lancamentos = lanc.dados;
      this.ancoras = anc.dados;
    } catch (e) {
      this.erro = mensagemDeErro(e);
    }
    await this.carregarTerritorio();
    await this.carregarAnuncios();
  }

  /** Grade e rede viária vêm à parte: a falha de uma não derruba o mapa nem a outra, e é dita, não confundida com ausência. */
  private async carregarTerritorio() {
    this.erroTerritorio = '';
    const [cat, rede] = await Promise.allSettled([uv().api('/celulas/catalogo'), uv().api('/contornos?tipo_entidade=trecho_rodoviario&status=ativo')]);
    if (cat.status === 'fulfilled') {
      this.catalogoGrade = cat.value.dados ?? [];
      if (!this.metricaGrade && this.catalogoGrade.length) this.metricaGrade = this.chaveMetrica(this.catalogoGrade[0]);
      if (this.camadasLigadas.has('grade')) await this.carregarGrade();
    } else {
      this.catalogoGrade = [];
      this.erroTerritorio = `Grade territorial: ${mensagemDeErro(cat.reason)}`;
    }
    if (rede.status === 'fulfilled') this.rede = rede.value;
    else this.erroTerritorio = [this.erroTerritorio, `Centralidade viária: ${mensagemDeErro(rede.reason)}`].filter(Boolean).join(' · ');
  }

  private chaveMetrica(m: any): string {
    return `${m.conjunto_codigo}|${m.metrica}|${m.ano}`;
  }

  private async carregarGrade() {
    const [conjunto, metrica, ano] = this.metricaGrade.split('|');
    if (!conjunto) return;
    const geracao = ++this.geracaoGrade;
    this.carregandoGrade = true;
    this.grade = null;
    this.erro = '';
    if (this.selecionado?.tipo === 'celula') this.selecionado = null;
    try {
      const r = await uv().api(`/celulas/mapa?conjunto=${encodeURIComponent(conjunto)}&metrica=${encodeURIComponent(metrica)}&ano=${ano}`);
      if (geracao === this.geracaoGrade) this.grade = r;
    } catch (e) {
      if (geracao === this.geracaoGrade) this.erro = mensagemDeErro(e);
    } finally {
      if (geracao === this.geracaoGrade) this.carregandoGrade = false;
    }
  }

  private mudar(chave: keyof Filtros, valor: string | number | null | undefined) {
    const v = valor === null || valor === undefined || valor === '' ? undefined : String(valor);
    this.filtros = { ...this.filtros, [chave]: v };
    gravarFiltros(this.filtros);
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.carregarAnuncios(), chave === 'q' ? 350 : 0);
  }

  private alternarCamada(id: string, ligada: boolean) {
    const s = this.camadasLigadas;
    if (ligada) s.add(id);
    else s.delete(id);
    const lista = CAMADAS.map((c) => c.id).filter((c) => s.has(c)).join(',');
    this.filtros = { ...this.filtros, camadas: lista === CAMADAS_PADRAO ? undefined : lista || 'nenhuma' };
    gravarFiltros(this.filtros);
    if (id === 'grade' && ligada && !this.grade) void this.carregarGrade();
  }

  private async carregarAnuncios() {
    this.carregando = true;
    this.erro = '';
    try {
      const q = queryApi(this.filtros);
      const [pontos, kpis] = await Promise.all([uv().api(`/anuncios/mapa?${q}`), uv().api(`/anuncios/kpis?${q}`)]);
      this.agrupado = pontos.agrupado;
      this.anuncios = pontos.agrupado ? [] : pontos.dados;
      this.kpis = kpis;
    } catch (e) {
      this.erro = mensagemDeErro(e);
    } finally {
      this.carregando = false;
    }
  }

  private get cortes(): number[] {
    return cortesQuintis(this.anuncios.map((a) => a.preco_m2).filter((v) => v !== null));
  }

  private camadas(): CamadaMapa[] {
    const p = this.paleta;
    if (!p) return [];
    const ligadas = this.camadasLigadas;
    const out: CamadaMapa[] = [];
    const ponto = (lon: number, lat: number) => ({ type: 'Point', coordinates: [lon, lat] });
    if (ligadas.has('ras') && this.ras) {
      out.push({ id: 'ras', nome: 'Regiões administrativas', dados: { ...this.ras, features: this.ras.features.map((f: any) => ({ ...f, id: `contorno:${f.id}`, properties: { ...f.properties, id: `contorno:${f.id}`, estilo: { contorno: p.ra, espessura: 1, opacidadePreenchimento: 0.04, preenchimento: p.ra, rotulo: { campo: 'nome' } } } })) } as any });
    }
    if (ligadas.has('importados') && this.importados) {
      out.push({ id: 'importados', nome: 'Contornos importados', dados: { ...this.importados, features: this.importados.features.map((f: any) => ({ ...f, id: `contorno:${f.id}`, properties: { ...f.properties, id: `contorno:${f.id}`, estilo: f.properties.estilo ?? { contorno: p.importado, espessura: 2, opacidadePreenchimento: 0.1, preenchimento: p.importado } } })) } as any });
    }
    if (ligadas.has('ancoras')) {
      out.push({ id: 'ancoras', nome: 'Âncoras', dados: { type: 'FeatureCollection', features: this.ancoras.map((a) => ({ type: 'Feature', id: `ancora:${a.id}`, geometry: ponto(a.longitude, a.latitude), properties: { id: `ancora:${a.id}`, nome: a.nome, estilo: { preenchimento: a.grupo === 'comercio_servico' ? p.ancoraComercio : p.ancoraInfraestrutura, contorno: p.bordaPonto, espessura: 1, marcador: { forma: 'quadrado', tamanho: 9 } } } })) } as any });
    }
    if (ligadas.has('lancamentos')) {
      out.push({ id: 'lancamentos', nome: 'Lançamentos', dados: { type: 'FeatureCollection', features: this.lancamentos.map((l) => ({ type: 'Feature', id: `lancamento:${l.id}`, geometry: ponto(l.longitude, l.latitude), properties: { id: `lancamento:${l.id}`, estilo: { preenchimento: p.lancamento, contorno: p.bordaPonto, espessura: 1, marcador: { forma: 'losango', tamanho: 11 } } } })) } as any });
    }
    if (ligadas.has('nucleo') && this.vinculados) {
      // D-141: a geometria é a da própria app; o selo diz que há vínculo com o núcleo.
      out.push({ id: 'nucleo', nome: 'Núcleo', dados: { type: 'FeatureCollection', features: this.vinculados.features.map((f: any) => {
        const id = `${f.properties.objeto_tipo}:${f.properties.objeto_id}`;
        const selo = { rotulo: { campo: 'selo' } };
        const estilo = f.geometry?.type === 'Point'
          ? { preenchimento: p.nucleo, contorno: p.bordaExata, espessura: 2, marcador: { forma: 'circulo', tamanho: 14 }, ...selo }
          : { contorno: p.nucleo, espessura: 3, opacidadePreenchimento: 0.12, preenchimento: p.nucleo, ...selo };
        return { ...f, id, properties: { ...f.properties, id, selo: `núcleo · ${f.properties.vinculos.length}`, estilo } };
      }) } as any });
    }
    if (ligadas.has('anuncios')) {
      const cortes = this.cortes;
      out.push({ id: 'anuncios', nome: 'Anúncios', dados: { type: 'FeatureCollection', features: this.anuncios.map((a) => ({ type: 'Feature', id: `anuncio:${a.id}`, geometry: ponto(a.longitude, a.latitude), properties: { id: `anuncio:${a.id}`, estilo: estiloAnuncio(a.preco_m2, cortes, a.precisao_coordenada, p) } })) } as any });
    }
    if (ligadas.has('grade') && this.grade?.features?.length) {
      const maxClasse = Math.max(0, ...(this.grade.legenda ?? []).map((f: any) => f.classe));
      out.push({ id: 'grade', nome: this.grade.metrica?.rotulo ?? 'Grade', dados: { ...this.grade, features: this.grade.features.map((f: any) => ({ ...f, properties: { ...f.properties, estilo: { preenchimento: corDaClasse(f.properties.classe, maxClasse, p), opacidadePreenchimento: f.properties.classe === null ? 0.1 : 0.65, contorno: p.ra, espessura: 0.5 } } })) } as any });
    }
    if (ligadas.has('rede_viaria') && this.rede?.features?.length) {
      out.push({ id: 'rede_viaria', nome: 'Centralidade viária', dados: { ...this.rede, features: this.rede.features.map((f: any) => ({ ...f, id: `contorno:${f.id}`, properties: { ...f.properties, id: `contorno:${f.id}`, estilo: f.properties.estilo ?? { contorno: p.importado, espessura: 2 } } })) } as any });
    }
    return out;
  }

  private async clicar(e: CustomEvent) {
    const feicao = e.detail.feicoes?.[0]?.feature;
    if (!feicao) {
      this.selecionado = null;
      return;
    }
    const [tipo, id] = String(feicao.id ?? feicao.properties?.id).split(':');
    try {
      if (tipo === 'anuncio') this.selecionado = { tipo, id: Number(id), dados: await uv().api(`/anuncios/${id}`) };
      else if (tipo === 'lancamento') this.selecionado = { tipo, id: Number(id), dados: await uv().api(`/lancamentos/${id}`) };
      else if (tipo === 'ancora') this.selecionado = { tipo, id: Number(id), dados: await uv().api(`/ancoras/${id}`) };
      else if (tipo === 'celula') {
        const f = this.grade?.features?.find((x: any) => x.id === feicao.id);
        this.selecionado = f ? { tipo, id: Number(id), dados: { ...f.properties, metrica: this.grade.metrica } } : null;
      } else if (tipo === 'contorno') {
        const c = await uv().api(`/contornos/${id}`);
        this.selecionado = c.localidade_id && c.tipo_entidade === 'regiao_administrativa'
          ? { tipo: 'localidade', id: c.localidade_id, dados: await uv().api(`/localidades/${c.localidade_id}`) }
          : { tipo: 'contorno', id: Number(id), dados: c };
      }
    } catch (err) {
      this.erro = mensagemDeErro(err);
    }
  }

  private filtrosPainel() {
    const f = this.filtros;
    return html`<urbi-card titulo="Filtros" icone="fa-solid fa-filter">
      <urbi-stack>
        <urbi-select label="Localidade" pesquisavel placeholder="Todas" .valor=${f.localidade ?? ''} .opcoes=${[{ valor: '', rotulo: 'Todas' }, ...this.localidades]}
          @urbi:select-change=${(e: CustomEvent) => this.mudar('localidade', e.detail.valor)}></urbi-select>
        <urbi-select label="Tipo de imóvel" .valor=${f.type ?? ''} .opcoes=${[{ valor: '', rotulo: 'Todos' }, ...TIPOS_IMOVEL.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_IMOVEL[t] }))]}
          @urbi:select-change=${(e: CustomEvent) => this.mudar('type', e.detail.valor)}></urbi-select>
        <urbi-select label="Transação" .valor=${f.transacao ?? ''} .opcoes=${[{ valor: '', rotulo: 'Todas' }, { valor: 'venda', rotulo: 'Venda' }, { valor: 'locacao', rotulo: 'Locação' }]}
          @urbi:select-change=${(e: CustomEvent) => this.mudar('transacao', e.detail.valor)}></urbi-select>
        <urbi-grid min="120px">
          <urbi-input-numero label="Quartos (mín.)" .min=${0} .step=${1} .valor=${f.beds ? Number(f.beds) : null}
            @urbi:input-numero-change=${(e: CustomEvent) => this.mudar('beds', e.detail.valor)}></urbi-input-numero>
          <urbi-input-numero label="Preço mín. (R$)" .min=${0} .valor=${f.price_min ? Number(f.price_min) : null}
            @urbi:input-numero-change=${(e: CustomEvent) => this.mudar('price_min', e.detail.valor)}></urbi-input-numero>
          <urbi-input-numero label="Preço máx. (R$)" .min=${0} .valor=${f.price_max ? Number(f.price_max) : null}
            @urbi:input-numero-change=${(e: CustomEvent) => this.mudar('price_max', e.detail.valor)}></urbi-input-numero>
        </urbi-grid>
        <urbi-input label="Busca" placeholder="Título, endereço, bairro" .valor=${f.q ?? ''} @urbi:input-change=${(e: CustomEvent) => this.mudar('q', e.detail.valor)}></urbi-input>
        <urbi-checkbox label="Incluir anúncios inativos" .marcado=${f.inativos === '1'} @urbi:checkbox-change=${(e: CustomEvent) => this.mudar('inativos', e.detail.marcado ? '1' : '')}></urbi-checkbox>
      </urbi-stack>
    </urbi-card>`;
  }

  private kpisPainel() {
    const k = this.kpis;
    if (!k) return nothing;
    return html`<urbi-grid min="140px">
      <urbi-kpi rotulo="Anúncios" .valor=${k.anuncios}></urbi-kpi>
      <urbi-kpi rotulo="Mediana R$/m²" formato="texto" .valor=${valorOuMotivo(k.preco_m2.mediana, k.preco_m2.indisponivel?.mediana, (x) => brl(x))}></urbi-kpi>
      <urbi-kpi rotulo="Mediana preço" formato="texto" .valor=${valorOuMotivo(k.preco.mediana, k.preco.indisponivel?.mediana, (x) => brl(x))}></urbi-kpi>
      <urbi-kpi rotulo="P25–P75 R$/m²" formato="texto" .valor=${k.preco_m2.p25 !== null ? `${brl(k.preco_m2.p25)} – ${brl(k.preco_m2.p75)}` : valorOuMotivo(null, k.preco_m2.indisponivel?.p25, String)}></urbi-kpi>
      <urbi-kpi rotulo="Lançamentos" .valor=${this.lancamentos.length}></urbi-kpi>
      <urbi-kpi rotulo="Âncoras" .valor=${this.ancoras.length}></urbi-kpi>
      <urbi-kpi rotulo="Sem coordenada exata" .valor=${k.sem_coordenada_exata} variante=${k.sem_coordenada_exata ? 'alerta' : ''}></urbi-kpi>
    </urbi-grid>
    <urbi-prosa papel="dica">Fonte: anúncios importados da planilha · n = ${k.amostra_n} com preço/m² · mediana pede 5, quartis pedem 10.</urbi-prosa>`;
  }

  private camadasPainel() {
    const ligadas = this.camadasLigadas;
    const cortes = this.cortes;
    const p = this.paleta;
    if (!p) return nothing;
    return html`<urbi-card titulo="Camadas e legenda" icone="fa-solid fa-layer-group">
      <urbi-stack>
        <urbi-linha quebrar>
          ${CAMADAS.map((c) => html`<urbi-botao-alternar icone=${c.icone} .ligado=${ligadas.has(c.id)}
            @urbi:botao-alternar-change=${(e: CustomEvent<boolean>) => this.alternarCamada(c.id, e.detail)}>${c.rotulo}</urbi-botao-alternar>`)}
        </urbi-linha>
        ${ligadas.has('grade') ? this.painelGrade(p) : nothing}
        <intel-imob-legenda .itens=${[
          ...(cortes.length ? p.rampa.map((cor, i) => ({ cor, rotulo: `Anúncio R$/m² ${i === 0 ? `até ${brl(cortes[0])}` : i === 4 ? `acima de ${brl(cortes[3])}` : `${brl(cortes[i - 1])} – ${brl(cortes[i])}`}` })) : []),
          { cor: p.semPreco, rotulo: 'Anúncio sem preço/m²' },
          { cor: p.lancamento, rotulo: 'Lançamento' },
          { cor: p.ancoraInfraestrutura, rotulo: 'Âncora de infraestrutura' },
          { cor: p.ancoraComercio, rotulo: 'Âncora de comércio e serviço' },
          { cor: p.importado, rotulo: 'Contorno importado' },
        ]}></intel-imob-legenda>
        <urbi-prosa papel="dica">Ponto transparente e tracejado: localização aproximada (centro da localidade ou da RA, ou geocodificação externa), não serve para distância.</urbi-prosa>
      </urbi-stack>
    </urbi-card>`;
  }

  private painelGrade(p: Paleta) {
    const aviso = this.erroTerritorio ? html`<urbi-banner variante="alerta">${this.erroTerritorio}</urbi-banner>` : nothing;
    if (!this.catalogoGrade.length) return html`${aviso}${this.erroTerritorio ? nothing : html`<urbi-prosa papel="dica">Grade territorial: nenhuma célula importada ainda (Operação › Importações › Células da grade).</urbi-prosa>`}`;
    const g = this.grade;
    const max = Math.max(0, ...((g?.legenda ?? []) as any[]).map((f) => f.classe));
    return html`${aviso}<urbi-select label="Métrica da grade" .valor=${this.metricaGrade} .opcoes=${this.catalogoGrade.map((m) => ({ valor: this.chaveMetrica(m), rotulo: `${m.rotulo} (${m.ano})` }))}
        @urbi:select-change=${async (e: CustomEvent) => { this.metricaGrade = String(e.detail.valor); await this.carregarGrade(); }}></urbi-select>
      ${this.carregandoGrade ? html`<urbi-prosa papel="dica">Carregando a grade…</urbi-prosa>` : nothing}
      ${g && !g.features.length ? html`<urbi-prosa papel="dica">Nenhuma célula com essa métrica.</urbi-prosa>` : nothing}
      ${g?.features.length ? html`<intel-imob-legenda .itens=${(g.legenda as any[]).map((f) => ({ cor: corDaClasse(f.classe, max, p), rotulo: `${f.min.toLocaleString('pt-BR')} a ${f.max.toLocaleString('pt-BR')} ${g.metrica.unidade} · ${f.n} células` }))}></intel-imob-legenda>
        <urbi-prosa papel="dica">${g.metrica.procedencia}${g.truncado ? ` · mostrando ${g.features.length} de ${g.total} células` : ''}</urbi-prosa>` : nothing}`;
  }

  private detalhe() {
    const s = this.selecionado;
    if (!s?.dados) return nothing;
    const d = s.dados;
    const link = (sub: string) => html`<urbi-botao variante="secundario" pequeno href=${uv().href(sub)}>Abrir ficha</urbi-botao>`;
    if (s.tipo === 'celula') {
      return html`<urbi-card titulo=${d.metrica?.rotulo ?? 'Célula da grade'} icone="fa-solid fa-border-all">
        <urbi-stack>
          <urbi-prosa>${d.valor === null ? 'sem valor' : `${Number(d.valor).toLocaleString('pt-BR')} ${d.metrica?.unidade ?? ''}`}${d.classe === null ? '' : ` · classe ${d.classe}`}</urbi-prosa>
          <urbi-prosa papel="dica">Célula ${d.codigo} (${d.grade})${d.qualidade ? ` · ${d.qualidade}` : ''} · ${d.metrica?.procedencia ?? ''}</urbi-prosa>
        </urbi-stack>
      </urbi-card>`;
    }
    if (s.tipo === 'anuncio') {
      return html`<urbi-card titulo=${d.titulo} icone="fa-solid fa-tag">
        <urbi-stack>
          <urbi-prosa>${brl(d.preco_pedido_brl)} · ${formatar({ tipo: 'm2' }, d.area_m2)} · ${d.preco_m2 ? `${brl(d.preco_m2)}/m² (${d.preco_m2_informado_brl ? 'informado' : 'calculado'})` : 'sem preço/m²'}</urbi-prosa>
          <urbi-prosa>${ROTULO_TIPO_IMOVEL[d.tipo_imovel] ?? d.tipo_imovel} · ${d.quartos ?? '—'} quartos · ${d.suites ?? '—'} suítes · ${d.vagas ?? '—'} vagas</urbi-prosa>
          <urbi-prosa papel="dica">${d.localidade_nome ?? ''} · ${d.localidade_texto} · ${d.status}${d.visto_em ? ` · confirmado no portal em ${formatar({ tipo: 'data' }, d.visto_em)}` : ''}</urbi-prosa>
          ${d.preco_m2_divergente ? html`<urbi-banner variante="alerta">Preço/m² informado diverge ${formatar({ tipo: 'frac' }, d.divergencia_preco_m2_frac)} do calculado.</urbi-banner>` : nothing}
          <urbi-prosa papel="dica">${ROTULO_PRECISAO[d.precisao_coordenada] ?? 'Localização aproximada'}${d.pode_calcular_distancia ? '' : ' — não serve para distância'} · ${d.portal}</urbi-prosa>
          <urbi-prosa papel="dica">Histórico de preço: disponível a partir da coleta automática.</urbi-prosa>
          <urbi-linha>${link(`/cadastro/anuncios/${d.id}`)}
            ${/^https?:\/\//.test(d.url_fonte ?? '') ? html`<urbi-prosa inline><a href=${d.url_fonte} target="_blank" rel="noopener noreferrer">Ver no portal</a></urbi-prosa>` : nothing}</urbi-linha>
        </urbi-stack>
      </urbi-card>`;
    }
    if (s.tipo === 'lancamento') {
      return html`<urbi-card titulo=${d.nome} icone="fa-solid fa-building"><urbi-stack>
        <urbi-prosa>${d.incorporadora ?? ''} · ${(d.estagio_vendas ?? '').replace(/_/g, ' ')}</urbi-prosa>
        <urbi-prosa>A partir de ${brl(d.preco_atual_brl)} · ${d.unidades_total ?? '—'} unidades</urbi-prosa>
        <urbi-prosa papel="dica">${d.localidade_nome ?? ''} · ${d.bairro_texto}</urbi-prosa>
        ${link(`/cadastro/lancamentos/${d.id}`)}</urbi-stack></urbi-card>`;
    }
    if (s.tipo === 'ancora') {
      return html`<urbi-card titulo=${d.nome} icone="fa-solid fa-anchor"><urbi-stack>
        <urbi-prosa>${d.categoria?.replace(/_/g, ' ')} · ${d.subcategoria} · ${d.operador}</urbi-prosa>
        <urbi-prosa papel="dica">${d.localidade_nome ?? ''} · ${d.status}</urbi-prosa>
        ${link(`/cadastro/ancoras/${d.id}`)}</urbi-stack></urbi-card>`;
    }
    if (s.tipo === 'localidade') {
      return html`<urbi-card titulo=${`${d.nome} (${d.codigo})`} icone="fa-solid fa-location-dot"><urbi-stack>
        <urbi-grid min="140px">
          ${Object.entries(d.contagens ?? {}).map(([k, v]) => html`<urbi-kpi rotulo=${k.replace(/_/g, ' ')} .valor=${v}></urbi-kpi>`)}
          ${d.perfil ? html`<urbi-kpi rotulo=${`População ${d.perfil.ano_referencia}`} .valor=${d.perfil.populacao_total ?? '—'}></urbi-kpi>` : nothing}
        </urbi-grid>
        <urbi-linha>
          <urbi-botao variante="secundario" pequeno @click=${() => this.mudar('localidade', d.codigo)}>Filtrar por esta localidade</urbi-botao>
          ${link(`/cadastro/localidades/${d.id}`)}
        </urbi-linha></urbi-stack></urbi-card>`;
    }
    return html`<urbi-card titulo=${d.nome} icone="fa-solid fa-draw-polygon"><urbi-stack>
      <urbi-prosa>${d.categoria ?? ''} · ${formatar({ tipo: 'm2' }, d.area_m2)} (aproximada, calculada pela app)</urbi-prosa>
      ${this.camadasLigadas.has('nucleo') ? html`<urbi-prosa papel="dica">Do núcleo imobiliário · lido agora</urbi-prosa>
        <intel-imob-nucleo-objeto tipo="contorno" .objetoId=${d.id} compacto></intel-imob-nucleo-objeto>` : nothing}
      ${link(`/cadastro/contornos/${d.id}`)}</urbi-stack></urbi-card>`;
  }

  render() {
    const selecionados = this.selecionado ? [`${this.selecionado.tipo === 'localidade' ? 'contorno' : this.selecionado.tipo}:${this.selecionado.tipo === 'localidade' ? this.ras?.features.find((f: any) => f.properties.localidade_id === this.selecionado!.id)?.id ?? 0 : this.selecionado.id}`] : [];
    return html`
      <urbi-shell-page titulo="Mapa" dashboard>
        <intel-imob-como-ler slot="actions" tela="mapa"></intel-imob-como-ler>
        <urbi-2x1 largura="largo">
          <urbi-hospedeiro slot="esquerda">
            <urbi-stack>
              ${this.erro ? html`<urbi-banner variante="erro">${this.erro}</urbi-banner>` : nothing}
              ${this.agrupado ? html`<urbi-banner variante="info">Mais de 5 000 anúncios no recorte: estreite o filtro para ver os pontos.</urbi-banner>` : nothing}
              ${this.detalhe()}
              ${this.kpisPainel()}
              ${this.filtrosPainel()}
              ${this.camadasPainel()}
            </urbi-stack>
          </urbi-hospedeiro>
          <urbi-mapa slot="direita" expandir mapa-base="hibrido" centro="[-15.78,-47.93]" zoom="10" aria-label="Mapa do mercado imobiliário do DF"
            .camadas=${this.camadas()} .selecionados=${selecionados} ?carregando=${this.carregando}
            @urbi:mapa-clique=${this.clicar}></urbi-mapa>
        </urbi-2x1>
      </urbi-shell-page>
    `;
  }
}
definir('intel-imob-mapa', IntelImobMapa);

/** Legenda do mapa: exceção registrada em `docs/ui-excecoes.md` (amostra de cor é dado). */
export class IntelImobLegenda extends LitElement {
  static properties = { itens: { attribute: false } };
  itens: { cor: string; rotulo: string }[] = [];

  render() {
    return html`<urbi-stack>
      ${this.itens.map((i) => html`<urbi-linha>
        <span role="img" aria-label=${`cor ${i.rotulo}`} style=${`background:${i.cor};display:inline-block;width:14px;height:14px`}></span>
        <urbi-prosa inline>${i.rotulo}</urbi-prosa>
      </urbi-linha>`)}
    </urbi-stack>`;
  }
}
definir('intel-imob-legenda', IntelImobLegenda);
