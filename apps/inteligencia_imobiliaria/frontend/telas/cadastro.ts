import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { UrbiColunaTabela } from '@urbiverso/sdk';
import { definir } from '../registro';
import { estiloPrimitivo } from '../estilos';
import { temPapel, uv } from '../api';
import { formatar, type CampoFicha, type ConfigCadastro } from '../componentes/cadastro';
import { CATEGORIAS_ANCORA, ESTAGIOS_VENDA, PRECISOES, ROTULO_CATEGORIA_ANCORA, ROTULO_PRECISAO, ROTULO_TIPO_IMOVEL, TIPOS_IMOVEL } from '../../comum/anuncios';
import '../componentes/cadastro';
import '../componentes/contornos';
import '../componentes/como-ler';

const op = (lista: readonly string[], rotulos: Record<string, string> = {}) => lista.map((v) => ({ valor: v, rotulo: rotulos[v] ?? v.replace(/_/g, ' ') }));
const filtroSelect = (lista: readonly string[], rotulos: Record<string, string> = {}, placeholder = 'Todos') => ({ tipo: 'select' as const, placeholder, opcoes: op(lista, rotulos) });
const filtroTexto = (placeholder: string) => ({ tipo: 'texto' as const, placeholder });
const brl = (v: unknown) => formatar({ tipo: 'brl' }, v);

// ------------------------------------------------------------------ anúncios

const CAMPOS_ANUNCIO: CampoFicha[] = [
  { nome: 'titulo', rotulo: 'Título', tipo: 'texto', obrigatorio: true, criar: true, editar: true },
  { nome: 'fonte_id', rotulo: 'Portal', tipo: 'fonte', obrigatorio: true, criar: true, mostrar: 'portal' },
  { nome: 'url_fonte', rotulo: 'Página do anúncio', tipo: 'url', obrigatorio: true, criar: true, editar: true },
  { nome: 'tipo_transacao', rotulo: 'Transação', tipo: 'selecao', opcoes: op(['venda', 'locacao'], { locacao: 'locação' }), obrigatorio: true, criar: true, editar: true },
  { nome: 'tipo_imovel', rotulo: 'Tipo', tipo: 'selecao', opcoes: op(TIPOS_IMOVEL, ROTULO_TIPO_IMOVEL), obrigatorio: true, criar: true, editar: true },
  { nome: 'localidade_id', rotulo: 'Localidade', tipo: 'localidade', obrigatorio: true, criar: true, editar: true, mostrar: 'localidade_nome' },
  { nome: 'status', rotulo: 'Status', tipo: 'selecao', opcoes: op(['ativo', 'inativo']), editar: true },
  { nome: 'preco_pedido_brl', rotulo: 'Preço pedido', tipo: 'brl', criar: true, editar: true },
  { nome: 'area_m2', rotulo: 'Área', tipo: 'm2', criar: true, editar: true },
  { nome: 'preco_m2', rotulo: 'Preço/m²', tipo: 'brl' },
  { nome: 'quartos', rotulo: 'Quartos', tipo: 'numero', criar: true, editar: true },
  { nome: 'endereco', rotulo: 'Endereço', tipo: 'texto', criar: true, editar: true, nivel: 'complementar' },
  { nome: 'localidade_texto', rotulo: 'Bairro/setor (como a fonte deu)', tipo: 'texto', editar: true, nivel: 'complementar' },
  { nome: 'suites', rotulo: 'Suítes', tipo: 'numero', criar: true, editar: true, nivel: 'complementar' },
  { nome: 'vagas', rotulo: 'Vagas', tipo: 'numero', criar: true, editar: true, nivel: 'complementar' },
  { nome: 'condominio_brl', rotulo: 'Condomínio', tipo: 'brl', editar: true, nivel: 'complementar' },
  { nome: 'iptu_brl', rotulo: 'IPTU', tipo: 'brl', editar: true, nivel: 'complementar' },
  { nome: 'preco_m2_informado_brl', rotulo: 'Preço/m² informado', tipo: 'brl', editar: true, nivel: 'complementar' },
  { nome: 'preco_m2_calculado', rotulo: 'Preço/m² calculado', tipo: 'brl', nivel: 'complementar' },
  { nome: 'preco_m2_divergente', rotulo: 'Preço/m² diverge do calculado', tipo: 'booleano', nivel: 'complementar' },
  { nome: 'situacao_regularizacao', rotulo: 'Situação de regularização', tipo: 'texto', editar: true, nivel: 'complementar' },
  { nome: 'observado_em', rotulo: 'Preço observado em', tipo: 'data', criar: true, editar: true, nivel: 'complementar' },
  { nome: 'latitude', rotulo: 'Latitude', tipo: 'numero', criar: true, editar: true, nivel: 'tecnico' },
  { nome: 'longitude', rotulo: 'Longitude', tipo: 'numero', criar: true, editar: true, nivel: 'tecnico' },
  { nome: 'precisao_coordenada', rotulo: 'Precisão da coordenada', tipo: 'selecao', opcoes: op(PRECISOES, ROTULO_PRECISAO), editar: true, nivel: 'tecnico' },
  { nome: 'confianca', rotulo: 'Confiança', tipo: 'texto', editar: true, nivel: 'tecnico' },
  { nome: 'qualidade', rotulo: 'Qualidade', tipo: 'texto', editar: true, nivel: 'tecnico' },
  { nome: 'origem_cadastro', rotulo: 'Origem do cadastro', tipo: 'texto', nivel: 'tecnico' },
  { nome: 'primeiro_visto_em', rotulo: 'Primeira vez visto', tipo: 'datahora', nivel: 'tecnico' },
  { nome: 'id_legado', rotulo: 'Id na planilha', tipo: 'texto', nivel: 'tecnico' },
];

