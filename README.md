# 📱 Claude 手机审批服务器

> 在手机上审批 Claude Code 的操作，不用守着电脑。

---

## 🎯 使用场景

### 场景 1：黄区监控蓝区 AI 开发

**问题**：蓝区的 AI 开发进度无法在黄区电脑实时查看。人一不看蓝区电脑，AI 就成了断线风筝，无法掌握任务动态。

**解决**：
- Claude 在蓝区执行开发任务
- 每个关键操作通过手机推送通知
- 在黄区用手机审批，远程掌控进度

```
蓝区 Claude: "要执行 git push 吗？"
     ↓ 推送
黄区手机: [批准] [拒绝]
     ↓ 点击
蓝区 Claude: 收到批准，继续执行
```

### 场景 2：离开电脑时 AI 不再卡死

**问题**：吃饭/下班后，Claude 遇到问题需要人工回答，整个流程卡死等你回来。

**解决**：
- Claude 的审批/提问推送到手机
- 吃饭时手机回复，不用跑回电脑前
- 支持多轮对话，远程引导 Claude

```
Claude: "我先请求审批，再搜索 MobaXterm 宏功能"
     ↓ 推送审批请求
手机收到: "Web Search: MobaXterm macro feature"
          [批准] [拒绝]
     
你在吃饭 🍜 点击批准
     ↓
Claude: 收到批准，继续搜索 ✅
```

### 场景 3：危险操作远程审批

**问题**：Claude 要执行 `rm -rf` 等危险操作，但你不在电脑前。

**解决**：
- 危险操作自动暂停，等待审批
- 手机收到红色警告
- 确认安全后才批准执行

---

## 🚀 快速开始

### 1. 配置

在项目启动目录下创建 `.mcp.json`，填入你的 token：

> ⚠️ **注意**：`.mcp.json` 必须放在你运行 `claude` 命令的目录下，Claude Code 只会读取当前目录的 MCP 配置。

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
        "MIAOTIXING_ID": "你的喵码"
      }
    }
  }
}
```

### 2. 启动 Claude

```bash
cd D:\projects\claude-approver
claude
```

服务器会自动启动。

### 3. 手机访问

打开启动时显示的公网地址：
```
https://xxxx.ngrok-free.dev?token=你的密码
```

### 4. 创建 CLAUDE.md（重要！）

在项目根目录创建 `CLAUDE.md`，告诉 Claude 必须用手机审批。否则 Claude 会直接在终端弹确认框，不会发到手机。

````markdown
# 手机审批规范

所有需要用户确认的内容都必须发到手机，不能在终端直接弹确认框。

## 操作前必须请求手机审批

所有可能产生影响的操作，都必须先调用 `request_approval` 获得批准：

| 操作类型 | 是否需要审批 |
|---------|-------------|
| Web Search | ✅ 需要 |
| 执行命令（bash、npm、git 等） | ✅ 需要 |
| 读写文件 | ✅ 需要 |
| 网络请求 | ✅ 需要 |
| 安装软件 | ✅ 需要 |

## 提问必须发到手机

所有需要用户回答、选择、确认的内容，都必须通过 MCP 工具发到手机：

- 问题 → 用 `ask_question` 发到手机
- 选项/建议 → 用 `ask_question` 的 `context` 参数发送
- 操作审批 → 用 `request_approval` 发到手机
````

> ⚠️ **每个项目都需要一份 CLAUDE.md**。没有它，Claude 不知道要用手机审批。

---

## 📲 功能说明

### MCP 工具

| 工具 | 用途 |
|------|------|
| `request_approval` | 请求用户批准操作 |
| `ask_question` | 向用户提问，等待回复 |
| `check_status` | 查询请求状态 |
| `close_conversation` | 结束对话 |
| `get_server_info` | 获取服务器信息 |

### 使用场景

**审批操作**
```
Claude 要执行危险命令 → 手机收到审批请求 → 点"批准"或"拒绝"
```

**提问交互**
```
Claude 需要用户输入 → 手机显示问题 → 用户回复 → Claude 继续
```

**带选项的提问**
```
Claude 调用 ask_question:
  question: "请选择："
  context: "1. 选项A\n2. 选项B\n3. 选项C"

→ 手机显示选项列表 → 用户回复编号
```

---

## 🔧 配置项

| 环境变量 | 说明 | 必填 |
|---------|------|------|
| `PORT` | 本地端口 | 否，默认 8765 |
| `TUNNEL` | 隧道类型 | 否，默认 ngrok |
| `NGROK_AUTHTOKEN` | ngrok 认证 token | 用 ngrok 时必填 |
| `MIAOTIXING_ID` | 喵提醒喵码 | 否，微信推送用（每天100条） |
| `SMTP_HOST` | 邮件 SMTP 主机 | 否，邮件推送用 |
| `SMTP_PORT` | SMTP 端口 | 否，默认 465 |
| `SMTP_USER` | SMTP 用户名 | 否 |
| `SMTP_PASS` | SMTP 密码 | 否 |
| `SMTP_TO` | 收件人邮箱 | 否 |
| `AUTH_TOKEN` | 访问密码 | 否，首次访问时设置 |
| `DISABLE_PUSH` | 禁用推送通知 | 否，默认 false |

### 禁用推送通知

开发调试或夜间模式时，可以禁用微信/邮件推送：

```json
{
  "env": {
    "DISABLE_PUSH": "true"
  }
}
```

禁用后：
- ✅ 审批/提问功能正常（可在手机网页查看）
- ❌ 不发送微信喵提醒/邮件通知
- ✅ 启动时显示 `⚠️ 推送通知已禁用`

支持的值：`true` / `1` / `yes`（不区分大小写）

---

## 📁 文件结构

```
claude-approver/
├── mcp-server.js      # MCP 服务器（协议层，异常捕获）
├── server.js          # HTTP 服务器核心（自愈模式、喵提醒推送）
├── .mcp.json          # MCP 配置（MIAOTIXING_ID=你的喵码）
├── CLAUDE.md          # Claude 使用指南
├── config.env         # 环境变量配置
├── PROJECT_CONTEXT.md # 项目决策与进展记录
├── AI编程实践.md       # 实战复盘文档（含测试用例）
├── TEST_CASES.md      # 测试用例
├── screenshots/       # 测试截图目录
├── start.bat          # 手动启动脚本
└── .data/             # 运行时数据
    ├── auth.json      # 认证信息
    └── requests.json  # 请求记录
```

---

## ❓ 常见问题

**Q: 密码忘了？**
删除 `.data/auth.json`，重启重新设置。

**Q: 手机打不开？**
- 确认服务器在运行
- ngrok 链接首次要点 "Visit Site"

**Q: 公网地址每次变？**
免费版 ngrok 正常现象。

---

## 📝 更新日志

- 2026-06-22: 推送通道迁移：Server酱/WxPusher/PushPlus → 喵提醒（每天100条）
- 2026-06-22: 服务器自愈机制（崩溃自动重启、健康监控）
- 2026-06-22: 新增 `DISABLE_PUSH` 配置，可禁用推送通知
- 2026-06-15: MCP Server 完成，支持审批和对话功能
- 2026-06-15: 修复端口冲突问题，自动清理旧进程
- 2026-06-15: 手机端显示选项列表
