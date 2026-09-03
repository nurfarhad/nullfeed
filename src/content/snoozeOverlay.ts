import { QUOTES } from "../shared/quotes";
import { endSnooze, getSettings } from "../shared/storage";

const OVERLAY_ID = "nullfeed-snooze-overlay";

let countdownTimer: ReturnType<typeof setInterval> | null = null;

function pickQuote(): string {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

function formatRemaining(until: number): string {
  const remaining = Math.max(0, until - Date.now());
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} remaining`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")} remaining`;
}

function createOverlayElement(until: number): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;

  // Inline styles for isolation from page styles
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "24px",
    padding: "32px",
    background: "#111214",
    color: "#e8eaed",
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    textAlign: "center"
  });

  // Nullfeed mark (SVG)
  const markContainer = document.createElement("div");
  markContainer.innerHTML = `
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
         stroke="#e8eaed" stroke-width="2" stroke-linecap="round"
         stroke-linejoin="round"
         style="filter: drop-shadow(0 0 12px rgba(46, 216, 138, 0.25));">
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  `;
  overlay.appendChild(markContainer);

  // Quote
  const quote = document.createElement("p");
  Object.assign(quote.style, {
    maxWidth: "400px",
    margin: "0",
    fontSize: "20px",
    fontWeight: "500",
    lineHeight: "1.5",
    color: "#e8eaed",
    opacity: "0.85"
  });
  quote.textContent = `"${pickQuote()}"`;
  overlay.appendChild(quote);

  // Countdown
  const countdown = document.createElement("p");
  countdown.className = "nullfeed-snooze-countdown";
  Object.assign(countdown.style, {
    margin: "0",
    fontSize: "32px",
    fontWeight: "700",
    letterSpacing: "-0.02em",
    color: "#2ed88a",
    fontVariantNumeric: "tabular-nums"
  });
  countdown.textContent = formatRemaining(until);
  overlay.appendChild(countdown);

  // Resume button
  const button = document.createElement("button");
  Object.assign(button.style, {
    padding: "12px 28px",
    border: "1.5px solid rgba(255, 255, 255, 0.14)",
    borderRadius: "10px",
    background: "#1a1b1e",
    color: "#e8eaed",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background-color 150ms ease, border-color 150ms ease"
  });
  button.textContent = "Resume now";
  button.addEventListener("mouseenter", () => {
    button.style.background = "#222428";
    button.style.borderColor = "#2ed88a";
  });
  button.addEventListener("mouseleave", () => {
    button.style.background = "#1a1b1e";
    button.style.borderColor = "rgba(255, 255, 255, 0.14)";
  });
  button.addEventListener("click", () => {
    void getSettings().then((settings) => {
      void endSnooze(settings);
    });
    hideSnoozeOverlay();
  });
  overlay.appendChild(button);

  return overlay;
}

function startCountdown(until: number): void {
  stopCountdown();

  countdownTimer = setInterval(() => {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      stopCountdown();
      return;
    }

    const countdown = overlay.querySelector(".nullfeed-snooze-countdown");
    if (countdown) {
      countdown.textContent = formatRemaining(until);
    }

    // Auto-remove when time expires (instant UI, alarm is source of truth for storage)
    if (Date.now() >= until) {
      hideSnoozeOverlay();
    }
  }, 1000);
}

function stopCountdown(): void {
  if (countdownTimer !== null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

export function showSnoozeOverlay(until: number): void {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) {
    // Just update the countdown if overlay is already showing
    const countdown = existing.querySelector(".nullfeed-snooze-countdown");
    if (countdown) {
      countdown.textContent = formatRemaining(until);
    }
    return;
  }

  const overlay = createOverlayElement(until);
  const target = document.body ?? document.documentElement;
  target.appendChild(overlay);
  startCountdown(until);
}

export function hideSnoozeOverlay(): void {
  stopCountdown();
  document.getElementById(OVERLAY_ID)?.remove();
}
