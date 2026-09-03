import type { Settings } from "../../shared/settings";
import { DEVELOPMENT, OWN_PAGE_URL } from "../../shared/constants";
import type { SiteAdapter } from "../adapter";
import { queryAll } from "../adapter";
import {
  cleanupOwnedElements,
  collapseEmptyAncestors,
  hideElement
} from "../domOwnership";

const VERIFIED_FEED_UNITS = [
  '[role="article"]',
  '[data-pagelet^="FeedUnit"]',
  'div[data-virtualized="false"]',
  '[aria-posinset]',
  '[data-pagelet*="Reels"]',
  '[data-pagelet*="Stories"]'
] as const;

const STORY_LINK_SELECTOR =
  'a[href^="/stories/"], a[href="/stories/"], a[href*="/stories/create"]';

function findPostContainer(element: Element): Element {
  for (const selector of [
    '[role="article"]',
    '[data-pagelet^="FeedUnit"]',
    'div[data-virtualized="false"]',
    '[aria-posinset]'
  ]) {
    const unit = element.closest(selector);
    if (
      unit &&
      !unit.matches(
        'main, [role="main"], [role="feed"], [role="navigation"], [role="banner"], header, nav'
      )
    ) {
      return unit;
    }
  }

  let child: Element = element;
  let candidate = element.parentElement;

  for (let depth = 0; candidate && depth < 25; depth += 1) {
    if (
      candidate === document.body ||
      candidate === document.documentElement ||
      candidate.matches('[role="navigation"], [role="banner"], header, nav')
    ) {
      break;
    }

    if (candidate.matches('[role="feed"], [role="main"], main')) {
      return child;
    }

    child = candidate;
    candidate = candidate.parentElement;
  }

  return element;
}

function closestVerifiedFeedUnit(element: Element): Element | null {
  for (const selector of VERIFIED_FEED_UNITS) {
    const unit = element.closest(selector);
    if (
      unit &&
      !unit.matches('main, [role="main"], [role="feed"], [role="navigation"], [role="banner"]')
    ) {
      return unit;
    }
  }

  return null;
}

/**
 * Check whether an element sits inside a regular single-author feed post.
 * Story links inside posts are profile-picture avatars that happen
 * to link to stories and must NOT trigger hiding the whole post.
 */
function isInsideFeedPost(element: Element): boolean {
  const article = element.closest(
    '[role="article"], div[data-virtualized="false"]:not(:has(a[href*="/stories/create"]))'
  );
  if (!article) {
    return false;
  }
  const storyLinks = article.querySelectorAll(STORY_LINK_SELECTOR);
  return storyLinks.length === 1 && !article.querySelector('a[href*="/stories/create"]');
}

function hideFeedEntries(
  root: ParentNode,
  selector: string,
  feature: string
): void {
  queryAll(root, selector).forEach((link) => {
    // Guard: NEVER touch navigation, banner, header, or top navigation bar
    if (
      link.closest(
        'nav, header, [role="navigation"], [role="banner"], [data-pagelet*="NavBar"], [data-pagelet*="Header"]'
      )
    ) {
      return;
    }

    const unit = findPostContainer(link);
    hideElement(unit, feature);
    collapseEmptyAncestors(unit, feature);
  });
}

function findStoryTray(link: Element): Element {
  const markedTray = link.closest('[data-pagelet*="Stories"]');
  let candidate = (markedTray ?? link).parentElement;
  let bestContainer: Element = markedTray ?? link;

  for (let depth = 0; candidate && depth < 15; depth += 1) {
    if (
      candidate === document.body ||
      candidate === document.documentElement ||
      candidate.matches('main, [role="main"], [role="feed"], [role="navigation"], [role="banner"]')
    ) {
      return bestContainer;
    }

    // Stop immediately if candidate contains any regular feed post article
    if (
      candidate.matches('[role="article"]') &&
      candidate.querySelectorAll(STORY_LINK_SELECTOR).length < 2 &&
      !candidate.querySelector('a[href*="/stories/create"]')
    ) {
      return bestContainer;
    }

    if (candidate.querySelector('[role="article"]:not([data-pagelet*="Stories"])')) {
      return bestContainer;
    }

    if (
      candidate.matches(
        '[data-pagelet*="Stories"], [data-pagelet^="FeedUnit"], [role="region"], div[data-virtualized="false"]'
      ) ||
      candidate.getAttribute("aria-label")?.toLowerCase().includes("stories")
    ) {
      bestContainer = candidate;
    }

    const storyCount = candidate.querySelectorAll(STORY_LINK_SELECTOR).length;
    if (storyCount >= 2 || candidate.querySelector('a[href*="/stories/create"]')) {
      bestContainer = candidate;
    }

    candidate = candidate.parentElement;
  }

  return bestContainer;
}

