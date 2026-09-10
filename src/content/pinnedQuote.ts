import { getRandomQuote } from "../shared/quotes";

export const FEED_QUOTE_CARD_ID = "nullfeed-feed-quote-card";
export const PINNED_CARD_ID = FEED_QUOTE_CARD_ID; // alias for backwards compatibility
const INTENT_STORAGE_KEY = "nullfeed-session-intent";

export type PinnedQuotePlatform =
  | "facebook"
  | "youtube"
  | "instagram"
  | "linkedin"
  | "twitter"
  | "reddit";

export function detectPinnedPlatform(hostname: string): PinnedQuotePlatform | null {
  if (/(?:^|\.)facebook\.com$/i.test(hostname)) return "facebook";
  if (/(?:^|\.)youtube\.com$/i.test(hostname)) return "youtube";
  if (/(?:^|\.)instagram\.com$/i.test(hostname)) return "instagram";
  if (/(?:^|\.)linkedin\.com$/i.test(hostname)) return "linkedin";
  if (/(?:^|\.)(?:x\.com|twitter\.com)$/i.test(hostname)) return "twitter";
  if (/(?:^|\.)reddit\.com$/i.test(hostname)) return "reddit";
  return null;
}

function isRouteAllowed(platform: PinnedQuotePlatform): boolean {
  if (typeof location === "undefined") return true;
  const path = (location.pathname || "").toLowerCase();
  if (path === "blank" || path === "") return true;

  switch (platform) {
    case "facebook":
      return path === "/" || path === "";
    case "youtube":
      return path === "/" || path === "";
    case "instagram":
      return path === "/" || path === "";
    case "linkedin":
      return path === "/" || path === "" || path.startsWith("/feed");
    case "twitter":
      return path === "/" || path === "" || path.startsWith("/home");
    case "reddit":
      return path === "/" || path === "" || path.startsWith("/r/popular") || path.startsWith("/r/all");
    default:
      return true;
  }
}

function getFacebookFeedContainer(root: ParentNode = document): HTMLElement | null {
  const docRef = typeof document !== "undefined" ? document : null;
  const feed =
    root.querySelector<HTMLElement>('div[role="feed"], [data-pagelet="Feed"]') ??
    docRef?.querySelector<HTMLElement>('div[role="feed"], [data-pagelet="Feed"]');

  if (feed) return feed;

  // Fallback for mocks/scoping where root contains an article with feed ancestor
  const candidate = root.querySelector<HTMLElement>('[role="article"]');
  if (candidate?.closest) {
    const fromPost = candidate.closest<HTMLElement>('div[role="feed"], [data-pagelet="Feed"]');
    if (fromPost) return fromPost;
  }

  return null;
}

function getFacebookFirstFeedPost(feed: HTMLElement): HTMLElement | null {
  if (typeof feed.querySelectorAll === "function") {
    const articles = Array.from(
      feed.querySelectorAll<HTMLElement>('[role="article"]')
    );

    for (const article of articles) {
      if (
        article.closest?.('[data-pagelet*="Stories"], [aria-label*="Stories" i], [aria-label*="stories" i]') ||
        article.querySelector?.('a[href*="/stories/create"]') ||
        article.closest?.('[data-pagelet*="Reels"], [aria-label*="Reels" i]') ||
        article.querySelector?.('a[href^="/reel/"]') ||
        article.closest?.('[data-pagelet*="Composer"], [role="region"][aria-label*="Create" i]') ||
        article.hasAttribute?.("data-nullfeed-hidden") ||
        article.hidden ||
        article.style?.display === "none"
      ) {
        continue;
      }

      // Resolve the ancestor that is a DIRECT child of the feed container
      let directChild: HTMLElement = article;
      while (directChild.parentElement && directChild.parentElement !== feed) {
        directChild = directChild.parentElement as HTMLElement;
      }

      if (directChild.parentElement === feed) {
        return directChild;
      }
      return article;
    }

    const virtualized = Array.from(
      feed.querySelectorAll<HTMLElement>('div[data-virtualized="false"], div[data-pagelet^="FeedUnit_"]')
    );
    for (const v of virtualized) {
      if (
        v.closest?.('[data-pagelet*="Stories"], [aria-label*="Stories" i]') ||
        v.closest?.('[data-pagelet*="Composer"]') ||
        v.querySelector?.('a[href*="/stories/create"], a[href^="/reel/"]') ||
        v.hasAttribute?.("data-nullfeed-hidden") ||
        v.hidden
      ) {
        continue;
      }

      let directChild: HTMLElement = v;
      while (directChild.parentElement && directChild.parentElement !== feed) {
        directChild = directChild.parentElement as HTMLElement;
      }
      if (directChild.parentElement === feed) {
        return directChild;
      }
    }
  }

  const single = feed.querySelector?.('[role="article"]');
  if (single && typeof single === "object") {
    let directChild: HTMLElement = single as HTMLElement;
    while (directChild.parentElement && directChild.parentElement !== feed) {
      directChild = directChild.parentElement as HTMLElement;
    }
    return directChild.parentElement === feed ? directChild : (single as HTMLElement);
  }

  return null;
}

