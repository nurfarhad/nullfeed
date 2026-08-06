<div align="center">

# 🛡️ Nullfeed

**Privacy-First Manifest V3 Chrome Extension for Distraction-Free Browsing**

[![Chrome Extension](https://img.shields.io/badge/Manifest_V3-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Privacy First](https://img.shields.io/badge/Privacy-100%25_Zero_Telemetry-brightgreen?style=for-the-badge)]()

**Nullfeed** is a privacy-first browser extension that neutralizes addictive short-form video feeds and algorithmic infinite scrolls on YouTube, Facebook, and Instagram while keeping essential utility functions intact.

</div>

---

## 🌟 Key Features

- 🛑 **Targeted Feed Hiding**: Selectively hide distracting elements while keeping main search, messages, and work tools fully functional:
  - **YouTube**: Hide Shorts tab, homepage recommendations, sidebar suggestions, and comments.
  - **Facebook**: Hide News Feed, Watch tab, and Stories while preserving Messenger & Groups.
  - **Instagram**: Hide Explore tab, Reels feed, and Stories bar while retaining Direct Messages.
- 🔒 **Zero Telemetry & 100% Local**: No tracking scripts, external analytics, or data collection. Everything executes client-side via Chrome Storage API.
- ⚡ **Lightweight DOM Mutation Observer**: Uses high-efficiency MutationObserver CSS selectors to target feeds instantly before page render without performance impact.
- 🎛️ **Granular Toggle Controls**: Sleek popup UI for instant per-site or per-feature toggles.

---

## 🏗️ Architecture & File Structure

```
nullfeed/
├── src/
│   ├── content/
│   │   ├── youtube.ts               # YouTube Shorts & feed DOM mutation handlers
│   │   ├── facebook.ts              # Facebook News Feed & Watch tab content scripts
│   │   └── instagram.ts             # Instagram Reels & Explore feed content scripts
│   ├── popup/
│   │   ├── popup.html               # Extension popup interface
│   │   ├── popup.ts                 # Toggle control state manager & Chrome Storage sync
│   │   └── popup.css                # Clean dark-mode popup styles
│   ├── background/
│   │   └── background.ts            # Manifest V3 service worker & default config handler
│   └── types/
│       └── settings.ts              # Extension preferences schema
├── manifest.json                    # Manifest V3 configuration & permission scope
├── package.json
└── vite.config.ts                   # Extension build & bundle process
```

---

## 🛠️ Tech Stack

- **Platform**: Chrome Extension Manifest V3
- **Language**: TypeScript
- **State Management**: `chrome.storage.sync` API
- **DOM Engine**: MutationObserver API & dynamic CSS injection

---

## 🚀 Installation & Loading Unpacked

1. **Clone Repository**
   ```bash
   git clone https://github.com/nurfarhad/nullfeed.git
   cd nullfeed
   ```

2. **Install & Build**
   ```bash
   npm install
   npm run build
   ```

3. **Load into Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable **Developer mode** (top-right toggle).
   - Click **Load unpacked** and select the `dist/` directory inside `nullfeed`.

---

## 📜 License

MIT License © [Nur Farhad](https://github.com/nurfarhad)
