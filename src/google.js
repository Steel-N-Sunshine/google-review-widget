const { createReviewId } = require("./cache");

const GOOGLE_BASE_URL = "https://places.googleapis.com/v1/places";
const GOOGLE_FIELD_MASK = [
  "id",
  "displayName",
  "rating",
  "userRatingCount",
  "reviews.rating",
  "reviews.text.text",
  "reviews.originalText.text",
  "reviews.relativePublishTimeDescription",
  "reviews.publishTime",
  "reviews.authorAttribution.displayName",
  "reviews.authorAttribution.uri",
  "reviews.authorAttribution.photoUri"
].join(",");

function normalizeReview(review) {
  const author = review?.authorAttribution?.displayName || "Anonymous";
  const text = review?.text?.text || "";
  const originalText = review?.originalText?.text || null;

  return {
    id: createReviewId(author, text),
    author,
    authorPhoto: review?.authorAttribution?.photoUri || null,
    authorUrl: review?.authorAttribution?.uri || null,
    rating: Number.isFinite(review?.rating) ? review.rating : null,
    relativeTime: review?.relativePublishTimeDescription || null,
    publishTime: review?.publishTime || null,
    text,
    originalText
  };
}

async function fetchGooglePlaceReviews({ apiKey, placeId, reviewsSort = "NEWEST" }) {
  const sort = reviewsSort === "MOST_RELEVANT" ? "MOST_RELEVANT" : "NEWEST";
  const url = new URL(`${GOOGLE_BASE_URL}/${encodeURIComponent(placeId)}`);
  url.searchParams.set("reviewsSort", sort);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": GOOGLE_FIELD_MASK
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google Places API request failed (${response.status}): ${body || "no body"}`);
  }

  const payload = await response.json();
  const reviews = Array.isArray(payload.reviews) ? payload.reviews.map(normalizeReview) : [];

  return {
    rating: Number.isFinite(payload.rating) ? payload.rating : null,
    totalReviews: Number.isFinite(payload.userRatingCount) ? payload.userRatingCount : null,
    reviews
  };
}

module.exports = {
  fetchGooglePlaceReviews
};
