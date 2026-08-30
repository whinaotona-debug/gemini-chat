@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js が見つかりません。https://nodejs.org からインストールしてください。
  pause
  exit /b 1
)
if not exist node_modules (
  echo 初回セットアップ中...
  call npm install
)
echo.
echo Gemini チャットを起動します: http://localhost:3847
echo.
start "" http://localhost:3847
node server.js
pause
