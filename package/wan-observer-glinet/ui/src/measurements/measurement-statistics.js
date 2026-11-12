function quantile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) {
    return null;
  }
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);

  return (
    sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower)
  );
}
module.exports = { quantile };
