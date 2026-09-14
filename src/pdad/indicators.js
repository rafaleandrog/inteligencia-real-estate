// Registro de indicadores do PDAD_A_DATA lidos pela tela Diagnóstico (issue #100/#102).
//
// `PDAD_A_DATA` publica 39 `indicator_code` distintos (extração longa do PDAD-A). Este
// registro declara os 30 que formam os cartões da tela — o mesmo recorte do protótipo
// de referência (`METRICS`/`VIZ`), com `indicator_code` no lugar do `field` interno que
// o protótipo usava sobre dado já pré-agregado.
//
// Fora daqui, de propósito — a linha continua sendo lida e normalizada, só não vira
// card: `labor_force_status`, `internet_type`, `internet_access_any` (perguntas
// relacionadas às já mapeadas — `pea_status`, `internet_access` — evita duas leituras
// do mesmo tema na tela), `domestic_services_frequency` (5 linhas) e
// `lot_regularization` (3 linhas, `figure_number` não numérico "A71").

/** Temas exibidos, na ordem de leitura da tela — mesmos grupos do protótipo. */
export const PDAD_TEMAS = Object.freeze({
  moradores: 'Moradores',
  saude: 'Saúde',
  educacao: 'Educação',
  trabalho: 'Trabalho',
  domicilios: 'Domicílios',
  infra: 'Infraestrutura',
  economia: 'Consumo e centralidade',
});

/**
 * `indicator_code` (chave da planilha) -> descrição de exibição.
 *
 * `key` é o identificador interno curto usado pelo agregador e pela tela — existe para
 * não espalhar `indicator_code` por toda parte, do mesmo jeito que `src/ivv/region.js`
 * usa `campo` em vez do nome de coluna cru. Os cinco `purchase_*` compartilham a chave
 * `shopping`: são a mesma Figura 59 fatiada por tipo de compra (ver `SHOPPING_GROUP_BY_CODE`).
 */
export const PDAD_INDICATORS = Object.freeze({
  age_sex_distribution: { key: 'age', tema: 'moradores', label: 'Faixa etária', unit: '% da população' },
  marital_status: { key: 'marital', tema: 'moradores', label: 'Estado civil', unit: '% dos moradores' },
  drivers_license: { key: 'cnh', tema: 'moradores', label: 'Carteira de habilitação', unit: '% dos moradores' },
  state_of_origin: { key: 'origin', tema: 'moradores', label: 'Estado de origem', unit: '% dos moradores' },
  move_reason: { key: 'moveReason', tema: 'moradores', label: 'Motivação de mudança', unit: '% dos moradores' },

  health_insurance: { key: 'healthPlan', tema: 'saude', label: 'Plano de saúde', unit: '% dos moradores' },
  healthcare_need_any: { key: 'healthVisit', tema: 'saude', label: 'Atendimento de saúde', unit: '% dos moradores' },
  healthcare_consultation: { key: 'healthNetwork', tema: 'saude', label: 'Rede de atendimento', unit: '% dos moradores' },

  school_transport: { key: 'schoolTransport', tema: 'educacao', label: 'Transporte escolar', unit: '% dos estudantes' },
  school_commute_time: { key: 'schoolTime', tema: 'educacao', label: 'Tempo até a escola', unit: '% dos estudantes' },

  pea_status: { key: 'peaSituation', tema: 'trabalho', label: 'Participação na PEA', unit: '% da população' },
  work_location: { key: 'workLocation', tema: 'trabalho', label: 'Local do trabalho', unit: '% dos trabalhadores' },
  job_position: { key: 'workPosition', tema: 'trabalho', label: 'Posição no trabalho', unit: '% dos trabalhadores' },
  work_regime: { key: 'workRegime', tema: 'trabalho', label: 'Regime de trabalho', unit: '% dos trabalhadores' },
  work_transport: { key: 'workTransport', tema: 'trabalho', label: 'Transporte casa-trabalho', unit: '% dos trabalhadores' },
  work_commute_time: { key: 'workTime', tema: 'trabalho', label: 'Tempo casa-trabalho', unit: '% dos trabalhadores' },

  tenure_status: { key: 'tenure', tema: 'domicilios', label: 'Situação de ocupação', unit: '% dos domicílios' },
  registered_deed: { key: 'deed', tema: 'domicilios', label: 'Escritura registrada', unit: '% dos imóveis próprios' },
  dwelling_type: { key: 'dwelling', tema: 'domicilios', label: 'Tipo de domicílio', unit: '% dos domicílios' },
  dwelling_species: { key: 'dwellingSpecies', tema: 'domicilios', label: 'Espécie do domicílio', unit: '% dos domicílios' },
  household_arrangement: { key: 'householdArrangement', tema: 'domicilios', label: 'Arranjo domiciliar', unit: '% dos domicílios' },
  domestic_services: { key: 'domesticServices', tema: 'domicilios', label: 'Serviços domésticos', unit: '% dos domicílios', multiple: true },
  pets: { key: 'animals', tema: 'domicilios', label: 'Animais no domicílio', unit: '% dos domicílios', multiple: true },

  internet_access: { key: 'internet', tema: 'infra', label: 'Acesso à internet', unit: '% dos domicílios' },
  vehicles: { key: 'vehicles', tema: 'infra', label: 'Posse de veículos', unit: '% dos domicílios', multiple: true },
  water_supply: { key: 'water', tema: 'infra', label: 'Abastecimento de água', unit: '% dos domicílios', multiple: true },
  sewage: { key: 'sewage', tema: 'infra', label: 'Esgotamento sanitário', unit: '% dos domicílios', multiple: true },
  electricity_supply: { key: 'energy', tema: 'infra', label: 'Abastecimento de energia', unit: '% dos domicílios', multiple: true },
  waste_collection: { key: 'waste', tema: 'infra', label: 'Coleta de resíduos', unit: '% dos domicílios', multiple: true },

  purchase_locations: { key: 'shopping', tema: 'economia', label: 'Local de compras', unit: '% das compras publicadas', multiple: true },
  purchase_appliances: { key: 'shopping', tema: 'economia', label: 'Local de compras', unit: '% das compras publicadas', multiple: true },
  purchase_construction: { key: 'shopping', tema: 'economia', label: 'Local de compras', unit: '% das compras publicadas', multiple: true },
  purchase_food: { key: 'shopping', tema: 'economia', label: 'Local de compras', unit: '% das compras publicadas', multiple: true },
  purchase_services: { key: 'shopping', tema: 'economia', label: 'Local de compras', unit: '% das compras publicadas', multiple: true },
});

