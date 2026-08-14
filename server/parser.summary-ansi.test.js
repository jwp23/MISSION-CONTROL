const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parseSessionFile } = require('./parser');

const ESC = '';

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parser-test-'));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Write a transcript whose only user message is `text`, then parse it. */
async function summaryOf(text, name = 'session') {
  const file = path.join(tmpDir, `${name}-${Math.random().toString(36).slice(2)}.jsonl`);
  const lines = [
    JSON.stringify({
      type: 'user',
      sessionId: '11111111-2222-3333-4444-555555555555',
      timestamp: '2026-08-14T12:00:00.000Z',
      message: { content: text }
    })
  ];
  fs.writeFileSync(file, lines.join('\n') + '\n');
  const result = await parseSessionFile(file);
  return result.summary;
}

describe('buildSummary — ANSI escape sequences', () => {
  it('strips SGR bold codes surrounding text', async () => {
    const summary = await summaryOf(`Set model to ${ESC}[1mOpus 4.8 (1M context)${ESC}[22m and save`);
    assert.equal(summary, 'Set model to Opus 4.8 (1M context) and save');
  });

  it('leaves no raw escape character in the summary', async () => {
    const summary = await summaryOf(`Set model to ${ESC}[1mOpus 4.8${ESC}[22m and save`);
    assert.ok(!summary.includes(ESC), `summary still contains ESC: ${JSON.stringify(summary)}`);
  });

  it('strips color and reset codes', async () => {
    const summary = await summaryOf(`${ESC}[31mdeploy failed${ESC}[0m — investigate the rollout`);
    assert.equal(summary, 'deploy failed — investigate the rollout');
  });

  it('does not mangle text containing bare square brackets', async () => {
    const summary = await summaryOf('check the [staging] cluster for drift');
    assert.equal(summary, 'check the [staging] cluster for drift');
  });

  it('preserves plain text unchanged', async () => {
    const summary = await summaryOf('where is my bionic directory');
    assert.equal(summary, 'where is my bionic directory');
  });
});
