const path = require('node:path');

/**
 * Resolve a path and reject it unless it stays within baseDir.
 * Guards filesystem access against traversal from user-controlled input.
 * Returns the resolved absolute path, or null if it escapes the base.
 */
function resolveWithin(baseDir, candidate) {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, candidate);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

module.exports = { resolveWithin };
