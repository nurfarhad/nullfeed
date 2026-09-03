import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const zipPath = path.resolve("Nullfeed_ChromeWebStore.zip");
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

execSync(`powershell -NoProfile -Command "Compress-Archive -Path dist/* -DestinationPath Nullfeed_ChromeWebStore.zip"`, {
  stdio: "inherit"
});

console.log("Successfully packaged Nullfeed_ChromeWebStore.zip");
