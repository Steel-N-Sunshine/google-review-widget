# Google Reviews Widget - Development Plan (Final)

## What We're Building

A self-hosted Google Reviews widget. A lightweight Docker container runs a Node.js server that polls the Google Places API on a configurable interval, accumulates reviews over time in a local JSON file, and serves them through an API endpoint. A tiny async JavaScript file renders the reviews on any webpage in a responsive card grid.

The container image is under 50MB, uses ~30MB RAM, and costs nothing to run beyond the Google API free tier.

Anyone can fork the repo, fill in a 4-line `.env`, run `docker compose up`, and have a working review widget on their site.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  WEBSITE (Webflow, WordPress, static HTML, anything)         │
│                                                              │
│  <script src="https://reviews.example.com/widget.js"         │
│          async></script>                                     │
│  <div data-widget="reviews"></div>                           │
│                                                              │
│  1. Page loads normally, widget script downloads in parallel  │
│  2. Script fetches /api/reviews from the container            │
│  3. Script renders the review cards into the div              │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│  DOCKER HOST                                                 │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ Traefik (your existing instance)                    │     │
│  │   - Routes reviews.yourdomain.com to container:3000 │     │
│  │   - Handles SSL via Cloudflare DNS challenge        │     │
│  │   - Certs issued and renewed automatically          │     │
│  └─────────────────────────────────────────────────────┘     │
│                          │                                   │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ google-reviews-widget container                     │     │
│  │                                                     │     │
│  │  Fastify server (port 3000)                         │     │
│  │    GET /api/reviews   returns cached reviews JSON   │     │
│  │    GET /widget.js     serves the client script      │     │
│  │    GET /health        returns status for monitoring  │     │
│  │                                                     │     │
│  │  Polling loop (setInterval)                         │     │
│  │    Calls Google Places API every N minutes           │     │
│  │    Merges new reviews into cache                    │     │
│  │    Writes to /app/data/reviews.json                 │     │
│  └─────────────────────────────────────────────────────┘     │
│                          │                                   │
│              ┌───────────┘                                   │
│              ▼                                               │
│  ./data/reviews.json  (Docker volume, persists on host)      │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│  Google Places API (New)                                     │
│    Place Details endpoint with reviews field mask             │
│    Returns up to 5 reviews per request                       │
│    Accumulates more over time as Google rotates results       │
│    Auth: API key only (no OAuth)                             │
└──────────────────────────────────────────────────────────────┘
```

---

## How the Accumulation Strategy Works

Google Places API returns a maximum of 5 reviews per request. But it doesn't always return the same 5. Depending on the sort order and timing, different reviews surface. The polling loop takes advantage of this:

1. Every N minutes, the poller calls the Places API
2. It compares the returned reviews against what's already cached
3. New reviews get added to the set (deduplication by reviewer name + text hash)
4. The set is sorted newest-first and trimmed to the configured max
5. The merged set is written to disk and held in memory

Over days and weeks the cache grows well beyond 5. A business with 80 reviews like Vizcaya Dental Arts would likely accumulate 20-30+ unique cached reviews within the first few weeks, and continue growing from there.

---

## Configuration

The entire setup is a single `.env` file.

### `.env.example`

```bash
# ── Required ─────────────────────────────────────────────
GOOGLE_API_KEY=your_google_places_api_key
GOOGLE_PLACE_ID=your_google_place_id
ALLOWED_ORIGINS=https://www.yourwebsite.com,https://yourwebsite.com

# ── Optional (defaults shown) ────────────────────────────
# POLL_INTERVAL_MINUTES=5
# MAX_REVIEWS=50
# PORT=3000
# REVIEWS_SORT=NEWEST

