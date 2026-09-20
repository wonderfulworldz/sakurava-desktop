param(
    [Parameter(Mandatory = $true)]
    [string]$BaseCandidateRoot,
    [string]$WorkRoot = "",
    [string]$OutputRoot = ""
)

$ErrorActionPreference = "Stop"

$expectedMpvCommit = "41f6a645068483470267271e1d09966ca3b9f413"
$expectedFfmpegCommit = "bf1b838f2ab88b4f8fd83443325c782ea0e0f7fa"
$expectedBaseMpvHash = "6F312FD78D309B389436307C29066F227046FC64CEC5061D027DCE802BF91286"
$referenceCustomMpvHash = "70D798A0B5CDB0B4E3FEFE06267FBF7EB606AC5584174E215FF999965EDA6006"
$customLibraryName = "libmpv-sakurava-2.dll"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$baseCandidateRootPath = [System.IO.Path]::GetFullPath($BaseCandidateRoot)

if ([string]::IsNullOrWhiteSpace($WorkRoot)) {
    $WorkRoot = Join-Path $repoRoot "src-tauri\target\video-player-mpv-engine-work"
}
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot "src-tauri\target\video-player-engine-runtime\mpv-0.41.0"
}
$workRootPath = [System.IO.Path]::GetFullPath($WorkRoot)
$outputRootPath = [System.IO.Path]::GetFullPath($OutputRoot)
$targetRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "src-tauri\target")).TrimEnd('\') + '\'
foreach ($path in @($workRootPath, $outputRootPath)) {
    if (-not $path.StartsWith($targetRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Engine work and output roots must remain under the ignored repository target root: $path"
    }
    if (Test-Path -LiteralPath $path) {
        throw "Refusing to overwrite an existing engine path: $path"
    }
}

$patchPath = Join-Path $repoRoot "patches\mpv\0.41.0-sakurava-rendered-subtitle-geometry.patch"
$baseMpvSource = Join-Path $baseCandidateRootPath "source\mpv"
$baseRuntimeRoot = Join-Path $baseCandidateRootPath "runtime\libmpv-0.41.0-gpl-false"
$candidateManifestPath = Join-Path $baseCandidateRootPath "manifest\production-candidate.json"
$dependencyManifestPath = Join-Path $baseCandidateRootPath "manifest\dependency-closure.json"
$toolchainRoot = Join-Path $baseCandidateRootPath "toolchain\msys64"
$clangBin = Join-Path $toolchainRoot "clang64\bin"
$usrBin = Join-Path $toolchainRoot "usr\bin"
$ffmpegPrefix = Join-Path $baseCandidateRootPath "install\ffmpeg"
$mesonPath = Join-Path $clangBin "meson.exe"
$ninjaPath = Join-Path $clangBin "ninja.exe"
$sourceRoot = Join-Path $workRootPath "source\mpv"
$buildRoot = Join-Path $workRootPath "build\mpv"
$installRoot = Join-Path $workRootPath "install\mpv"
$stageRuntime = Join-Path $workRootPath "runtime-stage"

function Assert-RequiredFile {
    param([string]$Path, [string]$Description)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "$Description is missing: $Path"
    }
}

function Assert-RequiredDirectory {
    param([string]$Path, [string]$Description)
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        throw "$Description is missing: $Path"
    }
}

function Get-Sha256 {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

function Invoke-CheckedCommand {
    param([string]$Command, [string[]]$Arguments, [string]$FailureMessage)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$FailureMessage (exit code $LASTEXITCODE)"
    }
}

foreach ($requiredFile in @(
    $patchPath,
    $candidateManifestPath,
    $dependencyManifestPath,
    (Join-Path $baseRuntimeRoot "libmpv-2.dll"),
    $mesonPath,
    $ninjaPath
)) {
    Assert-RequiredFile -Path $requiredFile -Description "Required engine-build input"
}
foreach ($requiredDirectory in @($baseMpvSource, $ffmpegPrefix, $clangBin, $usrBin)) {
    Assert-RequiredDirectory -Path $requiredDirectory -Description "Required engine-build input"
}

