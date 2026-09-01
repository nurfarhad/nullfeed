# Nullfeed — PRD: Sponsored/Ads Filter, Stories Empty-Box Fix, Snooze + Quotes
Prepared for: Google Antigravity (Claude Opus / Sonnet build)
Scope: one new Facebook filter, one confirmed rendering bug, one new feature area. Written against the current `nullfeed-main` source tree.

This is an implementation-ready spec, not a brainstorm. Each part names the exact files, functions, and schema changes involved. Follow the acceptance criteria at the end of each part before moving to the next.

---

## Part A — New filter: "Hide Sponsored & Ads" (Facebook)

**Reference:** the "Hide" extension ships this as a fourth Facebook toggle alongside Reels/Stories/Videos, on by default. Nullfeed should match that.

### Schema changes — `src/shared/settings.ts`
- Add `ads: boolean` to `FacebookSettings`.
- Add `ads: true` to `DEFAULT_SETTINGS.facebook` (default **on**, matching the reference extension's default state).
- Add `ads: booleanOrDefault(facebook.ads, DEFAULT_SETTINGS.facebook.ads)` inside `validateSettings()`'s `facebook` object.
- No schema-version bump needed — `validateSettings` already backfills missing fields with defaults, so existing installs upgrade silently.

### Detection — `src/content/adapters/facebook.ts`
Facebook marks sponsored posts inconsistently across locales and A/B tests, so detection needs a priority-ordered fallback, and it needs to be verified against a real, logged-in Facebook session before it's finalized — don't hard-code a selector from memory:

1. **Preferred:** an attribute-based signal if Facebook exposes one in the current build (e.g. `[aria-label="Sponsored" i]` or a `data-testid`/`data-ad-*` attribute on the post or its byline). Attribute selectors are locale-independent and safe to also express in `content.css` for early hiding.
2. **Fallback:** a text-match check, scoped narrowly to the post's byline/metadata region (the small link line under the poster's name), not the full post body — checking `element.textContent.trim().toLowerCase() === "sponsored"` on that scoped region only. Matching against the whole post would false-positive on any post that merely mentions the word "sponsored" in its own text.

Implementation shape, following the existing pattern in this file:
```ts
function hideSponsoredEntries(root: ParentNode): void {
  queryAll(root, SPONSORED_BYLINE_SELECTOR).forEach((marker) => {
    const unit = closestVerifiedFeedUnit(marker);
    if (unit) hideElement(unit, "facebook-ads");
  });
}
```
Wire it into `scan()`:
```ts
if (settings.facebook.ads) {
  hideSponsoredEntries(root);
}
```

Because text-based detection can't be expressed in `content.css`, expect this filter to apply slightly after paint (same tradeoff Instagram Stories already accepts, documented at the bottom of `content.css`). That's an acceptable, known limitation — don't try to force an early-CSS rule around a text match.

### UI — `src/popup/components/SettingsPanel.tsx`
Add a row to the `facebook` array in `ROWS`:
```ts
facebook: [
  ["reels", "Hide Reels"],
  ["stories", "Hide Stories"],
  ["videos", "Hide Videos"],
  ["ads", "Hide Sponsored & Ads"]
],
```

### Tests
Update `tests/unit/settings.test.ts` and the `DEFAULT_SETTINGS` fixture in `tests/e2e/filtering.spec.ts` to include `ads`. Add an e2e fixture with a synthetic "Sponsored" byline to confirm the post it belongs to gets hidden, and a sibling ordinary post (no sponsored marker) that must stay visible.

### Acceptance
- On a real, logged-in Facebook feed (English UI), turning on "Hide Sponsored & Ads" hides sponsored posts and leaves organic posts, including ones that mention "sponsored" in their own text, untouched.
- Turning the toggle off restores every hidden post exactly as it was.

---

## Part B — Bug fix: Facebook Stories leaves an empty block behind

