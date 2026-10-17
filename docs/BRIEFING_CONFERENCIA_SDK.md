# Briefing — Conferência da spec contra o SDK do UrbiVerso

**Para:** a sessão que vai trabalhar no repositório da app `inteligencia_imobiliaria`, com o
`@urbiverso/sdk` instalado.
**Insumo principal:** `docs/SPEC_URBIVERSO.md`, versão 0.3 (2026-10-16).
**Resultado esperado:** a spec na versão 0.4, conferida contra o SDK publicado, sem nenhum
`[CONFIRMAR SDK P-nn]` sem decisão, mais um relatório de conferência e a lista de issues
sugeridas para o shell.

---

## 0. Prompt para colar no início da sessão

```text
Você vai conferir a spec docs/SPEC_URBIVERSO.md (v0.3) contra o SDK publicado do UrbiVerso,
seguindo docs/BRIEFING_CONFERENCIA_SDK.md à risca. Leia o briefing inteiro antes de qualquer
outra coisa.

Regras que não mudam:
- A única superfície de verdade sobre a plataforma é node_modules/@urbiverso/sdk/docs/ na
  versão instalada pelo lockfile desta app. Nunca use docs/shell/ do monorepo, nem memória,
  nem esta própria spec como prova de contrato.
- Leia cada doc de framework por inteiro antes de dar veredito sobre ele.
- Todo veredito traz evidência: caminho do arquivo, seção e um trecho literal curto.
- Contrato que não está no bundle é um achado ("ausente no SDK"), nunca algo a supor.
- Você não implementa código. Você só edita a spec, escreve o relatório e a lista de issues.

Entregue, nesta ordem: docs/CONFERENCIA_SDK.md, a spec em v0.4 e
docs/ISSUES_SHELL_SUGERIDAS.md. Siga a prioridade da seção 6 do briefing e pare para me
perguntar só se um veredito exigir mudar uma decisão de produto (D-nn) sem plano B escrito.
```

---

## 1. Objetivo

A spec foi escrita em três rodadas de pesquisa sem acesso ao SDK publicado. O que ela afirma
sobre a plataforma veio de uma leitura anterior dos docs do shell (versão `0.56.37`, nível
SDK 100) e de dedução. Esta sessão separa o que é contrato real do que foi suposição e ajusta a
spec onde a plataforma é diferente. O objetivo é que nenhuma fase comece apoiada num verbo que
não existe.

A regra que guia tudo vem da skill `revisar-pr-apps`: a pergunta não é "esse verbo existe em
algum lugar?", e sim "esse verbo está publicado no SDK que a app instala?".

---

## 2. O que levar para a sessão

1. `docs/SPEC_URBIVERSO.md` v0.3, commitada no repositório da app.
2. Este briefing, em `docs/BRIEFING_CONFERENCIA_SDK.md`.
3. O repositório da app com `package.json` e lockfile apontando para `@urbiverso/sdk`.
4. Um token com `read:packages` no GitHub Packages, para instalar o SDK e rodar
   `npm view @urbiverso/sdk dist-tags` e `npm view @urbiverso/sdk urbiverso`.
5. A skill `revisar-pr-apps` disponível na sessão, como referência da doutrina de leitura (ela
   não vai rodar, porque não há PR para revisar).

Se o repositório da app ainda não existe (P-04), crie só o esqueleto mínimo para instalar o
SDK (`package.json` com a dependência e o `.npmrc` do registry) e registre isso no relatório.

---

## 3. Regras de leitura

1. **Superfície única.** `node_modules/@urbiverso/sdk/docs/` na árvore da app: tipos, docs de
   framework e `obsolescencias.json`, na versão do lockfile.
2. **Versão em dia.** Compare a versão instalada com `npm view @urbiverso/sdk dist-tags`. Se a
   instalada estiver atrás, instale a mais nova num branch e confira contra ela, registrando as
   duas no relatório.
3. **Doc inteiro.** Para cada framework tocado, leia o doc inteiro, sem pular seção. Dê atenção
   especial a `## Contratos do framework`, `## Funcionamento do framework`,
   `## O que nunca fazer`, `### Sinais de que você está violando este capítulo` e `## Princípios`.
   Extraia cada regra como uma asserção antes de confrontar com a spec.
4. **Evidência literal.** Todo veredito cita o caminho do arquivo, a seção e um trecho curto
   literal. Sem citação, o veredito é `ambiguo`.
5. **Ausência é achado.** O que não está no bundle não é "provavelmente existe". É
   `ausente_no_sdk`, com sugestão de issue para o shell, e a spec passa a usar o plano B.
6. **Silêncio é ambiguidade.** Se o doc não proíbe nem descreve, o veredito é `ambiguo`, e a
   spec adota o caminho que funciona sem o contrato.
