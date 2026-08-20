---
name: imob-data-contract
description: Alterações que tocam Google Sheets, CSV, cabeçalhos, campos, IDs, latitude/longitude, preços, datas, fonte ou qualidade espacial. Trate DATA_CONTRACT.md como fonte de verdade.
---

# imob-data-contract

Acione **sempre** que a mudança tocar: Google Sheets · CSV · cabeçalhos · campos · IDs ·
latitude/longitude · preços · datas · fonte · qualidade espacial.

[`docs/DATA_CONTRACT.md`](../../../docs/DATA_CONTRACT.md) é a **fonte de verdade**. Código que
diverge do contrato é o código que está errado — até que o contrato seja atualizado
deliberadamente.

## Workflow obrigatório para alteração estrutural

```
1. comparar schema anterior e novo
2. identificar impacto
3. atualizar contrato
4. atualizar loader
5. atualizar validação
6. atualizar migração
7. adicionar teste
```

Os sete passos, na mesma PR. Um schema alterado com contrato desatualizado é uma bomba-relógio
para o próximo agente.

## A regra inegociável

**Nunca renomeie um cabeçalho em silêncio.** É a falha mais cara possível neste projeto: quebra o
site em produção sem erro de compilação, sem teste vermelho, sem aviso — só um mapa vazio.

## Entidades

**Obrigatórias na V1** — `LISTINGS`, `DEVELOPMENTS`, `ANCHORS`, `PRIMARY_MARKET`.
Ausência de qualquer uma → estado de erro legível.

**Opcionais** — `PRIMARY_OFFERS`, `IVV_MONTHLY`, `IVV_REGION`, `RA_PROFILES`.
Ausência → warning. **Nunca derrube a aplicação porque uma aba futura está vazia.**

**Operacionais (Apps Script)** — `APP_META`, `DATA_QUALITY`, `CHANGE_LOG`.
Não são lidas pelo mapa.

## Semântica que não pode se perder

- `confidence_flag` e `coordinate_precision` sobrevivem da planilha até a tela.
- **Coordenada aproximada nunca vira endereço exato.** A maioria dos listings usa centroide de
  localidade com jitter determinístico — apresentá-los como lote exato é desinformação.
- **Preço anunciado é preço pedido, não transação realizada.**
- IDs são estáveis. Não altere ID existente arbitrariamente.

## Ao adicionar campo

Campo novo é sempre opcional primeiro. Só vire obrigatório depois que a planilha estiver
preenchida — caso contrário você quebra produção com uma validação nova.
