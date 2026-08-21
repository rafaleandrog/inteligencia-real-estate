import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWritePayload, parseWriteResponse, WriteApiError,
  createRecord, updateRecord, deleteRecord, listRecords,
  getToken, setToken, clearToken,
} from '../src/admin/admin-service.js';

// admin-service.js é o cliente HTTP da API de escrita — aqui testamos o shaping do
// request/response (puro) e o comportamento com `fetch` mockado, sem rede real.

// --- buildWritePayload / parseWriteResponse -------------------------------------

test('buildWritePayload omite campos ausentes em vez de enviá-los vazios', () => {
  const body = buildWritePayload({ token: 't', action: 'create', sheet: 'LISTINGS' });
  assert.deepEqual(body, { token: 't', action: 'create', sheet: 'LISTINGS' });
  assert.equal('id' in body, false);
  assert.equal('expected_version' in body, false);
  assert.equal('editor' in body, false);
});

test('buildWritePayload inclui expected_version como string', () => {
  const body = buildWritePayload({
    token: 't', action: 'update', sheet: 'LISTINGS', id: 'X', expectedVersion: 7,
  });
  assert.equal(body.expected_version, '7');
});

test('parseWriteResponse devolve o payload quando ok=true', () => {
  const json = { ok: true, record: { a: 1 }, dataset_version: '2' };
  assert.deepEqual(parseWriteResponse(json), json);
});

test('parseWriteResponse lança WriteApiError tipado quando ok=false', () => {
  assert.throws(
    () => parseWriteResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'sumiu' } }),
    (err) => err instanceof WriteApiError && err.code === 'NOT_FOUND' && err.message === 'sumiu',
  );
});

test('parseWriteResponse lança INTERNAL_ERROR para resposta sem o formato esperado', () => {
  assert.throws(() => parseWriteResponse({}), (err) => err instanceof WriteApiError && err.code === 'INTERNAL_ERROR');
});

// --- token (sessionStorage) ------------------------------------------------------

test('getToken/setToken/clearToken funcionam sem lançar quando sessionStorage existe', () => {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  try {
    assert.equal(getToken(), '');
    setToken('abc123');
    assert.equal(getToken(), 'abc123');
    clearToken();
    assert.equal(getToken(), '');
  } finally {
    delete globalThis.sessionStorage;
  }
});

test('getToken/setToken/clearToken não lançam quando sessionStorage está indisponível', () => {
  delete globalThis.sessionStorage;
  assert.doesNotThrow(() => {
    setToken('x');
    getToken();
    clearToken();
  });
});

// --- createRecord / updateRecord / deleteRecord (fetch mockado) ------------------

function withFetchMock(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return fn().finally(() => { globalThis.fetch = original; });
}

test('createRecord envia POST com action=create e devolve o record em sucesso', async () => {
  let captured = null;
  await withFetchMock(async (url, opts) => {
    captured = { url, opts };
    return { json: async () => ({ ok: true, record: { listing_id: 'L1' }, dataset_version: '2' }) };
  }, async () => {
    const res = await createRecord('https://script.example/exec', {
      sheet: 'LISTINGS', id: 'L1', fields: { title: 'X' }, editor: 'Fulano',
    });
    assert.equal(res.record.listing_id, 'L1');
  });

  assert.equal(captured.url, 'https://script.example/exec');
  assert.equal(captured.opts.method, 'POST');
  const body = JSON.parse(captured.opts.body);
  assert.equal(body.action, 'create');
  assert.equal(body.sheet, 'LISTINGS');
  assert.equal(body.id, 'L1');
  assert.equal(body.editor, 'Fulano');
});

test('updateRecord propaga VERSION_CONFLICT como WriteApiError', async () => {
  await withFetchMock(async () => ({
    json: async () => ({ ok: false, error: { code: 'VERSION_CONFLICT', message: 'mudou' } }),
  }), async () => {
    await assert.rejects(
      () => updateRecord('https://script.example/exec', {
        sheet: 'LISTINGS', id: 'L1', fields: { title: 'Y' }, expectedVersion: '1',
      }),
      (err) => err instanceof WriteApiError && err.code === 'VERSION_CONFLICT',
    );
  });
});

test('deleteRecord envia action=delete sem fields', async () => {
  let captured = null;
  await withFetchMock(async (url, opts) => {
    captured = opts;
    return { json: async () => ({ ok: true, record: { id: 'L1' }, dataset_version: '3' }) };
  }, async () => {
    await deleteRecord('https://script.example/exec', { sheet: 'LISTINGS', id: 'L1', expectedVersion: '2' });
  });

  const body = JSON.parse(captured.body);
  assert.equal(body.action, 'delete');
  assert.equal('fields' in body, false);
});

test('createRecord lança NETWORK_ERROR quando fetch falha', async () => {
  await withFetchMock(async () => { throw new Error('offline'); }, async () => {
    await assert.rejects(
      () => createRecord('https://script.example/exec', { sheet: 'LISTINGS', id: 'L1', fields: {} }),
      (err) => err instanceof WriteApiError && err.code === 'NETWORK_ERROR',
    );
  });
});

// --- listRecords -------------------------------------------------------------------

test('listRecords monta a URL de leitura pública e devolve o payload', async () => {
  let capturedUrl = null;
  await withFetchMock(async (url) => {
    capturedUrl = url;
    return { json: async () => ({ name: 'LISTINGS', dataset_version: '5', count: 1, rows: [{ listing_id: 'L1' }] }) };
  }, async () => {
    const res = await listRecords('https://script.example/exec', 'LISTINGS');
    assert.equal(res.dataset_version, '5');
    assert.equal(res.rows.length, 1);
  });
  assert.equal(capturedUrl, 'https://script.example/exec?resource=dataset&name=LISTINGS');
});

test('listRecords lança erro quando o servidor devolve { error }', async () => {
  await withFetchMock(async () => ({ json: async () => ({ error: 'dataset não permitido' }) }), async () => {
    await assert.rejects(() => listRecords('https://script.example/exec', 'FOO'), WriteApiError);
  });
});
