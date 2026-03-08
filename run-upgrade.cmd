@echo off
setlocal

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install it with:
  echo winget install OpenJS.NodeJS.LTS
  exit /b 1
)

node ai-upgrader.js
if errorlevel 1 (
  echo Upgrade failed.
  exit /b 1
)

echo Upgrade complete. Refresh index.html in your browser.
exit /b 0