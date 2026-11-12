const { reportData } = require('../measurements/report-data');
const { timeModel } = require('../time/router-time');
const {
  validateSettings,
} = require('../features/settings/settings-validation');
const { createRouterApi } = require('../infrastructure/router-api');
const {
  createHistoryWorkflow,
} = require('../features/history/history-workflow');
const {
  createSpeedtestWorkflow,
} = require('../features/speedtest/speedtest-workflow');
const {
  createSettingsWorkflow,
} = require('../features/settings/settings-workflow');
const { createExportWorkflow } = require('../features/reports/export-workflow');
const { showDialog, closeDialog } = require('./dialog-lifecycle');
const { renderPage } = require('./render-page');
function createWanObserverPage(css) {
  const api = createRouterApi({
    fetch: (...args) => fetch(...args),
    getCookie: (name) =>
      typeof window.$getCookie === 'function' && window.$getCookie(name),
  });

  return {
    name: 'wan-observer',
    data: () => ({
      payload: null,
      error: '',
      days: 7,
      loading: false,
      running: false,
      notice: null,
      version: 0,
      showAll: false,
      issuesOnly: false,
      startedAt: 0,
      tick: 0,
      sheet: '',
      form: null,
      saveError: '',
      saving: false,
      appendix: false,
      exportError: '',
      touched: {},
      submitted: false,
      confirmDiscard: false,
      focusTarget: '',
      initialForm: '',
      active: { down: -1, up: -1, quality: -1 },
      widths: {},
    }),
    computed: {
      report() {
        return this.payload && this.payload.collector
          ? reportData(this.payload, this.days)
          : null;
      },
      config() {
        return (
          this.payload &&
          this.payload.collector &&
          this.payload.collector.config
        );
      },
      busy() {
        return !!(
          this.payload &&
          this.payload.collector &&
          this.payload.collector.busy
        );
      },
      time() {
        return timeModel(this.payload);
      },
      // A configured limit with reached or unknown accounting stops every new start in the collector.
      guarded() {
        const u =
          this.payload &&
          this.payload.collector &&
          this.payload.collector.usage;

        return (
          !!u && (u.budget_state === 'reached' || u.budget_state === 'unknown')
        );
      },
      fieldErrors() {
        if (!this.form) {
          return {};
        }
        const all = validateSettings(
          this.form,
          JSON.parse(this.initialForm || '{}'),
        );

        return Object.fromEntries(
          Object.entries(all).filter(
            ([k]) =>
              this.submitted ||
              this.touched[k] ||
              (k === 'end_hour' && this.touched.start_hour),
          ),
        );
      },
      dirty() {
        return !!this.form && JSON.stringify(this.form) !== this.initialForm;
      },
    },
    watch: { sheet: showDialog },
    created() {
      this.abort = new AbortController();
    },
    mounted() {
      if (!document.getElementById('wan-observer-style')) {
        const style = document.createElement('style');
        style.id = 'wan-observer-style';
        style.textContent = css;
        document.head.append(style);
      }
      this.visibility = () => {
        if (!document.hidden) {
          this.backgroundRefresh();
        }
      };
      document.addEventListener('visibilitychange', this.visibility);
      this.refreshTimer = setInterval(this.backgroundRefresh, 30000);
      if (typeof ResizeObserver === 'function') {
        this.resize = new ResizeObserver((entries) => {
          const next = { ...this.widths };
          let changed = false;
          for (const entry of entries) {
            const key = entry.target.dataset.chart,
              w = Math.floor(entry.contentRect.width);
            if (key && w > 0 && Math.abs((next[key] || 0) - w) > 2) {
              next[key] = w;
              changed = true;
            }
          }
          if (changed) {
            this.widths = next;
          }
        });
      }
      this.refresh();
    },
    updated() {
      if (!this.resize || !this.$el || !this.$el.querySelectorAll) {
        return;
      }
      for (const box of this.$el.querySelectorAll('[data-chart]')) {
        if (!box.woObserved) {
          box.woObserved = true;
          this.resize.observe(box);
        }
      }
    },
    beforeDestroy() {
      clearTimeout(this.busyRetry);
      clearInterval(this.refreshTimer);
      document.removeEventListener('visibilitychange', this.visibility);
      clearInterval(this.timer);
      if (this.resize) {
        this.resize.disconnect();
      }
      this.disposed = true;
      this.abort.abort();
    },
    methods: {
      native(name) {
        return !!(this.$options.components && this.$options.components[name]);
      },
      pick(key, index) {
        this.active = { ...this.active, [key]: index };
      },
      ...createHistoryWorkflow(api),
      ...createSpeedtestWorkflow(api),
      ...createSettingsWorkflow(api),
      ...createExportWorkflow(),
      close: closeDialog,
    },
    render: renderPage,
  };
}
module.exports = { createWanObserverPage };
