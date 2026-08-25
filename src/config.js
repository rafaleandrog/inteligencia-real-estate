/**
 * Configuração da aplicação.
 *
 * Script global e não módulo, de propósito: quem edita este arquivo para trocar a
 * planilha não precisa entender `import`. É o formato documentado em
 * docs/SHEET_SETUP.md e na aba README da planilha.
 *
 * NÃO coloque secret aqui. Este arquivo é servido publicamente pelo GitHub Pages.
 * O ID da planilha e a URL do Web App são públicos por design — a arquitetura inteira
 * depende de o navegador ler a planilha direto. Qualquer outro identificador não é
 * (docs/ENGINEERING_RULES.md, R4.1 e R4.2).
 */
window.APP_CONFIG = {
  /** ID da Google Sheet pública. Trecho entre /d/ e /edit da URL. */
  spreadsheetId: '1sYwfgAiXBUwpY5P4PZzRDVNLnhDwpxMmW-UJTHxoR-A',

  /**
   * Origem dos dados:
   *   'gviz'       Google Visualization Query direto na planilha — caminho principal
   *   'demo'       data/demo.json — demonstração e desenvolvimento offline
   *   'appsscript' Web App do Apps Script — estratégia alternativa
   */
  dataSource: 'gviz',

  /**
   * Atalho retrocompatível. `true` força `dataSource: 'demo'` e tem precedência,
   * porque é o que docs/SHEET_SETUP.md e a aba README da planilha mandam usar.
   */
  demoMode: false,

  /** URL /exec do Web App. Usada apenas quando dataSource === 'appsscript'. */
  appsScriptUrl:
    'https://script.google.com/macros/s/AKfycbzQtHZQk6uPPMdV3hSThM7p1exJV3DS2U79GSkN37295eySi4Z1-0ZUK0YKjE95SM6CEA/exec',

  /** Caminho do dataset de demonstração. Relativo, para funcionar no GitHub Pages. */
  demoUrl: './data/demo.json',

  /** Abas obrigatórias. Ausência de qualquer uma é erro (R2.5). */
  sheets: {
    listings: 'LISTINGS',
    developments: 'DEVELOPMENTS',
    anchors: 'ANCHORS',
  },

  /**
   * Aba de metadados do dataset, escrita pelo Apps Script e exibida na interface.
   *
   * Só passa a existir depois que `setupProject()` roda na planilha. Enquanto não
   * existir ou estiver vazia, o bloco de metadados simplesmente não aparece — a
   * aplicação não depende dela para funcionar.
   */
  metaSheet: 'APP_META',

  /**
   * Aba de indicadores por Região Administrativa (issue #33/#34). Opcional: ausência
   * ou falha ao buscá-la vira aviso, nunca erro (R2.5) — o filtro por RA (#33) segue
   * funcionando com o código bruto de `ra_geo_id` como rótulo, só sem o
   * enriquecimento de nome/população/densidade de #34.
   */
  raProfilesSheet: 'RA_PROFILES',

  /**
   * Abas previstas para as próximas fases.
   *
   * A tela da V1 não lê PRIMARY_OFFERS/IVV_MONTHLY/IVV_REGION, e por isso não são
   * buscadas no carregamento: seriam requisições por abertura de página para dado
   * que ninguém renderiza. Esta lista existe como declaração do que a planilha
   * contém, e quem verifica a presença delas é o `validateAll()` do Apps Script, que
   * roda do lado da planilha e registra o resultado em DATA_QUALITY.
   *
   * RA_PROFILES saiu daqui porque passou a ser buscada de verdade — ver
   * `raProfilesSheet` acima.
   *
   * Quando uma das restantes entrar na interface, ela é buscada aqui e sua ausência
   * vira aviso — nunca erro, porque a aplicação não pode cair por causa de aba futura
   * vazia (R2.5).
   */
  optionalSheets: ['PRIMARY_OFFERS', 'IVV_MONTHLY', 'IVV_REGION'],

  /** Centro inicial do mapa: Distrito Federal. */
  defaultCenter: [-15.78, -47.93],
  defaultZoom: 10,
};