7. **Pisos.** Nunca proponha `sdk_min` ou `shell_min` acima do que o SDK publicado documenta. Se
   algo exige subir o piso, o achado é "o SDK precisa ser atualizado", não "suba o piso".
8. **Sem código.** A sessão não implementa nada, nem para testar. Um experimento só entra se for
   leitura de tipo ou de doc.

---

## 4. Preparação

1. Instale as dependências e confirme a versão do SDK instalada e a publicada.
2. Liste `node_modules/@urbiverso/sdk/docs/` e registre no relatório a árvore de arquivos e a
   versão.
3. Leia `overview.md` por inteiro e os frontmatters de todos os docs, para mapear qual doc cobre
   qual framework.
4. Leia `obsolescencias.json` inteiro e anote tudo que a spec usa e que esteja marcado como
   obsoleto ou com prazo.
5. Leia os tipos (`.d.ts`) exportados pelo SDK para `ctx`, `req`, `req.dados`, `req.ia`,
   `req.arquivos`, `ctx.eventos`, `urbiVerso.api` e `urbiVerso.fetch`. Tipo é evidência tão boa
   quanto doc.
6. Só então percorra a seção 5 deste briefing.

---

## 5. Itens a conferir

Cada item tem um código `C-nn`, a seção da spec onde a suposição aparece, a pergunta exata e o
que fazer se o SDK não confirmar. Quando o item corresponde a uma pendência da spec, o `P-nn`
está indicado.

**Contexto de produto que não muda com a conferência** (para a sessão não "consertar" o que é
decisão):
- **D-01:** a IA não gera número.
- **D-05:** o geoprocessamento pesado fica no pipeline, e não há PostGIS para app.
- **D-13:** a permissão padrão é nenhuma.
- **D-47:** `reagir` só com `continuar_coleta`.
- **D-48:** o pertencimento à célula é por centroide, sem biblioteca H3 obrigatória.
- **D-50:** as três naturezas de preço nunca se misturam.

### 5.1 Versões, pisos e obsolescências

| ID | A spec assume (§) | Pergunta | Se não confirmar |
|---|---|---|---|
| C-01 | Shell `0.56.37`, SDK 100, publicado 99, `sdk_min` 99 (cabeçalho, 3.3) | Qual é a versão publicada hoje e que shell ela espelha (`npm view … urbiverso`)? | Corrigir os números em 3.3 e no cabeçalho; registrar a diferença |
| C-02 | `urbi-mapa` exige ≥ 98; `formato`/`intervalo` no schema ≥ 94; `dependencias` não usado (3.3) | Esses níveis estão no SDK publicado? | Corrigir o nível citado |
| C-03 | Nada do que a spec usa está obsoleto | Algum verbo, primitivo ou campo usado está em `obsolescencias.json`? | Trocar pelo substituto indicado e registrar como D nova |

### 5.2 Manifesto (spec §4.1 a 4.3)

| ID | A spec assume (§) | Pergunta | Se não confirmar |
|---|---|---|---|
| C-04 | `nav` com dois níveis (`itens`), `icone` com classes `fa-solid fa-*` (4.1) | O `nav` aceita aninhamento e esse formato de ícone? Quantos itens no máximo? | Achatar o `nav` ou mudar a notação de ícone |
| C-05 | `rotinas` com `titulo`, `descricao`, `frequencia` ∈ {`diaria`, `semanal`, `mensal`}; horário definido pelo admin; botão "Rodar agora" (4.1, 7; P-05) | Quais valores de `frequencia` existem? O admin escolhe o horário? Quem pode "Rodar agora"? | Ajustar as frequências; `recalcular_derivados` passa a ser só disparo manual, se houver |
| C-06 | `ia.slots` custom com `base: "poder"` e `"barato"`; cinco slots (4.1, 9.1) | Formato de slot, valores de `base`, limite de slots | Juntar slots ou trocar a base |
| C-07 | Tipos de parâmetro `numero`, `string`, `bool`, `texto_longo` e `string` com `secret`; "padrão vivo" (4.3) | Esses tipos existem? Existe lista ou JSON como tipo? Qual o tamanho máximo de `texto_longo`? O padrão vivo é real? | Listas seguem como string CSV (já é o desenho); JSON grande (`series_macro_config`) vira tabela editável |
| C-08 | Declaração de `eventos` e `erros` com `campos`, `conteudo`, `api`, `rota`; evento interno `continuar_coleta` sem notificação (13) | O formato bate? Existe evento sem notificação? | Ajustar o bloco da seção 13 |
| C-09 | `identidade`, `versao` 0.1.0, `sdk_min`, `shell_min`; `ui` ausente porque a app está sob o framework de UI (4.1) | Campos obrigatórios e significado de `ui` ausente | Ajustar o manifesto |
| C-10 | `acesso_externo` por tabela com padrão `restrito`; app não declara `aceita_externos` (5.1, 14) | Valores de `acesso_externo` e efeito real sobre `/api/dados/...`; o que é `aceita_externos` | Ajustar 5.1 e a lista de tabelas `somente_leitura` |

