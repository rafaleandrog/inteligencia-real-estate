import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWritePayload, parseWriteResponse, WriteApiError, newCorrelationId,
  login, createRecord, updateRecord, deleteRecord, listRecords,
  getSession, clearSession,
} from '../src/admin/admin-service.js';

// admin-service.js é o cliente HTTP da API de escrita — aqui testamos o shaping do
// request/response (puro) e o comportamento com `fetch` mockado, sem rede real.
//
// Login em dois passos (issue #5): `login()` troca token por sessão; createRecord/
// updateRecord/deleteRecord mandam `session`, nunca `token`.

// --- buildWritePayload / parseWriteResponse -------------------------------------

test('buildWritePayload omite campos ausentes em vez de enviá-los vazios', () => {
  const body = buildWritePayload({ session: 's', action: 'create', sheet: 'LISTINGS' });
  assert.deepEqual(body, { session: 's', action: 'create', sheet: 'LISTINGS' });
  assert.equal('id' in body, false);
  assert.equal('expected_version' in body, false);
  assert.equal('editor' in body, false);
  assert.equal('correlation_id' in body, false);
});

test('buildWritePayload inclui expected_version como string e correlation_id quando presentes', () => {
  const body = buildWritePayload({
    session: 's', action: 'update', sheet: 'LISTINGS', id: 'X', expectedVersion: 7,
    correlationId: 'corr-1',
  });
  assert.equal(body.expected_version, '7');
  assert.equal(body.correlation_id, 'corr-1');
});

test('parseWriteResponse devolve o payload quando ok=true', () => {
  const json = { ok: true, record: { a: 1 }, dataset_version: '2' };
  assert.deepEqual(parseWriteResponse(json), json);
});

test('parseWriteResponse lança WriteApiError tipado quando ok=false, com correlation_id', () => {
  assert.throws(
    () => parseWriteResponse({
      ok: false, error: { code: 'NOT_FOUND', message: 'sumiu' }, correlation_id: 'corr-2',
    }),
    (err) => err instanceof WriteApiError && err.code === 'NOT_FOUND' && err.message === 'sumiu'
      && err.correlationId === 'corr-2',
  );
});

test('parseWriteResponse lança INTERNAL_ERROR para resposta sem o formato esperado', () => {
  assert.throws(() => parseWriteResponse({}), (err) => err instanceof WriteApiError && err.code === 'INTERNAL_ERROR');
});

test('newCorrelationId devolve valores não vazios e diferentes a cada chamada', () => {
  const a = newCorrelationId();
  const b = newCorrelationId();
  assert.ok(a && a.length > 0);
  assert.ok(b && b.length > 0);
  assert.notEqual(a, b);
});

// --- sessão (sessionStorage) ------------------------------------------------------

// `fn` costuma devolver uma Promise (quando combinado com withFetchMock) — usar
// try/finally síncrono aqui apagaria o sessionStorage antes do fetch mockado
// resolver. `.finally()` na Promise garante a limpeza só depois de tudo terminar.
function withSessionStorage(fn) {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  return Promise.resolve(fn(store)).finally(() => { delete globalThis.sessionStorage; });
}

test('getSession/clearSession funcionam sem lançar quando sessionStorage existe', () => {
  withSessionStorage(() => {
    assert.equal(getSession(), '');
    clearSession(); // não deve lançar mesmo vazio
    assert.equal(getSession(), '');
  });
});

test('getSession não lança quando sessionStorage está indisponível', () => {
  delete globalThis.sessionStorage;
  assert.doesNotThrow(() => { getSession(); clearSession(); });
});

// --- login / createRecord / updateRecord / deleteRecord (fetch mockado) ----------

function withFetchMock(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return fn().finally(() => { globalThis.fetch = original; });
}

test('login troca token por sessão, guarda a sessão (nunca o token) e nunca manda o token de novo', async () => {
  await withSessionStorage(() => withFetchMock(async (url, opts) => {
    const body = JSON.parse(opts.body);
    assert.equal(body.action, 'authenticate');
    assert.equal(body.token, 'meu-token');
    assert.equal('session' in body, false); // login não manda sessão, só token
    return { json: async () => ({ ok: true, session: 'sess-abc', expires_in: 1800 }) };
  }, async () => {
    const res = await login('https://script.example/exec', 'meu-token');
    assert.equal(res.session, 'sess-abc');
    assert.equal(getSession(), 'sess-abc');
  }));
});

test('login propaga UNAUTHENTICATED como WriteApiError e não guarda sessão', async () => {
  await withSessionStorage(() => withFetchMock(async () => ({
    json: async () => ({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'token errado' } }),
  }), async () => {
    await assert.rejects(
      () => login('https://script.example/exec', 'errado'),
      (err) => err instanceof WriteApiError && err.code === 'UNAUTHENTICATED',
    );
    assert.equal(getSession(), '');
  }));
});

test('login propaga RATE_LIMITED como WriteApiError', async () => {
  await withFetchMock(async () => ({
    json: async () => ({ ok: false, error: { code: 'RATE_LIMITED', message: 'aguarde' } }),
  }), async () => {
    await assert.rejects(
      () => login('https://script.example/exec', 'x'),
      (err) => err instanceof WriteApiError && err.code === 'RATE_LIMITED',
    );
  });
});

test('createRecord envia POST com session (não token), action=create e devolve o record em sucesso', async () => {
  let captured = null;
  await withSessionStorage((store) => {
    store.set('imob_admin_session', 'sess-xyz');
    return withFetchMock(async (url, opts) => {
      captured = { url, opts };
      return { json: async () => ({ ok: true, record: { listing_id: 'L1' }, dataset_version: '2', correlation_id: 'corr-3' }) };
    }, async () => {
      const res = await createRecord('https://script.example/exec', {
        sheet: 'LISTINGS', id: 'L1', fields: { title: 'X' }, editor: 'Fulano', correlationId: 'corr-3',
      });
      assert.equal(res.record.listing_id, 'L1');
      assert.equal(res.correlation_id, 'corr-3');
    });
  });

  assert.equal(captured.url, 'https://script.example/exec');
  assert.equal(captured.opts.method, 'POST');
  const body = JSON.parse(captured.opts.body);
  assert.equal(body.action, 'create');
  assert.equal(body.sheet, 'LISTINGS');
  assert.equal(body.id, 'L1');
  assert.equal(body.editor, 'Fulano');
  assert.equal(body.session, 'sess-xyz');
  assert.equal(body.correlation_id, 'corr-3');
  assert.equal('token' in body, false);
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
