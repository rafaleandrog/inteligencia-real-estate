<!-- Regra compartilhada de revisão de PR — lida na execução pelas skills de revisão dos
     DOIS catálogos e embutida no pacote que leva a skill ao repositório de apps do cliente.
     Por isso este arquivo é
     AUTOCONTIDO: ele roda em sessão que não tem o monorepo — nada daqui pode exigir a leitura
     de arquivo que só existe lá (convenções do repositório, documentação da plataforma),
     nem citar caminho de catálogo de skill ou motor externo por nome. -->

# Modo ciclo — conserto delegado, e veredito no fim

Liga **só** quando o usuário pediu rodadas. A unidade é a rodada, e o ciclo é este:

1. **Rodada N:** a revisão inteira, do início à entrega, relatório completo no comentário do PR
   como sempre.
2. **Endereçamento:** você escolhe o que consertar e **delega**. A fan-out de conserto mora fora
   desta skill, no **motor de correção** — a sua folha diz onde ele mora; leia-o por inteiro.
   **Não achou, PARE e diga:** é lá que estão a partição disjunta por arquivo, os quatro portões
   de despacho, a trava do agente que não usa git e a guarda que impede alegação de conserto
   virar conserto. Improvisar isso de memória é o mesmo modo de falha que o motor de revisão
   combate — só que agora escrevendo no repositório.
   **O briefing de conserto diz o que tem de ser verdade e onde conferir — nunca entrega o texto
   pronto.** Prosa de substituição escrita por quem revisa é o revisor editando por procuração:
   ela carrega o erro dele para dentro do commit com a assinatura de outro, e num ciclo real
   quatro das oito regressões nasceram assim. Vai no briefing a **invariante** a satisfazer, a
   **tabela-verdade** quando há estado, e o ponto do código onde o agente confere; a frase quem
   escreve é ele, e o retorno cita a linha que a sustenta.
3. **Validação e um commit por rodada**, empurrado por você para a branch do PR. Agente não
   commita, e a validação é **do escopo daquela rodada**: só as suítes dos pacotes que o conserto
   da rodada tocou, mais o gate que cobre o que ele mexeu. Conserto que só mudou documentação roda
   o gate de documentação e mais nada — não existe razão para a suíte de um pacote que ninguém
   encostou. A suíte **completa** roda uma vez, no fim, antes do veredito (ver *Antes do veredito*).
   Por rodada e não só no fim porque é isso que preserva a atribuição: suíte que quebra na rodada 3
   é o conserto da rodada 3, e descobrir isso no fim transforma um lote de reparo dirigido numa
   caça entre três rodadas. Os comandos exatos por pacote estão no motor de correção.
4. **Rodada N+1** sobre o head novo, calibrada pelo delta como manda a seção *Rodada seguinte*,
   com lentes **novas** — que não sabem que houve conserto e não leem o relatório de quem
   consertou.

## O que entra no conserto

**Todo bloqueante pendente entra.** Não-bloqueante é julgamento seu, achado a achado, na hora:
regra genérica escrita aqui envelheceria contra o caso concreto, e quem está conduzindo o ciclo
tem o diff inteiro na mão para decidir melhor do que ela. Essa liberdade é **das rodadas**, e ela
não sobrevive ao fim delas: o que sobrar aberto passa pelo passe de fechamento da seção seguinte,
que é obrigatório e tem critério escrito.

O que não é opcional é o **registro**. Na entrega, todo achado da rodada anterior sai no placar
como **consertado**, **ainda aberto**, **retirado** (contestado com evidência) ou **dispensado**
— e o dispensado carrega o motivo em uma linha. Observação que some sem uma dessas quatro
palavras é observação que ninguém mais vai ver.

E todo achado **novo** de uma rodada N+1 carrega duas coisas no placar, a **origem** e o **ponto**.

**Origem** é **original** (já estava no PR antes do ciclo) ou **regressão** quando **qualquer uma**
das linhas citadas está no diff do commit de conserto da rodada N — achado que cita várias percorre
todas, e o primeiro acerto decide o achado inteiro. Ela é **diagnóstico, não gatilho**: mostra se o
laço está gerando defeito em vez de consumi-lo, e é barata (um `blame` por linha citada). Não conte
proporção com ela — a seção de critérios de parada explica por que essa conta não funcionava.

