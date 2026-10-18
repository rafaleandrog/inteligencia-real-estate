# Motor da fan-out de correção

Lido pelas skills `revisar-pr-shell` e `revisar-pr-apps`, no § 8.5 de cada uma — e **só quando o
usuário pediu o modo ciclo**. Revisão fria não abre este arquivo: ela descreve o conserto no
relatório e para, que é o comportamento normal e o default.

Arquivo único, pelo mesmo motivo do `motor-revisao.md`: a receita abaixo roda igual na máquina do
usuário e em sessão na nuvem, e detecção de ambiente entre cópias é cerimônia que envelhece.

## O invariante — é ele que sustenta o resto

> **Quem revisa não conserta, e quem conserta não revisa.** A sessão nunca escreve código com as
> próprias mãos: ela revisa por lentes, delega o conserto a subagentes disjuntos, e a rodada
> seguinte confronta o patch com lentes **novas**.

Duas consequências, e as duas são obrigatórias:

- **O relatório do agente de conserto nunca entra no briefing da lente da rodada seguinte.**
  Justificativa de quem consertou ancora quem revisa. A § 8 da skill já avisa que o defeito da
  rodada N costuma ser filho do conserto da rodada N−1; no modo ciclo isso deixa de ser exceção e
  passa a ser o caso normal de toda rodada. A lente recebe commit novo como código fresco, sem
  saber que houve conserto e sem saber o que o agente alegou ter feito.
- **O orquestrador não edita arquivo.** Nem "essa é rápida, faço eu". A sessão que edita perde o
  direito de dizer que a rodada seguinte é independente, e ninguém percebe: o relatório sai igual.

## Portões antes de despachar qualquer conserto

Nenhum agente de conserto sai sem estes quatro fechados. Falhou um, o ciclo não começa — a
revisão fria roda inteira e o motivo vai na sessão, numa linha.

1. **Achado verificado por você.** § 11 da skill: bloqueante só existe depois que você abriu o
   arquivo e reconferiu a citação. Consertar achado não verificado é gastar rodada consertando o
   que não estava quebrado — e a rodada seguinte devolve o mesmo achado, agora sobre código pior.
2. **Autoria e head do PR, consultados e anunciados.** `head.repo` diferente do `base.repo` (PR
   vindo de fork), ou autor que não é o usuário nem uma sessão dele: os consertos são **montados**
   normalmente, e o **push para antes de acontecer** — ele exige **confirmação expressa**, pedida
   em texto corrido (a ferramenta de múltipla escolha é bugada nesta instalação). A resposta vale
   para a chamada inteira: não se pergunta de novo a cada rodada.

   PR do próprio usuário aberto por **outra sessão dele** (as branches `claude/`) não pede
   confirmação de push — mas **anuncie quem abriu**, porque a trava do portão 3 só pega dentro do
   clone e uma sessão irmã viva noutra máquina escreveria na mesma branch sem nada recusar. Quem
   fecha esse buraco é o § 1.5 da skill, lá na entrada: ou você já estava na branch do PR, ou o
   usuário trouxe da outra sessão o `branch liberada` com o SHA. **Chegou até aqui, isso já foi
   resolvido** — não repergunte. Não foi, o ciclo não devia ter começado: pare e volte ao § 1.5.
