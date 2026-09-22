const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parse } = require('smol-toml');
const config = require('./config');
const { resolveWithin } = require('./paths');

const DOWNLINK_CONFIG = path.join(os.homedir(), '.config', 'agent-downlink', 'config.toml');

function localSource(claudeDir) {
  return { machine: null, projectsDir: path.join(claudeDir, 'projects') };
}

/**
 * Read the two agent-downlink settings we need. Returns null when downlink
 * is not installed; throws when the config is present but unusable.
 */
function readDownlinkConfig(configPath, homeDir) {
  if (!fs.existsSync(configPath)) return null;
  const parsed = parse(fs.readFileSync(configPath, 'utf8'));
  if (typeof parsed.mirror !== 'string' || typeof parsed.machine !== 'string') {
    throw new Error('mirror and machine must be strings');
  }
  // The mirror path is read from another tool's config; keep it inside home
  const mirror = resolveWithin(homeDir, parsed.mirror);
  if (!mirror) throw new Error(`mirror ${parsed.mirror} is outside ${homeDir}`);
  return { mirror, machine: parsed.machine };
}

/**
 * One source per mirror/<machine>/claude-code/projects directory.
 */
function mirrorSources(mirror) {
  if (!fs.existsSync(mirror)) throw new Error(`mirror directory ${mirror} does not exist`);
  const sources = [];
  for (const entry of fs.readdirSync(mirror, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const projectsDir = path.join(mirror, entry.name, 'claude-code', 'projects');
    if (fs.existsSync(projectsDir)) sources.push({ machine: entry.name, projectsDir });
  }
  if (sources.length === 0) throw new Error(`mirror ${mirror} has no machine folders`);
  return sources.sort((a, b) => a.machine.localeCompare(b.machine));
}

/**
 * Resolve where session transcripts are read from.
 * With agent-downlink: every machine in its mirror, this one included.
 * Otherwise, or on any failure: the local Claude directory only.
 */
function resolveSources(opts = {}) {
  const configPath = opts.configPath || DOWNLINK_CONFIG;
  const homeDir = opts.homeDir || os.homedir();
  const claudeDir = opts.claudeDir || config.get().claudeDir;
  const log = opts.log || console.warn;
  try {
    const downlink = readDownlinkConfig(configPath, homeDir);
    if (!downlink) return { sources: [localSource(claudeDir)], localMachine: null };
    return { sources: mirrorSources(downlink.mirror), localMachine: downlink.machine };
  } catch (err) {
    log(`[sources] agent-downlink mirror unavailable, using ${claudeDir}: ${err.message}`);
    return { sources: [localSource(claudeDir)], localMachine: null };
  }
}

module.exports = { resolveSources };
