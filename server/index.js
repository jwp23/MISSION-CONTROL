const express = require('express');
const path = require('node:path');
const config = require('./config');
const scanner = require('./scanner');
const parser = require('./parser');
const restore = require('./restore');
const sessionState = require('./session-state');
const timerange = require('./timerange');
const beads = require('./beads');

const app = express();
app.disable('x-powered-by');
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Load config and session state on startup
config.load();
sessionState.load();

// Initialize pricing with history persistence
const pricing = require('./pricing');
pricing.init({});
pricing.refresh().then((changed) => { if (changed) console.log('pricing: history updated from LiteLLM'); });
pricing.startAutoRefresh();

const sources = require('./sources');
const scope = require('./scope');

// One history index per source; the mirror may lack history.jsonl, which yields an empty index
const historyIndexes = new Map();
async function loadHistoryIndexes(list) {
  for (const src of list) {
    if (historyIndexes.has(src.machine)) continue;
    const historyPath = path.join(path.dirname(src.projectsDir), 'history.jsonl');
    try {
      historyIndexes.set(src.machine, await parser.buildHistoryIndex(historyPath));
    } catch (err) {
      console.error(`Failed to build history index for ${src.machine ?? 'local'}:`, err.message);
      historyIndexes.set(src.machine, {});
    }
  }
}

// Which machine we are running on, per agent-downlink; null without a mirror.
// Breaks ties when two sources hold the same session — see scope.duplicateReport.
let localMachine = null;

/** Resolve sources, parse every session (cached), return the flat list. */
async function loadAllSessions() {
  const { sources: list, localMachine: machine } = sources.resolveSources();
  localMachine = machine;
  await loadHistoryIndexes(list);
  return { sessions: await scanner.discoverSessions(list, historyIndexes), localMachine };
}

/** Every endpoint scopes through here so source precedence is applied once. */
function scoped(sessions, query) {
  return scope.scopedSessions(sessions, query, localMachine);
}

const cachedSessions = () => Array.from(scanner.sessionCache.values());

// --- API Routes ---