3. **Árvore no head do PR, e na branch — não destacada.** O motor de revisão monta worktree
   `--detach` porque só lê. Conserto commita, então precisa da branch. **No modo ciclo a árvore é
   uma só, montada na branch já na rodada 1**: o motor de revisão exige que ela esteja no head do
   PR, não que esteja destacada, e duas árvores para o mesmo PR é o caminho curto para revisar
   uma e consertar a outra.

   **Comece perguntando se você já está na árvore certa.** É o caso normal — quem abriu o PR está
   na branch dele —, e montar worktree por reflexo quebra logo aí: o git recusa checar a mesma
   branch em duas árvores, então a sessão que **já está** na branch do PR falharia no primeiro
   comando, culpando um terceiro que não existe. É a mesma comparação que o motor de revisão faz
   em § *A árvore que o motor lê*:

   ```bash
   git fetch origin "<branch-do-pr>"
   git branch --show-current                     # vazio = HEAD destacado
   git rev-parse HEAD "origin/<branch-do-pr>"    # as duas linhas têm que bater
   ```

   - **Já na branch do PR, no head dele, e não destacada:** é a sua árvore.

     ```bash
     WT=$(git rev-parse --show-toplevel)   # a variável nasce AQUI, não na prosa
     git -C "$WT" status --porcelain       # tem que sair VAZIO — ver abaixo
     ```

     Não monte worktree nenhuma.
   - **Noutra branch, ou destacada:** monte a worktree, e **sem `-B`**:

     ```bash
     WT=<scratchpad da sessão>/wt-<n do PR>   # a variável nasce AQUI, também

     # Os dois `worktree add` são ALTERNATIVAS: rode UM. Em sequência os dois quebram —
     # o segundo acha o caminho ocupado, ou o primeiro já falhou por referência inválida.
     if git show-ref --verify --quiet "refs/heads/<branch-do-pr>"; then
       git worktree add "$WT" "<branch-do-pr>"                        # a branch local existe
     else
       git worktree add --track -b "<branch-do-pr>" \
         "$WT" "origin/<branch-do-pr>"                                # ainda não existe aqui
     fi
     git -C "$WT" rev-parse HEAD    # tem que bater com o head do PR, antes de qualquer coisa
     ```

     Worktree recém-montada nasce limpa, então o `status` do primeiro caso é dispensável aqui.

   - **`HEAD` que não bate com `origin/<branch-do-pr>`, em qualquer um dos dois caminhos:** a
     branch local divergiu do PR. **Pare.** Vale igual para a árvore da sessão e para a worktree
     montada a partir de uma branch local que já existia — é por isso que o `rev-parse` está no
     bloco. Reconciliar divergência é decisão, não conserto, e resolvê-la por conta própria é
     como se perde commit.

   **Árvore com alteração pendente não entra no ciclo.** Ela quebra as duas coisas que vêm
   depois: o cruzamento de conjuntos da colheita passa a acusar como conserto o que já estava
   lá, e o `checkout --` que reverte um lote reprovado **apaga trabalho não commitado do
   usuário** junto com o lote. Sujou, **pare** e diga o que há na árvore: commitar ou guardar o
   trabalho alheio é decisão dele, não sua.

   **E parar é a única saída aqui, não uma entre duas.** A tentação é mandar montar a worktree
   do segundo caso e seguir por ela — mas a árvore suja que ameaça o ciclo é, por construção, a
   que já está **na branch do PR**, e montar a mesma branch numa segunda árvore é justamente o
   que o git recusa. A worktree resolveria um problema que só existe onde ela não pode ser
   montada. No outro caso a árvore da sessão nem entra na conta: o ciclo já ia montar worktree
   de qualquer jeito, e ela nasce limpa.

   **Nunca `-B` aqui.** Ele força a criação da branch e **reseta** a local para o start-point:
   commit ainda não empurrado — o push da rodada anterior que morreu na rede, ou um commit que o
   usuário fez na branch — some sem aviso, e o ciclo segue por cima do trabalho apagado. É só
   isso que se ganha tirando o `-B`: a recusa de branch já checada em outra árvore vale nos dois
   casos (só `--force` a dispensa), e é a recusa que você quer — **pare**, alguém está na branch. Mas ela é trava só **dentro do clone** — o `CLAUDE.md`
   § Sessões paralelas é explícito: *"entre clones/máquinas não há trava"* —, então sessão irmã
   noutra máquina passa direto por ela, e quem cobre esse caso é o anúncio do portão 2.

   **Clone dedicado dispensa worktree** — PR de app mora em repositório próprio, e um clone feito
   agora já está na branch certa. Mas confira que ele está **na branch**, e não destacado: clone
   que a revisão montou com `--detach` commita para lugar nenhum, e o push seguinte não tem o que
   empurrar. `git -C "$WT" symbolic-ref -q HEAD` vazio é HEAD destacado.
