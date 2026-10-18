/**
 * Áreas da app e se já estão disponíveis. Fonte única para o Início (backend)
 * e o roteador (frontend). Ao entregar uma área, troque `disponivel` aqui.
 */
export interface AreaApp {
  rota: string;
  titulo: string;
  icone: string;
  descricao: string;
  disponivel: boolean;
  quando: string;
}

export const AREAS: AreaApp[] = [
  { rota: '/mapa', titulo: 'Mapa', icone: 'fa-solid fa-map-location-dot', descricao: 'Anúncios, lançamentos, âncoras e contornos no território.', disponivel: false, quando: 'Entra na fase 1c do MVP.' },
  { rota: '/mercado', titulo: 'Mercado', icone: 'fa-solid fa-chart-line', descricao: 'IVV, IVV regional e FipeZap, com séries e derivados.', disponivel: false, quando: 'Entra na fase 2 do MVP.' },
  { rota: '/diagnostico', titulo: 'Diagnóstico', icone: 'fa-solid fa-city', descricao: 'Perfil territorial, ranking, comparação e base de dados da PDAD.', disponivel: false, quando: 'Entra na fase 2 do MVP.' },
  { rota: '/estudos', titulo: 'Estudos de área', icone: 'fa-solid fa-draw-polygon', descricao: 'Áreas de estudo por desenho ou KMZ, ligadas ao núcleo.', disponivel: false, quando: 'O cadastro mínimo de áreas entra na fase 15.1b.' },
  { rota: '/produto', titulo: 'Produto', icone: 'fa-solid fa-building', descricao: 'Demanda e produto.', disponivel: false, quando: 'Fora do MVP (fase 4B).' },
  { rota: '/comercio', titulo: 'Comércio e âncoras', icone: 'fa-solid fa-store', descricao: 'Comércio e âncoras.', disponivel: false, quando: 'Fora do MVP (fase 7).' },
  { rota: '/terra', titulo: 'Terra e oferta futura', icone: 'fa-solid fa-mountain-sun', descricao: 'Terra e oferta futura.', disponivel: false, quando: 'Fora do MVP (fase 4B).' },
  { rota: '/analises', titulo: 'Análises', icone: 'fa-solid fa-wand-magic-sparkles', descricao: 'Análises por IA.', disponivel: false, quando: 'Fora do MVP (fase 5).' },
  { rota: '/cadastro', titulo: 'Cadastro', icone: 'fa-solid fa-pen-ruler', descricao: 'Anúncios, lançamentos, âncoras, contornos e localidades.', disponivel: true, quando: 'Entra na fase 1b do MVP.' },
  { rota: '/operacao', titulo: 'Operação', icone: 'fa-solid fa-gears', descricao: 'Importações e qualidade dos dados.', disponivel: true, quando: 'Entra na fase 1a do MVP.' },
];
