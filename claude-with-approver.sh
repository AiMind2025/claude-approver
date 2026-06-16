#!/bin/bash
# claude-with-approver.sh - 启动 Claude 并自动配置 MCP Server

# 全局 MCP 配置
GLOBAL_MCP="$HOME/.mcp.json"
LOCAL_MCP="./.mcp.json"

# 如果当前目录没有 .mcp.json，从全局复制一份
if [ ! -f "$LOCAL_MCP" ] && [ -f "$GLOBAL_MCP" ]; then
    cp "$GLOBAL_MCP" "$LOCAL_MCP"
    echo "✅ 已复制 MCP 配置到当前目录"
fi

# 启动 Claude
claude "$@"