const COLUNAS_ANUNCIO: UrbiColunaTabela[] = [
  { id: 'titulo', label: 'Título', filtro: filtroTexto('Buscar título, endereço…') },
  { id: 'localidade_nome', label: 'Localidade', largura: '150px' },
  { id: 'tipo_imovel', label: 'Tipo', largura: '140px', valor: (l: any) => ROTULO_TIPO_IMOVEL[l.tipo_imovel] ?? l.tipo_imovel, filtro: filtroSelect(TIPOS_IMOVEL, ROTULO_TIPO_IMOVEL) },
  { id: 'quartos', label: 'Quartos', largura: '80px', alinhamento: 'direita' },
  { id: 'preco_pedido_brl', label: 'Preço', largura: '130px', alinhamento: 'direita', valor: (l: any) => brl(l.preco_pedido_brl) },
  { id: 'preco_m2', label: 'R$/m²', largura: '110px', alinhamento: 'direita', valor: (l: any) => brl(l.preco_m2) },
  { id: 'portal', label: 'Portal', largura: '120px' },
  { id: 'status', label: 'Status', largura: '100px', filtro: { tipo: 'select', placeholder: 'Ativos', opcoes: [{ valor: 'inativo', rotulo: 'Inativos' }, { valor: 'todos', rotulo: 'Todos' }] } },
];

export const CONFIG_ANUNCIOS: ConfigCadastro = {
  id: 'anuncios', objeto: 'anuncio', titulo: 'Anúncios', singular: 'Anúncio', api: '/anuncios', tabelaImport: 'anuncios', papel: 'curador',
  colunas: COLUNAS_ANUNCIO, campos: CAMPOS_ANUNCIO, eventos: true,
  query: (f) => ({ q: f.titulo ?? '', tipo_imovel: f.tipo_imovel ?? '', status: f.status ?? '' }),
  tituloFicha: (l) => l.titulo,
  blocosFicha: (l) => html`<urbi-card titulo="Localização">
    <intel-imob-mini-mapa .latitude=${Number(l.latitude)} .longitude=${Number(l.longitude)} rotulo=${l.titulo}></intel-imob-mini-mapa>
    <urbi-prosa papel="dica">${ROTULO_PRECISAO[l.precisao_coordenada] ?? l.precisao_coordenada}${l.pode_calcular_distancia ? '' : ' — não serve para medir distância.'}</urbi-prosa>
    ${l.indisponivel?.retratos ? html`<urbi-prosa papel="dica">Retratos mensais e liquidez: disponíveis a partir da coleta automática.</urbi-prosa>` : nothing}
  </urbi-card>`,
};

