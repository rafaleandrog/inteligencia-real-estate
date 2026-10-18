# Smoke do primeiro app

**Este arquivo é instrução para o agente, não prosa para a pessoa.** A skill `qa` o lê quando o
pedido cai na origem **(c)** da § 7 do `SKILL.md` — "valide o primeiro app", "o `ola_mundo` está no
ar?", "roda o smoke". Ele é o único roteiro que a skill carrega pronto, porque é o único cenário
que ela conhece de antemão: o hello world que o kit instala é sempre o mesmo em todo repositório
gerado por `npx @urbiverso/kit-apps`.

**Ele não substitui o resto da skill.** O ritual de largada (§ 4), o roster (§ 5) e a descoberta
de perfil (§ 6) acontecem antes, como em qualquer rodada, e as fronteiras da § 8 valem aqui como
em qualquer outra. O que este arquivo dá é a lista de cenários e a ordem.

## O que este smoke prova, e o que ele não prova

Prova que o **caminho inteiro** funciona: empacotar → publicar → instalar → permissão → tela. É
a coisa mais barata que existe para separar "o app dela tem um defeito" de "o caminho nunca
funcionou", e é por isso que o `primeiro-app.md` manda rodá-lo logo depois da instalação, antes
de o app de verdade existir.

**Não prova nada sobre o app dela.** Verde aqui não diz que a próxima app instala; diz que se ela
não instalar, a causa é dela.

## Antes de começar: o alvo existe?

`ola_mundo` é **semeado só em repositório que ainda não tinha `apps/`**. Num repositório que já
tinha apps, ele não existe e nunca existiu — e um smoke que falha em oito cenários porque o app
não está lá é ruído, não achado.

Confira antes de tudo, e **pare com uma linha** se não achar: o app não aparece em
`GET /api/shell/apps` e a pessoa não reconhece o nome → diga que este roteiro é do app de
exemplo, que este repositório não o tem, e pergunte qual app ela quer exercitar. Sem inventar
cenário por cima.

## Os oito cenários, nesta ordem

A ordem não é decorativa: cada um só faz sentido se o anterior passou, e parar no primeiro que
falhar poupa sete diagnósticos errados. Falhou um, **pare e relate** — não siga adiante para
"ver o que mais quebra".

| # | Cenário | Credencial | Espera |
|---|---|---|---|
| 1 | `GET /api/shell/status` | **nenhuma** | `200`, com `versao` |
| 2 | `GET /api/shell/auth/identidade` | principal | `200`, nome com `QA`, `tipo` não-sysadmin |
| 3 | `GET /api/shell/apps` | principal | `ola_mundo` na lista, instalado e **ligado** |
| 4 | `GET /api/shell/apps/ola_mundo/saude` | principal | saudável, sem erro de carga do bundle |
| 5 | `GET /api/ola_mundo/ola` | principal | `200`, `mensagem` terminando no **nome do principal** |
| 6 | `GET /api/ola_mundo/ola` | **nenhuma** | `401` — a rota da app é autenticada |
| 7 | `GET /api/ola_mundo/ola` | `QA Colaborador n` **sem permissão no app** | `403` |
| 8 | `GET /api/ola_mundo/ola` | o mesmo usuário, com `nivel` de leitura | `200`, com o nome **dele** |

### O que cada um pega, e o que não é defeito

1. **Status público.** Falha aqui é rede ou instância fora do ar, nunca token — a rota não pede
   credencial. Não siga: os sete seguintes vão falhar pelo mesmo motivo e dizer outra coisa.
2. **Identidade.** É a § 3 do `SKILL.md` outra vez, e ela já rodou no ritual de largada. Repita
   mesmo assim: o cabeçalho do relatório sai daqui, e é o que prova **em qual instância** o
   smoke rodou.
3. **Instalado e ligado** são duas coisas. App instalado e desligado responde `404` na rota, e o
   diagnóstico ingênuo vira "a rota não existe". Leia o estado, não deduza dele.
4. **Saúde.** App marcado não saudável é bundle que não carregou em runtime — a instalação
   passou e o app não funciona. É o caso que o cenário 5 sozinho não distingue de rota errada.
5. **O nome é a asserção.** `200` com corpo genérico não prova nada: o que este app existe para
   provar é que `req.contexto.usuario` chegou ao backend da app, e a prova é o nome do principal
   aparecer na resposta. Compare a string, não o código.
6. **Sem credencial.** É o negativo que prova que a rota é autenticada de verdade. **`ola_mundo`
   não tem rota pública** — não existe `/api/pub/ola_mundo/*` e não deve existir: o app de
   exemplo é mínimo de propósito. Se o pedido falar em "rota pública da app", diga que este app
   não tem uma, e que a superfície pública exercitada é a do cenário 1.
7. **Sem permissão, `403`.** É a prova de que app nasce trancado — o comportamento que confunde
   todo mundo na primeira vez. Use um usuário do pool reservado na rodada (§ 5), nunca o
   principal: o principal tem `usuarios` e concede a si mesmo, então ele não é testemunha válida
   de uma negativa de `nivelApp`.
8. **Com permissão, `200`.** A escrita que separa 7 de 8 é
   `PUT /api/shell/apps/ola_mundo/permissoes/<usuarioId>` com `{"nivel":"leitura"}`, da alçada
   `usuarios` — que o principal tem por definição (§ 2). Cunhe o token do usuário do pool
   **antes** do cenário 7, não entre 7 e 8: token novo no meio confunde "não tinha permissão"
   com "não tinha token".

## Resíduo — o que este roteiro precisa desfazer

A § 12 do `SKILL.md` vale inteira, e este roteiro acrescenta **um** item próprio:

- **A permissão do cenário 8 é resíduo.** `DELETE /api/shell/apps/ola_mundo/permissoes/<usuarioId>`
  no fim, sempre — inclusive quando o smoke falhou depois dela. Usuário do pool que fica com
  acesso a um app carrega esse acesso para a próxima rodada e faz o cenário 7 passar por engano,
  que é a pior falha possível aqui: um negativo que não nega.

Não mexa em nada mais do app: não desligue, não desinstale, não altere a **permissão padrão**.
A permissão padrão é do app inteiro e vale para gente de verdade; mudá-la para testar abriria o
app para a empresa da pessoa por um cenário de QA.

## Relatório

O de sempre (§ 13), com uma linha a mais no veredito: **os oito cenários, com o número do
primeiro que falhou** — ou "8/8" quando todos passaram. Quem lê este relatório costuma estar
decidindo se o problema é do caminho ou do app dela, e essa linha é a resposta.
