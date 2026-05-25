# Google Reviews Widget

Self-hosted Google Reviews widget with:

- A Fastify backend that fetches and caches Google reviews
- A dependency-free embeddable frontend script (`/widget.js`)
- Docker-first deployment with persistent cache storage

## What You Get

- Polls Google Place Details on a schedule and stores unique reviews over time
- Keeps Google API key server-side (never exposed in embed code)
- Serves an embeddable widget for any allowed website origin
- Ships a prebuilt Docker image for `linux/amd64` and `linux/arm64`

## Docker Image

Pull latest:

```bash
docker pull steelnsunshine/google-reviews-widget:latest
```

Pin to any release tag:

```bash
docker pull steelnsunshine/google-reviews-widget:vX.Y.Z
```

Current release at the time of writing: `v0.2.6`:

```bash
docker pull steelnsunshine/google-reviews-widget:v0.2.6
```

Image publishing is automated by GitHub Actions on each published GitHub release (including `latest` and semver tags).

## Advantages and Limitations

### Advantages

- Avoids relying on Google Business Profile API access, which is often harder to get approved and may add operational risk for many self-hosted users.
- Uses Google Places API (Legacy) and always requests newest-first review sorting to support ongoing cache growth.
- Starts simple and stable: server-side polling, disk-backed cache, and lightweight embed script.

### Limitations

- Google Places responses contain only 5 reviews. On first startup, cached history starts from what is immediately available.
- Cache grows over time as new unique reviews appear in subsequent polls, up to `MAX_REVIEWS`.
- New Places API behavior is relevance-focused for reviews, so it is less suitable when newest-first accumulation is required.

## Prerequisites

- Docker + Docker Compose plugin
- A public DNS record for your widget hostname (example: `reviews.example.com`)
- Google Cloud API key for Places API
- Cloudflare API token (if using Cloudflare with Traefik DNS-01)

## 1) Google Cloud Setup (API Key + Place ID)

This project uses a server-side **Google API key** (not OAuth user scopes).

### Enable the API

1. In Google Cloud Console, create/select a project.
2. Enable **Places API (Legacy)**.
   - Current backend uses the Place Details legacy endpoint.
3. Create an API key.

### Recommended API Key Restrictions

- **Application restriction**: IP addresses (your server IP), if feasible.
- **API restrictions**: limit to Places API.

### Get `GOOGLE_PLACE_ID` with Place ID Finder

1. Open Google's Place ID Finder: [https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder](https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder)
2. Search your business/location.
3. Copy the Place ID string.
4. Set it in your `.env` as `GOOGLE_PLACE_ID`.
5. Verify by starting the app and checking:
   - `GET /health` returns `status: ok`
   - `GET /api/reviews` returns rating/reviews data after first poll

## 2) Cloudflare Token for Traefik DNS-01

For Traefik DNS challenge with Cloudflare, create a token with:

- **Permissions**
  - `Zone:DNS:Edit`
  - `Zone:Zone:Read`
- **Zone resources**
  - Recommended: only the specific zone required for this widget domain (least privilege)
  - Avoid granting all zones unless absolutely necessary

Use the token as `CF_DNS_API_TOKEN` in Traefik.

If you use another DNS provider, keep DNS-01 but use that provider's required env vars and Traefik DNS provider settings. See Traefik ACME DNS challenge docs for your provider.

## Environment Variables

