# Motor da fan-out de revisão

Lido pelas skills `revisar-pr-shell` e `revisar-pr-apps`, no passo 2.2 de cada uma. Arquivo
único de propósito: eram três, com detecção de ambiente entre eles, e a detecção era pura
cerimônia — a receita abaixo roda igual na máquina do usuário e em sessão na nuvem.

As lentes dos passos 3 e 4 rodam **fora da conta Anthropic**, em dois motores externos. O
revisor lê muito e escreve pouco — uma lente engole um doc inteiro, o diff e o código em volta
para devolver 400 palavras —, então o custo mora no input, e é ali que o motor externo paga.

**São dois motores, escolhidos por preço no papel da lente, com fallback cruzado.** Codex
(`gpt-6-luna`/`gpt-5.6-terra`) nas lentes baratas e nas de meio; Kimi (`kimi-k3`) nas de contrato
sensível, onde o tier equivalente seria o `gpt-6-sol` e o Kimi custa 40% menos no input e
metade no output. Medido em agosto de 2026 (geração 5.6, antes de `luna` e `sol` irem para 6), por milhão de tokens: `luna` $0,20/$1,20 ·
`terra` $2/$12 · `sol` $5/$0,50 em cache/$30 · `kimi-k3` $3/$0,30 em cache/$15. Kimi é mais
barato que exatamente **um** dos três tiers, e é nesse que ele entra — nos outros dois ele
custaria 1,5× (`terra`) e 15× (`luna`).

**Quem falha cai no outro; só se os dois caírem é que vai para o nativo.** Não existe pergunta
ao usuário no meio: os preflights tentam, cada lente sabe qual é o seu motor alternativo, e
toda troca é **declarada** no relatório e na linha de anúncio. O que nunca acontece é lente
sumir porque um motor caiu.

**O ganho da mistura não é só preço — é opinião independente.** Medido no piloto do PR #2608:
a fan-out em Kimi devolveu um bloqueante provável por execução que a passagem no motor nativo
não pegou, e sobre o qual o relatório nativo tinha escrito o contrário em "confrontado e
passou". Motor único erra junto consigo mesmo; é por isso que a cascata cruza em vez de
degradar sempre para o mesmo lugar.

## Entradas que a skill chamadora fornece

O motor é o mesmo para shell e para app; o que difere vem de quem chama, e **tem que estar
resolvido antes de despachar**:

| Entrada | Quem define |
|---|---|
| `WT` — a árvore que as lentes leem | a seção *A árvore que o motor lê*, abaixo |
| `BASE` — o merge-base, nunca o nome da branch | passo 2 da skill |
| Lentes, com id, tier e esforço | passos 2.1, 3 e 4 da skill |
| **Superfície de docs** do briefing de contratos | a skill: `docs/shell/<f>.md` no shell, `node_modules/@urbiverso/sdk/docs/` na app |
| Faixas de **contrato sensível** (as que rodam em Kimi) | a skill: no shell migração/`sdk/`/auth/permissões/contas/auditoria; na app migração/`schema.json`/`manifesto.json`/permissões/contas/auditoria |

## Preflight — uma vez por sessão, antes de qualquer lente

**Dois preflights, ambos rodam sempre**, mesmo que o orçamento da rodada só use um dos motores:
é o resultado dos dois que decide para onde cada lente cai quando a outra ponta falhar. São
idempotentes e baratos.

### Codex

```bash
# $OUT nasce AQUI, não na fan-out: o preflight roda antes de tudo e já escreve arquivo.
OUT=<scratchpad da sessão>/revisao; mkdir -p "$OUT"

# Ferramentas que os blocos deste arquivo assumem. Faltando qualquer uma, a lente morre
# com diagnóstico vazio e o sintoma imita motor fora do ar.
for f in jq timeout; do command -v "$f" >/dev/null 2>&1 || echo "FALTA $f"; done

command -v codex >/dev/null 2>&1 || npm i -g @openai/codex >/dev/null 2>&1
codex login status >/dev/null 2>&1 || printenv OPENAI_API_KEY | codex login --with-api-key
codex login status        # tem que dizer "Logged in using an API key"

# Smoke test: um turno de verdade no modelo do tier barato. `login status` prova a chave,
# NÃO que ela alcança o modelo nem que o CLI o conhece.
smoke_codex() {
  timeout 120 codex exec -s read-only --ephemeral -c model_reasoning_effort=low --json \
    -m gpt-6-luna "responda apenas OK" </dev/null >"$OUT/smoke-codex.jsonl" 2>"$OUT/smoke-codex.err"
}
smoke_codex; rc=$?
# CLI mais velho que o modelo: roda, mas com metadados genéricos. Atualiza uma vez e refaz.
if jq -e 'select(.item.type=="error" and (.item.message|test("Model metadata")))' \
     "$OUT/smoke-codex.jsonl" >/dev/null 2>&1; then
  npm i -g @openai/codex@latest >/dev/null 2>&1 && { smoke_codex; rc=$?; }
fi
if [ "$rc" = 0 ] \
   && ! jq -e 'select(.type=="turn.failed" or .type=="error")' "$OUT/smoke-codex.jsonl" >/dev/null 2>&1 \
   && jq -e 'select(.item.type=="agent_message")' "$OUT/smoke-codex.jsonl" >/dev/null 2>&1; then
  echo "CODEX OK ($(codex --version))"
else
  echo "CODEX FORA:"; jq -r 'select(.type=="turn.failed" or .type=="error") | (.error.message // .message)' \
    "$OUT/smoke-codex.jsonl" 2>/dev/null | head -2; head -4 "$OUT/smoke-codex.err"
fi
```

