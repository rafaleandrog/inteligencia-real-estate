# Proposta de MVP — Inteligência Imobiliária no UrbiVerso

**Status:** proposta para o dono fechar item a item ([#199](https://github.com/rafaleandrog/inteligencia-real-estate/issues/199)).
**Base:** `docs/SPEC_URBIVERSO.md` v0.6, seção 15 e D-129. A spec continua cobrindo todas as fases;
este documento só recorta o que entra na primeira versão.
**Instância:** Pinguim. **Repositório:** este, com a app em `apps/inteligencia_imobiliaria/` e o site
antigo intacto e funcionando (D-126).

## 1. O MVP em uma frase

A equipe abre a app na Pinguim e encontra, com o dado importado da planilha, o **mapa** com
anúncios, lançamentos, âncoras e contornos; o **cadastro** desses objetos com atributos próprios;
o **Mercado** e o **Diagnóstico** iguais aos do site; e a **ligação de objetos ao imóvel do núcleo
imobiliário**, com a ficha do imóvel mostrando o dado do núcleo ao lado do dado da pesquisa.

O que o MVP **não** faz: coleta automática nos portais (o site e o Apps Script continuam coletando),
dados públicos e grade, áreas de estudo com dossiê, IA, comércio e âncoras.

## 2. O que entra

São cerca de 11 a 13 PRs, cada um com release na Pinguim.

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
| 4B | Áreas de estudo, dossiê, demanda e produto, Terracap | é a primeira tela "de decisão"; grande | **sim, em parte**: cadastro de área (polígono, tipo, estágio), vínculo ao núcleo e atributos, sem dossiê (ver decisão 2) |
| 4C | Tese, diligência e portfólio | depende da 4B | não |
| 5 | Análises por IA | depende da camada de achados | não |
| 6 | Fechamento da migração | congela a planilha; só depois de tudo | não |
| 7 | Comércio e âncoras | depende do pipeline (CNPJ, OSM) | não |
| Futuro | geometria oficial do lote (`geo`), isócronas, ITBI, ficha do lote, PDF | dependem de contrato ou de fonte que não existe ainda | não |

## 4. Decisões para fechar

1. **O MVP é o da seção 2?** Fases −1, 0, 1 (1a a 1d), camada do núcleo e fase 2. Recomendo sim.
2. **Antecipar áreas de estudo mínimas?** Cadastro de área (desenho ou KMZ do Urbigis/Magis, tipo,
   estágio), vínculo ao núcleo e atributos, sem dossiê nem ficha. Custa 1 PR e torna o vínculo com
   o núcleo mais útil para decidir sobre áreas. Recomendo sim.
3. **Fase 2 inteira no MVP?** Mercado e Diagnóstico repetem o site e servem de prova de paridade.
   Alternativa: só o Mercado. Recomendo inteira.
4. **P-46, corte de escopo:** lentes de aptidão, bolsões (Gi*) e análise de tela saem da V1 e vão
   para o Futuro? Não afetam o MVP, mas fecham a spec. Recomendo sim, mantendo as áreas gêmeas.
5. **Atualização do dado no MVP:** sem coleta automática, a app se atualiza por reimportação do
   retrato da planilha, feita pelo admin quando quiser (o script gera o retrato e a importação usa o
   modo `atualizar`). Combinado?
6. **Quem usa na Pinguim (P-06):** nomes de quem recebe `leitura` e de quem é admin da app.

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
4. **Respostas às decisões da seção 4.**

Com isso, a primeira sessão de código faz a fase 0: a pasta da app, o workspace aditivo, o kit e o
`0.1.0` instalado na Pinguim, sem mexer no site.