$candidateManifest = Get-Content -LiteralPath $candidateManifestPath -Raw | ConvertFrom-Json
$dependencyManifest = Get-Content -LiteralPath $dependencyManifestPath -Raw | ConvertFrom-Json
if ($candidateManifest.mpv.tag -ne "v0.41.0" -or
    $candidateManifest.mpv.commit -ne $expectedMpvCommit -or
    $candidateManifest.ffmpeg.tag -ne "n9.0.1" -or
    $candidateManifest.ffmpeg.commit -ne $expectedFfmpegCommit -or
    $candidateManifest.ffmpeg.gpl -ne $false -or
    $candidateManifest.ffmpeg.nonfree -ne $false -or
    -not ($candidateManifest.mpv.options -contains "-Dgpl=false") -or
    $candidateManifest.runtime.unresolvedDependencyCount -ne 0 -or
    @($dependencyManifest.unresolved).Count -ne 0) {
    throw "Base production-candidate provenance or licensing profile does not match the accepted engine contract"
}
$baseLibraryPath = Join-Path $baseRuntimeRoot "libmpv-2.dll"
$baseLibraryHash = Get-Sha256 -Path $baseLibraryPath
if ($baseLibraryHash -ne $expectedBaseMpvHash) {
    throw "Base libmpv hash mismatch: expected $expectedBaseMpvHash, got $baseLibraryHash"
}
foreach ($dependency in @($dependencyManifest.bundled)) {
    $dependencyPath = Join-Path $baseRuntimeRoot $dependency.name
    Assert-RequiredFile -Path $dependencyPath -Description "Base runtime dependency $($dependency.name)"
    $actualDependencyHash = Get-Sha256 -Path $dependencyPath
    if ($actualDependencyHash -ne $dependency.sha256) {
        throw "Base runtime dependency hash mismatch for $($dependency.name): expected $($dependency.sha256), got $actualDependencyHash"
    }
}

$baseSourceCommit = (& git -C $baseMpvSource rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $baseSourceCommit -ne $expectedMpvCommit) {
    throw "Base mpv source is not at the accepted v0.41.0 commit"
}

