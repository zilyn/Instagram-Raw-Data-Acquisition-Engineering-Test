# Instagram Raw Data Acquisition — Architecture Design

## System Overview

This document describes the architecture for a scalable Instagram raw-data acquisition system. The system uses **n8n** as the orchestration layer for scheduling, retry logic, and monitoring, while dedicated **scraper workers** handle the actual HTTP-based data extraction.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SYSTEM ARCHITECTURE                         │
│                                                                     │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │              │    │                  │    │    Instagram      │  │
│  │     n8n      │───▶│  Scraper Workers │───▶│    Endpoints     │  │
│  │ Orchestrator │    │  (Node.js)       │◀───│   (REST API)     │  │
│  │              │    │                  │    │                  │  │
│  └──────┬───────┘    └────────┬─────────┘    └──────────────────┘  │
│         │                     │                                     │
│         ▼                     ▼                                     │
│  ┌──────────────┐    ┌──────────────────┐                          │
│  │  Monitoring   │    │   PostgreSQL     │                          │
│  │  & Alerts     │    │   Database       │                          │
│  │ (Slack/Email) │    │                  │                          │
│  └──────────────┘    └──────────────────┘                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## A. How We Access Data

Instagram exposes several REST API endpoints for data extraction. The strategy uses a **three-step pipeline**: search → profile info → feed pagination.

### Endpoint Strategy

| Endpoint | Purpose | Method | Auth Required |
|----------|---------|--------|---------------|
| `/web/search/topsearch/` | Resolve username → user ID | GET | Session cookie |
| `/api/v1/users/{id}/info/` | Full profile metadata | GET | Session cookie |
| `/api/v1/feed/user/{id}/` | Posts feed + pagination | GET | Session cookie |

### Request Flow

```
                        ┌─────────────────┐
                        │   Target User    │
                        │  (@username)     │
                        └────────┬────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  1. GET instagram.com    │
                    │     (Obtain CSRF token   │
                    │      + session cookies)  │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  2. Search API           │
                    │                          │
                    │  GET /web/search/         │
                    │  topsearch/?query={user}  │
                    │                          │
                    │  Returns:                │
                    │  • user_id (pk)          │
                    │  • username              │
                    │  • profile_pic_url       │
                    └────────────┬────────────┘
                                 │ (user_id)
              ┌──────────────────┴──────────────────┐
              ▼                                      ▼
  ┌───────────────────────┐            ┌───────────────────────┐
  │  3. User Info API      │            │  4. Feed API           │
  │                        │            │                        │
  │  GET /api/v1/users/    │            │  GET /api/v1/feed/     │
  │  {id}/info/            │            │  user/{id}/?count=12   │
  │                        │            │                        │
  │  Returns:              │            │  Returns:              │
  │  • Full profile data   │            │  • items[] (posts)     │
  │  • Biography           │            │  • more_available      │
  │  • Follower counts     │            │  • next_max_id         │
  │  • External URL        │            │  (cursor for next page)│
  └───────────────────────┘            └───────────┬───────────┘
                                                     │
                                         ┌───────────▼───────────┐
                                         │  5. Paginate           │
                                         │  Loop with max_id      │
                                         │  until more_available  │
                                         │  = false               │
                                         └───────────────────────┘
```

### Required Headers

Every request must include browser-like headers to avoid detection:

```
User-Agent:       <rotated from pool of 12+ real browser UAs>
X-IG-App-ID:     936619743392459
X-CSRFToken:     <extracted from session cookies>
Accept-Language:  en-US,en;q=0.9
Sec-Fetch-Site:   same-origin
Sec-Fetch-Mode:   cors
Referer:          https://www.instagram.com/
```

---

## B. Scraper Structure

### Account Discovery

New accounts to scrape are discovered through multiple channels:

```
┌──────────────────────────────────────────────────────────┐
│                   ACCOUNT DISCOVERY                       │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  Manual      │  │  Hashtag     │  │  Follower Graph  │  │
│  │  Seed List   │  │  Search      │  │  Expansion       │  │
│  │  (CSV/API)   │  │  (Trending)  │  │  (Following of)  │  │
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │
│         └────────────────┼──────────────────┘            │
│                          ▼                                │
│               ┌──────────────────┐                        │
│               │  Deduplication   │                        │
│               │  + Validation    │                        │
│               │  (public? active?)│                        │
│               └────────┬─────────┘                        │
│                        ▼                                  │
│               ┌──────────────────┐                        │
│               │  Account Queue   │                        │
│               │  (PostgreSQL)    │                        │
│               └──────────────────┘                        │
└──────────────────────────────────────────────────────────┘
```