function insertFacebookTopQuote(card: HTMLElement, root: ParentNode = document): boolean {
  if (!isRouteAllowed("facebook")) {
    unmountPinnedQuoteCard();
    return false;
  }

  const feed = getFacebookFeedContainer(root);
  if (!feed) {
    // If not in the news feed, do NOT mount anywhere else (prevents sidebar injection)
    return false;
  }

  // 1. If first post exists inside the feed, insert right before it
  const firstPost = getFacebookFirstFeedPost(feed);
  if (firstPost) {
    if (firstPost.previousElementSibling === card) {
      return true;
    }
    if (firstPost.parentElement) {
      firstPost.parentElement.insertBefore(card, firstPost);
      return true;
    }
    feed.insertBefore(card, firstPost);
    return true;
  }

  // 2. If composer exists in the feed, insert right after composer
  const composer = feed.querySelector<HTMLElement>(
    '[data-pagelet*="Composer"], div:has(input[aria-label*="mind" i], [aria-label*="mind" i])'
  );
  if (composer) {
    let directChild: HTMLElement = composer;
    while (directChild.parentElement && directChild.parentElement !== feed) {
      directChild = directChild.parentElement as HTMLElement;
    }
    if (directChild.parentElement === feed) {
      if (directChild.nextElementSibling) {
        if (directChild.nextElementSibling === card) return true;
        feed.insertBefore(card, directChild.nextElementSibling);
        return true;
      }
      feed.appendChild(card);
      return true;
    }
  }

  // 3. Fallback: Top of feed container
  if (feed.firstElementChild === card) {
    return true;
  }
  feed.insertBefore(card, feed.firstElementChild);
  return true;
}

function insertYouTubeTopQuote(card: HTMLElement, root: ParentNode = document): boolean {
  if (!isRouteAllowed("youtube")) {
    unmountPinnedQuoteCard();
    return false;
  }

  // Apply YouTube thumbnail card styling
  card.classList?.add("nullfeed-quote-card--yt-thumb");

  const existingWrapper =
    root.querySelector?.("#nullfeed-yt-grid-wrapper") ??
    (typeof document !== "undefined" ? document.querySelector("#nullfeed-yt-grid-wrapper") : null);
  if (existingWrapper?.isConnected) return true;

  // Target the rich grid contents list
  const contents =
    root.querySelector?.("ytd-rich-grid-renderer #contents") ??
    (typeof document !== "undefined" ? document.querySelector("ytd-rich-grid-renderer #contents") : null);
  if (!contents) return false;

  // Wrap the card in a ytd-rich-item-renderer mimic so it blends into the grid
  const docRef =
    typeof document !== "undefined"
      ? document
      : ((root as Element).ownerDocument ?? null);
  const wrapper =
    docRef && typeof docRef.createElement === "function"
      ? docRef.createElement("ytd-rich-item-renderer")
      : card;
  if (wrapper !== card) {
    wrapper.id = "nullfeed-yt-grid-wrapper";
    wrapper.className = "style-scope ytd-rich-grid-renderer";
    wrapper.setAttribute("data-nullfeed-yt-card", "");
    wrapper.appendChild(card);
  }

  // Find the first native video item in the grid
  const firstVideo = contents.querySelector("ytd-rich-item-renderer:not([data-nullfeed-yt-card])");
  if (firstVideo && firstVideo.parentElement) {
    firstVideo.parentElement.insertBefore(wrapper, firstVideo);
    return true;
  }

  // If no items yet, wait for YouTube to load initial videos instead of appending to empty grid
  return false;
}

function insertInstagramTopQuote(card: HTMLElement, root: ParentNode = document): boolean {
  if (!isRouteAllowed("instagram")) {
    unmountPinnedQuoteCard();
    return false;
  }
  const firstArticle = root.querySelector('main[role="main"] article, main article');
  if (firstArticle && firstArticle.parentElement) {
    if (firstArticle.previousElementSibling === card) return true;
    firstArticle.parentElement.insertBefore(card, firstArticle);
    return true;
  }
  const section = root.querySelector('main[role="main"] section, main section');
  if (section) {
    if (section.firstElementChild === card) return true;
    section.insertBefore(card, section.firstElementChild);
    return true;
  }
  return false;
}

