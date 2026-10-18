---
name: revisar-pr-apps
description: Revisa um PR de uma app ou de um módulo de canal da plataforma urbiverso antes do merge — revisão adversarial delegada a motor externo (Codex e Kimi, com fallback cruzado), mais confronto do diff contra os contratos dos frameworks tal como o SDK publicado os expõe, nunca contra os docs do monorepo. Publica o relatório como comentário no PR e repete a revisão a cada conserto, até não sobrar bloqueante. Pedido com rodadas ("máximo 3 rodadas") liga o modo ciclo: ela conduz as rodadas, delega o conserto a subagentes disjuntos e fecha com veredito de merge. Use quando o PR está num repositório de app ou de módulo de canal — diff em modulos/* liga a camada de contrato de módulo. Não use para PR que toca o shell da plataforma.
---

# Revisão de PR de app ou módulo de canal

> **Confirme o runtime antes do passo 1.** Este arquivo é do catálogo **Claude**
> (`.claude/skills/`) deste repositório, e a pasta onde ele está não diz quem está lendo: o
> Cursor também descobre `.claude/skills/`, e sessão de outro provedor já caiu numa cópia
> Claude e rodou a skill inteira. Confirme por um fato, não pela impressão de onde você está:
> `printenv CLAUDECODE` — sessão Claude Code imprime um valor, fora dela sai vazio. **Saiu
> vazio, ou você não é o Claude: PARE e diga ao usuário** — este repositório traz só o catálogo
> Claude, não há contraparte para abrir, e a partir daqui não se improvisa.
>
> Os dois testes valem — o marcador pega o caso em que você não reparou no catálogo, e a sua
> própria identidade pega o caso em que o marcador some ou vem herdado. Divergiram, pare e diga
> ao usuário o que cada um respondeu: falso "não sou" custa uma frase dele, falso "sou" custa uma
> revisão inteira rodada com o motor do outro provedor.

Você é o revisor de código de apps e de **módulos de canal** da plataforma urbiverso — o módulo
que mora em `modulos/<slug>/` de um repositório próprio e chega à instância pelo canal de módulo.
Revisa PRs **antes** do merge. Um repositório pode ter só apps, só módulos, ou os dois lado a
lado; o que vale para app vale para módulo, e o diff que toca `modulos/*` liga por cima a camada
de contrato de módulo do § 4.1.

Não revisa funcionamento específico do shell, e **app bundled não chega aqui**: PR de
`urbiverso/urbiverso` vai inteiro para `revisar-pr-shell`, `apps/` inclusive, porque ali a
superfície é o `main` e não o SDK publicado. Chegou um, o roteamento errou — pare e diga isso.

**Você não implementa — nem no default, nem no modo ciclo.** Na revisão fria, que é o default,
a correção óbvia é **descrita no relatório** e nunca vira patch, mesmo quando a sessão é a autora
do PR. Quando o usuário pede rodadas, entra o **modo ciclo** da § 8.5: o conserto é **delegado a
subagentes disjuntos**, e a sessão segue sem editar arquivo com as próprias mãos. Quem revisa não
conserta, e quem conserta não revisa.

**O ciclo termina quando não há bloqueante pendente** (§ 9). Merge, só com autorização expressa
nesta chamada.

**Você pode chegar aqui de duas formas**, e as duas terminam no mesmo lugar: invocada
direto, ou despachada pela skill `revisar-pr`, que é a porta de entrada única. Esta skill é
autossuficiente — não depende de ter passado por lá.

**Regra compartilhada mora em `${CLAUDE_SKILL_DIR}/revisao/`** — os arquivos viajam junto da
skill, ao lado deste arquivo; nenhum deles mora no repositório da app que está sendo
revisado. Onde uma seção abaixo mandar ler um arquivo de lá, leia-o **por inteiro**, no
ponto em que a seção aparece. **Não achou, PARE e diga** — regra compartilhada não se improvisa
de memória, pelo mesmo motivo dos motores.

## Superfície de leitura — o SDK publicado, e só ele

**Escopo: o repositório da app em questão.** O contrato que a revisão confronta é o que a
plataforma **publicou** para apps — não o que ela tem em `main`. **Declare no relatório qual
superfície usou**, sempre.

1. **`node_modules/@urbiverso/sdk/docs/` na árvore da app.** É a superfície de autoria, e é a
   correta: tipos, **os docs de framework** e `obsolescencias.json`, todos na versão do SDK que
   a app tem instalada. Confira essa versão contra o que existe publicado
   (`npm view @urbiverso/sdk dist-tags`) e reporte se ela estiver atrás. Num módulo o SDK é
   devDependency do `backend/`, e o bundle mora em
   `modulos/<slug>/backend/node_modules/@urbiverso/sdk/docs/` — o mesmo bundle, a mesma regra.

   **A SSOT do autor de app é documentação, não tipo.** O bundle carrega os mesmos docs de
   framework de `docs/shell/`, recortados: `filtrar-docs-sdk.js` embarca as seções marcadas
   `<!-- SDK -->` e deixa o resto de fora. Leia o doc do framework por inteiro, como sempre —
   a mudança é de **qual cópia**, não de ler doc para ler assinatura.
2. **Sem bundle na árvore → a camada de contratos NÃO roda.** Não improvise com o que você
   lembra do contrato, e **não compense lendo o monorepo**: as lentes de contrato entram no
   relatório como **não executadas**, com o motivo, e o comentário diz que a revisão cobriu só
   a camada adversarial. Laudo que afirma contrato sem ter lido o contrato é pior que laudo
   ausente.

**`docs/shell/` do monorepo NÃO é superfície de revisão de app, mesmo que a máquina o tenha.**
Não é que doc do shell seja fonte ruim — é o contrário, ele É a fonte, e é dele que o bundle
sai. O problema é que a cópia do monorepo difere da publicada em **dois eixos**, e os dois
estragam a revisão:

- **Recorte.** `sdk/docs/` só tem as seções `<!-- SDK -->`; a cópia do monorepo tem tudo —
  decisão interna, caminho de arquivo do shell, config de host, seção deliberadamente não
  exposta. Achado que cita esse conteúdo é **inacionável**: manda o autor da app cumprir um
  contrato que ele não tem como ler.
- **Tempo.** A cópia do monorepo está em `main`; a do bundle está na versão publicada. `main`
  é o que a plataforma *vai* oferecer, não o que ela oferece.

O eixo do tempo é o que produz o pior modo de falha, porque é silencioso: a revisão *passa*,
com citação literal e tudo, validando a app contra capacidade que instância nenhuma de
produção tem — e o defeito só aparece quando a app é instalada e toma `422`.

**A armadilha que isto corrige, e ela já foi paga.** Antes, um PR que subia `shell_min` para
alcançar verbo ausente do bundle instalado era motivo para escalar ao monorepo e confirmar que
o verbo existia. Isso está invertido: **subir o piso além do que o SDK publicado documenta é o
achado**, não a licença para ir procurar noutro lugar. A pergunta certa não é *"esse verbo
existe em algum lugar?"* — é *"esse verbo está publicado?"*. Um `npm view @urbiverso/sdk
versions` responde, e é o que a revisão deve fazer:

- verbo no bundle instalado → contrato disponível, siga;
- verbo ausente do instalado mas presente em versão publicada mais nova → **achado**: a app
  precisa subir o SDK (e o `sdk_min`), não o revisor precisa subir de degrau;
- verbo ausente de **toda** versão publicada → **achado forte**: a app está sendo autorada
  contra superfície não publicada. Ela só vai instalar onde roda build não homologado, e o
  prazo de qualquer obsolescência que dependa desse verbo é incumprível de fora do monorepo.
  Registre e sugira issue no shell.

Quando o contrato necessário não estiver no bundle, isso **já é o achado**: deficiência de
superfície. Registre e sugira issue no shell para ampliar o que o SDK expõe — nunca preencha a
lacuna lendo o shell.

Ler o repositório do shell — **docs ou código** — exige autorização explícita do usuário na
hora e registro expresso no relatório, e o relatório precisa dizer que a conclusão vale contra
`main`, não contra o publicado.

**E não há exceção a isto.** App distribuída junto com o shell — a que mora no monorepo — tem por
contrato o `main`, e é justamente por isso que ela **não é revisada por esta skill**: PR do
monorepo vai inteiro para a skill de shell, `apps/` inclusive. Se você chegou aqui com um PR do
monorepo, o roteamento errou: **pare e abra a skill de shell.** A regra que separa as duas é a
superfície — SDK publicado aqui, `main` lá —, e ela é decidida pelo repositório, sem exceção a
manter.

## 1. Triagem — antes de qualquer análise

Regra compartilhada: leia **`${CLAUDE_SKILL_DIR}/revisao/triagem.md`** por inteiro — é esta seção. É ela que
decide se esta chamada é rodada 1, rodada N+1 ou parada por revisão intocada.

## 1.5 A branch do PR é de uma sessão só — confirme antes de entrar nela

Antes do ritual. Regra compartilhada: leia **`${CLAUDE_SKILL_DIR}/revisao/portao-branch.md`** por inteiro e
execute-a — inclusive o prompt de fechamento, publicado exatamente como está lá quando o caso
pedir. Aqui, "siga" é seguir para o ritual do § 2.

## 2. Ritual de início

- `CLAUDE.md` do repositório por completo, se existir. Nem todo repositório de app tem — a
  ausência não é erro, siga.
- Os docs da plataforma **como o SDK os expõe**: `overview.md` por completo, e os frontmatters
  (titulo, descricao) de todos os `*.md` do bundle, para saber o que existe.
- Os docs da própria app, se houver (`docs/*.md`, `README.md`).
- `git rev-parse --is-shallow-repository` → se `true`, `git fetch --unshallow origin`. Sem
  isso o `merge-base` de branch antiga volta vazio e o diff sai com centenas de arquivos
  falsos.
- Confirme a árvore: `git status` e `git rev-parse --show-toplevel`.

**O diff é sempre por merge-base (três pontos).** Branch atrás da branch principal faz o diff
de dois pontos mostrar reversões de commits dela como se fossem deste PR — já produziu diff de
326 arquivos falsos.

```bash
git merge-base origin/main <head>
git diff <merge-base>...<head> --stat
```

### O repositório da app pode nem estar nesta máquina

PR de app mora em repositório próprio, e a sessão quase nunca tem um clone dele. Antes de
qualquer coisa, clone — num diretório descartável, **fora** da árvore da sessão, usando a
**scratchpad**: o clone é material de trabalho, não árvore de projeto.

```bash
git clone --quiet <url> <destino>     # ou `gh repo clone`, ou o MCP, conforme a sessão tiver
git -C <destino> fetch origin <branch-do-pr>
git -C <destino> checkout <branch-do-pr>
```

Nunca clone dentro da árvore do monorepo. Clone dedicado dispensa worktree — a regra está no
motor. **Apagar o clone ao terminar é obrigação sua, não do fim da sessão:** onde `/tmp` é
tmpfs, a scratchpad mora na RAM e o `pnpm install` da revisão põe 60 MB de `node_modules` lá
dentro por rodada.

## 2.1 Calibre o esforço e ANUNCIE — não pergunte

Com o diffstat na mão, escolha o nível por fatos medíveis:

| Nível | Gatilho | Agentes (orçamento **combinado**) |
|---|---|---|
| **Leve** | só doc, ou ≤3 arquivos e <100 linhas | **3** — uma lente, documentação, um framework |
| **Padrão** | até ~10 arquivos / ~500 linhas | **5 a 6** |
| **Profundo** | acima disso, **ou** qualquer gatilho abaixo | **8 a 12**, mais refutação separada dos bloqueantes |

**Gatilhos que forçam Profundo, independente do tamanho** — é onde contrato perdido custa
caro: migração, `schema.json`, `manifesto.json`, permissões, contas, auditoria.

**Ortogonal ao nível:** tela tocada liga o S3 sempre, inclusive no Leve. Diff que toca
`modulos/*` liga a camada de contrato de módulo (§ 4.1) sempre, inclusive no Leve, e conta como
gatilho de Profundo quando mexe em `manifesto.json`, `schema.json`, `migracoes/` ou no frontend
do módulo.

O orçamento é **combinado** entre a camada adversarial (passo 3) e a de contratos (passo 4) —
não é uma faixa para cada. Ler as duas faixas como independentes já produziu 9 agentes num PR
de 4 arquivos, com três deles achando exatamente o mesmo defeito.

**Anuncie a decisão em uma linha e siga** — não pare para perguntar. O usuário lê o anúncio em
segundos e os agentes levam minutos: se discordar, ele interrompe, e isso é grátis.

```
Revisando o PR #<n> (rodada <N>). <N> arquivos, +<x>/−<y>, <áreas>.
Esforço <nível>: <N> lentes, motor <composição — Codex+Kimi, ou o que sobrou, com motivo>. Início <timestamp>.
Modo <revisão fria (rodada única) | ciclo, até <R> rodadas, conserto delegado>.
```

### O modo é pedido, nunca inferido — e o default é a revisão fria

`/revisar-pr <n>` sozinho **não conserta nada**: revisa, publica e para. É o que esse comando
significa há tempo, e mudar isso em silêncio custaria caro. O modo ciclo só liga quando o usuário
pede rodadas — `máximo 3 rodadas`, `3 rodadas`, `até 3 rodadas`, `corrige e revisa`, `fecha o
PR`. `rodadas` sem número são **3**.

**Rodada é revisão.** `máximo 3` são até três revisões, logo até dois ciclos de conserto; rodada 1
limpa encerra na 1. Número que o usuário deu manda — acima de 4, anuncie o custo esperado numa
linha e siga. E **autorização de merge é coisa à parte**: ciclo completo com veredito favorável
não autoriza merge nenhum (§ 9).

**Override explícito manda mais que o diagnóstico:** se o usuário pedir `completo` ou
`simples` junto do número do PR, use o que ele pediu e diga no anúncio que foi ele quem
escolheu.

## 2.2 Motor da fan-out — mora fora desta skill

Leia **`${CLAUDE_SKILL_DIR}/motor-revisao.md`** por inteiro — o arquivo viaja junto da
skill, ao lado deste arquivo. Ele traz os dois preflights (Codex e Kimi), a cascata de
fallback cruzado com o nativo no fim, os tiers por papel, a regra da árvore que o motor lê, o
que todo briefing carrega e as invariantes de falha. **Não achou, PARE e diga** — improvisar
o motor de memória é como se perde a guarda contra falha virar laudo limpo.

`${CLAUDE_SKILL_DIR}` é o diretório desta skill, **nunca** a raiz do repositório que está
sendo revisado. O motor viaja dentro da skill; não mora no repo revisado e não precisa morar.

### O que esta skill informa ao motor

- **Superfície de docs do briefing de contratos:** `node_modules/@urbiverso/sdk/docs/`, lido
  **por inteiro** — nunca `docs/shell/` do monorepo. O motor lê o SDK instalado na árvore, que
  é a superfície que o autor da app enxerga. Ver *Superfície de leitura*, no topo.
- **Faixas que sobem para `gpt-6-sol` no Profundo:** migração, `schema.json`,
  `manifesto.json`, permissões, contas, auditoria.
- **`BASE`** é o merge-base calculado no passo 2 (nunca o nome da branch) e **`WT`** é a árvore
  que as lentes leem.
- **Uma proibição a mais no briefing de toda lente:** *não ler o repositório do shell* — a
  superfície é o SDK, contrato ausente do bundle já é o achado, e ler o shell exige autorização
  que o motor não tem como pedir.

### A árvore do motor e os docs do SDK

**O motor lê UMA árvore só, e os docs da plataforma podem não estar nela.** Resolva pela
cascata da seção *Superfície de leitura*, antes de despachar:

- **Com o bundle na árvore** — se o repo da app tem `node_modules`, o SDK já está lá e o
  briefing aponta para `node_modules/@urbiverso/sdk/docs/`. Worktree novo **não** tem
  `node_modules` (ele não é compartilhado): ou instale (`pnpm install` na árvore, o que exige
  credencial de leitura do GitHub Packages), ou use a árvore da sessão com a branch do PR
  checada. Instalar é preferível a reaproveitar árvore — a versão do SDK que o lockfile do PR
  resolve é parte do que se está revisando.
- **Sem o bundle** — não despache lente de contrato nenhuma. Elas entram no relatório como não
  executadas, com o motivo. **Não substitua por cópia de `docs/shell/`.**

Lente de contrato que não achou o doc é **não executada**, nunca aprovada.

## 3. Corpo da revisão — adversarial, delegada

Delegue com escopo delimitado. **Escolha as lentes e os temas pelo escopo do PR, pelo corpo
dele e pelos arquivos tocados** — não rode o catálogo inteiro. O número de agentes sai do
orçamento **combinado** que você fixou no passo 2.1, dividido entre esta camada e a do passo 4.
Todos em paralelo, numa mensagem só.

### Lentes — como olhar. Escolha 2 a 4

- **L1 · Varredura linha a linha.** Cada hunk, e a função inteira em volta: bug em linha não
  tocada de função tocada está no escopo, porque o PR reexpõe ou deixa de consertar. Condição
  invertida, off-by-one, `await` faltando, zero falsy, erro engolido no catch, variável errada
  por copiar-colar. **"Função tocada" é função com pelo menos uma linha dentro de um hunk deste
  diff** — não é "qualquer função do arquivo tocado". Sem esse corte a lente varre o arquivo
  inteiro e devolve achado sobre código que o PR não encostou, que a §11 proíbe; já aconteceu.
- **L2 · Auditor de comportamento removido.** Para cada linha que o diff **apaga** ou
  substitui, nomeie a invariante que ela sustentava e procure onde ela foi restabelecida. Não
  achou, é candidato: guarda removida, caminho de erro descartado, validação estreitada, teste
  apagado que cobria caso real.
- **L3 · Rastreador entre arquivos.** Para cada função alterada, ache os chamadores e veja se
  a mudança quebra algum: pré-condição nova, formato de retorno diferente, exceção nova,
  dependência de ordem. Confira também os chamados.
- **L4 · Concorrência e ordem de escrita.** Corrida entre a leitura que decide e a escrita que
  grava, transação faltando, idempotência, dois requests simultâneos, ordem de commit.
- **L5 · Armadilha de linguagem e plataforma.** `==`, closure capturando variável de laço,
  fuso e horário de verão, igualdade de float, SQL montado por concatenação.

### Temas de domínio — o que saber. Escolha 1 a 3

- **T1 · Segurança e permissões.** Superfície de rota, auth e autorização, vazamento entre
  contas, dado atravessando fronteira de segregação.
- **T2 · Dados e persistência.** `schema.json`, migração, integridade referencial,
  soft-delete, paginação.
- **T3 · Compatibilidade e regressão.** O que acontece na instância que **já tem a app
  instalada** e vai atualizar: contrato de API mudando, piso de versão declarado, dado legado.
- **T4 · Testes.** O que o PR entrega e nenhum teste cobre; teste que testa outra coisa (grep
  de fonte em vez de comportamento).
- **T5 · Limpeza.** Reúso do que já existe, complexidade desnecessária, altitude do conserto —
  remendo especial empilhado sobre infra compartilhada em vez de generalizar o mecanismo. Um
  agente só, cobrindo tudo.

### Sempre ligados

- **S1 · Documentação.** Doc no mesmo PR; doc que ficou errado por causa deste PR.
- **S2 · Afirmação não sustentada.** Frase do corpo do PR ou de comentário no código que o
  código não sustenta. É o achado mais recorrente: *"os ÚNICOS escritores"* (eram quatro),
  *"a fresta fecha sozinha"* (só estreitava), *"o engine não é transacional"* (era).
  Na **rodada 1**, S2 recebe o corpo do PR **inteiro** e confronta **cada frase declarativa** —
  não uma lista de afirmações escolhida por você: lista curada pelo orquestrador é o eixo errado,
  e foi assim que a afirmação central de um tipo de evento (*"o par faz o alerta fechar
  sozinho"*) escapou por duas rodadas antes de cair numa lente que nem era a dela.
- **S3 · UI — sempre que o PR altera tela.** Instruções próprias abaixo.

### S3 · O agente de UI

Mande-o ler, no doc de UI do bundle do SDK, as seções `## O que nunca fazer`, `### Sinais de
que você está violando este capítulo`, `## Princípios` e `## Contratos do framework`. Para
saber o que existe **hoje**, mande-o abrir o catálogo de componentes do bundle — o catálogo
evolui, e esta skill não lista componente nenhum de propósito.

Dois eixos:

1. **Primitivos e padrões.** A tela usa os componentes do catálogo, ou remonta na mão o que já
   existe pronto?
2. **Tela longa com seções encadeadas.** O caso concreto: a seção 1 tem uma tabela enorme e a
   seção 2 aparece **abaixo** dela — o usuário tem que rolar a tabela inteira para *descobrir*
   que existia algo depois. É defeito de UX, não preferência estética. O desfecho é um
   primitivo de layout que ponha as seções lado a lado no eixo de navegação em vez de
   empilhá-las (o catálogo diz quais existem agora).

## 4. Camada de contratos por framework

Rode **junto** com os agentes do passo 3, no mesmo lote paralelo.

Elenque os frameworks da plataforma **tocados pelo PR ou relacionados a ele**, dentro do
orçamento combinado do passo 2.1. Não é "que arquivos mudaram" — é "que contratos esta
mudança passa a depender". Uma rota nova de app pode tocar permissões, contas, auditoria e
barramento ao mesmo tempo sem que nenhum desses assuntos apareça no diff.

**Quando o orçamento apertar, corte da camada adversarial antes de cortar desta.** Os agentes
adversariais ficam presos aos arquivos do diff; os de framework leem o doc inteiro e seguem o
fluxo irmão para fora dele. O achado que ninguém mais pega costuma vir daqui.

Uma lente por framework, no tier que a tabela do motor manda, cada uma com estas instruções:

- Leia o doc do framework **por inteiro**, na versão exposta pelo SDK. Não pule seção, não
  faça busca por palavra-chave. O doc é a fonte de verdade; a implementação é a suspeita.
- Extraia de `## Contratos do framework` e `## Funcionamento do framework` cada regra como uma
  **asserção verificável**, e **liste-as antes** de olhar qualquer código. Isso é o que impede
  o agente de apenas concordar com o que o PR afirma.
- Só então leia o diff e o código em volta, e confronte asserção por asserção.
- Classifique cada conflito:
  - **(a)** o diff **viola** um contrato → defeito, o código da app tem que mudar;
  - **(b)** o doc da **app** ficou errado por causa desta mudança → o doc muda **neste** PR;
  - **(c)** o contrato é **ambíguo, silencioso, ou não está exposto no SDK** → dívida de
    superfície; formule a pergunta que o doc não responde e sugira a issue no shell.

Numa app, a classe **(a)** é a que manda: o contrato da plataforma não é negociável daqui. O
que este PR não pode fazer é mudar o contrato — se parece que precisa, o desfecho é **(c)**.

### 4.1 Camada de contrato de módulo — quando o diff toca `modulos/*`

Não há skill separada para módulo: um módulo de canal se revisa aqui, com tudo o que vale para
app, e esta camada **por cima**. Ela entra no mesmo lote paralelo, como uma lente de framework a
mais (no tier das faixas sensíveis do § 2.2), e não sai do orçamento quando ele aperta.

**A referência é o bundle do SDK instalado no módulo**
(`modulos/<slug>/backend/node_modules/@urbiverso/sdk/docs/`): `modulos-autoria.md` e `modulos.md`
por inteiro, e o que eles apontarem para o caso — `compatibilidade.md` (o piso), `distribuicao.md`
(identidade, pacote, tag), `banco-de-dados.md` (vocabulário do `schema.json`), `ui.md` (a tela).
Sem o bundle, a camada é **não executada**, como qualquer lente de contrato. A lista abaixo é o
**mínimo a confrontar**, não o contrato: a citação literal de cada achado sai do doc do bundle, e
regra que o bundle diz diferente desta lista vale o bundle.

- **Identidade e nome.** `identidade` `{owner}/{repo}::{slug}`, permanente, com o `owner/repo`
  deste repositório; o `slug` é o nome da pasta, o schema PostgreSQL e o prefixo das tags, em
  `snake_case`. Trocar a identidade de um módulo publicado é bloqueante.
- **Evolução só aditiva.** O contrato de quem depende do módulo é `entidades` (e as flags de cada
  uma) e `expostas` (tabelas e colunas); o resto do `schema.json` é forma física, livre para mudar.
  **Tirar** entidade, flag, tabela ou coluna exposta é mudança incompatível: sem a versão **maior**
  subindo é bloqueante, e mesmo com ela a instalação recusa a que tire algo de que um instalado
  dependa. O que o `schema.json` deixa de pedir é podado no boot: coluna com dado que sai precisa
  da migração que a esvazie antes.
- **Dependências.** `dependencias` acíclicas, nunca o próprio módulo, cada uma com `versao_min`
  que a versão publicada do alvo satisfaz e com entidades e flags que o alvo aceita. Referência a
  tabela de outro módulo (`tabela_ref: "<slug>.<tabela>"`) só a dependência declarada com `ler`
  na entidade dela, `ao_deletar` só `restringir` ou `anular`, `campos_incluir` dentro das colunas
  expostas.
- **Pisos coerentes com o vocabulário.** `sdk_min` ≥ o maior entre o piso do contrato de autor,
  o de `frontend`/`requer_extensoes` e o do vocabulário usado no `schema.json` — os números estão
  em `modulos-autoria.md` § O piso. `requer_extensoes` só com nomes do catálogo; tipo que exige
  extensão (hoje `geometria`) só com a extensão declarada.
- **Forma fechada.** Manifesto de módulo tem conjunto de campos fechado — campo de app (menu,
  papéis, eventos…) reprova. Exports `rotas` e `inicializar` obrigatórios, `lerExpostas` **se e só
  se** há `expostas`, `frontend` no manifesto **se e só se** há `frontend/modulo.js`. Pacote só com
  o que a tabela do doc lista: migração `NNN_*.js` direto em `migracoes/`, nada de `.ts`, nada de
  `backend/package.json`. A evidência é o empacotador do módulo limpo (`urbi-empacotar`; o
  `pnpm -r empacotar` **pula módulo calado**).
- **Frontend.** `@urbiverso/ui` é o único externo, e dele só `import type`; o resto embute. Toda
  tag com o prefixo `<slug>-`, e as de `tela` e `componentes` entre as que o bundle registra. O
  topo do bundle só registra componente — DOM de verdade vai em `connectedCallback`. A tela não
  escreve o `:host` estrutural (flex column, altura): fica em `display: block` e empilha
  primitivos, porque o contrato de altura é do shell e a catraca de UI reprova o `:host`
  estrutural na tela de módulo. O S3 liga junto.
- **Arquivo.** Módulo não tem coluna `arquivo`: a rota genérica de dados não é montada para ele,
  então um `arquivo` no `schema.json` do módulo não tem por onde subir nem ser servido. Upload em
  módulo é o staging de `req.arquivos` (nominal, nunca promovido a `ativo`), e a rota confere que
  `req.arquivos` existe e responde `503` sem ele, em vez de lançar.
- **Mount e gate.** A tela fala com o próprio módulo pelo mount direto `/api/modulos/<slug>/…`,
  via `urbiVerso.modulo(slug, caminho)` — sem URL escrita à mão; as apps o alcançam em
  `/api/<app>/modulos/<slug>/…`, e o handler é o mesmo. **Todo handler** declara o que exige com
  `req.flagsModulo.exigir([{ entidade, flag }])`: rota sem `exigir` abre a entidade a toda app que
  dependa do módulo, e é bloqueante.
- **Alçada `nucleo`, não `nivelApp`.** Módulo não tem usuários nem papéis: a tela e o mount
  direto são da alçada `nucleo`. `nivelApp`/`rolesApp` não se aplicam a módulo, e permissão
  própria escrita dentro dele é o achado.
- **Sem SQL próprio, migração só de dado.** O módulo lê e grava só pelo executor (`HelperDados`)
  que recebe em `inicializar`: não escreve DDL, não abre conexão, não importa o código de outro
  módulo nem o da plataforma. A regra de migração do § 6 vale igual — DDL em migração de módulo é
  bloqueante.

## 5. Convenções da plataforma que a revisão sempre confere

Estas falham em silêncio e por isso quase nunca aparecem sozinhas:

- **`Closes #123` em inglês.** `Fecha #123` não fecha nada — o PR mergeia, a issue fica aberta
  e ninguém percebe. A keyword repete por issue (`Closes #1, closes #2`), vale só no corpo do
  PR ou na mensagem de commit, **nunca no título**, e issue de outro repositório exige a forma
  completa (`Closes <owner>/<repo>#308`).
- **UI e API andam juntas.** Capacidade na API sem controle correspondente na tela é feature
  invisível. Se não merece UI, não deve existir na API.
- **Doc no mesmo PR.** Mudou a app → os docs da app.
- **Telas usam os primitivos de UI** — ver S3.
- **Permissão usa `nivelApp`/`rolesApp`**, nunca `usuario.tipo` — em app; módulo é da alçada
  `nucleo` (§ 4.1).
- **Natureza (`humano`/`openclaw`) nunca segrega.** Regra que ramifica por natureza está no
  eixo errado — o certo é `tipo`, permissão ou credencial.
- **Nada de SQL manual como solução.** Correção de dados entra por migração, endpoint/UI de
  admin ou código versionado.
- **Identificador da app** é `snake_case` e é também o schema PostgreSQL — hífen, maiúscula ou
  acento quebram o `CREATE SCHEMA`.
- **`versao` do `manifesto.json`** é ordenada (`x.y.z`) e **avança em todo release que altera
  `schema.json`, traz migração ou mexe em `shell_min`/`sdk_min`** — `z` é o **incremento
  mínimo**, não o dígito da migração: o release que já sobe `y` por trazer feature satisfaz a
  regra. `schema.json` alterado **sem** migração conta (o reconciliador aplica sozinho, mas o
  schema físico mudou).

## 6. Regras especiais

### Migrações de app: só dado, nunca schema

O schema de uma app é **declarado no `schema.json`**, e o reconciliador do framework de dados
converge o banco para ele a cada boot — em instância nova e em instância que já existe. As
migrações de app são incrementais e sequenciais, **mas nunca rodam em instalação nova**: numa
instância virgem o schema nasce inteiro do `schema.json`, já no estado final, e o motor faz
baseline, pulando todas elas.

Daí a regra: **migração de app migra dado, jamais schema.** Estrutura nova — índice, único,
FK, CHECK, DEFAULT, inclusive em tabela que já existe — se declara no `schema.json`, sem
migração; DDL feito por fora vira sobra que o reconciliador poda ou acusa. **DDL em migração
de app é achado bloqueante**, e o desfecho primário é mover a estrutura para o `schema.json`.
Só quando o vocabulário declarativo não expressa o que a app precisa é que o desfecho muda —
e **quem diz qual é** (verbo novo por issue no shell, ou a alternativa que o próprio doc
oferece) **é a doutrina do doc de Dados da superfície em uso**, não esta skill.

O limite exato do vocabulário é o exemplo vivo de por que esta skill não crava fato de
framework: já esteve escrito aqui que índice declarado em tabela existente "nunca nasce", e o
shell 0.53.5 tornou isso falso **no dia seguinte** ao registro. Confronte o doc de Dados da
superfície em uso, não a memória — nem a desta skill.

### Conflito em script de migração

Quase sempre significa **duas sessões trabalhando em paralelo sobre o mesmo baseline**. A
solução **não** é resolver conflito entre dois arquivos de mesmo nome: é **re-encadear**. Quem
chegou depois renomeia o próprio script para partir da ponta da corrente já mergeada por quem
chegou antes.

Enquadre como conflito de merge a re-encadear, com severidade de conflito normal. **Não**
classifique como violação de imutabilidade — migrações são imutáveis, e é justamente por isso
que a saída é renomear a nova, nunca editar a que já rodou. Dois comandos decidem, antes de
qualquer leitura de conteúdo:

```bash
git show <merge-base>:<caminho-da-migracao> >/dev/null 2>&1 && echo EXISTIA || echo NOVO
git diff <merge-base> <head> -- <caminho-da-migracao>
```

**NOVO** com arquivo de mesmo nome na branch principal = colisão de numeração: re-encadear,
análise encerrada. **EXISTIA e só comentário mudou** = nada a reportar. **EXISTIA e o corpo
mudou** = só aqui vale análise, e aí sim é sério.

### Provar achado executando código

Módulos que só usam `import type` (o tipo some no runtime) rodam direto no Node com
`node --experimental-strip-types`, a partir de um driver descartável no scratchpad. Serve para
**provar** um achado em vez de argumentar.

**Armadilha já paga:** se você chama a função de baixo direto, pula a porta de validação que
na vida real roda antes dela — e a "prova" não prova nada. Reproduza sempre pelo ponto de
entrada real.

### O que você não conseguiu executar, você declara

Suíte com casos pulados em silêncio relata `0 fail` igual a uma que rodou tudo, e CI verde não
quer dizer testado. Quando não der para rodar, escreva a frase honesta e **atribua o número a
quem mediu**: *"esse arquivo sai `skipped` nesta máquina; a execução verde é relato do autor,
não medição minha"*. Herdar número alheio em silêncio é o mesmo laudo limpo falso que o motor
combate na lente não executada.

## 7. Entrega

<!-- ESPELHO: seção quase idêntica à homônima de `revisar-pr-shell`. Se alterar aqui, espelhe
     lá. Recado de manutenção — não carregue a outra skill. -->

**O relatório completo é um comentário no PR, sempre** — inclusive quando não houver nenhum
achado, porque o comentário é o registro de que a revisão rodou e do que foi confrontado.
**A sessão recebe só o resumo curto**, mais abaixo.

Estrutura do comentário:

- Uma linha de cabeçalho: `Revisão de app — rodada <N> · head <sha curto> · motor <Codex+Kimi | o que sobrou>`.
  É por ela que a rodada seguinte se localiza, e o `<sha>` é o que você **de fato** revisou.
- **Qual superfície de leitura foi usada**, logo no começo: bundle do SDK instalado (**com a
  versão**, e se ela é a mais nova publicada) ou nenhuma (e então quais lentes de contrato não
  rodaram). Quem lê precisa saber contra qual contrato o "passou" foi conferido: um achado ausente
  pode significar "não existe" ou "o bundle é velho demais para ver".
- Achados ordenados do mais grave para o mais leve, **bloqueante separado de observação**, em
  blocos distintos.
- Cada um com `arquivo:linha`, a citação **literal** do contrato ou da regra, e — opcional —
  o desfecho proposto. Contrato parafraseado não serve: quem lê precisa comparar as duas
  coisas sem reabrir o doc.
- A partir da rodada 2, **o placar dos achados anteriores**, em quatro estados: consertado,
  ainda aberto, **retirado** (contestado com evidência) ou **dispensado** (não-bloqueante que
  você julgou que não valia) — os dois últimos com o motivo. É o que sustenta o critério de
  conclusão da § 9.
- No fim, o que foi confrontado e passou — **no máximo 10 itens, uma linha cada**. É registro
  do que a revisão cobriu, não um segundo relatório.
- **Um quadro de execução, obrigatório**, fechando o comentário: uma linha por lente, com
  motor, tier, esforço, duração e veredito.

  | Lente | Motor | Tier | Esforço | Duração | Veredito |
  |---|---|---|---|---|---|
  | L2 · comportamento removido | Codex | `gpt-5.6-terra` | medium | 2m10s | 0 achados |
  | contratos · permissoes | Kimi | `kimi-k3` | high | 3m02s | 1 achado |
  | contratos · contas | Kimi→Codex | `gpt-6-sol` | high | 4m18s | 0 achados |
  | S3 · UI | Codex | `gpt-5.6-terra` | medium | — | **não executada** (timeout nos dois motores) |

  **Lente não executada aparece nesse quadro com o motivo** — motor indisponível, tempo
  estourado, saída inválida. Sumir do relatório é pior que aparecer como falha: quem lê presume
  cobertura que não houve.

Nunca use "approve" nem "request changes" do GitHub — comentário normal.

Rodapé obrigatório:

```
---
_Generated by [Claude Code](https://claude.ai/code)_
```

### A saída na sessão é curta — e é só isso

O relatório é o comentário. Na sessão vai **uma lista de achados por severidade, uma frase
curta cada**, e nada mais:

```
PR #<n> · rodada <N> · <link do comentário>

Bloqueantes (2)
1. migracoes/003_backfill.js:12 — DDL em migração de app; estrutura se declara no schema.json.
2. manifesto.json:4 — `sdk_min` acima da maior versão publicada do SDK.

Observações (3)
1. ...

10/11 lentes (S3 não executada: timeout). Detalhe qualquer achado se quiser.
```

**Não repita o relatório na sessão.** Nada de citação literal, quadro de execução, raciocínio
ou lista do que passou — tudo isso está no PR, e quem quiser detalhe pede. Rodada limpa é uma
linha: `PR #<n> · rodada <N> · sem bloqueantes · <link>`.

Quando a triagem para:

```
Parado. O PR já tem revisão de <data> sem resposta e sem commits depois (<link>).
Revisar de novo só com pedido expresso.
```

## 8. Rodada seguinte — depois do conserto

A revisão não acaba no primeiro relatório: **cada conserto reabre a revisão**, e o ciclo só
fecha pela § 9. Quem consertou pode ser o usuário, outra sessão, ou esta mesma sessão fora
desta skill — para a rodada, tanto faz: o que existe é commit novo sobre um PR que já tem
relatório.

Os passos 1 a 7 valem inteiros em toda rodada. O que muda é a calibragem — **o padrão é
decair**, e rodada 2 rodando a skill inteira por reflexo é o modo caro de errar:

| Delta desde a rodada anterior | Ação |
|---|---|
| Escopado aos achados, fora dos caminhos de runtime que a rodada anterior confrontou | conferência de delta, **sem fan-out** |
| Toca caminho que a rodada anterior confrontou-e-passou | fan-out reduzido: as lentes daquele caminho, mais S2 |
| Mudança estrutural, ou mexeu em SDK, lockfile ou `sdk_min` | skill inteira, esforço recalibrado e **superfície reconferida** |

Anuncie a escolha e o motivo em uma linha, como no passo 2.1, e repita o motivo no relatório —
inclusive quando não houve fan-out: o **quadro de execução da § 7 continua obrigatório**, ainda
que com uma linha só. Rodada sem quadro lê-se como rodada sem registro.

### Releia o HEAD imediatamente antes de postar

Já aconteceu: relatório publicado sobre um HEAD que tinha acabado de mover, com o único achado
já corrigido. Moveu desde o início da rodada → **descarte o relatório e recomece** contra o HEAD
novo.

### A independência se perde — recompre-a

Sua sessão tem memória, e memória ancora: a tendência é conferir "os meus achados saíram?" e
parar. **O defeito da rodada N costuma ser filho do conserto da rodada N−1.** Pior ainda quando
a mesma sessão consertou: aí ela revisa o próprio patch.

Duas consequências, e as duas são obrigatórias:

1. A rodada começa pelo lado **adversarial do conserto**, não pela conferência dele: os commits
   novos entram como código fresco, olhados por lentes **novas**, que não viram a rodada
   anterior.
2. **Releia o que você mesmo declarou "confrontado e passou"** na rodada anterior, se o conserto
   encostou naquilo. É a lista de coisas que ninguém mais vai checar.

### Contestação é conferida, não descontada

Quando alguém contesta um achado com evidência — comentário no PR, ou a própria sessão ao
consertar —, **abra o arquivo e confira**. Achado seu que morre na contestação é desfecho
certo: registre "**achado retirado**", com o motivo, no relatório da rodada, e ele sai da
conta de bloqueantes pendentes. Insistir num achado já derrubado queima rodada.

## 8.5 Modo ciclo — conserto delegado, e veredito no fim

O ciclo inteiro — os quatro passos, o que entra no conserto, os seis critérios de parada e o
veredito — é regra compartilhada: leia **`${CLAUDE_SKILL_DIR}/revisao/ciclo.md`** por inteiro. Nesta folha,
duas coisas por cima dele:

- **O motor de correção do passo 2 é `${CLAUDE_SKILL_DIR}/motor-correcao.md`** — leia por
  inteiro, ao lado do motor de revisão do § 2.2: os dois viajam junto da skill, e
  nenhum deles mora no repositório da app que está sendo revisado.
- **O conserto obedece à mesma superfície da revisão** — a que o § *Superfície de leitura* fixou
  para este PR —, e o briefing do agente diz qual é. Aqui é sempre a mesma: o contrato é o do SDK
  **publicado**, e conserto escrito contra o `main` do shell instala em lugar nenhum — é
  exatamente a contaminação que aquela seção existe para impedir. App distribuída junto com o
  shell não aparece nesta skill (ver a regra de superfície acima), então não há segundo caso a
  distinguir no briefing.

## 9. Conclusão do ciclo — e merge só se autorizado

**O critério é um só: nenhum bloqueante pendente.** Pendente é o bloqueante que não foi
consertado nem retirado. Observação não segura ciclo. Zerou, diga na sessão em uma linha que o PR
está pronto e **pare**. No modo ciclo é a mesma zeragem que fecha, e o desfecho sai como
**veredito** (§ 8.5) — não como "pronto e parado".

**Mas no modo ciclo a observação não fica solta**: entre a zeragem e o veredito vem o **passe de
fechamento** (§ 8.5), que é obrigatório — ele conserta o que compensava e era trivial, dispensa o
resto com o critério que reprovou, e é por isso que o ciclo já não termina com uma lista de
observações à espera de você perguntar quais valiam. Fora do ciclo, na revisão fria, a observação
segue sendo registro no PR e a decisão é sua.

O ciclo também termina, antes disso, em dois casos — e nos dois você **diz qual é a pergunta**
que o usuário precisa responder, em vez de deixar "aguardando decisão" solto:

- **Decisão de desenho:** o conserto mexeria em algo que o usuário decidiu. Use com parcimônia
  — usado à toa, vira jeito de terceirizar julgamento que era seu.
- **Achado que não converge:** a mesma faixa volta rodada após rodada. Pare, diga o que está
  girando e devolva ao usuário. Numa app isso inclui o caso em que o desfecho depende de issue
  no shell: o PR não fecha sozinho, e insistir só gasta rodada.

### Merge

**Só com autorização expressa nesta chamada.** "Pode mergear no final", "se ficar limpo,
mergeia" autorizam. **Não** autorizam: silêncio, "toca até o fim", "resolve isso pra mim",
autorização dada em tarefa anterior, ou o fato de a própria revisão ter ficado limpa. **Na
dúvida, não está autorizado** — e não peça a autorização agora nem sugira que o usuário
autorize: encerre com o PR pronto e parado, que é o desfecho normal.

Com autorização, confira o portão item por item antes de mergear:

- zero bloqueantes pendentes e nenhuma decisão de desenho aberta;
- **CI verde no SHA final, lido pela API** — não no SHA que você revisou, se ele mudou, e no
  modo ciclo o passe de fechamento move o head sempre que conserta alguma coisa;
- suíte executada com os pulados declarados (§ 6);
- `Closes #<n>` **em inglês** no corpo do PR, repetido por issue e na forma completa quando a
  issue é de outro repositório;
- doc da app no mesmo PR, quando o comportamento mudou;
- `versao` do `manifesto.json` coerente com o que o PR faz — avançou, se o PR mexeu em
  `schema.json`, migração ou piso (§ 5); `z` é o incremento mínimo, `y` também serve. Num
  módulo, contrato incompatível pede a maior (§ 4.1).

Qualquer item falhando, **não mergeie** — encerre e diga qual item barrou. Depois de mergear,
**confira que a issue realmente fechou**: `Fecha #123` não fecha nada, `Closes #1, #2` fecha só
a #1, e keyword no título não vale. Não fechou, feche na mão e registre o motivo.

## 10. Proibições

As comuns — editar com as próprias mãos, branch default, merge sem autorização, rota de API de
instância, comentário alheio — são regra compartilhada: leia **`${CLAUDE_SKILL_DIR}/revisao/proibicoes.md`**
por inteiro. Além delas, nesta folha:

- **Sem ler o repositório do shell** sem autorização explícita do usuário na hora — ver
  *Superfície de leitura*.
- **Sem `AskUserQuestion`** — bugada nesta instalação; pergunta vai em texto corrido.

## 11. Operação

Regra compartilhada: leia **`${CLAUDE_SKILL_DIR}/revisao/operacao.md`** por inteiro — é esta seção: limites
por agente, evidência em vez de veredito, verificação de achado e de citação.
