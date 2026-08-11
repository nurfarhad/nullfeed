import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputDirectory = resolve("dist");
const manifestPath = resolve(outputDirectory, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const serviceWorker = manifest.background?.service_worker;

if (typeof serviceWorker !== "string" || serviceWorker.length === 0) {
  throw new Error("Built manifest does not declare a background service worker.");
}

const loaderPath = resolve(outputDirectory, serviceWorker);
const loader = await readFile(loaderPath, "utf8");
const importMatch = loader.match(/^\s*import\s+["'](.+?)["'];?\s*$/m);

if (!importMatch) {
  throw new Error(`${serviceWorker} does not contain a static import.`);
}

const backgroundBundlePath = resolve(dirname(loaderPath), importMatch[1]);
const backgroundBundle = await readFile(backgroundBundlePath, "utf8");
const requiredListeners = ["chrome.runtime.onInstalled", "chrome.runtime.onStartup"];
const missingListeners = requiredListeners.filter(
  (listener) => !backgroundBundle.includes(listener)
);

if (missingListeners.length > 0) {
  throw new Error(
    `${serviceWorker} imports the wrong bundle; missing ${missingListeners.join(
      " and "
    )}.`
  );
}

console.log(
  `Built service worker imports ${importMatch[1]} and registers both lifecycle listeners.`
);