### 5.3 Exports e ciclo de vida do backend (spec §4.2, 7)

| ID | A spec assume (§) | Pergunta | Se não confirmar |
|---|---|---|---|
| C-11 | `aoIniciar(ctx)` semeia dados e **guarda o `ctx`**, e uma rota chama o handler da rotina com esse `ctx` (4.2, 6.9 `/dados-publicos/carregar`) | É permitido guardar o `ctx` e chamar o handler de rotina a partir de rota? Existe verbo oficial para disparar rotina pela app? | Trocar por "Rodar agora" do shell, ou por evento agendado escutado por `reagir` |
| C-12 | `aoEncerrar` cancela lote em voo por `AbortController` (4.2) | Existe `aoEncerrar` e quanto tempo ele tem? | Remover; confiar no corte da rotina |
| C-13 | `reagir` com `continuar_coleta`; `ctx.eventos.agendar(nome, payload, { em: +2 min })` (4.2, 7) | Assinatura de `reagir`; `agendar` existe com atraso? Granularidade, garantia de entrega (pelo menos uma vez?) e reentrância | Se não houver agendamento, a continuação vira "na próxima execução" e o lote diário encolhe; registrar como D |
| C-14 | `export const rotas` é um Router montado em `/api/inteligencia_imobiliaria/`; testes com `supertest` (6, 18) | Forma do Router e prefixo de montagem | Ajustar 6 e 18.1 |

### 5.4 Dados: `schema.json` (spec §5)

| ID | A spec assume (§) | Pergunta | Se não confirmar |
|---|---|---|---|
| C-15 | Tipos `texto(n)`, `texto_longo`, `inteiro`, `decimal(p,s)` até `(18,6)`, `booleano`, `data`, `datahora`, `json`, `arquivo` com MIME e `tamanho_max_mb` até 50, `referencia` com `cascata`/`anular`/`restringir`, referência a `shell.usuarios` (5.1 a 5.23) | Todos existem com esses nomes e limites? | Ajustar tipos; registrar cada troca |
| C-16 | `opcoes`, `padrao`, obrigatoriedade (5.x) | Sintaxe e se `opcoes` pode ser alterado depois da criação (o `estagio` de `areas_estudo` mudou de valores na v0.3) | Garantir que os valores definitivos entram antes da primeira release |
| C-17 | `unicos` com `nulos_distintos`; único parcial "quando preenchido" (`id_legado`, `licenciamento_obras (tipo_ato, numero)`) (5.1, 5.15) | Existe único parcial? Como se declara? | Trocar por validação em código na rota e na importação |
| C-18 | `indices` compostos; índice novo em tabela que já existe nasce no boot | O reconciliador cria índice em tabela existente? (a skill registra que isso mudou no shell 0.53.5) | Registrar a regra correta em 5.1 |
| C-19 | `busca_texto`, `soft_delete`, `id_legivel` com template `{campo}` (5.x) | Sintaxe e comportamento do `soft_delete` (filtra por padrão nas leituras?) | Ajustar 5.1 e as rotas `/remover` e `/restaurar` |
| C-20 | `json` grande: `celulas.geometria`, `cache_calculos.resultado` (dossiê inteiro), `area_estudo_fichas.conteudo` (5.13, 5.16, 5.23) | Tamanho máximo de valor `json` e de linha | Cache por bloco do dossiê, não do dossiê inteiro; ficha guarda só o Markdown e os números-chave |
| C-21 | ~60 tabelas na app; reconciliador converge a cada boot (5) | Limite de tabelas e de colunas por app? Como o reconciliador trata coluna removida ou renomeada? | Fundir tabelas pequenas, se houver limite |
| C-22 | Toda tabela tem `id`, `criado_em`, `atualizado_em` automáticos; `CONFLITO_VERSAO` compara `atualizado_em` (6, 6.22) | Essas colunas são automáticas? Existe controle de concorrência otimista nativo? | Declarar `atualizado_em` e comparar na rota dentro da transação |

### 5.5 Dados: `req.dados` e `sql_declarado` (spec §5.12, 6, 7)

