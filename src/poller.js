const { mergeReviews, saveToDisk } = require("./cache");
const { fetchGooglePlaceReviews } = require("./google");

function createPoller({
  apiKey,
  placeId,
  maxReviews,
  cacheFilePath,
  getState,
  setState,
  onPollError
}) {
  let timer = null;

  async function pollOnce() {
    try {
      const incoming = await fetchGooglePlaceReviews({ apiKey, placeId });
      const current = getState();
      const existingIds = new Set((current.reviews || []).map((r) => r.id));
      const mergedReviews = mergeReviews(current.reviews || [], incoming.reviews || [], maxReviews);
      const newCount = mergedReviews.reduce((acc, review) => acc + (existingIds.has(review.id) ? 0 : 1), 0);
      const now = new Date().toISOString();

      const nextState = {
        ...current,
        rating: incoming.rating ?? current.rating ?? null,
        totalReviews: incoming.totalReviews ?? current.totalReviews ?? null,
        reviews: mergedReviews,
        totalCached: mergedReviews.length,
        lastUpdated: now,
        lastPoll: now
      };

      setState(nextState);

      try {
        await saveToDisk(cacheFilePath, nextState);
      } catch (diskError) {
        console.error("[poller] Failed writing cache to disk:", diskError.message);
      }

      console.info(`[poller] Poll complete: ${newCount} new reviews added (total: ${mergedReviews.length})`);
      return nextState;
    } catch (error) {
      console.error("[poller] Poll failed:", error.message);
      if (typeof onPollError === "function") {
        onPollError(error);
      }
      return null;
    }
  }

  function start(intervalMs) {
    if (timer) return;
    timer = setInterval(() => {
      void pollOnce();
    }, intervalMs);
    timer.unref?.();
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    pollOnce,
    start,
    stop
  };
}

module.exports = {
  createPoller
};
