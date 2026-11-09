<#
.SYNOPSIS
  Put everything the badge firmware needs to build on a Windows machine, without
  Visual Studio or VS Code: CMake, Ninja, the Arm GNU toolchain, the Pico SDK
  with TinyUSB, and a prebuilt picotool (the SDK needs it to write the UF2, and
  building it from source on Windows needs a native compiler - the prebuilt
  avoids that).

    powershell -ExecutionPolicy Bypass -File software\tools\setup-pico-toolchain.ps1

  Installs with winget (CMake, Ninja, Arm toolchain), clones pico-sdk into
  %USERPROFILE%\pico\pico-sdk, unpacks picotool into %USERPROFILE%\pico\picotool,
  and sets PICO_SDK_PATH for your user. Re-running is safe; it skips what is
  already there. Then: software\tools\build-firmware.ps1.

  If you would rather use the Raspberry Pi Pico VS Code extension, install it
  and skip this script - build-firmware.ps1 finds what the extension puts under
  %USERPROFILE%\.pico-sdk on its own.
#>
param(
  [string]$SdkVersion = '2.3.1',
  [string]$Root = "$env:USERPROFILE\pico"
)
$ErrorActionPreference = 'Stop'

function Install-IfMissing([string]$Exe, [string]$WingetId) {
  if (Get-Command $Exe -ErrorAction SilentlyContinue) { Write-Host "ok      $Exe already on PATH"; return }
  Write-Host "install $WingetId"
  winget install --id $WingetId --exact --silent --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) { throw "winget failed for $WingetId" }
}

Install-IfMissing cmake Kitware.CMake
Install-IfMissing ninja Ninja-build.Ninja

# The Arm toolchain installer does not add itself to PATH; build-firmware.ps1
# looks in its install directory, so only check whether it is installed.
$armDir = Get-ChildItem "${env:ProgramFiles(x86)}\Arm GNU Toolchain arm-none-eabi" -Directory -ErrorAction SilentlyContinue |
          Sort-Object Name -Descending | Select-Object -First 1
if ($armDir -or (Get-Command arm-none-eabi-gcc -ErrorAction SilentlyContinue)) {
  Write-Host "ok      arm-none-eabi toolchain present"
} else {
  Write-Host "install Arm.GnuArmEmbeddedToolchain"
  winget install --id Arm.GnuArmEmbeddedToolchain --exact --silent --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) { throw "winget failed for the Arm toolchain" }
}

New-Item -ItemType Directory -Force $Root | Out-Null

$sdk = Join-Path $Root 'pico-sdk'
if (Test-Path (Join-Path $sdk 'pico_sdk_init.cmake')) {
  Write-Host "ok      pico-sdk at $sdk"
} else {
  Write-Host "clone   pico-sdk $SdkVersion -> $sdk"
  git clone -q --depth 1 --branch $SdkVersion https://github.com/raspberrypi/pico-sdk $sdk
  if ($LASTEXITCODE -ne 0) { throw "git clone of pico-sdk failed" }
  git -C $sdk submodule update -q --init --depth 1 lib/tinyusb
  if ($LASTEXITCODE -ne 0) { throw "fetching TinyUSB failed" }
}

# Prebuilt picotool from raspberrypi/pico-sdk-tools - the same binaries the VS
# Code extension installs. Release tags are v<sdk>-<n>; take the newest for
# this SDK version.
$ptDir = Join-Path $Root 'picotool'
if (Get-ChildItem $ptDir -Recurse -Filter picotoolConfig.cmake -ErrorAction SilentlyContinue) {
  Write-Host "ok      picotool at $ptDir"
} else {
  $rel = (Invoke-RestMethod "https://api.github.com/repos/raspberrypi/pico-sdk-tools/releases?per_page=30") |
         Where-Object { $_.tag_name -like "v$SdkVersion-*" } | Select-Object -First 1
  if (-not $rel) { throw "no pico-sdk-tools release for SDK $SdkVersion" }
  $asset = $rel.assets | Where-Object { $_.name -like "picotool-$SdkVersion-x64-win.zip" } | Select-Object -First 1
  if (-not $asset) { throw "release $($rel.tag_name) has no picotool-$SdkVersion-x64-win.zip" }
  $zip = Join-Path $env:TEMP $asset.name
  Write-Host "fetch   $($asset.browser_download_url)"
  Invoke-WebRequest $asset.browser_download_url -OutFile $zip
  New-Item -ItemType Directory -Force $ptDir | Out-Null
  Expand-Archive $zip -DestinationPath $ptDir -Force
  Remove-Item $zip
}

[Environment]::SetEnvironmentVariable('PICO_SDK_PATH', $sdk, 'User')
$env:PICO_SDK_PATH = $sdk
Write-Host ""
Write-Host "PICO_SDK_PATH=$sdk (set for your user; open a new shell for it to stick)"
Write-Host "next: powershell -ExecutionPolicy Bypass -File software\tools\build-firmware.ps1"