// --------------------------------------------------------------- lançamentos

const CAMPOS_LANCAMENTO: CampoFicha[] = [
  { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, criar: true, editar: true },
  { nome: 'incorporadora', rotulo: 'Incorporadora', tipo: 'texto', criar: true, editar: true },
  { nome: 'bairro_texto', rotulo: 'Bairro', tipo: 'texto', obrigatorio: true, criar: true, editar: true },
  { nome: 'localidade_id', rotulo: 'Localidade', tipo: 'localidade', criar: true, editar: true, mostrar: 'localidade_nome' },
  { nome: 'estagio_vendas', rotulo: 'Estágio de vendas', tipo: 'selecao', opcoes: op(ESTAGIOS_VENDA), criar: true, editar: true },
  { nome: 'status', rotulo: 'Status (texto da fonte)', tipo: 'texto', criar: true, editar: true },
  { nome: 'preco_atual_brl', rotulo: 'Preço a partir de', tipo: 'brl', criar: true, editar: true },
  { nome: 'preco_m2_atual_brl', rotulo: 'Preço/m² informado', tipo: 'brl', editar: true },
  { nome: 'unidades_total', rotulo: 'Unidades', tipo: 'numero', criar: true, editar: true },
  { nome: 'unidades_estoque', rotulo: 'Unidades à venda', tipo: 'numero', editar: true },
  { nome: 'url_fonte', rotulo: 'Página', tipo: 'url', criar: true, editar: true },
  { nome: 'produto', rotulo: 'Produto', tipo: 'texto', editar: true, nivel: 'complementar' },
  { nome: 'segmento', rotulo: 'Segmento', tipo: 'texto', editar: true, nivel: 'complementar' },
  { nome: 'area_min_m2', rotulo: 'Área mínima', tipo: 'm2', editar: true, nivel: 'complementar' },
  { nome: 'area_max_m2', rotulo: 'Área máxima', tipo: 'm2', editar: true, nivel: 'complementar' },
  { nome: 'mix_unidades', rotulo: 'Mix de unidades', tipo: 'texto', editar: true, nivel: 'complementar' },
  { nome: 'obra_frac', rotulo: 'Obra', tipo: 'frac', editar: true, nivel: 'complementar' },
  { nome: 'entrega_prevista', rotulo: 'Entrega prevista', tipo: 'data', editar: true, nivel: 'complementar' },
  { nome: 'orientacao', rotulo: 'Orientação', tipo: 'selecao', opcoes: op(['vertical', 'horizontal']), editar: true, nivel: 'complementar' },
  { nome: 'endereco', rotulo: 'Endereço', tipo: 'texto', editar: true, nivel: 'complementar' },
  { nome: 'latitude', rotulo: 'Latitude', tipo: 'numero', editar: true, nivel: 'tecnico' },
  { nome: 'longitude', rotulo: 'Longitude', tipo: 'numero', editar: true, nivel: 'tecnico' },
  { nome: 'espacial_utilizavel', rotulo: 'Vai ao mapa', tipo: 'booleano', nivel: 'tecnico' },
  { nome: 'confianca', rotulo: 'Confiança', tipo: 'texto', editar: true, nivel: 'tecnico' },
  { nome: 'verificado_em', rotulo: 'Verificado em', tipo: 'data', editar: true, nivel: 'tecnico' },
  { nome: 'id_legado', rotulo: 'Id na planilha', tipo: 'texto', nivel: 'tecnico' },
];

