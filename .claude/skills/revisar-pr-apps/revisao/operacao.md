<!-- Regra compartilhada de revisão de PR — lida na execução pelas skills de revisão dos
     DOIS catálogos e embutida no pacote que leva a skill ao repositório de apps do cliente.
     Por isso este arquivo é
     AUTOCONTIDO: ele roda em sessão que não tem o monorepo — nada daqui pode exigir a leitura
     de arquivo que só existe lá (convenções do repositório, documentação da plataforma),
     nem citar caminho de catálogo de skill ou motor externo por nome. -->

# Operação


Roda no modelo atual da sessão. **Delegue tudo que der** — o contexto do orquestrador é o
recurso escasso.

**A fan-out inteira vai para o motor do passo 2.2**, no tier que a tabela de lá manda. Subagente
nativo fora do fallback só entra por exceção sua: uma refutação de bloqueante com outra cabeça.

**Limite rígido de 350 a 450 palavras por agente.** Só achados; o que passou vira **uma**
linha no fim. Sem esse limite o contexto do orquestrador estoura antes do relatório.

Todo agente devolve **evidência, não veredito**: `arquivo:linha`, citação literal, e o
raciocínio que liga uma coisa à outra. Nada de estilo, preferência, ou código que o diff não
toca. **Agentes não postam.** Você recebe os relatórios, deduplica e escreve o comentário.

**Os subagentes de conserto são nativos, e é de propósito** (motor de correção, § Motor externo
para conserto). Eles são a única coisa desta skill que escreve, e ficam presos ao lote de
arquivos que você lhes deu. O relatório que eles devolvem **não entra no briefing de lente
nenhuma**: justificativa de quem consertou ancora quem revisa, e a rodada seguinte perde a
independência sem que o relatório mostre qualquer diferença.

**Todo achado bloqueante é verificado por você antes de reportar.** Se for útil, peça
refutação a um agente novo — mas isso é opção sua, caso a caso. Agentes já se contradisseram
entre si, e achado próprio já morreu na verificação — que é o desfecho certo, não vergonha.

**Toda citação que sustenta um bloqueante é reconferida por você, no arquivo, abrindo a linha.**
Verificar o achado e verificar a citação são coisas diferentes, e a segunda não sai de graça
com a primeira: um agente já apontou `arquivo:339` para uma frase que estava em OUTRO arquivo,
na mesma linha. Confira o caminho, o número e o texto — se a citação não bate, o achado volta
para investigação antes de virar bloqueante, mesmo que o raciocínio pareça de pé.