/**
 * Chave de exibição (`key`) -> tipo de gráfico e opções, mesmo recorte do `VIZ` do
 * protótipo de referência. `cap` é o número de categorias mostradas antes de "+N no
 * drill-down"; `yesOnly` filtra para a resposta afirmativa das perguntas de múltipla
 * escolha (água/esgoto/energia/lixo/animais publicam "categoria · Sim/Não/Não sabe", e
 * só o "Sim" interessa como card resumo — o resto continua no drill-down).
 */
export const PDAD_VIZ = Object.freeze({
  age: { kind: 'columns', span: 2 },
  marital: { kind: 'stack' },
  cnh: { kind: 'donut' },
  origin: { kind: 'hbars', span: 2, cap: 12 },
  moveReason: { kind: 'hbars', cap: 8 },
  healthPlan: { kind: 'donut' },
  healthVisit: { kind: 'donut' },
  healthNetwork: { kind: 'hbars', cap: 6 },
  schoolTransport: { kind: 'hbars', cap: 8 },
  schoolTime: { kind: 'ordline', span: 2 },
  peaSituation: { kind: 'hbars', cap: 6 },
  workLocation: { kind: 'hbars', span: 2, cap: 10 },
  workPosition: { kind: 'hbars', cap: 8 },
  workRegime: { kind: 'donut' },
  workTransport: { kind: 'hbars', cap: 8 },
  workTime: { kind: 'ordline', span: 2 },
  dwellingSpecies: { kind: 'donut' },
  householdArrangement: { kind: 'hbars', cap: 8 },
  dwelling: { kind: 'donut' },
  tenure: { kind: 'pie' },
  deed: { kind: 'donut' },
  domesticServices: { kind: 'hbars', yesOnly: true, cap: 6 },
  water: { kind: 'hbars', cap: 8 },
  sewage: { kind: 'hbars', yesOnly: true, cap: 8 },
  energy: { kind: 'hbars', yesOnly: true, cap: 8 },
  waste: { kind: 'hbars', yesOnly: true, cap: 8 },
  internet: { kind: 'donut' },
  vehicles: { kind: 'hbars', cap: 6 },
  shopping: { kind: 'groups', span: 2, cap: 5 },
  animals: { kind: 'hbars', yesOnly: true, cap: 6 },
});

