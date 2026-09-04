import { useEffect, useMemo, useState } from "preact/hooks";

import { DEVELOPMENT, FACEBOOK_URL, LINKEDIN_URL } from "../shared/constants";
import {
  DEFAULT_SETTINGS,
  hasActiveFilters,
  type Platform,
  type PlatformSettingKey,
  type Settings
} from "../shared/settings";
import {
  endSnooze,
  getSettings,
  isStorageQuotaError,
  SETTINGS_STORAGE_KEY,
  setEnabled,
  setLastPlatform,
  setPlatformPreference,
  startSnooze
} from "../shared/storage";
import { NullMark } from "./components/NullMark";
import { PlatformTabs } from "./components/PlatformTabs";
import { SettingsPanel } from "./components/SettingsPanel";
import { Switch } from "./components/Switch";

const SKELETON_MINIMUM_MS = 150;

const SNOOZE_DURATIONS = [
  { label: "5m", ms: 5 * 60_000 },
  { label: "15m", ms: 15 * 60_000 },
  { label: "30m", ms: 30 * 60_000 },
  { label: "1h", ms: 60 * 60_000 }
] as const;

function formatCountdown(until: number): string {
  const remaining = Math.max(0, until - Date.now());
  const totalSeconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

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
  const [countdown, setCountdown] = useState("");
  const status = useMemo(
    () => getStatus(settings ?? DEFAULT_SETTINGS),
    [settings]
  );

  const isSnoozing =
    settings !== null &&
    settings.snooze.active &&
    settings.snooze.until !== null &&
    settings.snooze.until > Date.now();

  useEffect(() => {
    if (!isSnoozing || settings?.snooze.until === null || settings?.snooze.until === undefined) {
      setCountdown("");
      return;
    }

    const until = settings.snooze.until;
    setCountdown(formatCountdown(until));

    const interval = setInterval(() => {
      if (Date.now() >= until) {
        setCountdown("0:00");
        clearInterval(interval);
      } else {
        setCountdown(formatCountdown(until));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isSnoozing, settings?.snooze.until]);

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

  function handleStartSnooze(durationMs: number) {
    const optimistic = {
      ...currentSettings,
      snooze: {
        active: true,
        until: Date.now() + durationMs,
        sites: {
          facebook: true,
          instagram: true,
          youtube: true
        }
      }
    };
    void commit(optimistic, () => startSnooze(currentSettings, durationMs));
  }

  function handleEndSnooze() {
    const optimistic = {
      ...currentSettings,
      snooze: {
        ...currentSettings.snooze,
        active: false,
        until: null
      }
    };
    void commit(optimistic, () => endSnooze(currentSettings));
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

      <section
        class={isSnoozing ? "snooze-card snooze-card-active" : "snooze-card"}
        aria-label="Snooze controls"
      >
        {isSnoozing ? (
          <div class="snooze-active-row">
            <div class="snooze-active-info">
              <span class="snooze-pulse-dot" aria-hidden="true" />
              <span class="snooze-active-text">
                Snoozing · <strong class="snooze-countdown">{countdown}</strong>
              </span>
            </div>
            <button
              class="snooze-resume-btn"
              id="snooze-resume"
              onClick={handleEndSnooze}
              type="button"
            >
              Resume now
            </button>
          </div>
        ) : (
          <div class="snooze-inactive-row">
            <span class="snooze-title" id="snooze-heading">Snooze</span>
            <div class="snooze-durations" role="group" aria-labelledby="snooze-heading">
              {SNOOZE_DURATIONS.map(({ label, ms }) => (
                <button
                  class="snooze-pill"
                  disabled={!currentSettings.enabled}
                  id={`snooze-${label}`}
                  key={label}
                  onClick={() => handleStartSnooze(ms)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
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
        <span class="footer-author">Made by Nur Farhad</span>
        <span class="footer-separator" aria-hidden="true">·</span>
        <a href={FACEBOOK_URL} rel="noreferrer" target="_blank">
          Facebook
        </a>
        <span class="footer-separator" aria-hidden="true">·</span>
        <a href={LINKEDIN_URL} rel="noreferrer" target="_blank">
          LinkedIn <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </main>
  );
}

