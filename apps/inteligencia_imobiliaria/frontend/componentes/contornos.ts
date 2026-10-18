import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { CamadaMapa, UrbiColunaTabela } from '@urbiverso/sdk';
import { definir } from '../registro';
import { enviarArquivo, json, mensagemDeErro, uv } from '../api';

const COLUNAS_FEICOES: UrbiColunaTabela[] = [
  { id: 'indice', label: '#', largura: '50px', alinhamento: 'direita', valor: (l: any) => String(l.indice + 1) },
  { id: 'nome', label: 'Nome' },
  { id: 'tipo', label: 'Tipo', largura: '130px' },
  { id: 'vertices', label: 'Vértices', largura: '90px', alinhamento: 'direita' },
  { id: 'erros', label: 'Situação', valor: (l: any) => (l.erros.length ? `rejeitada: ${l.erros.join('; ')}` : 'ok') },
];

/** Importar contornos de KML, KMZ ou GeoJSON (spec 6.1): arquivo → prévia das feições → aplicar. */
export class IntelImobContornosImportar extends LitElement {
  @state() private arquivo: File | null = null;
  @state() private previa: any = null;
  @state() private categoria = '';
  @state() private ocupado = false;
  @state() private erro = '';

  private async enviar() {
    if (!this.arquivo) return;
    this.ocupado = true;
    this.erro = '';
    try {
      const upload_id = await enviarArquivo('importacoes', 'arquivo', this.arquivo);
      this.previa = await uv().api('/contornos/importar', json({ upload_id }));
    } catch (e) {
      this.erro = mensagemDeErro(e);
    } finally {
      this.ocupado = false;
    }
  }

  private async aplicar() {
    this.ocupado = true;
    try {
      const r = await uv().api(`/contornos/importar/${this.previa.importacao_id}/aplicar`, json({ categoria: this.categoria || null }));
      uv().notificar(`${r.inseridas} contornos criados, ${r.ignoradas} já existiam.`, 'sucesso');
      this.dispatchEvent(new CustomEvent('intel-imob:importacao-aplicada', { bubbles: true, composed: true }));
      this.previa = null;
      this.arquivo = null;
    } catch (e) {
      this.erro = mensagemDeErro(e);
    } finally {
      this.ocupado = false;
    }
  }

  render() {
    return html`<urbi-stack>
      ${this.erro ? html`<urbi-banner variante="erro">${this.erro}</urbi-banner>` : nothing}
      ${!this.previa
        ? html`<urbi-seletor-arquivo drop accept=".kml,.kmz,.geojson,.json" dica="KML, KMZ (Urbigis/Magis, Google Earth) ou GeoJSON, em longitude/latitude (EPSG:4326)."
              @urbi:seletor-arquivo-change=${(e: CustomEvent) => (this.arquivo = e.detail.arquivo)}></urbi-seletor-arquivo>
            <urbi-botao variante="primario" ?desabilitado=${!this.arquivo} ?carregando=${this.ocupado} @click=${this.enviar}>Ver feições</urbi-botao>`
        : html`<urbi-prosa>${this.previa.feicoes.length} feições lidas (${String(this.previa.formato).toUpperCase()}). Feição já cadastrada com a mesma geometria é ignorada.</urbi-prosa>
            <urbi-tabela responsivo="multiline" .colunas=${COLUNAS_FEICOES} .linhas=${this.previa.feicoes}></urbi-tabela>
            <urbi-input label="Categoria (opcional)" .valor=${this.categoria} @urbi:input-change=${(e: CustomEvent) => (this.categoria = e.detail.valor)}></urbi-input>
            <urbi-linha>
              <urbi-botao variante="primario" ?carregando=${this.ocupado} @click=${this.aplicar}>Criar contornos</urbi-botao>
              <urbi-botao variante="texto" @click=${() => (this.previa = null)}>Cancelar</urbi-botao>
            </urbi-linha>`}
    </urbi-stack>`;
  }
}
definir('intel-imob-contornos-importar', IntelImobContornosImportar);

/** Desenhar um contorno no `urbi-mapa` (modo `desenhar-poligono`); a geometria vai validada ao backend. */
export class IntelImobContornoDesenhar extends LitElement {
  @state() private erro = '';

  private async concluir(e: CustomEvent) {
    const nome = await uv().prompt({ titulo: 'Novo contorno', rotulo: 'Nome', obrigatorio: true });
    if (!nome) return;
    try {
      const c = await uv().api('/contornos', json({ nome, geometria: e.detail.geometry }));
      uv().notificar('Contorno criado.', 'sucesso');
      uv().navegarSub(`/cadastro/contornos/${c.id}`);
    } catch (err) {
      this.erro = mensagemDeErro(err);
    }
  }

  render() {
    return html`<urbi-stack>
      ${this.erro ? html`<urbi-banner variante="erro">${this.erro}</urbi-banner>` : nothing}
      <urbi-prosa papel="dica">Clique para marcar os vértices e use Concluir. Esc cancela.</urbi-prosa>
      <urbi-mapa modo="desenhar-poligono" mapa-base="hibrido" centro="[-15.78,-47.93]" zoom="11" altura-minima="420px"
        aria-label="Desenhar contorno" @urbi:mapa-geometria=${this.concluir}></urbi-mapa>
    </urbi-stack>`;
  }
}
definir('intel-imob-contorno-desenhar', IntelImobContornoDesenhar);

/** Mini-mapa de uma geometria ou de um ponto, na ficha (spec 10.6). */
export class IntelImobMiniMapa extends LitElement {
  @property({ attribute: false }) geometria: any = null;
  @property({ type: Number }) latitude: number | null = null;
  @property({ type: Number }) longitude: number | null = null;
  @property() rotulo = '';

  render() {
    const geometry = this.geometria ?? (this.latitude !== null && this.longitude !== null && !Number.isNaN(this.latitude) ? { type: 'Point', coordinates: [this.longitude, this.latitude] } : null);
    if (!geometry) return html`<urbi-prosa papel="dica">Sem coordenada: fora do mapa.</urbi-prosa>`;
    const camadas: CamadaMapa[] = [{ id: 'objeto', dados: { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'objeto', geometry, properties: { id: 'objeto' } }] } as any }];
    return html`<urbi-mapa .camadas=${camadas} mapa-base="hibrido" altura-minima="260px" aria-label=${this.rotulo || 'Localização'}></urbi-mapa>`;
  }
}
definir('intel-imob-mini-mapa', IntelImobMiniMapa);