export const CONFIG_LANCAMENTOS: ConfigCadastro = {
  id: 'lancamentos', objeto: 'lancamento', titulo: 'Lançamentos', singular: 'Lançamento', api: '/lancamentos', tabelaImport: 'lancamentos', papel: 'curador',
  campos: CAMPOS_LANCAMENTO, eventos: true,
  colunas: [
    { id: 'nome', label: 'Nome', filtro: filtroTexto('Buscar nome, incorporadora…') },
    { id: 'incorporadora', label: 'Incorporadora', largura: '180px' },
    { id: 'localidade_nome', label: 'Localidade', largura: '150px' },
    { id: 'estagio_vendas', label: 'Estágio', largura: '140px', valor: (l: any) => (l.estagio_vendas ?? '—').replace(/_/g, ' '), filtro: filtroSelect(ESTAGIOS_VENDA) },
    { id: 'preco_atual_brl', label: 'A partir de', largura: '130px', alinhamento: 'direita', valor: (l: any) => brl(l.preco_atual_brl) },
    { id: 'espacial_utilizavel', label: 'No mapa', largura: '90px', valor: (l: any) => (l.espacial_utilizavel ? 'sim' : 'não') },
  ],
  query: (f) => ({ q: f.nome ?? '', estagio_vendas: f.estagio_vendas ?? '' }),
  tituloFicha: (l) => l.nome,
  blocosFicha: (l) => html`<urbi-card titulo="Localização">
    ${l.espacial_utilizavel
      ? html`<intel-imob-mini-mapa .latitude=${Number(l.latitude)} .longitude=${Number(l.longitude)} rotulo=${l.nome}></intel-imob-mini-mapa>`
      : html`<urbi-prosa papel="dica">Sem coordenada utilizável: fora do mapa.</urbi-prosa>`}
    ${Array.isArray(l.lacunas) && l.lacunas.length ? html`<urbi-banner variante="alerta">Lacunas: ${l.lacunas.join(', ')}.</urbi-banner>` : nothing}
  </urbi-card>`,
};

// ------------------------------------------------------------------- âncoras

const CAMPOS_ANCORA: CampoFicha[] = [
  { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, criar: true, editar: true },
  { nome: 'categoria', rotulo: 'Categoria', tipo: 'selecao', opcoes: op(CATEGORIAS_ANCORA, ROTULO_CATEGORIA_ANCORA), obrigatorio: true, criar: true, editar: true },
  { nome: 'subcategoria', rotulo: 'Subcategoria', tipo: 'texto', obrigatorio: true, criar: true, editar: true },
  { nome: 'grupo', rotulo: 'Grupo (derivado da categoria)', tipo: 'selecao', opcoes: op(['infraestrutura', 'comercio_servico'], { comercio_servico: 'comércio e serviço' }), editar: true },
  { nome: 'operador', rotulo: 'Operador', tipo: 'texto', obrigatorio: true, criar: true, editar: true },
  { nome: 'latitude', rotulo: 'Latitude', tipo: 'numero', obrigatorio: true, criar: true, editar: true },
  { nome: 'longitude', rotulo: 'Longitude', tipo: 'numero', obrigatorio: true, criar: true, editar: true },
  { nome: 'url_fonte', rotulo: 'Fonte', tipo: 'url', obrigatorio: true, criar: true, editar: true },
  { nome: 'localidade_id', rotulo: 'Localidade', tipo: 'localidade', criar: true, editar: true, mostrar: 'localidade_nome' },
  { nome: 'status', rotulo: 'Status', tipo: 'selecao', opcoes: op(['ativa', 'inativa', 'prevista']), editar: true },
  { nome: 'segmento', rotulo: 'Segmento', tipo: 'texto', editar: true, nivel: 'complementar' },
  { nome: 'marca', rotulo: 'Marca', tipo: 'texto', editar: true, nivel: 'complementar' },
  { nome: 'endereco', rotulo: 'Endereço', tipo: 'texto', editar: true, nivel: 'complementar' },
  { nome: 'escala_capacidade', rotulo: 'Escala/capacidade', tipo: 'texto', editar: true, nivel: 'complementar' },
  { nome: 'area_ocupada_m2', rotulo: 'Área ocupada', tipo: 'm2', editar: true, nivel: 'complementar' },
  { nome: 'precisao_coordenada', rotulo: 'Precisão da coordenada', tipo: 'texto', editar: true, nivel: 'tecnico' },
  { nome: 'url_fonte_coordenada', rotulo: 'Fonte da coordenada', tipo: 'url', editar: true, nivel: 'tecnico' },
  { nome: 'confianca', rotulo: 'Confiança', tipo: 'texto', editar: true, nivel: 'tecnico' },
  { nome: 'verificado_em', rotulo: 'Verificado em', tipo: 'data', editar: true, nivel: 'tecnico' },
  { nome: 'id_legado', rotulo: 'Id na planilha', tipo: 'texto', nivel: 'tecnico' },
];