| ID | A spec assume (§) | Pergunta | Se não confirmar |
|---|---|---|---|
| C-23 | Filtros por igualdade, faixa (`gte`/`lte`, para bbox) e **lista de ids** (`in`); ordenação; envelope `{ dados, total, pagina, por_pagina, paginas }` (5.12, 6; **P-16**) | Vocabulário exato de filtro; existe `in`? Com que teto de itens? | Sem `in`: lotes de 500 ids por consulta e soma em código (plano B escrito em 5.12) |
| C-24 | Escrita em lote de 500 linhas; upsert por chave natural (modos `atualizar` e `ignorar` da importação); update e **delete por filtro** (troca de versão de `celula_metricas`) (7.5, 11.1) | Existe inserção em lote? Upsert? Delete por filtro? | Sem delete por filtro, a troca atômica passa a ser por **ponteiro de versão ativa** em `conjuntos_publicos`, e as leituras filtram por ela; reescrever 7.5 |
| C-25 | `req.dados.transaction` para gravar cadastro + `alteracoes_cadastro` + evento juntos; disponível também em rotina (6, 7) | Semântica, limite de tamanho e de tempo da transação; existe em `ctx.dados`? | Ordem de escrita compensável, registrada como risco |
| C-26 | `sql_declarado` só de leitura, com allowlist de janela e agregação **sem** `percentile_cont`; seis consultas da v0.1 e quatro da v0.2, incluindo `agrega_celula_metricas` com parâmetro de lista (5.12; **P-16**) | Formato da declaração; tipos de parâmetro (lista?); allowlist exata; junções entre tabelas da app; timeout e teto de linhas | Cada consulta que não couber vira cálculo em código sobre `req.dados` |
| C-27 | `total` no envelope em tabela de 1 milhão de linhas (`celula_metricas`) (5.13) | O `total` é sempre calculado? Dá para pedir sem ele? | Rotas internas da grade não usam o envelope de lista |
| C-28 | ~1 milhão de linhas em `celula_metricas`; carga fatiada (5.13; **P-21**) | Limites de linhas, de armazenamento e orientação de desempenho para tabela grande | Reduzir métricas por célula (só habitadas, só as do catálogo inicial) e registrar como D |
| C-29 | Referência a `shell.usuarios` e leitura do nome do autor para exibir (5.x) | Como ler o nome do usuário de uma referência? | Mostrar só "você" e iniciais, se não houver leitura |

### 5.6 Rotinas (spec §7)

| ID | A spec assume (§) | Pergunta | Se não confirmar |
|---|---|---|---|
| C-30 | Corte em 15 minutos; retorno `{ ok, resultado: { resumo, … } }`; status `interrompida` no corte (7) | Tempo exato do corte, o que acontece nele e formato do retorno | Ajustar `orcamento_rotina_ms` e o texto de 7 |
| C-31 | O shell não reexecuta a mesma rotina no mesmo dia (7) | Confirmar; e se "Rodar agora" conta como execução do dia | Revisar a lógica de continuação |
| C-32 | Duas execuções da mesma rotina não se sobrepõem (agendada + continuação) | O shell impede sobreposição? | Trava em `cursores_rotina` com expiração |
| C-33 | `ctx` da rotina tem `dados`, `eventos`, `arquivos`, `ia`, relógio e fuso da organização (7, 21.3; P-05) | O que existe no `ctx`? Como obter o fuso? | Fuso como parâmetro da app |
| C-34 | A instância faz HTTP de saída para portais, `raw.githubusercontent.com` e a API do Banco Central; `undici` com `ProxyAgent` embutido (8.2, 7.5, 7.9) | Há restrição de egress? `fetch` do Node disponível? Pode embutir `undici`? | Proxy obrigatório ou fontes pelo pipeline; registrar como D |
| C-35 | Rotina lê arquivo de 50 MB (GeoJSON e CSV) e processa em memória (7.5) | Limite de memória da rotina; existe leitura em fluxo de arquivo? | Arquivos menores no manifest 2 (fatias por conjunto) |
| C-36 | Não existe dependência entre rotinas; a ordem mensal é configurada pelo admin e protegida por guarda (4.1, 7.10, R-21) | Existe `depende_de` ou encadeamento? | Se existir, usar no lugar da guarda |

### 5.7 Arquivos (spec §5.10, 6.7, 6.11, 6.17, 11)

