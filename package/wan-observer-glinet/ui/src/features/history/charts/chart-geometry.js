const { CHART_PADDING: pad } = require('./chart-layout');
const maxPoints = 400;
const railGap = 18;
function niceAxis(value) {
  const v = value > 0 ? value : 1,
    power = 10 ** Math.floor(Math.log10(v / 5));
  const step = [1, 2, 5, 10, 20]
    .map((m) => m * power)
    .find((m) => Math.ceil(v / m) <= 5);
  const max = Math.ceil(v / step) * step;
  return {
    max,
    ticks: Array.from(
      { length: Math.round(max / step) + 1 },
      (_, i) => i * step,
    ),
  };
}
const niceMax = (value) => niceAxis(value).max;
function median(values) {
  const sorted = values
    .filter((v) => v != null && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = (sorted.length - 1) / 2;
  return (sorted[Math.floor(mid)] + sorted[Math.ceil(mid)]) / 2;
}
function bin(items, start, end, count, value) {
  const width = (end - start) / count,
    bins = new Map();
  for (const item of items) {
    const index = Math.min(
      count - 1,
      Math.max(0, Math.floor((item.time - start) / width)),
    );
    if (!bins.has(index)) bins.set(index, []);
    bins.get(index).push(item);
  }
  return [...bins.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, members]) => ({
      time: median(members.map((m) => m.time)),
      first: members[0].time,
      last: members.at(-1).time,
      value: value ? median(members.map(value)) : null,
      n: members.length,
      slow: members.filter((m) => m.state === 'sp').length,
      state: members.some((m) => m.state === 'sp') ? 'sp' : members[0].state,
      // The slowest reading stays visible instead of being averaged away.
      low:
        value && members.some((m) => m.state === 'sp')
          ? Math.min(...members.filter((m) => m.state === 'sp').map(value))
          : null,
      reason: members.length === 1 ? members[0].reason : '',
      failureCode: members.length === 1 ? members[0].failureCode : null,
    }));
}
function frame(width, height, start, end, max, rail) {
  const plotH = height - pad.top - pad.bottom - (rail ? railGap : 0),
    plotW = width - pad.left - pad.right;
  const span = Math.max(1, end - start);
  return {
    width,
    height,
    plotW,
    plotH,
    start,
    end,
    max,
    x: (time) => pad.left + ((time - start) / span) * plotW,
    y: (value) => pad.top + plotH - (Math.min(value, max) / max) * plotH,
    axisY: pad.top + plotH,
    railY: pad.top + plotH + 10,
    labelY: pad.top + plotH + (rail ? railGap : 0) + 14,
  };
}
function xTicks(start, end, count) {
  return Array.from(
    { length: count },
    (_, i) => start + ((end - start) * (i + 0.5)) / count,
  );
}
function speedGeometry(
  report,
  key,
  { width = 600, height = 230, first = null } = {},
) {
  const firstTime = first == null ? report.start : first;
  const start = Math.max(
      report.start,
      Math.min(firstTime, report.now - 3600000),
    ),
    end = report.now;
  const tests = report.selected.filter((t) => t.time >= start);
  const plan =
    key === 'down' ? report.config.download_mbps : report.config.upload_mbps;
  // Slow is marked per chart: a test is slow here only if this direction fell below the threshold.
  const below = (plan * (report.config.threshold_percent || 80)) / 100;
  const done = tests
      .filter((t) => t.state !== 'cn' && t[key] != null)
      .map((t) => ({ ...t, state: t[key] < below ? 'sp' : 'ok' })),
    failed = tests.filter((t) => t.state === 'cn');
  // Never more than 400 marks, and no more than one per ~3 px so dense history stays legible.
  const limit = Math.min(
    maxPoints,
    Math.max(60, Math.floor((width - pad.left - pad.right) / 3)),
  );
  const aggregated = done.length > limit || failed.length > limit;
  const points = aggregated
    ? bin(done, start, end, limit, (t) => t[key])
    : done.map((t) => ({
        ...t,
        value: t[key],
        n: 1,
        slow: t.state === 'sp' ? 1 : 0,
      }));
  const rail = aggregated
    ? bin(failed, start, end, limit)
    : failed.map((t) => ({ ...t, n: 1 }));
  const axis = niceAxis(
      Math.max(plan * 1.15, ...points.map((p) => p.value * 1.1)),
    ),
    max = axis.max;
  const f = frame(width, height, start, end, max, true);
  // Lines join consecutive results only; a failure or a long gap between them breaks the line.
  const gap = Math.max(
    2.5 * (report.config.interval_minutes || 120) * 60000,
    aggregated ? (2.5 * (end - start)) / limit : 0,
  );
  const segments = [];
  let segment = [];
  points.forEach((p, i) => {
    const prev = points[i - 1];
    // Individual view: a failure between two results breaks the line. Aggregated view keeps the
    // trend continuous and shows every failure on the rail instead.
    if (
      prev &&
      (p.time - prev.time > gap ||
        (!aggregated &&
          failed.some((t) => t.time > prev.time && t.time < p.time)))
    ) {
      segments.push(segment);
      segment = [];
    }
    segment.push(p);
  });
  if (segment.length) segments.push(segment);
  for (const p of points) {
    p.x = f.x(p.time);
    p.y = f.y(p.value);
    p.markY = p.low != null ? f.y(p.low) : p.y;
  }
  for (const p of rail) p.x = f.x(p.time);
  return {
    ...f,
    kind: 'speed',
    points,
    rail,
    segments: segments.filter((s) => s.length > 1),
    plan,
    planY: f.y(plan),
    yTicks: axis.ticks,
    ticks: xTicks(start, end, width < 420 ? 3 : 5),
    aggregated,
    perPoint: aggregated
      ? Math.max(...points.map((p) => p.n), ...rail.map((p) => p.n))
      : 1,
    clipped: points.some((p) => p.value > max),
  };
}
function qualityGeometry(series, { width = 900, height = 190 } = {}) {
  const step =
    series.points.length > 1
      ? (series.points[1].epoch - series.points[0].epoch) * 1000
      : 60000;
  const end = series.end_epoch * 1000,
    since =
      Math.max(
        series.start_epoch,
        series.observed_since_epoch || series.start_epoch,
      ) * 1000;
  // Show at least one bin of width so a just-started history is readable; the area before the first
  // sample stays empty. Each bin is placed at the middle of the part it actually covers
  // (clipped to [first sample, end]), so nothing is drawn before the first observation or off the plot.
  const start = Math.max(
    series.start_epoch * 1000,
    Math.min(since, end - step),
  );
  const all = series.points
    .map((p) => {
      const from = Math.max(p.epoch * 1000, since),
        to = Math.min(p.epoch * 1000 + step, end);
      return {
        time: (from + to) / 2,
        from,
        to,
        covered: to > from,
        value: p.latency_median_ms,
        loss: p.loss_max_percent,
        jitter: p.jitter_median_ms,
        dns: p.dns_median_ms,
        n: p.valid_count,
        samples: p.sample_count,
      };
    })
    .filter((p) => p.covered);
  const points = all.filter((p) => p.value != null && Number.isFinite(p.value));
  const axis = niceAxis(Math.max(20, ...points.map((p) => p.value * 1.15))),
    max = axis.max;
  const f = frame(width, height, start, end, max, true);
  const segments = [];
  let segment = [];
  all.forEach((p) => {
    if (p.value == null || !Number.isFinite(p.value)) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push(p);
  });
  if (segment.length) segments.push(segment);
  for (const p of points) {
    p.x = f.x(p.time);
    p.y = f.y(p.value);
  }
  // Loss bars span the covered part of their bin; a minimum visible width is kept inside the plot.
  const right = width - pad.right;
  const rail = all
    .filter((p) => p.loss > 0)
    .map((p) => {
      const w = Math.max(1.5, f.x(p.to) - f.x(p.from) - 0.5);
      return {
        ...p,
        x: f.x(p.time),
        x0: Math.max(pad.left, Math.min(f.x(p.from), right - w)),
        w,
        h: Math.max(3, Math.min(14, p.loss * 4)),
      };
    });
  return {
    ...f,
    kind: 'quality',
    points,
    rail,
    segments,
    yTicks: axis.ticks,
    ticks: xTicks(start, end, width < 420 ? 3 : 6),
  };
}
function chartItems(g) {
  return [
    ...g.points,
    ...(g.kind === 'speed' ? g.rail.map((r) => ({ ...r, failed: true })) : []),
  ].sort((a, b) => a.time - b.time);
}
module.exports = {
  niceAxis,
  speedGeometry,
  qualityGeometry,
  chartItems,
  niceMax,
  median,
  maxPoints,
};
