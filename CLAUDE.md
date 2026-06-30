# Claude 手机审批服务器 - AI 助手指南

## 重要：使用 MCP 工具与用户交互

当需要用户确认或提问时，**必须**使用 MCP 工具，而不是直接询问。

## 何时使用 MCP 工具

### 1. 危险操作前 → 使用 `request_approval`
- 删除文件/数据
- 执行系统命令
- 修改重要配置
- 任何不可逆操作

### 2. 需要用户输入时 → 使用 `ask_question`
- 询问用户偏好
- 获取决策信息
- 多轮对话确认

### 3. 示例场景

| 用户说 | Claude 应该做 |
|--------|---------------|
| "删除所有文件" | 调用 `request_approval` 请求批准 |
| "问我今天想吃什么" | 调用 `ask_question` 提问，等待手机回复 |
| "执行 rm -rf /" | 调用 `request_approval` (risk: "danger") |

## MCP 工具列表

| 工具 | 用途 | 阻塞? |
|------|------|-------|
| `request_approval` | 请求用户批准命令 | 是，等待用户操作 |
| `ask_question` | 向用户提问 | 是，等待用户回复 |
| `check_status` | 查询请求状态 | 否 |
| `close_conversation` | 结束对话 | 否 |
| `get_server_info` | 获取服务器信息 | 否 |

## 核心原则：所有交互都在手机上

**重要：所有需要用户回答、选择、确认的内容，都必须通过 MCP 工具发送到手机！**

不要在终端直接显示选项让用户选择。用户希望：
- 问题 → 发到手机
- 选项/建议 → 发到手机
- 确认 → 发到手机
- **操作审批 → 发到手机**（包括 Web Search、文件操作、命令执行等）

---

## ⚠️ 例外：DISABLE_PUSH=true 时，改用终端交互

**如何判断**：调用 `get_server_info`，若返回 `"push_disabled": true`，说明推送已禁用。

**行为变化**：

| 情况 | DISABLE_PUSH=false（默认） | DISABLE_PUSH=true |
|------|--------------------------|------------------|
| 提问 | 调用 `ask_question`，等手机回复 | 直接在终端输出问题，等终端回复 |
| 操作审批 | 调用 `request_approval`，等手机批准 | 直接在终端说明操作，等终端确认 |
| 推送通知 | 微信收到推送 | 不推送微信 |
| 手机端网页 | 可主动查看 | 可主动查看（但无通知） |

**DISABLE_PUSH=true 时的正确做法** ✅

```
用户: "帮我想个项目名"

Claude 应该直接在终端输出:
"帮你想了一些项目名，请回复编号选择：
1. 隔空取物 🎯
2. 飞鸽传令 🕊️
3. 掌上提线 🪆"

然后在终端等待用户回复（不调用 ask_question）
```

**DISABLE_PUSH=true 时的错误做法** ❌

```
Claude 调用 ask_question 发到手机
→ 用户不会收到微信通知，也不会看手机
→ 导致 Claude 一直等待手机回复，卡住
```

**重要**：`DISABLE_PUSH=true` 意味着用户选择不用手机，此终端就是唯一交互界面。不要调用 `ask_question` 或 `request_approval`，直接用终端沟通。

### ⚠️ 关键：操作前必须请求手机审批

**所有**可能产生影响的操作，都必须先调用 `request_approval` 获得用户批准：

| 操作类型 | 是否需要审批 | 示例 |
|---------|-------------|------|
| Web Search | ✅ 需要 | 搜索前先审批 |
| 执行命令 | ✅ 需要 | bash、npm、git 等 |
| 读写文件 | ✅ 需要 | 创建、修改、删除文件 |
| 网络请求 | ✅ 需要 | curl、fetch 等 |
| 安装软件 | ✅ 需要 | pip install、npm install 等 |

### 正确流程 ✅

```
用户: "帮我查一下 MobaXterm 的 macro 功能"

Claude 应该:
1. 调用 request_approval:
   command: "Web Search: MobaXterm macro feature"
   description: "搜索 MobaXterm 宏功能的使用方法"
   risk: "normal"
2. 等待用户在手机上点"批准"
3. 批准后才执行搜索
4. 把结果通过 ask_question 发到手机
```

### 错误流程 ❌

```
Claude 直接弹出 Claude Code 的确认框:
"Do you want to proceed? Yes/No"

这是错的！应该通过 request_approval 发到手机审批。
```

### 正确做法 ✅

用户说："帮我想个项目名"

```
Claude 调用 ask_question:
  question: "帮你想了一些项目名，请回复编号选择："
  context: "1. 隔空取物 🎯\n2. 飞鸽传令 🕊️\n3. 掌上提线 🪆\n4. 千里眼 🔭\n5. 御风而行 🌬️\n6. 遥控大王 👑"
```

用户在手机上看到选项，回复 "2"

### 错误做法 ❌

```
Claude 直接在终端输出：
"这里有几个建议：
1. 隔空取物
2. 飞鸽传令
..."
```

## 使用示例

### 提问 + 选项
```
工具: ask_question
参数:
  question: "请选择项目名（回复编号）："
  context: "1. 隔空取物\n2. 飞鸽传书\n3. 千里眼"
```

### 请求审批
```
工具: request_approval
参数:
  command: "rm -rf /tmp/old-files"
  description: "清理临时文件"
  risk: "warning"
```

## 审批回复处理

### 重要：审批附带回复时的处理流程

用户在审批时可以在输入框中附带回复消息。当 `request_approval` 返回结果包含 `reply` 字段时，Claude 必须：

1. **读取回复内容** - 理解用户的指令
2. **执行用户要求** - 按回复内容执行操作
3. **继续发送到手机** - 后续操作仍需通过 `request_approval` 或 `ask_question` 发送到手机

### 正确流程 ✅

```
场景：用户要求安装依赖，并希望在审批时给出额外指令

1. Claude 调用 request_approval:
   command: "npm install axios"
   description: "安装 HTTP 客户端"

2. 用户在手机上：
   - 输入回复："检查一下是否需要调整配置，然后继续下一步"
   - 点击「批准」

3. Claude 收到：
   {
     status: "approved",
     reply: "检查一下是否需要调整配置，然后继续下一步",
     conversation_id: "xxx"
   }

4. Claude 应该：
   - 执行 npm install axios（已批准的操作）
   - 检查配置是否需要调整
   - 把检查结果或下一步操作通过 request_approval/ask_question 继续发到手机
```

### 错误流程 ❌

```
Claude 收到 reply 后：
- 只在终端显示回复内容
- 没有继续发送后续操作到手机
- 用户需要反复切换到电脑查看进度

这是错的！远程开发时，用户希望所有交互都在手机上完成。
```

### 关键原则

| 场景 | Claude 应该做 |
|------|---------------|
| reply 包含"继续"、"下一步" | 继续通过 request_approval 发送后续操作 |
| reply 包含问题 | 通过 ask_question 回复到手机 |
| reply 包含调整指令 | 执行调整后，把结果发到手机 |
| reply 为 null | 正常继续当前流程 |

---

## 注意
- 用户在手机上会收到推送通知
- 支持多轮对话（使用返回的 conversation_id 追问）
- 超时时间可通过 timeout 参数设置
