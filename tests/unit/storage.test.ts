import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import {
  ensureSettings,
  getSettings,
  SAVE_DEBOUNCE_MS,
  saveSettings,
  SETTINGS_STORAGE_KEY
} from "../../src/shared/storage";

const get = vi.fn();
const set = vi.fn();

beforeEach(() => {
  get.mockReset();
  set.mockReset();
  vi.stubGlobal("chrome", {
    storage: {
      sync: { get, set }
    }
  });
});

describe("sync storage", () => {
  it("creates documented defaults when no settings exist", async () => {
    get.mockResolvedValue({});
    set.mockResolvedValue(undefined);

    await expect(ensureSettings()).resolves.toEqual(DEFAULT_SETTINGS);
    expect(set).toHaveBeenCalledWith({
      [SETTINGS_STORAGE_KEY]: DEFAULT_SETTINGS
    });
  });

  it("validates reads and writes only the whitelisted schema", async () => {
    get.mockResolvedValue({
      [SETTINGS_STORAGE_KEY]: {
        enabled: false,
        youtube: { shorts: false },
        unexpected: "discard me"
      }
    });
    set.mockResolvedValue(undefined);

    const settings = await getSettings();
    await saveSettings(settings);

    expect(settings.enabled).toBe(false);
    expect(settings.youtube.shorts).toBe(false);
    expect(set.mock.calls[0][0][SETTINGS_STORAGE_KEY]).not.toHaveProperty(
      "unexpected"
    );
  });

  it("coalesces rapid writes into the latest settings record", async () => {
    vi.useFakeTimers();
    set.mockResolvedValue(undefined);

    const first = saveSettings({ ...DEFAULT_SETTINGS, enabled: false });
    const latest = {
      ...DEFAULT_SETTINGS,
      facebook: { ...DEFAULT_SETTINGS.facebook, videos: true }
    };
    const second = saveSettings(latest);

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    await expect(first).resolves.toEqual(latest);
    await expect(second).resolves.toEqual(latest);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({
      [SETTINGS_STORAGE_KEY]: latest
    });

    vi.useRealTimers();
  });
});
