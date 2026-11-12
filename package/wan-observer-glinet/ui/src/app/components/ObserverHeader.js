const { BrandMark } = require('./BrandMark');
/** Resolved config/state and native-control/action callbacks; no page ownership. */
/** @param {import('./ObserverHeader.types').ObserverHeaderProps} vm */
function ObserverHeader(vm, h, button) {
  const c = vm.config;
  const mark = BrandMark(h);
  const title = h('div', { class: 'wo-brand' }, [
    mark,
    vm.native('gl-title')
      ? h('gl-title', { props: { title: 'WAN Observer' } })
      : h('h1', { class: 'wo-h1' }, 'WAN Observer'),
  ]);
  const head = h('div', { class: 'wo-head' }, [
    title,
    h(
      'div',
      { class: 'wo-head-actions' },
      c
        ? [
            h('label', { class: 'wo-switch-label' }, [
              h('span', 'Scheduled tests'),
              vm.native('gl-switch')
                ? h('gl-switch', {
                    props: { value: c.enabled, disabled: vm.saving },
                    on: {
                      input: vm.toggleSchedule,
                      change: vm.toggleSchedule,
                    },
                  })
                : h('input', {
                    class: 'wo-switch',
                    attrs: { type: 'checkbox', role: 'switch' },
                    domProps: { checked: c.enabled },
                    on: {
                      change: (e) => vm.toggleSchedule(e.target.checked),
                    },
                  }),
            ]),
            button('Settings', {
              plain: true,
              click: () => vm.openSettings(),
            }),
            button(vm.running ? 'Testing…' : 'Run Speedtest', {
              type: 'primary',
              loading: vm.running,
              disabled: (vm.busy || vm.guarded) && !vm.running,
              click: vm.runSpeedtest,
            }),
          ]
        : [],
    ),
  ]);

  return head;
}
module.exports = { ObserverHeader };
