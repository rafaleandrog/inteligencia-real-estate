# Deploy no GitHub Pages

## 1. Configure a planilha

Siga `SHEET_SETUP.md` e confirme que `src/config.js` contém o ID correto da Google Sheet e `demoMode: false`.

## 2. Crie o repositório

Crie um repositório no GitHub e coloque esta pasta na raiz.

Estrutura mínima:

```text
index.html
assets/
src/
data/
docs/
tools/
reference/
```

## 3. Primeiro push

No terminal, dentro da pasta:

```bash
git init
git add index.html assets src data docs tools reference optional-apps-script .github .gitignore .nojekyll README.md CONTRIBUTING.md
git commit -m "feat: initial real estate intelligence MVP"
git branch -M main
git remote add origin URL_DO_REPOSITORIO
git push -u origin main
```

## 4. Ative GitHub Pages

No repositório:

1. `Settings`.
2. `Pages`.
3. `Build and deployment`.
4. `Source`: `Deploy from a branch`.
5. Branch: `main`.
6. Folder: `/ (root)`.
7. Salve.

## 5. Regra de atualização

- Mudou código/interface: commit + push no GitHub.
- Mudou dados: edite somente a Google Sheet.
- Mudou o schema: atualize planilha + `DATA_CONTRACT.md` + código no mesmo PR.

Não faça export manual de JSON da planilha para o repositório em produção.
