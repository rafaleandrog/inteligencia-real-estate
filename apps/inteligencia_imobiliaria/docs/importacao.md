---
titulo: Importação
descricao: Como os dados entram na app — CSV com prévia, aplicar e desfazer; KML/KMZ de contornos; carga por agente.
---

# Importação

Todo dado entra pelo mesmo fluxo, com as mesmas validações e o mesmo registro em
**Operação › Importações**.

## Para quem usa

1. **Escolha a tabela e o modo** ("Ignorar", "Atualizar" ou "Recusar se já existir") e envie o CSV.
   "Baixar modelo" traz o cabeçalho esperado. O CSV pode ter `;` ou `,`, com ou sem BOM; os
   cabeçalhos da planilha antiga são aceitos (`ra_geo_id`, `polygon_id`, `female_pct`…).
2. **Prévia.** O arquivo é lido e validado por inteiro, sem gravar nada: quantas linhas entram,
   quantas atualizam, quantas são ignoradas e cada rejeição com linha, coluna e motivo. Colunas
   que a app calcula (como `versao` ou `id`) e colunas desconhecidas são ignoradas com aviso, sem
   rejeitar a linha.
3. **Valor padrão.** Se uma coluna obrigatória está vazia nas linhas rejeitadas (o caso do ano do
   perfil das RAs), a tela oferece declarar um valor padrão. Ele fica gravado na importação e só
   preenche célula vazia.
4. **Aplicar.** Grava as linhas válidas em lotes de 500. A contagem sempre fecha:
   inseridas + atualizadas + ignoradas + rejeitadas = linhas do arquivo.
5. **Desfazer** (só o admin da app): manda para a lixeira as linhas que a importação criou e que
   ninguém editou depois. Linhas atualizadas por ela não voltam ao valor anterior.

Reimportar o mesmo arquivo com "Ignorar" não duplica nada: a chave natural de cada tabela está
em [Dados](dados.md).

**Contornos em KML, KMZ ou GeoJSON** entram pelo Cadastro › Contornos: a prévia lista as feições
(nome, tipo, vértices, erros); aplicar cria os contornos sem duplicar pela geometria.

## Para o administrador

- Importar exige o papel **operador**; desfazer, nível **admin** da app.
- O arquivo da importação fica guardado (não expira) como evidência da carga.

## Carga por agente (spec 11.5)

Uma sessão do Claude completa dados pela API da app com o token de um usuário de serviço
"Carga" (nível escrita, papel operador; sem curador, estratégico nem admin). O token mora no
ambiente da sessão, nunca no repositório. Passos:

1. `POST /api/dados/inteligencia_imobiliaria/importacoes/__upload?coluna=arquivo` (multipart,
   um arquivo) → `{ upload_id }`. O `upload_id` vale 10 minutos.
2. `POST /api/inteligencia_imobiliaria/importacoes/previa`
   `{ tabela_alvo, upload_id, modo_duplicata: "ignorar" | "atualizar", padroes? }` → contagens,
   `colunas_ignoradas` e as primeiras 50 rejeições.
3. **Ler a prévia.** Rejeição ou coluna ignorada que a sessão não sabe explicar: parar e voltar ao
   dono, sem aplicar.
4. `POST /api/inteligencia_imobiliaria/importacoes/:id/aplicar`.

Regras: nunca aplicar sem ler a prévia; só `ignorar` ou `atualizar`; a importação aparece na
Operação com o autor "Carga" e o admin pode desfazê-la.

## Para agentes (referência)

| Método | Rota | Papel |
|---|---|---|
| GET | `/importacoes/tabelas` | leitura |
| GET | `/importacoes/modelo/:tabela` | leitura |
| GET | `/importacoes`, `/importacoes/:id` | leitura |
| POST | `/importacoes/previa` | operador |
| POST | `/importacoes/:id/previa` (refaz com outro modo ou `padroes`) | operador |
| POST | `/importacoes/:id/aplicar`, `/importacoes/:id/cancelar` | operador |
| POST | `/importacoes/:id/desfazer` | admin |
| GET | `/qualidade?tabela&codigo&severidade&resolvido=false\|true\|todos` | leitura |
| PATCH | `/qualidade/:id/resolver` | operador |
| POST | `/contornos/importar` `{ upload_id }`, `/contornos/importar/:id/aplicar` `{ indices?, categoria?, localidade_id? }` | curador |