/**
 * Tempo de deslocamento: ordem cronológica das faixas, para o gráfico `ordline`
 * (colunas + linha acumulada). Vocabulário fechado observado na planilha.
 */
export const PDAD_TIME_ORDER = Object.freeze([
  'Até 15 min',
  'Mais de 15 até 30 minutos',
  'Mais de 30 até 45 minutos',
  'Mais de 45 minutos até 1 hora',
  'Mais de 1 hora até 1 hora e 15 minutos',
  'Mais de 1 hora e 15 minutos até 1 hora e meia',
  'Mais de 1 hora e meia até 1 hora e 45 minutos',
  'Mais de 1 hora e 45 minutos até 2 horas',
  'Mais de 2 horas',
]);

/**
 * `purchase_appliances`/`purchase_construction`/`purchase_food`/`purchase_services` ->
 * nome do grupo (tipo de compra), para agrupar junto de `purchase_locations` — que já
 * publica o tipo de compra como `segment_value`. Os quatro `indicator_code` derivados
 * publicam o tipo pelo próprio código, então o nome de exibição mora aqui.
 */
export const SHOPPING_GROUP_BY_CODE = Object.freeze({
  purchase_appliances: 'Eletrodomésticos',
  purchase_construction: 'Material de construção/manutenção',
  purchase_food: 'Alimentação, higiene e limpeza',
  purchase_services: 'Serviços em geral',
});

/**
 * `purchase_locations` já publica o tipo de compra como `segment_value`, em slug
 * (`alimentacao_higiene_limpeza`). Mesmos quatro grupos de `SHOPPING_GROUP_BY_CODE`,
 * indexados pelo slug em vez do `indicator_code`.
 */
export const SHOPPING_GROUP_TITLE_BY_SLUG = Object.freeze({
  alimentacao_higiene_limpeza: 'Alimentação, higiene e limpeza',
  eletrodomesticos: 'Eletrodomésticos',
  material_construcao_manutencao: 'Material de construção/manutenção',
  servicos_gerais: 'Serviços em geral',
});

/**
 * `indicator_code` cujas linhas são a base dos dois KPIs de contagem.
 *
 * As categorias de `age_sex_distribution` (17 faixas × 2 sexos) somam a população
 * inteira sem sobreposição, e as de `dwelling_type` somam os domicílios ocupados —
 * cada domicílio cai em exatamente uma espécie/tipo. Somar `estimate_total` dessas
 * categorias (excluída a linha `Total` publicada) dá a contagem, sem depender de um
 * `indicator_code` de população/domicílios dedicado, que a planilha não tem.
 */
export const POPULATION_INDICATOR_CODE = 'age_sex_distribution';
export const HOUSEHOLDS_INDICATOR_CODE = 'dwelling_type';

/**
 * Os indicadores agrupados por tema, na ordem de `PDAD_INDICATORS` — é a lista que a
 * tela percorre para desenhar os cartões de um tema. `shopping` entra uma vez só
 * (os cinco `indicator_code` mapeiam para a mesma chave), e na posição da PRIMEIRA
 * ocorrência (`purchase_locations`), para não repetir o cartão cinco vezes.
 */
export const INDICATORS_BY_TEMA = (() => {
  const out = {};
  const vistos = new Set();
  for (const meta of Object.values(PDAD_INDICATORS)) {
    if (vistos.has(meta.key)) continue;
    vistos.add(meta.key);
    (out[meta.tema] = out[meta.tema] || []).push(meta);
  }
  return out;
})();

/**
 * Chave de exibição (`key`) -> lista de `indicator_code` que alimentam ela. 1:1 para
 * quase todos; `shopping` é a exceção (5 `indicator_code`, uma Figura só, a 59) — o
 * drill-down precisa dos cinco para mostrar a Figura inteira, não um quinto dela.
 */
export const INDICATOR_CODES_BY_KEY = (() => {
  const out = {};
  for (const [code, meta] of Object.entries(PDAD_INDICATORS)) {
    (out[meta.key] = out[meta.key] || []).push(code);
  }
  return out;
})();

