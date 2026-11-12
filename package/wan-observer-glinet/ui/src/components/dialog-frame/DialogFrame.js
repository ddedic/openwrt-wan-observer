/** Stateless VNode frame: onClose belongs to the page; ref stays on its h context. */
function DialogFrame(h, { label, children, actions, onClose }) {
  return h(
    'dialog',
    {
      ref: 'dialog',
      class: 'wo-dialog',
      attrs: { 'aria-labelledby': 'wo-dialog-title', 'aria-modal': 'true' },
      on: {
        cancel: (e) => {
          e.preventDefault();
          onClose();
        },
        keydown: (e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
            return;
          }
          // Keep Tab inside the dialog (APG modal pattern); the native modal alone lets focus reach browser chrome.
          if (e.key !== 'Tab') return;
          const items = [
            ...e.currentTarget.querySelectorAll(
              'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]',
            ),
          ].filter((el) => el.offsetParent !== null);
          if (!items.length) return;
          const first = items[0],
            last = items[items.length - 1],
            active = document.activeElement;
          if (
            e.shiftKey &&
            (active === first || !e.currentTarget.contains(active))
          ) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
          }
        },
        click: (e) => {
          if (e.target === e.currentTarget) onClose();
        },
      },
    },
    [
      h('div', { class: 'wo-dialog-box' }, [
        h(
          'h3',
          { class: 'wo-dialog-title', attrs: { id: 'wo-dialog-title' } },
          label,
        ),
        h('div', { class: 'wo-dialog-body' }, children),
        h('div', { class: 'wo-dialog-actions' }, actions),
      ]),
    ],
  );
}
module.exports = { DialogFrame };
