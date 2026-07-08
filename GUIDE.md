# 手机审批服务器 - 使用指南

> 按步骤操作，5 分钟完成配置。

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
ngrok authtoken 你的Token
```

---

## 第四步：创建配置文件

在项目根目录创建 `config.env`：

```env
NGROK_AUTHTOKEN=你的ngrok_token
MIAOTIXING_ID=你的喵码
```

---

## 第五步：配置 AI 工具

选择你使用的工具，按说明配置：

<details>
<summary><b>Claude Code 用户</b></summary>

在项目根目录创建 `.mcp.json`：

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

启动：`claude`

</details>

<details>
<summary><b>OpenCode 用户</b></summary>

运行初始化脚本：

```bash
init-opencode-mcp.bat
```

按提示输入：
- name: `approver`
- type: `Local`  
- command: `node`

创建 `AGENTS.md`（内容见下方附录）

启动：`opencode`

</details>

---

## 第六步：验证

在 AI 工具中输入：

```
帮我安装 axios
```

预期：
- ✅ 手机收到微信通知
- ✅ 点击「批准」后继续执行

---

## 附录：AGENTS.md 内容

<details>
<summary>展开复制</summary>

````markdown
# OpenCode 手机审批指南

## 核心原则

所有需要用户确认的操作，必须通过 MCP 工具发送到手机审批，不要在终端直接询问。

## 可用工具

| 工具 | 用途 |
|------|------|
| request_approval | 请求用户批准操作 |
| ask_question | 向用户提问 |
| check_status | 查询请求状态 |
| close_conversation | 结束对话 |
| get_server_info | 获取服务器信息 |

## 使用时机

- **request_approval**：删除文件、执行命令、修改配置、Web Search、安装依赖
- **ask_question**：询问偏好、提供选项、多轮对话

## 正确示例

```
request_approval({
  command: "npm install axios",
  description: "安装 HTTP 请求库",
  risk: "normal"
})
```

## 注意事项

- `question` 必须是实际问题，不能是工具名
- 收到 reply 时，执行用户要求并继续发送结果到手机
````

</details>
