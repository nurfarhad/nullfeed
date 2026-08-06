import type { Settings } from "../../shared/settings";
import type { SiteAdapter } from "../adapter";
import { queryAll } from "../adapter";
import {
  cleanupOwnedElements,
  hideClosest,
  hideElement
} from "../domOwnership";

const SHORTS_CONTAINERS = [
  "ytd-rich-item-renderer",
  "ytd-video-renderer",
  "ytd-grid-video-renderer",
  "ytd-compact-video-renderer",
  "ytd-playlist-video-renderer",
  "yt-lockup-view-model",
  "ytd-item-section-renderer"
] as const;

const NAVIGATION_CONTAINERS = [
  "ytd-guide-entry-renderer",
  "ytd-mini-guide-entry-renderer",
  "tp-yt-paper-item",
  "yt-list-item-view-model"
] as const;

export const youtubeAdapter: SiteAdapter = {
  platform: "youtube",
  homeUrl: "https://www.youtube.com/",

  blockedRoute(pathname, settings) {
    return (
      settings.enabled &&
      settings.youtube.redirect &&
      /^\/shorts(?:\/|$)/i.test(pathname)
    );
  },

  scan(root, settings) {
    if (!settings.enabled) {
      return;
    }

    if (settings.youtube.shorts) {
      for (const selector of [
        "ytd-reel-shelf-renderer",
        "ytd-rich-shelf-renderer[is-shorts]",
        "ytd-reel-item-renderer",
        "ytm-shorts-lockup-view-model"
      ]) {
        queryAll(root, selector).forEach((element) =>
          hideElement(element, "youtube-shorts")
        );
      }

      queryAll(root, 'a[href^="/shorts/"], a[href="/shorts"]').forEach(
        (anchor) => {
          if (!anchor.closest("ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer")) {
            hideClosest(anchor, SHORTS_CONTAINERS, "youtube-shorts");
          }
        }
      );
    }

    if (settings.youtube.navigation) {
      queryAll(root, 'a[href="/shorts"], a[href^="/shorts?"]').forEach(
        (anchor) =>
          hideClosest(
            anchor,
            NAVIGATION_CONTAINERS,
            "youtube-navigation"
          )
      );
    }
  },

  cleanup() {
    cleanupOwnedElements();
  }
};