| ID | A spec assume (§) | Pergunta | Se não confirmar |
|---|---|---|---|
| C-37 | `req.arquivos.enviar` sem usuário, chamado por rotina (7.5) | Existe? Há cota de armazenamento? | Conjuntos públicos lidos direto do GitHub a cada carga, sem guardar o arquivo |
| C-38 | Fluxo `upload_id` → coluna `arquivo` em importação, KMZ e foto de campo; validação de MIME e tamanho (6.1, 6.11, 6.17) | Como o frontend envia e como a rota recebe; tamanho máximo | Ajustar as rotas de importação |
| C-39 | Rota que serve arquivo com `ETag`, `Cache-Control: immutable` e `Content-Type: application/geo+json` (6.7) | A rota da app controla cabeçalhos de resposta? | Sem cache HTTP; o frontend guarda por sessão |
| C-40 | Rota devolve CSV com BOM (`urbiVerso.fetch().blob()`); ZIP do pacote; PDF ou Word da ficha (6, 11.2; **P-18**, **P-20**) | A rota pode responder binário? Há helper de arquivo para download? Pode embutir biblioteca de ZIP? Existe geração de PDF ou Word? | Pacote em três downloads; ficha só em Markdown (plano B escrito) |
| C-41 | Arquivos de conjunto substituído podem ser apagados (21.6) | Como apagar arquivo e o que acontece com a referência | Manter os arquivos e registrar o custo |

### 5.8 IA (spec §9)

| ID | A spec assume (§) | Pergunta | Se não confirmar |
|---|---|---|---|
| C-42 | Helper `req.ia` chama um slot pelo nome com instruções de sistema e **resposta em schema JSON** (9.4) | Assinatura; existe saída estruturada? Limites de tokens de entrada e saída; timeout | Sem saída estruturada: pedir JSON no texto, validar e descartar o que não parseia |
| C-43 | `req.ia.estadoSlot` com `efetivo` e `failsafe` (6.8, 9.6) | Campos reais | Ajustar 6.8 e a regra de esconder o botão |
| C-44 | A resposta traz `tokens_entrada` e `tokens_saida` (5.11, 9.5) | Esses campos existem? | Custo estimado por caracteres, marcado como estimativa |
| C-45 | A rotina `gerar_analises_mensais` chama IA pelo `ctx` (7.6) | Existe IA no `ctx` de rotina? | Análises mensais disparadas por evento ou por botão |
| C-46 | Nenhum dado pessoal vai ao provedor (22.2) | O SDK documenta retenção ou uso dos dados pelo provedor? | Registrar o que o doc disser na seção 22 |
| C-47 | Erros `ia_chamada`, `listener_falhou` e `iniciar_falhou` são injetados pelo shell (13) | Lista real de erros injetados | Ajustar 13 |

### 5.9 Eventos, erros e notificações (spec §13)

| ID | A spec assume (§) | Pergunta | Se não confirmar |
|---|---|---|---|
| C-48 | Erro declarado notifica o admin no inbox, com e-mail, Slack ou destino de Remessa à escolha (13) | Como funciona a entrega e quem recebe | Ajustar 13 |
| C-49 | Evento `lacuna_cadastro` chega ao inbox do **curador**; futuro `mudanca_relevante` com inscrição por localidade (13, D-52) | É possível endereçar por papel da app? O usuário se inscreve em evento de domínio? | Lacuna vai ao admin; o aviso de mudança fica no Futuro sem prazo |
| C-50 | "Uma vez por transição": a app deduplica (8.4, 8.4.1) | Existe deduplicação nativa? | Manter o estado da transição em tabela da app (já é o desenho) |

### 5.10 Permissões e gates (spec §6, 14)

| ID | A spec assume (§) | Pergunta | Se não confirmar |
|---|---|---|---|
| C-51 | Gate uniforme: `GET` = `leitura`, `POST`/`PATCH`/`PUT` = `escrita`, `DELETE` = `admin` (6, R-17, R-18) | É exatamente isso? A app pode afrouxar um gate (`POST` para `leitura`)? | **Decisão de desenho**: se `POST` puder ser liberado para `leitura`, os cálculos voltam a ser `POST` e o polígono sai da URL. Registrar como D e reescrever as convenções de 6 |
| C-52 | `req.contexto` traz nível, `rolesApp` e usuário; papéis `curador` e `operador` declarados pela app (14) | Onde a app declara papéis? Nome exato do campo | Ajustar `exigirPapel` e a seção 14 |
| C-53 | O admin não recebe papéis automaticamente (14) | Confirmar | Ajustar 14 |
| C-54 | Usuário só com `leitura` não grava visões salvas (5.19; **P-22**) | O que são `rotasPessoais`? Elas permitem gravação pessoal com `leitura`? | Visões salvas só para `escrita` (plano B escrito) |
| C-55 | Agente com token tem os mesmos gates que uma pessoa do mesmo nível; nenhuma rota ramifica por natureza (1.3, 22.2) | Como funciona o token de agente? | Ajustar 1.3 e 22.2 |
| C-56 | Permissão padrão nenhuma, liberada individualmente (D-13) | Como se declara e como o admin libera | Ajustar 14 |

