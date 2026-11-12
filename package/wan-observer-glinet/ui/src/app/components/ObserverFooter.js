const { markGithub16 } = require('../assets/github-mark');
/** @param {import('./ObserverFooter.types').ObserverFooterProps} props */
function ObserverFooter(props, h) {
  const { repository, packageVersion } = props;
  const footer = h('footer', { class: 'wo-foot' }, [
    h('span', '© 2026 Danijel Dedic'),
    h('span', { attrs: { 'aria-hidden': 'true' } }, '·'),
    h(
      'a',
      {
        attrs: {
          href: repository,
          target: '_blank',
          rel: 'noopener noreferrer',
          referrerpolicy: 'no-referrer',
        },
      },
      [
        h(
          'svg',
          {
            attrs: {
              width: 16,
              height: 16,
              viewBox: '0 0 16 16',
              fill: 'currentColor',
              'aria-hidden': 'true',
              focusable: 'false',
            },
          },
          [h('path', { attrs: { d: markGithub16 } })],
        ),
        'Source on GitHub',
        h('span', { class: 'wo-vh' }, ' (opens in new tab)'),
      ],
    ),
    ...(/^\d+\.\d+\.\d+-\d+$/.test(packageVersion)
      ? [
          h('span', { attrs: { 'aria-hidden': 'true' } }, '·'),
          h(
            'a',
            {
              class: 'wo-version',
              attrs: {
                href: `${repository}/releases/tag/v${packageVersion.replace(/-\d+$/, '')}`,
                target: '_blank',
                rel: 'noopener noreferrer',
                referrerpolicy: 'no-referrer',
                title: `Installed package ${packageVersion}`,
              },
            },
            [
              `v${packageVersion.replace(/-\d+$/, '')}`,
              h(
                'span',
                { class: 'wo-vh' },
                ` installed, release notes (opens in new tab)`,
              ),
            ],
          ),
        ]
      : []),
  ]);

  return footer;
}
module.exports = { ObserverFooter };
