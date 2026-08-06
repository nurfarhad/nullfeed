import type { Settings } from "../../shared/settings";
import { DEVELOPMENT } from "../../shared/constants";
import type { SiteAdapter } from "../adapter";
import { queryAll } from "../adapter";
import {
  cleanupOwnedElements,
  hideElement
} from "../domOwnership";

const VERIFIED_FEED_UNITS = [
  '[role="article"]',
  '[data-pagelet^="FeedUnit"]',
  '[data-pagelet*="Reels"]',
  '[data-pagelet*="Stories"]'
] as const;

const STORY_LINK_SELECTOR =
  'a[href^="/stories/"], a[href="/stories/"]';

function closestVerifiedUnit(link: Element): Element {
  for (const selector of VERIFIED_FEED_UNITS) {
    const unit = link.closest(selector);
    if (unit) {
      return unit;
    }
  }

  // Facebook's unnamed feed wrappers are not stable enough to hide safely.
  // Hiding only the matched entry point is preferable to blanking the feed.
  return link;
}

function closestVerifiedFeedUnit(element: Element): Element | null {
  for (const selector of VERIFIED_FEED_UNITS) {
    const unit = element.closest(selector);
    if (unit) {
      return unit;
    }
  }

  return null;
}

/**
 * Check whether an element sits inside a feed post (article).
 * Story links inside posts are profile-picture avatars that happen
 * to link to stories and must NOT be hidden.
 */
function isInsideFeedPost(element: Element): boolean {
  return element.closest(
    '[role="article"], [data-pagelet^="FeedUnit"]'
  ) !== null;
}

/**
 * Walk up from a story tray to find its full visual section wrapper.
 * Facebook wraps the story tray in one or more parent divs that
 * remain visible (and blank) if we only hide the inner tray.
 */
function findSectionWrapper(section: Element): Element | null {
  let wrapper: Element = section;
  let candidate = section.parentElement;

  for (let depth = 0; candidate && depth < 2; depth += 1) {
    if (
      candidate.matches(
        'main, [role="main"], [role="feed"], [role="navigation"], [role="banner"]'
      )
    ) {
      break;
    }

    // Only unwrap single-child presentation shells. A sibling may be unrelated
    // navigation, a composer, or a feed unit, so crossing it is unsafe.
    if (
      candidate.children.length !== 1 ||
      candidate.querySelector(
        '[role="article"], [data-pagelet^="FeedUnit_"]'
      )
    ) {
      break;
    }

    wrapper = candidate;
    candidate = candidate.parentElement;
  }

  return wrapper === section ? null : wrapper;
}

/**
 * Find the post container for a video element.
 * Tries verified selectors first, then performs a tightly bounded fallback for
 * an unnamed direct child of a semantic feed. Main-page wrappers are rejected.
 */
function findVideoPostContainer(element: Element): Element | null {
  const verified = closestVerifiedFeedUnit(element);
  if (verified) {
    return verified;
  }

  // Fallback: unnamed Facebook feed items occasionally omit role="article".
  let child: Element | null = element;
  let candidate = element.parentElement;

  for (let depth = 0; candidate && depth < 8; depth += 1) {
    if (
      candidate === document.body ||
      candidate === document.documentElement
    ) {
      return null;
    }

    if (candidate.matches('[role="feed"]') && child) {
      const nestedUnits = child.querySelectorAll(
        '[role="article"], [data-pagelet^="FeedUnit"], [data-pagelet*="Reels"], [data-pagelet*="Stories"]'
      ).length;
      const videos = child.querySelectorAll("video").length;

      if (nestedUnits === 0 && videos === 1) {
        if (DEVELOPMENT) {
          console.debug(
            "Nullfeed Facebook used the validated unnamed-video fallback."
          );
        }
        return child;
      }
      return null;
    }

    child = candidate;
    candidate = candidate.parentElement;
  }

  return null;
}

function hideFeedEntries(
  root: ParentNode,
  selector: string,
  feature: string
): void {
  queryAll(root, selector).forEach((link) => {
    hideElement(closestVerifiedUnit(link), feature);
  });
}

