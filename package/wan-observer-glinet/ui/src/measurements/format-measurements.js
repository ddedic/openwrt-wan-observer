const mb = (bytes) => `${Math.round(bytes / 1e6)} MB`;
const gb = (bytes) => {
  const v = bytes / 1e9;

  return v >= 10 ? String(Math.round(v)) : String(+v.toFixed(1));
};
const ms = (v) => {
  if (v == null || !Number.isFinite(v)) {
    return '—';
  }
  if (v >= 10) {
    return String(Math.round(v));
  }
  return String(+v.toFixed(1));
};
const ago = (delta) => {
  const m = Math.round(delta / 60000);

  if (m < 60) {
    return `${m} min earlier`;
  }
  if (m < 2880) {
    return `${Math.round(m / 60)} ${Math.round(m / 60) === 1 ? 'hour' : 'hours'} earlier`;
  }
  return `${Math.round(m / 1440)} days earlier`;
};
module.exports = { mb, gb, ms, ago };
