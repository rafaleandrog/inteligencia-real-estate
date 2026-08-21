// Cliente da API de escrita (Apps Script `doPost`) e da leitura administrativa.
//
// Funções puras de shaping de request/response + wrappers de fetch, testáveis com
// fetch mockado (tests/admin-service.test.js). Nenhuma lógica de DOM aqui — isso é
// admin-ui.js.

const TOKEN_KEY = 'imob_admin_token';

/**
 * Token guardado em sessionStorage, não localStorage: expira com a aba fechada, o que
 * limita a janela de exposição se o navegador for compartilhado (docs/SHEET_SETUP.md
 * §8 — o modelo é de token compartilhado, não de identidade por pessoa).
 */
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
    // Sem storage disponível: a sessão simplesmente não sobrevive a um reload.
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
  constructor(code, message) {
    super(message || code);
    this.name = 'WriteApiError';
    this.code = code || 'INTERNAL_ERROR';
  }
}

/** Monta o corpo da requisição de escrita. Função pura, testável sem fetch. */
export function buildWritePayload({ token, action, sheet, id, expectedVersion, fields, editor }) {
  const payload = { token, action, sheet };
  if (id !== undefined && id !== null && id !== '') payload.id = id;
  if (expectedVersion !== undefined && expectedVersion !== null && expectedVersion !== '') {
    payload.expected_version = String(expectedVersion);
  }
  if (fields) payload.fields = fields;
  if (editor !== undefined && editor !== null && editor !== '') payload.editor = editor;
  return payload;
}

/** Interpreta a resposta JSON do doPost/doGet — lança WriteApiError em caso de erro. */
export function parseWriteResponse(json) {
  if (json && json.ok === true) return json;
  const error = (json && json.error) || {};
  throw new WriteApiError(error.code, error.message);
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
    throw new WriteApiError('NETWORK_ERROR', 'Falha de rede ao contatar o Apps Script.');
  }

  let json;
  try {
    json = await res.json();
  } catch (err) {
    throw new WriteApiError('INTERNAL_ERROR', 'Resposta do servidor não é JSON válido.');
  }
  return parseWriteResponse(json);
}

/** Cria um registro. `fields` já deve vir coagido (ver admin-schema.js); o servidor valida de novo. */
export function createRecord(appsScriptUrl, { sheet, id, fields, editor }) {
  const token = getToken();
  const body = buildWritePayload({ token, action: 'create', sheet, id, fields, editor });
  return postJson_(appsScriptUrl, body);
}

/** Atualiza um registro existente. `expectedVersion` é obrigatório — concorrência otimista. */
export function updateRecord(appsScriptUrl, { sheet, id, fields, editor, expectedVersion }) {
  const token = getToken();
  const body = buildWritePayload({ token, action: 'update', sheet, id, fields, editor, expectedVersion });
  return postJson_(appsScriptUrl, body);
}

/** Exclui um registro existente. `expectedVersion` é obrigatório — mesma regra de update. */
export function deleteRecord(appsScriptUrl, { sheet, id, editor, expectedVersion }) {
  const token = getToken();
  const body = buildWritePayload({ token, action: 'delete', sheet, id, editor, expectedVersion });
  return postJson_(appsScriptUrl, body);
}

/**
 * Lista os registros de uma aba, pelo mesmo endpoint público de leitura que o site
 * público usa (`?resource=dataset`) — não precisa de token, porque leitura continua
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
