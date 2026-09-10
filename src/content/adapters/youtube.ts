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

// ── New to you chip watcher ──────────────────────────────────────────────────
// Tracks whether we have already activated the chip on the current page load.
// Reset to false whenever the YouTube SPA navigates (handled by resetYouTubeHomeFeedChipState).
let chipClickedThisNavigation = false;

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

/**
 * Find the "New to you" chip renderer in the home feed chip bar.
 * Returns null if not found or not on the home page.
 */
function findNewToYouChip(): Element | null {
  const chips = document.querySelectorAll("yt-chip-cloud-chip-renderer");
  for (const chip of chips) {
    const text = chip.textContent?.trim() ?? "";
    // Match English "New to you" and reasonable locale variants
    if (/new\s+to\s+you/i.test(text)) {
      return chip;
    }
  }
  return null;
}

/**
 * Check if the "New to you" chip is currently selected/active.
 * YouTube marks the selected chip with aria-selected="true" or a "selected" attribute.
 */
function isNewToYouChipSelected(): boolean {
  const chip = findNewToYouChip();
  if (!chip) return false;
  return (
    chip.getAttribute("aria-selected") === "true" ||
    chip.hasAttribute("selected") ||
    chip.classList.contains("iron-selected") ||
    chip.matches("[selected]")
  );
}

/**
 * Try to activate the "New to you" chip. Returns true if successfully clicked,
 * false if the chip wasn't available yet.
 *
 * Safe guarantees:
 *  - Only called on the home page (pathname === "/")
 *  - Only called once per navigation (chipClickedThisNavigation guard)
 *  - Does NOT use Polymer APIs — only fires a standard DOM click
 *  - Does NOT hide the "All" chip or any other chip
 */
function tryActivateNewToYouChip(): boolean {
  if (!isYouTubeHomePage()) return false;
  if (chipClickedThisNavigation) return true; // Already done this navigation

  // If it's already selected, just mark as done
  if (isNewToYouChipSelected()) {
    chipClickedThisNavigation = true;
    return true;
  }

  const chip = findNewToYouChip();
  if (!chip) return false; // Chip bar not rendered yet — caller should retry

  // Fire a real click so YouTube's own navigation / Polymer data flow handles it
  chipClickedThisNavigation = true;
  (chip as HTMLElement).click();
  return true;
}

/**
 * Called by routeWatcher on every SPA navigation so the chip can be
 * re-activated on the next home page visit.
 */
export function resetYouTubeHomeFeedChipState(): void {
  chipClickedThisNavigation = false;
}

/**
 * Called from the scan() path (which runs on every MutationObserver batch)
 * when settings.youtube.feed is enabled. It attempts to click the chip and
 * returns immediately — no loops, no intervals, no blocking.
 */
export function syncYouTubeNewToYouChip(enabled: boolean): void {
  if (!enabled || !isYouTubeHomePage()) {
    return;
  }
  tryActivateNewToYouChip();
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
      // 1. Activate "New to you" chip (safe, one-shot per navigation)
      syncYouTubeNewToYouChip(true);

      // 2. Hide algorithmic history-based recommendation shelves
      HOME_RECOMMENDED_SHELVES.forEach((selector) => {
        queryAll(root, selector).forEach((element) =>
          hideElement(element, "youtube-recommended-shelf")
        );
      });
    } else if (!settings.youtube.feed || !isYouTubeHomePage()) {
      const doc = resolveDocument(root);
      if (doc) {
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
    resetYouTubeHomeFeedChipState();
    cleanupOwnedElements();
    unmountQuoteCard();
  }
};
