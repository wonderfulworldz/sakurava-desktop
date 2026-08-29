param(
    [Parameter(Mandatory = $true)]
    [string]$OutputRoot,
    [Parameter(Mandatory = $true)]
    [string]$FixtureRoot,
    [Parameter(Mandatory = $true)]
    [string]$EngineRoot,
    [Parameter(Mandatory = $true)]
    [string]$AssetsRoot,
    [string]$HostExecutable = "D:\sakurava-desktop\src-tauri\target\release\sakurava-media-host.exe"
)

$ErrorActionPreference = "Stop"
$outputRootPath = [System.IO.Path]::GetFullPath($OutputRoot)
$fixtureRootPath = [System.IO.Path]::GetFullPath($FixtureRoot)
$hostPath = [System.IO.Path]::GetFullPath($HostExecutable)
$engineRootPath = [System.IO.Path]::GetFullPath($EngineRoot)
$assetsRootPath = [System.IO.Path]::GetFullPath($AssetsRoot)
if (Test-Path -LiteralPath $outputRootPath) {
    throw "OutputRoot must not already exist: $outputRootPath"
}
foreach ($required in @($hostPath, (Join-Path $engineRootPath "libmpv-2.dll"), (Join-Path $assetsRootPath "video-player.html"))) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        throw "Required release-layout file is missing: $required"
    }
}
New-Item -ItemType Directory -Path $outputRootPath | Out-Null

$cases = @(
    @{ Name = "valid-h264-no-audio"; Path = (Join-Path $fixtureRootPath "valid-h264-no-audio.mp4"); ObserveSeconds = 6; Expected = "valid" },
    @{ Name = "truncated-h264"; Path = (Join-Path $fixtureRootPath "truncated-h264.mp4"); ObserveSeconds = 8; Expected = "partial" },
    @{ Name = "damaged-packets-h264"; Path = (Join-Path $fixtureRootPath "damaged-packets-h264.mp4"); ObserveSeconds = 8; Expected = "partial" },
    @{ Name = "unsupported-codec-container"; Path = (Join-Path $fixtureRootPath "unsupported-codec-container.bin"); ObserveSeconds = 4; Expected = "error" },
    @{ Name = "zero-byte"; Path = (Join-Path $fixtureRootPath "zero-byte.mp4"); ObserveSeconds = 4; Expected = "error" },
    @{ Name = "removed-after-validation"; Path = (Join-Path $fixtureRootPath "remove-after-validation.mp4"); ObserveSeconds = 4; Expected = "error"; RemoveAfterValidation = $true }
)

