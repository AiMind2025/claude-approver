# 设计文档

## 目录

1. [自动启动方案](#1-自动启动方案)
2. [对话功能设计](#2-对话功能设计)
3. [MCP Server 实现](#3-mcp-server-实现)

---

## 1. 自动启动方案

### 问题

每次使用 Claude Code 前需手动启动审批服务器，容易忘记。

### 方案对比

| 方案 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| **CLAUDE.md 检查** | Claude 启动时检查并启动服务器 | 简单，跨平台 | 每次有几秒延迟 |
| **包装脚本** | bat/sh 先启动服务器再启动 Claude | 服务器输出不干扰 | 需改用新命令 |
| **系统服务** | 注册为开机自启 | 完全自动化 | 配置复杂，需管理员权限 |
| **MCP Server** | Claude Code 启动时自动加载 | 官方插件架构，体验最好 | 需重写 |

### 最终选择：MCP Server

符合 Claude Code 插件架构，启动时自动加载，无需手动操作。

---

## 2. 对话功能设计

### 需求

Claude 可以向用户提问，用户在手机上输入文字回复，Claude 收到后继续执行。

### 两种请求类型

| 类型 | 用途 | 手机端显示 | 返回结果 |
|------|------|-----------|---------|
| **approval** | 执行危险命令前确认 | ✓ 批准 / ✗ 拒绝 按钮 | approved / rejected |
| **question** | 需要用户输入信息 | 文字输入框 + 发送按钮 | 用户输入的文字 |

### 数据模型

```javascript
{
  id: "abc123",
  type: "approval" | "question",
  command: "...",           // 审批=命令，提问=问题内容
  description: "...",       // 补充说明/选项列表
  risk: "normal",           // 仅审批用
  status: "pending" | "approved" | "rejected" | "replied" | "closed",
  reply: "用户的回复",
  conversationId: "xxx",    // 多轮对话 ID
  messages: [{sender, content, time}],
  created_at: "...",
  decided_at: "..."
}
```

### API

```
POST /api/request    创建请求（支持 type: "question"）
POST /api/reply      用户回复
POST /api/close      结束对话
```

### 手机端 UI

**审批类型**：显示命令、描述、风险等级 + 批准/拒绝按钮

**提问类型**：显示问题、说明/选项 + 文字输入框 + 发送按钮

### 脚本

```bash
# 审批
bash approve.sh "rm -rf /tmp" "清理临时文件" "danger"

# 提问
bash ask.sh "按钮用什么颜色？" "用户想要醒目的设计" 300
```

---

## 3. MCP Server 实现

### 架构

```
Claude Code ←→ stdio (JSON-RPC) ←→ mcp-server.js ←→ server.js 核心
                                                           ↓
                                                     HTTP Server ←→ 手机
```

### MCP Tools

| 工具 | 用途 | 参数 | 阻塞? |
|------|------|------|-------|
| `request_approval` | 请求批准命令 | command, description, risk, timeout | 是 |
| `ask_question` | 提问等回复 | question, context, timeout, conversation_id | 是 |
| `check_status` | 查询状态 | request_id | 否 |
| `close_conversation` | 结束对话 | conversation_id | 否 |
| `get_server_info` | 服务器信息 | 无 | 否 |

### 工具详情

#### request_approval

```json
// 参数
{
  "command": "docker rm container",
  "description": "删除容器",
  "risk": "danger",
  "timeout": 300
}

// 返回
{
  "status": "approved",
  "request_id": "abc123"
}
```

#### ask_question

```json
// 参数
{
  "question": "请选择项目名：",
  "context": "1. 隔空取物\n2. 飞鸽传令\n3. 千里眼",
  "timeout": 600,
  "conversation_id": "xxx"  // 追问时传入
}

// 返回
{
  "reply": "2",
  "request_id": "abc123",
  "conversation_id": "abc123",
  "messages": [...]
}
```

### 关键技术点

1. **日志分离**：MCP 用 stdout 传 JSON-RPC，服务器日志输出到 stderr（`MCP_MODE=1`）

2. **阻塞等待**：
   ```javascript
   while (true) {
     const status = checkStatus(req.id);
     if (status === 'approved' || status === 'rejected') return result;
     await sleep(1000);
   }
   ```

3. **端口冲突处理**：启动时自动杀掉占用端口的旧进程

### 配置

项目目录下创建 `.mcp.json`：

```json
{
  "mcpServers": {
    "approver": {
      "command": "node",
      "args": ["D:/projects/claude-approver/mcp-server.js"],
      "env": {
        "PORT": "8765",
        "TUNNEL": "ngrok",
        "NGROK_AUTHTOKEN": "你的token",
        "SERVERCHAN_KEY": "你的key"
      }
    }
  }
}
```

> ⚠️ `.mcp.json` 必须放在运行 `claude` 命令的目录下

### 文件结构

```
claude-approver/
├── mcp-server.js      # MCP 协议层
├── server.js          # HTTP 核心（被 mcp-server.js 导入）
├── .mcp.json          # MCP 配置（不入 git）
├── CLAUDE.md          # Claude 使用指南
├── approve.sh         # 审批脚本
├── ask.sh             # 提问脚本
└── .data/             # 运行时数据
```

---

## 已解决的问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| EADDRINUSE | 旧进程占用端口 | `killPortOccupant()` 自动清理 |
| Claude 不用 MCP | 没有指令 | 创建 CLAUDE.md |
| 手机端不显示选项 | 只渲染 messages | 渲染 description 字段 |
| Web Search 不走审批 | 内置权限系统分开 | CLAUDE.md 明确规则 |
