const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Claude Desktop appends a sample here every few minutes and keeps 30 days
const PLAN_USAGE_FILE = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'plan-usage-history.json');

/**
 * The most recent rate-limit reading Claude Desktop recorded, as percent of
 * the five-hour (u.fh) and seven-day (u.sd) limits. Null when the app has
 * never recorded one or the file is unreadable.
 */
function readPlanUsage(filePath = PLAN_USAGE_FILE) {
  let history;
  try {
    history = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
  if (!Array.isArray(history?.samples)) return null;
  const latest = history.samples.findLast(hasReading);
  if (!latest) return null;
  return {
    sampledAt: latest.t,
    fiveHour: numberOrNull(latest.u.fh),
    sevenDay: numberOrNull(latest.u.sd)
  };
}

function hasReading(sample) {
  return typeof sample?.t === 'number'
    && (typeof sample.u?.fh === 'number' || typeof sample.u?.sd === 'number');
}

function numberOrNull(value) {
  return typeof value === 'number' ? value : null;
}

module.exports = { readPlanUsage, PLAN_USAGE_FILE };
