# Instagram Raw Data Acquisition

A scalable Instagram public data acquisition system with architecture design and a working HTTP-based scraper.

## Project Structure

```
├── architecture/
│   └── design.md           ← System architecture document with diagrams
├── scraper/
│   ├── src/
│   │   ├── index.js        ← CLI entry point
│   │   ├── instagram.js    ← Core scraping logic (profile + posts)
│   │   ├── utils.js        ← Retry, delay, header rotation helpers
│   │   └── config.js       ← Endpoints, rate limits, constants
│   ├── package.json
│   ├── README.md           ← Scraper usage instructions
│   └── sample-output.json  ← Sample output from public account
└── README.md               ← This file
```

## Part 1: Architecture Design

See [`architecture/design.md`](architecture/design.md) for the full system design covering:

- **Data Access Strategy** — REST API + GraphQL endpoints
- **Scraper Structure** — n8n-orchestrated worker architecture with retry/backoff
- **Data Model** — Profile and post field specifications with database schema
- **Scheduling** — Cron-based re-scrape strategy with delta scraping

## Part 2: Working Scraper

See [`scraper/README.md`](scraper/README.md) for setup and usage instructions.

### Quick Start

```bash
cd scraper
npm install
node src/index.js --username lilbieber --session-id "YOUR_SESSION_ID" --output result.json
```

## Technical Approach

- **Language**: Node.js (better TLS fingerprint handling for Instagram)
- **HTTP Client**: axios with cookie jar support
- **User Resolution**: Search API → user ID lookup
- **Profile Endpoint**: Instagram REST API v1 (`/api/v1/users/{id}/info/`)
- **Posts Endpoint**: Feed API (`/api/v1/feed/user/{id}/`) with `max_id` pagination
- **Anti-Detection**: UA rotation, browser headers, exponential backoff, rate limiting
