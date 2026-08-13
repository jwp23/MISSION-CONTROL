'use strict';
function toMs(ts) {
  if (typeof ts === 'number') return Number.isFinite(ts) ? ts : null;
  if (typeof ts === 'string') { const n = Date.parse(ts); return Number.isFinite(n) ? n : null; }
  return null;
}
function parseDay(s, endOfDay) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const n = Date.parse(s + (endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'));
  return Number.isFinite(n) ? n : null;
}
function parseRange(query) {
  return { from: parseDay(query.from, false), to: parseDay(query.to, true) };
}
function inRange(ts, range) {
  const n = toMs(ts);
  if (n === null) return false;
  if (range.from !== null && n < range.from) return false;
  if (range.to !== null && n > range.to) return false;
  return true;
}
function filterSessions(sessions, range) {
  if (range.from === null && range.to === null) return sessions;
  return sessions.filter((s) => inRange(s.firstTimestamp, range));
}
module.exports = { toMs, parseRange, inRange, filterSessions };