4. **Suíte verde antes de começar.** Rode `pnpm build` e a suíte rápida **antes** do primeiro
   conserto. Vermelho já na entrada, você não tem como atribuir a quebra a conserto nenhum, e a
   rodada inteira vira caça a um defeito que já estava lá. Declare e siga, ou pare — mas saiba.

## A partição — o eixo é o arquivo, nunca o achado

Achados cujos conjuntos de arquivos se cruzam **viajam no mesmo lote**. Dois agentes editando o
mesmo arquivo em paralelo é perda garantida: o segundo salva por cima e o achado do primeiro
volta na rodada seguinte, agora sem ninguém entender por quê.

- Monte a lista `achado → arquivos que ele vai tocar` (incluindo **o doc e o teste**, que são
  arquivos como qualquer outro e são a origem mais comum de cruzamento silencioso).
- Una os achados cujas listas se intersectam. O que sobra são os lotes, e eles são disjuntos por
  construção.
- Um agente por lote, **todos em paralelo, numa mensagem só**.
- Lote que ficou com mais de ~4 achados ou mais de ~8 arquivos não é lote, é a rodada inteira num
  agente só: quebre o problema de outro jeito, ou traga o achado grande de volta para você.

## O que o agente de conserto NÃO faz

Vai cravado no briefing, porque o `CLAUDE.md` não viaja no prompt de ninguém e agente com shell
acha tudo natural:

- **não usa git.** Nada de `add`, `commit`, `stash`, `checkout`. `index.lock` concorrente derruba
  o lote, e commit por agente destrói a atomicidade da rodada. Ele edita arquivo, e só.
- **não roda `pnpm build` nem a suíte de pacote nenhum** — os lotes correm em paralelo e trampam
  `dist/`, `tsbuildinfo` e a porta 3000 uns dos outros. **Pode, e deve, rodar os arquivos de teste
  que ele mesmo tocou**, direto pelo runner (`node --test <arquivo>`): não constrói nada, não abre
  porta, e o lote que descobre ali que quebrou conserta na hora em vez de virar lote de reparo
  depois. A validação do conjunto é do orquestrador, uma vez, depois da colheita.
- **não toca rota de API de instância alguma** — produção, homologação, local, nem GET. Mesma
  proibição da revisão, mesmo motivo.
- **não amplia o escopo.** Conserta o achado que recebeu. Refatoração de carona, renomeação
  "de passagem" e limpeza não pedida entram no diff sem revisor e saem na próxima rodada como
  achado novo. Viu algo fora do lote? **Relata, não conserta.**
- **não mexe em migração já mergeada.** Migração é imutável: o desfecho é re-encadear a nova.

## O que o briefing carrega

O agente não adivinha convenção do repo. Cada briefing leva, além do achado (com `arquivo:linha`
e a citação literal do relatório) e do lote:

- **doc no mesmo commit** — comportamento mudou, o doc muda junto, e é o mesmo agente que muda;
- **UI e API andam juntas** — capacidade na API sem controle na tela é feature invisível;
- **português no código** — nomes de variável, função, tabela e rota;
- **`Closes #123` em inglês**, repetido por issue, no corpo do PR — `Fecha` não fecha nada;
- **permissão é `nivelApp`/`rolesApp`**, nunca `usuario.tipo`; **natureza nunca segrega**;
- **nada de SQL manual** como solução: migração, endpoint/UI de admin ou código versionado;
- **mudou `sdk/`** → bump do inteiro `N.0.0` nos três espelhos.