The widget container expects:

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOGLE_API_KEY` | yes | - | Google Places API key |
| `GOOGLE_PLACE_ID` | yes | - | Place ID for one business location |
| `ALLOWED_ORIGINS` | yes | - | Comma-separated allowed origins for `/api/reviews` |
| `POLL_INTERVAL_MINUTES` | no | `5` | Poll frequency (minimum enforced: `1`) |
| `MAX_REVIEWS` | no | `50` | Max reviews kept in cache (minimum enforced: `1`) |
| `DISABLE_AUTO_TRANSLATIONS` | no | `true` | Disable Google's auto-translation of reviews |
| `PORT` | no | `3000` | Internal app port |
| `WIDGET_HOST` | no | - | Hostname used only for Docker Compose/Traefik label substitution; the app itself does not read this value |
| `ACME_EMAIL` | no | - | Contact email used by Traefik/Let's Encrypt ACME in the standalone Traefik example |
| `CF_DNS_API_TOKEN` | no | - | Cloudflare DNS API token used by Traefik for DNS-01 certificate validation |

Example `.env`:

```dotenv
GOOGLE_API_KEY=your_google_places_api_key
GOOGLE_PLACE_ID=your_google_place_id
ALLOWED_ORIGINS=https://www.example.com,https://example.com
POLL_INTERVAL_MINUTES=5
MAX_REVIEWS=50
PORT=3000
WIDGET_HOST=reviews.example.com
ACME_EMAIL=you@example.com
docker CF_DNS_API_TOKEN=your_cloudflare_dns_token
```

`WIDGET_HOST`, `ACME_EMAIL`, and `CF_DNS_API_TOKEN` are optional unless you are using the provided Traefik-based Compose examples. The app itself does not read `WIDGET_HOST`, and Traefik is the component that uses `ACME_EMAIL` and `CF_DNS_API_TOKEN` for certificate issuance.

## Recommended Deployment: Docker Compose + Traefik + Cloudflare DNS-01

This is the easiest fully-managed path if you are not already running Traefik.

`docker-compose.traefik.yml`:

```yaml
services:
  traefik:
    image: traefik:v2.11
    container_name: traefik
    restart: unless-stopped
    command:
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.le.acme.email=${ACME_EMAIL}
      - --certificatesresolvers.le.acme.storage=/letsencrypt/acme.json
      - --certificatesresolvers.le.acme.dnschallenge=true
      - --certificatesresolvers.le.acme.dnschallenge.provider=cloudflare
    environment:
      - CF_DNS_API_TOKEN=${CF_DNS_API_TOKEN}
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik_letsencrypt:/letsencrypt
    networks:
      - proxy

  reviews:
    image: steelnsunshine/google-reviews-widget:latest
    container_name: google-reviews-widget
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - reviews_data:/app/data
    labels:
      - traefik.enable=true
      - traefik.docker.network=proxy
      - traefik.http.routers.reviews.rule=Host(`${WIDGET_HOST}`)
      - traefik.http.routers.reviews.entrypoints=websecure
      - traefik.http.routers.reviews.tls=true
      - traefik.http.routers.reviews.tls.certresolver=le
      - traefik.http.services.reviews.loadbalancer.server.port=3000
    networks:
      - proxy

volumes:
  traefik_letsencrypt:
  reviews_data:

networks:
  proxy:
    name: proxy
```

`.env.traefik`:

```dotenv
ACME_EMAIL=you@example.com
CF_DNS_API_TOKEN=your_cloudflare_dns_token
```

Run:

```bash
docker compose --env-file .env.traefik -f docker-compose.traefik.yml up -d
```

### Important: Cloudflare Proxy + DNS-01

If your DNS record is proxied through Cloudflare (orange cloud), use DNS-01 as shown above. This avoids HTTP challenge issues through the proxy.

Also set Cloudflare SSL/TLS mode to **Full (strict)**.

## If You Already Have Traefik Running

Use a service-only compose and join Traefik's external network.

`docker-compose.widget.yml`:

```yaml
services:
  reviews:
    image: steelnsunshine/google-reviews-widget:latest
    container_name: google-reviews-widget
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - reviews_data:/app/data
    labels:
      - traefik.enable=true
      - traefik.docker.network=${TRAEFIK_NETWORK}
      - traefik.http.routers.reviews.rule=Host(`${WIDGET_HOST}`)
      - traefik.http.routers.reviews.entrypoints=websecure
      - traefik.http.routers.reviews.tls=true
      - traefik.http.routers.reviews.tls.certresolver=${TRAEFIK_CERT_RESOLVER}
      - traefik.http.services.reviews.loadbalancer.server.port=3000
    networks:
      - traefik

