# Fechamento de fase — repositório de app

Lido pela coordenadora (`SKILL.md` § 8) ao fechar fase que acontece num repositório de app, seja
qual for o arco: o fechamento é do repositório da fase, não de onde a coordenação partiu.

## 1. Merge

A regra é a do núcleo, sem nada próprio daqui: a resposta do dono na preparação do arco
(`SKILL.md` § 2.4) decide, e o fallback de execução é o da `SKILL.md` § 6.2.

## 2. Release

Merge de PR de app **não gera release**. A release sai pelo workflow `release.yml` do repositório
da app, disparado por `workflow_dispatch` com o appId, e segue a resposta do dono na preparação do
arco (`SKILL.md` § 2.4): autorizou, a coordenadora dispara depois do merge; pediu para esperar,
ela avisa que está pronto para release e espera. Quem dispara é a coordenadora: é ação de GitHub,
não rota de instância nem homologação. Rota de instância com `homolog`, `upgrade`, `release` ou
`atestado` no caminho ela não chama nunca (`SKILL.md` § 2.4).

A release pode **reiniciar a instância de teste**: a instalação é do auto-update, que é opt-in por
app, nunca ligado por padrão (toggle ligado, com `repo_origem`), e se ele está ligado para a app em
questão a coordenadora não sabe sem olhar. Na dúvida, trate como reinício: **nunca dispare release
com QA rodando**. Confira antes, no checklist, que nenhuma filha de QA está viva.

## 3. Espera da instalação

QA só se dispara contra a **versão da release instalada** na instância de teste. Com o auto-update
ligado para a app, ela chega sozinha; desligado, instalar é do dono, e a coordenadora pede e
espera — ela não instala. O prompt de QA leva a versão esperada (`<versão>` do
`prompt-qa.md`, a do manifesto da app; a tag da release é dado à parte, só do relatório): a filha
compara com o campo `versao` da lista de apps da instância e, se for outra ou se não conseguir
confirmar, reporta "incompleto" em vez de validar o que não foi pedido.

## 4. QA e aviso

QA pela skill `qa`, pelo `prompt-qa.md` (`SKILL.md` § 7.2). O aviso de "pronto" ao dono diz: os PRs
mergeados, a release (tag), a versão instalada na instância de teste (a que a QA confirmou; sem confirmação não há QA
completo, então não há aviso de pronto), o resultado do QA (com o link
do comentário no PR) e a lista de verificação visual pendente. Homologar a release, quando a
instância pede, é do dono: ele entra na instância e homologa.
