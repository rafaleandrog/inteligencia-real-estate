#!/bin/bash
# Preparação de sessão de nuvem — roda como SessionStart hook (.claude/settings.json).
#
# Por que aqui e não no setup script do ambiente: o setup script roda ANTES do
# clone do repositório, com cwd em /home/user, e qualquer `pnpm install` lá
# morre com ERR_PNPM_NO_PKG_MANIFEST. Pior: as variáveis do ambiente (entre
# elas a URBIVERSO_PACKAGES_TOKEN) só entram no processo a partir da SESSÃO —
# um setup script que as lesse veria vazio. O que depende do repositório e do
# token é do hook.
#
# Contrato do hook: nunca derrubar a sessão. Sai 0 em qualquer cenário.
set -uo pipefail

# Sessão local (notebook, clone na máquina de alguém) instala à mão.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

RAIZ="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$RAIZ" || exit 0

# O `.npmrc` versionado já lê ${URBIVERSO_PACKAGES_TOKEN} do ambiente — não há
# nada a materializar. O que falta descobrir cedo é a AUSÊNCIA do token, cujo
# sintoma sem este aviso é um 401 do registro no meio do trabalho, que parece
# permissão faltando na organização e não variável não cadastrada.
if [ -z "${URBIVERSO_PACKAGES_TOKEN:-}" ]; then
  echo "AVISO: URBIVERSO_PACKAGES_TOKEN ausente no ambiente desta sessão."
  echo "       Sem ela o @urbiverso/sdk não baixa e nada builda. Cadastre-a nas"
  echo "       configurações do ambiente (Environment variables) e reabra a sessão."
  exit 0
fi

LOG="$(mktemp -t preparar-sessao.XXXXXX.log)"

if pnpm install --prefer-offline >"$LOG" 2>&1; then
  echo "sessão preparada: dependências instaladas (pnpm install)"
else
  echo "AVISO: pnpm install falhou — build e empacotamento vão quebrar até rodar à mão."
  echo "       Log: $LOG"
  tail -20 "$LOG"
fi

# ── Kit atrasado ──────────────────────────────────────────────────────────
# Nada neste repositório muda sozinho quando sai kit novo: o `npx` só atualiza
# quando alguém o roda, e ninguém roda o que não sabe que existe. Sem este
# aviso, um repositório fica na versão da instalação para sempre.
#
# A saída deste hook só o AGENTE vê — o usuário não tem outro canal. Medido em
# 2026-09-21: o aviso chegou ao contexto e o agente o tratou como informação,
# só o mencionando quando perguntado. Por isso o texto fala com o agente e
# manda agir na primeira resposta; o KIT.md repete a regra. Aviso que depende
# de alguém decidir relê-lo não é aviso.
#
# A comparação é com o REGISTRO, e não com o major do `@urbiverso/sdk`
# instalado, que é o proxy tentador. Ele falha nos dois sentidos: o 71.0.0 saiu
# quebrado e o conserto foi o 71.0.4 — mesmo nível de SDK, e um cheque por
# major deixaria quem ficou parado no defeito sem aviso nenhum; e quando o SDK
# anda na frente do kit, avisar não adianta, porque o kit correspondente ainda
# não existe. O registro responde a pergunta que importa: há conserto à mão?
if [ -f KIT.md ]; then
  # `timeout` para que registro lento não segure a abertura da sessão; se a
  # coreutils não o tiver, roda sem ele em vez de pular o cheque.
  LIMITE=""
  command -v timeout >/dev/null 2>&1 && LIMITE="timeout 10"
  INSTALADO="$(sed -n 's/^Kit `\{0,1\}\([0-9][0-9.]*\)`\{0,1\} .*/\1/p' KIT.md | head -1)"
  PUBLICADO="$($LIMITE npm view @urbiverso/kit-apps version 2>/dev/null | tr -d '[:space:]')"
  # O que voltou só entra na comparação se TIVER CARA DE VERSÃO. Sem isto,
  # qualquer ruído no stdout do `npm` vira "a versão publicada" e o `sort -V`
  # compara feliz: o cliente lê "71.0.4 instalado, npmERR!404 publicado" e vai
  # atrás de um conserto que não existe. Registro mudo é silêncio, não alarme.
  case "$PUBLICADO" in
    [0-9]*.[0-9]*.[0-9]*) ;;
    *) PUBLICADO="" ;;
  esac
  # `sort -V` em vez de `!=`: quem aplica o kit do monorepo (aplicar-kit.mjs)
  # carimba versão ainda não publicada, e igualdade alarmaria falso ali.
  if [ -n "$INSTALADO" ] && [ -n "$PUBLICADO" ] &&
    [ "$(printf '%s\n%s\n' "$INSTALADO" "$PUBLICADO" | sort -V | tail -1)" != "$INSTALADO" ]; then
    echo "AVISO: kit $INSTALADO instalado, $PUBLICADO publicado."
    echo "       AGENTE: isto é ordem, não informação. Na PRIMEIRA resposta, antes do pedido do"
    echo "       usuário: avise-o, rode 'npx @urbiverso/kit-apps' na raiz e commite o resultado"
    echo "       num commit só do kit. Não espere ser perguntado. Regra: KIT.md."
  fi
fi

# ── Pin do SDK atrasado ───────────────────────────────────────────────────
# O `@urbiverso/sdk` entra em versão EXATA no catálogo, e é assim de propósito:
# o major dele é o nível de SDK, e o `sdk_min` do manifesto tem que casar com o
# que está instalado. O efeito colateral é que o número congela — nada neste
# repositório o compara com o registro, e o cheque acima vigia o KIT.md, não o
# SDK. Medido em 2026-09-17: um repo nosso estava em `37.0.0` com o publicado em
# `71.0.0`, trinta e quatro níveis atrás, e quem escrevia app ali trabalhava
# contra um contrato velho sem nenhum sinal disso. Subir foi mecânico.
#
# Aviso, não porta: subir o pin é decisão de quem mantém o repositório — mexe
# nos pisos dos manifestos e pede release nova.
if [ -f pnpm-workspace.yaml ]; then
  LIMITE_SDK=""
  command -v timeout >/dev/null 2>&1 && LIMITE_SDK="timeout 10"
  # Aspas opcionais na chave E no valor: o catálogo que este kit instala escreve
  # `'@urbiverso/sdk': '79.0.0'`, e uma regex que exigia dígito logo depois dos
  # dois-pontos devolvia vazio — o aviso ficou mudo justo no arquivo do próprio kit.
  SDK_PIN="$(sed -n "s/^[[:space:]]*[\"']\{0,1\}@urbiverso\/sdk[\"']\{0,1\}:[[:space:]]*[\"']\{0,1\}\([0-9][0-9.]*\).*/\1/p" pnpm-workspace.yaml | head -1)"
  SDK_PUB="$($LIMITE_SDK npm view @urbiverso/sdk version 2>/dev/null | tr -d '[:space:]')"
  case "$SDK_PUB" in
    [0-9]*.[0-9]*.[0-9]*) ;;
    *) SDK_PUB="" ;;
  esac
  if [ -n "$SDK_PIN" ] && [ -n "$SDK_PUB" ] &&
    [ "$(printf '%s\n%s\n' "$SDK_PIN" "$SDK_PUB" | sort -V | tail -1)" != "$SDK_PIN" ]; then
    echo "AVISO: @urbiverso/sdk $SDK_PIN no catálogo, $SDK_PUB publicado."
    echo "       Subir: o pin em pnpm-workspace.yaml, e os pisos dos manifestos junto."
  fi
fi

exit 0
