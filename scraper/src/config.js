const ENDPOINTS = {
  BASE: 'https://www.instagram.com',
  SEARCH: 'https://www.instagram.com/web/search/topsearch/',
  USER_INFO: 'https://www.instagram.com/api/v1/users/{userId}/info/',
  USER_FEED: 'https://www.instagram.com/api/v1/feed/user/{userId}/',
};

const IG_APP_ID = '936619743392459';

// Media type codes returned by the feed API
const MEDIA_TYPES = {
  1: 'Image',
  2: 'Video',
  8: 'Carousel',
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/117.0.0.0',
];

const RATE_LIMIT = {
  MIN_DELAY_MS: 2000,
  MAX_DELAY_MS: 5000,
  BACKOFF_BASE_MS: 1000,
  MAX_RETRIES: 5,
};

const PAGINATION = {
  POSTS_PER_PAGE: 12,
};

module.exports = {
  ENDPOINTS,
  IG_APP_ID,
  MEDIA_TYPES,
  USER_AGENTS,
  RATE_LIMIT,
  PAGINATION,
};
