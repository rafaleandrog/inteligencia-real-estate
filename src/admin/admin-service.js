// Cliente da API de escrita (Apps Script `doPost`) e da leitura administrativa.
//
// Funções puras de shaping de request/response + wrappers de fetch, testáveis com
// fetch mockado (tests/admin-service.test.js). Nenhuma lógica de DOM aqui — isso é
// admin-ui.js.
//
// Autenticação em dois passos (issue #5, comentário do dono do repo: o token não
// deve ser reenviado como credencial permanente): `login()` troca o token por uma
// sessão; toda escrita depois disso manda a sessão, nunca mais o token cru.

const SESSION_KEY = 'imob_admin_session';

/**
 * Sessão guardada em sessionStorage, não localStorage: expira com a aba fechada, o
 * que limita a janela de exposição se o navegador for compartilhado
 * (docs/SHEET_SETUP.md §8). O token em si NUNCA é guardado — só existe na memória do
 * módulo pelo tempo da chamada a `login()`.
 */
export function getSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY) || '';
  } catch {
    return ''; // sessionStorage pode não existir (aba privada bloqueando storage)
  }
}

function setSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, session);
  } catch {
    // Sem storage disponível: a sessão simplesmente não sobrevive a um reload.
    // O formulário de login continua funcionando, só perde a conveniência.
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ver getSession()
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
export function buildWritePayload({ session, action, sheet, id, expectedVersion, fields, editor, correlationId }) {
  const payload = { session, action, sheet };
  if (id !== undefined && id !== null && id !== '') payload.id = id;
  if (expectedVersion !== undefined && expectedVersion !== null && expectedVersion !== '') {
    payload.expected_version = String(expectedVersion);
  }
  if (fields) payload.fields = fields;
  if (editor !== undefined && editor !== null && editor !== '') payload.editor = editor;
  if (correlationId) payload.correlation_id = correlationId;
  return payload;
}

/** Interpreta a resposta JSON do doPost/doGet — lança WriteApiError em caso de erro. */
export function parseWriteResponse(json) {
  if (json && json.ok === true) return json;
  const error = (json && json.error) || {};
  throw new WriteApiError(error.code, error.message, json && json.correlation_id);
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
 * Passo 1 do login: troca `token` por uma sessão temporária e guarda só a sessão.
 * Nunca guarda o token em storage nenhum — ele só existe no argumento desta chamada.
 */
export async function login(appsScriptUrl, token) {
  const res = await postJson_(appsScriptUrl, { action: 'authenticate', token });
  setSession(res.session);
  return res;
}

/** Cria um registro. `fields` já deve vir coagido (ver admin-schema.js); o servidor valida de novo. */
export function createRecord(appsScriptUrl, { sheet, id, fields, editor, correlationId }) {
  const session = getSession();
  const body = buildWritePayload({ session, action: 'create', sheet, id, fields, editor, correlationId });
  return postJson_(appsScriptUrl, body);
}

/** Atualiza um registro existente. `expectedVersion` é obrigatório — concorrência otimista. */
export function updateRecord(appsScriptUrl, { sheet, id, fields, editor, expectedVersion, correlationId }) {
  const session = getSession();
  const body = buildWritePayload({ session, action: 'update', sheet, id, fields, editor, expectedVersion, correlationId });
  return postJson_(appsScriptUrl, body);
}

/** Exclui um registro existente. `expectedVersion` é obrigatório — mesma regra de update. */
export function deleteRecord(appsScriptUrl, { sheet, id, editor, expectedVersion, correlationId }) {
  const session = getSession();
  const body = buildWritePayload({ session, action: 'delete', sheet, id, editor, expectedVersion, correlationId });
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
