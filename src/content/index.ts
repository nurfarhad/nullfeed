import type { Settings } from "../shared/settings";
import { getSettings, SETTINGS_STORAGE_KEY } from "../shared/storage";
import { getOrCreateAnchor } from "../shared/focusCycleStorage";
import { recordDistractions } from "../shared/statsStorage";
import { hideElement } from "./domOwnership";
import { getSnoozeUntil, SNOOZE_STORAGE_KEY } from "../shared/snoozeStorage";
import type { SiteAdapter } from "./adapter";
import { facebookAdapter } from "./adapters/facebook";
import { instagramAdapter } from "./adapters/instagram";
import { youtubeAdapter, resetYouTubeHomeFeedChipState, syncYouTubeNewToYouChip } from "./adapters/youtube";
import {
  applyCyclePhase,
  CYCLE_BREAK_MS,
  CYCLE_PLATFORMS,
  CYCLE_TOTAL_MS,
  detectCyclePlatform,
  getPhase,
  triggerEarlyBlock
} from "./focusCycle";
import {
  detectPinnedPlatform,
  mountPinnedQuoteCard,
  startPinnedQuoteWatcher,
  unmountPinnedQuoteCard
} from "./pinnedQuote";
import { observeDynamicContent } from "./observer";
import { watchRoutes } from "./routeWatcher";
import {
  canTriggerEarlyBlock,
  createDetectorState,
  isDoomscrolling,
  recordScrollSample,
  type DetectorState
} from "./scrollDetector";

const adapter = selectAdapter(location.hostname);
const cyclePlatform = detectCyclePlatform(location.hostname);
const pinnedPlatform = detectPinnedPlatform(location.hostname);
let settings: Settings | null = null;
let currentCyclePhase: "on" | "off" | null = null;
let stopPinnedWatcher: (() => void) | null = null;
let tickCyclePlatform: ((current: Settings) => Promise<void>) | null = null;

function syncPinnedQuote(): void {
  if (!pinnedPlatform) return;
  const effective = settings ? getEffectiveSettings(settings) : null;
  const shouldShow =
    Boolean(effective?.enabled) &&
    Boolean(effective?.showQuotes) &&
    currentCyclePhase !== "on";

  if (shouldShow) {
    if (!stopPinnedWatcher) {
      stopPinnedWatcher = startPinnedQuoteWatcher(pinnedPlatform);
    } else {
      mountPinnedQuoteCard(pinnedPlatform);
    }
  } else {
    if (stopPinnedWatcher) {
      stopPinnedWatcher();
      stopPinnedWatcher = null;
    } else {
      unmountPinnedQuoteCard();
    }
  }
}

function selectAdapter(hostname: string): SiteAdapter | null {
  if (/(?:^|\.)youtube\.com$/i.test(hostname)) return youtubeAdapter;
  if (/(?:^|\.)facebook\.com$/i.test(hostname)) return facebookAdapter;
  if (/(?:^|\.)instagram\.com$/i.test(hostname)) return instagramAdapter;
  return null;
}

function logFailure(message: string, error: unknown): void {
  const errStr = error instanceof Error ? error.message : String(error ?? "");
  if (/extension context invalidated/i.test(errStr)) {
    return;
  }
  console.error(message, error);
}

let snoozeUntil: number | null = null;
let snoozeTimeout: ReturnType<typeof setTimeout> | null = null;

function isSnoozeActive(): boolean {
  return Boolean(snoozeUntil && snoozeUntil > Date.now());
}

function getEffectiveSettings(source: Settings): Settings {
  if (isSnoozeActive()) {
    return { ...source, enabled: false };
  }
  return source;
}

function scheduleSnoozeExpiration(onExpire: () => void): void {
  if (snoozeTimeout) {
    clearTimeout(snoozeTimeout);
    snoozeTimeout = null;
  }
  if (!snoozeUntil) {
    return;
  }
  const remaining = snoozeUntil - Date.now();
  if (remaining > 0) {
    snoozeTimeout = setTimeout(() => {
      snoozeUntil = null;
      onExpire();
    }, remaining + 50);
  } else {
    snoozeUntil = null;
  }
}

