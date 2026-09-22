const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scopedSessions, groupProjects, machinesSummary, duplicateReport } = require('./scope');

function sess(id, { machine = null, key = 'workspace/app', ts = '2026-03-25T10:00:00Z', cost = 1, subs = 0 } = {}) {
  return {
    sessionId: id, machine, projectKey: key, projectName: key.split('/').pop(),
    firstTimestamp: Date.parse(ts), lastTimestamp: Date.parse(ts), subagentCount: subs,
    metrics: { totalInputTokens: 10, totalOutputTokens: 5, totalCacheReadTokens: 0, totalCacheWriteTokens: 0,
      totalCost: cost, totalDurationMs: 1000, turnCount: 1, toolCallCount: 0, messageCount: 1, tokensByModel: {} }
  };
}

describe('scopedSessions', () => {
  const all = [
    sess('1', { machine: 'a', key: 'workspace/app' }),
    sess('2', { machine: 'b', key: 'workspace/app' }),
    sess('3', { machine: 'a', key: 'workspace/other', ts: '2026-01-01T00:00:00Z' }),
    sess('3', { machine: 'b', key: 'workspace/other', ts: '2026-01-02T00:00:00Z' })
  ];
  it('dedupes by sessionId, crediting the local machine', () => {
    const out = scopedSessions(all, {}, 'b');
    assert.equal(out.length, 3);
    assert.equal(out.find(s => s.sessionId === '3').machine, 'b');
  });
  it('composes project, machine and range filters', () => {
    assert.deepEqual(scopedSessions(all, { project: 'workspace/app', machine: 'b' }).map(s => s.sessionId), ['2']);
    assert.deepEqual(scopedSessions(all, { from: '2026-03-01', to: '2026-03-31' }).map(s => s.sessionId).sort(), ['1', '2']);
  });
});

describe('duplicateReport', () => {
  it('returns [] when no sessionId is shared across machines', () => {
    assert.deepEqual(duplicateReport([sess('1', { machine: 'a' }), sess('2', { machine: 'b' })], 'a'), []);
  });

  it('counts shared sessions per shadowed machine, busiest first', () => {
    const sessions = [
      sess('1', { machine: 'stale' }), sess('1', { machine: 'live' }),
      sess('2', { machine: 'stale' }), sess('2', { machine: 'live' }),
      sess('3', { machine: 'other' }), sess('3', { machine: 'live' })
    ];
    assert.deepEqual(duplicateReport(sessions, 'live'), [
      { machine: 'stale', shadowedBy: 'live', sessionCount: 2 },
      { machine: 'other', shadowedBy: 'live', sessionCount: 1 }
    ]);
  });
});

describe('groupProjects', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-home-'));
  fs.mkdirSync(path.join(home, 'workspace', 'app'), { recursive: true });
  it('groups by key across machines, sorts by count, and resolves localPath', () => {
    const out = groupProjects([
      sess('1', { machine: 'a', key: 'workspace/app', cost: 2 }),
      sess('2', { machine: 'b', key: 'workspace/app', cost: 3 }),
      sess('3', { machine: 'a', key: 'workspace/other' })
    ], home);
    assert.equal(out.length, 2);
    assert.equal(out[0].key, 'workspace/app');
    assert.equal(out[0].name, 'app');
    assert.equal(out[0].sessionCount, 2);
    assert.equal(out[0].aggregate.totalCost, 5);
    assert.equal(out[0].localPath, path.join(home, 'workspace', 'app'));
    assert.equal(out[1].localPath, null);
  });
});

describe('machinesSummary', () => {
  it('returns [] when no session has a machine', () => {
    assert.deepEqual(machinesSummary([sess('1'), sess('2')]), []);
  });
  it('aggregates per machine sorted by name', () => {
    const out = machinesSummary([sess('1', { machine: 'zeta', subs: 2 }), sess('2', { machine: 'alpha' }), sess('3', { machine: 'zeta', cost: 4 })]);
    assert.deepEqual(out.map(m => m.machine), ['alpha', 'zeta']);
    assert.equal(out[1].sessionCount, 2);
    assert.equal(out[1].aggregate.totalCost, 5);
    assert.equal(out[1].aggregate.totalSubagentCount, 2);
  });
});
