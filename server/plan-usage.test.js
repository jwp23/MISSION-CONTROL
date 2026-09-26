const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { readPlanUsage } = require('./plan-usage');

let dir, file;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-plan-usage-'));
  file = path.join(dir, 'plan-usage-history.json');
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const write = (obj) => fs.writeFileSync(file, typeof obj === 'string' ? obj : JSON.stringify(obj));

describe('readPlanUsage', () => {
  it('returns the newest sample that carries a reading', () => {
    write({ version: 2, samples: [
      { t: 1000, org: 'o', u: { fh: 10, sd: 3 } },
      { t: 2000, org: 'o', u: { fh: 42, sd: 7 } },
      { t: 3000, org: 'o', u: {} },
      { t: 4000, org: 'o', u: { xu: 0.7 } }
    ]});
    assert.deepEqual(readPlanUsage(file), { sampledAt: 2000, fiveHour: 42, sevenDay: 7 });
  });

  it('reports null for a limit the sample does not carry', () => {
    write({ version: 2, samples: [{ t: 1000, org: 'o', u: { sd: 5 } }] });
    assert.deepEqual(readPlanUsage(file), { sampledAt: 1000, fiveHour: null, sevenDay: 5 });
  });

  it('returns null when no sample has a reading', () => {
    write({ version: 2, samples: [{ t: 1000, org: 'o', u: {} }] });
    assert.equal(readPlanUsage(file), null);
  });

  it('returns null when the file is missing', () => {
    assert.equal(readPlanUsage(file), null);
  });

  it('returns null when the file is not the expected shape', () => {
    write('{not json');
    assert.equal(readPlanUsage(file), null);
    write({ version: 2 });
    assert.equal(readPlanUsage(file), null);
  });
});
