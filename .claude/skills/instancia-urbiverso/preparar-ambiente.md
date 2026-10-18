# Preparar o acesso do Claude à instância

**Este arquivo é instrução para o agente, não prosa para a pessoa.** A skill `instancia-urbiverso` o lê
quando a § 2 do `SKILL.md` encontra o ambiente sem configuração e a pessoa diz que quer
configurar agora. Você conduz; ela executa nas telas. Falas sugeridas vão em bloco de citação; o
resto é instrução sua. Links e nomes de tela são explícitos — nunca "vá nas configurações".

Tom: claro e direto ao ponto. Explique cada termo em uma linha na primeira vez que aparecer e
**ofereça** aprofundamento em vez de despejá-lo. Antes de começar, diga o que vai existir no fim:

> Vamos criar duas coisas: um **token** do **seu** usuário na instância, que é a credencial com
> que eu vou agir; e uma entrada na variável `URBIVERSO_INSTANCIAS`, no ambiente desta sessão.
> Leva uns cinco minutos, e é uma vez por pessoa e por instância. Depois disso eu consigo ler e,
> com a sua autorização a cada passo, mexer na instância daqui.

Pergunte duas coisas logo no começo e guarde:

- **a URL da instância** (`https://…`) — ela entra em dois lugares;
- **como ela quer chamar essa instância** na conversa — "produção", "teste", o nome da empresa.
  É o `nome` da entrada, e é por ele que ela vai me dizer onde agir quando houver mais de uma.

Se o ambiente **já tem** `URBIVERSO_INSTANCIAS` com outras instâncias, o roteiro é o mesmo: no
fim, a entrada nova se **acrescenta** ao array, e as que já existem ficam como estão.

**Se a pessoa já tem um token que quer usar**, pule os passos 1 e 2: pergunte o id do usuário
dono dele (o dela, como no fim do passo 1) e vá ao passo 3. Vale também para token de outro
usuário — um de serviço que a equipe já usa, por exemplo: é escolha dela, e o que eu fizer fica na
trilha no nome **desse** usuário. Diga isso uma vez e siga. O id de outro usuário é o número em
`<URL>/admin/acesso/usuarios/<número>/…`, na tela de quem tem a alçada Usuários.

## 1. Com que identidade eu ajo: a sua

Diga antes de pedir o primeiro clique, porque é a decisão que muda tudo o que vem depois:

> Eu ajo **como você**. O token é do seu usuário, então tudo o que eu fizer na instância entra na
> trilha de auditoria **no seu nome**, para sempre — a trilha é permanente e não separa depois o
> que foi clique seu do que foi pedido seu a mim. Isso é de propósito: usar o Claude para operar
> a instância é uma decisão sua, e a responsabilidade pelo que ele faz também. Por isso eu peço a
> sua autorização antes de cada mudança, digo o que vai acontecer e como desfazer — e nunca
> alcanço nada que você mesmo não alcançaria.
>
> Se outra pessoa da equipe usar o Claude aqui, ela gera o token **dela**, do usuário dela. Token
> não se compartilha: com o seu token, o que ela pedisse ficaria registrado como seu.

O token próprio é de usuário **interno** (dono, colaborador, operador). Usuário **externo** não
gera token para si: se for o caso dela, diga que quem gera é alguém com a alçada Usuários, em
`<URL>/admin/acesso/tokens`, e que o resto do roteiro segue igual.

O **id** do usuário dela vai para o ambiente junto com o token, e é por ele que eu confiro que o
token é dela e não de outro:

> Com a instância aberta e você logado, abra **`<URL>/api/shell/auth/identidade`** numa aba. Vai
> aparecer um texto em JSON; logo no começo, dentro de `"usuario"`, está `"id": <número>`. Anote
> esse número.

## 2. O token

Alçada é a permissão de administração da instância, uma por área. O token carrega **as alçadas
que você escolher entre as que você tem** — é o teto do que eu **consigo** fazer; o que eu **vou**
fazer você autoriza uma a uma, na conversa, antes de cada mudança.

