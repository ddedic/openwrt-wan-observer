// Illustrative transfer per test; measured transfer remains a separate calculation.
const EXAMPLE_MB_PER_TEST = 500;
// Overnight windows wrap past midnight; callers can supply a measured average.
function usageEstimate(
  { enabled, interval_minutes, start_hour, end_hour, adaptive },
  mbPerTest = EXAMPLE_MB_PER_TEST,
) {
  const scheduledHours = () => {
    if (start_hour === end_hour) {
      return 0;
    }
    if (end_hour > start_hour) {
      return end_hour - start_hour;
    }
    return 24 - start_hour + end_hour;
  };
  const hours = scheduledHours();
  const tests = enabled ? Math.floor((hours * 60) / interval_minutes) : 0;
  const gb = (n) => +((n * mbPerTest) / 1000).toFixed(1);

  return {
    tests,
    gbDay: gb(tests),
    gbMonth: Math.round(gb(tests) * 30),
    extras: adaptive && enabled ? 24 : 0,
    extrasGb: adaptive && enabled ? gb(24) : 0,
  };
}
// Average only readings with known byte counts in both directions.
function measuredTestBytes(measurements, count = 10) {
  const known = (measurements || [])
    .filter((m) =>
      [m.download_bytes, m.upload_bytes].every(
        (v) => Number.isSafeInteger(v) && v >= 0,
      ),
    )
    .slice(-count);

  return known.length
    ? {
        bytes:
          known.reduce((sum, m) => sum + m.download_bytes + m.upload_bytes, 0) /
          known.length,
        tests: known.length,
      }
    : null;
}
module.exports = {
  exampleMbPerTest: EXAMPLE_MB_PER_TEST,
  usageEstimate,
  measuredTestBytes,
};
