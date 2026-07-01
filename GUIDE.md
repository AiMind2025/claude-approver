# 手机审批服务器 - 适配指南

## 前置准备

### 1. 环境要求

| 依赖 | 版本要求 |
|------|----------|
| Node.js | >= 18.0 |
| ngrok | 最新版 |

### 2. 获取凭证

| 凭证 | 获取方式 |
|------|----------|
| 喵码 | [喵提醒](https://miaotixing.com) 扫码关注获取 |
| ngrok Token | [ngrok Dashboard](https://ngrok.com) 注册获取 |

### 3. 配置环境变量

创建 `config.env`：

```env
NGROK_AUTH=your_ngrok_token
MIAOTIXING_ID=your_miao_code
PORT=8765
PASSWORD=test9876
```

---

## Claude Code 适配

### 步骤 1：创建配置文件

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

### 步骤 2：创建行为指南

在项目根目录创建 `CLAUDE.md`：

```markdown
# Claude 手机审批指南

## 核心原则

所有需要用户确认的操作，必须通过 MCP 工具发送到手机审批，不要在终端直接询问。

## MCP 工具

| 工具 | 用途 |
|------|------|
| request_approval | 请求用户批准操作（危险操作前使用） |
| ask_question | 向用户提问（需要输入时使用） |
| check_status | 查询请求状态 |
| close_conversation | 结束对话 |
| get_server_info | 获取服务器信息 |

## 何时使用

### request_approval（审批）
- 删除文件/数据
- 执行系统命令
- 修改重要配置
- Web Search
- 安装依赖

### ask_question（提问）
- 询问用户偏好
- 提供选项让用户选择
- 多轮对话确认

## 正确流程 ✅

用户: "帮我安装 axios"

Claude 应该:
1. 调用 request_approval({command: "npm install axios", risk: "normal"})
2. 等待用户在手机上批准
3. 批准后才执行

## 错误流程 ❌

Claude 直接在终端弹出确认框 → 这是错的！

## 审批回复处理

用户在审批时可以附带回复。当收到 reply 字段时：
1. 理解回复内容
2. 执行用户要求
3. 继续通过 MCP 工具发送结果到手机
```

### 步骤 3：启动

```bash
claude
```

---

## OpenCode 适配

### 步骤 1：创建配置文件

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

### 步骤 2：创建行为指南

在项目根目录创建 `AGENTS.md`：

```markdown
# OpenCode 手机审批指南

## 核心原则

所有需要用户确认的操作，必须通过 MCP 工具发送到手机审批，不要在终端直接询问。

## 可用工具

| 工具 | 用途 |
|------|------|
| request_approval | 请求用户批准操作（危险操作前使用） |
| ask_question | 向用户提问（需要输入时使用） |
| check_status | 查询请求状态 |
| close_conversation | 结束对话 |
| get_server_info | 获取服务器信息 |

## 何时使用

### request_approval（审批）
- 删除文件/数据
- 执行系统命令
- 修改重要配置
- Web Search
- 安装依赖

### ask_question（提问）
- 询问用户偏好
- 提供选项让用户选择
- 多轮对话确认

## 正确流程 ✅

用户: "帮我安装 axios"

应该:
1. 调用 request_approval({command: "npm install axios", risk: "normal"})
2. 等待用户在手机上批准
3. 批准后才执行

## 错误流程 ❌

直接在终端弹出确认框 → 这是错的！

## 审批回复处理

用户在审批时可以附带回复。当收到 reply 字段时：
1. 理解回复内容
2. 执行用户要求
3. 继续通过 MCP 工具发送结果到手机
```

### 步骤 3：启动

```bash
opencode
```

---

## 验证

### 测试 1：服务启动检查

```bash
curl http://localhost:8765/api/health
```

预期返回：
```json
{"ok":true,"pending":0,"tunnel":"https://xxx.ngrok-free.dev"}
```

### 测试 2：微信推送

在终端输入：
```
帮我安装 axios
```

预期：
- 手机收到喵提醒微信通知
- 点击通知跳转到审批页面

### 测试 3：审批功能

在手机审批页面：
1. 查看审批卡片（显示命令、描述、风险等级）
2. 点击「批准」或「拒绝」

预期：
- 终端收到审批结果
- AI 根据结果继续或停止

### 测试 4：多轮对话

在终端输入：
```
帮我想个项目名
```

预期：
- 手机收到提问（带选项）
- 在手机上回复后，AI 继续对话

### 测试 5：审批附带回复

在审批页面：
1. 在回复框输入指令（如"检查配置后再执行"）
2. 点击批准

预期：
- AI 收到回复内容
- AI 根据回复执行额外操作
