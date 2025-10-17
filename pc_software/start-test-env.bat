@echo off
title OMIP Development Environment

echo =================================================================
echo  Starting Open-Modular-Input-Protocol Development Environment
echo =================================================================

REM Start Python backend in a new window
echo Starting Python backend (main.py)...
start "Python Backend" cmd /c "call %~dp0venv\Scripts\activate.bat && python %~dp0main.py"

REM Change directory to the UI folder
cd /d "%~dp0ui"
if %errorlevel% neq 0 (
    echo ERROR: Could not change directory to '%~dp0ui'.
    pause
    exit /b 1
)

REM Add a delay to wait for the backend to start
echo Waiting for backend to initialize...
timeout /t 5 /nobreak >nul

echo Starting the UI (Vite + Electron)...
npm run dev

echo.
echo The development server has been shut down.
pause