**Ponto** é o nome curto da afirmação ou do comportamento em disputa — *"o conjunto de leituras que
saem sem máscara"*, *"quem responde pela expiração do token"*. Quem escreve é você, no placar, e é
o que torna visível a coisa que a origem sozinha não mostra: **a mesma questão sendo consertada
várias vezes seguidas, em lugares diferentes, sem nunca fechar**. Um achado é do mesmo ponto de um
achado anterior quando você reconhece a mesma questão — e, mecanicamente, sempre que o conjunto de
`arquivo:linha` que ele cita intersecta o do anterior, ou quando uma linha citada nasceu no lote que
consertou o anterior. As duas metades trabalham juntas de propósito: a mecânica pega o que passaria
batido, o nome pega o que mudou de arquivo e continua sendo a mesma ideia.

## Achado de rodada posterior — conserta e segue, ou para?

A pergunta aparece em toda rodada N+1, e errá-la custa nos dois sentidos: parar cedo devolve ao
usuário uma decisão que era sua, e seguir quando não devia queima rodadas girando no mesmo lugar.
São dois casos, e eles se distinguem pelo que o conserto **faz com o que a rodada anterior
decidiu**.

**Caso 1 — cascata downstream.** O achado completa o conserto anterior: documentação que ainda
descreve o comportamento antigo, gate que faltou ajustar, borda que o conserto não alcançou,
enumeração incompleta. A direção da rodada anterior continua valendo e o que falta é chegar até o
fim dela. **Corrige e segue** — não gaste ida ao usuário com isto.

**Caso 2 — reversão ou inversão.** O achado pede desfazer ou inverter lógica, texto ou decisão de
uma rodada anterior. Aqui o ciclo pode estar girando em falso, e antes de consertar vem uma análise
de causa raiz com três portões:

- **(a)** você identificou a causa raiz e tem ideia de como corrigir;
- **(b)** a correção é compatível com o desenho já validado com o usuário — mesma linha do que ele
  aprovou, ainda que não a mesma implementação;
- **(c)** o ponto não está na terceira passagem (ver *Critérios de parada*).

Passou nos três: **corrige e segue**, e a causa raiz vai escrita no relatório — é ela que impede a
rodada seguinte de tentar a mesma coisa. Falhou qualquer um: **para e avisa o usuário**, dizendo
qual portão falhou e o que você precisa dele.

O que decide entre os dois casos é a direção, não o tamanho nem a severidade: um achado bloqueante
que só completa o que faltou é caso 1, e uma observação de uma linha que pede desfazer o conserto
anterior é caso 2.

## O que o conserto tem de trazer para contar como consertado

Duas classes de achado têm pré-requisito, e sem ele o lote volta como **ainda aberto**:

- **Achado sobre comportamento que atravessa mais de uma superfície ou call-site** — "o que
  responde por X", "quem chama Y", "onde Z é escrito" — exige, antes da primeira edição, a
  **enumeração completa** (todos os mounts, todos os chamadores, todas as escritas), e a lista vai
  no retorno do lote. Corrigir só a superfície que o achado nomeou é como uma mesma frase chega a
  ser consertada três vezes em direções alternadas, cada vez certa para uma superfície e errada
  para a seguinte.
- **Achado em lógica com estado** — memória de processo, cache, dedup, mapa de módulo, ordem de
  leitura e escrita — exige **o teste que reproduz o cenário do achado**, no mesmo lote. Conserto
  de estado que só passa em raciocínio é o que a rodada seguinte devolve como regressão; o teste
  é o que faria o desenho errado falhar antes de virar commit.

## Antes do veredito — a varredura final e a suíte completa

Zerado o bloqueante, e **antes** do passe de fechamento, rodam duas coisas, uma vez cada:

- **A suíte completa**, que durante as rodadas não rodou por escopo. É aqui que ela cobre o que a
  validação por rodada não alcançou.
- **Uma varredura final, de uma lente só, sobre o diff acumulado do PR inteiro** (`BASE...HEAD`),
  não sobre o delta da última rodada. Ela existe por um motivo específico: cada rodada revisou o
  delta dela, então ninguém olhou o resultado final como uma coisa só, e um PR que passou por
  três consertos pode ter ficado internamente incoerente sem que nenhuma rodada visse. Uma lente,
  de varredura, no tier barato — é o preço de fechar o ciclo sabendo o que se está entregando.

Achou bloqueante: **não é Sucesso**. Havendo orçamento de rodada, abre rodada; não havendo, o
desfecho é *rodadas esgotadas* e o veredito diz o que ela achou. Limpa, segue para o passe.

