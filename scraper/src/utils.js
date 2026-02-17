const fs = require('fs');
const { USER_AGENTS, RATE_LIMIT, IG_APP_ID } = require('./config');

/**
 * Returns a random user-agent string from the pool.
 */
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Builds browser-like HTTP headers for Instagram requests.
 */
function buildHeaders(extra = {}) {
  return {
    'User-Agent': getRandomUserAgent(),
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'X-IG-App-ID': IG_APP_ID,
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    'Referer': 'https://www.instagram.com/',
    ...extra,
  };
}

/**
 * Returns a random delay (ms) between min and max for rate limiting.
 */
function randomDelay() {
  const { MIN_DELAY_MS, MAX_DELAY_MS } = RATE_LIMIT;
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

/**
 * Promise-based sleep.
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps an async function with exponential backoff retry logic.
 * @param {Function} fn - Async function to execute
 * @param {number} maxRetries - Max retry attempts
 * @param {number} baseDelay - Base delay in ms (doubles each retry)
 * @returns {Promise<*>} - Result of fn()
 */
async function retryWithBackoff(fn, maxRetries = RATE_LIMIT.MAX_RETRIES, baseDelay = RATE_LIMIT.BACKOFF_BASE_MS) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = error.response?.status;

      // Don't retry on 404 (user not found) or other client errors that won't change
      if (status === 404) throw error;

      if (attempt < maxRetries) {
        const waitTime = baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 1000);
        const reason = status === 429 ? 'Rate limited' : `Request failed (${status || error.message})`;
        console.log(`  ⚠ ${reason}. Retrying in ${(waitTime / 1000).toFixed(1)}s (attempt ${attempt + 1}/${maxRetries})...`);
        await delay(waitTime);
      }
    }
  }

  throw lastError;
}

/**
 * Saves data as a formatted JSON file.
 */
function saveJSON(data, filepath) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = {
  getRandomUserAgent,
  buildHeaders,
  randomDelay,
  delay,
  retryWithBackoff,
  saveJSON,
};
