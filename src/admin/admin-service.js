// Cliente da API de escrita (Apps Script `doPost`) e da leitura administrativa.
//
// Funções puras de shaping de request/response + wrappers de fetch, testáveis com
// fetch mockado (tests/admin-service.test.js). Nenhuma lógica de DOM aqui — isso é
// admin-ui.js.
//
// Autenticação por token direto em cada requisição, mesmo padrão do
// tipolis-sandbox (press-research-communications/press-monitor): o token é
// guardado em sessionStorage e reenviado em toda chamada; o servidor valida
// contra ADMIN_TOKEN a cada request, sem sessão intermediária.

const TOKEN_KEY = 'imob_admin_token';

/**
 * Protocolo que esta tela fala com o Apps Script. O `health_()` do Code.gs devolve
 * este mesmo valor em `write_api`; divergência (ou ausência) significa que o Web App
 * implantado é de outra versão do script.
 *
 * Marcador explícito em vez de comparar `app_version`: números de versão de scripts
 * que já circularam não são comparáveis de forma confiável, e o que importa aqui não
 * é "qual versão" e sim "fala o mesmo protocolo".
 */
export const WRITE_API_PROTOCOL = 'token-direct-v1';

/** Token guardado em sessionStorage: expira com a aba fechada. */
export function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return ''; // sessionStorage pode não existir (aba privada bloqueando storage)
  }
}

export function setToken(token) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Sem storage disponível: o token simplesmente não sobrevive a um reload.
    // O formulário de login continua funcionando, só perde a conveniência.
  }
}

export function clearToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // ver getToken()
  }
}

/** Erro tipado da API de escrita — carrega o `code` padronizado do servidor. */
export class WriteApiError extends Error {
  constructor(code, message, correlationId) {
    super(message || code);
    this.name = 'WriteApiError';
    this.code = code || 'INTERNAL_ERROR';
    this.correlationId = correlationId || '';
  }
}

/**
 * Identificador de correlação por operação de escrita (issue #5: "identificador de
 * correlação da operação" no payload, para rastrear uma tentativa através de várias
 * linhas do CHANGE_LOG e nas mensagens de erro mostradas ao usuário).
 *
 * `crypto.randomUUID()` existe em todo navegador com HTTPS/localhost moderno; o
 * fallback cobre o caso raro de um contexto sem ele — não precisa ser
 * criptograficamente forte, só único o bastante para não colidir numa sessão.
 */
export function newCorrelationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'corr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** Monta o corpo da requisição de escrita. Função pura, testável sem fetch. */
export function buildWritePayload({ token, action, sheet, id, expectedVersion, fields, editor, correlationId }) {
  const payload = { token, action, sheet };
  if (id !== undefined && id !== null && id !== '') payload.id = id;
  if (expectedVersion !== undefined && expectedVersion !== null && expectedVersion !== '') {
    payload.expected_version = String(expectedVersion);
  }
  if (fields) payload.fields = fields;
  if (editor !== undefined && editor !== null && editor !== '') payload.editor = editor;
  if (correlationId) payload.correlation_id = correlationId;
  return payload;
}

/**
 * Interpreta a resposta JSON do doPost — lança WriteApiError em caso de erro.
 *
 * Trata as três formas possíveis de `error`, e nunca produz mensagem vazia. A versão
 * anterior fazia `(json.error || {}).code` e, quando `error` vinha como **texto**
 * (string não vazia é truthy, então o `|| {}` não disparava), `code` e `message`
 * viravam `undefined` — o `WriteApiError` nascia com `.message === ''` e a tela
 * exibia "Erro inesperado ao entrar." com o motivo real descartado.
 */
export function parseWriteResponse(json) {
  if (json && json.ok === true) return json;

  const raw = json && json.error;
  const correlationId = json && json.correlation_id;

  // Formato atual: { ok: false, error: { code, message } }.
  if (raw && typeof raw === 'object') {
    throw new WriteApiError(raw.code, raw.message, correlationId);
  }

  // `error` em texto simples. Aqui isso só pode vir de um Web App que não fala o
  // protocolo atual — tipicamente uma implantação presa numa versão antiga do
  // Code.gs, cujo doPost devolvia { ok: false, error: "..." }. O texto do servidor
  // é preservado como mensagem, em vez de descartado.
  if (typeof raw === 'string' && raw.trim() !== '') {
    throw new WriteApiError('STALE_DEPLOYMENT', raw.trim(), correlationId);
  }

  throw new WriteApiError('INTERNAL_ERROR', 'Resposta do servidor fora do formato esperado.', correlationId);
}

