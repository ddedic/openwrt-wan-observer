const mb = (bytes) => `${Math.round(bytes / 1e6)} MB`;
const gb = (bytes) => {
  const v = bytes / 1e9;
  return v >= 10 ? String(Math.round(v)) : String(+v.toFixed(1));
};
const ms = (v) =>
  v == null || !Number.isFinite(v)
    ? '—'
    : v >= 10
      ? String(Math.round(v))
      : String(+v.toFixed(1));
const ago = (delta) => {
  const m = Math.round(delta / 60000);
  return m < 60
    ? `${m} min earlier`
    : m < 2880
      ? `${Math.round(m / 60)} ${Math.round(m / 60) === 1 ? 'hour' : 'hours'} earlier`
      : `${Math.round(m / 1440)} days earlier`;
};
module.exports = { mb, gb, ms, ago };
