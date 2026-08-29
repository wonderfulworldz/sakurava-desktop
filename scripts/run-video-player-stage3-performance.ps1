param(
    [Parameter(Mandatory = $true)]
    [string]$OutputRoot,
    [Parameter(Mandatory = $true)]
    [string]$Fixture,
    [Parameter(Mandatory = $true)]
    [string]$EngineRoot,
    [Parameter(Mandatory = $true)]
    [string]$AssetsRoot,
    [string]$HostExecutable = "D:\sakurava-desktop\src-tauri\target\release\sakurava-media-host.exe",
    [int]$LifecycleCycles = 3,
    [int]$LongPlaybackSeconds = 60
)

$ErrorActionPreference = "Stop"
$outputRootPath = [System.IO.Path]::GetFullPath($OutputRoot)
$fixturePath = [System.IO.Path]::GetFullPath($Fixture)
$engineRootPath = [System.IO.Path]::GetFullPath($EngineRoot)
$assetsRootPath = [System.IO.Path]::GetFullPath($AssetsRoot)
$hostPath = [System.IO.Path]::GetFullPath($HostExecutable)
if (Test-Path -LiteralPath $outputRootPath) { throw "OutputRoot must not already exist: $outputRootPath" }
foreach ($required in @($fixturePath, $hostPath, (Join-Path $engineRootPath "libmpv-2.dll"), (Join-Path $assetsRootPath "video-player.html"))) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Required file is missing: $required" }
}
if ($LifecycleCycles -lt 1 -or $LongPlaybackSeconds -lt 20) { throw "LifecycleCycles or LongPlaybackSeconds is outside the bounded Stage 3 range" }
New-Item -ItemType Directory -Path $outputRootPath | Out-Null

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
public static class Stage3WindowInput {
  public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hwnd, out Rect rect);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hwnd, ref Point point);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
  public static IntPtr[] VisibleWindows(uint processId) {
    var values = new List<IntPtr>();
    EnumWindows((hwnd, state) => { uint pid; GetWindowThreadProcessId(hwnd, out pid); if (pid == processId && IsWindowVisible(hwnd)) values.Add(hwnd); return true; }, IntPtr.Zero);
    return values.ToArray();
  }
  public static int[] ClientSize(IntPtr hwnd) { Rect rect; return GetClientRect(hwnd, out rect) ? new [] { rect.Right - rect.Left, rect.Bottom - rect.Top } : new [] { 0, 0 }; }
  public static void Click(IntPtr hwnd, int x, int y) {
    var point = new Point { X = x, Y = y };
    SetForegroundWindow(hwnd);
    ClientToScreen(hwnd, ref point);
    SetCursorPos(point.X, point.Y);
    Thread.Sleep(75);
    mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
    mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
  }
}
"@

