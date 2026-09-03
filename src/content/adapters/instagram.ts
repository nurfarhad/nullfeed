import type { Settings } from "../../shared/settings";
import type { SiteAdapter } from "../adapter";
import { queryAll } from "../adapter";
import {
  cleanupOwnedElements,
  collapseEmptyAncestors,
  hideElement
} from "../domOwnership";

const CONTENT_LINK_SELECTOR =
  'a[href^="/p/"], a[href^="/reel/"], a[href^="/reels/"]';
const STORY_LINK_SELECTOR = 'a[href^="/stories/"]';
const MAX_CONTENT_BOUNDARY_LINKS = 3;
const MAX_STORY_TRAY_UNRELATED_LINKS = 3;

function uniqueHrefs(root: Element, selector: string): Set<string> {
  return new Set(
    [...root.querySelectorAll<HTMLAnchorElement>(selector)].map(
      (anchor) => anchor.getAttribute("href") ?? ""
    )
  );
}

function isSingleContentBoundary(candidate: Element): boolean {
  return (
    !candidate.matches("main, nav, header, [role=\"main\"], [role=\"navigation\"]") &&
    candidate.querySelectorAll("article").length <= 1 &&
    uniqueHrefs(candidate, "a[href]").size <= MAX_CONTENT_BOUNDARY_LINKS &&
    uniqueHrefs(candidate, CONTENT_LINK_SELECTOR).size === 1
  );
}

/** Find a bounded Instagram post, grid cell, or reel column without crossing into mixed photo layouts. */
function findContentBoundary(link: Element): Element {
  const article = link.closest("article");
  if (article && isSingleContentBoundary(article)) {
    return article;
  }

  let candidate: Element | null = link.parentElement;
  let boundary: Element = link;

  for (let depth = 0; candidate && depth < 6; depth += 1) {
    if (
      candidate === document.body ||
      candidate === document.documentElement ||
      candidate.matches(
        'main, nav, header, [role="main"], [role="navigation"], [role="tablist"], [role="feed"]'
      )
    ) {
      break;
    }

    // Stop if candidate contains any non-reel links outside of current boundary
    const nonReelLinks = candidate.querySelectorAll(
      'a[href]:not([href*="/reel/"]):not([href*="/reels/"])'
    );
    if (nonReelLinks.length > 0) {
      const hasSiblingLinks = Array.from(nonReelLinks).some(
        (nl) => !boundary.contains(nl)
      );
      if (hasSiblingLinks) {
        break;
      }
    }

    boundary = candidate;
    candidate = candidate.parentElement;
  }

  return boundary;
}

function findStoryTray(link: Element): Element {
  let candidate: Element | null = link.parentElement;
  let bestTray: Element = link;

  for (let depth = 0; candidate && depth < 6; depth += 1) {
    if (
      candidate === document.body ||
      candidate === document.documentElement ||
      candidate.matches(
        'main, nav, header, section, [role="main"], [role="navigation"], [role="tablist"], [role="tabpanel"]'
      )
    ) {
      break;
    }

    // Never engulf candidate if it contains headers, tabs, articles, forms, or follower/bio info
    if (
      candidate.querySelector(
        'header, [role="tablist"], [role="tabpanel"], article, form, a[href*="/followers/"], a[href*="/following/"]'
      )
    ) {
      break;
    }

    // Stop if candidate contains any links that are not stories
    const nonStoryLinks = candidate.querySelectorAll(
      'a[href]:not([href^="/stories/"])'
    );
    if (nonStoryLinks.length > 0) {
      break;
    }

    const storyLinks = candidate.querySelectorAll(STORY_LINK_SELECTOR);
    const isHighlights =
      candidate.querySelector('a[href*="/stories/highlights/"]') !== null;

    if (storyLinks.length >= 2 || isHighlights) {
      bestTray = candidate;
    }

    candidate = candidate.parentElement;
  }

  return bestTray;
}

