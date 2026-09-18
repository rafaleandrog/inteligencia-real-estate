// Ícones das âncoras no mapa e na legenda (issue #112).
//
// Glifos do Lucide (https://lucide.dev), versão 1.47.0, licença ISC — texto completo em
// `assets/vendor/lucide/LICENSE`. Só os traços de que o mapa precisa vivem aqui, como
// dados: cada ícone é uma lista de nós SVG `[tag, atributos]` dentro de um `viewBox`
// de 24×24, sem `<svg>` em volta. Quem desenha (`src/app.js`) monta os elementos com
// `createElementNS`, nunca com `innerHTML` (R4.4) — e por isso este módulo não toca o
// DOM e pode ser importado pelos testes.
//
// Por que não uma fonte de ícones nem um plugin do Leaflet: seriam centenas de kB
// vendorizados para vinte e poucos glifos (R1.5), e continuaríamos sem controle da cor
// por família, que é o que a legenda usa para dizer "isto é saúde, aquilo é ensino".
// Por que não emoji: renderiza diferente em cada sistema e não aceita cor.
//
// Os traços do Lucide são desenhados para `stroke="currentColor"`, `stroke-width="2"`,
// pontas e junções arredondadas, sem preenchimento. Esses atributos ficam no `<svg>`
// que o desenhador cria, não aqui, para não repeti-los em cada nó.

/** Ícone genérico da âncora sem classificação reconhecida (mesmo papel do verde padrão). */
export const ANCHOR_FALLBACK_ICON = 'map-pin';