# ── Traefik (edit the domain) ────────────────────────────
WIDGET_HOST=reviews.yourwebsite.com
```

### What each variable does

**GOOGLE_API_KEY** -- Your Google Places API key. Get it from Google Cloud Console > APIs & Services > Credentials. Restrict it to your server's IP and to the Places API only.

**GOOGLE_PLACE_ID** -- The unique ID for your business on Google. Find yours at: https://developers.google.com/maps/documentation/places/web-service/place-id-lookup

**ALLOWED_ORIGINS** -- Comma-separated list of domains that are allowed to call your API. The container checks the Origin header on each request and rejects anything not on this list. Include both www and non-www versions of your domain.

**POLL_INTERVAL_MINUTES** -- How often to call the Google API. Default 5. Lower values accumulate reviews faster but use more API quota. At 5 minutes you'll use about 288 requests/day, well within Google's $200/month free credit.

**MAX_REVIEWS** -- Maximum number of reviews to keep in the cache. Default 50. Once the cache hits this limit, the oldest reviews get dropped as new ones come in.

**PORT** -- The port the server listens on inside the container. Default 3000. You shouldn't need to change this since Traefik routes by hostname, not port.

**REVIEWS_SORT** -- How to sort the Google API request. `NEWEST` gets the most recent reviews (recommended). `MOST_RELEVANT` gets Google's default ranking.

**WIDGET_HOST** -- The subdomain where the widget API will live. Used in the Traefik labels.

---

## Project Structure

```
google-reviews-widget/
├── src/
│   ├── server.js            # Fastify server, route registration, startup
│   ├── poller.js            # Polling loop (setInterval + Google API calls)
│   ├── cache.js             # JSON file read/write/merge/dedup logic
│   ├── google.js            # Google Places API client wrapper
│   └── origin.js            # Origin validation hook
├── public/
│   └── widget.js            # Client-side script served to the browser
├── Dockerfile
├── docker-compose.yml
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

No `data/` directory in the repo. Docker creates it via the volume mount on first run.

---

## File-by-File Breakdown

### `Dockerfile`

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY src/ ./src/
COPY public/ ./public/
RUN mkdir -p /app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "src/server.js"]
```

Node 22 Alpine base is ~40MB. The app code and Fastify add about 5MB. Total image under 50MB. The HEALTHCHECK lets Docker (and Portainer) show the container's health status.

### `docker-compose.yml`

This is designed to join your existing Traefik network. It does NOT include Traefik itself since Traefik is already running in your n8n stack.

```yaml
services:
  reviews:
    build: .
    container_name: google-reviews-widget
    restart: unless-stopped
    labels:
      - traefik.enable=true
      - traefik.http.routers.reviews.rule=Host(`${WIDGET_HOST}`)
      - traefik.http.routers.reviews.tls=true
      - traefik.http.routers.reviews.entrypoints=websecure
      - traefik.http.routers.reviews.tls.certresolver=mytlschallenge
      - traefik.http.services.reviews.loadbalancer.server.port=3000
    volumes:
      - reviews_data:/app/data
    env_file:
      - .env
    networks:
      - traefik_network

volumes:
  reviews_data:

networks:
  traefik_network:
    external: true
    name: n8n_default
```

**Important Traefik networking note.** Your existing n8n stack creates a default network called `n8n_default` (the stack name + `_default`). Traefik discovers containers on this network. The reviews container needs to be on the same network so Traefik can see it and route to it. That's what the `external: true` network declaration does. If your Portainer stack name is different, the network name will be different too. Check with `docker network ls` on the host.

### `src/server.js` -- Entry Point

Starts Fastify, registers routes, loads cache from disk, kicks off the poller.

**Routes:**

`GET /api/reviews`
- Runs the origin validation hook
- Returns the in-memory cached review data as JSON
- Sets CORS headers for the allowed origin
- Sets `Cache-Control: public, max-age=60` (browser caches for 1 minute)
- If the cache is empty (first boot, poller hasn't run yet), returns `{ reviews: [], rating: null, totalReviews: null }` with a 200 status

`GET /widget.js`
- Serves the static client-side script from `public/widget.js`
- Sets `Content-Type: application/javascript`
- Sets `Cache-Control: public, max-age=3600` (1 hour browser cache)
- Sets `Access-Control-Allow-Origin: *` (the script is public like any CDN JS file)

`GET /health`
- Returns `{ status: "ok", reviewsCached: 23, lastPoll: "2026-02-28T12:00:00Z" }`
- Used by Docker HEALTHCHECK and useful for Portainer monitoring
- No origin check (internal use)

**Startup sequence:**
1. Load `data/reviews.json` from disk into memory (or start with empty state)
2. Register routes
3. Start Fastify on configured port
4. Run the first poll immediately (don't wait for the interval)
5. Start `setInterval` for subsequent polls
6. Log: `"Server listening on :3000 | Polling every 5m | 23 reviews cached"`

### `src/poller.js` -- The Data Fetcher

A function that runs on `setInterval` at the configured `POLL_INTERVAL_MINUTES`.

**Each cycle:**
1. Call Google Places API via `google.js`
2. Get the current in-memory review array
3. For each review returned by Google, generate a dedup key: hash of `reviewer_name + first_80_chars_of_text`
4. Add any reviews not already in the set
5. Sort by `publishTime` descending (newest first)
6. Trim to `MAX_REVIEWS` if needed (drop oldest)
7. Update the in-memory cache
8. Write to `data/reviews.json` on disk (atomic write: temp file then rename)
9. Log: `"Poll complete: 2 new reviews added (total: 23)"`

**Error handling:**
- Google API error (bad key, rate limit, network timeout): log it, skip this cycle, cache stays untouched
- Disk write error: log it, in-memory cache still serves requests
- Never let a failed poll wipe or corrupt existing data

### `src/google.js` -- Places API Client

Thin wrapper around `fetch`. Makes one request to the Places API (New) endpoint.

**Request:**
```
GET https://places.googleapis.com/v1/places/{PLACE_ID}
Headers:
  X-Goog-Api-Key: {API_KEY}
  X-Goog-FieldMask: id,displayName,rating,userRatingCount,
    reviews.rating,reviews.text.text,reviews.originalText.text,
    reviews.relativePublishTimeDescription,reviews.publishTime,
    reviews.authorAttribution.displayName,
    reviews.authorAttribution.uri,
    reviews.authorAttribution.photoUri
