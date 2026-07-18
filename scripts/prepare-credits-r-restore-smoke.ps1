[CmdletBinding()]
param([string]$Root)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Root = if ([string]::IsNullOrWhiteSpace($Root)) {
    Join-Path $repositoryRoot 'manual-smoke\runtime-data\credits-r-restore-06'
} else {
    $Root
}
$runtimeRoot = [System.IO.Path]::GetFullPath($Root)
$allowedRoot = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot 'manual-smoke\runtime-data'))
if (-not $runtimeRoot.StartsWith($allowedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'The disposable runtime root must be inside manual-smoke\runtime-data.'
}

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
$databasePath = Join-Path $runtimeRoot 'sakurava.sqlite'
if (Test-Path -LiteralPath $databasePath) {
    throw "Disposable Restore fixture already exists at $databasePath. Inspect it or choose a new -Root; this script will not overwrite it."
}

Push-Location $repositoryRoot
try {
    cargo run --manifest-path .\src-tauri\Cargo.toml --bin credits_r_smoke -- prepare-restore --root $runtimeRoot
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}
