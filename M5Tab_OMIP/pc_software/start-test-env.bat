@echo off
setlocal ENABLEEXTENSIONS ENABLEDELAYEDEXPANSION

rem ------------------------------------------------------------
rem OMIP Test Environment Launcher
rem ------------------------------------------------------------

set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"
set "UI_DIR=%BASE_DIR%\ui"
set "VENV_DIR=%BASE_DIR%\venv"
set "DEV_SERVER_PORT=5173"
set "VITE_DEV_SERVER_URL=http://localhost:%DEV_SERVER_PORT%"

echo ==============================================
echo   OMIP Test Environment Launcher (Windows)
echo ==============================================

rem Verify npm is available
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm was not found in PATH. Install Node.js / npm first.
    goto :end
)

rem Capture Node major version (for troubleshooting vite-plugin-electron on Node 22+)
for /f "usebackq delims=" %%A in (`node -v 2^>nul`) do (
    set "NODE_VERSION=%%A"
)
if defined NODE_VERSION (
    set "NODE_VERSION=!NODE_VERSION:~1!"
    for /f "tokens=1 delims=." %%B in ("!NODE_VERSION!") do set "NODE_MAJOR=%%B"
    if defined NODE_MAJOR (
        if !NODE_MAJOR! GEQ 22 (
            echo [WARN] Detected Node.js v!NODE_VERSION!. vite-plugin-electron may crash on Node 22+. Consider using Node 20.x if Electron fails to start.
        )
    )
)

rem Ensure npm dependencies are installed once before opening new terminals
if not exist "%UI_DIR%\node_modules" (
    echo [INFO] Installing npm dependencies in "%UI_DIR%" - first run may take a while...
    pushd "%UI_DIR%"
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. Aborting launch.
        popd
        goto :end
    )
    popd
)

rem Launch Vite dev server
echo [INFO] Launching Vite dev server on port %DEV_SERVER_PORT% in a new window...
start "OMIP UI (Vite)" cmd /k "cd /d ""%UI_DIR%"" && npm run dev -- --port %DEV_SERVER_PORT% --strictPort"

rem Launch Electron shell (handled by vite-plugin-electron)
rem echo [INFO] Launching Electron shell in a new window...
rem start "OMIP Electron" cmd /k "cd /d ""%UI_DIR%"" && set VITE_DEV_SERVER_URL=%VITE_DEV_SERVER_URL% && npx electron ."

rem Launch Python backend if the virtual environment is available
if exist "%VENV_DIR%\Scripts\activate.bat" (
    echo [INFO] Launching Python backend in a new window using venv...
    start "OMIP Backend" cmd /k "cd /d ""%BASE_DIR%"" && call ""%VENV_DIR%\Scripts\activate.bat"" && python backend.py"
) else (
    echo [WARN] Python virtual environment not found at "%VENV_DIR%". Backend was not started.
    echo        Create it with: python -m venv "%VENV_DIR%" ^&^& "%VENV_DIR%\Scripts\activate" ^&^& pip install -r requirements.txt
)

echo.
echo [INFO] All launch commands have been issued. Close this window or press any key to exit.
pause >nul

:end
endlocal
