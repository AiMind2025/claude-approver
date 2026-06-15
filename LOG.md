# Claude Approver - Project Log & Review

## 1. Project Overview

**Goal**: Build a mobile approval system for Claude Code.
When Claude Code wants to execute sensitive commands, it sends a request to a local HTTP server,
pushes a notification to the user's phone, and waits for approval before executing.

**Location**: `D:\projects\claude-approver`
**Date**: 2026-06-11 ~ 2026-06-12
**Tech**: Pure Node.js, zero dependencies

---

## 2. Timeline & Key Events

### Phase 1: Permissions Configuration (settings.local.json)
- User asked to add commonly-used commands to auto-approve list
- Added ~170 commands across 20+ categories (docker, git, npm, python, system tools, etc.)
- File: `~/.claude/settings.local.json`

### Phase 2: Understanding Security Scanner
- User encountered a permission prompt despite having `Bash(docker *)` in allow list
- The command contained a newline + `#` inside a quoted argument
- Claude Code's built-in security scanner flags this as a potential "argument hiding attack"
- This scanner is separate from permissions allow-list and **cannot be bypassed**
- Fix: Rewrite commands to avoid `\n#` patterns inside quotes (use single-line, semicolons, etc.)

### Phase 3: Approval Server v1 (Basic)
- User requested an HTTP server for mobile approval
- Created basic architecture: HTTP server + approval API + mobile UI
- Files created: server.js, approve.sh, approve.ps1, start.bat, README.md
- Initial location: `C:\Users\Administrator\claude-approver` -> moved to `D:\projects\claude-approver`

### Phase 4: Approval Server v2 (Enhanced)
- User requested: external network access + enhanced WeChat push
- Major rewrite of server.js (1057 lines):
  - Auto-start ngrok tunnel for external access
  - Multi-channel push: ServerChan, PushPlus, Bark, Telegram, Email
  - Push messages include direct approval links
  - First-visit password setup with token-based auth
  - Telegram inline buttons (approve/reject directly in chat)
  - SSE real-time updates for mobile UI
- Added: config.env template, install-ngrok.bat

### Phase 5: Windows Encoding Fix
- User ran install-ngrok.bat and got garbled errors
- Root cause: Windows cmd.exe uses GBK encoding, not UTF-8
- Chinese characters and box-drawing characters in .bat files were parsed as commands
- `chcp 65001` only affects output, not batch file parsing
- Fix: Rewrote all .bat and .env files with pure ASCII text
- server.js keeps Chinese (Node.js handles UTF-8 natively)

---

## 3. Architecture Decisions

### Why zero dependencies?
- Simpler deployment (just `node server.js`, no `npm install`)
- No supply chain risk
- Node.js built-in `http`, `https`, `crypto`, `fs` are sufficient

### Why ngrok over alternatives?
- Most popular, easiest to install on Windows
- Free tier available
- Provides HTTPS automatically
- Has local API (`localhost:4040`) for programmatic tunnel URL retrieval

### Why file-based storage?
- Single-user system, no need for a database
- JSON file is easy to inspect/debug
- Survives server restarts

### Why token in URL?
- Mobile users can't set Authorization headers easily
- QR code / link sharing requires self-contained URLs
- Trade-off: token visible in URL, acceptable for personal use

---

## 4. File Structure

```
D:\projects\claude-approver\
  server.js           Core server (HTTP + UI + ngrok + push)    1057 lines
  approve.sh          Bash approval helper (Git Bash / WSL)
  approve.ps1         PowerShell approval helper
  start.bat           Windows launcher (ASCII only)
  install-ngrok.bat   ngrok installer (ASCII only)
  config.env          Configuration template (ASCII only)
  README.md           Documentation (UTF-8)
  LOG.md              This file
  .data/              Runtime data (auto-created, gitignored)
    requests.json     Pending + completed approval requests
    auth.json         Password/token storage
```

---

## 5. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | / | No* | Mobile approval UI |
| POST | /api/setup | No | Set password (first time only) |
| POST | /api/login | No | Verify password, get token |
| POST | /api/request | Yes | Create approval request |
| GET | /api/pending | Yes | List pending requests |
| GET | /api/completed | Yes | List history (last 50) |
| POST | /api/approve | Yes | Approve request by id |
| POST | /api/reject | Yes | Reject request by id |
| GET | /api/check | Yes | Poll request status |
| GET | /api/events | Yes | SSE real-time stream |
| GET | /api/tunnel | Yes | Get ngrok public URL |
| GET | /api/health | No | Health check |

*UI page checks auth internally via JS

---

## 6. Push Notification Channels

