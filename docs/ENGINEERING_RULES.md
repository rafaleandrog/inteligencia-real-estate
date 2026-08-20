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
- **R4.7** Endpoint do Apps Script é read-only na V1, com allowlist de datasets. Sem `doPost`
  público, sem endpoint de administração.
- **R4.8** Configuração privada do Apps Script mora em Script Properties, nunca em célula.

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
- **R6.2** Prioridade de cobertura: conversão numérica, normalização das 4 entidades, mediana,
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
- **R7.2** **Toda PR passa por review do Codex antes do merge.** Ver
  [`AI_WORKFLOW.md`](AI_WORKFLOW.md). Sem rodada limpa do Codex, não há merge.
- **R7.3** Todo achado do Codex que revele uma **classe** de erro vira regra nova na seção 8,
  na mesma PR que corrige o achado.
- **R7.4** A PR relata: arquivos alterados, resumo do diff, testes executados, problemas restantes.
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
