const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TEMP_KEY = '(temp)';
// Home directories on the machines we aggregate: Linux and macOS layouts
const HOME_RE = /^\/(?:home|Users)\/[^/]+(?=\/|$)/;
// Worktree checkouts roll up into their repository
const WORKTREE_RE = /\/(?:\.worktrees|\.claude\/worktrees)\/[^/]+$/;

/**
 * Cross-machine project identity: the launch cwd relative to home.
 * Same layout under home on every machine means the same key.
 */
function projectKey(cwd) {
  if (typeof cwd !== 'string') return TEMP_KEY;
  const home = HOME_RE.exec(cwd);
  if (!home) return TEMP_KEY;
  const rel = cwd.slice(home[0].length).replace(/^\/+|\/+$/g, '').replace(WORKTREE_RE, '');
  return rel === '' ? '~' : rel;
}

/**
 * Sidebar names: the last path segment, unless another key shares it.
 */
function displayNames(keys) {
  const list = Array.from(keys);
  const base = (k) => k.split('/').pop();
  const counts = new Map();
  for (const k of list) counts.set(base(k), (counts.get(base(k)) || 0) + 1);
  return new Map(list.map((k) => [k, counts.get(base(k)) > 1 ? k : base(k)]));
}

/**
 * The checkout for a key on this machine, or null when none exists.
 * Beads and session restore need a real local directory.
 */
function localPath(key, homeDir = os.homedir()) {
  if (key === TEMP_KEY) return null;
  const abs = key === '~' ? homeDir : path.join(homeDir, key);
  return fs.existsSync(abs) ? abs : null;
}

module.exports = { projectKey, displayNames, localPath, TEMP_KEY };