function hideStoryEntries(root: ParentNode): void {
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

  // Also catch any data-pagelet*="Stories" or aria-label="Stories" containers directly
  queryAll(
    root,
    '[data-pagelet*="Stories"], div[aria-label*="Stories" i], div[aria-label*="stories" i]'
  ).forEach((el) => {
    const tray = findStoryTray(el);
    if (tray) {
      trays.add(tray);
    }
  });

  trays.forEach((tray) => {
    hideElement(tray, "facebook-stories");
    collapseEmptyAncestors(tray, "facebook-stories");
  });

  storyLinks.forEach((link) => {
    if (![...trays].some((tray) => tray.contains(link))) {
      hideElement(link, "facebook-stories");
    }
  });
}

function hideNativeVideos(root: ParentNode): void {
  queryAll(root, "video").forEach((video) => {
    if (video instanceof HTMLVideoElement) {
      try {
        video.pause();
        video.setAttribute("data-nullfeed-paused", "");
      } catch {
        // Fail open if Facebook replaces the media element during playback.
      }
    }

    const unit = findPostContainer(video);
    hideElement(unit, "facebook-videos");
    collapseEmptyAncestors(unit, "facebook-videos");
    if (unit !== video) {
      hideElement(video, "facebook-videos");
    }
  });
}

function hideNavigationEntries(
  root: ParentNode,
  selector: string,
  feature: string
): void {
  queryAll(root, selector).forEach((link) => {
    const navigationItem = link.closest(
      '[role="tab"], [role="menuitem"], li'
    );
    const target = navigationItem ?? link;
    if (
      target &&
      !target.matches(
        'main, [role="main"], [role="feed"], [role="navigation"], [role="banner"], header, nav'
      )
    ) {
      hideElement(target, feature);
    }
  });
}

// ---------------------------------------------------------------------------
// Facebook Sponsored & Ads — two-path detection
// ---------------------------------------------------------------------------
//
// FEED path (virtualised posts):
//   Three-clause data-ad-rendering-role selectors identify ad posts.
//   profile_name + story_message alone match most ordinary posts —
//   cta- (call-to-action) is the ad-exclusive discriminator. Note ^=
//   not = — values are index-suffixed (e.g. cta-6).
//
//   Run ONLY as querySelectorAll, NEVER in a CSS stylesheet. A :has()
//   stylesheet rule re-evaluates on every DOM mutation; on Facebook's
//   never-stopping feed this becomes a permanent style-recalculation tax
//   that prevents Facebook from rendering its own posts.
//
//   Feed ads are tagged data-nullfeed-fb-ad="feed" and rendered as a 72px
//   placeholder via CSS. Do NOT display:none them — Facebook's virtualised
//   feed measures item heights, so removing posts makes it look short →
//   more loading → more hidden ads → feed churns on skeletons forever.
//
//   Sanity guard: if ≥ FB_AD_RATIO_MIN_SAMPLE posts match AND
//   matches/total > FB_AD_MAX_FEED_SHARE, the selector is catching ordinary
//   posts on this account. Release everything already tagged and stand down.
//
// RAIL path (sidebar):
//   Sidebar ads carry a real "Sponsored" text label inside an
//   ignore-late-mutation wrapper. Text scan tags the innermost labelled
//   wrapper data-nullfeed-fb-ad="rail" — CSS does display:none.
//   Only innermost is tagged: tagging an outer one blanks surrounding layout.
//
// LINK path (supplementary):
//   AdChoices / ad-about links are locale-independent and always present.
//   Tags the containing article as a feed ad (placeholder treatment).