**Symptom (confirmed from your screenshots):** with Reels/Stories/Videos on, the story avatars disappear but an empty box remains where the story tray used to be — unlike the reference extension, where the whole tray collapses.

### Root cause
`content.css` already early-hides the pagelet-marked tray (`[data-pagelet*="Stories"]`), and the JS path in `facebook.ts` hides the same element via `findStoryTray()` → `hideElement()`. Both are hiding the *inner* tray correctly. The empty space that's left over is an **outer wrapper** (a padded/bordered "card" shell) that Facebook renders around the tray — and nothing currently hides that shell.

`findSectionWrapper()` was written to climb up and catch that shell, but it's too conservative to actually reach it in practice:
- it only climbs a maximum of 2 levels (`depth < 2`),
- and it stops immediately the first time an ancestor has more than exactly one child element (`candidate.children.length !== 1`) — which is common, since a real "card" wrapper often has sibling elements (padding divs, a header, decorative spacers) alongside the tray.

Because real Facebook markup is fully rebuilt every release, tuning these two numbers by guesswork will just produce the same bug again next time Facebook changes a wrapper depth. Fix the root pattern instead of the specific constants.

### Fix — add a generic "collapse empty ancestors" utility
Add this to `src/content/domOwnership.ts`, next to `hideElement`/`restoreElement`:

```ts
const DEFAULT_COLLAPSE_BOUNDARY =
  'main, [role="main"], [role="feed"], [role="navigation"], [role="banner"], [role="article"]';

function isVisiblyEmpty(element: Element): boolean {
  if (element.hasAttribute("data-nullfeed-hidden")) {
    return true;
  }
  for (const child of Array.from(element.children)) {
    if (!isVisiblyEmpty(child)) {
      return false;
    }
  }
  return (element.textContent ?? "").trim().length === 0;
}

/**
 * After hiding `element`, walk up its ancestors and hide any wrapper whose
 * *entire remaining visible content* is empty — i.e. every child is either
 * already Nullfeed-hidden or contains no rendered text. Stops at a real
 * layout boundary or after `maxDepth` levels, whichever comes first.
 */
export function collapseEmptyAncestors(
  element: Element,
  feature: string,
  boundarySelector: string = DEFAULT_COLLAPSE_BOUNDARY,
  maxDepth = 4
): void {
  let candidate = element.parentElement;

  for (let depth = 0; candidate && depth < maxDepth; depth += 1) {
    if (candidate.matches(boundarySelector)) {
      break;
    }
    if (!isVisiblyEmpty(candidate)) {
      break;
    }
    hideElement(candidate, feature);
    candidate = candidate.parentElement;
  }
}
```

This is driven by what's *actually rendered* after hiding, not a guessed structural shape — so it self-corrects as Facebook's markup changes, instead of needing a new hard-coded depth/child-count every time something breaks.

### Wire it in — `src/content/adapters/facebook.ts`
In `hideStoryEntries()`, call it right after hiding each tray:
```ts
trays.forEach((tray) => {
  hideElement(tray, "facebook-stories");
  collapseEmptyAncestors(tray, "facebook-stories");
});
```
`findSectionWrapper()` becomes redundant once this is in place — remove it and simplify `findStoryTray()` to return the marked/detected tray directly, since `collapseEmptyAncestors` now owns the "reach the real outer edge" job generically.

**Note:** `restoreElement`/`cleanupOwnedElements` already restore every element carrying `data-nullfeed-hidden`, so collapsed ancestors are automatically restored when Protection is paused or Stories is turned back on — no extra cleanup work needed.

### Also apply to (same latent risk, lower priority)
`hideFeedEntries()` (Reels) and `hideNativeVideos()` (Videos) hide a single verified unit each and could theoretically leave the same kind of empty wrapper behind if Facebook ever renders one around those units. Call `collapseEmptyAncestors` there too while you're in the file, it's the same one-line addition and removes a class of bug before it's ever reported.

