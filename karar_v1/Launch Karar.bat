@echo off
setlocal
title Karar AI Tutor
cd /d "%~dp0"
echo Starting (or safely restarting) Karar and checking Ollama...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-karar.ps1"
if errorlevel 1 (
  echo.
  echo Karar could not start. Read the message above, then press any key to close.
  pause
)
