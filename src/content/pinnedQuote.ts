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

function insertFacebookTopQuote(card: HTMLElement, root: ParentNode = document): boolean {
  // Find the first post in the feed stream
  const firstPost = root.querySelector(
    'div[role="feed"] div[role="article"]:not([data-pagelet*="Stories"]), [data-pagelet^="FeedUnit"], div[role="feed"] div[data-virtualized="false"]'
  );

  if (firstPost) {
    const feedContainer = firstPost.closest('[role="feed"], [data-pagelet="Feed"]');
    if (feedContainer) {
      let target: Element = firstPost;
      while (target.parentElement && target.parentElement !== feedContainer) {
        target = target.parentElement;
      }
      if (target.previousElementSibling === card) {
        return true;
      }
      feedContainer.insertBefore(card, target);
      return true;
    }
    if (firstPost.previousElementSibling === card) {
      return true;
    }
    firstPost.parentElement?.insertBefore(card, firstPost);
    return true;
  }

  // Fallback: if role="feed" is present but has no posts yet
  const feed = root.querySelector('[role="feed"], [data-pagelet="Feed"]');
  if (feed) {
    if (feed.firstElementChild === card) {
      return true;
    }
    feed.insertBefore(card, feed.firstElementChild);
    return true;
  }

  return false;
}

function insertYouTubeTopQuote(card: HTMLElement, root: ParentNode = document): boolean {
  if (typeof location !== "undefined" && location.pathname !== "/" && location.pathname !== "") {
    return false;
  }
  const grid = root.querySelector("ytd-rich-grid-renderer");
  if (!grid) return false;
  const contents = grid.querySelector("#contents");
  if (contents && contents.previousElementSibling === card) {
    return true;
  }
  if (contents) {
    grid.insertBefore(card, contents);
    return true;
  }
  if (grid.firstElementChild === card) return true;
  grid.insertBefore(card, grid.firstElementChild);
  return true;
}

function insertInstagramTopQuote(card: HTMLElement, root: ParentNode = document): boolean {
  if (typeof location !== "undefined" && location.pathname !== "/" && location.pathname !== "") {
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

function insertLinkedInTopQuote(card: HTMLElement, root: ParentNode = document): boolean {
  const update = root.querySelector(
    '.scaffold-finite-scroll__content .feed-shared-update-v2, .scaffold-finite-scroll__content > div'
  );
  if (update && update.parentElement) {
    if (update.previousElementSibling === card) return true;
    update.parentElement.insertBefore(card, update);
    return true;
  }
  const container = root.querySelector('.scaffold-finite-scroll__content, .scaffold-finite-scroll');
  if (container) {
    if (container.firstElementChild === card) return true;
    container.insertBefore(card, container.firstElementChild);
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

export function createFeedQuoteCardElement(doc?: Document): HTMLElement {
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

  const card = documentRef.createElement("div");
  card.id = FEED_QUOTE_CARD_ID;
  card.className = "nullfeed-quote-card nullfeed-quote-card--feed";
  card.dataset.nullfeedTopQuote = "true";

  card.innerHTML = `
    <div class="nullfeed-quote-topbar">
      <div class="nullfeed-quote-badge">
        <span class="nullfeed-quote-badge-dot"></span>
        <span>MINDFUL MOMENT</span>
      </div>
      <button type="button" class="nullfeed-quote-refresh" title="New Quote" aria-label="New Quote">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
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
  const documentRef = typeof document !== "undefined" ? document : null;
  const existing = documentRef?.getElementById(FEED_QUOTE_CARD_ID);
  if (existing && existing.isConnected) {
    return true;
  }

  const card = createFeedQuoteCardElement(documentRef ?? undefined);

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
  const card = document.getElementById(FEED_QUOTE_CARD_ID);
  if (card) {
    card.remove();
  }
}

export function startPinnedQuoteWatcher(platform: PinnedQuotePlatform): () => void {
  // If already mounted, nothing to observe!
  if (mountPinnedQuoteCard(platform)) {
    return () => unmountPinnedQuoteCard();
  }

  // Observe until the feed mounts the quote card once, then immediately disconnect
  const observer = new MutationObserver(() => {
    if (document.getElementById(FEED_QUOTE_CARD_ID)?.isConnected) {
      observer.disconnect();
      return;
    }
    if (mountPinnedQuoteCard(platform)) {
      observer.disconnect();
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
