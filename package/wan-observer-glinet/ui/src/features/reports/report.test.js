const assert = require('node:assert/strict');
const test = require('node:test');
const { reportData, speedSeries } = require('../../measurements/report-data');
const { createPDF } = require('./pdf-export');

const now = Date.parse('2026-01-02T12:00:00Z');
const config = {
  download_mbps: 100,
  upload_mbps: 20,
  threshold_percent: 80,
  interval_minutes: 30,
};
const row = (minutes, down) => ({
  timestamp: new Date(now - minutes * 60000).toISOString(),
  download_mbps: down,
  upload_mbps: 20,
  idle_latency_ms: 8,
  server_id: 123,
});

test('records failed attempts without assigning zero speeds or outage duration', () => {
  const report = reportData(
    {
      measurements: [row(60, 40), row(20, 100), row(1500, 100)],
      collector: {
        config,
        events: [
          {
            epoch: now / 1000 - 55 * 60,
            outcome: 'failed',
            reason: 'degradation_followup',
          },
        ],
      },
    },
    1,
    now,
  );
  assert.equal(report.selected.length, 3);
  assert.equal(report.counts.cn, 1);
  assert.equal(report.counts.sp, 1);
  assert.equal(report.completed.length, 2);
  assert.equal(report.selected[1].down, undefined);
  assert.equal(report.incidents[0].recovered, now - 20 * 60000);
  assert.ok(report.counts.na > 0);
});

test('dedicated A4 document paginates a long appendix', () => {
  const report = reportData(
    {
      measurements: Array.from({ length: 96 }, (_, i) => row(i * 30, 100)),
      collector: { config, events: [] },
    },
    7,
    now,
  );
  const pdf = createPDF(report, true);
  assert.ok(pdf.getNumberOfPages() > 4);
  assert.equal(Math.round(pdf.internal.pageSize.getWidth()), 210);
  assert.equal(pdf.output().slice(0, 5), '%PDF-');
});

test('chart series keeps gaps and failures empty instead of bridging them', () => {
  const report = reportData(
    {
      measurements: [row(30, 60), row(35, 100), row(300, 100)],
      collector: {
        config: { ...config, interval_minutes: 120 },
        events: [
          {
            epoch: now / 1000 - 9 * 3600,
            outcome: 'failed',
            reason: 'scheduled',
          },
        ],
      },
    },
    1,
    now,
  );
  const series = speedSeries(report, 'down');
  assert.equal(series.slotMinutes, 120);
  assert.equal(series.plan, 100);
  const filled = series.values
    .map((v, i) => [v, series.states[i], series.counts[i]])
    .filter(([, state, n]) => n || state === 'cn');
  assert.deepEqual(filled, [
    [null, 'cn', 0],
    [100, 'ok', 1],
    [80, 'sp', 2],
  ]);
  assert.ok(series.values.filter((v) => v === null).length >= 9);
  assert.equal(series.measured, 2);
  assert.equal(series.isolated, 2);
  assert.equal(report.latest.time, now - 30 * 60000);
  assert.equal(report.latestDone.down, 60);
  const narrow = reportData(
    { measurements: [row(3000, 90)], collector: { config, events: [] } },
    1,
    now,
  );
  assert.equal(narrow.selected.length, 0);
  assert.equal(narrow.latestDone.down, 90);
  const month = speedSeries(
    reportData(
      {
        measurements: [],
        collector: { config: { ...config, interval_minutes: 15 }, events: [] },
      },
      30,
      now,
    ),
    'up',
  );
  assert.equal(month.slotMinutes, 240);
  assert.ok(month.values.every((v) => v === null));
});

