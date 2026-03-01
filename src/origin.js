function parseAllowedOrigins(raw) {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function extractOriginFromReferer(referer) {
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function createOriginGuard(allowedOrigins) {
  const allowed = new Set(allowedOrigins);

  return async function originGuard(request, reply) {
    const requestOrigin = request.headers.origin;
    const refererOrigin = request.headers.referer ? extractOriginFromReferer(request.headers.referer) : null;
    const matchedOrigin = allowed.has(requestOrigin) ? requestOrigin : (allowed.has(refererOrigin) ? refererOrigin : null);

    if (!matchedOrigin) {
      reply.code(403).send({ error: "Origin not allowed" });
      return;
    }

    reply.header("Access-Control-Allow-Origin", matchedOrigin);
    reply.header("Access-Control-Allow-Methods", "GET");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
    reply.header("Vary", "Origin");
  };
}

module.exports = {
  parseAllowedOrigins,
  createOriginGuard
};
