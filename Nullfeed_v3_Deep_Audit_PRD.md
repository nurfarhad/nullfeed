# Nullfeed v3.0.0 — Deep Code Audit & PRD
Prepared for: Google Antigravity (Claude Opus / Sonnet build)
Scope: static audit of `Nullfeed_ChromeWebStore.zip` (the built package intended for Chrome Web Store submission) against the claims in `CHROME_WEB_STORE_DESCRIPTION.txt`.

Constraint carried over from Farhad: **no UI/visual changes.** Every fix below is either logic-only or a scope/permissions change — nothing here touches layout, styling, or component structure.

---

## P0 — Snooze cannot be started (feature is unreachable)

**Finding:** the popup contains zero code related to snooze — no duration buttons, no snooze-start handler, and no import of any "start snooze" storage function. `storage.ts`'s compiled output defines `endSnooze` but never defines a counterpart that sets `snooze.active = true` and computes `snooze.until`. The background service worker and content-script overlay are both correctly built and would work *if* something ever set that state — nothing does.

Everything downstream of "start" (alarm scheduling in the service worker, the full-page overlay with countdown, auto-expiry, "Resume now") is implemented correctly. This is purely a missing entry point.

**Fix:**
1. Add a `startSnooze(current: Settings, durationMs: number): Promise<Settings>` to `storage.ts`, following the same debounced-save pattern already used by `setEnabled`/`endSnooze`:
   ```ts
   export async function startSnooze(current: Settings, durationMs: number): Promise<Settings> {
     return saveSettings({
       ...current,
       snooze: { ...current.snooze, active: true, until: Date.now() + durationMs }
     });
   }
   ```
2. Add the popup UI to call it — duration buttons per the store description's own claim (5m / 15m / 30m / 1h), each dispatching `startSnooze(settings, minutes * 60_000)`. Also wire the already-existing `endSnooze` into a "Resume now" popup control for when a snooze is active (currently the popup can't stop one either, only the in-page overlay button can).
3. Since you've asked for no UI changes, treat this narrowly as "add the missing interactive elements that make the already-designed snooze section functional" rather than a redesign — if the popup genuinely has no snooze section in its current layout at all, flag that back to Farhad before building new UI, since it's the one case where this audit's "no UI" instruction and "make the feature work" instruction are in tension.

**Acceptance:** tapping a duration in the popup sets `snooze.active/until` in storage, the background schedules the alarm, and the full-page overlay appears on every open tab of a snoozed platform within one storage round-trip. "Resume now" works from both the popup and the overlay.

---

## P0 / Decision required — LinkedIn & Twitter/X run with no user visibility or control

**Finding:** `manifest.json` requests `host_permissions` and injects content scripts on 6 platforms (Facebook, Instagram, YouTube, LinkedIn, X, Twitter — 12 origin patterns once apex + wildcard-subdomain variants are counted). `linkedin: { feed: true, news: true }` and `twitter: { timeline: true, trending: true }` are real, validated fields in `Settings`, always default-on, and there is no code path anywhere in the popup that reads or writes them. I confirmed zero occurrences of "linkedin" or "twitter" in the popup bundle beyond the LinkedIn footer profile link.

This directly contradicts what you told me: the popup is deliberately scoped to Facebook/Instagram/YouTube only. As shipped, the extension filters LinkedIn's feed and X/Twitter's timeline unconditionally, on every install, with no way for a user to see that it's happening or turn it off short of disabling the whole extension.

This matters beyond philosophy:
- **Trust/transparency:** someone installing an extension whose entire visible surface is "hide Shorts/Reels/Stories on 3 apps" gets silent behavior on 2 more apps they were never shown.
- **Chrome Web Store review:** a permission set that includes 6 platforms when only 3 are ever exposed or explained in the UI is exactly the kind of mismatch reviewers flag, and several of the host permissions (`*.facebook.com`, `*.instagram.com`, etc.) use the wildcard-subdomain form rather than scoping to the actual subdomains in use (`www.facebook.com`, possibly `m.facebook.com`) — broader than the product needs.

