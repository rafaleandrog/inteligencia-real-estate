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

/** Baixa um arquivo de uma rota da app (CSV, modelo) pelo `Response` cru de `urbiVerso.fetch`. */
export async function baixar(caminho: string, nomePadrao: string): Promise<void> {
  const r = await uv().fetch(caminho);
  if (!r.ok) {
    let corpo: any = null;
    try {
      corpo = await r.json();
    } catch {
      corpo = null;
    }
    throw Object.assign(new Error(corpo?.mensagem ?? `Falha ao baixar (${r.status})`), { status: r.status, codigo: corpo?.codigo, detalhes: corpo?.detalhes });
  }
  const nome = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') ?? '')?.[1] ?? nomePadrao;
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Passo 1 do upload em dois passos: staging na coluna `arquivo` de uma tabela da app (arquivos.md). */
export async function enviarArquivo(tabela: string, coluna: string, arquivo: File): Promise<number> {
  const form = new FormData();
  form.append('arquivo', arquivo);
  const r = await uv().api(`/dados/inteligencia_imobiliaria/${tabela}/__upload?coluna=${coluna}`, { method: 'POST', body: form });
  return Number(r.upload_id);
}

/** Papel do usuário na app (para mostrar ou esconder ações; o backend confere de novo). */
export function temPapel(papel: string): boolean {
  const c = uv().contexto();
  return c.nivel === 'admin' || c.roles.includes(papel);
}

export function ehAdmin(): boolean {
  return uv().contexto().nivel === 'admin';
}

export function json(corpo: unknown): { method: string; body: string } {
  return { method: 'POST', body: JSON.stringify(corpo) };
}

export function patch(corpo: unknown): { method: string; body: string } {
  return { method: 'PATCH', body: JSON.stringify(corpo) };
}
