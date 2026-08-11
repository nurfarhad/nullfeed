import { DEVELOPMENT } from "../shared/constants";
import { ensureSettings } from "../shared/storage";

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

void initialize();
