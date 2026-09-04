import type { Settings } from "../../shared/settings";
import type { SiteAdapter } from "../adapter";
import { queryAll } from "../adapter";
import {
  cleanupOwnedElements,
  hideClosest,
  hideElement
} from "../domOwnership";

const SHORTS_CONTAINERS = [
  "grid-shelf-view-model",
  "ytd-reel-shelf-renderer",
  "ytd-rich-shelf-renderer",
  "ytd-shelf-renderer",
  "ytm-shorts-lockup-view-model-v2",
  "ytm-shorts-lockup-view-model",
  "ytd-rich-item-renderer",
  "ytd-video-renderer",
  "ytd-grid-video-renderer",
  "ytd-compact-video-renderer",
  "ytd-playlist-video-renderer",
  "yt-lockup-view-model"
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
      return;
    }

    if (settings.youtube.shorts) {
      for (const selector of [
        "grid-shelf-view-model:has(a[href^='/shorts'])",
        "grid-shelf-view-model:has(ytm-shorts-lockup-view-model-v2)",
        "ytd-reel-shelf-renderer",
        "ytd-rich-shelf-renderer[is-shorts]",
        "ytd-shelf-renderer:has(a[href^='/shorts'])",
        "ytd-reel-item-renderer",
        "ytm-shorts-lockup-view-model",
        "ytm-shorts-lockup-view-model-v2"
      ]) {
        queryAll(root, selector).forEach((element) => {
          hideElement(element, "youtube-shorts");
          // Also hide parent section container if on home grid so virtualizer
          // sees zero height and does not thrash layout with empty margins.
          const section = element.closest("ytd-rich-section-renderer");
          if (section) {
            hideElement(section, "youtube-shorts");
          }
        });
      }

      // Hide the "Shorts" filter chip in search results / browse
      queryAll(root, "yt-chip-cloud-chip-renderer").forEach((chip) => {
        if (chip.textContent?.trim() === "Shorts") {
          hideElement(chip, "youtube-shorts");
        }
      });

      queryAll(root, 'a[href^="/shorts/"], a[href="/shorts"]').forEach(
        (anchor) => {
          // If already inside an element hidden by Nullfeed, skip immediately (huge perf win)
          if (anchor.closest("[data-nullfeed-hidden]")) {
            return;
          }

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

    // NOTE: No in-feed quote card on YouTube. YouTube's Polymer grid and sticky
    // category chip bar conflict with injected elements placed above the
    // grid, causing layout thrashing and visible glitching.
  },

  cleanup() {
    cleanupOwnedElements();
  }
};
