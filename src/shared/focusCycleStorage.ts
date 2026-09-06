export type CyclePlatform = "facebook" | "reddit" | "linkedin" | "twitter";

const ANCHORS_KEY = "nullfeed-focus-cycle-anchors";

export async function getOrCreateAnchor(platform: CyclePlatform): Promise<number> {
  const result = await chrome.storage.local.get(ANCHORS_KEY);
  const anchors: Partial<Record<CyclePlatform, number>> =
    (result[ANCHORS_KEY] as Partial<Record<CyclePlatform, number>>) ?? {};
  const existing = anchors[platform];
  if (typeof existing === "number" && Number.isFinite(existing)) {
    return existing;
  }

  const anchor = Date.now();
  await chrome.storage.local.set({
    [ANCHORS_KEY]: { ...anchors, [platform]: anchor }
  });
  return anchor;
}
