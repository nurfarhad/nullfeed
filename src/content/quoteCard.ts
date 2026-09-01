import { getRandomQuote } from "../shared/quotes";

const CARD_ID = "nullfeed-quote-card";
let currentQuoteIndex = 0;

export function createQuoteCardElement(): HTMLElement {
  const existing = document.getElementById(CARD_ID);
  if (existing) {
    return existing;
  }

  const { quote, index } = getRandomQuote();
  currentQuoteIndex = index;

  const card = document.createElement("div");
  card.id = CARD_ID;
  card.className = "nullfeed-quote-card";

  card.innerHTML = `
    <div class="nullfeed-quote-header">
      <span class="nullfeed-quote-badge">NULLFEED FOCUS</span>
      <button type="button" class="nullfeed-quote-refresh" title="New Quote" aria-label="New Quote">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
        </svg>
      </button>
    </div>
    <blockquote class="nullfeed-quote-text">“${quote.text}”</blockquote>
    <cite class="nullfeed-quote-author">— ${quote.author}</cite>
  `;

  const refreshBtn = card.querySelector<HTMLButtonElement>(".nullfeed-quote-refresh");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const { quote: newQuote, index: newIdx } = getRandomQuote(currentQuoteIndex);
      currentQuoteIndex = newIdx;
      const textEl = card.querySelector(".nullfeed-quote-text");
      const authorEl = card.querySelector(".nullfeed-quote-author");
      if (textEl) textEl.textContent = `“${newQuote.text}”`;
      if (authorEl) authorEl.textContent = `— ${newQuote.author}`;
    });
  }

  return card;
}

export function mountQuoteCard(target: Element, position: "before" | "append" = "before"): void {
  if (document.getElementById(CARD_ID)) {
    return;
  }

  const card = createQuoteCardElement();
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
