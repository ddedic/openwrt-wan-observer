const supports = (c, key) =>
  !!c && Object.prototype.hasOwnProperty.call(c, key);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
module.exports = { supports, finite };
