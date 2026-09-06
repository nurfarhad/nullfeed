import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  CYCLE_ON_MS,
  CYCLE_TOTAL_MS,
  detectCyclePlatform,
  findFeedContainer,
  getPhase
} from "../../src/content/focusCycle";
import { getOrCreateAnchor } from "../../src/shared/focusCycleStorage";

describe("Focus Cycle - Platform Detection", () => {
  it("detects Facebook", () => {
    expect(detectCyclePlatform("www.facebook.com")).toBe("facebook");
    expect(detectCyclePlatform("facebook.com")).toBe("facebook");
    expect(detectCyclePlatform("web.facebook.com")).toBe("facebook");
  });

  it("detects LinkedIn", () => {
    expect(detectCyclePlatform("www.linkedin.com")).toBe("linkedin");
    expect(detectCyclePlatform("linkedin.com")).toBe("linkedin");
  });

  it("detects Twitter / X", () => {
    expect(detectCyclePlatform("x.com")).toBe("twitter");
    expect(detectCyclePlatform("www.x.com")).toBe("twitter");
    expect(detectCyclePlatform("twitter.com")).toBe("twitter");
    expect(detectCyclePlatform("mobile.twitter.com")).toBe("twitter");
  });

  it("detects Reddit", () => {
    expect(detectCyclePlatform("www.reddit.com")).toBe("reddit");
    expect(detectCyclePlatform("reddit.com")).toBe("reddit");
  });

  it("returns null for unsupported cycle hosts", () => {
    expect(detectCyclePlatform("www.youtube.com")).toBeNull();
    expect(detectCyclePlatform("instagram.com")).toBeNull();
    expect(detectCyclePlatform("google.com")).toBeNull();
  });
});

describe("Focus Cycle - Phase Calculations", () => {
  it("computes 'off' (break phase) for the first 15 minutes and 'on' (focus phase) for 15-30 minutes", () => {
    const anchor = 1_000_000;

    // At anchor (0 minutes in) -> "off" (break phase)
    expect(getPhase(anchor, anchor)).toBe("off");

    // 5 minutes in -> "off" (break phase)
    expect(getPhase(anchor, anchor + 5 * 60_000)).toBe("off");

    // 14 minutes 59 seconds in -> "off" (break phase)
    expect(getPhase(anchor, anchor + 14 * 60_000 + 59_000)).toBe("off");

    // Exactly 15 minutes in -> switches to "on" (focus phase)
    expect(getPhase(anchor, anchor + CYCLE_ON_MS)).toBe("on");

    // 20 minutes in -> "on" (focus phase)
    expect(getPhase(anchor, anchor + 20 * 60_000)).toBe("on");

    // 29 minutes 59 seconds in -> "on" (focus phase)
    expect(getPhase(anchor, anchor + 29 * 60_000 + 59_000)).toBe("on");

    // Exactly 30 minutes in -> new cycle begins, switches back to "off" (break phase)
    expect(getPhase(anchor, anchor + CYCLE_TOTAL_MS)).toBe("off");

    // 35 minutes in (5 mins into cycle 2) -> "off" (break phase)
    expect(getPhase(anchor, anchor + 35 * 60_000)).toBe("off");

    // 45 minutes in (15 mins into cycle 2) -> "on" (focus phase)
    expect(getPhase(anchor, anchor + 45 * 60_000)).toBe("on");
  });
});

describe("Focus Cycle - findFeedContainer sequential matching", () => {
  it("picks the first matching selector in priority order", () => {
    const mockFeed = { id: "first" } as unknown as Element;
    const mockRoot = {
      querySelector: vi.fn((sel: string) => {
        if (sel === ".scaffold-finite-scroll") return mockFeed;
        return null;
      })
    };

    const match = findFeedContainer(
      [".scaffold-finite-scroll", "main.scaffold-layout__main"],
      mockRoot
    );

    expect(match).toBe(mockFeed);
    expect(mockRoot.querySelector).toHaveBeenCalledWith(".scaffold-finite-scroll");
  });
});

describe("Focus Cycle - Storage", () => {
  beforeEach(() => {
    const store: Record<string, unknown> = {};
    (globalThis as any).chrome = {
      storage: {
        local: {
          get: vi.fn(async (keys: string | string[]) => {
            if (Array.isArray(keys)) {
              return Object.fromEntries(keys.map((k) => [k, store[k]]));
            }
            return { [keys]: store[keys] };
          }),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(store, items);
          }),
          remove: vi.fn(async (keys: string | string[]) => {
            const arr = Array.isArray(keys) ? keys : [keys];
            arr.forEach((k) => delete store[k]);
          })
        }
      }
    };
  });

  it("persists a newly generated anchor and reuses it during active continuous browsing", async () => {
    const now = 1_000_000;
    const anchor1 = await getOrCreateAnchor("facebook", now);
    expect(anchor1).toBe(now);

    // 5 minutes later in active browsing -> reuses same anchor
    const anchor2 = await getOrCreateAnchor("facebook", now + 5 * 60_000);
    expect(anchor2).toBe(anchor1);
  });

  it("starts a fresh session anchor if user returns after being inactive for > 30 minutes", async () => {
    const start = 1_000_000;
    const anchor1 = await getOrCreateAnchor("facebook", start);
    expect(anchor1).toBe(start);

    // User comes back 45 minutes later (> 30 min session gap)
    const returnTime = start + 45 * 60_000;
    const anchor2 = await getOrCreateAnchor("facebook", returnTime);
    expect(anchor2).toBe(returnTime);
  });
});
