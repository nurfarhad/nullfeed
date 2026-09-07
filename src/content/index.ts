import type { Settings } from "../shared/settings";
import { getSettings, SETTINGS_STORAGE_KEY } from "../shared/storage";
import { getOrCreateAnchor } from "../shared/focusCycleStorage";
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

function updateRootState(current: Settings): void {
  const root = document.documentElement;
  const platformSettings = adapter
    ? current[adapter.platform]
    : undefined;

  root.toggleAttribute("data-nullfeed-enabled", current.enabled);
  root.setAttribute(
    "data-nullfeed-platform",
    adapter?.platform ?? "unsupported"
  );

  for (const attribute of [...root.attributes]) {
    if (attribute.name.startsWith("data-nullfeed-filter-")) {
      root.removeAttribute(attribute.name);
    }
  }

  if (current.enabled && platformSettings) {
    for (const [key, enabled] of Object.entries(platformSettings)) {
      root.toggleAttribute(`data-nullfeed-filter-${key}`, enabled);
    }
  }
}

function handleRoute(current: Settings): boolean {
  if (!adapter?.blockedRoute(location.pathname, current)) {
    return false;
  }

  location.replace(adapter.homeUrl);
  return true;
}

function scan(root: ParentNode): void {
  if (!adapter || !settings) {
    return;
  }

  try {
    adapter.scan(root, settings);
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
    if (!handleRoute(nextSettings)) {
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

  void getSettings()
    .then((loaded) => {
      apply(loaded);
      stopObserver = observeDynamicContent((root) => {
        if (settings && !handleRoute(settings)) {
          scan(root);
        }
        if (cyclePlatform && settings?.enabled && currentCyclePhase === "on") {
          applyCyclePhase(cyclePlatform, "on");
        }
      });
      stopRouteWatcher = watchRoutes(() => {
        if (settings && !handleRoute(settings)) {
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
  });

  // Expose teardown for diagnostics (accessible from the page-world via
  // chrome.scripting in dev mode, no-op in production).
  if (typeof window !== "undefined") {
    Reflect.set(window, "__nullfeedTeardown", teardown);
  }
}

if (cyclePlatform) {
  // Last-known anchor + smartTrigger preference, refreshed on every tick.
  // Deliberately NOT reusing the module-level `settings` variable above —
  // that one is only populated inside apply(), which returns early when
  // there's no adapter. LinkedIn, X, and Reddit have no adapter, so this
  // block needs its own settings tracking or it silently never fires there.
  let currentAnchor: number | null = null;
  let smartTriggerEnabled = false;
  let detectorState: DetectorState = createDetectorState();

  async function tickCycle(current: Settings): Promise<void> {
    smartTriggerEnabled = current.smartTrigger;

    if (!current.enabled) {
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
      triggering ||
      !smartTriggerEnabled
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
