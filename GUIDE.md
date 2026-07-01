# Claude 手机审批服务器 - 使用指导书

## 目录

1. [项目简介](#1-项目简介)
2. [系统架构](#2-系统架构)
3. [前置准备](#3-前置准备)
4. [Claude Code 配置](#4-claude-code-配置)
5. [OpenCode 配置](#5-opencode-配置)
6. [功能说明](#6-功能说明)
7. [使用示例](#7-使用示例)
8. [常见问题](#8-常见问题)

---

## 1. 项目简介

Claude 手机审批服务器是一个让 AI 编程助手（Claude Code / OpenCode）通过手机端进行远程审批和交互的系统。

**核心功能**：
- 📱 手机远程审批 AI 操作
- 💬 多轮对话，随时随地决策
- 🔔 微信推送通知（喵提醒）
- 🔄 审批同时附带指令回复
- 🛡️ 自愈机制，崩溃自动重启

---

## 2. 系统架构

```
┌──────────────────────────┐
│   AI 编程助手            │
│  (Claude Code/OpenCode)  │
└────────────┬─────────────┘
             │ MCP 协议
             ▼
┌──────────────────────────┐
│     mcp-server.js        │
│    (MCP 协议层)          │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│      server.js           │
│   (HTTP 服务器核心)      │
└────────────┬─────────────┘
             │
    ┌────────┼────────┐
    ▼        ▼        ▼
┌───────┐ ┌─────┐ ┌───────┐
│ ngrok │ │喵提醒│ │ .data │
│(隧道) │ │(推送)│ │(存储) │
└───────┘ └─────┘ └───────┘
```

---

## 3. 前置准备

### 3.1 环境要求

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 18.0 | 运行服务器 |
| ngrok | 最新版 | 内网穿透 |
| 喵提醒账号 | - | 微信推送 |

### 3.2 获取喵码

1. 访问 [喵提醒](https://miaotixing.com)
2. 扫码关注喵提醒服务号
3. 获取你的专属喵码（如 `tz1qP8C`）

### 3.3 获取 ngrok Token

1. 注册 [ngrok](https://ngrok.com)
2. 在 Dashboard 获取 Auth Token

### 3.4 配置环境变量

创建 `config.env` 文件：

```env
# ngrok 配置
NGROK_AUTH=your_ngrok_token_here

# 推送配置
MIAOTIXING_ID=your_miao_code_here

# 服务器配置
PORT=8765
PASSWORD=test9876
```

---

## 4. Claude Code 配置

### 4.1 配置文件

在项目根目录创建 `.mcp.json`：

```json
{
  "mcpServers": {
    "approver": {
      "command": "node",
      "args": ["D:/projects/claude-approver/mcp-server.js"],
      "env": {
        "MCP_MODE": "1",
        "PORT": "8765",
        "NGROK_AUTH": "your_ngrok_token",
        "MIAOTIXING_ID": "your_miao_code",
        "PASSWORD": "test9876"
      }
    }
  }
}
```

### 4.2 创建行为指南

在项目根目录创建 `CLAUDE.md`：

```markdown
# Claude 手机审批指南

## 核心原则

所有需要用户确认的操作，必须通过 MCP 工具发送到手机审批。

## MCP 工具列表

| 工具 | 用途 | 阻塞? |
|------|------|-------|
| request_approval | 请求用户批准操作 | 是 |
| ask_question | 向用户提问 | 是 |
| check_status | 查询请求状态 | 否 |
| close_conversation | 结束对话 | 否 |
| get_server_info | 获取服务器信息 | 否 |

## 使用场景

### 危险操作 → request_approval
- 删除文件
- 执行系统命令
- 安装依赖

### 需要输入 → ask_question
- 询问用户偏好
- 多轮对话确认
- 发送选项让用户选择

## 示例

用户说："帮我安装依赖"

Claude 应该：
1. 调用 request_approval
2. 等待用户在手机上批准
3. 批准后执行安装
```

### 4.3 启动 Claude Code

```bash
claude
```

Claude Code 会自动连接 MCP 服务器，启动审批系统。

---

## 5. OpenCode 配置

### 5.1 配置文件

在项目根目录创建 `opencode.json`：

```json
{
  "mcpServers": {
    "approver": {
      "command": "node",
      "args": ["D:/projects/claude-approver/mcp-server.js"],
      "env": {
        "MCP_MODE": "1",
        "PORT": "8765",
        "NGROK_AUTH": "your_ngrok_token",
        "MIAOTIXING_ID": "your_miao_code",
        "PASSWORD": "test9876"
      }
    }
  }
}
```

### 5.2 创建行为指南

在项目根目录创建 `AGENTS.md`：

```markdown
# OpenCode 手机审批指南

## 核心原则

所有需要用户确认的操作，必须通过 MCP 工具发送到手机审批。

## 可用工具

- request_approval: 请求用户批准操作
- ask_question: 向用户提问
- check_status: 查询请求状态
- close_conversation: 结束对话
- get_server_info: 获取服务器信息

## 使用规则

1. 执行危险操作前，调用 request_approval
2. 需要用户输入时，调用 ask_question
3. 等待用户在手机上回复后再继续

## 示例

用户说："帮我部署到云平台"

应该：
1. 调用 ask_question 询问云平台选择
2. 等待用户在手机上回复
3. 根据回复执行部署
```

### 5.3 启动 OpenCode

```bash
opencode
```

OpenCode 会自动连接 MCP 服务器，启动审批系统。

---

## 6. 功能说明

### 6.1 审批请求 (request_approval)

**用途**：执行操作前请求用户批准

**参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| command | string | 是 | 要执行的命令 |
| description | string | 否 | 操作描述 |
| context | string | 否 | 上下文信息 |
| risk | string | 否 | 风险等级：normal/warning/danger |

**示例**：
```javascript
request_approval({
  command: "npm install axios",
  description: "安装 HTTP 客户端库",
  context: "项目需要调用外部 API",
  risk: "normal"
})
```

### 6.2 提问 (ask_question)

**用途**：向用户提问，支持多轮对话

**参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| question | string | 是 | 问题内容 |
| context | string | 否 | 选项/建议 |
| conversation_id | string | 否 | 对话 ID（追问时使用） |

**示例**：
```javascript
ask_question({
  question: "请选择云平台",
  context: "1. 阿里云\n2. 腾讯云\n3. 火山引擎"
})
```

### 6.3 审批附带回复

用户在审批时可以附带回复消息，Claude 收到后可根据回复继续操作。

**流程**：
1. Claude 发送审批请求
2. 用户在手机上输入回复 + 点击批准
3. Claude 收到 `{status: "approved", reply: "用户回复内容"}`
4. Claude 根据回复继续执行

---

## 7. 使用示例

### 场景 1：远程安装依赖

```
用户: 帮我安装 axios

Claude:
→ 调用 request_approval({
    command: "npm install axios",
    description: "安装 HTTP 客户端",
    risk: "normal"
  })

用户手机: 收到推送 → 点击批准

Claude: 执行安装，返回结果
```

### 场景 2：远程技术方案讨论

```
用户: 把项目部署到云平台

Claude:
→ 调用 ask_question({
    question: "请选择云平台",
    context: "1. 阿里云\n2. 腾讯云\n3. 火山引擎"
  })

用户手机: 回复 "3"

Claude: 追问火山引擎具体方案...
```

### 场景 3：审批附带指令

```
Claude: 请求安装依赖

用户手机: 
- 输入回复："检查是否需要调整配置"
- 点击批准

Claude:
→ 收到 reply: "检查是否需要调整配置"
→ 执行安装
→ 检查配置
→ 将结果发送到手机
```

---

## 8. 常见问题

### Q1: 手机收不到推送？

**检查清单**：
1. 喵码是否正确：`get_server_info` 查看 `miaotixing` 状态
2. 是否关注了喵提醒服务号
3. 网络是否正常

### Q2: MCP 工具不可用？

**解决方案**：
1. 检查配置文件路径是否正确
2. 确认 Node.js 版本 >= 18
3. 重启 AI 编程助手（Claude Code / OpenCode）
4. 检查 mcp-server.js 是否有错误输出

### Q3: ngrok 隧道连接失败？

**解决方案**：
1. 检查 NGROK_AUTH 是否正确
2. 确认 ngrok 已安装
3. 手动测试：`ngrok http 8765`

### Q4: OpenCode 不识别 MCP 工具？

**解决方案**：
1. 在 AGENTS.md 中明确列出工具名称
2. 更新 OpenCode 到最新版本
3. 检查 opencode.json 配置格式

### Q5: 审批后 Claude 没有反应？

**检查**：
1. 确认 MCP 服务器正在运行
2. 查看终端是否有错误输出
3. 尝试重启服务器

---

## 附录：测试验证

### 测试 1：微信通知
```
让 Claude 执行任意操作 → 检查微信是否收到推送
```

### 测试 2：审批功能
```
让 Claude 安装依赖 → 手机点击批准 → 确认执行成功
```

### 测试 3：多轮对话
```
让 Claude 询问云平台选择 → 手机回复 → 确认追问正常
```

### 测试 4：审批回复
```
审批时附带回复 → 确认 Claude 收到并处理回复
```

---

## 更新记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-06-30 | v1.0 | 初始版本（Claude Code + OpenCode） |