/** Attribute written on every detected ad element. */
const FB_AD_ATTR = "data-nullfeed-fb-ad";
/** Value for a virtualised feed ad — gets a CSS placeholder, not display:none. */
const FB_AD_FEED_VALUE = "feed";
/** Value for a rail/sidebar ad — gets display:none. */
const FB_AD_RAIL_VALUE = "rail";

/**
 * Three-clause feed-ad selectors — ALL three clauses are load-bearing.
 * profile_name + story_message alone matched 16 of 17 ordinary posts in
 * live testing. cta- is what makes this an ad test, not a post test.
 */
const FB_FEED_AD_SELECTORS = [
  'div[data-virtualized="false"]:has([data-ad-rendering-role="profile_name"]):has([data-ad-rendering-role="story_message"]):has([data-ad-rendering-role^="cta-"])',
  'div[role="article"]:has([data-ad-rendering-role="profile_name"]):has([data-ad-rendering-role="story_message"]):has([data-ad-rendering-role^="cta-"])',
  '[aria-posinset]:has([data-ad-rendering-role="profile_name"]):has([data-ad-rendering-role="story_message"]):has([data-ad-rendering-role^="cta-"])',
].join(",");

/** Ordinary feed posts — denominator for the sanity ratio check. */
const FB_FEED_POST_SELECTOR = 'div[data-virtualized="false"]';

/**
 * Sanity guard thresholds. If ≥ MIN_SAMPLE posts match AND
 * match/total > MAX_FEED_SHARE, stand down (selector is matching real posts).
 */
const FB_AD_RATIO_MIN_SAMPLE = 4;
const FB_AD_MAX_FEED_SHARE = 0.4;

/** Sidebar ad containers — these carry a real "Sponsored" text label. */
const FB_RAIL_CONTAINER_SELECTOR = 'div[data-visualcompletion="ignore-late-mutation"]';

/** AdChoices and ad-about links — locale-independent, always in real ads. */
const FB_AD_LINK_SELECTORS = [
  'a[href*="/ads/about"]',
  'a[href*="/about/ads"]',
  'a[href*="facebook.com/ads/about"]',
  'a[href*="facebook.com/about/ads"]',
  'a[href*="/adpreferences"]',
  'a[href*="adpreferences"]',
  'a[href*="about_ads"]',
  'a[href*="/privacy/policies/ads"]',
  'a[href*="facebook.com/ads/"]',
  'a[href*="facebook.com/ad_preferences"]'
] as const;

/**
 * Regex matching ad label keywords in English and top localized variants.
 * Handles "Ad", "Ad ·", "Sponsored", "Sponsored ·", "Paid partnership", etc.
 */
const AD_LABEL_REGEX =
  /^(?:sponsored|ad|advertisement|promoted|paid\s+partnership|gesponsert|sponsoris[ée]|patrocinado|publicidad)(?:\s*[·•\.\:\-—]|\s*$)/i;

/**
 * Strip zero-width and directional control characters Facebook injects
 * into label text to defeat simple substring searches, then normalise whitespace.
 */
function normalizeSponsoredText(text: string): string {
  return text
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00AD\u00C2]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Checks whether an individual DOM element functions as an ad/sponsored label.
 * Checks both inner text and aria-label, guarding against long paragraph content.
 */
function isAdLabelElement(el: Element): boolean {
  const text = el.textContent ?? "";
  if (text.length > 0 && text.length <= 40) {
    if (AD_LABEL_REGEX.test(normalizeSponsoredText(text))) {
      return true;
    }
  }

  const aria = el.getAttribute("aria-label");
  if (aria && aria.length <= 40) {
    if (AD_LABEL_REGEX.test(normalizeSponsoredText(aria))) {
      return true;
    }
  }

  return false;
}

