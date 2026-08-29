# Regras de engenharia

Fonte canônica das regras deste repositório. [`AGENTS.md`](../AGENTS.md) é o resumo de entrada;
este arquivo é o detalhe. Em caso de conflito, **este arquivo vence**.

Regras são numeradas e estáveis. Não renumere ao inserir — acrescente ao fim do bloco.

---

## 1. Arquitetura

- **R1.1** A aplicação é estática. Sem build obrigatório, sem bundler, sem framework front-end na V1.
- **R1.2** JavaScript nativo. Leaflet é a única biblioteca de runtime permitida.
- **R1.3** Não introduza backend Node só para servir dados.
- **R1.4** Compatibilidade com GitHub Pages é requisito, não preferência: caminhos relativos,
  nada que dependa de servidor.
- **R1.5** Não adicione dependência por conveniência. Se for realmente necessária, justifique a
  razão na PR.
- **R1.6** Dependências de runtime são vendorizadas em `assets/vendor/`, não carregadas de CDN.
  Motivo: o site público não deve depender da disponibilidade de terceiro, e CI/sandbox não
  alcançam CDNs.

## 2. Dados e sincronização

- **R2.1** **Código no GitHub, dados na Google Sheet.** Fonte de verdade dos dados é a planilha.
- **R2.2** Não existe export manual `Sheet → JSON → commit` no fluxo normal. Mudar dado não pode
  exigir commit; mudar código não pode exigir reexportar dado.
- **R2.3** `data/demo.json` é fallback e modo de demonstração — **nunca** produção. A interface
  precisa deixar visível quando está em modo demo.
- **R2.4** `migration/` guarda sementes de importação (o `.xlsx`). Semente não é fonte de runtime.
- **R2.5** Aba **obrigatória** ausente → estado de erro legível. Aba **opcional** ausente → warning.
  Nunca derrube a aplicação porque uma aba futura está vazia.
- **R2.6** Dado inválido não derruba a aplicação. Registro ruim é descartado ou sinalizado, nunca
  fatal.

## 3. Contrato de dados

- **R3.1** [`docs/DATA_CONTRACT.md`](DATA_CONTRACT.md) é a fonte de verdade do schema.
- **R3.2** Cabeçalho **nunca** é renomeado em silêncio. Mudança estrutural exige, na mesma PR:
  comparar schema anterior e novo → identificar impacto → atualizar contrato → atualizar loader →
  atualizar validação → atualizar migração → adicionar teste.
- **R3.3** IDs são estáveis e únicos. Não altere ID existente arbitrariamente.
- **R3.4** Coordenadas em WGS84. Valor monetário é número, sem `R$` dentro da célula. Data em
  `YYYY-MM-DD`.
- **R3.5** `confidence_flag` e `coordinate_precision` devem sobreviver ao pipeline inteiro,
  da planilha até a tela.
- **R3.6** **Coordenada aproximada nunca é apresentada como endereço ou lote exato.**
- **R3.7** **Preço anunciado é preço pedido, não transação realizada.** A interface não pode
  sugerir o contrário.

## 4. Segurança

- **R4.1** Nenhum secret versionado: `OPENAI_API_KEY`, token Google, token GitHub, nada.
- **R4.2** O ID da planilha e a URL do Web App são públicos por design. Qualquer outro
  identificador não é — na dúvida, não commite.
- **R4.3** Aba escondida da planilha **não é** mecanismo de segurança. Tudo que o navegador lê é
  público. Nunca coloque informação privada na planilha pública.
- **R4.4** Nenhuma string vinda dos dados entra em `innerHTML`. Construa DOM com `createElement`
  e `textContent`, ou escape explicitamente.
- **R4.5** Todo link externo leva `rel="noopener noreferrer"`.
- **R4.6** URL vinda dos dados é validada antes de virar `href`: apenas `http:` e `https:`.
- **R4.7** Endpoint de leitura do Apps Script (`doGet`) é público e sem autenticação, com
  allowlist de datasets — segue read-only.
- **R4.8** Configuração privada do Apps Script mora em Script Properties, nunca em célula.
- **R4.9** *(issue #5; simplificada para o padrão já usado no `press-research-communications`
  do repo `tipolis-sandbox` — mesmo racional, sem inventar mecanismo novo)* O Apps Script pode
  expor um endpoint de escrita (`doPost`) **somente** sob um `token` enviado em **toda**
  requisição — inclusive `create`/`update`/`delete` — e comparado a `ADMIN_TOKEN` em Script
  Properties (`authenticate_()`, comparação direta). Não há sessão intermediária, TTL, nem
  limitação de tentativas: o token é a única credencial, guardado pelo frontend só em
  `sessionStorage` (nunca em disco, nunca commitado) e reenviado a cada chamada — o mesmo
  contrato do `press-monitor` (`js/api.js`: `TOKEN_KEY`, token em toda URL/POST, 401 limpa e
  volta para o portão de login). Rotacionar `ADMIN_TOKEN` invalida instantaneamente a próxima
  chamada, sem sessão para expirar por fora. Uma ação leve `action: "validate"` confere o token
  sem ler nem escrever nada — é o que o portão de login usa antes de liberar a área
  administrativa. Sem `ADMIN_TOKEN` configurado, nenhuma chamada autentica; não existe modo
  aberto. Isto substitui a proibição anterior de `doPost` (antiga R4.7): a exceção é deliberada,
  documentada aqui, e não abre o endpoint de leitura, que continua público e sem autenticação.
  Campo derivado (`asking_price_brl_m2`, `current_price_brl_m2`) nunca é aceito como valor de
  entrada — é sempre calculado no servidor a partir dos campos-fonte, com a mesma fórmula de
  `pricePerM2()` em `src/normalize.js`. Identidade Google (`Session.getActiveUser()`) tem
  prioridade sobre o editor autodeclarado no `CHANGE_LOG` quando o Apps Script consegue
  resolvê-la — o que depende da configuração de implantação do Web App e não é garantido. Ver
  `docs/SHEET_SETUP.md` §8 para configurar o token e a rotação.

