@echo off
echo Starting OMIP Development Environment...

REM Start Vite Dev Server in a new window
echo Starting Vite Dev Server...
start cmd /k "cd M5Tab_OMIP\pc_software\ui && npm run dev"

REM Wait for Vite to initialize
timeout /t 3 /nobreak > nul

REM Run C# Backend with Development Flag
echo Starting C# Backend...
cd pc_software_cs
dotnet run -- --dev
