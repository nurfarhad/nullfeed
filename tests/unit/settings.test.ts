import { describe, expect, it } from "vitest";

import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  hasActiveFilters,
  validateSettings
} from "../../src/shared/settings";

describe("settings validation", () => {
  it("returns the documented defaults for an empty record", () => {
    expect(validateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("opens fresh installs on Facebook", () => {
    expect(DEFAULT_SETTINGS.lastPlatform).toBe("facebook");
  });

  it("preserves known values and ignores malformed or unknown data", () => {
    expect(
      validateSettings({
        schemaVersion: 0,
        enabled: false,
        lastPlatform: "instagram",
        youtube: { shorts: false, feed: true, comments: true, unexpected: "ignored" },
        facebook: { videos: true },
        instagram: "malformed",
        secret: "must not survive"
      })
    ).toEqual({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      enabled: false,
      showQuotes: true,
      lastPlatform: "instagram",
      facebook: { reels: true, stories: true, videos: true, messages: false },
      instagram: { reels: true, stories: true, explore: true, messages: false },
      youtube: {
        shorts: false,
        sidebar: true,
        feed: true,
        comments: true,
        endscreen: true
      }
    });
  });

  it("defaults messages to false for Facebook and Instagram", () => {
    expect(DEFAULT_SETTINGS.facebook.messages).toBe(false);
    expect(DEFAULT_SETTINGS.instagram.messages).toBe(false);
  });

  it("detects whether any granular filter is active", () => {
    expect(hasActiveFilters(DEFAULT_SETTINGS)).toBe(true);
    expect(
      hasActiveFilters({
        ...DEFAULT_SETTINGS,
        youtube: {
          shorts: false,
          sidebar: false,
          feed: false,
          comments: false,
          endscreen: true
        },
        facebook: { reels: false, stories: false, videos: false, messages: false },
        instagram: { reels: false, stories: false, explore: false, messages: false }
      })
    ).toBe(false);

    expect(
      hasActiveFilters({
        ...DEFAULT_SETTINGS,
        youtube: {
          shorts: false,
          sidebar: false,
          feed: false,
          comments: false,
          endscreen: true
        },
        facebook: { reels: false, stories: false, videos: false, messages: true },
        instagram: { reels: false, stories: false, explore: false, messages: false }
      })
    ).toBe(true);
  });

  it("enforces endscreen as always true in background", () => {
    const result = validateSettings({
      youtube: { comments: false, endscreen: false }
    });
    expect(result.youtube.comments).toBe(false);
    expect(result.youtube.endscreen).toBe(true);
  });

  it("returns false if all visible toggles are off even if background endscreen is on", () => {
    expect(
      hasActiveFilters({
        ...DEFAULT_SETTINGS,
        youtube: {
          shorts: false,
          sidebar: false,
          feed: false,
          comments: false,
          endscreen: true
        },
        facebook: { reels: false, stories: false, videos: false, messages: false },
        instagram: { reels: false, stories: false, explore: false, messages: false }
      })
    ).toBe(false);
  });
});