test('data-use illustration follows frequency, hours, pause and adaptive choice', () => {
  const { usageEstimate } = require('../../measurements/report-data');
  assert.deepEqual(
    usageEstimate({
      enabled: true,
      adaptive: false,
      interval_minutes: 120,
      start_hour: 0,
      end_hour: 24,
    }),
    { tests: 12, gbDay: 6, gbMonth: 180, extras: 0, extrasGb: 0 },
  );
  assert.deepEqual(
    usageEstimate({
      enabled: true,
      adaptive: true,
      interval_minutes: 30,
      start_hour: 8,
      end_hour: 20,
    }),
    { tests: 24, gbDay: 12, gbMonth: 360, extras: 24, extrasGb: 12 },
  );
  assert.equal(
    usageEstimate({
      enabled: false,
      adaptive: true,
      interval_minutes: 15,
      start_hour: 0,
      end_hour: 24,
    }).tests,
    0,
  );
});

test('diagnostic exports preserve missing values, current baseline and incomplete history', () => {
  const { csvContent } = require('../../measurements/report-data');
  const report = reportData(
    {
      measurements: [
        {
          ...row(60, 100),
          idle_jitter_ms: 1.2,
          download_loaded_latency_ms: 22,
          upload_loaded_latency_ms: null,
          packet_loss_percent: 0,
        },
      ],
      collector: {
        config,
        events: [
          {
            epoch: now / 1000 - 30 * 60,
            outcome: 'failed',
            reason: 'scheduled',
            failure_code: 'timeout',
          },
        ],
        coverage: {
          complete_since_epoch: now / 1000 - 7200,
          retained_from_epoch: now / 1000 - 3600,
          legacy_incomplete: true,
          retention_limit: 5000,
        },
      },
    },
    1,
    now,
  );
  assert.equal(report.completed[0].jitter, 1.2);
  assert.equal(report.completed[0].loadedUp, null);
  assert.equal(report.selected.at(-1).failureCode, 'timeout');
  assert.equal(report.coverage.complete, false);
  const csv = csvContent(report);
  assert.match(csv, /idle_jitter_ms/);
  assert.match(csv, /download_loaded_latency_ms/);
  assert.match(csv, /"1.2","22","null","0"/);
  assert.match(csv, /comparison_download_mbps/);
  assert.match(csv, /"current_settings"/);
  assert.match(csv, /"timeout"/);
  assert.match(csv, /"false"/);
});

test('median sample count excludes failures sharing a measured bucket', () => {
  const report = reportData(
    {
      measurements: [row(30, 100)],
      collector: {
        config,
        events: [
          {
            epoch: now / 1000 - 31 * 60,
            outcome: 'failed',
            reason: 'scheduled',
          },
        ],
      },
    },
    1,
    now,
  );
  const series = speedSeries(report, 'down');
  assert.equal(series.counts[series.values.findIndex((v) => v === 100)], 1);
});

test('PDF future cells are distinct and empty slots do not assert a missed historical schedule', () => {
  const report = reportData(
    {
      measurements: [],
      collector: {
        config: {
          ...config,
          enabled: true,
          start_hour: 8,
          end_hour: 10,
          interval_minutes: 120,
        },
        events: [],
      },
    },
    1,
    now,
  );
  assert.ok(
    report.rows[0].cells.filter((c) => c.future).every((c) => c.state === 'fu'),
  );
  assert.ok(
    report.rows[0].cells.find((c) => new Date(c.time).getUTCHours() === 3)
      .scheduled === false,
  );
});

test('PDF appendix contains stored diagnostics and qualifies incomplete attempt history', () => {
  const report = reportData(
    {
      measurements: [
        {
          ...row(30, 100),
          idle_jitter_ms: 1.2,
          download_loaded_latency_ms: 22,
          packet_loss_percent: 0,
        },
      ],
      collector: { config, events: [] },
    },
    1,
    now,
  );
  const pdf = createPDF(report, true),
    text = pdf.internal.pages
      .flat()
      .join('\n')
      .match(/\((.*?)\) Tj/g)
      .join(' ')
      .replaceAll(') Tj (', ' ');
  assert.match(text, /Jitter/);
  assert.match(text, /Loaded down/);
  assert.match(text, /Loss/);
  assert.match(text, /missing/);
  assert.match(text, /incomplete|unknown/i);
  assert.match(text, /current comparison settings/i);
});

