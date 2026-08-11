param(
  [Parameter(Mandatory = $true)]
  [string] $ZipPath
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Drawing

$resolvedZip = (Resolve-Path -LiteralPath $ZipPath).Path
$distRoot = (Resolve-Path -LiteralPath "dist").Path
$archive = [IO.Compression.ZipFile]::OpenRead($resolvedZip)

try {
  $entryMap = @{}
  foreach ($entry in $archive.Entries) {
    $entryMap[$entry.FullName.Replace("\", "/")] = $entry
  }

  $zipFiles = @($entryMap.Keys | Sort-Object)
  $distFiles = @(
    Get-ChildItem -LiteralPath $distRoot -Recurse -File |
      ForEach-Object {
        $_.FullName.Substring($distRoot.Length + 1).Replace("\", "/")
      } |
      Sort-Object
  )
  $difference = Compare-Object $distFiles $zipFiles
  if ($difference) {
    throw "ZIP entries do not exactly match dist."
  }

  function Read-ZipText([string] $Name) {
    if (!$entryMap.ContainsKey($Name)) {
      throw "Missing ZIP entry: $Name"
    }

    $reader = [IO.StreamReader]::new($entryMap[$Name].Open())
    try {
      return $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
    }
  }

  $manifest = Read-ZipText "manifest.json" | ConvertFrom-Json
  $loaderName = $manifest.background.service_worker
  $loader = Read-ZipText $loaderName
  $importMatch = [regex]::Match($loader, "import './([^']+)';")
  if (!$importMatch.Success) {
    throw "$loaderName does not contain the expected static import."
  }

  $backgroundBundleName = $importMatch.Groups[1].Value.Replace("\", "/")
  $backgroundBundle = Read-ZipText $backgroundBundleName
  foreach ($listener in @(
    "chrome.runtime.onInstalled",
    "chrome.runtime.onStartup"
  )) {
    if (!$backgroundBundle.Contains($listener)) {
      throw "Background bundle does not register $listener."
    }
  }
  if ($backgroundBundle.Contains("location.hostname")) {
    throw "Service worker imports the content-script bundle."
  }

  $references = @($loaderName, $manifest.action.default_popup)
  $references += @($manifest.icons.psobject.Properties.Value)
  $references += @($manifest.action.default_icon.psobject.Properties.Value)
  foreach ($contentScript in $manifest.content_scripts) {
    $references += @($contentScript.js)
    $references += @($contentScript.css)
  }
  foreach ($resourceSet in $manifest.web_accessible_resources) {
    $references += @($resourceSet.resources)
  }

  $popup = Read-ZipText $manifest.action.default_popup
  foreach ($match in [regex]::Matches($popup, '(?:src|href)="([^"]+)"')) {
    $value = $match.Groups[1].Value
    if ($value -notmatch "^(?:https?:|#)") {
      $references += $value.TrimStart(".", "/")
    }
  }

  foreach ($reference in ($references | Sort-Object -Unique)) {
    $normalized = ([string] $reference).Replace("\", "/")
    if (!$entryMap.ContainsKey($normalized)) {
      throw "Manifest or popup references missing file: $normalized"
    }
  }

  $unwanted = $zipFiles | Where-Object {
    $_ -match '(^|/)(node_modules|tests?)(/|$)|\.(ts|tsx|map|md|pdf)$'
  }
  if ($unwanted) {
    throw "Unexpected package content: $($unwanted -join ', ')"
  }

  $expectedIconSizes = @{
    "icons/icon-16.png" = 16
    "icons/icon-32.png" = 32
    "icons/icon-48.png" = 48
    "icons/icon-128.png" = 128
  }
  foreach ($pair in $expectedIconSizes.GetEnumerator()) {
    $stream = $entryMap[$pair.Key].Open()
    try {
      $image = [Drawing.Image]::FromStream($stream)
      try {
        if ($image.Width -ne $pair.Value -or $image.Height -ne $pair.Value) {
          throw "Wrong icon dimensions for $($pair.Key)."
        }
      } finally {
        $image.Dispose()
      }
    } finally {
      $stream.Dispose()
    }
  }

  Write-Output "ZIP entries exactly match dist ($($zipFiles.Count) files)."
  Write-Output "Service worker imports $backgroundBundleName."
  Write-Output "All package references, contents, and icon dimensions are valid."
} finally {
  $archive.Dispose()
}
