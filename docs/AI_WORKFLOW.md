# Workflow de agentes de IA

Documentação de engenharia para agentes que trabalham neste repositório. Se você é um agente
começando agora, leia [`../AGENTS.md`](../AGENTS.md) primeiro — este arquivo é o detalhe operacional.

## Hierarquia de regras

```
AGENTS.md                  porta de entrada, resumo, Code Review Rules
   └── docs/ENGINEERING_RULES.md    regras numeradas — FONTE CANÔNICA
   └── docs/DATA_CONTRACT.md        schema — fonte de verdade dos dados
   └── .agents/skills/*/SKILL.md    workflow por tipo de tarefa
```

Ferramenta que exige arquivo próprio (`CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`)
**aponta para esses arquivos**, nunca duplica o conteúdo. Regra copiada é regra que diverge.

## Skills do repositório

| Skill | Acione para |
|---|---|
| [`imob-implementer`](../.agents/skills/imob-implementer/SKILL.md) | Feature, mudança de UI, mudança de comportamento, módulo novo |
| [`imob-debugger`](../.agents/skills/imob-debugger/SKILL.md) | Bug, erro de console, mapa que não aparece, dado que não carrega, filtro incorreto |
| [`imob-reviewer`](../.agents/skills/imob-reviewer/SKILL.md) | Revisar mudanças — read-only durante a análise |
| [`imob-data-contract`](../.agents/skills/imob-data-contract/SKILL.md) | Qualquer coisa que toque schema, cabeçalho, ID, coordenada, preço, data |
| [`imob-appscript`](../.agents/skills/imob-appscript/SKILL.md) | Qualquer mudança no `Code.gs` |
| [`imob-release`](../.agents/skills/imob-release/SKILL.md) | Antes de publicar uma versão |

Escolha uma. Se a tarefa é construir, é `imob-implementer`; se é descobrir por que quebrou, é
`imob-debugger`. Confundir as duas leva a "consertar" sintoma.

## Ciclo obrigatório de review pelo Codex

**Nenhuma PR entra em `main` sem passar por uma review do Codex.** O que bloqueia é **P0 ou P1
em aberto**, não a ausência de qualquer achado — uma rodada é o normal, e P2/P3 viram backlog
(R7.2 e R7.6). O ciclo roda sozinho: não peça permissão a cada etapa (R7.7).

```
implementa em branch
   → abre PR contra main
   → comenta "@codex review" na PR
   → Codex revisa

        apontou problema?
          sim → corrige, push, "@codex review" de novo  ─┐
          não → merge em main                            │
        └──────────────────────────────────────────────── ┘
              repete até não haver mais achado
```

Detalhes que importam:

- **O review é disparado explicitamente** com `@codex review` na PR, e de novo a cada push de
  correção. Não dependa de *Automatic reviews* estar ligado — se estiver, roda em dobro, o que
  não é problema.
- **`AGENTS.md` tem uma seção `## Code Review Rules`.** É o que o Codex lê para saber o que
  priorizar aqui. Mantenha-a atualizada em vez de criar um segundo documento de prioridades.
- **`.github/codex/prompts/review.md`** é o prompt completo, para quando se quer uma revisão mais
  profunda que a automática, ou para rodar o review manualmente contra a branch base.
- **Silêncio não é aprovação.** Se o Codex não respondeu, não faça merge — avise o responsável.
- **Achado do Codex que revele uma classe de erro vira regra numerada** na seção 8 de
  [`ENGINEERING_RULES.md`](ENGINEERING_RULES.md), na mesma PR que corrige. É assim que o
  aprendizado fica no repositório em vez de se perder no histórico de conversa.

### Ativação (uma vez, por um humano)

1. Conecte este repositório em Codex.
2. Ligue **Automatic reviews** nas configurações do Codex.

Sem isso, `@codex review` não tem destinatário e o gate de review não roda.

### Alternativa: gate dentro do GitHub Actions

Se um dia preferir o review rodando como job do Actions em vez do app Codex Cloud, o caminho é
`openai/codex-action@v1` com a chave em **GitHub Secrets** — nunca no código (R4.1). Crie
`.github/workflows/codex-review.yml`:

