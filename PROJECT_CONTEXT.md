# PROJECT_CONTEXT.md - 项目决策与进展记录

## 最新状态 (2026-06-22 第三轮更新)

### ✅ 推送通道已切换为「喵提醒」

| 组件 | 状态 |
|------|------|
| 服务器 | ✅ 运行中（自愈模式） |
| ngrok 隧道 | ✅ petty-mutable-carnivore.ngrok-free.dev |
| 推送通道 | ✅ 喵提醒（微信，每天100条） |
| 喵码 | tz1qP8C |
| MCP 工具 | ✅ 5 个工具已注册 |
| 密码 | test9876 |

### ✅ 本次会话完整进展（推送通道迁移）

**起点问题**：手机收不到微信推送通知

**排查过程**：
1. 检查推送通道 → `get_server_info` 显示 `wxpusher: true`，凭证已加载
2. 直接调用 WxPusher API 测试 → 返回 `code:1000`（成功），但微信收不到
3. 用户确认已在 WxPusher 公众号订阅了「claude审批」应用
4. 发现 WxPusher 公众号页面提示：「微信已无法推送消息，请下载 APP」
5. **结论：微信封杀了 WxPusher 公众号的消息推送能力**（平台层面限制）

**尝试 PushPlus**：
- API 返回 `code:905 账户未进行实名认证`
- 实名需付费，不划算

**最终方案：喵提醒（miaotixing.com）**
- 微信服务号提醒，每天100条额度
- API 极简：`GET http://miaotixing.com/trigger?id=<喵码>&text=内容`
- 测试推送成功，`mptext:1` 表示微信已送达

**代码改动**：

| 文件 | 改动 |
|------|------|
| `server.js` | 移除 WxPusher/PushPlus，新增喵提醒推送 |
| `mcp-server.js` | `push_channels` 改为 `{ miaotixing, email }` |
| `.mcp.json` | `MIAOTIXING_ID=tz1qP8C` |
| `config.env` | 同上 |
| `README.md` | 更新配置说明 |
| `MCP_CONFIG.md` | 更新配置示例 |
| 删除 | `DESIGN_PUSH_MIGRATION.md`、`TEST_PUSH_MIGRATION.md`、`DESIGN_DISABLE_PUSH.md`（旧方案文档） |

**当前推送配置**：
```env
MIAOTIXING_ID=tz1qP8C
```

```javascript
// pushNotify 中喵提醒调用
const miaoURL = `http://miaotixing.com/trigger?id=${id}&text=${encodeURIComponent(text)}`;
httpRequest(miaoURL)  // GET 请求即可
```

### 💡 关键经验教训

| 推送方案 | 结局 | 原因 |
|---------|------|------|
| Server酱 | ❌ 废弃 | 免费仅 5 条/天，超额 |
| WxPusher | ❌ 废弃 | 微信封杀公众号推送能力 |
| PushPlus | ❌ 废弃 | 需付费实名认证 |
| **喵提醒** | ✅ 使用中 | 每天100条、微信接收、API 简单 |

### ⚠️ 重启后注意

需要**重启 Claude Code** 才能让新的 `MIAOTIXING_ID` 环境变量生效（MCP 服务器进程需要重新加载）。

---

## 历史：自愈机制 (2026-06-22 第一轮)

---

## 本次会话解决的问题 (2026-06-22)

### 问题 1: MCP 工具不可用

**现象**：`mcp__approver__request_approval` 不在可用工具列表

**原因**：MCP 服务器进程在会话中途崩溃/消失，Claude Code 启动时未能连接

**解决方案**：给 server.js 和 mcp-server.js 加入自愈机制

### 问题 2: 服务器没有守护

**用户需求**：不想运行 watchdog.sh 等额外命令，只接受 `claude` 一个命令

**解决方案**：自愈逻辑直接内置到 server.js 和 mcp-server.js 中

### 修改详情

**server.js**
- `doListen()` 替代原来的 `server.listen()`
- `server.once('error', ...)` → 端口冲突/崩溃自动重启（2-10秒递增延迟）
- `startHealthMonitor()` → 每 60 秒自检 /api/health
- `process.on('uncaughtException/unhandledRejection')` → 不崩溃
- 连续崩溃 >5 次自动暂停

**mcp-server.js**
- `uncaughtException/unhandledRejection` 捕获
- 移除了守护子进程方案（Windows EPERM 权限问题）

**AI编程实战.md**
- 6 大章节完整文档
- 量化数据：初始开发传统 885min → AI 协作 130min，效率提升 6.8 倍（不含后续迭代）

---

## 上次会话解决的问题 (2026-06-15)

### 问题 1: MCP Server 启动失败 (EADDRINUSE)

**现象**：MCP Server 启动时报 `Error: listen EADDRINUSE: address already in use 0.0.0.0:8765`

**原因**：之前手动启动的服务器进程还在运行，端口被占用

**解决方案**：在 `mcp-server.js` 中添加 `killPortOccupant()` 函数
```javascript
async function killPortOccupant(port) {
  // Windows: netstat + taskkill
  // Linux: lsof + kill
}
```

**修改文件**：`mcp-server.js`

---

### 问题 2: Claude 没有使用 MCP 工具

**现象**：用户说"问我今天想吃什么"，Claude 直接在终端回复，没有调用 MCP

**原因**：没有 CLAUDE.md 告诉 Claude 使用 MCP 工具

**解决方案**：创建 `CLAUDE.md`，明确指示：
- 所有问题用 `ask_question`
- 所有操作前用 `request_approval`

---

### 问题 3: 手机端看不到选项

**现象**：Claude 调用 `ask_question` 时，`context` 里有选项列表，但手机端只显示问题

**原因**：`renderPending()` 函数中，问题类型只渲染了 `messages`，没有渲染 `description`

**解决方案**：
1. 添加 `descHtml` 渲染 `description` 字段
2. 添加 `.desc-options` CSS 样式（绿色背景）

**修改文件**：`server.js` 第 932-942 行

---

### 问题 4: Web Search 没有走手机审批

**现象**：Claude 执行 Web Search 时，Claude Code 内部弹出确认框，但没有发到手机

**原因**：Claude Code 的内置权限系统和 MCP 审批是分开的

**解决方案**：在 CLAUDE.md 中明确列出所有需要审批的操作类型：
- Web Search
- 执行命令
- 读写文件
- 网络请求
- 安装软件

---

### 问题 5 (2026-06-22): MCP 工具不可用（自愈机制解决）

**现象**：`mcp__approver__request_approval` 不在可用工具列表

**原因**：MCP 服务器进程在会话中途崩溃/消失

**解决方案**：在 server.js 中添加自愈机制：
```javascript
// 端口冲突/崩溃自动重启
server.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    setTimeout(doListen, retryDelay);
  }
});

