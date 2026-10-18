import { objetoDaTabela } from '../../comum/objetos';
import type { ExtensaoAtributos } from '../importacao/motor';
import { aplicaA, converterValor, definicoesPorCodigo } from './catalogo';

/**
 * Colunas `atr_<codigo>` no mesmo CSV do objeto (spec 11.1, D-144). A prévia
 * confere existência, `ativo`, `aplica_a` e o tipo; atributo desconhecido é
 * coluna ignorada (`desconhecida`); valor fora do tipo rejeita a linha.
 * Célula vazia não apaga. O valor grava com o mesmo `importacao_id`, então o
 * desfazer o alcança.
 */
export const extensaoAtributos: ExtensaoAtributos = {
  async preparar(tabela, colunas, ctx) {
    const tipo = objetoDaTabela(tabela);
    const defs = tipo ? await definicoesPorCodigo(ctx.dados) : new Map();
    const usadas = colunas.flatMap((c) => {
      const def = defs.get(c.codigo);
      return def && def.ativo && tipo && aplicaA(def).includes(tipo) ? [{ ...c, def }] : [];
    });
    const ignoradas = colunas.filter((c) => !usadas.some((u) => u.indice === c.indice)).map((c) => ({ cabecalho: `atr_${c.codigo}`, motivo: 'desconhecida' as const }));
    return {
      ignoradas,
      validar(celulas, erros) {
        const valores: { def: Record<string, any>; colunas: Record<string, unknown> }[] = [];
        for (const u of usadas) {
          const r = converterValor(u.def, celulas[u.indice] ?? '');
          if (!r.ok) erros.push({ coluna: `atr_${u.codigo}`, codigo: 'ATRIBUTO_VALOR_INVALIDO', mensagem: r.mensagem });
          else if (r.colunas) valores.push({ def: u.def, colunas: r.colunas });
        }
        if (!valores.length || !tipo) return undefined;
        return async (registroId, c, importacaoId, novo) => {
          // Objeto recém-criado não tem valor gravado; o existente lê os valores da linha numa consulta só.
          const gravados = novo ? [] : await c.dados.varrerTudo('atributos_valor', { filtros: { objeto_tipo: tipo, objeto_id: registroId, atributo_id: valores.map((v) => Number(v.def.id)) } });
          for (const v of valores) {
            const chave = { objeto_tipo: tipo, objeto_id: registroId, atributo_id: Number(v.def.id) };
            const atual = gravados.find((g) => Number(g.atributo_id) === Number(v.def.id));
            if (atual) {
              await c.dados.atualizar('atributos_valor', Number(atual.id), { ...v.colunas, importacao_id: importacaoId, autor_id: c.usuarioId, versao: Number(atual.versao) + 1 });
            } else {
              await c.dados.criar('atributos_valor', { ...chave, ...v.colunas, importacao_id: importacaoId, autor_id: c.usuarioId, versao: 1 });
            }
          }
        };
      },
    };
  },
};
