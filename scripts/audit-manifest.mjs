import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const manifestPath = resolve("dist", "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const allowedPermissions = ["alarms", "storage"].sort();
const allowedHosts = [
  "https://*.facebook.com/*",
  "https://facebook.com/*",
  "https://*.instagram.com/*",
  "https://instagram.com/*",
  "https://*.youtube.com/*",
  "https://youtube.com/*"
].sort();

const actualPermissions = [...(manifest.permissions ?? [])].sort();
const actualHosts = [...(manifest.host_permissions ?? [])].sort();

if (JSON.stringify(actualPermissions) !== JSON.stringify(allowedPermissions)) {
  throw new Error(`Unexpected permissions: ${actualPermissions.join(", ")}`);
}

if (
  JSON.stringify(actualHosts) !== JSON.stringify(allowedHosts)
) {
  throw new Error(`Unexpected host permissions: ${actualHosts.join(", ")}`);
}

console.log("Manifest permission surface matches the PRD.");

