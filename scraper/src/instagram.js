const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const axios = require('axios');
const { ENDPOINTS, MEDIA_TYPES, PAGINATION } = require('./config');
const { buildHeaders, retryWithBackoff, delay, randomDelay } = require('./utils');

/**
 * Creates an authenticated Instagram client with proper cookie jar.
 * The session ID from a logged-in browser is required for reliable access.
 */
async function createSession(sessionId) {
  const jar = new CookieJar();

  if (sessionId) {
    await jar.setCookie('sessionid=' + sessionId, ENDPOINTS.BASE + '/');
  }

  const client = wrapper(axios.create({ jar, withCredentials: true }));

  // Visit Instagram to collect CSRF token and other session cookies
  await client.get(ENDPOINTS.BASE + '/', { headers: buildHeaders() });

  const cookies = await jar.getCookies(ENDPOINTS.BASE + '/');
  const csrfCookie = cookies.find((c) => c.key === 'csrftoken');
  const csrfToken = csrfCookie ? csrfCookie.value : '';

  return { client, csrfToken, authenticated: !!sessionId };
}

/**
 * Resolves a username to an Instagram user ID via the search API.
 */
async function resolveUserId(username, session) {
  const response = await retryWithBackoff(async () => {
    return session.client.get(ENDPOINTS.SEARCH, {
      params: { query: username },
      headers: buildHeaders({ 'X-CSRFToken': session.csrfToken }),
    });
  });

  const users = response.data.users || [];
  const match = users.find((u) => u.user.username.toLowerCase() === username.toLowerCase());

  if (!match) {
    throw new Error(`User "@${username}" not found in search results.`);
  }

  return match.user.pk.toString();
}

/**
 * Fetches full profile metadata for a user by their ID.
 */
async function fetchProfile(username, session) {
  // Step 1: Resolve username → user_id
  const userId = await resolveUserId(username, session);

  await delay(randomDelay());

  // Step 2: Get full user info
  const url = ENDPOINTS.USER_INFO.replace('{userId}', userId);
  const response = await retryWithBackoff(async () => {
    return session.client.get(url, {
      headers: buildHeaders({ 'X-CSRFToken': session.csrfToken }),
    });
  });

  const user = response.data.user;
  if (!user) {
    throw new Error(`Could not fetch profile info for user ID ${userId}.`);
  }

  return {
    user_id: user.pk.toString(),
    username: user.username,
    full_name: user.full_name,
    biography: user.biography,
    follower_count: user.follower_count,
    following_count: user.following_count,
    media_count: user.media_count,
    profile_pic_url: user.hd_profile_pic_url_info?.url || user.profile_pic_url,
    category: user.category || null,
    is_verified: user.is_verified,
    external_url: user.external_url || null,
    is_private: user.is_private,
  };
}

/**
 * Parses a single feed item into a clean post object.
 * Handles Image (1), Video (2), and Carousel (8) media types.
 */
function parsePost(item) {
  const mediaType = MEDIA_TYPES[item.media_type] || 'Unknown';

  // Collect media URLs
  let mediaUrls = [];
  if (item.carousel_media) {
    // Carousel: multiple images/videos
    mediaUrls = item.carousel_media.map((child) => ({
      url: child.image_versions2?.candidates?.[0]?.url || null,
      is_video: child.media_type === 2,
      video_url: child.video_versions?.[0]?.url || null,
    }));
  } else {
    mediaUrls = [{
      url: item.image_versions2?.candidates?.[0]?.url || null,
      is_video: item.media_type === 2,
      video_url: item.video_versions?.[0]?.url || null,
    }];
  }

  return {
    post_id: item.pk.toString(),
    shortcode: item.code,
    media_type: mediaType,
    caption: item.caption?.text || '',
    like_count: item.like_count || 0,
    comment_count: item.comment_count || 0,
    timestamp: item.taken_at,
    date: new Date(item.taken_at * 1000).toISOString(),
    media_urls: mediaUrls,
    video_view_count: item.play_count || item.view_count || null,
    location: item.location?.name || null,
    is_video: item.media_type === 2,
    accessibility_caption: item.accessibility_caption || null,
  };
}

/**
 * Fetches all posts for a user using the feed API with max_id pagination.
 * @param {string} userId - Instagram user ID
 * @param {object} session - Authenticated session
 * @param {number} maxPosts - Maximum posts to fetch (0 = all)
 * @param {Function} onProgress - Callback for progress updates
 */
async function fetchAllPosts(userId, session, maxPosts = 0, onProgress = null) {
  const allPosts = [];
  let moreAvailable = true;
  let nextMaxId = null;

  while (moreAvailable) {
    const url = ENDPOINTS.USER_FEED.replace('{userId}', userId);
    const params = { count: PAGINATION.POSTS_PER_PAGE };
    if (nextMaxId) {
      params.max_id = nextMaxId;
    }

    const response = await retryWithBackoff(async () => {
      return session.client.get(url, {
        params,
        headers: buildHeaders({ 'X-CSRFToken': session.csrfToken }),
      });
    });

    const feed = response.data;
    const items = feed.items || [];

    for (const item of items) {
      allPosts.push(parsePost(item));

      if (maxPosts > 0 && allPosts.length >= maxPosts) {
        moreAvailable = false;
        break;
      }
    }

    if (onProgress) {
      onProgress(allPosts.length);
    }

    moreAvailable = moreAvailable && feed.more_available;
    nextMaxId = feed.next_max_id || null;

    // Rate limit: wait between pagination requests
    if (moreAvailable) {
      await delay(randomDelay());
    }
  }

  return allPosts;
}

module.exports = {
  createSession,
  fetchProfile,
  fetchAllPosts,
  parsePost,
};
