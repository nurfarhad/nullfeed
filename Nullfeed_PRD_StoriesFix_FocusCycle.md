# Nullfeed — PRD: Stories Modal Fix + Focus Cycle (replaces manual Snooze)
Prepared for: Google Antigravity (Claude Opus / Sonnet build)
Supersedes: the "Snooze" sections of `Nullfeed_PRD_Ads_StoriesFix_Snooze.md` and `Nullfeed_PRD_Phase2.md`. Everything "Snooze"-shaped in the current codebase — the manual duration picker, the full-page overlay, the countdown, "Resume now" — is wrong and is being replaced wholesale by the Focus Cycle described in Part C. Do not preserve any of it.

Confirmed design, from Farhad directly:
- Fixed 15-minutes-blocked / 15-minutes-open cycle, running forever, automatically. Not user-started, not user-timed.
- No way to turn the cycle off separately — it runs whenever Protection (the master toggle) is on, full stop.
- Each platform runs its own independent cycle, timed from when that platform starts being used — not one shared clock across platforms.
- On Facebook, the "blocked" phase hides the entire main feed (not just whatever Reels/Stories/Videos/Ads toggles are set) — those toggles keep working independently and continuously, the cycle is an additional, bigger block layered on top for half of every 30-minute window.
- Applies to Facebook, Reddit, LinkedIn, and Twitter/X to start, with room to add more platforms later.
- No countdown, no resume button, no way to skip. Visually, it should look like the small, existing quote card — not a full-page takeover.

---

## Part A — Facebook Stories bug: hiding a normal post inside a permalink modal

**Confirmed root cause.** `hideStoryEntries()` in `facebook.ts` has two independent ways of finding a story tray to hide. One starts from real `/stories/` links (correctly scoped). The other is a blanket scan:
```ts
queryAll(root, '[data-pagelet*="Stories"], div[aria-label*="Stories" i], div[aria-label*="stories" i]')
```
This fires on **any** element whose `data-pagelet` or `aria-label` merely contains the word "stories" — with no requirement that a real Stories-feature link exists anywhere nearby. Facebook has long overloaded "story" internally to mean *a single post/feed item* generally, not just the ephemeral Stories feature — this is old, well-known internal terminology on their end. Your screenshot is a post permalink opened in a modal (the `?comment_id=...` dialog) — exactly the kind of internal component plausibly labelled with that legacy term. Once it matches, `findStoryTray()` climbs looking for a boundary, finds none of its usual stop conditions inside a modal's DOM shape, and ends up hiding the entire modal content.

**Fix:**
```ts
queryAll(
  root,
  '[data-pagelet*="Stories"], div[aria-label*="Stories" i], div[aria-label*="stories" i]'
).forEach((el) => {
  // Facebook reuses "story"/"stories" internally to mean "a single post,"
  // including on ordinary post permalink modals. Only trust this signal
  // when a real Stories-feature link is actually present nearby.
  if (el.querySelectorAll(STORY_LINK_SELECTOR).length === 0) {
    return;
  }
  const tray = findStoryTray(el);
  if (tray) {
    trays.add(tray);
  }
});
```
One-line guard, no other change needed in this function.

**Acceptance:** opening a post permalink/comment modal on Facebook with Hide Stories on shows the post exactly as before; toggling Hide Stories no longer affects anything inside that modal. The real Stories tray on the home feed still hides correctly.

---

## Part B — Remove the manual Snooze system entirely

