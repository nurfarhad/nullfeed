import { DEVELOPMENT } from "../shared/constants";
import type { Settings } from "../shared/settings";
import { getSettings, SETTINGS_STORAGE_KEY } from "../shared/storage";
import type { SiteAdapter } from "./adapter";
import { facebookAdapter } from "./adapters/facebook";
import { instagramAdapter } from "./adapters/instagram";
import { youtubeAdapter } from "./adapters/youtube";
import { observeDynamicContent } from "./observer";
import { watchRoutes } from "./routeWatcher";

const adapter = selectAdapter(location.hostname);
let settings: Settings | null = null;

function selectAdapter(hostname: string): SiteAdapter | null {
  if (hostname === "www.youtube.com") return youtubeAdapter;
  if (hostname === "www.facebook.com") return facebookAdapter;
  if (hostname === "www.instagram.com") return instagramAdapter;
  return null;
}

function logFailure(message: string, error: unknown): void {
  if (DEVELOPMENT) {
    console.error(message, error);
  }
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
  void getSettings()
    .then((loaded) => {
      apply(loaded);
      observeDynamicContent((root) => {
        if (settings && !handleRoute(settings)) {
          scan(root);
        }
      });
      watchRoutes(() => {
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
}
