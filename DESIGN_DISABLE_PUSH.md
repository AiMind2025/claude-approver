# 设计文档：.mcp.json 禁用推送配置

## 需求描述

在 `.mcp.json` 中增加配置项，可以禁用发送审批消息（推送通知）。

## 使用场景

| 场景 | 说明 |
|------|------|
| 开发调试 | 本地测试时不想收到微信推送 |
| 夜间模式 | 晚上不想被打扰 |
| 网络问题 | 推送服务不可用时避免错误 |
| 纯本地使用 | 不需要手机审批，只在电脑上看 |

---

## 设计方案

### 方案概述

新增环境变量 `DISABLE_PUSH`，控制是否发送推送通知。

### 配置示例

```json
{
  "mcpServers": {
    "approver": {
      "command": "node",
      "args": ["D:/projects/claude-approver/mcp-server.js"],
      "env": {
        "PORT": "8765",
        "TUNNEL": "ngrok",
        "NGROK_AUTHTOKEN": "xxx",
        "SERVERCHAN_KEY": "xxx",
        "DISABLE_PUSH": "true"
      }
    }
  }
}
```

### 配置项说明

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `DISABLE_PUSH` | `true` / `1` / `yes` | 禁用所有推送通知 |
| `DISABLE_PUSH` | `false` / `0` / `no` / 不设置 | 正常发送推送（默认） |

### 禁用后的行为

| 功能 | 禁用推送后 |
|------|-----------|
| 审批请求创建 | ✅ 正常（存入 store） |
| 手机端网页访问 | ✅ 正常（可主动查看） |
| 微信推送 | ❌ 不发送 |
| PushPlus 推送 | ❌ 不发送 |
| 邮件推送 | ❌ 不发送 |
| ngrok 隧道 | ✅ 正常启动 |
| 日志输出 | ✅ 显示 `[推送已禁用]` |

---

## 实现细节

### 1. server.js 修改

```javascript
// ─── 配置 ────────────────────────────────────────────────────────────────────
const PORT     = parseInt(process.env.PORT || '8765', 10);
const DISABLE_PUSH = ['true', '1', 'yes'].includes(
  (process.env.DISABLE_PUSH || '').toLowerCase()
);

// ... 其他配置不变 ...

// ─── 推送函数修改 ─────────────────────────────────────────────────────────────
async function pushNotify(title, desp, reqId) {
  // 检查是否禁用推送
  if (DISABLE_PUSH) {
    log('[推送已禁用]', title);
    return;
  }

  // 原有推送逻辑...
}
```

### 2. 启动时日志输出

```javascript
// 在 main() 函数中
async function main() {
  log(`服务器启动在端口 ${PORT}`);
  if (DISABLE_PUSH) {
    log('⚠️  推送通知已禁用 (DISABLE_PUSH=true)');
  }
  // ... 其他初始化 ...
}
```

### 3. 状态查询返回禁用状态

```javascript
// get_server_info 工具返回中添加
{
  port: 8765,
  push_disabled: DISABLE_PUSH,  // 新增
  // ...
}
```

---

## 测试计划

### 测试用例 1：禁用推送 - 基本功能

**前置条件**
```json
{
  "env": {
    "DISABLE_PUSH": "true"
  }
}
```

**测试步骤**
1. 重启 Claude Code（重新加载 .mcp.json）
2. 调用 `request_approval` 创建审批请求
3. 检查微信是否收到推送

**预期结果**
- ✅ 审批请求创建成功
- ❌ 微信没有收到推送
- ✅ 服务器日志显示 `[推送已禁用]`
- ✅ 手机端打开网页可以看到待审批项

---

### 测试用例 2：禁用推送 - 不同值格式

**测试不同值**

| 配置值 | 预期行为 |
|--------|---------|
| `"true"` | ✅ 禁用 |
| `"TRUE"` | ✅ 禁用（大小写不敏感） |
| `"1"` | ✅ 禁用 |
| `"yes"` | ✅ 禁用 |
| `"false"` | ❌ 不禁用，正常推送 |
| `"0"` | ❌ 不禁用，正常推送 |
| 不设置 | ❌ 不禁用，正常推送 |

---

### 测试用例 3：禁用推送 - 提问功能

