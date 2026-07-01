# OpenCode 适配设计文档

## 概述

将 Claude 手机审批服务器适配到 OpenCode，实现相同的移动端审批功能。

## 可行性分析

| 组件 | 状态 | 说明 |
|------|------|------|
| server.js | ✅ 无需修改 | HTTP 服务器、ngrok、喵提醒推送逻辑通用 |
| mcp-server.js | ✅ 无需修改 | 已实现标准 MCP 协议（JSON-RPC over stdin/stdout） |
| 配置文件 | ⚠️ 需要新增 | OpenCode 使用不同的配置格式 |

**结论**：由于 OpenCode 原生支持 MCP 协议，核心代码无需修改，仅需提供 OpenCode 的配置说明。

---

## OpenCode MCP 配置

### 配置文件位置

OpenCode 的 MCP 配置通常在以下位置之一：
- 项目级：`./opencode.json` 或 `./.opencode/config.json`
- 全局级：`~/.config/opencode/config.json`

### 配置示例

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
        "MIAOTIXING_ID": "tz1qP8C",
        "PASSWORD": "test9876"
      }
    }
  }
}
```

### 环境变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| MCP_MODE | 是 | 设为 "1" 启用 MCP 模式 |
| PORT | 否 | HTTP 服务器端口，默认 8765 |
| NGROK_AUTH | 是 | ngrok 认证 token |
| MIAOTIXING_ID | 是 | 喵提醒喵码 |
| PASSWORD | 否 | 手机端访问密码 |

---

## 使用流程

### 1. 安装 OpenCode

```bash
# macOS/Linux
curl -fsSL https://opencode.ai/install | bash

# 或使用 npm
npm install -g @opencode/cli
```

### 2. 配置 MCP 服务器

在项目目录创建 `opencode.json`（见上方配置示例）

### 3. 启动 OpenCode

```bash
opencode
```

OpenCode 会自动启动配置的 MCP 服务器，审批系统即可使用。

### 4. 验证连接

在 OpenCode 中输入：
```
帮我问一下用户今天想吃什么
```

如果手机端收到推送，说明适配成功。

---

## 工具列表

适配后可用的 MCP 工具（与 Claude Code 相同）：

| 工具 | 用途 | 阻塞? |
|------|------|-------|
| `request_approval` | 请求用户批准操作 | 是 |
| `ask_question` | 向用户提问 | 是 |
| `check_status` | 查询请求状态 | 否 |
| `close_conversation` | 结束对话 | 否 |
| `get_server_info` | 获取服务器信息 | 否 |

---

## 潜在问题与解决方案

### 问题 1：OpenCode 配置格式变更

**现象**：OpenCode 版本更新后配置格式可能变化

**解决**：参考 OpenCode 官方文档更新配置：
- 官网：https://opencode.ai
- Changelog：https://opencode.ai/changelog

### 问题 2：MCP 工具名称识别

**现象**：社区反馈 OpenCode 有时会「幻觉」MCP 工具名称

**解决**：
1. 在 OpenCode 提示词中明确列出可用工具
2. 创建 `AGENTS.md` 或项目说明文件，列出工具用法

### 问题 3：stdio 通信异常

**现象**：MCP 服务器启动但工具不可用

**解决**：
1. 检查 `mcp-server.js` 日志（输出到 stderr）
2. 确认 Node.js 版本 >= 18
3. 验证环境变量是否正确传递

---

## 测试清单

- [ ] OpenCode 能正常启动 MCP 服务器
- [ ] 手机端能收到推送通知
- [ ] `request_approval` 工具可用
- [ ] `ask_question` 工具可用
- [ ] 多轮对话功能正常
- [ ] 审批回复功能正常

---

## 参考资源

- [OpenCode 官网](https://opencode.ai)
- [OpenCode Changelog](https://opencode.ai/changelog)
- [How to Add MCP to OpenCode](https://composio.dev/content/mcp-with-opencode)
- [MCP 协议规范](https://modelcontextprotocol.io)

---

## 更新记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-06-30 | v1.0 | 初始设计文档 |