- **O CLI pode não estar instalado**, e instalar é rápido (medido: 7s num container limpo).
  Onde já existe — inclusive login de ChatGPT já feito —, os dois primeiros comandos não fazem
  nada: o `login --with-api-key` não atropela sessão existente.
- **O smoke test usa a mesma guarda da colheita** — exit 0, nenhum `turn.failed`/`error` de
  primeiro nível **e** um `agent_message` —, pela mesma razão do Kimi abaixo: é a pergunta
  "este motor completa um turno?" feita uma vez, antes de decidir. Ele pega o que o
  `login status` não vê: chave sem acesso ao modelo (a lente morreria uma a uma, sem aviso
  prévio) e CLI mais velho que o modelo. Testa só o tier barato (`gpt-6-luna`); acesso ao
  `gpt-6-sol` continua sendo descoberto lente a lente, e aí vale o fallback cruzado.
- **CLI velho não quebra, degrada.** Um `codex` anterior ao modelo roda o turno, mas emite
  `item.completed` com `item.type=="error"` e a mensagem `Model metadata for ... not found`, e
  usa metadados genéricos (janela de contexto, entre outros). Esse evento é aninhado, não o
  `error` de primeiro nível que a guarda procura — não é falha, e não conta como uma. O
  preflight trata o sinal atualizando para `@latest` **uma vez**; onde o setup script do
  ambiente fixa versão, a atualização vale só para a sessão, e o conserto duradouro é subir a
  versão fixada lá.
- **`OPENAI_API_KEY` vem do ambiente.** Container com a chave no ambiente e nenhuma sessão do
  `codex` é o estado normal: aí o CLI não manda o header de autorização e **toda** chamada volta
  `401 Missing bearer` — as lentes somem em bloco e o sintoma não parece de credencial.
- **Ruído esperado, que não é falha:** o `codex` tenta `wss://api.openai.com/v1/responses`
  primeiro, toma erro atrás do proxy de saída e cai para HTTPS sozinho. As linhas `failed to
  connect to websocket` e `Falling back from WebSockets to HTTPS transport` no stderr são
  normais; o que importa é o resultado.

### Kimi

**O `export` faz parte do preflight, não da prosa.** Este bloco é a definição do provedor: sem
ele o `kimi` não tem modelo nenhum configurado e **toda** lente morre em ~3s. Copie o bloco
inteiro; não reconstitua as variáveis de memória.

```bash
# $OUT e a checagem de jq/timeout vêm do preflight do Codex, que roda primeiro.
command -v kimi >/dev/null 2>&1 || npm i -g @moonshot-ai/kimi-code@0.38.0 >/dev/null 2>&1
[ -n "${MOONSHOT_API_KEY:-}" ] || echo "SEM CHAVE"   # distingue chave ausente de chave ruim
                                                     # sem esperar os 120s do smoke

# Provedor sintetizado na hora. NAME e API_KEY são o mínimo viável; as outras três são
# opcionais — mas PROVIDER_TYPE, se você escrever, tem que ser exatamente `kimi`
# (nem `kimi-code`, nem `moonshot` — ver "A armadilha do provedor" abaixo).
export KIMI_MODEL_NAME=kimi-k3
export KIMI_MODEL_API_KEY="$MOONSHOT_API_KEY"
export KIMI_MODEL_PROVIDER_TYPE=kimi
export KIMI_MODEL_BASE_URL=https://api.moonshot.ai/v1
export KIMI_CODE_NO_AUTO_UPDATE=1 KIMI_DISABLE_TELEMETRY=1
export KIMI_CODE_HOME="$OUT/kimi-home"                     # fora do $HOME real e fora do $WT

# O perfil somente-leitura é a ÚNICA trava contra a lente escrever (o `kimi -p` escreve
# sem pedir). Ele é criado aqui, num heredoc executável — perfil que "existe no doc" mas
# não no disco faz o --agent-file falhar e a trava sumir.
cat > "$OUT/lente.md" <<'PERFIL'
---
name: lente
description: Lente de revisao adversarial, somente leitura.
tools: Read, Grep, Glob
---
Voce e uma lente de revisao. So le arquivos. Nunca edita, nunca commita, nunca propoe
patch aplicado. Nunca acessa rota de API de instancia nenhuma.
PERFIL

# Smoke test: exercita o CLI de verdade. Um 200 em /v1/models prova que a chave é boa,
# NÃO que o `kimi -p` completa um turno — e foi por confiar no curl que uma revisão
# inteira despachou lentes para um motor que não rodava.
smoke=$(KIMI_MODEL_THINKING_EFFORT=low timeout 120 kimi -p "responda apenas OK" \
  --output-format stream-json </dev/null 2>"$OUT/smoke.err"); rc=$?
echo "$smoke" | jq -e 'select(.role=="assistant" and .content != null and .content != "")' \
  >/dev/null 2>&1 && [ "$rc" = 0 ] && echo "KIMI OK" || { echo "KIMI FORA:"; head -4 "$OUT/smoke.err"; }
```

- **O smoke test usa a mesma guarda da colheita** — exit 0 **e** um `role=assistant` com
  `.content` — porque é a mesma pergunta ("este motor completa um turno?") feita uma vez, antes
  de decidir, em vez de lente a lente. Custa ~4s e uma fração de centavo, e substitui o `curl`
  que dava verde com o motor fora do ar. O do Codex tinha a versão mais branda do mesmo
  buraco — `codex login status` exercita o binário, mas não o modelo — e ganhou o seu smoke
  pela mesma razão.
