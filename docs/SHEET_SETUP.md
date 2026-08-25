# Configuração da Google Sheet

## 1. Crie uma planilha pública exclusiva do app

Use uma planilha separada para o dataset público. Não misture dados privados, credenciais ou informações pessoais.

## 2. Crie/importa as abas

As três abas exigidas são:

- `LISTINGS`
- `DEVELOPMENTS`
- `ANCHORS`

Abas opcionais:

- `PRIMARY_OFFERS`
- `IVV_MONTHLY`
- `IVV_REGION`
- `RA_PROFILES` — **gerenciada** a partir da v2.0.0: se não existir, `setupProject()` cria
- `POLYGONS` — **gerenciada**: contornos de KML/KMZ, criada por `setupProject()`

Não é preciso criar coluna à mão. A partir do Apps Script **v2.0.0**, **Configurar projeto**
provisiona de forma **aditiva** toda coluna que falta nas abas do contrato: cria a coluna nova no
fim, **preserva as existentes na posição original** e não escreve em célula nenhuma de dado. É
assim que uma planilha semeada antes da v2.0.0 ganha `regularization_status`, `sales_stage`,
`group`, `segment` e as demais — a lista completa está em **Provisionamento pós-semente**, em
[`DATA_CONTRACT.md`](DATA_CONTRACT.md).

Rodar **Configurar projeto** de novo é seguro e é o procedimento normal depois de cada atualização
do `Code.gs`: a segunda execução não altera nada.

## 3. Migre o modelo atual

```bash
node tools/reference-to-csv.mjs reference/index-v3.html migration-csv
```

Importe os CSVs nas abas de mesmo nome.

## 4. Permissão

Configure a planilha para ser visível como **Viewer** por quem precisa acessar o app público (a forma mais simples é "Anyone with the link"). Como o navegador consulta a planilha diretamente, os dados dessas abas devem ser tratados como públicos.

## 5. Copie o ID

Na URL:

```text
https://docs.google.com/spreadsheets/d/SEU_ID_AQUI/edit
```

copie somente `SEU_ID_AQUI`.

## 6. Configure o site

Em `src/config.js`:

```js
window.APP_CONFIG = {
  spreadsheetId: 'SEU_ID_AQUI',
  dataSource: 'gviz',   // 'gviz' | 'demo' | 'appsscript'
  demoMode: false,      // true força 'demo' e tem precedência
  sheets: {
    listings: 'LISTINGS',
    developments: 'DEVELOPMENTS',
    anchors: 'ANCHORS'
  },
  defaultCenter: [-15.78, -47.93],
  defaultZoom: 10
};
```

`dataSource` existe porque `demoMode` é booleano e a V1 tem **três** origens possíveis
(`docs/ARCHITECTURE.md`). `demoMode: true` continua funcionando e vence `dataSource`.

## 3.1 Migração alternativa por .xlsx

Mais direto que os CSVs: importe [`migration/imob-intelligence-backend.xlsx`](../migration/),
que já traz as 11 abas com os cabeçalhos corretos. Ver [`migration/README.md`](../migration/README.md).

## 6.1 Importar polígonos de KML/KMZ (aba `POLYGONS`)

A partir da v2.0.0 o mapa aceita contornos vindos de arquivo KML ou KMZ:

1. Suba o arquivo no Google Drive, na mesma conta da planilha.
2. Copie o ID do arquivo (o trecho entre `/d/` e `/view` na URL).
3. Na planilha, menu **Imob Intelligence → Importar polígonos de KML/KMZ**, cole o ID.

O importador converte cada *placemark* em uma linha de `POLYGONS` com a geometria em GeoJSON,
as propriedades do KML em `properties_json` e um `polygon_id` derivado por hash **estável** do
conteúdo. Reimportar o mesmo arquivo **atualiza** as linhas em vez de duplicá-las.

Anel aberto, com menos de 4 posições ou com menos de 3 pontos distintos é rejeitado com erro
legível — a geometria não entra pela metade.

## 7. Valide antes de publicar

- IDs únicos.
- Latitude/longitude numéricas.
- Preços numéricos.
- URLs de fonte válidas.
- Datas consistentes.
- `confidence_flag`/`coordinate_precision` preenchidos quando a geolocalização não for exata.

## 8. Habilitar a área administrativa (escrita) — issue #5, R4.9

