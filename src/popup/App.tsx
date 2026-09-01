import { useEffect, useMemo, useState } from "preact/hooks";

import { DEVELOPMENT, LINKEDIN_URL } from "../shared/constants";
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
  sentence: string;
  tone: "active" | "neutral";
};

function getStatus(settings: Settings): Status {
  if (!settings.enabled) {
    return {
      label: "Paused",
      sentence: "Filtering is paused on supported sites",
      tone: "neutral"
    };
  }

  if (!hasActiveFilters(settings)) {
    return {
      label: "No filters selected",
      sentence: "Choose content to hide.",
      tone: "neutral"
    };
  }

  return {
    label: "Protected",
    sentence: "Filtering is active on supported sites",
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
      .then(async (loaded) => {
        const remaining = SKELETON_MINIMUM_MS - (performance.now() - started);
        if (remaining > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, remaining));
        }
        setSettings(loaded);
      })
      .catch(() => {
        setSettings(DEFAULT_SETTINGS);
        setError("Could not load settings. Try again.");
      });

    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  if (settings === null) {
    return (
      <main aria-busy="true" aria-label="Loading Nullfeed" class="popup-shell">
        <div class="skeleton skeleton-header" />
        <div class="skeleton skeleton-protection" />
        <div class="skeleton skeleton-tabs" />
        <div class="skeleton skeleton-list" />
      </main>
    );
  }

  const currentSettings = settings;

  async function commit(
    optimistic: Settings,
    operation: () => Promise<Settings>
  ) {
    const previous = currentSettings;
    setError(null);
    setSettings(optimistic);

    try {
      setSettings(await operation());
    } catch (saveError) {
      setSettings(previous);
      setError(
        isStorageQuotaError(saveError)
          ? "Saving too quickly. Wait a moment and try again."
          : "Could not save. Try again."
      );
      if (DEVELOPMENT) {
        console.error("Nullfeed popup could not save settings.", saveError);
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

  const rawPlatform = currentSettings.lastPlatform;
  const platform: "facebook" | "instagram" | "youtube" =
    rawPlatform === "linkedin" || rawPlatform === "twitter"
      ? "facebook"
      : rawPlatform;

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
        <p>{status.sentence}</p>
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

      {error && (
        <p aria-live="polite" class="inline-error" role="status">
          {error}
        </p>
      )}

      <footer>
        <span>Made by Nur Farhad</span>
        <a href={LINKEDIN_URL} rel="noreferrer" target="_blank">
          LinkedIn <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </main>
  );
}