```

**Returns** a normalized array of review objects:
```javascript
{
  rating: 5.0,
  totalReviews: 80,
  reviews: [
    {
      id: "a1b2c3",          // generated hash for dedup
      author: "Kenneth Kukish",
      authorPhoto: "https://lh3.googleusercontent.com/a/...",
      authorUrl: "https://www.google.com/maps/contrib/...",
      rating: 5,
      relativeTime: "11 days ago",
      publishTime: "2026-02-17T14:30:00Z",
      text: "I highly recommend Dr Kottar and Dr. Hong...",
      originalText: null     // populated if review is translated
    }
  ]
}
```

Throws on any non-200 response so the poller can catch and handle it.

### `src/cache.js` -- Persistence Layer

Three functions:

**`loadFromDisk(filepath)`** -- Reads and parses `data/reviews.json`. Returns null if file doesn't exist (first run). Wraps in try/catch for corrupted files.

**`saveToDisk(filepath, data)`** -- Atomic write: writes to `reviews.json.tmp`, then renames to `reviews.json`. This prevents corruption if the container crashes mid-write.

**`mergeReviews(existing, incoming)`** -- Takes two arrays, deduplicates by the hash ID, returns the merged array sorted by publishTime descending. This is the core of the accumulation strategy.

### `src/origin.js` -- Origin Validation

A Fastify `onRequest` hook applied only to `/api/reviews`.

- Reads `ALLOWED_ORIGINS` from env, splits on comma, trims whitespace
- Checks the `Origin` request header first
- Falls back to `Referer` header (some browsers send Referer but not Origin on cross-origin GET)
- If neither matches, returns 403 with `{ error: "Origin not allowed" }`
- Sets `Access-Control-Allow-Origin` to the matched origin (not wildcard, since we're validating)
- Also sets `Access-Control-Allow-Methods: GET` and `Access-Control-Allow-Headers: Content-Type`

### `public/widget.js` -- The Frontend Script

This is the file that loads on your website. It's served as a static file by the container.

**Embed code (what goes in Webflow or any site):**
```html
<script src="https://reviews.yourdomain.com/widget.js" async></script>
<div data-widget="reviews"></div>
```

Two lines. `async` means it downloads without blocking the page.

**What the script does on load:**

1. Wait for DOM ready (or run immediately if DOM is loaded)
2. Find the container: `document.querySelector('[data-widget="reviews"]')`
3. Read optional data attributes for configuration:
   - `data-max-visible="9"` -- reviews shown before "Load More" (default 9)
   - `data-theme="light"` -- color theme, light or dark (default light)
4. Determine the API URL from the script's own `src` attribute (same origin)
5. Show a loading skeleton (3 shimmer placeholder cards)
6. Fetch `/api/reviews`
7. Inject a scoped `<style>` block
8. Build and insert the HTML

**Loading skeleton:** While the fetch is in flight, 3 placeholder cards show animated gray shimmer blocks where the avatar, name, stars, and text would be. This prevents layout shift and looks polished.

**Error handling:** If the fetch fails, the div stays empty. No ugly error messages for visitors. Errors only appear in the browser console.

**All CSS scoped** under `.grw-` prefix (Google Reviews Widget) to avoid any collisions with the host site's styles. No external stylesheet.

**Responsive grid:**
- Desktop (>768px): 3 columns
- Tablet (480-768px): 2 columns
- Mobile (<480px): 1 column

**Review card layout:**
```
┌──────────────────────────────────────┐
│                                      │
│  [avatar]  Author Name           ✓   │
│     G      X days ago                │
│                                      │
│  ★★★★★                               │
│                                      │
│  Review text gets truncated at       │
│  around 180 characters, breaking     │
│  at a word boundary so it doesn't    │
│  cut mid-word...                     │
│  Read more                           │
│                                      │
└──────────────────────────────────────┘
```

**Avatar logic:**
- If Google returns a `photoUri` for the reviewer, render an `<img>` tag pointing to that URL. The browser fetches the thumbnail directly from Google's CDN.
- If no photo, generate a colored circle with the reviewer's first initial. The color is derived from a simple hash of the name so the same person always gets the same color (matching the Elfsight style).

**Stars:** Inline SVGs. Filled star is #F4B400 (Google's yellow). Each card renders the correct number based on the review's rating.

**Google "G" icon:** Small inline SVG overlaid on the bottom-right of the avatar. Baked into the script, no external request.

**Verified checkmark:** Blue checkmark SVG next to the author name, matching the Elfsight style.

**"Read more" toggle:** Full text stored in a `data-full-text` attribute. Visible text shows the truncated version. Click swaps between truncated and full, link text toggles between "Read more" and "Show less".

**"Load More" button:** First render shows up to 9 cards (3 rows). Each click reveals the next batch of 9. When all reviews are visible, the button disappears.

**Header bar:**
```
┌─────────────────────────────────────────────────┐
│              5.0  Google Reviews                 │
│              ★★★★★ (80)                          │
└─────────────────────────────────────────────────┘
```
Light gray rounded background. The rating and total count come from the API response (Google provides these as aggregate values, not calculated from the cached subset).

**No jQuery. No dependencies. Pure vanilla JS.**

---

## How Reviewer Photos Load

The Google Places API returns `authorAttribution.photoUri` for each reviewer, pointing to Google's image CDN (`lh3.googleusercontent.com`). The widget creates `<img>` tags with `loading="lazy"` and these URLs as the `src`. The browser fetches the thumbnails directly from Google's servers in parallel with the page. No proxying through your container.

Since the widget is below the fold, `loading="lazy"` means the browser won't even request the images until the user scrolls near them. This keeps your initial page load fast.

For the initial-letter fallback avatars, the color palette uses 12 distinct colors assigned by taking the character code of the first letter modulo 12. This gives a consistent, deterministic color per name.

---

## Docker Deployment

### For your setup (existing Traefik + Portainer)

1. Create a new Portainer stack called `google-reviews`
2. Paste in the `docker-compose.yml` contents
3. Add the env vars in Portainer's environment section (or upload the `.env` file)
4. In Cloudflare, add a DNS A record: `reviews.vizcayadentalarts.com` pointing to your server's IP (proxied or DNS-only both work since you're using DNS challenge for certs)
5. Deploy the stack
6. Traefik picks up the new container, requests a Let's Encrypt cert via Cloudflare DNS challenge, and starts routing
7. Test: `curl https://reviews.vizcayadentalarts.com/health`

