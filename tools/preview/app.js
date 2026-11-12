'use strict';
let records = [],
  visible = [],
  source = 'synthetic',
  scheduleToken = null,
  collector = null;
let config = { download: 100, upload: 20, threshold: 80, range: 'all' };
const el = (id) => document.getElementById(id);
const fields = [
  'timestamp',
  'server_id',
  'download_mbps',
  'upload_mbps',
  'idle_latency_ms',
  'packet_loss_percent',
];
const fmt = (n) => (n == null ? 'Unknown' : Number(n).toFixed(1));
const time = (t) => new Date(t).toISOString().slice(11, 16);
const stamp = (t) =>
  new Date(t).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
const slow = (r) =>
  r.download_mbps < (config.download * config.threshold) / 100 ||
  r.upload_mbps < (config.upload * config.threshold) / 100;
const average = (rows, key) =>
  rows.reduce((s, r) => s + r[key], 0) / rows.length;
function valid(c) {
  return (
    ['download', 'upload'].every(
      (k) => Number.isFinite(c[k]) && c[k] >= 1 && c[k] <= 100000,
    ) &&
    Number.isFinite(c.threshold) &&
    c.threshold >= 1 &&
    c.threshold <= 100 &&
    ['all', '24', '168'].includes(c.range)
  );
}
try {
  const saved = JSON.parse(localStorage.getItem('wan-observer-report'));
  if (saved && valid(saved)) {
    config = saved;
  }
} catch {
  /* Browser storage may be unavailable; retain session defaults. */
}
for (const k of Object.keys(config)) {
  el(k).value = config[k];
}
function chart(id, key, paid) {
  const ctx = el(id).getContext('2d'),
    w = 900,
    h = 260;
  ctx.clearRect(0, 0, w, h);
  if (!visible.length) {
    return;
  }
  const max = Math.max(paid, ...visible.map((r) => r[key])) * 1.2;
  const y = (v) => 215 - (v / max) * 185;
  const start = Date.parse(visible[0].timestamp),
    end = Date.parse(visible.at(-1).timestamp);
  const x = (r) =>
    visible.length === 1
      ? 465
      : 65 + ((Date.parse(r.timestamp) - start) / (end - start || 1)) * 790;
  ctx.font = '16px system-ui';
  ctx.fillStyle = '#61776a';
  ctx.textAlign = 'left';
  for (let i = 0; i <= 4; i++) {
    const v = (max * i) / 4;
    ctx.fillText(v.toFixed(0), 3, y(v) + 5);
    ctx.strokeStyle = '#e7eeea';
    ctx.beginPath();
    ctx.moveTo(55, y(v));
    ctx.lineTo(880, y(v));
    ctx.stroke();
  }
  ctx.setLineDash([7, 6]);
  ctx.strokeStyle = '#6d7b74';
  ctx.beginPath();
  ctx.moveTo(55, y(paid));
  ctx.lineTo(880, y(paid));
  ctx.stroke();
  ctx.setLineDash([]);
  const width = Math.max(2, Math.min(26, 650 / visible.length));
  visible.forEach((r) => {
    ctx.fillStyle =
      r[key] < (paid * config.threshold) / 100 ? '#bd562b' : '#178064';
    ctx.fillRect(
      x(r) - width / 2,
      y(r[key]),
      width,
      Math.max(2, 215 - y(r[key])),
    );
  });
  ctx.fillStyle = '#61776a';
  ctx.fillText(time(visible[0].timestamp), 55, 248);
  ctx.textAlign = 'right';
  ctx.fillText(time(visible.at(-1).timestamp), 880, 248);
  ctx.textAlign = 'left';
}
function render() {
  const last = records.length ? Date.parse(records.at(-1).timestamp) : 0;
  visible = records.filter(
    (r) =>
      config.range === 'all' ||
      Date.parse(r.timestamp) >= last - Number(config.range) * 3600000,
  );
  el('rows').replaceChildren();
  el('events').replaceChildren();
  el('export').disabled = !visible.length;
  el('print').disabled = !visible.length;
  for (const row of visible) {
    const tr = document.createElement('tr');
    for (const f of fields) {
      const td = document.createElement('td');
      if (f === 'timestamp') {
        td.textContent = stamp(row[f]);
      } else if (f === 'server_id') {
        td.textContent = String(row[f] ?? 'Unknown');
      } else {
        td.textContent = fmt(row[f]);
      }
      tr.append(td);
    }
    el('rows').append(tr);
  }
  chart('down-chart', 'download_mbps', config.download);
  chart('up-chart', 'upload_mbps', config.upload);
  el('chart-note').textContent =
    `Paid plan: ${config.download} Mbps down / ${config.upload} Mbps up. Flagging tests below ${config.threshold}% (${fmt((config.download * config.threshold) / 100)} down / ${fmt((config.upload * config.threshold) / 100)} up). This is your reporting threshold, not a contractual minimum.`;
  if (!visible.length) {
    el('headline').textContent = 'No measurements to report yet';
    el('story').textContent =
      'Import completed speed-test results to see what happened. This page does not start tests.';
    for (const id of [
      'recovery',
      'period',
      'provider-summary',
      'worst-note',
      'up-note',
      'latest-note',
    ]) {
      el(id).textContent = '';
    }
    for (const id of ['slow', 'worst', 'up-average', 'latest']) {
      el(id).textContent = '—';
    }
    return;
  }
  const bad = visible.filter(slow),
    worst = Math.min(...visible.map((r) => r.download_mbps)),
    latest = visible.at(-1),
    avgUp = average(visible, 'upload_mbps');
  el('period').textContent =
    `${stamp(visible[0].timestamp)} → ${stamp(latest.timestamp)} · ${visible.length} recorded tests`;
  el('headline').textContent = bad.length
    ? `${bad.length} of ${visible.length} tests were below your threshold`
    : 'All recorded tests met your selected threshold';
  el('story').textContent = bad.length
    ? `Download reached as low as ${fmt(worst)} Mbps — ${fmt((worst / config.download) * 100)}% of your ${config.download} Mbps plan. Average upload was ${fmt(avgUp)} Mbps against ${config.upload} Mbps paid. The timeline below shows when the slow results appeared.`
    : `Download averaged ${fmt(average(visible, 'download_mbps'))} Mbps and upload averaged ${fmt(avgUp)} Mbps in this selection. That describes these tests only; performance between them is unknown.`;
  if (slow(latest)) {
    el('recovery').textContent =
      `The latest test (${time(latest.timestamp)} UTC) was still below your threshold.`;
  } else if (bad.length) {
    el('recovery').textContent =
      `The latest test (${time(latest.timestamp)} UTC) was back above your threshold. Continuous recovery has not been verified.`;
  } else {
    el('recovery').textContent = 'The latest test also met your threshold.';
  }
  el('slow').textContent = `${bad.length} / ${visible.length}`;
  el('worst').textContent = `${fmt(worst)} Mbps`;
  el('worst-note').textContent =
    `${fmt((worst / config.download) * 100)}% of paid download`;
  el('up-average').textContent = `${fmt(avgUp)} Mbps`;
  el('up-note').textContent =
    `${fmt((avgUp / config.upload) * 100)}% of paid upload`;
  el('latest').textContent = `${fmt(latest.download_mbps)} Mbps`;
  el('latest-note').textContent =
    `At ${time(latest.timestamp)} UTC · ${slow(latest) ? 'Below threshold' : 'At / above threshold'}`;
  const groups = [];
  for (const row of visible) {
    const state = slow(row);
    if (!groups.length || groups.at(-1).bad !== state) {
      groups.push({ bad: state, rows: [] });
    }
    groups.at(-1).rows.push(row);
  }
  for (const group of groups) {
    const rows = group.rows,
      li = document.createElement('li'),
      heading = document.createElement('strong'),
      p = document.createElement('p');
    li.className = group.bad ? 'bad' : 'good';
    heading.textContent = `${stamp(rows[0].timestamp)}${rows.length > 1 ? ' → ' + stamp(rows.at(-1).timestamp) : ''} · ${group.bad ? 'Below threshold' : 'At / above threshold'}`;
    p.textContent = `${rows.length} test${rows.length === 1 ? '' : 's'} · Download ${fmt(Math.min(...rows.map((r) => r.download_mbps)))}–${fmt(Math.max(...rows.map((r) => r.download_mbps)))} Mbps · Average upload ${fmt(average(rows, 'upload_mbps'))} Mbps. No continuous duration inferred.`;
    li.append(heading, p);
    el('events').append(li);
  }
  el('provider-summary').textContent =
    `${source === 'synthetic' ? 'SYNTHETIC EXAMPLE — ' : ''}Across ${visible.length} recorded tests from ${stamp(visible[0].timestamp)} to ${stamp(latest.timestamp)}, ${bad.length} were below the user-selected ${config.threshold}% threshold for a ${config.download}/${config.upload} Mbps plan. Lowest download: ${fmt(worst)} Mbps. Average upload: ${fmt(avgUp)} Mbps. Missing packet-loss values remain unknown in the details.`;
}
el('settings').addEventListener('submit', (event) => {
  event.preventDefault();
  const candidate = {
    download: Number(el('download').value),
    upload: Number(el('upload').value),
    threshold: Number(el('threshold').value),
    range: el('range').value,
  };
  if (!valid(candidate)) {
    return;
  }
  config = candidate;
  try {
    localStorage.setItem('wan-observer-report', JSON.stringify(config));
    el('saved').textContent =
      'Settings saved in this browser. Report updated. Router settings are unchanged.';
  } catch {
    el('saved').textContent =
      'Report updated for this session. Browser storage is unavailable.';
  }
  render();
});
async function refresh() {
  el('refresh').disabled = true;
  try {
    const response = await fetch('/api/measurements', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error();
    }
    const data = await response.json();
    records = data.measurements.sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
    source = data.source;
    scheduleToken = data.schedule_token;
    collector = data.collector || null;
    renderCollector();
    if (source === 'synthetic') {
      el('source').textContent =
        'DEMO DATA · This is an invented example, not a report about your connection.';
    } else if (source === 'router collection') {
      el('source').textContent =
        'ROUTER MEASUREMENTS · Refresh reads current history. Tests run independently on the router.';
    } else {
      el('source').textContent =
        'IMPORTED SNAPSHOT · Recorded data, not live monitoring.';
    }
    render();
  } catch {
    records = [];
    collector = null;
    scheduleToken = null;
    renderCollector();
    render();
    el('source').textContent =
      'Data unavailable. Check the local preview server and imported history.';
  } finally {
    el('refresh').disabled = false;
  }
}
el('refresh').addEventListener('click', refresh);
el('print').addEventListener('click', () => window.print());
el('export').addEventListener('click', () => {
  const quote = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const csv = [fields, ...visible.map((r) => fields.map((f) => r[f]))]
    .map((r) => r.map(quote).join(','))
    .join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download =
    source === 'synthetic'
      ? 'wan-observer-SYNTHETIC-demo.csv'
      : 'wan-observer-measurements.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
refresh();

function renderCollector() {
  el('save-schedule').disabled = !collector;
  if (!collector) {
    el('collector-status').textContent =
      'No router connected — demonstration only';
    return;
  }
  const c = collector.config;
  el('interval').value = c.interval_minutes;
  el('start-hour').value = c.start_hour;
  el('end-hour').value = c.end_hour;
  el('adaptive').value = c.adaptive ? 'yes' : 'no';
  el('enabled').value = c.enabled ? 'yes' : 'no';
  config.download = c.download_mbps;
  config.upload = c.upload_mbps;
  config.threshold = c.threshold_percent;
  for (const k of ['download', 'upload', 'threshold']) {
    el(k).value = config[k];
  }
  el('saved').textContent =
    'Comparison baseline comes from the collector. Changes here affect only this report; automatic detection uses the collector baseline.';
  const next = collector.next_epoch
    ? stamp(collector.next_epoch * 1000)
    : 'next scheduler tick';
  const event = collector.events.at(-1);
  el('collector-status').textContent =
    (c.enabled
      ? `Running · Every ${c.interval_minutes} minutes · Next due: ${next}`
      : 'Paused · No new tests will start') +
    (event
      ? ` · Last attempt: ${event.outcome} (${event.reason === 'scheduled' ? 'scheduled' : 'automatic follow-up'})`
      : ' · Awaiting first result');
  el('schedule-result').textContent =
    'Schedule is read from the router. Saving changes the real collector.';
  const count = Math.ceil(
    ((c.end_hour - c.start_hour) * 60) / c.interval_minutes,
  );
  el('data-budget').textContent =
    `About ${count} scheduled tests/day${c.adaptive ? ', plus up to 24 automatic follow-ups' : ''}. At an illustrative 500 MB/test: about ${(count * 0.5).toFixed(0)} GB/day${c.adaptive ? ' plus up to 12 GB of follow-ups' : ''}. Actual use varies; full tests briefly compete with normal traffic.`;
  el('collection-note').textContent =
    'The collector runs on the router, including when this page is closed. Failures are recorded separately from speed measurements. History persists; burst accounting resets after a router reboot.';
}
el('schedule').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!collector || !scheduleToken) {
    return;
  }
  const patch = {
    enabled: el('enabled').value === 'yes',
    adaptive: el('adaptive').value === 'yes',
    interval_minutes: Number(el('interval').value),
    start_hour: Number(el('start-hour').value),
    end_hour: Number(el('end-hour').value),
  };
  if (patch.start_hour >= patch.end_hour) {
    el('schedule-result').textContent =
      'End hour must be later than start hour. Use 0–24 for all day.';
    return;
  }
  el('save-schedule').disabled = true;
  try {
    const response = await fetch('/api/schedule', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Schedule-Token': scheduleToken,
      },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      throw new Error();
    }
    await refresh();
    el('schedule-result').textContent =
      'Saved on the router. The next scheduler tick will use these settings.';
  } catch {
    el('schedule-result').textContent =
      'Could not save. A test may be running; try again after it finishes.';
  } finally {
    el('save-schedule').disabled = false;
  }
});
