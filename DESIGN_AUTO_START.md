# 自动启动功能设计文档

## 当前问题

用户每次使用 Claude Code 前需要手动启动审批服务器：
```bash
# 当前方式：手动启动
start.bat
# 或
node server.js
```

这很麻烦，容易忘记，影响使用体验。

## 期望效果

Claude Code 启动后，审批服务器自动运行，用户无感知。

---

## 方案对比

### 方案 1: CLAUDE.md 自动检查

**原理**: 在 CLAUDE.md 中写入指令，让 Claude 在会话开始时检查并启动服务器。

**实现**:
```markdown
## 启动检查
在每次会话开始时，检查审批服务器是否运行：
1. 执行: curl -s http://localhost:8765/api/health
2. 如果失败，后台启动: node D:/projects/claude-approver/server.js
3. 等待服务就绪后继续
```

**优点**:
- 简单，只需修改 CLAUDE.md
- 无需额外工具
- 跨平台

**缺点**:
- 每次新会话都要执行检查（几秒延迟）
- 依赖 Claude 执行指令
- 服务器输出混在 Claude 会话中

---

### 方案 2: 包装脚本

**原理**: 创建一个包装脚本，先启动服务器再启动 Claude。

**实现**:
```batch
@echo off
:: start-claude.bat

:: 启动审批服务器（如果没运行）
curl -s http://localhost:8765/api/health >nul 2>&1 || (
    start /b node D:/projects/claude-approver/server.js
    timeout /t 2 /nobreak >nul
)

:: 启动 Claude
claude %*
```

**优点**:
- 服务器在后台运行，输出不干扰
- 用户运行一个命令搞定

**缺点**:
- 用户需要改用新命令启动 Claude
- 需要修改使用习惯
- 多平台适配（bat/sh）

---

### 方案 3: 系统服务/计划任务

**原理**: 将服务器注册为系统服务或开机自启。

**实现** (Windows):
- 任务计划程序：用户登录时启动
- 或注册为 Windows 服务

**实现** (Linux/Mac):
- systemd service
- launchd plist

**优点**:
- 完全自动化
- 服务器独立运行

**缺点**:
- 开机就启动，不管用不用 Claude
- 配置复杂
- 需要管理员权限

---

### 方案 4: Claude Code Hooks（如果支持）

**原理**: 利用 Claude Code 的钩子机制，在会话启动时执行脚本。

**实现**:
```json
// settings.json (如果支持 hooks)
{
  "hooks": {
    "onSessionStart": "D:/projects/claude-approver/ensure-running.sh"
  }
}
```

**优点**:
- 官方支持的集成方式
- 优雅

**缺点**:
- Claude Code 可能不支持这种钩子
- 需要确认

---

### 方案 5: MCP Server 模式

**原理**: 将审批功能封装为 MCP Server，Claude Code 启动时自动加载。

**实现**:
```json
// claude_desktop_config.json 或 settings.json
{
  "mcpServers": {
    "approver": {
      "command": "node",
      "args": ["D:/projects/claude-approver/mcp-server.js"]
    }
  }
}
```

MCP Server 在启动时同时启动 HTTP 服务器。

**优点**:
- 符合 Claude Code 插件架构
- 可以提供更多 MCP 工具（不只是审批）
- 官方支持的方式

**缺点**:
- 需要重写为 MCP Server 格式
- 工作量较大

---

## 推荐方案

**短期**: 方案 1 (CLAUDE.md) + 方案 2 (包装脚本)

1. 在 CLAUDE.md 添加自动检查指令
2. 提供 `start-claude.bat/sh` 包装脚本作为替代

**长期**: 方案 5 (MCP Server)

将审批功能改造为 MCP Server，这是 Claude Code 的官方插件方式，体验最好。

---

## 待确认

1. **优先级**: 先实现哪个方案？
   - 快速方案 (CLAUDE.md)
   - 完整方案 (MCP Server)

2. **MCP 扩展**: 如果做 MCP Server，除了审批还需要暴露哪些功能？
   - 创建审批请求
   - 查询状态
   - 直接批准/拒绝（不通过手机）

3. **后台运行**: 服务器是否需要在 Claude 关闭后继续运行？
   - 是：独立进程
   - 否：随 Claude 退出

请确认方向后我开始实现。
