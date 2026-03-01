# Google Reviews Widget

Self-hosted Google Reviews widget with a tiny Fastify API and a dependency-free frontend script.

- Polls Google Places API on a fixed interval
- Accumulates unique reviews over time (beyond the 5 returned per call)
- Persists cache to disk in a Docker volume
- Serves a drop-in widget script for any website

## Quick Start

1. Copy `.env.example` to `.env`
2. Fill in `GOOGLE_API_KEY`, `GOOGLE_PLACE_ID`, `ALLOWED_ORIGINS`
3. Run:

```bash
docker compose up --build -d
```

4. Test:

```bash
curl http://localhost:3000/health
curl -H "Origin: https://www.yourwebsite.com" http://localhost:3000/api/reviews
```

## Embed On Your Site

```html
<script src="https://reviews.yourdomain.com/widget.js" async></script>
<div data-widget="reviews"></div>
```

Optional attributes:

- `data-max-visible="9"`: number of cards shown initially
- `data-theme="light"` or `data-theme="dark"`

## Environment Variables

Required:

- `GOOGLE_API_KEY`: Google Places API key
- `GOOGLE_PLACE_ID`: Place ID for your business
- `ALLOWED_ORIGINS`: comma-separated list of allowed origins for `/api/reviews`

Optional:

- `POLL_INTERVAL_MINUTES` (default `5`)
- `MAX_REVIEWS` (default `50`)
- `PORT` (default `3000`)
- `REVIEWS_SORT` (currently informational; request uses Places API review default fields)
- `WIDGET_HOST` (for reverse-proxy label examples)

## API Endpoints

- `GET /api/reviews` - returns cached review payload
- `GET /widget.js` - serves embeddable client script
- `GET /health` - health and cache status

Example response from `/api/reviews`:

```json
{
  "rating": 5,
  "totalReviews": 80,
  "reviews": [
    {
      "id": "a1b2c3d4e5f6",
      "author": "Jane Doe",
      "authorPhoto": null,
      "authorUrl": null,
      "rating": 5,
      "relativeTime": "2 weeks ago",
      "publishTime": "2026-02-20T10:30:00Z",
      "text": "Great experience...",
      "originalText": null
    }
  ],
  "totalCached": 23,
  "lastUpdated": "2026-02-28T12:00:00.000Z"
}
```

## Development

Run locally:

```bash
npm install
npm start
```

The app writes cache data to `data/reviews.json`.

## Reverse Proxy Notes

The included `docker-compose.yml` is proxy-agnostic and maps `3000:3000`.

### Traefik Labels Example

Add these labels to the `reviews` service:

```yaml
labels:
  - traefik.enable=true
  - traefik.http.routers.reviews.rule=Host(`${WIDGET_HOST}`)
  - traefik.http.routers.reviews.tls=true
  - traefik.http.routers.reviews.entrypoints=websecure
  - traefik.http.routers.reviews.tls.certresolver=mytlschallenge
  - traefik.http.services.reviews.loadbalancer.server.port=3000
```

### Nginx Example

```nginx
server {
  server_name reviews.yourdomain.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

### Caddy Example

```caddy
reviews.yourdomain.com {
  reverse_proxy 127.0.0.1:3000
}
```

## Security Model

- Google API key stays server-side only
- `/api/reviews` enforces origin validation
- `widget.js` is intentionally public and cacheable
- Cache file is written atomically to prevent corruption
- `.env` is gitignored by default
