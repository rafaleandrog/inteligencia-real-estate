// Registro de indicadores do PDAD_A_DATA lidos pela tela Diagnóstico (Fase 1).
//
// `PDAD_A_DATA` publica 39 `indicator_code` distintos (extração longa do PDAD-A); este
// registro declara só os que a Fase 1 desenha. Um indicator_code fora daqui continua
// sendo lido e normalizado — não é descartado — só não vira card ainda, mesmo
// tratamento que `docs/DATA_CONTRACT.md` já dá a colunas de RA_PROFILES não consumidas.
//
// Fora de escopo por enquanto, de propósito:
//   - `purchase_locations`/`purchase_services`/`purchase_food`/`purchase_construction`/
//     `purchase_appliances` (tema "Consumo"): o extrator gravou o nome do local em
//     `segment_value` e a CONTAGEM em `response_category` (em vez de uma categoria de
//     resposta) — desenhar isso hoje mostraria número onde a tela promete categoria.
//   - `domestic_services_frequency` (5 linhas) e `lot_regularization` (3 linhas,
//     `figure_number` não numérico "A71"): volume baixo demais para um card próprio.
//   - `labor_force_status`, `internet_type`, `internet_access_any`: perguntas
//     relacionadas às já mapeadas (`pea_status`, `internet_access`) — evita duas
//     leituras do mesmo tema competindo na mesma tela.

/** Temas exibidos, na ordem de leitura da tela. */
export const PDAD_TEMAS = Object.freeze({
  moradores: 'Moradores',
  saude: 'Saúde',
  educacao: 'Educação',
  trabalho: 'Trabalho',
  domicilios: 'Domicílios',
  infra: 'Infraestrutura',
});

/**
 * `indicator_code` (chave da planilha) -> descrição de exibição.
 *
 * `key` é o identificador interno curto usado pelo agregador e pela tela — existe para
 * não espalhar `indicator_code` por toda parte, do mesmo jeito que `src/ivv/region.js`
 * usa `campo` em vez do nome de coluna cru.
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
  domestic_services: { key: 'domesticServices', tema: 'domicilios', label: 'Serviços domésticos', unit: '% dos domicílios' },
  pets: { key: 'animals', tema: 'domicilios', label: 'Animais no domicílio', unit: '% dos domicílios' },

  internet_access: { key: 'internet', tema: 'infra', label: 'Acesso à internet', unit: '% dos domicílios' },
  vehicles: { key: 'vehicles', tema: 'infra', label: 'Posse de veículos', unit: '% dos domicílios' },
  water_supply: { key: 'water', tema: 'infra', label: 'Abastecimento de água', unit: '% dos domicílios' },
  sewage: { key: 'sewage', tema: 'infra', label: 'Esgotamento sanitário', unit: '% dos domicílios' },
  electricity_supply: { key: 'energy', tema: 'infra', label: 'Abastecimento de energia', unit: '% dos domicílios' },
  waste_collection: { key: 'waste', tema: 'infra', label: 'Coleta de resíduos', unit: '% dos domicílios' },
});

/**
 * Os indicadores agrupados por tema, na ordem de `PDAD_INDICATORS` — é a lista que a
 * tela percorre para desenhar os cartões de um tema, sem duplicar o agrupamento no
 * lado do render.
 */
export const INDICATORS_BY_TEMA = (() => {
  const out = {};
  for (const meta of Object.values(PDAD_INDICATORS)) {
    (out[meta.tema] = out[meta.tema] || []).push(meta);
  }
  return out;
})();

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
