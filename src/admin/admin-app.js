// Orquestração da área administrativa: login (token validado a cada request,
// padrão tipolis-sandbox), carregar/listar registros, buscar/ordenar/paginar,
// abrir formulário de criação/edição, submeter escrita, tratar erro/conflito.
//
// Mesmo padrão de src/app.js: `state` único, `el()` para refs DOM, regiões de
// loading/erro dedicadas alternadas via `hidden` — nunca tela em branco (R5.6/R5.7).

import { ADMIN_SHEETS, SHEET_LABELS, ID_FIELD, ADMIN_FIELDS } from './admin-schema.js';
import { buildTable, buildForm, buildTableToolbar, columnsFor } from './admin-ui.js';
import { filterRecords, sortRecords, paginateRecords } from './admin-table.js';
import {
  getToken, setToken, clearToken, validateToken, listRecords, createRecord, updateRecord, deleteRecord,
  newCorrelationId, checkDeployment, WriteApiError,
} from './admin-service.js';

const CONFIG = window.APP_CONFIG || {};
const PAGE_SIZE = 25;

const el = (id) => document.getElementById(id);

const dom = {
  loginScreen: el('adminLogin'), loginForm: el('adminLoginForm'), loginToken: el('adminLoginToken'),
  loginError: el('adminLoginError'), loginSubmitBtn: el('adminLoginForm') && el('adminLoginForm').querySelector('button[type=submit]'),
  app: el('adminApp'), sheetTabs: el('adminSheetTabs'), tableWrap: el('adminTableWrap'),
  tableToolbarWrap: el('adminTableToolbar'),
  newRecordBtn: el('adminNewRecord'), editorName: el('adminEditorName'), logoutBtn: el('adminLogout'),
  loadingState: el('adminLoading'), errorState: el('adminError'), errorDetail: el('adminErrorDetail'),
  formDialog: el('adminFormDialog'), formTitle: el('adminFormTitle'), formWrap: el('adminFormWrap'),
  formError: el('adminFormError'),
  statusBar: el('adminStatus'),
  deploymentWarning: el('adminDeploymentWarning'),
};

const state = {
  sheet: ADMIN_SHEETS[0],
  records: [],
  datasetVersion: null,
  editorName: '',
  search: '',
  sortField: null,
  sortDirection: 'asc',
  page: 1,
};

function showStatus(message, tone = 'info') {
  if (!dom.statusBar) return;
  dom.statusBar.textContent = message;
  dom.statusBar.dataset.tone = tone;
  dom.statusBar.hidden = !message;
}

function editorName() {
  return dom.editorName ? dom.editorName.value.trim() : state.editorName;
}

/** Reseta busca/ordenação/página — usado ao trocar de aba, onde o estado anterior não faz sentido. */
function resetTableState() {
  state.search = '';
  state.sortField = null;
  state.sortDirection = 'asc';
  state.page = 1;
}

// --- Diagnóstico da implantação ------------------------------------------------

/**
 * Orientação por estado devolvido por `checkDeployment()`.
 *
 * A falha mais comum desta tela nunca foi o token em si: é o Web App do Apps Script
 * continuar servindo uma versão antiga do Code.gs porque ninguém reimplantou depois de
 * editar. Antes disso ficar visível aqui, o sintoma chegava como um erro genérico de
 * login, que não aponta para a causa e faz procurar no lugar errado.
 */
const DEPLOYMENT_WARNINGS = {
  stale: {
    title: 'A implantação do Apps Script está desatualizada.',
    body: 'O Web App em uso ainda serve uma versão antiga do Code.gs, e é por isso que o token é '
      + 'recusado. Na planilha: Extensões → Apps Script → Implantar → Gerenciar implantações → '
      + 'ícone de lápis → Versão: Nova versão → Implantar. Salvar o código no editor não atualiza '
      + 'a implantação.',
  },
  'not-json': {
    title: 'A implantação não está acessível publicamente.',
    body: 'O Web App respondeu uma página em vez de JSON, o que costuma significar "Quem tem acesso" '
      + 'diferente de "Qualquer pessoa". Ajuste em Implantar → Gerenciar implantações.',
  },
  unreachable: {
    title: 'Não foi possível contatar o Apps Script.',
    body: 'Confira se appsScriptUrl em src/config.js aponta para a URL /exec da implantação ativa, e '
      + 'se há conexão de rede.',
  },
  unconfigured: {
    title: 'appsScriptUrl não está configurado.',
    body: 'Defina a URL /exec do Web App em src/config.js para a área administrativa funcionar.',
  },
};

