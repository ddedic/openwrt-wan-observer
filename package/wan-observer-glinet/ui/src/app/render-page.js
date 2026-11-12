const { finite, supports } = require('../collector/collector-contract');
const { BrandMark } = require('./components/BrandMark');
const { names } = require('../measurements/report-data');
const {
  REPOSITORY: repository,
  PACKAGE_VERSION: packageVersion,
  GUIDE: guide,
  OOKLA_CLI: ooklaCli,
} = require('./package-metadata');
const { ObserverHeader } = require('./components/ObserverHeader');
const { ObserverFooter } = require('./components/ObserverFooter');
const {
  CurrentStatus,
} = require('../features/dashboard/components/CurrentStatus');
const { HistoryPanel } = require('../features/history/components/HistoryPanel');
const {
  SettingsDialog,
} = require('../features/settings/components/SettingsDialog');
const { ExportDialog } = require('../features/reports/components/ExportDialog');
const read = (r, key) =>
  r ? (r[key] !== undefined ? r[key] : r.checks && r.checks[key]) : undefined;
function renderPage(h) {
  const vm = this,
    r = this.report,
    c = this.config,
    t = this.time,
    readiness = (vm.payload && vm.payload.readiness) || {};
  const card = (title, children, cls) =>
    vm.native('gl-card')
      ? h('gl-card', { class: ['wo-card', cls], props: { title } }, children)
      : h('section', { class: ['wo-card', 'wo-card--plain', cls] }, [
          title ? h('h3', { class: 'wo-card-title' }, title) : null,
          h('div', { class: 'wo-card-body' }, children),
        ]);
  const button = (
    label,
    {
      type = 'default',
      plain = false,
      loading = false,
      disabled = false,
      click,
      size,
    },
  ) =>
    vm.native('gl-button')
      ? h(
          'gl-button',
          {
            class: { 'wo-gl-small': size === 'small' },
            props: { type, plain, loading, disabled },
            on: { click },
          },
          label,
        )
      : h(
          'button',
          {
            class: [
              'wo-btn',
              `is-${type}`,
              { 'is-plain': plain, 'is-small': size === 'small' },
            ],
            attrs: { type: 'button', disabled: disabled || loading },
            on: { click },
          },
          label,
        );
  const chip = (state, text) =>
    h('span', { class: ['wo-chip', `is-${state}`] }, [
      h('i', { attrs: { 'aria-hidden': 'true' } }),
      text || names[state],
    ]);
  const link = (href, text) =>
    h(
      'a',
      {
        class: 'wo-link',
        attrs: {
          href,
          target: '_blank',
          rel: 'noopener noreferrer',
          referrerpolicy: 'no-referrer',
        },
      },
      [text, h('span', { class: 'wo-vh' }, ' (opens in new tab)')],
    );

  const mark = BrandMark(h);
  const footer = ObserverFooter({ repository, packageVersion }, h);

  const head = ObserverHeader(
    {
      config: c,
      native: vm.native,
      saving: vm.saving,
      running: vm.running,
      busy: vm.busy,
      guarded: vm.guarded,
      toggleSchedule: vm.toggleSchedule,
      openSettings: vm.openSettings,
      runSpeedtest: vm.runSpeedtest,
    },
    h,
    button,
  );
  const step = (state, label, detail, action) =>
    h('li', { class: ['wo-step', `is-${state}`] }, [
      h('span', { class: 'wo-step-icon', attrs: { 'aria-hidden': 'true' } }),
      h('div', { class: 'wo-step-text' }, [
        h('b', label),
        h(
          'span',
          { class: 'wo-vh' },
          state === 'ok'
            ? ' (ready)'
            : state === 'bad'
              ? ' (needs attention)'
              : ' (not checked)',
        ),
        detail ? h('small', [detail]) : null,
      ]),
      action || null,
    ]);
  const checks = readiness.checks || {};
  const engine = read(readiness, 'engine_available'),
    clockOk = read(readiness, 'clock_initialized'),
    storage = read(readiness, 'free_storage_kb');
  const found = checks.binary === 'available' || engine === true,
    missing = checks.binary === 'unavailable' || engine === false;
  const baseSteps = () =>
    [
      checks.config
        ? step(
            checks.config === 'valid' ? 'ok' : 'bad',
            'Configuration',
            checks.config === 'valid'
              ? 'Valid'
              : checks.config === 'invalid'
                ? 'Present but invalid'
                : 'Not created yet',
          )
        : null,
      step(
        found ? 'ok' : missing ? 'bad' : 'unknown',
        'Speedtest program',
        found
          ? 'Found at the configured path'
          : missing
            ? 'Not found at the configured path. Install the Ookla CLI as described in the guide.'
            : 'Checked once the configuration is valid',
      ),
      checks.scheduler
        ? step(
            checks.scheduler === 'installed' &&
              checks.scheduler_service !== 'stopped'
              ? 'ok'
              : 'bad',
            'Scheduler',
            checks.scheduler !== 'installed'
              ? 'Cron entry not installed'
              : checks.scheduler_service === 'stopped'
                ? 'Cron service is not running'
                : checks.scheduler_service === 'running'
                  ? 'Cron entry installed and running'
                  : 'Cron entry installed',
          )
        : null,
      typeof clockOk === 'boolean'
        ? step(
            clockOk ? 'ok' : 'bad',
            'Router clock',
            clockOk ? 'Set' : 'Not set yet. Test times would be wrong.',
          )
        : null,
      finite(storage)
        ? step(
            storage >= 1024 ? 'ok' : 'bad',
            'Storage',
            storage >= 1024
              ? `${Math.round(storage / 1024)} MB free`
              : `Low: ${Math.round(storage)} KB free`,
          )
        : null,
      step(
        'unknown',
        'Ookla licence',
        h('span', [
          "Not checked here. Ookla's CLI asks you to accept its terms; see ",
          link(ooklaCli, 'Ookla CLI'),
          '.',
        ]),
      ),
    ].filter(Boolean);

  if (!r) {
    if (vm.payload && !vm.payload.collector)
      return h('div', { class: 'wo' }, [
        head,
        card(
          'Set up WAN Observer',
          [
            h(
              'p',
              { class: 'wo-muted' },
              'The collector configuration is missing or invalid, so nothing can be tested yet. Follow the installation guide, then check again.',
            ),
            h('ul', { class: 'wo-steps' }, baseSteps()),
            h('div', { class: 'wo-actions' }, [
              link(guide, 'Installation guide'),
              button('Check again', {
                plain: true,
                loading: vm.loading,
                click: vm.refresh,
              }),
            ]),
          ],
          'wo-setup',
        ),
        footer,
      ]);
    if (vm.error)
      return h('div', { class: 'wo' }, [
        head,
        card('', [
          h('div', { class: 'wo-state' }, [
            h('p', { class: 'wo-error' }, vm.error),
            button('Try again', {
              plain: true,
              loading: vm.loading,
              click: vm.refresh,
            }),
          ]),
        ]),
        footer,
      ]);
    // First load: the brand appears once, centred, and the head row waits for data. A scoped card is used
    // instead of gl-card because an untitled native card's header rendering is not verified.
    return h('div', { class: 'wo', attrs: { 'aria-busy': 'true' } }, [
      h('section', { class: ['wo-card', 'wo-card--plain'] }, [
        h('div', { class: 'wo-splash' }, [
          mark,
          h('p', { class: 'wo-splash-name' }, 'WAN Observer'),
          h(
            'p',
            { class: 'wo-splash-text', attrs: { role: 'status' } },
            'Loading measurement history…',
          ),
        ]),
      ]),
      footer,
    ]);
  }

  // 1. Status: the latest attempt, then the latest successful readings, labelled separately.
  const current = CurrentStatus(
    {
      report: r,
      config: c,
      time: t,
      readiness,
      guide,
      payload: vm.payload,
      error: vm.error,
      tick: vm.tick,
      startedAt: vm.startedAt,
      running: vm.running,
      busy: vm.busy,
      notice: vm.notice,
      guarded: vm.guarded,
      openSettings: vm.openSettings,
      runSpeedtest: vm.runSpeedtest,
    },
    h,
    { card, button, chip, link, step, baseSteps },
  );

  // 2. History: one period selector governs the summary, charts, the test list and Export.
  const usage = vm.payload.collector.usage;
  const qOn =
    supports(c, 'quality_history_enabled') &&
    c.quality_history_enabled === true;
  const history = HistoryPanel(
    {
      report: r,
      config: c,
      time: t,
      payload: vm.payload,
      days: vm.days,
      active: vm.active,
      widths: vm.widths,
      showAll: vm.showAll,
      issuesOnly: vm.issuesOnly,
      openExport: vm.openExport,
      setPeriod: vm.setPeriod,
      pick: vm.pick,
      toggleShowAll: () => {
        vm.showAll = !vm.showAll;
      },
      setIssuesOnly: (value) => {
        vm.issuesOnly = value;
        vm.showAll = false;
      },
    },
    h,
    { card, button, chip },
  );

  const about = h('details', { class: 'wo-about' }, [
    h('summary', 'How to read these results'),
    h('ul', [
      h(
        'li',
        `Good means download and upload reached at least ${c.threshold_percent}% of the ${c.download_mbps}/${c.upload_mbps} Mbps plan. Slow means either did not. Failed means no result was recorded; the message shows what was observed, not the cause.`,
      ),
      h(
        'li',
        'Each point is one test at its time. Lines join consecutive results; a failure or a long gap breaks the line. Speed between tests is not measured.',
      ),
      qOn
        ? h(
            'li',
            'Quality history stores the values GL Network Quality reports when WAN Observer reads them each minute. When GL last measured them is not known. It does not measure speed or downtime.',
          )
        : null,
      usage && usage.limit_semantics === 'start_guard'
        ? h(
            'li',
            'The data limit counts the transfer of tests since accounting began, not all router traffic. It stops new tests from starting; one running test can go over.',
          )
        : null,
      h(
        'li',
        `Full tests use real bandwidth, so an occasional schedule is enough to show patterns. Times are ${t.router ? `router time (${t.zone})` : 'UTC'}; CSV exports use UTC.`,
      ),
    ]),
  ]);

  return h('div', { class: 'wo' }, [
    head,
    current,
    history,
    about,
    footer,
    vm.sheet
      ? vm.sheet === 'export'
        ? ExportDialog(
            {
              report: vm.report,
              appendix: vm.appendix,
              exportError: vm.exportError,
              fileName: vm.fileName,
              close: vm.close,
              pdf: vm.pdf,
              setAppendix: (value) => {
                vm.appendix = value;
              },
            },
            h,
            button,
            t,
          )
        : SettingsDialog(
            {
              form: vm.form,
              config: vm.config,
              fieldErrors: vm.fieldErrors,
              payload: vm.payload,
              confirmDiscard: vm.confirmDiscard,
              submitted: vm.submitted,
              saveError: vm.saveError,
              saving: vm.saving,
              close: vm.close,
              save: vm.save,
              touch: (key) => {
                vm.touched = { ...vm.touched, [key]: true };
              },
              clearDiscard: () => {
                vm.confirmDiscard = false;
              },
            },
            h,
            button,
            t,
          )
      : null,
  ]);
}
module.exports = { renderPage };
