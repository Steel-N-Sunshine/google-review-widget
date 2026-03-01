(() => {
  const WIDGET_SELECTOR = '[data-widget="reviews"]';
  const DEFAULT_INITIAL_VISIBLE = 9;
  const LOAD_MORE_BATCH = 9;
  const TEXT_PREVIEW_LENGTH = 180;
  const AVATAR_COLORS = [
    "#5C6BC0",
    "#26A69A",
    "#42A5F5",
    "#AB47BC",
    "#EF5350",
    "#FFA726",
    "#8D6E63",
    "#7CB342",
    "#EC407A",
    "#29B6F6",
    "#FF7043",
    "#9CCC65"
  ];

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getApiBaseUrl() {
    const scriptTag = document.currentScript
      || Array.from(document.querySelectorAll("script[src]")).find((script) => script.src.includes("/widget.js"));
    if (!scriptTag || !scriptTag.src) return "";
    const url = new URL(scriptTag.src, window.location.href);
    return url.origin;
  }

  function truncateAtWord(text, maxLength) {
    const safeText = String(text || "").trim();
    if (safeText.length <= maxLength) return safeText;
    const sliced = safeText.slice(0, maxLength);
    const lastSpace = sliced.lastIndexOf(" ");
    const clipped = lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced;
    return `${clipped}...`;
  }

  function getAvatarColor(name) {
    const first = (String(name || "A").trim()[0] || "A").toUpperCase();
    const code = first.charCodeAt(0) || 65;
    return AVATAR_COLORS[code % AVATAR_COLORS.length];
  }

  function makeStars(rating) {
    const count = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    let stars = "";
    for (let i = 0; i < 5; i += 1) {
      const fill = i < count ? "#F4B400" : "#E3E6EA";
      stars += `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="${fill}" d="M12 2l2.95 6.06 6.69.98-4.82 4.72 1.14 6.66L12 17.27 6.04 20.42l1.14-6.66L2.36 9.04l6.69-.98L12 2z"/></svg>`;
    }
    return stars;
  }

  function googleIconSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.8 12.23c0-.73-.07-1.43-.19-2.11H12v4h5.5a4.71 4.71 0 0 1-2.04 3.1v2.57h3.3c1.93-1.78 3.04-4.4 3.04-7.56z"/><path fill="#34A853" d="M12 22c2.75 0 5.05-.91 6.73-2.45l-3.3-2.57c-.92.62-2.1.99-3.43.99-2.64 0-4.87-1.78-5.66-4.18H2.94v2.63A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.34 13.79a5.99 5.99 0 0 1 0-3.58V7.58H2.94a10 10 0 0 0 0 8.84l3.4-2.63z"/><path fill="#EA4335" d="M12 6.03c1.5 0 2.84.52 3.9 1.53l2.92-2.92C17.04 2.98 14.74 2 12 2a10 10 0 0 0-9.06 5.58l3.4 2.63C7.13 7.81 9.36 6.03 12 6.03z"/></svg>';
  }

  function verifiedSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#1A73E8" d="M12 2l2.9 2.1 3.6.3 1.2 3.4 2.2 2.8-2.2 2.8-1.2 3.4-3.6.3L12 20l-2.9-2.1-3.6-.3-1.2-3.4L2.1 11l2.2-2.8 1.2-3.4 3.6-.3L12 2zm-1.1 12.8 6-6-1.4-1.4-4.6 4.6-2.4-2.4-1.4 1.4 3.8 3.8z"/></svg>';
  }

  function buildStyles(theme) {
    const dark = theme === "dark";
    return `
      .grw-root { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: ${dark ? "#E9EEF5" : "#223143"}; }
      .grw-header { background: ${dark ? "#1C2633" : "#F3F5F8"}; border-radius: 14px; padding: 16px; text-align: center; margin-bottom: 16px; }
      .grw-header-score { font-size: 28px; font-weight: 700; line-height: 1.1; }
      .grw-header-label { font-size: 14px; opacity: .85; margin-left: 6px; }
      .grw-header-stars { margin-top: 8px; display: flex; gap: 4px; justify-content: center; align-items: center; }
      .grw-header-stars svg { width: 16px; height: 16px; }
      .grw-header-total { margin-left: 6px; font-size: 14px; opacity: .8; }
      .grw-grid { display: grid; gap: 14px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .grw-card { background: ${dark ? "#1A2431" : "#FFFFFF"}; border: 1px solid ${dark ? "#2A3A4F" : "#E5EAF0"}; border-radius: 14px; padding: 14px; box-shadow: ${dark ? "none" : "0 2px 10px rgba(15, 23, 42, 0.06)"}; }
      .grw-top { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
      .grw-avatar-wrap { position: relative; width: 42px; height: 42px; flex: 0 0 42px; }
      .grw-avatar { width: 42px; height: 42px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 16px; }
      .grw-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .grw-g-icon { position: absolute; right: -2px; bottom: -2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 1px solid #DCE3EA; padding: 1px; box-sizing: border-box; }
      .grw-g-icon svg { width: 100%; height: 100%; display: block; }
      .grw-author { display: flex; align-items: center; gap: 5px; font-size: 14px; font-weight: 600; }
      .grw-author svg { width: 14px; height: 14px; }
      .grw-time { margin-top: 2px; font-size: 12px; opacity: .7; }
      .grw-stars { display: flex; gap: 2px; margin-bottom: 10px; }
      .grw-stars svg { width: 15px; height: 15px; }
      .grw-text { font-size: 14px; line-height: 1.45; white-space: pre-wrap; }
      .grw-toggle { margin-top: 6px; border: 0; background: transparent; color: #1A73E8; font-size: 13px; cursor: pointer; padding: 0; }
      .grw-load-more { margin: 16px auto 0; display: block; border: 1px solid #CFD8E3; background: ${dark ? "#1A2431" : "#fff"}; color: ${dark ? "#E9EEF5" : "#1F2A3A"}; border-radius: 999px; padding: 10px 16px; font-size: 14px; cursor: pointer; }
      .grw-skeleton { background: ${dark ? "#1A2431" : "#FFFFFF"}; border: 1px solid ${dark ? "#2A3A4F" : "#E5EAF0"}; border-radius: 14px; padding: 14px; }
      .grw-shimmer { position: relative; overflow: hidden; background: ${dark ? "#243245" : "#E9EEF4"}; border-radius: 8px; }
      .grw-shimmer::after { content: ""; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent); animation: grwShimmer 1.4s infinite; }
      .grw-sk-a { width: 42px; height: 42px; border-radius: 50%; margin-bottom: 10px; }
      .grw-sk-b { width: 55%; height: 12px; margin-bottom: 8px; }
      .grw-sk-c { width: 35%; height: 10px; margin-bottom: 12px; }
      .grw-sk-d { width: 95%; height: 10px; margin-bottom: 6px; }
      .grw-sk-e { width: 85%; height: 10px; margin-bottom: 6px; }
      .grw-sk-f { width: 70%; height: 10px; }
      @keyframes grwShimmer { 100% { transform: translateX(100%); } }
      @media (max-width: 768px) { .grw-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 480px) { .grw-grid { grid-template-columns: 1fr; } }
    `;
  }

  function renderSkeleton(root) {
    root.innerHTML = `
      <div class="grw-grid">
        ${[0, 1, 2]
          .map(
            () => `
              <div class="grw-skeleton">
                <div class="grw-shimmer grw-sk-a"></div>
                <div class="grw-shimmer grw-sk-b"></div>
                <div class="grw-shimmer grw-sk-c"></div>
                <div class="grw-shimmer grw-sk-d"></div>
                <div class="grw-shimmer grw-sk-e"></div>
                <div class="grw-shimmer grw-sk-f"></div>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderWidget(container, data, state) {
    const safeRating = Number.isFinite(data.rating) ? data.rating.toFixed(1) : "N/A";
    const safeTotal = Number.isFinite(data.totalReviews) ? data.totalReviews : 0;
    const total = Array.isArray(data.reviews) ? data.reviews.length : 0;
    const visibleCount = Math.min(state.visibleCount, total);
    const visibleReviews = data.reviews.slice(0, visibleCount);
    const hasMore = visibleCount < total;

    const cards = visibleReviews
      .map((review, index) => {
        const absoluteIndex = index;
        const fullText = String(review.text || "");
        const shortText = truncateAtWord(fullText, TEXT_PREVIEW_LENGTH);
        const canToggle = fullText.length > shortText.length;
        const expanded = state.expanded.has(absoluteIndex);
        const shownText = expanded ? fullText : shortText;
        const author = escapeHtml(review.author || "Anonymous");
        const relativeTime = escapeHtml(review.relativeTime || "");

        const avatar = review.authorPhoto
          ? `<div class="grw-avatar"><img src="${escapeHtml(review.authorPhoto)}" alt="${author}" loading="lazy" referrerpolicy="no-referrer" /></div>`
          : `<div class="grw-avatar" style="background:${getAvatarColor(author)}">${escapeHtml((author[0] || "A").toUpperCase())}</div>`;

        return `
          <article class="grw-card">
            <div class="grw-top">
              <div class="grw-avatar-wrap">
                ${avatar}
                <span class="grw-g-icon">${googleIconSvg()}</span>
              </div>
              <div>
                <div class="grw-author">${author} ${verifiedSvg()}</div>
                <div class="grw-time">${relativeTime}</div>
              </div>
            </div>
            <div class="grw-stars">${makeStars(review.rating)}</div>
            <div class="grw-text">${escapeHtml(shownText)}</div>
            ${canToggle ? `<button class="grw-toggle" type="button" data-action="toggle" data-index="${absoluteIndex}">${expanded ? "Show less" : "Read more"}</button>` : ""}
          </article>
        `;
      })
      .join("");

    container.innerHTML = `
      <div class="grw-header">
        <div>
          <span class="grw-header-score">${safeRating}</span>
          <span class="grw-header-label">Google Reviews</span>
        </div>
        <div class="grw-header-stars">${makeStars(Math.round(Number(data.rating) || 0))}<span class="grw-header-total">(${safeTotal})</span></div>
      </div>
      <div class="grw-grid">${cards}</div>
      ${hasMore ? '<button class="grw-load-more" type="button" data-action="load-more">Load More</button>' : ""}
    `;
  }

  async function init() {
    const container = document.querySelector(WIDGET_SELECTOR);
    if (!container) return;

    const theme = container.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const initialVisible = Math.max(1, Number(container.getAttribute("data-max-visible")) || DEFAULT_INITIAL_VISIBLE);
    const apiBase = getApiBaseUrl();
    if (!apiBase) return;

    const root = document.createElement("div");
    root.className = "grw-root";
    container.innerHTML = "";
    container.appendChild(root);

    const styleEl = document.createElement("style");
    styleEl.textContent = buildStyles(theme);
    container.prepend(styleEl);

    renderSkeleton(root);

    try {
      const response = await fetch(`${apiBase}/api/reviews`, { method: "GET", credentials: "omit" });
      if (!response.ok) throw new Error(`Widget fetch failed with status ${response.status}`);
      const payload = await response.json();
      const data = {
        rating: payload.rating ?? null,
        totalReviews: payload.totalReviews ?? null,
        reviews: Array.isArray(payload.reviews) ? payload.reviews : []
      };

      const state = {
        visibleCount: initialVisible,
        expanded: new Set()
      };

      renderWidget(root, data, state);

      root.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const action = target.getAttribute("data-action");

        if (action === "toggle") {
          const index = Number(target.getAttribute("data-index"));
          if (!Number.isInteger(index)) return;
          if (state.expanded.has(index)) {
            state.expanded.delete(index);
          } else {
            state.expanded.add(index);
          }
          renderWidget(root, data, state);
          return;
        }

        if (action === "load-more") {
          state.visibleCount = Math.min(data.reviews.length, state.visibleCount + LOAD_MORE_BATCH);
          renderWidget(root, data, state);
        }
      });
    } catch (error) {
      console.error("[google-reviews-widget] Failed to render widget:", error);
      root.innerHTML = "";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    void init();
  }
})();
