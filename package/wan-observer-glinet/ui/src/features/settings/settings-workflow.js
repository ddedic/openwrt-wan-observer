const { finite, supports } = require('../../collector/collector-contract');
const { allDay, every } = require('../../scheduling/schedule-format');
const { gb } = require('../../measurements/format-measurements');
const { validateSettings } = require('./settings-validation');
const fieldOrder = [
  'end_hour',
  'limit_gb',
  'download_mbps',
  'upload_mbps',
  'threshold_percent',
];
function createSettingsWorkflow(api) {
  return {
    openSettings(enable, focus) {
      const c = this.config;
      if (!c) {
        return;
      }
      const budget =
        finite(c.monthly_budget_bytes) && c.monthly_budget_bytes > 0
          ? c.monthly_budget_bytes
          : 0;
      this.form = {
        enabled: enable === true ? true : c.enabled,
        adaptive: c.adaptive,
        interval_minutes: c.interval_minutes,
        mode: allDay(c) ? 'all' : 'custom',
        start_hour: allDay(c) ? 8 : c.start_hour,
        end_hour: allDay(c) ? 20 : c.end_hour,
        download_mbps: String(c.download_mbps),
        upload_mbps: String(c.upload_mbps),
        ...(supports(c, 'threshold_percent')
          ? { threshold_percent: String(c.threshold_percent) }
          : {}),
        // An all-day schedule has no time basis yet, so a new custom window defaults to router time when the zone is known;
        // an existing custom UTC window keeps UTC unless the user changes it.
        ...(supports(c, 'window_timezone')
          ? {
              window_timezone:
                c.window_timezone === 'router' ||
                (allDay(c) && this.time.router)
                  ? 'router'
                  : 'UTC',
            }
          : {}),
        ...(supports(c, 'monthly_budget_bytes')
          ? { limit_gb: budget ? gb(budget) : '' }
          : {}),
        ...(supports(c, 'quality_history_enabled')
          ? { quality_history_enabled: !!c.quality_history_enabled }
          : {}),
      };
      this.initialForm = JSON.stringify(this.form);
      this.touched = {};
      this.submitted = false;
      this.confirmDiscard = false;
      this.saveError = '';
      this.focusTarget = focus || '';
      this.opener =
        typeof document !== 'undefined' ? document.activeElement : null;
      this.sheet = 'settings';
    },
    toggleSchedule(value) {
      if (
        !this.config ||
        this.saving ||
        this.sheet ||
        value === this.config.enabled
      ) {
        this.$forceUpdate();
        return;
      }
      if (value) {
        this.openSettings(true);
        this.$forceUpdate();
        return;
      }
      this.save({ ...this.config, enabled: false });
    },
    patch(f) {
      const c = this.config || {},
        form = f === this.form;
      const start = form && f.mode === 'all' ? 0 : Number(f.start_hour),
        end = form && f.mode === 'all' ? 24 : Number(f.end_hour);
      const body = {
        enabled: !!f.enabled,
        adaptive: !!f.adaptive,
        interval_minutes: Number(f.interval_minutes),
        start_hour: start,
        end_hour: end,
        download_mbps: Number(f.download_mbps),
        upload_mbps: Number(f.upload_mbps),
      };
      if (!form) {
        return body;
      }
      const initial = JSON.parse(this.initialForm || '{}');
      if (
        f.threshold_percent !== undefined &&
        String(f.threshold_percent).trim() !== initial.threshold_percent
      ) {
        body.threshold_percent = Number(f.threshold_percent);
      }
      if (
        f.quality_history_enabled !== undefined &&
        f.quality_history_enabled !== initial.quality_history_enabled
      ) {
        body.quality_history_enabled = f.quality_history_enabled;
      }
      // The time basis is only sent when chosen for a custom window; a legacy UTC window never switches silently.
      if (
        f.window_timezone !== undefined &&
        f.mode === 'custom' &&
        f.window_timezone !==
          (c.window_timezone === 'router' ? 'router' : 'UTC')
      ) {
        body.window_timezone = f.window_timezone;
      }
      if (
        f.limit_gb !== undefined &&
        String(f.limit_gb).trim() !== String(initial.limit_gb).trim()
      ) {
        body.monthly_budget_bytes =
          String(f.limit_gb).trim() === '' ? 0 : Number(f.limit_gb) * 1e9;
      }
      return body;
    },
    async save(values) {
      const f = values || this.form;
      if (!values) {
        this.submitted = true;
        this.saveError = '';
        const errors = validateSettings(
            f,
            JSON.parse(this.initialForm || '{}'),
          ),
          first = fieldOrder.find((k) => errors[k]);
        if (first) {
          if (this.$nextTick) {
            this.$nextTick(() => {
              const el =
                this.$refs.dialog &&
                this.$refs.dialog.querySelector('#wo-f-' + first);
              if (el) {
                el.focus();
              }
            });
          }
          return;
        }
      }
      const patch = this.patch(f);
      if (patch.start_hour === patch.end_hour) {
        this.saveError = 'Start and end must differ.';
        return;
      }
      if (
        ![patch.download_mbps, patch.upload_mbps].every(
          (v) => Number.isInteger(v) && v >= 1 && v <= 100000,
        )
      ) {
        this.saveError =
          'Plan speeds must be whole numbers from 1 to 100000 Mbps.';
        return;
      }
      this.saving = true;
      try {
        if (this.refreshRequest) {
          await this.refreshRequest;
        }
        if (this.disposed) {
          return;
        }
        await api(this.abort.signal, patch);
        await this.refresh();
        if (!values) {
          this.close(true);
        }
        this.notice = {
          kind: 'ok',
          text: patch.enabled
            ? `Settings saved · full test every ${every(patch.interval_minutes)}`
            : 'Scheduled tests paused · Run Speedtest still works',
        };
      } catch (error) {
        if (values) {
          this.notice = { kind: 'error', text: error.message };
        } else {
          this.saveError = error.message;
        }
      } finally {
        this.saving = false;
      }
    },
  };
}
module.exports = { createSettingsWorkflow };
