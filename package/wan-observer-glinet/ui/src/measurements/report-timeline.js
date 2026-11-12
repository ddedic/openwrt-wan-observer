const { severity } = require('./report-status');
const { reconcileAttempts } = require('./attempt-reconciliation');

const DAY_MS = 86400000;
function reportData(payload, days, now = Date.now()) {
  const config = payload.collector.config;
  const start = now - days * DAY_MS;
  const { tests, storageIssue, integrityWarning } = reconcileAttempts(
    payload,
    config,
  );
  // Latest readings are current status, independent of the selected period.
  const past = tests.filter((test) => test.time <= now);
  const latest = past.at(-1) || null,
    latestDone = past.filter((test) => test.state !== 'cn').at(-1) || null;
  const selected = tests.filter(
    (test) => test.time >= start && test.time <= now,
  );
  const counts = { ok: 0, sp: 0, cn: 0, na: 0 };
  const buckets = new Map();
  const slot = days === 30 ? 7200000 : 1800000;
  for (const test of selected) {
    counts[test.state]++;
    const key = Math.floor(test.time / slot) * slot;
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key).push(test);
  }
  const rows = [];
  for (
    let day = Math.floor(now / DAY_MS) * DAY_MS;
    day + DAY_MS > start;
    day -= DAY_MS
  ) {
    const cells = [];
    for (let time = day; time < day + DAY_MS; time += slot) {
      const samples = buckets.get(time) || [];
      let state = samples.reduce(
        (worst, test) =>
          severity[test.state] > severity[worst] ? test.state : worst,
        'na',
      );
      if (state === 'na' && time <= now && time + slot > start) {
        counts.na++;
      }
      if (time > now) {
        state = 'fu';
      }
      const hour = new Date(time).getUTCHours();
      const scheduled =
        !!config.enabled && hour >= config.start_hour && hour < config.end_hour;
      cells.push({
        time,
        end: time + slot,
        state,
        samples,
        scheduled,
        followup: samples.some(
          (sample) =>
            sample.reason === 'degradation_followup' ||
            sample.reason === 'manual',
        ),
        future: time > now,
        outside: time + slot <= start,
      });
    }
    rows.push({ day, cells });
  }
  const incidents = [];
  let current;
  for (const test of selected) {
    if (test.state === 'ok') {
      if (current) {
        current.recovered = test.time;
      }
      current = null;
    } else {
      if (
        !current ||
        test.time - current.tests.at(-1).time >
          config.interval_minutes * 60000 + 130000
      ) {
        current = { tests: [], recovered: null };
        incidents.push(current);
      }
      current.tests.push(test);
    }
  }
  const completed = selected.filter((test) => test.state !== 'cn');
  const periodHeadline = () => {
    if (!selected.length) {
      return 'No tests recorded in this period';
    }
    if (counts.sp || counts.cn) {
      return (
        [
          counts.sp ? `${counts.sp} slow` : '',
          counts.cn ? `${counts.cn} failed` : '',
        ]
          .filter(Boolean)
          .join(' and ') + ' tests observed'
      );
    }
    return 'All recorded tests passed';
  };
  const headline = periodHeadline();
  const source = payload.collector.coverage;
  const since =
    source &&
    Number.isFinite(source.complete_since_epoch) &&
    source.complete_since_epoch > 0
      ? Math.max(source.complete_since_epoch, source.retained_from_epoch || 0) *
        1000
      : null;
  const coverage = {
    ...source,
    since,
    complete:
      !!source &&
      !integrityWarning &&
      !source.persistence_error &&
      since > 0 &&
      since <= start,
  };

  return {
    first: tests.length ? tests[0].time : null,
    storageIssue,
    integrityWarning,
    coverage,
    start,
    now,
    days,
    config,
    latest,
    latestDone,
    selected,
    counts,
    rows,
    incidents: incidents.reverse(),
    completed,
    headline,
  };
}
module.exports = { reportData, dayMs: DAY_MS };