**Discovery methods:**

1. **Manual seed list** — Initial accounts added via CSV import or admin API
2. **Hashtag search** — Periodically search trending/industry hashtags, extract poster usernames
3. **Follower graph expansion** — Crawl the "following" list of already-tracked accounts to discover related profiles
4. **Deduplication** — All discovered accounts are checked against the existing database before being queued

### Worker Architecture

The system uses a **queue-based worker model** orchestrated by n8n:

```
┌─────────────────────────────────────────────────────────────┐
│                     n8n ORCHESTRATOR                         │
│                                                             │
│  ┌──────────┐   ┌───────────┐   ┌──────────┐              │
│  │  Cron     │──▶│  Account   │──▶│  Job     │              │
│  │  Trigger  │   │  Queue     │   │  Router  │              │
│  └──────────┘   └───────────┘   └─────┬────┘              │
│                                        │                    │
│                    ┌───────────────────┼───────────────┐    │
│                    ▼                   ▼               ▼    │
│              ┌──────────┐       ┌──────────┐   ┌──────────┐│
│              │ Worker 1  │       │ Worker 2  │   │ Worker 3  ││
│              │ Profile   │       │ Posts     │   │ Posts     ││
│              │ Scrape    │       │ Page 1-5  │   │ Page 6-10 ││
│              └─────┬────┘       └─────┬────┘   └─────┬────┘│
│                    │                   │               │     │
│                    └───────────┬───────┘───────────────┘     │
│                                ▼                             │
│                    ┌───────────────────┐                     │
│                    │  Result Aggregator │                     │
│                    │  + DB Writer       │                     │
│                    └───────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

### Retry & Backoff Strategy

Failed requests are retried with **exponential backoff + jitter**:

```
Attempt 1: Immediate
Attempt 2: Wait 1s  + random(0-1s)
Attempt 3: Wait 2s  + random(0-1s)
Attempt 4: Wait 4s  + random(0-1s)
Attempt 5: Wait 8s  + random(0-1s)
  └── Max 5 retries, then mark job as FAILED and alert
```

Non-retryable errors (404 Not Found, private accounts) are detected early and skipped.

### Ban Detection & Response

The system monitors HTTP responses for signs of blocking:

| Signal | Response Code | Action |
|--------|--------------|--------|
| Rate limited | `429` | Pause worker, backoff 5 min, rotate proxy |
| Login required | `401` | Rotate session, refresh CSRF token |
| Forbidden | `403` | Flag IP, rotate proxy, increase delay |
| Challenge required | `400` + checkpoint | Pause 24h, rotate IP + session |
| Success | `200` | Continue normally |

### Proxy Rotation Strategy

Residential proxies are rotated using a **health-checked pool**:

```
┌──────────────────────────────────────┐
│          Proxy Pool Manager           │
│                                      │
│  Active Pool        Cooldown Pool    │
│  ┌──────────┐      ┌──────────┐     │
│  │ Proxy A ✓│      │ Proxy D ⏳│     │
│  │ Proxy B ✓│      │ Proxy E ⏳│     │
│  │ Proxy C ✓│      └──────────┘     │
│  └──────────┘                        │
│                                      │
│  Strategy:                           │
│  • Round-robin selection             │
│  • Health check every 50 requests    │
│  • Failed proxy → cooldown 1 hour   │
│  • Cooldown → re-tested → active    │
└──────────────────────────────────────┘
```

### User-Agent Rotation

A pool of **12+ real browser user-agent strings** is maintained, covering Chrome, Firefox, Safari, and Edge across Windows, macOS, and Linux. A random UA is selected per request to mimic organic browser diversity.

---

## C. Raw Data Collected

### Profile Fields

| Field | Type | Source | Example |
|-------|------|--------|---------|
| `username` | string | User Info API | `"lilbieber"` |
| `full_name` | string | User Info API | `"Justin Bieber"` |
| `biography` | string | User Info API | `"@SKYLRK"` |
| `follower_count` | integer | User Info API | `292252684` |
| `following_count` | integer | User Info API | `911` |
| `media_count` | integer | User Info API | `8873` |
| `profile_pic_url` | string | User Info API | `"https://..."` |
| `category` | string | User Info API | `"Public Figure"` |
| `is_verified` | boolean | User Info API | `true` |
| `external_url` | string | User Info API | `"https://churcho.me/..."` |

### Post Fields

| Field | Type | Source | Example |
|-------|------|--------|---------|
| `post_id` | string | Feed API | `"3829000768624714327"` |
| `media_type` | enum | Feed API | `"Image"` (1) / `"Video"` (2) / `"Carousel"` (8) |
| `caption` | string | Feed API | `"FRIDAY @skylrk"` |
| `like_count` | integer | Feed API | `182557` |
| `comment_count` | integer | Feed API | `2252` |
| `timestamp` | unix int | Feed API | `1770672508` |
| `media_urls` | array | Feed API | `[{url, is_video, video_url}]` |
| `video_view_count` | integer | Feed API | `4630892` (video only) |
| `location` | string | Feed API | `"Los Angeles, California"` |

### Data Model

```
┌─────────────────────┐         ┌─────────────────────┐
│      PROFILES        │         │       POSTS          │
├─────────────────────┤         ├─────────────────────┤
│ user_id (PK)         │───┐     │ post_id (PK)         │
│ username (UNIQUE)    │   │     │ user_id (FK)         │
│ full_name            │   └────▶│ shortcode            │
│ biography            │         │ media_type           │
│ follower_count       │         │ caption              │
│ following_count      │         │ like_count           │
│ media_count          │         │ comment_count        │
│ profile_pic_url      │         │ timestamp            │
│ category             │         │ video_view_count     │
│ is_verified          │         │ location             │
│ external_url         │         │ scraped_at           │
│ last_scraped_at      │         └─────────────────────┘
└─────────────────────┘                  │
                                          │
                                 ┌────────▼────────────┐
                                 │     POST_MEDIA       │
                                 ├─────────────────────┤
                                 │ media_id (PK)        │
                                 │ post_id (FK)         │
                                 │ url                  │
                                 │ is_video             │
                                 │ video_url            │
                                 └─────────────────────┘