// List all discovered projects with aggregate stats
app.get('/api/projects', async (req, res) => {
  try {
    const { sessions } = await loadAllSessions();
    const inScope = scoped(sessions, { machine: req.query.machine });
    res.json(scope.groupProjects(inScope));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Session row shape shared by /api/sessions/all. */
function sessionRow(s) {
  const ss = sessionState.getStatus(s.sessionId);
  const summaryOverride = sessionState.getSummary(s.sessionId);
  return {
    sessionId: s.sessionId,
    sessionName: s.sessionName || null,
    summary: summaryOverride != null ? summaryOverride : s.summary,
    primaryModel: s.primaryModel,
    models: s.models,
    firstTimestamp: s.firstTimestamp,
    lastTimestamp: s.lastTimestamp,
    totalTokens: s.metrics.totalInputTokens + s.metrics.totalOutputTokens +
                 s.metrics.totalCacheReadTokens + s.metrics.totalCacheWriteTokens,
    totalCost: s.metrics.totalCost,
    durationMs: s.metrics.totalDurationMs,
    turnCount: s.metrics.turnCount,
    toolCallCount: s.metrics.toolCallCount,
    subagentCount: s.subagentCount,
    timeSaved: s.timeSaved,
    status: ss ? ss.status : null,
    statusNote: ss ? ss.note : null,
    machine: s.machine,
    projectKey: s.projectKey,
    projectName: s.projectName
  };
}

// All sessions across all projects (lightweight list)
app.get('/api/sessions/all', async (req, res) => {
  try {
    const inScope = scoped(cachedSessions(), req.query);
    res.json(inScope.map(sessionRow).sort((a, b) => (b.firstTimestamp || 0) - (a.firstTimestamp || 0)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Per-machine totals for the current project and window; [] when single-source
app.get('/api/machines', (req, res) => {
  try {
    const inScope = scoped(cachedSessions(), { project: req.query.project, from: req.query.from, to: req.query.to });
    res.json(scope.machinesSummary(inScope));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Machines whose transcripts are a copy of another machine's; [] when healthy.
// Unscoped on purpose — a copied history is a mirror problem, not a view problem.
app.get('/api/duplicates', (req, res) => {
  try {
    res.json(scope.duplicateReport(cachedSessions(), localMachine));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get detailed metrics for a single session
app.get('/api/sessions/:sessionId', async (req, res) => {
  try {
    const cached = Array.from(scanner.sessionCache.values())
      .find(s => s.sessionId === req.params.sessionId);

    if (cached) {
      res.json(cached);
    } else {
      res.status(404).json({ error: 'Session not found in cache. Load the project first.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search session descriptions
app.get('/api/search', async (req, res) => {
  try {
    const query = (req.query.q || '').toLowerCase().trim();
    if (!query) return res.json([]);

    const inScope = scoped(cachedSessions(), req.query);
    const results = [];
    for (const session of inScope) {
      if (session.summary?.toLowerCase().includes(query) ||
          session.sessionId?.toLowerCase().includes(query) ||
          session.sessionName?.toLowerCase().includes(query)) {
        results.push(sessionRow(session));
      }
    }

    // Also search history index
    for (const index of historyIndexes.values()) {
      for (const [sid, entry] of Object.entries(index)) {
        if (entry.display.toLowerCase().includes(query) || sid.toLowerCase().includes(query)) {
          // Avoid duplicates
          if (!results.some(r => r.sessionId === sid)) {
            results.push({
              sessionId: sid,
              summary: entry.display,
              project: entry.project,
              firstTimestamp: entry.timestamp
            });
          }
        }
      }
    }

    const range = timerange.parseRange(req.query);
    const filtered = timerange.filterSessions(results, range);
    res.json(filtered.slice(0, 50)); // Limit results
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Global aggregate stats
app.get('/api/stats', async (req, res) => {
  try {
    const sessions = scoped(cachedSessions(), req.query);
    const aggregate = scanner.aggregateSessions(sessions);
    const activeSessions = scanner.getActiveSessions();

    res.json({
      ...aggregate,
      activeSessions,
      projectCount: new Set(sessions.map(s => s.projectKey)).size,
      multiplier: config.get().timeSaved.multiplier
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Daily stats — aggregate tokens and cost per day
app.get('/api/daily-stats', async (req, res) => {
  try {
    const sessions = scoped(cachedSessions(), req.query);
    const dailyMap = {}; // 'YYYY-MM-DD' -> { tokens, cost, sessions, durationMs }

    for (const s of sessions) {
      if (!s.firstTimestamp) continue;
      const date = new Date(s.firstTimestamp).toISOString().split('T')[0];
      if (!dailyMap[date]) {
        dailyMap[date] = { date, tokens: 0, cost: 0, sessions: 0, durationMs: 0, models: {} };
      }
      dailyMap[date].tokens += s.metrics.totalInputTokens + s.metrics.totalOutputTokens +
                               s.metrics.totalCacheReadTokens + s.metrics.totalCacheWriteTokens;
      dailyMap[date].cost += s.metrics.totalCost;
      dailyMap[date].sessions++;
      dailyMap[date].durationMs += s.metrics.totalDurationMs;
      // Aggregate model token usage per day
      for (const [model, mtokens] of Object.entries(s.metrics.tokensByModel || {})) {
        if (!dailyMap[date].models[model]) {
          dailyMap[date].models[model] = 0;
        }
        dailyMap[date].models[model] += mtokens.input + mtokens.output + mtokens.cacheRead + mtokens.cacheWrite;
      }
    }

    // Sort by date
    const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
    res.json(daily);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Monthly stats — aggregate tokens and cost per month
app.get('/api/monthly-stats', async (req, res) => {
  try {
    const sessions = scoped(cachedSessions(), req.query);
    const monthlyMap = {}; // 'YYYY-MM' -> { month, cost, tokens, sessions, durationMs }

    for (const s of sessions) {
      if (!s.firstTimestamp) continue;
      const month = new Date(s.firstTimestamp).toISOString().slice(0, 7);
      if (!monthlyMap[month]) {
        monthlyMap[month] = { month, tokens: 0, cost: 0, sessions: 0, durationMs: 0 };
      }
      monthlyMap[month].tokens += s.metrics.totalInputTokens + s.metrics.totalOutputTokens +
                                   s.metrics.totalCacheReadTokens + s.metrics.totalCacheWriteTokens;
      monthlyMap[month].cost += s.metrics.totalCost;
      monthlyMap[month].sessions++;
      monthlyMap[month].durationMs += s.metrics.totalDurationMs;
    }

    const monthly = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));
    res.json(monthly);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Active sessions
app.get('/api/active', (req, res) => {
  try {
    res.json(scanner.getActiveSessions());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restore a session in the configured terminal
app.post('/api/restore/:sessionId', async (req, res) => {
  try {
    const { cwd } = req.body;
    if (!cwd) return res.status(400).json({ error: 'cwd is required' });

    const terminal = config.get().terminal || 'ghostty';
    const result = await restore.restoreSession(req.params.sessionId, cwd, terminal);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Config endpoints
app.get('/api/config', (req, res) => {
  res.json(config.get());
});

app.put('/api/config', (req, res) => {
  try {
    const updated = config.save(req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Session status (WIP tracking)
app.put('/api/sessions/:sessionId/status', (req, res) => {
  try {
    const { status, note } = req.body;
    if (status && !['wip', 'complete'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "wip", "complete", or null' });
    }
    const result = sessionState.setStatus(req.params.sessionId, status || null, note);
    res.json({ sessionId: req.params.sessionId, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/sessions/:sessionId/summary', (req, res) => {
  try {
    const { summary } = req.body;
    if (typeof summary !== 'string') {
      return res.status(400).json({ error: 'summary must be a string' });
    }
    const result = sessionState.setSummary(req.params.sessionId, summary);
    res.json({ sessionId: req.params.sessionId, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/wip', (req, res) => {
  try {
    const wip = sessionState.getWipSessions();
    res.json(wip);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/beads', async (req, res) => {
  try {
    const range = timerange.parseRange(req.query);
    const { sessions } = await loadAllSessions();
    const projects = scope.groupProjects(sessions)
      .filter((p) => p.localPath && (!req.query.project || p.key === req.query.project))
      .filter((p) => beads.hasBeads(p.localPath));
    if (projects.length === 0) return res.json({ hasBeads: false, created: 0, closed: 0, machine: localMachine });
    let created = 0, closed = 0;
    for (const p of projects) {
      const counts = beads.countBeads(await beads.getBeadRecords(p.localPath), range);
      created += counts.created; closed += counts.closed;
    }
    res.json({ hasBeads: true, created, closed, machine: localMachine });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
const cfg = config.get();
const port = cfg.port || 9000;
app.listen(port, () => {
  console.log(`CC-Mission-Control running at http://localhost:${port}`);
  const { sources: list, localMachine: machine } = sources.resolveSources();
  localMachine = machine;
  console.log(`Sources: ${list.map(s => s.machine ?? 'local').join(', ')}`);
  console.log(`Claude data: ${cfg.claudeDir}`);
});
