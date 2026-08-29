param(
    [Parameter(Mandatory = $true)]
    [string]$OutputRoot,
    [string]$CandidateRoot = "C:\Users\Working WW\AppData\Local\Temp\sakurava-mpv-041-production-candidate"
)

$ErrorActionPreference = "Stop"
$expectedMpvHash = "6F312FD78D309B389436307C29066F227046FC64CEC5061D027DCE802BF91286"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$candidateRootPath = [System.IO.Path]::GetFullPath($CandidateRoot)
$outputRootPath = [System.IO.Path]::GetFullPath($OutputRoot)
$runtimeRoot = Join-Path $candidateRootPath "runtime\libmpv-0.41.0-gpl-false"
$candidateManifestPath = Join-Path $candidateRootPath "manifest\production-candidate.json"
$dependencyManifestPath = Join-Path $candidateRootPath "manifest\dependency-closure.json"
$libmpvPath = Join-Path $runtimeRoot "libmpv-2.dll"

if (Test-Path -LiteralPath $outputRootPath) {
    throw "OutputRoot must not already exist: $outputRootPath"
}
foreach ($required in @($candidateManifestPath, $dependencyManifestPath, $libmpvPath)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        throw "Required production-candidate artifact is missing: $required"
    }
}

$candidateManifest = Get-Content -LiteralPath $candidateManifestPath -Raw | ConvertFrom-Json
if ($candidateManifest.mpv.tag -ne "v0.41.0" -or
    $candidateManifest.mpv.commit -ne "41f6a645068483470267271e1d09966ca3b9f413" -or
    $candidateManifest.ffmpeg.tag -ne "n9.0.1" -or
    $candidateManifest.ffmpeg.commit -ne "bf1b838f2ab88b4f8fd83443325c782ea0e0f7fa" -or
    $candidateManifest.ffmpeg.gpl -ne $false -or
    $candidateManifest.ffmpeg.nonfree -ne $false -or
    -not ($candidateManifest.mpv.options -contains "-Dgpl=false")) {
    throw "Production-candidate provenance or GPL/nonfree guard does not match the approved profile"
}
$actualMpvHash = (Get-FileHash -LiteralPath $libmpvPath -Algorithm SHA256).Hash
if ($actualMpvHash -ne $expectedMpvHash) {
    throw "libmpv hash mismatch: expected $expectedMpvHash, got $actualMpvHash"
}
$dependencyManifest = Get-Content -LiteralPath $dependencyManifestPath -Raw | ConvertFrom-Json
if ($candidateManifest.runtime.unresolvedDependencyCount -ne 0) {
    throw "Production candidate has unresolved runtime dependencies"
}

$stageLeaf = [System.IO.Path]::GetFileName($outputRootPath)
$resourceStageRoot = Join-Path $repoRoot "src-tauri\target\stage3-package-resources\$stageLeaf"
if (Test-Path -LiteralPath $resourceStageRoot) {
    throw "Repository-local ignored resource stage must not already exist: $resourceStageRoot"
}
$resourceSource = Join-Path $resourceStageRoot "video-player"
$engineTarget = Join-Path $resourceSource "mpv-0.41.0"
$uiTarget = Join-Path $resourceSource "video-player-ui"
$legalTarget = Join-Path $resourceSource "legal"
$packageTarget = Join-Path $outputRootPath "package"
$manifestTarget = Join-Path $outputRootPath "manifest"
foreach ($directory in @($resourceSource, $engineTarget, $uiTarget, $legalTarget, $packageTarget, $manifestTarget)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

Push-Location $repoRoot
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed with exit code $LASTEXITCODE" }
    & cargo build --release --manifest-path (Join-Path $repoRoot "src-tauri\Cargo.toml") --bin sakurava-media-host
    if ($LASTEXITCODE -ne 0) { throw "Media-host release build failed with exit code $LASTEXITCODE" }
}
finally {
    Pop-Location
}

$hostSource = Join-Path $repoRoot "src-tauri\target\release\sakurava-media-host.exe"
if (-not (Test-Path -LiteralPath $hostSource -PathType Leaf)) {
    throw "Release media host was not produced: $hostSource"
}
Copy-Item -Path (Join-Path $runtimeRoot "*") -Destination $engineTarget -Recurse
Copy-Item -Path (Join-Path $repoRoot "dist\*") -Destination $uiTarget -Recurse
Copy-Item -LiteralPath $candidateManifestPath -Destination (Join-Path $legalTarget "production-candidate.json")
Copy-Item -LiteralPath $dependencyManifestPath -Destination (Join-Path $legalTarget "dependency-closure.json")

