@echo off
echo.
echo  ==================================
echo    ngrok Installer
echo  ==================================
echo.

:: Try winget first
echo  [1/3] Trying winget ...
where winget >nul 2>&1
if not errorlevel 1 (
    winget install Ngrok.Ngrok --accept-package-agreements --accept-source-agreements
    if not errorlevel 1 (
        echo.
        echo  [OK] ngrok installed via winget
        goto :auth
    )
)

:: Try scoop
echo  [2/3] Trying scoop ...
where scoop >nul 2>&1
if not errorlevel 1 (
    scoop install ngrok
    if not errorlevel 1 (
        echo.
        echo  [OK] ngrok installed via scoop
        goto :auth
    )
)

:: Direct download
echo  [3/3] Direct download ...
set "NGROK_DIR=%LOCALAPPDATA%\ngrok"
if not exist "%NGROK_DIR%" mkdir "%NGROK_DIR%"

echo        Downloading ngrok-v3-stable-windows-amd64.zip ...
curl -L -o "%NGROK_DIR%\ngrok.zip" "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip"
if errorlevel 1 (
    echo  [ERROR] Download failed. Visit: https://ngrok.com/download
    pause
    exit /b 1
)

echo        Extracting ...
powershell -Command "Expand-Archive -Force '%NGROK_DIR%\ngrok.zip' '%NGROK_DIR%'"
del "%NGROK_DIR%\ngrok.zip"

:: Add to PATH
echo        Adding to PATH ...
setx PATH "%PATH%;%NGROK_DIR%" >nul 2>&1
set "PATH=%PATH%;%NGROK_DIR%"

echo.
echo  [OK] ngrok installed to %NGROK_DIR%

:auth
echo.
echo  ----------------------------------
echo    Configure ngrok authtoken
echo  ----------------------------------
echo.
echo    1. Register: https://dashboard.ngrok.com
echo    2. Copy your authtoken
echo    3. Paste below (or press Enter to skip)
echo.
set /p "AUTHTOKEN=  Enter authtoken: "

if not "%AUTHTOKEN%"=="" (
    ngrok config add-authtoken %AUTHTOKEN%
    echo.
    echo  [OK] authtoken configured
    echo       Add to config.env:
    echo       NGROK_AUTHTOKEN=%AUTHTOKEN%
) else (
    echo.
    echo  [SKIP] authtoken not set
    echo         Free tier works but URL changes on restart
)

echo.
echo  ----------------------------------
echo    Done! Run start.bat to launch.
echo  ----------------------------------
echo.
pause
