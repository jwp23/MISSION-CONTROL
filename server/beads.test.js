const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseExport, countBeads } = require('./beads');
const { parseRange } = require('./timerange');

describe('parseExport', () => {
  it('parses JSONL and keeps issue records', () => {
    const out = parseExport('{"created_at":"2026-04-02T10:00:00Z","status":"open"}\n\n{"_type":"memory","created_at":"2026-04-03T00:00:00Z"}\nnot-json\n');
    assert.equal(out.length, 1);
  });
});

describe('countBeads', () => {
  const recs = [
    { created_at: '2026-04-02T10:00:00Z', closed_at: '2026-04-20T10:00:00Z', status: 'closed' },
    { created_at: '2026-04-05T10:00:00Z', closed_at: null, status: 'open' },
    { created_at: '2026-03-01T10:00:00Z', closed_at: '2026-04-11T10:00:00Z', status: 'closed' },
    { created_at: '2026-05-02T10:00:00Z', closed_at: '2026-05-03T10:00:00Z', status: 'closed' },
  ];
  it('counts created and closed within the window independently', () => {
    const r = parseRange({ from: '2026-04-01', to: '2026-04-30' });
    assert.deepEqual(countBeads(recs, r), { created: 2, closed: 2 });
  });
  it('open range counts everything', () => {
    assert.deepEqual(countBeads(recs, parseRange({})), { created: 4, closed: 3 });
  });
});
