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

  it("defaults ads to on for Facebook", () => {
    expect(DEFAULT_SETTINGS.facebook.ads).toBe(true);
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
      facebook: { reels: true, stories: true, videos: true, ads: true, messages: false },
      instagram: { reels: true, stories: true, explore: true, messages: false },
      youtube: {
        shorts: false,
        redirect: true,
        sidebar: true,
        feed: true,
        comments: true,
        endscreen: true
      }
    });
  });

  it("backfills missing ads field to default", () => {
    const result = validateSettings({
      facebook: { reels: false, stories: false, videos: false, messages: false }
    });
    expect(result.facebook.ads).toBe(true);
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
          redirect: false,
          sidebar: false,
          feed: false,
          comments: false,
          endscreen: false
        },
        facebook: { reels: false, stories: false, videos: false, ads: false, messages: false },
        instagram: { reels: false, stories: false, explore: false, messages: false }
      })
    ).toBe(false);

    expect(
      hasActiveFilters({
        ...DEFAULT_SETTINGS,
        youtube: {
          shorts: false,
          redirect: false,
          sidebar: false,
          feed: false,
          comments: false,
          endscreen: false
        },
        facebook: { reels: false, stories: false, videos: false, ads: false, messages: true },
        instagram: { reels: false, stories: false, explore: false, messages: false }
      })
    ).toBe(true);
  });

  it("returns false if all visible toggles are off even if background ads or redirect are on", () => {
    expect(
      hasActiveFilters({
        ...DEFAULT_SETTINGS,
        youtube: {
          shorts: false,
          redirect: true,
          sidebar: false,
          feed: false,
          comments: false,
          endscreen: false
        },
        facebook: { reels: false, stories: false, videos: false, ads: true, messages: false },
        instagram: { reels: false, stories: false, explore: false, messages: false }
      })
    ).toBe(false);
  });
});
