const dayMs = 86400000;
const labels = { ok: 'Passed', sp: 'Slow', cn: 'Test failed', na: 'Not measured' };
const severity = { na: 0, ok: 1, sp: 2, cn: 3 };
const stamp = time => new Date(time).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
// Dashboard wording; the PDF keeps its approved labels.
const names = { ok: 'Good', sp: 'Slow', cn: 'Failed', na: 'No test recorded', fu: 'Upcoming' };
const reasons = { scheduled: 'Scheduled', degradation_followup: 'Follow-up', manual: 'Manual' };
const clock = time => new Date(time).toISOString().slice(11, 16);
const day = time => new Date(time).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const mbps = value => value == null ? '—' : value >= 100 ? value.toFixed(0) : value.toFixed(1);
function quantile(values, fraction) {
    const sorted = [...values].sort((a, b) => a - b);
    if (!sorted.length) return null;
    const index = (sorted.length - 1) * fraction;
    const lower = Math.floor(index);
    return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
}
function reportData(payload, days, now = Date.now()) {
    const config = payload.collector.config;
    const start = now - days * dayMs;
    const events = payload.collector.events || [];
    // Only a validated durable attempt ID establishes identity; legacy observations stay separate.
    const stopped = events.filter(e => (e.pending && !payload.collector.busy) || (e.outcome === 'failed' && e.failure_code === 'storage_error'));
    const storageIssue = stopped.some(e => e.failure_code === 'storage_error');
    const associated = new Map();
    const validId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
    const sameAttempt = (record,event) => validId(record.attempt_id) && record.attempt_id === event.attempt_id;
    for (const event of stopped) {
        if(event.outcome !== 'failed' || !((event.pending && event.failure_code === 'interrupted') || event.failure_code === 'storage_error'))continue;
        const records = payload.measurements.filter(record => sameAttempt(record,event));
        if(records.length === 1 && events.filter(e => sameAttempt(records[0],e)).length === 1)associated.set(event,records[0]);
    }
    const integrityWarning = stopped.length > 0;
    const tests = payload.measurements.map(record => {
        const time = Date.parse(record.timestamp);
        const slow = record.download_mbps < config.download_mbps * config.threshold_percent / 100 ||
            record.upload_mbps < config.upload_mbps * config.threshold_percent / 100;
        const candidates = events.filter(event => associated.get(event) === record || (event.outcome !== 'failed' &&
            (validId(record.attempt_id) ? sameAttempt(record,event) : !validId(event.attempt_id) && time >= event.epoch*1000 && time <= event.epoch*1000+130000)));
        return { time, state: slow ? 'sp' : 'ok', down: record.download_mbps,
            up: record.upload_mbps, latency: record.idle_latency_ms ?? null, server: record.server_id ?? null,
            jitter: record.idle_jitter_ms ?? null, loadedDown: record.download_loaded_latency_ms ?? null,
            loadedUp: record.upload_loaded_latency_ms ?? null, loss: record.packet_loss_percent ?? null,
            downloadBytes: record.download_bytes ?? null, uploadBytes: record.upload_bytes ?? null,
            failureCode: [...associated.entries()].some(([event,value]) => value === record && event.failure_code === 'storage_error') ? 'storage_error' : null,
            reason: candidates.length === 1 ? candidates[0].reason : '', attemptFinalized: ![...associated.values()].includes(record) };
    });
    for (const event of events) {
        if (event.outcome === 'failed' && !associated.has(event) && !(event.pending && payload.collector.busy)) tests.push({ time: event.epoch * 1000, state: 'cn', reason: event.reason, failureCode: ['interrupted','backend_exit','timeout','execution_terminated','invalid_result','storage_error'].includes(event.failure_code) ? event.failure_code : null });
    }
    tests.sort((a, b) => a.time - b.time);
    // Latest readings are current status, independent of the selected period.
    const past = tests.filter(test => test.time <= now);
    const latest = past.at(-1) || null, latestDone = past.filter(test => test.state !== 'cn').at(-1) || null;
    const selected = tests.filter(test => test.time >= start && test.time <= now);
    const counts = { ok: 0, sp: 0, cn: 0, na: 0 };
    const buckets = new Map();
    const slot = days === 30 ? 7200000 : 1800000;
    for (const test of selected) {
        counts[test.state]++;
        const key = Math.floor(test.time / slot) * slot;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(test);
    }
    const rows = [];
    for (let day = Math.floor(now / dayMs) * dayMs; day + dayMs > start; day -= dayMs) {
        const cells = [];
        for (let time = day; time < day + dayMs; time += slot) {
            const samples = buckets.get(time) || [];
            let state = samples.reduce((worst,test) => severity[test.state] > severity[worst] ? test.state : worst, 'na');
            if (state === 'na' && time <= now && time + slot > start) counts.na++;
            if (time > now) state = 'fu';
            const hour = new Date(time).getUTCHours();
            const scheduled = !!config.enabled && hour >= config.start_hour && hour < config.end_hour;
            cells.push({time, end: time + slot, state, samples, scheduled,
                followup: samples.some(sample => sample.reason === 'degradation_followup' || sample.reason === 'manual'),
                future: time > now, outside: time + slot <= start});
        }
        rows.push({day,cells});
    }
    const incidents = [];
    let current;
    for (const test of selected) {
        if (test.state === 'ok') {
            if (current) current.recovered = test.time;
            current = null;
        } else {
            if (!current || test.time - current.tests.at(-1).time > config.interval_minutes * 60000 + 130000) {
                current = {tests:[], recovered:null};
                incidents.push(current);
            }
            current.tests.push(test);
        }
    }
    const completed = selected.filter(test => test.state !== 'cn');
    const headline = !selected.length ? 'No tests recorded in this period' :
        counts.sp || counts.cn ? [counts.sp ? `${counts.sp} slow` : '', counts.cn ? `${counts.cn} failed` : ''].filter(Boolean).join(' and ') + ' tests observed' : 'All recorded tests passed';
    const source = payload.collector.coverage;
    const since = source && Number.isFinite(source.complete_since_epoch) && source.complete_since_epoch > 0 ? Math.max(source.complete_since_epoch, source.retained_from_epoch || 0) * 1000 : null;
    const coverage = { ...source, since, complete: !!source && !integrityWarning && !source.persistence_error && since > 0 && since <= start };
    return { first: tests.length ? tests[0].time : null, storageIssue, integrityWarning, coverage, start, now, days, config, latest, latestDone, selected, counts, rows, incidents:incidents.reverse(), completed, headline };
}
// Chart series on a fixed time grid: one value per slot (median of completed tests),
// null where no completed test exists, so the native line breaks instead of bridging gaps.
function speedSeries(report, key) {
    const config = report.config, span = report.now - report.start;
    const slot = Math.max(config.interval_minutes * 60000, Math.ceil(span / 180 / 3600000) * 3600000);
    const buckets = new Map();
    for (const test of report.selected) {
        const at = Math.floor(test.time / slot) * slot;
        if (!buckets.has(at)) buckets.set(at, []);
        buckets.get(at).push(test);
    }
    const times = [], values = [], states = [], counts = [];
    for (let at = Math.floor(report.start / slot) * slot; at <= report.now; at += slot) {
        const tests = buckets.get(at) || [], done = tests.filter(test => test.state !== 'cn');
        times.push(at);
        values.push(done.length ? +quantile(done.map(test => test[key]), .5).toFixed(1) : null);
        states.push(tests.reduce((worst, test) => severity[test.state] > severity[worst] ? test.state : worst, 'na'));
        counts.push(done.length);
    }
    // A value with no neighbour cannot form a line segment in a chart without point markers.
    const isolated = values.filter((v, i) => v != null && values[i - 1] == null && values[i + 1] == null).length;
    return { times, values, states, counts, isolated, measured: values.filter(v => v != null).length, slotMinutes: slot / 60000,
        plan: key === 'down' ? config.download_mbps : config.upload_mbps };
}
// Illustrative data use only: an example size per full test, not a measurement of real traffic.
const exampleMbPerTest = 500;
// Overnight windows (start later than end) wrap past midnight. mbPerTest may be a measured average.
function usageEstimate({enabled, interval_minutes, start_hour, end_hour, adaptive}, mbPerTest = exampleMbPerTest) {
    const hours = start_hour === end_hour ? 0 : end_hour > start_hour ? end_hour - start_hour : 24 - start_hour + end_hour;
    const tests = enabled ? Math.floor(hours * 60 / interval_minutes) : 0;
    const gb = n => +(n * mbPerTest / 1000).toFixed(1);
    return { tests, gbDay: gb(tests), gbMonth: Math.round(gb(tests) * 30), extras: adaptive && enabled ? 24 : 0, extrasGb: adaptive && enabled ? gb(24) : 0 };
}
// Mean transfer of the latest measurements that report both directions; never estimated from rates.
function measuredTestBytes(measurements, count = 10) {
    const known = (measurements || []).filter(m => [m.download_bytes, m.upload_bytes].every(v => Number.isSafeInteger(v) && v >= 0)).slice(-count);
    return known.length ? { bytes: known.reduce((sum, m) => sum + m.download_bytes + m.upload_bytes, 0) / known.length, tests: known.length } : null;
}
// Measurement for one attempt, with report identity rules: a valid opaque attempt ID matches only the
// record with the same ID; an event without one may match only an ID-less (legacy) record inside the
// collector's 130 s window. Missing, conflicting or ambiguous evidence returns null, never a guess.
const validAttemptId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
function attemptRecord(event, measurements) {
    const list = measurements || [];
    const found = validAttemptId(event.attempt_id) ? list.filter(r => r.attempt_id === event.attempt_id)
        : list.filter(r => { const at = Date.parse(r.timestamp); return !validAttemptId(r.attempt_id) && at >= event.epoch * 1000 && at <= event.epoch * 1000 + 130000; });
    return found.length === 1 ? found[0] : null;
}
// Failure copy states what was observed; it never names a cause the collector did not establish.
const failureText = {
    timeout: 'Test timed out. Retry or check the test server.',
    execution_terminated: 'The test stopped before finishing.',
    interrupted: 'The test was interrupted before a result was saved.',
    backend_exit: 'The speed test program reported an error.',
    invalid_result: 'The test returned a result that could not be read.',
    storage_error: "The result couldn't be saved. Check free storage on the router.",
};
const failureShort = { timeout: 'Timed out', execution_terminated: 'Stopped', interrupted: 'Interrupted', backend_exit: 'Program error', invalid_result: 'Unreadable', storage_error: 'Not saved' };
const failureMessage = code => failureText[code] || 'No result was recorded. The cause is unknown.';
function csvContent(report) {
    const columns = ['timestamp_utc','result','reason','download_mbps','upload_mbps','idle_latency_ms','idle_jitter_ms','download_loaded_latency_ms','upload_loaded_latency_ms','packet_loss_percent','server_id','download_bytes','upload_bytes','failure_code','attempt_finalized','comparison_basis','comparison_download_mbps','comparison_upload_mbps','comparison_threshold_percent','history_complete_for_period','history_complete_since_utc'];
    const rows = [columns];
    for (const t of report.selected) rows.push([new Date(t.time).toISOString(),labels[t.state],t.reason,t.down,t.up,t.latency,t.jitter,t.loadedDown,t.loadedUp,t.loss,t.server,t.downloadBytes,t.uploadBytes,t.failureCode,t.attemptFinalized ?? null,'current_settings',report.config.download_mbps,report.config.upload_mbps,report.config.threshold_percent,report.coverage.complete,report.coverage.since ? new Date(report.coverage.since).toISOString() : null]);
    return rows.map(row => row.map(value => '"' + String(value ?? 'null').replaceAll('"','""') + '"').join(',')).join('\r\n');
}
module.exports = {attemptRecord,measuredTestBytes,failureMessage,failureShort,csvContent,usageEstimate, exampleMbPerTest, speedSeries, reportData, quantile, labels, names, reasons, stamp, clock, day, mbps, dayMs};
