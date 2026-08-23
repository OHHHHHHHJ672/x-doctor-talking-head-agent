$ErrorActionPreference = "Continue"
Set-Location (Split-Path -Parent $PSScriptRoot)

$failures = 0
function Report([string]$Name, [bool]$Ok, [string]$Detail) {
    if ($Ok) {
        Write-Host "[正常] $Name - $Detail" -ForegroundColor Green
    } else {
        Write-Host "[异常] $Name - $Detail" -ForegroundColor Red
        $script:failures++
    }
}

$node = Get-Command node -ErrorAction SilentlyContinue
Report "Node.js" ($null -ne $node) $(if ($node) { (& node --version) } else { "请安装 Node.js 20.19+" })
$npm = Get-Command npm -ErrorAction SilentlyContinue
Report "npm" ($null -ne $npm) $(if ($npm) { (& npm --version) } else { "Node.js 安装不完整" })
$python = Get-Command python -ErrorAction SilentlyContinue
$py = Get-Command py -ErrorAction SilentlyContinue
Report "Python" ($null -ne $python -or $null -ne $py) $(if ($python) { (& python --version 2>&1) } elseif ($py) { (& py -3 --version 2>&1) } else { "请安装 Python 3.10+" })

$localFfmpeg = @(
    (Join-Path $PWD "bin\ffmpeg.exe"),
    (Join-Path $PWD ".runtime\ffmpeg\bin\ffmpeg.exe")
) | Where-Object { Test-Path $_ } | Select-Object -First 1
$systemFfmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
Report "FFmpeg" ($null -ne $localFfmpeg -or $null -ne $systemFfmpeg) $(if ($localFfmpeg) { $localFfmpeg } elseif ($systemFfmpeg) { $systemFfmpeg.Source } else { "下次运行 start.bat 时会自动下载" })

Report "Node 依赖" (Test-Path "node_modules") $(if (Test-Path "node_modules") { "已安装" } else { "start.bat 会自动安装" })
Report "Python 虚拟环境" (Test-Path ".venv\Scripts\python.exe") $(if (Test-Path ".venv\Scripts\python.exe") { "已安装" } else { "start.bat 会自动创建" })
Report "生产构建" (Test-Path "dist\index.html") $(if (Test-Path "dist\index.html") { "已生成" } else { "start.bat 会自动构建" })

$settings = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "XDoctorTalkingHead\settings.json" } else { Join-Path $PWD "user-data\settings.json" }
$keyConfigured = $false
if ($env:RUNNINGHUB_API_KEY) { $keyConfigured = $true }
if (Test-Path $settings) {
    try {
        $json = Get-Content -Raw $settings | ConvertFrom-Json
        if ($json.apiKey) { $keyConfigured = $true }
    } catch {}
}
Report "RunningHub API Key" $keyConfigured $(if ($keyConfigured) { "已在本机配置（不会显示内容）" } else { "启动软件后在设置中填写" })

Write-Host ""
if ($failures -eq 0) {
    Write-Host "诊断完成：核心环境正常。" -ForegroundColor Green
} else {
    Write-Host "诊断完成：发现 $failures 项尚未就绪。start.bat 会自动处理可自动修复的项目。" -ForegroundColor Yellow
}
exit 0
