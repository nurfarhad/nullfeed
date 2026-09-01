import type { Settings } from "../../shared/settings";
import type { SiteAdapter } from "../adapter";
import { queryAll } from "../adapter";
import { cleanupOwnedElements, hideElement } from "../domOwnership";
import { mountQuoteCard, unmountQuoteCard } from "../quoteCard";

const FEED_SELECTORS = [
  ".scaffold-finite-scroll",
  'div[componentkey^="container-update-list_mainFeed"]',
  'div.core-rail > div[data-view-name="feed-full-update"]'
] as const;

const NEWS_SELECTORS = [
  "#feed-news-module",
  'div[data-view-name="news-module"]',
  "aside.feed-right-column"
] as const;

export const linkedinAdapter: SiteAdapter = {
  platform: "linkedin",
  homeUrl: "https://www.linkedin.com/feed/",

  blockedRoute(_pathname, _settings) {
    return false;
  },

  scan(root, settings) {
    if (!settings.enabled) {
      unmountQuoteCard();
      return;
    }

    if (settings.linkedin.feed) {
      FEED_SELECTORS.forEach((selector) => {
        queryAll(root, selector).forEach((el) => {
          hideElement(el, "linkedin-feed");
          if (settings.showQuotes) {
            mountQuoteCard(el, "before");
          }
        });
      });
    } else {
      unmountQuoteCard();
    }

    if (settings.linkedin.news) {
      NEWS_SELECTORS.forEach((selector) => {
        queryAll(root, selector).forEach((el) => {
          hideElement(el, "linkedin-news");
        });
      });
    }
  },

  cleanup() {
    unmountQuoteCard();
    cleanupOwnedElements();
  }
};
