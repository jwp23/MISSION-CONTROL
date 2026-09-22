const os = require('node:os');
const scanner = require('./scanner');
const timerange = require('./timerange');
const { localPath } = require('./project-key');

/**
 * The sessions a request is about: dedupe, then project, machine and time window.
 */
function scopedSessions(sessions, query, localMachine = null) {
  const { sessions: deduped } = scanner.dedupeBySessionId(sessions, { localMachine });
  const byProject = timerange.filterByProject(deduped, query.project);
  const byMachine = timerange.filterByMachine(byProject, query.machine);
  return timerange.filterSessions(byMachine, timerange.parseRange(query));
}

function groupBy(sessions, keyOf) {
  const groups = new Map();
  for (const s of sessions) {
    const k = keyOf(s);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  return groups;
}

/**
 * Projects as the sidebar sees them: one row per projectKey across machines.
 */
function groupProjects(sessions, homeDir = os.homedir()) {
  const rows = [];
  for (const [key, group] of groupBy(sessions, (s) => s.projectKey)) {
    rows.push({
      key,
      name: group[0].projectName,
      sessionCount: group.length,
      aggregate: scanner.aggregateSessions(group),
      localPath: localPath(key, homeDir)
    });
  }
  return rows.sort((a, b) => b.sessionCount - a.sessionCount);
}

/**
 * Per-machine totals. Empty when there is no machine dimension (single local source).
 */
function machinesSummary(sessions) {
  const rows = [];
  for (const [machine, group] of groupBy(sessions, (s) => s.machine)) {
    if (machine === null) continue;
    rows.push({ machine, sessionCount: group.length, aggregate: scanner.aggregateSessions(group) });
  }
  return rows.sort((a, b) => a.machine.localeCompare(b.machine));
}

/**
 * Machines whose sessions are shadowed by another machine's copy of the same
 * transcripts, busiest first. Deliberately unfiltered: a copied history is a
 * property of the mirror, not of whatever project or window is on screen.
 */
function duplicateReport(sessions, localMachine = null) {
  const { duplicates } = scanner.dedupeBySessionId(sessions, { localMachine });
  const rows = new Map();
  for (const d of duplicates) {
    const key = `${d.machine}/${d.shadowedBy}`;
    if (!rows.has(key)) rows.set(key, { machine: d.machine, shadowedBy: d.shadowedBy, sessionCount: 0 });
    rows.get(key).sessionCount++;
  }
  return Array.from(rows.values()).sort((a, b) => b.sessionCount - a.sessionCount);
}

module.exports = { scopedSessions, groupProjects, machinesSummary, duplicateReport };