async function postJson_(url, body) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita preflight CORS
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new WriteApiError('NETWORK_ERROR', 'Falha de rede ao contatar o Apps Script.', body.correlation_id);
  }

  let json;
  try {
    json = await res.json();
  } catch (err) {
    throw new WriteApiError('INTERNAL_ERROR', 'Resposta do servidor não é JSON válido.', body.correlation_id);
  }
  return parseWriteResponse(json);
}

/**
 * Confere um token contra o servidor com uma chamada barata (`action: 'validate'`),
 * sem ler nem escrever dados — mesmo padrão do `validateToken()` do tipolis-sandbox.
 * Retorna `true`/`false`; não lança em token inválido (só em erro de rede/servidor).
 */
export async function validateToken(appsScriptUrl, token) {
  try {
    await postJson_(appsScriptUrl, { action: 'validate', token });
    return true;
  } catch (err) {
    if (err instanceof WriteApiError && err.code === 'UNAUTHENTICATED') return false;
    throw err;
  }
}

/** Cria um registro. `fields` já deve vir coagido (ver admin-schema.js); o servidor valida de novo. */
export function createRecord(appsScriptUrl, { sheet, id, fields, editor, correlationId }) {
  const token = getToken();
  const body = buildWritePayload({ token, action: 'create', sheet, id, fields, editor, correlationId });
  return postJson_(appsScriptUrl, body);
}

/** Atualiza um registro existente. `expectedVersion` é obrigatório — concorrência otimista. */
export function updateRecord(appsScriptUrl, { sheet, id, fields, editor, expectedVersion, correlationId }) {
  const token = getToken();
  const body = buildWritePayload({ token, action: 'update', sheet, id, fields, editor, expectedVersion, correlationId });
  return postJson_(appsScriptUrl, body);
}

/** Exclui um registro existente. `expectedVersion` é obrigatório — mesma regra de update. */
export function deleteRecord(appsScriptUrl, { sheet, id, editor, expectedVersion, correlationId }) {
  const token = getToken();
  const body = buildWritePayload({ token, action: 'delete', sheet, id, editor, expectedVersion, correlationId });
  return postJson_(appsScriptUrl, body);
}

/**
 * Lista os registros de uma aba, pelo mesmo endpoint público de leitura que o site
 * público usa (`?resource=dataset`) — não precisa de sessão, porque leitura continua
 * pública (R4.7). É daqui que vem o `dataset_version` usado como `expectedVersion`
 * na próxima escrita.
 */
export async function listRecords(appsScriptUrl, sheet) {
  const url = `${appsScriptUrl}?resource=dataset&name=${encodeURIComponent(sheet)}`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new WriteApiError('NETWORK_ERROR', 'Falha de rede ao carregar os registros.');
  }

  let json;
  try {
    json = await res.json();
  } catch (err) {
    throw new WriteApiError('INTERNAL_ERROR', 'Resposta do servidor não é JSON válido.');
  }

  if (json && json.error) throw new WriteApiError('INTERNAL_ERROR', json.error);
  return json; // { name, dataset_version, count, rows }
}

/**
 * Confere, antes de qualquer login, se o Web App implantado é o que esta tela espera.
 *
 * Existe porque a falha mais comum da área administrativa não é o token: é editar o
 * Code.gs no editor do Apps Script e esquecer de **reimplantar**. O `/exec` continua
 * servindo a versão antiga em silêncio, e o sintoma que chega ao usuário é um erro de
 * autenticação genérico que não aponta para a causa.
 *
 * Usa o `?resource=health`, que já existia no Code.gs e nunca tinha sido consumido pelo
 * cliente. Devolve um estado classificado — nunca lança, para que a sonda jamais
 * impeça uma tentativa de login legítima:
 *
 *   ok           implantação fala o protocolo atual
 *   stale        JSON válido, mas sem `write_api` — versão antiga do script
 *   not-json     resposta não é JSON (costuma ser a página de login do Google, quando
 *                a implantação não está com "Quem tem acesso: Qualquer pessoa")
 *   unreachable  fetch falhou — URL errada em config.js ou implantação inativa
 *   unconfigured appsScriptUrl ausente em config.js
 */
export async function checkDeployment(appsScriptUrl) {
  if (!appsScriptUrl) return { status: 'unconfigured', appVersion: '' };

  let res;
  try {
    res = await fetch(`${appsScriptUrl}?resource=health`);
  } catch {
    return { status: 'unreachable', appVersion: '' };
  }

  let json;
  try {
    json = await res.json();
  } catch {
    return { status: 'not-json', appVersion: '' };
  }

  const appVersion = (json && json.app_version) || '';
  if (json && json.write_api === WRITE_API_PROTOCOL) return { status: 'ok', appVersion };
  return { status: 'stale', appVersion };
}
