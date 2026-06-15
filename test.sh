#!/bin/bash
# Claude 审批服务器 - 一键测试脚本
# 用法: bash test.sh

set -euo pipefail

API="http://localhost:8765"
PASS=0
FAIL=0
TOKEN=""

green() { echo -e "\033[32m$1\033[0m"; }
red()   { echo -e "\033[31m$1\033[0m"; }
cyan()  { echo -e "\033[36m$1\033[0m"; }

check() {
  local name="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    green "  ✅ $name"
    PASS=$((PASS+1))
  else
    red "  ❌ $name"
    echo "     期望包含: $expected"
    echo "     实际返回: $actual"
    FAIL=$((FAIL+1))
  fi
}

echo ""
cyan "═══════════════════════════════════════════"
cyan "   Claude 审批服务器 - 自动化测试"
cyan "═══════════════════════════════════════════"
echo ""

# ─── 测试 1: 健康检查 ──────────────────────────────────
cyan "[1/11] 健康检查"
RESULT=$(curl -sf "$API/api/health" 2>/dev/null || echo '{"fail":true}')
check "服务可达" '"ok":true' "$RESULT"
check "返回隧道信息" '"tunnel"' "$RESULT"

# ─── 测试 2: 密码设置/登录 ─────────────────────────────
cyan "[2/11] 密码系统"

# 尝试设置密码（如果已设置会返回错误，那就登录）
SET_RESULT=$(curl -sf -X POST "$API/api/setup" \
  -H "Content-Type: application/json" \
  -d '{"password":"test9876"}' 2>/dev/null || echo '{}')

if echo "$SET_RESULT" | grep -q '"ok":true'; then
  TOKEN="test9876"
  green "  ✅ 密码已设置为 test9876"
  PASS=$((PASS+1))
else
  # 密码已存在，用已知密码登录
  # 先尝试 test9876，如果不行就试 test1234
  for TRY_PWD in test9876 test1234 admin1234; do
    LOGIN_RESULT=$(curl -sf -X POST "$API/api/login" \
      -H "Content-Type: application/json" \
      -d "{\"password\":\"$TRY_PWD\"}" 2>/dev/null || echo '{}')
    if echo "$LOGIN_RESULT" | grep -q '"ok":true'; then
      TOKEN="$TRY_PWD"
      green "  ✅ 已登录 (密码: $TRY_PWD)"
      PASS=$((PASS+1))
      break
    fi
  done
  if [ -z "$TOKEN" ]; then
    red "  ❌ 无法登录，请确认密码"
    FAIL=$((FAIL+1))
    echo ""
    red "提示: 删除 .data/auth.json 后重启可重置密码"
    exit 1
  fi
fi

# 测试错误密码
BAD_LOGIN=$(curl -sf -X POST "$API/api/login" \
  -H "Content-Type: application/json" \
  -d '{"password":"wrongpassword"}' 2>/dev/null || echo '{"error":"网络错误"}')
check "拒绝错误密码" '"error"' "$BAD_LOGIN"

# ─── 测试 3: 鉴权保护 ──────────────────────────────────
cyan "[3/11] 鉴权保护"
NO_AUTH=$(curl -sf "$API/api/pending" 2>/dev/null || echo '{"error":"网络错误"}')
check "无 Token 被拒绝" '"error"' "$NO_AUTH"

# ─── 测试 4: 创建审批请求 (normal) ─────────────────────
cyan "[4/11] 创建审批请求"

