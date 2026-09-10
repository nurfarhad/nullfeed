import { describe, it, expect, vi } from "vitest";
import {
  detectPinnedPlatform,
  mountPinnedQuoteCard,
  FEED_QUOTE_CARD_ID
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

describe("pinnedQuote - Top of Feed In-Stream Insertion", () => {
  it("inserts quote card before first post in Facebook feed", () => {
    const mockPost = {
      closest: vi.fn(),
      parentElement: null as unknown as Element
    };
    const mockFeed = {
      insertBefore: vi.fn(),
      querySelector: vi.fn((sel: string) => (sel.includes("article") ? mockPost : null))
    };
    mockPost.closest.mockReturnValue(mockFeed);
    mockPost.parentElement = mockFeed as unknown as Element;

    const mockRoot = {
      querySelector: vi.fn((sel: string) => (sel.includes("article") ? mockPost : null))
    };

    const mounted = mountPinnedQuoteCard("facebook", mockRoot as unknown as ParentNode);
    expect(mounted).toBe(true);
    expect(mockFeed.insertBefore).toHaveBeenCalled();
  });
});
