import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type { HelperArquivos } from '@urbiverso/sdk';
import { gerarCsv } from '../comum/csv';

/** `req.arquivos` falso: o `upload_id` vira o id do arquivo, como na promoção do framework. */
export class ArquivosFalsos {
  private dir = mkdtempSync(join(tmpdir(), 'intel-imob-'));
  private arquivos = new Map<number, { nome: string; mime: string; caminho: string }>();
  private proximo = 1000;

  subir(nome: string, conteudo: string | Uint8Array, mime = 'text/csv'): number {
    const id = this.proximo++;
    const caminho = join(this.dir, `${id}`);
    writeFileSync(caminho, conteudo);
    this.arquivos.set(id, { nome, mime, caminho });
    return id;
  }

  helper(): HelperArquivos {
    const self = this;
    return {
      async ler(id: number) {
        const a = self.arquivos.get(Number(id));
        if (!a) return null;
        return {
          meta: { id, nome_original: a.nome, mime: a.mime, tamanho_bytes: 0, status: 'ativo', criado_em: new Date(), expira_em: null, publico: false, app: 'inteligencia_imobiliaria', tabela: 'importacoes', coluna: 'arquivo', registro_id: null },
          caminho_fs: a.caminho,
        } as any;
      },
    } as unknown as HelperArquivos;
  }
}

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Linhas de uma aba da planilha (recorte do `data/demo.json` do site). */
export function aba(nome: string): Record<string, unknown>[] {
  return JSON.parse(readFileSync(join(AQUI, 'fixtures', 'planilha', `${nome}.json`), 'utf8'));
}

/** CSV de uma aba, com o cabeçalho da planilha (aliases). */
export function csvDaAba(linhas: Record<string, unknown>[]): string {
  const colunas = [...new Set(linhas.flatMap((l) => Object.keys(l)))];
  return gerarCsv(colunas, linhas);
}
