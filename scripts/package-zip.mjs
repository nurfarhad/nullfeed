import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const zipPath = path.resolve("Nullfeed_ChromeWebStore.zip");
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

const normalizedZipPath = zipPath.replace(/\\/g, "/");

const psScript = `
Add-Type -AssemblyName System.IO.Compression.FileSystem;
$zip = [System.IO.Compression.ZipFile]::Open('${normalizedZipPath}', 'Create');
$dist = (Resolve-Path 'dist').Path;
Get-ChildItem -LiteralPath $dist -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($dist.Length + 1).Replace('\\', '/');
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel) | Out-Null;
};
$zip.Dispose();
`;

execSync(`powershell -NoProfile -Command "${psScript.replace(/\r?\n/g, " ")}"`, {
  stdio: "inherit"
});

console.log("Successfully packaged Nullfeed_ChromeWebStore.zip");