REQ_NORMAL=$(curl -sf -X POST "$API/api/request" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"command":"echo hello","description":"测试普通请求","risk":"normal"}' 2>/dev/null)
check "创建普通请求" '"ok":true' "$REQ_NORMAL"
ID_NORMAL=$(echo "$REQ_NORMAL" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

# ─── 测试 5: 创建审批请求 (danger) ─────────────────────
REQ_DANGER=$(curl -sf -X POST "$API/api/request" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"command":"rm -rf /tmp/test","description":"测试危险请求","risk":"danger"}' 2>/dev/null)
check "创建危险请求" '"ok":true' "$REQ_DANGER"
ID_DANGER=$(echo "$REQ_DANGER" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

# ─── 测试 6: 查看待审批列表 ────────────────────────────
cyan "[5/11] 待审批列表"
PENDING=$(curl -sf "$API/api/pending" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null)
check "列表包含请求" '"pending"' "$PENDING"

# ─── 测试 7: 查询单个请求状态 ──────────────────────────
cyan "[6/11] 查询状态"
STATUS=$(curl -sf "$API/api/check?id=$ID_NORMAL" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null)
check "状态为 pending" '"status":"pending"' "$STATUS"

# ─── 测试 8: 批准请求 ──────────────────────────────────
cyan "[7/11] 批准请求"
APPROVE_RESULT=$(curl -sf -X POST "$API/api/approve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"id\":\"$ID_NORMAL\"}" 2>/dev/null)
check "批准成功" '"status":"approved"' "$APPROVE_RESULT"

# 验证状态已变更
STATUS2=$(curl -sf "$API/api/check?id=$ID_NORMAL" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null)
check "状态已更新" '"status":"approved"' "$STATUS2"

# ─── 测试 9: 拒绝请求 ──────────────────────────────────
cyan "[8/11] 拒绝请求"
REJECT_RESULT=$(curl -sf -X POST "$API/api/reject" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"id\":\"$ID_DANGER\"}" 2>/dev/null)
check "拒绝成功" '"status":"rejected"' "$REJECT_RESULT"

# ─── 测试 10: 历史记录 ─────────────────────────────────
cyan "[9/11] 历史记录"
sleep 1
HISTORY=$(curl -sf "$API/api/completed" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null)
check "历史包含已批准" '"approved"' "$HISTORY"
check "历史包含已拒绝" '"rejected"' "$HISTORY"

# ─── 测试 11: 隧道信息 ─────────────────────────────────
cyan "[10/11] 隧道信息"
TUNNEL=$(curl -sf "$API/api/tunnel" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null)
check "隧道信息可达" '"type"' "$TUNNEL"

# ─── 测试 12: approve.sh 脚本 ──────────────────────────
cyan "[11/11] approve.sh 集成测试"
if [ -f "approve.sh" ]; then
  # 导出 TOKEN 给 approve.sh 使用
  export AUTH_TOKEN="$TOKEN"

  # 后台启动审批，然后立刻自动批准
  bash approve.sh "echo integration-test" "集成测试" "normal" 30 &
  SCRIPT_PID=$!
  sleep 2

  # 获取刚创建的请求 ID 并批准
  LATEST=$(curl -sf "$API/api/pending" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null)
  LATEST_ID=$(echo "$LATEST" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [ -n "$LATEST_ID" ]; then
    curl -sf -X POST "$API/api/approve" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{\"id\":\"$LATEST_ID\"}" > /dev/null 2>&1
    wait $SCRIPT_PID 2>/dev/null
    if [ $? -eq 0 ]; then
      green "  ✅ approve.sh 审批流程正常"
      PASS=$((PASS+1))
    else
      red "  ❌ approve.sh 返回值异常"
      FAIL=$((FAIL+1))
    fi
  else
    red "  ❌ 未找到脚本创建的请求"
    FAIL=$((FAIL+1))
    kill $SCRIPT_PID 2>/dev/null || true
  fi
else
  red "  ⏭️  approve.sh 不存在，跳过"
fi

# ─── 结果汇总 ────────────────────────────────────────────
echo ""
cyan "═══════════════════════════════════════════"
TOTAL=$((PASS+FAIL))
echo -e "  结果: ${PASS}/${TOTAL} 通过"
if [ $FAIL -eq 0 ]; then
  green "  🎉 全部通过！"
else
  red "  ⚠️  ${FAIL} 项失败"
fi
cyan "═══════════════════════════════════════════"
echo ""

exit $FAIL
