const dayMs = 86400000;
const labels = { ok: 'Passed', sp: 'Slow', cn: 'Test failed', na: 'Not measured' };
const severity = { na: 0, ok: 1, sp: 2, cn: 3 };
const stamp = time => new Date(time).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
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
    const selected = tests.filter(test => test.time >= start && test.time <= now).sort((a,b) => a.time - b.time);
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
            cells.push({time,state,samples,followup:samples.some(sample => sample.reason === 'degradation_followup')});
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
    return { start, now, days, config, selected, counts, rows, incidents:incidents.reverse(), completed, headline };
}
module.exports = {reportData, quantile, labels, stamp, dayMs};