test('failure categories export only recognized sanitized values', () => {
  const events = [
    {
      epoch: now / 1000 - 60,
      outcome: 'failed',
      reason: 'scheduled',
      failure_code: 'execution_terminated',
    },
    {
      epoch: now / 1000 - 30,
      outcome: 'failed',
      reason: 'scheduled',
      failure_code: 'raw backend private message',
    },
  ];
  const report = reportData(
    { measurements: [], collector: { config, events } },
    1,
    now,
  );
  assert.equal(report.selected[0].failureCode, 'execution_terminated');
  assert.equal(report.selected[1].failureCode, null);
});

test('legacy retained boundary alone cannot establish complete attempt coverage', () => {
  const report = reportData(
    {
      measurements: [row(30, 100)],
      collector: {
        config,
        events: [],
        coverage: {
          complete_since_epoch: null,
          retained_from_epoch: now / 1000 - 10 * 86400,
          coverage_from_epoch: null,
          legacy_incomplete: true,
        },
      },
    },
    1,
    now,
  );
  assert.equal(report.coverage.complete, false);
  assert.equal(report.coverage.since, null);
});

test('PDF methodology paginates before body text enters footer area', () => {
  const events = Array.from({ length: 26 }, (_, i) => ({
    epoch: now / 1000 - i * 3600,
    outcome: 'failed',
    reason: 'scheduled',
  }));
  const pdf = createPDF(
    reportData({ measurements: [], collector: { config, events } }, 2, now),
  );
  for (const page of pdf.internal.pages.filter(Boolean)) {
    for (const match of page
      .join('\n')
      .matchAll(/([-\d.]+) ([-\d.]+) Td\n\((.*?)\) Tj/g)) {
      if (/WAN Observer|Page \d/.test(match[3])) continue;
      assert.ok(
        Number(match[2]) > 70,
        'body text stays above footer: ' + match[3],
      );
    }
  }
});

test('active pending attempts are not failures until collector stops', () => {
  const collector = {
    config,
    busy: true,
    events: [
      {
        epoch: now / 1000 - 60,
        outcome: 'failed',
        reason: 'scheduled',
        failure_code: 'interrupted',
        pending: true,
      },
    ],
  };
  assert.equal(
    reportData({ measurements: [], collector }, 1, now).counts.cn,
    0,
  );
  collector.busy = false;
  const report = reportData({ measurements: [], collector }, 1, now);
  assert.equal(report.counts.cn, 1);
  assert.equal(report.latest.failureCode, 'interrupted');
});

test('persistence error prevents a complete-history claim', () => {
  const report = reportData(
    {
      measurements: [],
      collector: {
        config,
        events: [],
        coverage: {
          complete_since_epoch: now / 1000 - 10 * 86400,
          retained_from_epoch: now / 1000 - 10 * 86400,
          persistence_error: true,
        },
      },
    },
    1,
    now,
  );
  assert.equal(report.coverage.complete, false);
});

