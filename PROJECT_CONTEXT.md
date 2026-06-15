# PROJECT_CONTEXT.md - 思考记录与决策上下文

## 当前项目状态 (2026-06-15)

### ✅ 已完成功能
- HTTP 审批服务器 (server.js, 1075行)
- 手机端暗色主题审批 UI (内嵌 HTML+CSS+JS)
- ngrok 自动隧道 + 公网访问
- 多通道推送: Server酱 / PushPlus / 邮件
- 推送消息含审批直链 (一键 approve/reject)
- 密码系统 (首次设置 + Token 鉴权)
- SSE 实时推送 (WebSocket 替代方案)
- approve.sh / approve.ps1 辅助脚本
- Windows .bat 启动 (ASCII 编码兼容)
- 端到端测试验证通过 (2026-06-12)

## 2026-06-15 修复记录

### 已修复

#### ✅ approve.sh 嵌套引号 Bug
- **现象**: `$(curl ... -d "$(jq ...)")"` 嵌套 `$()` 导致 `unexpected EOF`
- **修复**: 分两步写，先 `JSON_BODY=$(jq ...)` 再 `curl ... -d "$JSON_BODY"`

#### ✅ approve.sh 缺少 Token 传递
- **现象**: 设置密码后 approve.sh 发请求返回 `{"error":"未授权"}`
- **修复**: 自动从 `AUTH_TOKEN` 环境变量 或 `.data/auth.json` 读取 token
- **实现**: 用 bash 数组 `AUTH_ARGS=()` 动态传递 `-H "Authorization: Bearer ..."`

#### ✅ test.sh approve.sh 集成测试
- **修复**: 测试前 `export AUTH_TOKEN="$TOKEN"` 让 approve.sh 能获取到 token

### 当前测试结果: 16/16 ✅

| 测试项 | 状态 |
|--------|------|
| 健康检查 | ✅ |
| 密码设置/登录 | ✅ |
| 鉴权保护 | ✅ |
| 创建普通请求 | ✅ |
| 创建危险请求 | ✅ |
| 待审批列表 | ✅ |
| 查询状态 | ✅ |
| 批准请求 | ✅ |
| 拒绝请求 | ✅ |
| 历史记录 | ✅ |
| 隧道信息 | ✅ |
| approve.sh 集成 | ✅ |

---

## 仍待修复的问题

### 问题 1: approve/reject API 缺少鉴权检查 (严重)

**现象**: `/api/approve` 和 `/api/reject` 端点不验证 `Authorization` header
**影响**: 任何人只要知道请求 ID（8位 hex），就能审批/拒绝
**根因**: 代码中 `POST /api/approve` 和 `POST /api/reject` handler 没有调用 `checkAuth(req)`

**修复方案**:
```javascript
// server.js 第 381-393 行
'POST /api/approve': async (req, res) => {
  if (!checkAuth(req)) return json(res, 401, { error: '未授权' });  // ← 加上这行
  ...
}
'POST /api/reject': async (req, res) => {
  if (!checkAuth(req)) return json(res, 401, { error: '未授权' });  // ← 加上这行
  ...
}
```

**思考**: URL 一键审批（推送链接点击）也需要鉴权，但 token 已经在 URL 里了，
所以 `checkAuth()` 会自动从 `?token=` 参数读取，不冲突。

---

## 问题 2: URL 自动审批 (do=approve/reject) 未验证 auth (严重)

**现象**: HTML 页面中 JS 读取 URL 参数 `action`, `id`, `do`, 直接调用 decide()
**影响**: 如果推送链接被第三方获取，打开页面就自动执行审批，无需密码
**根因**: decide() 函数内部通过 `authHeaders()` 加了 token，但如果 URL 里没带 token，
且浏览器 sessionStorage 里也没有 token，请求会被 401 拒绝——
**但前提是 approve/reject API 要加上鉴权才行（见问题 1）**

**完整修复链**:
1. 后端加上 checkAuth → URL 里必须带 token 才能操作
2. 前端 decide() 已经有 authHeaders，会自动带上 TOKEN
3. 推送链接已包含 token 参数，正常流程不受影响

---

## 问题 3: SMTP 邮件发送逻辑有 Bug (中等)

