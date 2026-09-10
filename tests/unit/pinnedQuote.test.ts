import { describe, it, expect, vi } from "vitest";
import {
  detectPinnedPlatform,
  findPinnedInsertionTarget
} from "../../src/content/pinnedQuote";

describe("pinnedQuote - Platform Detection", () => {
  it("detects all supported platforms correctly", () => {
    expect(detectPinnedPlatform("facebook.com")).toBe("facebook");
    expect(detectPinnedPlatform("www.facebook.com")).toBe("facebook");
    expect(detectPinnedPlatform("youtube.com")).toBe("youtube");
    expect(detectPinnedPlatform("m.youtube.com")).toBe("youtube");
    expect(detectPinnedPlatform("instagram.com")).toBe("instagram");
    expect(detectPinnedPlatform("linkedin.com")).toBe("linkedin");
    expect(detectPinnedPlatform("x.com")).toBe("twitter");
    expect(detectPinnedPlatform("twitter.com")).toBe("twitter");
    expect(detectPinnedPlatform("reddit.com")).toBe("reddit");
    expect(detectPinnedPlatform("google.com")).toBeNull();
  });
});

describe("pinnedQuote - Insertion Target Resolution", () => {
  it("finds Facebook feed container and post target", () => {
    const mockFeed = {
      querySelector: vi.fn((sel: string) => {
        if (sel.includes("article")) {
          return { parentElement: mockFeed };
        }
        return null;
      }),
      firstElementChild: null
    };

    const mockRoot = {
      querySelector: vi.fn((sel: string) => {
        if (sel.includes('[role="feed"]')) {
          return mockFeed;
        }
        return null;
      })
    };

    const target = findPinnedInsertionTarget("facebook", mockRoot as unknown as ParentNode);
    expect(target).not.toBeNull();
    expect(target?.container).toBe(mockFeed);
  });

  it("finds YouTube home grid container", () => {
    const mockContents = { id: "contents" };
    const mockGrid = {
      querySelector: vi.fn((sel: string) => (sel === "#contents" ? mockContents : null)),
      firstElementChild: mockContents
    };

    const mockRoot = {
      querySelector: vi.fn((sel: string) => (sel === "ytd-rich-grid-renderer" ? mockGrid : null))
    };

    const target = findPinnedInsertionTarget("youtube", mockRoot as unknown as ParentNode);
    expect(target).not.toBeNull();
    expect(target?.container).toBe(mockGrid);
    expect(target?.beforeChild).toBe(mockContents);
  });
});