/** Todos os indicadores (chaves únicas), na ordem declarada — usado pelos seletores da tela. */
export const PDAD_INDICATOR_LIST = (() => {
  const vistos = new Set();
  const out = [];
  for (const meta of Object.values(PDAD_INDICATORS)) {
    if (vistos.has(meta.key)) continue;
    vistos.add(meta.key);
    out.push(meta);
  }
  return out;
})();

/** Faixas etárias de exibição, na ordem do protótipo de referência. */
export const AGE_DISPLAY_BUCKETS = Object.freeze(['0–14', '15–29', '30–44', '45–59', '60+']);

/**
 * `category_standard` de `age_sex_distribution` -> faixa de exibição de 5 grupos.
 *
 * A planilha publica faixas quinquenais (`até 4 anos` … `80 anos ou mais`); a tela
 * reagrupa em 5 faixas amplas, mesmo recorte do protótipo de referência. `75_anos_ou_mais`
 * cobre o lote 2021, que não separa 75–79 de 80+.
 */
export const AGE_BUCKET_BY_CATEGORY = Object.freeze({
  ate_4_anos: '0–14',
  '5_a_9_anos': '0–14',
  '10_a_14_anos': '0–14',
  '15_a_19_anos': '15–29',
  '20_a_24_anos': '15–29',
  '25_a_29_anos': '15–29',
  '30_a_34_anos': '30–44',
  '35_a_39_anos': '30–44',
  '40_a_44_anos': '30–44',
  '45_a_49_anos': '45–59',
  '50_a_54_anos': '45–59',
  '55_a_59_anos': '45–59',
  '60_a_64_anos': '60+',
  '65_a_69_anos': '60+',
  '70_a_74_anos': '60+',
  '75_a_79_anos': '60+',
  '80_anos_ou_mais': '60+',
  '75_anos_ou_mais': '60+',
});

/**
 * Indicadores curados para a tela Ranking dos territórios (issue #102) — mesmo recorte
 * do `RANK_SET` do protótipo de referência: um punhado de indicadores de qualidade
 * territorial, não os 30 inteiros. `attr` lê um escalar já pronto da RA (população,
 * domicílios, renda); os demais leem uma categoria específica de um indicador.
 */
export const PDAD_RANK_SET = Object.freeze([
  { id: 'income', label: 'Renda per capita', tema: 'Cadastro territorial', attr: 'incomePerCapita', unit: 'currency' },
  { id: 'deed', label: 'Escritura registrada', tema: 'Domicílios', key: 'deed', category: 'Sim', unit: 'pct', absUnit: 'imóveis próprios' },
  { id: 'water', label: 'Água · rede geral', tema: 'Infraestrutura', key: 'water', category: 'Rede Geral · Sim', unit: 'pct', absUnit: 'domicílios' },
  { id: 'sewage', label: 'Esgoto · rede geral', tema: 'Infraestrutura', key: 'sewage', category: 'Rede Geral · Sim', unit: 'pct', absUnit: 'domicílios' },
  { id: 'energy', label: 'Energia · rede geral', tema: 'Infraestrutura', key: 'energy', category: 'Rede Geral · Sim', unit: 'pct', absUnit: 'domicílios' },
  { id: 'waste', label: 'Coleta convencional de lixo', tema: 'Infraestrutura', key: 'waste', category: 'Coleta Convencional · Sim', unit: 'pct', absUnit: 'domicílios' },
  { id: 'internet', label: 'Internet própria', tema: 'Infraestrutura', key: 'internet', category: 'Próprio', unit: 'pct', absUnit: 'domicílios' },
  { id: 'pea', label: 'População ocupada', tema: 'Trabalho', key: 'peaSituation', category: 'Ocupado', unit: 'pct', absUnit: 'pessoas' },
  { id: 'workTime', label: 'Até 15 min do trabalho', tema: 'Trabalho', key: 'workTime', category: 'Até 15 min', unit: 'pct', absUnit: 'trabalhadores' },
  { id: 'health', label: 'Plano de saúde', tema: 'Saúde', key: 'healthPlan', category: 'Sim', unit: 'pct', absUnit: 'pessoas' },
]);

