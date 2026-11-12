const stamp = (time) =>
  new Date(time).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const clock = (time) => new Date(time).toISOString().slice(11, 16);
const day = (time) =>
  new Date(time).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
const mbps = (value) => {
  if (value == null) {
    return '—';
  }
  if (value >= 100) {
    return value.toFixed(0);
  }
  return value.toFixed(1);
};
module.exports = { stamp, clock, day, mbps };