- **A receita não usa `login`.** O `kimi-code` aceita `/login` e `config.toml` — a mensagem de erro dele cita
  os dois —, mas **esta receita não usa nenhum dos dois**: o provedor é sintetizado por
  variável de ambiente, sem device-code e sem arquivo de configuração. Instalar levou 14s num container limpo
  (Node ≥ 22.19 é requisito).
- **A versão é pinada em `0.38.0`.** `npm i -g` sem pin faz cada revisão pegar o que estiver
  publicado no dia; sobe versão nova sem ninguém decidir. Ao mover o pin, rode o smoke test
  antes de commitar.
- **A chave é `MOONSHOT_API_KEY`**, vinda do ambiente, e o console é `platform.kimi.ai` (o
  `platform.moonshot.ai` é outro host e pode estar fora da allowlist de saída — não é ele que
  serve a API).
- **O tier da conta limita a fan-out.** Recarga acumulada de $1 põe a conta em Tier0:
  **concorrência 1, 3 RPM** — dez lentes concorrentes morrem em `429` e o sintoma parece falha
  de motor. A partir de $10 (Tier1) são 50 concorrentes e 200 RPM. Medido no Tier2: 8 chamadas
  simultâneas, 8× 200, zero `429`.

#### A armadilha do provedor — o CLI morre com um erro que não é o erro

Duas configurações erradas derrubam o `kimi` com **a mesma exceção crua**, e ela não menciona
nem provedor nem modelo:

```
Error: Agent event 'agent.activity.updated' has no active lifecycle context
```

Sai como stack trace do Node no stderr, com `exit=1` e só a linha `system.version` no stdout.
Quem vê isso conclui "o CLI está quebrado em headless" — foi o que aconteceu numa revisão real.
Não está. Os dois gatilhos, ambos medidos:

| Configuração | Resultado |
|---|---|
| `KIMI_MODEL_PROVIDER_TYPE=moonshot` (ou qualquer valor inválido) | **crash de lifecycle** |
| `-m <alias>` com alias diferente do `KIMI_MODEL_NAME` | **crash de lifecycle** |
| `KIMI_MODEL_PROVIDER_TYPE=kimi` · `=openai` · **ausente** | funciona |
| sem `KIMI_MODEL_BASE_URL`, ou só `NAME` + `API_KEY` | funciona |

`moonshot` é o palpite natural — o host é `api.moonshot.ai`, o pacote é `@moonshot-ai/kimi-code`
— e é justamente o que quebra. O valor certo é **`kimi`**.

**Nunca passe `-m` ao `kimi`.** O provedor sintetizado registra **um** alias, o valor de
`KIMI_MODEL_NAME`; qualquer outro alias no `-m` não resolve e cai no mesmo crash — inclusive um
modelo Moonshot que existe de verdade, como `kimi-k2.6`. `-m` só "funciona" quando repete o
`KIMI_MODEL_NAME`, o que o torna inútil. **O eixo do modelo no Kimi é `KIMI_MODEL_NAME`**, e é
ele que a coluna *Kimi* da tabela de tier alimenta.

### O que cada resultado decide

| Codex | Kimi | Efeito |
|---|---|---|
| ok | ok | tabela de tier abaixo, cada lente no seu motor default |
| ok | falhou | **tudo em Codex**, pela coluna *Codex* da tabela |
| falhou | ok | **tudo em Kimi**, pela coluna *Kimi* da tabela |
| falhou | falhou | **motor nativo** para a revisão inteira (seção final) |

Não pergunte, não pare, não repita o preflight lente a lente: decidiu uma vez, vale para a
revisão inteira, e o motivo entra no anúncio do passo 2.1 e no quadro de execução da §7.

## Tier por papel

Uma lente, um comando, um tier. É o tier que faz o trabalho que num subagente nativo o modelo
faria. A coluna **Default** diz quem roda quando os dois motores estão de pé; as outras duas
são, ao mesmo tempo, o alvo do fallback cruzado daquela lente e o mapa de "um motor inteiro
caiu":

| Papel | Default | Codex | Kimi | Nativo |
|---|---|---|---|---|
| L1 varredura, L5 armadilhas de linguagem, S1 documentação, e a camada de contratos de PR **só de doc** | Codex | `gpt-6-luna` · medium | `kimi-k3` · low | `sonnet` |
| L2 comportamento removido, L3 rastreador, L4 concorrência, T1–T3, S2, S3, e a camada de contratos em geral | Codex | `gpt-5.6-terra` · medium | `kimi-k3` · high | `sonnet` |
| Contratos de framework sensível no **Profundo** (as faixas que a skill chamadora listou) | **Kimi** | `gpt-6-sol` · high | `kimi-k3` · high | `opus` |

A camada de contratos fica na linha do meio por padrão de propósito: a §4 manda cortar da camada
adversarial antes de cortar dela, então ela não é o lugar de economizar. A primeira linha só
quando o PR é doc puro; a terceira só nas faixas em que contrato perdido custa caro.

**O eixo de esforço não é o mesmo nos dois.** Codex aceita `low|medium|high`
(`-c model_reasoning_effort=`); Kimi aceita `low|high|max` (`KIMI_MODEL_THINKING_EFFORT`), sempre
pensa e assume `max` se ninguém disser nada — **fixe sempre o valor**, porque o default caro
infla o output, que é o lado de $15/M. A tabela acima já traz o par por linha; ao cruzar de
motor, use o valor da coluna de destino, nunca o da origem.

