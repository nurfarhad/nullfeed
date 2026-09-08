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
        youtube: { shorts: false, unexpected: "ignored" },
        facebook: { videos: true },
        instagram: "malformed",
        secret: "must not survive"
      })
    ).toEqual({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      enabled: false,
      showQuotes: true,
      lastPlatform: "instagram",
      facebook: { reels: true, stories: true, videos: true, ads: true },
      instagram: { reels: true, stories: true, explore: true },
      youtube: { shorts: false, navigation: true, redirect: true, sidebar: true }
    });
  });

  it("backfills missing ads field to default", () => {
    const result = validateSettings({
      facebook: { reels: false, stories: false, videos: false }
    });
    expect(result.facebook.ads).toBe(true);
  });

  it("detects whether any granular filter is active", () => {
    expect(hasActiveFilters(DEFAULT_SETTINGS)).toBe(true);
    expect(
      hasActiveFilters({
        ...DEFAULT_SETTINGS,
        youtube: { shorts: false, navigation: false, redirect: false, sidebar: false },
        facebook: { reels: false, stories: false, videos: false, ads: false },
        instagram: { reels: false, stories: false, explore: false }
      })
    ).toBe(false);
  });

  it("returns false if all visible toggles are off even if background ads are on", () => {
    expect(
      hasActiveFilters({
        ...DEFAULT_SETTINGS,
        youtube: { shorts: false, navigation: false, redirect: true, sidebar: false },
        facebook: { reels: false, stories: false, videos: false, ads: true },
        instagram: { reels: false, stories: false, explore: false }
      })
    ).toBe(false);
  });
});