### 5.11 UI: primitivos e regras (spec §10)

| ID | A spec assume (§) | Pergunta | Se não confirmar |
|---|---|---|---|
| C-57 | Primitivos usados: `urbi-shell-page`, `urbi-inbox`, `urbi-2x1`, `urbi-3-colunas`, `urbi-abas`, `urbi-grid`, `urbi-stack`, `urbi-tabela` (filtro por coluna, `responsivo="multiline"`, linha expansível), `urbi-kpi`, `urbi-grafico-linha`, `-area`, `-colunas`, `-pizza`, `-medidor`, `urbi-mapa-de-calor` (matriz, clique na célula), `urbi-chips-atalho`, `urbi-markdown`, `urbi-loading`, `urbi-estado-vazio`, `urbi-banner` (10) | Cada um existe com os atributos usados? Gráficos com várias séries? A matriz emite evento de clique? | Cada ausência vira exceção registrada ou troca de primitivo, nomeada na seção 10.1 |
| C-58 | Registro de exceções da app, no mesmo PR: dispersão, legenda com amostras de cor, régua P25–P75 (10.1) | Formato e local do registro; critérios de aceite | Ajustar 10.1 |
| C-59 | Só tokens semânticos, nenhum CSS estrutural, nenhum literal de cor; no mapa a cor é dado (`estilo`) (1.2, 10.1) | Confirmar a regra e como o mapa recebe cor | Ajustar 1.2 |
| C-60 | Foco, teclado e contraste vêm dos primitivos; todo gráfico tem "ver tabela" (21.5) | O primitivo de gráfico oferece tabela alternativa? | "Ver tabela" como `urbi-tabela` ao lado, feita pela app |

### 5.12 Mapa: `urbi-mapa` (spec §10.2, 10.6, 10.10)

| ID | A spec assume (§) | Pergunta | Se não confirmar |
|---|---|---|---|
| C-61 | Modos `desenhar-ponto`, `desenhar-poligono` e `editar`; o resultado é GeoJSON `[lng, lat]` (10.2, 10.6) | Nomes dos modos, formato do resultado, eventos de edição | Ajustar 10.2 e 10.6 |
| C-62 | `CamadaMapa` com GeoJSON e `EstiloFeicao` por feição (`fill_color`, `stroke_color`, `fill_opacity`, `stroke_width`, `z_index`, `color`) (5.3, 10.2) | Campos exatos; ordem das camadas | Ajustar `contornos.estilo` |
| C-63 | Evento `urbi:mapa-viewport` com caixa e zoom (10.2) | Nome e conteúdo do evento; debounce | Ajustar o carregamento por viewport |
| C-64 | Camada com milhares de polígonos (hexágonos) e até 5 000 pontos, em canvas (6.2, 6.10; **P-17**) | Há limite ou orientação de desempenho? | Baixar `hex_max_celulas_resposta` e agregar em r8 mais cedo |
| C-65 | Raster, tiles, WMS, cluster e dois mapas sincronizados ficam no Futuro (10.2; **P-19**) | Algum desses existe? | Mantém no Futuro |
| C-66 | Clique numa feição abre a ficha; hover mostra rótulo (10.2) | Eventos de clique e hover | Ajustar 10.2 |
| C-67 | A legenda é exceção da app (10.1) | O mapa tem legenda nativa? | Se tiver, remover a exceção |
| C-68 | "Minha posição" no modo campo (10.10; **P-39**) | O mapa expõe geolocalização? | Posição digitada ou tocada no mapa |

### 5.13 Frontend: cliente, rotas e ambiente

| ID | A spec assume (§) | Pergunta | Se não confirmar |
|---|---|---|---|
| C-69 | `urbiVerso.api()` lança `Error` com `codigo` e `detalhes`; `urbiVerso.fetch()` para blob (6) | Assinaturas reais | Ajustar 6 |
| C-70 | Roteador de sub-rotas da app; estado de tela na querystring; link vindo de notificação abre a rota certa (10, 13) | Como a app declara sub-rotas e lê a querystring | Ajustar 10 |
| C-71 | Câmera e geolocalização do navegador funcionam no frontend da app, inclusive no celular (10.10; **P-39**) | Política de permissões do contêiner da app (iframe?) | Modo campo sem foto direta: anexar arquivo |
| C-72 | Os Markdown de `comum/ajuda/` entram no bundle do frontend e renderizam em `urbi-markdown` (10.1) | `urbi-markdown` aceita conteúdo local? Há restrição de links ou imagens? | Ajuda como texto em código |

### 5.14 Build, empacotamento e dependências