function getLinkedInMain(root: ParentNode = document): HTMLElement | null {
  const docRef = typeof document !== "undefined" ? document : null;
  const found =
    root.querySelector?.<HTMLElement>('main.scaffold-layout__main, main[role="main"], main') ??
    docRef?.querySelector<HTMLElement>('main.scaffold-layout__main, main[role="main"], main');

  if (found && typeof found.querySelectorAll === "function") {
    return found;
  }

  if (typeof (root as HTMLElement).querySelectorAll === "function") {
    return root as HTMLElement;
  }

  return found ?? (root as HTMLElement);
}

function getLinkedInFirstPost(main: HTMLElement): HTMLElement | null {
  if (typeof main.querySelectorAll === "function") {
    const candidates = Array.from(
      main.querySelectorAll<HTMLElement>(
        'div.feed-shared-update-v2, div[data-view-name*="feed"], div[data-view-name="feed-full-update"], div[data-urn*="activity"]'
      )
    );
    for (const post of candidates) {
      if (post.hasAttribute?.("data-nullfeed-hidden") || post.hidden || post.style?.display === "none") continue;
      return post;
    }
  }

  const single = main.querySelector?.(
    'div.feed-shared-update-v2, div[data-view-name*="feed"], div[data-view-name="feed-full-update"], div[data-urn*="activity"]'
  );
  if (
    (typeof HTMLElement !== "undefined" && single instanceof HTMLElement) ||
    (single && typeof single === "object")
  ) {
    return single as HTMLElement;
  }
  return null;
}

function insertLinkedInTopQuote(card: HTMLElement, root: ParentNode = document): boolean {
  if (!isRouteAllowed("linkedin")) {
    unmountPinnedQuoteCard();
    return false;
  }

  const main = getLinkedInMain(root);
  if (!main) {
    return false;
  }

  // 1. Primary: insert right before the first visible post in the feed container
  const firstPost = getLinkedInFirstPost(main);
  if (firstPost && firstPost.parentElement) {
    const scrollContent = firstPost.closest?.<HTMLElement>(
      '.scaffold-finite-scroll__content, main'
    );
    if (scrollContent && scrollContent !== firstPost) {
      let target: HTMLElement = firstPost;
      while (target.parentElement && target.parentElement !== scrollContent) {
        target = target.parentElement as HTMLElement;
      }
      if (target.parentElement === scrollContent) {
        if (target.previousElementSibling === card) return true;
        scrollContent.insertBefore(card, target);
        return true;
      }
    }

    if (firstPost.previousElementSibling === card) return true;
    firstPost.parentElement.insertBefore(card, firstPost);
    return true;
  }

  // 2. Secondary: scaffold finite scroll content container (after the sort dropdown)
  const scrollContent = typeof main.querySelector === "function"
    ? main.querySelector<HTMLElement>('.scaffold-finite-scroll__content')
    : null;
  if (scrollContent) {
    const sortBar = scrollContent.querySelector?.<HTMLElement>(
      '.display-flex:has(button[aria-label*="sort" i]), .feed-sort'
    );
    if (sortBar && sortBar.nextElementSibling) {
      if (sortBar.nextElementSibling === card) return true;
      scrollContent.insertBefore(card, sortBar.nextElementSibling);
      return true;
    }
    if (scrollContent.firstElementChild === card) return true;
    scrollContent.insertBefore(card, scrollContent.firstElementChild);
    return true;
  }

  // 3. Fallback: Main container right after the "Start a post" box
  const shareBox = typeof main.querySelector === "function"
    ? main.querySelector<HTMLElement>('.share-box-feed-entry, div:has(button[aria-label*="Start a post" i])')
    : null;
  if (shareBox && shareBox.nextElementSibling) {
    if (shareBox.nextElementSibling === card) return true;
    main.insertBefore(card, shareBox.nextElementSibling);
    return true;
  }

  return false;
}

