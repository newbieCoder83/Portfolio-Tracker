const axios = require('axios');
const rateLimiter = require('./rateLimiter');
const cache = require('./cache');

const BASE_URLS = {
  live: 'https://live.trading212.com',
  demo: 'https://demo.trading212.com',
};

const MAX_RETRIES = 3;

class T212Client {
  /**
   * @param {string} apiKey - Trading 212 API key
   * @param {string} apiSecret - Trading 212 API secret
   * @param {string} environment - 'live' or 'demo'
   */
  constructor(apiKey, apiSecret, environment) {
    this.baseUrl = BASE_URLS[environment] || BASE_URLS.live;
    // Build Basic auth header: base64(apiKey:apiSecret)
    const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
  }

  /**
   * Make a GET request to the T212 API with rate limiting, caching, and 429 retry.
   * @param {string} path - API path (e.g. '/api/v0/equity/positions')
   * @param {string} category - Rate limit category (e.g. 'positions')
   * @param {boolean} useCache - Whether to use the 30s cache (default true)
   */
  async get(path, category, useCache = true) {
    // Check cache first
    const cacheKey = `${this.baseUrl}${path}`;
    if (useCache) {
      const cached = cache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    // Wait for rate limit token
    await rateLimiter.acquire(category);

    // Make request with retry on 429
    let lastError;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
        const response = await axios.get(url, {
          headers: { Authorization: this.authHeader },
          timeout: 30000,
        });

        // Cache the response
        if (useCache) {
          cache.set(cacheKey, response.data);
        }

        return response.data;
      } catch (error) {
        if (error.response && error.response.status === 429) {
          // Read x-ratelimit-reset header and wait
          const resetEpoch = error.response.headers['x-ratelimit-reset'];
          if (resetEpoch) {
            const waitMs = Math.max(0, (parseInt(resetEpoch, 10) * 1000) - Date.now()) + 500;
            console.log(`[T212] Rate limited on ${path}. Waiting ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
            await sleep(waitMs);
          } else {
            // Fallback: wait 5 seconds
            console.log(`[T212] Rate limited on ${path}. No reset header, waiting 5s (attempt ${attempt + 1}/${MAX_RETRIES})`);
            await sleep(5000);
          }
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  /**
   * Paginate through all pages of a T212 endpoint.
   * Follows nextPagePath until null, collecting all items.
   * @param {string} path - Initial API path with ?limit=50
   * @param {string} category - Rate limit category
   */
  async paginateAll(path, category) {
    const allItems = [];
    let currentPath = path;

    while (currentPath) {
      // Don't cache paginated requests — each page is unique
      const data = await this.get(currentPath, category, false);
      if (data.items && Array.isArray(data.items)) {
        allItems.push(...data.items);
      }

      // nextPagePath is either a string (relative path) or null
      if (data.nextPagePath && !data.nextPagePath.includes('null')) {
        currentPath = data.nextPagePath;
      } else {
        currentPath = null;
      }
    }

    return allItems;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = T212Client;
