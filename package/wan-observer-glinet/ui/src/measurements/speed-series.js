const { severity } = require('./report-status');
const { quantile } = require('./measurement-statistics');

// Fixed-grid chart series retain empty slots so missing tests break the line.
function speedSeries(report, key) {
  const config = report.config,
    span = report.now - report.start;
  const slot = Math.max(
    config.interval_minutes * 60000,
    Math.ceil(span / 180 / 3600000) * 3600000,
  );
  const buckets = new Map();
  for (const test of report.selected) {
    const at = Math.floor(test.time / slot) * slot;
    if (!buckets.has(at)) {
      buckets.set(at, []);
    }
    buckets.get(at).push(test);
  }
  const times = [],
    values = [],
    states = [],
    counts = [];
  for (
    let at = Math.floor(report.start / slot) * slot;
    at <= report.now;
    at += slot
  ) {
    const tests = buckets.get(at) || [],
      done = tests.filter((test) => test.state !== 'cn');
    times.push(at);
    values.push(
      done.length
        ? +quantile(
            done.map((test) => test[key]),
            0.5,
          ).toFixed(1)
        : null,
    );
    states.push(
      tests.reduce(
        (worst, test) =>
          severity[test.state] > severity[worst] ? test.state : worst,
        'na',
      ),
    );
    counts.push(done.length);
  }
  // A value with no neighbour cannot form a line segment in a chart without point markers.
  const isolated = values.filter(
    (v, i) => v != null && values[i - 1] == null && values[i + 1] == null,
  ).length;

  return {
    times,
    values,
    states,
    counts,
    isolated,
    measured: values.filter((v) => v != null).length,
    slotMinutes: slot / 60000,
    plan: key === 'down' ? config.download_mbps : config.upload_mbps,
  };
}
module.exports = { speedSeries };