/**
 * True when the container has a dedicated "Sponsored" or "Ad" label element.
 * Skips text inside the user's organic post message body to prevent false positives.
 */
function containerHasSponsoredLabel(container: Element): boolean {
  for (const el of container.querySelectorAll(
    "h3, h4, a, span, [role='button'], [role='link']"
  )) {
    if (
      el.closest(
        '[data-ad-rendering-role="story_message"], [data-ad-comet-preview="message"]'
      )
    ) {
      continue;
    }
    if (isAdLabelElement(el)) {
      return true;
    }
  }
  return false;
}

/** Release every feed-ad placeholder — used by the sanity guard. */
function releaseFeedAds(): void {
  document
    .querySelectorAll(`[${FB_AD_ATTR}="${FB_AD_FEED_VALUE}"]`)
    .forEach((el) => el.removeAttribute(FB_AD_ATTR));
}

/**
 * Injects a real DOM node with a clickable attribution link inside the
 * ad placeholder so "Nur Farhad" is a live anchor, not just CSS text.
 * A data attribute is added to suppress the CSS ::after fallback text.
 */
function injectAdLabel(container: Element): void {
  if (container.hasAttribute("data-nullfeed-ad-label")) return;
  container.setAttribute("data-nullfeed-ad-label", "1");

  const label = document.createElement("span");
  label.className = "nullfeed-ad-label";
  label.innerHTML =
    'Sponsored &amp; ads hidden by '
    + `<a href="${OWN_PAGE_URL}" target="_blank" rel="noopener noreferrer">Nur Farhad</a>`;
  container.appendChild(label);
}

/** Feed-ad detection combining CTA queries, Ad/Sponsored text scan, and link heuristics. */
function applyFeedAdHiding(): void {
  const feedPosts = document.querySelectorAll(
    'div[data-virtualized="false"], [role="article"], [data-pagelet^="FeedUnit"], [aria-posinset]'
  );
  if (feedPosts.length === 0) return;

  const detectedAds: Element[] = [];

  for (const post of feedPosts) {
    if (post.hasAttribute(FB_AD_ATTR) || post.closest(`[${FB_AD_ATTR}]`)) {
      continue;
    }

    // 1. CTA role attributes
    if (post.matches(FB_FEED_AD_SELECTORS)) {
      detectedAds.push(post);
      continue;
    }

    // 2. Ad / Sponsored header metadata text or aria-label
    if (containerHasSponsoredLabel(post)) {
      detectedAds.push(post);
      continue;
    }

    // 3. AdChoices / ad-about link within post
    let hasAdLink = false;
    for (const selector of FB_AD_LINK_SELECTORS) {
      if (post.querySelector(selector)) {
        hasAdLink = true;
        break;
      }
    }
    if (hasAdLink) {
      detectedAds.push(post);
      continue;
    }
  }

  // Sanity guard
  const totalPosts = document.querySelectorAll(FB_FEED_POST_SELECTOR).length;
  if (
    detectedAds.length >= FB_AD_RATIO_MIN_SAMPLE &&
    totalPosts > 0 &&
    detectedAds.length / totalPosts > FB_AD_MAX_FEED_SHARE
  ) {
    // Sanity guard triggered — selector is matching real posts, not just ads.
    releaseFeedAds();
    return;
  }

  for (const container of detectedAds) {
    if (!container.hasAttribute(FB_AD_ATTR)) {
      container.setAttribute(FB_AD_ATTR, FB_AD_FEED_VALUE);
      container.querySelectorAll("video").forEach((v) => {
        try { (v as HTMLVideoElement).pause(); } catch { /* ignore */ }
      });
      injectAdLabel(container);
    }
  }
}

