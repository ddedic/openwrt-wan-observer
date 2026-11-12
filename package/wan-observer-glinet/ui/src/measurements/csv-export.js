const { labels } = require('./report-status');

function csvContent(report) {
  const columns = [
    'timestamp_utc',
    'result',
    'reason',
    'download_mbps',
    'upload_mbps',
    'idle_latency_ms',
    'idle_jitter_ms',
    'download_loaded_latency_ms',
    'upload_loaded_latency_ms',
    'packet_loss_percent',
    'server_id',
    'download_bytes',
    'upload_bytes',
    'failure_code',
    'attempt_finalized',
    'comparison_basis',
    'comparison_download_mbps',
    'comparison_upload_mbps',
    'comparison_threshold_percent',
    'history_complete_for_period',
    'history_complete_since_utc',
  ];
  const rows = [columns];
  for (const t of report.selected) {
    rows.push([
      new Date(t.time).toISOString(),
      labels[t.state],
      t.reason,
      t.down,
      t.up,
      t.latency,
      t.jitter,
      t.loadedDown,
      t.loadedUp,
      t.loss,
      t.server,
      t.downloadBytes,
      t.uploadBytes,
      t.failureCode,
      t.attemptFinalized ?? null,
      'current_settings',
      report.config.download_mbps,
      report.config.upload_mbps,
      report.config.threshold_percent,
      report.coverage.complete,
      report.coverage.since
        ? new Date(report.coverage.since).toISOString()
        : null,
    ]);
  }
  return rows
    .map((row) =>
      row
        .map(
          (value) => '"' + String(value ?? 'null').replaceAll('"', '""') + '"',
        )
        .join(','),
    )
    .join('\r\n');
}
module.exports = { csvContent };
