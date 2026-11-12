const { jsPDF } = require('jspdf');

const {
  quantile,
  labels,
  stamp,
  dayMs,
} = require('../../measurements/report-data');
const colors = { ok: '#2e9e5b', sp: '#d99a1e', cn: '#d64545', na: '#c9ced6' };
const ink = '#1d232b',
  muted = '#5b6470',
  rule = '#e1e4e8';
const n = (v) => (v == null ? '-' : v.toFixed(1));
const diagnostic = (v) => (v == null ? 'missing' : String(v));

function createPDF(report, appendix = false) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const { config, counts, selected, rows, completed } = report;
  function text(value, x, y, size = 9, color = ink, bold = false) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(color);
    doc.text(String(value), x, y);
  }
  function rect(x, y, w, h, color) {
    doc.setFillColor(color);
    doc.rect(x, y, w, h, 'F');
  }
  function line(x, y, x2, y2, color = rule) {
    doc.setDrawColor(color);
    doc.line(x, y, x2, y2);
  }
  function header() {
    text('WAN Quality Report', 15, 21, 15, ink, true);
    text('Router | Sampled speed tests', 15, 27, 9, muted);
    text(stamp(report.start), 148, 20, 8, muted);
    text(stamp(report.now), 148, 25, 8, muted);
    line(15, 31, 195, 31, ink);
  }
  header();
  text('Summary', 15, 42, 11, ink, true);
  rect(15, 46, 180, 17, '#faf6ee');
  const headlineColor = () => {
    if (counts.cn) {
      return colors.cn;
    }
    if (counts.sp) {
      return colors.sp;
    }
    return colors.ok;
  };
  rect(15, 46, 1.5, 17, headlineColor());
  text(report.headline, 20, 53, 12, ink, true);
  text(
    `${selected.length} observed tests. The connection between tests was not measured.`,
    20,
    59,
    8.5,
    muted,
  );
  [
    [selected.length, 'Tests run'],
    [counts.ok, 'Passed'],
    [counts.sp, 'Slow'],
    [counts.cn, 'Failed'],
    [counts.na, 'Empty sample bins'],
  ].forEach(([value, label], i) => {
    const x = 15 + i * 36.5;
    rect(x, 68, 34, 16, '#f3f4f6');
    text(value, x + 3, 75, 14, ink, true);
    text(label, x + 3, 81, 8, muted);
  });
  text('Test results by time of day (UTC)', 15, 95, 11, ink, true);
  const height = Math.min(4.6, 42 / rows.length);
  const cellWidth = 153 / rows[0].cells.length;
  const showEvery = Math.ceil(rows.length / 9);
  rows.forEach((row, i) => {
    if (i % showEvery === 0) {
      text(
        new Date(row.day).toISOString().slice(5, 10),
        15,
        101 + i * height,
        7,
        muted,
      );
    }
    row.cells.forEach(
      (cell, j) =>
        !cell.future &&
        !cell.outside &&
        rect(
          42 + j * cellWidth,
          98 + i * height,
          cellWidth - 0.25,
          height - 0.2,
          colors[cell.state],
        ),
    );
  });
  const legendY = 102 + height * rows.length;
  Object.keys(colors).forEach((key, i) => {
    rect(15 + i * 43, legendY - 2.6, 2.6, 2.6, colors[key]);
    text(labels[key], 19 + i * 43, legendY, 8, muted);
  });
  let y = legendY + 12;
  text('Speed compared with plan', 15, y, 11, ink, true);
  for (const [key, title, plan] of [
    ['down', 'Download', config.download_mbps],
    ['up', 'Upload', config.upload_mbps],
  ]) {
    y += 9;
    const values = completed.map((test) => test[key]);
    const med = quantile(values, 0.5),
      low = quantile(values, 0.1),
      high = quantile(values, 0.9);
    const scale = 94 / Math.max(plan * 1.2, high || 0);
    text(title, 15, y + 2, 8);
    rect(53, y - 2, 94, 4, '#eef0f3');
    if (med !== null) {
      rect(
        53 + low * scale,
        y - 1,
        Math.max(0.5, (high - low) * scale),
        2,
        '#a9d9bc',
      );
      line(53 + med * scale, y - 2.5, 53 + med * scale, y + 2.5, colors.ok);
    }
    line(53 + plan * scale, y - 3, 53 + plan * scale, y + 3, ink);
    text(`${n(med)} / ${plan} Mbps`, 153, y + 2, 8);
  }
  y += 8;
  text(
    'Median marker, 10th-90th percentile band and configured plan line.',
    15,
    y,
    8,
    muted,
  );
  y += 11;
  text('Daily median speed', 15, y, 11, ink, true);
  const chron = [...rows].reverse();
  for (const [index, key, title, plan] of [
    [0, 'down', 'Download', config.download_mbps],
    [1, 'up', 'Upload', config.upload_mbps],
  ]) {
    const x = 15 + index * 92,
      top = y + 9,
      w = 85,
      h = 28;
    const series = chron.map((row) =>
      quantile(
        completed
          .filter((t) => t.time >= row.day && t.time < row.day + dayMs)
          .map((t) => t[key]),
        0.5,
      ),
    );
    const max = Math.max(plan, ...series) * 1.15;
    const yp = (v) => top + h - (v / max) * h;
    text(`${title} (Mbps)`, x, top - 2, 8, muted);
    line(x, top + h, x + w, top + h);
    doc.setLineDashPattern([1, 1], 0);
    line(x, yp(plan), x + w, yp(plan), muted);
    doc.setLineDashPattern([], 0);
    let prev = null;
    series.forEach((v, i) => {
      if (v === null) {
        prev = null;
        return;
      }
      const px = x + 2 + (i * (w - 4)) / Math.max(1, series.length - 1),
        py = yp(v);
      if (prev) {
        line(prev[0], prev[1], px, py, '#2e6fd6');
      }
      rect(px - 0.45, py - 0.45, 0.9, 0.9, '#2e6fd6');
      prev = [px, py];
    });
    text(
      new Date(chron[0].day).toISOString().slice(5, 10),
      x,
      top + h + 4,
      7,
      muted,
    );
    text(
      new Date(chron.at(-1).day).toISOString().slice(5, 10),
      x + w - 9,
      top + h + 4,
      7,
      muted,
    );
  }
  function nextPage(title) {
    doc.addPage();
    header();
    text(title, 15, 42, 11, ink, true);
    return 50;
  }
  y = nextPage('Observed incidents and methodology');
  function tableHead(cols) {
    rect(15, y - 4, 180, 7, '#eef0f3');
    for (const [label, x] of cols) {
      text(label, x, y, 8, ink, true);
    }
    y += 8;
  }
  const incidentColumns = [
    ['First observed', 17],
    ['Results', 64],
    ['Later passing test', 120],
  ];
  tableHead(incidentColumns);
  if (!report.incidents.length) {
    text('No slow or failed tests recorded in this period.', 17, y);
    y += 9;
  }
  for (const incident of report.incidents) {
    if (y > 258) {
      y = nextPage('Observed incidents (continued)');
      tableHead(incidentColumns);
    }
    const slow = incident.tests.filter((test) => test.state === 'sp').length;
    text(stamp(incident.tests[0].time), 17, y, 8);
    text(`${slow} slow, ${incident.tests.length - slow} failed`, 64, y, 8);
    text(
      incident.recovered ? stamp(incident.recovered) : 'None observed',
      120,
      y,
      8,
    );
    line(15, y + 2, 195, y + 2);
    y += 7;
  }
  if (y > 235) {
    y = nextPage('Methodology');
  } else {
    y += 6;
    text('Methodology and limits', 15, y, 11, ink, true);
    y += 7;
  }
  const coverage = report.coverage || { complete: false, since: null };
  const history = coverage.complete
    ? 'Retained attempt history covers this period.'
    : `Attempt history is incomplete or unknown for this period${coverage.since ? '; complete since ' + stamp(coverage.since) : ''}. No complete-period pass rate can be inferred.`;
  const methodology = `${history} Current plan baseline: ${config.download_mbps} Mbps down and ${config.upload_mbps} Mbps up. A completed result is flagged below ${config.threshold_percent}% in either direction. The report applies the current comparison settings to retained samples. Failed attempts have no speed value and do not establish a cause. Gaps and recovery times describe observations only. Empty time slots are not missed scheduled tests: historical schedules are not retained. Blank cells are future or outside the reporting period. Concurrent traffic and router load were not measured. This report provides diagnostic evidence, without regulatory certification.`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const row of doc.splitTextToSize(methodology, 176)) {
    if (y > 265) {
      y = nextPage('Methodology (continued)');
    }
    text(row, 15, y, 9, muted);
    y += 4.5;
  }
  if (appendix) {
    const detail = [
      ['Time (UTC)', 17],
      ['Result', 64],
      ['Down Mbps', 97],
      ['Up Mbps', 126],
      ['Idle ms', 153],
      ['Server', 177],
    ];
    y = nextPage('Appendix | Recorded tests');
    tableHead(detail);
    for (const test of [...selected].reverse()) {
      if (y > 248) {
        y = nextPage('Appendix | Recorded tests (continued)');
        tableHead(detail);
      }
      [
        stamp(test.time).slice(0, 16),
        labels[test.state],
        n(test.down),
        n(test.up),
        n(test.latency),
        test.server ?? '-',
      ].forEach((v, i) => text(v, detail[i][1], y, 8));
      y += 4;
      const details =
        'Jitter: ' +
        diagnostic(test.jitter) +
        ' ms | Loaded down: ' +
        diagnostic(test.loadedDown) +
        ' ms | Loaded up: ' +
        diagnostic(test.loadedUp) +
        ' ms | Loss: ' +
        diagnostic(test.loss) +
        '%';
      for (const row of doc.splitTextToSize(details, 176)) {
        text(row, 17, y, 7, muted);
        y += 3.5;
      }
      const extra =
        'Downloaded: ' +
        diagnostic(test.downloadBytes) +
        ' bytes | Uploaded: ' +
        diagnostic(test.uploadBytes) +
        ' bytes | Failure category: ' +
        diagnostic(test.failureCode) +
        (test.attemptFinalized === false ? ' | Finalization: unresolved' : '');
      for (const row of doc.splitTextToSize(extra, 176)) {
        text(row, 17, y, 7, muted);
        y += 3.5;
      }
      line(15, y, 195, y);
      y += 4;
    }
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    line(15, 279, 195, 279);
    text('WAN Observer | ' + stamp(Date.now()), 15, 284, 7.5, muted);
    text(`Page ${page} / ${pages}`, 174, 284, 7.5, muted);
  }
  return doc;
}
module.exports = { createPDF };
