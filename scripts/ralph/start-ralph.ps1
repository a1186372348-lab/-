param(
    [ValidateSet("claude", "codex")]
    [string]$Agent = "claude"
)

$ErrorActionPreference = "Stop"

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $scriptDir

python ".\ralph.py" $Agent