E carrega o que decide se o conserto vai **sobreviver à rodada seguinte** — três coisas que um
ciclo real pagou por não ter (4 rodadas, 20 lentes, 8 dos 9 achados das rodadas 2–4 nascidos do
conserto anterior):

- **A invariante, não o mecanismo.** *"Só uma falha que este processo anunciou silencia uma
  idêntica depois"* é briefing; *"crie um `Map` negativo com as assinaturas que falharam"* é o
  orquestrador desenhando por procuração — e o desenho errado dele virou dois achados na rodada
  seguinte. Onde há estado, vai junto a **tabela-verdade**: as sequências e o que sai em cada uma.
  Ela é o teste antes de ser o teste.
- **Nunca o texto de substituição.** Fato a verificar e onde verificar; a frase quem escreve é o
  agente, e o retorno cita a linha que a sustenta. Prosa pronta no briefing carrega o erro de
  quem revisa com a assinatura de quem conserta — foi assim que *"sem webhooks"* e *"pela
  inscrição automática"* entraram no repositório: as duas falsas, as duas do orquestrador, as
  duas copiadas fielmente por um agente que fez o que lhe pediram.

  **E isso não é só sobre a frase — é sobre o fato dentro dela.** A regra escapa pela forma mais
  inocente: em vez de ditar o texto, o orquestrador dita uma *precisão a respeitar* — "atenção,
  em X o sistema não faz Y" — e indica a documentação que confirma. O agente confere contra a
  documentação indicada, ela concorda, ele escreve, e a afirmação entra no repositório com o peso
  de contrato. Num ciclo real foi assim que uma afirmação falsa sobre o comportamento do sistema
  entrou em **quatro** arquivos de uma vez, documentação e contrato publicado juntos: o que estava
  errado era a fonte que o orquestrador citou. Então escreva o fato como **pergunta**, não como
  premissa — *"verifique se X e diga o que achou"* —, e deixe a proibição comum da revisão fazer o
  resto: fato afirmado no briefing é hipótese a verificar **no código**, e o retorno cita a linha
  de código, nunca o documento que o briefing indicou.
- **"Enumere antes de escrever"**, quando o achado fala de comportamento que atravessa
  superfícies ou call-sites: a lista completa (`grep` dos mounts, dos chamadores, das escritas)
  vai no retorno do lote, e é ela — não a frase — que a rodada seguinte confere.

## Tier por classe de achado

Subagente nativo, com `model` explícito. A classe é do achado, não do agente:

| Classe | Exemplo | `model` |
|---|---|---|
| Mecânico / textual | `Fecha`→`Closes`, linha de doc, rename, bump dos três espelhos do SDK | `haiku` |
| Local, com teste | guarda removida, condição invertida, teste faltando, caminho de erro descartado | `sonnet` |
| Toca contrato | auth, permissões, contas, migração, `schema.json`, `manifesto.json` | `opus` — ou **volta para o usuário** |

Classe que toca contrato é a fronteira do que o ciclo pode resolver sozinho: se o conserto
implica escolher entre dois desenhos, ele **não** é conserto, é decisão de desenho, e a § 9 da
skill manda encerrar com a pergunta. Delegar decisão sua a um subagente é terceirizar julgamento.

O tier é declarado no relatório da rodada, como o motor de revisão declara o dele.

## A colheita — e a guarda que impede alegação virar conserto

Retorno de **no máximo 150 palavras de prosa** (`COMO` e `FORA DO LOTE`), texto livre em formato
fixo. O teto é contra prosa, não contra evidência: `TESTE` e `ENUMERACAO` ficam **fora da
contagem** — a enumeração é uma linha por item, no formato `arquivo:linha` (ou `arquivo:função`),
sem frase explicativa, e é isso que a mantém curta mesmo completa. Nada de saída estruturada:
o handler de permissão desta instalação devolve input inválido e a chamada falha 100% das vezes.
**Sem diff no retorno** — é o que preserva o contexto do orquestrador.

