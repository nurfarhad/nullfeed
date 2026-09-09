import { getRandomQuote } from "../shared/quotes";
import { getRandomNudge } from "../shared/nudges";

const CARD_ID = "nullfeed-quote-card";
let currentQuoteIndex = 0;

/** "cycle" = the regular timed Focus Cycle break. "smart" = the Scroll
 * Detector cut the "on" phase short. Both reuse the same card shell so the
 * feature feels like one consistent product, not a bolted-on extra. */
export type QuoteCardReason = "cycle" | "smart";

function pickLine(reason: QuoteCardReason): { text: string; author: string; index: number } {
  if (reason === "smart") {
    const { nudge, index } = getRandomNudge();
    return { text: nudge.text, author: "Nullfeed", index };
  }
  const { quote, index } = getRandomQuote();
  return { text: quote.text, author: quote.author, index };
}

function pickNextLine(reason: QuoteCardReason, excludeIndex: number): { text: string; author: string; index: number } {
  if (reason === "smart") {
    const { nudge, index } = getRandomNudge(excludeIndex);
    return { text: nudge.text, author: "Nullfeed", index };
  }
  const { quote, index } = getRandomQuote(excludeIndex);
  return { text: quote.text, author: quote.author, index };
}

const INTENT_STORAGE_KEY = "nullfeed-session-intent";

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

export function createQuoteCardElement(reason: QuoteCardReason = "cycle"): HTMLElement {
  const existing = document.getElementById(CARD_ID);
  // If the card exists but has been detached from the live document (Facebook
  // virtual-scroll swapped its parent container), treat it as gone so we can
  // create and insert a fresh one.
  if (existing && existing.isConnected) {
    return existing;
  }
  if (existing) {
    existing.remove(); // clean up the orphaned node
  }

  const { text, author, index } = pickLine(reason);
  currentQuoteIndex = index;
  const currentIntent = getSessionIntent();

  const card = document.createElement("div");
  card.id = CARD_ID;
  card.className =
    reason === "smart" ? "nullfeed-quote-card nullfeed-quote-card--smart" : "nullfeed-quote-card";
  card.dataset.nullfeedReason = reason;

  const badgeLabel = reason === "smart" ? "MINDFUL PAUSE" : "NULLFEED FOCUS";
  const refreshTitle = reason === "smart" ? "New nudge" : "New Quote";

  card.innerHTML = `
    <div class="nullfeed-quote-topbar">
      <div class="nullfeed-quote-badge">
        <span class="nullfeed-quote-badge-dot"></span>
        <span>${badgeLabel}</span>
      </div>
      <button type="button" class="nullfeed-quote-refresh" title="${refreshTitle}" aria-label="${refreshTitle}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
        </svg>
      </button>
    </div>
    <div class="nullfeed-quote-content">
      <div class="nullfeed-quote-mark" aria-hidden="true">“</div>
      <blockquote class="nullfeed-quote-text">${text}</blockquote>
      <cite class="nullfeed-quote-author">— ${author}</cite>
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
      const currentReason = (card.dataset.nullfeedReason as QuoteCardReason) || reason;
      const next = pickNextLine(currentReason, currentQuoteIndex);
      currentQuoteIndex = next.index;
      const textEl = card.querySelector(".nullfeed-quote-text");
      const authorEl = card.querySelector(".nullfeed-quote-author");
      if (textEl) textEl.textContent = next.text;
      if (authorEl) authorEl.textContent = `— ${next.author}`;
    });
  }

  const intentContainer = card.querySelector<HTMLElement>(".nullfeed-intent-container");
  if (intentContainer) {
    bindIntentHandlers(intentContainer);
  }

  return card;
}

export function mountQuoteCard(
  target: Element,
  position: "before" | "append" = "before",
  reason: QuoteCardReason = "cycle"
): void {
  const existing = document.getElementById(CARD_ID);
  if (existing?.isConnected) {
    return;
  }
  if (existing) {
    existing.remove();
  }

  const card = createQuoteCardElement(reason);
  if (position === "before") {
    target.parentElement?.insertBefore(card, target);
  } else {
    target.appendChild(card);
  }
}

export function unmountQuoteCard(): void {
  const card = document.getElementById(CARD_ID);
  if (card) {
    card.remove();
  }
}
