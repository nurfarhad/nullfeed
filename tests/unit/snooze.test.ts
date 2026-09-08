import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelSnooze,
  formatSnoozeRemaining,
  getRemainingMs,
  getSnoozeRemainingMs,
  getSnoozeUntil,
  isSnoozeActive,
  isSnoozed,
  setSnooze,
  SNOOZE_STORAGE_KEY
} from "../../src/shared/snoozeStorage";

const mockLocalStorage: Record<string, unknown> = {};

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[]) => {
        const key = Array.isArray(keys) ? keys[0] : keys;
        return { [key]: mockLocalStorage[key] };
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockLocalStorage, items);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) {
          delete mockLocalStorage[k];
        }
      })
    }
  }
});

describe("snoozeStorage", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockLocalStorage)) {
      delete mockLocalStorage[key];
    }
  });

  describe("setSnooze and getSnoozeUntil", () => {
    it("stores and retrieves the future snooze timestamp", async () => {
      const before = Date.now();
      const until = await setSnooze(5);
      const after = Date.now();

      expect(until).toBeGreaterThanOrEqual(before + 5 * 60 * 1000);
      expect(until).toBeLessThanOrEqual(after + 5 * 60 * 1000);

      const retrieved = await getSnoozeUntil();
      expect(retrieved).toBe(until);
    });

    it("returns null if nothing was snoozed", async () => {
      expect(await getSnoozeUntil()).toBeNull();
    });

    it("returns null for malformed non-number data", async () => {
      mockLocalStorage[SNOOZE_STORAGE_KEY] = "not-a-number";
      expect(await getSnoozeUntil()).toBeNull();
    });
  });

  describe("isSnoozeActive and getRemainingMs (synchronous)", () => {
    it("reports active snooze when timestamp is in the future", () => {
      const now = 1_000_000;
      const future = 1_300_000;

      expect(isSnoozeActive(future, now)).toBe(true);
      expect(getRemainingMs(future, now)).toBe(300_000);
    });

    it("reports inactive snooze when timestamp is in the past or null", () => {
      const now = 1_000_000;
      const past = 900_000;

      expect(isSnoozeActive(past, now)).toBe(false);
      expect(getRemainingMs(past, now)).toBe(0);

      expect(isSnoozeActive(null, now)).toBe(false);
      expect(getRemainingMs(null, now)).toBe(0);
    });
  });

  describe("isSnoozed and getSnoozeRemainingMs (async from storage)", () => {
    it("reads active status directly from storage", async () => {
      const now = 1_000_000;
      mockLocalStorage[SNOOZE_STORAGE_KEY] = now + 60_000;

      expect(await isSnoozed(now)).toBe(true);
      expect(await getSnoozeRemainingMs(now)).toBe(60_000);
    });

    it("reads inactive status if storage has expired or empty timestamp", async () => {
      const now = 1_000_000;
      mockLocalStorage[SNOOZE_STORAGE_KEY] = now - 10_000;

      expect(await isSnoozed(now)).toBe(false);
      expect(await getSnoozeRemainingMs(now)).toBe(0);
    });
  });

  describe("cancelSnooze", () => {
    it("clears the stored snooze timestamp", async () => {
      await setSnooze(15);
      expect(await getSnoozeUntil()).not.toBeNull();

      await cancelSnooze();
      expect(await getSnoozeUntil()).toBeNull();
      expect(mockLocalStorage[SNOOZE_STORAGE_KEY]).toBeUndefined();
    });
  });

  describe("formatSnoozeRemaining", () => {
    it("formats minutes and seconds accurately", () => {
      const now = 10_000;
      // 4 minutes, 30 seconds remaining = 270,000 ms
      expect(formatSnoozeRemaining(now + 270_000, now)).toBe("4m 30s");
      // 45 seconds remaining
      expect(formatSnoozeRemaining(now + 45_000, now)).toBe("45s");
      // 15 minutes remaining
      expect(formatSnoozeRemaining(now + 900_000, now)).toBe("15m 00s");
    });

    it("returns 0s if expired or null", () => {
      expect(formatSnoozeRemaining(null, 10_000)).toBe("0s");
      expect(formatSnoozeRemaining(5_000, 10_000)).toBe("0s");
    });
  });
});