```text
LOTE: <id>  MODELO: <haiku|sonnet|opus>  DURACAO: <tempo>
ARQUIVOS: <lista>
ACHADO <n>: consertado | NAO_CONSERTADO
COMO: <1–2 frases>
TESTE: <arquivo:caso que reproduz o cenário do achado — ou "sem estado: n/a">
ENUMERACAO: <uma linha por item, "arquivo:linha" ou "arquivo:função", sem frase explicativa — a lista completa quando o achado atravessava superfícies ou call-sites, ou "n/a">
FORA DO LOTE: <o que ele viu e não tocou, ou "nada">
```

`TESTE` vazio num achado de estado, ou `ENUMERACAO` vazia num achado multi-superfície, é lote
**NAO_CONSERTADO por construção** — a regra é do ciclo (§ *O que o conserto tem de trazer*); aqui
é onde ela se mede, antes de qualquer `git status`.

**Alegação não é conserto.** Antes de aceitar qualquer `consertado`, confira o que de fato mudou
no disco — e confira **por lote**, nunca pela árvore inteira:

```bash
git -C "$WT" status --porcelain -- <arquivos do lote>   # o lote mexeu no que disse que mexeria?
git -C "$WT" status --porcelain                         # o conjunto todo, para cruzar
```

O primeiro comando, vazio, é laudo limpo falso. O segundo tem que caber na união dos lotes: nome
que aparece ali e não está em lote nenhum é agente que atropelou o vizinho. **Os dois só provam
alguma coisa porque o portão 3 exigiu a árvore limpa na entrada** — numa árvore suja, o que já
estava modificado aparece nos dois e nenhum dos cruzamentos separa conserto de trabalho alheio.

O estado agregado da árvore **não** serve de prova: com os lotes rodando em paralelo, basta um
deles ter alterado qualquer coisa para que `status` e `diff --stat` mostrem mudança, e o lote que
não encostou em arquivo nenhum passa de carona. O que decide é o cruzamento dos dois conjuntos —
os arquivos **daquele** lote contra os que de fato mudaram.

Agente que devolve `consertado` sem nenhum arquivo **do lote dele** alterado, ou que alterou
arquivo **fora do lote**, é falha do lote, não sucesso: o primeiro é laudo limpo falso, o segundo
atropelou o vizinho e a partição deixou de valer. Nos dois casos, reverta o lote e trate o achado
como não consertado, registrando no relatório qual foi. **São dois comandos, e faltar o segundo
deixa a árvore contaminada:** o `checkout` só restaura arquivo que o git já rastreia, e o agente
pode ter criado arquivo novo — que sobreviveria à reversão e entraria no commit da rodada.

```bash
# ALVOS = os caminhos do lote, MAIS os que o cruzamento acima acusou fora dele.
git -C "$WT" checkout -- $ALVOS                    # o que o git já rastreava
novos=$(git -C "$WT" ls-files --others --exclude-standard -- $ALVOS)
[ -n "$novos" ] && git -C "$WT" clean -fd -- $ALVOS # o que o agente criou do zero
```

**Duas armadilhas nesse `clean`, as duas medidas:**

- **Pathspec vazio apaga a árvore inteira.** `git clean -f --` sem caminho nenhum remove *todo*
  arquivo não rastreado — inclusive o que os outros lotes acabaram de criar, que estão rodando
  em paralelo. Lote que só editou arquivo existente tem `$ALVOS` sem novos, e é exatamente aí
  que a lista fica vazia. Por isso o `ls-files --others` vem antes: **lista vazia, não rode.**
- **Sem `-d` o diretório novo sobrevive.** `clean -f` não entra em diretório não rastreado;
  arquivo que o agente criou em pasta nova fica na árvore e entra no commit da rodada, que é o
  defeito que este bloco existe para impedir. É `-fd`, nunca `-f` sozinho.