/** `nome` → lista de `[tag, atributos]`, na ordem de desenho. */
export const ANCHOR_ICONS = {
  // Mobilidade.
  'train-front': [
    ['path', { d: 'M8 3.1V7a4 4 0 0 0 8 0V3.1' }],
    ['path', { d: 'm9 15-1-1' }],
    ['path', { d: 'm15 15 1-1' }],
    ['path', { d: 'M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z' }],
    ['path', { d: 'm8 19-2 3' }],
    ['path', { d: 'm16 19 2 3' }],
  ],
  'tram-front': [
    ['rect', { width: '16', height: '16', x: '4', y: '3', rx: '2' }],
    ['path', { d: 'M4 11h16' }],
    ['path', { d: 'M12 3v8' }],
    ['path', { d: 'm8 19-2 3' }],
    ['path', { d: 'm18 22-2-3' }],
    ['path', { d: 'M8 15h.01' }],
    ['path', { d: 'M16 15h.01' }],
  ],
  plane: [
    ['path', { d: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z' }],
  ],
  bus: [
    ['path', { d: 'M8 6v6' }],
    ['path', { d: 'M15 6v6' }],
    ['path', { d: 'M2 12h19.6' }],
    ['path', { d: 'M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3' }],
    ['circle', { cx: '7', cy: '18', r: '2' }],
    ['path', { d: 'M9 18h5' }],
    ['circle', { cx: '16', cy: '18', r: '2' }],
  ],
  'bus-front': [
    ['path', { d: 'M4 6 2 7' }],
    ['path', { d: 'M10 6h4' }],
    ['path', { d: 'm22 7-2-1' }],
    ['rect', { width: '16', height: '16', x: '4', y: '3', rx: '2' }],
    ['path', { d: 'M4 11h16' }],
    ['path', { d: 'M8 15h.01' }],
    ['path', { d: 'M16 15h.01' }],
    ['path', { d: 'M6 19v2' }],
    ['path', { d: 'M18 21v-2' }],
  ],
  // Educação e cultura.
  school: [
    ['path', { d: 'M14 21v-3a2 2 0 0 0-4 0v3' }],
    ['path', { d: 'M18 4.933V21' }],
    ['path', { d: 'm4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6' }],
    ['path', { d: 'm6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11' }],
    ['path', { d: 'M6 4.933V21' }],
    ['circle', { cx: '12', cy: '9', r: '2' }],
  ],
  landmark: [
    ['path', { d: 'M10 18v-7' }],
    ['path', { d: 'M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z' }],
    ['path', { d: 'M14 18v-7' }],
    ['path', { d: 'M18 18v-7' }],
    ['path', { d: 'M3 22h18' }],
    ['path', { d: 'M6 18v-7' }],
  ],
  'book-open': [
    ['path', { d: 'M12 5v16' }],
    ['path', { d: 'M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z' }],
  ],
  // Saúde.
  cross: [
    ['path', { d: 'M4 9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h4a1 1 0 0 1 1 1v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a1 1 0 0 1 1-1h4a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-4a1 1 0 0 1-1-1V4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4a1 1 0 0 1-1 1z' }],
  ],
  stethoscope: [
    ['path', { d: 'M11 2v2' }],
    ['path', { d: 'M5 2v2' }],
    ['path', { d: 'M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1' }],
    ['path', { d: 'M8 15a6 6 0 0 0 12 0v-3' }],
    ['circle', { cx: '20', cy: '10', r: '2' }],
  ],
  'flask-conical': [
    ['path', { d: 'M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2' }],
    ['path', { d: 'M6.453 15h11.094' }],
    ['path', { d: 'M8.5 2h7' }],
  ],
  // Abastecimento.
  'shopping-cart': [
    ['path', { d: 'm2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18' }],
    ['path', { d: 'M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25' }],
    ['circle', { cx: '18', cy: '20', r: '2' }],
    ['circle', { cx: '8', cy: '20', r: '2' }],
  ],
  warehouse: [
    ['path', { d: 'M18 21V10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v11' }],
    ['path', { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 1.132-1.803l7.95-3.974a2 2 0 0 1 1.837 0l7.948 3.974A2 2 0 0 1 22 8z' }],
    ['path', { d: 'M6 13h12' }],
    ['path', { d: 'M6 17h12' }],
  ],
  fuel: [
    ['path', { d: 'M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5' }],
    ['path', { d: 'M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16' }],
    ['path', { d: 'M2 21h13' }],
    ['path', { d: 'M3 9h11' }],
  ],
  // Varejo.
  'shopping-bag': [
    ['path', { d: 'M16 10a4 4 0 0 1-8 0' }],
    ['path', { d: 'M3.103 6.034h17.794' }],
    ['path', { d: 'M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z' }],
  ],
  store: [
    ['path', { d: 'M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5' }],
    ['path', { d: 'M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244' }],
    ['path', { d: 'M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05' }],
  ],
  shirt: [
    ['path', { d: 'M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z' }],
  ],
  armchair: [
    ['path', { d: 'M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3' }],
    ['path', { d: 'M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z' }],
    ['path', { d: 'M5 18v2' }],
    ['path', { d: 'M19 18v2' }],
  ],
  volleyball: [
    ['path', { d: 'M11 7a16 16 20 0 1 10.98 4.362' }],
    ['path', { d: 'M12 12a13 13 0 0 1-8.66 5' }],
    ['path', { d: 'M16.83 13.634a16 16 0 0 1-9.267 7.328' }],
    ['path', { d: 'M20.66 17A13 13 0 0 0 12 12a13 13 0 0 1 0-10' }],
    ['path', { d: 'M8.17 15.366a16 16 0 0 1-1.713-11.69' }],
    ['circle', { cx: '12', cy: '12', r: '10' }],
  ],
  'paw-print': [
    ['circle', { cx: '11', cy: '4', r: '2' }],
    ['circle', { cx: '18', cy: '8', r: '2' }],
    ['circle', { cx: '20', cy: '16', r: '2' }],
    ['path', { d: 'M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z' }],
  ],
  // Construção e reforma.
  'brick-wall': [
    ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }],
    ['path', { d: 'M12 9v6' }],
    ['path', { d: 'M16 15v6' }],
    ['path', { d: 'M16 3v6' }],
    ['path', { d: 'M3 15h18' }],
    ['path', { d: 'M3 9h18' }],
    ['path', { d: 'M8 15v6' }],
    ['path', { d: 'M8 3v6' }],
  ],
  // Lazer, alimentação e hospedagem.
  clapperboard: [
    ['path', { d: 'm12.296 3.464 3.02 3.956' }],
    ['path', { d: 'M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z' }],
    ['path', { d: 'M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }],
    ['path', { d: 'm6.18 5.276 3.1 3.899' }],
  ],
  dumbbell: [
    ['path', { d: 'M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z' }],
    ['path', { d: 'm2.5 21.5 1.4-1.4' }],
    ['path', { d: 'm20.1 3.9 1.4-1.4' }],
    ['path', { d: 'M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z' }],
    ['path', { d: 'm9.6 14.4 4.8-4.8' }],
  ],
  utensils: [
    ['path', { d: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2' }],
    ['path', { d: 'M7 2v20' }],
    ['path', { d: 'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7' }],
  ],
  bed: [
    ['path', { d: 'M2 4v16' }],
    ['path', { d: 'M2 8h18a2 2 0 0 1 2 2v10' }],
    ['path', { d: 'M2 17h20' }],
    ['path', { d: 'M6 8v9' }],
  ],
  // Equipamento público.
  trees: [
    ['path', { d: 'M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z' }],
    ['path', { d: 'M7 16v6' }],
    ['path', { d: 'M13 19v3' }],
    ['path', { d: 'M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5' }],
  ],
  // Sem classificação.
  'map-pin': [
    ['path', { d: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0' }],
    ['circle', { cx: '12', cy: '10', r: '3' }],
  ],
};
