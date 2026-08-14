'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { inRange } = require('./timerange');

const CACHE_TTL_MS = 60_000;
const cache = new Map(); // projectPath -> { at, records }

function hasBeads(projectPath) {
  return fs.existsSync(path.join(projectPath, '.beads'));
}

function parseExport(stdout) {
  const records = [];
  for (const line of String(stdout).split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r._type && r._type !== 'issue') continue;
    records.push({ created_at: r.created_at || null, closed_at: r.closed_at || null, status: r.status || null });
  }
  return records;
}

function countBeads(records, range) {
  let created = 0, closed = 0;
  for (const r of records) {
    if (r.created_at && inRange(r.created_at, range)) created++;
    if (r.closed_at && inRange(r.closed_at, range)) closed++;
  }
  return { created, closed };
}

function getBeadRecords(projectPath) {
  const hit = cache.get(projectPath);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return Promise.resolve(hit.records);
  return new Promise((resolve) => {
    execFile('bd', ['export', '-'], { cwd: projectPath, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      const records = err ? [] : parseExport(stdout);
      cache.set(projectPath, { at: Date.now(), records });
      resolve(records);
    });
  });
}

module.exports = { hasBeads, parseExport, countBeads, getBeadRecords };