const attemptId = '0123456789abcdef0123456789abcdef';
const pendingEvent = {
  epoch: now / 1000 - 70 * 60,
  outcome: 'failed',
  reason: 'manual',
  failure_code: 'interrupted',
  pending: true,
  attempt_id: attemptId,
};
test('matching opaque attempt ID dedupes unresolved reservation even outside timestamp window', () => {
  const report = reportData(
    {
      measurements: [{ ...row(10, 100), attempt_id: attemptId }],
      collector: {
        config,
        busy: false,
        events: [pendingEvent],
        coverage: { complete_since_epoch: now / 1000 - 10 * 86400 },
      },
    },
    1,
    now,
  );
  assert.equal(report.selected.length, 1);
  assert.equal(report.counts.cn, 0);
  assert.equal(report.completed.length, 1);
  assert.equal(report.coverage.complete, false);
  assert.equal(report.integrityWarning, true);
  assert.equal(report.latest.reason, 'manual');
  assert.equal(report.completed[0].attemptFinalized, false);
  const csv = require('../../measurements/report-data').csvContent(report);
  assert.match(csv, /attempt_finalized/);
  assert.match(csv, /"false","current_settings"/);
  assert.match(
    createPDF(report, true).internal.pages.flat().join('\n'),
    /Finalization: unresolved/,
  );
});
test('different missing or invalid attempt IDs never hide nearby stopped failures', () => {
  for (const [eventId, recordId] of [
    [attemptId, 'ffffffffffffffffffffffffffffffff'],
    [null, null],
    [undefined, undefined],
    ['invalid', 'invalid'],
    ['A'.repeat(32), 'A'.repeat(32)],
  ]) {
    const report = reportData(
      {
        measurements: [{ ...row(69, 100), attempt_id: recordId }],
        collector: {
          config,
          busy: false,
          events: [{ ...pendingEvent, attempt_id: eventId }],
        },
      },
      1,
      now,
    );
    assert.equal(report.selected.length, 2);
    assert.equal(report.counts.cn, 1);
    assert.equal(report.integrityWarning, true);
    assert.equal(report.coverage.complete, false);
  }
});
test('duplicate IDs and genuine finalized failures remain separate evidence', () => {
  const record = { ...row(69, 100), attempt_id: attemptId };
  const ambiguous = reportData(
    {
      measurements: [record, { ...row(68, 90), attempt_id: attemptId }],
      collector: { config, busy: false, events: [pendingEvent] },
    },
    1,
    now,
  );
  assert.equal(ambiguous.selected.length, 3);
  assert.equal(ambiguous.counts.cn, 1);
  const finalized = reportData(
    {
      measurements: [record],
      collector: {
        config,
        busy: false,
        events: [
          { ...pendingEvent, pending: false, failure_code: 'backend_exit' },
        ],
      },
    },
    1,
    now,
  );
  assert.equal(finalized.selected.length, 2);
  assert.equal(finalized.counts.cn, 1);
  const conflicting = reportData(
    {
      measurements: [record],
      collector: {
        config,
        busy: false,
        events: [
          pendingEvent,
          {
            ...pendingEvent,
            epoch: pendingEvent.epoch + 5,
            pending: false,
            failure_code: 'backend_exit',
          },
        ],
      },
    },
    1,
    now,
  );
  assert.equal(conflicting.selected.length, 3);
  assert.equal(conflicting.counts.cn, 2);
});

test('same-ID final storage error retains one measured attempt and explicit storage integrity issue', () => {
  const report = reportData(
    {
      measurements: [{ ...row(10, 100), attempt_id: attemptId }],
      collector: {
        config,
        busy: false,
        events: [
          { ...pendingEvent, pending: false, failure_code: 'storage_error' },
        ],
      },
    },
    1,
    now,
  );
  assert.equal(report.selected.length, 1);
  assert.equal(report.completed[0].down, 100);
  assert.equal(report.counts.cn, 0);
  assert.equal(report.completed[0].failureCode, 'storage_error');
  assert.equal(report.completed[0].attemptFinalized, false);
  assert.equal(report.integrityWarning, true);
  assert.equal(report.coverage.complete, false);
  assert.match(
    require('../../measurements/report-data').csvContent(report),
    /storage_error/,
  );
});
test('backend and timeout failures with coincident IDs are retained as conflicting evidence', () => {
  for (const failure_code of [
    'backend_exit',
    'timeout',
    'execution_terminated',
    'invalid_result',
  ]) {
    const report = reportData(
      {
        measurements: [{ ...row(10, 100), attempt_id: attemptId }],
        collector: {
          config,
          busy: false,
          events: [{ ...pendingEvent, pending: false, failure_code }],
        },
      },
      1,
      now,
    );
    assert.equal(report.selected.length, 2);
    assert.equal(report.counts.cn, 1);
  }
});
