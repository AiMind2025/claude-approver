@echo off
title Claude Approver Server

echo.
echo  ================================================
echo    Claude Code Mobile Approval Server (Enhanced)
echo  ================================================
echo.

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found. Install: https://nodejs.org
    pause
    exit /b 1
)

:: Add winget ngrok to PATH if needed
where ngrok >nul 2>&1
if errorlevel 1 (
    if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\ngrok.exe" (
        set "PATH=%LOCALAPPDATA%\Microsoft\WinGet\Links;%PATH%"
    )
)

:: Check ngrok
where ngrok >nul 2>&1
if errorlevel 1 (
    echo  [WARN] ngrok not installed (needed for external access)
    echo         Run: install-ngrok.bat
    echo         Or set TUNNEL=none to skip
    echo.
)

:: Load config.env if exists
if exist "%~dp0config.env" (
    echo  [INFO] Loading config.env ...
    for /f "usebackq tokens=*" %%i in ("%~dp0config.env") do (
        echo %%i | findstr /b "#" >nul
        if errorlevel 1 (
            echo %%i | findstr /b "=" >nul
            if not errorlevel 1 (
                set "%%i" 2>nul
            )
        )
    )
)

echo  [OK] Starting server ...
echo.

node "%~dp0server.js"
pause
