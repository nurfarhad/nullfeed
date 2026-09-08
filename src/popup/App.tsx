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
import { StatsCard } from "./components/StatsCard";
import { Switch } from "./components/Switch";
import {
  DEFAULT_STATS,
  getStats,
  STATS_STORAGE_KEY,
  type FocusStats
} from "../shared/statsStorage";
import {
  cancelSnooze,
  formatSnoozeRemaining,
  getSnoozeUntil,
  setSnooze,
  SNOOZE_STORAGE_KEY
} from "../shared/snoozeStorage";

const SKELETON_MINIMUM_MS = 150;

type Status = {
  label: string;
  tone: "active" | "neutral" | "warning";
};

function getStatus(settings: Settings, snoozeUntil: number | null, now: number): Status {
  if (snoozeUntil && snoozeUntil > now) {
    return {
      label: "Snoozed",
      tone: "warning"
    };
  }

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
  const [stats, setStats] = useState<FocusStats>(DEFAULT_STATS);
  const [snoozeUntil, setSnoozeUntil] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [error, setError] = useState<string | null>(null);

  const isSnoozed = Boolean(snoozeUntil && snoozeUntil > now);

  const status = useMemo(
    () => getStatus(settings ?? DEFAULT_SETTINGS, snoozeUntil, now),
    [settings, snoozeUntil, now]
  );

  useEffect(() => {
    if (!isSnoozed) {
      return;
    }

    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (snoozeUntil && current >= snoozeUntil) {
        setSnoozeUntil(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isSnoozed, snoozeUntil]);

  useEffect(() => {
    const started = performance.now();

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (
        areaName === "sync" &&
        changes[SETTINGS_STORAGE_KEY]?.newValue !== undefined
      ) {
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
      }

      if (areaName === "local") {
        if (changes[STATS_STORAGE_KEY]?.newValue !== undefined) {
          setStats(changes[STATS_STORAGE_KEY].newValue as FocusStats);
        }
        if (changes[SNOOZE_STORAGE_KEY] !== undefined) {
          setSnoozeUntil(
            (changes[SNOOZE_STORAGE_KEY].newValue as number | null) ?? null
          );
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    void getStats()
      .then(setStats)
      .catch(() => {});

    void getSnoozeUntil()
      .then(setSnoozeUntil)
      .catch(() => {});

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
        <div class="skeleton-stats skeleton-card" />
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

  async function handleSnooze(minutes: number) {
    try {
      const until = await setSnooze(minutes);
      setSnoozeUntil(until);
      setNow(Date.now());
    } catch (snoozeError) {
      if (DEVELOPMENT) {
        console.error("Nullfeed popup could not set snooze.", snoozeError);
      }
    }
  }

  async function handleResume() {
    try {
      await cancelSnooze();
      setSnoozeUntil(null);
    } catch (resumeError) {
      if (DEVELOPMENT) {
        console.error("Nullfeed popup could not cancel snooze.", resumeError);
      }
    }
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
        {settings.enabled ? (
          isSnoozed ? (
            <div class="snooze-banner">
              <span class="snooze-banner-text">
                Paused for <strong>{formatSnoozeRemaining(snoozeUntil, now)}</strong>
              </span>
              <button
                type="button"
                class="snooze-resume-btn"
                onClick={() => void handleResume()}
              >
                Resume
              </button>
            </div>
          ) : (
            <div class="snooze-quick-actions">
              <span class="snooze-label">Pause:</span>
              <button
                type="button"
                class="snooze-pill"
                onClick={() => void handleSnooze(5)}
                aria-label="Pause protection for 5 minutes"
              >
                5m
              </button>
              <button
                type="button"
                class="snooze-pill"
                onClick={() => void handleSnooze(15)}
                aria-label="Pause protection for 15 minutes"
              >
                15m
              </button>
            </div>
          )
        ) : null}
      </section>

      <StatsCard stats={stats} />

      <PlatformTabs active={platform} onChange={changePlatform} />

      <div
        class={
          !currentSettings.enabled || isSnoozed
            ? "preferences preferences-paused"
            : "preferences"
        }
      >
        <SettingsPanel
          disabled={!currentSettings.enabled || isSnoozed}
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
