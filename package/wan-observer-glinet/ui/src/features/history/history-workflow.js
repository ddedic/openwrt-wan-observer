const {
  POLL_MS: pollMs,
  POLL_LIMIT: pollLimit,
} = require('../../collector/collection-policy');

function createHistoryWorkflow(api) {
  return {
    backgroundRefresh() {
      if (this.disposed || document.hidden || this.running || this.saving) {
        return;
      }
      return this.refresh();
    },
    refresh() {
      if (this.disposed) {
        return Promise.resolve();
      }
      if (this.refreshRequest) {
        return this.refreshRequest;
      }
      if (this.running) {
        return Promise.resolve();
      }
      clearTimeout(this.busyRetry);
      this.busyRetry = null;
      let retryBusy = false;
      this.loading = true;
      this.refreshRequest = (async () => {
        try {
          const payload = await api(
            this.abort.signal,
            null,
            `?period=${this.days}`,
          );
          if (this.disposed) {
            return;
          }
          this.payload = payload;
          this.version++;
          this.busyRefreshCount =
            payload.collector && payload.collector.busy
              ? (this.busyRefreshCount || 0) + 1
              : 0;
          retryBusy = !!(payload.collector && payload.collector.busy);
          this.error = payload.collector
            ? ''
            : 'WAN Observer setup required: configuration is missing or invalid. See the installation guide.';
          if (
            payload.collector &&
            payload.collector.manual_started &&
            !this.running
          ) {
            this.follow(null);
          }
        } catch (error) {
          if (!this.disposed) {
            this.error = error.message;
          }
        } finally {
          this.loading = false;
          this.refreshRequest = null;
          if (
            retryBusy &&
            !this.disposed &&
            !this.running &&
            !document.hidden &&
            this.busyRefreshCount < pollLimit
          ) {
            this.busyRetry = setTimeout(() => {
              clearTimeout(this.busyRetry);
              this.busyRetry = null;
              this.backgroundRefresh();
            }, pollMs);
          }
        }
      })();
      return this.refreshRequest;
    },
    setPeriod(days) {
      if (days === this.days) {
        return;
      }
      this.days = days;
      this.showAll = false;
      this.active = { down: -1, up: -1, quality: -1 };
      this.version++;
      // Quality series are period-specific; read again once any in-flight read settles.
      (this.refreshRequest || Promise.resolve()).then(() =>
        this.backgroundRefresh(),
      );
    },
  };
}
module.exports = { createHistoryWorkflow };
