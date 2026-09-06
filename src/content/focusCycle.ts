import { cleanupOwnedFeature, hideElement } from "./domOwnership";
import { mountQuoteCard, unmountQuoteCard } from "./quoteCard";
import type { CyclePlatform } from "../shared/focusCycleStorage";

export type { CyclePlatform };

export type CycleConfig = {
  hostnamePattern: RegExp;
  feedSelectors: string[];
};

export const CYCLE_PLATFORMS: Record<CyclePlatform, CycleConfig> = {
  facebook: {
    hostnamePattern: /(?:^|\.)facebook\.com$/i,
    feedSelectors: ['[role="feed"]']
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

export function applyCyclePhase(
  platform: CyclePlatform,
  phase: "on" | "off"
): void {
  const config = CYCLE_PLATFORMS[platform];
  if (phase === "on") {
    const feed = findFeedContainer(config.feedSelectors);
    if (feed) {
      hideElement(feed, "focus-cycle");
      mountQuoteCard(feed, "before");
    }
  } else {
    unmountQuoteCard();
    cleanupOwnedFeature("focus-cycle", document);
  }
}
