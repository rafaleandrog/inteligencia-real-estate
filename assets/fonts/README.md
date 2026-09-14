# Fontes auto-hospedadas

Manrope e DM Mono, baixadas do Google Fonts e servidas pelo próprio repositório —
mesma decisão do Leaflet em `assets/vendor/`: **nenhuma dependência de runtime vem de
CDN** (R1.6). O site é servido pelo GitHub Pages sem etapa de build, então o que está
aqui é exatamente o que o navegador baixa.

| Arquivo | Família | Peso | Subconjunto |
|---|---|---|---|
| `manrope-var-latin.woff2` | Manrope v20 | variável 200–800 | latin |
| `manrope-var-latin-ext.woff2` | Manrope v20 | variável 200–800 | latin-ext |
| `dm-mono-400-latin.woff2` | DM Mono v16 | 400 | latin |
| `dm-mono-400-latin-ext.woff2` | DM Mono v16 | 400 | latin-ext |
| `dm-mono-500-latin.woff2` | DM Mono v16 | 500 | latin |
| `dm-mono-500-latin-ext.woff2` | DM Mono v16 | 500 | latin-ext |

**Manrope é fonte variável**: um arquivo por subconjunto cobre 600, 700 e 800, que é o
que o `@font-face` em `assets/styles.css` declara como `font-weight: 200 800`. Pedir três
arquivos estáticos triplicaria o download sem ganho.

Os dois subconjuntos carregam sob `unicode-range`: o português brasileiro cabe inteiro em
`latin`, então `latin-ext` só é baixado se aparecer um glifo que exija — custo zero no
caso comum.

## Ao trocar o subconjunto, troque o nome do arquivo

`tools/versionar-assets.mjs` enumera apenas `.css` e `.js` dentro de `assets/`
(`arquivosVersionados`, linhas 46-52): **o `.woff2` não entra no hash de versão**. Isso é
aceitável porque o nome carrega família, peso e subconjunto, e o arquivo nunca é reeditado
no lugar. Se um dia for preciso regerar com outro subconjunto ou outra versão upstream, o
nome tem que mudar junto — senão o navegador de quem já visitou continua servindo o
arquivo antigo, que é exatamente a falha calada que a R8.78 descreve.

## Licença

Ambas sob SIL Open Font License 1.1 — texto completo em `OFL.txt`, com as duas linhas de
copyright no topo (o corpo da licença é idêntico para as duas famílias).
