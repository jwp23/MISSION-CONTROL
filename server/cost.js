const config = require('./config');

/**
 * Calculate cost for a single assistant message's usage object.
 * Cache writes are split by TTL: the pricing table's cacheWrite is the
 * five-minute rate (1.25× input); one-hour writes bill at 2× base input.
 */
function calculateMessageCost(usage, model, timestampMs) {
  if (!usage) return 0;
  const pricing = require('./pricing').getPricing(model, timestampMs);
  const perMillion = 1_000_000;

  const cacheWriteTotal = usage.cache_creation_input_tokens || 0;
  const oneHourWrite = Math.min(usage.cache_creation?.
    ephemeral_1h_input_tokens || 0, cacheWriteTotal);
  const fiveMinuteWrite = cacheWriteTotal - oneHourWrite;

  const inputCost = ((usage.input_tokens || 0) / perMillion) * pricing.input;
  const outputCost = ((usage.output_tokens || 0) / perMillion) * pricing.output;
  const cacheReadCost = ((usage.cache_read_input_tokens || 0) /
    perMillion) * pricing.cacheRead;
  const cacheWriteCost = (fiveMinuteWrite / perMillion) * pricing.cacheWrite
    + (oneHourWrite / perMillion) * pricing.input * 2;

  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}

/**
 * Calculate time saved based on session duration and configured multiplier
 */
function calculateTimeSaved(durationMs) {
  const cfg = config.get();
  const multiplier = cfg.timeSaved.multiplier;
  const estimatedManualMs = durationMs * multiplier;
  return {
    sessionDurationMs: durationMs,
    estimatedManualMs,
    timeSavedMs: estimatedManualMs - durationMs,
    multiplier
  };
}

module.exports = { calculateMessageCost, calculateTimeSaved };
