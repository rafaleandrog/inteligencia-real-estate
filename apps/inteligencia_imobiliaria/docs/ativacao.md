---
titulo: Ativação
descricao: Checklist da fase −1 (spec 15.−1) e os fatos da instância que a spec assumiu sem medir.
---

# Ativação

Checklist da fase −1 da spec (`docs/SPEC_URBIVERSO.md` § 15.−1), conferido item a item na fase 0.
Cada linha diz quem tem a alçada. Nada aqui é feito pela app: são passos na instância e no
repositório.

## Estado em 2026-10-18

A sessão que escreveu a fase 0 tinha acesso ao pacote `@urbiverso/sdk` (instalado: `100.0.0`,
shell espelhado `0.56.37`) e ao kit `@urbiverso/kit-apps` `100.3.16`, mas **não agiu na Pinguim**:
a medição e as escritas na instância ficam para uma sessão no ambiente da Pinguim, autorizada pelo
dono. Por isso a tabela de fatos abaixo está **não medida**.

## Checklist

| # | Item | Quem | Estado |
|---|---|---|---|
| 1 | PAT *classic* com `read:packages` e convite do pacote `@urbiverso/sdk` aceito | dono da app | feito: o `pnpm install` desta sessão autenticou e instalou o SDK 100.0.0 |
| 2a | `URBIVERSO_PACKAGES_TOKEN` como variável do ambiente das sessões | dono da app | feito (o `pnpm install` funcionou) |
| 2b | `URBIVERSO_PACKAGES_TOKEN` como **secret do repositório** (Settings › Secrets and variables › Actions), para `ci.yml` e `release.yml` | dono da app | **não verificado**: o kit não conseguiu consultar os secrets (403 do proxy). Sem ele o CI e o release falham com `401`/`403` |
| 3 | Na Pinguim: instalar a app do repositório, aceitação `Releases`, auto-update ligado | admin da instância (alçada `apps`) | pendente; depende da primeira release |
| 4 | Slots-base de IA `poder`, `barato`, `arquivos` autorizados | alçada `integracoes` | fora do MVP (o MVP não usa IA) |
| 5 | `permissao_padrao = nenhuma` para a app | alçada `usuarios` | pendente, na instalação |
| 6 | Cap global de arquivo informado | admin da instância | pendente (medir) |
| 7 | Hosts do proxy de egresso | alçada `sistema` | não se aplica ao MVP (sem coleta) |
| 8 | Módulo `imobiliario` ≥ 1.0.0 instalado antes da release que declara `dependencias`; depois, as cinco flags de leitura ligadas na aba Núcleo da app | alçada `nucleo` | pendente; a partir da versão 0.5.0 (15.1a), que declara a dependência: instalar ou atualizar a app sem o módulo faz ela não subir |

## Fatos da Pinguim que a spec assumiu sem medir (P-50)

Medir só com leitura, pela skill `instancia-urbiverso`, numa sessão com acesso à Pinguim.

| Fato | O que a spec assume | Medido | Se divergir |
|---|---|---|---|
| versão do shell | ≥ `0.56.37` (o `shell_min` da app) | não medido | o piso desce para o que a Pinguim roda, ou a release espera a atualização |
| módulo `imobiliario` | instalado, 1.3.0 relatado (≥ 1.0.0) | não medido | a camada do núcleo (15.1a) sai do MVP até o módulo ser instalado |
| módulo `geo` | presente, sem contrato no SDK | não medido | só registra |
| aceitação e auto-update | `Releases` com auto-update | não medido | instalação manual a cada release |
| cap global de arquivo | desconhecido | não medido | `tamanho_max_mb` da importação desce para ele |
| slots de IA | autorizáveis | não medido | não afeta o MVP |
| `permissao_padrao` para apps novas | `nenhuma` | não medido | o admin ajusta na instalação |
| app `viabilidade` | instalada a partir de repositório pessoal | não medido | só registra |

## O que o dono precisa fazer ou autorizar

1. Conferir o secret `URBIVERSO_PACKAGES_TOKEN` no repositório (item 2b).
2. Abrir uma sessão no ambiente da Pinguim para medir a tabela acima, só com leitura.
3. Autorizar, na conversa, cada escrita na Pinguim: instalação (3), `permissao_padrao` (5) e,
   a partir da 15.1a, as flags do núcleo (8).
