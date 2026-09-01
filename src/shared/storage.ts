import { migrateSettings } from "./migrations";
import {
  DEFAULT_SETTINGS,
  type Platform,
  type PlatformSettingKey,
  type Settings
} from "./settings";

export const SETTINGS_STORAGE_KEY = "settings" as const;
export const SAVE_DEBOUNCE_MS = 150;

type StorageRecord = {
  [SETTINGS_STORAGE_KEY]?: unknown;
};

function serialize(settings: Settings): StorageRecord {
  return { [SETTINGS_STORAGE_KEY]: migrateSettings(settings) };
}

type SaveWaiter = {
  resolve: (settings: Settings) => void;
  reject: (error: unknown) => void;
};

let queuedSettings: Settings | null = null;
let queuedWaiters: SaveWaiter[] = [];
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function flushQueuedSave(): Promise<void> {
  saveTimer = null;
  const settings = queuedSettings;
  const waiters = queuedWaiters;
  queuedSettings = null;
  queuedWaiters = [];

  if (!settings) {
    return;
  }

  try {
    await chrome.storage.sync.set(serialize(settings));
    waiters.forEach(({ resolve }) => resolve(settings));
  } catch (error) {
    waiters.forEach(({ reject }) => reject(error));
  }
}

export function isStorageQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /quota|max_write|write operations|rate/i.test(message);
}

export async function getSettings(): Promise<Settings> {
  const stored = (await chrome.storage.sync.get(
    SETTINGS_STORAGE_KEY
  )) as StorageRecord;
  return migrateSettings(stored[SETTINGS_STORAGE_KEY]);
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const validated = migrateSettings(settings);
  queuedSettings = validated;

  if (saveTimer !== null) {
    clearTimeout(saveTimer);
  }

  const result = new Promise<Settings>((resolve, reject) => {
    queuedWaiters.push({ resolve, reject });
  });

  saveTimer = setTimeout(() => {
    void flushQueuedSave();
  }, SAVE_DEBOUNCE_MS);

  return result;
}

export async function ensureSettings(): Promise<Settings> {
  const stored = (await chrome.storage.sync.get(
    SETTINGS_STORAGE_KEY
  )) as StorageRecord;
  const settings = migrateSettings(
    stored[SETTINGS_STORAGE_KEY] ?? DEFAULT_SETTINGS
  );
  await chrome.storage.sync.set(serialize(settings));
  return settings;
}

export async function setEnabled(
  settings: Settings,
  enabled: boolean
): Promise<Settings> {
  return saveSettings({ ...settings, enabled });
}

export async function setShowQuotes(
  settings: Settings,
  showQuotes: boolean
): Promise<Settings> {
  return saveSettings({ ...settings, showQuotes });
}

export async function setLastPlatform(
  settings: Settings,
  lastPlatform: Platform
): Promise<Settings> {
  return saveSettings({ ...settings, lastPlatform });
}

export async function setPlatformPreference<P extends Platform>(
  settings: Settings,
  platform: P,
  key: PlatformSettingKey<P>,
  value: boolean
): Promise<Settings> {
  return saveSettings({
    ...settings,
    [platform]: {
      ...settings[platform],
      [key]: value
    }
  });
}

export const DEFAULT_SNOOZE_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function startSnooze(
  settings: Settings,
  durationMs: number = DEFAULT_SNOOZE_DURATION_MS
): Promise<Settings> {
  return saveSettings({
    ...settings,
    snooze: {
      active: true,
      until: Date.now() + durationMs,
      sites: {
        facebook: true,
        instagram: true,
        youtube: true,
        linkedin: true,
        twitter: true
      }
    }
  });
}

export async function endSnooze(
  settings: Settings
): Promise<Settings> {
  return saveSettings({
    ...settings,
    snooze: {
      ...settings.snooze,
      active: false,
      until: null
    }
  });
}

export async function setSnoozeSite(
  settings: Settings,
  platform: Platform,
  value: boolean
): Promise<Settings> {
  return saveSettings({
    ...settings,
    snooze: {
      ...settings.snooze,
      sites: {
        ...settings.snooze.sites,
        [platform]: value
      }
    }
  });
}