/** Desenha (ou esconde) a faixa de diagnóstico. Texto sempre por nó de texto, nunca innerHTML (R4.4). */
function renderDeploymentWarning(status) {
  if (!dom.deploymentWarning) return;

  const warning = DEPLOYMENT_WARNINGS[status];
  if (!warning) {
    dom.deploymentWarning.replaceChildren();
    dom.deploymentWarning.hidden = true;
    return;
  }

  const title = document.createElement('strong');
  title.textContent = warning.title;
  dom.deploymentWarning.replaceChildren(title, document.createTextNode(warning.body));
  dom.deploymentWarning.hidden = false;
}

// --- Login -------------------------------------------------------------------

function showLogin(message) {
  dom.loginScreen.hidden = false;
  dom.app.hidden = true;
  if (dom.loginError) {
    dom.loginError.textContent = message || '';
    dom.loginError.hidden = !message;
  }
}

function showApp() {
  dom.loginScreen.hidden = true;
  dom.app.hidden = false;
}

function bindLogin() {
  if (!dom.loginForm) return;
  dom.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const token = dom.loginToken.value.trim();
    if (!token) return;

    if (dom.loginSubmitBtn) dom.loginSubmitBtn.disabled = true;
    try {
      setToken(token);
      const ok = await validateToken(CONFIG.appsScriptUrl, token);
      dom.loginToken.value = '';
      if (!ok) {
        clearToken();
        showLogin('Token inválido.');
        return;
      }
      showApp();
      resetTableState();
      loadSheet(state.sheet);
    } catch (err) {
      clearToken();
      // Loga SEMPRE o erro original. A versão anterior só logava quando não era
      // WriteApiError — e o caso que mais precisava de diagnóstico (resposta de uma
      // implantação antiga) chegava justamente como WriteApiError de mensagem vazia,
      // então não sobrava pista nem na tela nem no console.
      console.error('Falha no login admin:', err);
      if (err instanceof WriteApiError && err.code === 'STALE_DEPLOYMENT') renderDeploymentWarning('stale');
      showLogin(loginErrorMessage(err));
    } finally {
      if (dom.loginSubmitBtn) dom.loginSubmitBtn.disabled = false;
    }
  });

  if (dom.logoutBtn) {
    dom.logoutBtn.addEventListener('click', () => {
      clearToken();
      dom.loginToken.value = '';
      showLogin();
    });
  }
}

function loginErrorMessage(err) {
  if (!(err instanceof WriteApiError)) return 'Erro inesperado ao entrar.';
  if (err.code === 'STALE_DEPLOYMENT') {
    return 'A implantação do Apps Script está desatualizada — reimplante como nova versão '
      + `(resposta do servidor: ${err.message}).`;
  }
  return err.message || 'Erro inesperado ao entrar.';
}

// --- Abas ----------------------------------------------------------------------

function bindSheetTabs() {
  if (!dom.sheetTabs) return;
  dom.sheetTabs.replaceChildren();
  for (const sheet of ADMIN_SHEETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-tab';
    btn.textContent = SHEET_LABELS[sheet] || sheet;
    btn.dataset.sheet = sheet;
    btn.setAttribute('aria-pressed', String(sheet === state.sheet));
    btn.addEventListener('click', () => {
      if (sheet === state.sheet) return;
      state.sheet = sheet;
      [...dom.sheetTabs.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sheet === sheet)));
      showStatus(''); // status da aba anterior não faz sentido na nova aba
      resetTableState();
      loadSheet(sheet);
    });
    dom.sheetTabs.append(btn);
  }
}

// --- Carregar e renderizar ------------------------------------------------------

async function loadSheet(sheet) {
  setLoading(true);
  setError(null);
  try {
    const result = await listRecords(CONFIG.appsScriptUrl, sheet);
    state.records = result.rows || [];
    state.datasetVersion = result.dataset_version;
    renderTable();
    // Não limpa o status aqui: loadSheet() também é chamado logo depois de uma
    // escrita bem-sucedida (para refletir o valor persistido pelo servidor), e
    // limpar incondicionalmente apagaria a confirmação de "Registro criado."/
    // "atualizado."/"excluído." antes de quem está usando a tela conseguir ler.
    // A troca de aba é quem decide limpar — ver bindSheetTabs().
  } catch (err) {
    setError(err instanceof WriteApiError ? err.message : 'Erro inesperado ao carregar os dados.');
  } finally {
    setLoading(false);
  }
}