**This is your call, not mine — but pick one explicitly, don't leave it as-is:**
- **Option A (matches what you told me):** remove LinkedIn and Twitter/X entirely — manifest permissions, content script matches, the two adapters, the `linkedin`/`twitter` settings fields, and the corresponding sections of the store description. Tighten `*.facebook.com`/`*.instagram.com`/`*.youtube.com` back to the specific subdomains actually used, same as before v3.0.0.
- **Option B:** keep them, but make them real, visible, user-controlled features — add them to the popup (even a minimal one) and disclose them properly in the "what's new" copy. This is more work and is a genuine product-scope expansion beyond what you described to me.

I'd default to Option A given what you told me directly, but I'm flagging it rather than silently deleting two platforms' worth of implemented code without you confirming.

---

## P1 — Popup status badge can never show "No filters selected"

**Finding:** `hasActiveFilters()` — which drives the popup's "Protected" vs. "No filters selected" status pill — ORs together all five platforms' settings, including `linkedin`/`twitter`, which (per the finding above) are always `true` by default and have no UI path to become `false`. Practical effect: a user can turn off every single toggle they can actually see (all of Facebook, Instagram, and YouTube) and the badge will still say "Protected," because the invisible LinkedIn/Twitter flags are still contributing `true` to the check.

**Fix:** this resolves itself if LinkedIn/Twitter are removed (Option A above). If they're kept (Option B), `hasActiveFilters` should only factor in platforms the user can actually see and control — otherwise gate the status calculation to exclude platforms without popup UI.

**Acceptance:** turning off every visible toggle shows "No filters selected" in the popup, regardless of what's happening on unlisted platforms.

---

## P1 — "Mindful Focus Quotes" never appears on Facebook, Instagram, or YouTube outside of Snooze

**Finding:** the in-feed quote card (`showQuotes`, the persistent card that replaces a hidden feed) is only ever inserted by the LinkedIn and Twitter/X adapters. I checked the Facebook, Instagram, and YouTube adapter code directly — none of them call the quote-insertion function at all. So on the three platforms your popup actually exposes, a quote card never appears during normal browsing; the only place quotes show up for those platforms is the full-page Snooze overlay (which, per the P0 above, currently can't even be started).

This is a real gap against the store description's "🎯 1. MINDFUL FOCUS QUOTES — Replaces empty feed spaces with a sleek, serene focus card," which reads as a general, always-on feature rather than something tied only to Snooze.

**Fix, if you want the feature to work as described for FB/IG/YT:** decide what "empty feed space" means for each of those three concretely — e.g. Facebook Stories/Reels collapse to nothing today (correctly, no visual gap to fill), but if you want a quote card to appear at the top of the feed area regardless, that's new adapter wiring (calling the same quote-card insertion logic already built for LinkedIn/Twitter, pointed at each platform's real feed container) rather than a bug fix in the strict sense — flagging it as a decision, not assuming you want it built without confirmation, since it does touch what appears on the page (though not the popup UI itself).

**If quotes are meant to be Snooze-only:** no code change needed here beyond fixing Snooze itself (P0 above) — but the store description's section 1 should be reworded so it doesn't imply a persistent, always-on quote experience on the three real platforms.

---

## P1 — LinkedIn quote-card placement uses the wrong selector pattern

**Finding:** LinkedIn's adapter picks where to insert the quote card with:
```js
document.querySelector('.scaffold-finite-scroll, main.scaffold-layout__main, .core-rail')
```
A single `querySelector` call with a comma-separated selector list does **not** try `.scaffold-finite-scroll` first and fall back to the others — it returns whichever matching element appears *first in document order*, regardless of which part of the selector matched it. If `main.scaffold-layout__main` (a broad ancestor wrapping the feed) appears earlier in the DOM tree than `.scaffold-finite-scroll` — which is likely, since it's the outer container — the quote card gets inserted next to the wrong, much broader element.

