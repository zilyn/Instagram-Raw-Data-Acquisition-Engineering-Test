# Instagram Scraper

HTTP-based Instagram public data scraper with full cursor-based pagination. Extracts profile metadata and all posts from any public Instagram account.

## Requirements

- Node.js 18+
- npm
- An Instagram account (for the session cookie)

## Installation

```bash
cd scraper
npm install
```

## Getting Your Session Cookie

The scraper requires your Instagram `sessionid` cookie for authenticated API access:

1. Open **Chrome** and log in to [instagram.com](https://www.instagram.com)
2. Press **F12** to open DevTools
3. Go to **Application** tab → **Cookies** → `https://www.instagram.com`
4. Find the cookie named **`sessionid`** and copy its **Value**

## Usage

```bash
# Scrape a profile and print JSON to stdout
node src/index.js --username lilbieber --session-id "YOUR_SESSION_ID"

# Save output to a file
node src/index.js --username lilbieber --session-id "YOUR_SESSION_ID" --output result.json

# Limit to first 50 posts
node src/index.js --username lilbieber --session-id "YOUR_SESSION_ID" --max-posts 50 --output result.json
```

### CLI Options

| Option | Required | Description |
|--------|----------|-------------|
| `-u, --username <name>` | Yes | Instagram username to scrape |
| `--session-id <id>` | Yes | Instagram `sessionid` cookie from browser |
| `-o, --output <file>` | No | Save JSON to file (default: stdout) |
| `-m, --max-posts <n>` | No | Max posts to fetch, 0 = all (default: 0) |

## Output Format

```json
{
  "profile": {
    "user_id": "6860189",
    "username": "lilbieber",
    "full_name": "Justin Bieber",
    "biography": "@SKYLRK",
    "follower_count": 292252684,
    "following_count": 911,
    "media_count": 8873,
    "profile_pic_url": "https://...",
    "category": null,
    "is_verified": true,
    "external_url": "https://churcho.me/3T9o6dF",
    "is_private": false
  },
  "posts": [
    {
      "post_id": "3829000768624714327",
      "shortcode": "DUjV-mCkuJX",
      "media_type": "Video",
      "caption": "FRIDAY @skylrk * @haileybieber",
      "like_count": 182557,
      "comment_count": 2252,
      "timestamp": 1770672508,
      "date": "2026-02-09T21:28:28.000Z",
      "media_urls": [{ "url": "https://...", "is_video": true, "video_url": "https://..." }],
      "video_view_count": 4630892,
      "location": null,
      "is_video": true,
      "accessibility_caption": null
    }
  ],
  "scrape_metadata": {
    "scraped_at": "2026-02-17T...",
    "target_username": "lilbieber",
    "total_posts_fetched": 12,
    "scraper_version": "1.0.0"
  }
}
```

## Technical Details

- **User lookup**: Search API (`/web/search/topsearch/`) resolves username → user ID
- **Profile data**: User info API (`/api/v1/users/{id}/info/`)
- **Posts data**: Feed API (`/api/v1/feed/user/{id}/`) with `max_id` pagination
- **Anti-detection**: User-agent rotation, browser-like headers, random delays (2-5s), exponential backoff
- **Cookie management**: Proper cookie jar with `tough-cookie` for session persistence
- **No dependencies on**: Puppeteer, browser automation, or paid API services
