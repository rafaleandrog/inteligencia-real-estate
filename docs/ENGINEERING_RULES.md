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
- **R4.9** *(issue #5)* O Apps Script pode expor um endpoint de escrita (`doPost`) **somente**
  sob autenticação obrigatória — token comparado a `ADMIN_TOKEN` em Script Properties. Sem o
  token configurado, toda escrita é recusada; não existe modo aberto. Isto substitui a proibição
  anterior de `doPost` (antiga R4.7): a exceção é deliberada, documentada aqui, e não abre o
  endpoint de leitura, que continua público e sem autenticação. Campo derivado
  (`asking_price_brl_m2`) nunca é aceito como valor de entrada — é sempre calculado no servidor a
  partir dos campos-fonte, com a mesma fórmula de `pricePerM2()` em `src/normalize.js`. Ver
  `docs/SHEET_SETUP.md` para configurar o token.

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