export const CONFIG_ANCORAS: ConfigCadastro = {
  id: 'ancoras', objeto: 'ancora', titulo: 'Âncoras', singular: 'Âncora', api: '/ancoras', tabelaImport: 'ancoras', papel: 'curador', campos: CAMPOS_ANCORA,
  colunas: [
    { id: 'nome', label: 'Nome', filtro: filtroTexto('Buscar nome, operador…') },
    { id: 'categoria', label: 'Categoria', largura: '190px', valor: (l: any) => ROTULO_CATEGORIA_ANCORA[l.categoria] ?? l.categoria, filtro: filtroSelect(CATEGORIAS_ANCORA, ROTULO_CATEGORIA_ANCORA, 'Todas') },
    { id: 'operador', label: 'Operador', largura: '180px' },
    { id: 'localidade_nome', label: 'Localidade', largura: '150px' },
    { id: 'status', label: 'Status', largura: '100px' },
  ],
  query: (f) => ({ q: f.nome ?? '', categoria: f.categoria ?? '' }),
  tituloFicha: (l) => l.nome,
  blocosFicha: (l) => html`<urbi-card titulo="Localização"><intel-imob-mini-mapa .latitude=${Number(l.latitude)} .longitude=${Number(l.longitude)} rotulo=${l.nome}></intel-imob-mini-mapa></urbi-card>`,
};

// ----------------------------------------------------------------- contornos

