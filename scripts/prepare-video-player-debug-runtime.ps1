param(
    [string]$EngineRoot = ""
)

$ErrorActionPreference = "Stop"

$expectedMpvHash = "6F312FD78D309B389436307C29066F227046FC64CEC5061D027DCE802BF91286"
$expectedMpvCommit = "41f6a645068483470267271e1d09966ca3b9f413"
$expectedFfmpegCommit = "bf1b838f2ab88b4f8fd83443325c782ea0e0f7fa"
$expectedPatchPath = "patches/mpv/0.41.0-sakurava-rendered-subtitle-geometry.patch"
$customLibraryName = "libmpv-sakurava-2.dll"

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if ([string]::IsNullOrWhiteSpace($EngineRoot)) {
    $EngineRoot = Join-Path $repoRoot "src-tauri\target\video-player-engine-runtime\mpv-0.41.0"
}
$runtimeRoot = [System.IO.Path]::GetFullPath($EngineRoot)
$debugRoot = Join-Path $repoRoot "src-tauri\target\debug"
$engineManifestPath = Join-Path $runtimeRoot "metadata\sakurava-engine-build.json"
$dependencyManifestPath = Join-Path $runtimeRoot "metadata\dependency-closure.json"
$baseLibmpvPath = Join-Path $runtimeRoot "libmpv-2.dll"
$customLibmpvPath = Join-Path $runtimeRoot $customLibraryName
$hostPath = Join-Path $debugRoot "sakurava-media-host.exe"
$engineTarget = Join-Path $debugRoot "video-engine\mpv-0.41.0"
$uiTarget = Join-Path $debugRoot "video-player-ui"
$stageRoot = Join-Path $debugRoot ".video-player-debug-runtime-stage"
$stageEngine = Join-Path $stageRoot "video-engine\mpv-0.41.0"
$stageUi = Join-Path $stageRoot "video-player-ui"

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