Delete, don't refactor:
- `src/content/snoozeOverlay.ts` — the whole file.
- `SnoozeSites` / `SnoozeSettings` types and the `snooze` field on `Settings`, in `src/shared/settings.ts` — including its `DEFAULT_SETTINGS` entry and its block inside `validateSettings()`.
- `startSnooze` / `endSnooze` in `src/shared/storage.ts`.
- All snooze-alarm logic in `src/background/serviceWorker.ts` — `SNOOZE_ALARM_NAME`, the `chrome.storage.onChanged` → `chrome.alarms.create/clear` block, the `chrome.alarms.onAlarm` listener, and the snooze-expiry check inside `initialize()`. What's left should just call `ensureSettings()` on install/startup.
- The entire Snooze section of `src/popup/App.tsx` — `SNOOZE_DURATIONS`, `formatCountdown`, `isSnoozing`, the countdown `useEffect`, `handleStartSnooze`, `handleEndSnooze`, and the `<section class="snooze-card">` JSX block. The popup goes back to Protection → Platform tabs → Settings panel, nothing else — this is a deletion, not a redesign, so it doesn't conflict with leaving the rest of the UI untouched.
- `"alarms"` from `permissions` in `manifest.config.ts` — nothing in the new design needs a background alarm at all (see Part C), so this permission can come out, shrinking the footprint rather than growing it.
- The snooze-specific parts of `src/content/index.ts`'s `apply()` function (the `snoozed` check and the `showSnoozeOverlay`/`hideSnoozeOverlay` calls) — `apply()` goes back to its pre-Snooze shape: cleanup, update root state, handle route, scan.

**Acceptance:** no references to "snooze" remain anywhere in the codebase. `npm run build` produces no dangling imports.

---

## Part C — Focus Cycle (the real feature)

### Concept
A fixed 15-minutes-on / 15-minutes-off cycle, computed locally and deterministically, no server or background coordination needed. Each covered platform gets its own independent anchor timestamp, set once — the first time that platform is used with Protection on — and persisted. From then on, the phase at any moment is pure arithmetic:
```ts
const CYCLE_ON_MS = 15 * 60_000;
const CYCLE_TOTAL_MS = 30 * 60_000;

function getPhase(anchor: number, now = Date.now()): "on" | "off" {
  return ((now - anchor) % CYCLE_TOTAL_MS) < CYCLE_ON_MS ? "on" : "off";
}
```
No `chrome.alarms`, no background messaging — every open tab can compute its own platform's phase independently, which is also why the "alarms" permission can be dropped.

**Assumption, flagging explicitly:** the anchor is set once and never reset (not even if Protection is toggled off and back on) — the cycle keeps ticking against wall-clock time from whenever it first started. If you'd rather it reset to a fresh on-phase every time Protection is turned back on, that's a small change (reset the anchor in the same place `ensureSettings`/enable logic runs) — flag it back if so, but I'd default to leaving it as continuous wall-clock ticking since it's simpler and matches "it will enable and pause and resume automatically... that's how it should work."