const PROFILE_REELS_TAB_SELECTORS = [
  'a[href$="/reels/"]',
  'a[href*="/reels/"]',
  'a[role="tab"][href*="/reels"]',
  '[role="tab"]:has(a[href*="/reels"])'
].join(",");

const REEL_SELECTORS = [
  'a[href^="/reel/"]',
  'a[href*="/reel/"]',
  'a[href^="/reels/"]',
  'a[href*="/reels/"]',
  'a:has(svg[aria-label*="Clip" i])',
  'a:has(svg[aria-label*="Reel" i])',
  'a:has(svg[aria-label*="Video" i])'
].join(",");

function hideNavigationLink(link: Element, feature: string): void {
  const item = link.closest(
    'nav li, header li, [role="navigation"] li, [role="menuitem"], [role="tab"]'
  );
  hideElement(item ?? link, feature);
}

// Cached per-pathname layout flag — avoids re-querying document on every mutation during scroll.
let cachedPathname: string | null = null;
let cachedIsProfile = false;

function checkIsProfile(): boolean {
  if (cachedPathname !== window.location.pathname) {
    cachedPathname = window.location.pathname;
    cachedIsProfile = queryAll(document, '[role="tablist"]').length > 0;
  }
  return cachedIsProfile;
}

export const instagramAdapter: SiteAdapter = {
  platform: "instagram",
  homeUrl: "https://www.instagram.com/",

  blockedRoute(pathname, settings) {
    if (!settings.enabled) {
      return false;
    }

    if (
      settings.instagram.reels &&
      (/^\/(?:reel|reels)(?:\/|$)/i.test(pathname) ||
       /^\/[^/]+\/reels(?:\/|$)/i.test(pathname))
    ) {
      return true;
    }

    return (
      settings.instagram.explore &&
      /^\/explore(?:\/|$)/i.test(pathname)
    );
  },

  scan(root, settings) {
    if (!settings.enabled) {
      cachedPathname = null;
      return;
    }

    if (settings.instagram.reels) {
      // 1. Hide profile reels tabs
      queryAll(root, PROFILE_REELS_TAB_SELECTORS).forEach((tab) => {
        const tabItem =
          tab.closest('[role="tablist"] > *') ??
          tab.closest('[role="tab"], li') ??
          tab;
        hideElement(tabItem, "instagram-reels");
        collapseEmptyAncestors(tabItem, "instagram-reels");
      });

      // 2. Hide navigation entries
      queryAll(
        root,
        ':is(nav, header, [role="navigation"]) a:is([href="/reels/"], [href^="/reel/"], [href*="/reels/"])'
      ).forEach((link) => {
        hideNavigationLink(link, "instagram-reels");
      });

      // 3. Hide non-profile reels (feed, explore, search)
      if (!checkIsProfile()) {
        queryAll(root, REEL_SELECTORS).forEach((link) => {
          if (!link.closest('nav, header, [role="navigation"]')) {
            const boundary = findContentBoundary(link);
            hideElement(boundary, "instagram-reels");
            collapseEmptyAncestors(boundary, "instagram-reels");
          }
        });
      }
    }

    if (settings.instagram.stories) {
      const trays = new Set<Element>();
      queryAll(root, STORY_LINK_SELECTOR).forEach((link) => {
        // Story URLs inside posts are author avatars, not the Stories tray.
        if (link.closest("article")) {
          return;
        }
        trays.add(findStoryTray(link));
      });

      trays.forEach((tray) => {
        hideElement(tray, "instagram-stories");
        collapseEmptyAncestors(tray, "instagram-stories");
      });
    }

    if (settings.instagram.explore) {
      queryAll(root, 'a[href="/explore/"], a[href^="/explore/"]').forEach(
        (link) => hideNavigationLink(link, "instagram-explore")
      );
    }
  },

  cleanup() {
    cleanupOwnedElements();
  }
};
