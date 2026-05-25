const { createReviewId } = require("./cache");

const GOOGLE_LEGACY_PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

function normalizeReview(review) {
  const author = review?.author_name || "Anonymous";
  const text = review?.text || "";
  const unixTime = Number(review?.time);
  const publishTime = Number.isFinite(unixTime) ? new Date(unixTime * 1000).toISOString() : null;

  return {
    id: createReviewId(author, text),
    author,
    authorPhoto: review?.profile_photo_url || null,
    authorUrl: review?.author_url || null,
    rating: Number.isFinite(review?.rating) ? review.rating : null,
    publishTime,
    text
  };
}

async function fetchGooglePlaceReviews({ apiKey, placeId, disableAutoTranslations = true }) {
  const url = new URL(GOOGLE_LEGACY_PLACE_DETAILS_URL);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "name,rating,user_ratings_total,reviews");
  url.searchParams.set("reviews_sort", "newest");
  if (disableAutoTranslations) {
    url.searchParams.set("reviews_no_translations", "true");
  }
  url.searchParams.set("key", apiKey);

  const response = await fetch(url, {
    method: "GET"
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google Places API request failed (${response.status}): ${body || "no body"}`);
  }

  const payload = await response.json();

  if (payload?.status && !["OK", "ZERO_RESULTS"].includes(payload.status)) {
    throw new Error(`Google Places legacy API error (${payload.status}): ${payload.error_message || "no error message"}`);
  }

  const result = payload?.result || {};
  const reviews = Array.isArray(result.reviews) ? result.reviews.map(normalizeReview) : [];

  return {
    rating: Number.isFinite(result.rating) ? result.rating : null,
    totalReviews: Number.isFinite(result.user_ratings_total) ? result.user_ratings_total : null,
    reviews
  };
}

module.exports = {
  fetchGooglePlaceReviews
};
