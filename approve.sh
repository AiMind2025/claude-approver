#!/bin/bash
# Claude 审批助手 - 注册命令并等待审批结果
#
# 用法（在 Claude Code 中）:
#   bash approve.sh "docker exec ..." "启动容器" "warning"
#
# 参数:
#   $1 - 命令内容
#   $2 - 描述（可选）
#   $3 - 风险等级: normal | warning | danger（可选，默认 normal）
#   $4 - 超时秒数（可选，默认 300 = 5分钟）
#
# Token 获取优先级:
#   1. 环境变量 AUTH_TOKEN
#   2. .data/auth.json 文件

set -euo pipefail

API="http://localhost:${PORT:-8765}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMMAND="${1:?用法: approve.sh <命令> [描述] [风险等级] [超时秒]}"
DESC="${2:-}"
RISK="${3:-normal}"
TIMEOUT="${4:-300}"

# 自动获取 Token
TOKEN="${AUTH_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -f "$SCRIPT_DIR/.data/auth.json" ]; then
  TOKEN=$(jq -r '.token // empty' "$SCRIPT_DIR/.data/auth.json" 2>/dev/null || true)
fi

# 构建鉴权 header 数组
AUTH_ARGS=()
if [ -n "$TOKEN" ]; then
  AUTH_ARGS=(-H "Authorization: Bearer $TOKEN")
fi

# 构建 JSON（分步避免嵌套引号问题）
JSON_BODY=$(jq -n --arg cmd "$COMMAND" --arg desc "$DESC" --arg risk "$RISK" \
  '{command: $cmd, description: $desc, risk: $risk}' 2>/dev/null) || {
  echo "❌ jq 未安装。请安装: winget install jq 或 https://jqlang.github.io/jq"
  exit 1
}

# 创建审批请求
echo "📤 发送审批请求..."
RESPONSE=$(curl -s -X POST "$API/api/request" \
  -H "Content-Type: application/json" \
  "${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"}" \
  -d "$JSON_BODY" 2>/dev/null) || {
  echo "❌ 无法连接审批服务器 (http://localhost:${PORT:-8765})"
  echo "   请先启动: node server.js"
  exit 1
}

REQUEST_ID=$(echo "$RESPONSE" | jq -r '.request.id // empty')
if [ -z "$REQUEST_ID" ]; then
  echo "❌ 创建请求失败: $RESPONSE"
  exit 1
fi

echo "📱 等待手机审批... (ID: $REQUEST_ID, 超时: ${TIMEOUT}s)"
echo "   打开 http://localhost:${PORT:-8765} 进行审批"

# 轮询等待审批结果
START_TIME=$(date +%s)
while true; do
  ELAPSED=$(( $(date +%s) - START_TIME ))
  if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
    echo "⏰ 审批超时 (${TIMEOUT}s)"
    exit 2
  fi

  RESULT=$(curl -s "$API/api/check?id=$REQUEST_ID" \
    "${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"}" 2>/dev/null || echo '{"status":"pending"}')
  STATUS=$(echo "$RESULT" | jq -r '.status // "pending"')

  case "$STATUS" in
    approved)
      echo "✅ 已批准！执行命令..."
      exit 0
      ;;
    rejected)
      echo "❌ 已拒绝，中止执行"
      exit 1
      ;;
    pending)
      # 每 5 秒显示等待状态
      if [ $(( ELAPSED % 5 )) -eq 0 ]; then
        REMAINING=$(( TIMEOUT - ELAPSED ))
        echo -ne "\r   ⏳ 等待中... 还剩 ${REMAINING}s  "
      fi
      sleep 1
      ;;
    *)
      echo "⚠️ 未知状态: $STATUS"
      exit 3
      ;;
  esac
done
