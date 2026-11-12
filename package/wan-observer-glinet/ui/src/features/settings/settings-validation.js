/**
 * Validate edited settings; preserve untouched CLI budgets outside UI entry bounds.
 * Field names and messages are part of the existing form contract.
 * @param {object} form
 * @param {object} initial
 * @returns {Record<string, string>} Errors keyed by the existing protocol fields.
 */
function validateSettings(form, initial = {}) {
  const errors = {};
  const whole = (value, min, max) => {
    const number = Number(value);

    return (
      String(value).trim() !== '' &&
      Number.isInteger(number) &&
      number >= min &&
      number <= max
    );
  };

  if (
    form.mode === 'custom' &&
    Number(form.start_hour) === Number(form.end_hour)
  ) {
    errors.end_hour = 'Start and end must differ. Choose All day for 24 hours.';
  }

  for (const key of ['download_mbps', 'upload_mbps']) {
    if (!whole(form[key], 1, 100000)) {
      errors[key] = 'Enter a whole number from 1 to 100000 Mbps.';
    }
  }

  if (
    form.threshold_percent !== undefined &&
    !whole(form.threshold_percent, 1, 100)
  ) {
    errors.threshold_percent = 'Enter a percentage from 1 to 100.';
  }

  if (
    form.limit_gb !== undefined &&
    String(form.limit_gb).trim() !== '' &&
    String(form.limit_gb).trim() !== String(initial.limit_gb ?? '').trim()
  ) {
    const number = Number(form.limit_gb);

    if (!Number.isFinite(number) || number < 1) {
      errors.limit_gb = 'Enter 1 GB or more, or leave empty for no limit.';
    } else if (!Number.isInteger(number) || number > 10000) {
      errors.limit_gb = 'Use a whole number up to 10000 GB.';
    }
  }

  return errors;
}

module.exports = { validateSettings };