### For someone else (generic Docker setup)

The README walks through it:

1. Clone the repo
2. Copy `.env.example` to `.env` and fill in 3 required values
3. Run `docker compose up -d`
4. Point your domain to your server and set up a reverse proxy (README includes examples for Traefik, Nginx, and Caddy)
5. Add the 2-line embed code to your website

### For someone without a reverse proxy

The container works fine without Traefik. Someone running it locally or behind their own proxy can just map the port directly:

```yaml
services:
  reviews:
    build: .
    container_name: google-reviews-widget
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - reviews_data:/app/data
    env_file:
      - .env

volumes:
  reviews_data:
```

The `docker-compose.yml` in the repo should use this simpler version (just port mapping, no Traefik labels). The README then has a "Traefik integration" section with the labels to add, a "Nginx" section, and a "Caddy" section. This way the default compose file works for everyone, and people with specific reverse proxies add the config they need.

---

## Development Phases

### Phase 1: Backend (Day 1)

1. `npm init`, install `fastify`
2. Write `src/google.js`, test the Places API call standalone with your key
3. Write `src/cache.js` with merge/dedup logic, write unit-level tests with sample data
4. Write `src/poller.js` with setInterval loop
5. Write `src/origin.js` hook
6. Wire everything together in `src/server.js`
7. Run locally: `node src/server.js`
8. Confirm `/api/reviews` returns data
9. Confirm `data/reviews.json` is written and accumulating
10. Let it poll for 30 minutes, verify dedup works (no duplicates in the file)

### Phase 2: Docker + Deployment (Day 1-2)

