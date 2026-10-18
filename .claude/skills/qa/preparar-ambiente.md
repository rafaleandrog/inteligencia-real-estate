# Preparar o ambiente de QA

**Este arquivo é instrução para o agente, não prosa para a pessoa.** A skill `qa` o lê quando a
§ 3 do `SKILL.md` encontra o ambiente sem configuração e a pessoa diz que quer configurar agora.
Você conduz; ela executa nas telas. Falas sugeridas vão em bloco de citação; o resto é instrução
sua. Links e nomes de tela são explícitos — nunca "vá nas configurações".

Tom: claro e direto ao ponto. Explique cada termo em uma linha na primeira vez que aparecer e
**ofereça** aprofundamento em vez de despejá-lo. Antes de começar, diga o que vai existir no
fim, para a pessoa saber onde está indo:

> Vamos criar três coisas: um **usuário de serviço** na sua instância, chamado "QA Principal",
> que é a identidade com que o QA vai agir; um **token** desse usuário; e um **ambiente
> dedicado** no Claude Code, com esse token e com a sua instância liberada na rede. Leva uns dez
> minutos. Depois disso, toda rodada de QA se prepara sozinha a partir desse único token — os
> usuários de teste ela pede para criar na primeira vez que precisar, e reaproveita depois.

Pergunte a URL da instância (`https://…`) logo no começo — ela entra em dois lugares — e guarde.

**Quem conduz isto do outro lado é, quase sempre, o dono da instância**, e o roteiro assume isso:
`dono` detém **as onze alçadas de produto por definição**, sem receber nenhuma uma a uma, então ele
concede ao QA Principal o que quiser exercitar. Não é preciso — e não adianta — ser `sysadmin`.

Se a pessoa **não** for o dono, o limite dela é o mesmo de sempre: quem não tem uma alçada não a
concede a ninguém. Pergunte quem é ela na instância antes do passo 2, porque é ali que o limite
aparece; o resto do roteiro é igual.

## 1. O usuário de serviço "QA Principal"

Por que um usuário próprio, e por que de serviço — diga antes de pedir o clique, porque é a
decisão que muda o que a pessoa faz depois:

> O QA nunca roda com o **seu** usuário. Tudo o que um agente faz na instância entra na trilha
> de auditoria no nome de quem é o token — e uma rodada de testes assinada por você misturaria,
> para sempre, o que você fez com o que a máquina fez. Um usuário **de serviço** resolve isso
> e ainda é a identidade mais estreita possível: ele não tem e-mail nem senha, então a única
> porta dele é o token que você vai criar. Desativou o token, o QA parou.

Passos, na tela:

> Abra **`<URL>/admin/acesso/usuarios`** e clique em **Novo usuário**. Escolha **Serviço**. No
> nome, escreva exatamente **QA Principal** — a skill confere a palavra "QA" no nome antes de
> rodar, e é assim que ela sabe que não está usando a identidade de uma pessoa. Tipo de usuário:
> **Colaborador**. Salve.

## 2. As alçadas do QA Principal

Alçada é a permissão de administração da instância, uma por área (usuários, contas, apps,
marcas…). O QA precisa delas por dois motivos: **duas são estruturais** e o resto é o **teto**
do que ele consegue testar.

> Ainda no usuário que você criou, abra a aba **Alçadas**. Duas são obrigatórias, sem elas a
> skill nem começa: **Usuários** e **Contas**. É com elas que o QA cria (com a sua autorização)
> e reaproveita os usuários de teste, dá a cada um a permissão exata do cenário de cada rodada e
> emite os tokens deles — sempre com duração curta, e sempre desfeitos no fim.
>
> As outras, marque as que você quer que o QA consiga exercitar. Regra prática: **todas menos
> Sistema e Segurança.**
>
> - **Sistema** reinicia a instância e instala outra versão da plataforma. Não é coisa para uma
>   rodada de testes disparar num horário qualquer; se um dia você quiser exercitá-la, conceda
>   naquele momento e recrie o token.
> - **Segurança** mexe no que derruba o acesso de todo mundo se sair errado: URL pública, modo
>   seguro, e-mail de sistema, OAuth. O QA não precisa dela para validar uma app.
>
> Se um dia um teste precisar de uma alçada que o QA Principal não tem, o relatório diz qual e o
> que fazer; você concede aqui e recria o token.

Duas coisas que a pessoa pode estranhar nesta tela, e que valem uma linha cada se ela perguntar:

- **Plataforma não está na lista de concessão, e não é falha.** Ela é da esfera de quem mantém o
  urbiverso — só `sysadmin` e `operador` são elegíveis a ela —, e por isso não aparece nem para o
  dono. É o que põe homologar a plataforma e instalar o tarball do shell fora do alcance de
  qualquer rodada de QA nesta instância. Não procure o toggle.
- **Apps não é a mesma coisa que Sistema.** Instalar app, ligar, desligar e **homologar release de
  app** são da alçada Apps, e são ciclo de vida normal de quem tem apps próprias. Deixe-a marcada.