/** Kits prontos da tela Comparar RAs (issue #102) — mesmo recorte do protótipo. */
export const PDAD_COMPARE_KITS = Object.freeze({
  imob: { label: 'Imobiliário', keys: ['dwelling', 'tenure', 'deed', 'internet'] },
  perfil: { label: 'Perfil da demanda', keys: ['age', 'peaSituation', 'healthPlan', 'moveReason'] },
  infra: { label: 'Infraestrutura', keys: ['water', 'sewage', 'waste', 'internet'] },
});

/**
 * As 7 leituras cruzadas de dispersão (scatter) do protótipo de referência (issue #102):
 * cada eixo é lido do jeito que `rankScalar()` (`aggregate.js`) já sabe ler — `attr` para
 * um campo pronto da RA, ou `key`+`category` para uma categoria de indicador. `income`
 * (`incomePerCapita`) não existe no `PDAD_A_DATA` — resolve sempre ausente, mesma decisão
 * do Ranking, em vez de tentar cruzar com a convenção de `ra_geo_id` de `RA_PROFILES`
 * (`RA2026_RA-I`), que não é a mesma de `PDAD_A_DATA` (`RA_01..RA_35`).
 */
export const PDAD_SCATTER_VIEWS = Object.freeze([
  {
    id: 'vert_loc', label: 'Verticalização × Mercado de locação',
    x: { key: 'dwelling', category: 'Apartamento', label: '% em apartamento' },
    y: { key: 'tenure', category: 'Alugado', label: '% em imóvel alugado' },
    insight: 'Onde olhar: o quadrante superior direito reúne RAs verticais com locação forte — o mercado típico do investidor (renda de aluguel e liquidez). O inferior esquerdo são territórios horizontais de imóvel próprio, onde o jogo é lote e casa.',
  },
  {
    id: 'fund_loc', label: 'Segurança fundiária × Locação',
    x: { key: 'deed', category: 'Sim', label: '% escritura registrada' },
    y: { key: 'tenure', category: 'Alugado', label: '% em imóvel alugado' },
    insight: 'Onde olhar: escritura alta + locação alta = mercado formal e líquido. Escritura baixa com locação relevante indica demanda represada sob risco fundiário — oportunidade condicionada à regularização.',
  },
  {
    id: 'emprego_plano', label: 'Emprego × Plano de saúde',
    x: { key: 'peaSituation', category: 'Ocupado', label: '% ocupados' },
    y: { key: 'healthPlan', category: 'Sim', label: '% com plano de saúde' },
    insight: 'Onde olhar: o plano de saúde funciona como proxy de renda formal. RAs acima da tendência têm poder de compra superior ao que o emprego local sugere — demanda para produtos de padrão mais alto.',
  },
  {
    id: 'mob', label: 'Proximidade do trabalho × Automóvel',
    x: { key: 'workTime', category: 'Até 15 min', label: '% até 15 min do trabalho' },
    y: { key: 'vehicles', category: 'Automóvel', label: '% com automóvel' },
    insight: 'Onde olhar: o quadrante inferior esquerdo combina deslocamento longo e baixa motorização — pressão por transporte público e demanda latente por moradia perto do emprego.',
  },
  {
    id: 'escala_vert', label: 'Escala populacional × Verticalização',
    x: { attr: 'population', label: 'População' },
    y: { key: 'dwelling', category: 'Apartamento', label: '% em apartamento' },
    insight: 'Onde olhar: RAs grandes e pouco verticais concentram o potencial de adensamento futuro; as pequenas e verticais já estão consolidadas — o valor está no estoque, não no incremento.',
  },
  {
    id: 'envelh', label: 'Envelhecimento × Plano de saúde',
    x: { key: 'age', category: '60+', label: '% 60 anos ou mais' },
    y: { key: 'healthPlan', category: 'Sim', label: '% com plano de saúde' },
    insight: 'Onde olhar: o quadrante superior direito indica perfil maduro e coberto — demanda por serviços de saúde, acessibilidade e produtos para longevidade.',
  },
  {
    id: 'renda_escritura', label: 'Renda × Escritura registrada (parcial)',
    x: { attr: 'incomePerCapita', label: 'Renda per capita (R$)' },
    y: { key: 'deed', category: 'Sim', label: '% escritura registrada' },
    insight: 'Leitura parcial: a renda per capita não consta em PDAD_A_DATA nesta base — RAs ficam listadas fora do gráfico. Use como referência qualitativa, não como ranking.',
  },
]);