O endpoint de escrita (`doPost`) só aceita gravação com um `token` válido em **cada**
requisição. Sem este passo, toda tentativa de escrita é recusada — não existe modo aberto. Este
é o mesmo modelo já usado em produção no `press-research-communications` (repo
`tipolis-sandbox`): token direto, sem sessão intermediária.

1. Na planilha, use o menu **Imob Intelligence → Configurar / trocar token de administração** —
   ele gera um token aleatório, grava direto na propriedade `ADMIN_TOKEN` e mostra o valor uma
   única vez num alerta. É o mesmo efeito do passo manual abaixo, só que sem sair da planilha.
   Alternativa manual: **Extensões → Apps Script → Configurações do projeto (ícone de engrenagem)
   → Propriedades do script**, e adicione a propriedade `ADMIN_TOKEN` com um valor aleatório e
   longo (por exemplo, gerado com `openssl rand -hex 32`). **Nunca** coloque este valor numa
   célula da planilha (R4.3, R4.8) nem no repositório (R4.1).
2. > ⚠️ **Reimplante o Web App. Salvar o código no editor NÃO atualiza o `/exec`.**
   >
   > Este é o passo que mais falha, e ele falha em silêncio: a URL `/exec` fica presa na
   > versão em que foi implantada, então o Apps Script continua servindo o código antigo
   > enquanto o editor já mostra o novo. O sintoma que chega é o token ser recusado — o que
   > manda procurar no lugar errado.
   >
   > **Implantar → Gerenciar implantações → ícone de lápis → Versão: Nova versão → Implantar.**
   >
   > Confira também **Quem tem acesso: Qualquer pessoa** — sem isso o Google devolve uma
   > página de login em vez de JSON, e nenhuma chamada do navegador funciona.

   Para não depender de lembrar disso, `admin.html` consulta `?resource=health` ao abrir e
   compara o campo `write_api` com o protocolo que ela espera. Implantação divergente vira uma
   faixa de aviso no topo da tela, dizendo exatamente qual é o problema — desatualizada, sem
   acesso público, inalcançável ou URL não configurada. Faixa some quando estiver tudo certo.
3. **Como o login funciona:**
   - `admin.html` pede o token uma vez e chama `{action: "validate", token}` — uma chamada
     barata que só confere o token, sem ler nem escrever nada.
   - Se válido, o token fica guardado em `sessionStorage` do navegador (nunca em disco, nunca
     commitado) e viaja em **toda** chamada seguinte, inclusive `create`/`update`/`delete`.
   - Um `UNAUTHENTICATED` em qualquer chamada (token errado ou rotacionado) limpa o
     `sessionStorage` e volta para a tela de login.
4. Distribua o token só para quem vai administrar os dados — quem tiver o token consegue criar,
   editar e excluir registros de `LISTINGS`/`DEVELOPMENTS`/`ANCHORS`. O modelo de auth é de
   **token compartilhado**, não de identidade por pessoa: o campo `editor` do `CHANGE_LOG` usa a
   identidade do Google quando o Apps Script consegue resolvê-la (`Session.getActiveUser()` —
   depende da configuração de "Executar como" da implantação do Web App, não é garantido) e cai
   para o nome autodeclarado no formulário quando não consegue.
5. **Rotação:** se o token vazar (compartilhado por engano, por exemplo), gere um novo valor pelo
   menu **Imob Intelligence → Configurar / trocar token de administração** (ou sobrescreva a
   propriedade `ADMIN_TOKEN` manualmente). Como não há sessão nem cache intermediário, a
   invalidação é **instantânea**: a próxima chamada de qualquer navegador com o token antigo
   recebe `UNAUTHENTICATED` e volta para a tela de login. Não há nada além disso para gerenciar.
6. Sem `ADMIN_TOKEN` configurado, nenhuma chamada autentica — é o estado seguro por padrão logo
   após importar este script numa planilha nova.
7. A interface administrativa fica em `admin.html` (`https://<seu-pages>/admin.html`), separada
   do site público (`index.html`). Ela não tem controle de acesso próprio na V1 — a única
   barreira é o token: qualquer pessoa que abra a URL vê a tela de login, mas só grava dados quem
   tiver o `ADMIN_TOKEN`. Não é uma página secreta (R4.3) — o link não é divulgado publicamente,
   mas a segurança real está no token, não em ele não ser linkado.