/**
 * Aplica busca → ordenação → paginação (nessa ordem — issue #5: "permitir busca,
 * filtros, ordenação e paginação... sem perder o registro/ID") e desenha a barra de
 * ferramentas + a tabela da página atual.
 */
function renderTable() {
  if (!dom.tableWrap) return;

  const fields = columnsFor(state.sheet).filter((c) => c.key !== ID_FIELD[state.sheet]);
  const filtered = filterRecords(state.records, [{ key: ID_FIELD[state.sheet] }, ...fields], state.search);
  const sorted = sortRecords(filtered, state.sortField, state.sortDirection);
  const { rows, page, totalPages, totalRecords } = paginateRecords(sorted, state.page, PAGE_SIZE);
  state.page = page; // corrige se a página pedida não existe mais (ex.: filtro reduziu o total)

  if (dom.tableToolbarWrap) {
    dom.tableToolbarWrap.replaceChildren(buildTableToolbar({
      searchTerm: state.search,
      onSearch: (term) => { state.search = term; state.page = 1; renderTable(); },
      page,
      totalPages,
      totalRecords,
      onPageChange: (nextPage) => { state.page = nextPage; renderTable(); },
    }));
  }

  dom.tableWrap.replaceChildren(buildTable(state.sheet, rows, {
    onEdit: (record) => openForm(record),
    onDelete: (record) => confirmDelete(record),
    onSort: (field) => {
      if (state.sortField === field) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortField = field;
        state.sortDirection = 'asc';
      }
      renderTable();
    },
    sortField: state.sortField,
    sortDirection: state.sortDirection,
  }));
}

function setLoading(isLoading) {
  if (dom.loadingState) dom.loadingState.hidden = !isLoading;
}

function setError(message) {
  if (!dom.errorState) return;
  dom.errorState.hidden = !message;
  if (dom.errorDetail) dom.errorDetail.textContent = message || '';
}

// --- Formulário de criação/edição ------------------------------------------------

function openForm(record) {
  if (!dom.formDialog) return;
  dom.formTitle.textContent = record
    ? `Editar ${SHEET_LABELS[state.sheet]} — ${record[ID_FIELD[state.sheet]]}`
    : `Novo registro — ${SHEET_LABELS[state.sheet]}`;
  setFormError(null);

  const form = buildForm(state.sheet, record, {
    onSubmit: (values) => submitForm(record, values),
    onCancel: closeForm,
  });
  dom.formWrap.replaceChildren(form);
  dom.formDialog.hidden = false;
}

function closeForm() {
  if (dom.formDialog) dom.formDialog.hidden = true;
}

function setFormError(message) {
  if (!dom.formError) return;
  dom.formError.hidden = !message;
  dom.formError.textContent = message || '';
}

/**
 * Só envia campos que mudaram, em edição — patch, não substituição integral.
 *
 * Na criação, `values` inclui o campo de ID (buildForm adiciona um input próprio para
 * ele — ver admin-ui.js), que precisa ir só no `id` de topo da requisição, nunca
 * dentro de `fields`: o servidor rejeita qualquer chave fora de WRITE_ALLOWLIST, e o
 * ID nunca está lá (é imutável, docs/DATA_CONTRACT.md).
 */
function diffFields(sheet, record, values) {
  if (!record) {
    const { [ID_FIELD[sheet]]: _id, ...rest } = values;
    return rest;
  }
  const out = {};
  for (const field of ADMIN_FIELDS[sheet]) {
    const before = field.type === 'bool' ? Boolean(record[field.key]) : String(record[field.key] ?? '');
    const after = field.type === 'bool' ? values[field.key] : String(values[field.key] ?? '');
    if (before !== after) out[field.key] = values[field.key];
  }
  return out;
}

/**
 * Campos obrigatórios (na criação) que vieram vazios do formulário.
 *
 * `buildForm` sempre devolve um valor para todo campo (mesmo vazio), então checar
 * `Object.keys(fields).length` nunca detecta "obrigatório não preenchido" — length é
 * sempre 26/23/16. É preciso olhar o valor de cada campo marcado `required`.
 */
function missingRequiredFields(sheet, values) {
  return (ADMIN_FIELDS[sheet] || [])
    .filter((field) => field.required)
    .filter((field) => {
      const value = values[field.key];
      return field.type === 'bool' ? false : String(value ?? '').trim() === '';
    })
    .map((field) => field.label);
}