Se a pessoa não detém alguma alçada, o toggle aparece travado com a razão escrita — não é erro,
e não há o que fazer nesta tela: quem concede é quem tem.

## 3. O token

> Abra **`<URL>/admin/acesso/tokens`** e clique em **Gerar novo token**.
>
> - **Usuário:** QA Principal (aparece com o sufixo "(serviço)").
> - **Nome:** algo que diga de onde ele é usado — `claude-code-qa`, por exemplo.
> - **Alçadas:** marque **todas** as que o usuário tem. O escopo do token é fixado na emissão e
>   não acompanha concessões futuras: se você conceder uma alçada nova ao QA Principal depois,
>   precisa gerar outro token.
> - **Expiração:** recomendo **90 dias**. Token sem expiração é chave que nunca gira; a skill
>   avisa no cabeçalho de cada rodada quando faltar menos de uma semana, e renovar é um clique
>   nesta mesma tela, sem trocar o segredo.
> - **Somente leitura:** desmarcado — o QA cria e desfaz coisas.
>
> Gere e **copie o token agora**: ele começa com `urbi_` e aparece uma única vez. Guarde num
> lugar seguro até o passo 4; depois pode apagar, ele vai morar só no ambiente.

## 4. O ambiente dedicado no Claude Code

Por que dedicado, antes do clique:

> A recomendação é um ambiente **só para QA**, separado do que você usa no dia a dia. Ambiente
> de nuvem não tem cofre de segredos — quem usa o ambiente lê o valor das variáveis —, e não faz
> sentido o token da sua instância ficar na mesa do agente enquanto você está escrevendo código.
> Você troca para o ambiente de QA quando vai testar, e volta depois.

Passos:

> Abra **https://claude.ai/code**. No seletor de ambiente, acima da caixa de mensagem, escolha
> **Add cloud environment** e dê um nome que diga a instância — `QA <nome da instância>`.
>
> Em **Network access**, escolha **Custom**, adicione o domínio da sua instância (só o host,
> sem `https://`) em **Allowed domains** e marque **Also include default list of common package
> managers**. Sem isso, o agente não alcança a instância: o proxy do ambiente recusa a conexão
> antes de ela sair.
>
> Em **Environment variables**, adicione:
>
> ```
> URBIVERSO_QA_URL=https://<domínio da instância>
> URBIVERSO_QA_TOKEN_PCPAL=urbi_…
> ```
>
> Se quiser um nome curto para aparecer nos relatórios em vez do domínio, adicione também
> `URBIVERSO_QA_HOST=<nome>`. É opcional.
>
> Salve.

## 5. Conferir

Variável de ambiente só entra na largada da sessão, então a conferência é numa sessão nova:

> Abra uma sessão nova no ambiente **QA <nome>** — qualquer repositório serve — e mande:
> `valide o ambiente de QA`. A skill vai alcançar a instância, confirmar quem é o QA Principal,
> ler as alçadas dele e imprimir o cabeçalho de uma rodada, sem executar teste nenhum. Se
> algum passo falhar, ela diz qual destes cinco refazer.

O que a skill confere nessa sessão é a § 3 do `SKILL.md`: URL alcançável pela rede do
ambiente, token que autentica, usuário que não é sysadmin, com `usuarios` e `contas`, com "QA"
no nome, e token cujo escopo cobre as alçadas do usuário.

## 6. Depois — o que a pessoa precisa saber para operar

Diga isto no fim, em poucas linhas:

- **Pausar o QA** é desativar o token em `<URL>/admin/acesso/tokens`. Reativar é um clique.
- **Conceder alçada nova** ao QA Principal exige **gerar outro token** e trocá-lo no ambiente
  — o escopo é fixado na emissão.
- **O QA usa um pool de usuários de serviço reutilizáveis**, com nome `QA Colaborador 1`,
  `QA Externo 1` e assim por diante. A skill os cria **só com a sua autorização** (ela pede no
  chat, antes de criar), configura as alçadas de cada um por rodada e, no fim, revoga tudo e os
  **inativa** — inativo é o estado de repouso; só o QA Principal fica ativo. Usuário do pool
  ativo e com token vigente é indício de que outra sessão está usando: a skill pergunta antes
  de tomar. Se quiser
  pré-criar o pool à mão, siga a convenção do nome, natureza Serviço, tipo Colaborador ou
  Externo conforme o nome.
- **A instância de QA é a que você apontou.** A skill nunca pergunta o host: ambiente errado é
  instância errada. Se um dia houver uma instância de testes separada da de produção, a de
  produção não recebe ambiente de QA.
- **O QA nunca precisa de sysadmin**, e a skill para se o token for de um. Se um teste "só
  passa com sysadmin", o teste está errado ou falta uma alçada — o relatório diz qual.
- **O primeiro uso costuma ser o smoke do app de exemplo.** Depois de instalar a primeira app,
  peça `roda o smoke do primeiro app`: a skill segue um roteiro fixo que exercita o caminho
  inteiro — instalado, ligado, saudável, rota autenticada, permissão por app — e desfaz o que
  criou. É a forma mais barata de separar "o meu app tem um defeito" de "o caminho nunca
  funcionou".
