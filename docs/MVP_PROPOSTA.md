# MVP — Inteligência Imobiliária no UrbiVerso

**Status:** **fechado pelo dono em 2026-10-17** ([#199](https://github.com/rafaleandrog/inteligencia-real-estate/issues/199)). Falta só a P-06 (quem recebe acesso na Pinguim).
**Base:** `docs/SPEC_URBIVERSO.md` v0.7, seção 15 (15.1a, 15.1b) e D-129. A spec continua cobrindo todas as fases;
este documento só recorta o que entra na primeira versão.
**Instância:** Pinguim. **Repositório:** este, com a app em `apps/inteligencia_imobiliaria/` e o site
antigo intacto e funcionando (D-126).

## 1. O MVP em uma frase

A equipe abre a app na Pinguim e encontra, com o dado importado da planilha, o **mapa** com
anúncios, lançamentos, âncoras e contornos; o **cadastro** desses objetos com atributos próprios;
o **Mercado** e o **Diagnóstico** iguais aos do site; e a **ligação de objetos ao imóvel do núcleo
imobiliário**, com a ficha do imóvel mostrando o dado do núcleo ao lado do dado da pesquisa; e
as **áreas de estudo** cadastradas (desenho ou KMZ), ligadas ao núcleo e com atributos. Toda tabela
de objeto tem **"Importar CSV" na própria tela**, e uma sessão do Claude também pode completar os
dados pela API da app.

O que o MVP **não** faz: coleta automática nos portais (o site e o Apps Script continuam coletando),
dados públicos e grade, dossiê e ficha das áreas, IA, comércio e âncoras.

## 2. O que entra

São cerca de 10 a 12 PRs, cada um com release na Pinguim (a importação por CSV e a carga por agente entram dentro dos PRs da fase 1).

| # | Item | Fase / PR | O que a pessoa vê | Framework do UrbiVerso (doc do SDK) | Como validar na Pinguim |
|---|---|---|---|---|---|
| 1 | Ativação na plataforma | −1 | nada ainda: acesso ao SDK, secret, instalação com aceitação `Releases`, `permissao_padrao = nenhuma`, núcleo com as flags ligadas | `apps-em-repo-proprio.md` §§ 2, 7, 8; `permissoes.md`; `modulos.md` (aba Núcleo) | checklist de `docs/ativacao.md` assinado |
| 2 | Esqueleto da app | 0 | a app no menu, tela "em construção", versão `0.1.0` | `overview.md` (manifesto, `nav`, exports, `aoIniciar`); `distribuicao.md` (identidade, pisos, release); `ui.md` | a app abre; o empacotador passa no CI; o site continua abrindo |
| 3 | Território e importação | 1a | cidades, as 35 RAs, contornos; Operação › Importações com prévia, aplicar e desfazer | `banco-de-dados.md` (`schema.json`, `req.dados`, `soft_delete`, únicos); `arquivos.md` (upload em dois passos); `barramento.md` (`importacao_falhou`) | o retrato datado da planilha entra e "importadas + rejeitadas = linhas do retrato"; reimportar não duplica |
| 4 | Cadastro de anúncios, lançamentos e âncoras | 1b | formulários e listas, exportação CSV, histórico de alterações | `banco-de-dados.md` (`atualizarSe` com `versao`, transação); `permissoes.md` (papel `curador`); `ui-componentes-conteudo.md` (`urbi-tabela`) | o curador cria, edita e remove um anúncio, e o evento e a alteração ficam registrados; um CSV exportado reabre na prévia |
| 5 | Mapa | 1c | mapa com localidades, contornos, âncoras, lançamentos e anúncios; filtros, KPIs e detalhe em três níveis, como o site | `ui-componentes-conteudo.md` (`urbi-mapa`, SDK 98); `ui.md` (registro de exceções: legenda) | os 10 cenários de mapa da fixture de paridade conferem com o site |
| 6 | Qualidade e migração | 1d | Operação › Qualidade; os passos 0 a 7 e 10 da migração | `banco-de-dados.md`; `lixeira.md` (restaurar pela Config) | os achados de qualidade da importação aparecem e se resolvem |
| 7 | Núcleo imobiliário | 1a-N1 | Cadastro › Vínculos com o núcleo; camada Núcleo no mapa; ficha do objeto em duas seções (núcleo e pesquisa) | `modulos.md` (`dependencias`, `urbiVerso.modulo`); `nucleo.md` (rotas, filtros, paginação) | um contorno do Urbigis/Magis ligado a um lote do núcleo mostra `id_legivel`, área, quadra, parcelamento e matrícula iguais aos do cadastro |
| 8 | Atributos extensíveis | 1a-N2 | Cadastro › Atributos; bloco "Atributos" em toda ficha; filtro por faixa | `banco-de-dados.md`; `config-app.md` (o que é parâmetro e o que é dado) | o admin cria um atributo numérico, o curador grava em três objetos e a lista filtra pela faixa |
| 8a | Áreas de estudo mínimas | 1b (1 PR) | lista e mapa das áreas; criar por desenho ou KMZ; tipo, estágio e responsável; vínculo ao núcleo; atributos | `banco-de-dados.md`; `arquivos.md` (KMZ); `permissoes.md` (papel `estrategico` para áreas próprias); `modulos.md` | uma área importada do Urbigis/Magis aparece no mapa, ligada a um lote do núcleo e com um atributo gravado; quem não tem `estrategico` não vê área própria |
| 8b | Importar CSV em toda tabela de objeto | 1 a 2 | botão "Importar CSV" e modelo de CSV na tela de cada cadastro; atributos como colunas `atr_<codigo>` | `arquivos.md` (upload em dois passos); `banco-de-dados.md` | um CSV importado pela tela de anúncios entra com prévia, aplica e se desfaz |
| 8c | Carga por agente | 1 | nada novo na tela: uma sessão do Claude, com o token de um usuário de serviço "Carga", usa as mesmas rotas de importação | `tokens-api.md`; `permissoes.md` (papel `operador`); skill `instancia-urbiverso` para criar o usuário e o token | uma sessão importa um CSV pela API e a importação aparece na tela com o autor "Carga" |
| 9 | Mercado | 2 | IVV, IVV regional, FipeZap, com séries e derivados | `banco-de-dados.md` (`sql_declarado` com janela); `ui-componentes-conteudo.md` (`urbi-grafico-*`, `urbi-kpi`) | os 30 valores da fixture de paridade conferem com o site |
| 10 | Diagnóstico | 2 | perfil territorial, ranking, comparar, base de dados (PDAD) | `banco-de-dados.md`; `ui-componentes-layout.md` (`urbi-abas`) | mesmos números do site para o mesmo recorte; a Base de dados lista as fontes |
| 11 | Base de qualquer tela | 0 a 2 | "Como ler" em cada tela; erros traduzidos; tela inicial em `/` com atalhos para o que já existe | `ajuda.md`; `documentacao.md` (`docs/` servido em `/{app}/docs`) | toda tela do MVP tem "Como ler" e procedência |

**Frameworks que o MVP usa:** Dados, Arquivos, UI, Permissões, Config da App, Eventos (só erros),
Módulos (núcleo), Distribuição, Lixeira, Ajuda e Documentação.
**Que o MVP ainda não usa:** Rotinas, IA, Remessa externa e Tokens de API (este último segue
disponível para um agente ler, sem trabalho da app).

## 3. O que fica para depois (todas as fases da spec)

| Fase | O que é | Por que fica fora do MVP | Pode antecipar? |
|---|---|---|---|
| 3 | Coleta automática nos portais, histórico mensal, candidatos | o site e o Apps Script já coletam; a app recebe o retrato por reimportação; o corte só com ordem do dono | não: é a fase mais delicada (SSRF, travas, sete dias de rotina) |
| 4 | Dados públicos do pipeline e tráfego | depende de o pipeline publicar e das rotinas | não |
| 4A | Grade analítica H3 e enriquecimento | depende da fase 4 e de volume de anúncios com coordenada exata | não |
| 4B | Dossiê das áreas, fichas, demanda e produto, Terracap | é a primeira tela "de decisão"; grande | o cadastro mínimo de áreas **já entrou** no MVP (15.1b); a 4B estende a mesma tabela |
| 4C | Tese, diligência e portfólio | depende da 4B | não |
| 5 | Análises por IA | depende da camada de achados | não |
| 6 | Fechamento da migração | congela a planilha; só depois de tudo | não |
| 7 | Comércio e âncoras | depende do pipeline (CNPJ, OSM) | não |
| Futuro | geometria oficial do lote (`geo`), isócronas, ITBI, ficha do lote, PDF; e, por decisão do dono (P-46), lentes de aptidão, bolsões (Gi*) e análise de recorte em tela | dependem de contrato ou de fonte que não existe ainda, ou não servem a nenhuma jornada | não |

## 4. Decisões do dono (2026-10-17)

1. **MVP:** fases −1, 0, 1, camada do núcleo e fase 2. Sim.
2. **Áreas de estudo mínimas no MVP:** sim (15.1b).
3. **Fase 2:** inteira (Mercado e Diagnóstico).
4. **P-46:** lentes, bolsões (Gi*) e análise de tela vão para o Futuro; áreas gêmeas ficam na V1.
5. **Como os dados entram:** sem manter a página antiga nem a planilha atualizadas à mão. Toda
   tabela de objeto tem "Importar CSV" na própria tela, e uma sessão do Claude completa os dados pela
   API da app com o token de um usuário de serviço (spec 11.5).
6. **Quem usa na Pinguim (P-06):** em aberto; não bloqueia o começo, só a liberação de acesso.

## 5. O que falta para começar, além da spec

1. **Merge da PR [#196](https://github.com/rafaleandrog/inteligencia-real-estate/pull/196)** com a spec v0.6, por sua ordem.
2. **Fase −1**, com quem tem as alçadas:
   - um PAT *classic* com `read:packages` e o convite de acesso ao pacote `@urbiverso/sdk` aceito;
   - o secret `URBIVERSO_PACKAGES_TOKEN` neste repositório;
   - a instalação na Pinguim com aceitação `Releases`;
   - `permissao_padrao = nenhuma`;
   - as cinco flags do núcleo ligadas;
   - o cap de arquivo informado.
3. **Acesso à planilha** para gerar o retrato datado. O script lê por GViz, então a planilha
   precisa estar compartilhada para leitura, como hoje o site a lê.
4. **P-06:** quem recebe acesso de leitura e quem é admin da app na Pinguim.
5. **Medir a Pinguim (P-50):** esta spec foi escrita numa sessão sem acesso à Pinguim. A fase −1
   começa conferindo, só com leitura, a versão do shell, o módulo `imobiliario`, o `geo`, a
   aceitação, o cap de arquivo, os slots de IA e a `permissao_padrao` (tabela em 15.−1 da spec).

Com isso, a primeira sessão de código faz a fase 0: a pasta da app, o workspace aditivo, o kit e o
`0.1.0` instalado na Pinguim, sem mexer no site.