## Validação e commit — do orquestrador, uma vez

Depois de toda a colheita, e só então:

```bash
(cd "$WT" && pnpm install --frozen-lockfile && pnpm build)
```

O `install` é **obrigatório na worktree recém-montada** e sempre que o conserto mexeu no
`pnpm-lock.yaml`: `node_modules` é por árvore de trabalho e não se compartilha entre worktrees
(`CLAUDE.md` § Sessões paralelas, regra 3), então árvore nova não tem nenhum. Na árvore da
própria sessão, que já rodou `install`, ele só volta a ser necessário pelo lockfile.

**A suíte é a do pacote que o conserto tocou, e são todas as dele.** O `AGENTS.md` § Testes é
quem manda — *"a sessão **sempre** roda os testes unitários do pacote que tocou... Rodar só o
arquivo novo não basta: o recorte é a suíte do pacote"* —, e a tabela por pacote está lá:

| Pacote que o conserto tocou | Comando |
|---|---|
| `shell/backend/` | `pnpm -C shell/backend test:rapido` |
| `shell/frontend/` | `pnpm --filter @urbiverso/shell-frontend test` |
| `ui/` | `pnpm --filter @urbiverso/ui test` |
| `compartilhado/` | `pnpm --filter @urbiverso/compartilhado test` |
| `sdk/` | `pnpm --filter @urbiverso/sdk test` |

Rode **cada** suíte cujo pacote o conserto encostou — dois pacotes tocados são duas suítes.
Tocou `ui/src`, `shell/frontend/src` ou `apps/*/frontend`, rode também a catraca de contrato de
UI: `node --test scripts/ui-contrato-explicito.test.js`. Conserto que não encostou em pacote
nenhum — só `.claude/`, `.cursor/` ou doc — roda o gate que cobre aquilo (`pnpm test:skills`
para as skills; `node scripts/filtrar-docs-sdk.js && node scripts/check-docs-sdk.js` para
`docs/shell/`), e não a suíte de um pacote que ninguém tocou.

**O escopo é o do conserto DAQUELA rodada, não o do PR.** A pergunta é "que pacotes este commit
tocou?", nunca "que pacotes o PR toca?" — num ciclo de quatro rodadas as três últimas costumam ser
conserto de texto, e rodar por elas a suíte de um pacote que ninguém encostou é tempo de relógio
gasto para provar o que não mudou. Conserto só de documentação roda o gate de documentação e mais
nada.

`test:completo` **não** entra na validação por rodada, nem quando o PR mexe em migração, dados ou
`nucleo/`: por rodada vale o rápido do pacote tocado, e a completa roda **uma vez, antes do
veredito**, junto da varredura final (regra do ciclo, *Antes do veredito*). O `subirPgDescartavel()`
não depende do cluster de serviço, então ela roda em qualquer máquina — o que custa é relógio, e é
por isso que ela é uma só.

**PR de app roda a suíte da app, no repositório dela** — `shell/backend` não existe lá, e mandar
rodá-la faria toda rodada cair em *Falha · regressão* sem nada estar quebrado.

Vermelho → **um lote de reparo dirigido ao dono do arquivo**, com a saída do erro no briefing.
Vermelho de novo depois do reparo é critério de parada do ciclo (§ 8.5 da skill), não terceira
tentativa.

Verde, um commit por rodada, listando os achados endereçados:

```
consertos da rodada <N> da revisão

- <arquivo:linha> — <achado em uma linha>
- ...
```

Push explícito, sempre com o nome da branch — `git push` pelado já empurrou repositório inteiro
para `main` em duas sessões:

```bash
git -C "$WT" push -u origin "<branch-do-pr>"
```

Ao terminar o ciclo, `git worktree remove "$WT" --force` — **só se foi você quem montou a
worktree** no portão 3. A própria árvore da sessão e o clone dedicado de PR de app não são
worktrees removíveis, e o comando erra no fim de um ciclo que deu certo.

