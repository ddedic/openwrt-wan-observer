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
    const tests = payload.measurements.map(record => {
        const time = Date.parse(record.timestamp);
        const slow = record.download_mbps < config.download_mbps * config.threshold_percent / 100 ||
            record.upload_mbps < config.upload_mbps * config.threshold_percent / 100;
        const candidates = events.filter(event => event.outcome !== 'failed' &&
            time >= event.epoch * 1000 && time <= event.epoch * 1000 + 130000);
        return { time, state: slow ? 'sp' : 'ok', down: record.download_mbps,
            up: record.upload_mbps, latency: record.idle_latency_ms, server: record.server_id,
            reason: candidates.length === 1 ? candidates[0].reason : '' };
    });
    for (const event of events) {
        if (event.outcome === 'failed') tests.push({ time: event.epoch * 1000, state: 'cn', reason: event.reason });
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
            const state = samples.reduce((worst,test) => severity[test.state] > severity[worst] ? test.state : worst, 'na');
            if (state === 'na' && time <= now && time + slot > start) counts.na++;
            cells.push({time, end: time + slot, state, samples,
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
    return { start, now, days, config, latest, latestDone, selected, counts, rows, incidents:incidents.reverse(), completed, headline };
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
        counts.push(tests.length);
    }
    // A value with no neighbour cannot form a line segment in a chart without point markers.
    const isolated = values.filter((v, i) => v != null && values[i - 1] == null && values[i + 1] == null).length;
    return { times, values, states, counts, isolated, measured: values.filter(v => v != null).length, slotMinutes: slot / 60000,
        plan: key === 'down' ? config.download_mbps : config.upload_mbps };
}
// Illustrative data use only: an example size per full test, not a measurement of real traffic.
const exampleMbPerTest = 500;
function usageEstimate({enabled, interval_minutes, start_hour, end_hour, adaptive}) {
    const hours = Math.max(0, end_hour - start_hour);
    const tests = enabled ? Math.floor(hours * 60 / interval_minutes) : 0;
    const gb = n => +(n * exampleMbPerTest / 1000).toFixed(1);
    return { tests, gbDay: gb(tests), gbMonth: Math.round(gb(tests) * 30), extras: adaptive && enabled ? 24 : 0, extrasGb: adaptive && enabled ? gb(24) : 0 };
}
module.exports = {usageEstimate, exampleMbPerTest, speedSeries, reportData, quantile, labels, names, reasons, stamp, clock, day, mbps, dayMs};