```

---

## D. Frequency / Scheduling

### Re-Scrape Strategy

Different data types change at different rates, so we schedule accordingly:

```
Timeline (24-hour cycle):
═══════════════════════════════════════════════════════

Profiles (daily):
  ├──────────────────────────────────────────────────┤
  06:00                                           06:00
  [Full profile re-scrape]

New Posts (every 4 hours):
  ├──────┼──────┼──────┼──────┼──────┼──────┤
  00:00 04:00 08:00 12:00 16:00 20:00 00:00
  [Check for new posts since last cursor]

Engagement Metrics (every 6 hours):
  ├─────────┼─────────┼─────────┼─────────┤
  00:00   06:00    12:00    18:00    00:00
  [Re-scrape like/comment counts on recent posts]
```

### Delta Scraping

To minimize API calls, the system uses **checkpoint-based delta scraping**:

1. Store the `next_max_id` and `latest_post_timestamp` after each scrape
2. On next run, only fetch posts newer than the stored timestamp
3. Stop pagination early once we reach already-scraped posts
4. This reduces API calls by **80-90%** for established accounts

### n8n Scheduling Workflow

```
┌─────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│  Cron    │────▶│ Load Account │────▶│ Check Last   │────▶│ Dispatch │
│  Trigger │     │ Queue from DB│     │ Scrape Time  │     │ to Worker│
└─────────┘     └──────────────┘     └──────────────┘     └─────┬────┘
                                                                 │
    ┌────────────────────────────────────────────────────────────┘
    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Scrape Data   │────▶│ Transform &  │────▶│ Upsert to    │
│ (HTTP Worker) │     │ Validate     │     │ PostgreSQL   │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                          ┌───────▼───────┐
                                          │ Update Cursor  │
                                          │ & Notify on    │
                                          │ Error/Complete │
                                          └───────────────┘
```

### Monitoring & Alerting

| Metric | Threshold | Alert |
|--------|-----------|-------|
| Failed scrapes | > 3 consecutive | Slack notification |
| Rate limit hits | > 10 per hour | Pause + email alert |
| Stale data | Profile not updated in 48h | Warning notification |
| New posts missed | Delta > 24h | Priority re-scrape |

---

## Summary

This architecture separates **orchestration** (n8n) from **execution** (Node.js workers), enabling:

- **Scalability**: Add more workers or accounts without changing the architecture
- **Reliability**: Automatic retries, backoff, and failure alerting
- **Maintainability**: Visual workflow editor (n8n) + modular code (Node.js)
- **Efficiency**: Delta scraping reduces API calls by 80-90%
- **Anti-blocking**: Proxy rotation, UA randomization, and adaptive rate limiting
