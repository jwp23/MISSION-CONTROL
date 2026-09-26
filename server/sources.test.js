const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveSources } = require('./sources');

let homeDir, claudeDir, configPath, warnings, log;

function writeConfig(text) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, text);
}

function makeMirror(machines) {
  const mirror = path.join(homeDir, 'mirror');
  for (const m of machines) {
    fs.mkdirSync(path.join(mirror, m, 'claude-code', 'projects'), { recursive: true });
  }
  return mirror;
}

function opts() {
  return { configPath, homeDir, claudeDir, coworkDir: path.join(homeDir, 'cowork-absent'), log };
}

beforeEach(() => {
  homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-home-'));
  claudeDir = path.join(homeDir, '.claude');
  configPath = path.join(homeDir, '.config', 'agent-downlink', 'config.toml');
  warnings = [];
  log = (msg) => warnings.push(msg);
});

afterEach(() => {
  fs.rmSync(homeDir, { recursive: true, force: true });
});

const localOnly = () => ({
  sources: [{ machine: null, projectsDir: path.join(claudeDir, 'projects') }],
  localMachine: null
});

describe('resolveSources', () => {
  it('returns the local source silently when no downlink config exists', () => {
    assert.deepEqual(resolveSources(opts()), localOnly());
    assert.deepEqual(warnings, []);
  });

  it('returns one source per mirrored machine, sorted, plus the local machine name', () => {
    const mirror = makeMirror(['oryxp-9', 'ciroos-1']);
    fs.mkdirSync(path.join(mirror, 'not-a-machine', 'other-tool'), { recursive: true });
    writeConfig(`machine = 'oryxp-9'\nmirror = '${mirror}'\ntools = ['claude-code']\n`);
    assert.deepEqual(resolveSources(opts()), {
      sources: [
        { machine: 'ciroos-1', projectsDir: path.join(mirror, 'ciroos-1', 'claude-code', 'projects') },
        { machine: 'oryxp-9', projectsDir: path.join(mirror, 'oryxp-9', 'claude-code', 'projects') }
      ],
      localMachine: 'oryxp-9'
    });
    assert.deepEqual(warnings, []);
  });

  const failures = [
    ['malformed TOML', () => writeConfig('machine = [unterminated\n')],
    ['non-string machine', () => writeConfig(`machine = 7\nmirror = '${path.join(homeDir, 'mirror')}'\n`)],
    ['non-string mirror', () => writeConfig(`machine = 'x'\nmirror = ['a']\n`)],
    ['missing mirror key', () => writeConfig(`machine = 'x'\n`)],
    ['mirror outside home', () => writeConfig(`machine = 'x'\nmirror = '/etc'\n`)],
    ['mirror traversal outside home', () => writeConfig(`machine = 'x'\nmirror = '${path.join(homeDir, '..')}'\n`)],
    ['missing mirror directory', () => writeConfig(`machine = 'x'\nmirror = '${path.join(homeDir, 'nope')}'\n`)],
    ['mirror with no machine folders', () => { const m = makeMirror([]); fs.mkdirSync(m, { recursive: true }); writeConfig(`machine = 'x'\nmirror = '${m}'\n`); }]
  ];

  for (const [name, setup] of failures) {
    it(`falls back to local with exactly one warning on ${name}`, () => {
      setup();
      assert.deepEqual(resolveSources(opts()), localOnly());
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /^\[sources\] agent-downlink mirror unavailable, using /);
    });
  }
});

describe('cowork source', () => {
  it('is appended after the local source when the Cowork directory exists', () => {
    const coworkDir = path.join(homeDir, 'cowork');
    fs.mkdirSync(coworkDir, { recursive: true });
    assert.deepEqual(resolveSources({ ...opts(), coworkDir }), {
      sources: [
        { machine: null, projectsDir: path.join(claudeDir, 'projects') },
        { kind: 'cowork', machine: null, projectsDir: coworkDir }
      ],
      localMachine: null
    });
    assert.deepEqual(warnings, []);
  });

  it('carries the downlink machine name when a mirror is in use', () => {
    const mirror = makeMirror(['oryxp-9']);
    writeConfig(`machine = 'oryxp-9'\nmirror = '${mirror}'\n`);
    const coworkDir = path.join(homeDir, 'cowork');
    fs.mkdirSync(coworkDir, { recursive: true });
    const { sources } = resolveSources({ ...opts(), coworkDir });
    assert.deepEqual(sources.at(-1), { kind: 'cowork', machine: 'oryxp-9', projectsDir: coworkDir });
  });

  it('is still appended when the downlink config is broken', () => {
    writeConfig('machine = [unterminated\n');
    const coworkDir = path.join(homeDir, 'cowork');
    fs.mkdirSync(coworkDir, { recursive: true });
    const { sources, localMachine } = resolveSources({ ...opts(), coworkDir });
    assert.equal(localMachine, null);
    assert.deepEqual(sources.at(-1), { kind: 'cowork', machine: null, projectsDir: coworkDir });
    assert.equal(warnings.length, 1);
  });

  it('adds nothing when the Cowork directory does not exist', () => {
    assert.deepEqual(resolveSources(opts()), localOnly());
  });
});
