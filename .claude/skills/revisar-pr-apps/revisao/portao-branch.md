<!-- Regra compartilhada de revisão de PR — lida na execução pelas skills de revisão dos
     DOIS catálogos e embutida no pacote que leva a skill ao repositório de apps do cliente.
     Por isso este arquivo é
     AUTOCONTIDO: ele roda em sessão que não tem o monorepo — nada daqui pode exigir a leitura
     de arquivo que só existe lá (convenções do repositório, documentação da plataforma),
     nem citar caminho de catálogo de skill ou motor externo por nome. -->

# A branch do PR é de uma sessão só — confirme antes de entrar nela


A revisão lê a árvore no head do PR, e o modo ciclo **commita e empurra nela** —
as duas coisas assumem que mais ninguém está escrevendo ali. A única trava que existe é o git
recusando checar a mesma branch em duas árvores **do mesmo clone**; entre clones e máquinas não
há trava nenhuma. E a sessão que abriu o PR costuma continuar
viva e inscrita nos eventos dele, de modo que **é esta revisão que a acorda**: comentário do
relatório, push de conserto, CI vermelho. Acordada, ela empurra por cima — ou você revisa um head
que se moveu debaixo do relatório.

Pergunte à árvore, não à memória; o nome da branch (`headRefName`), o autor e o dono do repo do
head vêm do conector/MCP GitHub que a sessão tiver:

```bash
git branch --show-current    # vazio = HEAD destacado, e destacado não é "estar na branch"
```

- **Já na branch do PR** → a branch é sua, siga sem perguntar nada.
- **PR de terceiro ou vindo de fork** (`head.repo` ≠ `base.repo`, ou autor que não é o usuário
  nem uma sessão dele) → não há sessão irmã para fechar e o prompt abaixo não serve a ninguém.
  Siga; o portão de push do modo ciclo continua valendo, e exige confirmação expressa.
- **Usuário já declarou a branch livre nesta chamada** — "arquivei aquela sessão", "ninguém está
  nela", "branch liberada" → siga, e registre no anúncio que foi ele quem liberou.
  **Não pergunte duas vezes:** guarda que repergunta o que já foi respondido é a guarda que todo
  mundo aprende a pular.
- **Qualquer outro caso** → você está **entrando** na branch de outra sessão. Diga isso em uma
  linha, publique o prompt abaixo e **PARE**. Não despache, não calibre
  esforço, não abra lente, não clone nada: quem libera a branch é o usuário, na sessão que a ocupa.

### O prompt de fechamento — publique em bloco, para o usuário colar na outra sessão

Preencha `<branch>` e `<n>` e publique **exatamente assim**, num bloco de código, sem prosa
enfeitando em volta. O bloco é para ser copiado inteiro, e o que volta é uma linha:

````text
Pare o trabalho na branch `<branch>` (PR #<n>). Outra sessão vai revisar esse PR e, se eu
autorizar, consertar nessa mesma branch a partir de agora — duas sessões escrevendo nela se
sobrescrevem, e entre máquinas o git não recusa nada.

Nesta ordem:

1. `git status --porcelain` e `git log --oneline origin/<branch>..HEAD`. Sobrou qualquer coisa,
   commite e `git push -u origin <branch>` agora: o que não estiver empurrado se perde.
2. Depois desta mensagem, não commite, não empurre e não reescreva histórico nessa branch.
3. Cancele a inscrição nos eventos do PR, se a sua sessão tiver uma (no Claude Code,
   `unsubscribe_pr_activity`; noutro runtime, o mecanismo equivalente).
   Comentário e CI vermelho te acordam, e acordada você empurra por cima da outra sessão.

Responda **uma linha só**, sem relatório e sem resumo do que fez:

    branch liberada — <sha do head empurrado>
    branch ocupada — <o que ficou faltando>
````

**O que você aceita de volta é `branch liberada` com o SHA, e o SHA é conferido** contra o head
do PR pelo conector. Bateu, siga. Não bateu, a outra sessão empurrou depois de responder ou
respondeu sem ter empurrado — pergunte de novo em vez de seguir, porque o relatório sairia sobre
código que já não é o do PR. `branch ocupada`, ou qualquer resposta que não seja uma dessas duas,
é branch **não** liberada: pare e diga ao usuário o que ficou faltando.

Não há sessão para receber o prompt em dois casos — PR aberto à mão pelo usuário, e sessão já
arquivada. Nos dois quem responde é ele, em texto corrido, e isso vale como liberação.
