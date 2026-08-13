const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseRange, inRange, filterSessions } = require('./timerange');

describe('parseRange', () => {
  it('parses from/to as UTC day bounds', () => {
    const r = parseRange({ from: '2026-04-01', to: '2026-04-30' });
    assert.equal(r.from, Date.parse('2026-04-01T00:00:00.000Z'));
    assert.equal(r.to, Date.parse('2026-04-30T23:59:59.999Z'));
  });
  it('missing or invalid params yield null bounds', () => {
    assert.deepEqual(parseRange({}), { from: null, to: null });
    assert.deepEqual(parseRange({ from: 'garbage' }), { from: null, to: null });
  });
});

describe('filterSessions', () => {
  const mk = (iso) => ({ firstTimestamp: Date.parse(iso) });
  const sessions = [mk('2026-03-15T12:00:00Z'), mk('2026-04-10T12:00:00Z'), mk('2026-05-01T12:00:00Z')];
  it('keeps only sessions inside the window', () => {
    const r = parseRange({ from: '2026-04-01', to: '2026-04-30' });
    assert.equal(filterSessions(sessions, r).length, 1);
  });
  it('open bounds pass everything and return the same array', () => {
    const r = parseRange({});
    assert.equal(filterSessions(sessions, r), sessions);
  });
  it('accepts ISO-string firstTimestamp', () => {
    const r = parseRange({ from: '2026-04-01' });
    assert.equal(filterSessions([{ firstTimestamp: '2026-04-10T00:00:00Z' }], r).length, 1);
  });
});
