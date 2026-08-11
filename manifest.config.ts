import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Nullfeed",
  version: "1.0.2",
  description:
    "Hide distracting short-form feeds on YouTube, Facebook, and Instagram.",
  permissions: ["storage"],
  host_permissions: [
    "https://www.facebook.com/*",
    "https://www.instagram.com/*",
    "https://www.youtube.com/*"
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
        "https://www.facebook.com/*",
        "https://www.instagram.com/*",
        "https://www.youtube.com/*"
      ],
      js: ["src/content/routeSignal.ts"],
      run_at: "document_start",
      world: "MAIN"
    },
    {
      matches: [
        "https://www.facebook.com/*",
        "https://www.instagram.com/*",
        "https://www.youtube.com/*"
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
