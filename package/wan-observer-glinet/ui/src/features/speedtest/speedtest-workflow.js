const {
  POLL_MS: pollMs,
  POLL_LIMIT: pollLimit,
} = require('../../collector/collection-policy');
const { finite } = require('../../collector/collector-contract');
const {
  failureMessage,
  attemptRecord,
  mbps,
} = require('../../measurements/report-data');
function wait(ms, signal) {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        resolve();
      },
      { once: true },
    );
  });
}
function createSpeedtestWorkflow(api) {
  return {
    async runSpeedtest() {
      if (
        this.running ||
        !this.payload ||
        !this.payload.collector ||
        this.busy ||
        this.guarded
      )
        return;
      if (this.refreshRequest) await this.refreshRequest;
      if (
        this.disposed ||
        this.running ||
        !this.payload ||
        !this.payload.collector ||
        this.busy
      )
        return;
      const known = new Set(
        this.payload.collector.events
          .filter((e) => e.reason === 'manual')
          .map((e) => e.epoch),
      );
      this.running = true;
      this.notice = { kind: 'info', text: 'Starting speed test…' };
      try {
        await api(this.abort.signal, { action: 'run_speedtest' });
      } catch (error) {
        this.running = false;
        this.notice = { kind: 'error', text: error.message };
        return;
      }
      this.follow(known);
    },
    async follow(known) {
      if (this.refreshRequest) await this.refreshRequest;
      if (this.disposed) return;
      const started =
        this.payload &&
        this.payload.collector &&
        this.payload.collector.manual_started;
      this.running = true;
      this.notice = null;
      // Resume the elapsed count of a test started before this page loaded.
      this.startedAt =
        finite(started) && started > 1e9 && started * 1000 <= Date.now()
          ? started * 1000
          : Date.now();
      this.tick = Date.now();
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        this.tick = Date.now();
      }, 1000);
      let event,
        data = this.payload;
      for (let i = 0; i < pollLimit && !this.disposed; i++) {
        await wait(pollMs, this.abort.signal);
        if (this.disposed) return;
        try {
          const next = await api(
            this.abort.signal,
            null,
            `?period=${this.days}`,
          );
          if (this.disposed) return;
          if (!next.collector) continue;
          data = next;
        } catch {
          continue;
        }
        if (data.collector.busy) continue;
        event = data.collector.events
          .filter(
            (e) => e.reason === 'manual' && !(known || new Set()).has(e.epoch),
          )
          .at(-1);
        break;
      }
      clearInterval(this.timer);
      this.payload = data;
      this.version++;
      this.running = false;
      const t = this.time;
      if (!event) {
        this.notice = data.collector.busy
          ? {
              kind: 'info',
              text: 'The test is taking longer than expected. Refresh in a minute.',
            }
          : {
              kind: 'error',
              text: 'The test ended without a recorded result.',
            };
        return;
      }
      if (event.outcome === 'failed') {
        this.notice = {
          kind: 'error',
          text: `Speed test failed · ${t.clock(event.epoch * 1000)} · ${failureMessage(event.failure_code)}`,
        };
        return;
      }
      const match = attemptRecord(event, data.measurements);
      this.notice = {
        kind: event.outcome === 'healthy' ? 'ok' : 'warn',
        text: `Speed test complete: ${event.outcome === 'healthy' ? 'good' : 'slow'} · ${match ? `${mbps(match.download_mbps)} ↓ / ${mbps(match.upload_mbps)} ↑ Mbps` : 'result saved'} · ${t.clock(event.epoch * 1000)}`,
      };
    },
  };
}
module.exports = { createSpeedtestWorkflow };
