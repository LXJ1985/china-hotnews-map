@echo off
rem China HotNews Map - one-click local server (ASCII only)
cd /d %~dp0

rem If port 8080 is already serving, a server is already running - just open it.
netstat -ano | findstr :8080 | findstr LISTENING >nul
if %errorlevel%==0 (
  echo ============================================
  echo   Port 8080 is already in use.
  echo   A server is ALREADY RUNNING - just open:
  echo   http://localhost:8080
  echo ============================================
  pause
  exit /b 0
)

echo ============================================
echo   China HotNews Map - local server
echo   When "server on" appears, open in browser:
echo   http://localhost:8080
echo   (Close this window or press Ctrl+C to stop)
echo ============================================
echo.
where node >nul 2>nul
if %errorlevel%==0 (
  node server.js
) else (
  echo [info] node not in PATH, using managed runtime...
  "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-6\node.exe" server.js
)
echo.
echo [server exited] press any key to close.
pause >nul
