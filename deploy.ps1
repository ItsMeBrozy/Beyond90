$ErrorActionPreference = "Stop"
$src = "C:\Users\sawab\Downloads\Beyond90"
$temp = "C:\Users\sawab\Downloads\Beyond90-deploy-src"

if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
New-Item $temp -ItemType Directory | Out-Null

$include = @(
  "discloud.config",
  "prod.js",
  "package.json",
  "bot\dist",
  "bot\package.json",
  "client\dist",
  "server\dist",
  "server\prisma",
  "server\package.json"
)

foreach ($item in $include) {
  $s = Join-Path $src $item
  $d = Join-Path $temp $item
  if (Test-Path $s) {
    $parent = Split-Path $d -Parent
    if (!(Test-Path $parent)) { New-Item $parent -ItemType Directory -Force | Out-Null }
    if ((Get-Item $s).PSIsContainer) { Copy-Item $s $d -Recurse -Force }
    else { Copy-Item $s $d -Force }
  }
}

# Flat package.json with all deps + build script that generates prisma
$serverPkg = Get-Content (Join-Path $src "server\package.json") -Raw | ConvertFrom-Json
$botPkg = Get-Content (Join-Path $src "bot\package.json") -Raw | ConvertFrom-Json
$allDeps = @{}
foreach ($prop in $serverPkg.dependencies.PSObject.Properties) { $allDeps[$prop.Name] = $prop.Value }
foreach ($prop in $botPkg.dependencies.PSObject.Properties) { $allDeps[$prop.Name] = $prop.Value }
$allDeps["prisma"] = "^5.22.0"

$pkg = Get-Content (Join-Path $src "package.json") -Raw | ConvertFrom-Json
$pkg.PSObject.Properties.Remove('workspaces')
$pkg.PSObject.Properties.Remove('devDependencies')
$pkg | Add-Member -NotePropertyName "dependencies" -NotePropertyValue $allDeps -Force
$pkg.scripts = @{ build = "npx prisma generate --schema=server/prisma/schema.prisma && node prod.js" }
$pkg | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $temp "package.json")

Write-Host "Clean source ready: $temp"
Write-Host "Uploading to Discloud..."
Push-Location $temp
discloud app upload
Pop-Location

Remove-Item $temp -Recurse -Force
