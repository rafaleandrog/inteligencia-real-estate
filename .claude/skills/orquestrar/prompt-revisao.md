# Prompt-modelo — sessão de revisão

Preencha todo marcador `<...>` antes de disparar. A autorização de merge **mora aqui, no prompt
inicial**: `send_message` posterior não vale como autorização, porque a skill de revisão a exige
na chamada. Só inclua a linha de autorização se o dono autorizou o merge na preparação do arco
(`SKILL.md` § 2.4, registrado na memória-âncora); se ele escolheu revisar os PRs ele mesmo,
troque-a por "Não mergeie." O texto entre as duas réguas é o prompt.

---

/revisar-pr-apps <n> — máximo 3 rodadas

Branch liberada — <sha do head conferido pela coordenadora>

PR <#n> em `<owner/repo>`, fase <N> do arco da issue #<g>. A sessão que implementou já reportou o
fim e foi arquivada: a branch está livre, e o SHA acima é o head que conferi no PR.

**Se a skill de revisão não carregar** — o comando acima não existe nesta sessão, ou a ferramenta
de skill não a lista —, **PARE e reporte** à coordenadora no formato do fim deste prompt, com o
desfecho `bloqueado: skill de revisão não carregou`. Não revise de memória: revisão sem a skill
perde o portão, os motores e o critério de parada, e o laudo dela não vale como revisão.

**Merge autorizado se, e somente se,** o ciclo fechar no desfecho **Sucesso** e o CI do head final
estiver **verde**: squash, prendendo o head final (o do passe de fechamento, se ele commitou).
Qualquer outro desfecho — não converge, rodadas esgotadas, decisão de desenho, regressão — não
mergeia: reporte e pare.

**Foco adicional desta revisão:**
- confira o corpo do PR contra as issues que ele fecha — item pedido e não feito é bloqueante;
- ao fim, confira o portão de merge da sua skill (§ 9, "Merge") item por item e reporte cada um,
  mais o head final (depois do passe de fechamento, se ele commitou) — a coordenadora só confia
  em head cujo portão você reportou inteiro e sem item barrado, mesmo em Sucesso;
<- o PR muda o modo de um primitivo de UI: varra cada `@urbi:` escutado contra os eventos do modo
  usado;>
<- mudança visual: exija medição Chromium antes/depois no corpo e teste que trave a geometria;>
- toda "lacuna da plataforma" alegada se confirma contra o bundle do SDK instalado;
<- decisão de contrato já tomada pela coordenadora (vetável pelo dono): <decisão> — não reabra;>

**Regras desta instalação:** nunca `AskUserQuestion`; subagente nunca com saída estruturada;
script pela ferramenta Write, nunca heredoc; sempre `git push -u origin <branch>`; footer de
atribuição em todo post do GitHub; nunca chame rota de instância com `homolog`, `upgrade`,
`release` ou `atestado`.

**Ao terminar**, reporte à coordenadora com `send_message(session_id="@parent")` do servidor MCP
`claude-code-remote`, neste formato:

```
REVISÃO PR #<n> — <desfecho> · rodadas <k>
Merge: <feito, sha <sha> | não feito: sem autorização neste prompt | não feito: autorizado e em Sucesso, mas não executei — motivo | não feito: barrado por <item do portão: CI, suíte/pulados, Closes, doc, versão do manifesto, bloqueante, decisão de desenho> — detalhe>
Head final: <sha — o que o portão abaixo conferiu>
Portão (skill revisar-pr-apps): <item: conferido | falhou — detalhe, um por item da sua § 9, inclusive Closes na forma completa e versão do manifesto, quando app>
CI do head: <verde | vermelho | pendente>
Sobras do passe de fechamento: <achado — rodada r … ou "nenhuma">
Lacunas da plataforma confirmadas: <… ou "nenhuma">
Ponto reincidente / decisão pedida: <… ou "nenhum">
Início <hh:mm> · Fim <hh:mm> · Duração <min>
```

---
