const fs = require('fs');
const path = require('path');
const config = require('./config');
const parser = require('./parser');

/**
 * Encode a project path to match Claude Code's directory naming
 * /home/user/projects/MyApp -> -home-user-projects-MyApp
 */
function encodeProjectPath(projectPath) {
  return projectPath.replace(/\//g, '-');
}

/**
 * Scan the configured root folder for Claude Code projects
 * A project is any directory that has a .claude/ subdirectory
 */
function discoverProjects() {
  const cfg = config.get();
  const scanPath = cfg.scanPath;
  const claudeDir = cfg.claudeDir;

  if (!fs.existsSync(scanPath)) return [];

  const entries = fs.readdirSync(scanPath, { withFileTypes: true });
  const projects = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // Skip hidden dirs, trash, etc.
    if (entry.name.startsWith('.') || entry.name.startsWith('trash')) continue;

    const projectPath = path.join(scanPath, entry.name);
    const claudeSubdir = path.join(projectPath, '.claude');

    if (fs.existsSync(claudeSubdir)) {
      const encodedPath = encodeProjectPath(projectPath);
      const sessionsDir = path.join(claudeDir, 'projects', encodedPath);

      projects.push({
        name: entry.name,
        path: projectPath,
        encodedPath,
        sessionsDir,
        hasSessionData: fs.existsSync(sessionsDir)
      });
    }
  }

  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * List session JSONL files for a project
 */
function listSessionFiles(sessionsDir) {
  if (!fs.existsSync(sessionsDir)) return [];

  const entries = fs.readdirSync(sessionsDir);
  const sessions = [];

  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) continue;
    const filePath = path.join(sessionsDir, entry);
    const stat = fs.statSync(filePath);
    // Skip tiny files (< 100 bytes)
    if (stat.size < 100) continue;

    sessions.push({
      id: entry.replace('.jsonl', ''),
      filePath,
      size: stat.size,
      modified: stat.mtime
    });
  }

  // Sort newest first
  return sessions.sort((a, b) => b.modified - a.modified);
}

/**
 * Get active Claude Code sessions (currently running)
 */
function getActiveSessions() {
  const cfg = config.get();
  const sessionsDir = path.join(cfg.claudeDir, 'sessions');
  if (!fs.existsSync(sessionsDir)) return [];

  const active = [];
  const entries = fs.readdirSync(sessionsDir);

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, entry), 'utf8'));
      // Check if PID is still running
      try {
        process.kill(data.pid, 0); // Signal 0 tests existence
        active.push(data);
      } catch {
        // Process not running
      }
    } catch {
      continue;
    }
  }

  return active;
}

// Cache for parsed sessions
const sessionCache = new Map();

/**
 * Parse all sessions for a project (with caching)
 */
async function getProjectSessions(project, historyIndex) {
  const files = listSessionFiles(project.sessionsDir);
  const sessions = [];

  for (const file of files) {
    const cacheKey = `${file.filePath}:${file.modified.getTime()}`;
    if (sessionCache.has(cacheKey)) {
      sessions.push(sessionCache.get(cacheKey));
      continue;
    }

    try {
      const parsed = await parser.parseSessionFile(file.filePath);
      // Enrich summary from history index if available
      if (parsed.sessionId && historyIndex[parsed.sessionId]) {
        const histEntry = historyIndex[parsed.sessionId];
        if (histEntry.display && (!parsed.summary || parsed.summary.length < histEntry.display.length)) {
          parsed.summary = histEntry.display;
        }
      }
      parsed.encodedPath = project.encodedPath;
      parsed.projectName = project.name;
      parsed.projectPath = project.path;
      parsed.fileSize = file.size;
      parsed.modified = file.modified;
      sessionCache.set(cacheKey, parsed);
      sessions.push(parsed);
    } catch (err) {
      console.error(`Error parsing ${file.filePath}: ${err.message}`);
    }
  }

  return sessions;
}

/**
 * Aggregate metrics across multiple sessions
 */
function aggregateSessions(sessions) {
  const agg = {
    sessionCount: sessions.length,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheWriteTokens: 0,
    totalCost: 0,
    totalDurationMs: 0,
    totalTurns: 0,
    totalToolCalls: 0,
    totalMessages: 0,
    tokensByModel: {},
    timeSavedMs: 0
  };

  for (const s of sessions) {
    const m = s.metrics;
    agg.totalInputTokens += m.totalInputTokens;
    agg.totalOutputTokens += m.totalOutputTokens;
    agg.totalCacheReadTokens += m.totalCacheReadTokens;
    agg.totalCacheWriteTokens += m.totalCacheWriteTokens;
    agg.totalCost += m.totalCost;
    agg.totalDurationMs += m.totalDurationMs;
    agg.totalTurns += m.turnCount;
    agg.totalToolCalls += m.toolCallCount;
    agg.totalMessages += m.messageCount;
    agg.timeSavedMs += (s.timeSaved ? s.timeSaved.timeSavedMs : 0);

    for (const [model, tokens] of Object.entries(m.tokensByModel)) {
      if (!agg.tokensByModel[model]) {
        agg.tokensByModel[model] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
      }
      agg.tokensByModel[model].input += tokens.input;
      agg.tokensByModel[model].output += tokens.output;
      agg.tokensByModel[model].cacheRead += tokens.cacheRead;
      agg.tokensByModel[model].cacheWrite += tokens.cacheWrite;
      agg.tokensByModel[model].cost += tokens.cost;
    }
  }

  return agg;
}

module.exports = {
  encodeProjectPath,
  discoverProjects,
  listSessionFiles,
  getActiveSessions,
  getProjectSessions,
  aggregateSessions,
  sessionCache
};