function updateRootState(current: Settings): void {
  const root = document.documentElement;
  const effective = getEffectiveSettings(current);
  const platformSettings = adapter
    ? effective[adapter.platform]
    : undefined;

  root.toggleAttribute("data-nullfeed-enabled", effective.enabled);
  root.toggleAttribute("data-nullfeed-snoozed", isSnoozeActive());
  root.setAttribute(
    "data-nullfeed-platform",
    adapter?.platform ?? "unsupported"
  );

  for (const attribute of [...root.attributes]) {
    if (attribute.name.startsWith("data-nullfeed-filter-")) {
      root.removeAttribute(attribute.name);
    }
  }

  if (effective.enabled && platformSettings) {
    for (const [key, enabled] of Object.entries(platformSettings)) {
      root.toggleAttribute(`data-nullfeed-filter-${key}`, enabled);
    }
  }
}

function handleRoute(current: Settings): boolean {
  if (!adapter?.blockedRoute(location.pathname, current)) {
    return false;
  }

  const destination = adapter.redirectDestination
    ? adapter.redirectDestination(location.pathname, current) ?? adapter.homeUrl
    : adapter.homeUrl;

  recordDistractions(1);
  location.replace(destination);
  return true;
}

function scan(root: ParentNode): void {
  if (!adapter || !settings) {
    return;
  }

  const effective = getEffectiveSettings(settings);
  if (!effective.enabled) {
    return;
  }

  try {
    adapter.scan(root, effective);
  } catch (error) {
    logFailure(`Nullfeed ${adapter.platform} scan failed.`, error);
  }
}

function apply(nextSettings: Settings): void {
  if (!adapter) {
    return;
  }

  try {
    adapter.cleanup();
    settings = nextSettings;
    updateRootState(nextSettings);
    const effective = getEffectiveSettings(nextSettings);
    if (effective.enabled && !handleRoute(effective)) {
      scan(document);
      // Eagerly activate "New to you" chip on settings load/change so it
      // fires immediately on page load without waiting for a DOM mutation.
      if (adapter.platform === "youtube") {
        syncYouTubeNewToYouChip(effective.youtube.feed);
      }
    }
  } catch (error) {
    logFailure(`Nullfeed ${adapter.platform} update failed.`, error);
  }
}

if (adapter) {
  // Keep cleanup handles so the 2-second route-polling interval and the
  // MutationObserver can be torn down if needed (prevents leak across lifetime).
  let stopObserver: (() => void) | null = null;
  let stopRouteWatcher: (() => void) | null = null;

  function teardown(): void {
    stopObserver?.();
    stopObserver = null;
    stopRouteWatcher?.();
    stopRouteWatcher = null;
    stopPinnedWatcher?.();
    stopPinnedWatcher = null;
  }

  stopObserver = observeDynamicContent((root) => {
    const effective = settings ? getEffectiveSettings(settings) : null;
    if (effective?.enabled && !handleRoute(effective)) {
      scan(root);
    }
    if (cyclePlatform && effective?.enabled && currentCyclePhase === "on") {
      applyCyclePhase(cyclePlatform, "on", "cycle", effective.showQuotes);
    }
    syncPinnedQuote();
  });

  stopRouteWatcher = watchRoutes(() => {
    resetYouTubeHomeFeedChipState();
    const effective = settings ? getEffectiveSettings(settings) : null;
    if (effective?.enabled && !handleRoute(effective)) {
      scan(document);
    }
    syncPinnedQuote();
  });

  // Expose teardown for diagnostics (accessible from the page-world via
  // chrome.scripting in dev mode, no-op in production).
  if (typeof window !== "undefined") {
    Reflect.set(window, "__nullfeedTeardown", teardown);
  }
}

