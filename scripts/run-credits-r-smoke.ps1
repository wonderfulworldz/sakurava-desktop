[CmdletBinding()]
param(
    [string]$Root,
    [switch]$KeepWorkspaceProcesses
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Root = if ([string]::IsNullOrWhiteSpace($Root)) {
    Join-Path $repositoryRoot 'manual-smoke\runtime-data\credits-r-legacy'
} else {
    $Root
}
$branch = (git -C $repositoryRoot branch --show-current).Trim()
if ($branch -ne 'batch-41-8-5-credits-import-export-ref-r') {
    throw "Expected batch-41-8-5-credits-import-export-ref-r, found $branch."
}
$runtimeRoot = [System.IO.Path]::GetFullPath($Root)
$sentinel = Join-Path $runtimeRoot '.sakurava-disposable'
$databasePath = Join-Path $runtimeRoot 'sakurava.sqlite'
$backupPath = Join-Path $runtimeRoot 'backups'
$liveRoot = [System.IO.Path]::GetFullPath((Join-Path $env:APPDATA 'app.sakurava.desktop'))
if (-not (Test-Path -LiteralPath $sentinel -PathType Leaf)) {
    throw 'The disposable runtime sentinel is missing.'
}
if (-not (Test-Path -LiteralPath $databasePath -PathType Leaf)) {
    throw 'The disposable SQLite database is missing. Run prepare-credits-r-smoke.ps1 first.'
}
if ($runtimeRoot.StartsWith($liveRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    $liveRoot.StartsWith($runtimeRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'The requested disposable root collides with the live app-data directory.'
}

if (-not $KeepWorkspaceProcesses) {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.ProcessId -ne $PID -and $_.CommandLine -and
            $_.CommandLine -like "*$repositoryRoot*" -and
            ($_.Name -in @('node.exe', 'cargo.exe', 'sakurava-desktop.exe'))
        } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
        }
}

Write-Host 'DISPOSABLE MODE'
Write-Host "Disposable root: $runtimeRoot"
Write-Host "Database path:    $databasePath"
Write-Host "Backup path:      $backupPath"
Write-Host 'Live app-data is not being used. The override exists only for this debug process.'

Push-Location $repositoryRoot
try {
    $env:SAKURAVA_DISPOSABLE_DATA_DIR = $runtimeRoot
    npm.cmd run tauri dev
    exit $LASTEXITCODE
}
finally {
    Remove-Item Env:SAKURAVA_DISPOSABLE_DATA_DIR -ErrorAction SilentlyContinue
    Pop-Location
}