**现象**: sendEmail() 函数中 STARTTLS 升级后的状态机混乱
**根因**: case 2 中同时执行了两个 step 操作:
```javascript
case 2:
  client = tls.connect({ socket: client, ... });
  send('EHLO localhost');   // ← 在 TLS 握手完成前就发了
  step = 3;
  send('AUTH LOGIN');       // ← 紧接着又发了
```
**问题**:
- TLS 握手需要时间，不能在 connect 后立刻发数据
- 连续发两个命令，第一个的响应会被第二个的逻辑处理

**修复思路**:
```javascript
case 2: // STARTTLS 升级
  const tlsSocket = tls.connect({ socket: client, rejectUnauthorized: false });
  client = tlsSocket;
  // 重新绑定 data handler 到新 socket
  tlsSocket.on('data', onData);
  tlsSocket.on('secureConnect', () => {
    send('EHLO localhost');  // 等 secureConnect 后再发
  });
  break;
```
但这个改动比较大，需要重构为事件驱动模式。当前 SMTP 功能可能没人实际使用，
优先级不高。

---

## 问题 4: approve.sh 依赖 jq (低)

**现象**: approve.sh 用 `jq` 解析 JSON，但 Windows 上 jq 不是自带的
**影响**: 用户需要先安装 jq
**替代方案**: 改用 Node.js 或 Python 做 JSON 解析，或改成纯 curl + grep
```bash
# 不用 jq，用 node 解析
REQUEST_ID=$(echo "$RESPONSE" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>console.log(JSON.parse(d).request.id))
")
```

---

## 问题 5: generateQR 函数无实际功能 (低)

**现象**: server.js 第 566-570 行定义了 generateQR()，但从未被调用
**内容**: 只是执行了一个 `url.parse()` 然后返回原字符串，并没有生成二维码
**思考**: 可能是预留的功能，想打印二维码到终端方便手机扫码
**建议**: 要么删除这段死代码，要么实现真正的终端二维码
（可用 `qrcode-terminal` npm 包，或纯 JS 实现）

---

## 架构层面的思考

### 当前架构的优势
1. **零依赖**: 只有 Node.js 标准库，部署极简
2. **单文件**: server.js 包含一切，方便分发
3. **文件存储**: 单用户场景足够，无需数据库

### 潜在问题
1. **并发写入**: requests.json 的读写没有加锁，高频调用可能丢数据
   - 但实际场景：一个人用手机审批，频率极低，不是问题
2. **Token 明文存储**: auth.json 里直接存了明文密码
   - 单用户个人工具，可接受；但如果要改进可以用 crypto.createHash
3. **HTML 内嵌**: 前端代码全在 JS 字符串里，不便维护
   - 但单文件分发的优势更大，trade-off 合理

### 如果继续发展可以考虑的方向
1. **Cloudflare Tunnel 支持**: 比 ngrok 更稳定的免费方案
2. **审批备注**: 手机上审批时能附注原因
4. **自动超时**: 超时后自动拒绝，避免 Claude 一直等
5. **多 Claude 实例**: 支持多台电脑共用一个审批服务器

---

## 上次对话可能讨论的内容（推测）

根据 LOG.md 和代码状态，上次可能讨论过：
1. Windows 编码问题 (.bat 文件中文乱码) → 已解决：改用纯 ASCII
2. ngrok 版本太低 → 已解决：升级到 3.39.7
3. Server酱推送配置 → 已解决：端到端测试通过
4. 安全扫描器绕过 → 已知结论：无法绕过，只能改写命令格式

---

## 测试状态

| 功能 | 状态 | 备注 |
|------|------|------|
| 健康检查 | ✅ | |
| 密码设置/登录 | ✅ | |
| 创建审批请求 | ✅ | |
| 批准/拒绝 | ✅ | |
| 待审批列表 | ✅ | |
| 历史记录 | ✅ | |
| SSE 实时推送 | ✅ | |
| Server酱推送 | ✅ | 端到端验证 |
| ngrok 隧道 | ✅ | |
| URL 一键审批 | ⚠️ | 后端未加鉴权（问题 2）|
| 邮件推送 | ❓ | 未测试，代码有 bug（问题 3）|
| approve.sh | ❓ | 依赖 jq |
