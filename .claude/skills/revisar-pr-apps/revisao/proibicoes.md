<!-- Regra compartilhada de revisão de PR — lida na execução pelas skills de revisão dos
     DOIS catálogos e embutida no pacote que leva a skill ao repositório de apps do cliente.
     Por isso este arquivo é
     AUTOCONTIDO: ele roda em sessão que não tem o monorepo — nada daqui pode exigir a leitura
     de arquivo que só existe lá (convenções do repositório, documentação da plataforma),
     nem citar caminho de catálogo de skill ou motor externo por nome. -->

# Proibições comuns da revisão

Valem em toda revisão de PR, em qualquer runtime. A folha de cada objeto acrescenta as suas —
estas nunca saem.

- **Sem editar arquivo com as próprias mãos, em modo nenhum.** Na revisão fria, que é o
  default, some junto o commit, o push e a correção: o conserto é descrito no relatório. No modo
  ciclo o conserto é dos subagentes, e commit e push são só do orquestrador — só na
  branch do PR, só depois da validação, e com **confirmação expressa** quando o PR é de terceiro
  ou vem de fork.
- **Nunca na branch default do repositório, nunca abrir PR, nunca reescrever histórico** de
  branch alheia.
- **Sem merge sem autorização expressa.** Revisão limpa não é autorização.
- **Proibido tocar qualquer rota de API de qualquer instância** — produção, homologação,
  desenvolvimento local, qualquer uma. Nem para diagnóstico, nem para caso negativo de teste,
  nem "só um GET". **O revisor trabalha sobre superfície fria: código e documentação.**
  Instância quente é assunto da skill `qa`. Essa proibição vai cravada no briefing de **cada**
  agente — agente com shell e rede acha natural "testar o endpoint", e nenhum arquivo de
  convenção do repositório viaja no prompt dele.
- **Sem editar, esconder ou resolver comentário de outra sessão.** O histórico é o registro.
- A branch principal é só para puxar. Se precisar de árvore própria, use worktree — nunca duas
  sessões na mesma árvore de trabalho.

## O que não é achado

- **"O gate de PR não roda X" não é achado** — seja a suíte de um pacote, um lint ou outra verificação. O que o CI de PR roda é decisão do repositório, que a documenta onde documenta o próprio CI, e não do PR: a observação não entra no relatório nem no placar, e não vira issue.
- **Fica fora desta regra o PR que muda o próprio CI.** O que ele tira ou enfraquece de um gate que existia é diff, e se revisa como tal.

## Quem executa o quê — e é aqui que a rodada ganha ou perde tempo

As três abaixo não são higiene: cada uma nasceu de um custo medido, e as três valem para
qualquer runtime — motor externo ou subagente nativo.

- **Agente de revisão não executa nada. Nem build, nem teste, nem lint, nem instalação.** Ele lê:
  `git`, busca de texto, leitura de arquivo. Nada mais. Uma lente que resolve rodar a suíte gasta
  o orçamento de tempo dela na suíte e morre no timeout **sem entregar achado nenhum** — e o
  sintoma imita motor fora do ar, então ninguém descobre por quê. Medido: a mesma lente de
  contrato, no mesmo PR, levou mais de 900s (estourou) enquanto rodava a suíte e **508s** depois
  que a proibição entrou no briefing. A frase vai cravada no briefing de **cada** agente, junto da
  proibição de tocar instância, e pelo mesmo motivo: nenhum arquivo de convenção do repositório
  viaja no prompt dele.
- **Agente de conserto roda só os arquivos de teste que ele mesmo tocou — e nada além.** Nunca o
  build, nunca a suíte de um pacote inteiro, nunca a suíte completa. O recorte não é de
  desconfiança, é de colisão: os lotes rodam **em paralelo**, e build e servidor de
  desenvolvimento disputam artefato de compilação e porta, então dois lotes que constroem ao
  mesmo tempo derrubam um ao outro. Executar o arquivo de teste que ele escreveu não constrói nada
  e não abre porta — e vale a pena, porque o lote que descobre ali que quebrou conserta na hora,
  em vez de virar lote de reparo depois. A validação do conjunto é do orquestrador, uma vez, e o
  escopo dela está na regra do ciclo.
- **Fato afirmado pelo orquestrador no briefing é hipótese a verificar, nunca premissa.** O
  briefing carrega a invariante a satisfazer e onde conferir — mas quando ele **afirma** que algo
  é verdade no sistema, o agente confere essa afirmação **no código** antes de escrever qualquer
  coisa apoiada nela, e o retorno cita a linha de código que a sustenta. Citar de volta o
  documento que o briefing indicou não é verificação: documento erra, e um documento errado
  confirmado por quem revisa e copiado por quem conserta vira contrato publicado. Num ciclo real
  foi exatamente assim que uma afirmação falsa sobre o comportamento do sistema entrou em quatro
  arquivos de uma vez — o orquestrador a ditou com as fontes que a confirmavam, e as fontes é que
  estavam erradas. Achou que a afirmação do briefing não se sustenta: **relata e para**, não
  conserta em cima dela.