function Start-Stage3Host([string]$name) {
    $webViewRoot = Join-Path $outputRootPath "$name-webview2"
    New-Item -ItemType Directory -Path $webViewRoot -Force | Out-Null
    $start = [System.Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $hostPath
    $start.UseShellExecute = $false
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.CreateNoWindow = $false
    foreach ($argument in @("--engine-root", $engineRootPath, "--assets-root", $assetsRootPath, "--webview-data-root", $webViewRoot)) { $start.ArgumentList.Add($argument) }
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $start
    $clock = [System.Diagnostics.Stopwatch]::StartNew()
    if (-not $process.Start()) { throw "Could not start release media host" }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $handshake = [ordered]@{ protocolVersion = 3; requestId = "$name-handshake"; kind = [ordered]@{ kind = "handshake"; payload = @{ parentPid = $PID } } } | ConvertTo-Json -Compress
    $open = [ordered]@{ protocolVersion = 3; requestId = "$name-open"; kind = [ordered]@{ kind = "openSource"; payload = [ordered]@{ sessionId = "$name-session"; sourceIdentity = "V-STAGE3-$name"; canonicalPath = $fixturePath; displayName = $name; resolution = "1280 x 720" } } } | ConvertTo-Json -Compress
    $process.StandardInput.WriteLine($handshake)
    $process.StandardInput.WriteLine($open)
    $process.StandardInput.Flush()
    [pscustomobject]@{ Name = $name; Process = $process; Clock = $clock; StdoutTask = $stdoutTask; StderrTask = $stderrTask }
}

function Stop-Stage3Host($hostRun) {
    $process = $hostRun.Process
    $exitedBeforeShutdown = $process.HasExited
    if (-not $exitedBeforeShutdown) {
        $shutdown = [ordered]@{ protocolVersion = 3; requestId = "$($hostRun.Name)-shutdown"; kind = [ordered]@{ kind = "shutdown" } } | ConvertTo-Json -Compress
        $process.StandardInput.WriteLine($shutdown)
        $process.StandardInput.Flush()
    }
    $cleanExit = $process.WaitForExit(10000)
    if (-not $cleanExit) { $process.Kill($true); $process.WaitForExit() } else { $process.WaitForExit() }
    $hostRun.Clock.Stop()
    $stdoutText = $hostRun.StdoutTask.GetAwaiter().GetResult()
    $stderrText = $hostRun.StderrTask.GetAwaiter().GetResult()
    $caseRoot = Join-Path $outputRootPath $hostRun.Name
    New-Item -ItemType Directory -Path $caseRoot -Force | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $caseRoot "stdout.log"), $stdoutText, [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText((Join-Path $caseRoot "stderr.log"), $stderrText, [System.Text.UTF8Encoding]::new($false))
    [pscustomobject]@{
        pid = $process.Id
        exitCode = $process.ExitCode
        elapsedMs = $hostRun.Clock.ElapsedMilliseconds
        exitedBeforeShutdown = $exitedBeforeShutdown
        cleanExitWithin10Seconds = $cleanExit
        stdout = $stdoutText
        stderr = $stderrText
        processStillExistsAfterExit = $null -ne (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)
    }
}

function Get-ResourceSample($process, [string]$phase, [long]$atMs) {
    $process.Refresh()
    $gpu = $null
    try {
        $counter = Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction Stop
        $matching = @($counter.CounterSamples | Where-Object { $_.InstanceName -match "pid_$($process.Id)_" })
        if ($matching.Count -gt 0) { $gpu = [Math]::Round(($matching | Measure-Object CookedValue -Sum).Sum, 3) }
    } catch { $gpu = $null }
    [ordered]@{
        phase = $phase
        atMs = $atMs
        workingSetBytes = $process.WorkingSet64
        privateBytes = $process.PrivateMemorySize64
        handles = $process.HandleCount
        totalProcessorTimeMs = [Math]::Round($process.TotalProcessorTime.TotalMilliseconds, 3)
        gpuEngineUtilizationPercentSample = $gpu
    }
}

$cycles = @()
for ($index = 1; $index -le $LifecycleCycles; $index++) {
    $hostRun = Start-Stage3Host "lifecycle-$index"
    Start-Sleep -Seconds 4
    $sample = if (-not $hostRun.Process.HasExited) { Get-ResourceSample $hostRun.Process "active-main" $hostRun.Clock.ElapsedMilliseconds } else { $null }
    $stopped = Stop-Stage3Host $hostRun
    $combined = "$($stopped.stdout)`n$($stopped.stderr)"
    $timings = @([regex]::Matches($combined, 'VIDEO_PLAYER_TIMING=([^;]+);VALUE=([0-9.]+)') | ForEach-Object { [ordered]@{ name = $_.Groups[1].Value; milliseconds = [double]$_.Groups[2].Value } })
    $cycles += [ordered]@{
        cycle = $index
        pid = $stopped.pid
        exitCode = $stopped.exitCode
        cleanExitWithin10Seconds = $stopped.cleanExitWithin10Seconds
        fileLoaded = $combined -match "VIDEO_PLAYER_ENGINE_EVENT=FILE_LOADED"
        swapchainAttached = $combined -match "VIDEO_PLAYER_DISPLAY_SWAPCHAIN=ATTACHED"
        hwdecD3d11va = $combined -match "hwdec:d3d11va"
        sourceLoadCountOne = $combined -match "source_load_count:1"
        engineReleased = $combined -match "VIDEO_PLAYER_ENGINE_RELEASED="
        compositionCleanup = $combined -match "VIDEO_PLAYER_CLEANUP=COMPOSITION_DETACHED;PLAYBACK_STOPPED"
        nextProcessAbsent = -not $stopped.processStillExistsAfterExit
        sample = $sample
        timings = $timings
    }
    $hostRun.Process.Dispose()
}

$longHost = Start-Stage3Host "bounded-long-playback"
$longSamples = @()
Start-Sleep -Seconds 5
$longHost.Process.Refresh()
$mainWindows = [Stage3WindowInput]::VisibleWindows([uint32]$longHost.Process.Id)
$mainWindow = if ($mainWindows.Count -gt 0) { $mainWindows[0] } else { [IntPtr]::Zero }
$uiActions = [ordered]@{ mainWindowFound = $mainWindow -ne [IntPtr]::Zero; absoluteSeekClick = $false; relativeSeekClick = $false; pipClick = $false; pipWindowFound = $false; returnClick = $false }
if ($mainWindow -ne [IntPtr]::Zero) {
    $size = [Stage3WindowInput]::ClientSize($mainWindow)
    if ($size[0] -gt 400 -and $size[1] -gt 200) {
        [Stage3WindowInput]::Click($mainWindow, [int]($size[0] * 0.45), $size[1] - 90)
        $uiActions.absoluteSeekClick = $true
        Start-Sleep -Milliseconds 900
        [Stage3WindowInput]::Click($mainWindow, 210, $size[1] - 32)
        Start-Sleep -Milliseconds 300
        [Stage3WindowInput]::Click($mainWindow, 150, $size[1] - 32)
        $uiActions.relativeSeekClick = $true
        Start-Sleep -Milliseconds 900
        [Stage3WindowInput]::Click($mainWindow, $size[0] - 94, $size[1] - 32)
        $uiActions.pipClick = $true
        Start-Sleep -Seconds 3
        $pipWindows = @([Stage3WindowInput]::VisibleWindows([uint32]$longHost.Process.Id) | Where-Object { $_ -ne $mainWindow })
        if ($pipWindows.Count -gt 0) {
            $pipWindow = $pipWindows[0]
            $uiActions.pipWindowFound = $true
            $longSamples += Get-ResourceSample $longHost.Process "active-pip" $longHost.Clock.ElapsedMilliseconds
            $pipSize = [Stage3WindowInput]::ClientSize($pipWindow)
            if ($pipSize[0] -gt 160 -and $pipSize[1] -gt 100) {
                [Stage3WindowInput]::Click($pipWindow, $pipSize[0] - 72, 42)
                $uiActions.returnClick = $true
            }
        }
    }
}

$sampleTargets = @(10, 20, 30, 40, 50 | Where-Object { $_ -lt $LongPlaybackSeconds }) + @($LongPlaybackSeconds)
foreach ($targetSecond in $sampleTargets) {
    $remaining = ($targetSecond * 1000) - $longHost.Clock.ElapsedMilliseconds
    if ($remaining -gt 0) { Start-Sleep -Milliseconds $remaining }
    if (-not $longHost.Process.HasExited) { $longSamples += Get-ResourceSample $longHost.Process "long-playback" $longHost.Clock.ElapsedMilliseconds }
}
$longStopped = Stop-Stage3Host $longHost
$longCombined = "$($longStopped.stdout)`n$($longStopped.stderr)"
$longTimings = @([regex]::Matches($longCombined, 'VIDEO_PLAYER_TIMING=([^;]+);VALUE=([0-9.]+)') | ForEach-Object { [ordered]@{ name = $_.Groups[1].Value; milliseconds = [double]$_.Groups[2].Value } })
$longResult = [ordered]@{
    requestedDurationSeconds = $LongPlaybackSeconds
    observedMs = $longStopped.elapsedMs
    pid = $longStopped.pid
    exitCode = $longStopped.exitCode
    cleanExitWithin10Seconds = $longStopped.cleanExitWithin10Seconds
    fileLoaded = $longCombined -match "VIDEO_PLAYER_ENGINE_EVENT=FILE_LOADED"
    swapchainAttached = $longCombined -match "VIDEO_PLAYER_DISPLAY_SWAPCHAIN=ATTACHED"
    hwdecD3d11va = $longCombined -match "hwdec:d3d11va"
    mainToPip = $longCombined -match "VIDEO_PLAYER_PIP=OPENED;SESSION_COUNT=1;CONTEXT_COUNT=1;SOURCE_LOAD_COUNT=1"
    pipToMain = $longCombined -match "VIDEO_PLAYER_PIP=RETURNED_MAIN;SESSION_COUNT=1;CONTEXT_COUNT=1;SOURCE_LOAD_COUNT=1"
    noEngineError = $longCombined -notmatch "PLAYBACK_ENGINE_ERROR|VIDEO_PLAYER_POLL_ERROR"
    engineReleased = $longCombined -match "VIDEO_PLAYER_ENGINE_RELEASED="
    compositionCleanup = $longCombined -match "VIDEO_PLAYER_CLEANUP=COMPOSITION_DETACHED;PLAYBACK_STOPPED"
    processAbsentAfterExit = -not $longStopped.processStillExistsAfterExit
    uiActions = $uiActions
    timings = $longTimings
    resourceSamples = $longSamples
}
$longHost.Process.Dispose()

$report = [ordered]@{
    classification = "BOUNDED STAGE 3 PERFORMANCE AND LIFECYCLE EVIDENCE - NO APPROVED BUDGET"
    generatedAt = (Get-Date).ToString("o")
    hostExecutable = $hostPath
    hostSha256 = (Get-FileHash -LiteralPath $hostPath -Algorithm SHA256).Hash
    fixture = $fixturePath
    fixtureSha256 = (Get-FileHash -LiteralPath $fixturePath -Algorithm SHA256).Hash
    lifecycleCycles = $cycles
    boundedLongPlayback = $longResult
    limitations = @(
        "Measurements are bounded observations, not leak or endurance certification.",
        "GPU counter samples may be null when Windows GPU Engine counters are unavailable.",
        "No performance budget or pass/fail threshold has been approved."
    )
}
$reportPath = Join-Path $outputRootPath "performance-report.json"
$report | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $reportPath -Encoding utf8
$report | ConvertTo-Json -Depth 30