### Acceptance
- On a real Facebook feed with Stories on, no visible empty space remains where the story tray was — the layout closes up exactly like the reference extension.
- Reels and Videos continue to hide cleanly with no regression.
- Turning Stories back off restores the tray and its surrounding layout exactly as it was before.

---

## Part C — New feature: Snooze with quotes

**Reference concept:** News Feed Eradicator's core idea — replace the feed with a calm full-page message and a timer, instead of trying to selectively hide individual posts. Build Nullfeed's own version of this concept with its own design and its own quote content — don't port their code, copy their exact quote list, or reuse their visual layout; the *mechanic* (timed full-page replacement) is the only thing being adopted.

This is a new, separate mode layered on top of the existing Protection/filter system, not a replacement for it. A user can have Protection on and also start a Snooze.

### Schema changes — `src/shared/settings.ts`
```ts
export type SnoozeSettings = {
  active: boolean;
  until: number | null; // epoch ms; null when not snoozing
  sites: {
    facebook: boolean;
    instagram: boolean;
    youtube: boolean;
  };
};
```
Add `snooze: SnoozeSettings` to `Settings`, and to `DEFAULT_SETTINGS`:
```ts
snooze: Object.freeze({
  active: false,
  until: null,
  sites: Object.freeze({ facebook: true, instagram: true, youtube: true })
})
```
Extend `validateSettings()` with the same backfill pattern used for the platform objects (`booleanOrDefault` for `active`/each site flag; for `until`, accept a finite number or fall back to `null`).

### Storage helpers — `src/shared/storage.ts`
Add two focused helpers alongside the existing `setEnabled`/`setLastPlatform`/`setPlatformPreference`:
- `startSnooze(current: Settings, durationMs: number): Promise<Settings>` — sets `snooze.active = true`, `snooze.until = Date.now() + durationMs`.
- `endSnooze(current: Settings): Promise<Settings>` — sets `snooze.active = false`, `snooze.until = null`.
- `setSnoozeSite(current: Settings, platform: Platform, value: boolean): Promise<Settings>` — updates `snooze.sites[platform]`.

### Auto-expiry — `chrome.alarms` (new permission)
Relying on a content script's own timer isn't enough — if the user closes every tab of a snoozed site before the duration ends, nothing would ever clear `snooze.active`. Use an alarm so it clears even with no tabs open:

1. Add `"alarms"` to `permissions` in `manifest.config.ts`.
2. In `src/background/serviceWorker.ts`, listen for storage changes to `snooze.until`:
   - when it changes to a future timestamp, call `chrome.alarms.create("nullfeed-snooze-end", { when: until })`.
   - when it changes to `null`, call `chrome.alarms.clear("nullfeed-snooze-end")`.
3. Add `chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === "nullfeed-snooze-end") { /* load settings, call endSnooze, save */ } })`.

Every open tab already listens for `chrome.storage.onChanged` (both `App.tsx` and `content/index.ts` do this today) — so once the background clears `snooze.until`, every tab reacts on its own. No new messaging layer needed.

### Content script overlay — new file `src/content/snoozeOverlay.ts`
This is intentionally separate from the existing `hideElement`/`data-nullfeed-hidden` system used by the per-platform adapters — it's a full-page replacement, not selective hiding.

- `showSnoozeOverlay(until: number): void` — injects a fixed, full-viewport overlay (`position: fixed; inset: 0; z-index: <max>`) styled with the popup's existing dark tokens (`--canvas`, `--surface`, `--ink`, `--accent`), containing:
  - the Nullfeed mark,
  - one quote, chosen at random from an internal quote bank (see below) — pick once when the overlay is shown, don't rotate while it's up,
  - a live countdown to `until` (e.g. `12:34 remaining`),
  - a "Resume now" button that calls `endSnooze()` and removes the overlay immediately.
- `hideSnoozeOverlay(): void` — removes the injected element if present.