4. Decidir a P-06: quem recebe acesso de leitura e quem é admin da app.
5. Dar a ordem de merge e de release, PR por PR.

## Divergências da spec encontradas na fase 0

- **`schema.json` vazio não empacota.** A spec 15.0 pedia um `schema.json` vazio; o empacotador do
  SDK 100 reprova `"tabelas"` sem nenhuma tabela. A fase 0 sai sem `schema.json` (ele é opcional),
  e o arquivo nasce na 15.1 com as primeiras tabelas.
- **CSV fora de `migration/` reprova o `validate.yml` do site.** O site proíbe `*.csv` versionado fora
  de `migration/` e `reference/`. As fixtures de CSV da app ficam embutidas nos testes, e o retrato
  datado da planilha não vai para `migracao/` na raiz até essa regra ser revista.
- **`.claude/` era ignorada inteira.** O `.gitignore` do site ignorava `.claude/`; o kit instala ali as
  skills e o hook de sessão, que precisam ser versionados. O `.gitignore` passou a ignorar
  `.claude/*` com exceção do que o kit instala.

## Divergências da spec encontradas na 15.1a

- **Remover e restaurar de atributo e de vínculo são `PATCH`, não `POST`.** A tabela 6.23 escreve
  `POST /atributos/:id/remover`; a app usa `PATCH`, como todo remover/restaurar dos cadastros (o
  gate do shell trata `POST` e `PATCH` igual, escrita), para um padrão só na API.
- **Desfazer importação apaga o valor de atributo.** `atributos_valor` não tem `soft_delete`
  (5.24), então o desfazer apaga a linha, em vez de mandá-la para a lixeira como faz com os objetos.
- **Sem o módulo no request, `503 NUCLEO_INDISPONIVEL`.** A spec não diz o que o `POST
  /vinculos-nucleo` responde quando `req.modulos.imobiliario` não existe; a app recusa com 503 e a
  instrução para o admin.

## Divergências da spec encontradas na 15.1b

- **Colunas a mais em `areas_estudo`: `autor_id`, `versao` e `geometria_hash`.** A regra "autor ou
  curador" (6.11) precisa saber quem criou, e o framework não guarda autoria; a edição usa a versão
  (D-88) como todo cadastro; e a importação de KML não duplica pela geometria, como nos contornos.
- **A lista de áreas pagina em código.** O sigilo é "não é própria, ou eu sou o responsável", um
  `OU` que o filtro do framework não expressa; as áreas são poucas, então a rota varre a cidade,
  tira as próprias que o usuário não lê e só então pagina, e o `total` não denuncia nada (D-116).
- **O decisor muda o estágio sem ser autor nem curador.** A 6.11 põe a mudança de estágio sob "obj.
  escrever"; sem esta exceção o papel `decisor` não conseguiria decidir. Ele muda só estágio,
  motivo e aprendizado; o resto da área segue com autor e curador.
- **CSV de áreas recusa estágio de decisão.** A linha não tem onde levar o motivo nem quem decidiu;
  a decisão fica na tela.

## Divergências da spec encontradas na fase 2

- **O motor de cálculo do site é copiado, não reescrito.** A 15.2 pede o cálculo "portado de
  `src/ivv/` com os testes". A app copia, sem editar, os módulos puros do site (IVV, FipeZap, PDAD)
  para `comum/site/` pelo `scripts/vendorizar-site.mjs`, e o backend só traduz a linha da tabela
  para o formato da aba. A paridade sai por construção e o teste a confere contra números gerados
  pelo código do site (`scripts/gerar-paridade.mjs`).
- **Escala do IVV mensal sem declaração no mapeamento.** A spec aceitaria pontos percentuais se
  declarados; a app aceita só fração e recusa o resto, que é o que a planilha viva publica.
- **Sem o modo `substituir_tudo`.** As séries usam "Atualizar" (por mês) e "Desfazer".
- **Visão pareada do FipeZap em código, não em `sql_declarado`.** A rota monta venda × locação por
  localidade das linhas de `fipezap_mensal` em memória (a série é pequena) e passa pelo motor do
  site; o `serie_pareada_fipezap` fica para quando o volume pedir.
- **Paridade do FipeZap sobre série sintética.** O retrato real da planilha ainda não foi exportado
  (o proxy desta sessão bloqueia o Google Sheets); o gerador cria uma série determinística no
  formato da aba e a passa pelo código do site.