## Origem e ponto — classifique antes de montar lote

Na rodada N+1, **antes de montar lote**, classifique cada achado novo. A unidade é a **linha**
citada, nunca o arquivo — achado com várias linhas percorre cada uma. A pergunta é mecânica: o
commit que por último tocou aquela linha, **na revisão do head que a rodada N+1 revisou** (não na
árvore de trabalho), é o commit de conserto da rodada N (há um por rodada)?

O head é o da rodada **N+1**, e não o da N, por duas razões. O commit de conserto da rodada N nasce
**depois** do head que a rodada N revisou, então um blame ali nunca o encontraria e todo achado
sairia *original*. E o número de linha que o achado cita é do código que a rodada N+1 leu — contra
outra revisão ele aponta outra linha.

```bash
git -C "$WT" blame -L <linha>,<linha> <head revisado na rodada N+1> -- <arquivo> | cut -c1-8   # o commit da linha citada, NA REVISÃO
```

SHA igual ao do commit de conserto da rodada N: **regressão** — o conserto anterior a produziu.
SHA diferente: **original**. A comparação é sempre pelo sha — os 8 caracteres depois do `^`,
quando ele aparece — nunca pela presença do prefixo: `^` só marca a fronteira do histórico
disponível (clone raso) e essa fronteira pode cair em qualquer commit, inclusive o próprio
conserto da rodada N, caso em que a saída vem com `^` e ainda assim é regressão (a skill já roda
`git fetch --unshallow` no ritual de início, o que torna o caso raro). `00000000` na saída não é
veredito sobre a linha — é sinal de ter rodado o blame contra a árvore de trabalho com alteração
pendente em vez da revisão: corrija o comando, não a classificação.

Achado que cita **várias linhas** é regressão se **qualquer uma** delas cair no commit de conserto
da rodada N — o laço para no primeiro acerto (uma linha original e outra regressão já basta para
contar o achado inteiro como regressão). A origem entra no placar do relatório, achado a achado.

**A origem é diagnóstico, e não decide parada nenhuma.** Ela mostra se o laço está produzindo
defeito, e é barata. O que decide parada é o **ponto** — a regra do ciclo tem o critério e a
medição do porquê. Não conte proporção de regressão: num ciclo saudável a rodada N+1 revisa
exatamente o conserto da rodada N, então origem *regressão* é o caso normal, não o sintoma.

**O ponto sai do mesmo `blame`, e mais uma comparação.** Depois de classificar a origem, compare o
conjunto de `arquivo:linha` do achado novo com o de cada achado das rodadas anteriores: intersecção
não vazia, ou linha citada que nasceu no lote que consertou um deles, e é **o mesmo ponto** — o
mesmo nome vai no placar. Fora isso, o reconhecimento é seu: a mesma questão muda de arquivo e
continua sendo a mesma. Ponto na **segunda** passagem obriga o briefing a mandar **enumerar antes de
escrever**, com a lista completa no retorno do lote; na **terceira**, o ciclo para (regra do ciclo,
*Critérios de parada*).

## O passe de fechamento — o conserto que não abre rodada

Zerados os bloqueantes, a skill manda rodar o **passe de fechamento** antes do veredito: as
observações que sobraram abertas, filtradas por *compensa* e *é trivial*. O critério de entrada é
de lá; aqui está o que muda na máquina.

- **Tier: `haiku` e `sonnet`, nunca `opus`.** Não é economia, é definição — a classe *toca
  contrato* da tabela acima é exatamente a que não é trivial. Pegou-se escolhendo `opus`, o
  achado não era do passe: devolva-o ao placar como aberto. Pela mesma razão, achado cujo
  conserto pede **teste novo em arquivo novo** já se denunciou: teste é arquivo como outro
  qualquer, e arquivo novo não cabe aqui.
