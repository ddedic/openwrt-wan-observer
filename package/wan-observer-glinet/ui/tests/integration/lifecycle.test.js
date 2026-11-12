const assert = require('node:assert/strict');
const test = require('node:test');
const vmModule = require('node:vm');

const { createRequire } = require('node:module');

const { componentSource } = require('../component-source');
function harness(fetcher) {
  const timers = new Map(),
    listeners = new Map();
  let id = 0;
  const document = {
    hidden: false,
    visibilityState: 'visible',
    getElementById: () => true,
    addEventListener: (k, v) => listeners.set(k, v),
    removeEventListener: (k) => listeners.delete(k),
  };
  const context = {
    require: (p) => (p === './view.css' ? '' : createRequire(__filename)(p)),
    module: { exports: {} },
    AbortController,
    Date,
    fetch: fetcher,
    window: { $getCookie: () => 'a'.repeat(32) },
    document,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    setTimeout: (fn, ms) => {
      timers.set(++id, { fn, ms });
      return id;
    },
    clearTimeout: (n) => timers.delete(n),
    setInterval: (fn, ms) => {
      timers.set(++id, { fn, ms });
      return id;
    },
    clearInterval: (n) => timers.delete(n),
  };
  vmModule.runInNewContext(componentSource(), context);
  const component = context.module.exports,
    vm = { ...component.data(), $el: {}, ...component.methods };
  for (const k of Object.keys(component.methods)) {
    vm[k] = component.methods[k].bind(vm);
  }
  component.created.call(vm);
  return { vm, component, document, timers, listeners };
}
const payload = {
  collector: { config: {}, events: [], busy: false },
  measurements: [],
};
const response = (data) => ({ ok: true, json: async () => data });
const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
};
test('visible periodic GET refresh preserves unsaved form and pauses for hidden/manual states', async () => {
  let calls = 0;
  const h = harness(async () => {
    calls++;
    return response(payload);
  });
  h.vm.form = { download_mbps: 432 };
  h.vm.sheet = 'settings';
  h.component.mounted.call(h.vm);
  await settle();
  assert.equal(calls, 1);
  const periodic = [...h.timers.values()].find(
    (t) => t.ms >= 15000 && t.ms <= 60000,
  );
  assert.ok(periodic, 'bounded periodic refresh installed');
  await periodic.fn();
  await settle();
  assert.equal(calls, 2);
  assert.equal(h.vm.form.download_mbps, 432);
  assert.equal(h.vm.sheet, 'settings');
  h.document.hidden = true;
  h.document.visibilityState = 'hidden';
  await periodic.fn();
  assert.equal(calls, 2);
  h.document.hidden = false;
  h.document.visibilityState = 'visible';
  h.vm.running = true;
  await periodic.fn();
  assert.equal(calls, 2);
  h.vm.running = false;
  h.listeners.get('visibilitychange')();
  await settle();
  assert.equal(calls, 3);
  h.component.beforeDestroy.call(h.vm);
  assert.equal(h.timers.size, 0);
  assert.equal(h.listeners.size, 0);
});
test('pending refresh is shared and destruction never applies late history', async () => {
  let resolve;
  const h = harness(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const first = h.vm.refresh(),
    second = h.vm.refresh();
  let done = false;
  second.then(() => (done = true));
  await settle();
  assert.equal(done, false);
  h.component.beforeDestroy.call(h.vm);
  resolve(response(payload));
  await Promise.all([first, second]);
  assert.equal(h.vm.payload, null);
});
test('setup-required payload is handled without a collector dereference', async () => {
  const h = harness(async () =>
    response({
      collector: null,
      measurements: [],
      readiness: { status: 'config_missing' },
    }),
  );
  await h.vm.refresh();
  assert.match(h.vm.error, /setup|configuration/i);
  assert.equal(h.component.computed.report.call(h.vm), null);
  assert.equal(h.component.computed.config.call(h.vm), null);
});

test('saving waits for background GET before writing and reloads saved configuration', async () => {
  let release,
    reads = 0;
  const methods = [];
  const h = harness(async (url, options) => {
    methods.push(options.method || 'GET');
    if (options.method === 'POST') {
      return response({});
    }
    if (++reads === 1) {
      return new Promise((r) => {
        release = r;
      });
    }
    return response({
      ...payload,
      collector: { ...payload.collector, config: { download_mbps: 432 } },
    });
  });
  const pending = h.vm.refresh();
  const saving = h.vm.save({
    enabled: false,
    adaptive: false,
    interval_minutes: 120,
    start_hour: 0,
    end_hour: 24,
    download_mbps: 432,
    upload_mbps: 20,
  });
  await settle();
  assert.deepEqual(methods, ['GET']);
  release(response(payload));
  await pending;
  await saving;
  assert.deepEqual(methods, ['GET', 'POST', 'GET']);
  assert.equal(h.vm.payload.collector.config.download_mbps, 432);
});

test('scheduled activity refresh clears busy status without starting a speed test', async () => {
  let n = 0;
  const h = harness(async (url, options) => {
    assert.equal(options.method, undefined);
    return response({
      ...payload,
      collector: { ...payload.collector, busy: ++n === 1 },
    });
  });
  await h.vm.refresh();
  assert.equal(h.component.computed.busy.call(h.vm), true);
  await h.vm.backgroundRefresh();
  assert.equal(h.component.computed.busy.call(h.vm), false);
  assert.equal(h.vm.version, 2);
});

function renderText(harness) {
  const { vm, component } = harness;
  vm.$options = { components: {} };
  for (const [key, fn] of Object.entries(component.computed)) {
    Object.defineProperty(vm, key, {
      configurable: true,
      get: () => fn.call(vm),
    });
  }
  const h = (tag, data, children) => ({
    tag,
    children: children === undefined ? data : children,
  });
  const text = (node) => {
    if (node == null || node === false) {
      return '';
    }
    if (Array.isArray(node)) {
      return node.map(text).join(' ');
    }
    if (typeof node === 'object') {
      return text(node.children);
    }
    return String(node);
  };

  return text(component.render.call(vm, h));
}
const configured = {
  ...payload,
  collector: {
    ...payload.collector,
    config: {
      enabled: true,
      adaptive: false,
      interval_minutes: 120,
      start_hour: 0,
      end_hour: 24,
      download_mbps: 100,
      upload_mbps: 20,
      threshold_percent: 80,
    },
  },
};
test('rendered stale warning survives existing history without replacing manual notice or settings', async () => {
  let n = 0;
  const h = harness(async () => {
    if (++n === 2) {
      throw Error('unreachable');
    }
    return response(configured);
  });
  await h.vm.refresh();
  h.vm.notice = { kind: 'ok', text: 'Saved manual result' };
  h.vm.form = { download_mbps: 123 };
  await h.vm.refresh();
  assert.match(renderText(h), /stale|could not refresh/i);
  assert.match(renderText(h), /Saved manual result/);
  assert.equal(h.vm.form.download_mbps, 123);
  await h.vm.refresh();
  assert.doesNotMatch(renderText(h), /stale|could not refresh/i);
});
test('readiness failure replaces claimed working cadence with actionable existing status text', async () => {
  for (const status of [
    'scheduler_stopped',
    'scheduler_missing',
    'binary_missing',
  ]) {
    const h = harness(async () =>
      response({ ...configured, readiness: { status } }),
    );
    await h.vm.refresh();
    const text = renderText(h);
    assert.match(text, /unavailable|not running|not installed/i);
    assert.match(text, /installation guide|repair|start/i);
    assert.doesNotMatch(text, /Full test every 2 hours/);
  }
});

test('readiness warning clears after prerequisite recovery while manual feedback remains', async () => {
  let bad = true;
  const h = harness(async () =>
    response({
      ...configured,
      readiness: { status: bad ? 'scheduler_stopped' : 'ready' },
    }),
  );
  h.vm.notice = { kind: 'ok', text: 'Manual test saved' };
  await h.vm.refresh();
  assert.match(renderText(h), /scheduler is not running/);
  bad = false;
  await h.vm.refresh();
  const text = renderText(h);
  assert.doesNotMatch(text, /scheduler is not running/);
  assert.match(text, /Full test every 2 hours/);
  assert.match(text, /Manual test saved/);
});

test('stored reading remains visible with explicit storage issue warning after finalization failure', async () => {
  const id = '0123456789abcdef0123456789abcdef',
    epoch = Math.floor(Date.now() / 1000) - 60;
  const h = harness(async () =>
    response({
      ...configured,
      measurements: [
        {
          timestamp: new Date((epoch + 10) * 1000).toISOString(),
          download_mbps: 100,
          upload_mbps: 20,
          idle_latency_ms: 8,
          attempt_id: id,
        },
      ],
      collector: {
        ...configured.collector,
        events: [
          {
            epoch,
            reason: 'scheduled',
            outcome: 'failed',
            failure_code: 'storage_error',
            pending: false,
            attempt_id: id,
          },
        ],
      },
    }),
  );
  await h.vm.refresh();
  const text = renderText(h);
  assert.match(text, /storage issue/i);
  assert.match(text, /100/);
  assert.match(text, /incomplete/);
});

test('collector lock without active attempt uses neutral waiting copy', async () => {
  const h = harness(async () =>
    response({
      ...configured,
      collector: {
        ...configured.collector,
        busy: true,
        manual_started: false,
        events: [],
      },
    }),
  );
  await h.vm.refresh();
  const text = renderText(h);
  assert.match(text, /Please wait/);
  assert.doesNotMatch(text, /A speed test is running/);
  h.vm.payload.collector.events = [
    {
      epoch: Math.floor(Date.now() / 1000) - 86400,
      reason: 'scheduled',
      outcome: 'failed',
      pending: true,
    },
  ];
  const pendingText = renderText(h);
  assert.match(pendingText, /Please wait/);
  assert.doesNotMatch(pendingText, /A speed test is running/);
});
test('short busy retry recovers transient collector lock and cleanup cancels retry', async () => {
  let calls = 0;
  const h = harness(async () => {
    calls++;
    return response({
      ...configured,
      collector: { ...configured.collector, busy: calls === 1 },
    });
  });
  await h.vm.refresh();
  const retry = [...h.timers.values()].find((t) => t.ms === 4000);
  assert.ok(retry, 'short busy GET retry scheduled');
  await retry.fn();
  await settle();
  assert.equal(calls, 2);
  assert.equal(h.component.computed.busy.call(h.vm), false);
  assert.equal(h.timers.size, 0);
  const busy = harness(async () =>
    response({
      ...configured,
      collector: { ...configured.collector, busy: true },
    }),
  );
  await busy.vm.refresh();
  assert.equal(busy.timers.size, 1);
  busy.component.beforeDestroy.call(busy.vm);
  assert.equal(busy.timers.size, 0);
  h.component.beforeDestroy.call(h.vm);
  assert.equal(h.timers.size, 0);
});
test('busy retry stops while hidden and bounded retry budget avoids permanent fast polling', async () => {
  let calls = 0;
  const h = harness(async () => {
    calls++;
    return response({
      ...configured,
      collector: { ...configured.collector, busy: true },
    });
  });
  await h.vm.refresh();
  h.document.hidden = true;
  await [...h.timers.values()].find((t) => t.ms === 4000).fn();
  await settle();
  assert.equal(calls, 1);
  assert.equal(h.timers.size, 0);
  h.document.hidden = false;
  h.vm.busyRefreshCount = 44;
  await h.vm.refresh();
  assert.equal(h.timers.size, 0);
  h.component.beforeDestroy.call(h.vm);
});

test('busy retry shares its pending GET with periodic refresh instead of overlapping', async () => {
  let calls = 0,
    release;
  const h = harness(async () => {
    if (++calls === 1) {
      return response({
        ...configured,
        collector: { ...configured.collector, busy: true },
      });
    }
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  await h.vm.refresh();
  await [...h.timers.values()].find((t) => t.ms === 4000).fn();
  const overlap = h.vm.backgroundRefresh();
  await settle();
  assert.equal(calls, 2);
  release(response(configured));
  await overlap;
  assert.equal(h.component.computed.busy.call(h.vm), false);
  assert.equal(h.timers.size, 0);
  h.component.beforeDestroy.call(h.vm);
});
