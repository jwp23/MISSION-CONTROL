'use strict';
const fs = require('node:fs');
const path = require('node:path');

const LITELLM_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

let moduleHistory = null;
let moduleHistoryPath = null;

function normalizeLitellm(json) {
  const out = {};
  for (const [key, v] of Object.entries(json || {})) {
    if (!v || v.litellm_provider !== 'anthropic' || !key.startsWith('claude')) continue;
    if (typeof v.input_cost_per_token !== 'number' || typeof v.output_cost_per_token !== 'number') continue;
    out[key] = {
      input: v.input_cost_per_token * 1e6,
      output: v.output_cost_per_token * 1e6,
      cacheRead: (v.cache_read_input_token_cost || 0) * 1e6,
      cacheWrite: (v.cache_creation_input_token_cost || 0) * 1e6,
    };
  }
  return out;
}

// simpler deep-equal: stringify with sorted keys at each level
function sortedStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(sortedStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + sortedStringify(v[k])).join(',') + '}';
}

function appendIfChanged(history, snapshot, dateStr) {
  const last = history.entries[history.entries.length - 1];
  if (last && sortedStringify(last.prices) === sortedStringify(snapshot)) return false;
  history.entries.push({ effectiveFrom: dateStr, prices: snapshot });
  return true;
}

function resolvePricing(history, model, timestampMs) {
  const entries = history.entries;
  if (!entries.length) return null;
  let entry = entries[entries.length - 1];
  if (timestampMs != null) {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (Date.parse(entries[i].effectiveFrom) <= timestampMs) { entry = entries[i]; break; }
      if (i === 0) entry = entries[0];
    }
  }
  if (entry.prices[model]) return entry.prices[model];
  let best = null;
  for (const key of Object.keys(entry.prices)) {
    if (model.startsWith(key) && (!best || key.length > best.length)) best = key;
  }
  return best ? entry.prices[best] : null;
}

function init(opts = {}) {
  moduleHistoryPath = opts.historyPath || path.join(__dirname, '..', 'pricing-history.json');
  const seedPath = opts.seedPath || path.join(__dirname, 'pricing-seed.json');

  if (fs.existsSync(moduleHistoryPath)) {
    moduleHistory = JSON.parse(fs.readFileSync(moduleHistoryPath, 'utf-8'));
  } else {
    // Copy seed to history
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    moduleHistory = seed;
    fs.writeFileSync(moduleHistoryPath, JSON.stringify(seed, null, 2));
  }

  return moduleHistory;
}

function getHistory() {
  if (!moduleHistory) throw new Error('pricing.init() not called');
  return moduleHistory;
}

async function refresh(fetchFn = global.fetch) {
  try {
    if (!moduleHistory) throw new Error('pricing.init() not called');

    const res = await fetchFn(LITELLM_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const normalized = normalizeLitellm(json);
    const today = new Date().toISOString().slice(0, 10);
    const changed = appendIfChanged(moduleHistory, normalized, today);
    if (changed) {
      fs.writeFileSync(moduleHistoryPath, JSON.stringify(moduleHistory, null, 2));
    }
    return changed;
  } catch (err) {
    console.log(`pricing: using last known prices (${err.message})`);
    return false;
  }
}

function startAutoRefresh(intervalMs = 24 * 60 * 60 * 1000) {
  const timer = setInterval(refresh, intervalMs);
  timer.unref();
}

function _resetForTesting() {
  moduleHistory = null;
  moduleHistoryPath = null;
}

module.exports = {
  LITELLM_URL,
  normalizeLitellm,
  appendIfChanged,
  resolvePricing,
  init,
  getHistory,
  refresh,
  startAutoRefresh,
  _resetForTesting
};
