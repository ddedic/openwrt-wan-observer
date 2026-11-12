// Compatibility entry for the existing Python CGI contract consumer.
const data = require('./src/measurements/report-data');
module.exports = {
  attemptRecord: data.attemptRecord,
  measuredTestBytes: data.measuredTestBytes,
  failureMessage: data.failureMessage,
  failureShort: data.failureShort,
  csvContent: data.csvContent,
  usageEstimate: data.usageEstimate,
  exampleMbPerTest: data.exampleMbPerTest,
  speedSeries: data.speedSeries,
  reportData: data.reportData,
  quantile: data.quantile,
  labels: data.labels,
  names: data.names,
  reasons: data.reasons,
  stamp: data.stamp,
  clock: data.clock,
  day: data.day,
  mbps: data.mbps,
  dayMs: data.dayMs,
};
