'use strict';
const LITELLM_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

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

module.exports = { LITELLM_URL, normalizeLitellm, appendIfChanged, resolvePricing };