function hideStoryEntries(root: ParentNode): void {
  // Filter out story links inside feed posts (profile-picture avatars)
  const storyLinks = queryAll(root, STORY_LINK_SELECTOR).filter(
    (link) => !isInsideFeedPost(link)
  );
  const trays = new Set<Element>();

  for (const link of storyLinks) {
    const tray = findStoryTray(link);
    if (tray) {
      trays.add(tray);
    }
  }

  trays.forEach((tray) => hideElement(tray, "facebook-stories"));
  storyLinks.forEach((link) => {
    if (![...trays].some((tray) => tray.contains(link))) {
      hideElement(link, "facebook-stories");
    }
  });
}

function findStoryTray(link: Element): Element | null {
  const markedTray = link.closest('[data-pagelet*="Stories"]');
  if (markedTray) {
    return findSectionWrapper(markedTray) ?? markedTray;
  }

  let candidate = link.parentElement;
  for (let depth = 0; candidate && depth < 8; depth += 1) {
    if (
      candidate.matches(
        'main, [role="main"], [role="article"], [data-pagelet^="FeedUnit"]'
      ) ||
      candidate.querySelector(
        '[role="article"], [data-pagelet^="FeedUnit"]'
      )
    ) {
      return null;
    }

    const storyCount = candidate.querySelectorAll(STORY_LINK_SELECTOR).length;
    if (storyCount >= 2) {
      return findSectionWrapper(candidate) ?? candidate;
    }

    candidate = candidate.parentElement;
  }

  return null;
}

function hideNativeVideos(root: ParentNode): void {
  queryAll(root, "video").forEach((video) => {
    const unit = findVideoPostContainer(video);
    if (!unit) {
      return;
    }

    if (video instanceof HTMLVideoElement) {
      try {
        video.pause();
        video.setAttribute("data-nullfeed-paused", "");
      } catch {
        // Fail open if Facebook replaces the media element during playback.
      }
    }
    hideElement(unit, "facebook-videos");
  });
}

function hideNavigationEntries(
  root: ParentNode,
  selector: string,
  feature: string
): void {
  queryAll(root, selector).forEach((link) => {
    const navigationItem = link.closest(
      '[role="navigation"] li, [role="menuitem"], [role="tab"]'
    );
    hideElement(navigationItem ?? link, feature);
  });
}

export const facebookAdapter: SiteAdapter = {
  platform: "facebook",
  homeUrl: "https://www.facebook.com/",

  blockedRoute(pathname, settings) {
    if (!settings.enabled) {
      return false;
    }

    if (
      settings.facebook.reels &&
      /^\/(?:reel|reels)(?:\/|$)/i.test(pathname)
    ) {
      return true;
    }

    return (
      settings.facebook.videos &&
      /^\/(?:watch|video|videos)(?:\/|$)/i.test(pathname)
    );
  },

  scan(root, settings) {
    if (!settings.enabled) {
      return;
    }

    if (settings.facebook.reels) {
      hideFeedEntries(
        root,
        'a[href^="/reel/"], a[href="/reels/"], a[href^="/reels/"]',
        "facebook-reels"
      );
      hideNavigationEntries(
        root,
        '[role="navigation"] a[href^="/reel"], [role="tab"][href^="/reel"]',
        "facebook-reels"
      );
    }

    if (settings.facebook.stories) {
      hideStoryEntries(root);
    }

    if (settings.facebook.videos) {
      hideNativeVideos(root);
      hideFeedEntries(
        root,
        'a[href^="/watch"], a[href^="/video"], a[href^="/videos"]',
        "facebook-videos"
      );
      hideNavigationEntries(
        root,
        '[role="navigation"] a[href^="/watch"], [role="navigation"] a[href^="/video"]',
        "facebook-videos"
      );
    }
  },

  cleanup() {
    document
      .querySelectorAll("[data-nullfeed-paused]")
      .forEach((video) => video.removeAttribute("data-nullfeed-paused"));
    cleanupOwnedElements();
  }
};