volumes:
  reviews_data:

networks:
  traefik:
    external: true
    name: ${TRAEFIK_NETWORK}
```

Additional env values:

```dotenv
TRAEFIK_NETWORK=proxy
TRAEFIK_CERT_RESOLVER=le
```

Run:

```bash
docker compose -f docker-compose.widget.yml up -d
```

## Multi-Location Setup (Multiple Containers)

Run one container/service per location. Each location should have:

- Its own `GOOGLE_PLACE_ID`
- Its own hostname/router name
- Its own persistent data volume
- Its own `.env` file (recommended)

Example with existing Traefik:

```yaml
services:
  reviews_location_a:
    image: steelnsunshine/google-reviews-widget:latest
    env_file: .env.location-a
    volumes:
      - reviews_data_a:/app/data
    labels:
      - traefik.enable=true
      - traefik.docker.network=${TRAEFIK_NETWORK}
      - traefik.http.routers.reviews-a.rule=Host(`reviews-a.example.com`)
      - traefik.http.routers.reviews-a.entrypoints=websecure
      - traefik.http.routers.reviews-a.tls=true
      - traefik.http.routers.reviews-a.tls.certresolver=${TRAEFIK_CERT_RESOLVER}
      - traefik.http.services.reviews-a.loadbalancer.server.port=3000
    networks: [traefik]

  reviews_location_b:
    image: steelnsunshine/google-reviews-widget:latest
    env_file: .env.location-b
    volumes:
      - reviews_data_b:/app/data
    labels:
      - traefik.enable=true
      - traefik.docker.network=${TRAEFIK_NETWORK}
      - traefik.http.routers.reviews-b.rule=Host(`reviews-b.example.com`)
      - traefik.http.routers.reviews-b.entrypoints=websecure
      - traefik.http.routers.reviews-b.tls=true
      - traefik.http.routers.reviews-b.tls.certresolver=${TRAEFIK_CERT_RESOLVER}
      - traefik.http.services.reviews-b.loadbalancer.server.port=3000
    networks: [traefik]

volumes:
  reviews_data_a:
  reviews_data_b:

networks:
  traefik:
    external: true
    name: ${TRAEFIK_NETWORK}
```

## Embed on Your Site

Basic embed:

```html
<script src="https://reviews.example.com/widget.js" async></script>
<div data-widget="reviews"></div>
```

Advanced embed (all current data attributes):

```html
<script src="https://reviews.example.com/widget.js" async></script>
<div
  data-widget="reviews"
  data-grw-theme="light"
  data-grw-desktop-initial="12"
  data-grw-mobile-initial="6"
  data-grw-desktop-batch="12"
  data-grw-mobile-batch="6"
  data-grw-max-width="1280"
  data-grw-mobile-breakpoint="600"
  data-grw-card-width="354"
  data-grw-column-gap="20"
  data-grw-row-gap="20"
  data-grw-show-load-more="true"
  data-grw-max-columns="4"
  data-grw-min-stars="5"
  data-grw-show-no-text-reviews="false"
