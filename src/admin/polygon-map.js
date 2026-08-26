// Superfície de desenho de contornos na área administrativa (issue #37).
//
// O desenho é feito com primitivas do Leaflet que já estão vendorizadas — clique
// acrescenta um vértice, uma polilinha liga os vértices, um marcador marca cada canto.
// **Nenhuma biblioteca de desenho foi introduzida**: este projeto não tem etapa de
// build, então cada dependência nova é um arquivo a mais para manter à mão em
// `assets/vendor/`. Um desenho de polígono simples não justifica esse custo.
//
// A geometria — a parte que pode estar errada em silêncio — vive em
// `src/admin/polygon-draw.js`, que é pura e testada contra o Code.gs real. Aqui só
// existe o que precisa de DOM e de mapa.

import { buildPolygonGeoJSON, validateRing, ringFromLatLngs } from './polygon-draw.js';

const VERTEX_COLOR = '#b8442f';

/**
 * Cria o controlador do desenho. `onChange(state)` é chamado a cada alteração, com
 * `{ count, valid, message }` — quem chama decide como refletir isso nos botões.
 */
export function createPolygonDrawer(container, { center, zoom, onChange } = {}) {
  const map = L.map(container, {
    center: center || [-15.78, -47.93],
    zoom: zoom || 10,
    zoomControl: true,
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; colaboradores do <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
  }).addTo(map);

  const shapeLayer = L.layerGroup().addTo(map);
  const vertices = [];
  let color = '#5b6b8c';

  function notify() {
    const ring = ringFromLatLngs(vertices);
    const message = validateRing(ring);
    onChange?.({
      count: vertices.length,
      valid: message === null,
      // Enquanto ninguém clicou, a "mensagem de erro" seria só ruído: a tela já traz
      // a instrução de como começar. Erro só depois que existe um desenho para julgar.
      message: vertices.length === 0 ? null : message,
    });
  }

  function redraw() {
    shapeLayer.clearLayers();
    if (vertices.length === 0) return;

    const latlngs = vertices.map((v) => [v.lat, v.lng]);

    // Com três ou mais cantos já dá para mostrar a ÁREA fechada, não só a linha: é o
    // que a pessoa vai salvar, e ver o resultado antes de salvar é o ponto de desenhar
    // no mapa em vez de digitar coordenada.
    if (vertices.length >= 3) {
      L.polygon(latlngs, {
        className: 'polygon-draft',
        color, weight: 2, opacity: 0.9, fillColor: color, fillOpacity: 0.15,
      }).addTo(shapeLayer);
    } else {
      L.polyline(latlngs, { className: 'polygon-draft', color, weight: 2, opacity: 0.9 })
        .addTo(shapeLayer);
    }

    vertices.forEach((vertex, i) => {
      L.circleMarker([vertex.lat, vertex.lng], {
        className: 'polygon-vertex',
        radius: 5, color: '#fff', weight: 2,
        fillColor: VERTEX_COLOR, fillOpacity: 1,
      })
        // Clicar no primeiro canto é o gesto natural de "fechar aqui". Como o anel é
        // fechado por código, o que ele faz é confirmar — não acrescenta um vértice
        // duplicado, que geraria posição repetida sem aumentar a área.
        .on('click', (event) => {
          L.DomEvent.stopPropagation(event);
          if (i === 0 && vertices.length >= 3) onChange?.({ requestSave: true });
        })
        .addTo(shapeLayer);
    });
  }

  map.on('click', (event) => {
    vertices.push({ lat: event.latlng.lat, lng: event.latlng.lng });
    redraw();
    notify();
  });

  return {
    /** Remove o último canto marcado. */
    undo() {
      vertices.pop();
      redraw();
      notify();
    },
    /** Apaga o desenho inteiro. */
    clear() {
      vertices.length = 0;
      redraw();
      notify();
    },
    /** Troca a cor do rascunho, para combinar com a cor escolhida no formulário. */
    setColor(next) {
      color = next || '#5b6b8c';
      redraw();
    },
    /** Cópia dos vértices — quem chama não altera o estado interno por engano. */
    latlngs() {
      return vertices.map((v) => ({ ...v }));
    },
    geometry() {
      return buildPolygonGeoJSON(vertices);
    },
    /** O Leaflet mede o container na criação; se ele estava `hidden`, mede zero. */
    refresh() {
      map.invalidateSize();
    },
  };
}
