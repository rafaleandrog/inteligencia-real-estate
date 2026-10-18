# evento-nao-identificado.md — notificação sem arquivo próprio

Cumprido pela `roteador-urbiverso` (§ 4) quando nenhum arquivo tem o nome do evento, ou quando
um arquivo de instruções reconhece que a notificação não é dele.

Resuma a notificação em **uma linha** — origem, tipo, `resumo` ou o começo da `mensagem` — e
encerre **sem escrever nada**: nem na instância, nem no GitHub.

A `rota` é caminho de tela do SPA, não de API: **não dê GET nela**. A linha de resumo sai do
próprio disparo: daqui em diante **não chame rota nenhuma da instância** — nem de leitura; a
conferência de identidade da skill (§ 3) já foi feita antes do despacho — e não leia nada fora do
disparo.

Para tratar um evento que cai aqui, crie o arquivo com o nome dele em `.claude/notificacoes-urbiverso/`
(equipe) ou na skill da conta `notificacoes-urbiverso-pessoal` (pessoal) — ou copie este para lá
e edite, para mudar o que acontece com todo evento sem arquivo.

No resumo final, `Item:` é a linha de resumo.
