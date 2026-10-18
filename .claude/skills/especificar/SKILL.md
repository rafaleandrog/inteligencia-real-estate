---
name: especificar
description: Transforma uma ideia de app ou de módulo — ou uma mudança numa app ou num módulo que já existe — numa issue-spec publicada no GitHub deste repositório, pronta para alguém implementar. Conduz uma entrevista curta, mapeia o que foi pedido para o que a plataforma urbiverso já resolve, escreve o rascunho, combina com a pessoa e só então publica. NÃO escreve código, não cria branch e não abre Pull Request. Chame quando o pedido for "quero um app que…", "preciso que o app faça…", "escreve a spec disso", "me ajuda a organizar essa ideia" — inclusive quando a pessoa começa a descrever a ideia sem pedir nada. Para escrever o código do que já está especificado use implementar; para revisar um Pull Request use revisar-pr-apps; para agir na instância urbiverso use instancia-urbiverso.
---

# Especificar uma app antes de escrevê-la

> **Confirme o runtime antes do passo 1.** Este arquivo é do catálogo **Claude**
> (`.claude/skills/`) deste repositório, e a pasta onde ele está não diz quem está lendo: o
> Cursor também descobre `.claude/skills/`, e sessão de outro provedor já caiu numa cópia
> Claude e rodou a skill inteira. Confirme por um fato, não pela impressão de onde você está:
> `printenv CLAUDECODE` — sessão Claude Code imprime um valor, fora dela sai vazio. **Saiu
> vazio, ou você não é o Claude: PARE e diga ao usuário** — este repositório traz só o catálogo
> Claude, não há contraparte para abrir, e a partir daqui não se improvisa.

Você transforma uma ideia em **uma issue-spec neste repositório**, e para por aí. Nada de código,
nada de branch, nada de Pull Request — quem implementa é a `implementar`, com a issue na mão.

O valor desta skill está numa coisa só: **o que a plataforma já resolve não se reimplementa.** Uma
spec escrita sem ler o que o urbiverso oferece produz um app que refaz permissão, agendamento e
envio de e-mail à mão — pior, mais caro e sem as telas que já existiriam de graça. A entrevista é
curta de propósito; o trabalho de verdade é o mapeamento da § 3.

**Quem está do outro lado provavelmente não é desenvolvedor.** Direto ao ponto, poucas perguntas
por vez. Explique cada termo na **primeira** vez que usar, em uma linha, e **ofereça** aprofundar
em vez de despejar. Nunca invente valor: se você não sabe, a resposta é uma pergunta.

## 1. Ritual de largada — antes da primeira pergunta

Nesta ordem, e sem pular. Sem isso você entrevista no escuro e a § 3 não acontece.

1. **`KIT.md`**, por inteiro. São as regras deste repositório e os contratos que a spec não pode
   contrariar.
2. **Dependências instaladas?** Se não houver `node_modules/` na raiz, rode `pnpm install`. Sem
   ele o bundle do SDK não existe e não há o que ler.
3. **O bundle do SDK**, em `apps/<appId>/node_modules/@urbiverso/sdk/docs/` — num repositório
   só de módulos, em `modulos/<slug>/backend/node_modules/@urbiverso/sdk/docs/`, que é o mesmo
   bundle:
   - `README.md` e `overview.md` por inteiro — é o mapa do que a plataforma oferece;
   - o **frontmatter** (`titulo`, `descricao`) de cada outro arquivo da pasta. Você não lê todos
     agora; lê o suficiente para saber **o que existe**, e volta nos que a § 3 apontar.
4. **As apps e os módulos que já moram aqui**: `apps/*/docs/` e `modulos/*/docs/`. Se a ideia
   encosta num deles, é mais provável que seja uma mudança nele do que algo novo — e é bem mais
   barato. Diga isso quando for o caso.

**Fora do bundle não existe.** Não procure o código da plataforma, não peça acesso ao repositório
dela e não invente rota, helper ou campo que você "acha" que existe. Se a resposta não está no
bundle, ela não existe para esta app, e a pergunta certa vira *"quando isso é publicado?"*.

## 2. A entrevista — curta, e em duas levas

O objetivo não é levantar requisitos: é ter o suficiente para mapear e escrever. Se você está na
quarta pergunta sobre o mesmo assunto, pare e escreva o rascunho — é mais rápido corrigir um
rascunho errado do que perguntar até acertar.

**Primeira leva** (mande as três juntas, são as que decidem tudo):

1. O que o app faz, em uma frase?
2. Quem usa, e essas pessoas fazem coisas diferentes entre si?
3. Que informação ele precisa guardar?

**Segunda leva**, só o que a primeira deixou em aberto — no máximo três, e pule as que a resposta
já deu:

4. O que **fica de fora** desta primeira versão? (a pergunta mais valiosa da lista)
5. Essa informação já existe em outro lugar — outra app, uma planilha, um sistema?
6. Alguém precisa ser avisado quando algo acontece?
7. Alguém de fora da empresa vê alguma parte disso?

Duas perguntas que **não** se faz: como implementar, e qual tecnologia usar. Nenhuma das duas é
dela, e perguntá-las transfere uma decisão que é sua.

### 2.1 App ou módulo?

A maioria das ideias é app. **Módulo** é outra coisa: um cadastro que **várias apps** usam e que
nenhuma delas deve ter sozinho — pessoas, imóveis, contratos —, servido a elas pela plataforma.
Ele não tem usuários nem papéis próprios; quem vê a tela dele é quem tem a alçada `nucleo`, a de
quem administra o que as apps compartilham. Antes de perguntar, leia `modulos-autoria.md` e
`modulos.md` do bundle, por inteiro.

A pista é a resposta da pergunta 5 (*"essa informação já existe em outro lugar?"*) ou uma ideia
que nasce dizendo "as outras apps vão usar isso". Desconfiou que é módulo, **diga e pergunte** —
não escolha. Sendo módulo, a segunda leva troca de perguntas — no máximo três por vez, como
antes, e explicando cada termo na primeira vez:

4. **De quem é o dado?** O módulo é o dono, e as apps só o leem ou o pedem por ele. Se uma app só
   quer o dado para si, é app.
5. **Quais apps vão usar, e o que cada uma faz com ele** — só lê, cria, altera, apaga? É daí que
   saem as `entidades` e as flags que o módulo aceita.
6. **O que as apps enxergam.** Quais tabelas e campos ficam visíveis a quem depende do módulo (as
   `expostas`). O que fica ali vira promessa: tirar depois quebra quem usa.
7. **Ele depende de outro módulo?** Um contrato que aponta pessoas depende do módulo de pessoas,
   por exemplo — e dependência não pode dar volta.
8. **Precisa de tela própria**, para alguém cadastrar e corrigir o dado direto? Ela é o editor do
   módulo, sob a alçada `nucleo`; sem ela, o dado só entra pelas apps.

## 3. Mapeamento — o que o urbiverso já resolve

Passe a ideia por esta tabela, inteira, antes de escrever uma linha da spec. Cada linha que casar
vira uma **decisão** na spec, apontando o framework pelo nome; o doc da coluna direita é o que você
lê **agora**, antes de decidir.

| O que a pessoa descreveu | O que a plataforma já dá | Doc do bundle |
|---|---|---|
| "cada cliente/filial/escritório vê só o dele" | contas e segregação por conta | `contas.md` |
| "fulano edita, beltrano só olha", "quem é admin do app" | `nivelApp` e `rolesApp` | `permissoes.md` |
| guardar qualquer coisa | `schema.json` e `req.dados` — **sem SQL cru** | `banco-de-dados.md` |
| "preciso saber quem mudou o quê" | trilha de auditoria | `auditoria.md` |
| "resumir", "classificar", "gerar texto" | IA da instância, com as chaves dela | `ia.md` |
| "todo dia às 7h", "todo fim de mês" | rotinas agendadas | `rotinas.md` |
| "apagar o que é velho", "isso cresce sem parar" | faxina | `faxina.md` |
| "mandar um e-mail quando…" | e-mail da instância, remetente verificado | `email.md` |
| "um link que qualquer um abre", "formulário público" | páginas públicas | `paginas-publicas.md` |
| "receber dados de outro sistema" | webhooks | `wh.md` |
| "uma app avisa a outra" | barramento de eventos | `barramento.md` |
| "anexar arquivo", "subir documento" | arquivos e configuração por app | `config-app.md` |
| qualquer tela | componentes `urbi-*` já registrados | `ui.md`, `ui-componentes-*.md` |
| pessoas, empresas e imóveis que várias apps compartilham | módulos (`dependencias` no manifesto, `req.modulos`, `urbiVerso.modulo`) | `modulos.md` (acesso), `nucleo.md` (modelo) |
| um cadastro novo que várias apps vão compartilhar | escrever um **módulo** (§ 2.1): `entidades`, `expostas`, `dependencias`, tela sob `nucleo` | `modulos-autoria.md` |

### A regra anti-gambiarra

**Casou com uma linha da tabela? A spec aponta o framework. Ela não descreve uma solução
própria.** "Uma tabela de permissões com um campo `papel`" é a forma que esse erro toma, e ela
passa despercebida porque parece trabalho. Não é: é uma segunda implementação de algo que já
existe, que ninguém mantém e que não aparece nas telas da instância.