// 健康监控 - 每 60 秒自检
function startHealthMonitor() {
  setInterval(async () => {
    const res = await fetch('http://localhost:8765/api/health');
    if (!res.ok) crashCount++;
    if (crashCount > 5) process.exit(1); // 防死循环
  }, 60000);
}

// 全局异常捕获
process.on('uncaughtException', ...);
process.on('unhandledRejection', ...);
```

**修改文件**：`server.js`, `mcp-server.js`

---

## 架构说明

```
┌─────────────────┐
│   Claude Code   │
│  (MCP Client)   │
└────────┬────────┘
         │ stdio (JSON-RPC)
         ▼
┌─────────────────┐      ┌──────────────────┐
│  mcp-server.js  │──────│    server.js     │
│  (MCP 协议层)    │      │  (HTTP 服务器)    │
└─────────────────┘      └────────┬─────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
              ┌──────────┐  ┌──────────┐  ┌──────────┐
              │  ngrok   │  │ 喵提醒    │  │  .data/  │
              │  (隧道)   │  │ (微信推送) │  │ (持久化)  │
              └──────────┘  └──────────┘  └──────────┘
```

---

## 测试用例总结

### 审批测试
- ✅ 普通审批 (npm install)
- ✅ 警告级别 (重启数据库)
- ✅ 危险操作 (删除文件)
- ✅ 拒绝操作

### 提问测试
- ✅ 简单问题
- ✅ 带选项的问题（选项显示在绿色区域）
- ✅ 多轮对话

### 操作审批测试
- ✅ Web Search 需要手机审批
- ✅ 命令执行需要手机审批

---

## 当前运行状态

| 组件 | 状态 |
|------|------|
| HTTP 服务器 | ✅ 端口 8765（自愈模式） |
| ngrok 隧道 | ✅ petty-mutable-carnivore.ngrok-free.dev |
| 喵提醒推送 | ✅ 喵码 tz1qP8C（每天100条） |
| MCP Server | ✅ 正常工作（异常捕获） |
| 自愈机制 | ✅ 端口冲突自动重启 + 健康自检 |
| 密码 | test9876 |

---

## 用户偏好（重要）

- ❌ **不想运行额外命令**，只接受 `claude` 一个命令
- ✅ **所有审批/咨询都必须走手机**（不是终端弹窗）
- ✅ 如果 Claude 忘记走手机审批，需要提醒

---

## 待改进（可选）

1. **固定 ngrok 域名** - 免费版每次重启地址会变
2. **推送渠道扩展** - 支持 PushPlus、邮件等
3. **审批历史导出** - 导出 JSON/CSV 格式
4. **Webhook 支持** - 审批完成后回调通知

---

## 文件清单

```
D:\projects\claude-approver\
├── server.js              # HTTP 服务器核心（喵提醒推送）
├── mcp-server.js          # MCP 协议层
├── .mcp.json              # MCP 配置（MIAOTIXING_ID=tz1qP8C）
├── CLAUDE.md              # Claude 使用指南
├── README.md              # 简化版使用文档
├── PROJECT_CONTEXT.md     # 本文档
├── config.env             # 环境变量（不入 git）
├── start.bat              # Windows 启动脚本
├── approve.sh / approve.ps1  # Bash/PS 审批脚本
├── ask.sh                 # Bash 提问脚本
└── .data/                 # 运行时数据
    ├── auth.json
    └── requests.json
```