function Assert-PathInsideDebugRoot {
    param([string]$Path)
    $resolvedDebugRoot = [System.IO.Path]::GetFullPath($debugRoot).TrimEnd('\') + '\'
    $resolvedPath = [System.IO.Path]::GetFullPath($Path)
    if (-not $resolvedPath.StartsWith($resolvedDebugRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to mutate a path outside the debug target root: $resolvedPath"
    }
}

function Invoke-CheckedCommand {
    param([string]$Command, [string[]]$Arguments, [string]$FailureMessage)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$FailureMessage (exit code $LASTEXITCODE)"
    }
}

function Get-Sha256 {
    param([string]$Path)
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try {
            return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "")
        }
        finally {
            $sha256.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

function Assert-RuntimeClosure {
    param([string]$Root, [object]$DependencyManifest, [object]$EngineManifest)

    Assert-RequiredFile -Path (Join-Path $Root "libmpv-2.dll") -Description "libmpv runtime"
    $actualHash = Get-Sha256 -Path (Join-Path $Root "libmpv-2.dll")
    if ($actualHash -ne $expectedMpvHash) {
        throw "libmpv hash mismatch: expected $expectedMpvHash, got $actualHash"
    }

    $customLibraryPath = Join-Path $Root $customLibraryName
    Assert-RequiredFile -Path $customLibraryPath -Description "Sakurava custom libmpv runtime"
    $actualCustomHash = Get-Sha256 -Path $customLibraryPath
    if ($actualCustomHash -ne $EngineManifest.customRuntime.sha256) {
        throw "Sakurava custom libmpv hash mismatch: expected $($EngineManifest.customRuntime.sha256), got $actualCustomHash"
    }

    foreach ($dependency in @($DependencyManifest.bundled)) {
        $dependencyPath = Join-Path $Root $dependency.name
        Assert-RequiredFile -Path $dependencyPath -Description "Runtime dependency $($dependency.name)"
        $actualDependencyHash = Get-Sha256 -Path $dependencyPath
        if ($actualDependencyHash -ne $dependency.sha256) {
            throw "Runtime dependency hash mismatch for $($dependency.name): expected $($dependency.sha256), got $actualDependencyHash"
        }
    }
}

function Assert-PlayerUiClosure {
    param([string]$Root)

    $entryPath = Join-Path $Root "video-player.html"
    Assert-RequiredFile -Path $entryPath -Description "Video Player UI entry"
    $entryText = Get-Content -LiteralPath $entryPath -Raw
    $assetMatches = [System.Text.RegularExpressions.Regex]::Matches(
        $entryText,
        '(?:src|href)=["''](?<path>[^"'']+)["'']',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )
    foreach ($match in $assetMatches) {
        $reference = $match.Groups['path'].Value
        if ($reference -match '^(?:[a-z]+:|//|#|data:)') {
            continue
        }
        $relativeReference = ($reference -split '[?#]', 2)[0].TrimStart('/', '\').Replace('/', '\')
        if ($relativeReference) {
            Assert-RequiredFile -Path (Join-Path $Root $relativeReference) -Description "Video Player UI asset $reference"
        }
    }
}

foreach ($required in @($engineManifestPath, $dependencyManifestPath, $baseLibmpvPath, $customLibmpvPath)) {
    Assert-RequiredFile -Path $required -Description "Required Sakurava engine artifact"
}

$engineManifest = Get-Content -LiteralPath $engineManifestPath -Raw | ConvertFrom-Json
$dependencyManifest = Get-Content -LiteralPath $dependencyManifestPath -Raw | ConvertFrom-Json
if ($engineManifest.formatVersion -ne 1 -or
    $engineManifest.engineVersion -ne "0.41.0" -or
    $engineManifest.source.commit -ne $expectedMpvCommit -or
    $engineManifest.source.patch -ne $expectedPatchPath -or
    $engineManifest.ffmpeg.commit -ne $expectedFfmpegCommit -or
    $engineManifest.ffmpeg.gpl -ne $false -or
    $engineManifest.ffmpeg.nonfree -ne $false -or
    $engineManifest.customRuntime.filename -ne $customLibraryName -or
    $engineManifest.property -ne "sakurava-sub-rendered-geometry" -or
    $dependencyManifest.entry -ne $customLibraryName -or
    $dependencyManifest.entrySha256 -ne $engineManifest.customRuntime.sha256 -or
    $dependencyManifest.preservedUpstreamEntry.sha256 -ne $expectedMpvHash -or
    @($dependencyManifest.unresolved).Count -ne 0) {
    throw "Sakurava engine provenance, licensing profile, or dependency closure does not match the accepted contract"
}
Assert-RuntimeClosure -Root $runtimeRoot -DependencyManifest $dependencyManifest -EngineManifest $engineManifest

Push-Location $repoRoot
try {
    Invoke-CheckedCommand -Command "npm.cmd" -Arguments @("run", "build") -FailureMessage "Video Player UI build failed"
    Invoke-CheckedCommand -Command "cargo" -Arguments @(
        "build",
        "--manifest-path",
        (Join-Path $repoRoot "src-tauri\Cargo.toml"),
        "--bin",
        "sakurava-media-host"
    ) -FailureMessage "Debug media-host build failed"
}
finally {
    Pop-Location
}

Assert-RequiredFile -Path $hostPath -Description "Debug media host"
$distRoot = Join-Path $repoRoot "dist"
Assert-PlayerUiClosure -Root $distRoot

foreach ($path in @($stageRoot, $engineTarget, $uiTarget)) {
    Assert-PathInsideDebugRoot -Path $path
}
if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $stageEngine -Force | Out-Null
New-Item -ItemType Directory -Path $stageUi -Force | Out-Null

try {
    Copy-Item -Path (Join-Path $runtimeRoot "*") -Destination $stageEngine -Recurse
    Copy-Item -Path (Join-Path $distRoot "*") -Destination $stageUi -Recurse
    Assert-RuntimeClosure -Root $stageEngine -DependencyManifest $dependencyManifest -EngineManifest $engineManifest
    Assert-PlayerUiClosure -Root $stageUi

    if (Test-Path -LiteralPath $engineTarget) {
        Remove-Item -LiteralPath $engineTarget -Recurse -Force
    }
    $engineParent = Split-Path -Parent $engineTarget
    New-Item -ItemType Directory -Path $engineParent -Force | Out-Null
    Move-Item -LiteralPath $stageEngine -Destination $engineTarget

    if (Test-Path -LiteralPath $uiTarget) {
        Remove-Item -LiteralPath $uiTarget -Recurse -Force
    }
    Move-Item -LiteralPath $stageUi -Destination $uiTarget
}
finally {
    if (Test-Path -LiteralPath $stageRoot) {
        Remove-Item -LiteralPath $stageRoot -Recurse -Force
    }
}

Assert-RequiredFile -Path $hostPath -Description "Debug media host"
Assert-RuntimeClosure -Root $engineTarget -DependencyManifest $dependencyManifest -EngineManifest $engineManifest
Assert-PlayerUiClosure -Root $uiTarget

[ordered]@{
    status = "VIDEO_PLAYER_DEBUG_RUNTIME_READY"
    mediaHost = $hostPath
    mediaHostSha256 = Get-Sha256 -Path $hostPath
    engineRoot = $engineTarget
    libmpvSha256 = Get-Sha256 -Path (Join-Path $engineTarget "libmpv-2.dll")
    customLibmpv = (Join-Path $engineTarget $customLibraryName)
    customLibmpvSha256 = Get-Sha256 -Path (Join-Path $engineTarget $customLibraryName)
    sourcePatch = $engineManifest.source.patch
    sourcePatchSha256 = $engineManifest.source.patchSha256
    bundledDependencyCount = @($dependencyManifest.bundled).Count
    playerUiRoot = $uiTarget
    playerUiEntry = (Join-Path $uiTarget "video-player.html")
} | ConvertTo-Json
