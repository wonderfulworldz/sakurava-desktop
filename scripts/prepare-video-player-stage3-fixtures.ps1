param(
    [Parameter(Mandatory = $true)]
    [string]$OutputRoot,
    [string]$Baseline = "C:\Users\Working WW\AppData\Local\Temp\sakurava-video-player-production-stage-2\synthetic-h264-120s-embedded-subtitle.mp4"
)

$ErrorActionPreference = "Stop"
$expectedBaselineHash = "9D0A8238D9B7ED78DE6DF82F664E305534FB01A4D196E681C713E87463647853"
$outputRootPath = [System.IO.Path]::GetFullPath($OutputRoot)
$baselinePath = [System.IO.Path]::GetFullPath($Baseline)
if (Test-Path -LiteralPath $outputRootPath) {
    throw "OutputRoot must not already exist: $outputRootPath"
}
if (-not (Test-Path -LiteralPath $baselinePath -PathType Leaf)) {
    throw "Approved synthetic H.264 baseline is missing: $baselinePath"
}
$actualBaselineHash = (Get-FileHash -LiteralPath $baselinePath -Algorithm SHA256).Hash
if ($actualBaselineHash -ne $expectedBaselineHash) {
    throw "Approved synthetic H.264 baseline hash mismatch"
}

New-Item -ItemType Directory -Path $outputRootPath | Out-Null
$valid = Join-Path $outputRootPath "valid-h264-no-audio.mp4"
$truncated = Join-Path $outputRootPath "truncated-h264.mp4"
$damaged = Join-Path $outputRootPath "damaged-packets-h264.mp4"
$removeAfterValidation = Join-Path $outputRootPath "remove-after-validation.mp4"
$zero = Join-Path $outputRootPath "zero-byte.mp4"
$unsupported = Join-Path $outputRootPath "unsupported-codec-container.bin"
$validSrt = Join-Path $outputRootPath "valid-external.srt"
$malformedSrt = Join-Path $outputRootPath "malformed-external.srt"
$missing = Join-Path $outputRootPath "missing-before-launch.mp4"

Copy-Item -LiteralPath $baselinePath -Destination $valid
Copy-Item -LiteralPath $baselinePath -Destination $truncated
Copy-Item -LiteralPath $baselinePath -Destination $damaged
Copy-Item -LiteralPath $baselinePath -Destination $removeAfterValidation

$truncatedStream = [System.IO.File]::Open($truncated, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
try {
    $truncatedStream.SetLength([long]($truncatedStream.Length * 0.55))
}
finally {
    $truncatedStream.Dispose()
}

$damagedStream = [System.IO.File]::Open($damaged, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
try {
    $offset = [long]($damagedStream.Length * 0.01)
    $damagedStream.Position = $offset
    $zeros = [byte[]]::new(65536)
    $damagedStream.Write($zeros, 0, $zeros.Length)
}
finally {
    $damagedStream.Dispose()
}

[System.IO.File]::WriteAllBytes($zero, [byte[]]::new(0))
[System.IO.File]::WriteAllBytes($unsupported, [System.Text.Encoding]::UTF8.GetBytes("SAKURAVA_STAGE3_UNSUPPORTED_MEDIA_FIXTURE`n"))
[System.IO.File]::WriteAllText($validSrt, "1`r`n00:00:01,000 --> 00:00:04,000`r`nSakurava Stage 3 subtitle`r`n`r`n", [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($malformedSrt, "not an index`r`nnot a timestamp`r`nmalformed subtitle payload`r`n", [System.Text.UTF8Encoding]::new($false))

$fixturePaths = @($valid, $truncated, $damaged, $removeAfterValidation, $zero, $unsupported, $validSrt, $malformedSrt)
$fixtures = foreach ($path in $fixturePaths) {
    $item = Get-Item -LiteralPath $path
    [ordered]@{
        filename = $item.Name
        path = $item.FullName
        bytes = $item.Length
        sha256 = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash
    }
}
$manifest = [ordered]@{
    classification = "DISPOSABLE SYNTHETIC STAGE 3 FIXTURES"
    generatedAt = (Get-Date).ToString("o")
    baseline = [ordered]@{ path = $baselinePath; sha256 = $actualBaselineHash }
    fixtures = @($fixtures)
    missingBeforeLaunchPath = $missing
    notGenerated = @(
        "HEVC: no approved provenance-safe fixture without adding an encoder stack",
        "Non-monotonic timestamps: no deterministic stream-copy fixture established"
    )
}
$manifestPath = Join-Path $outputRootPath "fixture-manifest.json"
$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestPath -Encoding utf8
$manifest | ConvertTo-Json -Depth 10
