require("dotenv").config();

const path = require("node:path");
const fs = require("node:fs/promises");
const Fastify = require("fastify");
const { loadFromDisk } = require("./cache");
const { createPoller } = require("./poller");
const { parseAllowedOrigins, createOriginGuard } = require("./origin");

const PORT = Number(process.env.PORT || 3000);
const POLL_INTERVAL_MINUTES = Math.max(1, Number(process.env.POLL_INTERVAL_MINUTES || 5));
const MAX_REVIEWS = Math.max(1, Number(process.env.MAX_REVIEWS || 50));
const DISABLE_AUTO_TRANSLATIONS = String(process.env.DISABLE_AUTO_TRANSLATIONS || "true").toLowerCase() !== "false";
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";
const GOOGLE_PLACE_ID = process.env.GOOGLE_PLACE_ID || "";
const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
const CACHE_FILE = path.join(process.cwd(), "data", "reviews.json");
const WIDGET_FILE = path.join(process.cwd(), "public", "widget.js");
const TEST_FILE = path.join(process.cwd(), "test.html");

if (!GOOGLE_API_KEY || !GOOGLE_PLACE_ID) {
  throw new Error("Missing GOOGLE_API_KEY or GOOGLE_PLACE_ID in environment.");
}

if (ALLOWED_ORIGINS.length === 0) {
  throw new Error("ALLOWED_ORIGINS must include at least one origin.");
}

const app = Fastify({ logger: false });
let widgetScript = "";
let testHtml = "";
let cacheState = {
  rating: null,
  totalReviews: null,
  reviews: [],
  totalCached: 0,
  lastUpdated: null,
  lastPoll: null
};

function getState() {
  return cacheState;
}

function setState(next) {
  cacheState = next;
}

const originGuard = createOriginGuard(ALLOWED_ORIGINS);

app.options("/api/reviews", async (request, reply) => {
  await originGuard(request, reply);
  if (reply.sent) return;
  reply.code(204).send();
});

app.get("/api/reviews", { preHandler: originGuard }, async (request, reply) => {
  reply.header("Cache-Control", "public, max-age=60");
  return {
    rating: cacheState.rating,
    totalReviews: cacheState.totalReviews,
    reviews: cacheState.reviews,
    totalCached: cacheState.totalCached,
    lastUpdated: cacheState.lastUpdated
  };
});

app.get("/widget.js", async (_, reply) => {
  reply.header("Content-Type", "application/javascript; charset=utf-8");
  reply.header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  reply.header("Access-Control-Allow-Origin", "*");
  return widgetScript;
});

app.get("/test.html", async (_, reply) => {
  if (!testHtml) {
    reply.code(404).send("test.html not found");
    return;
  }

  reply.header("Content-Type", "text/html; charset=utf-8");
  reply.header("Cache-Control", "no-store");
  return testHtml;
});

app.get("/health", async () => {
  return {
    status: "ok",
    reviewsCached: cacheState.reviews.length,
    lastPoll: cacheState.lastPoll
  };
});

async function bootstrap() {
  const [diskCache, loadedWidget, loadedTestHtml] = await Promise.all([
    loadFromDisk(CACHE_FILE),
    fs.readFile(WIDGET_FILE, "utf8"),
    fs.readFile(TEST_FILE, "utf8").catch(() => "")
  ]);

  widgetScript = loadedWidget;
  testHtml = loadedTestHtml;

  if (diskCache) {
    cacheState = {
      ...cacheState,
      ...diskCache,
      totalCached: Array.isArray(diskCache.reviews) ? diskCache.reviews.length : 0
    };
  }

  await app.listen({ host: "0.0.0.0", port: PORT });

  const poller = createPoller({
    apiKey: GOOGLE_API_KEY,
    placeId: GOOGLE_PLACE_ID,
    disableAutoTranslations: DISABLE_AUTO_TRANSLATIONS,
    maxReviews: MAX_REVIEWS,
    cacheFilePath: CACHE_FILE,
    getState,
    setState
  });

  await poller.pollOnce();
  poller.start(POLL_INTERVAL_MINUTES * 60 * 1000);

  console.info(
    `Server listening on :${PORT} | Polling every ${POLL_INTERVAL_MINUTES}m | ${cacheState.reviews.length} reviews cached`
  );
}

bootstrap().catch((error) => {
  console.error("[server] Fatal startup error:", error);
  process.exit(1);
});
