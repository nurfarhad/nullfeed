import manifest from "../manifest.config.ts";

const allowedPermissions = ["storage"];
const allowedHosts = [
  "https://www.youtube.com/*",
  "https://www.facebook.com/*",
  "https://www.instagram.com/*"
];

const actualPermissions = [...(manifest.permissions ?? [])].sort();
const actualHosts = [...(manifest.host_permissions ?? [])].sort();

if (JSON.stringify(actualPermissions) !== JSON.stringify(allowedPermissions)) {
  throw new Error(`Unexpected permissions: ${actualPermissions.join(", ")}`);
}

if (
  JSON.stringify(actualHosts) !== JSON.stringify([...allowedHosts].sort())
) {
  throw new Error(`Unexpected host permissions: ${actualHosts.join(", ")}`);
}

console.log("Manifest permission surface matches the PRD.");
