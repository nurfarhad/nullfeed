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
        youtube: { shorts: false, unexpected: "ignored" },
        facebook: { videos: true },
        instagram: "malformed",
        secret: "must not survive"
      })
    ).toEqual({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      enabled: false,
      lastPlatform: "instagram",
      facebook: { reels: true, stories: true, videos: true },
      instagram: { reels: true, stories: true, explore: true },
      youtube: { shorts: false, navigation: true, redirect: true }
    });
  });

  it("detects whether any granular filter is active", () => {
    expect(hasActiveFilters(DEFAULT_SETTINGS)).toBe(true);
    expect(
      hasActiveFilters({
        ...DEFAULT_SETTINGS,
        youtube: { shorts: false, navigation: false, redirect: false },
        facebook: { reels: false, stories: false, videos: false },
        instagram: { reels: false, stories: false, explore: false }
      })
    ).toBe(false);
  });
});
