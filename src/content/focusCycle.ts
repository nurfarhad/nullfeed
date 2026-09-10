import { cleanupOwnedFeature, hideElement } from "./domOwnership";
import { mountQuoteCard, unmountQuoteCard, type QuoteCardReason } from "./quoteCard";
import { setAnchor, type CyclePlatform } from "../shared/focusCycleStorage";

export type { CyclePlatform };

export type CycleConfig = {
  hostnamePattern: RegExp;
  feedSelectors: string[];
};

export const CYCLE_PLATFORMS: Record<CyclePlatform, CycleConfig> = {
  facebook: {
    hostnamePattern: /(?:^|\.)facebook\.com$/i,
    feedSelectors: [
      '[role="feed"]',
      '[data-pagelet="Feed"]',
      'div[role="main"] [role="feed"]',
      'div[role="main"] [data-pagelet="Feed"]',
      'div[role="main"] div[data-virtualized="false"]',
      'div[role="main"] [data-pagelet^="FeedUnit"]',
      'div[role="main"] [role="article"]:not([data-pagelet*="Stories"])'
    ]
  },
  linkedin: {
    hostnamePattern: /(?:^|\.)linkedin\.com$/i,
    feedSelectors: ['.scaffold-finite-scroll', 'main.scaffold-layout__main']
  },
  twitter: {
    hostnamePattern: /(?:^|\.)(?:x\.com|twitter\.com)$/i,
    feedSelectors: [
      'div[data-testid="primaryColumn"] section[role="region"]',
      'div[aria-label="Home timeline"] > div > section[role="region"]'
    ]
  },
  reddit: {
    hostnamePattern: /(?:^|\.)reddit\.com$/i,
    feedSelectors: ['shreddit-feed']
  }
};

export const CYCLE_BREAK_MS = 15 * 60_000;
export const CYCLE_ON_MS = 15 * 60_000;
export const CYCLE_TOTAL_MS = 30 * 60_000;

export function findFeedContainer(
  selectors: string[],
  root: { querySelector: (selector: string) => Element | null } | null = typeof document !== "undefined"
    ? document
    : null
): Element | null {
  if (!root) {
    return null;
  }
  for (const selector of selectors) {
    const match = root.querySelector(selector);
    if (match) {
      // If the matched selector is a single article / unit, climb up to find the enclosing feed container
      if (
        typeof match.matches === "function" &&
        match.matches('[data-pagelet^="FeedUnit"], [role="article"], div[data-virtualized="false"]')
      ) {
        // Look for an explicit feed ancestor above this unit (never match the unit itself)
        const feedAncestor = match.parentElement?.closest(
          '[role="feed"], [data-pagelet="Feed"], [data-pagelet*="Feed"]:not([data-pagelet^="FeedUnit"])'
        );
        if (
          feedAncestor &&
          !feedAncestor.matches(
            'main, [role="main"], body, html, [role="navigation"], [role="banner"]'
          )
        ) {
          return feedAncestor;
        }

        // If no explicit role="feed" wrapper exists, find the post container inside role="main"
        let candidate: Element | null = match.parentElement;
        let bestChild: Element = match;
        while (
          candidate &&
          candidate !== document.body &&
          candidate !== document.documentElement &&
          !candidate.matches('main, [role="main"], [role="navigation"], [role="banner"]')
        ) {
          bestChild = candidate;
          candidate = candidate.parentElement;
        }
        return bestChild;
      }
      return match;
    }
  }
  return null;
}

export function detectCyclePlatform(hostname: string): CyclePlatform | null {
  for (const [platform, config] of Object.entries(CYCLE_PLATFORMS) as [
    CyclePlatform,
    CycleConfig
  ][]) {
    if (config.hostnamePattern.test(hostname)) {
      return platform;
    }
  }
  return null;
}

export function getPhase(anchor: number, now = Date.now()): "on" | "off" {
  const elapsed = Math.max(0, now - anchor);
  return elapsed % CYCLE_TOTAL_MS < CYCLE_BREAK_MS ? "off" : "on";
}

/**
 * Called by the Scroll Detector when it decides the current "off" (free
 * browsing) window should end early. Shifts the stored anchor back by
 * exactly CYCLE_BREAK_MS so getPhase() reads "on" (blocked) starting right
 * now, then rides out the normal ~15-minute block and resumes the regular
 * 30-minute rhythm from there — it nudges the existing cycle forward rather
 * than starting a parallel timer.
 */
export async function triggerEarlyBlock(
  platform: CyclePlatform,
  now = Date.now()
): Promise<void> {
  await setAnchor(platform, now - CYCLE_BREAK_MS, now);
}

export function applyCyclePhase(
  platform: CyclePlatform,
  phase: "on" | "off",
  reason: QuoteCardReason = "cycle",
  showQuotes = true
): void {
  const config = CYCLE_PLATFORMS[platform];
  if (phase === "on") {
    const feed = findFeedContainer(config.feedSelectors);
    if (feed) {
      hideElement(feed, "focus-cycle");
      if (showQuotes) {
        mountQuoteCard(feed, "before", reason);
      } else {
        unmountQuoteCard();
      }
    }
    // Also guarantee all virtualized post cards in the main feed on Facebook are hidden
    if (platform === "facebook") {
      document
        .querySelectorAll(
          'div[role="main"] div[data-virtualized="false"], div[role="main"] [data-pagelet^="FeedUnit"], div[role="main"] [role="article"]:not([data-pagelet*="Stories"])'
        )
        .forEach((post) => {
          if (!post.closest("#nullfeed-quote-card")) {
            hideElement(post, "focus-cycle");
          }
        });
    }
  } else {
    unmountQuoteCard();
    cleanupOwnedFeature("focus-cycle", document);
  }
}
