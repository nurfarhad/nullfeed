import { useEffect, useMemo, useState } from "preact/hooks";

import { DEVELOPMENT, FACEBOOK_URL, LINKEDIN_URL, OWN_PAGE_URL } from "../shared/constants";
import {
  DEFAULT_SETTINGS,
  hasActiveFilters,
  type Platform,
  type PlatformSettingKey,
  type Settings
} from "../shared/settings";
import {
  getSettings,
  isStorageQuotaError,
  SETTINGS_STORAGE_KEY,
  setEnabled,
  setLastPlatform,
  setPlatformPreference
} from "../shared/storage";
import { NullMark } from "./components/NullMark";
import { PlatformTabs } from "./components/PlatformTabs";
import { SettingsPanel } from "./components/SettingsPanel";
import { Switch } from "./components/Switch";

const SKELETON_MINIMUM_MS = 150;

type Status = {
  label: string;
  tone: "active" | "neutral";
};

function getStatus(settings: Settings): Status {
  if (!settings.enabled) {
    return {
      label: "Paused",
      tone: "neutral"
    };
  }

  if (!hasActiveFilters(settings)) {
    return {
      label: "No filters selected",
      tone: "neutral"
    };
  }

  return {
    label: "Protected",
    tone: "active"
  };
}

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = useMemo(
    () => getStatus(settings ?? DEFAULT_SETTINGS),
    [settings]
  );

  useEffect(() => {
    const started = performance.now();

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (
        areaName !== "sync" ||
        changes[SETTINGS_STORAGE_KEY]?.newValue === undefined
      ) {
        return;
      }

      void getSettings()
        .then((loaded) => {
          setSettings(loaded);
          setError(null);
        })
        .catch((storageError) => {
          if (DEVELOPMENT) {
            console.error(
              "Nullfeed popup could not apply external settings.",
              storageError
            );
          }
        });
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    void getSettings()
      .then((loaded) => {
        const elapsed = performance.now() - started;
        const remaining = Math.max(0, SKELETON_MINIMUM_MS - elapsed);
        window.setTimeout(() => {
          setSettings(loaded);
          setError(null);
        }, remaining);
      })
      .catch((storageError) => {
        if (DEVELOPMENT) {
          console.error("Nullfeed popup could not read settings.", storageError);
        }
        setError("Settings could not be loaded. Please reopen the popup.");
      });

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  if (!settings) {
    return (
      <main class="popup-shell popup-skeleton" aria-busy="true">
        <header class="header">
          <div class="brand">
            <NullMark />
            <h1>Nullfeed</h1>
          </div>
          <span class="status status-neutral">Loading...</span>
        </header>

        <section class="protection skeleton-card" />
        <div class="skeleton-tabs" />
        <div class="preferences skeleton-card" />
      </main>
    );
  }

  const currentSettings = settings;

  async function commit(
    optimistic: Settings,
    operation: () => Promise<Settings>
  ): Promise<void> {
    const previous = currentSettings;
    setSettings(optimistic);
    setError(null);

    try {
      const saved = await operation();
      setSettings(saved);
    } catch (saveError) {
      setSettings(previous);
      if (isStorageQuotaError(saveError)) {
        setError(
          "Settings could not be saved because storage sync quota was exceeded. Changes were reverted."
        );
      } else {
        setError(
          "Settings could not be saved to your browser profile. Changes were reverted."
        );
      }
    }
  }

  function changeEnabled(enabled: boolean) {
    void commit({ ...currentSettings, enabled }, () =>
      setEnabled(currentSettings, enabled)
    );
  }

  function changePlatform(platform: Platform) {
    if (platform === currentSettings.lastPlatform) {
      return;
    }

    void commit({ ...currentSettings, lastPlatform: platform }, () =>
      setLastPlatform(currentSettings, platform)
    );
  }

  function changePreference<P extends Platform>(
    platform: P,
    key: PlatformSettingKey<P>,
    value: boolean
  ) {
    const optimistic = {
      ...currentSettings,
      [platform]: { ...currentSettings[platform], [key]: value }
    } as Settings;

    void commit(optimistic, () =>
      setPlatformPreference(currentSettings, platform, key, value)
    );
  }

  const platform = currentSettings.lastPlatform;

  return (
    <main class="popup-shell">
      <header class="header">
        <div class="brand">
          <NullMark />
          <h1>Nullfeed</h1>
        </div>
        <span class={`status status-${status.tone}`}>{status.label}</span>
      </header>

      <section class="protection" aria-labelledby="protection-heading">
        <Switch
          checked={settings.enabled}
          id="master-protection"
          onChange={changeEnabled}
        >
          <strong id="protection-heading">Protection</strong>
        </Switch>
      </section>

      <PlatformTabs active={platform} onChange={changePlatform} />

      <div
        class={
          !currentSettings.enabled
            ? "preferences preferences-paused"
            : "preferences"
        }
      >
        <SettingsPanel
          disabled={!currentSettings.enabled}
          onChange={(key, value) => changePreference(platform, key, value)}
          platform={platform}
          settings={currentSettings[platform]}
        />
      </div>

      {error ? (
        <div class="error-banner" role="alert">
          {error}
        </div>
      ) : null}

      <footer>
        <a
          class="footer-author"
          href={OWN_PAGE_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          Made by Nur Farhad
        </a>
        <span class="footer-separator" aria-hidden="true">
          ·
        </span>
        <a
          href={FACEBOOK_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          Facebook
        </a>
        <span class="footer-separator" aria-hidden="true">
          ·
        </span>
        <a
          href={LINKEDIN_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          LinkedIn <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </main>
  );
}
