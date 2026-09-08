export const SNOOZE_STORAGE_KEY = "nullfeed-snooze-until" as const;

export async function getSnoozeUntil(): Promise<number | null> {
  try {
    const result = await chrome.storage.local.get(SNOOZE_STORAGE_KEY);
    const val = result[SNOOZE_STORAGE_KEY];
    return typeof val === "number" && Number.isFinite(val) ? val : null;
  } catch {
    return null;
  }
}

export function isSnoozeActive(until: number | null, now = Date.now()): boolean {
  return Boolean(until && until > now);
}

export async function isSnoozed(now = Date.now()): Promise<boolean> {
  const until = await getSnoozeUntil();
  return isSnoozeActive(until, now);
}

export function getRemainingMs(until: number | null, now = Date.now()): number {
  if (!until || until <= now) {
    return 0;
  }
  return until - now;
}

export async function getSnoozeRemainingMs(now = Date.now()): Promise<number> {
  const until = await getSnoozeUntil();
  return getRemainingMs(until, now);
}

export async function setSnooze(durationMinutes: number, now = Date.now()): Promise<number> {
  const until = now + durationMinutes * 60_000;
  await chrome.storage.local.set({ [SNOOZE_STORAGE_KEY]: until });
  return until;
}

export async function cancelSnooze(): Promise<void> {
  await chrome.storage.local.remove(SNOOZE_STORAGE_KEY);
}

export function formatSnoozeRemaining(until: number | null, now = Date.now()): string {
  if (!until || until <= now) {
    return "0s";
  }
  const remainingMs = until - now;
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

