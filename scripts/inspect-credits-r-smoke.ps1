[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Root
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtimeRoot = [System.IO.Path]::GetFullPath($Root)
$sentinel = Join-Path $runtimeRoot '.sakurava-disposable'
$databasePath = Join-Path $runtimeRoot 'sakurava.sqlite'
$liveRoot = [System.IO.Path]::GetFullPath((Join-Path $env:APPDATA 'app.sakurava.desktop'))
if (-not (Test-Path -LiteralPath $sentinel -PathType Leaf)) {
    throw 'The disposable runtime sentinel is missing.'
}
if (-not (Test-Path -LiteralPath $databasePath -PathType Leaf)) {
    throw 'The disposable SQLite database is missing.'
}
if ($runtimeRoot.StartsWith($liveRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    $liveRoot.StartsWith($runtimeRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'The requested inspection root collides with the live app-data directory.'
}

Push-Location $repositoryRoot
try {
    cargo run --manifest-path .\src-tauri\Cargo.toml --bin credits_r_smoke -- inspect --root $runtimeRoot
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}
