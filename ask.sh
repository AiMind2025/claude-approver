#!/bin/bash
# Claude 提问助手 - 向用户提问并等待回复
#
# 用法:
#   bash ask.sh "问题内容" "补充说明" [超时秒数] [对话ID]
#
# 参数:
#   $1 - 问题内容（必填）
#   $2 - 补充说明（可选）
#   $3 - 超时秒数（可选，默认 600 = 10分钟）
#   $4 - 对话ID（可选，用于追问，首次不传）
#
# 输出:
#   stdout - 用户的回复内容
#
# 返回值:
#   0 - 收到回复
#   2 - 超时

set -euo pipefail

API="http://localhost:${PORT:-8765}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
QUESTION="${1:?用法: ask.sh <问题> [说明] [超时秒] [对话ID]}"
DESC="${2:-}"
TIMEOUT="${3:-600}"
CONV_ID="${4:-}"

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

# 构建 JSON
if [ -n "$CONV_ID" ]; then
  JSON_BODY=$(jq -n --arg q "$QUESTION" --arg desc "$DESC" --arg cid "$CONV_ID" \
    '{command: $q, description: $desc, type: "question", conversationId: $cid}' 2>/dev/null) || {
    echo "❌ jq 未安装" >&2; exit 1
  }
else
  JSON_BODY=$(jq -n --arg q "$QUESTION" --arg desc "$DESC" \
    '{command: $q, description: $desc, type: "question"}' 2>/dev/null) || {
    echo "❌ jq 未安装" >&2; exit 1
  }
fi

# 创建提问请求
echo "📤 发送提问..." >&2
RESPONSE=$(curl -s -X POST "$API/api/request" \
  -H "Content-Type: application/json" \
  "${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"}" \
  -d "$JSON_BODY" 2>/dev/null) || {
  echo "❌ 无法连接审批服务器 ($API)" >&2
  echo "   请先启动: node server.js" >&2
  exit 1
}

REQUEST_ID=$(echo "$RESPONSE" | jq -r '.request.id // empty')
if [ -z "$REQUEST_ID" ]; then
  echo "❌ 创建请求失败: $RESPONSE" >&2
  exit 1
fi

echo "💬 等待用户回复... (ID: $REQUEST_ID, 超时: ${TIMEOUT}s)" >&2
echo "   对话ID: $REQUEST_ID (可用于追问)" >&2

# 轮询等待回复
START_TIME=$(date +%s)
while true; do
  ELAPSED=$(( $(date +%s) - START_TIME ))
  if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
    echo "⏰ 等待回复超时 (${TIMEOUT}s)" >&2
    exit 2
  fi

  RESULT=$(curl -s "$API/api/check?id=$REQUEST_ID" \
    "${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"}" 2>/dev/null || echo '{"status":"pending"}')
  STATUS=$(echo "$RESULT" | jq -r '.status // "pending"')

  case "$STATUS" in
    replied)
      # 获取用户回复
      REPLY=$(echo "$RESULT" | jq -r '.request.reply // empty')
      if [ -n "$REPLY" ]; then
        # 输出回复到 stdout（供 Claude 读取）
        echo "$REPLY"
        exit 0
      fi
      ;;
    closed)
      echo "💬 对话已结束" >&2
      exit 0
      ;;
    pending)
      if [ $(( ELAPSED % 5 )) -eq 0 ]; then
        REMAINING=$(( TIMEOUT - ELAPSED ))
        echo -ne "\r   ⏳ 等待回复中... 还剩 ${REMAINING}s  " >&2
      fi
      sleep 1
      ;;
    *)
      echo "⚠️ 未知状态: $STATUS" >&2
      exit 3
      ;;
  esac
done