function insertTwitterTopQuote(card: HTMLElement, root: ParentNode = document): boolean {
  const tweet = root.querySelector(
    'div[aria-label="Home timeline"] article[data-testid="tweet"], div[data-testid="primaryColumn"] article[data-testid="tweet"]'
  );
  if (tweet && tweet.parentElement) {
    const region = tweet.closest('section[role="region"], div[aria-label="Home timeline"]');
    if (region) {
      let target: Element = tweet;
      while (target.parentElement && target.parentElement !== region) {
        target = target.parentElement;
      }
      if (target.previousElementSibling === card) return true;
      region.insertBefore(card, target);
      return true;
    }
    if (tweet.previousElementSibling === card) return true;
    tweet.parentElement.insertBefore(card, tweet);
    return true;
  }
  return false;
}

function insertRedditTopQuote(card: HTMLElement, root: ParentNode = document): boolean {
  const feed = root.querySelector('shreddit-feed, div[data-testid="posts-list"]');
  if (!feed) return false;
  const post = feed.querySelector('shreddit-post, article');
  if (post) {
    let target: Element = post;
    while (target.parentElement && target.parentElement !== feed) {
      target = target.parentElement;
    }
    if (target.previousElementSibling === card) return true;
    feed.insertBefore(card, target);
    return true;
  }
  if (feed.firstElementChild === card) return true;
  feed.insertBefore(card, feed.firstElementChild);
  return true;
}

function getSessionIntent(): string | null {
  try {
    return sessionStorage.getItem(INTENT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setSessionIntent(intent: string | null): void {
  try {
    if (intent) {
      sessionStorage.setItem(INTENT_STORAGE_KEY, intent);
    } else {
      sessionStorage.removeItem(INTENT_STORAGE_KEY);
    }
  } catch {
    // Non-fatal
  }
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderIntentHTML(intent: string | null): string {
  if (intent) {
    const escaped = escapeHTML(intent);
    return `
      <div class="nullfeed-intent-badge">
        <div class="nullfeed-intent-badge-content">
          <span class="nullfeed-intent-icon" aria-hidden="true">🎯</span>
          <span class="nullfeed-intent-tag">Session Goal:</span>
          <span class="nullfeed-intent-text">“${escaped}”</span>
        </div>
        <button type="button" class="nullfeed-intent-clear" title="Clear Goal" aria-label="Clear Goal">×</button>
      </div>
    `;
  }
  return `
    <form class="nullfeed-intent-form">
      <input type="text" class="nullfeed-intent-input" placeholder="What did you open this tab to do?" maxlength="70" autocomplete="off" />
      <button type="submit" class="nullfeed-intent-submit">Set Goal</button>
    </form>
  `;
}

function bindIntentHandlers(container: HTMLElement): void {
  const form = container.querySelector<HTMLFormElement>(".nullfeed-intent-form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const input = form.querySelector<HTMLInputElement>(".nullfeed-intent-input");
      const val = input?.value.trim();
      if (val) {
        setSessionIntent(val);
        container.innerHTML = renderIntentHTML(val);
        bindIntentHandlers(container);
      }
    });
  }

  const clearBtn = container.querySelector<HTMLButtonElement>(".nullfeed-intent-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setSessionIntent(null);
      container.innerHTML = renderIntentHTML(null);
      bindIntentHandlers(container);
    });
  }
}

let currentQuoteIdx = 0;

