import type { Settings } from "../../shared/settings";
import type { SiteAdapter } from "../adapter";
import { queryAll } from "../adapter";
import { cleanupOwnedElements, hideElement } from "../domOwnership";
import { mountQuoteCard, unmountQuoteCard } from "../quoteCard";

const TIMELINE_SELECTORS = [
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
      TIMELINE_SELECTORS.forEach((selector) => {
        queryAll(root, selector).forEach((el) => {
          hideElement(el, "twitter-timeline");
          if (settings.showQuotes) {
            mountQuoteCard(el, "before");
          }
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
