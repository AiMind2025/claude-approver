# Claude Approver MCP 配置指南

## 什么是 MCP Server？

MCP (Model Context Protocol) 是 Claude Code 的插件协议。配置后，Claude Code 启动时会自动加载审批服务器，无需手动启动。

---

## 配置步骤

### 1. 找到全局配置文件

**Windows**:
```
%APPDATA%\Claude\claude_desktop_config.json
```

**macOS**:
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Linux**:
```
~/.config/Claude/claude_desktop_config.json
```

### 2. 添加 MCP Server 配置

```json
{
  "mcpServers": {
    "approver": {
      "command": "node",
      "args": ["D:/projects/claude-approver/mcp-server.js"],
      "env": {
        "PORT": "8765",
        "TUNNEL": "ngrok",
        "NGROK_AUTHTOKEN": "你的ngrok_token",
        "SERVERCHAN_KEY": "你的Server酱Key"
      }
    }
  }
}
```

### 3. 重启 Claude Code

配置完成后，重启 Claude Code。MCP Server 会自动启动。

---

## 使用方式

配置完成后，Claude 可以直接调用以下工具：

### request_approval - 请求审批

```
Claude: 执行这个命令前需要你的批准
[调用 request_approval]
[等待用户在手机上批准/拒绝]
[收到结果后继续]
```

### ask_question - 提问

```
Claude: 我需要问你一个问题
[调用 ask_question]
[等待用户在手机上输入回复]
[收到回复后继续]
```

### get_server_info - 查询状态

```
Claude: 让我检查一下服务器状态
[调用 get_server_info]
[返回: 端口、隧道地址、待审批数量等]
```

---

## 可用工具列表

| 工具 | 用途 | 参数 |
|------|------|------|
| request_approval | 请求批准命令 | command, description, risk, timeout |
| ask_question | 提问等回复 | question, context, timeout, conversation_id |
| check_status | 查询状态（非阻塞）| request_id |
| close_conversation | 结束对话 | conversation_id |
| get_server_info | 获取服务器信息 | 无 |

---

## 与传统模式对比

| 特性 | MCP Server | 传统模式 (手动启动) |
|------|-----------|-------------------|
| 启动方式 | 自动 | 手动 `start.bat` |
| Claude 调用 | 直接调用 tool | 需要 shell 脚本 |
| 手机访问 | 相同 | 相同 |
| 推送通知 | 相同 | 相同 |
| 配置复杂度 | 需配置 settings.json | 无 |

---

## 故障排查

### MCP Server 未加载

1. 检查配置文件路径是否正确
2. 检查 JSON 格式是否有效
3. 查看 Claude Code 日志

### 端口冲突

如果 8765 端口被占用：
1. 修改配置中的 `PORT` 环境变量
2. 或杀掉占用端口的进程

### 手机无法访问

1. 检查 ngrok 是否正常运行
2. 查看 stderr 日志获取公网地址

---

## 同时支持两种模式

MCP Server 和传统 HTTP 服务器可以共存：

- **MCP 模式**: Claude Code 自动启动 mcp-server.js
- **HTTP 模式**: 手动运行 `start.bat` 启动 server.js

两者共享同一个数据存储（.data/requests.json），手机访问界面相同。

注意：如果 MCP Server 已启动，再手动运行 server.js 会因端口冲突失败。