| Channel | Env Var | Platform | Notes |
|---------|---------|----------|-------|
| ServerChan | SERVERCHAN_KEY | WeChat | Markdown support, recommended for CN |
| PushPlus | PUSHPLUS_TOKEN | WeChat | Alternative to ServerChan |
| Bark | BARK_URL | iOS | Native push, supports URL deep-link |
| Telegram | TELEGRAM_BOT + TELEGRAM_CHAT | Cross-platform | Inline buttons for one-click approve |
| Email | SMTP_* | Universal | Pure Node SMTP, no nodemailer needed |

---

## 7. Problems & Solutions

### P1: Permission allow-list doesn't cover all cases
- **Issue**: Some commands still prompt for approval despite being in allow list
- **Cause**: Claude Code has a separate security scanner for injection patterns
- **Pattern**: Newline + `#` inside quoted arguments
- **Fix**: Rewrite commands to avoid the pattern (single-line, semicolons)
- **Bypass**: Not possible, by design

### P2: Windows batch file encoding
- **Issue**: .bat files with UTF-8 Chinese characters cause parse errors
- **Symptoms**: Garbled error messages like "'evel' is not recognized"
- **Root cause**: cmd.exe uses GBK/ANSI encoding; UTF-8 BOM or chars break parsing
- **Failed fix**: `chcp 65001` doesn't help (only affects output, not file parsing)
- **Working fix**: Use pure ASCII in all .bat and .env files
- **Note**: Node.js .js files can keep UTF-8 (Node handles it natively)

### P3: config.env Chinese comments parsed as commands
- **Issue**: Even comment lines in config.env caused errors when loaded via `for /f`
- **Fix**: All comments in config.env must be ASCII

---

## 8. Integration with Claude Code

### How Claude uses the approval system:

```bash
# Before executing a sensitive command:
bash D:/projects/claude-approver/approve.sh "the-command" "description" "warning"

# Exit codes:
#   0 = approved -> Claude proceeds
#   1 = rejected -> Claude aborts
#   2 = timeout  -> Claude aborts
```

### Recommended CLAUDE.md rules:
```markdown
## Mobile Approval Rules
Use the approval server for:
- docker exec / rm / stop operations
- rm -rf or destructive file operations
- System-level changes
- Network configuration changes
```

---

## 9. Latest Progress (2026-06-12)

### ngrok 安装与配置
- 通过 winget 安装 ngrok 3.3.1
- 安装后 PATH 未刷新，cmd 找不到 ngrok
- 修复: start.bat 和 server.js 增加 winget 路径自动探测
- 用户首次提供错误 token (`cr_...`)，ngrok 报 ERR_NGROK_105
- 用户提供正确 token (`3F1BLt..._3ZMw...`)，但版本 3.3.1 太旧
- ngrok 要求最低 3.20.0，winget 无更新
- 修复: `ngrok update` 升级到 3.39.7
- 隧道成功建立: `https://petty-mutable-carnivore.ngrok-free.dev`

### Server酱微信推送配置
- 用户注册 Server酱 (https://sct.ftqq.com)
- SendKey: `SCT362965TNnuteeyQr7P4xWsw4C8Cz6om`
- curl 推送因 Windows GBK 编码失败 (code 30001)
- 修复: server.js 本身用 Node.js https 模块发送 (UTF-8 原生支持)
- 推送成功，微信收到测试消息
- 端到端测试: 创建 danger 级别审批请求 -> 微信收到通知含审批链接 ✅

### 当前运行状态
- 服务器: 运行中, http://localhost:8765
- ngrok: 运行中, https://petty-mutable-carnivore.ngrok-free.dev
- 推送: Server酱 (微信) ✅
- 密码: 未设置 (首次访问时设置)

---

## 10. Pending / TODO

- [ ] User needs to set password via web UI (first visit)
- [ ] Consider: auto-refresh ngrok tunnel URL if it changes
- [ ] Consider: rate limiting on API to prevent brute-force
- [ ] Consider: add approval comments/notes from mobile
- [ ] Consider: persist SERVERCHAN_KEY in config.env loading (start.bat encoding fix)

---

## 11. Key Commands Reference

```bash
# Start server
D:\projects\claude-approver\start.bat

# Start with custom config
set SERVERCHAN_KEY=xxx
set NGROK_AUTHTOKEN=xxx
node D:\projects\claude-approver\server.js

# Start without ngrok (local only)
set TUNNEL=none
node D:\projects\claude-approver\server.js

# Test API
curl http://localhost:8765/api/health
curl -X POST http://localhost:8765/api/request -H "Content-Type: application/json" -d "{\"command\":\"test\",\"risk\":\"normal\"}"

# Request approval from Claude
bash D:/projects/claude-approver/approve.sh "docker ps" "check containers" "normal"
```
