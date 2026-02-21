@echo off
echo Building OMIP Production Environment...

REM 1. Build Vite UI
echo [1/2] Building Vite UI frontend...
cd M5Tab_OMIP\pc_software\ui
call npm install
call npm run build
if %errorlevel% neq 0 (
    echo Frontend build failed.
    pause
    exit /b %errorlevel%
)
cd ..\..\..

REM 2. Build C# Backend
echo [2/2] Publishing C# Backend...
cd pc_software_cs
dotnet publish -c Release -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -r win-x64 -o ..\dist
if %errorlevel% neq 0 (
    echo Backend build failed.
    pause
    exit /b %errorlevel%
)
cd ..

echo.
echo Build Complete! 
echo The production executable can be found in the "dist" directory.
pause
