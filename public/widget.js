(() => {
  const WIDGET_SELECTOR = '[data-widget="reviews"]';
  const DEFAULT_CONFIG = Object.freeze({
    mobileBreakpoint: 600,
    mobileInitial: 6,
    desktopInitial: 12,
    mobileBatch: 6,
    desktopBatch: 12,
    maxColumns: 4,
    cardWidth: 354,
    columnGap: 20,
    rowGap: 20,
    maxWidth: 1280,
    showLoadMore: true,
    minStars: 5,
    showNoTextReviews: false
  });
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

  function getScriptContext() {
    const scriptTag = document.currentScript
      || Array.from(document.querySelectorAll("script[src]")).find((script) => script.src.includes("/widget.js"));
    if (!scriptTag || !scriptTag.src) return { scriptTag: null, scriptUrl: null };
    const url = new URL(scriptTag.src, window.location.href);
    return { scriptTag, scriptUrl: url };
  }

  function getApiBaseUrl(scriptUrl) {
    return scriptUrl ? scriptUrl.origin : "";
  }

  function parseInteger(value) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number.parseInt(String(value).trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseBoolean(value) {
    if (value === null || value === undefined || value === "") return null;
    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function sanitizeConfig(partial) {
    const merged = {
      ...DEFAULT_CONFIG,
      ...partial
    };

    return {
      desktopInitial: clamp(parseInteger(merged.desktopInitial) ?? DEFAULT_CONFIG.desktopInitial, 1, 100),
      mobileInitial: clamp(parseInteger(merged.mobileInitial) ?? DEFAULT_CONFIG.mobileInitial, 1, 100),
      desktopBatch: clamp(parseInteger(merged.desktopBatch) ?? DEFAULT_CONFIG.desktopBatch, 1, 100),
      mobileBatch: clamp(parseInteger(merged.mobileBatch) ?? DEFAULT_CONFIG.mobileBatch, 1, 100),
      maxWidth: clamp(parseInteger(merged.maxWidth) ?? DEFAULT_CONFIG.maxWidth, 320, 2000),
      mobileBreakpoint: clamp(parseInteger(merged.mobileBreakpoint) ?? DEFAULT_CONFIG.mobileBreakpoint, 320, 1024),
      cardWidth: clamp(parseInteger(merged.cardWidth) ?? DEFAULT_CONFIG.cardWidth, 220, 600),
      columnGap: clamp(parseInteger(merged.columnGap) ?? DEFAULT_CONFIG.columnGap, 0, 64),
      rowGap: clamp(parseInteger(merged.rowGap) ?? DEFAULT_CONFIG.rowGap, 0, 64),
      maxColumns: clamp(parseInteger(merged.maxColumns) ?? DEFAULT_CONFIG.maxColumns, 1, 8),
      showLoadMore: parseBoolean(merged.showLoadMore) ?? DEFAULT_CONFIG.showLoadMore,
      minStars: clamp(parseInteger(merged.minStars) ?? DEFAULT_CONFIG.minStars, 1, 5),
      showNoTextReviews: parseBoolean(merged.showNoTextReviews) ?? DEFAULT_CONFIG.showNoTextReviews
    };
  }

  function readConfigFromQuery(scriptUrl) {
    if (!scriptUrl) return {};
    const params = scriptUrl.searchParams;
    return {
      desktopInitial: params.get("desktopInitial"),
      mobileInitial: params.get("mobileInitial"),
      desktopBatch: params.get("desktopBatch"),
      mobileBatch: params.get("mobileBatch"),
      maxWidth: params.get("maxWidth"),
      mobileBreakpoint: params.get("mobileBreakpoint"),
      cardWidth: params.get("cardWidth"),
      columnGap: params.get("columnGap"),
      rowGap: params.get("rowGap"),
      showLoadMore: params.get("showLoadMore"),
      maxColumns: params.get("maxColumns"),
      minStars: params.get("minStars"),
      showNoTextReviews: params.get("showNoTextReviews")
    };
  }

  function readConfigFromDataAttributes(container) {
    return {
      desktopInitial: container.getAttribute("data-grw-desktop-initial"),
      mobileInitial: container.getAttribute("data-grw-mobile-initial"),
      desktopBatch: container.getAttribute("data-grw-desktop-batch"),
      mobileBatch: container.getAttribute("data-grw-mobile-batch"),
      maxWidth: container.getAttribute("data-grw-max-width"),
      mobileBreakpoint: container.getAttribute("data-grw-mobile-breakpoint"),
      cardWidth: container.getAttribute("data-grw-card-width"),
      columnGap: container.getAttribute("data-grw-column-gap"),
      rowGap: container.getAttribute("data-grw-row-gap"),
      showLoadMore: container.getAttribute("data-grw-show-load-more"),
      maxColumns: container.getAttribute("data-grw-max-columns"),
      minStars: container.getAttribute("data-grw-min-stars"),
      showNoTextReviews: container.getAttribute("data-grw-show-no-text-reviews")
    };
  }

  function truncateAtWord(text, maxLength) {
    const safeText = String(text || "").trim();
    if (safeText.length <= maxLength) return safeText;
    const sliced = safeText.slice(0, maxLength);
    const lastSpace = sliced.lastIndexOf(" ");
    const clipped = lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced;
    return `${clipped}...`;
  }

  function formatRelativeTimeFromPublishTime(publishTime, fallback = "") {
    const timestamp = Date.parse(String(publishTime || ""));
    if (!Number.isFinite(timestamp)) return String(fallback || "");

    const now = Date.now();
    const diffMs = timestamp - now;
    const absMs = Math.abs(diffMs);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;
    const year = 365 * day;

    const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

    if (absMs < hour) {
      return rtf.format(Math.round(diffMs / minute), "minute");
    }
    if (absMs < day) {
      return rtf.format(Math.round(diffMs / hour), "hour");
    }
    if (absMs < month) {
      return rtf.format(Math.round(diffMs / day), "day");
    }
    if (absMs < year) {
      return rtf.format(Math.round(diffMs / month), "month");
    }
    return rtf.format(Math.round(diffMs / year), "year");
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
      stars += `<span class="grw-star"><svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6.82617 11.442L3.54617 13.166C3.46353 13.2093 3.3704 13.2287 3.27732 13.2219C3.18425 13.2151 3.09494 13.1824 3.0195 13.1274C2.94406 13.0725 2.8855 12.9975 2.85045 12.911C2.8154 12.8245 2.80526 12.7299 2.82117 12.638L3.44817 8.98798C3.46192 8.908 3.456 8.82587 3.43091 8.74869C3.40582 8.67151 3.36232 8.6016 3.30417 8.54499L0.650168 5.95899C0.583317 5.89388 0.53602 5.81136 0.51363 5.72076C0.491239 5.63017 0.494647 5.53512 0.52347 5.44637C0.552292 5.35761 0.605378 5.27869 0.676721 5.21854C0.748065 5.15838 0.834818 5.1194 0.927168 5.10599L4.59317 4.57299C4.67344 4.56146 4.7497 4.53059 4.81537 4.48303C4.88105 4.43547 4.93418 4.37265 4.97017 4.29999L6.61017 0.977985C6.65153 0.894518 6.7154 0.824266 6.79455 0.775151C6.87371 0.726037 6.96501 0.700012 7.05817 0.700012C7.15132 0.700012 7.24263 0.726037 7.32178 0.775151C7.40094 0.824266 7.4648 0.894518 7.50617 0.977985L9.14717 4.29899C9.18307 4.37152 9.23604 4.43426 9.30153 4.48182C9.36702 4.52937 9.44308 4.56031 9.52317 4.57199L13.1892 5.10499C13.2815 5.1184 13.3683 5.15738 13.4396 5.21754C13.511 5.27769 13.564 5.35661 13.5929 5.44537C13.6217 5.53412 13.6251 5.62917 13.6027 5.71976C13.5803 5.81036 13.533 5.89288 13.4662 5.95798L10.8132 8.54398C10.7552 8.60049 10.7118 8.67024 10.6867 8.74723C10.6616 8.82422 10.6556 8.90616 10.6692 8.98598L11.2962 12.637C11.3122 12.7291 11.3021 12.8238 11.267 12.9105C11.232 12.9971 11.1733 13.0722 11.0977 13.1272C11.0221 13.1822 10.9326 13.2149 10.8393 13.2215C10.7461 13.2282 10.6528 13.2086 10.5702 13.165L7.29117 11.441C7.21946 11.4033 7.13967 11.3836 7.05867 11.3836C6.97767 11.3836 6.89788 11.4033 6.82617 11.441V11.442Z" fill="${fill}"></path></svg></span>`;
    }
    return stars;
  }

  function googleIconSvg(isDark) {
    const baseColor = isDark ? "rgb(34, 34, 34)" : "#fff";
    return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true"><g clip-path="url(#grw-a-1)"><path fill="${baseColor}" stroke="${baseColor}" stroke-linejoin="round" stroke-width="2" d="M11.854 1.023c5.965 0 10.8 4.836 10.8 10.8v.4c0 5.965-4.835 10.8-10.8 10.8-5.964 0-10.8-4.835-10.8-10.8v-.4c0-5.964 4.836-10.8 10.8-10.8Z"></path><path fill="url(#grw-b-3)" d="M6.382 13.906a6.04 6.04 0 0 1-.307-1.909H1.998c0 1.517.343 2.946.947 4.227l.124.254v.009a10.063 10.063 0 0 0 1.889 2.604l4.47-1.674a6.119 6.119 0 0 1-3.046-3.511Z"></path><path fill="url(#grw-c-4)" d="M18.672 4.607c-1.734-1.618-3.987-2.609-6.684-2.609-.531 1.11-.62 2.771 0 3.981 1.471 0 2.78.51 3.824 1.491l2.86-2.863Z"></path><path fill="url(#grw-d-5)" d="M11.988 5.979h.095L11.988 2a9.936 9.936 0 0 0-7.645 3.576c.257 1.483.97 2.435 3.12 2.586 1.084-1.324 2.709-2.182 4.525-2.182Z"></path><path fill="url(#grw-e-6)" d="M15.357 17.06c-.89.6-2.025.963-3.369.963-.784 1.263-1.31 2.562 0 3.972 2.529 0 4.674-.783 6.295-2.139l.317-.278c1.483-1.37 2.473-3.244 2.83-5.46.099-.607.149-1.24.149-1.894l-2.265.3-1.913 1.35-.036.177a4.596 4.596 0 0 1-1.813 2.871l-.194.138Z"></path><path fill="#3086FF" d="M11.997 10.183v3.863l5.368.005a4.958 4.958 0 0 1-.014.067h4.08a11.894 11.894 0 0 0-.034-3.94h-6.9v.005h-2.5Z"></path><path fill="url(#grw-f-7)" d="m6.322 10.324.072-.227A6.136 6.136 0 0 1 8.112 7.48c-.93-.157-3.262-1.525-3.566-2.14a10.066 10.066 0 0 0-1.477 2.174A9.885 9.885 0 0 0 2 12.21c.723.312 3.082.37 4.08 0a5.927 5.927 0 0 1 .243-1.885Z"></path><path fill="url(#grw-g-8)" d="m8.03 2.816 1.713 3.623c-.754.322-1.43.8-1.99 1.392l-3.77-1.798A10.016 10.016 0 0 1 8.03 2.816Z"></path><path fill="url(#grw-h-9)" d="M11.988 18.023a5.733 5.733 0 0 1-3.047-.878l-1.56-.043c-1.84.488-2.373.882-2.54 1.872a9.934 9.934 0 0 0 7.147 3.021v-3.972Z"></path><path fill="url(#grw-i-2)" d="M11.988 21.995c.421 0 .832-.021 1.231-.064v-4.016c-.388.07-.799.108-1.231.108-.412 0-.814-.044-1.202-.128v4.029c.394.047.795.071 1.202.071Z" opacity=".5"></path></g><defs><radialGradient id="grw-b-3" cx="0" cy="0" r="1" gradientTransform="matrix(-.39757 -10.0208 14.2942 -.60134 9.338 18.94)" gradientUnits="userSpaceOnUse"><stop offset=".142" stop-color="#1ABD4D"></stop><stop offset=".248" stop-color="#6EC30D"></stop><stop offset=".312" stop-color="#8AC502"></stop><stop offset=".366" stop-color="#A2C600"></stop><stop offset=".446" stop-color="#C8C903"></stop><stop offset=".54" stop-color="#EBCB03"></stop><stop offset=".616" stop-color="#F7CD07"></stop><stop offset=".699" stop-color="#FDCD04"></stop><stop offset=".771" stop-color="#FDCE05"></stop><stop offset=".861" stop-color="#FFCE0A"></stop></radialGradient><radialGradient id="grw-c-4" cx="0" cy="0" r="1" gradientTransform="matrix(6.98036 -.00002 -.00001 8.69591 18.395 7.264)" gradientUnits="userSpaceOnUse"><stop offset=".408" stop-color="#FB4E5A"></stop><stop offset="1" stop-color="#FF4540"></stop></radialGradient><radialGradient id="grw-d-5" cx="0" cy="0" r="1" gradientTransform="matrix(-9.6911 5.28673 7.28367 12.9529 14.733 .725)" gradientUnits="userSpaceOnUse"><stop offset=".231" stop-color="#FF4541"></stop><stop offset=".312" stop-color="#FF4540"></stop><stop offset=".458" stop-color="#FF4640"></stop><stop offset=".54" stop-color="#FF473F"></stop><stop offset=".699" stop-color="#FF5138"></stop><stop offset=".771" stop-color="#FF5B33"></stop><stop offset=".861" stop-color="#FF6C29"></stop><stop offset="1" stop-color="#FF8C18"></stop></radialGradient><radialGradient id="grw-e-6" cx="0" cy="0" r="1" gradientTransform="matrix(-17.1717 -22.6188 -8.27422 6.39593 12.223 20.718)" gradientUnits="userSpaceOnUse"><stop offset=".132" stop-color="#0CBA65"></stop><stop offset=".21" stop-color="#0BB86D"></stop><stop offset=".297" stop-color="#09B479"></stop><stop offset=".396" stop-color="#08AD93"></stop><stop offset=".477" stop-color="#0AA6A9"></stop><stop offset=".568" stop-color="#0D9CC6"></stop><stop offset=".667" stop-color="#1893DD"></stop><stop offset=".769" stop-color="#258BF1"></stop><stop offset=".801" stop-color="#3086FF"></stop></radialGradient><radialGradient id="grw-f-7" cx="0" cy="0" r="1" gradientTransform="matrix(-1.20389 10.4771 14.3476 1.68068 10.996 3.988)" gradientUnits="userSpaceOnUse"><stop offset=".366" stop-color="#FF4E3A"></stop><stop offset=".458" stop-color="#FF8A1B"></stop><stop offset=".54" stop-color="#FFA312"></stop><stop offset=".616" stop-color="#FFB60C"></stop><stop offset=".771" stop-color="#FFCD0A"></stop><stop offset=".861" stop-color="#FECF0A"></stop><stop offset=".915" stop-color="#FECF08"></stop><stop offset="1" stop-color="#FDCD01"></stop></radialGradient><radialGradient id="grw-g-8" cx="0" cy="0" r="1" gradientTransform="matrix(-3.50897 3.94947 -10.9461 -10.0722 9.372 3.77)" gradientUnits="userSpaceOnUse"><stop offset=".316" stop-color="#FF4C3C"></stop><stop offset=".604" stop-color="#FF692C"></stop><stop offset=".727" stop-color="#FF7825"></stop><stop offset=".885" stop-color="#FF8D1B"></stop><stop offset="1" stop-color="#FF9F13"></stop></radialGradient><radialGradient id="grw-h-9" cx="0" cy="0" r="1" gradientTransform="matrix(-9.59911 -5.20571 7.21454 -12.7543 14.685 23.19)" gradientUnits="userSpaceOnUse"><stop offset=".231" stop-color="#0FBC5F"></stop><stop offset=".312" stop-color="#0FBC5F"></stop><stop offset=".366" stop-color="#0FBC5E"></stop><stop offset=".458" stop-color="#0FBC5D"></stop><stop offset=".54" stop-color="#12BC58"></stop><stop offset=".699" stop-color="#28BF3C"></stop><stop offset=".771" stop-color="#38C02B"></stop><stop offset=".861" stop-color="#52C218"></stop><stop offset=".915" stop-color="#67C30F"></stop><stop offset="1" stop-color="#86C504"></stop></radialGradient><linearGradient id="grw-i-2" x1="10.786" x2="13.219" y1="19.945" y2="19.945" gradientUnits="userSpaceOnUse"><stop stop-color="#0FBC5C"></stop><stop offset="1" stop-color="#0CBA65"></stop></linearGradient><clipPath id="grw-a-1"><path fill="#fff" d="M0 0h24v24H0z"></path></clipPath></defs></svg>`;
  }

  function verifiedSvg() {
    return '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14" aria-hidden="true" class="grw-verified"><path fill="#197BFF" d="M6.757.236a.35.35 0 0 1 .486 0l1.106 1.07a.35.35 0 0 0 .329.089l1.493-.375a.35.35 0 0 1 .422.244l.422 1.48a.35.35 0 0 0 .24.24l1.481.423a.35.35 0 0 1 .244.422l-.375 1.493a.35.35 0 0 0 .088.329l1.071 1.106a.35.35 0 0 1 0 .486l-1.07 1.106a.35.35 0 0 0-.089.329l.375 1.493a.35.35 0 0 1-.244.422l-1.48.422a.35.35 0 0 0-.24.24l-.423 1.481a.35.35 0 0 1-.422.244l-1.493-.375a.35.35 0 0 0-.329.088l-1.106 1.071a.35.35 0 0 1-.486 0l-1.106-1.07a.35.35 0 0 0-.329-.089l-1.493.375a.35.35 0 0 1-.422-.244l-.422-1.48a.35.35 0 0 0-.24-.24l-1.481-.423a.35.35 0 0 1-.244-.422l.375-1.493a.35.35 0 0 0-.088-.329L.236 7.243a.35.35 0 0 1 0-.486l1.07-1.106a.35.35 0 0 0 .089-.329L1.02 3.829a.35.35 0 0 1 .244-.422l1.48-.422a.35.35 0 0 0 .24-.24l.423-1.481a.35.35 0 0 1 .422-.244l1.493.375a.35.35 0 0 0 .329-.088L6.757.236Z"></path><path fill="#fff" fill-rule="evenodd" d="M9.065 4.85a.644.644 0 0 1 .899 0 .615.615 0 0 1 .053.823l-.053.059L6.48 9.15a.645.645 0 0 1-.84.052l-.06-.052-1.66-1.527a.616.616 0 0 1 0-.882.645.645 0 0 1 .84-.052l.06.052 1.21 1.086 3.034-2.978Z" clip-rule="evenodd"></path></svg>';
  }

  function buildStyles(theme, config) {
    const dark = theme === "dark";
    const mobileBreakpoint = config.mobileBreakpoint;
    return `
      .grw-root {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
        color: ${dark ? "rgb(255, 255, 255)" : "#1f2328"};
      }
      .grw-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 12px;
        text-align: center;
        background: ${dark ? "rgb(34, 34, 34)" : "rgb(248, 248, 248)"};
        border-radius: 24px;
        padding: 24px;
        box-sizing: border-box;
        margin-bottom: 20px;
      }
      .grw-header-score {
        font-weight: 700;
        font-size: 48px;
        line-height: 48px;
        color: ${dark ? "rgb(255, 255, 255)" : "rgb(17, 17, 17)"};
        word-break: normal !important;
      }
      .grw-header-right { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 6px; }
      .grw-header-label {
        font-weight: 700;
        font-size: 20px;
        line-height: 26px;
        color: ${dark ? "rgb(255, 255, 255)" : "rgb(17, 17, 17)"};
      }
      .grw-header-stars {
        display: flex;
        gap: 0;
        align-items: center;
      }
      .grw-star { width: 18px; height: 18px; display: inline-block; }
      .grw-star svg { width: 100%; height: 100%; display: block; }
      .grw-header-total { margin-left: 6px; font-size: 14px; color: ${dark ? "rgb(255, 255, 255)" : "#8a9099"}; line-height: 1; }
      .grw-layout { width: 100%; }
      .grw-masonry {
        position: relative;
        margin: 0 auto;
        width: 100%;
        transition: height 0.4s ease;
      }
      .grw-card {
        position: absolute;
        top: 0;
        left: 0;
        display: flex;
        flex-direction: column;
        width: ${config.cardWidth}px;
        background: ${dark ? "rgb(34, 34, 34)" : "rgb(248, 248, 248)"};
        border: 1px solid rgba(17, 17, 17, 0.05);
        border-radius: 8px;
        padding: 24px;
        box-sizing: border-box;
        flex-grow: 1;
        box-shadow: ${dark ? "none" : "0 1px 3px rgba(16, 24, 40, 0.06)"};
        transition: transform 0.4s ease, background-color 0.1s ease;
      }
      .grw-root[data-mode="mobile"] .grw-card { width: 100%; }
      .grw-top { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
      .grw-avatar-wrap { position: relative; width: 42px; height: 42px; flex: 0 0 42px; }
      .grw-avatar { width: 42px; height: 42px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 16px; }
      .grw-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .grw-g-icon {
        position: absolute !important;
        bottom: -6px;
        right: -6px;
        inset-inline-end: -6px;
        width: 24px;
        height: 24px;
        display: block;
        line-height: 0;
      }
      .grw-g-icon svg { width: 100%; height: 100%; display: block; }
      .grw-author {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 15px;
        line-height: 18px;
        font-weight: 600;
        color: ${dark ? "#EFF3F7" : "rgb(17, 17, 17)"};
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        max-width: 100%;
      }
      .grw-author svg { width: 14px; height: 14px; }
      .grw-verified { width: 16px !important; height: 16px !important; flex: 0 0 16px; }
      .grw-time {
        margin-top: 4px;
        font-size: 12px;
        line-height: 16px;
        color: ${dark ? "rgba(255, 255, 255, 0.5)" : "rgba(17, 17, 17, 0.5)"};
      }
      .grw-stars { display: flex; gap: 0; margin-bottom: 11px; }
      .grw-stars .grw-star + .grw-star { margin-left: -1px; }
      .grw-text {
        text-align: left;
        font-size: 16px;
        line-height: 23px;
        color: ${dark ? "rgb(255, 255, 255)" : "rgb(17, 17, 17)"};
        width: 100%;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .grw-toggle {
        display: inline-block;
        border: 0;
        background: transparent;
        color: rgb(25, 123, 255);
        margin-top: 0;
        font-size: 16px;
        text-align: left;
        line-height: 23px;
        cursor: pointer;
        padding: 0;
      }
      .grw-load-more {
        margin: 20px auto 0;
        display: block;
        min-width: 220px;
        border: 0;
        background: ${dark ? "rgb(34, 34, 34)" : "#f0f0f0"};
        color: ${dark ? "rgb(255, 255, 255)" : "#1d1f22"};
        border-radius: 3px;
        padding: 10px 22px;
        font-size: 16px;
        font-weight: 600;
        line-height: 1.2;
        cursor: pointer;
      }
      @media (max-width: 900px) {
        .grw-header { padding: 18px; gap: 12px; }
        .grw-header-score { font-size: 38px; line-height: 38px; }
        .grw-header-label { font-size: 18px; line-height: 24px; }
      }
      @media (max-width: ${mobileBreakpoint}px) {
        .grw-header { border-radius: 8px; padding: 16px; margin-bottom: 14px; gap: 12px; }
        .grw-header-right { align-items: center; }
        .grw-header-score { font-size: 30px; line-height: 30px; }
        .grw-header-label { font-size: 17px; line-height: 22px; }
        .grw-star { width: 16px; height: 16px; }
      }
      .grw-skeleton { background: ${dark ? "#1A2431" : "#f3f3f3"}; border: 1px solid ${dark ? "#2A3A4F" : "#E5EAF0"}; border-radius: 8px; padding: 14px; }
      .grw-shimmer { position: relative; overflow: hidden; background: ${dark ? "#243245" : "#E9EEF4"}; border-radius: 8px; }
      .grw-shimmer::after { content: ""; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent); animation: grwShimmer 1.4s infinite; }
      .grw-sk-a { width: 42px; height: 42px; border-radius: 50%; margin-bottom: 10px; }
      .grw-sk-b { width: 55%; height: 12px; margin-bottom: 8px; }
      .grw-sk-c { width: 35%; height: 10px; margin-bottom: 12px; }
      .grw-sk-d { width: 95%; height: 10px; margin-bottom: 6px; }
      .grw-sk-e { width: 85%; height: 10px; margin-bottom: 6px; }
      .grw-sk-f { width: 70%; height: 10px; }
      @keyframes grwShimmer { 100% { transform: translateX(100%); } }
    `;
  }

  function renderSkeleton(root) {
    root.innerHTML = `
      <div class="grw-layout">
        <div class="grw-masonry">
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
      </div>
    `;
  }

  function getViewportMode(containerWidth, config) {
    return containerWidth <= config.mobileBreakpoint ? "mobile" : "desktop";
  }

  function getColumns(containerWidth, mode, config) {
    if (mode === "mobile") return 1;
    const columnUnit = config.cardWidth + config.columnGap;
    return Math.max(1, Math.min(config.maxColumns, Math.floor(containerWidth / columnUnit)));
  }

  function getBatchSize(mode, config) {
    return mode === "mobile" ? config.mobileBatch : config.desktopBatch;
  }

  function getInitialVisible(mode, config) {
    return mode === "mobile" ? config.mobileInitial : config.desktopInitial;
  }

  function applyMasonryLayout(root, state, config) {
    const masonry = root.querySelector(".grw-masonry");
    if (!masonry) return;
    const header = root.querySelector(".grw-header");

    const cards = Array.from(masonry.querySelectorAll(".grw-card"));
    const containerWidth = root.clientWidth || 0;
    const mode = getViewportMode(containerWidth, config);
    const columns = getColumns(containerWidth, mode, config);
    const layoutWidth = mode === "mobile"
      ? containerWidth
      : (columns * config.cardWidth) + ((columns - 1) * config.columnGap);
    const columnUnit = config.cardWidth + config.columnGap;

    root.dataset.mode = mode;
    masonry.style.width = `${Math.max(0, layoutWidth)}px`;
    if (header) {
      header.style.width = `${Math.max(0, layoutWidth)}px`;
      header.style.marginLeft = "auto";
      header.style.marginRight = "auto";
    }

    const columnHeights = Array.from({ length: columns }, () => 0);

    for (const card of cards) {
      card.style.width = mode === "mobile" ? "100%" : `${config.cardWidth}px`;

      let colIndex = 0;
      for (let i = 1; i < columnHeights.length; i += 1) {
        if (columnHeights[i] < columnHeights[colIndex]) {
          colIndex = i;
        }
      }

      const x = mode === "mobile" ? 0 : (colIndex * columnUnit);
      const y = columnHeights[colIndex];
      card.style.transform = `translate(${x}px, ${y}px)`;

      const cardHeight = card.offsetHeight;
      columnHeights[colIndex] = y + cardHeight + config.rowGap;
    }

    const maxHeight = cards.length > 0 ? Math.max(...columnHeights) - config.rowGap : 0;
    masonry.style.height = `${Math.max(0, maxHeight)}px`;
    state.mode = mode;
  }

  function toggleSingleCard(root, index, state, config) {
    const review = Array.isArray(state.filteredReviews) ? state.filteredReviews[index] : null;
    if (!review) return;

    const card = root.querySelector(`.grw-card[data-card-index="${index}"]`);
    if (!card) return;

    const fullText = String(review.text || "");
    const shortText = truncateAtWord(fullText, TEXT_PREVIEW_LENGTH);
    const expanded = state.expanded.has(index);

    const textEl = card.querySelector(".grw-text");
    if (textEl) {
      textEl.textContent = expanded ? fullText : shortText;
    }

    const toggleBtn = card.querySelector('[data-action="toggle"]');
    if (toggleBtn) {
      toggleBtn.textContent = expanded ? "Show less" : "Read more";
    }

    applyMasonryLayout(root, state, config);
  }

  function renderWidget(container, data, state, config) {
    const safeRating = Number.isFinite(data.rating) ? data.rating.toFixed(1) : "N/A";
    const safeTotal = Number.isFinite(data.totalReviews) ? data.totalReviews : 0;
    const filteredReviews = (Array.isArray(data.reviews) ? data.reviews : []).filter((review) => {
      const rating = Number(review?.rating) || 0;
      if (rating < config.minStars) return false;
      if (!config.showNoTextReviews && String(review?.text || "").trim().length === 0) return false;
      return true;
    });
    const total = filteredReviews.length;
    const visibleCount = config.showLoadMore ? Math.min(state.visibleCount, total) : total;
    const visibleReviews = filteredReviews.slice(0, visibleCount);
    const hasMore = visibleCount < total;
    state.filteredReviews = visibleReviews;

    const cards = visibleReviews
      .map((review, index) => {
        const absoluteIndex = index;
        const fullText = String(review.text || "");
        const shortText = truncateAtWord(fullText, TEXT_PREVIEW_LENGTH);
        const canToggle = fullText.length > shortText.length;
        const expanded = state.expanded.has(absoluteIndex);
        const shownText = expanded ? fullText : shortText;
        const author = escapeHtml(review.author || "Anonymous");
        const relativeTime = escapeHtml(formatRelativeTimeFromPublishTime(review.publishTime));

        const avatar = review.authorPhoto
          ? `<div class="grw-avatar"><img src="${escapeHtml(review.authorPhoto)}" alt="${author}" loading="lazy" referrerpolicy="no-referrer" /></div>`
          : `<div class="grw-avatar" style="background:${getAvatarColor(author)}">${escapeHtml((author[0] || "A").toUpperCase())}</div>`;

        return `
          <article class="grw-card" data-card-index="${absoluteIndex}">
            <div class="grw-top">
              <div class="grw-avatar-wrap">
                ${avatar}
                <span class="grw-g-icon">${googleIconSvg(state.theme === "dark")}</span>
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
        <span class="grw-header-score">${safeRating}</span>
        <div class="grw-header-right">
          <span class="grw-header-label">Google Reviews</span>
          <div class="grw-header-stars">${makeStars(Math.round(Number(data.rating) || 0))}<span class="grw-header-total">(${safeTotal})</span></div>
        </div>
      </div>
      <div class="grw-layout"><div class="grw-masonry">${cards}</div></div>
      ${(config.showLoadMore && hasMore) ? '<button class="grw-load-more" type="button" data-action="load-more">Load More</button>' : ""}
    `;

    applyMasonryLayout(container, state, config);

    const images = Array.from(container.querySelectorAll(".grw-card img"));
    for (const image of images) {
      if (image.complete) continue;
      image.addEventListener("load", () => applyMasonryLayout(container, state, config), { once: true });
      image.addEventListener("error", () => applyMasonryLayout(container, state, config), { once: true });
    }
  }

  async function init() {
    const container = document.querySelector(WIDGET_SELECTOR);
    if (!container) return;

    const { scriptUrl } = getScriptContext();
    const queryConfig = readConfigFromQuery(scriptUrl);
    const dataConfig = readConfigFromDataAttributes(container);
    const config = sanitizeConfig({
      ...queryConfig,
      ...dataConfig
    });
    const themeAttr = container.getAttribute("data-grw-theme") || container.getAttribute("data-theme");
    const theme = themeAttr === "dark" ? "dark" : "light";
    const apiBase = getApiBaseUrl(scriptUrl);
    if (!apiBase) return;

    const root = document.createElement("div");
    root.className = "grw-root";
    root.style.maxWidth = `${config.maxWidth}px`;
    root.style.marginLeft = "auto";
    root.style.marginRight = "auto";
    root.style.width = "100%";
    container.innerHTML = "";
    container.appendChild(root);

    const styleEl = document.createElement("style");
    styleEl.textContent = buildStyles(theme, config);
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
        theme,
        mode: getViewportMode(root.clientWidth || 0, config),
        visibleCount: getInitialVisible(getViewportMode(root.clientWidth || 0, config), config),
        expanded: new Set()
      };

      renderWidget(root, data, state, config);

      const resizeObserver = new ResizeObserver(() => {
        applyMasonryLayout(root, state, config);
      });
      resizeObserver.observe(root);

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
          toggleSingleCard(root, index, state, config);
          return;
        }

        if (action === "load-more") {
          const filteredCount = (Array.isArray(data.reviews) ? data.reviews : []).filter((review) => {
            const rating = Number(review?.rating) || 0;
            if (rating < config.minStars) return false;
            if (!config.showNoTextReviews && String(review?.text || "").trim().length === 0) return false;
            return true;
          }).length;
          state.visibleCount = Math.min(filteredCount, state.visibleCount + getBatchSize(state.mode, config));
          renderWidget(root, data, state, config);
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
