/**
 * Simple in-memory cache with TTL.
 * Used to prevent duplicate API calls within 30 seconds.
 */

const DEFAULT_TTL_MS = 30000; // 30 seconds

const store = new Map();

/**
 * Get a cached value. Returns undefined if not found or expired.
 */
function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiry) {
    store.delete(key);
    return undefined;
  }
  return entry.data;
}

/**
 * Cache a value with optional TTL (default 30s).
 */
function set(key, data, ttlMs = DEFAULT_TTL_MS) {
  store.set(key, {
    data,
    expiry: Date.now() + ttlMs,
  });
}

/**
 * Clear all cached entries.
 */
function clear() {
  store.clear();
}

module.exports = { get, set, clear };
