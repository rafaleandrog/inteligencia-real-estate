#!/bin/bash
# Preflight da credencial do registry — chamado por release.yml e ci.yml ANTES de
# instalar dependências. Do kit: reescrito a cada `npx @urbiverso/kit-apps`.
#
# Sem ele, um secret ausente ou vencido só aparece como erro do pnpm no meio do
# log de instalação — `ERR_PNPM_FETCH_403` num endereço de download, que não diz
# nada a quem não é desenvolvedor e não distingue os três casos possíveis.
#
# A conferência é uma chamada ao METADADO do pacote (não o tarball), e é ela que
# separa os três: secret que não existe, secret que não autentica, e secret que
# autentica sem alcançar o pacote. Cada um tem conserto diferente, e adivinhar
# errado custa mais uma rodada.
#
# Lê URBIVERSO_PACKAGES_TOKEN do ambiente — os workflows a definem no nível do
# job, a partir do secret de mesmo nome. `curl` sem `-f`: queremos LER o status,
# não que ele vire exit code.
set -u

ONDE="Settings → Secrets and variables → Actions → New repository secret"
TOKEN="${URBIVERSO_PACKAGES_TOKEN:-}"

if [ -z "${TOKEN}" ]; then
  echo "::error::O secret URBIVERSO_PACKAGES_TOKEN não existe neste repositório."
  echo "Cadastre-o em: ${ONDE}, com o nome exatamente URBIVERSO_PACKAGES_TOKEN."
  echo "É o mesmo token da sua empresa que você já usa para trabalhar aqui — mas ele"
  echo "precisa ser cadastrado NOS DOIS lugares: como variável de ambiente (para o"
  echo "trabalho do dia a dia) e como secret de repositório (para este workflow)."
  echo "Configurar só a variável faz o trabalho local funcionar e o release falhar."
  echo "Detalhes no KIT.md, seção 'O kit, e como instalar ou atualizar'."
  exit 1
fi

STATUS="$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Accept: application/vnd.npm.install-v1+json' \
  'https://npm.pkg.github.com/@urbiverso%2Fsdk' || echo 000)"

case "${STATUS}" in
  200)
    echo "credencial ok — o registry respondeu 200 para o metadado do @urbiverso/sdk" ;;
  401)
    echo "::error::O secret URBIVERSO_PACKAGES_TOKEN existe, mas o registry não o aceitou (401)."
    echo "O token não autenticou. As duas causas, em ordem de frequência:"
    echo "  1. É um PAT fine-grained. O registry do GitHub Packages só aceita PAT CLASSIC —"
    echo "     um fine-grained falha com 401 mesmo com todas as permissões marcadas."
    echo "  2. O token expirou ou foi revogado."
    echo "Nos dois casos o conserto é o mesmo: gere um PAT classic novo com o escopo"
    echo "read:packages e atualize o secret em ${ONDE}."
    exit 1 ;;
  403|404)
    echo "::error::O secret URBIVERSO_PACKAGES_TOKEN autenticou, mas não alcança o @urbiverso/sdk (${STATUS})."
    echo "Isto NÃO é pacote inexistente — é acesso. O token é válido e o registry o recusou."
    echo "As duas causas:"
    echo "  1. Falta o escopo read:packages no PAT."
    echo "  2. O convite de acesso ao pacote ainda não foi aceito pela conta dona do token."
    echo "Fale com o seu contato no urbiverso se não souber qual dos dois é o seu caso."
    exit 1 ;;
  *)
    echo "::warning::Não deu para verificar a credencial (o registry respondeu ${STATUS})."
    echo "Seguindo assim mesmo: pode ser instabilidade de rede, e a instalação abaixo dirá."
    ;;
esac