**O eixo do modelo também não.** No Codex o tier é o argumento `-m` do `codex exec review`. No
Kimi **não existe argumento**: o tier alimenta `KIMI_MODEL_NAME`, e passar `-m` derruba o CLI
(ver *A armadilha do provedor*). A coluna *Kimi* da tabela nomeia `kimi-k3` porque é o valor
dessa variável, não porque é uma flag.

> **A linha sensível desceu de `max` para `high`, e a aferição está feita.** No piloto do PR #2608
> as duas lentes em `max` foram as mais lentas (526s e 587s) e devolveram os achados mais fracos;
> os dois bloqueantes vieram de lentes em `high`. O padrão se repetiu no PR #3043, com o custo
> chegando ao limite: a lente de contrato em `max` fez 642s, 548s e 881s — o teto é 900s — e em
> `high` ainda **estourou** (903s, `exit=124`, sem saída), obrigando o re-despacho no motor
> cruzado. Lá o `gpt-5.6-sol` · high fechou o mesmo alvo em 508s e 283s, com os achados que
> valeram a rodada. `max` não estava comprando profundidade: estava comprando relógio e risco de
> timeout, e o timeout custa a lente inteira mais o re-despacho.

## A árvore que o motor lê — passo obrigatório, e o mais fácil de esquecer

**O motor revisa a árvore que está checada, não o PR que você digitou.** A sessão quase nunca
está na branch do PR. Sem corrigir isso, as lentes revisam um diff **vazio** e voltam
**limpas**, indistinguíveis de revisão de verdade. É o pior modo de falha desta cadeia, e ele
não dispara nenhuma das defesas da seção "Falha é falha".

```bash
git rev-parse HEAD                      # o que a sessão tem checado
git rev-parse origin/<branch-do-pr>     # o que o PR é
```

Iguais, use a própria árvore. Diferentes, monte worktree do head do PR e aponte **todas** as
lentes para lá:

```bash
BASE=<merge-base do passo 2 da skill>          # nunca o nome da branch
WT=<scratchpad da sessão>/wt-<n do PR>         # a variável nasce aqui, não na prosa
git worktree add --detach "$WT" origin/<branch-do-pr>
git -C "$WT" rev-parse HEAD                     # tem que bater com o head do PR

# O Kimi não tem Bash e não monta o diff sozinho: ele é pré-gerado aqui e entregue por
# leitura. Sem esta linha o briefing aponta para um arquivo que não existe.
git -C "$WT" diff "$BASE"...HEAD > "$OUT/DIFF.patch"

rm -rf "$WT/.kimi-code/agents" "$WT/.agents/agents"   # override de agente vindo do repo
```

Confira o commit **antes** de despachar qualquer coisa — worktree no commit errado é a mesma
revisão vazia com outra roupa. Ao terminar, `git worktree remove "$WT" --force`.

**No modo ciclo (§ 8.5 da skill), monte a árvore na branch do PR em vez de `--detach`.** As
lentes leem igual — o que o motor exige é que a árvore esteja no head do PR, não que ela esteja
destacada —, e o conserto que vem depois precisa commitar. Árvore destacada aqui obriga a montar
uma segunda lá, e aí a revisão olha uma e o conserto escreve na outra. A receita da árvore na
branch está no motor de correção, § Portões.

**Clone dedicado dispensa worktree.** PR de app mora em repositório próprio, e a sessão
geralmente não tem clone dele; um clone feito agora, só para esta revisão, já está na branch
certa. A regra do worktree existe para não trocar a branch de uma árvore que a sessão usa para
outra coisa — clone novo não tem esse problema.

## O briefing viaja sozinho

**Nada do `CLAUDE.md`, da skill ou dos docs entra no prompt do motor** — só o preâmbulo de
escopo e o focus text da lente. Tudo que a lente precisa saber tem que estar escrito no
briefing dela.

**Mas o briefing não viaja tão sozinho quanto esta seção já afirmou.** A versão anterior dizia
que os dois motores procuram `AGENTS.md` e que "estes repositórios não têm" — **o monorepo tem
`AGENTS.md` na raiz**, e ele manda ler o `CLAUDE.md` inteiro. Os dois motores o injetam como
dado de referência. Isso não é catástrofe (contexto de repo ajuda a lente), mas invalida a
premissa: o que o briefing carrega é o **piso** do que a lente sabe, nunca o teto.

**Do lado do Kimi há um vetor pior, e ele é do repositório revisado.** Um arquivo
`.kimi-code/agents/agent.md` (ou `.agents/agents/agent.md`) com `override: true` **substitui o
system prompt inteiro do agente**, e num PR de app o repositório sob revisão é de terceiro: o
PR sequestraria o próprio revisor. Antes de despachar qualquer lente em Kimi, apague os dois
caminhos do worktree:

```bash
rm -rf "$WT/.kimi-code/agents" "$WT/.agents/agents"
```

É remoção na árvore descartável da revisão, nunca commit. Ausência dos diretórios é o estado
normal — o comando é idempotente e não falha quando não há nada.

Todo briefing carrega, além da lente ou do framework:

- Para a camada de contratos: **o caminho do doc na superfície que a skill definiu, a ordem de
  ler o doc por inteiro, e a de listar as asserções verificáveis antes de abrir qualquer
  código** — é isso que impede o motor de apenas concordar com o que o PR afirma.
