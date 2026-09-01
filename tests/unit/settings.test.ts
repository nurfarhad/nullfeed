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

  it("defaults snooze to inactive with all sites enabled", () => {
    expect(DEFAULT_SETTINGS.snooze).toEqual({
      active: false,
      until: null,
      sites: {
        facebook: true,
        instagram: true,
        youtube: true,
        linkedin: true,
        twitter: true
      }
    });
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
      youtube: { shorts: false, navigation: true, redirect: true, sidebar: true },
      linkedin: { feed: true, news: true },
      twitter: { timeline: true, trending: true },
      snooze: {
        active: false,
        until: null,
        sites: {
          facebook: true,
          instagram: true,
          youtube: true,
          linkedin: true,
          twitter: true
        }
      }
    });
  });

  it("backfills missing ads field to default", () => {
    const result = validateSettings({
      facebook: { reels: false, stories: false, videos: false }
    });
    expect(result.facebook.ads).toBe(true);
  });

  it("backfills missing snooze object to defaults", () => {
    const result = validateSettings({ enabled: true });
    expect(result.snooze).toEqual({
      active: false,
      until: null,
      sites: {
        facebook: true,
        instagram: true,
        youtube: true,
        linkedin: true,
        twitter: true
      }
    });
  });

  it("backfills malformed snooze.until to null", () => {
    const result = validateSettings({
      snooze: { active: true, until: "not-a-number", sites: {} }
    });
    expect(result.snooze.until).toBeNull();
    expect(result.snooze.active).toBe(true);
  });

  it("preserves a valid finite snooze.until", () => {
    const ts = Date.now() + 60000;
    const result = validateSettings({
      snooze: { active: true, until: ts, sites: { facebook: false } }
    });
    expect(result.snooze.until).toBe(ts);
    expect(result.snooze.sites.facebook).toBe(false);
    expect(result.snooze.sites.instagram).toBe(true);
    expect(result.snooze.sites.linkedin).toBe(true);
    expect(result.snooze.sites.twitter).toBe(true);
  });

  it("detects whether any granular filter is active", () => {
    expect(hasActiveFilters(DEFAULT_SETTINGS)).toBe(true);
    expect(
      hasActiveFilters({
        ...DEFAULT_SETTINGS,
        youtube: { shorts: false, navigation: false, redirect: false, sidebar: false },
        facebook: { reels: false, stories: false, videos: false, ads: false },
        instagram: { reels: false, stories: false, explore: false },
        linkedin: { feed: false, news: false },
        twitter: { timeline: false, trending: false }
      })
    ).toBe(false);
  });
});