$licenseCopies = @(
    @{ Source = (Join-Path $candidateRootPath "source\mpv\LICENSE.LGPL"); Target = "mpv-LICENSE.LGPL" },
    @{ Source = (Join-Path $candidateRootPath "source\mpv\Copyright"); Target = "mpv-Copyright" },
    @{ Source = (Join-Path $candidateRootPath "source\ffmpeg\LICENSE.md"); Target = "FFmpeg-LICENSE.md" },
    @{ Source = (Join-Path $candidateRootPath "source\ffmpeg\COPYING.LGPLv2.1"); Target = "FFmpeg-COPYING.LGPLv2.1" },
    @{ Source = (Join-Path $candidateRootPath "source\ffmpeg\COPYING.LGPLv3"); Target = "FFmpeg-COPYING.LGPLv3" },
    @{ Source = (Join-Path $candidateRootPath "toolchain\msys64\clang64\share\doc\zimg\COPYING"); Target = "zimg-COPYING" }
)
foreach ($item in $licenseCopies) {
    if (Test-Path -LiteralPath $item.Source -PathType Leaf) {
        Copy-Item -LiteralPath $item.Source -Destination (Join-Path $legalTarget $item.Target)
    }
}

$msysLicenseRoot = Join-Path $candidateRootPath "toolchain\msys64\clang64\share\licenses"
$packageLicenseNames = @(
    "brotli", "bzip2", "expat", "fontconfig", "freetype", "fribidi", "glib2",
    "graphite2", "harfbuzz", "lcms2", "libc++", "libdovi", "libiconv",
    "libjpeg-turbo", "libplacebo", "libpng", "libunibreak", "pcre2", "shaderc",
    "spirv-cross", "vulkan-headers", "vulkan-loader", "zlib"
)
foreach ($packageName in $packageLicenseNames) {
    $source = Join-Path $msysLicenseRoot $packageName
    if (Test-Path -LiteralPath $source -PathType Container) {
        Copy-Item -LiteralPath $source -Destination (Join-Path $legalTarget $packageName) -Recurse
    }
}

$componentInventory = @(
    @{ name = "mpv"; version = "0.41.0"; upstream = "https://github.com/mpv-player/mpv"; revision = $candidateManifest.mpv.commit; profile = "gpl=false shared libmpv"; binaries = @("libmpv-2.dll"); linkage = "dynamic"; notice = "mpv-LICENSE.LGPL; mpv-Copyright" },
    @{ name = "FFmpeg"; version = "9.0.1"; upstream = "https://github.com/FFmpeg/FFmpeg"; revision = $candidateManifest.ffmpeg.commit; profile = "LGPL 2.1-or-later; GPL=false; nonfree=false; network=false"; binaries = @("avcodec-63.dll", "avfilter-12.dll", "avformat-63.dll", "avutil-61.dll", "swresample-7.dll", "swscale-10.dll"); linkage = "dynamic"; notice = "FFmpeg-LICENSE.md and LGPL texts" },
    @{ name = "libplacebo"; version = "7.360.1"; upstream = "https://code.videolan.org/videolan/libplacebo"; revision = $null; profile = "license review required"; binaries = @("libplacebo-360.dll"); linkage = "dynamic"; notice = "libplacebo license directory" },
    @{ name = "libass"; version = "0.17.5"; upstream = "https://github.com/libass/libass"; revision = $null; profile = "license review required"; binaries = @("libass-9.dll"); linkage = "dynamic"; notice = "license text not present in candidate license tree; source/legal reconciliation required" },
    @{ name = "lcms2"; version = $null; upstream = "https://www.littlecms.com"; revision = $null; profile = "license review required"; binaries = @("liblcms2-2.dll"); linkage = "dynamic"; notice = "lcms2 license directory" },
    @{ name = "zimg"; version = $null; upstream = "https://github.com/sekrit-twc/zimg"; revision = $null; profile = "license review required"; binaries = @("libzimg-2.dll"); linkage = "dynamic"; notice = "zimg-COPYING" },
    @{ name = "shaderc and SPIRV-Cross"; version = $null; upstream = "https://github.com/google/shaderc; https://github.com/KhronosGroup/SPIRV-Cross"; revision = $null; profile = "license review required"; binaries = @("libshaderc_shared.dll", "libspirv-cross-c-shared.dll"); linkage = "dynamic"; notice = "shaderc and spirv-cross license directories" },
    @{ name = "runtime dependency closure"; version = $null; upstream = "candidate dependency-closure.json"; revision = $null; profile = "individual license review required"; binaries = @($dependencyManifest.bundled | ForEach-Object { $_.name }); linkage = "dynamic"; notice = "bundled license directories where available; unresolved legal mapping remains" }
)
$inventory = [ordered]@{
    classification = "PRODUCTION CANDIDATE - LEGAL/LICENSE REVIEW REQUIRED"
    generatedAt = (Get-Date).ToString("o")
    candidateRoot = $candidateRootPath
    libmpvSha256 = $actualMpvHash
    mpv = $candidateManifest.mpv
    ffmpeg = $candidateManifest.ffmpeg
    mediaHost = [ordered]@{
        filename = "sakurava-media-host.exe"
        bytes = (Get-Item -LiteralPath $hostSource).Length
        sha256 = (Get-FileHash -LiteralPath $hostSource -Algorithm SHA256).Hash
        packageLocation = "installation root"
    }
    components = $componentInventory
    legalLimitations = @(
        "This is a technical inventory, not legal advice or redistribution approval.",
        "Some dependency revisions and license-to-binary mappings remain unresolved and require legal/source reconciliation.",
        "Corresponding-source and relinking obligations require separate review before distribution."
    )
}
$inventoryPath = Join-Path $legalTarget "delivery-candidate-inventory.json"
$inventory | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $inventoryPath -Encoding utf8