export function createFeedQuoteCardElement(doc?: Document, platform?: string): HTMLElement {
  const documentRef = doc ?? (typeof document !== "undefined" ? document : null);
  if (!documentRef) {
    return { id: FEED_QUOTE_CARD_ID } as unknown as HTMLElement;
  }
  const existing = documentRef.getElementById(FEED_QUOTE_CARD_ID);
  if (existing && existing.isConnected) {
    return existing;
  }
  if (existing) {
    existing.remove();
  }

  const { quote, index } = getRandomQuote();
  currentQuoteIdx = index;
  const currentIntent = getSessionIntent();
  const isYouTube = platform === "youtube" ||
    (typeof location !== "undefined" && /youtube\.com/i.test(location.hostname));

  const card = documentRef.createElement("div");
  card.id = FEED_QUOTE_CARD_ID;
  card.dataset.nullfeedTopQuote = "true";

  if (isYouTube) {
    // YouTube: thumbnail-style layout (16:9 + metadata row)
    card.className = "nullfeed-quote-card nullfeed-quote-card--yt-thumb";
    card.innerHTML = `
      <div class="nullfeed-yt-thumb-area">
        <div class="nullfeed-quote-mark" aria-hidden="true">“</div>
        <blockquote class="nullfeed-quote-text">${quote.text}</blockquote>
        <cite class="nullfeed-quote-author">— ${quote.author}</cite>
        <button type="button" class="nullfeed-quote-refresh" title="New Quote" aria-label="New Quote">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
        </button>
      </div>
      <div class="nullfeed-yt-meta">
        <div class="nullfeed-yt-meta-avatar" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2ed88a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 7v5l3 3"/>
          </svg>
        </div>
        <div class="nullfeed-yt-meta-info">
          <span class="nullfeed-yt-meta-title">Mindful Moment</span>
          <span class="nullfeed-yt-meta-sub">Nullfeed · Pause &amp; Reflect</span>
        </div>
      </div>
    `;
  } else {
    // Standard post-style layout for Facebook, Instagram, LinkedIn etc.
    card.className = "nullfeed-quote-card nullfeed-quote-card--feed";
    card.innerHTML = `
      <div class="nullfeed-quote-topbar">
        <div class="nullfeed-quote-badge">
          <span class="nullfeed-quote-badge-dot"></span>
          <span>MINDFUL MOMENT</span>
        </div>
        <button type="button" class="nullfeed-quote-refresh" title="New Quote" aria-label="New Quote">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
        </button>
      </div>
      <div class="nullfeed-quote-content">
        <div class="nullfeed-quote-mark" aria-hidden="true">“</div>
        <blockquote class="nullfeed-quote-text">${quote.text}</blockquote>
        <cite class="nullfeed-quote-author">— ${quote.author}</cite>
      </div>
      <div class="nullfeed-intent-container">
        ${renderIntentHTML(currentIntent)}
      </div>
    `;
  }

  const refreshBtn = card.querySelector<HTMLButtonElement>("button.nullfeed-quote-refresh");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const next = getRandomQuote(currentQuoteIdx);
      currentQuoteIdx = next.index;
      const textEl = card.querySelector(".nullfeed-quote-text");
      const authorEl = card.querySelector(".nullfeed-quote-author");
      if (textEl) textEl.textContent = next.quote.text;
      if (authorEl) authorEl.textContent = `— ${next.quote.author}`;
    });
  }

  const intentContainer = card.querySelector<HTMLElement>(".nullfeed-intent-container");
  if (intentContainer) {
    bindIntentHandlers(intentContainer);
  }

  return card;
}

export const createPinnedQuoteCardElement = createFeedQuoteCardElement;

export function mountPinnedQuoteCard(
  platform: PinnedQuotePlatform,
  root: ParentNode = typeof document !== "undefined" ? document : (null as unknown as ParentNode)
): boolean {
  if (!root) return false;
  if (!isRouteAllowed(platform)) {
    unmountPinnedQuoteCard();
    return false;
  }

  const documentRef = typeof document !== "undefined" ? document : null;
  const existing = documentRef?.getElementById(FEED_QUOTE_CARD_ID);
  if (existing && existing.isConnected) {
    return true;
  }

  const card = createFeedQuoteCardElement(documentRef ?? undefined, platform);

  switch (platform) {
    case "facebook":
      return insertFacebookTopQuote(card, root);
    case "youtube":
      return insertYouTubeTopQuote(card, root);
    case "instagram":
      return insertInstagramTopQuote(card, root);
    case "linkedin":
      return insertLinkedInTopQuote(card, root);
    case "twitter":
      return insertTwitterTopQuote(card, root);
    case "reddit":
      return insertRedditTopQuote(card, root);
    default:
      return false;
  }
}

export function unmountPinnedQuoteCard(): void {
  if (typeof document === "undefined") return;
  // Remove the card itself
  const card = document.getElementById(FEED_QUOTE_CARD_ID);
  if (card) {
    card.remove();
  }
  // Also remove the YouTube grid wrapper if present
  const ytWrapper = document.getElementById("nullfeed-yt-grid-wrapper");
  if (ytWrapper) {
    ytWrapper.remove();
  }
}

export function startPinnedQuoteWatcher(platform: PinnedQuotePlatform): () => void {
  // Mount immediately if allowed
  if (isRouteAllowed(platform)) {
    mountPinnedQuoteCard(platform);
  } else {
    unmountPinnedQuoteCard();
  }

  // Keep observing so if SPA feed re-rendering (or client-side route change) clears or moves the card, it is properly handled
  const observer = new MutationObserver(() => {
    if (!isRouteAllowed(platform)) {
      unmountPinnedQuoteCard();
      return;
    }
    const card = document.getElementById(FEED_QUOTE_CARD_ID);
    if (!card || !card.isConnected) {
      mountPinnedQuoteCard(platform);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  return () => {
    observer.disconnect();
    unmountPinnedQuoteCard();
  };
}
