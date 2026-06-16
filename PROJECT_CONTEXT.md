# PROJECT_CONTEXT.md - 项目决策与进展记录

## 最新状态 (2026-06-15)

### ✅ 已完成功能

1. **MCP Server 完整实现**
   - 5 个 MCP 工具：request_approval, ask_question, check_status, close_conversation, get_server_info
   - Claude Code 启动时自动加载
   - 支持审批和对话功能

2. **端口冲突自动修复**
   - 新增 `killPortOccupant()` 函数
   - MCP Server 启动时自动杀掉占用端口的旧进程

3. **手机端显示优化**
   - 问题类型现在显示 `description` 字段（选项列表）
   - 绿色背景样式突出选项

4. **CLAUDE.md 完善**
   - 明确告知 Claude 所有交互必须通过手机
   - 所有操作（包括 Web Search）需要先 `request_approval`
   - 带选项的问题使用 `ask_question` 的 `context` 字段

---

## 本次会话解决的问题

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
              │  ngrok   │  │ Server酱  │  │  .data/  │
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
| HTTP 服务器 | ✅ 端口 8765 |
| ngrok 隧道 | ✅ petty-mutable-carnivore.ngrok-free.dev |
| Server酱推送 | ✅ 已配置 |
| MCP Server | ✅ 正常工作 |
| 密码 | test9876 |

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
├── server.js              # HTTP 服务器核心 (46KB)
├── mcp-server.js          # MCP 协议层 (12KB)
├── .mcp.json              # MCP 配置
├── CLAUDE.md              # Claude 使用指南
├── README.md              # 简化版使用文档
├── config.env             # 环境变量（不入 git）
├── start.bat              # Windows 启动脚本
├── approve.sh / approve.ps1  # Bash/PS 审批脚本
├── ask.sh                 # Bash 提问脚本
└── .data/                 # 运行时数据
    ├── auth.json
    └── requests.json
```