></div>
```

### Configuration Reference

`data-widget="reviews"` is required so the script can find the mount container.

| Attribute | Type | Default | Valid Values / Range | Description |
|---|---|---|---|---|
| `data-grw-theme` | string | `light` | `light`, `dark` | Widget theme (`data-theme` is legacy fallback) |
| `data-grw-view-mode` | string | `masonry` | `masonry`, `carousel` | Layout mode (carousel sorts earliest to oldest) |
| `data-grw-name-display` | string | `full` | `full`, `first`, `initial`, `none` | How reviewer names are shown (`initial` = John D.) |
| `data-grw-locale` | string | (auto) | `en`, `he`, `es`, `fr`, etc. | Force a specific language (auto-detects RTL) |
| `data-grw-desktop-initial` | integer | `12` | `1..100` | Initial visible cards on desktop |
| `data-grw-mobile-initial` | integer | `6` | `1..100` | Initial visible cards on mobile |
| `data-grw-desktop-batch` | integer | `12` | `1..100` | Cards added by "Load more" button on desktop |
| `data-grw-mobile-batch` | integer | `6` | `1..100` | Cards added by "Load more" button on mobile |
| `data-grw-max-width` | integer | `1280` | `320..2000` | Max widget layout width in px |
| `data-grw-mobile-breakpoint` | integer | `600` | `320..1024` | Width breakpoint for mobile mode |
| `data-grw-card-width` | integer | `354` | `220..600` | Card width in px (desktop) |
| `data-grw-column-gap` | integer | `20` | `0..64` | Horizontal gap in px |
| `data-grw-row-gap` | integer | `20` | `0..64` | Vertical gap in px |
| `data-grw-show-load-more` | boolean | `true` | `true/false`, `1/0`, `yes/no`, `on/off` | Show/hide load-more button |
| `data-grw-max-columns` | integer | `4` | `1..8` | Maximum desktop columns |
| `data-grw-min-stars` | integer | `5` | `1..5` | Minimum star rating to render a review |
| `data-grw-show-no-text-reviews` | boolean | `false` | `true/false`, `1/0`, `yes/no`, `on/off` | Include/exclude empty-text reviews |

Notes:

- Invalid numbers fall back to defaults.
- Out-of-range values are clamped to the ranges above.
- Container `data-*` attributes override script query params when both are provided.

### Script Query Parameter Alternative

You can also configure via query params on script URL:

```html
<script
  src="https://reviews.example.com/widget.js?desktopInitial=9&mobileInitial=4&minStars=4&showLoadMore=false"
  async
></script>
<div data-widget="reviews"></div>
```

Supported query keys mirror the config field names:

- `viewMode`, `nameDisplay`, `locale`
- `desktopInitial`, `mobileInitial`, `desktopBatch`, `mobileBatch`
- `maxWidth`, `mobileBreakpoint`, `cardWidth`
- `columnGap`, `rowGap`, `maxColumns`
- `showLoadMore`, `minStars`, `showNoTextReviews`

## Features

### Carousel View
- Horizontal slider layout for reviews.
- **Earliest to Oldest:** Carousel mode automatically sorts reviews chronologically.
- Supports touch/swipe gestures on mobile devices.
- Responsive navigation buttons that adapt to text direction.

### Reviewer Name Display
Customize how names appear for privacy or aesthetic reasons:
- `full`: Complete name as provided by Google (default).
- `first`: Shows only the first name.
- `initial`: Shows the first name and last name's initial (e.g., "John D.").
- `none`: Hides the name and verified badge entirely.

### Internationalization & RTL
- Automatic Right-to-Left (RTL) detection for Hebrew and Arabic.
- Corrected carousel navigation and arrow orientation for RTL layouts.
- Optimized language resolution (URL parameter > Data attribute > Container lang > HTML lang).

## API Endpoints

- `GET /api/reviews` - cached review payload (origin-validated)
- `GET /widget.js` - embeddable script
- `GET /health` - health and cache status
- `GET /test.html` - local test page if present in container image

## Validate Deployment

```bash
curl -I https://reviews.example.com/widget.js
curl -H "Origin: https://www.example.com" https://reviews.example.com/api/reviews
curl https://reviews.example.com/health
```

Expected:

- `widget.js` returns HTTP 200
- `/api/reviews` returns JSON with rating/reviews
- `/health` returns JSON with `status: "ok"`

## Security Notes

- `GOOGLE_API_KEY` is used only server-side
- `/api/reviews` enforces allowed origin/referer checks
- Cache is written atomically under `/app/data` (persist with Docker volume)
- Keep `.env` files out of version control
