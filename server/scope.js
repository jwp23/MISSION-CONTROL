const os = require('node:os');
const scanner = require('./scanner');
const timerange = require('./timerange');
const { localPath } = require('./project-key');

/**
 * The sessions a request is about: dedupe, then project, machine and time window.
 */
function scopedSessions(sessions, query) {
  const deduped = scanner.dedupeBySessionId(sessions);
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

module.exports = { scopedSessions, groupProjects, machinesSummary };