const CAMPOS_CONTORNO: CampoFicha[] = [
  { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, editar: true },
  { nome: 'categoria', rotulo: 'Categoria', tipo: 'texto', editar: true },
  { nome: 'localidade_id', rotulo: 'Localidade', tipo: 'localidade', editar: true },
  { nome: 'status', rotulo: 'Status', tipo: 'selecao', opcoes: op(['ativo', 'inativo']), editar: true },
  { nome: 'area_m2', rotulo: 'Área (aproximada)', tipo: 'm2' },
  { nome: 'perimetro_m', rotulo: 'Perímetro/comprimento (aproximado, m)', tipo: 'numero' },
  { nome: 'tipo_entidade', rotulo: 'Tipo', tipo: 'texto', nivel: 'complementar' },
  { nome: 'grupo_camada', rotulo: 'Grupo da camada', tipo: 'texto', nivel: 'complementar' },
  { nome: 'ordem_camada', rotulo: 'Ordem na camada', tipo: 'numero', editar: true, nivel: 'complementar' },
  { nome: 'estilo', rotulo: 'Estilo (JSON: preenchimento, contorno, espessura…)', tipo: 'json', editar: true, nivel: 'complementar' },
  { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto_longo', editar: true, nivel: 'complementar' },
  { nome: 'vigente_de', rotulo: 'Vigente de', tipo: 'data', nivel: 'complementar' },
  { nome: 'vigente_ate', rotulo: 'Vigente até', tipo: 'data', editar: true, nivel: 'complementar' },
  { nome: 'geometria_tipo', rotulo: 'Geometria', tipo: 'texto', nivel: 'tecnico' },
  { nome: 'fonte_arquivo', rotulo: 'Arquivo de origem', tipo: 'texto', nivel: 'tecnico' },
  { nome: 'fonte_url', rotulo: 'Fonte', tipo: 'url', nivel: 'tecnico' },
  { nome: 'geometria_hash', rotulo: 'Hash da geometria', tipo: 'texto', nivel: 'tecnico' },
  { nome: 'id_legado', rotulo: 'Id na planilha', tipo: 'texto', nivel: 'tecnico' },
];

export const CONFIG_CONTORNOS: ConfigCadastro = {
  id: 'contornos', objeto: 'contorno', titulo: 'Contornos', singular: 'Contorno', api: '/contornos', apiLista: '/contornos', tabelaImport: 'contornos', papel: 'curador',
  campos: CAMPOS_CONTORNO,
  colunas: [
    { id: 'nome', label: 'Nome', filtro: filtroTexto('Buscar nome…') },
    { id: 'grupo_camada', label: 'Grupo', largura: '190px', filtro: filtroSelect(['administrative_regions', 'poligonais_importadas', 'poligonais_desenhadas', 'road_segments'], { administrative_regions: 'Regiões administrativas', poligonais_importadas: 'Importadas', poligonais_desenhadas: 'Desenhadas', road_segments: 'Trechos rodoviários' }) },
    { id: 'geometria_tipo', label: 'Geometria', largura: '130px' },
    { id: 'area_m2', label: 'Área', largura: '130px', alinhamento: 'direita', valor: (l: any) => formatar({ tipo: 'm2' }, l.area_m2) },
    { id: 'status', label: 'Status', largura: '100px', filtro: filtroSelect(['ativo', 'inativo']) },
  ],
  query: (f) => ({ formato: 'lista', q: f.nome ?? '', grupo: f.grupo_camada ?? '', status: f.status ?? '' }),
  tituloFicha: (l) => l.nome,
  acoesLista: () => (temPapel('curador') ? html`<intel-imob-contornos-acoes></intel-imob-contornos-acoes>` : nothing),
  blocosFicha: (l) => html`<urbi-card titulo="Geometria"><intel-imob-mini-mapa .geometria=${l.geometria} rotulo=${l.nome}></intel-imob-mini-mapa></urbi-card>`,
};

/** Botões de contorno na lista: importar KML/KMZ e desenhar (spec 10.6). */
export class IntelImobContornosAcoes extends LitElement {
  @state() private aberto: '' | 'importar' | 'desenhar' = '';
  render() {
    return html`
      <urbi-botao variante="secundario" icone="fa-solid fa-map" @click=${() => (this.aberto = this.aberto === 'importar' ? '' : 'importar')}>KML/KMZ</urbi-botao>
      <urbi-botao variante="secundario" icone="fa-solid fa-draw-polygon" @click=${() => (this.aberto = this.aberto === 'desenhar' ? '' : 'desenhar')}>Desenhar</urbi-botao>
      ${this.aberto
        ? html`<urbi-modal title=${this.aberto === 'importar' ? 'Importar KML, KMZ ou GeoJSON' : 'Desenhar contorno'} maxWidth="860px" @urbi-modal:close=${() => (this.aberto = '')}>
            ${this.aberto === 'importar'
              ? html`<intel-imob-contornos-importar @intel-imob:importacao-aplicada=${() => { this.aberto = ''; uv().navegarSub('/cadastro/contornos'); }}></intel-imob-contornos-importar>`
              : html`<intel-imob-contorno-desenhar></intel-imob-contorno-desenhar>`}
          </urbi-modal>`
        : nothing}
    `;
  }
}
definir('intel-imob-contornos-acoes', IntelImobContornosAcoes);

// --------------------------------------------------------------- localidades

const CAMPOS_LOCALIDADE: CampoFicha[] = [
  { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, criar: true, editar: true },
  { nome: 'codigo', rotulo: 'Código', tipo: 'texto', obrigatorio: true, criar: true },
  { nome: 'tipo', rotulo: 'Tipo', tipo: 'selecao', opcoes: op(['submercado', 'bairro', 'municipio', 'agregado']), obrigatorio: true, criar: true },
  { nome: 'localidade_pai_id', rotulo: 'Localidade pai', tipo: 'localidade', criar: true, editar: true },
  { nome: 'codigo_romano', rotulo: 'Código romano', tipo: 'texto' },
  { nome: 'codigo_legado', rotulo: 'Código legado (planilha)', tipo: 'texto' },
  { nome: 'area_km2', rotulo: 'Área oficial (km²)', tipo: 'numero' },
  { nome: 'nome_fonte', rotulo: 'Nome na fonte', tipo: 'texto', editar: true, nivel: 'complementar' },
  { nome: 'classificacao_fonte', rotulo: 'Classificação na fonte', tipo: 'texto', editar: true, nivel: 'complementar' },
  { nome: 'notas', rotulo: 'Notas', tipo: 'texto_longo', editar: true, nivel: 'complementar' },
  { nome: 'ponto_referencia_latitude', rotulo: 'Ponto de referência — latitude', tipo: 'numero', editar: true, nivel: 'tecnico' },
  { nome: 'ponto_referencia_longitude', rotulo: 'Ponto de referência — longitude', tipo: 'numero', editar: true, nivel: 'tecnico' },
  { nome: 'qualidade', rotulo: 'Qualidade', tipo: 'texto', editar: true, nivel: 'tecnico' },
];

const ROTULO_TIPO_LOC: Record<string, string> = { ra: 'RA', submercado: 'Submercado', bairro: 'Bairro', municipio: 'Município', agregado: 'Agregado' };

export const CONFIG_LOCALIDADES: ConfigCadastro = {
  id: 'localidades', titulo: 'Localidades', singular: 'Localidade', api: '/localidades', tabelaImport: 'localidades', papel: 'curador', campos: CAMPOS_LOCALIDADE, removivel: false,
  colunas: [
    { id: 'nome', label: 'Nome', filtro: filtroTexto('Buscar nome ou código…') },
    { id: 'codigo', label: 'Código', largura: '120px' },
    { id: 'tipo', label: 'Tipo', largura: '130px', valor: (l: any) => ROTULO_TIPO_LOC[l.tipo] ?? l.tipo, filtro: filtroSelect(['ra', 'submercado', 'bairro', 'municipio', 'agregado'], ROTULO_TIPO_LOC) },
    { id: 'populacao', label: 'População', largura: '120px', alinhamento: 'direita', valor: (l: any) => formatar({ tipo: 'numero' }, l.perfil?.populacao_total) },
    { id: 'contorno', label: 'Contorno', largura: '100px', valor: (l: any) => (l.contorno_id ? 'sim' : 'não') },
  ],
  query: (f) => ({ q: f.nome ?? '', tipo: f.tipo ?? '' }),
  tituloFicha: (l) => `${l.nome} (${l.codigo})`,
  blocosFicha: (l) => html`<urbi-card titulo="Perfis e contagens">
    <urbi-grid min="140px">
      ${Object.entries(l.contagens ?? {}).map(([k, v]) => html`<urbi-kpi rotulo=${k.replace(/_/g, ' ')} .valor=${v}></urbi-kpi>`)}
      ${l.perfil ? html`<urbi-kpi rotulo=${`População (${l.perfil.ano_referencia})`} .valor=${l.perfil.populacao_total ?? '—'}></urbi-kpi>
        <urbi-kpi rotulo="Renda per capita" formato="texto" .valor=${formatar({ tipo: 'brl' }, l.perfil.renda_per_capita_brl)}></urbi-kpi>` : nothing}
    </urbi-grid>
    ${!l.perfil ? html`<urbi-prosa papel="dica">Sem perfil importado. Importe a aba RA_PROFILES em Operação › Importações (tabela "Perfis das localidades").</urbi-prosa>` : nothing}
  </urbi-card>`,
};

// -------------------------------------------------------------------- fontes

export const CONFIG_FONTES: ConfigCadastro = {
  id: 'fontes', titulo: 'Fontes', singular: 'Fonte', api: '/fontes', tabelaImport: 'fontes_portal', papel: 'operador',
  campos: [
    { nome: 'nome', rotulo: 'Nome do portal', tipo: 'texto', obrigatorio: true, criar: true, editar: true },
    { nome: 'url_base', rotulo: 'URL base (http/https, porta padrão)', tipo: 'url', obrigatorio: true, criar: true, editar: true },
    { nome: 'tipo', rotulo: 'Tipo', tipo: 'selecao', opcoes: op(['portal', 'agregador', 'manual']), criar: true, editar: true },
    { nome: 'ativa', rotulo: 'Coleta ativa', tipo: 'booleano', editar: true },
    { nome: 'frequencia', rotulo: 'Frequência', tipo: 'selecao', opcoes: op(['diaria', 'semanal', 'manual'], { diaria: 'diária' }), editar: true },
    { nome: 'estado', rotulo: 'Estado', tipo: 'texto' },
    { nome: 'slug', rotulo: 'Identificador', tipo: 'texto', nivel: 'tecnico' },
    { nome: 'parser', rotulo: 'Parser', tipo: 'texto', nivel: 'tecnico' },
    { nome: 'notas', rotulo: 'Notas', tipo: 'texto_longo', editar: true, nivel: 'complementar' },
  ],
  colunas: [
    { id: 'nome', label: 'Portal', filtro: filtroTexto('Buscar…') },
    { id: 'url_base', label: 'URL base' },
    { id: 'ativa', label: 'Coleta', largura: '100px', valor: (l: any) => (l.ativa ? 'ativa' : 'parada') },
    { id: 'estado', label: 'Estado', largura: '110px' },
  ],
  query: (f) => ({ q: f.nome ?? '' }),
  tituloFicha: (l) => l.nome,
};

const ABAS: ConfigCadastro[] = [CONFIG_ANUNCIOS, CONFIG_LANCAMENTOS, CONFIG_ANCORAS, CONFIG_CONTORNOS, CONFIG_LOCALIDADES, CONFIG_FONTES];

/** Abas extras registradas por fases seguintes (atributos, vínculos com o núcleo). */
export const ABAS_EXTRAS: { id: string; label: string; icone: string; render: (sub: string[]) => unknown }[] = [
  { id: 'atributos', label: 'Atributos', icone: 'fa-solid fa-list-check', render: () => html`<intel-imob-atributos-catalogo></intel-imob-atributos-catalogo>` },
  { id: 'vinculos', label: 'Vínculos com o núcleo', icone: 'fa-solid fa-link', render: () => html`<intel-imob-vinculos-lista></intel-imob-vinculos-lista>` },
];

const ICONES: Record<string, string> = {
  anuncios: 'fa-solid fa-tag', lancamentos: 'fa-solid fa-building', ancoras: 'fa-solid fa-anchor', contornos: 'fa-solid fa-draw-polygon',
  localidades: 'fa-solid fa-location-dot', fontes: 'fa-solid fa-globe',
};

/** Área Cadastro (spec 10.6): uma aba por cadastro, cada uma na sua sub-rota (D-86). */
export class IntelImobCadastro extends LitElement {
  static styles = [estiloPrimitivo];
  @property() sub = '/cadastro';

  render() {
    const partes = this.sub.split('?')[0].split('/');
    const aba = partes[2] || 'anuncios';
    const id = Number(partes[3]) || 0;
    const abas = [...ABAS.map((c) => ({ id: c.id, label: c.titulo, icone: ICONES[c.id] })), ...ABAS_EXTRAS.map((a) => ({ id: a.id, label: a.label, icone: a.icone }))];
    return html`
      <urbi-shell-page titulo="Cadastro" dashboard>
        <intel-imob-como-ler slot="actions" tela="cadastro"></intel-imob-como-ler>
        <urbi-abas .abas=${abas} ativa=${aba} @urbi:aba-selecionar=${(e: CustomEvent) => uv().navegarSub(`/cadastro/${e.detail.id}`)}>
          ${ABAS.map((c) => html`<div slot=${c.id}>
            ${c.id !== aba
              ? nothing
              : id
                ? html`<intel-imob-cadastro-ficha .config=${c} .registroId=${id}></intel-imob-cadastro-ficha>`
                : html`<intel-imob-cadastro-lista .config=${c}></intel-imob-cadastro-lista>`}
          </div>`)}
          ${ABAS_EXTRAS.map((a) => html`<div slot=${a.id}>${a.id === aba ? a.render(partes.slice(3)) : nothing}</div>`)}
        </urbi-abas>
      </urbi-shell-page>
    `;
  }
}
definir('intel-imob-cadastro', IntelImobCadastro);
