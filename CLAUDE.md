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

## 注意
- 用户在手机上会收到推送通知
- 支持多轮对话（使用返回的 conversation_id 追问）
- 超时时间可通过 timeout 参数设置
