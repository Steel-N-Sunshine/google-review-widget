const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function createReviewId(author, text) {
  const safeAuthor = String(author || "").trim().toLowerCase();
  const safeText = String(text || "").trim().slice(0, 80).toLowerCase();
  return crypto.createHash("sha1").update(`${safeAuthor}|${safeText}`).digest("hex").slice(0, 12);
}

function sortByPublishTimeDesc(a, b) {
  const at = Date.parse(a.publishTime || "") || 0;
  const bt = Date.parse(b.publishTime || "") || 0;
  return bt - at;
}

async function loadFromDisk(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      rating: parsed.rating ?? null,
      totalReviews: parsed.totalReviews ?? null,
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
      totalCached: Number.isFinite(parsed.totalCached) ? parsed.totalCached : (Array.isArray(parsed.reviews) ? parsed.reviews.length : 0),
      lastUpdated: parsed.lastUpdated ?? null,
      lastPoll: parsed.lastPoll ?? null
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    console.error("[cache] Failed to read cache from disk:", error.message);
    return null;
  }
}

async function saveToDisk(filePath, data) {
  const dir = path.dirname(filePath);
  const tmpPath = `${filePath}.tmp`;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

function mergeReviews(existing = [], incoming = [], maxReviews = 50) {
  const map = new Map();

  for (const review of existing) {
    if (!review || typeof review !== "object") continue;
    const id = review.id || createReviewId(review.author, review.text);
    map.set(id, { ...review, id });
  }

  for (const review of incoming) {
    if (!review || typeof review !== "object") continue;
    const id = review.id || createReviewId(review.author, review.text);
    map.set(id, { ...review, id });
  }

  const merged = Array.from(map.values()).sort(sortByPublishTimeDesc);
  return merged.slice(0, Math.max(1, maxReviews));
}

module.exports = {
  createReviewId,
  loadFromDisk,
  saveToDisk,
  mergeReviews
};
