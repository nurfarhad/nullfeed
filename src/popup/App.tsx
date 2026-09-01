import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { DEVELOPMENT, LINKEDIN_URL, PLATFORM_LABELS } from "../shared/constants";
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
  setShowQuotes,
  setSnoozeSite,
  startSnooze
} from "../shared/storage";
import { NullMark } from "./components/NullMark";
import { PlatformTabs } from "./components/PlatformTabs";
import { SettingsPanel } from "./components/SettingsPanel";
import { Switch } from "./components/Switch";

const SKELETON_MINIMUM_MS = 150;

const SNOOZE_DURATIONS = [
  { label: "1m", ms: 60_000 },
  { label: "2m", ms: 120_000 },
  { label: "5m", ms: 300_000 },
  { label: "10m", ms: 600_000 },
  { label: "30m", ms: 1_800_000 },
  { label: "1h", ms: 3_600_000 },
  { label: "24h", ms: 86_400_000 }
] as const;

const ALL_PLATFORMS: readonly Platform[] = [
  "facebook",
  "instagram",
  "youtube",
  "linkedin",
  "twitter"
] as const;

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

function formatCountdown(until: number): string {
  const remaining = Math.max(0, until - Date.now());
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState("");
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const status = useMemo(
    () => getStatus(settings ?? DEFAULT_SETTINGS),
    [settings]
  );

  // Snooze countdown timer
  useEffect(() => {
    if (countdownRef.current !== null) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    if (
      settings?.snooze.active &&
      settings.snooze.until !== null &&
      settings.snooze.until > Date.now()
    ) {
      const until = settings.snooze.until;
      setCountdown(formatCountdown(until));
      countdownRef.current = setInterval(() => {
        if (Date.now() >= until) {
          setCountdown("0:00");
          if (countdownRef.current !== null) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
        } else {
          setCountdown(formatCountdown(until));
        }
      }, 1000);
    }

    return () => {
      if (countdownRef.current !== null) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [settings?.snooze.active, settings?.snooze.until]);

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
  const isSnoozing =
    currentSettings.snooze.active &&
    currentSettings.snooze.until !== null &&
    currentSettings.snooze.until > Date.now();

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

  function changeShowQuotes(showQuotes: boolean) {
    void commit({ ...currentSettings, showQuotes }, () =>
      setShowQuotes(currentSettings, showQuotes)
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
        ...currentSettings.snooze,
        active: true,
        until: Date.now() + durationMs
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

  function handleSnoozeSite(platform: Platform, value: boolean) {
    const optimistic = {
      ...currentSettings,
      snooze: {
        ...currentSettings.snooze,
        sites: { ...currentSettings.snooze.sites, [platform]: value }
      }
    };

    void commit(optimistic, () =>
      setSnoozeSite(currentSettings, platform, value)
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
        <p>{status.sentence}</p>

        <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <Switch
            checked={settings.showQuotes}
            id="show-quotes"
            onChange={changeShowQuotes}
          >
            <span>Mindful Quotes</span>
          </Switch>
        </div>
      </section>

      <section class="snooze" aria-labelledby="snooze-heading">
        <strong class="snooze-title" id="snooze-heading">Snooze</strong>
        {isSnoozing ? (
          <div class="snooze-active">
            <p class="snooze-status">
              Snoozing — resume in{" "}
              <span class="snooze-countdown">{countdown}</span>
            </p>
            <button
              class="snooze-resume"
              id="snooze-resume"
              onClick={handleEndSnooze}
              type="button"
            >
              Resume now
            </button>
          </div>
        ) : (
          <>
            <div class="snooze-buttons">
              {SNOOZE_DURATIONS.map(({ label, ms }) => (
                <button
                  class="snooze-duration"
                  id={`snooze-${label}`}
                  key={label}
                  onClick={() => handleStartSnooze(ms)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <div class="snooze-sites">
              {ALL_PLATFORMS.map((p) => (
                <label class="snooze-site-label" key={p}>
                  <input
                    checked={currentSettings.snooze.sites[p]}
                    class="snooze-site-input"
                    id={`snooze-site-${p}`}
                    onChange={(e) =>
                      handleSnoozeSite(p, e.currentTarget.checked)
                    }
                    type="checkbox"
                  />
                  <span>{PLATFORM_LABELS[p]}</span>
                </label>
              ))}
            </div>
          </>
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
        <span>Made by Nur Farhad</span>
        <a href={LINKEDIN_URL} rel="noreferrer" target="_blank">
          LinkedIn <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </main>
  );
}

