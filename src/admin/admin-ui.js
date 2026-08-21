// Tabela e formulário genéricos, orientados pelo schema de admin-schema.js.
//
// Mesma regra de segurança do restante do projeto: nenhuma string vinda dos dados
// entra em innerHTML — tudo por createElement/textContent (docs/ENGINEERING_RULES.md,
// R4.4). Este módulo não fala com a rede; recebe dados prontos e emite eventos via
// callback.

import { ADMIN_FIELDS, ID_FIELD, DERIVED_PRICE_M2_FIELD, ENUM_VALUES } from './admin-schema.js';

const INPUT_TYPE = {
  text: 'text', number: 'number', int: 'number', date: 'date', url: 'url', bool: 'checkbox',
};

function textCell(value) {
  const td = document.createElement('td');
  td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
  return td;
}

/**
 * Todas as colunas de uma aba, na ordem em que aparecem na tabela: ID primeiro,
 * depois cada campo editável (mesma ordem do formulário), e o campo derivado por
 * último quando a aba tem um. Issue #5: "exibir os dados completos, sem limitar a
 * tela aos campos usados no mapa" — a versão anterior desta função mostrava só um
 * preview de ~5 colunas.
 */
export function columnsFor(sheet) {
  const idField = ID_FIELD[sheet];
  const columns = [{ key: idField, label: idField }];
  for (const field of ADMIN_FIELDS[sheet] || []) columns.push({ key: field.key, label: field.label });

  const derivedTarget = DERIVED_PRICE_M2_FIELD[sheet];
  if (derivedTarget) columns.push({ key: derivedTarget, label: derivedTarget + ' (calculado)' });

  return columns;
}

/**
 * Tabela genérica de uma aba, já recebendo os registros prontos para exibir (busca,
 * ordenação e paginação já aplicadas por quem chama — ver src/admin/admin-table.js).
 * `records` são objetos crus `{header: valor}`, como o endpoint `?resource=dataset`
 * devolve — sem passar por normalize.js, porque a área administrativa precisa dos
 * valores brutos para editar, não dos derivados de exibição.
 *
 * Cabeçalho clicável ordena (issue #5: "permitir... ordenação"); `sortField`/
 * `sortDirection` só decidem a seta exibida, quem de fato ordena é `onSort`.
 */
