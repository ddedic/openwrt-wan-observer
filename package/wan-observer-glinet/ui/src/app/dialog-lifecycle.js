function showDialog(value) {
  if (!value) return;
  this.$nextTick(() => {
    const dialog = this.$refs.dialog;
    if (!dialog) return;
    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute('open', '');
      }
    }
    const target =
      this.focusTarget && dialog.querySelector('#wo-f-' + this.focusTarget);
    const first =
      target ||
      dialog.querySelector(
        'input:not([disabled]),select,button:not([disabled])',
      );
    if (first) first.focus();
  });
}
function closeDialog(force) {
  if (this.sheet === 'settings' && !force && this.dirty) {
    this.confirmDiscard = true;
    return;
  }
  const dialog = this.$refs && this.$refs.dialog;
  if (dialog && dialog.open && dialog.close) dialog.close();
  this.sheet = '';
  this.confirmDiscard = false;
  const opener = this.opener;
  this.opener = null;
  if (opener && opener.focus && this.$nextTick)
    this.$nextTick(() => {
      if (opener.isConnected !== false) opener.focus();
    });
}
module.exports = { showDialog, closeDialog };
