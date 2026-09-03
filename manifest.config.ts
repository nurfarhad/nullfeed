import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Nullfeed",
  version: "2.0.0",
  description:
    "Eliminate addictive feeds, shorts, reels, and ads on YouTube, Facebook, Instagram, LinkedIn & Twitter/X.",
  permissions: ["storage", "alarms"],
  host_permissions: [
    "https://*.facebook.com/*",
    "https://facebook.com/*",
    "https://*.instagram.com/*",
    "https://instagram.com/*",
    "https://*.youtube.com/*",
    "https://youtube.com/*",
    "https://*.linkedin.com/*",
    "https://linkedin.com/*",
    "https://*.x.com/*",
    "https://x.com/*",
    "https://*.twitter.com/*",
    "https://twitter.com/*"
  ],
  background: {
    service_worker: "src/background/serviceWorker.ts",
    type: "module"
  },
  action: {
    default_popup: "popup.html",
    default_title: "Nullfeed",
    default_icon: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  icons: {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  content_scripts: [
    {
      matches: [
        "https://*.facebook.com/*",
        "https://facebook.com/*",
        "https://*.instagram.com/*",
        "https://instagram.com/*",
        "https://*.youtube.com/*",
        "https://youtube.com/*",
        "https://*.linkedin.com/*",
        "https://linkedin.com/*",
        "https://*.x.com/*",
        "https://x.com/*",
        "https://*.twitter.com/*",
        "https://twitter.com/*"
      ],
      js: ["src/content/routeSignal.ts"],
      run_at: "document_start",
      world: "MAIN"
    },
    {
      matches: [
        "https://*.facebook.com/*",
        "https://facebook.com/*",
        "https://*.instagram.com/*",
        "https://instagram.com/*",
        "https://*.youtube.com/*",
        "https://youtube.com/*",
        "https://*.linkedin.com/*",
        "https://linkedin.com/*",
        "https://*.x.com/*",
        "https://x.com/*",
        "https://*.twitter.com/*",
        "https://twitter.com/*"
      ],
      css: ["src/content/content.css"],
      js: ["src/content/index.ts"],
      run_at: "document_start"
    }
  ],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'"
  }
});