$resourceFiles = Get-ChildItem -LiteralPath $resourceSource -File -Recurse | ForEach-Object {
    [ordered]@{
        path = [System.IO.Path]::GetRelativePath($resourceSource, $_.FullName)
        bytes = $_.Length
        sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }
}
$resourceManifest = [ordered]@{
    classification = "PRODUCTION CANDIDATE - LEGAL/LICENSE REVIEW REQUIRED"
    generatedAt = (Get-Date).ToString("o")
    resourceRoot = $resourceSource
    files = @($resourceFiles)
}
$resourceManifestPath = Join-Path $legalTarget "resource-hashes.json"
$resourceManifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $resourceManifestPath -Encoding utf8

$overlayPath = Join-Path $manifestTarget "tauri.stage3.generated.json"
$resourceMap = @{}
$resourceMap["target/stage3-package-resources/$stageLeaf/video-player"] = "video-player/"
$overlay = [ordered]@{
    build = [ordered]@{ beforeBuildCommand = "" }
    bundle = [ordered]@{
        targets = @("nsis")
        resources = $resourceMap
    }
}
$overlay | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $overlayPath -Encoding utf8

Push-Location $repoRoot
try {
    & npm.cmd run tauri -- build --config $overlayPath --bundles nsis
    if ($LASTEXITCODE -ne 0) { throw "Tauri NSIS bundle failed with exit code $LASTEXITCODE" }
}
finally {
    Pop-Location
}

$bundleRoot = Join-Path $repoRoot "src-tauri\target\release\bundle\nsis"
$installer = Get-ChildItem -LiteralPath $bundleRoot -File -Filter "*.exe" |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
if (-not $installer) {
    throw "Tauri did not produce an NSIS installer under $bundleRoot"
}
$packagePath = Join-Path $packageTarget $installer.Name
Copy-Item -LiteralPath $installer.FullName -Destination $packagePath

$result = [ordered]@{
    classification = "PRODUCTION CANDIDATE - LEGAL/LICENSE REVIEW REQUIRED"
    candidateLibmpv = $libmpvPath
    candidateLibmpvSha256 = $actualMpvHash
    resourceSource = $resourceSource
    resourceFileCount = (Get-ChildItem -LiteralPath $resourceSource -File -Recurse).Count
    resourceBytes = (Get-ChildItem -LiteralPath $resourceSource -File -Recurse | Measure-Object Length -Sum).Sum
    generatedTauriConfig = $overlayPath
    mediaHost = [ordered]@{
        filename = "sakurava-media-host.exe"
        bytes = (Get-Item -LiteralPath $hostSource).Length
        sha256 = (Get-FileHash -LiteralPath $hostSource -Algorithm SHA256).Hash
    }
    installer = $packagePath
    installerBytes = (Get-Item -LiteralPath $packagePath).Length
    installerSha256 = (Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash
}
$resultPath = Join-Path $manifestTarget "package-result.json"
$result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $resultPath -Encoding utf8
$result | ConvertTo-Json -Depth 10
