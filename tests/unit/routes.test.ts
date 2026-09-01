import { describe, expect, it } from "vitest";

import { facebookAdapter } from "../../src/content/adapters/facebook";
import { instagramAdapter } from "../../src/content/adapters/instagram";
import { youtubeAdapter } from "../../src/content/adapters/youtube";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";

describe("blocked routes", () => {
  it("redirects enabled YouTube Shorts routes", () => {
    expect(youtubeAdapter.blockedRoute("/shorts/abc", DEFAULT_SETTINGS)).toBe(
      true
    );
    expect(youtubeAdapter.blockedRoute("/watch", DEFAULT_SETTINGS)).toBe(false);
  });

  it("redirects Facebook Reels but not Videos by default", () => {
    expect(facebookAdapter.blockedRoute("/reels/", DEFAULT_SETTINGS)).toBe(
      true
    );
    expect(facebookAdapter.blockedRoute("/watch/", DEFAULT_SETTINGS)).toBe(
      false
    );
  });

  it("redirects Instagram Reels and Explore", () => {
    expect(instagramAdapter.blockedRoute("/reel/abc/", DEFAULT_SETTINGS)).toBe(
      true
    );
    expect(
      instagramAdapter.blockedRoute("/username/reels/", DEFAULT_SETTINGS)
    ).toBe(true);
    expect(
      instagramAdapter.blockedRoute("/explore/", DEFAULT_SETTINGS)
    ).toBe(true);
  });

  it("never redirects while protection is paused", () => {
    const paused = { ...DEFAULT_SETTINGS, enabled: false };
    expect(youtubeAdapter.blockedRoute("/shorts/abc", paused)).toBe(false);
    expect(facebookAdapter.blockedRoute("/reels/", paused)).toBe(false);
    expect(instagramAdapter.blockedRoute("/explore/", paused)).toBe(false);
  });
});
