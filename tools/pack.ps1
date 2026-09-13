# Build the zip that gets uploaded to the Chrome Web Store (manifest at the root of the archive).
#   powershell -ExecutionPolicy Bypass -File tools/pack.ps1
$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $root 'manifest.json') | ConvertFrom-Json).version
$out = Join-Path $root "neet2leet-$version.zip"
if (Test-Path $out) { Remove-Item $out }
$items = @('manifest.json', 'src', 'data', 'icons') | ForEach-Object { Join-Path $root $_ }
Compress-Archive -Path $items -DestinationPath $out
Write-Host "wrote $out"
