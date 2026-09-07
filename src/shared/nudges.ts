export interface Nudge {
  text: string;
}

// Shown when the Scroll Detector cuts a Focus Cycle "on" phase short — distinct
// in tone from FOCUS_QUOTES (see quotes.ts). These are situational and direct
// rather than philosophical, since the trigger itself (fast, sustained
// scrolling) already told the user something; the line should just name it
// plainly and hand control back, never guilt-trip.
export const SCROLL_NUDGES: readonly Nudge[] = Object.freeze([
  { text: "You've been scrolling fast for a while. This is an early pause." },
  { text: "Still finding what you were looking for, or just moving?" },
  { text: "That was quick scrolling for a while there. Short break." },
  { text: "Nullfeed noticed the pace pick up, so it picked the pause for you." },
  { text: "A few minutes off, then the feed's back." },
  { text: "This pause came a little early today — the pace gave it away." },
  { text: "Worth asking: what did you open this tab for?" },
  { text: "The scroll was fast enough that Nullfeed stepped in early." }
]);

export function getRandomNudge(excludeIndex?: number): { nudge: Nudge; index: number } {
  const total = SCROLL_NUDGES.length;
  let index = Math.floor(Math.random() * total);
  if (excludeIndex !== undefined && total > 1 && index === excludeIndex) {
    index = (index + 1) % total;
  }
  return { nudge: SCROLL_NUDGES[index], index };
}