- **A citação literal do contrato dentro do corpo do achado.** A §7 exige citação literal em
  todo achado; sem essa frase, o relatório volta parafraseado.
- **Não tocar rota de API de instância nenhuma** — nem produção, nem homologação, nem local,
  nem "só um GET". Cravada, porque o `CLAUDE.md` não viaja no prompt do motor.
- **Não editar arquivo, não commitar, não propor patch aplicado.** O sandbox já proíbe, mas a
  frase evita relatório escrito como se fosse aplicar.
- **Não rodar build, teste, lint nem instalação.** Nada de `pnpm`, `npm`, `node --test`, `tsc`.
  A lente lê: `git`, `rg`/`grep`, `sed`, `cat`. **Cravada, e é a que mais paga.** O `codex exec
  review` tem shell e acha natural rodar a suíte para "conferir" — e aí gasta o orçamento de tempo
  dela ali e morre no `timeout` **sem entregar achado nenhum**, com stderr vazio, num sintoma que
  imita motor fora do ar. Medido: a mesma lente de contrato, no mesmo PR, estourou os 900s enquanto
  rodava `test:rapido` e fechou em **508s** depois que esta frase entrou no briefing. O Kimi não
  tem `Bash` no perfil e não consegue nem tentar — a frase existe pelo Codex e por qualquer motor
  futuro com shell.
- **Limite rígido de 350 a 450 palavras.** Só achados materiais, com arquivo e linha; nada de
  estilo, preferência, nem código que o diff não toca. O que passou vira **uma** linha no fim.

Lente de contrato que não achou o doc é **não executada**, nunca aprovada.

## O comando — Codex

`-s read-only` e `-C` são opções do `codex exec` e vão **antes** do subcomando `review`;
`--json`, `-m` e o briefing vão **depois**. Trocar a ordem dá `unexpected argument`.

```bash
codex exec -s read-only -C "$WT" --ephemeral -c model_reasoning_effort=<esforço> \
  review --json -m <tier> "<briefing>" </dev/null > "$OUT/<id>.jsonl" 2> "$OUT/<id>.err"
```

- **`--base` e o briefing são mutuamente exclusivos.** O `review` recusa os dois juntos
  (`--base cannot be used with [PROMPT]`), e briefing é o que faz a lente ser uma lente. Então
  **o escopo vai cravado no texto do briefing**, com o merge-base literal — o Codex monta o
  diff de três pontos sozinho a partir dali (verificado: as lentes rodam
  `git diff <merge-base>...HEAD` por conta própria).
- **O esforço é controlável e honrado:** `-c model_reasoning_effort=<low|medium|high>`.
- **`-s read-only` sempre.** O `review` já não aceita escrita, mas a §8 não depende de o motor
  obedecer.
- **`--ephemeral`** para não acumular arquivo de sessão.
- **`</dev/null` não é enfeite:** sem ele o `codex` fica lendo stdin e a lente trava.

## O comando — Kimi

O `kimi` não tem subcomando de revisão nem sandbox de sistema operacional. **Três diferenças
mudam o comando inteiro, e cada uma já falhou:**

```bash
cd "$WT" || return 1                       # não existe -C: a lente lê o cwd
# As KIMI_MODEL_* já vêm exportadas do preflight. Aqui só variam o esforço e — quando a
# lente muda de tier — o KIMI_MODEL_NAME. Nunca use -m: ver "A armadilha do provedor".
KIMI_MODEL_NAME=<modelo do tier> KIMI_MODEL_THINKING_EFFORT=<esforço> timeout 900 kimi \
  --agent-file "$OUT/lente.md" --add-dir "$OUT" \
  -p "<briefing>" --output-format stream-json </dev/null \
  > "$OUT/<id>.jsonl" 2> "$OUT/<id>.err"
```

- **Não existe modo leitura em headless.** `--plan` recusa: `error: Cannot combine --prompt
  with --plan`. E, sem `--yolo`, o `kimi -p` **não trava esperando aprovação — ele escreve**
  (medido: criou o arquivo pedido). A trava é o `--agent-file` com allowlist de ferramentas,
  que a documentação descreve como reimposta antes da execução, e que foi verificada: com
  `tools: Read, Grep, Glob` o agente não criou o arquivo, só imprimiu o comando que teria
  rodado. **O `--agent-file` é obrigatório, não opcional.** O perfil é este:

  O arquivo é criado pelo heredoc do preflight, acima — não o reescreva à mão aqui. Perfil
  que existe no doc mas não no disco faz o `--agent-file` falhar e a trava sumir junto.

  Os nomes das ferramentas casam **exato e com maiúscula** (`Read`, não `read`); nome
  inexistente vira aviso e não bloqueia nada. Note o que a lista **exclui** de propósito além
  de `Write`/`Edit`: `Bash`, `FetchURL` e `Agent`.
- **Sem `Bash`, a lente não monta o diff.** O Codex roda `git diff <merge-base>...HEAD` por
  conta própria; o Kimi não pode. Então **pré-gere o diff** e entregue por leitura:
  `git -C "$WT" diff "$BASE"...HEAD > "$OUT/DIFF.patch"`, com `--add-dir "$OUT"` dando acesso
  a ele, e o briefing mandando ler esse arquivo primeiro. Funcionou bem no piloto e é mais
  barato que deixar cada lente remontar o diff.
- **Não existe `--ephemeral`.** Para não sujar o `$HOME` real, aponte `KIMI_CODE_HOME` para o
  scratchpad da sessão. Some junto `KIMI_CODE_NO_AUTO_UPDATE=1` e `KIMI_DISABLE_TELEMETRY=1`.