| ID | A spec assume (§) | Pergunta | Se não confirmar |
|---|---|---|---|
| C-73 | `pnpm build && pnpm exec urbi-empacotar inteligencia_imobiliaria`; frontend com `--external:@urbiverso/ui`; backend autocontido; Node 20 (3.1, 18.2) | Comandos e flags corretos | Ajustar 3.1 e 18.2 |
| C-74 | Bibliotecas de terceiros no bundle: `undici` (necessária), H3 (opcional), ZIP (opcional) (3.2, 6; **P-18**) | Política do kit para dependências; lista de proibidas | H3 já tem plano B (D-48); ZIP vira três downloads; `undici` sem permissão muda a coleta (registrar como D) |
| C-75 | Sem limite relevante de tamanho de bundle | Há limite? | Ajustar dependências |
| C-76 | Testes com `node --test` que só leem a pasta da app; CI do kit roda o empacotamento em todo PR (18) | Regras reais do guia de apps em repositório próprio | Ajustar 18 |

### 5.15 Limites de transporte

| ID | A spec assume (§) | Pergunta | Se não confirmar |
|---|---|---|---|
| C-77 | Polígono ad hoc vai na querystring como *encoded polyline*, com centenas de vértices (6, R-17) | Tamanho máximo de URL no gateway da instância | Polígono sempre salvo antes (como área de estudo temporária), e a rota recebe o id |
| C-78 | Corpo de `POST` com geometria e upload de KMZ de até 20 MB (6.1, 6.11) | Tamanho máximo do corpo | Ajustar os limites |
| C-79 | Respostas de até alguns MB (dossiê, 6 000 hexágonos); compressão (6.10, 6.11) | Tamanho máximo da resposta; existe gzip? | Paginar a camada hexagonal por blocos da viewport |
| C-80 | Rota síncrona de até ~10 s (dossiê, ficha); IA responde `202` e a tela acompanha (6.8, 21.1) | Timeout do gateway para rotas da app | Dossiê por bloco, em chamadas separadas |

### 5.16 Módulos, telemetria e integrações

| ID | A spec assume (§) | Pergunta | Se não confirmar |
|---|---|---|---|
| C-81 | Futuro: módulo `imobiliario` com `incorporacoes` e `imoveis`, via `dependencias` (D-06, 15.7) | Os contratos do módulo estão publicados? | Mantém no Futuro, com o achado |
| C-82 | Segregação por conta não é usada (3.2) | Algum framework a torna obrigatória? | Ajustar 3.2 |
| C-83 | Telemetria própria em `uso_eventos`, salvo se o shell já registrar uso por tela (5.23; **P-38**) | O shell tem auditoria ou uso por tela acessível à app? | Mantém `uso_eventos` |
| C-84 | Config nativa do shell mostra parâmetros, rotinas, IA, eventos, usuários e arquivos (10.8) | Abas reais da Config | Ajustar 10.8 |

---

## 6. Ordem de execução

Faça na ordem abaixo. Um bloco só começa quando o anterior tem veredito em todos os itens.

1. **Bloco 1, bloqueia as fases 0 e 1:** C-01 a C-22, C-23, C-24, C-25, C-51 a C-53, C-57 a
   C-63, C-69, C-70, C-73 a C-76.
2. **Bloco 2, coleta e rotinas (fase 3):** C-30 a C-37, C-48 a C-50.
3. **Bloco 3, grade analítica (fase 4A):** C-26 a C-29, C-64, C-79.
4. **Bloco 4, áreas, método e IA (fases 4B, 4C e 5):** C-38 a C-47, C-54 a C-56, C-66 a C-68,
   C-71, C-72, C-77, C-78, C-80, C-83, C-84.
5. **Bloco 5, futuro:** C-65, C-81, C-82.

Os cinco itens com maior chance de mudar o desenho, para olhar primeiro dentro de cada bloco:
- **C-51:** o gate de `POST` define se os cálculos são `GET`.
- **C-24:** delete por filtro define a troca de versão das tabelas grandes.
- **C-23 e C-26:** filtro por lista define o enriquecimento.
- **C-13:** o agendamento define a continuação das rotinas.
- **C-77:** o tamanho de URL define o polígono na querystring.

---

## 7. Entregáveis

### 7.1 `docs/CONFERENCIA_SDK.md`

Cabeçalho com:
- a versão do SDK conferida (instalada e publicada) e o shell espelhado;
- a data;
- a árvore de `docs/` do SDK;
- a lista dos docs lidos por inteiro.

Depois, uma tabela com uma linha por item:

| ID | Veredito | Evidência | Impacto na spec | Ação |
|---|---|---|---|---|
| C-23 | `confirmado_com_ajuste` | `docs/dados.md` › Contratos do framework: "trecho literal curto" | `in` existe com teto de 1 000 | 5.12: lote de 1 000; fecha P-16 |

