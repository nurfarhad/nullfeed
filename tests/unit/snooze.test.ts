import { describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS, type Settings } from "../../src/shared/settings";

// Mock chrome.storage.sync
const store: Record<string, unknown> = {};
const chromeMock = {
  storage: {
    sync: {
      get: vi.fn(async () => ({ ...store })),
      set: vi.fn(async (data: Record<string, unknown>) => {
        Object.assign(store, data);
      })
    }
  }
};

vi.stubGlobal("chrome", chromeMock);

// Import after mocking
const { startSnooze, endSnooze, setSnoozeSite, saveSettings } = await import(
  "../../src/shared/storage"
);

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe("snooze storage helpers", () => {
  it("startSnooze sets active and a future until timestamp", async () => {
    const before = Date.now();
    const result = await startSnooze(makeSettings(), 60_000);
    const after = Date.now();

    expect(result.snooze.active).toBe(true);
    expect(result.snooze.until).toBeGreaterThanOrEqual(before + 60_000);
    expect(result.snooze.until).toBeLessThanOrEqual(after + 60_000);
  });

  it("endSnooze clears active and until", async () => {
    const snoozing = makeSettings({
      snooze: {
        active: true,
        until: Date.now() + 60_000,
        sites: { facebook: true, instagram: true, youtube: true }
      }
    });

    const result = await endSnooze(snoozing);
    expect(result.snooze.active).toBe(false);
    expect(result.snooze.until).toBeNull();
  });

  it("setSnoozeSite toggles an individual platform", async () => {
    const base = makeSettings();
    expect(base.snooze.sites.facebook).toBe(true);

    const result = await setSnoozeSite(base, "facebook", false);
    expect(result.snooze.sites.facebook).toBe(false);
    expect(result.snooze.sites.instagram).toBe(true);
    expect(result.snooze.sites.youtube).toBe(true);
  });

  it("preserves other snooze fields when toggling a site", async () => {
    const snoozing = makeSettings({
      snooze: {
        active: true,
        until: 9999999999999,
        sites: { facebook: true, instagram: true, youtube: true }
      }
    });

    const result = await setSnoozeSite(snoozing, "youtube", false);
    expect(result.snooze.active).toBe(true);
    expect(result.snooze.until).toBe(9999999999999);
    expect(result.snooze.sites.youtube).toBe(false);
  });
});