export function buildTable(sheet, records, { onEdit, onDelete, onSort, sortField, sortDirection } = {}) {
  const columns = columnsFor(sheet);

  const table = document.createElement('table');
  table.className = 'admin-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  columns.forEach((col) => {
    const th = document.createElement('th');
    if (onSort) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'admin-sort-btn';
      const arrow = col.key === sortField ? (sortDirection === 'desc' ? ' ▼' : ' ▲') : '';
      btn.textContent = col.label + arrow;
      btn.addEventListener('click', () => onSort(col.key));
      th.append(btn);
    } else {
      th.textContent = col.label;
    }
    headRow.append(th);
  });
  const actionsTh = document.createElement('th');
  actionsTh.textContent = 'ações';
  headRow.append(actionsTh);
  thead.append(headRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  for (const record of records) {
    const tr = document.createElement('tr');
    columns.forEach((col) => tr.append(textCell(record[col.key])));

    const actionsTd = document.createElement('td');
    actionsTd.className = 'admin-table-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-ghost';
    editBtn.textContent = 'Editar';
    editBtn.addEventListener('click', () => onEdit && onEdit(record));
    actionsTd.append(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-ghost admin-btn-danger';
    deleteBtn.textContent = 'Excluir';
    deleteBtn.addEventListener('click', () => onDelete && onDelete(record));
    actionsTd.append(deleteBtn);

    tr.append(actionsTd);
    tbody.append(tr);
  }
  table.append(tbody);

  if (records.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'Nenhum registro encontrado.';
    const wrap = document.createDocumentFragment();
    wrap.append(table, empty);
    return wrap;
  }

  return table;
}

/**
 * Barra de busca + paginação acima da tabela (issue #5: "permitir busca... e
 * paginação/virtualização para datasets maiores"). Puramente DOM — o estado (termo,
 * página) mora em admin-app.js, que decide o que filtrar/paginar via
 * src/admin/admin-table.js.
 */
export function buildTableToolbar({ searchTerm, onSearch, page, totalPages, totalRecords, onPageChange }) {
  const bar = document.createElement('div');
  bar.className = 'admin-table-toolbar';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'admin-search';
  const searchLabel = document.createElement('label');
  searchLabel.textContent = 'Buscar';
  searchLabel.htmlFor = 'admin-table-search';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.id = 'admin-table-search';
  searchInput.value = searchTerm || '';
  searchInput.placeholder = 'Buscar em qualquer campo…';
  searchInput.addEventListener('input', () => onSearch && onSearch(searchInput.value));
  searchWrap.append(searchLabel, searchInput);
  bar.append(searchWrap);

  const pager = document.createElement('div');
  pager.className = 'admin-pager';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn-ghost';
  prevBtn.textContent = '‹ Anterior';
  prevBtn.disabled = page <= 1;
  prevBtn.addEventListener('click', () => onPageChange && onPageChange(page - 1));

  const info = document.createElement('span');
  info.className = 'admin-pager-info';
  info.textContent = `Página ${page} de ${totalPages} · ${totalRecords} registro(s)`;

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn-ghost';
  nextBtn.textContent = 'Próxima ›';
  nextBtn.disabled = page >= totalPages;
  nextBtn.addEventListener('click', () => onPageChange && onPageChange(page + 1));

  pager.append(prevBtn, info, nextBtn);
  bar.append(pager);

  return bar;
}

/** Lê o valor de um input conforme o tipo declarado, para montar o payload de escrita. */
function readFieldValue(input, type) {
  if (type === 'bool') return input.checked;
  return input.value;
}

/**
 * Formulário genérico de criação/edição. `record` é `null` para criação. Constrói um
 * `<form>` com um input por campo do schema, e destaca (`admin-field-changed`) os
 * campos que o usuário mudou em relação ao valor original — só faz sentido em edição.
 */
export function buildForm(sheet, record, { onSubmit, onCancel } = {}) {
  const fields = ADMIN_FIELDS[sheet] || [];
  const form = document.createElement('form');
  form.className = 'admin-form';
  form.noValidate = true;

  const inputs = {};
  const idField = ID_FIELD[sheet];

  // Só na criação: o ID não está em ADMIN_FIELDS (é imutável depois de criado, nunca
  // vai em `fields` — ver docs/DATA_CONTRACT.md), então precisa de um input à parte.
  // Em edição, o ID já é conhecido (vem de `record`) e não é reenviado como campo.
  if (!record) {
    const wrap = document.createElement('div');
    wrap.className = 'admin-form-field';
    const label = document.createElement('label');
    label.textContent = `Identificador (${idField}) *`;
    label.htmlFor = 'admin-field-id';
    wrap.append(label);
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'admin-field-id';
    input.name = idField;
    input.required = true;
    wrap.append(input);
    form.append(wrap);
    inputs[idField] = { input, type: 'text' };
  }

  for (const field of fields) {
    const wrap = document.createElement('div');
    wrap.className = 'admin-form-field';

    const label = document.createElement('label');
    label.textContent = field.label + (field.required ? ' *' : '');
    label.htmlFor = `admin-field-${field.key}`;
    wrap.append(label);

    let input;
    if (field.type === 'bool') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = record ? Boolean(record[field.key]) : false;
    } else if (field.type.indexOf('enum:') === 0) {
      const enumName = field.type.slice(5);
      input = document.createElement('select');
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '— selecione —';
      input.append(blank);
      for (const value of ENUM_VALUES[enumName] || []) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        input.append(opt);
      }
      input.value = record ? String(record[field.key] ?? '') : '';
    } else {
      input = document.createElement('input');
      input.type = INPUT_TYPE[field.type] || 'text';
      if (field.type === 'number') input.step = 'any';
      input.value = record ? String(record[field.key] ?? '') : '';
    }
    input.id = `admin-field-${field.key}`;
    input.name = field.key;
    if (field.required) input.required = true;

    const original = record ? record[field.key] : undefined;
    input.addEventListener('input', () => {
      const changed = field.type === 'bool'
        ? input.checked !== Boolean(original)
        : input.value !== String(original ?? '');
      wrap.classList.toggle('admin-field-changed', changed);
    });

    wrap.append(input);
    form.append(wrap);
    inputs[field.key] = { input, type: field.type };
  }

  const derivedTarget = DERIVED_PRICE_M2_FIELD[sheet];
  if (derivedTarget) {
    const note = document.createElement('p');
    note.className = 'admin-form-note';
    note.textContent = `${derivedTarget} é calculado automaticamente pelo servidor a partir dos campos de preço e área — não aparece neste formulário.`;
    form.append(note);
  }

  const actions = document.createElement('div');
  actions.className = 'admin-form-actions';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn';
  submitBtn.textContent = record ? 'Salvar alterações' : 'Criar registro';
  actions.append(submitBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-ghost';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.addEventListener('click', () => onCancel && onCancel());
  actions.append(cancelBtn);

  form.append(actions);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = {};
    for (const [key, { input, type }] of Object.entries(inputs)) {
      values[key] = readFieldValue(input, type);
    }
    onSubmit && onSubmit(values);
  });

  return form;
}

