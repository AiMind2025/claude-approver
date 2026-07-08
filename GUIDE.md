# 手机审批服务器 - 使用指南

> 按步骤操作即可完成配置。

---

## 第一步：下载项目

```bash
git clone https://github.com/AiMind2025/claude-approver.git
cd claude-approver
```

> 没有 Git？访问 https://github.com/AiMind2025/claude-approver 点击 Code → Download ZIP

---

## 第二步：获取凭证

### 2.1 喵码（微信推送）

1. 微信扫码关注 [喵提醒](https://miaotixing.com)
2. 按自动回复获取喵码

### 2.2 ngrok Token（内网穿透）

1. 注册 [ngrok.com](https://ngrok.com)（⚠️ 需梯子）
2. 进入 Dashboard，复制 Authtoken

---

## 第三步：安装 ngrok

**方式一：官网下载**（需梯子）

访问 https://ngrok.com/download ，解压到项目目录

**方式二：命令行下载**（无需梯子）

```bash
curl -L -o ngrok.zip "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip"
unzip ngrok.zip
```

**配置 Token：**

```bash
# 在项目目录下执行（ngrok.exe 所在目录）
.\ngrok.exe authtoken 你的Token
```

---

## 第四步：创建配置文件

> 📍 **文件位置**：在项目根目录（和 `server.js` 同一层）创建 `config.env`

```
claude-approver/
├── server.js          ← 服务器主程序
├── mcp-server.js      ← MCP 协议层
├── config.env         ← ⭐ 在这里创建
├── .mcp.json          ← Claude Code 配置
└── ...
```

**config.env 内容：**

```env
NGROK_AUTHTOKEN=你的ngrok_token
MIAOTIXING_ID=你的喵码
```

---

## 第五步：配置 AI 工具

根据你使用的工具，完成对应配置：

### Claude Code 用户

**5.1 创建 `.mcp.json`：**

```json
{
  "mcpServers": {
    "approver": {
      "command": "node",
      "args": ["D:/你的路径/claude-approver/mcp-server.js"],
      "env": {
        "MCP_MODE": "1"
      }
    }
  }
}
```

> ⚠️ 把 `D:/你的路径/` 替换为实际路径

**5.2 创建 `CLAUDE.md`：**

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

**5.3 启动：**

```bash
claude
```

---

### OpenCode 用户

**5.1 创建并运行初始化脚本：**

创建 `init-opencode-mcp.bat`：

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

运行脚本：

```bash
.\init-opencode-mcp.bat
```

按提示输入：
- name: `approver`
- type: `Local`  
- command: `node`

**5.2 创建 `AGENTS.md`：**

````markdown
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

## 工具参数说明

### request_approval

| 参数 | 必填 | 说明 |
|------|------|------|
| command | 是 | 要执行的命令 |
| description | 否 | 命令描述 |
| context | 否 | 补充上下文信息 |
| risk | 否 | 风险等级：`normal`(默认) / `warning` / `danger` |

### ask_question

| 参数 | 必填 | 说明 |
|------|------|------|
| question | 是 | 问题内容（**必须是实际问题**） |
| context | 否 | 补充说明 |
| conversation_id | 否 | 追问时传入，用于关联同一对话 |

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

用户: "帮我安装 axios"

```
request_approval({
  command: "npm install axios",
  description: "安装 HTTP 请求库",
  risk: "normal"
})
```

**注意：`question` 必须是实际问题内容，不能是工具名（如 "ask_question"）。**

## 错误流程 ❌

直接在终端弹出确认框 → 这是错的！

## 审批回复处理

用户在审批时可以附带回复。当收到 reply 字段时：
1. 理解回复内容
2. 执行用户要求
3. 继续通过 MCP 工具发送结果到手机
````

**5.3 启动：**

```bash
opencode
```

---

## 第六步：验证

### 测试 1：服务启动

```bash
curl http://localhost:8765/api/health
```

预期返回：
```json
{"ok":true,"pending":0,"tunnel":"https://xxx.ngrok-free.dev"}
```

### 测试 2：审批功能

在 AI 工具中输入：
```
帮我安装 axios
```

预期：
- ✅ 手机收到微信通知
- ✅ 审批页显示命令和风险等级
- ✅ 点击「批准」后继续执行

### 测试 3：多轮对话

在 AI 工具中输入：
```
帮我想个项目名
```

预期：
- ✅ 手机收到提问（带选项）
- ✅ 在手机上回复后，AI 继续对话

### 测试 4：审批附带回复

在手机审批页面：
1. 在回复框输入指令（如"检查配置后再执行"）
2. 点击批准

预期：
- ✅ AI 收到回复内容
- ✅ AI 根据回复执行额外操作
