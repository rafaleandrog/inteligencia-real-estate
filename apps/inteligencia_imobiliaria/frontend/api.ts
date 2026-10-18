import type { UrbiVersoAPI } from '@urbiverso/sdk';

// O shell publica `urbiVerso` em globalThis; a app só declara o tipo.
declare const urbiVerso: UrbiVersoAPI;

export const uv = (): UrbiVersoAPI => urbiVerso;

/** Mensagem legível de um erro de `urbiVerso.api()` (spec 6.22, erros de plataforma). */
export function mensagemDeErro(e: unknown): string {
  const erro = e as { status?: number; codigo?: string; message?: string; detalhes?: string[] };
  switch (erro?.codigo) {
    case 'CORPO_MUITO_GRANDE':
      return 'Geometria grande demais para enviar desenhada; importe como arquivo.';
    case 'DADOS_ARQUIVO_MUITO_GRANDE':
      return 'Arquivo acima do tamanho máximo aceito pela instância.';
    case 'ARQUIVOS_UPLOAD_EXPIRADO':
      return 'O envio expirou; envie o arquivo de novo.';
    case 'AUTH_TOKEN_SOMENTE_LEITURA':
      return 'Este token só lê.';
    case 'PAPEL_EXIGIDO':
    case 'CONFLITO_VERSAO':
    default: {
      const base = erro?.message || 'Erro inesperado.';
      return erro?.codigo && !base.includes(erro.codigo) ? `${base} (${erro.codigo})` : base;
    }
  }
}

/** Link de verdade dentro da SPA: href real + interceptação só do clique simples (overview.md). */
export function irPara(e: MouseEvent, sub: string): void {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
  e.preventDefault();
  uv().navegarSub(sub);
}
