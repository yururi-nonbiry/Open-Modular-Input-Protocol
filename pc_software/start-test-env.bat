@echo off
title OMIP Development Environment

echo =================================================================
echo  Starting Open-Modular-Input-Protocol Development Environment
echo =================================================================
echo.
echo This script will start the UI and automatically launch the Python backend.
echo.
echo IMPORTANT:
echo 1. Make sure you have run 'pip install -r requirements.txt' in the 'pc_software' directory.
echo 2. Make sure you have run 'npm install' in the 'pc_software\ui' directory.
echo.
pause
echo.

REM Change directory to the UI folder, which is a subdirectory of this script's location.
cd /d "%~dp0ui"
if %errorlevel% neq 0 (
    echo ERROR: Could not change directory to '%~dp0ui'.
    echo Please run this script from the 'pc_software' directory.
    pause
    exit /b 1
)

echo Starting the application by running 'npm run dev'...
npm run dev

echo.
echo The development server has been shut down.
pause
