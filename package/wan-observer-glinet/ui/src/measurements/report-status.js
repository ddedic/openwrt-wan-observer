// State order, presentation names and failure copy share the report's vocabulary.
const LABELS = {
  ok: 'Passed',
  sp: 'Slow',
  cn: 'Test failed',
  na: 'Not measured',
};
const SEVERITY = { na: 0, ok: 1, sp: 2, cn: 3 };
const NAMES = {
  ok: 'Good',
  sp: 'Slow',
  cn: 'Failed',
  na: 'No test recorded',
  fu: 'Upcoming',
};
const REASONS = {
  scheduled: 'Scheduled',
  degradation_followup: 'Follow-up',
  manual: 'Manual',
};
const FAILURE_TEXT = {
  timeout: 'Test timed out. Retry or check the test server.',
  execution_terminated: 'The test stopped before finishing.',
  interrupted: 'The test was interrupted before a result was saved.',
  backend_exit: 'The speed test program reported an error.',
  invalid_result: 'The test returned a result that could not be read.',
  storage_error:
    "The result couldn't be saved. Check free storage on the router.",
};
const FAILURE_SHORT = {
  timeout: 'Timed out',
  execution_terminated: 'Stopped',
  interrupted: 'Interrupted',
  backend_exit: 'Program error',
  invalid_result: 'Unreadable',
  storage_error: 'Not saved',
};
const failureMessage = (code) =>
  FAILURE_TEXT[code] || 'No result was recorded. The cause is unknown.';
module.exports = {
  labels: LABELS,
  severity: SEVERITY,
  names: NAMES,
  reasons: REASONS,
  failureShort: FAILURE_SHORT,
  failureMessage,
};