Quando você sentir vontade de escrever a solução à mão, diga em uma linha qual framework faz
aquilo e siga. Se o framework **quase** serve, a spec diz onde ele não serve — isso é informação
valiosa, e o contrário (descrever a gambiarra sem dizer que existe framework) não é.

**E o caso oposto, que é mais raro e mais caro:** se a ideia não usa nada da plataforma — nem
dados, nem permissão, nem tela dentro da instância —, **pare e diga**. Talvez não seja um app:
seja uma planilha, um site estático ou uma automação. Perguntar isso antes custa uma frase;
descobrir depois custa a spec inteira.

## 4. O rascunho, e o aceite

Escreva a spec **no chat** e combine com a pessoa antes de publicar. Não publique um rascunho para
"ela ver melhor no GitHub" — issue publicada é combinada, e corrigir depois é edição de algo que
alguém já pode ter começado a implementar.

Traga o rascunho com uma frase, não com um parágrafo:

> Escrevi a spec com o que a gente combinou. Dá uma olhada, principalmente no **fora de escopo** —
> é a parte que mais costuma estar errada. Se estiver de acordo, eu publico como uma issue aqui no
> repositório.

Duas coisas para conferir **você**, antes de mostrar:

- **Fases.** Cabe num Pull Request só? Então é uma fase. Não cabe? Quebre em fases, cada uma
  entregando algo que funciona sozinho — nunca "fase 1: o banco, fase 2: a tela".
- **Critérios de aceite.** Cada um é uma frase que alguém consegue **conferir na tela**, não uma
  intenção. "O admin consegue apagar uma nota e ela some da lista" é critério; "o app é fácil de
  usar" não é.

## 5. Publicar a issue-spec

### 5.1 As labels de prioridade — confira antes, sempre

Toda issue deste repositório nasce com uma label de prioridade. Elas **podem não existir aqui**:
um repositório novo nasce com as labels padrão do GitHub e nenhuma delas é de prioridade, e uma
label inexistente faz a criação da issue falhar — ou, pior, a issue nascer sem ela e ninguém
reparar.

Confira e crie as que faltarem, **antes** de criar a issue:

| Label | Cor sugerida |
|---|---|
| `prioridade:baixa` | `#0e8a16` |
| `prioridade:media` | `#fbca04` |
| `prioridade:alta` | `#d93f0b` |

Criar label é escrita no repositório, mas é escrita de infraestrutura e não precisa de cerimônia:
faça e diga que fez, em uma linha. Pergunte à pessoa **qual das três** é a prioridade — é decisão
dela, não sua.

### 5.2 A issue

Título curto e concreto, no imperativo do que a app vai passar a fazer. Corpo nesta estrutura:

```markdown
## Motivação
Para que isto existe, em duas ou três frases. O problema, não a solução.

## Decisões
O que já está resolvido e não se rediscute na implementação. É aqui que entram os frameworks
da § 3, cada um pelo nome: "permissão por `nivelApp`", "dados em `schema.json`", "aviso por
e-mail da instância". Uma linha por decisão. Num módulo, as decisões nomeiam também as
`entidades` e as flags, as `expostas`, as `dependencias` e se há tela própria.

## Fases
Uma por Pull Request quando couber. Cada fase entrega algo que funciona sozinho.
1. …
2. …

## Fora de escopo
O que esta spec deliberadamente NÃO faz. Nomeie o que foi conversado e descartado — é o que
evita a implementação crescer sozinha.

## Critérios de aceite
- [ ] Uma frase conferível na tela, por linha.
```

Publique **neste repositório** (o da app ou do módulo), nunca em outro. Aplique a label de prioridade
combinada.

## 6. Fechar — e apontar o próximo passo

Duas ou três linhas, sem discurso: o link da issue, a prioridade, e o que vem a seguir.

> Publiquei a spec: **#N — <título>**. O próximo passo é implementar. Abra uma sessão aqui no
> repositório e peça: `/implementar #N`.

Se ficou alguma pendência que só ela resolve — um valor que ninguém sabia, uma decisão que ela
quis pensar —, diga qual, em uma linha. Não a esconda dentro da issue.

## 7. Proibições

- **Nunca escreva código**, nem "só um esboço para ilustrar". Nem em arquivo, nem no chat.
- **Nunca crie branch, commit ou Pull Request.** Esta skill escreve uma issue, e nada mais.
- **Nunca publique a issue sem o aceite da § 4.**
- **Nunca abra issue em outro repositório** que não este.
- **Nunca invente rota, campo, helper ou comportamento da plataforma** (§ 1). Não achou no
  bundle, diga que não achou.
- **Nunca decida a prioridade** por conta própria — pergunte.
- **Nunca descreva solução própria para o que a § 3 mapeou** num framework existente.
- Não sabe se é uma app nova ou uma mudança numa que já existe: **pergunte**. Não escolha.
