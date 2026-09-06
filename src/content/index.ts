import type { Settings } from "../shared/settings";
import { getSettings, SETTINGS_STORAGE_KEY } from "../shared/storage";
import { getOrCreateAnchor } from "../shared/focusCycleStorage";
import type { SiteAdapter } from "./adapter";
import { facebookAdapter } from "./adapters/facebook";
import { instagramAdapter } from "./adapters/instagram";
import { youtubeAdapter } from "./adapters/youtube";
import { applyCyclePhase, detectCyclePlatform, getPhase } from "./focusCycle";
import { observeDynamicContent } from "./observer";
import { watchRoutes } from "./routeWatcher";

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
  async function tickCycle(settingsEnabled: boolean): Promise<void> {
    if (!settingsEnabled) {
      if (currentCyclePhase !== null) {
        applyCyclePhase(cyclePlatform!, "off");
        currentCyclePhase = null;
        document.documentElement.removeAttribute("data-nullfeed-cycle-phase");
      }
      return;
    }
    const anchor = await getOrCreateAnchor(cyclePlatform!);
    const phase = getPhase(anchor);
    document.documentElement.setAttribute("data-nullfeed-cycle-phase", phase);
    applyCyclePhase(cyclePlatform!, phase);
    currentCyclePhase = phase;
  }

  void getSettings().then((s) => tickCycle(s.enabled));

  setInterval(() => {
    void getSettings().then((s) => tickCycle(s.enabled));
  }, 3000);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
      areaName === "sync" &&
      changes[SETTINGS_STORAGE_KEY]?.newValue !== undefined
    ) {
      void getSettings().then((s) => tickCycle(s.enabled));
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
}
