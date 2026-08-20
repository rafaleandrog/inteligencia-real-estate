---
name: imob-release
description: Acionar antes de publicar uma versão. Checklist completo de release do Imob Intelligence.
---

# imob-release

Acione **antes de publicar**. O objetivo é pegar o que passou pelos testes mas quebra no mundo real.

## Checklist

### Código
- [ ] `npm test` passa
- [ ] `node --check` limpo em todo `.js`
- [ ] GitHub Actions verde
- [ ] Console do navegador sem erro

### Dados
- [ ] Dataset validado (`validateAll()` no Apps Script sem erro crítico)
- [ ] `demoMode: true` funciona
- [ ] Google Sheets funciona
- [ ] As 3 abas obrigatórias carregam
- [ ] Aba opcional ausente gera warning, não erro
- [ ] Dado inválido não derruba a aplicação
- [ ] Qualidade espacial visível na interface

### Segurança
- [ ] Nenhum secret versionado
- [ ] `config.js` sem token
- [ ] Nenhum dado privado na planilha pública
- [ ] Links externos com `rel="noopener noreferrer"`
- [ ] Nenhum dado em `innerHTML` sem escaping

### Deploy
- [ ] Caminhos relativos — nada absoluto
- [ ] GitHub Pages carrega a versão publicada
- [ ] Sem etapa de build
- [ ] `.nojekyll` presente

### Interface
- [ ] Desktop
- [ ] Mobile (390 px)
- [ ] Mapa aparece
- [ ] Busca funciona
- [ ] Cada filtro reduz o conjunto
- [ ] Camadas alternam
- [ ] KPIs batem com o que está visível
- [ ] Detalhe abre em anúncio e em empreendimento
- [ ] Links de fonte funcionam

### Documentação
- [ ] `README.md`, `docs/ARCHITECTURE.md`, `docs/DATA_CONTRACT.md`, `docs/SHEET_SETUP.md`,
      `docs/DEPLOYMENT.md`, `docs/AI_WORKFLOW.md` atualizados
- [ ] Mudança de schema refletida no contrato

## Regra final

**Item não verificado é item não verificado.** Se algo não pôde ser testado — limitação de rede,
falta de acesso, o que for — declare qual item ficou de fora e por quê. Não marque a caixa
por otimismo.