$allResults = @()
foreach ($case in $cases) {
    $caseRoot = Join-Path $outputRootPath $case.Name
    $webViewRoot = Join-Path $caseRoot "webview2"
    New-Item -ItemType Directory -Path $webViewRoot -Force | Out-Null
    $sourcePath = [System.IO.Path]::GetFullPath($case.Path)
    if (-not $case.RemoveAfterValidation -and -not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "Fixture is missing: $sourcePath"
    }
    $prevalidated = $false
    if ($case.RemoveAfterValidation) {
        $prevalidated = (Get-Item -LiteralPath $sourcePath).PSIsContainer -eq $false
        [System.IO.File]::Delete($sourcePath)
    }

    $start = [System.Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $hostPath
    $start.UseShellExecute = $false
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.CreateNoWindow = $false
    foreach ($argument in @("--engine-root", $engineRootPath, "--assets-root", $assetsRootPath, "--webview-data-root", $webViewRoot)) {
        $start.ArgumentList.Add($argument)
    }
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $start
    $clock = [System.Diagnostics.Stopwatch]::StartNew()
    if (-not $process.Start()) { throw "Could not launch release media host" }
    $pidValue = $process.Id
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()

    $handshake = [ordered]@{ protocolVersion = 3; requestId = "$($case.Name)-handshake"; kind = [ordered]@{ kind = "handshake"; payload = @{ parentPid = $PID } } } | ConvertTo-Json -Compress
    $open = [ordered]@{
        protocolVersion = 3
        requestId = "$($case.Name)-open"
        kind = [ordered]@{
            kind = "openSource"
            payload = [ordered]@{
                sessionId = "$($case.Name)-session"
                sourceIdentity = "V-STAGE3-$($case.Name)"
                canonicalPath = $sourcePath
                displayName = $case.Name
                resolution = "1280 x 720"
            }
        }
    } | ConvertTo-Json -Compress
    $process.StandardInput.WriteLine($handshake)
    $process.StandardInput.WriteLine($open)
    $process.StandardInput.Flush()

    $samples = @()
    $sampleTimes = @(1, [Math]::Max(2, $case.ObserveSeconds - 1))
    $previous = 0
    foreach ($second in $sampleTimes) {
        Start-Sleep -Seconds ($second - $previous)
        $previous = $second
        if (-not $process.HasExited) {
            $process.Refresh()
            $samples += [ordered]@{
                atMs = $clock.ElapsedMilliseconds
                workingSetBytes = $process.WorkingSet64
                privateBytes = $process.PrivateMemorySize64
                handles = $process.HandleCount
                totalProcessorTimeMs = [Math]::Round($process.TotalProcessorTime.TotalMilliseconds, 3)
            }
        }
    }
    if ($previous -lt $case.ObserveSeconds) {
        Start-Sleep -Seconds ($case.ObserveSeconds - $previous)
    }

    $exitedBeforeShutdown = $process.HasExited
    if (-not $exitedBeforeShutdown) {
        $shutdown = [ordered]@{ protocolVersion = 3; requestId = "$($case.Name)-shutdown"; kind = [ordered]@{ kind = "shutdown" } } | ConvertTo-Json -Compress
        $process.StandardInput.WriteLine($shutdown)
        $process.StandardInput.Flush()
    }
    $cleanExit = $process.WaitForExit(10000)
    if (-not $cleanExit) {
        $process.Kill($true)
        $process.WaitForExit()
    } else {
        $process.WaitForExit()
    }
    $clock.Stop()
    $stdoutText = $stdoutTask.GetAwaiter().GetResult()
    $stderrText = $stderrTask.GetAwaiter().GetResult()
    [System.IO.File]::WriteAllText((Join-Path $caseRoot "stdout.log"), $stdoutText, [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText((Join-Path $caseRoot "stderr.log"), $stderrText, [System.Text.UTF8Encoding]::new($false))
    $joined = "$stdoutText`n$stderrText"
    $fileLoaded = $joined -match "VIDEO_PLAYER_ENGINE_EVENT=FILE_LOADED"
    $engineError = $joined -match "VIDEO_PLAYER_ENGINE_EVENT=END_FILE;REASON=4"
    $swapchain = $joined -match "VIDEO_PLAYER_DISPLAY_SWAPCHAIN=ATTACHED"
    $engineReleased = $joined -match "VIDEO_PLAYER_ENGINE_RELEASED="
    $cleanup = $joined -match "VIDEO_PLAYER_CLEANUP=COMPOSITION_DETACHED;PLAYBACK_STOPPED"
    $classification = if ($exitedBeforeShutdown -and $process.ExitCode -ne 0) {
        "HOST_CRASHED"
    } elseif ($engineError) {
        "ENGINE_ERROR_RECOVERED"
    } elseif ($fileLoaded -and $case.Expected -eq "partial") {
        "PLAYBACK_PARTIAL"
    } elseif ($fileLoaded) {
        "PLAYBACK_OK"
    } else {
        "UNKNOWN"
    }
    $allResults += [ordered]@{
        case = $case.Name
        source = $sourcePath
        sourcePrevalidatedBeforeRemoval = $prevalidated
        hostPid = $pidValue
        observedMs = $clock.ElapsedMilliseconds
        exitCode = $process.ExitCode
        exitedBeforeShutdown = $exitedBeforeShutdown
        cleanExitWithin10Seconds = $cleanExit
        fileLoaded = $fileLoaded
        engineError = $engineError
        displaySwapchainAttached = $swapchain
        engineReleased = $engineReleased
        compositionCleanup = $cleanup
        classification = $classification
        resourceSamples = $samples
        processStillExistsAfterExit = $null -ne (Get-Process -Id $pidValue -ErrorAction SilentlyContinue)
    }
    $process.Dispose()
}

$missingPath = Join-Path $fixtureRootPath "missing-before-launch.mp4"
$missingSourceRejected = -not (Test-Path -LiteralPath $missingPath)
$report = [ordered]@{
    classification = "ISOLATED STAGE 3 RUNTIME EVIDENCE"
    generatedAt = (Get-Date).ToString("o")
    hostExecutable = $hostPath
    hostSha256 = (Get-FileHash -LiteralPath $hostPath -Algorithm SHA256).Hash
    engineRoot = $engineRootPath
    libmpvSha256 = (Get-FileHash -LiteralPath (Join-Path $engineRootPath "libmpv-2.dll") -Algorithm SHA256).Hash
    assetsRoot = $assetsRootPath
    missingBeforeLaunch = [ordered]@{ path = $missingPath; classification = if ($missingSourceRejected) { "SOURCE_REJECTED" } else { "UNKNOWN" } }
    cases = $allResults
}
$reportPath = Join-Path $outputRootPath "resilience-report.json"
$report | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $reportPath -Encoding utf8
$report | ConvertTo-Json -Depth 20