Twitter's equivalent code does this correctly, looping through its selector array and checking each with `document.querySelector(singleSelector)` individually, stopping at the first real match:
```js
for (const selector of candidates) {
  const match = container.querySelector(selector);
  if (match) { /* use match, break */ }
}
```

**Fix:** change LinkedIn's insertion-point lookup to the same explicit loop pattern Twitter already uses, trying `.scaffold-finite-scroll` first, then `main.scaffold-layout__main`, then `.core-rail`, stopping at the first real match.

**Acceptance:** on a real LinkedIn feed, the quote card appears directly in place of the feed content, not offset near a much larger page region.

---

## P2 — Verify against live DOM before shipping

These are plausible but lower-confidence from static analysis alone — confirm on real, logged-in sessions:

- **Instagram highlights:** `ul:has(> li a[href*="/stories/highlights/"])` hides the *entire* parent `<ul>` if any one of its `<li>` children links to a highlight. Confirm Instagram's profile page never mixes highlight items into a `<ul>` alongside unrelated list items — if it ever does, this over-hides.
- **LinkedIn quote-card staleness:** unlike Twitter's version, LinkedIn's quote-card logic never checks whether an already-inserted card is still correctly positioned relative to the current feed container. On a platform as DOM-churn-heavy as LinkedIn's feed, this risks an orphaned or misplaced card surviving after a re-render. Consider porting Twitter's staleness check.

---

## Confirm as an intentional product decision (not a defect)

**The Facebook ad-hiding placeholder permanently credits you, with a live link, inside every hidden ad.** The 72px-placeholder approach itself is genuinely well engineered — the code correctly avoids Facebook's virtualized-feed churn problem (removing items outright would make the feed measure itself as short and infinite-load more content to fill the gap; a fixed-height placeholder avoids that). But the placeholder's text is "Sponsored & ads hidden by Nur Farhad," linking out to your personal Facebook profile, and this repeats on every single hidden ad down a user's feed — potentially many times per scroll session. That's a deliberate, unusual choice worth explicitly confirming you want, since it's self-promotional content injected repeatedly into someone else's browsing session by a tool that's otherwise positioned as a quiet, private utility.

---

## What's already solid (no action needed)

- The empty-box collapse fix from the last audit (`collapseEmptyAncestors`) is implemented correctly and applied consistently across Reels, Videos, and Stories.
- Facebook ad detection itself (the actual matching logic, separate from the placeholder-credit question above) is well built: multi-locale text matching, scoped away from post body text, a genuine structural fallback with a 40%-of-feed circuit breaker to stop a bad selector from mass-hiding real posts, and a two-tier feed/rail treatment. This is meaningfully more careful than a first pass.
- The background service worker is correctly wired this time (imports the real `serviceWorker.ts` bundle, not a stale/wrong chunk — the class of bug from the last audit did not recur).
- The dark/light theme CSS is complete in both directions — every token has both a dark and a light value, nothing renders unstyled either way.
- Instagram's over-hiding protections (the fixes from Audit v2) are intact and, if anything, slightly hardened further.

---

## Suggested execution order
1. Resolve the LinkedIn/Twitter scope decision first — it determines whether items 3 and 4 below are "delete this" or "finish building this."
2. Fix Snooze's missing start function (P0) — this is unambiguous regardless of the scope decision.
3. Fix the popup status-badge logic (P1) — quick, and depends on the scope decision's outcome.
4. Fix LinkedIn's selector bug (P1) — only relevant if LinkedIn stays in scope.
5. Confirm the ad-placeholder attribution choice with Farhad directly — not a code task.
6. Spend a manual QA pass on the P2 items against real, logged-in sessions before resubmitting.
