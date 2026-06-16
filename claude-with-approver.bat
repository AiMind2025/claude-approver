@echo off
:: claude-with-approver.bat - 启动 Claude 并自动配置 MCP Server

set GLOBAL_MCP=%USERPROFILE%\.mcp.json
set LOCAL_MCP=.mcp.json

:: 如果当前目录没有 .mcp.json，从全局复制一份
if not exist "%LOCAL_MCP%" (
    if exist "%GLOBAL_MCP%" (
        copy "%GLOBAL_MCP%" "%LOCAL_MCP%" >nul
        echo [OK] MCP config copied to current directory
    )
)

:: 启动 Claude
claude %*
