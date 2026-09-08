import type { Settings } from "../shared/settings";
import { getSettings, SETTINGS_STORAGE_KEY } from "../shared/storage";
import { getOrCreateAnchor } from "../shared/focusCycleStorage";
import { recordDistractions } from "../shared/statsStorage";
import { getSnoozeUntil, SNOOZE_STORAGE_KEY } from "../shared/snoozeStorage";
import type { SiteAdapter } from "./adapter";
import { facebookAdapter } from "./adapters/facebook";
import { instagramAdapter } from "./adapters/instagram";
import { youtubeAdapter } from "./adapters/youtube";
import {
  applyCyclePhase,
  CYCLE_BREAK_MS,
  CYCLE_TOTAL_MS,
  detectCyclePlatform,
  getPhase,
  triggerEarlyBlock
} from "./focusCycle";
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
let settings: Settings | null = null;
let currentCyclePhase: "on" | "off" | null = null;

function selectAdapter(hostname: string): SiteAdapter | null {
  if (/(?:^|\.)youtube\.com$/i.test(hostname)) return youtubeAdapter;
  if (/(?:^|\.)facebook\.com$/i.test(hostname)) return facebookAdapter;
  if (/(?:^|\.)instagram\.com$/i.test(hostname)) return instagramAdapter;
  return null;
}

function logFailure(message: string, error: unknown): void {
  // Always log — errors surface in chrome://extensions > Errors panel.
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
  }

  void Promise.all([getSettings(), getSnoozeUntil()])
    .then(([loaded, loadedSnooze]) => {
      snoozeUntil = loadedSnooze;
      scheduleSnoozeExpiration(() => {
        void getSettings().then((s) => {
          apply(s);
        });
      });
      apply(loaded);
      stopObserver = observeDynamicContent((root) => {
        const effective = settings ? getEffectiveSettings(settings) : null;
        if (effective?.enabled && !handleRoute(effective)) {
          scan(root);
        }
        if (cyclePlatform && effective?.enabled && currentCyclePhase === "on") {
          applyCyclePhase(cyclePlatform, "on");
        }
      });
      stopRouteWatcher = watchRoutes(() => {
        const effective = settings ? getEffectiveSettings(settings) : null;
        if (effective?.enabled && !handleRoute(effective)) {
          scan(document);
        }
      });
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
        .then(apply)
        .catch((error) =>
          logFailure("Nullfeed could not apply changed settings.", error)
        );
    }

    if (
      areaName === "local" &&
      changes[SNOOZE_STORAGE_KEY] !== undefined
    ) {
      snoozeUntil = typeof changes[SNOOZE_STORAGE_KEY].newValue === "number"
        ? changes[SNOOZE_STORAGE_KEY].newValue
        : null;
      scheduleSnoozeExpiration(() => {
        void getSettings().then((s) => {
          apply(s);
        });
      });
      void getSettings().then((s) => {
        apply(s);
      });
    }
  });

  // Expose teardown for diagnostics (accessible from the page-world via
  // chrome.scripting in dev mode, no-op in production).
  if (typeof window !== "undefined") {
    Reflect.set(window, "__nullfeedTeardown", teardown);
  }
}

if (cyclePlatform) {
  // Last-known anchor, refreshed on every tick. Smart Trigger itself has no
  // on/off setting — it runs whenever a feed is visible ("off" phase) and
  // Protection is on. See tickCycle below for why this can't reuse the
  // module-level `settings` variable above (that one is adapter-only).
  let currentAnchor: number | null = null;
  let detectorState: DetectorState = createDetectorState();

  async function tickCycle(current: Settings): Promise<void> {
    const effective = getEffectiveSettings(current);

    if (!effective.enabled) {
      if (currentCyclePhase !== null) {
        applyCyclePhase(cyclePlatform!, "off");
        currentCyclePhase = null;
        currentAnchor = null;
        document.documentElement.removeAttribute("data-nullfeed-cycle-phase");
      }
      return;
    }
    const anchor = await getOrCreateAnchor(cyclePlatform!);
    const phase = getPhase(anchor);
    currentAnchor = anchor;
    document.documentElement.setAttribute("data-nullfeed-cycle-phase", phase);
    applyCyclePhase(cyclePlatform!, phase);
    if (phase !== "off") {
      // Nothing to scroll while blocked — start the next "off" window clean.
      detectorState = createDetectorState();
    }
    currentCyclePhase = phase;
  }

  void getSettings().then(tickCycle);

  setInterval(() => {
    void getSettings().then(tickCycle);
  }, 3000);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
      areaName === "sync" &&
      changes[SETTINGS_STORAGE_KEY]?.newValue !== undefined
    ) {
      void getSettings().then(tickCycle);
    }

    if (
      areaName === "local" &&
      changes[SNOOZE_STORAGE_KEY] !== undefined
    ) {
      void getSettings().then(tickCycle);
    }
  });

  // For platforms without an adapter (e.g. LinkedIn, Twitter, Reddit),
  // observe dynamic DOM mutations to ensure the feed remains hidden in "on" phase.
  if (!adapter) {
    observeDynamicContent(() => {
      void getSettings().then((s) => {
        if (s.enabled && currentCyclePhase === "on") {
          applyCyclePhase(cyclePlatform!, "on");
        }
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
          applyCyclePhase(cyclePlatform!, "on", "smart");
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
