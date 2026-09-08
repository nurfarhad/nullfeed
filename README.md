# Nullfeed `v3.5.0`

<p align="center">
  <strong>Focus on what matters. Eliminate social media distractions for free.</strong>
</p>

<p align="center">
  <img src="public/icons/icon-128.png" alt="Nullfeed Logo" width="96" height="96" />
</p>

Nullfeed is a privacy-first, lightweight Manifest V3 Chrome extension designed to hide distracting short-form video feeds, algorithmic rabbit holes, stories, and advertisements across **YouTube**, **Facebook**, and **Instagram** — replacing endless feed voids with mindful focus quotes.

---

## Key Features

### Automatic Dark & Light Theme
* **System-Aware Adaptation**: Automatically detects and matches your device or Chrome browser preference (dark or light mode).
* **UI8 Bento Pro Minimalist Design**: Physical matte borders, tactile toggles, and seamless styling with zero configuration needed.

### Mindful Focus Quotes & Intent Prompt
* **Serene Feed Replacement**: When algorithmic feeds are hidden, Nullfeed replaces the distraction void with an elegant Focus Card featuring inspiring quotes from Marcus Aurelius, Seneca, Naval Ravikant, Steve Jobs, and more.
* **Mindful Intent Prompt**: Set an intentional goal for your browsing session ("What did you come here to do?"). Pins your objective badge directly to the page without cluttering persistent settings.
* **Interactive Refresh**: Click the subtle refresh button to cycle to a new quote anytime.

### YouTube
* **Hide YouTube Shorts**: Removes Shorts shelves, grid lockups, and recommended short-form reels across home, subscriptions, and search feeds.
* **Hide Shorts Navigation**: Cleans up the left sidebar and mini-guide by removing the Shorts icon and quick-access buttons.
* **Instant Shorts Redirect**: Automatically redirects direct `/shorts/...` URLs back to your clean YouTube home feed.
* **Hide Recommended Sidebar**: Removes the "Up Next / Recommended Videos" sidebar on watch pages to stop endless video rabbit holes.
* **Hide Home Feed**: Replaces the algorithmic recommendation grid on YouTube's home page with an inspiring focus quote card, turning YouTube into an intentional search-driven tool.
* **Hide Comments**: Collapses the comments section on video watch pages to prevent comment-section doomscrolling.
* **Hide End Screens & Autoplay**: Removes intrusive end-screen recommendation tiles and autoplay countdown overlays inside the video player.

### Facebook
* **Direct to Messages (Intentional Navigation)**: Direct root Facebook visits (`facebook.com/`) straight to Messenger (`/messages/`), keeping communication open while avoiding the infinite feed trap.
* **Hide Reels**: Removes Reels carousels, feed cards, and sidebar items without affecting the main navigation.
* **Hide Stories**: Collapses empty story shells and trays with zero layout gaps.
* **Hide Videos & Auto-Pause**: Hides video posts from the feed and automatically pauses background video playback.
* **Sponsored & Ad Blocker**: Seamlessly identifies and removes sponsored feed posts, ads, and sponsored side rails.

### Instagram
* **Direct to Messages (Intentional Navigation)**: Direct root Instagram visits (`instagram.com/`) straight to Direct Messages (`/direct/inbox/`) to stay in touch without getting sucked into the feed.
* **Hide Reels**: Removes the Reels icon from the sidebar, removes the Reels tab from profile pages, redirects `/[username]/reels/` and `/reels/` routes, and cleans up the Explore grid without distorting profile posts.
* **Hide Stories & Highlights**: Hides story trays and profile story highlight carousels with clean zero-gap layout collapse.
* **Hide Explore**: Hides the Explore navigation icon from the sidebar.

### Productivity Controls
* **Snooze Protection**: Quick 5-minute or 15-minute temporary unpause with a live countdown timer and immediate one-click resume — zero new permissions, zero persistent setting pollution.
* **Automatic Focus Cycle**: Automatically switches between a 15-minute blocked and 15-minute open phase for feeds on Facebook, LinkedIn, Twitter/X, and Reddit, replacing endless scrolling with a serene focus quote card.
* **Smart Trigger**: Behavioral doomscroll detection that cuts a Focus Cycle break short early when fast, sustained scrolling is detected across covered platforms.
* **Time Reclaimed & Distraction Counter**: Real-time stats card in the popup tracking daily distractions intercepted, estimated focused time saved, and active focus day streaks.
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

## Packaging

```bash
# Package the extension for distribution
npm run package
```

---

## Privacy Policy

Nullfeed operates strictly inside your browser:
* **No external network communication**: Nullfeed never sends data to any server.
* **No user tracking**: No telemetry, analytics, or fingerprinting.
* **Minimal permissions**: Operates strictly within required content script matches and `chrome.storage`.

---

## License

MIT License &copy; 2026 [Nur Farhad](https://github.com/nurfarhad). Free and open source for everyone.
