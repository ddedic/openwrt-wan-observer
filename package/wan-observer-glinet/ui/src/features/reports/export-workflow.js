const { createPDF } = require('./pdf-export');
function createExportWorkflow() {
  return {
    fileName() {
      const r = this.report;

      return `wan-observer-${r.days === 1 ? '24h' : r.days + 'd'}-${this.time.ymd(r.now)}`;
    },
    openExport() {
      this.exportError = '';
      this.focusTarget = '';
      this.opener = document.activeElement;
      this.sheet = 'export';
    },
    pdf() {
      try {
        createPDF(this.report, this.appendix).save(this.fileName() + '.pdf');
      } catch {
        this.exportError = 'PDF generation failed. Try again or download CSV.';
      }
    },
  };
}
module.exports = { createExportWorkflow };