void Promise.all([getSettings(), getSnoozeUntil()])
  .then(([loaded, loadedSnooze]) => {
    settings = loaded;
    snoozeUntil = loadedSnooze;
    scheduleSnoozeExpiration(() => {
      void getSettings().then((s) => {
        settings = s;
        if (adapter) apply(s);
        if (cyclePlatform && tickCyclePlatform) void tickCyclePlatform(s);
        syncPinnedQuote();
      });
    });
    if (adapter) apply(loaded);
    if (cyclePlatform && tickCyclePlatform) void tickCyclePlatform(loaded);
    syncPinnedQuote();
  })
  .catch((error) => {
    logFailure("Nullfeed could not read settings.", error);
  });

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    areaName === "sync" &&
    changes[SETTINGS_STORAGE_KEY]?.newValue !== undefined
  ) {
    void getSettings()
      .then((s) => {
        settings = s;
        if (adapter) apply(s);
        if (cyclePlatform && tickCyclePlatform) void tickCyclePlatform(s);
        syncPinnedQuote();
      })
      .catch((error) =>
        logFailure("Nullfeed could not apply changed settings.", error)
      );
  }

  if (
    areaName === "local" &&
    changes[SNOOZE_STORAGE_KEY] !== undefined
  ) {
    snoozeUntil =
      typeof changes[SNOOZE_STORAGE_KEY].newValue === "number"
        ? changes[SNOOZE_STORAGE_KEY].newValue
        : null;

    if (cyclePlatform) {
      try {
        if (isSnoozeActive()) {
          localStorage.setItem(`nullfeed-sync-enabled-${cyclePlatform}`, "false");
        }
      } catch {
        // ignore
      }
    }

    scheduleSnoozeExpiration(() => {
      void getSettings().then((s) => {
        settings = s;
        if (adapter) apply(s);
        if (cyclePlatform && tickCyclePlatform) void tickCyclePlatform(s);
        syncPinnedQuote();
      });
    });

    void getSettings().then((s) => {
      settings = s;
      if (adapter) apply(s);
      if (cyclePlatform && tickCyclePlatform) void tickCyclePlatform(s);
      syncPinnedQuote();
    });
  }
});

