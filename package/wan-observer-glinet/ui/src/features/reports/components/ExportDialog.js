const { DialogFrame } = require('../../../components/dialog-frame/DialogFrame');
const { csvContent } = require('../../../measurements/report-data');
const { download } = require('../../../infrastructure/browser-download');
/** @param {object} vm Resolved report, appendix/error state and explicit callbacks. */
/** @param {import('./ExportDialog.types').ExportDialogProps} vm */
function ExportDialog(vm, h, button, t) {
  const id = (key) => `wo-f-${key}`;
  const shell = (label, children, actions) =>
    DialogFrame(h, { label, children, actions, onClose: vm.close });

  const r = vm.report,
    period = r.days === 1 ? 'Last 24 hours' : `Last ${r.days} days`;

  return shell(
    'Export report',
    [
      h(
        'p',
        { class: 'wo-muted' },
        `${period} · ${t.stamp(r.start)} – ${t.stamp(r.now)} ${t.label}`,
      ),
      r.coverage.complete
        ? null
        : h(
            'p',
            { class: 'wo-note' },
            r.coverage.since
              ? `Complete attempt history starts ${t.stamp(r.coverage.since)}. Earlier failed tests may be missing, so the report marks the period as incomplete.`
              : 'Attempt history for this period is incomplete, so the report marks it as incomplete.',
          ),
      h('label', { class: 'wo-check wo-check--block' }, [
        h('input', {
          attrs: { type: 'checkbox', id: id('appendix') },
          domProps: { checked: vm.appendix },
          on: {
            change: (e) => {
              vm.setAppendix(e.target.checked);
            },
          },
        }),
        h('span', [
          h('b', 'Test appendix'),
          h(
            'small',
            'Every test: server, speeds, latency idle and under load, jitter, loss, data used, failure type',
          ),
        ]),
      ]),
      h(
        'p',
        { class: 'wo-muted wo-small' },
        `${vm.fileName()}.pdf · .csv (CSV times in UTC)`,
      ),
      vm.exportError
        ? h(
            'p',
            { class: 'wo-error', attrs: { role: 'alert' } },
            vm.exportError,
          )
        : null,
    ],
    [
      button('Close', { click: () => vm.close() }),
      button('Download CSV', {
        click: () =>
          download(
            vm.fileName() + '.csv',
            csvContent(r),
            'text/csv;charset=utf-8',
          ),
      }),
      button('Download PDF', { type: 'primary', click: vm.pdf }),
    ],
  );
}
module.exports = { ExportDialog };
