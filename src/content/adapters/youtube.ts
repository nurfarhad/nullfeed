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

// Unused but kept for structural completeness (avoids any future re-additions)
const _NAVIGATION_CONTAINERS = [
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

// ── "New to you" chip activator ───────────────────────────────────────────────
// We click the chip exactly ONCE per page navigation using a boolean guard.
// If the chip bar hasn't rendered yet when settings load, we schedule up to
// MAX_RETRIES timed retries with increasing delays — stopping immediately once
// the chip is found and clicked (or already selected).
// NO intervals, NO CSS hiding, NO Polymer APIs.

let chipActivated = false;        // true once clicked (or confirmed already selected) this navigation
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
const MAX_RETRIES = 6;
// Delays in ms: 250, 500, 1000, 2000, 3500, 5000
const RETRY_DELAYS = [250, 500, 1000, 2000, 3500, 5000] as const;

function isYouTubeHomePage(): boolean {
  if (typeof location === "undefined") return false;
  return location.pathname === "/" || location.pathname === "";
}

function resolveDocument(root: ParentNode): Document | null {
  if (typeof Document !== "undefined" && root instanceof Document) return root;
  return (root as Element).ownerDocument ?? (typeof document !== "undefined" ? document : null);
}

/**
 * Locate the "New to you" chip. Uses attribute-based selectors first
 * (most reliable), falls back to textContent scan.
 */
function findNewToYouChip(): HTMLElement | null {
  // Primary: yt-formatted-string title attribute (doesn't depend on whitespace in textContent)
  const byTitle = document.querySelector<HTMLElement>(
    'yt-chip-cloud-chip-renderer:has(yt-formatted-string[title*="New to you" i])'
  );
  if (byTitle) return byTitle;

  // Fallback: textContent scan across all chips
  for (const chip of document.querySelectorAll<HTMLElement>("yt-chip-cloud-chip-renderer")) {
    // Check the inner yt-formatted-string title attribute too
    const fmtTitle = chip.querySelector("yt-formatted-string")?.getAttribute("title") ?? "";
    const text = chip.textContent?.trim() ?? "";
    if (/new\s+to\s+you/i.test(fmtTitle) || /new\s+to\s+you/i.test(text)) {
      return chip;
    }
  }
  return null;
}

/**
 * Check if the "New to you" chip is currently active/selected.
 * YouTube uses several different attribute conventions across versions.
 */
function isNewToYouChipSelected(): boolean {
  const chip = findNewToYouChip();
  if (!chip) return false;
  return (
    chip.getAttribute("aria-selected") === "true" ||
    chip.hasAttribute("selected") ||
    chip.classList.contains("iron-selected") ||
    chip.matches("[selected]") ||
    // Some YouTube versions mark the active chip differently
    chip.querySelector('[aria-selected="true"]') !== null
  );
}

/**
 * Clear any pending retry timer.
 */
function clearRetry(): void {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

/**
 * Perform a single click attempt. Returns true if chip was found and action taken,
 * false if chip not in DOM yet.
 */
function attemptChipClick(): boolean {
  if (!isYouTubeHomePage() || chipActivated) return true;

  // Already on New to you — just mark done
  if (isNewToYouChipSelected()) {
    chipActivated = true;
    clearRetry();
    return true;
  }

  const chip = findNewToYouChip();
  if (!chip) return false; // Not rendered yet

  chipActivated = true;
  clearRetry();

  // Click the most specific interactive child first (yt-formatted-string or button/anchor),
  // falling back to the chip element itself.
  const clickTarget =
    chip.querySelector<HTMLElement>("a, button, yt-formatted-string, .chip-text") ??
    chip;
  clickTarget.click();
  return true;
}

/**
 * Schedule the next retry attempt if chip wasn't found yet.
 */
function scheduleRetry(): void {
  clearRetry();
  if (retryCount >= MAX_RETRIES) return; // Give up after max attempts
  const delay = RETRY_DELAYS[retryCount] ?? 5000;
  retryCount++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (!isYouTubeHomePage() || chipActivated) return;
    const found = attemptChipClick();
    if (!found) {
      scheduleRetry(); // Still not rendered — try again
    }
  }, delay);
}

/**
 * Public entry point — called from index.ts on settings load/change and
 * from scan() on every MutationObserver batch.
 * Safe: no-ops if already activated this navigation, or if not on home page.
 */
export function syncYouTubeNewToYouChip(enabled: boolean): void {
  if (!enabled) {
    clearRetry();
    return;
  }
  if (!isYouTubeHomePage() || chipActivated) return;

  const found = attemptChipClick();
  if (!found) {
    // Chip bar not in DOM yet — start the retry sequence
    if (retryTimer === null) {
      retryCount = 0;
      scheduleRetry();
    }
  }
}

/**
 * Called by routeWatcher on every SPA navigation so the next home-page
 * visit re-activates the chip.
 */
export function resetYouTubeHomeFeedChipState(): void {
  chipActivated = false;
  retryCount = 0;
  clearRetry();
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
          const section = element.closest("ytd-rich-section-renderer");
          if (section) {
            hideElement(section, "youtube-shorts");
          }
        });
      }

      queryAll(root, "yt-chip-cloud-chip-renderer").forEach((chip) => {
        if (chip.textContent?.trim() === "Shorts") {
          hideElement(chip, "youtube-shorts");
        }
      });

      queryAll(root, 'a[href^="/shorts/"], a[href="/shorts"]').forEach(
        (anchor) => {
          if (anchor.closest("[data-nullfeed-hidden]")) return;
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
      // Activate "New to you" chip (one-shot per navigation, with retry fallback)
      syncYouTubeNewToYouChip(true);

      // Also hide algorithmic history-based recommendation shelves
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