### Architecture — deliberately separate from the existing `Platform`/`SiteAdapter` system
Facebook, Instagram, and YouTube have real adapters with granular, popup-controlled settings. Reddit, LinkedIn, and Twitter/X have **no** granular settings and never appear in the popup — the cycle is the only thing that ever touches them. Rather than forcing them into the existing `Platform` type (which would mean adding empty settings objects and popup-adjacent plumbing they don't need), build the cycle as a **separate, generic module** that runs alongside the adapter system, keyed by its own hostname list. Facebook is the one case where both systems run at once: the existing `facebookAdapter` keeps doing its normal Reels/Stories/Videos/Ads filtering, completely unaffected by the cycle, while the new module additionally blanks Facebook's whole feed for 15 minutes out of every 30.

### New module — `src/content/focusCycle.ts`
```ts
export type CyclePlatform = "facebook" | "reddit" | "linkedin" | "twitter";

type CycleConfig = {
  hostnamePattern: RegExp;
  feedSelectors: string[]; // tried in order — first real match wins, not a combined selector
};

const CYCLE_PLATFORMS: Record<CyclePlatform, CycleConfig> = {
  facebook: {
    hostnamePattern: /(?:^|\.)facebook\.com$/i,
    feedSelectors: ['[role="feed"]']
  },
  linkedin: {
    hostnamePattern: /(?:^|\.)linkedin\.com$/i,
    feedSelectors: ['.scaffold-finite-scroll', 'main.scaffold-layout__main']
  },
  twitter: {
    hostnamePattern: /(?:^|\.)(?:x\.com|twitter\.com)$/i,
    feedSelectors: [
      'div[data-testid="primaryColumn"] section[role="region"]',
      'div[aria-label="Home timeline"] > div > section[role="region"]'
    ]
  },
  reddit: {
    hostnamePattern: /(?:^|\.)reddit\.com$/i,
    // Placeholder — verify against a real, live Reddit session before shipping.
    // Modern Reddit's feed is a custom element, not a classed div; something
    // like `shreddit-feed` is the likely target but hasn't been confirmed here.
    feedSelectors: ['shreddit-feed']
  }
};
```

**Selector priority matters — learn from the last audit's LinkedIn bug.** When trying `feedSelectors` in order, use an explicit loop that checks each selector individually and stops at the first real match:
```ts
function findFeedContainer(selectors: string[]): Element | null {
  for (const selector of selectors) {
    const match = document.querySelector(selector);
    if (match) return match;
  }
  return null;
}
```
Never join them into one comma-separated `querySelector` call — that returns whichever matches first in document order, not in the priority order you wrote them, which is exactly what went wrong with LinkedIn's quote-card placement before.

Core functions:
```ts
export function detectCyclePlatform(hostname: string): CyclePlatform | null { /* checks each hostnamePattern */ }

export async function getCycleAnchor(platform: CyclePlatform): Promise<number> {
  // reads/creates a persisted anchor in chrome.storage.local (see storage note below)
}

export function getPhase(anchor: number): "on" | "off" { /* as above */ }

export function applyCyclePhase(platform: CyclePlatform, phase: "on" | "off"): void {
  const config = CYCLE_PLATFORMS[platform];
  if (phase === "on") {
    const feed = findFeedContainer(config.feedSelectors);
    if (feed) {
      hideElement(feed, "focus-cycle");       // reuse the existing domOwnership utility
      mountQuoteCard(feed, "before");          // reuse the existing quoteCard.ts module as-is
    }
  } else {
    unmountQuoteCard();
    // restoreElement/cleanupOwnedElements (already in domOwnership.ts) handles un-hiding
    // anything tagged "focus-cycle" once the feature flag comes off.
  }
}
```
`hideElement` and the quote card are both already-built, already-styled pieces from earlier work — this reuses them rather than inventing new visuals, which is exactly the "style of the quotes should be how it was before" you asked for. No countdown, no button, nothing else gets added to that card.

### New storage — separate from the popup-facing `Settings`
The cycle anchor isn't something the user sees or configures, so keep it out of the synced `Settings` object entirely. New small module, `src/shared/focusCycleStorage.ts`, using `chrome.storage.local` (not `sync` — this never needs to leave the device or sync across browsers, and avoids the `sync` quota entirely):
```ts
const ANCHORS_KEY = "nullfeed-focus-cycle-anchors";

export async function getOrCreateAnchor(platform: CyclePlatform): Promise<number> {
  const result = await chrome.storage.local.get(ANCHORS_KEY);
  const anchors: Partial<Record<CyclePlatform, number>> = result[ANCHORS_KEY] ?? {};
  const existing = anchors[platform];
  if (typeof existing === "number") return existing;

  const anchor = Date.now();
  await chrome.storage.local.set({ [ANCHORS_KEY]: { ...anchors, [platform]: anchor } });
  return anchor;
}
```

### Wiring into `src/content/index.ts`
Add a second, independent bootstrap block alongside the existing `if (adapter) { ... }` block — this one keyed off `detectCyclePlatform`, not `selectAdapter`, so it runs on its own for Reddit/LinkedIn/Twitter (where `adapter` is `null`) and *alongside* the existing block on Facebook (where both are non-null):
```ts
const cyclePlatform = detectCyclePlatform(location.hostname);

if (cyclePlatform) {
  let currentPhase: "on" | "off" | null = null;

  async function tick(settingsEnabled: boolean): Promise<void> {
    if (!settingsEnabled) {
      if (currentPhase !== null) {
        applyCyclePhase(cyclePlatform, "off");
        currentPhase = null;
      }
      return;
    }
    const anchor = await getOrCreateAnchor(cyclePlatform);
    const phase = getPhase(anchor);
    if (phase !== currentPhase) {
      applyCyclePhase(cyclePlatform, phase);
      currentPhase = phase;
    }
  }

  void getSettings().then((s) => tick(s.enabled));
  setInterval(() => { void getSettings().then((s) => tick(s.enabled)); }, 5000);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && changes[SETTINGS_STORAGE_KEY]?.newValue !== undefined) {
      void getSettings().then((s) => tick(s.enabled));
    }
  });
}
```
Also call `tick()`'s current-phase re-check from inside the existing `observeDynamicContent` mutation callback, so if a platform's SPA ever swaps out the feed container element mid-"on"-phase, the block gets reapplied to the new element rather than silently lapsing.

### Manifest changes — `manifest.config.ts`
Add Reddit, LinkedIn, and Twitter/X back to `host_permissions` and both `content_scripts` blocks' `matches`, same apex+wildcard pattern already used for Facebook/Instagram/YouTube:
```
"https://*.reddit.com/*", "https://reddit.com/*",
"https://*.linkedin.com/*", "https://linkedin.com/*",
"https://*.x.com/*", "https://x.com/*",
"https://*.twitter.com/*", "https://twitter.com/*"
```
Remove `"alarms"` from `permissions` (no longer used anywhere — see Part B). Net effect on the permission list: four platforms added, one permission removed. When this goes back to the Chrome Web Store listing, the permission-justification text should say plainly that Reddit/LinkedIn/Twitter access is used only to run the fixed focus cycle, with no per-feature settings on those platforms — that's an accurate, easy answer for review, not the vague, always-on-with-no-explanation situation from the v3.0.0 build.

### Adding more platforms later
Because `CYCLE_PLATFORMS` is a small, self-contained config object, adding another platform later (you mentioned staying open to it) is: one new entry with a hostname pattern and a verified feed selector, plus one manifest host-permission pair. No new adapter, no settings-schema change, no popup change.

---

## Assumptions worth double-checking before this ships
State these back to me if any are wrong — everything else in this PRD is unambiguous:
1. **"Block the entire main feed" scope** — interpreted as the scrolling feed column specifically (`[role="feed"]` on Facebook), not the whole homepage (navigation, sidebars, notifications stay usable). If you meant the whole page, that's a different, larger change.
2. **"No way scrolling for 15 min"** — interpreted as the natural consequence of the feed being replaced by a small static card (nothing left to scroll to), not a literal scroll-lock on the page. If you want the page itself prevented from scrolling at all, that's an additional, separate change.
3. **Anchor persistence** — the 15/15 clock keeps running against wall-clock time once started and is never reset by toggling Protection off/on. Flag it if you want a fresh on-phase to start every time Protection is re-enabled instead.
4. **Reddit's feed selector is unverified** — `shreddit-feed` is a reasonable guess based on Reddit's current custom-element architecture, but confirm against a real, logged-in Reddit session before relying on it.

---

## Suggested execution order
1. Part A (Stories modal fix) — small, isolated, ready to ship as-is.
2. Part B (delete the old Snooze system) — do this fully before starting Part C so there's no leftover code for the new cycle logic to collide with.
3. Part C (Focus Cycle) — build Facebook first since it's the one platform where you can verify both the existing adapter and the new cycle running together correctly; then Reddit/LinkedIn/Twitter once the Facebook path is confirmed working end to end.

After all three: `npm test && npm run build`, then a manual pass confirming: the Stories modal bug is gone, the popup no longer shows any snooze UI, and on a real Facebook session the entire feed blanks out to a small quote card for 15 minutes, then returns to normal (including your existing Reels/Stories/Ads toggles) for the next 15, indefinitely, with zero visible timer or way to skip it.