## 5. Qualidade de código

- **R5.1** Mudanças pequenas e verificáveis. Não reescreva arquivo inteiro sem necessidade.
- **R5.2** Não misture refatoração ampla com feature pequena.
- **R5.3** Prefira funções puras para normalização, mediana, filtros, conversão numérica e
  classificação de registros — são as que dão para testar de verdade.
- **R5.4** Não modularize por estética. Extraia só o que é claramente independente.
- **R5.5** Nenhuma `Promise` sem tratamento de rejeição.
- **R5.6** Falha de carregamento mostra mensagem legível ao usuário **e** registra o erro técnico
  no console. Nunca tela branca.
- **R5.7** **Não esconda bug com fallback silencioso.** Fallback que mascara falha é bug novo.

## 6. Testes e verificação

- **R6.1** Testes com o runner nativo do Node (`node --test`). Sem framework.
- **R6.2** Prioridade de cobertura: conversão numérica, normalização das 3 entidades, mediana,
  filtros, registro sem coordenada, registro sem preço, dado malformado.
- **R6.3** Teste é proporcional ao tamanho do projeto. Não construa infraestrutura enorme para uma
  V1 pequena.
- **R6.4** **Smoke test é obrigatório após mudança funcional** — ver [`AI_WORKFLOW.md`](AI_WORKFLOW.md).
  Não declare a V1 funcional sem ele.
- **R6.5** **Nunca declare um bug corrigido sem reproduzir antes e verificar depois.**
- **R6.6** Limitação de ambiente se declara, não se mascara. Se você não conseguiu testar algo,
  diga qual item ficou sem teste e por quê.

## 7. Processo e Git

- **R7.1** Trabalho em branch, nunca direto em `main`.
- **R7.2** **Toda PR passa por uma review do Codex antes do merge.** Ver
  [`AI_WORKFLOW.md`](AI_WORKFLOW.md). **Uma rodada é o normal.** O que bloqueia o merge é
  **P0 ou P1 em aberto** — não a ausência de qualquer achado. Achado P2 ou P3 não segura a PR:
  corrija se for trivial, senão registre como backlog e siga.
- **R7.3** Todo achado do Codex que revele uma **classe** de erro vira regra nova na seção 8,
  na mesma PR que corrige o achado.
- **R7.4** A PR relata: arquivos alterados, resumo do diff, testes executados, problemas restantes.
- **R7.7** **O ciclo de review roda sozinho.** Abrir a PR, pedir a revisão, corrigir os achados e
  pedir de novo são passos do processo, não decisões a submeter — não peça permissão nem sugestão
  a cada rodada. Procure o responsável em três situações apenas: o trabalho terminou, apareceu um
  bloqueio que você não pode resolver, ou existe uma decisão de produto que muda o que deve ser
  construído. Esta regra diz **a quem se pergunta**, e não o que se verifica: quando a PR pode
  entrar em `main` continua definido por R7.2 e R7.6, sem exceção.
- **R7.6** **Uma rodada de review, não três.** Rodada nova só quando a anterior deixou **P0 ou
  P1** em aberto, e aí ela cobre apenas esses. Ping-pong sobre P2 e P3 custa mais do que corrige:
  o objetivo do review é impedir defeito grave em produção, não convergir para consenso
  estilístico. Depois de uma rodada sem P0/P1, o merge é imediato.

- **R7.5** Mudança de schema atualiza código **e** documentação na mesma PR.

## 8. Regras aprendidas

Acrescentadas ao longo do projeto, a partir de achados reais de review ou de bugs de produção.
Cada uma nasce de um erro que aconteceu de verdade.

- **R8.1** *(2026-08-20, auditoria inicial)* Arquivo de dados ou referência grande vai para
  `migration/` ou `reference/`, nunca para a raiz. Na raiz, o GitHub Pages serve o arquivo errado
  como home e ele colide com o `index.html` da aplicação.
- **R8.2** *(2026-08-20, auditoria inicial)* Documento que referencia um caminho (`docs/X.md`)
  exige que o arquivo esteja nesse caminho. Ao mover documentação, corrija os links no mesmo commit.
- **R8.3** *(2026-08-20, auditoria inicial)* Quando duas fontes descrevem o mesmo schema e
  divergem, a fonte que alimenta a Google Sheet vence — foi o caso de `PRIMARY_MARKET`, em que o
  `.xlsx` normalizado prevalece sobre o formato de range em string da referência V3. Registre a
  divergência no contrato em vez de escolher em silêncio.