- **`$OUT` fica fora de `$WT`, sempre.** Escrever o JSONL dentro da árvore revisada faz a
  própria lente listar `<id>.jsonl` como arquivo do projeto — aconteceu no teste.
- **`</dev/null` vale igual**, pelo mesmo motivo do Codex.

## A fan-out — Bash em background, sem subagente

**Não use subagente de invólucro.** O `&`/`wait` do próprio Bash dá paralelismo de verdade:
medido, 10 lentes concorrentes fecharam em 43 s contra 362 s somados, todas com exit 0, num
container de 4 CPUs e 16 GB. Um invólucro por lente só somaria latência, tokens e uma camada a
mais capaz de inventar resultado.

O que um invólucro existiria para resolver — manter o payload fora do seu contexto —
resolve-se melhor **escrevendo em arquivo e extraindo com `jq`**: numa revisão real de 9 lentes
o JSONL cru somou 1,8 MB e o que entrou no contexto do orquestrador foram 3,5 KB. Você nunca lê
o cru.

Dispare o lote inteiro numa chamada Bash só:

```bash
# $OUT, $WT, $OUT/lente.md e $OUT/DIFF.patch já vêm do preflight e da seção da árvore.
# Limpe SÓ a saída das lentes: `rm -f "$OUT"/*` apagaria o perfil somente-leitura e o
# diff, e a fan-out seguinte rodaria sem trava e apontando para um arquivo inexistente.
rm -f "$OUT"/*.jsonl "$OUT"/*.err "$OUT"/execucao.txt

COMUM='<as regras fixas do briefing — ver "O briefing viaja sozinho">'

ESCOPO="ESCOPO OBRIGATÓRIO: revise exclusivamente o diff deste PR (merge-base ${BASE}). Não comente código que esse diff não toque.
Não edite arquivo, não commite, não proponha patch aplicado. Não acesse rota de API de instância nenhuma — nem produção, nem homologação, nem local, nem \"só um GET\".
PROIBIDO RODAR BUILD, TESTE, LINT OU INSTALAÇÃO. Nada de \`pnpm\`, \`npm\`, \`node --test\`, \`tsc\`. Esta lente é de LEITURA: use apenas \`git\`, \`rg\`/\`grep\`, \`sed\`, \`cat\`. Rodar a suíte estoura o tempo e a lente morre sem entregar nada.
Responda em português."

lente() {  # lente <id> <motor> <tier|modelo> <esforço> <briefing>
  local id=$1 motor=$2 tier=$3 esf=$4 brief=$5
  local ini=$(date +%s) rc=0
  if [ "$motor" = codex ]; then
    timeout 900 codex exec -s read-only -C "$WT" --ephemeral -c model_reasoning_effort="$esf" \
      review --json -m "$tier" "$ESCOPO

${brief}

${COMUM}" </dev/null > "$OUT/$id.jsonl" 2> "$OUT/$id.err" || rc=$?
  else
    # $tier alimenta KIMI_MODEL_NAME — no Kimi o modelo NÃO vem por -m (que derruba o CLI).
    ( cd "$WT" && KIMI_MODEL_NAME="$tier" KIMI_MODEL_THINKING_EFFORT="$esf" timeout 900 kimi \
        --agent-file "$OUT/lente.md" --add-dir "$OUT" --output-format stream-json \
        -p "$ESCOPO
O diff completo está em $OUT/DIFF.patch — leia esse arquivo primeiro. A árvore do PR é o diretório atual.

${brief}

${COMUM}" </dev/null ) > "$OUT/$id.jsonl" 2> "$OUT/$id.err" || rc=$?
  fi
  echo "$id exit=$rc motor=$motor tier=$tier esforco=$esf dur=$(( $(date +%s) - ini ))s" >> "$OUT/execucao.txt"
}

lente L2 codex gpt-5.6-terra medium "<briefing da L2>" &
lente T1 kimi  kimi-k3       high   "<briefing da T1>" &
# … uma linha por lente do orçamento do passo 2.1
wait
cat "$OUT/execucao.txt"
```

O `execucao.txt` é o que alimenta o quadro de execução da §7 — motor, tier, esforço e duração
**medidos**, não estimados.

**Os dois motores dividem o mesmo lote paralelo**, sem barreira entre eles: são provedores
diferentes, com limites de concorrência independentes, então misturar não estreita nada.

> **Proveniência das medições do Kimi, e a lição que ela deixou.** O "11 lentes concorrentes em
> 11m28s de relógio contra 62 min somados, 11/11 com exit 0" é real, mas foi medido num script
> de piloto que **exportava as `KIMI_MODEL_*`** — e esse `export` não estava em bloco nenhum
> deste arquivo, só na prosa. Quem seguiu os blocos ao pé da letra, que é o que a skill manda,
> despachou lentes sem provedor configurado e perdeu as duas de contrato numa revisão real
> (`apps-gestao#380`, rodada 3). A tabela de induções de falha da §*A guarda tem teste* foi
> medida na mesma condição. **Prosa não é executável:** o que a lente precisa para rodar mora no
> bloco, ou não existe.

## A colheita — e a guarda que impede falha virar laudo limpo

**Os dois motores falham de jeitos diferentes, e nenhum dos dois falha alto.** Cada um precisa
da sua guarda; usar a do outro é o mesmo laudo limpo falso com outra roupa.

- **Codex:** turno que falha **AINDA emite um `agent_message`** dizendo *"Review was
  interrupted. Please re-run /review and wait for it to complete."* Lido sem guarda, isso vira
  relatório de zero achados. A guarda testa `turn.failed`/`error` **antes** de olhar a mensagem.
- **Kimi:** **não existe `turn.failed`, não existe `item.completed`, não existe "Review was
  interrupted"** — o schema do `stream-json` não parece em nada com o do Codex. O que existe é
  uma linha por mensagem (`{"role":"assistant","tool_calls":[…]}`, `{"role":"tool",…}`,
  `{"role":"assistant","content":"<a resposta>"}`) mais dois `role:"meta"`. A resposta é o
  **último `role=assistant` com `.content` não-nulo**; o sinal de falha é exit ≠ 0 ou ausência
  dessa linha. Falha interna sai como `INTERNAL_ERROR` no stderr.

**Colha pela lista de lentes que você despachou, nunca pelos arquivos que existem.** Um
`for f in "$OUT"/*.jsonl` parece equivalente e não é: a lente cujo processo morreu **antes** do
redirecionamento não deixa arquivo nenhum, e some do relatório em vez de aparecer como falha —
o modo de falha que a §7 chama de pior que a falha. `LENTES` é o mesmo roster do orçamento do
passo 2.1.

```bash
LENTES="L1 L2 L5 T3 T4 S1 S2 S3 contratos_ui contratos_migracoes"   # o roster do passo 2.1

for id in $LENTES; do
  f="$OUT/$id.jsonl"
  motor=$(grep -o "^$id .*motor=[a-z]*" "$OUT/execucao.txt" 2>/dev/null | sed 's/.*motor=//')
  rc=$(grep -o "^$id exit=[0-9]*" "$OUT/execucao.txt" 2>/dev/null | sed 's/.*=//')
  if [ ! -s "$f" ] || [ -z "$motor" ]; then
    echo "### $id — NÃO EXECUTADA (sem saída: o processo da lente não chegou a escrever)"
    echo; continue
  fi
  if [ "$motor" = codex ]; then
    falha=$(jq -rc 'select(.type=="turn.failed" or .type=="error") | .type' "$f" 2>/dev/null | head -1)
    texto=$(jq -r 'select(.type=="item.completed" and .item.type=="agent_message") | .item.text' "$f" 2>/dev/null | tail -c 8000)
    printf '%s' "$texto" | grep -qi 'Review was interrupted' && falha=interrompida
  else
    falha=""
    texto=$(jq -r 'select(.role=="assistant" and .content != null and .content != "") | .content' "$f" 2>/dev/null | tail -c 8000)
  fi
  if [ -n "$falha" ] || [ "${rc:-1}" != "0" ] || [ -z "$texto" ]; then
    echo "### $id — NÃO EXECUTADA (motor $motor · ${falha:-exit=${rc:-?}, saída vazia})"
    jq -r 'select(.type=="turn.failed" or .type=="error") | (.error.message // .message)' "$f" 2>/dev/null | head -c 400
    # A linha de diagnóstico vem no TOPO de um stack trace e no fim de um erro de uma linha.
    # `tail -2` sozinho devolve o rodapé do stack ("at Module._compile...") e perde o motivo.
    ruido='websocket|Reconnecting|bubblewrap|Falling back|resuming'
    { grep -viE "$ruido" "$OUT/$id.err" 2>/dev/null | grep -iE '^\s*(error|Error):|failed to run prompt' | head -2
      grep -viE "$ruido" "$OUT/$id.err" 2>/dev/null | tail -2; } | awk '!vista[$0]++' | head -3
  else
    echo "### $id  (motor $motor)"; printf '%s\n' "$texto"
  fi
  echo
done
```

**O formato do que volta também difere, e é a skill que tem que impor o do Kimi.** O Codex
devolve markdown padronizado pelo próprio `review`: uma linha de resumo, `Full review
comments:`, e um item por achado — `- [P1] <título> — <caminho absoluto>:<linha inicial>-<linha
final>` com o corpo indentado. Sem achado, o bloco simplesmente não aparece. O Kimi não tem
formato nenhum: o **briefing** carrega o contrato de saída, que é o mesmo do motor nativo
(`VEREDITO` / `RESUMO` / `ACHADO` / `CITACAO` / `CORPO`, ver a seção final).

Os caminhos do Codex vêm **absolutos**, apontando para dentro do worktree — **relativize para a
raiz do repo antes de citar no PR**, porque a árvore da revisão não existe para quem lê.

## Falha é falha, nunca "passou"

Contam como **lente não executada**: `turn.failed`, evento `error`, "Review was interrupted",
ausência de `role=assistant` com `.content`, saída vazia, exit diferente de zero, `timeout`
estourado, payload inválido.

A escada tem três degraus, e **cada troca é declarada**:

1. **Re-despache uma vez, no mesmo motor.** Falha isolada costuma ser transitória.
2. **Persistindo numa lente só → troque de motor**, para a coluna cruzada da tabela de tier
   (default Codex cai em Kimi; default Kimi cai em Codex), com o esforço da coluna de destino.
   Re-despache uma vez lá. Falhou de novo, ela entra no comentário do PR como **não executada**,
   com os dois motivos.
3. **Persistindo em bloco — todas as lentes daquele motor falhando igual** — isso é o motor
   caindo no meio. Refaça o preflight **daquele motor** uma vez; não voltou, **mova todas as
   lentes dele para o outro motor** e siga. Os dois fora → termine no motor nativo.

O relatório diz quais lentes trocaram de motor e por quê. **Fallback silencioso é laudo limpo
falso com outro nome** — e agora existem dois caminhos de silêncio, não um.

Uma lente não executada **nunca** vira linha do "o que foi confrontado e passou" da §7. Esse é
o único jeito de a ausência de resultado virar ausência visível, em vez de laudo limpo falso.

### A guarda tem teste, e o teste roda o código deste arquivo

`pnpm test:motor-colheita` extrai o bloco bash da seção *A colheita* **daqui** e roda contra 13
fixturas — não reimplementa nada, para que uma cópia não divirja em silêncio, que é o modo de
falha que a própria guarda combate.

As fixturas de falha não são inventadas: cada uma reproduz uma forma **observada** rodando os
CLIs de verdade. As do Kimi, medidas:

| Indução | exit | stdout | stderr |
|---|---|---|---|
| chave inválida | 1 | só a linha `system.version` | `provider.auth_error: 401 Invalid Authentication` |
| modelo inexistente | 1 | só a linha `system.version` | `provider.api_error: 404 Not found the model` |
| `timeout` no meio | 124 | corta no meio de uma linha JSON | **vazio** |
| **sem as `KIMI_MODEL_*`** | 1 | só a linha `system.version` | `failed to run prompt: No model configured` |
| **`PROVIDER_TYPE` inválido, ou `-m`** | 1 | só a linha `system.version` | stack trace do Node; a linha útil (`Error: Agent event … lifecycle context`) fica no **topo** |

As duas últimas são as que uma revisão real encontrou, e ambas nascem do mesmo defeito deste
arquivo: variável nomeada em prosa, sem valor e fora do bloco. A colheita já as pegava (exit 1 +
texto vazio); quem não pegava era o preflight.

O caso que mais importa é o quinto da tabela do teste: **turno cortado depois de já ter escrito
um `content` válido**. O texto não é vazio e o stderr é vazio — a única coisa entre isso e um
laudo limpo é o `exit != 0`. Por isso a checagem de exit não é redundante com a de texto, e
remover qualquer uma das duas deixa o teste vermelho.

Se você mudar a colheita, rode o teste. Se ele ficar verde de primeira, quebre uma guarda de
propósito e confirme que fica vermelho — foi assim que as cinco atuais foram validadas.

## Motor nativo — o fallback do fallback

Vale só quando **os dois** motores externos falharam no preflight, ou quando os dois caíram em
bloco no meio da revisão. Não é mais o primeiro fallback de nada: lente que perde o motor
default tenta o motor cruzado antes de chegar aqui. Mesmas lentes, mesmos briefings, mesmo
orçamento: muda o veículo.

- **Subagente por lente**, todos numa mensagem só, `subagent_type: "general-purpose"`.
- **`model` explícito, sempre** — pela coluna *Nativo* da tabela de tier. Sem o parâmetro o
  subagente herda o modelo do orquestrador, que é o caro, e a fan-out multiplica isso por
  lente e por rodada. `haiku` **nunca** numa lente: lente caça defeito sem diagnóstico nenhum.
  **Nunca `fable` num subagente** — tarefa delimitada não é assento dele.
- **Texto livre em formato fixo, nunca saída estruturada** (`StructuredOutput`/`schema` falha
  100% das vezes nesta instalação — ver `CLAUDE.md`):

  ```text
  LENTE: <id>            MOTOR: nativo/<modelo>    DURACAO: <s>
  VEREDITO: sem-achado | precisa-atencao | NAO_EXECUTADA
  RESUMO: <uma linha>
  --- por achado:
  ACHADO: <severidade> | <arquivo>:<linha> | <título>
  CITACAO: "<a citação literal>"
  CORPO: <2 a 3 frases>
  ```

- **A instrução mais importante continua sendo a de não inventar:** sem material para concluir,
  `NAO_EXECUTADA` e o motivo cru. Subagente que "resume o que provavelmente teria sido achado"
  transforma falha em laudo.
- O quadro de execução da §7 mostra `nativo` na coluna Motor, e o anúncio do passo 2.1 diz que
  **nenhum dos dois** motores externos estava disponível — com o motivo de cada um. Fallback
  silencioso é o mesmo laudo limpo falso com outro nome.

**Este bloco de formato é o mesmo que o briefing do Kimi impõe** (ver "A colheita"), e não é
coincidência: quando a lente cai de Kimi para nativo, ou o contrário, o texto que volta tem que
ser comparável sem retrabalho.

## Como o relatório declara o motor

O quadro de execução da §7 ganha um valor por lente na coluna *Motor*, e a troca fica visível:

| Valor | Significa |
|---|---|
| `Codex` / `Kimi` | rodou no motor default daquela linha da tabela de tier |
| `Kimi→Codex` / `Codex→Kimi` | o default falhou, o cruzado entregou |
| `nativo` | os dois externos indisponíveis |
| `não executada` | esgotou a escada; o motivo vai junto |

A linha de anúncio do passo 2.1 diz a composição da rodada, não um motor só — por exemplo
`motor Codex+Kimi`, ou `motor Codex (Kimi indisponível: sem MOONSHOT_API_KEY)`.

## O que nunca sai daqui

Ficam com você, no modelo da sessão, sempre: a triagem (§1), a calibração (§2.1), a
**verificação de todo achado bloqueante e a reconferência da citação no arquivo** (§9), a
deduplicação, a síntese e a postagem. O motor produz evidência; **veredito é seu**.
