import { DEVELOPMENT } from "../shared/constants";
import { validateSettings } from "../shared/settings";
import {
  endSnooze,
  ensureSettings,
  getSettings,
  SETTINGS_STORAGE_KEY
} from "../shared/storage";

const SNOOZE_ALARM_NAME = "nullfeed-snooze-end";

async function initialize(): Promise<void> {
  try {
    await ensureSettings();
  } catch (error) {
    if (DEVELOPMENT) {
      console.error("Nullfeed could not initialize settings.", error);
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void initialize();
});

chrome.runtime.onStartup.addListener(() => {
  void initialize();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !changes[SETTINGS_STORAGE_KEY]?.newValue) {
    return;
  }

  const settings = validateSettings(changes[SETTINGS_STORAGE_KEY].newValue);
  const until = settings.snooze.until;

  if (
    settings.snooze.active &&
    until !== null &&
    until > Date.now()
  ) {
    void chrome.alarms.create(SNOOZE_ALARM_NAME, { when: until });
  } else {
    void chrome.alarms.clear(SNOOZE_ALARM_NAME);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== SNOOZE_ALARM_NAME) {
    return;
  }

  void getSettings()
    .then((settings) => {
      if (settings.snooze.active) {
        return endSnooze(settings);
      }
    })
    .catch((error) => {
      if (DEVELOPMENT) {
        console.error("Nullfeed could not clear expired snooze.", error);
      }
    });
});

void initialize();

