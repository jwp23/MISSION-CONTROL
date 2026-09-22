const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { projectKey, displayNames, localPath, TEMP_KEY } = require('./project-key');

describe('projectKey', () => {
  const cases = [
    ['/home/u/workspace/jwp23/throwntom', 'workspace/jwp23/throwntom'],
    ['/Users/u/workspace/jwp23/throwntom', 'workspace/jwp23/throwntom'],
    ['/home/u/workspace/jwp23/x/.worktrees/feat', 'workspace/jwp23/x'],
    ['/home/u/workspace/jwp23/x/.claude/worktrees/feat', 'workspace/jwp23/x'],
    ['/home/u/workspace/jwp23/throwntom/swift-lint', 'workspace/jwp23/throwntom/swift-lint'],
    ['/home/u', '~'],
    ['/home/u/', '~'],
    ['/home/u/.claude', '.claude'],
    ['/private/tmp/claude-501/scratch', TEMP_KEY],
    ['/tmp/x', TEMP_KEY],
    ['/homework/u/x', TEMP_KEY],
    [null, TEMP_KEY],
    [undefined, TEMP_KEY]
  ];
  for (const [cwd, expected] of cases) {
    it(`${String(cwd)} -> ${expected}`, () => assert.equal(projectKey(cwd), expected));
  }
});

describe('displayNames', () => {
  it('uses the last segment when unique and the full key on collision', () => {
    const names = displayNames(['workspace/jwp23/vibe-md-templates', 'workspace/kylemoschetto/vibe-md-templates', 'workspace/jwp23/throwntom', '~', TEMP_KEY]);
    assert.equal(names.get('workspace/jwp23/vibe-md-templates'), 'workspace/jwp23/vibe-md-templates');
    assert.equal(names.get('workspace/kylemoschetto/vibe-md-templates'), 'workspace/kylemoschetto/vibe-md-templates');
    assert.equal(names.get('workspace/jwp23/throwntom'), 'throwntom');
    assert.equal(names.get('~'), '~');
    assert.equal(names.get(TEMP_KEY), TEMP_KEY);
  });
});

describe('localPath', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-home-'));
  fs.mkdirSync(path.join(home, 'workspace', 'app'), { recursive: true });

  it('returns the absolute path when the key exists under home', () => {
    assert.equal(localPath('workspace/app', home), path.join(home, 'workspace', 'app'));
  });
  it('returns home for ~', () => assert.equal(localPath('~', home), home));
  it('returns null when the directory is absent', () => assert.equal(localPath('workspace/missing', home), null));
  it('returns null for the temp bucket', () => assert.equal(localPath(TEMP_KEY, home), null));
  it('returns null when the key escapes home', () => assert.equal(localPath('../../etc', home), null));
  it('resolves a key with internal .. back into home', () =>
    assert.equal(localPath('workspace/app/../app', home), path.join(home, 'workspace', 'app')));
});