async function submitForm(record, values) {
  const sheet = state.sheet;
  const id = record ? record[ID_FIELD[sheet]] : values[ID_FIELD[sheet]];

  if (!record) {
    const missing = missingRequiredFields(sheet, values);
    if (missing.length > 0) {
      setFormError('Campo(s) obrigatório(s) ausente(s): ' + missing.join(', ') + '.');
      return;
    }
    if (!id) {
      setFormError('Informe o identificador do novo registro.');
      return;
    }
  }

  const fields = diffFields(sheet, record, values);
  if (record && Object.keys(fields).length === 0) {
    setFormError('Nenhum campo mudou de valor.');
    return;
  }

  const correlationId = newCorrelationId();
  try {
    const result = record
      ? await updateRecord(CONFIG.appsScriptUrl, {
        sheet, id, fields, editor: editorName(), expectedVersion: state.datasetVersion, correlationId,
      })
      : await createRecord(CONFIG.appsScriptUrl, { sheet, id, fields, editor: editorName(), correlationId });

    state.datasetVersion = result.dataset_version;
    closeForm();
    showStatus(record ? 'Registro atualizado.' : 'Registro criado.', 'ok');
    await loadSheet(sheet); // recarrega para refletir o valor persistido pelo servidor
  } catch (err) {
    handleWriteError(err);
  }
}

function confirmDelete(record) {
  const id = record[ID_FIELD[state.sheet]];
  // eslint-disable-next-line no-alert -- confirmação explícita e destrutiva, ver critérios de aceite da issue #5
  if (!window.confirm(`Excluir o registro ${id}? Esta ação não pode ser desfeita.`)) return;
  runDelete(record);
}

async function runDelete(record) {
  const sheet = state.sheet;
  const id = record[ID_FIELD[sheet]];
  const correlationId = newCorrelationId();
  try {
    const result = await deleteRecord(CONFIG.appsScriptUrl, {
      sheet, id, editor: editorName(), expectedVersion: state.datasetVersion, correlationId,
    });
    state.datasetVersion = result.dataset_version;
    showStatus('Registro excluído.', 'ok');
    await loadSheet(sheet);
  } catch (err) {
    handleWriteError(err);
  }
}

const ERROR_MESSAGES = {
  UNAUTHENTICATED: 'Token inválido ou expirado. Entre novamente.',
  VERSION_CONFLICT: 'Os dados mudaram desde que você carregou este registro. Recarregando a lista — revise antes de tentar de novo.',
  NOT_FOUND: 'Este registro não existe mais — provavelmente foi excluído por outra pessoa.',
  NETWORK_ERROR: 'Falha de rede. Verifique a conexão e tente novamente.',
  STALE_DEPLOYMENT: 'A implantação do Apps Script está desatualizada — reimplante como nova versão '
    + '(Implantar → Gerenciar implantações) e recarregue esta página.',
};

/** Sufixo com o correlation_id, para quem for reportar o problema conseguir apontar a operação exata. */
function withCorrelation(message, correlationId) {
  return correlationId ? `${message} (referência: ${correlationId})` : message;
}

function handleWriteError(err) {
  const code = err instanceof WriteApiError ? err.code : 'INTERNAL_ERROR';
  const correlationId = err instanceof WriteApiError ? err.correlationId : '';
  const message = withCorrelation(ERROR_MESSAGES[code] || (err && err.message) || 'Erro inesperado.', correlationId);

  if (code === 'UNAUTHENTICATED') {
    clearToken();
    showLogin(message);
    return;
  }

  setFormError(message);
  if (code === 'VERSION_CONFLICT' || code === 'NOT_FOUND') {
    loadSheet(state.sheet); // reflete o estado atual antes de deixar tentar de novo
  }
}

// --- Boot ------------------------------------------------------------------------

function bindNewRecord() {
  if (dom.newRecordBtn) dom.newRecordBtn.addEventListener('click', () => openForm(null));
}

export function main() {
  bindLogin();
  bindSheetTabs();
  bindNewRecord();

  if (getToken()) {
    showApp();
    loadSheet(state.sheet);
  } else {
    showLogin();
  }

  // Sonda em segundo plano, deliberadamente sem `await`: ela só acrescenta diagnóstico,
  // nunca é pré-requisito para tentar entrar. Se a própria sonda falhar, a tela segue
  // funcionando como antes.
  checkDeployment(CONFIG.appsScriptUrl)
    .then((result) => renderDeploymentWarning(result.status))
    .catch((err) => console.error('Sonda de implantação falhou:', err));
}

document.addEventListener('DOMContentLoaded', main);
