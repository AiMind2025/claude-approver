# MCP Server 实现设计

## 目标

将审批服务器改造为 Claude Code MCP 插件，实现：
1. Claude Code 启动时自动加载
2. Claude 直接调用工具，无需 shell 脚本
3. HTTP 服务器自动启动，供手机端访问

---

## MCP 协议简介

MCP (Model Context Protocol) 是 Claude Code 的插件协议：
- 通信方式：stdio (JSON-RPC 2.0)
- Claude Code 作为 client，MCP Server 作为 child process
- Server 暴露 tools，Claude 可以调用

基本流程：
```
Claude Code ←→ stdio ←→ MCP Server ←→ HTTP Server ←→ 手机
```

---

## 架构设计

```
┌─────────────────────────────────────────────────────────┐
│  Claude Code                                            │
│    ↓ 启动时加载 MCP Server                              │
│    ↓ 调用 tools                                         │
├─────────────────────────────────────────────────────────┤
│  mcp-server.js (MCP 协议层)                             │
│    - 处理 JSON-RPC 请求                                 │
│    - 暴露 tools: request_approval, ask_question, etc.   │
│    - 启动时初始化 HTTP Server                           │
├─────────────────────────────────────────────────────────┤
│  server.js 核心逻辑 (复用)                              │
│    - HTTP API                                           │
│    - 数据存储                                           │
│    - ngrok 隧道                                         │
│    - 推送通知                                           │
├─────────────────────────────────────────────────────────┤
│  手机端 / 推送                                          │
└─────────────────────────────────────────────────────────┘
```

---

## MCP Tools 设计

### 1. request_approval

**用途**: 请求用户批准执行某个命令

**参数**:
```json
{
  "command": "docker rm container",
  "description": "删除容器",
  "risk": "danger",
  "timeout": 300
}
```

**返回**:
```json
{
  "status": "approved",  // approved | rejected | timeout
  "request_id": "abc123"
}
```

**行为**:
- 创建审批请求
- 轮询等待结果（阻塞直到用户操作或超时）
- 返回最终状态

---

### 2. ask_question

**用途**: 向用户提问，等待文字回复

**参数**:
```json
{
  "question": "按钮用什么颜色？",
  "context": "用户之前提到想要醒目的设计",
  "timeout": 600
}
```

**返回**:
```json
{
  "reply": "用蓝色",
  "request_id": "abc123",
  "messages": [...]  // 完整对话历史
}
```

**行为**:
- 创建 question 类型请求
- 轮询等待用户回复
- 支持多轮：返回后可继续调用，传入 conversation_id

---

### 3. ask_followup

**用途**: 在已有对话中追问

**参数**:
```json
{
  "conversation_id": "abc123",
  "question": "为什么选蓝色？",
  "timeout": 600
}
```

**返回**:
```json
{
  "reply": "因为和主题色一致",
  "messages": [...]  // 更新后的完整对话
}
```

---

### 4. check_status

**用途**: 查询请求状态（非阻塞）

**参数**:
```json
{
  "request_id": "abc123"
}
```

**返回**:
```json
{
  "status": "pending",  // pending | approved | rejected | replied | closed
  "request": {...}
}
```

---

### 5. close_conversation

**用途**: 结束对话

**参数**:
```json
{
  "conversation_id": "abc123"
}
```

**返回**:
```json
{
  "ok": true
}
```

---

## 配置方式

### Claude Code 配置 (settings.json 或项目 .claude/settings.json)

```json
{
  "mcpServers": {
    "approver": {
      "command": "node",
      "args": ["D:/projects/claude-approver/mcp-server.js"],
      "env": {
        "PORT": "8765",
        "TUNNEL": "ngrok"
      }
    }
  }
}
```

### 首次使用

1. 用户配置 settings.json
2. Claude Code 启动时自动加载 MCP Server
3. MCP Server 启动 HTTP 服务器
4. 控制台输出公网地址（通过 MCP notifications）

---

## 实现计划

### 文件结构

```
D:\projects\claude-approver\
├── mcp-server.js          # 新增：MCP 协议层
├── server.js              # 现有：HTTP 核心（需要小幅重构）
├── mcp-config.json        # 新增：配置模板
└── ...
```

### mcp-server.js 主要职责

1. **初始化阶段**:
   - 导入 server.js 核心逻辑
   - 启动 HTTP 服务器
   - 启动 ngrok（如果配置）
   - 输出启动信息

2. **MCP 协议处理**:
   - 监听 stdin，解析 JSON-RPC 请求
   - 路由到对应的 tool handler
   - 返回结果到 stdout

3. **Tool 实现**:
   - request_approval: 调用 createRequest + 轮询 check
   - ask_question: 调用 createRequest(type=question) + 轮询 check
   - 等等

### server.js 重构

需要将核心逻辑导出，供 mcp-server.js 使用：

```javascript
// server.js 导出
module.exports = {
  createRequest,
  decideRequest,
  replyRequest,
  closeConversation,
  store,
  startServer,
  // ...
};
```

---

## 关键技术点

### 1. 阻塞式等待

MCP tools 可以阻塞等待（不像 HTTP API 需要立即返回）：

```javascript
async function requestApproval(params) {
  const req = createRequest(params);
  
  // 阻塞等待
  while (true) {
    const status = checkStatus(req.id);
    if (status === 'approved' || status === 'rejected') {
      return { status, request_id: req.id };
    }
    await sleep(1000);
  }
}
```

### 2. 进度通知

MCP 支持 notifications，可以发送进度：

```javascript
// 发送进度通知
sendNotification('progress', {
  message: '等待用户审批...',
  request_id: req.id
});
```

### 3. 错误处理

```javascript
// 服务器未启动
if (!httpServerRunning) {
  throw new Error('HTTP server failed to start');
}

// 超时
if (elapsed > timeout) {
  return { status: 'timeout', request_id: req.id };
}
```

---

## 测试计划

1. **单元测试**: MCP 协议解析
2. **集成测试**: 
   - Claude 调用 request_approval
   - 用户在手机审批
   - Claude 收到结果
3. **端到端测试**:
   - 配置 MCP Server
   - 启动 Claude Code
   - 执行需要审批的命令
   - 验证完整流程

---

## 待确认

1. **MCP Server 独立运行 vs 嵌入 server.js**?
   - 独立：mcp-server.js 导入 server.js 模块
   - 嵌入：server.js 同时支持 HTTP 和 MCP

2. **是否需要保留纯 HTTP 模式**?
   - 是：向后兼容，仍可手动启动
   - 否：只保留 MCP 模式

3. **MCP Server 配置位置**:
   - 全局 settings.json（所有项目可用）
   - 项目 .claude/settings.json（仅当前项目）

请确认后我开始实现。
