# Nullfeed `v3.0.0`

<p align="center">
  <strong>Focus on what matters. Eliminate social media distractions for free.</strong>
</p>

<p align="center">
  <img src="public/icons/icon-128.png" alt="Nullfeed Logo" width="96" height="96" />
</p>

Nullfeed is a privacy-first, lightweight Manifest V3 Chrome extension designed to hide distracting short-form video feeds, algorithmic rabbit holes, stories, and advertisements across **YouTube**, **Facebook**, **Instagram**, **LinkedIn**, and **Twitter/X** — replacing endless feed voids with mindful focus quotes.

---

## Key Features

### Mindful Focus Quotes
* **Serene Feed Replacement**: When algorithmic feeds are hidden, Nullfeed replaces the distraction void with a sleek, dark-mode glassmorphic Focus Card featuring inspiring quotes from Marcus Aurelius, Seneca, Naval Ravikant, Steve Jobs, and more.
* **Interactive Refresh**: Click the subtle refresh button to cycle to a new quote anytime.

### YouTube
* **Hide YouTube Shorts**: Removes Shorts shelves, grid lockups, and recommended short-form reels across home, subscriptions, and search feeds.
* **Hide Shorts Navigation**: Cleans up the left sidebar and mini-guide by removing the Shorts icon and quick-access buttons.
* **Instant Shorts Redirect**: Automatically redirects direct `/shorts/...` URLs back to your clean YouTube home feed.
* **Hide Recommended Sidebar**: Removes the "Up Next / Recommended Videos" sidebar on watch pages to stop endless video rabbit holes.

### LinkedIn
* **Hide Main Feed**: Replaces the infinite home feed with a Mindful Focus Card while keeping Search, Messages, Jobs, and Notifications 100% active.
* **Hide News Sidebar**: Removes trending news modules and sidebar engagement bait.

### Twitter / X
* **Hide Home Timeline**: Hides the algorithmic "For You" timeline while keeping Direct Messages, Notifications, Search, Lists, and Profiles active.
* **Hide Trends & What's Happening**: Removes the right-hand trending topics module.

### Facebook
* **Hide Reels**: Removes Reels carousels, feed cards, and sidebar items without affecting the main navigation.
* **Hide Stories**: Collapses empty story shells and trays with zero layout gaps.
* **Hide Videos & Auto-Pause**: Hides video posts from the feed and automatically pauses background video playback.
* **Sponsored & Ad Blocker**: Seamlessly identifies and removes sponsored feed posts, ads, and sponsored side rails.

### Instagram
* **Hide Reels**: Removes the Reels icon from the sidebar, removes the Reels tab from profile pages, redirects `/[username]/reels/` and `/reels/` routes, and cleans up the Explore grid without distorting profile posts.
* **Hide Stories & Highlights**: Hides story trays and profile story highlight carousels with clean zero-gap layout collapse.
* **Hide Explore**: Hides the Explore navigation icon from the sidebar.

### Productivity Controls
* **Selective Snooze**: Pause protection on any combination of platforms for custom durations (`1m`, `2m`, `5m`, `10m`, `30m`, `1h`, `24h`) with a non-intrusive resume indicator.
* **Master Switch**: One-click protection toggle to pause or restore all original platform layouts instantly.
* **Zero Telemetry & 100% Privacy**: No trackers, no external network requests, no account required. All settings are stored locally on your machine via Chrome Storage API.

---

## Tech Stack & Architecture

* **Framework**: [Preact](https://preactjs.com/) for a hyper-lightweight popup UI footprint.
* **Build System**: [Vite](https://vitejs.dev/) + [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin) + [TypeScript](https://www.typescriptlang.org/).
* **Styling**: Vanilla CSS design tokens with early-injection CSS rules to prevent screen flashing.
* **Testing**: [Vitest](https://vitest.dev/) for unit & migration tests + [Playwright](https://playwright.dev/) for cross-platform end-to-end DOM filtering verification.

---

## Installation & Development

### Requirements
* Node.js 20+ (Node 24 LTS recommended)
* Google Chrome or any Chromium-based browser (Brave, Edge, Arc, etc.)

### Build from Source

```bash
# Clone the repository
git clone https://github.com/nurfarhad/nullfeed.git
cd nullfeed

# Install dependencies
npm install

# Build the extension
npm run build
```

### Load in Chrome

1. Navigate to `chrome://extensions` in your browser.
2. Toggle on **Developer mode** in the top right corner.
3. Click **Load unpacked**.
4. Select the generated `dist/` directory.

---

## Testing & Quality Assurance

```bash
# Run unit & migration tests
npm test

# Run end-to-end Playwright tests
npm run test:e2e

# Run manifest & build audits
npm run audit:permissions
npm run audit:build
```

---

## Chrome Web Store Publishing

A pre-packaged, ready-to-upload ZIP file and description text are included in the repository root:
* **Upload ZIP Package**: `Nullfeed_ChromeWebStore.zip` (ready for [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole))
* **Store Listing Copy & Metadata**: `CHROME_WEB_STORE_DESCRIPTION.txt` (contains short description, long description, categories, and permission justifications ready to copy-paste).

---

## Privacy Policy

Nullfeed operates strictly inside your browser:
* **No external network communication**: Nullfeed never sends data to any server.
* **No user tracking**: No telemetry, analytics, or fingerprinting.
* **Minimal permissions**: Operates strictly within required content script matches and `chrome.storage`.

---

## License

MIT License &copy; 2026 [Nur Farhad](https://github.com/nurfarhad). Free and open source for everyone.
