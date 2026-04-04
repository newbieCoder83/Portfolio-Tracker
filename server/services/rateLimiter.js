/**
 * Token-bucket rate limiter for Trading 212 API.
 * Each category has its own bucket that refills at the documented rate.
 *
 * Rate limits (from docs/t212-api-reference.md):
 *   summary:     1 req / 5s
 *   positions:   1 req / 1s
 *   dividends:   6 req / 60s
 *   orders:      6 req / 60s
 *   instruments:  1 req / 50s
 */

const BUCKET_CONFIG = {
  summary:     { maxTokens: 1, refillIntervalMs: 5000 },
  positions:   { maxTokens: 1, refillIntervalMs: 1000 },
  dividends:   { maxTokens: 6, refillIntervalMs: 10000 },  // 1 token per 10s, max 6
  orders:      { maxTokens: 6, refillIntervalMs: 10000 },
  instruments: { maxTokens: 1, refillIntervalMs: 50000 },
};

class TokenBucket {
  constructor(maxTokens, refillIntervalMs) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillIntervalMs = refillIntervalMs;
    this.lastRefill = Date.now();
    this.queue = []; // Pending acquire() resolvers
  }

  /** Refill tokens based on elapsed time */
  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = Math.floor(elapsed / this.refillIntervalMs);
    if (newTokens > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
      this.lastRefill += newTokens * this.refillIntervalMs;
    }
  }

  /**
   * Acquire a token. Returns a Promise that resolves when a token is available.
   * If no token is available, waits until the next refill.
   */
  acquire() {
    return new Promise((resolve) => {
      this.refill();
      if (this.tokens > 0) {
        this.tokens -= 1;
        resolve();
      } else {
        // Calculate wait time until next token
        const waitMs = this.refillIntervalMs - (Date.now() - this.lastRefill);
        setTimeout(() => {
          this.refill();
          if (this.tokens > 0) {
            this.tokens -= 1;
          }
          resolve();
        }, Math.max(waitMs, 100));
      }
    });
  }
}

// Create one bucket per category
const buckets = {};
for (const [category, config] of Object.entries(BUCKET_CONFIG)) {
  buckets[category] = new TokenBucket(config.maxTokens, config.refillIntervalMs);
}

/**
 * Acquire a rate-limit token for the given category.
 * Blocks (awaits) until a token is available.
 */
async function acquire(category) {
  const bucket = buckets[category];
  if (!bucket) {
    throw new Error(`Unknown rate limit category: ${category}`);
  }
  await bucket.acquire();
}

module.exports = { acquire };