> Abra **`<URL>/preferencias`**, seção **Tokens**, e clique em **Gerar novo token**.
>
> - **Nome:** algo que diga de onde é usado — `claude-code`, por exemplo.
> - **Alçadas:** regra prática, **as mesmas que você tem**, com duas exceções para pensar (abaixo).
>   O default é nenhuma. O escopo é fixado na emissão e não acompanha concessão futura: se você
>   ganhar uma alçada nova depois, precisa gerar outro token para eu alcançá-la.
> - **Expira em:** uma data daqui a **90 dias**. Token sem expiração é chave que nunca gira; eu
>   aviso no cabeçalho quando faltar menos de uma semana, e renovar é o lápis de "Expira em" nesta
>   mesma tela, sem trocar o segredo.
> - **Somente leitura:** desmarcado, se você quer que eu consiga mudar coisas. Marcado é uma
>   opção honesta para começar — eu leio tudo e não escrevo nada — e trocar depois é gerar outro
>   token, porque esse modo não se altera.
>
> Gere e **copie o token agora**: ele começa com `urbi_` e aparece uma única vez. Guarde até o
> passo 3; depois pode apagar, ele vai morar só no ambiente.

As onze alçadas, uma linha cada — diga só as que a pessoa perguntar, ou todas de uma vez se ela pedir:

- **Usuários** — criar pessoas e agentes, tipo, alçadas e tokens, dentro do que você mesmo tem.
- **Contas** — contas de clientes da instância, membros e as políticas delas.
- **Apps** — instalar, atualizar, ligar, desligar e desinstalar app. É a que o seu app precisa.
- **Integrações** — Wiki, IA e quais apps podem usá-los; domínios de e-mail e templates.
- **Marcas** — nome, cores, logos e o visual da instância.
- **Núcleo** — quais apps alcançam pessoas, empresas e tarefas compartilhadas.
- **Operação** — zeladoria do que já está instalado: faxina, arquivos, fuso, limites de taxa.
- **Suporte** — o Sentinela: casos, ordens de serviço e saúde das apps.
- **Auditoria** — ler a trilha. É a única que só lê.
- **Sistema** — operar a plataforma nesta instância: saúde, changelog, autodeploy, e as duas
  escritas que param tudo: **reiniciar** e **instalar outra versão da plataforma**.
- **Segurança** — as credenciais da instância: URL pública, modo seguro, login e e-mail de
  sistema, senha de terceiro.

Duas merecem um segundo de pensamento antes de marcar no token, e diga isso:

> **Sistema** inclui reiniciar a instância e instalar outra versão da plataforma — as duas
> derrubam a sessão de quem estiver usando. Eu só faço as duas pedindo na hora e dizendo a
> consequência, e a versão nova costuma chegar sozinha; se você não quer nem a possibilidade,
> deixe fora do token. **Segurança** mexe nas credenciais da instância (endereço público, login,
> e-mail de sistema): se você não pretende me pedir isso, deixe de fora e gere outro token quando
> precisar.
>
> Uma coisa não está nesta tela: **homologar uma versão da plataforma** é da alçada Plataforma,
> que é de quem mantém o urbiverso e não existe na sua instância. Homologar **release de um app
> seu** é outra coisa, e essa é da alçada Apps — trabalho normal, que eu faço com a sua
> autorização.

Alçada que a pessoa não tem não aparece para marcar: quem concede é quem tem a alçada Usuários.
O token acompanha o usuário **vivo** — se ela perder uma alçada, o token a perde no mesmo
instante; se o usuário for desativado, o token para de valer.

## 3. A entrada no ambiente

É o **mesmo ambiente** que você já usa neste repositório — o que tem o token do GitHub para
baixar o SDK. Aqui não é como o QA, que pede ambiente separado: quem desenvolve precisa das duas
credenciais na mesma sessão, uma para construir o app e outra para instalá-lo. Todas as
instâncias moram numa variável só, `URBIVERSO_INSTANCIAS`, um array com uma entrada por instância.