**测试步骤**
1. 设置 `DISABLE_PUSH=true`
2. 调用 `ask_question` 创建提问
3. 检查微信是否收到推送

**预期结果**
- ✅ 提问创建成功
- ❌ 微信没有收到推送
- ✅ 手机端可以回复问题

---

### 测试用例 4：切换配置

**测试步骤**
1. 设置 `DISABLE_PUSH=true`，创建审批请求 → 无推送
2. 修改为 `DISABLE_PUSH=false`，重启 Claude Code
3. 创建新审批请求 → 收到推送

**预期结果**
- ✅ 配置切换生效
- ✅ 重启后新配置生效

---

### 测试用例 5：get_server_info 返回状态

**测试步骤**
1. 设置 `DISABLE_PUSH=true`
2. 调用 `get_server_info`

**预期结果**
```json
{
  "port": 8765,
  "push_disabled": true,
  "tunnel_url": "https://...",
  ...
}
```

---

### 测试用例 6：日志输出验证

**测试步骤**
1. 设置 `DISABLE_PUSH=true`
2. 启动服务器
3. 查看 stderr 日志

**预期输出**
```
[MCP] 服务器启动在端口 8765
[MCP] ⚠️  推送通知已禁用 (DISABLE_PUSH=true)
[MCP] ngrok 隧道已连接: https://xxx.ngrok-free.dev
```

创建审批请求时：
```
[MCP] [推送已禁用] 新审批请求: rm -rf /tmp/old-files
```

---

## 边界情况

| 情况 | 处理方式 |
|------|---------|
| 推送禁用 + ngrok 禁用 | 两者独立，都生效 |
| 推送禁用 + 无 ServerChan Key | 正常，本来就无推送 |
| 运行时动态修改 env | 不支持，需重启 Claude Code |

---

## 文件修改清单

| 文件 | 修改内容 |
|------|---------|
| `server.js` | 添加 `DISABLE_PUSH` 常量，修改 `pushNotify()` |
| `mcp-server.js` | `handleGetServerInfo()` 返回 `push_disabled` |
| `PROJECT_CONTEXT.md` | 记录新功能 |

---

## 实现代码

### server.js 修改

```javascript
// 第 46 行附近，添加配置
const DISABLE_PUSH = ['true', '1', 'yes'].includes(
  (process.env.DISABLE_PUSH || '').toLowerCase()
);

// 第 179 行附近，修改 pushNotify 函数
async function pushNotify(title, desp, reqId) {
  if (DISABLE_PUSH) {
    log('[推送已禁用]', title.slice(0, 50));
    return;
  }

  const tasks = [];
  const fullDesp = desp + (reqId ? `\n\n请求ID: ${reqId}` : '');

  // 1. Server酱
  if (PUSH.serverchan) {
    // ... 原有逻辑 ...
  }

  // 2. PushPlus
  if (PUSH.pushplus) {
    // ... 原有逻辑 ...
  }

  // 3. 邮件
  if (PUSH.smtpHost) {
    // ... 原有逻辑 ...
  }
}

// main() 函数中添加启动日志
async function main() {
  if (DISABLE_PUSH) {
    log('⚠️  推送通知已禁用 (DISABLE_PUSH=true)');
  }
  // ... 原有逻辑 ...
}
```

### mcp-server.js 修改

```javascript
// handleGetServerInfo 函数修改
async function handleGetServerInfo() {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        port: core.PORT,
        push_disabled: core.DISABLE_PUSH,  // 新增
        tunnel_url: core.getTunnelURL(),
        // ... 其他字段 ...
      })
    }]
  };
}
```

---

## 验收标准

- [ ] `DISABLE_PUSH=true` 时，不发送任何推送通知
- [ ] `DISABLE_PUSH=false` 或不设置时，正常发送推送
- [ ] 启动日志显示禁用状态
- [ ] `get_server_info` 返回 `push_disabled` 字段
- [ ] 审批/提问功能在禁用推送后仍可正常使用
- [ ] 手机端可主动查看待处理项

---

## 后续扩展（可选）

1. **按级别禁用**：`DISABLE_PUSH=danger` 只禁用危险级别推送
2. **时间段禁用**：`DISABLE_PUSH_HOURS=22-8` 夜间禁用
3. **动态切换**：提供 API 在运行时切换推送状态
