const validAttemptId = (value) =>
  typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
// A valid opaque attempt ID matches only that ID; legacy evidence uses the collector's
// 130-second window. Missing, conflicting or ambiguous evidence never becomes a guess.
function attemptRecord(event, measurements) {
  const list = measurements || [];
  const found = validAttemptId(event.attempt_id)
    ? list.filter((r) => r.attempt_id === event.attempt_id)
    : list.filter((r) => {
        const at = Date.parse(r.timestamp);

        return (
          !validAttemptId(r.attempt_id) &&
          at >= event.epoch * 1000 &&
          at <= event.epoch * 1000 + 130000
        );
      });

  return found.length === 1 ? found[0] : null;
}

// Reconcile durable events with saved readings before choosing any display period.
function reconcileAttempts(payload, config = payload.collector.config) {
  const events = payload.collector.events || [];
  // Only a validated durable attempt ID establishes identity; legacy observations stay separate.
  const stopped = events.filter(
    (e) =>
      (e.pending && !payload.collector.busy) ||
      (e.outcome === 'failed' && e.failure_code === 'storage_error'),
  );
  const storageIssue = stopped.some((e) => e.failure_code === 'storage_error');
  const associated = new Map();
  const sameAttempt = (record, event) =>
    validAttemptId(record.attempt_id) && record.attempt_id === event.attempt_id;
  for (const event of stopped) {
    if (
      event.outcome !== 'failed' ||
      !(
        (event.pending && event.failure_code === 'interrupted') ||
        event.failure_code === 'storage_error'
      )
    ) {
      continue;
    }
    const records = payload.measurements.filter((record) =>
      sameAttempt(record, event),
    );
    if (
      records.length === 1 &&
      events.filter((e) => sameAttempt(records[0], e)).length === 1
    ) {
      associated.set(event, records[0]);
    }
  }
  const integrityWarning = stopped.length > 0;
  const tests = payload.measurements.map((record) => {
    const time = Date.parse(record.timestamp);
    const slow =
      record.download_mbps <
        (config.download_mbps * config.threshold_percent) / 100 ||
      record.upload_mbps <
        (config.upload_mbps * config.threshold_percent) / 100;
    const candidates = events.filter(
      (event) =>
        associated.get(event) === record ||
        (event.outcome !== 'failed' &&
          (validAttemptId(record.attempt_id)
            ? sameAttempt(record, event)
            : !validAttemptId(event.attempt_id) &&
              time >= event.epoch * 1000 &&
              time <= event.epoch * 1000 + 130000)),
    );

    return {
      time,
      state: slow ? 'sp' : 'ok',
      down: record.download_mbps,
      up: record.upload_mbps,
      latency: record.idle_latency_ms ?? null,
      server: record.server_id ?? null,
      jitter: record.idle_jitter_ms ?? null,
      loadedDown: record.download_loaded_latency_ms ?? null,
      loadedUp: record.upload_loaded_latency_ms ?? null,
      loss: record.packet_loss_percent ?? null,
      downloadBytes: record.download_bytes ?? null,
      uploadBytes: record.upload_bytes ?? null,
      failureCode: [...associated.entries()].some(
        ([event, value]) =>
          value === record && event.failure_code === 'storage_error',
      )
        ? 'storage_error'
        : null,
      reason: candidates.length === 1 ? candidates[0].reason : '',
      attemptFinalized: ![...associated.values()].includes(record),
    };
  });
  for (const event of events) {
    if (
      event.outcome === 'failed' &&
      !associated.has(event) &&
      !(event.pending && payload.collector.busy)
    ) {
      tests.push({
        time: event.epoch * 1000,
        state: 'cn',
        reason: event.reason,
        failureCode: [
          'interrupted',
          'backend_exit',
          'timeout',
          'execution_terminated',
          'invalid_result',
          'storage_error',
        ].includes(event.failure_code)
          ? event.failure_code
          : null,
      });
    }
  }
  tests.sort((a, b) => a.time - b.time);

  return { tests, storageIssue, integrityWarning };
}
module.exports = { attemptRecord, reconcileAttempts };
