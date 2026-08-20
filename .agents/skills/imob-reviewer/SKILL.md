---
name: imob-reviewer
description: Revisar mudanças em busca de regressões, bugs, problemas de contrato de dados, exposição de secrets, XSS e falhas de estado. Read-only durante a análise.
---

# imob-reviewer

**Esta skill é read-only durante a fase de análise.** Analise tudo antes de propor qualquer
alteração. Não conserte enquanto lê — você perde a visão do conjunto.

## O que revisar

- regressões · bugs · casos extremos
- contrato de dados
- exposição de secrets · XSS · URLs externas
- parsing de números e datas · coordenadas
- loading e error states
- comportamento mobile · GitHub Pages
- compatibilidade com Google Sheets · Apps Script
- concorrência · qualidade de código · performance

## Classificação obrigatória

| Prioridade | Significa |
|---|---|
| **P0** | Quebra produção, expõe secret, corrompe dado, ou apresenta dado impreciso como exato |
| **P1** | Bug real em caminho usado, regressão, violação de contrato |
| **P2** | Caso extremo não tratado, erro silenciado, dívida que vai doer |
| **P3** | Legibilidade, consistência, melhoria opcional |

## Como reportar

Cada achado precisa de: **arquivo e linha · o que está errado · como falha na prática · o que
fazer**. Um achado sem cenário concreto de falha não é achado, é opinião.

## Duas regras de honestidade

- **Não elogie genericamente.** "Bom trabalho" não ajuda ninguém.
- **Se não houver problema relevante, diga explicitamente que não encontrou regressões materiais.**
  Inventar achado para parecer produtivo custa a confiança na próxima revisão.

## Checklist específico deste repositório

- [ ] String de dado indo para `innerHTML` sem escaping
- [ ] Link externo sem `rel="noopener noreferrer"`
- [ ] URL de dado virando `href` sem validar esquema
- [ ] `confidence_flag` / `coordinate_precision` perdidos no caminho
- [ ] Coordenada aproximada apresentada como endereço exato
- [ ] Aba opcional tratada como obrigatória
- [ ] `Promise` sem tratamento de rejeição
- [ ] Mediana de lista vazia, divisão por área zero
- [ ] Número em formato brasileiro convertido corretamente
- [ ] Cabeçalho alterado sem atualizar `docs/DATA_CONTRACT.md`
- [ ] Secret versionado
- [ ] Caminho absoluto que quebra no GitHub Pages
