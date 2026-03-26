const fs = require('fs');
const readline = require('readline');
const cost = require('./cost');

/**
 * Parse a session JSONL file and extract metrics
 * Returns: { sessionId, metrics, summary, timestamps, models }
 */
async function parseSessionFile(filePath) {
  const metrics = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheWriteTokens: 0,
    totalCost: 0,
    totalDurationMs: 0,
    turnCount: 0,
    toolCallCount: 0,
    messageCount: 0,
    tokensByModel: {}
  };

  let firstTimestamp = null;
  let lastTimestamp = null;
  let sessionId = null;
  let sessionName = null;        // From custom-title or agent-name entries
  const userMessages = [];       // Collect first few user messages for summary
  const toolsUsed = new Set();   // Track tool names
  const filesModified = new Set(); // Track files edited/written
  const commandsRun = [];        // Track bash commands
  const models = new Set();

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (!sessionId && entry.sessionId) {
      sessionId = entry.sessionId;
    }

    // Track timestamps
    if (entry.timestamp) {
      const ts = new Date(entry.timestamp).getTime();
      if (!firstTimestamp || ts < firstTimestamp) firstTimestamp = ts;
      if (!lastTimestamp || ts > lastTimestamp) lastTimestamp = ts;
    }

    // Extract session name (last one wins — renamed sessions have multiple)
    if (entry.type === 'custom-title' && entry.customTitle) {
      sessionName = entry.customTitle;
    } else if (entry.type === 'agent-name' && entry.agentName) {
      sessionName = entry.agentName;
    }

    if (entry.type === 'user') {
      metrics.messageCount++;
      // Capture first few user messages for richer summary
      if (userMessages.length < 5 && entry.message) {
        const content = entry.message.content;
        let text = '';
        if (typeof content === 'string') {
          text = content;
        } else if (Array.isArray(content)) {
          const textPart = content.find(c => c.type === 'text');
          if (textPart) text = textPart.text;
        }
        // Skip meta/system messages, tool results, and UUIDs/tool IDs
        if (text && !entry.isMeta && text.length > 5) {
          // Strip XML/HTML tags
          text = text.replace(/<[^>]+>/g, '').trim();
          // Skip if it looks like a tool ID, UUID, file path, or other noise
          const isNoise = /^(toolu_|[a-f0-9]{8,}$|\/private\/tmp|\/var\/|msg_)/.test(text)
            || /^[a-z0-9]{6,12}$/i.test(text)
            || /toolu_\w{10,}/.test(text)
            || /\/private\/tmp\//.test(text)
            || text.startsWith('[Request interrupted');
          if (text.length > 5 && !isNoise) userMessages.push(text);
        }
      }
    }

    if (entry.type === 'assistant' && entry.message) {
      metrics.messageCount++;
      metrics.turnCount++;
      const msg = entry.message;
      const model = msg.model || 'unknown';
      models.add(model);

      if (msg.usage) {
        const u = msg.usage;
        const inputTk = u.input_tokens || 0;
        const outputTk = u.output_tokens || 0;
        const cacheRead = u.cache_read_input_tokens || 0;
        const cacheWrite = u.cache_creation_input_tokens || 0;

        metrics.totalInputTokens += inputTk;
        metrics.totalOutputTokens += outputTk;
        metrics.totalCacheReadTokens += cacheRead;
        metrics.totalCacheWriteTokens += cacheWrite;

        // Per-model breakdown
        if (!metrics.tokensByModel[model]) {
          metrics.tokensByModel[model] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
        }
        metrics.tokensByModel[model].input += inputTk;
        metrics.tokensByModel[model].output += outputTk;
        metrics.tokensByModel[model].cacheRead += cacheRead;
        metrics.tokensByModel[model].cacheWrite += cacheWrite;

        const msgCost = cost.calculateMessageCost(u, model);
        metrics.totalCost += msgCost;
        metrics.tokensByModel[model].cost += msgCost;
      }

      // Track tool calls — names and details
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use') {
            metrics.toolCallCount++;
            toolsUsed.add(block.name);
            // Track files modified
            if ((block.name === 'Edit' || block.name === 'Write' || block.name === 'MultiEdit') && block.input) {
              const fp = block.input.file_path || block.input.filePath;
              if (fp) filesModified.add(fp.split('/').pop());
            }
            // Track bash commands (first 60 chars)
            if (block.name === 'Bash' && block.input && block.input.command) {
              const cmd = block.input.command.substring(0, 60);
              if (commandsRun.length < 10) commandsRun.push(cmd);
            }
          }
        }
      }
    }

    // Track turn durations from system messages
    if (entry.type === 'system' && entry.subtype === 'turn_duration' && entry.durationMs) {
      metrics.totalDurationMs += entry.durationMs;
    }
  }

  // If no turn_duration events, estimate from timestamps
  if (metrics.totalDurationMs === 0 && firstTimestamp && lastTimestamp) {
    metrics.totalDurationMs = lastTimestamp - firstTimestamp;
  }

  // Build rich summary
  const summary = buildSummary(userMessages, toolsUsed, filesModified, commandsRun);

  return {
    sessionId,
    sessionName,
    filePath,
    summary,
    firstTimestamp,
    lastTimestamp,
    models: Array.from(models),
    primaryModel: models.size > 0 ? Array.from(models)[0] : 'unknown',
    metrics,
    timeSaved: cost.calculateTimeSaved(metrics.totalDurationMs)
  };
}

/**
 * Build a rich summary from session data
 * Priority: user's stated goal + key actions taken
 */
function buildSummary(userMessages, toolsUsed, filesModified, commandsRun) {
  // Start with the user's first message as the "goal"
  let goal = '';
  if (userMessages.length > 0) {
    goal = userMessages[0];
    // Clean up common prefixes from slash commands
    goal = goal.replace(/^\/\w+\s*/, '').trim();
    // If first message is too short, combine with second
    if (goal.length < 20 && userMessages.length > 1) {
      goal = goal + ' — ' + userMessages[1];
    }
  }

  // Truncate goal
  if (goal.length > 120) goal = goal.substring(0, 117) + '...';

  // Build action suffix if we have meaningful tool data
  const actions = [];
  if (filesModified.size > 0) {
    const fileList = Array.from(filesModified).slice(0, 3).join(', ');
    const extra = filesModified.size > 3 ? ` +${filesModified.size - 3} more` : '';
    actions.push(`edited ${fileList}${extra}`);
  }
  if (toolsUsed.has('Bash') && commandsRun.length > 0) {
    // Look for git commits in commands
    const gitCommit = commandsRun.find(c => c.includes('git commit'));
    if (gitCommit) actions.push('committed changes');
  }

  // Combine goal + actions
  if (!goal && actions.length > 0) {
    return actions.join('; ');
  }
  if (goal && actions.length > 0) {
    const actionStr = actions.join('; ');
    // Only append if it fits
    if (goal.length + actionStr.length < 180) {
      return `${goal} [${actionStr}]`;
    }
  }

  return goal || '(no summary available)';
}

/**
 * Parse history.jsonl and build sessionId -> first display text index
 */
async function buildHistoryIndex(historyPath) {
  const index = {}; // sessionId -> { display, timestamp, project }

  if (!fs.existsSync(historyPath)) return index;

  const fileStream = fs.createReadStream(historyPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.sessionId && !index[entry.sessionId]) {
        index[entry.sessionId] = {
          display: entry.display || '',
          timestamp: entry.timestamp,
          project: entry.project || ''
        };
      }
    } catch {
      continue;
    }
  }

  return index;
}

module.exports = { parseSessionFile, buildHistoryIndex };
