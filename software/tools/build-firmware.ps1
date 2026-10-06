<#
.SYNOPSIS
  Build software/controller into controller.uf2 on Windows.

    powershell -ExecutionPolicy Bypass -File software\tools\build-firmware.ps1
    ... -Board pico2        # RP2350
    ... -Clean              # wipe build/ first

  Finds the SDK, toolchain, CMake, Ninja and picotool wherever they are:
  PICO_SDK_PATH and PATH first, then what the Raspberry Pi Pico VS Code
  extension installs under %USERPROFILE%\.pico-sdk, then what
  setup-pico-toolchain.ps1 puts under %USERPROFILE%\pico. Writes
  software\controller\build\controller.uf2; flash it with
  python software\tools\flash-badge.py.
#>
param(
  [string]$Board = 'pico',
  [switch]$Clean
)
$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$src = Join-Path $repo 'software\controller'
$build = Join-Path $src 'build'
$picoExt = "$env:USERPROFILE\.pico-sdk"
$picoRoot = "$env:USERPROFILE\pico"

function Newest([string]$Pattern) {
  $hits = Get-Item $Pattern -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  if ($hits) { return $hits.FullName }
  return $null
}
function FirstExe([string]$Name, [string[]]$Dirs) {
  $c = Get-Command $Name -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($d in $Dirs) {
    if ($d -and (Test-Path (Join-Path $d "$Name.exe"))) { return (Join-Path $d "$Name.exe") }
  }
  return $null
}

# SDK
$sdk = $env:PICO_SDK_PATH
if (-not $sdk) { $sdk = Newest "$picoExt\sdk\*" }
if (-not $sdk) { $sdk = "$picoRoot\pico-sdk" }
if (-not (Test-Path (Join-Path $sdk 'pico_sdk_init.cmake'))) {
  throw "no Pico SDK found (PICO_SDK_PATH, $picoExt\sdk, $picoRoot\pico-sdk); run setup-pico-toolchain.ps1"
}
if (-not (Test-Path (Join-Path $sdk 'lib\tinyusb\src'))) {
  throw "the SDK at $sdk has no TinyUSB: git -C `"$sdk`" submodule update --init lib/tinyusb"
}

# toolchain, cmake, ninja
$gcc = FirstExe 'arm-none-eabi-gcc' @(
  (Newest "$picoExt\toolchain\*\bin"),
  (Newest "${env:ProgramFiles(x86)}\Arm GNU Toolchain arm-none-eabi\*\bin"),
  (Newest "${env:ProgramFiles}\Arm GNU Toolchain arm-none-eabi\*\bin"))
if (-not $gcc) { throw "arm-none-eabi-gcc not found; run setup-pico-toolchain.ps1" }
$armBin = Split-Path -Parent $gcc
$cmake = FirstExe 'cmake' @((Newest "$picoExt\cmake\*\bin"), "${env:ProgramFiles}\CMake\bin")
if (-not $cmake) { throw "cmake not found; run setup-pico-toolchain.ps1" }
$ninja = FirstExe 'ninja' @((Newest "$picoExt\ninja\*"))
if (-not $ninja) { throw "ninja not found; run setup-pico-toolchain.ps1" }

# picotool: the SDK's pico_add_extra_outputs needs it to write the UF2
$ptCfg = Get-ChildItem @("$picoExt\picotool", "$picoRoot\picotool") -Recurse -Filter picotoolConfig.cmake -ErrorAction SilentlyContinue |
         Sort-Object FullName -Descending | Select-Object -First 1
$ptArg = @()
if ($ptCfg) { $ptArg = @("-Dpicotool_DIR=$($ptCfg.DirectoryName)") }
else { Write-Warning "no prebuilt picotool found; CMake will try to build it from source, which needs a native C++ compiler" }

Write-Host "sdk        $sdk"
Write-Host "toolchain  $armBin"
Write-Host "cmake      $cmake"
Write-Host "ninja      $ninja"
if ($ptCfg) { Write-Host "picotool   $($ptCfg.DirectoryName)" }
Write-Host "board      $Board"

if ($Clean -and (Test-Path $build)) { Remove-Item -Recurse -Force $build }
$env:PICO_SDK_PATH = $sdk
$env:PICO_TOOLCHAIN_PATH = $armBin
$env:PATH = "$armBin;$(Split-Path -Parent $ninja);$env:PATH"

& $cmake -S $src -B $build -G Ninja "-DCMAKE_MAKE_PROGRAM=$ninja" "-DPICO_BOARD=$Board" "-DPICO_SDK_PATH=$sdk" "-DPICO_TOOLCHAIN_PATH=$armBin" @ptArg
if ($LASTEXITCODE -ne 0) { throw "cmake configure failed" }
& $cmake --build $build --parallel
if ($LASTEXITCODE -ne 0) { throw "build failed" }

$uf2 = Join-Path $build 'controller.uf2'
Write-Host ""
Write-Host "$uf2  ($((Get-Item $uf2).Length) bytes)"
Write-Host "flash: python software\tools\flash-badge.py"
