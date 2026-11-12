function BrandMark(h) {
  return h(
    'svg',
    {
      class: 'wo-mark',
      attrs: {
        viewBox: '4 10.5 60 40',
        width: 45,
        height: 30,
        'aria-hidden': 'true',
        focusable: 'false',
      },
    },
    [
      h('path', {
        attrs: {
          d: 'M8 18 20 46 32 24 44 46 52 28',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 5.5,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        },
      }),
      h('circle', {
        attrs: { cx: 57, cy: 17, r: 5, fill: 'var(--wo-primary)' },
      }),
    ],
  );
}
module.exports = { BrandMark };
