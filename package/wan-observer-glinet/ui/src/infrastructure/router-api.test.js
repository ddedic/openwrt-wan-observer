const assert = require('node:assert/strict');
const test = require('node:test');

const { createRouterApi } = require('./router-api');

const token = 'a'.repeat(32);
const response = (data, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => data,
});

test('GET preserves period, credentials, cache and abort signal; reads a fresh cookie each time', async () => {
  const calls = [];
  let cookie = token;
  const api = createRouterApi({
    fetch: async (...args) => {
      calls.push(args);
      return response({ measurements: [] });
    },
    getCookie: (name) => {
      assert.equal(name, 'Admin-Token');
      return cookie;
    },
  });
  const signal = new AbortController().signal;

  assert.deepEqual(await api(signal, undefined, '?period=30'), {
    measurements: [],
  });
  assert.deepEqual(calls[0], [
    '/cgi-bin/wan-observer?period=30',
    {
      headers: { 'X-GL-Admin-Token': token },
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    },
  ]);
  cookie = 'b'.repeat(32);
  await api(signal);
  assert.equal(calls[1][0], '/cgi-bin/wan-observer');
  assert.equal(calls[1][1].headers['X-GL-Admin-Token'], cookie);
});

test('POST serializes the existing settings/action payload without adding GET options', async () => {
  let options;
  const api = createRouterApi({
    fetch: async (url, value) => {
      assert.equal(url, '/cgi-bin/wan-observer');
      options = value;
      return response({ started: true });
    },
    getCookie: () => token,
  });
  const body = { action: 'run_speedtest' };

  await api(undefined, body);
  assert.equal(options.method, 'POST');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(options.body, JSON.stringify(body));
});

test('missing and malformed session cookies never send a request', async () => {
  for (const cookie of [
    undefined,
    false,
    null,
    '',
    'a'.repeat(31),
    'a'.repeat(33),
    '!'.repeat(32),
  ]) {
    const api = createRouterApi({
      getCookie: () => cookie,
      fetch: () => assert.fail('unauthenticated request'),
    });

    await assert.rejects(api(), /Sign in to the router to load WAN Observer\./);
  }
});

test('preserves JSON error messages, non-JSON fallback and transport/abort rejection', async () => {
  for (const [reply, expected] of [
    [
      response({ error: 'Router administrator required' }, false, 403),
      'Router administrator required',
    ],
    [response({}, false, 503), 'Router request failed.'],
    [
      {
        ok: true,
        json: async () => {
          throw Error('bad json');
        },
      },
      'The router sent an unreadable reply. Try again.',
    ],
    [
      {
        ok: false,
        status: 502,
        json: async () => {
          throw Error('bad json');
        },
      },
      'Router request failed (502).',
    ],
  ]) {
    const api = createRouterApi({
      getCookie: () => token,
      fetch: async () => reply,
    });

    await assert.rejects(api(), (error) => error.message === expected);
  }

  const failure = new DOMException('Cancelled', 'AbortError');
  const api = createRouterApi({
    getCookie: () => token,
    fetch: async () => {
      throw failure;
    },
  });

  await assert.rejects(api(), (error) => error === failure);
});
