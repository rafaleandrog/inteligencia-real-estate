# AGENTS.md

Porta de entrada para qualquer agente de IA que trabalhe neste repositório.
Regras detalhadas: [`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md) — **fonte canônica**.

Se outra ferramenta exigir arquivo próprio (`CLAUDE.md`, `.cursorrules`, etc.), esse arquivo deve
**apontar para cá**, nunca repetir as regras. Política duplicada é política dessincronizada.

## O que é este projeto

Aplicação pública de inteligência do mercado imobiliário do Distrito Federal.

```
Google Sheets  →  navegador (JS nativo + Leaflet)  →  GitHub Pages
```

Estática, sem build, sem backend obrigatório. **Código mora no GitHub. Dados moram na Google Sheet.**

## Antes de mudar qualquer coisa

1. Leia o [`README.md`](README.md).
2. Se for mexer em ingestão, schema, CSV ou planilha: leia [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md) **antes**.
3. Se for mexer no Apps Script: leia [`docs/SHEET_SETUP.md`](docs/SHEET_SETUP.md).
4. Escolha a skill certa em [`.agents/skills/`](.agents/skills/) e siga o workflow dela.

## Obrigações inegociáveis

- **Nunca declare um bug corrigido sem reproduzir o comportamento antes e depois.** "Deve estar
  resolvido" não é uma conclusão aceitável.
- **Nunca altere o schema em silêncio.** Renomear um cabeçalho sem atualizar contrato, loader,
  validação e testes é a falha mais cara possível aqui.
- **Nunca commite secret.** Chave de API, token do Google, token do GitHub — nada disso entra no
  repositório nem em `src/config.js`. O ID da planilha e a URL do `/exec` são públicos por design;
  qualquer outra coisa não é.
- **Preserve [`reference/index-v3.html`](reference/index-v3.html).** É a referência funcional do
  modelo anterior e a origem do dataset. Não reescreva, não reformate, não apague.
- **Mantenha o diff pequeno.** Não misture refatoração ampla com feature pequena.
- **Rode os testes** (`npm test`) depois de qualquer mudança em código.
- **Aba escondida da planilha não é segurança.** Tudo que o navegador lê é público.

## Ao terminar, relate sempre

- arquivos modificados;
- testes executados e o resultado real;
- o que você verificou manualmente;
- riscos que permanecem.

Pendência real se declara. Não se esconde atrás de "feito".

## Code Review Rules

Esta seção é lida pelo Codex ao revisar PRs deste repositório. Priorize nesta ordem e reporte
apenas o que for material — não elogie genericamente.

1. **Regressões** — algo que funcionava e parou.
2. **Bugs e casos extremos** — registro sem coordenada, sem preço, campo nulo, array vazio,
   número em formato brasileiro (`"R$ 1.234,56"`), data fora do padrão, divisão por zero em
   preço/m², mediana de lista vazia.
3. **Contrato de dados** — cabeçalho renomeado, campo removido, tipo alterado ou aba obrigatória
   tratada como opcional sem atualizar `docs/DATA_CONTRACT.md` na mesma PR.
4. **Segurança** — secret versionado; string de dado indo para `innerHTML` sem escaping; link
   externo sem `rel="noopener noreferrer"`; URL sem validação de esquema (só `http`/`https`);
   parâmetro do Apps Script sem allowlist; qualquer escrita pública na planilha.
5. **Semântica de qualidade espacial** — `confidence_flag` e `coordinate_precision` precisam
   sobreviver ao pipeline. **Coordenada aproximada nunca pode ser apresentada como endereço
   exato.** A maioria dos listings usa centroide de localidade com jitter.
6. **Google Sheets / GViz** — parsing do envelope, aba ausente, célula vazia, tipo de coluna.
   Aba **opcional** ausente é warning, nunca erro fatal.
7. **Apps Script** — idempotência, `LockService` onde há escrita concorrente, endpoint read-only
   com allowlist, segredo em Script Properties e nunca em célula.
8. **GitHub Pages** — caminho relativo, ausência de build, nada que dependa de servidor.
9. **Loading e error state** — `Promise` sem `catch`, falha de rede levando a tela branca.
10. **Mobile** — usável em 390 px de largura.
11. **Performance** — trabalho desnecessário no loop de render ou no filtro.

Se não houver problema relevante, **diga explicitamente que não encontrou regressões materiais**.

### Orçamento de rodadas — no máximo 3

Revisão é para destravar entrega, não para virar processo. Uma PR se resolve em **até três
rodadas**, com escopo decrescente:

| Rodada | Escopo |
|---|---|
| **1ª** | **Exaustiva.** Levante tudo agora — P0 a P3. Um achado que só aparece na 3ª rodada era um achado que faltou na 1ª. |
| **2ª** | **Só o que mudou.** Confirme as correções e aponte apenas problemas **novos introduzidos por elas**. Não reabra tema já resolvido nem reformule achado anterior. |
| **3ª** | **Só bloqueio.** Apenas **P0 e P1** remanescentes. P2 e P3 nesta altura não seguram o merge — viram item de backlog. |

Depois da 3ª rodada a PR entra em `main` se não houver P0 nem P1 em aberto.

**O ciclo roda sozinho.** Abrir a PR, pedir a revisão, corrigir, pedir de novo e fazer o merge
são passos do processo — não decisões a submeter ao responsável a cada rodada. Fale com ele
quando o trabalho terminar, quando houver bloqueio que você não pode resolver, ou quando surgir
uma decisão de produto que mude o que deve ser construído (R7.7).

**Cada achado é independente e resolvível sozinho:** um arquivo, um problema, uma correção.
Não agrupe três defeitos num comentário só, e não divida um mesmo defeito em três comentários.
Se dois achados exigem a mesma correção, são um achado.

Quem implementa tem a contrapartida: **corrigir todos os achados de uma rodada em um único push**,
com evidência de reprodução quando o achado for de comportamento.
