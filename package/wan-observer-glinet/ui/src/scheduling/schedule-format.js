const pad = (n) => String(n).padStart(2, '0');
const every = (m) =>
  m >= 60 ? `${m / 60} ${m === 60 ? 'hour' : 'hours'}` : `${m} minutes`;
const allDay = (c) => c.start_hour === 0 && c.end_hour === 24;
const zoneName = (c, t) =>
  c.window_timezone === 'router' ? (t.router ? t.label : 'router time') : 'UTC';
const hours = (c, t) =>
  allDay(c)
    ? 'all day'
    : `${pad(c.start_hour)}:00–${pad(c.end_hour)}:00 ${zoneName(c, t)}`;
const INTERVALS = [15, 30, 60, 120, 180, 240, 360, 720];
module.exports = { pad, every, allDay, hours, INTERVALS };