- **Uma leva só**, partição por arquivo como sempre, todos em paralelo. Sem segunda leva depois
  da colheita: o passe não itera.
- **O limite é medido antes do commit** — é ele que paga pela rodada de revisão que não vai
  acontecer. A árvore está limpa (a última rodada já commitou e empurrou), então o que o git
  mostra **é** o passe:

  ```bash
  git -C "$WT" diff --numstat                         # <adicionadas> <removidas> <caminho>
  git -C "$WT" ls-files --others --exclude-standard   # arquivo novo: nenhum, sempre
  ```

  `.md` é documentação e passa livre. Código soma por lote, e o teto é ~5 linhas por achado
  **em cada coluna** do `--numstat`: reescrever cinco linhas dá 5 adicionadas e 5 removidas, e é
  conserto de cinco linhas, não de dez. **Arquivo novo nunca é conserto trivial** — e ele não
  aparece no `--numstat`, que é por que o segundo comando existe. Estourou o teto, apareceu
  caminho fora de lote, ou nasceu arquivo: **reverta aquele lote** pela receita de § A colheita
  (`checkout --` mais o `clean -fd` com o pathspec conferido) e devolva o achado como *ainda
  aberto*, motivo "não coube no passe".
- **Build e suíte como em qualquer rodada — e aqui sem lote de reparo.** Vermelho depois do passe
  significa que o conserto não era trivial, e a saída é reverter o passe inteiro (`$ALVOS` = a
  união dos lotes dele) e não commitar. Reparo dirigido transformaria o passe num ciclo dentro do
  ciclo, que é justamente o que não foi pedido.
- **Commit com assunto próprio**, para que o `git log` separe o que foi revisado do que não foi:

  ```
  passe de fechamento da revisão — <n> não-bloqueantes triviais

  - <arquivo:linha> — <achado em uma linha>
  ```

  Push explícito com o nome da branch, como sempre. Depois dele vêm o comentário do passe no PR e
  a linha na sessão, os dois exigidos pela regra do ciclo — e é só então que o veredito sai.

## Motor externo para conserto — porta aberta, não implementada

A economia do motor externo na revisão vem de uma assimetria que **não se repete aqui**: a lente
engole um doc inteiro para devolver 400 palavras, então o custo mora no input. O conserto lê
pouco e escreve — o lado caro de todos os tiers. Some-se que o agente de conserto precisa de
muito mais convenção de repo que uma lente, e que a independência de opinião, que é o segundo
ganho do motor externo, vale para **revisar**, não para consertar: o conserto errado é pego pela
rodada seguinte, que já é externa.

Há ainda um custo de segurança concreto: a trava de hoje é o `--agent-file` **somente-leitura**,
que existe porque o `kimi -p` escreve sem pedir. Conserto exige um **segundo** perfil, de escrita,
e o perfil da revisão tem que continuar read-only — provado por teste, não por intenção.

**Critério para reabrir:** meça, em uns cinco ciclos, quanto do custo total foi conserto. Passou
de ~20%, a máquina se paga e vale escrever o perfil de escrita. Abaixo disso, não vale.

## O que nunca sai daqui

- Conserto sem o usuário ter pedido o modo ciclo.
- Conserto de achado que você não verificou.
- Push sem confirmação expressa quando o PR é de terceiro ou vem de fork.
- **Edição de arquivo** pelas mãos do orquestrador. O **commit** é dele, por desenho — um por
  rodada, depois da validação (§ Validação e commit); quem não commita é o agente de conserto
  (§ O que o agente de conserto NÃO faz).
- **Segunda tentativa no passe de fechamento.** Lote revertido lá vira achado aberto, e pronto:
  o passe não itera, e suíte vermelha depois dele não abre lote de reparo.
- Merge. O ciclo termina em **veredito**; merge é a § 9 da skill, e só com autorização expressa.
