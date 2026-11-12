const { DialogFrame } = require('../../../components/dialog-frame/DialogFrame');
const {
  pad,
  every,
  INTERVALS: intervals,
} = require('../../../scheduling/schedule-format');
const { supports } = require('../../../collector/collector-contract');
const { mb } = require('../../../measurements/format-measurements');
const {
  measuredTestBytes,
  exampleMbPerTest,
  usageEstimate,
} = require('../../../measurements/report-data');
/** Form is the owning settings workflow's reactive object; other changes use callbacks. */
/** @param {import('./SettingsDialog.types').SettingsDialogProps} vm */
function SettingsDialog(vm, h, button, t) {
  const id = (key) => `wo-f-${key}`;
  const shell = (label, children, actions) =>
    DialogFrame(h, { label, children, actions, onClose: vm.close });

  const f = vm.form,
    c = vm.config,
    errors = vm.fieldErrors;
  const described = (key, hint) =>
    [hint ? id(key) + '-hint' : '', errors[key] ? id(key) + '-err' : '']
      .filter(Boolean)
      .join(' ') || null;
  const field = (key, label, control, hint) =>
    h('div', { class: ['wo-field', { 'is-invalid': !!errors[key] }] }, [
      h('div', { class: 'wo-field-row' }, [
        h('div', { class: 'wo-field-text' }, [
          h('label', { attrs: { for: id(key) } }, label),
          hint ? h('small', { attrs: { id: id(key) + '-hint' } }, hint) : null,
        ]),
        control,
      ]),
      errors[key]
        ? h(
            'p',
            { class: 'wo-field-error', attrs: { id: id(key) + '-err' } },
            errors[key],
          )
        : null,
    ]);
  const blur = (key) => () => {
    vm.touch(key);
  };
  const number = (key, { suffix, placeholder, hint } = {}) =>
    h('span', { class: 'wo-input' }, [
      h('input', {
        attrs: {
          id: id(key),
          type: 'text',
          inputmode: 'numeric',
          autocomplete: 'off',
          placeholder: placeholder || null,
          'aria-invalid': errors[key] ? 'true' : null,
          'aria-describedby': described(key, hint),
        },
        domProps: { value: f[key] },
        on: {
          input: (e) => {
            f[key] = e.target.value;
          },
          blur: blur(key),
        },
      }),
      suffix
        ? h(
            'span',
            { class: 'wo-suffix', attrs: { 'aria-hidden': 'true' } },
            suffix,
          )
        : null,
    ]);
  const toggle = (key, hint) =>
    h('input', {
      class: 'wo-switch',
      attrs: {
        id: id(key),
        type: 'checkbox',
        role: 'switch',
        'aria-describedby': described(key, hint),
      },
      domProps: { checked: !!f[key] },
      on: {
        change: (e) => {
          f[key] = e.target.checked;
        },
      },
    });
  const select = (key, options, { hint, label } = {}) =>
    h(
      'select',
      {
        attrs: {
          id: id(key),
          'aria-describedby': described(key, hint),
          'aria-label': label || null,
          'aria-invalid': errors[key] ? 'true' : null,
        },
        on: {
          change: (e) => {
            f[key] = /^\d+$/.test(e.target.value)
              ? Number(e.target.value)
              : e.target.value;
          },
          blur: blur(key),
        },
      },
      options.map(([value, text]) =>
        h(
          'option',
          {
            attrs: { value: String(value) },
            domProps: { selected: String(f[key]) === String(value) },
          },
          text,
        ),
      ),
    );
  const group = (title, children) =>
    h('fieldset', { class: 'wo-group' }, [h('legend', title), ...children]);
  const hoursList = Array.from({ length: 24 }, (_, i) => [i, `${pad(i)}:00`]);
  const overnight =
    f.mode === 'custom' && Number(f.start_hour) > Number(f.end_hour);
  const zones = supports(c, 'window_timezone');
  const routerName = t.router ? `Router time (${t.label})` : 'Router time';
  const zoneHint =
    f.window_timezone === 'router'
      ? t.router
        ? t.zone
        : `Router zone not reported${t.offset ? `; router clock is UTC${t.offset} now` : ''}`
      : 'Hours in UTC';
  const measured = measuredTestBytes(vm.payload.measurements);
  const size = measured ? measured.bytes / 1e6 : exampleMbPerTest;
  const plan = {
    ...f,
    interval_minutes: Number(f.interval_minutes),
    start_hour: f.mode === 'all' ? 0 : Number(f.start_hour),
    end_hour: f.mode === 'all' ? 24 : Number(f.end_hour),
  };
  const u = usageEstimate(plan, size);
  const errorCount = Object.keys(errors).length;
  const segment = h(
    'div',
    {
      class: 'wo-seg',
      attrs: { role: 'group', 'aria-labelledby': 'wo-hours-label' },
    },
    [
      ['all', 'All day'],
      ['custom', 'Custom'],
    ].map(([v, label]) =>
      h(
        'button',
        {
          class: { 'is-on': f.mode === v },
          attrs: { type: 'button', 'aria-pressed': String(f.mode === v) },
          on: {
            click: () => {
              f.mode = v;
            },
          },
        },
        label,
      ),
    ),
  );
  return shell(
    'Testing settings',
    [
      group('Full speed tests', [
        field('enabled', 'Scheduled tests', toggle('enabled')),
        field(
          'interval_minutes',
          'Test every',
          select(
            'interval_minutes',
            intervals.map((m) => [m, every(m)]),
          ),
        ),
        h('div', { class: 'wo-field' }, [
          h('div', { class: 'wo-field-row' }, [
            h('div', { class: 'wo-field-text' }, [
              h('span', { attrs: { id: 'wo-hours-label' } }, 'Testing hours'),
            ]),
            segment,
          ]),
        ]),
        f.mode === 'custom'
          ? field(
              'end_hour',
              'From – to',
              h('span', { class: 'wo-pair-input' }, [
                select('start_hour', hoursList, { label: 'From' }),
                h('span', { attrs: { 'aria-hidden': 'true' } }, '–'),
                select('end_hour', [...hoursList.slice(1), [24, '24:00']], {
                  label: 'To',
                  hint: overnight,
                }),
              ]),
              overnight
                ? `Overnight: ends ${pad(f.end_hour)}:00 next day`
                : null,
            )
          : null,
        f.mode === 'custom' && zones
          ? field(
              'window_timezone',
              'Time zone',
              select(
                'window_timezone',
                [
                  ['router', routerName],
                  ['UTC', 'UTC'],
                ],
                { hint: zoneHint },
              ),
              zoneHint,
            )
          : null,
      ]),
      group('Data use', [
        h('div', { class: 'wo-field' }, [
          h('div', { class: 'wo-field-row' }, [
            h('div', { class: 'wo-field-text' }, [h('span', 'Data per test')]),
            h(
              'span',
              { class: 'wo-readout' },
              measured
                ? [
                    mb(measured.bytes),
                    h(
                      'small',
                      `measured, last ${measured.tests} ${measured.tests === 1 ? 'test' : 'tests'}`,
                    ),
                  ]
                : [
                    h('span', 'Not measured yet'),
                    h('small', `example ${exampleMbPerTest} MB`),
                  ],
            ),
          ]),
        ]),
        h(
          'p',
          { class: 'wo-usage', attrs: { 'aria-live': 'polite' } },
          u.tests
            ? [
                h(
                  'b',
                  `${u.tests} tests/day ≈ ${u.gbDay} GB/day · ≈ ${u.gbMonth} GB/month`,
                ),
                measured
                  ? ' at the measured size'
                  : ` at an example ${exampleMbPerTest} MB per test`,
                u.extras
                  ? ` · follow-ups can add up to ${u.extras} tests a day`
                  : '',
              ]
            : [
                h('b', 'No scheduled tests'),
                ' · Run Speedtest uses data only when pressed',
              ],
        ),
        supports(c, 'monthly_budget_bytes')
          ? field(
              'limit_gb',
              'Monthly data limit',
              number('limit_gb', {
                suffix: 'GB',
                placeholder: 'No limit',
                hint: true,
              }),
              'Leave empty for no limit. Stops new tests once known use reaches it; one test can go over.',
            )
          : null,
        field(
          'adaptive',
          'Follow-up tests',
          toggle('adaptive', true),
          'After a slow or failed test: up to 3, 5 min apart, max 24 a day',
        ),
      ]),
      supports(c, 'quality_history_enabled')
        ? group('Quality history', [
            field(
              'quality_history_enabled',
              'Quality history',
              toggle('quality_history_enabled', true),
              'Records GL Network Quality locally every minute · kept 30 days · no extra WAN tests',
            ),
            h(
              'p',
              { class: 'wo-muted wo-small' },
              "Shows latency, jitter and loss. It can't see a slowdown that affects only speed.",
            ),
          ])
        : null,
      group('Plan', [
        field(
          'download_mbps',
          'Plan download',
          number('download_mbps', { suffix: 'Mbps' }),
        ),
        field(
          'upload_mbps',
          'Plan upload',
          number('upload_mbps', { suffix: 'Mbps' }),
        ),
        supports(c, 'threshold_percent')
          ? field(
              'threshold_percent',
              'Slow below',
              number('threshold_percent', { suffix: '% of plan' }),
            )
          : null,
      ]),
    ],
    [
      vm.confirmDiscard
        ? h(
            'p',
            { class: 'wo-dialog-message', attrs: { role: 'alert' } },
            'Discard unsaved changes?',
          )
        : errorCount && vm.submitted
          ? h(
              'p',
              { class: 'wo-dialog-message is-error', attrs: { role: 'alert' } },
              `${errorCount} ${errorCount === 1 ? 'field needs' : 'fields need'} attention`,
            )
          : vm.saveError
            ? h(
                'p',
                {
                  class: 'wo-dialog-message is-error',
                  attrs: { role: 'alert' },
                },
                vm.saveError,
              )
            : null,
      ...(vm.confirmDiscard
        ? [
            button('Keep editing', {
              click: () => {
                vm.clearDiscard();
              },
            }),
            button('Discard', { type: 'primary', click: () => vm.close(true) }),
          ]
        : [
            button('Cancel', { click: () => vm.close() }),
            button('Save', {
              type: 'primary',
              loading: vm.saving,
              click: () => vm.save(),
            }),
          ]),
    ],
  );
}
module.exports = { SettingsDialog };
