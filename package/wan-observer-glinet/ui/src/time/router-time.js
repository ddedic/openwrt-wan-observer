// Display time model. Router time is used only when the router reports a valid IANA zone, because
// Intl can then apply historical DST rules. A fixed current offset alone cannot do that, so the UI
// falls back to UTC and says so. CSV exports always stay in UTC.
function validZone(zone) {
  if (
    typeof zone !== 'string' ||
    !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$|^UTC$/.test(zone)
  ) {
    return null;
  }
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}
function timeModel(payload, now = Date.now()) {
  const readiness = (payload && payload.readiness) || {};
  const router = readiness.router_timezone || {};
  const reported =
    (payload && payload.collector && payload.collector.router_timezone) || {};
  const zone = validZone(router.zonename);
  const timeZone = zone || 'UTC';
  const part = (time, options) =>
    new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).format(
      new Date(time),
    );
  const short = (time) => {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone,
        timeZoneName: 'short',
      })
        .formatToParts(new Date(time))
        .find((p) => p.type === 'timeZoneName').value;
    } catch {
      return 'UTC';
    }
  };
  const routerTimeLabel = () => {
    if (zone) {
      if (
        typeof reported.label === 'string' &&
        reported.label !== 'router' &&
        /^[A-Za-z0-9+:-]{1,8}$/.test(reported.label)
      ) {
        return reported.label;
      }
      return short(now);
    }
    return 'UTC';
  };
  const label = routerTimeLabel();
  const clock = (time) =>
    part(time, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const day = (time) =>
    part(time, { weekday: 'short', day: 'numeric', month: 'short' });
  const date = (time) => part(time, { day: 'numeric', month: 'short' });
  const ymd = (time) => {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(time));

    return p;
  };

  return {
    zone,
    router: !!zone,
    label,
    clock,
    day,
    date,
    ymd,
    stamp: (time) => `${day(time)}, ${clock(time)}`,
    // Only offered as context for the settings hint; never used to shift historical times.
    offset:
      typeof reported.utc_offset === 'string' &&
      /^[+-]\d{2}:?\d{2}$/.test(reported.utc_offset)
        ? reported.utc_offset
        : null,
  };
}
module.exports = { timeModel, validZone };
