export const STATS_STORAGE_KEY = "nullfeed-focus-stats" as const;

export type FocusStats = {
  today: string;
  todayBlocked: number;
  totalBlocked: number;
  streakDays: number;
  lastActiveDate: string;
};

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getPreviousDateKey(date = new Date()): string {
  const prev = new Date(date.getTime() - 86_400_000);
  return getLocalDateKey(prev);
}

export const DEFAULT_STATS: FocusStats = Object.freeze({
  today: getLocalDateKey(),
  todayBlocked: 0,
  totalBlocked: 0,
  streakDays: 1,
  lastActiveDate: getLocalDateKey()
});

export function formatTimeSaved(blockedCount: number): string {
  if (blockedCount <= 0) {
    return "0m";
  }
  const totalMinutes = Math.round(blockedCount * 1.5);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function resolveStatsForDate(stored: Partial<FocusStats> | undefined, todayKey: string): FocusStats {
  if (!stored || !stored.today) {
    return {
      today: todayKey,
      todayBlocked: 0,
      totalBlocked: 0,
      streakDays: 1,
      lastActiveDate: todayKey
    };
  }

  const isToday = stored.today === todayKey;
  if (isToday) {
    return {
      today: todayKey,
      todayBlocked: Math.max(0, stored.todayBlocked ?? 0),
      totalBlocked: Math.max(0, stored.totalBlocked ?? 0),
      streakDays: Math.max(1, stored.streakDays ?? 1),
      lastActiveDate: stored.lastActiveDate ?? todayKey
    };
  }

  // Rollover to new day
  const yesterdayKey = getPreviousDateKey();
  const wasActiveYesterday = stored.lastActiveDate === yesterdayKey || stored.today === yesterdayKey;
  const newStreak = wasActiveYesterday ? Math.max(1, (stored.streakDays ?? 1)) : 1;

  return {
    today: todayKey,
    todayBlocked: 0,
    totalBlocked: Math.max(0, stored.totalBlocked ?? 0),
    streakDays: newStreak,
    lastActiveDate: stored.lastActiveDate ?? yesterdayKey
  };
}

export async function getStats(date = new Date()): Promise<FocusStats> {
  const todayKey = getLocalDateKey(date);
  try {
    const result = await chrome.storage.local.get(STATS_STORAGE_KEY);
    const stored = result[STATS_STORAGE_KEY] as Partial<FocusStats> | undefined;
    const resolved = resolveStatsForDate(stored, todayKey);

    // If rolled over, persist the updated today key so repeated reads don't recalculate
    if (!stored || stored.today !== todayKey) {
      await chrome.storage.local.set({ [STATS_STORAGE_KEY]: resolved });
    }

    return resolved;
  } catch {
    return { ...DEFAULT_STATS, today: todayKey };
  }
}

let buffer = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flushBuffer(): Promise<void> {
  flushTimer = null;
  const count = buffer;
  buffer = 0;
  if (count <= 0) {
    return;
  }

  try {
    const todayKey = getLocalDateKey();
    const result = await chrome.storage.local.get(STATS_STORAGE_KEY);
    const current = resolveStatsForDate(
      result[STATS_STORAGE_KEY] as Partial<FocusStats> | undefined,
      todayKey
    );

    const isNewDayOfActivity = current.lastActiveDate !== todayKey;
    const yesterdayKey = getPreviousDateKey();
    let updatedStreak = current.streakDays;

    if (isNewDayOfActivity) {
      if (current.lastActiveDate === yesterdayKey) {
        updatedStreak += 1;
      } else {
        updatedStreak = 1;
      }
    }

    const updated: FocusStats = {
      today: todayKey,
      todayBlocked: current.todayBlocked + count,
      totalBlocked: current.totalBlocked + count,
      streakDays: updatedStreak,
      lastActiveDate: todayKey
    };

    await chrome.storage.local.set({ [STATS_STORAGE_KEY]: updated });
  } catch (err) {
    // Silently ignore "Extension context invalidated" (extension reloaded mid-session)
    // and any other storage error — stats are non-fatal and must never surface to users.
    void err;
  }
}

export function recordDistractions(count = 1): void {
  buffer += count;
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      void flushBuffer();
    }, 1200);
  }
}

export async function flushDistractionsImmediately(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
  }
  await flushBuffer();
}

export async function resetStats(): Promise<void> {
  buffer = 0;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    await chrome.storage.local.remove(STATS_STORAGE_KEY);
  } catch {
    // Non-fatal
  }
}
