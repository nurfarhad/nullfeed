import type { Settings } from "../../shared/settings";
import type { SiteAdapter } from "../adapter";
import { queryAll } from "../adapter";
import {
  cleanupOwnedElements,
  hideClosest,
  hideElement
} from "../domOwnership";
import { mountQuoteCard, unmountQuoteCard } from "../quoteCard";

const SHORTS_CONTAINERS = [
  "ytd-rich-item-renderer",
  "ytd-video-renderer",
  "ytd-grid-video-renderer",
  "ytd-compact-video-renderer",
  "ytd-playlist-video-renderer",
  "yt-lockup-view-model",
  "ytd-item-section-renderer"
] as const;

const NAVIGATION_CONTAINERS = [
  "ytd-guide-entry-renderer",
  "ytd-mini-guide-entry-renderer",
  "tp-yt-paper-item",
  "yt-list-item-view-model",
  "yt-chip-cloud-chip-renderer"
] as const;

const SHORTS_NAV_SELECTORS = [
  'ytd-mini-guide-entry-renderer:has(a[href^="/shorts"])',
  'ytd-mini-guide-entry-renderer[aria-label*="Shorts" i]',
  'ytd-guide-entry-renderer:has(a[href^="/shorts"])',
  'yt-list-item-view-model:has(a[href^="/shorts"])',
  'yt-chip-cloud-chip-renderer:has(yt-formatted-string[title="Shorts"])',
  'a[title="Shorts"]',
  'a[href="/shorts"]',
  'a[href^="/shorts?"]'
].join(",");

const SIDEBAR_RECOMMENDED_SELECTORS = [
  "ytd-watch-next-secondary-results-renderer",
  "#secondary.ytd-watch-flexy"
] as const;

export const youtubeAdapter: SiteAdapter = {
  platform: "youtube",
  homeUrl: "https://www.youtube.com/",

  blockedRoute(pathname, settings) {
    return (
      settings.enabled &&
      (settings.youtube.redirect || settings.youtube.shorts) &&
      /^\/shorts(?:\/|$)/i.test(pathname)
    );
  },

  scan(root, settings) {
    if (!settings.enabled) {
      unmountQuoteCard();
      return;
    }

    if (settings.youtube.shorts) {
      for (const selector of [
        "ytd-reel-shelf-renderer",
        "ytd-rich-shelf-renderer[is-shorts]",
        "ytd-reel-item-renderer",
        "ytm-shorts-lockup-view-model"
      ]) {
        queryAll(root, selector).forEach((element) =>
          hideElement(element, "youtube-shorts")
        );
      }

      queryAll(root, 'a[href^="/shorts/"], a[href="/shorts"]').forEach(
        (anchor) => {
          const nav = anchor.closest(
            "ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, tp-yt-paper-item, yt-list-item-view-model"
          );
          if (nav) {
            hideElement(nav, "youtube-navigation");
          } else {
            hideClosest(anchor, SHORTS_CONTAINERS, "youtube-shorts");
          }
        }
      );
    }

    if (settings.youtube.navigation || settings.youtube.shorts) {
      queryAll(root, SHORTS_NAV_SELECTORS).forEach((el) => {
        const nav = el.closest(
          "ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, tp-yt-paper-item, yt-list-item-view-model, yt-chip-cloud-chip-renderer"
        );
        hideElement(nav ?? el, "youtube-navigation");
      });
    }

    if (settings.youtube.sidebar) {
      SIDEBAR_RECOMMENDED_SELECTORS.forEach((selector) => {
        queryAll(root, selector).forEach((element) =>
          hideElement(element, "youtube-sidebar")
        );
      });
    }

    // Mount Focus Quote Card on YouTube home feed if enabled
    const isHome = window.location.pathname === "/" || window.location.pathname === "";
    if (isHome && settings.showQuotes) {
      // Target the inner contents renderer inside the primary feed column,
      // not the outer two-column wrapper (which stretches the whole left column).
      const feedContents = root.querySelector?.(
        "ytd-rich-grid-renderer, #contents.ytd-rich-grid-renderer"
      );
      if (feedContents) {
        mountQuoteCard(feedContents, "before");
      }
    } else if (!isHome) {
      unmountQuoteCard();
    }
  },

  cleanup() {
    unmountQuoteCard();
    cleanupOwnedElements();
  }
};