if (cyclePlatform) {
  // Last-known anchor, refreshed on every tick. Smart Trigger itself has no
  // on/off setting — it runs whenever a feed is visible ("off" phase) and
  // Protection is on. See tickCycle below for why this can't reuse the
  // module-level `settings` variable above (that one is adapter-only).
  let currentAnchor: number | null = null;
  let detectorState: DetectorState = createDetectorState();

  // ── LAYER 1: Synchronous pre-block ──────────────────────────────────────
  // Before any async storage read completes, instantly re-apply the last
  // known blocking phase from localStorage. This closes the ~10-50ms window
  // between page load and the first async tickCycle() resolution during which
  // the feed would flash visible — the refresh/new-tab bypass exploit.
  // We store the anchor timestamp so we can compute the phase mathematically
  // without needing chrome.storage (which is always async).
  const LS_ANCHOR_KEY = `nullfeed-sync-anchor-${cyclePlatform}`;
  const LS_ENABLED_KEY = `nullfeed-sync-enabled-${cyclePlatform}`;
  try {
    const cachedAnchorStr = localStorage.getItem(LS_ANCHOR_KEY);
    const cachedEnabled = localStorage.getItem(LS_ENABLED_KEY);
    if (cachedEnabled === "true" && cachedAnchorStr) {
      const cachedAnchor = Number(cachedAnchorStr);
      if (Number.isFinite(cachedAnchor)) {
        const cachedPhase = getPhase(cachedAnchor);
        if (cachedPhase === "on") {
          // Pre-paint both attributes so the CSS rule fires immediately,
          // before the feed even renders. tickCycle() will confirm/correct.
          document.documentElement.setAttribute("data-nullfeed-enabled", "");
          document.documentElement.setAttribute("data-nullfeed-cycle-phase", "on");
        }
      }
    }
  } catch {
    // localStorage unavailable (private mode with strict settings) — ignore.
  }

  // ── LAYER 2: MutationObserver feed-watcher ──────────────────────────────
  // Facebook's SPA renders feed posts lazily. Even after the initial
  // applyCyclePhase() call hides what's there, new posts can be injected into
  // the DOM by React. This observer catches them the instant they appear and
  // hides them immediately, making the feed unkillable by refresh or navigation.
  const { feedSelectors } = CYCLE_PLATFORMS[cyclePlatform];
  let feedWatcherObserver: MutationObserver | null = null;

  function startFeedWatcher(): void {
    if (feedWatcherObserver) return;
    feedWatcherObserver = new MutationObserver(() => {
      if (currentCyclePhase !== "on") return;
      // Use querySelectorAll for each selector and hide any visible feed elements.
      for (const sel of feedSelectors) {
        document.querySelectorAll(sel).forEach((el) => {
          if (
            !el.hasAttribute("data-nullfeed-hidden") &&
            !el.closest("#nullfeed-quote-card")
          ) {
            hideElement(el, "focus-cycle");
          }
        });
      }
    });
    feedWatcherObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function stopFeedWatcher(): void {
    feedWatcherObserver?.disconnect();
    feedWatcherObserver = null;
  }

  tickCyclePlatform = async function tickCycle(current: Settings): Promise<void> {
    const effective = getEffectiveSettings(current);

    if (!effective.enabled) {
      if (currentCyclePhase !== null) {
        applyCyclePhase(cyclePlatform!, "off");
        currentCyclePhase = null;
        currentAnchor = null;
        document.documentElement.removeAttribute("data-nullfeed-cycle-phase");
        stopFeedWatcher();
      }
      syncPinnedQuote();
      // ── Persist: enabled=false so next load won't pre-block incorrectly
      try {
        localStorage.setItem(LS_ENABLED_KEY, "false");
        localStorage.removeItem(LS_ANCHOR_KEY);
      } catch { /* ignore */ }
      return;
    }
    const anchor = await getOrCreateAnchor(cyclePlatform!);
    const phase = getPhase(anchor);
    currentAnchor = anchor;
    document.documentElement.setAttribute("data-nullfeed-cycle-phase", phase);
    applyCyclePhase(cyclePlatform!, phase, "cycle", effective.showQuotes);
    if (phase !== "off") {
      // Nothing to scroll while blocked — start the next "off" window clean.
      detectorState = createDetectorState();
      startFeedWatcher(); // Activate the DOM watcher during blocking phase
    } else {
      stopFeedWatcher(); // Not needed during free-browsing phase
    }
    currentCyclePhase = phase;
    syncPinnedQuote();
    // ── LAYER 3: Persist anchor to localStorage ─────────────────────
    // On next page load, Layer 1 reads this to compute phase synchronously.
    try {
      localStorage.setItem(LS_ANCHOR_KEY, String(anchor));
      localStorage.setItem(LS_ENABLED_KEY, "true");
    } catch { /* ignore */ }
  };

  if (settings) void tickCyclePlatform(settings);

  const cycleInterval = setInterval(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.id) {
      clearInterval(cycleInterval);
      return;
    }
    if (settings && tickCyclePlatform) {
      void tickCyclePlatform(settings).catch(() => {});
    }
  }, 3000);

  // For platforms without an adapter (e.g. LinkedIn, Twitter, Reddit),
  // observe dynamic DOM mutations to ensure the feed remains hidden in "on" phase.
  if (!adapter) {
    observeDynamicContent(() => {
      void getSettings().then((s) => {
        settings = s;
        if (s.enabled && currentCyclePhase === "on") {
          applyCyclePhase(cyclePlatform!, "on", "cycle", s.showQuotes);
        }
        syncPinnedQuote();
      });
    });
  }

  // --- Scroll Detector: end an "off" (free-browsing) window early when the
  // scroll pace looks compulsive, instead of waiting for the fixed timer.
  // Reads scroll position only — never page content — and only runs while
  // the feed is actually visible.
  let scrollRafScheduled = false;
  let triggering = false;

  function handleScrollSample(): void {
    scrollRafScheduled = false;

    // currentCyclePhase is null whenever protection is off (see tickCycle
    // above), so this one check also covers the "extension disabled" case.
    if (
      currentCyclePhase !== "off" ||
      currentAnchor === null ||
      triggering
    ) {
      return;
    }

    const now = Date.now();
    detectorState = recordScrollSample(
      detectorState,
      { t: now, y: window.scrollY },
      window.innerHeight
    );

    if (
      isDoomscrolling(detectorState, now) &&
      canTriggerEarlyBlock(currentAnchor, now, CYCLE_BREAK_MS, CYCLE_TOTAL_MS)
    ) {
      triggering = true;
      void triggerEarlyBlock(cyclePlatform!, now)
        .then(() => {
          currentAnchor = now - CYCLE_BREAK_MS;
          currentCyclePhase = "on";
          detectorState = createDetectorState();
          document.documentElement.setAttribute("data-nullfeed-cycle-phase", "on");
          const showQuotes = settings ? getEffectiveSettings(settings).showQuotes : true;
          applyCyclePhase(cyclePlatform!, "on", "smart", showQuotes);
          syncPinnedQuote();
        })
        .catch((error) => logFailure("Nullfeed smart trigger failed.", error))
        .finally(() => {
          triggering = false;
        });
    }
  }

  window.addEventListener(
    "scroll",
    () => {
      if (!scrollRafScheduled) {
        scrollRafScheduled = true;
        requestAnimationFrame(handleScrollSample);
      }
    },
    { passive: true }
  );
}
