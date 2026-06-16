@echo off
:: start-approver-silent.bat - 静默启动审批服务器（无窗口）

setlocal
cd /d D:\projects\claude-approver

:: 加载配置
for /f "usebackq tokens=*" %%i in (config.env) do (
    echo %%i | findstr /b "#" >nul
    if errorlevel 1 (
        echo %%i | findstr /b "=" >nul
        if not errorlevel 1 (
            set "%%i" 2>nul
        )
    )
)

:: 静默启动（隐藏窗口）
start /min "" node server.js