/** Rail/sidebar ad detection scanning right-column pagelets and ignore-late-mutation containers. */
function applyRailAdHiding(): void {
  // 1. Scan sidebar roots (role="complementary" and data-pagelet="RightRail")
  const sidebarRoots = document.querySelectorAll(
    '[role="complementary"], [data-pagelet="RightRail"]'
  );

  for (const rail of sidebarRoots) {
    const candidates = rail.querySelectorAll(
      "h3, h4, span, a, [role='button'], [role='link']"
    );
    for (const el of candidates) {
      if (isAdLabelElement(el)) {
        // Walk up to find the immediate section wrapper within the rail
        let section: Element | null = el.parentElement;
        while (
          section &&
          section.parentElement &&
          section.parentElement !== rail &&
          !section.parentElement.matches('[role="complementary"], [data-pagelet="RightRail"]') &&
          section.parentElement !== document.body
        ) {
          section = section.parentElement;
        }
        if (section && !section.hasAttribute(FB_AD_ATTR) && section !== rail) {
          section.setAttribute(FB_AD_ATTR, FB_AD_RAIL_VALUE);
        }
      }
    }
  }

  // 2. Scan ignore-late-mutation containers (classic Facebook sidebar ad boxes)
  const labelled: Element[] = [];
  for (const wrapper of document.querySelectorAll(FB_RAIL_CONTAINER_SELECTOR)) {
    if (wrapper.hasAttribute(FB_AD_ATTR)) {
      continue;
    }
    if (containerHasSponsoredLabel(wrapper)) {
      labelled.push(wrapper);
    }
  }

  for (const wrapper of labelled) {
    const hasNestedMatch = labelled.some(
      (other) => other !== wrapper && wrapper.contains(other)
    );
    if (!hasNestedMatch) {
      wrapper.setAttribute(FB_AD_ATTR, FB_AD_RAIL_VALUE);
    }
  }
}

/**
 * Supplementary: AdChoices links → tag the containing verified article
 * as a feed ad (placeholder treatment). Locale-independent and reliable.
 */
function applyLinkBasedAdHiding(root: ParentNode): void {
  for (const selector of FB_AD_LINK_SELECTORS) {
    queryAll(root, selector).forEach((link) => {
      const article = closestVerifiedFeedUnit(link);
      if (article && !article.hasAttribute(FB_AD_ATTR)) {
        article.setAttribute(FB_AD_ATTR, FB_AD_FEED_VALUE);
        article.querySelectorAll("video").forEach((v) => {
          try { (v as HTMLVideoElement).pause(); } catch { /* ignore */ }
        });
        injectAdLabel(article);
      }
    });
  }
}

function hideSponsoredEntries(root: ParentNode): void {
  // Link-based detection uses the narrow subtree — fast on incremental scans.
  applyLinkBasedAdHiding(root);
  // Rail and feed detections always need the full document for the sanity ratio,
  // but we guard with hasAttribute checks so already-tagged elements are skipped.
  applyRailAdHiding();
  applyFeedAdHiding();
}

/** Remove all ad tags — called when the ads toggle is turned off or on cleanup. */
function restoreAds(): void {
  // Remove the data attribute that drives CSS placeholder styling
  document
    .querySelectorAll(`[${FB_AD_ATTR}]`)
    .forEach((el) => el.removeAttribute(FB_AD_ATTR));

  // Also remove injected label nodes and their marker attribute so they don't
  // accumulate if the user toggles ads off and back on.
  document.querySelectorAll(".nullfeed-ad-label").forEach((label) => {
    label.parentElement?.removeAttribute("data-nullfeed-ad-label");
    label.remove();
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
        'a[href*="/watch"], a[href*="/video"], a[href*="/videos"]',
        "facebook-videos"
      );
      hideNavigationEntries(
        root,
        '[role="navigation"] a[href*="/watch"], [role="navigation"] a[href*="/video"]',
        "facebook-videos"
      );
    }

    if (settings.facebook.ads) {
      hideSponsoredEntries(root);
    } else {
      restoreAds();
    }
  },

  cleanup() {
    document
      .querySelectorAll("[data-nullfeed-paused]")
      .forEach((video) => video.removeAttribute("data-nullfeed-paused"));
    restoreAds();
    cleanupOwnedElements();
  }
};
