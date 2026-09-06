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
  it("computes 'on' (blocked/focus) for the first 15 minutes of each 30-minute block", () => {
    const anchor = 1_000_000;

    // At anchor
    expect(getPhase(anchor, anchor)).toBe("on");

    // 5 minutes in
    expect(getPhase(anchor, anchor + 5 * 60_000)).toBe("on");

    // 14 minutes 59 seconds in
    expect(getPhase(anchor, anchor + 14 * 60_000 + 59_000)).toBe("on");

    // Exactly 15 minutes in -> switches to "off" (open phase)
    expect(getPhase(anchor, anchor + CYCLE_ON_MS)).toBe("off");

    // 20 minutes in
    expect(getPhase(anchor, anchor + 20 * 60_000)).toBe("off");

    // 29 minutes 59 seconds in
    expect(getPhase(anchor, anchor + 29 * 60_000 + 59_000)).toBe("off");

    // Exactly 30 minutes in -> new cycle begins, switches back to "on"
    expect(getPhase(anchor, anchor + CYCLE_TOTAL_MS)).toBe("on");

    // 35 minutes in (5 mins into cycle 2)
    expect(getPhase(anchor, anchor + 35 * 60_000)).toBe("on");

    // 45 minutes in (15 mins into cycle 2) -> "off"
    expect(getPhase(anchor, anchor + 45 * 60_000)).toBe("off");
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
          get: vi.fn(async (key: string) => ({ [key]: store[key] })),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(store, items);
          })
        }
      }
    };
  });

  it("persists a newly generated anchor and reuses it on subsequent calls", async () => {
    const anchor1 = await getOrCreateAnchor("facebook");
    expect(typeof anchor1).toBe("number");
    expect(anchor1).toBeGreaterThan(0);

    const anchor2 = await getOrCreateAnchor("facebook");
    expect(anchor2).toBe(anchor1);
  });
});