New-Item -ItemType Directory -Path $workRootPath -Force | Out-Null
try {
    Invoke-CheckedCommand -Command "git" -Arguments @(
        "clone", "--no-hardlinks", "--branch", "v0.41.0", "--single-branch", "--",
        $baseMpvSource, $sourceRoot
    ) -FailureMessage "Failed to create a clean pinned mpv source workspace"

    $clonedCommit = (& git -C $sourceRoot rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $clonedCommit -ne $expectedMpvCommit) {
        throw "Cloned mpv source is not at the accepted v0.41.0 commit"
    }
    $initialStatus = @(& git -C $sourceRoot status --short --untracked-files=no)
    if ($LASTEXITCODE -ne 0 -or $initialStatus.Count -ne 0) {
        throw "Cloned mpv source is not clean before applying the Sakurava patch"
    }

    Invoke-CheckedCommand -Command "git" -Arguments @(
        "-C", $sourceRoot, "apply", "--check", "--whitespace=error-all", $patchPath
    ) -FailureMessage "Sakurava mpv patch does not apply cleanly to the accepted source"
    Invoke-CheckedCommand -Command "git" -Arguments @(
        "-C", $sourceRoot, "apply", "--whitespace=error-all", $patchPath
    ) -FailureMessage "Failed to apply the Sakurava mpv patch"

    $expectedPatchedPaths = @("player/command.c", "sub/osd.c", "sub/osd.h", "sub/osd_state.h")
    $actualPatchedPaths = @(& git -C $sourceRoot diff --name-only) | Sort-Object
    if ($LASTEXITCODE -ne 0 -or @(Compare-Object ($expectedPatchedPaths | Sort-Object) $actualPatchedPaths).Count -ne 0) {
        throw "Applied mpv patch changed paths outside the accepted four-file engine boundary"
    }

    $oldPath = $env:PATH
    $oldPkgConfigPath = $env:PKG_CONFIG_PATH
    try {
        $env:PATH = "$clangBin;$usrBin;$oldPath"
        $env:PKG_CONFIG_PATH = "$(Join-Path $ffmpegPrefix 'lib\pkgconfig');$(Join-Path $toolchainRoot 'clang64\lib\pkgconfig')"
        $mesonInstallRoot = $installRoot.Replace('\', '/')

        $mesonOptions = @(
            "-Dprefix=$mesonInstallRoot",
            "-Dlibmpv=true",
            "-Dcplayer=false",
            "-Ddefault_library=shared",
            "-Dgpl=false",
            "-Dd3d11=enabled",
            "-Dd3d-hwaccel=enabled",
            "-Dlua=disabled",
            "-Djavascript=disabled",
            "-Dcaca=disabled",
            "-Dlibbluray=disabled",
            "-Dlibavdevice=disabled",
            "-Ddirect3d=disabled",
            "-Dgl=disabled",
            "-Dvulkan=disabled",
            "-Dvaapi=disabled",
            "-Dd3d9-hwaccel=disabled"
        )
        Invoke-CheckedCommand -Command $mesonPath -Arguments (@("setup", $buildRoot, $sourceRoot) + $mesonOptions) -FailureMessage "mpv Meson configuration failed"
        Invoke-CheckedCommand -Command $ninjaPath -Arguments @("-C", $buildRoot, "libmpv-2.dll") -FailureMessage "Custom libmpv build failed"
    }
    finally {
        $env:PATH = $oldPath
        $env:PKG_CONFIG_PATH = $oldPkgConfigPath
    }

    $builtLibraryPath = Join-Path $buildRoot "libmpv-2.dll"
    Assert-RequiredFile -Path $builtLibraryPath -Description "Built custom libmpv"

    New-Item -ItemType Directory -Path $stageRuntime -Force | Out-Null
    Copy-Item -Path (Join-Path $baseRuntimeRoot "*") -Destination $stageRuntime -Recurse
    Copy-Item -LiteralPath $builtLibraryPath -Destination (Join-Path $stageRuntime $customLibraryName)
    $customLibraryPath = Join-Path $stageRuntime $customLibraryName
    $customLibraryHash = Get-Sha256 -Path $customLibraryPath

    $metadataRoot = Join-Path $stageRuntime "metadata"
    $legalRoot = Join-Path $stageRuntime "legal"
    New-Item -ItemType Directory -Path $metadataRoot, $legalRoot -Force | Out-Null

    $normalizedDependencies = [ordered]@{
        entry = $customLibraryName
        entrySha256 = $customLibraryHash
        preservedUpstreamEntry = [ordered]@{
            name = "libmpv-2.dll"
            sha256 = $baseLibraryHash
        }
        bundled = @($dependencyManifest.bundled | ForEach-Object {
            [ordered]@{ name = $_.name; sha256 = $_.sha256; bytes = $_.bytes }
        })
        unresolved = @()
    }
    $normalizedDependencies | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $metadataRoot "dependency-closure.json") -Encoding utf8

    $licenseCopies = @(
        @{ Source = (Join-Path $baseMpvSource "LICENSE.LGPL"); Target = "mpv-LICENSE.LGPL" },
        @{ Source = (Join-Path $baseMpvSource "Copyright"); Target = "mpv-Copyright" },
        @{ Source = (Join-Path $baseCandidateRootPath "source\ffmpeg\LICENSE.md"); Target = "FFmpeg-LICENSE.md" },
        @{ Source = (Join-Path $baseCandidateRootPath "source\ffmpeg\COPYING.LGPLv2.1"); Target = "FFmpeg-COPYING.LGPLv2.1" },
        @{ Source = (Join-Path $baseCandidateRootPath "source\ffmpeg\COPYING.LGPLv3"); Target = "FFmpeg-COPYING.LGPLv3" },
        @{ Source = (Join-Path $toolchainRoot "clang64\share\doc\zimg\COPYING"); Target = "zimg-COPYING" }
    )
    foreach ($item in $licenseCopies) {
        Assert-RequiredFile -Path $item.Source -Description "Required engine legal input"
        Copy-Item -LiteralPath $item.Source -Destination (Join-Path $legalRoot $item.Target)
    }
    $msysLicenseRoot = Join-Path $toolchainRoot "clang64\share\licenses"
    foreach ($packageName in @(
        "brotli", "bzip2", "expat", "fontconfig", "freetype", "fribidi", "glib2",
        "graphite2", "harfbuzz", "lcms2", "libc++", "libdovi", "libiconv",
        "libjpeg-turbo", "libplacebo", "libpng", "libunibreak", "pcre2", "shaderc",
        "spirv-cross", "vulkan-headers", "vulkan-loader", "zlib"
    )) {
        $licenseSource = Join-Path $msysLicenseRoot $packageName
        if (Test-Path -LiteralPath $licenseSource -PathType Container) {
            Copy-Item -LiteralPath $licenseSource -Destination (Join-Path $legalRoot $packageName) -Recurse
        }
    }

    $patchHash = Get-Sha256 -Path $patchPath
    $engineManifest = [ordered]@{
        formatVersion = 1
        engine = "mpv"
        engineVersion = "0.41.0"
        source = [ordered]@{
            tag = "v0.41.0"
            commit = $expectedMpvCommit
            patch = "patches/mpv/0.41.0-sakurava-rendered-subtitle-geometry.patch"
            patchSha256 = $patchHash
            patchedPaths = $expectedPatchedPaths
        }
        ffmpeg = [ordered]@{
            tag = "n9.0.1"
            commit = $expectedFfmpegCommit
            gpl = $false
            nonfree = $false
        }
        toolchain = $candidateManifest.toolchain
        mesonOptions = $candidateManifest.mpv.options
        baseRuntime = [ordered]@{
            filename = "libmpv-2.dll"
            sha256 = $baseLibraryHash
        }
        customRuntime = [ordered]@{
            filename = $customLibraryName
            bytes = (Get-Item -LiteralPath $customLibraryPath).Length
            sha256 = $customLibraryHash
            referenceSha256 = $referenceCustomMpvHash
        }
        property = "sakurava-sub-rendered-geometry"
        dependencyManifest = "metadata/dependency-closure.json"
    }
    $engineManifestPath = Join-Path $metadataRoot "sakurava-engine-build.json"
    $engineManifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $engineManifestPath -Encoding utf8

    $outputParent = Split-Path -Parent $outputRootPath
    New-Item -ItemType Directory -Path $outputParent -Force | Out-Null
    Move-Item -LiteralPath $stageRuntime -Destination $outputRootPath

    [ordered]@{
        status = "SAKURAVA_CUSTOM_MPV_ENGINE_READY"
        sourceCommit = $expectedMpvCommit
        patch = $patchPath
        patchSha256 = $patchHash
        patchedPaths = $expectedPatchedPaths
        outputRoot = $outputRootPath
        customLibrary = (Join-Path $outputRootPath $customLibraryName)
        customLibraryBytes = $engineManifest.customRuntime.bytes
        customLibrarySha256 = $customLibraryHash
        referenceCustomLibrarySha256 = $referenceCustomMpvHash
        referenceHashMatched = ($customLibraryHash -eq $referenceCustomMpvHash)
        baseLibrarySha256 = $baseLibraryHash
    } | ConvertTo-Json -Depth 10
}
catch {
    throw
}
