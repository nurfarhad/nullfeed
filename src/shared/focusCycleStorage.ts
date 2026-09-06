export type CyclePlatform = "facebook" | "reddit" | "linkedin" | "twitter";

export const ANCHORS_KEY = "nullfeed-focus-cycle-anchors";
export const LAST_SEEN_KEY = "nullfeed-focus-cycle-last-seen";
export const SESSION_GAP_RESET_MS = 30 * 60_000;

export async function getOrCreateAnchor(
  platform: CyclePlatform,
  now = Date.now()
): Promise<number> {
  const result = await chrome.storage.local.get([ANCHORS_KEY, LAST_SEEN_KEY]);
  const anchors: Partial<Record<CyclePlatform, number>> =
    (result[ANCHORS_KEY] as Partial<Record<CyclePlatform, number>>) ?? {};
  const lastSeenMap: Partial<Record<CyclePlatform, number>> =
    (result[LAST_SEEN_KEY] as Partial<Record<CyclePlatform, number>>) ?? {};

  const existing = anchors[platform];
  const lastSeen = lastSeenMap[platform];

  // If user was away from this platform for more than a full cycle (30+ mins),
  // restart a fresh session so they get a full 15m break starting from when they sat down.
  const isStaleSession =
    typeof lastSeen === "number" && now - lastSeen > SESSION_GAP_RESET_MS;

  if (
    typeof existing === "number" &&
    Number.isFinite(existing) &&
    !isStaleSession
  ) {
    await chrome.storage.local.set({
      [LAST_SEEN_KEY]: { ...lastSeenMap, [platform]: now }
    });
    return existing;
  }

  const anchor = now;
  await chrome.storage.local.set({
    [ANCHORS_KEY]: { ...anchors, [platform]: anchor },
    [LAST_SEEN_KEY]: { ...lastSeenMap, [platform]: now }
  });
  return anchor;
}

export async function resetCycleAnchors(): Promise<void> {
  await chrome.storage.local.remove([ANCHORS_KEY, LAST_SEEN_KEY]);
}
