$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

function Write-Step([string]$Message) {
    Write-Host "[X 博士] $Message" -ForegroundColor Cyan
}

function Stop-WithGuide([string]$Message, [string]$Url) {
    Write-Host "[缺少环境] $Message" -ForegroundColor Red
    if ($Url) { Write-Host "下载地址：$Url" -ForegroundColor Yellow }
    exit 1
}

function Resolve-Python {
    if (Get-Command py -ErrorAction SilentlyContinue) {
        & py -3.11 -c "import sys" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { return "py -3.11" }
        & py -3 -c "import sys" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { return "py -3" }
    }
    if (Get-Command python -ErrorAction SilentlyContinue) {
        & python -c "import sys" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { return "python" }
    }
    return ""
}

function Invoke-Python([string]$Command, [string[]]$Arguments) {
    if ($Command.StartsWith("py ")) {
        $launcherArgs = $Command.Substring(3).Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)
        & py @launcherArgs @Arguments
    } else {
        & $Command @Arguments
    }
    if ($LASTEXITCODE -ne 0) { throw "Python 命令执行失败" }
}

function Resolve-FFmpeg {
    $bundled = Join-Path $PWD "bin\ffmpeg.exe"
    if (Test-Path $bundled) { return (Split-Path $bundled -Parent) }
    $portable = Join-Path $PWD ".runtime\ffmpeg\bin\ffmpeg.exe"
    if (Test-Path $portable) { return (Split-Path $portable -Parent) }
    $system = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if ($system) { return (Split-Path $system.Source -Parent) }

    Write-Step "未找到 FFmpeg，首次启动将下载便携版本（约 100 MB）"
    $runtime = Join-Path $PWD ".runtime"
    $archive = Join-Path $runtime "ffmpeg.zip"
    $expanded = Join-Path $runtime "ffmpeg-expanded"
    New-Item -ItemType Directory -Force -Path $runtime | Out-Null
    Invoke-WebRequest -UseBasicParsing -Uri "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -OutFile $archive
    if (Test-Path $expanded) { Remove-Item -LiteralPath $expanded -Recurse -Force }
    Expand-Archive -LiteralPath $archive -DestinationPath $expanded -Force
    $ffmpeg = Get-ChildItem -LiteralPath $expanded -Recurse -Filter ffmpeg.exe | Select-Object -First 1
    $ffprobe = Get-ChildItem -LiteralPath $expanded -Recurse -Filter ffprobe.exe | Select-Object -First 1
    if (-not $ffmpeg -or -not $ffprobe) { throw "下载包中未找到 ffmpeg.exe/ffprobe.exe" }
    $target = Join-Path $runtime "ffmpeg\bin"
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Copy-Item -LiteralPath $ffmpeg.FullName -Destination (Join-Path $target "ffmpeg.exe") -Force
    Copy-Item -LiteralPath $ffprobe.FullName -Destination (Join-Path $target "ffprobe.exe") -Force
    Remove-Item -LiteralPath $archive -Force
    Remove-Item -LiteralPath $expanded -Recurse -Force
    return $target
}

Write-Step "检查运行环境"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Stop-WithGuide "需要 Node.js 20.19 或更高版本。" "https://nodejs.org/zh-cn/download"
}
$nodeVersion = (& node -p "process.versions.node").Trim().Split(".")
$nodeMajor = [int]$nodeVersion[0]
$nodeMinor = [int]$nodeVersion[1]
if ($nodeMajor -lt 20 -or ($nodeMajor -eq 20 -and $nodeMinor -lt 19)) {
    Stop-WithGuide "当前 Node.js 版本过低，需要 20.19 或更高版本。" "https://nodejs.org/zh-cn/download"
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Stop-WithGuide "没有找到 npm，请重新安装 Node.js。" "https://nodejs.org/zh-cn/download"
}

$pythonCommand = Resolve-Python
if (-not $pythonCommand) {
    Stop-WithGuide "需要 Python 3.10 或更高版本。安装时请勾选 Add Python to PATH。" "https://www.python.org/downloads/windows/"
}

$runtimeDir = Join-Path $PWD ".runtime"
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$venvPython = Join-Path $PWD ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Step "创建项目专用 Python 环境"
    Invoke-Python $pythonCommand @("-m", "venv", ".venv")
}

$requirementsHash = (Get-FileHash -Algorithm SHA256 "requirements.txt").Hash
$pipStamp = Join-Path $runtimeDir "requirements.sha256"
$installedHash = if (Test-Path $pipStamp) { (Get-Content -Raw $pipStamp).Trim() } else { "" }
if ($installedHash -ne $requirementsHash) {
    Write-Step "安装 Python 依赖"
    & $venvPython -m pip install --disable-pip-version-check -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw "Python 依赖安装失败" }
    Set-Content -LiteralPath $pipStamp -Value $requirementsHash -Encoding ASCII
}

$packageHash = (Get-FileHash -Algorithm SHA256 "package-lock.json").Hash
$npmStamp = Join-Path $runtimeDir "package-lock.sha256"
$npmInstalledHash = if (Test-Path $npmStamp) { (Get-Content -Raw $npmStamp).Trim() } else { "" }
if (-not (Test-Path "node_modules") -or $npmInstalledHash -ne $packageHash) {
    Write-Step "安装 Node.js 依赖"
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "Node.js 依赖安装失败" }
    Set-Content -LiteralPath $npmStamp -Value $packageHash -Encoding ASCII
}

$ffmpegDir = Resolve-FFmpeg
$env:PATH = "$ffmpegDir;$env:PATH"
$env:X_DOCTOR_PYTHON = $venvPython
$env:OPEN_BROWSER = "1"
$env:PORT = "0"

Write-Step "构建本地应用"
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "前端构建失败" }

Write-Step "启动完成后会自动打开浏览器；关闭本窗口即可退出"
& node server\local-api.mjs
exit $LASTEXITCODE
