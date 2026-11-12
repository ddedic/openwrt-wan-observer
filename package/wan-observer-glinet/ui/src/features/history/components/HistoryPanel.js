const { finite, supports } = require('../../../collector/collector-contract');
const { mb, ms } = require('../../../measurements/format-measurements');
const {
  quantile,
  names,
  reasons,
  mbps,
  failureShort,
} = require('../../../measurements/report-data');
const {
  speedGeometry,
  qualityGeometry,
  chartItems,
} = require('../charts/chart-geometry');
const { Chart: renderChart } = require('../charts/Chart');
/** Read-only selected-period state and explicit toggle/selection/export callbacks. */
/** @param {import('./HistoryPanel.types').HistoryPanelProps} vm */
function HistoryPanel(vm, h, { card, button, chip }) {
  const r = vm.report,
    c = vm.config,
    t = vm.time;
  const qOn =
    supports(c, 'quality_history_enabled') &&
    c.quality_history_enabled === true;
  const quality = vm.payload.quality || {};
  const periodName = vm.days === 1 ? '24 hours' : `${vm.days} days`;
  const periods = h(
    'div',
    {
      class: 'wo-periods',
      attrs: { role: 'group', 'aria-label': 'History period' },
    },
    [
      [1, '24 hours'],
      [7, '7 days'],
      [30, '30 days'],
    ].map(([d, label]) =>
      h(
        'button',
        {
          class: { 'is-on': vm.days === d },
          attrs: { type: 'button', 'aria-pressed': String(vm.days === d) },
          on: { click: () => vm.setPeriod(d) },
        },
        label,
      ),
    ),
  );
  const counts = [
    ['ok', 'good'],
    ['sp', 'slow'],
    ['cn', 'failed'],
  ]
    .filter(([k]) => r.counts[k])
    .map(([k, w]) => chip(k, `${r.counts[k]} ${w}`));
  const toolbar = h('div', { class: 'wo-toolbar' }, [
    h('div', { class: 'wo-toolbar-title' }, [
      h('h2', { class: 'wo-h2' }, 'History'),
      h(
        'div',
        { class: 'wo-counts' },
        r.selected.length
          ? [
              h(
                'b',
                `${r.selected.length} ${r.selected.length === 1 ? 'test' : 'tests'}`,
              ),
              ...counts,
            ]
          : [
              h(
                'span',
                { class: 'wo-muted' },
                `No tests in the last ${periodName}`,
              ),
            ],
      ),
    ]),
    h('div', { class: 'wo-toolbar-actions' }, [
      periods,
      button('Export', {
        plain: true,
        disabled: !r.selected.length,
        click: vm.openExport,
      }),
    ]),
  ]);
  const caption = h(
    'p',
    { class: 'wo-since' },
    `${r.first && r.first > r.start ? `Recorded since ${t.stamp(r.first)} · ` : ''}Times are ${t.router ? `router time (${t.label})` : 'UTC'}`,
  );
  const axis = {
    x: (time) =>
      vm.days === 1 ? t.clock(time) : `${t.date(time)} ${t.clock(time)}`,
    y: (v) => String(Math.round(v)),
  };
  const key = (cls, text) =>
    h('span', { class: 'wo-key' }, [
      h('i', { class: cls, attrs: { 'aria-hidden': 'true' } }),
      text,
    ]);
  const selectionDescription = (kind, item) => {
    if (item) {
      if (kind === 'quality') {
        return `${t.stamp(item.time)} · median latency ${ms(item.value)} ms${finite(item.jitter) ? ` · jitter ${ms(item.jitter)} ms` : ''}${finite(item.loss) ? ` · loss up to ${+item.loss.toFixed(1)}%` : ''} · ${item.n} ${item.n === 1 ? 'sample' : 'samples'}`;
      }
      if (item.failed) {
        return `${t.stamp(item.time)} · Failed${item.n > 1 ? ` · ${item.n} tests` : ` · ${failureShort[item.failureCode] || 'no result'}`}`;
      }
      return `${t.stamp(item.time)} · ${mbps(item.value)} Mbps · ${item.n > 1 ? `median of ${item.n} tests${item.slow ? `, ${item.slow} slow (lowest ${mbps(item.low)} Mbps)` : ''}` : `${names[item.state]}${reasons[item.reason] ? ` · ${reasons[item.reason]}` : ''}`}`;
    }
    return '';
  };
  const detailLine = (kind, item) =>
    h(
      'p',
      { class: 'wo-chart-detail', attrs: { 'aria-live': 'polite' } },
      selectionDescription(kind, item),
    );
  const chart = (k, label) => {
    const median = quantile(
        r.completed.map((x) => x[k]),
        0.5,
      ),
      plan = k === 'down' ? c.download_mbps : c.upload_mbps;
    const g = speedGeometry(r, k, {
      width: vm.widths[k] || 560,
      first: r.first,
    });
    const items = chartItems(g),
      active = vm.active[k];
    const body =
      !g.points.length && !g.rail.length
        ? h('div', { class: 'wo-state' }, [
            h('p', 'No tests in this period.'),
            h(
              'p',
              { class: 'wo-muted' },
              'Choose a longer period or run a test.',
            ),
          ])
        : h('div', { class: 'wo-chart', attrs: { 'data-chart': k } }, [
            renderChart(h, g, {
              label: `${label} per test, ${t.stamp(g.start)} to ${t.stamp(g.end)}: ${r.completed.length} completed, ${r.counts.cn} failed${median == null ? '' : `, median ${mbps(median)} Mbps`}. Exact values are in the test list. Use arrow keys for details.`,
              active,
              format: axis,
              onPick: (i) => vm.pick(k, i),
            }),
            detailLine('speed', items[active]),
          ]);

    return card(
      label,
      [
        h('div', { class: 'wo-chart-head' }, [
          h(
            'div',
            { class: 'wo-value is-small' },
            median == null ? '—' : [mbps(median), h('small', ' Mbps median')],
          ),
          h(
            'div',
            { class: 'wo-label' },
            median == null
              ? `Plan ${plan} Mbps`
              : `${Math.round((median / plan) * 100)}% of ${plan} Mbps plan`,
          ),
        ]),
        body,
        h('div', { class: 'wo-chart-foot' }, [
          key('is-dot', 'Test'),
          key('is-sq', 'Slow'),
          key('is-dia', 'Failed'),
          key('is-plan', 'Plan'),
          h(
            'span',
            { class: 'wo-muted wo-push' },
            g.aggregated
              ? `Each point combines up to ${g.perPoint} tests; the list has every test`
              : 'Lines join tests; between tests is not measured',
          ),
        ]),
      ],
      'wo-chart-card',
    );
  };
  const series = quality.series;
  const qualityCard =
    qOn && series && Array.isArray(series.points) && series.points.length
      ? (() => {
          const g = qualityGeometry(series, {
            width: vm.widths.quality || 900,
          });
          const med = quantile(
              g.points.map((p) => p.value),
              0.5,
            ),
            jit = quantile(g.points.map((p) => p.jitter).filter(finite), 0.5);
          const losses = series.points
              .map((p) => p.loss_max_percent)
              .filter(finite),
            items = chartItems(g),
            active = vm.active.quality;

          return card(
            'Connection quality',
            [
              h('div', { class: 'wo-chart-head' }, [
                h(
                  'div',
                  { class: 'wo-value is-small' },
                  med == null
                    ? '—'
                    : [ms(med), h('small', ' ms median latency')],
                ),
                h(
                  'div',
                  { class: 'wo-label' },
                  [
                    finite(jit) ? `Jitter ${ms(jit)} ms` : '',
                    losses.length
                      ? `Loss up to ${+Math.max(...losses).toFixed(1)}%`
                      : '',
                    `${series.available_count || 0} samples`,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                ),
              ]),
              g.points.length
                ? h(
                    'div',
                    { class: 'wo-chart', attrs: { 'data-chart': 'quality' } },
                    [
                      renderChart(h, g, {
                        label: `Median latency and packet loss from GL Network Quality, ${series.available_count || 0} samples. Values per interval appear in the details line. Use arrow keys for details.`,
                        active,
                        format: axis,
                        onPick: (i) => vm.pick('quality', i),
                      }),
                      detailLine('quality', items[active]),
                    ],
                  )
                : h('div', { class: 'wo-state' }, [
                    h('p', 'No quality samples in this period yet.'),
                  ]),
              h('div', { class: 'wo-chart-foot' }, [
                key('is-line', 'Latency (ms)'),
                key('is-loss', 'Packet loss'),
                h(
                  'span',
                  { class: 'wo-muted wo-push' },
                  'Source: GL Network Quality · shows responsiveness, not speed',
                ),
              ]),
            ],
            'wo-quality',
          );
        })()
      : null;

  const pool = [...r.selected]
      .reverse()
      .filter((x) => !vm.issuesOnly || x.state !== 'ok'),
    shown = vm.showAll ? pool : pool.slice(0, 5);
  const bytes = (x) =>
    Number.isSafeInteger(x.downloadBytes) && Number.isSafeInteger(x.uploadBytes)
      ? mb(x.downloadBytes + x.uploadBytes)
      : '—';
  const lat = (x) => {
    const l = [x.loadedDown, x.loadedUp].filter(finite);

    return x.latency == null
      ? '—'
      : `${ms(x.latency)}${l.length ? ` / ${ms(Math.max(...l))}` : ''} ms`;
  };
  const result = (x) => [
    chip(x.state),
    x.state === 'cn'
      ? h(
          'small',
          { class: 'wo-sub' },
          failureShort[x.failureCode] || 'No result',
        )
      : null,
  ];
  const table = h('table', { class: 'wo-table' }, [
    h('thead', [
      h(
        'tr',
        [
          `Time (${t.label})`,
          'Result',
          'Download',
          'Upload',
          'Latency idle / load',
          'Data',
          'Type',
        ].map((x) => h('th', { attrs: { scope: 'col' } }, x)),
      ),
    ]),
    h(
      'tbody',
      shown.map((x) =>
        h('tr', { key: x.time + x.state }, [
          h('td', t.stamp(x.time)),
          h('td', result(x)),
          h('td', x.down == null ? '—' : `${mbps(x.down)} Mbps`),
          h('td', x.up == null ? '—' : `${mbps(x.up)} Mbps`),
          h('td', lat(x)),
          h('td', bytes(x)),
          h('td', { class: 'wo-muted' }, reasons[x.reason] || '—'),
        ]),
      ),
    ),
  ]);
  const testTransferDetail = (x) => {
    if (x.state === 'cn') {
      return ` · ${failureShort[x.failureCode] || 'No result'}`;
    }
    if (bytes(x) !== '—') {
      return ` · ${bytes(x)}`;
    }
    return '';
  };
  const list = h(
    'ul',
    { class: 'wo-list' },
    shown.map((x) =>
      h('li', { key: 'l' + x.time + x.state }, [
        h('span', [
          t.stamp(x.time),
          h(
            'small',
            [reasons[x.reason] || 'Unknown type', testTransferDetail(x)].join(
              '',
            ),
          ),
        ]),
        h('span', { class: 'wo-list-end' }, [
          chip(x.state),
          h(
            'small',
            x.down == null ? '—' : `${mbps(x.down)} ↓ · ${mbps(x.up)} ↑ Mbps`,
          ),
        ]),
      ]),
    ),
  );
  const tests = card(
    `Tests in the last ${periodName}`,
    [
      h('div', { class: 'wo-list-tools' }, [
        h('label', { class: 'wo-check' }, [
          h('input', {
            attrs: { type: 'checkbox' },
            domProps: { checked: vm.issuesOnly },
            on: {
              change: (e) => {
                vm.setIssuesOnly(e.target.checked);
              },
            },
          }),
          'Slow and failed only',
        ]),
      ]),
      pool.length
        ? h('div', { class: ['wo-table-wrap', { 'is-all': vm.showAll }] }, [
            table,
            list,
          ])
        : h('div', { class: 'wo-state' }, [
            h(
              'p',
              vm.issuesOnly
                ? 'No slow or failed tests in this period.'
                : 'No tests in this period.',
            ),
          ]),
      pool.length > 5
        ? h('div', { class: 'wo-more' }, [
            button(vm.showAll ? 'Show fewer' : `Show all ${pool.length}`, {
              plain: true,
              click: () => {
                vm.toggleShowAll();
              },
            }),
          ])
        : null,
    ],
    'wo-tests',
  );

  return h(
    'section',
    { class: 'wo-history', attrs: { 'aria-label': 'History' } },
    [
      toolbar,
      caption,
      qualityCard,
      h('div', { class: 'wo-pair' }, [
        chart('down', 'Download'),
        chart('up', 'Upload'),
      ]),
      tests,
    ],
  );
}
module.exports = { HistoryPanel };
