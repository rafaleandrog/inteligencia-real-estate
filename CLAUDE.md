# CLAUDE.md — Instruções para Claude Code

Este arquivo é lido automaticamente pelo Claude Code a cada nova sessão.
Para regras de código, arquitetura e data contract, consulte `AGENTS.md`.

---

## Protocolo Obrigatório: Registro de Issues

**Toda mensagem do usuário que descreva uma tarefa, melhoria, bug ou qualquer alteração no sistema DEVE gerar uma GitHub Issue antes de qualquer implementação.**

Essa instrução é permanente e se aplica a todas as sessões neste repositório.

### Passo a passo

1. **Analise** o conteúdo da mensagem do usuário
2. **Classifique** prioridade e tipo (veja tabelas abaixo)
3. **Crie a issue** via `mcp__github__issue_write` com:
   - `owner`: `rafaleandrog`
   - `repo`: `inteligencia-real-estate`
   - `method`: `create`
4. **Informe** o link da issue criada ao usuário
5. **Só então** prossiga com a implementação (se solicitado)

---

### Estrutura da Issue

**Título:** Imperativo curto em português (ex: "Adicionar filtro de bairro no mapa")

**Corpo obrigatório:**

```markdown
## Contexto
<Por que isso é necessário? O que motivou o pedido?>

## O que precisa ser feito
<Lista clara e objetiva das mudanças necessárias>

## Critérios de aceite
- [ ] <Item verificável 1>
- [ ] <Item verificável 2>

## Notas técnicas
<Arquivos relevantes, dependências, riscos — deixe em branco se não houver>
```

---

### Labels de Prioridade

| Label | Quando usar |
|---|---|
| `priority:high` | Bloqueia funcionalidade principal ou está quebrando o app |
| `priority:medium` | Melhoria importante mas o app funciona sem ela |
| `priority:low` | Refinamento, cosmético, nice-to-have |

### Labels de Tipo

| Label | Quando usar |
|---|---|
| `type:bug` | Comportamento incorreto ou erro |
| `type:feature` | Nova funcionalidade |
| `type:refactor` | Reorganização interna sem mudança de comportamento |
| `type:docs` | Documentação, comentários, README |
| `type:chore` | Configuração, dependências, CI, scripts |

### Label de Sessão (sempre incluir)

| Label | Descrição |
|---|---|
| `logged-by-claude` | Aplicar em **toda** issue criada por Claude neste repositório |

---

### Regra de ouro

> Se o usuário escreveu e você entendeu o que precisa mudar — crie a issue primeiro, implemente depois.
> Nunca implemente silenciosamente sem registrar.
