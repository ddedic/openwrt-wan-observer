const assert = require('node:assert/strict');
const test = require('node:test');

const publicReport = require('./report-data');
const { reportData } = require('./report-timeline');
const { speedSeries } = require('./speed-series');
const {
  reconcileAttempts,
  attemptRecord,
} = require('./attempt-reconciliation');
const { measuredTestBytes, usageEstimate } = require('./data-usage');
const { csvContent } = require('./csv-export');
const { quantile } = require('./measurement-statistics');

test('measurement consumers retain the explicit public report contract', () => {
  for (const [name, owner] of Object.entries({
    reportData,
    speedSeries,
    attemptRecord,
    measuredTestBytes,
    usageEstimate,
    csvContent,
    quantile,
  })) {
    assert.equal(publicReport[name], owner, name);
  }
  assert.deepEqual(Object.keys(publicReport).sort(), [
    'attemptRecord',
    'clock',
    'csvContent',
    'day',
    'dayMs',
    'exampleMbPerTest',
    'failureMessage',
    'failureShort',
    'labels',
    'mbps',
    'measuredTestBytes',
    'names',
    'quantile',
    'reasons',
    'reportData',
    'speedSeries',
    'stamp',
    'usageEstimate',
  ]);
});

test('reconciliation supplies the same unfinalized storage evidence to period aggregation', () => {
  const attemptId = 'a'.repeat(32);
  const measurement = {
    timestamp: '2026-01-02T12:00:00Z',
    attempt_id: attemptId,
    download_mbps: 100,
    upload_mbps: 20,
  };
  const payload = {
    measurements: [measurement],
    collector: {
      busy: false,
      config: {
        download_mbps: 100,
        upload_mbps: 20,
        threshold_percent: 80,
        interval_minutes: 30,
        enabled: false,
      },
      events: [
        {
          attempt_id: attemptId,
          epoch: Date.parse(measurement.timestamp) / 1000,
          outcome: 'failed',
          failure_code: 'storage_error',
          reason: 'manual',
        },
      ],
    },
  };
  const before = structuredClone(payload);
  const reconciled = reconcileAttempts(payload);
  const report = reportData(payload, 1, Date.parse(measurement.timestamp));
  assert.equal(reconciled.storageIssue, true);
  assert.equal(reconciled.integrityWarning, true);
  assert.equal(reconciled.tests.length, 1);
  assert.equal(reconciled.tests[0].attemptFinalized, false);
  assert.equal(reconciled.tests[0].failureCode, 'storage_error');
  assert.deepEqual(report.selected, reconciled.tests);
  assert.deepEqual(payload, before);
  assert.match(csvContent(report), /"storage_error","false"/);
});