```yaml
name: codex-review
on:
  pull_request:
    types: [opened, synchronize, reopened]
permissions:
  contents: read
  pull-requests: write
jobs:
  guard:
    runs-on: ubuntu-latest
    outputs:
      has_key: ${{ steps.check.outputs.has_key }}
    steps:
      - id: check
        env:
          KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          if [ -n "$KEY" ]; then echo "has_key=true" >> "$GITHUB_OUTPUT"
          else echo "has_key=false" >> "$GITHUB_OUTPUT"; fi

  review:
    needs: guard
    if: needs.guard.outputs.has_key == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: refs/pull/${{ github.event.pull_request.number }}/merge
          fetch-depth: 0
      - id: codex
        uses: openai/codex-action@v1
        with:
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          permission-profile: ':workspace'
          prompt: |
            Siga .github/codex/prompts/review.md e revise o diff entre
            ${{ github.event.pull_request.base.sha }} e o HEAD desta PR.
      - uses: actions/github-script@v7
        with:
          script: |
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: process.env.MSG
            })
        env:
          MSG: ${{ steps.codex.outputs.final-message }}
```

O job `guard` faz o workflow pular limpo quando a chave não está configurada, em vez de falhar a
PR inteira. **Este workflow não está ativo** — o projeto usa o app Codex Cloud.

## Smoke test obrigatório

Após qualquer mudança funcional (R6.4). Não declare a V1 funcional sem passar por aqui.

O roteiro está automatizado em [`tools/smoke-test.mjs`](../tools/smoke-test.mjs), dirigindo um
Chromium real:

```bash
npm install        # instala o playwright (devDependency opcional, não usada na CI)
npm run serve &    # sobe http://localhost:8080
npm run smoke      # roda o roteiro completo em navegador
```

Se o ambiente tiver um Chromium pré-instalado com build diferente da que o Playwright baixaria,
aponte para ele: `CHROMIUM_PATH=/caminho/para/chrome npm run smoke`.

Ele já pegou dois bugs que nenhum teste unitário pegaria: `leaflet.js` ausente do HTML (R8.13) e
marcadores SVG estilizados com `background` em vez de `fill` (R8.14).

A área administrativa (`admin.html`, issue #5) tem roteiro próprio em
[`tools/smoke-test-admin.mjs`](../tools/smoke-test-admin.mjs) (`npm run smoke:admin`), que
mocka o Apps Script via `page.route()` — não há Web App de teste disponível neste projeto. Já
pegou dois bugs equivalentes do lado administrativo: validação de campo obrigatório que não
bloqueava o envio (R8.34) e mensagem de sucesso apagada pela própria recarga que a sucede
(R8.35).

Para verificar à mão:

```bash
python3 -m http.server 8080
```

1. Abrir `http://localhost:8080`
2. Console sem erro
3. Mapa aparece
4. Busca funciona
5. Cada filtro reduz o conjunto
6. Clicar em pelo menos um anúncio → detalhe abre
7. Clicar em um empreendimento → detalhe abre
8. Link da fonte presente e válido
9. KPIs conferem com o conjunto visível
10. Largura mobile (390 px) utilizável
11. Modo demo (`demoMode: true`)
12. Google Sheets real, se a configuração estiver disponível

**Item não verificado não é marcado.** Se uma limitação de ambiente impediu o teste, declare qual
item ficou de fora e por quê (R6.6).

## Debugging

Workflow completo em [`imob-debugger`](../.agents/skills/imob-debugger/SKILL.md).

```
reproduzir → coletar evidência → reduzir → causa raiz → corrigir → teste de regressão → smoke test
```

A regra que mais importa: **não aplique várias mudanças aleatórias esperando que alguma resolva.**
Se você não sabe por que passou a funcionar, você mascarou o bug em vez de corrigi-lo. E
**nunca declare um bug corrigido sem reproduzir antes e verificar depois** (R6.5).

Testar nos dois modos — `demoMode: true` e Google Sheet real — isola o problema em código *ou*
em dado. É o primeiro corte mais útil deste projeto.

## Apps Script

Detalhes em [`imob-appscript`](../.agents/skills/imob-appscript/SKILL.md) e
[`SHEET_SETUP.md`](SHEET_SETUP.md).

Prioridade: `correção → idempotência → segurança → observabilidade → simplicidade`.

`setupProject()` roda mais de uma vez e não pode sobrescrever o que já existe. Use `LockService`
onde trigger de edição e job de manutenção disputam as mesmas abas. Endpoint é read-only com
allowlist. Segredo em Script Properties, nunca em célula.

## Release

Checklist em [`imob-release`](../.agents/skills/imob-release/SKILL.md).

## Relatório final

Todo ciclo termina com: **Implementado · Arquivos principais · Apps Script · Testes · Smoke test ·
Dados · Pendências · Próxima melhor melhoria**. O template de PR já tem essa estrutura.

Não encerre com "feito". O objetivo é deixar o repositório de forma que outro agente consiga
continuar lendo o próprio projeto, sem depender do histórico de conversa.
