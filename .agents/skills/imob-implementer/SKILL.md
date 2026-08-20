---
name: imob-implementer
description: Implementar feature, alterar UI, alterar comportamento ou criar módulo no Imob Intelligence. Use quando a tarefa é construir algo novo ou mudar algo que já funciona.
---

# imob-implementer

Foco restrito: **construir**. Se a tarefa é investigar uma falha, use `imob-debugger`.

## Workflow obrigatório

```
entender requisito
→ localizar código
→ identificar contrato afetado
→ implementar menor diff possível
→ executar testes
→ smoke test
→ relatar mudanças
```

Nenhuma etapa é opcional. Não pule o smoke test porque "a mudança é pequena".

## Antes de escrever código

1. O requisito está claro? Se duas leituras levam a trabalhos diferentes, pergunte.
2. Onde isso mora? `src/app.js` (interação/mapa), `src/data.js` (carregamento),
   `src/normalize.js` / `src/filters.js` / `src/format.js` (funções puras), `index.html`,
   `assets/styles.css`.
3. **Toca em contrato de dados?** Se sim, pare e use `imob-data-contract` primeiro.
4. Existe função pura que já faz isso? Reuse antes de criar.

## Durante

- Menor diff possível. Não misture refatoração ampla com feature pequena (R5.2).
- Lógica nova que dá para isolar em função pura → isole. É o que vira teste (R5.3).
- Dado da planilha nunca vai para `innerHTML` (R4.4). Link externo leva
  `rel="noopener noreferrer"` e URL validada (R4.5, R4.6).
- Nenhuma `Promise` sem `catch` (R5.5).

## Só modularize quando

`src/app.js` acumulou responsabilidade demais **e** existe função claramente independente para
extrair. Modularização por estética é ruído (R5.4).

## Antes de relatar

- [ ] `npm test` passa
- [ ] `node --check` em cada arquivo alterado
- [ ] smoke test do fluxo afetado
- [ ] contrato atualizado, se o schema mudou
- [ ] relato com arquivos, testes, verificações e riscos restantes