- **R8.4** *(2026-08-20, review do Codex na PR #1)* **Verificação de CI precisa falhar no cenário
  real, não só no cenário completo.** `ls ./*.xlsx ./*.csv` só detecta quando os **dois** padrões
  existem: com apenas um, o shell passa o outro glob literalmente para `ls`, que sai com status
  != 0 e faz o `if` inteiro falhar. Use `find . \( -name A -o -name B \) | grep -q .`. Ao escrever
  um guard, reproduza o cenário de falha que ele deve pegar — um guard que nunca dispara é pior
  que nenhum, porque dá confiança falsa.
- **R8.5** *(2026-08-20, review do Codex na PR #1)* **Integridade se verifica por checksum, não
  por tamanho.** Um piso de bytes aceita qualquer reescrita maior que o mínimo. Arquivo que deve
  permanecer imutável — `reference/index-v3.html` — é fixado por hash SHA-256 no CI. Alterá-lo
  deliberadamente exige atualizar o hash na mesma PR, o que torna a mudança visível no diff.
- **R8.6** *(2026-08-20, review do Codex na PR #1)* **Varredura de secret não exclui diretório
  publicado.** `assets/` é servido pelo GitHub Pages: um segredo ali vaza igual a um em `src/`.
  Exclua arquivo específico conhecido, nunca um diretório inteiro que vai para produção. Mantenha
  também os formatos de token atuais — `github_pat_` (fine-grained) não casa com o padrão
  `ghp_`/`gho_`/`ghs_` clássico.
- **R8.7** *(2026-08-20, review do Codex na PR #1)* **Política mora em um arquivo só.** As
  prioridades de review vivem na seção `## Code Review Rules` do `AGENTS.md`; qualquer outro
  arquivo — inclusive `.github/codex/prompts/review.md` — **aponta** para lá em vez de copiar.
  Duas cópias divergem na primeira vez que só uma é atualizada, e a partir daí revisão automática
  e revisão manual cobram coisas diferentes.
- **R8.8** *(2026-08-20, review do Codex na PR #1)* **Documentação não promete arquivo que não
  está no commit.** README descrevendo `npm test` sem `package.json` versionado, ou
  `tools/reference-to-csv.mjs` que não existe, produz exatamente o problema que a auditoria
  inicial encontrou neste repositório. Ou o arquivo entra na mesma PR, ou a documentação
  descreve o que existe hoje.
- **R8.9** *(2026-08-20, review do Codex na PR #1)* **Guard de publicação cobre tudo que é
  publicado.** O GitHub Pages serve o repositório inteiro, então `-maxdepth 1` deixa passar
  `data/listings.csv`. Guard de conteúdo publicado varre recursivamente e exclui apenas os
  diretórios legítimos (`migration/`, `reference/`).
- **R8.10** *(2026-08-20, execução dos testes)* **`node --test <diretório>` não funciona:** o Node
  tenta resolver o caminho como módulo e falha com `MODULE_NOT_FOUND`. Use o glob do próprio
  Node, entre aspas para o shell não expandir: `node --test "tests/**/*.test.js"`.
- **R8.11** *(2026-08-20, execução dos testes)* **`Intl.NumberFormat` com `style: 'currency'`
  separa o símbolo com espaço inseparável (U+00A0), não espaço comum.** Comparar a saída com um
  literal `'R$ 0'` falha de forma invisível no diff. Compare com regex `/^R\$\s0$/` ou normalize
  o espaço antes.
- **R8.12** *(2026-08-20, teste de `toNumber`)* **Separador decimal exige regra explícita e
  documentada.** `"R$ 2.500.000"` devolvia `null`: o caminho de "só pontos" não existia. A regra
  adotada é dois ou mais pontos = milhar; um ponto = decimal. Um ponto só é genuinamente ambíguo
  (`"2.500"` é 2500 em pt-BR e 2.5 em JavaScript) — o contrato resolve exigindo número sem
  formatação na célula, e o teste documenta a escolha.
- **R8.13** *(2026-08-20, smoke test)* **Linkar o CSS de uma biblioteca não carrega o JS dela.**
  O `index.html` tinha `leaflet.css` e não tinha `leaflet.js`; a página subia e quebrava com
  `L is not defined`. Nenhum teste unitário pega isso — só o smoke test em navegador. É a
  justificativa concreta de R6.4.
- **R8.14** *(2026-08-20, smoke test)* **Marcador do Leaflet é `<path>` SVG: estiliza-se com
  `fill` e `stroke`, nunca com `background` e `border`.** As propriedades de HTML são ignoradas
  em SVG, então os 203 marcadores ficavam brancos e indistinguíveis — sem nenhum erro de console.
  Bug visual só aparece em verificação visual.
- **R8.15** *(2026-08-20, KPI de mediana)* **Indicador agregado declara sua composição.** A
  mediana de preço/m² junta terreno (R$ 1,3 mil/m²) e apartamento (R$ 9,8 mil/m²): o número está
  certo e a leitura é enganosa. Quando um indicador mistura populações diferentes, a interface
  diz isso — mesma família da regra de nunca apresentar coordenada aproximada como exata.
- **R8.16** *(2026-08-20, review do Codex na PR #1)* **Afirmação de qualidade do dado falha
  fechado.** Só declare "localização verificada" quando a precisão nomear explicitamente uma
  geometria apurada e nenhum flag a rebaixar. A versão anterior procurava marcadores de
  imprecisão e assumia exatidão na ausência deles — resultado: **15 de 15** empreendimentos
  mapeáveis, todos com `coordinate_precision` vazio, eram anunciados como verificados. Regra
  geral: vocabulário novo que ninguém previu tem que cair no lado conservador, não no otimista.
- **R8.17** *(2026-08-20, review do Codex na PR #1)* **`bindTooltip` e `bindPopup` do Leaflet
  recebem elemento, nunca string.** `DivOverlay._updateContent` faz
  `contentNode.innerHTML = conteudo` para string, então um `title` de planilha com
  `<img onerror=...>` vira markup ativo. Passar um nó cai no ramo de `appendChild`. Construir
  DOM com `textContent` no resto do arquivo não protege o que é entregue à biblioteca.
- **R8.18** *(2026-08-20, review do Codex na PR #1)* **ID é único dentro da aba, não entre
  abas.** A planilha repete 12 IDs entre `PRIMARY_MARKET` e `DEVELOPMENTS`, então buscar registro
  só por `id` numa lista achatada devolve o primeiro que aparecer. Qualquer seleção, deduplicação
  ou índice sobre entidades misturadas usa a chave composta `(kind, id)`.
- **R8.19** *(2026-08-20, review do Codex na PR #1)* **"Só quando vazio" quer dizer vazio, não
  "quando inválido".** O recálculo de campo derivado testava se a célula tinha um número
  positivo; com isso o job de manutenção sobrescrevia justamente os valores ruins — `0`,
  negativo, texto — apagando a evidência do dado inválido antes que a validação pudesse
  registrá-la. Rotina automática preserva toda célula não vazia; sinalizar é trabalho da
  validação, e apagar é decisão humana.
- **R8.20** *(2026-08-20, review do Codex na PR #1)* **Validação de schema cobre todos os
  cabeçalhos críticos, não só o do ID.** Apagar `latitude` de `LISTINGS` não gerava achado
  nenhum — a validação de coordenada era pulada por falta de índice — enquanto o navegador
  normalizava todas as coordenadas para `null` e o mapa ficava vazio. Guard que pula em silêncio
  quando o dado some é pior que guard nenhum, porque reporta saúde.
- **R8.21** *(2026-08-20, review do Codex na PR #1)* **Teste de cobertura verifica os dois
  sentidos.** O primeiro teste de `REQUIRED_HEADERS` só provava que *o declarado existe na
  planilha* — não que *o exigido foi declarado*. Com isso a lista escrita à mão podia omitir
  `bedrooms_min`/`bedrooms_max` de `PRIMARY_MARKET` e passar verde. Verificação de cobertura
  precisa do sentido contrário: falso positivo **e** falso negativo.
- **R8.22** *(2026-08-20, review do Codex na PR #1)* **Lista que espelha outra fonte é derivada,
  não digitada.** `REQUIRED_HEADERS` passa a ser calculada da união entre o que
  `DATA_CONTRACT.md` marca como obrigatório e o que `normalize.js` lê, intersectada com as
  colunas que o contrato declara para a aba. Lista mantida à mão diverge da fonte no primeiro
  descuido; derivada, uma mudança no contrato quebra o teste e obriga a atualizar na mesma PR.
- **R8.23** *(2026-08-20, review do Codex na PR #1)* **Guard novo se testa quebrando de
  propósito.** Antes de aceitar o teste de cobertura, removi `bedrooms_min` da lista e confirmei
  que a suíte falhava; restaurei e confirmei que passava. Mesma família de R8.4 — guard que nunca
  se viu falhar não é guard, é decoração.
- **R8.24** *(2026-08-20, leitura ao vivo da Google Sheet)* **GViz público no navegador usa
  JSONP, não `fetch`.** A permissão “qualquer pessoa com o link” elimina o HTTP 401, mas o endpoint
  continua sem `Access-Control-Allow-Origin`; no GitHub Pages, `fetch` termina em `Failed to fetch`.
  Use `tqx=out:json;responseHandler:<callback>`, timeout e limpeza do `<script>` após sucesso ou
  erro.

- **R8.24** *(2026-08-20, exibição da APP_META)* **Aba de arquivo `.xlsx` se localiza por `r:id`,
  nunca por `sheetId`.** Os dois coincidem só enquanto nenhuma aba for apagada: apagar deixa
  buraco na numeração dos ids, enquanto os arquivos `sheetN.xml` são renumerados sem buraco, e a
  partir dali cada aba devolve o conteúdo da anterior — em silêncio. Foi o que aconteceu ao
  remover `PRIMARY_MARKET`: `APP_META` passou a ler as colunas de `DATA_QUALITY`. Os testes
  continuaram verdes porque as abas obrigatórias vinham antes da removida.
- **R8.25** *(2026-08-20, exibição da APP_META)* **Ausência e vazio são estados diferentes e a
  interface precisa distingui-los.** Chave não publicada é **omitida**, não exibida como
  travessão: travessão afirma que o campo existe e está vazio. Vale para todo dado de
  procedência — quem lê precisa saber se a informação não existe ou se ninguém a publicou ainda.
- **R8.26** *(2026-08-20, exibição da APP_META)* **Número que pode ser confundido com outro na
  mesma tela recebe legenda.** `Anúncios 141` em "Sobre estes dados" é o total publicado na
  planilha; `Anúncios secundários 141` em "Camadas" é o que sobrou dos filtros. Coincidem sem
  filtro e divergem com — mesma família da nota de composição da mediana (R8.15).
- **R8.27** *(2026-08-20, review do Codex na PR #3)* **Leitor e escritor precisam concordar sobre
  qual linha vale.** `setMeta_()` do Apps Script atualiza a **primeira** ocorrência de uma chave;
  a leitura deixava a **última** vencer. Com uma linha duplicada antiga, a validação gravava
  `error` na linha 1 e a tela exibia `ok` da linha 5. Em conflito de valores, **omita** — escolher
  um lado apresenta como certo um dado sobre o qual a própria fonte se contradiz.
- **R8.28** *(2026-08-20, review do Codex na PR #3)* **Não espalhe o objeto bruto por cima do
  normalizado.** `{ ...bruto, ...normalizado }` devolve exatamente as chaves que o normalizador
  decidiu rejeitar — `last_validation_at: 'ontem'` reaparecia e virava "Validado em —",
  destruindo a distinção entre não publicado e inválido que o normalizador existia para criar.
  Devolva só o normalizado; o que não pertence ao vocabulário vai para um ramo separado.
- **R8.29** *(2026-08-20, review do Codex na PR #3)* **Recurso opcional não entra no caminho
  crítico.** Buscar a `APP_META` depois do lote das abas obrigatórias somava o tempo dela ao
  total e podia segurar o mapa em "carregando" com os dados já disponíveis. Opcional é buscado em
  paralelo e com teto de tempo próprio, menor que o do obrigatório.
- **R8.30** *(2026-08-20, review do Codex na PR #3)* **Fallback que adivinha recria o bug que a
  correção elimina.** Ao trocar o mapeamento de aba por `r:id`, deixei um "último recurso" por
  `sheetId` — o mesmo caminho errado, agora silencioso e mais difícil de achar. Quando não há
  como resolver com segurança, **falhe com mensagem**, não com um palpite.
- **R8.31** *(2026-08-20, review do Codex na PR #3)* **Não achate no servidor o que o cliente
  precisa para detectar conflito.** O endpoint `?resource=meta` transformava as linhas de
  `APP_META` num objeto JSON antes de responder — e objeto não guarda chave duplicada. A
  validação no cliente ficava inerte: por esse caminho o conflito já tinha desaparecido na
  origem. Transporte a forma que preserva a informação (linhas), e deixe a interpretação para um
  ponto só. Corolário: ao corrigir um problema em um caminho de dados, verifique **todos** os
  caminhos que chegam ao mesmo lugar.
- **R8.32** *(2026-08-20, revisão dos docs)* **Não crave em prosa um número que muda a cada PR.**
  O README anunciava "53 testes", o DEPLOYMENT "56" e o AI_WORKFLOW "25 checks", enquanto a suíte
  já tinha 74 e 39 — documentação afirmando o que não é verdade, exatamente o problema que a
  auditoria inicial deste repositório encontrou. Contagem viva pertence à saída do comando, não
  ao texto: descreva o que a suíte cobre, deixe o total para quem rodar.
- **R8.33** *(2026-08-20, review do Codex na PR #4)* **Regra nova declara seu escopo e não invade
  o de outra.** A R7.7 nasceu para dizer *a quem se pergunta* e acabou repetindo *quando se pode
  fazer merge* — leitura possível: "sem P0/P1, pode entrar", passando por cima do portão de R7.2
  e R7.6, que só relaxa depois da 3ª rodada. Duas regras descrevendo o mesmo portão com palavras
  diferentes é o mesmo problema de política duplicada da R8.7, agora entre regras. Ao escrever
  uma regra, diga o que ela **não** decide.
- **R8.34** *(2026-08-21, desenvolvimento da PR-C da issue #5)* **Checar "campo obrigatório
  ausente" pelo tamanho do objeto de campos, não pelo valor de cada campo, é um guard que nunca
  dispara quando o formulário sempre popula toda chave.** O formulário genérico de admin.html
  devolvia um valor (mesmo vazio) para todo campo do schema — `Object.keys(fields).length === 0`
  nunca era verdadeiro, então o submit vazio passava direto para o servidor em vez de ser barrado
  na tela. Só apareceu porque o smoke test (`tools/smoke-test-admin.mjs`) exercitou o caminho de
  verdade num navegador; checagem de sintaxe e teste unitário do schema não cobriam isso. Mesma
  lição da R8.4: reproduza o cenário de falha que o guard deve pegar antes de confiar nele.
- **R8.35** *(2026-08-21, desenvolvimento da PR-C da issue #5)* **Recarregar dados após uma
  escrita não pode apagar incondicionalmente o feedback dessa mesma escrita.** `loadSheet()` da
  área administrativa limpava a barra de status sempre que terminava com sucesso — inclusive
  quando tinha sido chamada por `submitForm()` só para refletir o valor persistido pelo servidor
  logo depois de mostrar "Registro criado.". A mensagem de confirmação nunca chegava a ser lida:
  sumia no mesmo ciclo em que aparecia. Quem decide limpar um status é quem inicia uma ação nova
  (trocar de aba), nunca uma rotina de recarga chamada por outro caminho.
- **R8.36** *(2026-08-21, revisão pré-merge da issue #5)* **Ler só o corpo de uma issue não é ler
  a issue.** A primeira rodada de implementação da área administrativa leu o corpo da issue #5,
  mas não os 3 comentários do dono do repo postados antes do trabalho começar — que refinavam a
  autenticação (sessão temporária em vez de token reenviado, limitação de tentativas, comparação
  sem vazamento parcial, identidade Google quando disponível) e ficaram sem implementar em 4 PRs
  inteiras. `get_comments` (ou equivalente) é parte de "conferir a issue", não um passo opcional.
  A checklist de critérios de aceite no corpo da issue também precisa ser relida item a item
  contra o que foi entregue antes de considerar pronto — duas lacunas (busca/filtro/ordenação na
  tabela; todas as colunas visíveis) só apareceram nessa releitura.
- **R8.37** *(2026-08-21, simplificação pós-merge da autenticação admin, issue #5)* **Antes de
  inventar um mecanismo de segurança novo, procure se o mesmo problema já foi resolvido em algum
  outro projeto da própria organização.** A R4.9 original implementou sessão temporária + TTL
  deslizante + limitação de tentativas + comparação de tempo constante para o endpoint de escrita
  do admin — resolvendo o mesmo problema (frontend estático público + backend Apps Script) que o
  repo `tipolis-sandbox` já resolve em produção com um token reenviado a cada requisição, sem
  sessão nem rate limit, guardado só em `sessionStorage`. A complexidade extra não veio de um
  requisito real desta issue — veio de generalizar demais um comentário sobre "não reenviar o
  token como credencial permanente" para um modelo de sessão completo. Quando existe um padrão
  irmão já rodando, comparar com ele primeiro é mais barato que projetar do zero — e evita
  reescrever depois.
- **R8.38** *(2026-08-25, sync do Apps Script v2.0.0)* **Concorrência otimista compara contra
  mudança de dado feita por outra pessoa, nunca contra mudança que a própria requisição causou.**
  A v2.0.0 passou a provisionar coluna faltante no início de cada escrita (`ensureWriteSheetSchema_`),
  e provisionar incrementa `DATASET_VERSION`. O `expected_version` que o cliente leu antes de
  enviar passava então a perder para um incremento gerado pela própria requisição, e **toda
  primeira escrita administrativa depois de uma migração de schema devolvia `VERSION_CONFLICT`**
  sem ninguém ter tocado no dado — um erro que se cura sozinho na segunda tentativa, que é o pior
  tipo: parece intermitente e some antes de ser diagnosticado. A referência do check tem que ser
  o estado observado no **início** da requisição, capturado antes de qualquer efeito colateral dela.
- **R8.39** *(2026-08-25, sync do Apps Script v2.0.0)* **Quando a lista de validação também vira
  lista de provisionamento, todo teste que usava a semente como verdade muda de significado.**
  Enquanto `REQUIRED_HEADERS` só *exigia* cabeçalho, um erro de digitação nele produzia um
  `MISSING_HEADER` barulhento e o teste "todo cabeçalho exigido existe na semente" bastava. Depois
  que `ensureHeaders_()` passou a *criar* o que falta, o mesmo erro cria uma coluna chamada
  `latitud` em silêncio — a garantia ficou mais necessária, e a semente deixou de ser a
  autoridade sobre "que colunas existem". A resposta certa não é afrouxar o teste nem congelar a
  semente à força: é **mover a rede** — declarar o delta explicitamente, cercá-lo de asserções que
  o impeçam de virar esconderijo (cada entrada precisa estar mesmo ausente da semente, mesmo
  presente no schema e mesmo documentada), e cobrar do provisionador o que antes se cobrava do
  arquivo congelado.
- **R8.40** *(2026-08-25, revisão do Apps Script v2.0.0)* **Provisionar cabeçalho é privilégio, e
  privilégio precisa de lista.** Quando o `ensureHeaders_()` passou a criar toda coluna ausente, ele
  ganhou junto o poder de **esconder um erro do operador**: apagar ou renomear `title` ou `latitude`
  fazia o "Configurar projeto" seguinte devolver uma coluna nova e vazia com o nome certo, a
  validação parava de emitir `MISSING_HEADER` porque o cabeçalho estava lá, e `validateSchemaFields_`
  pula célula vazia — o dado antigo ficava órfão sob o cabeçalho renomeado e a tela pública perdia o
  campo em silêncio. Um mecanismo que cria o que falta só é seguro quando sabe **o que tem direito
  de criar**: a criação é restrita a uma lista declarada (`PROVISIONABLE_COLUMNS`), o que falta fora
  dela continua faltando, e o relatório do setup **nomeia** o que se recusou a criar. Auto-reparo
  sem lista de escopo não conserta o sistema, só apaga a evidência do estrago.
- **R8.41** *(2026-08-25, revisão do Apps Script v2.0.0)* **Credencial que já esteve num canal
  público está queimada; migrar não é reaproveitar.** A migração do token administrativo copiava um
  `admin_token` que estava no `APP_META` — aba lida por qualquer visitante via GViz — para a Script
  Property ativa, transformando um valor **já vazado** em credencial válida do endpoint de escrita.
  Limpar a célula depois não revoga cópia que alguém já leu, nem cache de CDN, nem histórico de
  revisão da planilha. Migração de segredo exposto **apaga e exige um novo**, registrando a
  revogação; tratar exposição como reversível é o mesmo erro de trocar a fechadura e devolver a
  cópia antiga da chave.

- **R8.42** *(2026-08-25, verificação em navegador da PR da issue #26)* **Legenda e marca
  precisam resolver a cor pela MESMA função, com a MESMA entrada — não pela mesma tabela.**
  A cor da âncora cai numa cadeia (`segment` → `category` → verde padrão), mas o modelo da
  legenda guardava só o campo mais fino: uma âncora `segment: "food_hall"` +
  `category: "escola"` saía âmbar no mapa (o segmento desconhecido cedia lugar à categoria)
  e verde na legenda (que só via o segmento). As duas usavam a mesma tabela de cores e ainda
  assim divergiam, porque **a entrada era diferente**. Nenhum teste unitário pegou: cada lado,
  sozinho, estava certo. Só apareceu ao comparar, no navegador, o conjunto de `fill` dos
  marcadores com o conjunto de cores da legenda — que virou uma checagem fixa do smoke test.
  Regra geral: quando duas telas descrevem o mesmo dado, o teste é a **igualdade entre elas**,
  não a correção de cada uma isolada. E o corolário de projeto: quem tem cadeia de fallback
  transporta o registro inteiro até o ponto que resolve a cadeia, em vez de achatar antes.

- **R8.43** *(2026-08-25, review do Codex na PR #42)* **"Limpar" não delega a limpeza a uma
  rotina cujo trabalho é preservar.** `populateAnchorSegments()` existe para repopular o
  select de segmento quando o grupo muda, **preservando** a seleção se ela ainda fizer
  sentido — e `clearFilters()` chamava exatamente essa função para "zerar" o campo. Com a
  lista completa (grupo vazio), o segmento escolhido está sempre presente, então ele era
  sempre restaurado: **"Limpar filtros" não limpava**, e o mapa continuava filtrado com
  todos os controles aparentando estar vazios — o pior tipo de filtro invisível, porque a
  própria interface afirma que não há filtro. Escapou de duas verificações em navegador
  porque as duas escolhiam o grupo antes do segmento, e a troca de grupo já zerava o campo
  por outro caminho. Duas lições: uma função de restauração e uma de reset são operações
  **opostas**, e compartilhá-las exige que a intenção viaje junto (aqui, `keepSelection`);
  e teste de "limpar" começa pelo estado que só o próprio controle produz, não pelo que
  outro controle já limpou de brinde. Mesma família de R8.35, pelo lado espelhado: lá uma
  recarga apagava o que não devia, aqui uma restauração preservava o que não devia.

- **R8.44** *(2026-08-25, review do Codex na PR #44)* **Tolerância que cliente e servidor
  aplicam ao mesmo dado é um número só, e ele se copia — não se estima.** O Apps Script
  aceita a distribuição etária em escala decimal quando `Math.abs(sum - 1) <= 0.02`; a tela
  convertia a escala quando `sum <= 1.01`. Entre 1,01 e 1,02 abria uma faixa em que o
  backend **aceita** o dado e a interface o desenha na escala errada: `0,219 + 4 × 0,20`
  soma 1,019, passa na validação, e cada faixa aparecia como `0,2%` em vez de `20,0%` —
  erro de 100× sem nenhum aviso, porque os dois lados estavam "quase" de acordo. Um valor
  escolhido por conta própria porque parecia próximo do outro é uma divergência esperando
  um dado que caia no vão. Ao replicar um limiar do outro lado do pipeline, copie o valor e
  cite a origem — e, quando **não** espelhar alguma borda, escreva por que: aqui o piso
  (`sum >= 0,98`) fica de fora de propósito, porque ele descreve uma distribuição completa
  e a tela também precisa desenhar distribuição parcial.
- **R8.45** *(2026-08-26, camada de contornos, issue #28)* **No Leaflet, seletor genérico de SVG
  ou de imagem dentro do mapa mede a coisa errada.** Duas armadilhas que custam uma rodada de CI
  cada: `circleMarker` é renderizado como `<path>`, então `#map path` casa com **todos os
  marcadores** e uma contagem de polígonos escrita assim dá centenas; e os tiles do OpenStreetMap
  são `<img>`, então uma checagem de XSS escrita como "nenhum `img` dentro do mapa" **falha sempre**,
  mesmo com a página perfeitamente segura. Camada nova ganha `className` próprio e o seletor
  aponta para ele (`.polygon-shape`, `img:not(.leaflet-tile)`). O `className` é para **encontrar**
  o elemento — pintar continua sendo por `color`/`fillColor` no JS, pela R8.31: regra de classe
  vence o atributo que o Leaflet escreve no SVG.
- **R8.46** *(2026-08-25, rebase das PRs #42-#44 na `main`)* **Guard que interroga uma fonte e
  afirma sobre outra não é guard.** Ao renumerar uma regra durante um rebase, a numeração foi
  conferida com `grep` no **arquivo em disco** e o commit foi declarado correto — mas o
  `git commit --amend` tinha rodado sem nada em stage, então a árvore publicável ainda continha o
  número duplicado enquanto a verificação passava verde. O working tree e o commit são **duas
  fontes**, e a que importa é a que vai ser publicada. É a terceira aparição do mesmo padrão neste
  repositório — R8.4 e R8.23 (guard que nunca dispara), R8.42 (legenda e marca liam a mesma tabela
  com entradas diferentes) — e reaparecer depois de nomeado duas vezes é o que torna o caso forte:
  a pergunta "o que exatamente esta verificação está lendo?" precisa ser feita toda vez, não
  deduzida. Mecanismo: verificação de conteúdo versionado roda sobre `git show HEAD:<arquivo>`,
  nunca sobre o arquivo em disco, e `git status --porcelain` vazio é condição de saída — sem isso,
  "está corrigido" descreve um estado que ninguém vai receber.
- **R8.47** *(2026-08-26, desenho de contornos, issue #37)* **Validação no cliente que repete regra
  do servidor precisa ser testada CONTRA o servidor, não contra a leitura que se fez dele.** O
  desenho de polígono valida no navegador — anel fechado, 4 posições, 3 pontos distintos, faixa de
  coordenada — para o erro aparecer em português e no lugar certo, em vez de voltar como
  `INVALID_PAYLOAD` depois de uma ida ao Apps Script. Só que uma cópia de regra tem duas formas de
  estar errada, e as duas são silenciosas: **mais frouxa** deixa passar o que o servidor recusa (o
  usuário recebe erro opaco justamente onde se prometeu clareza) e **mais estrita** recusa o que o
  servidor aceitaria (funcionalidade some sem ninguém notar, porque não há erro nenhum). Ler o
  código do servidor e reimplementar "igual" não cobre nem uma nem outra. O que cobre é executar o
  servidor de verdade e confrontar caso a caso — aqui, `tests/polygon-draw.test.js` roda o `Code.gs`
  no sandbox `vm` e afirma os dois lados: **tudo que o cliente monta, o servidor aceita**, e **tudo
  que o cliente recusa, o servidor também recusaria**. Mesmo precedente de `pricePerM2_` × `pricePerM2`
  e das derivações de `tools/derive.mjs`.
- **R8.48** *(2026-08-29, fusão do Apps Script v2.2.0 com a v2.0.2, issue #50)* **Uma versão do
  backend construída a partir do ancestral errado regride correções sem gerar conflito nem erro.**
  O `Code.gs` não é mesclado por ferramenta: ele é **colado inteiro** no editor do Apps Script e
  colado inteiro de volta no repositório. Quando a versão que volta foi escrita a partir de um
  ancestral mais antigo do que a que está versionada, o `git diff` mostra um arquivo grande cheio
  de funcionalidade nova — e, no meio dele, funções que voltaram a ser o que eram antes de uma
  correção. Não há conflito para revisar, não há teste que falhe se a correção não tinha teste, e
  o arquivo continua rodando. Aqui a v2.2.0 nasceu da v2.0.0 e regredia quatro correções da
  v2.0.2, **duas delas de segurança e de integridade de dado, já valendo em produção**: um
  `admin_token` que esteve no `APP_META` — aba que qualquer visitante lê por GViz — voltava a ser
  promovido a credencial válida do endpoint de escrita, e um anel de coordenadas ausentes voltava
  a ser aceito como polígono válido perto de `[0, 0]`. Mecanismo, em três partes: (1) o número da
  versão colada **não é prova de ancestralidade** — antes de colar, compare **função a função**
  contra a versão do repositório, não arquivo contra arquivo; (2) toda correção de comportamento
  no `Code.gs` nasce com teste no sandbox `vm`, porque teste é a única parte da correção que uma
  colagem por cima não consegue apagar em silêncio; (3) a fusão que resolve é de **três vias** e o
  resultado ganha versão nova (aqui, 2.2.1), para que o número deixe de mentir sobre o que o
  arquivo contém.
- **R8.53** *(2026-08-29, motor de agregação do IVV, issue #57)* **Quando a operação de agregação
  depende da natureza do dado, a natureza é DADO declarado — e o que não foi declarado é recusado,
  não presumido.** No IVV_MONTHLY convivem fluxo (`sales_units`), estoque (`offers_units`), preço
  (`asking_price_brl_m2`) e taxa (`ivv_pct`), e cada família tem uma operação diferente: soma,
  média do período, razão ponderada `SUM(valor)/SUM(área)`, razão ponderada de fluxo sobre estoque.
  Somar doze meses de `offers_units` devolve **doze vezes o estoque real** — e esse é o pior tipo de
  defeito desta base, porque o resultado é plausível, chega formatado à tela e não tem sintoma:
  nenhum erro no console, nenhuma tela branca, nenhum `null`. A defesa não é revisar `if`s
  espalhados, é `src/ivv/metrics.js`: uma entrada por coluna, com `kind` de vocabulário fechado, e
  um motor que **lê a classificação em vez de decidir**. Da declaração vem o teste que importa —
  toda coluna do dataset precisa de entrada no registro, e coluna nova do backend quebra o teste em
  vez de cair num `SUM` por omissão (mesma família de R8.40: mecanismo que age sozinho precisa de
  lista de escopo). Corolário: `kind` novo sem operação definida no motor **lança**, não vira soma
  pelo `default` do `switch`.
- **R8.54** *(2026-08-29, motor de agregação do IVV, issue #57)* **Campo de recálculo do backend
  sinaliza divergência; ele nunca substitui o valor publicado.** `ivv_pct` convive com
  `ivv_calc_pct` e `ivv_diff_pp`, e existe uma tentação óbvia de "corrigir" o publicado pelo
  recalculado quando os dois discordam — que troca um número auditável, que alguém publicou e
  assina, por um número que a tela inventou sozinha. A regra é a inversa: o publicado prevalece
  sempre, a divergência vira **aviso nomeado** com mês, coluna e os dois valores, e a decisão volta
  para quem edita a planilha. Vale igual para o acumulado: quando `*_ytd` existe e o período é
  janeiro→mês do mesmo ano, lê-se o campo pronto em vez de recalcular, e a soma dos meses serve
  só para conferir. E vale para escala: `ivv_pct` em fração decimal (`0.057` = 5,7%) contra a
  escala de RA_PROFILES (`54` = 54%) — valor fora da faixa esperada é **sinalizado onde aparece**,
  nunca convertido em silêncio pelo motor (R5.7, R8.44).

- **R8.58** *(2026-08-29, cobertura de tráfego, issue #64)* **Campo de terceiro certo na maioria
  dos registros e absurdo numa minoria é mais perigoso que campo ausente — quando é derivável de
  outra coluna confiável, derive, não leia.** `TRAFFIC_DAILY_TEST.cobertura_dia_pct` tem um bug de
  locale/separador decimal em 9 dos 100 registros: nos dias completos `intervalos = 96` e
  `cobertura = 1` (correto), mas num dia parcial real `intervalos_15min_observados = 90` grava
  `cobertura_dia_pct = 9375` — deveria ser `0,9375`. Um campo ausente ou zerado falha visivelmente
  e é pego na primeira olhada; este passa em qualquer revisão superficial porque "funciona" em 91%
  dos casos, e só denuncia o bug quando alguém confere justamente um dos 9 dias parciais.
  `src/traffic/coverage.js` nunca lê `cobertura_dia_pct` — deriva a cobertura sempre de
  `intervalos_15min_observados / 96`, que é contagem bruta sem locale e confiável nos 100
  registros. Quando o backend corrigir o locale, a troca do cálculo local pelo campo é de uma
  linha, mas só depois do dado corrigido ser conferido registro a registro — não por confiança
  (mesma disciplina da R8.4: guard e decisão se provam contra o cenário de falha real, não contra
  a leitura otimista dele).

- **R8.59** *(2026-08-29, review do Codex na PR #65)* **Guard que normaliza entrada fora de faixa
  em vez de recusá-la apaga a evidência de que o dado estava corrompido.** Dois achados do Codex na
  mesma PR são essa mesma lição por dois caminhos. **Caminho 1:** `classifyDayCoverage` usava
  `Math.min(intervalsObserved, 96)` para "limitar" a contagem — o que significa que
  `classifyDayCoverage(9375)` devolvia `status: 'complete'`, cobertura `1` e nenhum `qualityFlag`.
  9375 é justamente o valor real de `cobertura_dia_pct` no exemplo corrompido da R8.58: um módulo
  construído para **isolar** esse bug engoliria exatamente ele, em silêncio, se alguém passasse o
  campo errado por engano. A correção é recusar (`null`/`unknown`), nunca clampar, qualquer
  contagem fora de `[0, 96]`. **Caminho 2:** `intervalsObserved = 0` era classificado como
  `partial` com cobertura `0`, o que fazia `averageFlow` tratar um dia sem nenhuma medição como uma
  medição válida de valor baixo — `{flow:1000, intervalos:96}` + `{flow:0, intervalos:0}` dava
  média `500` com `daysUsed: 2`, quando o segundo dia não tinha dado nenhum para contribuir.
  Cobertura zero é ausência, não amostra; por isso vira `unknown` e é excluído. Em ambos os casos, o
  bug estava em fazer o valor "caber" (por `Math.min` ou por aceitar `0` como medição) em vez de
  perguntar se ele fazia sentido primeiro — normalizar sem validar é a forma mais barata de destruir
  o próprio sinal que o guard existe para preservar.