## O passe de fechamento — obrigatório, e é ele que fecha o ciclo

Zerou o bloqueante, **o ciclo ainda não acabou**: antes do veredito vem o passe de fechamento.
Sem ele o desfecho real era outro — o usuário lia as observações remanescentes, perguntava
"quais valem endereçar?", e a resposta virava edição **depois** do ciclo: sem rodada, sem lote,
sem validação e sem registro. O ciclo inteiro existe para que conserto não aconteça assim, e
estava terminando exatamente assim.

A liberdade de julgamento da seção anterior vale **durante** as rodadas, onde a pergunta é
"conserto isto agora ou na próxima?". Aqui não há próxima, a pergunta é outra, e por isso ela
tem critério escrito. Percorra **toda** observação que sobrou aberta. Entra no passe a que
responde **sim às duas**:

1. **O conserto compensa?** O que ele corrige vale mais do que ele custa — commit a mais, head
   que se move, CI que roda outra vez, e a espera por ele se houver autorização de merge.
   Observação de gosto não compensa nunca.
2. **É trivial, e o conserto é óbvio?** Só documentação, ou até ~5 linhas de código, com **um**
   desfecho evidente. Duas maneiras defensáveis de escrever o conserto já reprovam aqui: isso é
   decisão, e decisão não cabe num conserto que ninguém vai revisar.

Um caso o segundo critério decide sozinho: achado que **toca contrato** — autenticação,
permissão, conta, migração, schema, manifesto — nunca é trivial. Ele entra numa rodada, ou fica
aberto; no passe, nunca.

Reprovou em qualquer uma das duas, o achado sai **dispensado**, e o motivo é o critério que
reprovou. Isso é a resposta à pergunta do usuário, dada antes de ele ter de perguntar.

**O passe é do desfecho Sucesso.** Nos cinco de falha o que sobrou fica aberto e o veredito diz
por quê: consertar nit enquanto um bloqueante segura o PR troca a ordem das coisas. Vale inclusive
quando a falha é *ponto reincidente* e bloqueante nenhum sobrou: ali há uma questão que o ciclo já
tentou fechar duas vezes e não fechou, e mais conserto sem rodada é o contrário do que o caso pede.

### O passe não abre rodada — e quem paga por isso é o limite, medido, nunca alegado

O passe é conserto, então vale tudo que vale para conserto: quem revisa não conserta, partição
por arquivo, agente que não usa git, alegação conferida no disco. O que muda é o fim — **não
existe rodada N+1 sobre o passe**, e é essa economia que o usuário está comprando. No lugar da
rodada fica um limite, e ele é **medido, nunca alegado**:

- **Meça o diff do passe antes do commit.** Documentação passa livre; código conta linha, com
  teto de ~5 por achado — e conta as adicionadas e as removidas **separadamente**, senão
  reescrever cinco linhas viraria conserto de dez. Estourou o teto, apareceu arquivo fora de
  lote, ou o agente **criou** arquivo (arquivo novo nunca é conserto trivial): reverta **aquele
  lote** pela receita de sempre e devolva o achado ao placar como **ainda aberto**, com o motivo
  "não coube no passe".
- **Build e suíte rodam como em qualquer rodada, e aqui não há lote de reparo.** Conserto que
  quebra a suíte não era trivial — a premissa do passe caiu com ele. Reverta o passe inteiro,
  não commite, e diga no relatório qual achado o derrubou.
- **O passe roda uma vez.** Não itera, não tem segunda leva e não se reabre depois do commit.
  Ficou algo de fora, ele fica aberto e o veredito diz.

### O passe é declarado — no PR e na sessão

O relatório da última rodada foi publicado sobre o head anterior, e o commit do passe é
posterior a ele: quem abrir o PR depois vê código que relatório nenhum cobre. Então o passe
publica **um comentário curto e próprio**, que traz:

- o que foi consertado, com `arquivo:linha` e o achado que ele fecha;
- o tamanho do diff — arquivos e linhas —, que é a evidência de que o limite foi respeitado;
- o que foi dispensado, e por qual dos dois critérios;
- e a frase que ninguém deve ter de deduzir: **este delta não passou por rodada de revisão** —
  entrou por ser documentação ou ~5 linhas, com build e suíte verdes.

Na sessão, **uma linha**, imediatamente antes do veredito:

```
passe de fechamento: <n> consertados, <m> dispensados · <link>
```

