# 🤖 Claude 手机审批服务器 (增强版)

在手机上审批 Claude Code 的操作，支持外网访问和微信/Telegram 推送。

```
Claude Code → 需要确认 → 推送通知(含公网链接)
                              ↓
                        手机点击链接
                              ↓
                    选择 ✅批准 / ❌拒绝
                              ↓
                    Claude 继续/中止执行
```

## 功能

- ✅ **零依赖** — 纯 Node.js，无需 npm install
- ✅ **手机审批 UI** — 暗色主题，实时刷新，适配移动端
- ✅ **ngrok 自动隧道** — 手机外网直接访问
- ✅ **多通道推送** — Server酱 / PushPlus / Bark / Telegram / 邮件
- ✅ **推送含审批链接** — 手机收到通知后直接点击审批
- ✅ **首次设置密码** — 电脑/手机都用密码访问，全程鉴权
- ✅ **Telegram 内联按钮** — 直接在聊天里点批准/拒绝

## 快速开始

### 1. 安装 ngrok（手机外网访问）

```bash
# 双击运行安装脚本
install-ngrok.bat

# 或手动: https://ngrok.com/download
```

### 2. 配置推送（可选）

编辑 `config.env`，填入你的推送服务凭证：

```bash
# 微信推送（二选一）
SERVERCHAN_KEY=你的SendKey      # https://sct.ftqq.com
PUSHPLUS_TOKEN=你的Token        # https://www.pushplus.plus

# iOS 推送
BARK_URL=https://api.day.app/你的key

# Telegram
TELEGRAM_BOT=123456:ABC...
TELEGRAM_CHAT=你的ChatID
```

### 3. 启动

```bash
# Windows 双击
start.bat

# 或命令行
cd D:\projects\claude-approver
node server.js
```

### 4. 首次设置密码

电脑浏览器打开 `http://localhost:8765`，按提示设置密码。
手机用控制台输出的公网地址 + 密码访问。

### 5. Claude 中使用

```bash
# Bash
bash D:/projects/claude-approver/approve.sh "docker exec ..." "说明" "warning"

# PowerShell
powershell -File D:/projects/claude-approver/approve.ps1 -Command "docker exec ..." -Desc "说明" -Risk warning
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `server.js` | 核心服务 (HTTP + 审批页 + ngrok + 推送) |
| `approve.sh` | Bash 审批助手 (Git Bash / WSL) |
| `approve.ps1` | PowerShell 审批助手 |
| `start.bat` | Windows 一键启动 |
| `install-ngrok.bat` | ngrok 安装脚本 |
| `config.env` | 推送/隧道配置模板 |

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `PORT` | 本地端口 | `8765` |
| `AUTH_TOKEN` | 访问密码 | 空 (首次设置) |
| `TUNNEL` | 隧道: ngrok / none | `ngrok` |
| `NGROK_AUTHTOKEN` | ngrok 认证 | 空 |
| `SERVERCHAN_KEY` | Server酱 SendKey | 空 |
| `PUSHPLUS_TOKEN` | PushPlus Token | 空 |
| `BARK_URL` | Bark 推送地址 | 空 |
| `TELEGRAM_BOT` | TG Bot Token | 空 |
| `TELEGRAM_CHAT` | TG Chat ID | 空 |
| `SMTP_HOST` | 邮件 SMTP 服务器 | 空 |
| `SMTP_PORT` | SMTP 端口 | `465` |
| `SMTP_USER` | 发件人 | 空 |
| `SMTP_PASS` | SMTP 授权码 | 空 |
| `SMTP_TO` | 收件人 | 空 |

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/request` | 创建审批请求 |
| `GET` | `/api/pending` | 待审批列表 |
| `POST` | `/api/approve` | 批准 `{id}` |
| `POST` | `/api/reject` | 拒绝 `{id}` |
| `GET` | `/api/check?id=xxx` | 轮询审批状态 |
| `GET` | `/api/events` | SSE 实时推送 |
| `POST` | `/api/setup` | 首次设密码 |
| `POST` | `/api/login` | 验证密码 |
| `GET` | `/api/tunnel` | 隧道信息 |
| `GET` | `/api/health` | 健康检查 |

## 推送链接格式

推送通知中会自动包含审批直链：

```
https://xxxx.ngrok.io/?action=review&id=abc123&token=密码&do=approve
```

手机上点击后自动审批，无需打开页面手动操作。

## 安全

- 所有 API 均需 Bearer Token 或 ?token= 鉴权
- 密码存储在项目 `.data/auth.json` (不入 git)
- ngrok 隧道使用 HTTPS
- 建议: 设置 AUTH_TOKEN + NGROK_AUTHTOKEN (固定域名)
