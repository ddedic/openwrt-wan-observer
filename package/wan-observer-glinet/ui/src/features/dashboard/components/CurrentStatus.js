const {
  mb,
  gb,
  ms,
  ago,
} = require('../../../measurements/format-measurements');
const { finite, supports } = require('../../../collector/collector-contract');
const { every, hours } = require('../../../scheduling/schedule-format');
const {
  reasons,
  mbps,
  measuredTestBytes,
  usageEstimate,
  exampleMbPerTest,
  failureMessage,
} = require('../../../measurements/report-data');

/** Read-only status snapshot plus bound actions and host renderers. */
/** @param {import('./CurrentStatus.types').CurrentStatusProps} vm */
function CurrentStatus(vm, h, { card, button, chip, link, step, baseSteps }) {
  const r = vm.report,
    c = vm.config,
    t = vm.time,
    readiness = vm.readiness,
    guide = vm.guide;
  const done = r.latestDone,
    latest = r.latest;
  const usage = vm.payload.collector.usage;
  const measured = measuredTestBytes(vm.payload.measurements);
  const prerequisite = {
    scheduler_stopped:
      'Scheduled testing is unavailable: the scheduler is not running. Start the scheduler using the installation guide.',
    scheduler_missing:
      'Scheduled testing is unavailable: the scheduler entry is not installed. Repair setup using the installation guide.',
    binary_missing:
      'Speed testing is unavailable: the Speedtest binary is not installed. Complete setup using the installation guide.',
    collector_unavailable:
      'Testing status is unavailable. Repair the collector using the installation guide.',
    clock_uninitialized:
      "Scheduled testing is unavailable: the router clock is not set yet, so test times would be wrong. Check the router's time settings; see the installation guide.",
  }[readiness.status];
  const budgetWarning = () => {
    if (usage && usage.budget_state === 'reached') {
      return "Data limit reached: new tests won't start until next month, or until you raise or clear the limit in Settings.";
    }
    if (usage && usage.budget_state === 'unknown') {
      return `Data use of ${usage.unknown_attempts || 'some'} ${usage.unknown_attempts === 1 ? 'test' : 'tests'} is unknown, so new tests won't start while a limit is set. Clear the limit in Settings to keep testing.`;
    }
    return '';
  };
  const guard = budgetWarning();
  const integrityWarning = () => {
    if (r.integrityWarning) {
      if (r.storageIssue) {
        return 'A storage issue prevented attempt finalization. Saved readings are retained; attempt coverage is incomplete.';
      }
      return 'Attempt history was not finalized. Saved readings are retained; attempt coverage is incomplete.';
    }
    return '';
  };
  const warnings = [
    vm.error
      ? 'Could not refresh. Displayed history may be stale; retry when the router is reachable.'
      : '',
    prerequisite,
    integrityWarning(),
    guard,
  ].filter(Boolean);
  const elapsed = Math.max(0, Math.round((vm.tick - vm.startedAt) / 1000));
  const renderRunningStatus = () => {
    if (vm.running) {
      return h(
        'div',
        { class: 'wo-status is-info', attrs: { role: 'status' } },
        [
          h('span', { class: 'wo-spinner', attrs: { 'aria-hidden': 'true' } }),
          `Running speed test · ${elapsed} s · uses the full connection for about a minute`,
        ],
      );
    }
    if (vm.busy) {
      return h(
        'div',
        { class: 'wo-status is-info', attrs: { role: 'status' } },
        'Please wait. Results refresh automatically.',
      );
    }
    if (vm.notice) {
      return h(
        'div',
        {
          class: ['wo-status', `is-${vm.notice.kind}`],
          attrs: { role: 'status' },
        },
        vm.notice.text,
      );
    }
    return null;
  };
  const status = renderRunningStatus();
  const when = (test) =>
    `${t.stamp(test.time)}${reasons[test.reason] ? ` · ${reasons[test.reason]}` : ''}`;
  const slowDetail = (test) =>
    [
      ['down', 'Download', c.download_mbps],
      ['up', 'Upload', c.upload_mbps],
    ]
      .filter(([k, , plan]) => test[k] < (plan * c.threshold_percent) / 100)
      .map(
        ([k, name, plan]) =>
          `${name} ${mbps(test[k])} of ${plan} Mbps (${Math.round((test[k] / plan) * 100)}%)`,
      )
      .join(' · ');
  const latestAttemptLabel = () => {
    if (latest.state === 'cn') {
      return 'Latest test failed';
    }
    if (latest.state === 'sp') {
      return 'Latest test slow';
    }
    return 'Latest test good';
  };
  const latestAttemptDetail = () => {
    if (latest.state === 'cn') {
      return ` · ${failureMessage(latest.failureCode)}`;
    }
    if (latest.state === 'sp') {
      return ` · ${slowDetail(latest)}`;
    }
    return '';
  };
  const attempt = latest
    ? h('div', { class: ['wo-attempt', `is-${latest.state}`] }, [
        chip(latest.state, h('b', latestAttemptLabel())),
        h('span', { class: 'wo-attempt-text' }, [
          when(latest),
          latestAttemptDetail(),
        ]),
        latest.state === 'cn'
          ? button('Run again', {
              plain: true,
              size: 'small',
              disabled: vm.busy || vm.running || vm.guarded,
              click: vm.runSpeedtest,
            })
          : null,
      ])
    : null;
  const loaded = done ? [done.loadedDown, done.loadedUp].filter(finite) : [];
  const reading = (value, unit, label) =>
    h('div', { class: 'wo-reading' }, [
      h('div', { class: 'wo-value' }, [String(value), h('small', ` ${unit}`)]),
      h('div', { class: 'wo-label' }, label),
    ]);
  const detail = done
    ? [
        finite(done.jitter) ? `Jitter ${ms(done.jitter)} ms` : '',
        finite(done.loss) ? `Packet loss ${+done.loss.toFixed(1)}%` : '',
        Number.isSafeInteger(done.downloadBytes) &&
        Number.isSafeInteger(done.uploadBytes)
          ? `${mb(done.downloadBytes + done.uploadBytes)} used`
          : '',
      ].filter(Boolean)
    : [];
  const qOn =
    supports(c, 'quality_history_enabled') &&
    c.quality_history_enabled === true;
  const quality = vm.payload.quality || {},
    qs = quality.status || {},
    obs = qs.current_observation || qs.latest_observation;
  const metric = (label, value, unit) =>
    finite(value)
      ? h('span', [label + ' ', h('b', `${ms(value)}${unit}`)])
      : null;
  const renderQualityRow = () => {
    if (!supports(c, 'quality_history_enabled')) {
      return null;
    }
    if (!qOn) {
      return h('div', { class: 'wo-qnow' }, [
        h('span', { class: 'wo-muted' }, 'Quality history off'),
        h(
          'button',
          {
            class: 'wo-text-btn',
            attrs: { type: 'button' },
            on: {
              click: () => vm.openSettings(false, 'quality_history_enabled'),
            },
          },
          'Turn on',
        ),
      ]);
    }
    if (qs.state === 'available' && obs && finite(obs.sampled_at)) {
      return h('div', { class: 'wo-qnow' }, [
        h(
          'span',
          { class: 'wo-muted' },
          `GL Network Quality · latest snapshot ${t.clock(obs.sampled_at * 1000)}`,
        ),
        metric(
          'Latency',
          obs.responsiveness && obs.responsiveness.internet_latency,
          ' ms',
        ),
        metric(
          'Jitter',
          obs.responsiveness && obs.responsiveness.jitter_latency,
          ' ms',
        ),
        metric(
          'Loss',
          obs.reliability && obs.reliability.packet_loss_percent,
          '%',
        ),
        metric(
          'DNS',
          obs.responsiveness && obs.responsiveness.dns_lookup_latency,
          ' ms',
        ),
      ]);
    }
    const qualityStatusText = () => {
      if (qs.state === 'unsupported') {
        return 'GL Network Quality is not available on this firmware.';
      }
      if (qs.state === 'disabled') {
        return 'GL Network Quality is off. Turn it on in the GL admin (Network Quality) to record history.';
      }
      if (qs.state === 'available') {
        return 'Waiting for the first GL Network Quality snapshot.';
      }
      return "Couldn't read GL Network Quality. History resumes when it responds.";
    };

    return h('div', { class: 'wo-qnow' }, [
      h('span', { class: 'wo-muted' }, qualityStatusText()),
    ]);
  };
  const qualityRow = renderQualityRow();
  const testUsageText = () => {
    if (measured) {
      return `${mb(measured.bytes)} per test (measured)`;
    }
    if (c.enabled) {
      return `≈ ${usageEstimate(c).gbDay} GB/day (est. ${exampleMbPerTest} MB/test)`;
    }
    return '';
  };
  const perTest = testUsageText();
  const budgetUsageText = () => {
    if (!usage || !usage.budget_state) {
      return '';
    }
    if (usage.budget_state === 'unset') {
      return 'no data limit set';
    }
    if (usage.budget_state === 'available') {
      return `${gb(usage.known_bytes || 0)} of ${gb(usage.budget_bytes)} GB used${finite(usage.accounting_since_epoch) ? ` since ${t.date(usage.accounting_since_epoch * 1000)}` : ' so far'}`;
    }
    if (usage.budget_state === 'reached') {
      return 'data limit reached';
    }
    return 'data use unknown';
  };
  const limitText = budgetUsageText();
  const dataLine =
    [perTest, limitText].filter(Boolean).join(' · ') ||
    (c.enabled ? '' : 'No scheduled data use');
  const readingSource = () => {
    if (done) {
      if (latest !== done) {
        return [
          'Last successful test · ',
          h('b', t.stamp(done.time)),
          ` · ${ago(latest.time - done.time)}`,
        ];
      }
      return ['Readings from this test'];
    }
    return [
      h('b', 'No successful test yet.'),
      ' Press Run Speedtest for a first reading.',
    ];
  };
  const scheduleStatusText = () => {
    if (prerequisite) {
      return 'Scheduled testing needs attention';
    }
    if (c.enabled) {
      return `Full test every ${every(c.interval_minutes)}, ${hours(c, t)}${c.adaptive ? ', with follow-ups' : ''}`;
    }
    return 'Scheduled tests paused';
  };
  const current = card(
    'Status',
    [
      attempt,
      !latest
        ? h('div', { class: 'wo-first' }, [
            h('p', [
              h('b', 'No test recorded yet.'),
              c.enabled
                ? ' Scheduled tests are on; the first runs at the next interval. You can also run one now.'
                : ' Nothing runs automatically until you turn on scheduled tests. You can run one test now.',
            ]),
            h('ul', { class: 'wo-steps' }, [
              ...baseSteps(),
              step(
                'unknown',
                'Plan speeds',
                `${c.download_mbps} / ${c.upload_mbps} Mbps · used to mark tests as slow`,
                button('Change', {
                  plain: true,
                  size: 'small',
                  click: () => vm.openSettings(false, 'download_mbps'),
                }),
              ),
            ]),
          ])
        : h('p', { class: 'wo-last' }, readingSource()),
      done
        ? h('div', { class: 'wo-readings' }, [
            reading(mbps(done.down), 'Mbps', 'Download'),
            reading(mbps(done.up), 'Mbps', 'Upload'),
            reading(
              done.latency == null ? '—' : ms(done.latency),
              'ms',
              'Idle latency',
            ),
            reading(
              loaded.length ? ms(Math.max(...loaded)) : '—',
              'ms',
              'Under load',
            ),
          ])
        : null,
      detail.length ? h('p', { class: 'wo-detail' }, detail.join(' · ')) : null,
      qualityRow,
      status,
      warnings.length
        ? h(
            'div',
            { class: 'wo-status is-warn', attrs: { role: 'status' } },
            warnings.join(' '),
          )
        : null,
      h('div', { class: 'wo-schedule' }, [
        h('span', scheduleStatusText()),
        h(
          'span',
          { class: 'wo-muted' },
          prerequisite ? [link(guide, 'Installation guide')] : dataLine,
        ),
      ]),
    ],
    'wo-current',
  );

  return current;
}
module.exports = { CurrentStatus };
