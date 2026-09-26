const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pricing = require('./pricing');
const { calculateMessageCost } = require('./cost');

describe('date-aware message cost', () => {
  before(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cost-'));
    const seedPath = path.join(dir, 'seed.json');
    fs.writeFileSync(seedPath, JSON.stringify({ entries: [
      { effectiveFrom: '2025-01-01', prices: { 'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 } } },
      { effectiveFrom: '2026-09-01', prices: { 'claude-sonnet-5': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 } } },
    ]}));
    pricing.init({ historyPath: path.join(dir, 'history.json'), seedPath });
    pricing._setConfigForTest({});
  });
  it('prices a message at the rate in force on its date', () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    assert.equal(calculateMessageCost(usage, 'claude-sonnet-5', Date.parse('2026-08-01')), 2);
    assert.equal(calculateMessageCost(usage, 'claude-sonnet-5', Date.parse('2026-10-01')), 3);
  });
  it('omitted timestamp uses latest prices', () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    assert.equal(calculateMessageCost(usage, 'claude-sonnet-5'), 3);
  });

  describe('cache writes by TTL', () => {
    const at = Date.parse('2026-08-01');

    it('bills one-hour cache writes at twice the base input rate', () => {
      const usage = { input_tokens: 0, output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 1_000_000,
        cache_creation: { ephemeral_5m_input_tokens: 0,
          ephemeral_1h_input_tokens: 1_000_000 } };
      assert.equal(calculateMessageCost(usage, 'claude-sonnet-5', at), 4);
    });

    it('splits a mixed write between the two rates', () => {
      const usage = { input_tokens: 0, output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 1_000_000,
        cache_creation: { ephemeral_5m_input_tokens: 600_000,
          ephemeral_1h_input_tokens: 400_000 } };
      // 0.6M × 2.5 + 0.4M × 4
      assert.equal(calculateMessageCost(usage, 'claude-sonnet-5', at), 3.1);
    });

    it('prices a usage block without the breakdown at the five-minute rate', () => {
      const usage = { input_tokens: 0, output_tokens: 0,
        cache_read_input_tokens: 0, cache_creation_input_tokens: 1_000_000 };
      assert.equal(calculateMessageCost(usage, 'claude-sonnet-5', at), 2.5);
    });

    it('reproduces the cost Claude Code recorded for a Cowork session', () => {
      const usage = { input_tokens: 2, output_tokens: 1571,
        cache_read_input_tokens: 43779,
        cache_creation_input_tokens: 78071,
        cache_creation: { ephemeral_5m_input_tokens: 0,
          ephemeral_1h_input_tokens: 78071 } };
      const cost = calculateMessageCost(usage, 'claude-sonnet-5', at);
      assert.ok(Math.abs(cost - 0.3367538) < 1e-7, `got ${cost}`);
    });
  });
});
