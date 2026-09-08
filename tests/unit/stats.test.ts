import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatTimeSaved,
  getLocalDateKey,
  getPreviousDateKey,
  getStats,
  recordDistractions,
  flushDistractionsImmediately,
  resetStats,
  STATS_STORAGE_KEY
} from "../../src/shared/statsStorage";

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

describe("statsStorage", () => {
  beforeEach(async () => {
    for (const key of Object.keys(mockLocalStorage)) {
      delete mockLocalStorage[key];
    }
    await resetStats();
  });

  describe("formatTimeSaved", () => {
    it("formats zero as 0m", () => {
      expect(formatTimeSaved(0)).toBe("0m");
      expect(formatTimeSaved(-5)).toBe("0m");
    });

    it("formats minutes accurately under 1 hour", () => {
      // 10 * 1.5 = 15m
      expect(formatTimeSaved(10)).toBe("15m");
      // 20 * 1.5 = 30m
      expect(formatTimeSaved(20)).toBe("30m");
    });

    it("formats exact hours", () => {
      // 40 * 1.5 = 60m = 1h
      expect(formatTimeSaved(40)).toBe("1h");
    });

    it("formats hours and minutes", () => {
      // 50 * 1.5 = 75m = 1h 15m
      expect(formatTimeSaved(50)).toBe("1h 15m");
    });
  });

  describe("getStats", () => {
    it("returns fresh default stats on empty storage", async () => {
      const stats = await getStats();
      expect(stats.todayBlocked).toBe(0);
      expect(stats.totalBlocked).toBe(0);
      expect(stats.streakDays).toBe(1);
      expect(stats.today).toBe(getLocalDateKey());
    });

    it("preserves stored stats if current date matches", async () => {
      const today = getLocalDateKey();
      mockLocalStorage[STATS_STORAGE_KEY] = {
        today,
        todayBlocked: 42,
        totalBlocked: 120,
        streakDays: 3,
        lastActiveDate: today
      };

      const stats = await getStats();
      expect(stats.todayBlocked).toBe(42);
      expect(stats.totalBlocked).toBe(120);
      expect(stats.streakDays).toBe(3);
    });

    it("rolls over todayBlocked to 0 on a new day but preserves streak if active yesterday", async () => {
      const yesterday = getPreviousDateKey();
      mockLocalStorage[STATS_STORAGE_KEY] = {
        today: yesterday,
        todayBlocked: 25,
        totalBlocked: 100,
        streakDays: 4,
        lastActiveDate: yesterday
      };

      const stats = await getStats();
      expect(stats.todayBlocked).toBe(0);
      expect(stats.totalBlocked).toBe(100);
      expect(stats.streakDays).toBe(4);
      expect(stats.today).toBe(getLocalDateKey());
    });

    it("resets streak to 1 on a new day if days were skipped", async () => {
      const longAgo = "2026-01-01";
      mockLocalStorage[STATS_STORAGE_KEY] = {
        today: longAgo,
        todayBlocked: 25,
        totalBlocked: 100,
        streakDays: 10,
        lastActiveDate: longAgo
      };

      const stats = await getStats();
      expect(stats.todayBlocked).toBe(0);
      expect(stats.totalBlocked).toBe(100);
      expect(stats.streakDays).toBe(1);
    });
  });

  describe("recordDistractions", () => {
    it("increments todayBlocked and totalBlocked", async () => {
      recordDistractions(5);
      await flushDistractionsImmediately();

      const stats = await getStats();
      expect(stats.todayBlocked).toBe(5);
      expect(stats.totalBlocked).toBe(5);
    });

    it("accumulates multiple records", async () => {
      recordDistractions(3);
      recordDistractions(2);
      await flushDistractionsImmediately();

      const stats = await getStats();
      expect(stats.todayBlocked).toBe(5);
      expect(stats.totalBlocked).toBe(5);
    });
  });
});
