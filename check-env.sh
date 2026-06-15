#!/bin/bash
# 环境检测脚本 - 快速判断审批工具能否使用
# 用法: bash check-env.sh

green() { echo -e "\033[32m✅ $1\033[0m"; }
red()   { echo -e "\033[31m❌ $1\033[0m"; }
yellow(){ echo -e "\033[33m⚠️  $1\033[0m"; }
cyan()  { echo -e "\033[36m$1\033[0m"; }

echo ""
cyan "═══════════════════════════════════════"
cyan "   Claude 审批工具 - 环境检测"
cyan "═══════════════════════════════════════"
echo ""

SCORE=0
TOTAL=0

# 1. Node.js
cyan "[1/6] Node.js"
TOTAL=$((TOTAL+1))
if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  green "Node.js $NODE_VER"
  SCORE=$((SCORE+1))
else
  red "未安装 Node.js"
  echo "   安装: https://nodejs.org 或 winget install OpenJS.NodeJS"
fi

# 2. 本地端口
cyan "[2/6] 本地端口 (8765)"
TOTAL=$((TOTAL+1))
if curl -sf http://localhost:8765/api/health &>/dev/null; then
  green "服务器已在运行"
  SCORE=$((SCORE+1))
else
  yellow "服务器未运行 (启动后就好了)"
  echo "   启动: 双击 start.bat 或运行 node server.js"
  SCORE=$((SCORE+1))  # 这不是致命问题
fi

# 3. 外网连通性 (ngrok 需要)
cyan "[3/6] 外网连通性"
TOTAL=$((TOTAL+1))
if curl -sf --max-time 5 https://ngrok.io &>/dev/null || curl -sf --max-time 5 https://www.baidu.com &>/dev/null; then
  green "可以访问外网"
  SCORE=$((SCORE+1))
else
  red "无法访问外网"
  echo "   → ngrok 隧道不可用"
  echo "   → 微信推送不可用"
  echo "   解决方案: 设置 TUNNEL=none 纯内网使用"
fi

# 4. ngrok
cyan "[4/6] ngrok"
TOTAL=$((TOTAL+1))
if command -v ngrok &>/dev/null; then
  NGROK_VER=$(ngrok version 2>/dev/null | head -1)
  green "$NGROK_VER"
  SCORE=$((SCORE+1))
elif [ -f "$LOCALAPPDATA/Microsoft/WinGet/Links/ngrok.exe" ]; then
  green "已安装 (winget)"
  SCORE=$((SCORE+1))
else
  yellow "未安装 ngrok"
  echo "   安装: 双击 install-ngrok.bat"
  echo "   或设置 TUNNEL=none 跳过"
fi

# 5. 推送服务连通性
cyan "[5/6] 推送服务 (Server酱)"
TOTAL=$((TOTAL+1))
if [ -f "config.env" ]; then
  KEY=$(grep "^SERVERCHAN_KEY=" config.env 2>/dev/null | cut -d= -f2)
  if [ -n "$KEY" ]; then
    if curl -sf --max-time 5 https://sctapi.ftqq.com &>/dev/null; then
      green "Server酱可达"
      SCORE=$((SCORE+1))
    else
      red "Server酱不可达 (网络问题)"
    fi
  else
    yellow "未配置 SERVERCHAN_KEY"
    echo "   编辑 config.env 填入 SendKey"
  fi
else
  yellow "config.env 不存在"
  echo "   复制 config.env.example 为 config.env"
fi

# 6. 局域网访问 (手机能否访问电脑)
cyan "[6/6] 局域网访问"
TOTAL=$((TOTAL+1))
LOCAL_IP=$(ipconfig 2>/dev/null | grep "IPv4" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" | head -1)
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP=$(ip addr 2>/dev/null | grep "inet " | grep -v "127.0.0.1" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" | head -1)
fi

if [ -n "$LOCAL_IP" ]; then
  green "本机 IP: $LOCAL_IP"
  echo "   手机访问: http://$LOCAL_IP:8765"
  SCORE=$((SCORE+1))
else
  red "无法获取本机 IP"
fi

# 汇总
echo ""
cyan "═══════════════════════════════════════"
echo -e "  检测完成: $SCORE/$TOTAL 项通过"
cyan "═══════════════════════════════════════"
echo ""

# 给出建议
if [ $SCORE -ge 5 ]; then
  green "环境良好，可以直接使用"
elif [ $SCORE -ge 3 ]; then
  yellow "部分功能受限，但核心功能可用"
  echo ""
  echo "建议:"
  echo "  1. 纯内网: 设置 TUNNEL=none，手机用局域网 IP 访问"
  echo "  2. 无推送: 手动打开页面查看审批请求"
else
  red "缺少必要组件"
  echo ""
  echo "最少需要:"
  echo "  1. 安装 Node.js"
  echo "  2. 启动服务器 (start.bat)"
fi
echo ""
