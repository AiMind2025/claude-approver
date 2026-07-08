# 手机审批服务器 - 适配指南

> 💡 **本指南面向零基础用户**，按步骤操作即可完成配置。

---

## 前置准备

### 1. 安装依赖

| 依赖 | 安装方式 |
|------|----------|
| Node.js | [下载地址](https://nodejs.org/) 安装 >= 18.0 版本 |
| ngrok | 方式一：[下载地址](https://ngrok.com/download)（⚠️ 需梯子）<br>方式二：直接下载 `curl -L -o ngrok.zip "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip"` 解压到任意目录 |

> 💡 **提示**：ngrok 下载不需要梯子，但注册账号获取 Token 需要梯子访问 ngrok.com

### 2. 获取凭证

| 凭证 | 获取方式 |
|------|----------|
| 喵码 | 微信扫码关注 [喵提醒](https://miaotixing.com)，自动回复中获取 |
| ngrok Token | 注册 [ngrok](https://ngrok.com) 后在 Dashboard 页面复制（⚠️ 需梯子访问） |

### 3. 下载本项目

```bash
# 方式一：Git 克隆
git clone https://github.com/AiMind2025/claude-approver.git
cd claude-approver

# 方式二：直接下载 ZIP
# 访问 https://github.com/AiMind2025/claude-approver 点击 Code -> Download ZIP
# 解压后进入目录
```

### 4. 创建配置文件

> 📍 **文件位置**：在项目根目录（和 `server.js` 同一层）创建 `config.env` 文件

```
claude-approver/
├── server.js          ← 服务器主程序
├── mcp-server.js      ← MCP 协议层
├── config.env         ← ⭐ 在这里创建配置文件
├── .mcp.json          ← Claude Code 配置
└── ...
```

**config.env 内容：**

```env
# 必填项（替换为你自己的值）
NGROK_AUTHTOKEN=你的ngrok_token
MIAOTIXING_ID=你的喵码

# 可选项
PORT=8765                    # 端口号，默认 8765
PASSWORD=your_password       # 可选：设置访问密码
```

**示例：**

```env
NGROK_AUTHTOKEN=3F1BLtB4xgDGhoMIuhAqP***
MIAOTIXING_ID=your_miao_code_here
PORT=8765
PASSWORD=your_password_here
```

> ⚠️ **注意**：不需要手动启动服务器！Claude Code / OpenCode 会自动启动 MCP 服务器。

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
        "MIAOTIXING_ID": "your_miao_code"
      }
    }
  }
}
```

> 💡 如需密码保护，添加 `"AUTH_TOKEN": "your_password"` 到 env 中。

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

> ⚠️ OpenCode 不支持通过配置文件自动加载 MCP，需要通过初始化脚本配置。

### 步骤 1：运行初始化脚本

将 `init-opencode-mcp.bat` 复制到项目目录并运行：

```batch
.\init-opencode-mcp.bat
```

脚本会：
1. 启动交互式 `opencode mcp add`（按提示输入 name=approver, type=Local, command=node）
2. 自动补全 args 和 environment 到全局配置

**init-opencode-mcp.bat 内容：**

```batch
@echo off
echo ============================================
echo   OpenCode MCP Approval Server Setup
echo ============================================
echo.
echo Step 1: Adding MCP server (interactive)...
echo   Name: approver
echo   Type: Local
echo   Command: node
echo.
opencode mcp add

echo.
echo Step 2: Updating config with full parameters...
node -e "const fs=require('fs');const f=(process.env.USERPROFILE+'/.config/opencode/opencode.json').replace(/\\/g,'/');const c=JSON.parse(fs.readFileSync(f,'utf8'));c.mcp=c.mcp||{};c.mcp.approver={type:'local',command:['node','D:/projects/claude-approver/mcp-server.js'],environment:{MCP_MODE:'1',PORT:'8765',NGROK_AUTHTOKEN:'your_ngrok_token',MIAOTIXING_ID:'your_miao_code',DISABLE_PUSH:'false'}};fs.writeFileSync(f,JSON.stringify(c,null,2));console.log('Config updated!');"

echo.
echo Setup complete! Run: opencode
pause
```

### 步骤 2：创建行为指南

在项目根目录创建 `AGENTS.md`：

````markdown
# OpenCode 手机审批指南

## 核心原则

所有需要用户确认的操作，必须通过 MCP 工具发送到手机审批，不要在终端直接询问。

## 可用工具

| 工具                 | 用途                |
| ------------------ | ----------------- |
| request_approval   | 请求用户批准操作（危险操作前使用） |
| ask_question       | 向用户提问（需要输入时使用）    |
| check_status       | 查询请求状态            |
| close_conversation | 结束对话              |
| get_server_info    | 获取服务器信息           |

## 工具参数说明

### request_approval

| 参数          | 必填  | 说明                                       |
| ----------- | --- | ---------------------------------------- |
| command     | 是   | 要执行的命令（手机上显示为"命令"）                       |
| description | 否   | 命令描述（手机上显示为"描述"）                         |
| context     | 否   | 补充上下文信息                                  |
| risk        | 否   | 风险等级：`normal`(默认) / `warning` / `danger` |

### ask_question

| 参数              | 必填  | 说明                           |
| --------------- | --- | ---------------------------- |
| question        | 是   | 问题内容（手机上显示为"问题"，**必须是实际问题**） |
| context         | 否   | 补充说明（手机上显示为"说明"）             |
| conversation_id | 否   | 追问时传入，用于关联同一对话               |

### check_status

| 参数         | 必填  | 说明    |
| ---------- | --- | ----- |
| request_id | 是   | 请求 ID |

### close_conversation

| 参数              | 必填  | 说明        |
| --------------- | --- | --------- |
| conversation_id | 是   | 要关闭的对话 ID |

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

## 正确流程

### 审批示例

用户: "帮我安装 axios"

```
request_approval({
  command: "npm install axios",
  description: "安装 HTTP 请求库",
  risk: "normal"
})
```

### 提问示例

用户: "今天天气如何"

```
ask_question({
  question: "请问今天天气如何？",
  context: "请告诉我您所在城市的天气情况"
})
```

**注意：`question` 必须是实际问题内容，不能是工具名（如 "ask_question"）。**

## 错误流程

直接在终端弹出确认框 → 这是错的！

## 审批回复处理

用户在审批时可以附带回复。当收到 reply 字段时：

1. 理解回复内容
2. 执行用户要求
3. 继续通过 MCP 工具发送结果到手机
````

### 步骤 3：启动

```bash
opencode
```

### 验证 MCP 连接

```bash
opencode mcp list
```

预期输出：
```
●  ✓ approver connected
     node D:/projects/claude-approver/mcp-server.js
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
