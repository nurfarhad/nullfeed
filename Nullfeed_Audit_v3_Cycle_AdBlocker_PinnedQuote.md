# Nullfeed — Audit v3: Focus Cycle Deep-Dive, Ad Blocker Portability, Pinned Quote Spec

**Reviewed by:** Claude
**Date:** September 7, 2026
**Scope:** Updated source export (`popup.zip`), which includes real `node_modules` and a prebuilt `dist/`
**Questions answered in this report:** (1) hidden bugs, with special focus on the Focus Cycle, (2) which platforms have the Cycle feature, (3) can the Facebook ad blocker be ported elsewhere, (4) full spec for a new always-pinned quote feature

---

## 0. How this was verified

This export included the real `node_modules`, so I could try running your actual test/build scripts instead of hand-simulating them. Two different results:

- **`tsc --noEmit -p tsconfig.json` (using your real `@types/chrome` and `preact` types, not stubs): passes with zero errors**, across the entire project. This is a stronger signal than my previous audits, which relied on hand-written type stubs.
- **`vitest run` and `vite build` fail immediately** — not from your code, but because this `node_modules` was `npm install`-ed on Windows (`@rolldown/binding-win32-x64-msvc`, `lightningcss-win32-x64-msvc`) and the native bindings don't run on Linux. This sandbox has no network access to fetch the correct Linux binaries. **You'll need to run `npm test`, `npm run build`, and `npm run test:e2e` yourself** — everything below that isn't a type error is from manual code reading, not a live test run.

---

## 1. Which platforms have the Focus Cycle?

Straight from `src/content/focusCycle.ts`'s `CYCLE_PLATFORMS`:

| Platform | Has Focus Cycle? |
|---|---|
| Facebook | ✅ Yes |
| LinkedIn | ✅ Yes |
| X / Twitter | ✅ Yes |
| Reddit | ✅ Yes |
| Instagram | ❌ No |
| **YouTube** | **❌ No — confirmed, matches your expectation** |

YouTube is correctly excluded. It gets Shorts-hiding and other filters via its own adapter, but never enters the 15-on/15-off cycle. Nothing to fix here — just confirming.

