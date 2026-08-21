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

/** Colunas mostradas na tabela: um resumo, não todos os campos (a edição abre o formulário completo). */
const TABLE_PREVIEW_FIELDS = {
  LISTINGS: ['title', 'locality', 'property_type', 'asking_price_brl', 'area_m2', 'status'],
  DEVELOPMENTS: ['name', 'neighborhood', 'status', 'current_price_brl', 'spatial_usable'],
  ANCHORS: ['name', 'category', 'neighborhood', 'status'],
};

function textCell(value) {
  const td = document.createElement('td');
  td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
  return td;
}

/**
 * Tabela genérica de uma aba. `records` são objetos crus `{header: valor}`, como o
 * endpoint `?resource=dataset` devolve — sem passar por normalize.js, porque a área
 * administrativa precisa dos valores brutos para editar, não dos derivados de exibição.
 */
export function buildTable(sheet, records, { onEdit, onDelete } = {}) {
  const idField = ID_FIELD[sheet];
  const previewFields = TABLE_PREVIEW_FIELDS[sheet] || [];

  const table = document.createElement('table');
  table.className = 'admin-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  [idField, ...previewFields, 'ações'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.append(th);
  });
  thead.append(headRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  for (const record of records) {
    const tr = document.createElement('tr');
    tr.append(textCell(record[idField]));
    previewFields.forEach((field) => tr.append(textCell(record[field])));

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
    empty.textContent = 'Nenhum registro nesta aba.';
    const wrap = document.createDocumentFragment();
    wrap.append(table, empty);
    return wrap;
  }

  return table;
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

