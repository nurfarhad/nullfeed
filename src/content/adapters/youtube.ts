import type { Settings } from "../../shared/settings";
import type { SiteAdapter } from "../adapter";
import { queryAll } from "../adapter";
import {
  cleanupOwnedElements,
  cleanupOwnedFeature,
  hideClosest,
  hideElement
} from "../domOwnership";
import { unmountQuoteCard } from "../quoteCard";

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

const COMMENTS_SELECTORS = [
  "ytd-comments#comments",
  "#comments.ytd-watch-flexy",
  "ytd-comments",
  "ytd-item-section-renderer#sections.ytd-comments"
] as const;

const ENDSCREEN_SELECTORS = [
  ".ytp-ce-element",
  ".ytp-endscreen-content",
  ".ytp-autonav-endscreen-countdown-overlay",
  ".ytp-autonav-endscreen-button-container",
  ".ytp-pause-overlay",
  ".ytp-pause-overlay-container"
] as const;

const HOME_RECOMMENDED_SHELVES = [
  'ytd-rich-section-renderer[aria-label*="Watch it again" i]',
  'ytd-rich-section-renderer:has([aria-label*="Watch it again" i])',
  'ytd-rich-section-renderer[aria-label*="Mixes" i]',
  'ytd-rich-section-renderer:has([aria-label*="Mixes" i])',
  'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer:has([title*="Watch it again" i]))',
  'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer:has([title*="Mixes" i]))'
] as const;

let lastNewChipClickTime = 0;
let newChipRetryTimer: ReturnType<typeof setTimeout> | null = null;
let newChipRetryCount = 0;

function resolveDocument(root: ParentNode): Document | null {
  if (typeof Document !== "undefined" && root instanceof Document) {
    return root;
  }
  return (root as Element).ownerDocument ?? (typeof document !== "undefined" ? document : null);
}

function isYouTubeHomePage(): boolean {
  if (typeof location === "undefined") {
    return false;
  }
  return location.pathname === "/" || location.pathname === "";
}

function syncYouTubeHomeFeedChips(doc: Document = document): void {
  if (typeof location === "undefined" || !isYouTubeHomePage()) {
    return;
  }

  const chips = Array.from(
    doc.querySelectorAll<HTMLElement>(
      "ytd-feed-filter-chip-bar-renderer yt-chip-cloud-chip-renderer, yt-chip-cloud-chip-renderer"
    )
  );

  let newToYouChip: HTMLElement | null = null;
  let isNewSelected = false;
  let userSelectedTopic = false;

  for (const chip of chips) {
    const text = chip.textContent?.trim().toLowerCase() ?? "";
    const title = chip.getAttribute("chip-title")?.toLowerCase() ?? "";
    const combined = `${text} ${title}`;

    const isSelected =
      chip.classList.contains("iron-selected") ||
      chip.getAttribute("aria-selected") === "true" ||
      chip.hasAttribute("selected") ||
      Boolean(chip.querySelector('[aria-selected="true"], [aria-pressed="true"], .iron-selected'));

    if (text === "all" || title === "all" || combined === "all") {
      hideElement(chip, "youtube-all-chip");
    } else if (
      combined.includes("new to you") ||
      combined.includes("new for you")
    ) {
      newToYouChip = chip;
      if (isSelected) {
        isNewSelected = true;
      }
    } else if (isSelected && !combined.includes("shorts")) {
      userSelectedTopic = true;
    }
  }

  if (newToYouChip && !isNewSelected && !userSelectedTopic) {
    const now = Date.now();
    if (now - lastNewChipClickTime > 1200) {
      lastNewChipClickTime = now;
      const clickTarget =
        newToYouChip.querySelector<HTMLElement>(
          "button, a, [role='button'], yt-formatted-string"
        ) ?? newToYouChip;
      clickTarget.click();
      clickTarget.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window
        })
      );
    }
    newChipRetryCount = 0;
    return;
  }

  if (isNewSelected || userSelectedTopic) {
    newChipRetryCount = 0;
    return;
  }

  // If chips haven't rendered into DOM yet, retry with backoff up to 8 times
  if (newChipRetryCount < 8 && !newChipRetryTimer) {
    newChipRetryCount++;
    newChipRetryTimer = setTimeout(() => {
      newChipRetryTimer = null;
      syncYouTubeHomeFeedChips(doc);
    }, 350);
  }
}

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

    if (settings.youtube.feed && isYouTubeHomePage()) {
      // 1. Hide algorithmic history-based recommendation shelves
      HOME_RECOMMENDED_SHELVES.forEach((selector) => {
        queryAll(root, selector).forEach((element) =>
          hideElement(element, "youtube-recommended-shelf")
        );
      });

      // 2. Process chips bar: hide the "All" chip and auto-activate "New to you"
      const doc = resolveDocument(root);
      if (doc) syncYouTubeHomeFeedChips(doc);
    } else if (!settings.youtube.feed || !isYouTubeHomePage()) {
      const doc = resolveDocument(root);
      if (doc) {
        cleanupOwnedFeature("youtube-all-chip", doc);
        cleanupOwnedFeature("youtube-recommended-shelf", doc);
      }
    }

    if (settings.youtube.comments) {
      COMMENTS_SELECTORS.forEach((selector) => {
        queryAll(root, selector).forEach((element) =>
          hideElement(element, "youtube-comments")
        );
      });
    } else {
      const doc = resolveDocument(root);
      if (doc) {
        cleanupOwnedFeature("youtube-comments", doc);
      }
    }

    if (settings.youtube.endscreen) {
      ENDSCREEN_SELECTORS.forEach((selector) => {
        queryAll(root, selector).forEach((element) =>
          hideElement(element, "youtube-endscreen")
        );
      });
    }
  },

  cleanup() {
    if (newChipRetryTimer) {
      clearTimeout(newChipRetryTimer);
      newChipRetryTimer = null;
    }
    newChipRetryCount = 0;
    lastNewChipClickTime = 0;
    cleanupOwnedElements();
    unmountQuoteCard();
  }
};
