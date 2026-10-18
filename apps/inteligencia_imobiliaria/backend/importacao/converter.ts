import type { CampoImport } from '../../comum/importacao-chaves';
import { booleano, dataHoraISO, dataISO, numero, texto, urlSegura } from '../../comum/normalizar';

export interface ErroLinha {
  coluna: string;
  codigo: string;
  mensagem: string;
}

export type Convertido = { ok: true; valor: unknown } | { ok: false; erro: ErroLinha };

const erro = (campo: CampoImport, codigo: string, mensagem: string): Convertido => ({ ok: false, erro: { coluna: campo.coluna, codigo, mensagem } });

/** Converte uma célula pelo tipo do campo. Vazio vira `null`; obrigatoriedade é conferida depois. */
export function converter(campo: CampoImport, bruto: string, pct: boolean): Convertido {
  const t = texto(bruto);
  if (t === '') return { ok: true, valor: null };
  switch (campo.tipo) {
    case 'texto':
    case 'texto_longo': {
      let v = t;
      if (campo.traducao) v = campo.traducao[v] ?? campo.traducao[v.toLowerCase()] ?? v;
      if (campo.opcoes && !campo.opcoes.includes(v)) {
        return erro(campo, 'OPCAO_INVALIDA', `"${v}" não está entre ${campo.opcoes.join(', ')}`);
      }
      if (campo.limite && v.length > campo.limite) return erro(campo, 'TEXTO_LONGO_DEMAIS', `acima de ${campo.limite} caracteres`);
      return { ok: true, valor: v };
    }
    case 'url': {
      const u = urlSegura(t);
      if (!u) return erro(campo, 'URL_INVALIDA', 'só http e https');
      if (campo.limite && u.length > campo.limite) return erro(campo, 'TEXTO_LONGO_DEMAIS', `acima de ${campo.limite} caracteres`);
      return { ok: true, valor: u };
    }
    case 'inteiro': {
      const n = numero(t);
      if (n === null || !Number.isInteger(n)) return erro(campo, 'NUMERO_INVALIDO', `"${t}" não é inteiro`);
      return { ok: true, valor: n };
    }
    case 'decimal': {
      const n = numero(t);
      if (n === null) return erro(campo, 'NUMERO_INVALIDO', `"${t}" não é número`);
      return { ok: true, valor: n };
    }
    case 'fracao': {
      const n = numero(t);
      if (n === null) return erro(campo, 'NUMERO_INVALIDO', `"${t}" não é número`);
      const v = pct ? n / 100 : n;
      if (v < 0 || v > 1) {
        return erro(campo, 'ESCALA_INDETERMINADA', pct ? `${t} pontos percentuais fora de 0 a 100` : `${t} fora de 0 a 1: a coluna é fração (0.057 = 5,7%)`);
      }
      return { ok: true, valor: v };
    }
    case 'booleano': {
      const b = booleano(t);
      if (b === null) return erro(campo, 'BOOLEANO_INVALIDO', `"${t}" não é sim/não`);
      return { ok: true, valor: b };
    }
    case 'data': {
      const d = dataISO(t);
      if (!d) return erro(campo, 'DATA_INVALIDA', `"${t}" não é data válida`);
      return { ok: true, valor: d };
    }
    case 'datahora': {
      const d = dataHoraISO(t);
      if (!d) return erro(campo, 'DATA_INVALIDA', `"${t}" não é data-hora válida`);
      return { ok: true, valor: d };
    }
    case 'json': {
      try {
        return { ok: true, valor: JSON.parse(t) };
      } catch {
        return erro(campo, 'JSON_INVALIDO', 'não é JSON válido');
      }
    }
  }
}