One nuance worth knowing: the extension's content script *does* run on all 6 platforms (see `manifest.config.ts`'s `matches`), but only Facebook, Instagram, and YouTube have a full `SiteAdapter` (the object that does route-blocking, Shorts/Reels filtering, ad-blocking, etc. — see `src/content/index.ts`'s `if (adapter) {...}` block). LinkedIn, X, and Reddit get *only* the Focus Cycle logic (`if (cyclePlatform) {...}`) and nothing else. This matters for §4 below.

---

## 2. The Focus Cycle: what's new, and what's genuinely good

Since the last review, whoever built this out added a real **anti-flash / anti-bypass system**, in three layers:

1. **Layer 1 (sync pre-paint):** reads a cached anchor from `localStorage` (not `chrome.storage`, which is always async) the instant the page loads, and pre-applies the blocked CSS attribute before the feed even renders — closing the old "refresh to skip your break" loophole.
2. **Layer 2 (`MutationObserver` feed-watcher):** during the blocked phase, watches the whole page for newly-inserted feed content (Facebook lazily renders posts via React even while "blocked") and hides it the instant it appears.
3. **Layer 3 (localStorage persistence):** writes the confirmed anchor back to `localStorage` after each real `tickCycle()` resolution, so Layer 1 has fresh data next load.

This is legitimately good, considered engineering — it closes a real gap (the old version only hid the feed once per `tickCycle` poll, so lazily-injected posts or a refresh mid-break could leak through). Credit where due.

That said, digging through this new layer turned up real issues:

### 2.1. A reintroduced version of a bug I flagged last time 🟠
**File:** `src/content/index.ts`, `handleScrollSample`

```ts
const showQuotes = settings ? getEffectiveSettings(settings).showQuotes : true;
applyCyclePhase(cyclePlatform!, "on", "smart", showQuotes);
```

This reads the module-level `settings` variable — but as established in §1, that variable is **only ever populated inside `apply()`, which returns early `if (!adapter)`**. LinkedIn, X, and Reddit have no adapter. So on those three platforms, `settings` is always `null`, and this line always falls back to the hardcoded default `showQuotes = true`.

**Practical effect:** if a user on LinkedIn/X/Reddit turns off "Show Quotes," it's correctly respected for the regular timed cycle breaks (which read `effective.showQuotes` inside `tickCycle`, which *does* have its own settings), but the moment Smart Trigger fires early, it ignores their preference and shows a quote anyway. Small, but a genuine functional inconsistency between two code paths that should agree.

**Fix:** Same shape as last time — `handleScrollSample` needs its own settings tracking scoped to the `if (cyclePlatform)` block (mirroring what `tickCycle` already does), rather than reading the adapter-only `settings` variable.

### 2.2. Feed selectors are defined in three places, and two of them disagree 🟠
**Files:** `src/content/focusCycle.ts`, `src/content/index.ts`

The shared `feedSelectors` array for Facebook (used by `findFeedContainer` **and** Layer 2's `startFeedWatcher`) includes:
```
'div[role="main"] [role="article"]'
```
with no exclusion. But `applyCyclePhase`'s own supplementary hiding block (the "belt and suspenders" pass right below it) uses a separately hardcoded string:
```
'div[role="main"] [role="article"]:not([data-pagelet*="Stories"])'
```
— deliberately excluding Stories.

**Practical effect:** Layer 2 (the mutation watcher) will hide Stories-tagged articles; the direct call in `applyCyclePhase` deliberately won't. Depending on which one fires first for a given DOM node, Stories content could get caught by the Focus Cycle's blocking even though someone clearly intended to carve it out. This is exactly the kind of bug that's invisible in normal testing and only shows up as "why did my Stories tray disappear during a break" from a real user.

**Fix:** Selectors should live in exactly one place. Pull the Stories exclusion into the shared `CYCLE_PLATFORMS.facebook.feedSelectors` definition (or a shared constant both call sites import), so Layer 2 and the direct call can never drift apart again.

### 2.3. Layer 1's pre-paint doesn't know about snooze 🟡
**File:** `src/content/index.ts`, Layer 1 block

Layer 1 checks `LS_ENABLED_KEY`/`LS_ANCHOR_KEY` only — it has no awareness of the snooze feature (`getSnoozeUntil`/`isSnoozeActive`). In the normal case this self-corrects fine, because `tickCycle` writes `LS_ENABLED_KEY = "false"` once a snooze takes effect. But there's a narrow race: if a user snoozes and then reloads/navigates *immediately*, before the async `chrome.storage.onChanged` → `tickCycle` round-trip completes, Layer 1 reads the **stale** cached values from before the snooze and could pre-paint a blocked phase for a split second, even though the user just explicitly asked for a break. It self-corrects within ~100ms, but it's a real, reproducible edge case given the feature's whole point is "trust that snooze actually works."

**Fix:** Have the snooze-setting action in the popup also write a `LS_ENABLED_KEY = "false"` (or an explicit `LS_SNOOZED_KEY`) synchronously to `localStorage` at snooze-time, not just at the next `tickCycle`.

### 2.4. Silent gap when quotes are off 🟢
**File:** `src/content/focusCycle.ts`, `applyCyclePhase`

When `showQuotes` is `false` and the phase is `"on"`, the feed is hidden and **nothing replaces it** — no card, no message, just empty space. Not a bug exactly (it's the literal, logical consequence of "don't show quotes"), but worth a conscious decision: a blocked feed with zero explanation could read as the extension being broken rather than intentionally pausing you. Minor, low priority.

### 2.5. Small housekeeping
`CYCLE_ON_MS` (in `focusCycle.ts`) is exported but never imported anywhere in production code (`index.ts` only imports `CYCLE_BREAK_MS` and `CYCLE_TOTAL_MS`) — it's referenced only in tests now. Not a bug, just dead-ish weight; fine to leave or trim.

---

## 3. Can the Facebook ad blocker be ported to other platforms?

Short answer: **the approach is portable, the code isn't — each platform needs its own from-scratch reverse-engineering effort.**

Reading `src/content/adapters/facebook.ts`'s ad-detection block (lines ~246–620), this is genuinely sophisticated, Facebook-DOM-specific work:
- **Three-clause `:has()` selectors** matching on Facebook's own internal `data-ad-rendering-role` attribute (`profile_name` + `story_message` + a `cta-`-prefixed value together — all three required, which is what makes it an ad-specific signature rather than a normal-post false-positive).
- **A ratio-based safety guard** (`FB_AD_MAX_FEED_SHARE = 0.4`): if more than 40% of a sample of the feed gets flagged as ads, it backs off — a defense against a bad selector match quietly hiding real content at scale.
- **Two different treatments** depending on ad placement: feed ads get a lightweight CSS placeholder (avoiding Facebook's virtualized-scroll from endlessly re-rendering into hidden space), rail/sidebar ads get straightforward `display:none`.
- A fallback **link-based detection** (AdChoices / "why am I seeing this ad" links), since those are locale-independent.

None of this transfers to Instagram or YouTube as-is — I checked, and **both currently have zero ad-detection code** (`grep` for "ad"/"sponsored" in `instagram.ts` and `youtube.ts` returns nothing). Each platform would need:

- **Instagram:** Ads in-feed carry their own internal markup (not `data-ad-rendering-role` — that's Facebook-specific, even though they're the same company). Would need fresh inspection of Instagram's current DOM to find an equivalent reliable signal (Instagram is also more aggressive about obfuscating class names, which makes this harder than Facebook).
- **YouTube:** A meaningfully different problem — YouTube ads aren't just DOM cards mixed into a feed, they're **video ad insertions in the player itself** (pre-roll/mid-roll), plus separate "Promoted" video cards in the feed/search results. These need two different mechanisms, and the player-ad case in particular is a much bigger technical lift (skip-button automation, player-state detection) than anything the current Facebook code does.
- **LinkedIn / X / Reddit:** No adapter exists at all yet for these three (see §1) — ad-blocking here would mean building adapter infrastructure from scratch, not just porting the ad logic.

**My honest recommendation:** treat "port the Facebook ad blocker" as **N separate reverse-engineering projects**, not one porting task. Instagram is the most realistic next target (same company, similar React/DOM conventions, in-feed-card ads similar in *shape* to Facebook's even if the attributes differ). YouTube's in-player ads are a different category of problem and I'd scope that as its own initiative rather than bundling it in.

---

## 4. New feature spec: Always-Pinned Quote at the Top of Every Feed

**Requirement, as given:** A quote should always be the very first thing shown — before any post — on every supported platform, persisting across reloads. This is separate from the existing Focus Cycle quote card, which only appears during a blocked phase on 4 of the 6 platforms.

### 4.1. Why this needs new infrastructure, not a tweak

I checked: `mountQuoteCard` currently has exactly one call site (`focusCycle.ts`'s `applyCyclePhase`), gated to the 4 Focus Cycle platforms and only during the `"on"` (blocked) phase. To make a quote permanently pinned on **every** platform — including Instagram and YouTube, which have no Focus Cycle at all, and during the normal free-browsing phase on the 4 that do — needs a new, independent mounting mechanism that isn't gated by `adapter` or `cyclePlatform`.

### 4.2. Proposed design

- **New module:** `src/content/pinnedQuote.ts` — separate from `quoteCard.ts`'s existing "reason: cycle | smart" card, since this is a third, distinct concept (always-on, not phase-triggered). Reuse the same visual card styling for consistency, but as its own component so the three behaviors (`cycle`, `smart`, `pinned`) don't get tangled into one function's branching logic.
- **New per-platform "feed root" selectors.** Only Facebook, LinkedIn, X, and Reddit currently have `feedSelectors` defined (in `CYCLE_PLATFORMS`, for cycle purposes). Instagram and YouTube have none — their adapters use their own internal targeting for filtering Shorts/Reels, not for identifying "the top of the main feed" as a single container. This needs fresh, dedicated selectors for Instagram's home feed and YouTube's home-feed grid.
- **Insertion point:** ungated code in `index.ts` — not inside `if (adapter)` or `if (cyclePlatform)`, but a new top-level block that runs on all 6 matched domains.
- **Reassertion logic:** the critical technical challenge here is *staying* first. A single `insertBefore` at load time isn't enough — these are all infinite-scroll SPAs that can prepend new content above your pin (a "New posts" banner reloading the top of the feed, for instance). This needs the same "Layer 2" mutation-watcher pattern already proven in the Focus Cycle: observe the feed root, and on every mutation, check `pin.previousElementSibling !== null` (or equivalent) and re-insert at position 0 if something jumped ahead of it.
- **Persistence across reloads:** this one is actually free — since the content script re-runs fresh on every navigation/reload already (that's how the whole extension works), "persist across reloads" just means "run this unconditionally on `document_start`/content-script init," not literal storage. No new `chrome.storage` needed for this requirement specifically.
- **Interaction with the existing Focus Cycle card:** needs an explicit decision. When phase is `"on"` (blocked) on one of the 4 cycle platforms, the entire feed — including wherever the pin was inserted — gets hidden and replaced by the `cycle`/`smart` card. Options: (a) the pinned quote simply also becomes invisible during that time (feed is gone, nothing to pin above), which is probably the simplest and most defensible behavior, or (b) keep the pin visible above the blocked-phase card too, which starts to feel redundant (two quote-shaped things stacked). **I'd recommend (a)** — don't try to make the pin survive the blocked state, since the blocked-phase card already fully replaces the feed context the pin exists to sit above.
- **Not a setting.** Given the pattern you set with Smart Trigger, I'd assume this should also ship unconditionally — no popup toggle — unless you tell me otherwise.

### 4.3. Rough scope

| Task | Platforms affected |
|---|---|
| New `pinnedQuote.ts` module + reused card styling | All |
| Facebook/LinkedIn/X/Reddit: reuse existing `feedSelectors` | 4 (low effort — selectors already exist) |
| Instagram: new feed-root selector, tested against current DOM | 1 (medium effort — needs fresh inspection) |
| YouTube: new feed-root selector, tested against current DOM | 1 (medium effort — same) |
| Reassertion `MutationObserver`, mirroring Layer 2 | All |
| Wiring into `index.ts` outside existing `adapter`/`cyclePlatform` gates | All |

This is a real, scoped feature — not a one-line change — mainly because of the Instagram/YouTube selector work and the reassertion logic needed to survive infinite-scroll re-renders. I'd estimate it's a comparable-sized lift to the original Smart Trigger build.

---

## 5. Prioritized action list

| # | Action | Area | Severity |
|---|---|---|---|
| 1 | Fix `handleScrollSample`'s `showQuotes` read to not depend on the adapter-only `settings` variable | Cycle | 🟠 High |
| 2 | Unify the Facebook feed selectors (Layer 2 vs. `applyCyclePhase`'s own block) into one source of truth, with the Stories exclusion applied consistently | Cycle | 🟠 High |
| 3 | Make snooze write its localStorage state synchronously so Layer 1 can't pre-paint a stale blocked phase | Cycle | 🟡 Medium |
| 4 | Decide on/implement messaging for the "quotes off + blocked phase = blank gap" case | Cycle | 🟢 Low |
| 5 | Build the always-pinned quote feature per §4 | New feature | — |
| 6 | Treat ad-blocker expansion as separate per-platform projects, starting with Instagram | New feature | — |
| 7 | Run `npm test`, `npm run build`, `npm run test:e2e` on your own machine — this sandbox couldn't due to the Windows-only native bindings in `node_modules` | Verification | — |

Items 1 and 2 are the ones I'd fix first — they're real, reproducible bugs in the system you specifically asked me to scrutinize, and both are small, contained fixes.

---

*This audit covered the code as exported on 2026-09-07. Type-checking was run for real against the project's own `tsconfig.json` and installed types (zero errors). Unit tests, build, and e2e tests could not be run in this sandbox due to a platform mismatch in the prebuilt `node_modules` — please run those yourself before treating this as a final sign-off.*
