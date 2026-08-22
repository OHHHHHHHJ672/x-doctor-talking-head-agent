@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto :no_node

if exist "node_modules" goto :deps_ok
call npm install
if errorlevel 1 goto :npm_fail
:deps_ok

echo [INFO] Checking local workflow API on :8787 ...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8787" ^| findstr "LISTENING"') do (
  taskkill /PID %%a /F >nul 2>nul
)

echo [INFO] Starting local API in background, same window.
start "" /b cmd /c "cd /d ""%~dp0"" && npm run dev:api"
echo [INFO] Browser will open after 3 seconds - allows dev server to start listening first.
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:5173/"
call npm run dev -- --host 0.0.0.0 --port 5173
goto :eof

:no_node
echo [ERROR] Node.js not found. Install Node.js 18+.
pause
exit /b 1

:npm_fail
echo [ERROR] npm install failed.
pause
exit /b 1
