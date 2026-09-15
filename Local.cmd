@echo off
setlocal
cd /d "%~dp0"
if not defined IP set "IP=127.0.0.1"
if not exist node_modules (
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 goto :fail
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-local.ps1"
if errorlevel 1 goto :fail

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\clean-dist.ps1"
if errorlevel 1 goto :fail

call npm.cmd run build
if errorlevel 1 goto :fail

node scripts\local.mjs "%IP%"
if errorlevel 1 goto :fail
goto :end

:fail
echo.
echo Re Player failed to start.

:end
pause