> No **https://claude.ai/code**, abra o seletor de ambiente acima da caixa de mensagem, passe o
> mouse sobre o ambiente que você usa neste repositório e clique no ícone de configurações.
>
> Em **Network access**, escolha **Custom**, adicione o domínio da instância (só o host, sem
> `https://`) em **Allowed domains** e marque **Also include default list of common package
> managers**. Sem isso eu não alcanço a instância: o proxy do ambiente recusa a conexão antes de
> ela sair, e o erro não se parece nem um pouco com a causa. **Um domínio por instância** — cada
> entrada da variável precisa do seu aqui.
>
> Em **Environment variables**, adicione — numa linha só, é JSON:
>
> ```
> URBIVERSO_INSTANCIAS=[{"nome":"<como você chama>","url":"https://<domínio>","token":"urbi_…","usuario_id":<id>}]
> ```
>
> Se a variável **já existe**, não crie outra: acrescente a entrada nova dentro dos colchetes,
> separada da anterior por vírgula. O `nome` não pode repetir, e o `usuario_id` vai sem aspas.
>
> Salve.

**Vindo do formato antigo** (`URBIVERSO_URL` e `URBIVERSO_TOKEN`): a entrada nova usa a mesma
URL e o mesmo token, mais o `nome` e o `usuario_id`; depois de salvar, as duas variáveis antigas
podem ser apagadas. Enquanto `URBIVERSO_INSTANCIAS` existir, elas não são lidas.

**Teste e produção: separe o que escreve em produção.** Se a pessoa tem mais de uma instância,
recomende isto antes de ela salvar — é o que impede que um nome trocado na conversa vire escrita
na instância errada:

> O ambiente onde você desenvolve e testa não deveria conseguir **escrever** em produção. Duas
> formas, escolha a que servir:
>
> - **Ambientes separados.** Um ambiente com as instâncias de teste, outro só com a de produção.
>   Para mexer em produção, você abre uma sessão no ambiente de produção — e sabe que abriu.
> - **Produção só leitura no ambiente de trabalho.** A entrada de produção deste ambiente usa um
>   token gerado com **Somente leitura** marcado (passo 2): eu consigo ver o que está no ar para
>   comparar com o teste, mas não mudo nada lá. O token que escreve em produção fica num ambiente
>   separado, usado só para isso.

**O token fica legível para quem usa o ambiente.** Diga isso: ambiente de nuvem não tem cofre de
segredos. Quem lê o ambiente tem um token que age **como ela** — é mais uma razão para o escopo
estreito do passo 2, a expiração de 90 dias e, quando der, o **Somente leitura**.

## 4. Conferir

Variável de ambiente só entra na largada da sessão, então a conferência é numa sessão nova:

> Abra uma sessão **nova** neste repositório e mande: `confira o meu acesso à instância`. Eu vou
> alcançar a instância, dizer quem eu sou lá, quais alçadas eu tenho e quando o token expira —
> sem mudar nada. Se algum passo tiver ficado pela metade, eu digo qual destes três refazer.

O que se confere nessa sessão é a § 2 do `SKILL.md`, para cada entrada: JSON válido, URL
alcançável pela rede do ambiente, token que autentica, `id` da identidade igual ao `usuario_id`
declarado, e o cabeçalho com alçadas, escopo e expiração.

## 5. Depois — o que a pessoa precisa saber para operar

Diga isto no fim, em poucas linhas:

- **Pausar** é desativar o token em `<URL>/preferencias`, seção Tokens. Reativar é um clique.
- **Conceder alçada nova** exige **gerar outro token** e trocá-lo na entrada do ambiente — o escopo é
  fixado na emissão. **Revogar** vale na hora, sem trocar nada.
- **Renovar** antes dos 90 dias é o lápis de "Expira em", na mesma tela, sem trocar o segredo.
- **Eu peço autorização antes de cada mudança** e digo como desfazer. Leitura eu faço direto.
- **A trilha de auditoria guarda tudo** em `<URL>/admin/auditoria`, **no seu nome**: o que eu
  fizer é ato seu, e responde por ele quem autorizou.
- **Cada pessoa da equipe gera o seu token**, do próprio usuário. Token não se compartilha.
- **Se você parar de usar:** revogue o token na mesma tela. Trocar a senha **não** revoga token
  nenhum.