### Orchestration — `src/content/index.ts`
In `apply()`, before deciding whether to run `scan()`:
```ts
const snoozed =
  nextSettings.snooze.active &&
  nextSettings.snooze.until !== null &&
  Date.now() < nextSettings.snooze.until &&
  adapter &&
  nextSettings.snooze.sites[adapter.platform];

if (snoozed) {
  showSnoozeOverlay(nextSettings.snooze.until);
  return; // don't run adapter.scan() while the overlay covers the page
}

hideSnoozeOverlay();
```
Also add a lightweight local interval (e.g. every 1s while an overlay is showing) purely to update the countdown text and to remove the overlay client-side the instant `until` passes, without waiting for the background alarm round-trip — the alarm is the source of truth for clearing storage, this local timer is just so the UI doesn't sit stale for a few extra seconds.

### Popup UI — `src/popup/App.tsx`
Add a "Snooze" section below the existing Protection card (always visible, not a separate tab, to keep it discoverable):
- **Not snoozing:** a row of duration buttons — 1m / 2m / 5m / 10m / 30m / 1h / 24h — clicking one immediately calls `startSnooze()` (no separate confirm step, matching the reference extension's pattern). Below the buttons, three small checkboxes: Facebook / Instagram / YouTube, wired to `setSnoozeSite`, controlling which platforms the overlay applies to.
- **Snoozing:** replace the buttons with a status line ("Snoozing — resume in 12:34") and a "Resume now" button that calls `endSnooze()`.

Keep this visually consistent with the existing dark-theme card language already in `popup.css` (same border/radius/surface treatment as the Protection card) rather than introducing a new visual style.

### Quote bank
Ship Nullfeed's own quotes — short, original, unattributed, and deliberately not close to any well-known saying. A starter set to build from:

```
The feed will still be here. This moment won't.
Nothing in this feed is waiting on you.
You opened this app for a reason. This isn't it.
Scrolling feels like progress. It rarely is.
Put the phone down. Pick something real back up.
The next post is never the one that matters.
Your attention is the only thing you can't refresh.
Close the tab. Open something you'll remember.
An empty feed never emptied anyone's mind.
This is a good time to do the thing you're avoiding.
```
Store these as a simple array in a new `src/shared/quotes.ts` so the list is easy to extend later without touching overlay logic.

### Out of scope for this pass (flagging, not building)
News Feed Eradicator also has a "Lock settings" mechanic — a commitment device that prevents disabling the snooze early for a period. It's a genuinely different feature (friction against your own willpower, not just a timer) and adds real complexity around what "locked" should override. Worth considering as a v2, but don't build it as part of this pass unless you explicitly ask for it separately.

### Tests
- Unit: `startSnooze`/`endSnooze`/`setSnoozeSite` update `Settings` correctly; `validateSettings` backfills a missing/malformed `snooze` object to the default.
- E2e: starting a short snooze (e.g. mock a 1-second duration in the test) shows the overlay and hides it automatically without user action; "Resume now" clears it immediately; a platform with its site checkbox off never shows the overlay even while snoozing.

### Acceptance
- Starting a snooze from the popup immediately replaces the page content on every checked platform with the overlay, and does so instantly on next navigation/tab open too (not just the tab that started it).
- The overlay clears itself automatically at the chosen time, even if the tab that started the snooze was closed in the meantime.
- "Resume now," from either the popup or the overlay, ends the snooze everywhere at once.
- Regular filtering (Reels/Stories/Ads/etc.) is completely unaffected when no snooze is active.

---

## Suggested execution order
1. Part B first — it's a live, confirmed bug affecting the feature you already shipped.
2. Part A next — small, contained, same shape as the existing three Facebook toggles.
3. Part C last — the largest piece, touches schema, storage, background, content script, and popup UI.

After all three: `npm test && npm run build && npm run test:e2e`, then a manual pass on a real, logged-in Facebook session to confirm Stories collapses cleanly, Sponsored posts are hidden without touching organic ones, and a manual pass on all three platforms to confirm Snooze starts, counts down, and clears correctly.
