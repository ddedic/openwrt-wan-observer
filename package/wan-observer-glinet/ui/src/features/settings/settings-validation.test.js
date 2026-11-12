const assert = require('node:assert/strict');
const test = require('node:test');

const { validateSettings } = require('./settings-validation');

const valid = { mode: 'all', download_mbps: '100', upload_mbps: '20' };

test('valid existing settings and optional legacy fields remain valid without mutation', () => {
  const form = Object.freeze({ ...valid });

  assert.deepEqual(validateSettings(form), {});
  assert.deepEqual(validateSettings({ ...form, threshold_percent: '100' }), {});
});

test('plan speeds require whole values in the original inclusive range', () => {
  for (const value of [
    '',
    ' ',
    '1.5',
    '0',
    '-1',
    '100001',
    'Infinity',
    'abc',
  ]) {
    assert.deepEqual(
      Object.keys(
        validateSettings({
          ...valid,
          download_mbps: value,
          upload_mbps: value,
        }),
      ),
      ['download_mbps', 'upload_mbps'],
    );
  }
  for (const value of ['1', '100000']) {
    assert.deepEqual(
      validateSettings({ ...valid, download_mbps: value, upload_mbps: value }),
      {},
    );
  }
});

test('equal custom hours fail while all-day and overnight windows remain valid', () => {
  assert.equal(
    validateSettings({ ...valid, mode: 'custom', start_hour: '8', end_hour: 8 })
      .end_hour,
    'Start and end must differ. Choose All day for 24 hours.',
  );
  assert.deepEqual(
    validateSettings({ ...valid, mode: 'all', start_hour: 0, end_hour: 0 }),
    {},
  );
  assert.deepEqual(
    validateSettings({ ...valid, mode: 'custom', start_hour: 22, end_hour: 6 }),
    {},
  );
});

test('threshold checks preserve optionality and original bounds', () => {
  for (const value of [0, 101, 1.5, '', NaN]) {
    assert.equal(
      validateSettings({ ...valid, threshold_percent: value })
        .threshold_percent,
      'Enter a percentage from 1 to 100.',
    );
  }
  assert.deepEqual(validateSettings({ ...valid, threshold_percent: 1 }), {});
});

test('untouched CLI budgets outside the entry range remain valid; edits use original messages', () => {
  assert.deepEqual(
    validateSettings({ ...valid, limit_gb: '0.5' }, { limit_gb: '0.5' }),
    {},
  );
  assert.deepEqual(
    validateSettings({ ...valid, limit_gb: ' 0.5 ' }, { limit_gb: '0.5' }),
    {},
  );
  assert.deepEqual(
    validateSettings({ ...valid, limit_gb: '' }, { limit_gb: '0.5' }),
    {},
  );
  for (const value of ['0.5', 'abc', '-1']) {
    assert.equal(
      validateSettings({ ...valid, limit_gb: value }).limit_gb,
      'Enter 1 GB or more, or leave empty for no limit.',
    );
  }
  for (const value of ['1.5', '10001']) {
    assert.equal(
      validateSettings({ ...valid, limit_gb: value }).limit_gb,
      'Use a whole number up to 10000 GB.',
    );
  }
  assert.deepEqual(validateSettings({ ...valid, limit_gb: '10000' }), {});
});
