import { describe, expect, it } from "vitest";
import {
  CYCLE_BREAK_MS,
  CYCLE_TOTAL_MS
} from "../../src/content/focusCycle";
import {
  canTriggerEarlyBlock,
  createDetectorState,
  isDoomscrolling,
  msIntoOffPhase,
  recordScrollSample,
  MIN_OFF_PHASE_BEFORE_TRIGGER_MS,
  SUSTAINED_MS,
  type DetectorState
} from "../../src/content/scrollDetector";

const VIEWPORT_HEIGHT = 800;

function feed(
  state: DetectorState,
  samples: Array<{ t: number; y: number }>,
  viewportHeight = VIEWPORT_HEIGHT
): DetectorState {
  return samples.reduce(
    (acc, sample) => recordScrollSample(acc, sample, viewportHeight),
    state
  );
}

describe("Scroll Detector - pace detection", () => {
  it("does not flag a slow, occasional scroll", () => {
    let state = createDetectorState();
    // One screen-height every 20 seconds for two minutes — well under
    // SCREENS_THRESHOLD within any 60s window.
    const samples = [
      { t: 0, y: 0 },
      { t: 20_000, y: 800 },
      { t: 40_000, y: 1600 },
      { t: 60_000, y: 2400 },
      { t: 80_000, y: 3200 },
      { t: 100_000, y: 4000 },
      { t: 120_000, y: 4800 }
    ];
    state = feed(state, samples);
    expect(state.paceSince).toBeNull();
    expect(isDoomscrolling(state, 120_000)).toBe(false);
  });

  it("flags a fast, sustained scroll pace after SUSTAINED_MS", () => {
    let state = createDetectorState();
    // 800px every second — 1 full screen-height/sec, far past the 6
    // screens/60s threshold almost immediately.
    for (let t = 0; t <= 10_000; t += 1000) {
      state = recordScrollSample(state, { t, y: t }, VIEWPORT_HEIGHT);
    }
    expect(state.paceSince).not.toBeNull();

    // Not yet sustained long enough.
    expect(isDoomscrolling(state, (state.paceSince ?? 0) + SUSTAINED_MS - 1)).toBe(
      false
    );
    // Sustained for exactly SUSTAINED_MS.
    expect(isDoomscrolling(state, (state.paceSince ?? 0) + SUSTAINED_MS)).toBe(
      true
    );
  });

  it("clears the sustained pace once scrolling slows back down", () => {
    let state = createDetectorState();
    for (let t = 0; t <= 10_000; t += 1000) {
      state = recordScrollSample(state, { t, y: t }, VIEWPORT_HEIGHT);
    }
    expect(state.paceSince).not.toBeNull();

    // A long idle gap: distance stays the same but the window prunes old
    // samples out, dropping the pace back under threshold.
    state = recordScrollSample(state, { t: 80_000, y: 10_000 }, VIEWPORT_HEIGHT);
    expect(state.paceSince).toBeNull();
    expect(isDoomscrolling(state, 200_000)).toBe(false);
  });
});

describe("Scroll Detector - early-block eligibility", () => {
  it("is not eligible in the first MIN_OFF_PHASE_BEFORE_TRIGGER_MS of an off phase", () => {
    const anchor = 1_000_000;
    expect(
      canTriggerEarlyBlock(anchor, anchor, CYCLE_BREAK_MS, CYCLE_TOTAL_MS)
    ).toBe(false);
    expect(
      canTriggerEarlyBlock(
        anchor,
        anchor + MIN_OFF_PHASE_BEFORE_TRIGGER_MS - 1,
        CYCLE_BREAK_MS,
        CYCLE_TOTAL_MS
      )
    ).toBe(false);
  });

  it("becomes eligible once MIN_OFF_PHASE_BEFORE_TRIGGER_MS has elapsed, while still in the off phase", () => {
    const anchor = 1_000_000;
    const now = anchor + MIN_OFF_PHASE_BEFORE_TRIGGER_MS;
    expect(msIntoOffPhase(anchor, now, CYCLE_BREAK_MS, CYCLE_TOTAL_MS)).toBe(
      MIN_OFF_PHASE_BEFORE_TRIGGER_MS
    );
    expect(
      canTriggerEarlyBlock(anchor, now, CYCLE_BREAK_MS, CYCLE_TOTAL_MS)
    ).toBe(true);
  });

  it("reports 0 / not eligible once the off phase has already ended", () => {
    const anchor = 1_000_000;
    const now = anchor + CYCLE_BREAK_MS + 60_000; // well into the "on" phase
    expect(msIntoOffPhase(anchor, now, CYCLE_BREAK_MS, CYCLE_TOTAL_MS)).toBe(0);
    expect(
      canTriggerEarlyBlock(anchor, now, CYCLE_BREAK_MS, CYCLE_TOTAL_MS)
    ).toBe(false);
  });

  it("re-evaluates correctly on the second cycle", () => {
    const anchor = 1_000_000;
    const now = anchor + CYCLE_TOTAL_MS + MIN_OFF_PHASE_BEFORE_TRIGGER_MS;
    expect(
      canTriggerEarlyBlock(anchor, now, CYCLE_BREAK_MS, CYCLE_TOTAL_MS)
    ).toBe(true);
  });
});
