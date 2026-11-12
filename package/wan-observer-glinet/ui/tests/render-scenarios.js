const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { runInNewContext } = require('node:vm');

const NOW = Date.parse('2026-11-12T12:00:00Z');
const SCENARIOS = [
  'loading',
  'error',
  'setup',
  'empty',
  'recorded',
  'settings',
  'export',
];

function renderScenario(source, scenario, native = false) {
  const context = {
    module: { exports: {} },
    require: createRequire(__filename),
    AbortController,
    Date: class extends Date {
      constructor(...args) {
        super(...(args.length ? args : [NOW]));
      }
      static now() {
        return NOW;
      }
    },
    Intl,
    window: { $getCookie: () => 'a'.repeat(32) },
    document: { activeElement: null },
  };

  runInNewContext(
    source.replace('__WAN_OBSERVER_VERSION__', '0.5.3-1'),
    context,
  );
  const component = context.module.exports;
  const page = {
    ...component.data(),
    $options: {
      components: native
        ? {
            'gl-card': true,
            'gl-button': true,
            'gl-title': true,
            'gl-switch': true,
          }
        : {},
    },
    $refs: {},
    $nextTick: (callback) => callback(),
  };

  for (const [key, method] of Object.entries(component.methods)) {
    page[key] = method.bind(page);
  }
  for (const [key, computed] of Object.entries(component.computed)) {
    Object.defineProperty(page, key, { get: () => computed.call(page) });
  }

  component.created.call(page);
  if (scenario === 'error') page.error = 'Synthetic unavailable state';
  if (!['loading', 'error'].includes(scenario)) {
    page.payload = {
      collector:
        scenario === 'setup'
          ? null
          : {
              config: {
                enabled: true,
                adaptive: false,
                interval_minutes: 60,
                start_hour: 0,
                end_hour: 24,
                download_mbps: 100,
                upload_mbps: 20,
                threshold_percent: 80,
                monthly_budget_bytes: 0,
                quality_history_enabled: false,
                window_timezone: 'UTC',
              },
              events: [],
              busy: false,
              usage: { budget_state: 'unset' },
            },
      measurements:
        scenario === 'recorded'
          ? [
              {
                timestamp: '2026-11-12T11:00:00Z',
                download_mbps: 90,
                upload_mbps: 18,
                idle_latency_ms: 12,
                idle_jitter_ms: 2,
                packet_loss_percent: 0,
              },
            ]
          : [],
      readiness: { status: 'ready', checks: {} },
      quality: {
        status: { state: 'disabled', source_freshness: 'unknown' },
        series: null,
      },
    };
  }
  if (scenario === 'settings') page.openSettings();
  if (scenario === 'export') page.openExport();

  const h = (tag, data, children) => {
    if (
      children === undefined &&
      (Array.isArray(data) || typeof data !== 'object' || data === null)
    ) {
      return { tag, data: {}, children: data };
    }
    return { tag, data: data || {}, children };
  };
  const tree = component.render.call(page, h);
  const json = JSON.stringify(tree, (key, value) =>
    typeof value === 'function' ? '[callback]' : value,
  );

  return {
    tree,
    page,
    render: () => component.render.call(page, h),
    document: context.document,
    digest: createHash('sha256').update(json).digest('hex'),
  };
}

module.exports = { SCENARIOS, renderScenario };
