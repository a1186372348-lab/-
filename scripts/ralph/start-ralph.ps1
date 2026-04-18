param(
    [ValidateSet("claude", "codex")]
    [string]$Agent = "claude",

    [bool]$KeepOpen = $true
)

$ErrorActionPreference = "Stop"

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $scriptDir

python ".\ralph.py" $Agent
$exitCode = $LASTEXITCODE

switch ($exitCode) {
    0 {
        Write-Host "`nRalph 已完成，终端将保留当前结果。" -ForegroundColor Green
    }
    130 {
        Write-Host "`nRalph 已被用户中断。" -ForegroundColor Yellow
    }
    default {
        Write-Host "`nRalph 异常结束，退出码: $exitCode" -ForegroundColor Red
    }
}

if ($KeepOpen) {
    Write-Host "按 Enter 关闭窗口..." -ForegroundColor DarkGray
    Read-Host | Out-Null
}

exit $exitCode