Passe sem conserto nenhum também se declara — `passe de fechamento: nada compensava` é desfecho
normal quando as observações eram de gosto. A ausência dessa linha lê-se como passe não feito.

## Critérios de parada — seis, e o ciclo declara qual

| Desfecho | Gatilho |
|---|---|
| **Sucesso** | zero bloqueantes pendentes, e o passe de fechamento feito |
| **Falha · não converge** | o número de bloqueantes não caiu em duas rodadas seguidas |
| **Falha · ponto reincidente** | um **ponto** aparece pela **terceira** vez, em três rodadas — o ciclo já tentou consertá-lo duas vezes e ele voltou. Pare |
| **Falha · rodadas esgotadas** | acabou o número que o usuário deu, ainda com bloqueante pendente |
| **Falha · decisão de desenho** | o conserto implica escolher entre dois desenhos — não é do implementador |
| **Falha · regressão** | conserto quebrou build ou suíte e o lote de reparo dirigido não recuperou |

**Mais de um gatilho pode disparar na mesma rodada, e a ordem é esta:** decisão de desenho >
regressão (build ou suíte quebrados) > ponto reincidente > sucesso > não converge > rodadas
esgotadas. *Ponto reincidente* vem **antes de sucesso** de propósito: zerar o bloqueante numa
rodada em que a mesma questão voltou pela terceira vez é dar o nome certo ao desfecho errado —
ela vai voltar de novo depois do merge. Quando ele dispara sem bloqueante pendente, o passe de
fechamento **não roda** — ele é do Sucesso — e o veredito nomeia o ponto e as três passagens.

Rodada 1 limpa encerra o ciclo na rodada 1, por sucesso. Não gaste rodada por ter prometido três.

### Segunda passagem é normal; terceira é o sinal

A **segunda** aparição de um ponto não para nada, e não é sintoma: é o caso comum, em que o
conserto anterior arrumou o lugar que o achado nomeava e não alcançou os vizinhos. O que ela liga
é uma obrigação no lote — **enumerar antes de escrever**: o briefing manda varrer todas as
passagens daquela questão no repositório e devolver a lista completa no retorno, marcando cada uma
como corrigida, já correta ou fora do lote. É a lista, não a frase, que a rodada seguinte confere.

A **terceira** para. Duas tentativas falharam, e a terceira não é "tenta de novo com mais capricho"
— é sinal de que a questão é maior do que o conserto que o ciclo pode fazer sozinho, ou de que o
diagnóstico está errado. O veredito nomeia o ponto, as três passagens e o que você acha que
está por baixo.

**Por que não é mais proporção de regressão.** A regra anterior parava quando metade ou mais dos
achados novos da rodada tinham origem *regressão*. Medido num ciclo de quatro rodadas: disparou na
rodada 2 (2 de 3) numa rodada em que os dois achados eram texto e vitrine, com conserto óbvio —
**falso positivo, custou uma parada e uma ida ao usuário**; não disparou na rodada 3 (1 de 3), que
era justamente onde a coisa já estava girando; e disparou na rodada 4 (2 de 2), onde o que
realmente justificava parar era uma escolha de escopo — ou seja, *decisão de desenho*, que já tem
linha própria e vem antes na ordem. Um falso positivo, um falso negativo e um acerto por acidente.
A proporção mede a coisa errada: num ciclo saudável a rodada N+1 revisa exatamente o conserto da
rodada N, então origem *regressão* é o caso normal, não o sintoma. O mesmo ciclo, contado por
ponto, teria parado na rodada 3 — antes do conserto que gerou o defeito da rodada 4.

## O veredito, e a saída na sessão

O veredito é a **última** coisa do ciclo: ele vem depois do passe de fechamento, nunca antes.
O ciclo termina **sempre** com uma frase explícita, e ela é a única coisa nova que a sessão
recebe além do resumo por severidade da entrega e da linha do passe:

```
Recomendo merge.
Não recomendo merge — <motivo em uma frase> · <a pergunta que preciso que você responda>.
```

"Aguardando decisão" solto não é veredito. Não recomendou, diga **por quê** e **o que** precisa
do usuário.

Enquanto roda, uma linha por rodada (`rodada <N>: <b> bloqueantes, <o> observações, <r> regressões
· <link>`) — o `<r>` é o que faz o laço girando ficar visível na sessão antes de custar a rodada
seguinte.
No fim, **um** bloco: achados por severidade como manda a entrega, a linha do passe, e o
veredito. O relatório completo de cada rodada está no PR — não repita nada dele aqui.
