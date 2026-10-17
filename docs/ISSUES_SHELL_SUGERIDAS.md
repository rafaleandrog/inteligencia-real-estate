# Issues sugeridas ao shell do UrbiVerso

Esta lista sai da conferência da spec v0.3/v0.4 contra o `@urbiverso/sdk` **100.0.0** (shell espelhado **0.56.37**), feita em 2026-10-17 na issue [#195](https://github.com/rafaleandrog/inteligencia-real-estate/issues/195) de `rafaleandrog/inteligencia-real-estate` (relatório em `docs/CONFERENCIA_SDK.md`, briefing em `docs/BRIEFING_CONFERENCIA_SDK.md` § 7.3). Cada entrada é um contrato que o SDK 100 não tem, não documenta ou documenta de forma ambígua e que a app gostaria de ter. **A app não abre essas issues**: o dono decide quais levar ao repositório do shell e com que redação. **Nenhuma bloqueia a V1** — todas têm plano B já incorporado à spec v0.4. As referências de linha da spec são as da v0.3, como no anexo do relatório.

## Índice

| # | Título | Item | Veredito | Prioridade sugerida |
|---|---|---|---|---|
| S-01 | Permitir mais de 20 itens no `nav` ou declarar o teto em `NavManifestoItem` | C-04 | `contrariado` | baixa |
| S-02 | Permitir dependência de ordem entre rotinas da mesma app | C-05 | `confirmado_com_ajuste` | baixa |
| S-03 | Permitir evento `interno: true` declarado por app | C-08 | `contrariado` | media |
| S-04 | Incluir `ui` e `parametros` no tipo `Manifesto` do SDK | C-09 | `confirmado_com_ajuste` | baixa |
| S-05 | Oferecer verbo para a app disparar a própria rotina | C-11 | `ambiguo` | media |
| S-06 | Documentar teto de valor `json` e de linha no framework de dados | C-20 | `ambiguo` | baixa |
| S-07 | Documentar teto de itens do filtro `IN` | C-23 | `confirmado_com_ajuste` | baixa |
| S-08 | Documentar limites de tempo e tamanho de `transaction()` | C-25 | `confirmado_com_ajuste` | media |
| S-09 | Aceitar parâmetro de lista no `sql_declarado` | C-26 | `confirmado_com_ajuste` | media |
| S-10 | Oferecer inserção em lote e orientação para tabela grande em `req.dados` | C-28 | `ambiguo` | media |
| S-11 | Expor `AbortSignal` ao handler de rotina no timeout de 15 min | C-30 | `confirmado_com_ajuste` | media |
| S-12 | Estender o advisory lock de rotina à continuação por listener | C-32 | `confirmado_com_ajuste` | media |
| S-13 | Expor o fuso da organização no `ContextoListener` | C-33 | `contrariado` | media |
| S-14 | Documentar o cap global de arquivo e aceitar stream em `req.arquivos.enviar` | C-35 | `ambiguo` | media |
| S-15 | Documentar o cap global de tamanho e a blacklist de mimes do upload | C-38 | `confirmado_com_ajuste` | media |
| S-16 | Oferecer cabeçalhos de cache no download de coluna `arquivo` | C-39 | `contrariado` | media |
| S-17 | Gerar PDF a partir de Markdown pelo framework de Arquivos | C-40 | `confirmado_com_ajuste` | baixa |
| S-18 | Documentar o que `log_ia` persiste e a retenção por provedor | C-46 | `ausente_no_sdk` | media |
| S-19 | Notificar a app quando um papel de app é concedido ou revogado | C-49 | `confirmado_com_ajuste` | media |
| S-20 | Documentar onde app em repositório próprio mantém o registro de exceções de UI | C-58 | `confirmado_com_ajuste` | baixa |
| S-21 | Embutir alternativa tabular ("ver tabela") nos `urbi-grafico-*` | C-60 | `ausente_no_sdk` | baixa |
| S-22 | Documentar a ordem `[lng, lat]` da geometria emitida pelo `urbi-mapa` | C-61 | `confirmado_com_ajuste` | baixa |
| S-23 | Permitir ordem de desenho por feição no `urbi-mapa` | C-62 | `contrariado` | baixa |
| S-24 | Documentar teto de feições por camada e oferecer marcador não-circular em canvas | C-64 | `confirmado_com_ajuste` | media |
| S-25 | Adicionar evento de hover ao `urbi-mapa` | C-66 | `confirmado_com_ajuste` | baixa |
| S-26 | Adicionar legenda nativa ao `urbi-mapa` | C-67 | `ausente_no_sdk` | baixa |
| S-27 | Adicionar camada "minha posição" e botão de localizar ao `urbi-mapa` | C-68 | `ausente_no_sdk` | baixa |
| S-28 | Documentar a política de permissões do navegador para o frontend das apps | C-71 | `ambiguo` | media |
| S-29 | Documentar os limites de transporte do servidor (URL, cabeçalhos) | C-77 | `ausente_no_sdk` | media |
| S-30 | Documentar teto de resposta e compressão HTTP para rotas de app | C-79 | `ambiguo` | media |
| S-31 | Documentar o timeout de requisição HTTP para rotas de app | C-80 | `ausente_no_sdk` | media |
| S-32 | Publicar no SDK o contrato do módulo `geo` e o `feicao_id` do imobiliário | P-49 (spec v0.6) | `ausente_no_sdk` | media |

Total: 32 (alta 0 · media 19 · baixa 13). A S-32 entrou na spec v0.6, fora da conferência da #195.

---

## S-01 — Permitir mais de 20 itens no `nav` ou declarar o teto em `NavManifestoItem`

- **Item da conferência:** C-04 (`contrariado`)
- **Contexto:** o teto existe só em prosa. `docs/overview.md` › Navegação declarativa › Regras — "Máximo de 20 itens no total (contando sub-itens)"; o tipo `NavManifestoItem` (`dist/index.d.ts`, l. 11002–11010) não o expressa — `titulo: string; rota?: string; icone?: string; itens?: NavManifestoItem[];`.
- **O que a app precisa:** ou um teto maior (a v0.3 desenhou 45 itens: 11 de topo + 34 sub-itens), ou o teto refletido no tipo/validação de build, para o erro aparecer na compilação e não no registro.
- **Por que (spec):** §4.1 `nav` (l. 423–497).
- **Plano B adotado na spec v0.4:** `nav` reduzido a ≤ 20 itens; Cadastro e Operação viram folhas e a navegação secundária delas passa a `urbi-abas` dentro de `/cadastro` e `/operacao` (D-86).
- **Impacto de não ter o contrato:** um nível de navegação a mais dentro das telas; o limite só é descoberto quando o manifesto reprova.
- **Prioridade sugerida:** baixa (o anexo diz: só se o plano B não servir).

## S-02 — Permitir dependência de ordem entre rotinas da mesma app

- **Item da conferência:** C-05 (`confirmado_com_ajuste`)
- **Contexto:** `docs/rotinas.md` › Declare no manifesto — "`frequencia` | `'diaria' | 'semanal' | 'mensal'` | sim | Cadência. Horário/dia são configurados pelo admin em runtime"; não há campo de dependência, e no catch-up cada rotina dispara "uma execução imediata no boot", sem ordem garantida.
- **O que a app precisa:** declarar que uma rotina roda depois de outra da mesma app (encadear `carregar_series_macro` após `fechar_mes`, e assim por diante).
- **Por que (spec):** §4.1 `rotinas` (l. 499–513) e observações (l. 526–529); §7 intro (l. 2800–2806); §7.11 (l. 2964); §14 (l. 3860).
- **Plano B adotado na spec v0.4:** ordem mensal por horas cheias distintas configuradas pelo admin, com guarda de pré-condição em cada rotina dependente (sai como `parcial` se o mês não fechou); fecha P-05 como "ordem por horário, sem dependência nativa". "Rodar agora" fica do admin da app (D-91).
- **Impacto de não ter o contrato:** a ordem depende de configuração manual do admin e de guardas espalhadas no código; no catch-up após downtime as rotinas podem rodar fora de ordem e sair `parcial`.
- **Prioridade sugerida:** baixa (sugerida no anexo).

## S-03 — Permitir evento `interno: true` declarado por app

- **Item da conferência:** C-08 (`contrariado`)
- **Contexto:** `docs/barramento.md` › Declare seus eventos — "**Não existe campo de manifesto que esconda um tipo da tela.** O catálogo do shell tem mais um campo — `interno` … e ele é **só do shell** … declarado num manifesto de app, é retirado no registro com um warn."
- **O que a app precisa:** declarar um tipo de evento consumido só pelo `reagir` da própria app (`continuar_coleta`), fora de Preferências e sem inscrição de usuário.
- **Por que (spec):** §13 (l. 3820–3850), em especial "`continuar_coleta` … não gera notificação".
- **Plano B adotado na spec v0.4:** `continuar_coleta` assumido como evento visível e inscrevível, com `conteudo`/`descricao` honestos para o operador e publicado só quando há continuação (D-85).
- **Impacto de não ter o contrato:** qualquer usuário com `leitura` pode seguir um evento técnico e receber "Continuação de {rotina}" a cada fatia; ruído em Preferências.
- **Prioridade sugerida:** media (sugerida no anexo).

## S-04 — Incluir `ui` e `parametros` no tipo `Manifesto` do SDK

- **Item da conferência:** C-09 (`confirmado_com_ajuste`)
- **Contexto:** `docs/overview.md` › Campos — "`ui` | boolean | não | Contrato de **validação** da UI…"; o campo e `parametros` estão documentados, mas o tipo `Manifesto` do SDK não os lista.
- **O que a app precisa:** que o tipo `Manifesto` reflita os campos documentados, para um `satisfies Manifesto` em TS não acusar erro.
- **Por que (spec):** §4.1 (l. 404–410, 525); §3.3.
- **Plano B adotado na spec v0.4:** manifesto continua em JSON sem checagem de tipo; §3.3 passa a dizer que a `versao` avança também com migração e com mudança de `shell_min`/`sdk_min`.
- **Impacto de não ter o contrato:** a app não pode validar o manifesto pelo tipo do SDK; divergência entre doc e tipo fica sem detecção.
- **Prioridade sugerida:** baixa (docs, sugerida no anexo).

## S-05 — Oferecer verbo para a app disparar a própria rotina

- **Item da conferência:** C-11 (`ambiguo`)
- **Contexto:** `docs/rotinas.md` › Para administradores — "**Rodar agora**: dispara fora de agenda (registra quem disparou)." (só na tela do admin); › Contratos — "**Não importar o motor/registry do shell** — apps só exportam `rotinas`; acesso a infraestrutura é anti-pattern".
- **O que a app precisa:** `ctx.rotinas.executar(nome)` (ou equivalente), executado com o advisory lock, o log da aba Rotinas e o corte de 15 min do framework.
- **Por que (spec):** §4.2 (l. 552); §6.9 (l. 2524, `POST /dados-publicos/carregar`).
- **Plano B adotado na spec v0.4:** a rota publica um evento com `agendar(…, { em: new Date() })` e o `reagir` executa a carga fora do request, com trava própria da app em `coletas` e `disparo: manual` (D-91).
- **Impacto de não ter o contrato:** a carga manual corre fora do lock e do log nativos, e a app reimplementa trava e registro.
- **Prioridade sugerida:** media (sugerida no anexo).

## S-06 — Documentar teto de valor `json` e de linha no framework de dados

- **Item da conferência:** C-20 (`ambiguo`)
- **Contexto:** `docs/banco-de-dados.md` › Tipos de coluna — "`json` | Dados estruturados livres | `JSONB`", sem teto; o único limite literal é `docs/overview.md` — "`413 CORPO_MUITO_GRANDE` | O corpo excede o teto de `100kb`".
- **O que a app precisa:** saber o tamanho máximo de um valor `json` e de uma linha, para dimensionar `geometria`, `resultado` e `conteudo`.
- **Por que (spec):** §5.13 (`celulas.geometria`, l. 1696); §5.23 (`cache_calculos.resultado`, l. 2331); §5.16 (`area_estudo_fichas.conteudo`, l. 1939); §5.3 (`contornos.geometria`, l. 819).
- **Plano B adotado na spec v0.4:** cache por bloco do dossiê, ficha guarda Markdown e números-chave; geometria desenhada vai em *encoded polyline* com teto de vértices; contorno grande só por upload; 21.2 cita o `413` (D-92).
- **Impacto de não ter o contrato:** a app dimensiona por prudência, sem saber se um valor grande gravado em processo falha.
- **Prioridade sugerida:** baixa.

## S-07 — Documentar teto de itens do filtro `IN`

- **Item da conferência:** C-23 (`confirmado_com_ajuste`)
- **Contexto:** `docs/banco-de-dados.md` › Filtro com vários valores vira `IN` — "Lista muito grande quase nunca é um filtro: é uma junção que ainda não foi escrita — o vocabulário para isso é `travessia`" (nenhum teto numérico).
- **O que a app precisa:** o número máximo de itens num filtro por array em igualdade.
- **Por que (spec):** §5.12 (l. 1656, `agrega_celula_metricas`, P-16); §6 Convenções (l. 2362–2363); §6.1 (filtros de bbox).
- **Plano B adotado na spec v0.4:** lotes de 500 ids por conservadorismo, com guarda contra lista vazia; agregação por célula em código sobre `varrerTudo` (D-83).
- **Impacto de não ter o contrato:** o tamanho do lote é palpite; um teto real menor quebraria a agregação sem aviso.
- **Prioridade sugerida:** baixa.

## S-08 — Documentar limites de tempo e tamanho de `transaction()`

- **Item da conferência:** C-25 (`confirmado_com_ajuste`)
- **Contexto:** `docs/banco-de-dados.md` › Trava de linha — "**A espera está dentro do request.** … mantenha a transação curta e sem I/O externo (chamada HTTP, IA, e-mail) entre a trava e o `COMMIT`." Nenhum limite numérico de tempo ou tamanho.
- **O que a app precisa:** os limites de duração e de volume de uma `transaction()` em `req.dados`/`ctx.dados`.
- **Por que (spec):** §6 Convenções (l. 2369–2371); §7 (rotinas que gravam lotes).
- **Plano B adotado na spec v0.4:** evento de barramento publicado depois do `COMMIT`; transação por lote de 500 sem HTTP nem IA dentro dela; "limite de tamanho/tempo não documentado" registrado como risco.
- **Impacto de não ter o contrato:** lotes grandes nas rotinas podem bater em limite desconhecido e falhar no meio da carga.
- **Prioridade sugerida:** media.

## S-09 — Aceitar parâmetro de lista no `sql_declarado`

- **Item da conferência:** C-26 (`confirmado_com_ajuste`)
- **Contexto:** `dist/index.d.ts` › `TipoParametroSql` — "type TipoParametroSql = 'texto' | 'inteiro' | 'decimal' | 'booleano' | 'data' | 'datahora';" — não existe tipo de lista, e `string_to_array` não está na allowlist de funções.
- **O que a app precisa:** parâmetro `inteiro[]`/`texto[]`, ou `string_to_array`/`regexp_split_to_table` na allowlist, para declarar `agrega_celula_metricas` sobre uma lista de células.
- **Por que (spec):** §5.12 (l. 1643–1662, em especial l. 1656); §3.2 (l. 352); §15.4A (l. 4013); P-16 (l. 4273).
- **Plano B adotado na spec v0.4:** agregação por célula em código, por `varrerTudo`/`listar` com filtro `IN` e soma no processo; alternativa de materializar `area_estudo_celulas` para `JOIN` em consulta declarada (D-83).
- **Impacto de não ter o contrato:** a agregação traz linhas para a memória do processo em vez de somar no banco; custo de memória e de tempo maior em áreas grandes.
- **Prioridade sugerida:** media.

## S-10 — Oferecer inserção em lote e orientação para tabela grande em `req.dados`

- **Item da conferência:** C-28 (`ambiguo`)
- **Contexto:** `docs/banco-de-dados.md` › Vocabulário estendido — "#### Escrita em lote — `atualizarVarios`, `removerVarios`, `deletarVarios`" (sem `criarVarios`); › `varrerTudo` — "**As linhas todas vão para a memória do processo.**" Nenhuma orientação de desempenho para tabela grande.
- **O que a app precisa:** `criarVarios` (ou upsert em lote) e orientação sobre índices, `COUNT` e memória para tabelas da ordem de um milhão de linhas.
- **Por que (spec):** §5.13 `celula_metricas` (l. 1718–1720, P-21); §7.5 (l. 2912–2917); R-19 (l. 4486); P-21 (l. 4278).
- **Plano B adotado na spec v0.4:** carga por `criarOuAtualizar` com chave natural, em lotes por cursor dentro de 15 min, com throughput medido na Pinguim na fase 4A; leitura acima de 100 mil linhas declara `maximo` explícito; P-21 vira medição.
- **Impacto de não ter o contrato:** um milhão de chamadas unitárias em janelas de 15 min é o gargalo da carga de `celula_metricas`, com várias continuações por mês.
- **Prioridade sugerida:** media (coordenar com o achado de C-24).

## S-11 — Expor `AbortSignal` ao handler de rotina no timeout de 15 min

- **Item da conferência:** C-30 (`confirmado_com_ajuste`)
- **Contexto:** `docs/rotinas.md` › Comportamento em falha — "Handler excede 15min | Registrada como falha por timeout; o trabalho em background pode continuar (por isso handlers devem ser idempotentes)"; o `ContextoListener` não traz sinal de cancelamento.
- **O que a app precisa:** um `AbortSignal` no `ctx` da rotina que dispare no corte, para gravar `interrompida` e parar o trabalho.
- **Por que (spec):** §7 preâmbulo (l. 2794–2810); §4.3 `orcamento_rotina_ms` (l. 570); §5.4 `coletas.status` (l. 1127).
- **Plano B adotado na spec v0.4:** a execução seguinte encontra a `coleta` ainda `executando` há mais de 15 min e a fecha como `interrompida`; orçamento próprio de 10 min; falha devolve `{ ok: false, erro }`.
- **Impacto de não ter o contrato:** o trabalho cortado segue em background e pode sobrepor a próxima execução; o status `interrompida` é gravado com atraso.
- **Prioridade sugerida:** media.

## S-12 — Estender o advisory lock de rotina à continuação por listener

- **Item da conferência:** C-32 (`confirmado_com_ajuste`)
- **Contexto:** `docs/rotinas.md` › Funcionamento do framework — "**Sem execução sobreposta** — advisory lock por rotina cobre multi-instância e timer duplicado."; o lock não cobre listeners, e `docs/barramento.md` › Agendamento — "**Garantia de entrega: at-least-once por linha.**"
- **O que a app precisa:** que o lock da rotina valha também para o listener que a app designe como continuação, ou um `ctx.rotinas.travar(nome)`.
- **Por que (spec):** §7 preâmbulo (l. 2801–2806); §4.2 `reagir` (l. 553–558); §5.4 `cursores_rotina` (l. 1154–1158).
- **Plano B adotado na spec v0.4:** trava própria obrigatória em `cursores_rotina` (`em_execucao_desde`, `coleta_id`), adquirida com `atualizarSe`/`transaction` e expiração de 15 min (D-85).
- **Impacto de não ter o contrato:** a app reimplementa exclusão mútua com expiração; erro na trava própria gera cargas sobrepostas.
- **Prioridade sugerida:** media.

## S-13 — Expor o fuso da organização no `ContextoListener`

- **Item da conferência:** C-33 (`contrariado`)
- **Contexto:** `dist/index.d.ts` › `ContextoRequest` — "/** Fuso IANA da organização. Usar em corte de dia: intervaloDoDia(data, req.contexto.fuso). */ fuso?: string;"; o `ContextoListener` não tem `fuso` nem relógio, embora a rotina seja agendada "no fuso da organização".
- **O que a app precisa:** `ctx.fuso` em rotina, listener, webhook e `aoIniciar`.
- **Por que (spec):** §7 preâmbulo e §7.4 passo 1 (l. 2883); §21.3 (l. 4530–4534); §4.2 (l. 551); P-05 (l. 4263).
- **Plano B adotado na spec v0.4:** parâmetro `fuso_organizacao` (padrão `America/Sao_Paulo`) lido por `ctx.parametros.obter` e aplicado com `intervaloDoDia()` do SDK (D-84).
- **Impacto de não ter o contrato:** o fuso fica duplicado num parâmetro da app e pode divergir do fuso da organização sem aviso, deslocando cortes de mês e de dia.
- **Prioridade sugerida:** media.

## S-14 — Documentar o cap global de arquivo e aceitar stream em `req.arquivos.enviar`

- **Item da conferência:** C-35 (`ambiguo`)
- **Contexto:** `dist/index.d.ts` › `HelperArquivos` — "/** Salva um buffer em staging (expira em 10 min). Retorna `upload_id`. */ enviar(params: { …; buffer: Buffer; })"; `docs/banco-de-dados.md` — "`tamanho_max_mb` … Teto absoluto é o cap global da instância" (valor não publicado).
- **O que a app precisa:** o valor default do cap global e um `enviar` que aceite caminho ou stream, sem carregar o arquivo inteiro na memória.
- **Por que (spec):** §7.5 (l. 2903–2919); §5.10 `conjunto_arquivos.arquivo` (l. 1541); §12.3 (l. 3781–3790).
- **Plano B adotado na spec v0.4:** um arquivo por vez em memória; `DADOS_ARQUIVO_MUITO_GRANDE` tratado como falha do conjunto; teto configurável `arquivo_max_mb` (padrão 50); leitura por fluxo a partir de `caminho_fs`; conferência do cap na Pinguim na fase 0.
- **Impacto de não ter o contrato:** arquivos de dezenas de MB passam por buffer no mesmo processo do shell e de todas as apps; 50 MB pode estar acima do cap sem que a spec saiba.
- **Prioridade sugerida:** media.

## S-15 — Documentar o cap global de tamanho e a blacklist de mimes do upload

- **Item da conferência:** C-38 (`confirmado_com_ajuste`)
- **Contexto:** `docs/banco-de-dados.md` › Validação de upload (cascata) — "1. Mime type — bloqueado pelo global (blacklist) **ou** fora da whitelist da coluna → `DADOS_MIME_INVALIDO` (422) 2. Tamanho — excede global **ou** excede cap da coluna → `DADOS_ARQUIVO_MUITO_GRANDE` (413)"; nem o valor default nem onde o admin altera são documentados.
- **O que a app precisa:** o cap default, a blacklist default e a tela onde o admin os altera, para dimensionar colunas de 20/50 MB e orientar o admin.
- **Por que (spec):** §6.1, §6.11, §6.17, §11.1; §5.3 `contornos.arquivo_origem` (20 MB), §5.11 `importacoes.arquivo` e §5.10 `conjunto_arquivos.arquivo` (50 MB).
- **Plano B adotado na spec v0.4:** a prévia grava o `upload_id` na hora (o aplicar recebe o id do registro); 21.2 registra que 20/50 MB dependem do cap da instância; a tela mostra `DADOS_ARQUIVO_MUITO_GRANDE` e 6.22 acrescenta `ARQUIVOS_UPLOAD_EXPIRADO` e `ARQUIVOS_UPLOAD_DE_OUTRO_USUARIO`.
- **Impacto de não ter o contrato:** o teto declarado na coluna pode ser cortado pela instância sem aviso, e KMZ pode cair na blacklist sem que a app saiba.
- **Prioridade sugerida:** media.

## S-16 — Oferecer cabeçalhos de cache no download de coluna `arquivo`

- **Item da conferência:** C-39 (`contrariado`)
- **Contexto:** `docs/banco-de-dados.md` › Tipo de coluna `arquivo` — "**A app nunca manipula multipart. Nunca escreve no filesystem. Nunca serve bytes diretamente.**"; o endpoint de download documenta `nosniff` e `Content-Disposition`, mas nenhum `ETag` nem `Cache-Control`.
- **O que a app precisa:** `ETag`/`Cache-Control` no download genérico, opcionais por coluna ou por token assinado, para shards GeoJSON imutáveis.
- **Por que (spec):** §6.7, §5.10 `conjunto_arquivos`, §12.3 (l. ~1540, ~2491, ~3787).
- **Plano B adotado na spec v0.4:** a rota da app vira resolvedor `{ arquivo_id, sha256, bytes, url }` com `req.arquivos.url`; o frontend baixa por `urbiVerso.fetch` e memoiza por `sha256` na sessão (D-81).
- **Impacto de não ter o contrato:** cada sessão rebaixa os shards ao menos uma vez; sem cache HTTP entre sessões.
- **Prioridade sugerida:** media.

## S-17 — Gerar PDF a partir de Markdown pelo framework de Arquivos

- **Item da conferência:** C-40 (`confirmado_com_ajuste`)
- **Contexto:** o bundle não menciona geração de PDF ou Word (a busca por pdf/docx/puppeteer/pdfkit só acha o viewer de PDF e o magic byte do wh); `docs/apps-em-repo-proprio.md` — "**Backend 100% self-contained.**"
- **O que a app precisa:** `req.arquivos.gerarPdf` (ou similar) a partir de Markdown, para a ficha de área de estudo.
- **Por que (spec):** §6 (convenções, P-18), §11.2, §10.10 (ficha PDF/Word, P-20), §6.11.
- **Plano B adotado na spec v0.4:** ficha em Markdown, CSV e pacote ZIP (biblioteca embutida no bundle); PDF/Word ficam no Futuro (D-93).
- **Impacto de não ter o contrato:** o usuário não recebe ficha pronta para imprimir ou enviar; quem precisar converte fora da plataforma.
- **Prioridade sugerida:** baixa.

## S-18 — Documentar o que `log_ia` persiste e a retenção por provedor

- **Item da conferência:** C-46 (`ausente_no_sdk`)
- **Contexto:** `docs/ia.md` › Funcionamento do framework — "**Log de uso** — todas as chamadas são gravadas em `shell.log_ia` com `slot_pedido` e `slot_usado` (mais `duracao_ms` …)"; o doc não diz se o contexto é guardado nem trata de retenção pelo provedor.
- **O que a app precisa:** saber o que o shell persiste de cada chamada e ter orientação sobre retenção e uso de dados por provedor.
- **Por que (spec):** §22.2 (l. ~4570).
- **Plano B adotado na spec v0.4:** 22.2 registra que a política é a do contrato do administrador com o provedor de cada slot; a app não liga `cache` nas consultas de análise e mantém a regra de nunca pôr nome de pessoa no contexto; risco novo registrado.
- **Impacto de não ter o contrato:** a app não consegue afirmar ao usuário onde e por quanto tempo o conteúdo enviado à IA fica guardado.
- **Prioridade sugerida:** media.

## S-19 — Notificar a app quando um papel de app é concedido ou revogado

- **Item da conferência:** C-49 (`confirmado_com_ajuste`)
- **Contexto:** `docs/barramento.md` › Via eventos — "**Permissão revogada:** se o usuário perdeu acesso, a notificação não é entregue, mas a inscrição permanece"; a entrega só reconfere `leitura`, não o papel.
- **O que a app precisa:** hook ou evento injetado quando um papel da app (ex.: `curador`) é concedido ou revogado, para ajustar inscrições por `escopo`.
- **Por que (spec):** §13 (l. 3839–3841); D-52 (l. 3847–3849).
- **Plano B adotado na spec v0.4:** o `aoIniciar` reconcilia as inscrições de `escopo = 'curador'` a cada boot, e a rotina diária `verificar_frescor` repete a reconciliação.
- **Impacto de não ter o contrato:** um ex-curador com `leitura` segue recebendo `lacuna_cadastro` até o próximo boot ou a próxima execução diária.
- **Prioridade sugerida:** media.

## S-20 — Documentar onde app em repositório próprio mantém o registro de exceções de UI

- **Item da conferência:** C-58 (`confirmado_com_ajuste`)
- **Contexto:** `docs/ui.md` › Registro de exceções — "Vale para quem a gente olha (shell + app sob o contrato). Exceção nova = linha nesta tabela **no mesmo PR** do HTML."; a tabela canônica mora no `ui.md` do shell, e o local para app de repositório próprio não é dito.
- **O que a app precisa:** o arquivo e o formato onde a app de repositório próprio registra suas exceções.
- **Por que (spec):** §10.1 (l. 3322–3326 e 3348–3350).
- **Plano B adotado na spec v0.4:** a app mantém `docs/ui-excecoes.md` com a mesma tabela de três colunas (Superfície · Por quê · O que pode), com as linhas de dispersão e legenda com amostra de cor; a régua sai.
- **Impacto de não ter o contrato:** o registro da app pode não ser o que o revisor do shell procura; risco de a exceção ser lida como violação.
- **Prioridade sugerida:** baixa.

## S-21 — Embutir alternativa tabular ("ver tabela") nos `urbi-grafico-*`

- **Item da conferência:** C-60 (`ausente_no_sdk`)
- **Contexto:** `docs/ui-componentes-conteudo.md` › Família `urbi-grafico-*` › Acessibilidade — "`<svg role="img" aria-label="…">` com label calculado … Cada elemento interativo … tem `<title>` filho" (nenhuma tabela alternativa).
- **O que a app precisa:** uma alternativa tabular acessível embutida no primitivo de gráfico.
- **Por que (spec):** §21.5 (l. 4542–4545); §10.1 (l. 3357).
- **Plano B adotado na spec v0.4:** "ver tabela" é um `urbi-tabela` montado pela app a partir de `categorias`/`series`, com helper em `frontend/comum/` e alternância por `urbi-botao-alternar` (D-94).
- **Impacto de não ter o contrato:** cada app reimplementa a alternativa, com risco de divergência de comportamento entre apps.
- **Prioridade sugerida:** baixa.

## S-22 — Documentar a ordem `[lng, lat]` da geometria emitida pelo `urbi-mapa`

- **Item da conferência:** C-61 (`confirmado_com_ajuste`)
- **Contexto:** `dist/index.d.ts` — "`type Posicao = [number, number] | [number, number, number];`" e l. 6138 — "`centro` … `[lat, lng]`"; a ordem das coordenadas emitidas em `urbi:mapa-geometria` não está escrita.
- **O que a app precisa:** a ordem documentada (presumivelmente `[lng, lat]`, GeoJSON) da geometria emitida.
- **Por que (spec):** §10.2 (l. 3429–3431); §10.6 (l. 3525–3531).
- **Plano B adotado na spec v0.4:** a geometria recebida passa pela validação de faixa de 5.3 antes de gravar (latitude fora de [-90, 90] denuncia inversão); edição de vértices restrita a geometrias simples.
- **Impacto de não ter o contrato:** a app depende de heurística de faixa; em áreas onde lat e lng caem ambas na faixa válida, uma inversão passaria.
- **Prioridade sugerida:** baixa.

## S-23 — Permitir ordem de desenho por feição no `urbi-mapa`

- **Item da conferência:** C-62 (`contrariado`)
- **Contexto:** `dist/index.d.ts` › `EstiloFeicao` (l. 6078–6095) não tem `z_index`; l. 6133 — "Camadas em ordem de desenho (primeira por baixo, última por cima)."
- **O que a app precisa:** ordem de desenho por feição dentro de uma camada (equivalente a z-index).
- **Por que (spec):** §5.3 `contornos.estilo` (l. 824); §6.1 (l. 2400); §10.2 (l. 3366, 3381).
- **Plano B adotado na spec v0.4:** `contornos.estilo` passa aos campos do SDK, `z_index` é substituído por `ordem_camada` e a ordem vem do array `camadas` (D-87).
- **Impacto de não ter o contrato:** contornos que precisam de ordem própria viram camadas separadas, multiplicando camadas no mapa.
- **Prioridade sugerida:** baixa.

## S-24 — Documentar teto de feições por camada e oferecer marcador não-circular em canvas

- **Item da conferência:** C-64 (`confirmado_com_ajuste`)
- **Contexto:** `docs/ui-componentes-conteudo.md` › `urbi-mapa` › Estilo — "`quadrado` e `losango` são **elementos DOM** … por serem DOM, não convêm a camadas com milhares de pontos."; o propósito de "milhares de polígonos" é citado sem número.
- **O que a app precisa:** teto prático de feições por camada e marcadores `quadrado`/`losango` desenhados em canvas.
- **Por que (spec):** §10.2 camadas 8 e 9 (l. 3379–3380, 3420–3422); §6.2 (l. 2413, teto 5 000); §4.3 `hex_max_celulas_resposta` (l. 584); §15.4A (l. 4028, P-17); R-20 (l. 4487).
- **Plano B adotado na spec v0.4:** todos os pontos em `circulo` com precisão codificada por atributo de canvas (`contorno`, `espessura`, `marcador.tamanho`); `losango`/`quadrado` só em camadas pequenas; P-17 fica como medição na fase 4A.
- **Impacto de não ter o contrato:** a distinção visual entre anúncio exato e aproximado fica menos legível; o teto de 6 000 células é medido, não garantido.
- **Prioridade sugerida:** media.

## S-25 — Adicionar evento de hover ao `urbi-mapa`

- **Item da conferência:** C-66 (`confirmado_com_ajuste`)
- **Contexto:** `docs/ui-componentes-conteudo.md` › `urbi-mapa` › Eventos — "**Eventos** (todos `bubbles` + `composed`; sem evento de hover):".
- **O que a app precisa:** `urbi:mapa-hover`, com debounce, para rótulo flutuante sob o ponteiro.
- **Por que (spec):** §10.2 (l. ~3359–3415).
- **Plano B adotado na spec v0.4:** rótulo permanente por `estilo.rotulo` acima de um zoom, ou informação no painel ao clicar; a pilha de feições do clique dispensa a regra antiga da camada 2.
- **Impacto de não ter o contrato:** explorar o mapa exige clique onde bastaria passar o mouse; rótulos permanentes poluem zooms intermediários.
- **Prioridade sugerida:** baixa.

## S-26 — Adicionar legenda nativa ao `urbi-mapa`

- **Item da conferência:** C-67 (`ausente_no_sdk`)
- **Contexto:** `docs/ui-componentes-conteudo.md` › `urbi-mapa` — "Visualizador puro de geometria sobre mapa base … Edição completa de vértices, medição, hachura, clusters, temático e geocoding ficam fora"; a tabela de props não tem legenda.
- **O que a app precisa:** prop `legenda: { titulo, itens: [{ cor, rotulo }] }` por camada.
- **Por que (spec):** §10.1 (l. ~3325); §10.2 Legenda (l. ~3415).
- **Plano B adotado na spec v0.4:** legenda com amostras de cor como exceção registrada da app, apoiada em `ui.md` § registro de exceções (D-94).
- **Impacto de não ter o contrato:** HTML próprio da app sob exceção de UI, a manter e revisar por fora do catálogo.
- **Prioridade sugerida:** baixa.

## S-27 — Adicionar camada "minha posição" e botão de localizar ao `urbi-mapa`

- **Item da conferência:** C-68 (`ausente_no_sdk`)
- **Contexto:** `docs/ui-componentes-conteudo.md` › `urbi-mapa` — "`mapaLeaflet` é escape hatch, **não contrato**"; os métodos (`enquadrar`, `concluir`, `cancelar`) não incluem geolocalização.
- **O que a app precisa:** camada de posição do aparelho e botão de localizar no primitivo.
- **Por que (spec):** §10.10 (modo campo, P-39, l. ~3609–3611); §6.17 (`/observacoes` com `latitude`/`longitude`/`precisao_m`, l. ~2630).
- **Plano B adotado na spec v0.4:** a app lê `navigator.geolocation` e, falhando, oferece `modo="desenhar-ponto"` para tocar a posição, com `precisao_m` nulo (D-94).
- **Impacto de não ter o contrato:** a app desenha a posição como camada de ponto própria e trata permissão e erro sozinha.
- **Prioridade sugerida:** baixa.

## S-28 — Documentar a política de permissões do navegador para o frontend das apps

- **Item da conferência:** C-71 (`ambiguo`)
- **Contexto:** `docs/ui-componentes-conteudo.md` › Microfone — "**Gravação.** `getUserMedia` + `MediaRecorder` …" (o shell usa mídia no frontend), mas nenhum doc do bundle fala de `Permissions-Policy`, câmera ou geolocalização.
- **O que a app precisa:** a política vigente (e o compromisso de mantê-la) para câmera, microfone e geolocalização no frontend das apps.
- **Por que (spec):** §10.10 (modo campo: foto e posição), P-39 (l. ~3609–3611).
- **Plano B adotado na spec v0.4:** foto por `<input type="file" accept="image/*" capture="environment">` e posição por `navigator.geolocation` com fallback de toque no mapa; `Permissions-Policy` restritivo futuro registrado como risco; P-39 fechada.
- **Impacto de não ter o contrato:** uma mudança de cabeçalho na instância pode desligar o modo campo sem passar por obsolescência.
- **Prioridade sugerida:** media.

## S-29 — Documentar os limites de transporte do servidor (URL, cabeçalhos)

- **Item da conferência:** C-77 (`ausente_no_sdk`)
- **Contexto:** `docs/overview.md` › `urbiVerso.fetch()` — a tabela de erros do parser lista apenas `413 CORPO_MUITO_GRANDE`, `400 CORPO_INVALIDO`, `400 CORPO_TAMANHO_INVALIDO`, `415 CHARSET_NAO_SUPORTADO`, `415 ENCODING_NAO_SUPORTADO`, `400 URL_INVALIDA` — "nenhum limite de comprimento de URL ou de cabeçalho".
- **O que a app precisa:** comprimento máximo de URL e de cabeçalhos aceitos pela instância (Node e proxy); o anexo pede junto o timeout de requisição (ver S-31).
- **Por que (spec):** §6 (polígono em *encoded polyline* na querystring); §6.10 `/territorio/enriquecer?poligono=`; §10.2; R-17 (l. ~2382–2385, ~2532, ~3431, ~4484).
- **Plano B adotado na spec v0.4:** polyline na querystring com teto de 300 vértices (≈ 2 KB); acima disso a tela salva área de estudo temporária e passa `area_estudo_id`; 21.2 assume 8 KB de URL (D-92).
- **Impacto de não ter o contrato:** o teto de vértices é conservador por palpite; um proxy mais restritivo quebraria o enriquecimento por polígono.
- **Prioridade sugerida:** media.

## S-30 — Documentar teto de resposta e compressão HTTP para rotas de app

- **Item da conferência:** C-79 (`ambiguo`)
- **Contexto:** busca no bundle por `gzip\|compress` só casa `docs/distribuicao.md` (formato do pacote); "nenhum doc fala de tamanho máximo de resposta nem de compressão de resposta". O único limite de transporte documentado é `413 CORPO_MUITO_GRANDE` (100 kB, corpo da requisição).
- **O que a app precisa:** teto de tamanho de resposta e se a instância comprime respostas (gzip/brotli) de rotas de app.
- **Por que (spec):** §6 Convenções (exportação até 50 000 linhas, l. 2371–2374); §6.10 (l. 2531); §6.11; §4.3 `hex_max_celulas_resposta` (l. 584); §21.1 (l. 4515).
- **Plano B adotado na spec v0.4:** em `/territorio/celulas`, geometria estática por bloco, memoizada por `h3`, e valores pequenos por viewport; exportações servidas como stream e lidas por `urbiVerso.fetch(...).blob()`, sem assumir gzip; alvo de 1,5 s vale sem compressão.
- **Impacto de não ter o contrato:** respostas de vários MB por viewport sem garantia de compressão; a app fragmenta para se proteger.
- **Prioridade sugerida:** media.

## S-31 — Documentar o timeout de requisição HTTP para rotas de app

- **Item da conferência:** C-80 (`ausente_no_sdk`)
- **Contexto:** o bundle só documenta os tetos de rotina (`docs/rotinas.md` — "**Terminar em 15 minutos**") e de IA (`docs/ia.md` — "| Timeout | Timeout máximo por request (segundos) | `120` |"); não há timeout de rota HTTP síncrona, nem do Node, nem do proxy.
- **O que a app precisa:** o timeout de requisição para rotas de app no servidor e o recomendado para o proxy da instância.
- **Por que (spec):** §6.8 (`POST /analises/*` em `202`); §21.1 (dossiê 8 s, ficha 10 s); §6.11 (l. ~2503–2508, ~4510–4522).
- **Plano B adotado na spec v0.4:** IA por `consultarAsync` com evento de callback declarado (`analise_concluida`) e resposta `202`; a rotina mensal enfileira em vez de esperar; dossiê calculado por bloco em chamadas separadas quando passar de ~8 s (D-82).
- **Impacto de não ter o contrato:** rotas síncronas mais longas (dossiê) ficam sem garantia de não serem cortadas pelo proxy.
- **Prioridade sugerida:** media.

## S-32 — Publicar no SDK o contrato do módulo `geo` e o `feicao_id` do imobiliário

- **Item:** P-49 da spec v0.6 (`ausente_no_sdk`); não vem da conferência da #195.
- **Contexto:** o SDK 100 documenta o imobiliário 1.0.0, cujo supertipo de imóvel só tem `matricula_id` e `area` (`docs/nucleo.md` › Imóveis); o tipo `geometria` é só de módulo (`docs/banco-de-dados.md`). A geometria do lote mora no módulo `geo` (feições), e o imobiliário 1.3.0 guarda o `feicao_id`, mas a busca por `feicao_id` e por `geo` no bundle dá zero ocorrências. A Pinguim já roda `geo` 1.0/1.1 e `imobiliario` 1.3.0 (UP-Urbita/urbigis#18). O filtro `bbox` das listagens do imobiliário responde `501`.
- **O que a app precisa:** a identidade e as entidades do `geo` que uma app pode declarar em `dependencias`, a rota de leitura da feição (por id e por caixa), o formato da geometria devolvida (GeoJSON, `[lng, lat]`, EPSG:4326) e o `feicao_id` no payload de lote, gleba e unidade do imobiliário, com a versão mínima de cada um.
- **Por que (spec):** §1.3 e §5.1 (separação de origens; D-136), §5.25 (vínculo e cliente do núcleo; D-138, D-140), §10.2 (camada Núcleo) e §10.14 (ficha do objeto); D-141.
- **Plano B adotado na spec v0.6:** a camada Núcleo desenha os objetos da app que têm vínculo pela geometria da própria app (polígono do contorno ou da área de estudo, ponto do lote Terracap ou do lançamento), com selo e legenda "traçado da pesquisa, não o oficial do lote"; não usa `bbox` do imobiliário nem componente `imobiliario-*`; o traçado oficial entra quando o contrato estiver publicado, lido ao vivo e nunca copiado.
- **Impacto de não ter o contrato:** o mapa não mostra o lote registrado, e o polígono da pesquisa pode divergir dele sem que a tela mostre; a conferência entre os dois fica visual e fora da app.
- **Prioridade sugerida:** media.
