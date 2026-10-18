<!-- Regra compartilhada de revisão de PR — lida na execução pelas skills de revisão dos
     DOIS catálogos e embutida no pacote que leva a skill ao repositório de apps do cliente.
     Por isso este arquivo é
     AUTOCONTIDO: ele roda em sessão que não tem o monorepo — nada daqui pode exigir a leitura
     de arquivo que só existe lá (convenções do repositório, documentação da plataforma),
     nem citar caminho de catálogo de skill ou motor externo por nome. -->

# Triagem — antes de qualquer análise


Leia o PR e **todos** os comentários. Decida:

| Situação | Ação |
|---|---|
| Sem comentário de revisão | **Rodada 1** |
| Revisão anterior + commit posterior a ela | **Rodada N+1** (§ 8) — o conserto é código novo e vale revisão |
| Revisão anterior + comentário posterior que a mencione (inclusive resposta parcial) | **Rodada N+1** (§ 8) — revise o delta e o que a resposta afirma |
| Revisão anterior **intocada**: nenhum comentário depois, nenhum commit depois | **PARE** |

**Dentro do modo ciclo esta tabela não se aplica a partir da rodada 2**: a rodada N+1 nasce do
commit de conserto que você mesmo empurrou, e ele é sempre posterior ao relatório. A triagem
decide a **entrada** no ciclo, uma vez.

Revisão intocada é provável disparo em duplicidade. Ao parar, diga qual comentário é a
revisão, a data dele, e que revisar de novo produziria o mesmo relatório sobre o mesmo
código. **Se o usuário pedir nova revisão expressamente, siga** — sem discutir.

Não conta como revisão: a descrição do PR, comentário de status/CI, runbook de validação do
autor, e **relatório da própria sessão que escreveu o PR** — autorrevisão relatando correções
que ela mesma aplicou não é revisão independente. Todo comentário pode sair com o mesmo
login: distinga pelo **conteúdo e pela data**, nunca pelo autor.
