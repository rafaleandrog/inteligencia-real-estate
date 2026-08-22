import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWritePayload, parseWriteResponse, WriteApiError, newCorrelationId,
  validateToken, createRecord, updateRecord, deleteRecord, listRecords,
  getToken, setToken, clearToken, checkDeployment, WRITE_API_PROTOCOL,
} from '../src/admin/admin-service.js';

// admin-service.js é o cliente HTTP da API de escrita — aqui testamos o shaping do
// request/response (puro) e o comportamento com `fetch` mockado, sem rede real.
//
// Token direto por requisição (mesmo padrão do tipolis-sandbox): não há troca por
// sessão — o token é guardado em sessionStorage e reenviado em toda chamada.
// `validateToken()` faz uma chamada barata (`action: 'validate'`) para conferir o
// token no portão de login, sem ler nem escrever nada.

// --- buildWritePayload / parseWriteResponse -------------------------------------

test('buildWritePayload omite campos ausentes em vez de enviá-los vazios', () => {
  const body = buildWritePayload({ token: 't', action: 'create', sheet: 'LISTINGS' });
  assert.deepEqual(body, { token: 't', action: 'create', sheet: 'LISTINGS' });
  assert.equal('id' in body, false);
  assert.equal('expected_version' in body, false);
  assert.equal('editor' in body, false);
  assert.equal('correlation_id' in body, false);
});

test('buildWritePayload inclui expected_version como string e correlation_id quando presentes', () => {
  const body = buildWritePayload({
    token: 't', action: 'update', sheet: 'LISTINGS', id: 'X', expectedVersion: 7,
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

// Regressão: um Web App implantado numa versão antiga do Code.gs responde
// `{ ok: false, error: "texto" }` em vez de `error: { code, message }`. A versão
// anterior fazia `(json.error || {}).message` — como string não vazia é truthy, o
// fallback `|| {}` não disparava, `.message` virava undefined e o WriteApiError
// nascia com mensagem VAZIA. Na tela isso saía como "Erro inesperado ao entrar." e o
// motivo real do servidor era descartado em todos os canais (tela, console e o
// próprio objeto de erro).
test('parseWriteResponse preserva a mensagem quando `error` vem como texto simples', () => {
  assert.throws(
    () => parseWriteResponse({ ok: false, error: 'Sessao invalida.', time: '2026-08-22T02:00:00Z' }),
    (err) => err instanceof WriteApiError
      && err.code === 'STALE_DEPLOYMENT'
      && err.message === 'Sessao invalida.',
  );
});

test('parseWriteResponse nunca produz mensagem vazia', () => {
  for (const json of [{}, { ok: false }, { ok: false, error: '' }, { ok: false, error: '   ' }]) {
    assert.throws(() => parseWriteResponse(json), (err) => err instanceof WriteApiError && err.message.length > 0);
  }
});

test('newCorrelationId devolve valores não vazios e diferentes a cada chamada', () => {
  const a = newCorrelationId();
  const b = newCorrelationId();
  assert.ok(a && a.length > 0);
  assert.ok(b && b.length > 0);
  assert.notEqual(a, b);
});

// --- token (sessionStorage) --------------------------------------------------------

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

test('getToken/setToken/clearToken funcionam sem lançar quando sessionStorage existe', () => {
  withSessionStorage(() => {
    assert.equal(getToken(), '');
    setToken('abc');
    assert.equal(getToken(), 'abc');
    clearToken();
    assert.equal(getToken(), '');
  });
});

test('getToken não lança quando sessionStorage está indisponível', () => {
  delete globalThis.sessionStorage;
  assert.doesNotThrow(() => { getToken(); setToken('x'); clearToken(); });
});

// --- validateToken / createRecord / updateRecord / deleteRecord (fetch mockado) --

function withFetchMock(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return fn().finally(() => { globalThis.fetch = original; });
}

test('validateToken manda action=validate com o token e devolve true em sucesso', async () => {
  await withFetchMock(async (url, opts) => {
    const body = JSON.parse(opts.body);
    assert.equal(body.action, 'validate');
    assert.equal(body.token, 'meu-token');
    return { json: async () => ({ ok: true, record: { valid: true } }) };
  }, async () => {
    const ok = await validateToken('https://script.example/exec', 'meu-token');
    assert.equal(ok, true);
  });
});

test('validateToken devolve false em UNAUTHENTICATED, sem lançar', async () => {
  await withFetchMock(async () => ({
    json: async () => ({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'token errado' } }),
  }), async () => {
    const ok = await validateToken('https://script.example/exec', 'errado');
    assert.equal(ok, false);
  });
});

test('validateToken propaga outros erros (ex. NETWORK_ERROR) como WriteApiError', async () => {
  await withFetchMock(async () => { throw new Error('offline'); }, async () => {
    await assert.rejects(
      () => validateToken('https://script.example/exec', 'x'),
      (err) => err instanceof WriteApiError && err.code === 'NETWORK_ERROR',
    );
  });
});

test('createRecord envia POST com token, action=create e devolve o record em sucesso', async () => {
  let captured = null;
  await withSessionStorage((store) => {
    store.set('imob_admin_token', 'meu-token');
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
  assert.equal(body.token, 'meu-token');
  assert.equal(body.correlation_id, 'corr-3');
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

// --- checkDeployment ----------------------------------------------------------------

// A sonda distingue os quatro modos de falha da implantação do Apps Script para que a
// tela diga o que fazer, em vez de reportar tudo como erro de token. Ela nunca lança:
// diagnóstico não pode impedir uma tentativa de login legítima.

test('checkDeployment reconhece a implantação atual pelo marcador write_api', async () => {
  let capturedUrl = null;
  await withFetchMock(async (url) => {
    capturedUrl = url;
    return { json: async () => ({ status: 'ok', app_version: '1.0.0', write_api: WRITE_API_PROTOCOL }) };
  }, async () => {
    const result = await checkDeployment('https://script.example/exec');
    assert.equal(result.status, 'ok');
    assert.equal(result.appVersion, '1.0.0');
  });
  assert.equal(capturedUrl, 'https://script.example/exec?resource=health');
});

test('checkDeployment marca como stale um health sem write_api (Web App de versão antiga)', async () => {
  await withFetchMock(async () => ({
    json: async () => ({ ok: true, app: 'imob-intelligence', app_version: '1.1.0' }),
  }), async () => {
    const result = await checkDeployment('https://script.example/exec');
    assert.equal(result.status, 'stale');
    assert.equal(result.appVersion, '1.1.0');
  });
});

test('checkDeployment marca como not-json quando a resposta não é JSON', async () => {
  await withFetchMock(async () => ({ json: async () => { throw new Error('Unexpected token <'); } }), async () => {
    assert.equal((await checkDeployment('https://script.example/exec')).status, 'not-json');
  });
});

test('checkDeployment marca como unreachable quando o fetch falha, sem lançar', async () => {
  await withFetchMock(async () => { throw new Error('offline'); }, async () => {
    assert.equal((await checkDeployment('https://script.example/exec')).status, 'unreachable');
  });
});

test('checkDeployment marca como unconfigured sem appsScriptUrl, sem tocar na rede', async () => {
  assert.equal((await checkDeployment('')).status, 'unconfigured');
  assert.equal((await checkDeployment(undefined)).status, 'unconfigured');
});
