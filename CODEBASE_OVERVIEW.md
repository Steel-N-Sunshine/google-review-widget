# Codebase Overview

## What this project is

This repository is a self-hosted Google Reviews widget service built with Node.js and Fastify. It polls Google Places API, stores reviews locally, and serves them through an API and embeddable frontend script.

## Runtime flow

1. `src/server.js` loads environment variables and validates required settings.
2. Existing cache is loaded from disk (`src/cache.js`).
3. A poller (`src/poller.js`) fetches and merges review snapshots from Google (`src/google.js`).
4. The API (`/api/reviews`) serves cached review data with CORS origin checks (`src/origin.js`).
5. The embeddable script (`public/widget.js`) renders a responsive reviews UI in host pages.

## Main modules

- `src/server.js`: app bootstrap, routes, startup/shutdown lifecycle.
- `src/poller.js`: periodic refresh orchestration + cache updates.
- `src/google.js`: Google Places HTTP call and response normalization.
- `src/cache.js`: disk persistence with atomic writes.
- `src/origin.js`: allowlist-based CORS/origin guard logic.
- `public/widget.js`: dependency-free widget renderer and layout logic.

## Key configuration

Required env vars:
- `GOOGLE_API_KEY`
- `GOOGLE_PLACE_ID`
- `ALLOWED_ORIGINS`

Optional env vars:
- `POLL_INTERVAL_MINUTES`
- `MAX_REVIEWS`
- `PORT`
- `REVIEWS_SORT`
- `WIDGET_HOST`

## Operations notes

- Cache file path: `data/reviews.json`
- Health endpoint: `GET /health`
- Reviews endpoint: `GET /api/reviews`
- Widget script endpoint: `GET /widget.js`

## Strengths observed

- Clear separation of backend concerns.
- Persisted cache reduces API dependency for serving reads.
- Origin guard is explicit for protected API route.
- Frontend script is framework-agnostic and easy to embed.
