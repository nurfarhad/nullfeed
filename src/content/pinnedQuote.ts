import { getRandomQuote } from "../shared/quotes";

export const PINNED_CARD_ID = "nullfeed-pinned-quote-card";
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

export type InsertionTarget = {
  container: Element;
  beforeChild: Element | null;
};

export function findPinnedInsertionTarget(
  platform: PinnedQuotePlatform,
  root: ParentNode = document
): InsertionTarget | null {
  if (platform === "facebook") {
    const feed =
      root.querySelector('[role="feed"]') ??
      root.querySelector('div[role="main"] [data-pagelet="Feed"]') ??
      root.querySelector('[data-pagelet="Feed"]') ??
      root.querySelector('div[role="main"]');
    if (!feed) return null;

    const firstPost = feed.querySelector(
      'div[role="article"]:not([data-pagelet*="Stories"]), [data-pagelet^="FeedUnit"], div[data-virtualized="false"]'
    );
    if (firstPost) {
      let beforeChild: Element = firstPost;
      while (beforeChild.parentElement && beforeChild.parentElement !== feed) {
        beforeChild = beforeChild.parentElement;
      }
      return { container: feed, beforeChild };
    }
    return { container: feed, beforeChild: feed.firstElementChild };
  }

  if (platform === "youtube") {
    if (
      typeof location !== "undefined" &&
      location.pathname !== "/" &&
      location.pathname !== ""
    ) {
      return null;
    }
    const grid = root.querySelector("ytd-rich-grid-renderer");
    if (!grid) return null;
    const contents = grid.querySelector("#contents");
    return { container: grid, beforeChild: contents ?? grid.firstElementChild };
  }

  if (platform === "instagram") {
    if (
      typeof location !== "undefined" &&
      location.pathname !== "/" &&
      location.pathname !== ""
    ) {
      return null;
    }
    const main = root.querySelector('main[role="main"], main');
    if (!main) return null;
    const firstArticle = main.querySelector("article");
    if (firstArticle) {
      const directParent = firstArticle.parentElement;
      if (directParent) {
        return { container: directParent, beforeChild: firstArticle };
      }
    }
    const section = main.querySelector("section");
    if (section) {
      return { container: section, beforeChild: section.firstElementChild };
    }
    return { container: main, beforeChild: main.firstElementChild };
  }

  if (platform === "linkedin") {
    const container = root.querySelector(
      ".scaffold-finite-scroll__content, .scaffold-finite-scroll, main.scaffold-layout__main"
    );
    if (!container) return null;
    const firstUpdate = container.querySelector(
      '.feed-shared-update-v2, div[data-urn*="activity"], .scaffold-finite-scroll__content > div'
    );
    if (firstUpdate) {
      let beforeChild: Element = firstUpdate;
      while (beforeChild.parentElement && beforeChild.parentElement !== container) {
        beforeChild = beforeChild.parentElement;
      }
      return { container, beforeChild };
    }
    return { container, beforeChild: container.firstElementChild };
  }

  if (platform === "twitter") {
    const region = root.querySelector(
      'div[aria-label="Home timeline"] section[role="region"], div[data-testid="primaryColumn"] section[role="region"]'
    );
    if (!region) return null;
    const firstTweet = region.querySelector('article[data-testid="tweet"]');
    if (firstTweet) {
      let beforeChild: Element = firstTweet;
      while (beforeChild.parentElement && beforeChild.parentElement !== region) {
        beforeChild = beforeChild.parentElement;
      }
      return { container: region, beforeChild };
    }
    return { container: region, beforeChild: region.firstElementChild };
  }

  if (platform === "reddit") {
    const feed = root.querySelector('shreddit-feed, div[data-testid="posts-list"]');
    if (!feed) return null;
    const firstPost = feed.querySelector("shreddit-post, article");
    if (firstPost) {
      let beforeChild: Element = firstPost;
      while (beforeChild.parentElement && beforeChild.parentElement !== feed) {
        beforeChild = beforeChild.parentElement;
      }
      return { container: feed, beforeChild };
    }
    return { container: feed, beforeChild: feed.firstElementChild };
  }

  return null;
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

export function createPinnedQuoteCardElement(): HTMLElement {
  const existing = document.getElementById(PINNED_CARD_ID);
  if (existing && existing.isConnected) {
    return existing;
  }
  if (existing) {
    existing.remove();
  }

  const { quote, index } = getRandomQuote();
  currentQuoteIdx = index;
  const currentIntent = getSessionIntent();

  const card = document.createElement("div");
  card.id = PINNED_CARD_ID;
  card.className = "nullfeed-quote-card nullfeed-quote-card--pinned";
  card.dataset.nullfeedPinned = "true";

  card.innerHTML = `
    <div class="nullfeed-quote-topbar">
      <div class="nullfeed-quote-badge">
        <span class="nullfeed-quote-badge-dot"></span>
        <span>MINDFUL INTENT</span>
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

  const refreshBtn = card.querySelector<HTMLButtonElement>(".nullfeed-quote-refresh");
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

export function mountPinnedQuoteCard(platform: PinnedQuotePlatform): boolean {
  const target = findPinnedInsertionTarget(platform);
  if (!target) {
    return false;
  }

  let card = document.getElementById(PINNED_CARD_ID);
  if (!card) {
    card = createPinnedQuoteCardElement();
  }

  if (target.beforeChild) {
    if (
      target.beforeChild.previousElementSibling === card &&
      card.parentElement === target.container
    ) {
      return true;
    }
    target.container.insertBefore(card, target.beforeChild);
  } else {
    if (target.container.firstElementChild === card) {
      return true;
    }
    target.container.insertBefore(card, target.container.firstElementChild);
  }
  return true;
}

export function unmountPinnedQuoteCard(): void {
  const card = document.getElementById(PINNED_CARD_ID);
  if (card) {
    card.remove();
  }
}

export function startPinnedQuoteWatcher(platform: PinnedQuotePlatform): () => void {
  let scheduled = false;

  function reassert(): void {
    scheduled = false;
    mountPinnedQuoteCard(platform);
  }

  reassert();

  const observer = new MutationObserver(() => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(reassert);
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
