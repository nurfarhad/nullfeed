import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const roots = ["src", "public", "manifest.config.ts", "popup.html"];
const allowedUrls = new Set([
  "https://www.linkedin.com/in/nurfarhad/",
  "https://www.facebook.com/itsnurfarhad/",
  "https://own.page/nurfarhad",
  "https://www.youtube.com/",
  "https://www.youtube.com/*",
  "https://*.youtube.com/*",
  "https://youtube.com/*",
  "https://www.facebook.com/",
  "https://www.facebook.com/*",
  "https://*.facebook.com/*",
  "https://facebook.com/*",
  "https://www.instagram.com/",
  "https://www.instagram.com/*",
  "https://*.instagram.com/*",
  "https://instagram.com/*",
  "https://www.linkedin.com/feed/",
  "https://*.linkedin.com/*",
  "https://linkedin.com/*",
  "https://x.com/home",
  "https://*.x.com/*",
  "https://x.com/*",
  "https://*.twitter.com/*",
  "https://twitter.com/*"
]);
const findings = [];

async function inspect(path) {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => null);
  if (entries) {
    await Promise.all(
      entries.map((entry) => inspect(join(path, entry.name)))
    );
    return;
  }

  if (![".ts", ".tsx", ".css", ".html", ".svg"].includes(extname(path))) {
    return;
  }

  const content = await readFile(path, "utf8");
  const urls = content.match(/https?:\/\/[^\s"'<>)}\]]+/g) ?? [];
  for (const url of urls) {
    if (!allowedUrls.has(url) && !url.includes("www.w3.org/2000/svg")) {
      findings.push(`${path}: ${url}`);
    }
  }
}

await Promise.all(roots.map(inspect));

if (findings.length > 0) {
  throw new Error(`Unexpected remote URLs:\n${findings.join("\n")}`);
}

console.log("No unauthorized runtime network surface found.");
