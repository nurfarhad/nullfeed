/**
 * Behavior-based doomscroll detection. Everything here is a pure function
 * over a plain state object — no DOM, no chrome.* APIs, no timers — so it's
 * cheap to unit test and easy to reason about. The content script owns the
 * only stateful part: sampling scroll position and calling these on a
 * rAF-throttled cadence (see index.ts).
 *
 * Detection never reads page content, only scroll position and time deltas.
 */

export type ScrollSample = {
  t: number;
  y: number;
};

export type DetectorState = {
  samples: ScrollSample[];
  /** Timestamp the sustained fast-scroll pace first started, or null if idle. */
  paceSince: number | null;
};

export const ROLLING_WINDOW_MS = 60_000;
/** Full page-heights scrolled within ROLLING_WINDOW_MS to count as "fast". */
export const SCREENS_THRESHOLD = 6;
/** How long the fast pace must hold before we call it doomscrolling. */
export const SUSTAINED_MS = 45_000;
/**
 * Minimum time into a Focus Cycle "off" phase (the free-browsing window,
 * confusingly named — see focusCycle.ts) before an early cutoff can fire.
 * Without this floor, someone who opens the feed already mid-scroll-habit
 * would get blocked within seconds of every single break, which reads as
 * broken rather than smart.
 */
export const MIN_OFF_PHASE_BEFORE_TRIGGER_MS = 3 * 60_000;

export function createDetectorState(): DetectorState {
  return { samples: [], paceSince: null };
}

function pruneSamples(samples: ScrollSample[], now: number, windowMs: number): ScrollSample[] {
  const cutoff = now - windowMs;
  const firstValidIndex = samples.findIndex((sample) => sample.t >= cutoff);
  if (firstValidIndex === -1) {
    return [];
  }
  return firstValidIndex === 0 ? samples : samples.slice(firstValidIndex);
}

/** Sum of absolute scroll distance across samples, expressed in screen-heights. */
function screensScrolled(samples: ScrollSample[], viewportHeight: number): number {
  if (samples.length < 2 || viewportHeight <= 0) {
    return 0;
  }
  let distance = 0;
  for (let i = 1; i < samples.length; i += 1) {
    distance += Math.abs(samples[i].y - samples[i - 1].y);
  }
  return distance / viewportHeight;
}

/**
 * Feed in one scroll sample. Returns the next state — call sites should
 * replace their stored state with the return value (no mutation).
 */
export function recordScrollSample(
  state: DetectorState,
  sample: ScrollSample,
  viewportHeight: number,
  windowMs = ROLLING_WINDOW_MS,
  screensThreshold = SCREENS_THRESHOLD
): DetectorState {
  const samples = [...pruneSamples(state.samples, sample.t, windowMs), sample];
  const pace = screensScrolled(samples, viewportHeight);
  const isFast = pace >= screensThreshold;

  let paceSince = state.paceSince;
  if (isFast && paceSince === null) {
    paceSince = sample.t;
  } else if (!isFast) {
    paceSince = null;
  }

  return { samples, paceSince };
}

export function isDoomscrolling(
  state: DetectorState,
  now: number,
  sustainedMs = SUSTAINED_MS
): boolean {
  return state.paceSince !== null && now - state.paceSince >= sustainedMs;
}

/**
 * How far into the current "off" phase (free-browsing window) we are, given
 * the Focus Cycle anchor. Mirrors the modular-arithmetic phase math in
 * focusCycle.ts's getPhase — kept separate so scrollDetector.ts never has
 * to import cycle constants the other direction. Returns 0 once we've moved
 * past the "off" phase into "on" (blocked), since the detector shouldn't be
 * running at all by then — index.ts stops sampling once phase flips.
 */
export function msIntoOffPhase(
  anchor: number,
  now: number,
  cycleBreakMs: number,
  cycleTotalMs: number
): number {
  const elapsed = Math.max(0, now - anchor) % cycleTotalMs;
  return elapsed < cycleBreakMs ? elapsed : 0;
}

export function canTriggerEarlyBlock(
  anchor: number,
  now: number,
  cycleBreakMs: number,
  cycleTotalMs: number,
  minOffPhaseMs = MIN_OFF_PHASE_BEFORE_TRIGGER_MS
): boolean {
  return msIntoOffPhase(anchor, now, cycleBreakMs, cycleTotalMs) >= minOffPhaseMs;
}