1. Write the Dockerfile
2. Write `docker-compose.yml` (simple version with port mapping)
3. Build and test: `docker compose up --build`
4. Verify: clean startup, polls immediately, serves the endpoint
5. Test restart: `docker compose restart`, confirm data persists
6. Add Traefik labels for your deployment
7. Deploy as a Portainer stack
8. Add DNS record in Cloudflare
9. Test from browser: `https://reviews.vizcayadentalarts.com/api/reviews`
10. Test `/health` endpoint

### Phase 3: Frontend Widget (Day 2-3)

1. Write `public/widget.js` with hardcoded mock data to nail the visual layout
2. Style the header bar (aggregate rating, stars, total count)
3. Style the review cards (avatar, name, time, stars, text, "Read more")
4. Implement the responsive 3/2/1 column grid
5. Implement initial-letter avatar fallback with deterministic colors
6. Implement star rating SVGs (filled and empty states)
7. Implement "Read more" / "Show less" toggle
8. Implement "Load More" button (shows next batch of 9)
9. Add loading skeleton shimmer state
10. Wire up the real API fetch (replace mock data)
11. Test on desktop, tablet, mobile viewports
12. Embed in a Webflow test page and verify no style conflicts

### Phase 4: Polish and Ship (Day 3)

1. Add the Google "G" icon SVG overlay on avatars
2. Add the verified checkmark SVG
3. Fine-tune card shadows, spacing, typography against the Elfsight screenshot
4. Add dark mode support via `data-theme="dark"`
5. Write the README:
   - What it is (with screenshot)
   - Quick start (4 steps)
   - Configuration reference
   - Reverse proxy examples (Traefik, Nginx, Caddy)
   - How the accumulation strategy works
   - How to find your Place ID
   - How to get a Google API key and restrict it
6. Create `.env.example` and `.gitignore`
7. Test a clean clone + first-run experience (simulate a new user)
8. Push to GitHub

---

## API Response Format

The `/api/reviews` endpoint returns:

```json
{
  "rating": 5.0,
  "totalReviews": 80,
  "reviews": [
    {
      "id": "a1b2c3d4",
      "author": "Kenneth Kukish",
      "authorPhoto": "https://lh3.googleusercontent.com/a/...",
      "authorUrl": "https://www.google.com/maps/contrib/...",
      "rating": 5,
      "relativeTime": "11 days ago",
      "publishTime": "2026-02-17T14:30:00Z",
      "text": "I highly recommend Dr Kottar and Dr. Hong. I have had lots of dental issues over the years (crowns, root canals, etc.) and have seen several different...",
      "originalText": null
    }
  ],
  "totalCached": 23,
  "lastUpdated": "2026-02-28T12:00:00Z"
}
```

`rating` and `totalReviews` come from Google's aggregate data (the real 5.0 and 80), not calculated from the cached subset. `totalCached` tells you how many reviews are in the local cache. `lastUpdated` is when the last successful poll ran.

---

## Cost

**Google Places API:** ~288 requests/day at 5-min intervals. At $0.02/request that's ~$5.76/month. Google's $200/month free Maps Platform credit covers this entirely. Effective cost: **$0**.

**Docker:** You already run the server. The container uses ~30MB RAM and near-zero CPU. **$0**.

**Total: $0/month.**

---

## Security

- **API key stays server-side.** It's in the container's environment, never sent to the browser.
- **Origin validation** blocks unauthorized sites from calling your endpoint.
- **Google API key is IP-restricted** in Google Cloud Console to your server's public IP, and scoped to Places API only.
- **The widget script is public** (like any JS on a CDN). It contains no secrets.
- **The reviews.json file** lives inside a Docker volume, not web-accessible.
- **The .env file** is gitignored. Only `.env.example` is committed.
- **Atomic file writes** prevent data corruption on crash.
- **CORS headers** are set per-request to the matched origin, not a wildcard (except for the static `widget.js` file which is public).

---

## Future Additions (v2+)

- **JSON-LD schema markup:** Inject `Review` and `AggregateRating` structured data for SEO
- **Click-through links:** Review cards link to the reviewer's Google Maps profile; header links to your GBP page
- **Multi-location support:** Accept a config file with multiple Place IDs, serve different review sets based on a path parameter
- **Admin dashboard:** A simple protected page showing polling stats, cached review count, error log
- **Review filtering:** Exclude reviews below a star threshold via env var
- **Custom styling:** Support CSS custom properties (variables) so users can override colors without touching the source
- **Webhook notifications:** POST to a URL when a new review is detected (could feed into n8n for alerts)