Vereditos possíveis: `confirmado`, `confirmado_com_ajuste`, `ausente_no_sdk`, `contrariado`,
`ambiguo`. Um resumo no topo conta quantos de cada e lista os que mudaram o desenho.

### 7.2 A spec em v0.4

- Cabeçalho: `versão 0.4`, com a linha "Conferida contra `@urbiverso/sdk` X.Y.Z (shell A.B.C) em
  AAAA-MM-DD; relatório em `docs/CONFERENCIA_SDK.md`".
- Convenção do texto: trocar "vem dos docs de `docs/shell/` do UrbiVerso na versão 0.56.37" pela
  versão do SDK conferida.
- Todo `[CONFIRMAR SDK P-nn]`: remover, quando confirmado, ou trocar pelo plano B, quando não.
  Nenhum marcador sobra sem decisão.
- Seção 17: fechar P-16 a P-22, P-38 e P-39 (e P-05, se o C-05 responder) com uma linha "fechada
  em v0.4: …".
- Seção 16: cada ajuste de desenho vira D nova a partir de D-79, com alternativa descartada e
  motivo citando o item `C-nn`.
- Seção 20: riscos novos a partir de R-38.
- Seção 3.3: pisos corrigidos com os números publicados.
- Uma subseção "O que mudou da v0.3 para a v0.4" no topo, no mesmo formato das anteriores.

### 7.3 `docs/ISSUES_SHELL_SUGERIDAS.md`

Uma entrada por contrato `ausente_no_sdk` ou `ambiguo` que a app gostaria de ter, com:
- título;
- o que a app precisa;
- por que (seção da spec);
- a alternativa que a app adotou enquanto isso;
- o impacto de não ter o contrato.

A sessão não abre as issues; ela as escreve para o dono decidir.

---

## 8. Regras para editar a spec

- Siga as convenções da própria spec: português, `snake_case`, frações decimais, `null` para
  ausência, códigos `D-nn`, `P-nn` e `R-nn`.
- Não mude decisões de produto. Se um veredito obrigar a mudar uma decisão e não houver plano B
  escrito, pare e pergunte ao dono antes de editar.
- Não reescreva seções que a conferência não tocou. Não renumere seções existentes.
- Prefira o plano B que a spec já descreve em vez de inventar outro.
- Ao terminar, rode a mesma checagem de consistência da v0.3:
  - todo `D-nn`, `P-nn` e `R-nn` citado existe no registro;
  - nenhuma tabela Markdown tem linha com número de colunas diferente do cabeçalho;
  - não sobra `[CONFIRMAR SDK`.

---

## 9. Pronto quando

1. Os 84 itens têm veredito com evidência literal, ou `ambiguo` com a razão.
2. A spec está em v0.4, sem nenhum `[CONFIRMAR SDK` sem decisão, e passa na checagem de
   consistência.
3. O relatório diz qual superfície foi lida (versão instalada e publicada) e lista os docs lidos
   por inteiro.
4. A lista de issues sugeridas existe, mesmo que vazia.
5. O dono recebeu um resumo de no máximo uma tela: quantos itens confirmados, quantos mudaram o
   desenho e quais decisões novas foram registradas.

---

## 10. Fora do escopo desta sessão

Estes itens faltam na spec, mas **não** dependem do SDK. Se a sessão esbarrar num deles,
registra no relatório e segue.

| Item | Onde fica | Quem resolve |
|---|---|---|
| Desenho das telas (dossiê, ficha, portfólio, matriz, viabilidade) | seção 10 | sessão de design, com a spec v0.4 como base |
| Perguntas padrão de diligência por frente | P-40, `comum/diligencia.ts` | equipe de Novos Negócios + jurídico |
| Textos de "Como ler" de cada tela | D-77, `comum/ajuda/` | sessão de conteúdo |
| Instruções de sistema da IA dos quatro slots | P-02, seção 9.3 | sessão de conteúdo, refinada pela equipe na Config |
| Especificação do pipeline para os conjuntos novos e o manifest 2 | seção 12.4, `DATA_CONTRACT.md` do pipeline | sessão no repositório do pipeline |
| Estimativa de custo (tokens, armazenamento, tempo de carga) | seções 9.5 e 21 | depois da conferência, porque depende de C-28 e C-42 |
| Plano de implantação e treinamento | — | dono do produto |
| Decisões do dono | P-06, P-09, P-10, P-23 a P-25, P-28, P-35, P-37, P-41 | dono do produto |
| Acesso a dados externos | P-08, P-12 a P-15, P-31, P-33, P-34 | equipe, com os órgãos |
| Calibrações de método | P-27, P-29, P-32, P-36 | equipe, com dado real |
