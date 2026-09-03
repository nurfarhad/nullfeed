import type { Settings } from "../../shared/settings";
import type { SiteAdapter } from "../adapter";
import { queryAll } from "../adapter";
import { cleanupOwnedElements, hideElement } from "../domOwnership";
import { mountQuoteCard, unmountQuoteCard } from "../quoteCard";

const TIMELINE_SELECTORS = [
  'div[data-testid="primaryColumn"] section[role="region"]',
  'div[aria-label="Home timeline"] > div > section[role="region"]',
  'div[aria-label="Timeline: Your Home Timeline"]',
  'div[data-testid="primaryColumn"] section[role="region"] div[data-testid="cellInnerDiv"]',
  'article[data-testid="tweet"]'
] as const;

// The container to mount the quote card BEFORE (outside the hidden tweet cells)
const TIMELINE_CONTAINER_SELECTORS = [
  'div[data-testid="primaryColumn"] section[role="region"]',
  'div[aria-label="Home timeline"] > div > section[role="region"]',
  'div[aria-label="Timeline: Your Home Timeline"]'
] as const;

const TRENDING_SELECTORS = [
  'section:has(div[aria-label="Timeline: Trending now"])',
  'div[aria-label="Timeline: Trending now"]',
  'div:has(> div[data-testid="news_sidebar"])',
  'div[data-testid="sidebarColumn"] section:has(div[data-testid="trend"])'
] as const;

export const twitterAdapter: SiteAdapter = {
  platform: "twitter",
  homeUrl: "https://x.com/home",

  blockedRoute(_pathname, _settings) {
    return false;
  },

  scan(root, settings) {
    if (!settings.enabled) {
      unmountQuoteCard();
      return;
    }

    const isHome = /^\/(?:home|$)/i.test(window.location.pathname);

    if (settings.twitter.timeline && isHome) {
      if (settings.showQuotes) {
        const doc = root instanceof Document ? root : document;
        for (const selector of TIMELINE_CONTAINER_SELECTORS) {
          const container = doc.querySelector(selector);
          if (container) {
            const existing = document.getElementById("nullfeed-quote-card");
            // Re-mount if the card is missing or no longer sits just before
            // the target container (can happen after SPA navigation).
            if (existing && existing.nextElementSibling !== container) {
              existing.remove();
            }
            if (!document.getElementById("nullfeed-quote-card")) {
              mountQuoteCard(container, "before");
            }
            break;
          }
        }
      }

      TIMELINE_SELECTORS.forEach((selector) => {
        queryAll(root, selector).forEach((el) => {
          hideElement(el, "twitter-timeline");
        });
      });
    } else {
      unmountQuoteCard();
    }

    if (settings.twitter.trending) {
      TRENDING_SELECTORS.forEach((selector) => {
        queryAll(root, selector).forEach((el) => {
          hideElement(el, "twitter-trending");
        });
      });
    }
  },

  cleanup() {
    unmountQuoteCard();
    cleanupOwnedElements();
  }
};

