# Prompt-modelo — sessão de QA

Dispare com `permission_mode: "acceptEdits"` (em `auto` o classificador bloqueia a maior parte das
sessões de QA) e com o `environment_id` do **ambiente dedicado de QA** da instância de teste.
Antes de disparar, confira que não há release de app saindo: release reinicia a instância no meio
do roteiro. Preencha todo marcador `<...>`. O texto entre as duas réguas é o prompt.

---

/qa PR #<n> em <owner/repo>

Valide **por API** o PR <#n> em `<owner/repo>` (fase <N> do arco da issue #<g>), já mergeado e
publicado na versão <versão> da app (release <tag>). A instância é a do ambiente desta sessão;
não teste outra.

**Versão:** antes de testar, leia a lista de apps da instância (`GET /api/shell/apps`) e compare o
campo `versao` da app com `<versão>` — é a versão do manifesto, sem a tag. A lista só traz apps
que o seu usuário enxerga; se a app não aparecer, ou a API não deixar confirmar, não valide: feche
com `incompleto: versão instalada não confirmada, esperada <versão>`. Se for outra que `<versão>`,
feche com `incompleto: versão instalada <x>, esperada <versão>`.

<- módulo de canal: a versão é a do módulo, lida na lista de
  módulos (`GET /api/shell/modulos`, campo `versao` do slug, alçada Apps) em vez da de apps; a tela
  e o mount direto `/api/modulos/<slug>/…` pedem a alçada `nucleo` no QA Principal, e sem ela são
  lacuna, não 403 a investigar;>

**O que exercitar, além do roteiro que você montar do diff:**
- <cenário que a coordenadora quer coberto>

**Pool de perfis:** está autorizado usar os usuários `QA <Tipo> <n>` do pool que estiverem
inativos, **e os ativos sem token vigente** (sessão que morreu; a skill manda usar e registrar no
plano que o encontrou assim, sem esperar resposta). **Criar usuário novo, ou usar um ativo com
token vigente, não está autorizado** — ninguém vai responder à pergunta, e um ativo com token é
indício de outra sessão de QA viva: registre o perfil que faltou como lacuna no relatório e siga.

**Não exercite:** tela (a lista de verificação visual é do dono, está no corpo do PR), e rota
nenhuma com `homolog`, `upgrade`, `release` ou `atestado` — reporte-as como "não exercido por
proibição expressa".

**Como reportar:** publique o relatório completo como **comentário no PR <#n>**, com o footer de
atribuição. **Não use `send_message`**: aqui ele pede aprovação e a sessão trava. A coordenadora
lê o relatório no PR. Feche o comentário com:

```
QA PR #<n> — <passou | falhou: N achados | incompleto: motivo>
Início <hh:mm> · Fim <hh:mm> · Duração <min>
```

**Regras desta instalação:** nunca `AskUserQuestion`; subagente nunca com saída estruturada;
script pela ferramenta Write, nunca heredoc; nunca imprima token nem variável de ambiente que o
contenha. Desfaça o que a skill manda desfazer no fim (tokens, alçadas, usuários do pool).

---
