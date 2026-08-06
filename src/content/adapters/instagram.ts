import type { Settings } from "../../shared/settings";
import type { SiteAdapter } from "../adapter";
import { queryAll } from "../adapter";
import { cleanupOwnedElements, hideElement } from "../domOwnership";

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

/** Find a bounded Instagram post or grid cell without crossing into a row/feed. */
function findContentBoundary(link: Element): Element {
  const article = link.closest("article");
  if (article && isSingleContentBoundary(article)) {
    return article;
  }

  let candidate = link.parentElement;
  let boundary: Element = link;

  for (let depth = 0; candidate && depth < 4; depth += 1) {
    if (!isSingleContentBoundary(candidate)) {
      break;
    }
    boundary = candidate;
    candidate = candidate.parentElement;
  }

  return boundary;
}

/**
 * A Stories tray is accepted only when the smallest candidate contains at
 * least two story entries and no post/reel entry or article. Single ambiguous
 * links fail open by being hidden in place.
 */
function findStoryTray(link: Element): Element | null {
  let candidate = link.parentElement;

  for (let depth = 0; candidate && depth < 6; depth += 1) {
    if (
      candidate.matches(
        'main, nav, header, article, [role="main"], [role="navigation"]'
      ) ||
      candidate.querySelector("article, " + CONTENT_LINK_SELECTOR)
    ) {
      return null;
    }

    const unrelatedLinkCount = uniqueHrefs(
      candidate,
      `a[href]:not([href^="/stories/"])`
    ).size;
    if (unrelatedLinkCount > MAX_STORY_TRAY_UNRELATED_LINKS) {
      return null;
    }

    if (uniqueHrefs(candidate, STORY_LINK_SELECTOR).size >= 2) {
      return candidate;
    }

    candidate = candidate.parentElement;
  }

  return null;
}

function hideNavigationLink(link: Element, feature: string): void {
  const item = link.closest(
    'nav li, header li, [role="navigation"] li, [role="menuitem"], [role="tab"]'
  );
  hideElement(item ?? link, feature);
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
      /^\/(?:reel|reels)(?:\/|$)/i.test(pathname)
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
      return;
    }

    if (settings.instagram.reels) {
      queryAll(
        root,
        'a[href^="/reel/"], a[href="/reels/"], a[href^="/reels/"]'
      ).forEach((link) => {
        if (link.closest('nav, header, [role="navigation"]')) {
          hideNavigationLink(link, "instagram-reels");
        } else {
          hideElement(findContentBoundary(link), "instagram-reels");
        }
      });
    }

    if (settings.instagram.stories) {
      queryAll(root, STORY_LINK_SELECTOR).forEach((link) => {
        // Story URLs inside posts are author avatars, not the Stories tray.
        if (link.closest("article")) {
          return;
        }
        hideElement(findStoryTray(link) ?? link, "instagram-stories");
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
