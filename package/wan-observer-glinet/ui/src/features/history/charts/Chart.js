const { CHART_PADDING: pad } = require('./chart-layout');
const { chartItems } = require('./chart-geometry');
function nearest(points, x) {
  let best = -1,
    distance = Infinity;
  points.forEach((p, i) => {
    const d = Math.abs(p.x - x);
    if (d < distance) {
      distance = d;
      best = i;
    }
  });
  return best;
}
function Chart(h, g, { label, active, format, onPick }) {
  const items = chartItems(g);
  const current = active >= 0 && active < items.length ? items[active] : null;
  const line = (pts) =>
    pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const children = [];
  g.yTicks.forEach((v) => {
    children.push(
      h('line', {
        attrs: {
          x1: pad.left,
          x2: g.width - pad.right,
          y1: g.y(v),
          y2: g.y(v),
          class: 'wo-grid',
        },
      }),
    );
    children.push(
      h(
        'text',
        { attrs: { x: pad.left - 6, y: g.y(v) + 4, 'text-anchor': 'end' } },
        format.y(v),
      ),
    );
  });
  g.ticks.forEach((t) =>
    children.push(
      h(
        'text',
        { attrs: { x: g.x(t), y: g.labelY, 'text-anchor': 'middle' } },
        format.x(t),
      ),
    ),
  );
  if (g.kind === 'speed')
    children.push(
      h('line', {
        attrs: {
          x1: pad.left,
          x2: g.width - pad.right,
          y1: g.planY,
          y2: g.planY,
          class: 'wo-plan-line',
        },
      }),
    );
  g.segments.forEach((s) =>
    children.push(
      h('polyline', { attrs: { points: line(s), class: 'wo-series' } }),
    ),
  );
  if (g.kind === 'speed') {
    g.points
      .filter((p) => !g.aggregated || p.state === 'sp')
      .forEach((p) =>
        children.push(
          p.state === 'sp'
            ? h('rect', {
                attrs: {
                  x: p.x - 4,
                  y: p.markY - 4,
                  width: 8,
                  height: 8,
                  class: 'wo-pt is-sp',
                },
              })
            : h('circle', {
                attrs: { cx: p.x, cy: p.y, r: 3.5, class: 'wo-pt' },
              }),
        ),
      );
    g.rail.forEach((p) =>
      children.push(
        h('rect', {
          attrs: {
            x: p.x - 4,
            y: g.railY - 4,
            width: 8,
            height: 8,
            transform: `rotate(45 ${p.x} ${g.railY})`,
            class: 'wo-pt is-cn',
          },
        }),
      ),
    );
  } else {
    g.rail.forEach((p) =>
      children.push(
        h('rect', {
          attrs: {
            x: p.x0,
            y: g.axisY + 2,
            width: p.w,
            height: p.h,
            class: 'wo-loss',
          },
        }),
      ),
    );
    // A lone interval has no line to join; mark it so the first sample is visible.
    g.segments
      .filter((s) => s.length === 1)
      .forEach(([p]) =>
        children.push(
          h('circle', { attrs: { cx: p.x, cy: p.y, r: 3.5, class: 'wo-pt' } }),
        ),
      );
  }
  if (current) {
    children.push(
      h('line', {
        attrs: {
          x1: current.x,
          x2: current.x,
          y1: pad.top,
          y2: g.railY + 5,
          class: 'wo-cursor',
        },
      }),
    );
    if (!current.failed)
      children.push(
        h('circle', {
          attrs: { cx: current.x, cy: current.y, r: 6, class: 'wo-focus-ring' },
        }),
      );
  }
  const pick = (event, index) => {
    event.preventDefault && event.preventDefault();
    onPick(Math.max(0, Math.min(items.length - 1, index)));
  };
  const fromPointer = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x =
      (((event.touches ? event.touches[0].clientX : event.clientX) - box.left) *
        g.width) /
      box.width;
    onPick(nearest(items, x));
  };
  return h(
    'svg',
    {
      class: 'wo-svg',
      attrs: {
        viewBox: `0 0 ${g.width} ${g.height}`,
        width: g.width,
        height: g.height,
        role: 'img',
        tabindex: items.length ? 0 : -1,
        'aria-label': label,
      },
      on: items.length
        ? {
            pointermove: fromPointer,
            pointerdown: fromPointer,
            touchstart: fromPointer,
            pointerleave: () => onPick(-1),
            blur: () => onPick(-1),
            focus: () => {
              if (active < 0) onPick(items.length - 1);
            },
            keydown: (event) => {
              const keys = {
                ArrowLeft: active - 1,
                ArrowRight: active + 1,
                Home: 0,
                End: items.length - 1,
              };
              if (event.key in keys)
                pick(event, active < 0 ? items.length - 1 : keys[event.key]);
              else if (event.key === 'Escape' && active >= 0) {
                event.stopPropagation();
                onPick(-1);
              }
            },
          }
        : {},
    },
    children,
  );
}
module.exports = { Chart };
