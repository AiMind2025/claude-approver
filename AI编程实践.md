# 【造工具而非反复造技能：2 小时搭建手机审批服务器，效率提升 6.8 倍】

---

## 1. 项目概览

### 背景与价值

在 AI 编程实践中，开发者常常面临以下痛点：

- **人肉审批困局**：Claude Code 每次执行危险操作（`rm`、`git push`、`npm install`）都需在终端确认，开发者必须守在电脑前
- **离开即卡死**：吃饭/下班后，Claude 遇到需要确认的环节就暂停，整个流程等半天
- **黄蓝区隔离**：蓝区的 AI 开发进度无法在黄区电脑实时查看，人一不看蓝区电脑，AI 就成了断线风筝

**Claude 手机审批服务器**正是为解决这些问题而生。它能够快速搭建一个完整的审批系统，让开发者通过手机远程审批 Claude 请求，随时随地掌控 AI 开发进度。

**核心收益**：初始开发效率提升 6.8 倍（传统 15h → AI 协作 2h），约 1,500 行代码（server.js ~1,400 行 + mcp-server.js ~500 行）；后续迭代（推送迁移、自愈机制、测试用例）同样高效；零外部依赖，开箱即用。

### 核心价值

| 价值点       | 说明                                                           |
| --------- | ------------------------------------------------------------ |
| **快速生成**  | 2 小时从零搭建完整系统（传统模式需 15 小时），效率提升 6.8 倍                         |
| **代码精简**  | 约 1,500 行代码实现完整功能（server.js ~1,400 行 + mcp-server.js ~500 行） |
| **零依赖**   | Node.js 内置模块，无需 npm 安装，开箱即用                                  |
| **多通道推送** | 喵提醒（微信）+ 邮件，审批请求实时送达手机                                       |
| **自愈机制**  | 崩溃自动重启 + 健康监控，无需人工值守                                         |
| **可复用工具** | 一次生成，永久使用，可部署到团队共享                                           |
| **多工具协作** | Claude Code + ngrok + 喵提醒 + MCP 协议，多种工具无缝集成                  |

---

## 2. 场景详述

### 典型场景

**场景 1：AI 自主开发中的动态依赖审批**
场景模式：AI 编码破局

> Claude 正在本地进行高强度自动化编码，为了攻克某个技术难点，它自主判定需要引入一个新的第三方依赖包。此时你正外出在途，手机忽然收到一条微信通知。
> 打开审批卡片，卡片中清晰呈现了 Claude 自动生成的 Context 上下文说明（详述了为什么要装、有没有替代方案、潜在的许可证风险等）。你边走边看，在手机上轻点「批准」，远端处于挂机状态的 Claude 瞬间收到信号，无缝继续其开发流程。

![微信通知](screenshots/wechat-notification.png)

![审批用例](screenshots/approval-card.png)

**场景 2：基于移动端的远程架构决策**
场景模式：随时随地对话

> 你给远端的 Claude 下达大方向指令：「把当前项目部署到云平台上」。Claude 在分析本地项目结构后，通过手机弹出多轮对话询问你的云厂商偏好。
> 你回复：「看看有没有字节系列的」，Claude 随即结合项目现状，追问并推演最优的火山引擎架构方案。完整的技术方案讨论在手机上丝滑呈现，让你实现随时随地的深度决策与架构把控。

![多轮对话 - 图1](screenshots/test-case3-fig1.png)

![多轮对话 - 图2](screenshots/test-case3-fig2.png)

![多轮对话 - 图3](screenshots/test-case3-fig3.png)

**场景 3：远程控制与指令下达一体化**
场景模式：高阶远程控制

> Claude 试图在本地执行 npm install axios 并抛出审批申请。这一次，你不仅要当审批人，还要当指挥官。
> 你在手机点击批准的同时，附带附言指令：「允许执行。同时总结一下当前上下文，我看看后续开发计划需不需要做架构调整」。远端的 Claude 收到”批准 + 动态指令”后，不仅自动完成了依赖安装，还立刻将整理好的上下文分析回传到你的手机上。完美实现「边缘审批 + 远程控制」的深度一体化。

![审批附带回复 - 图1](screenshots/test-case4-fig1.png)

![审批附带回复 - 图2](screenshots/test-case4-fig2.png)

### 目标效果

```mermaid
graph TD
    %% 节点定义
    CC[Claude Code 核心]
    MCP[MCP Server 控制器]
    SelfHeal[自愈机制 本地容错]
    Ngrok[ngrok 隧道]
    Miao[喵提醒 Notification]
    Web[手机 Web 审批页面]
    WeChat[微信推送通知]
    Action[释放阻塞 ──► Claude 继续]

    %% 连线与路由关系
    CC -->|拦截 / 阻塞| MCP
    MCP --->|内网穿透| Ngrok
    MCP -.->|异步触发| SelfHeal
    
    Ngrok -->|数据渲染| Web
    
    Miao -.->|异步触发| SelfHeal
    Miao -->|消息送达| WeChat
    WeChat -->|提示审批| Web
    
    Web -->|批准 / 拒绝 / 附言指令| Action

    %% 样式美化
    style CC fill:#f5f5f7,stroke:#1d1d1f,stroke-width:2px
    style MCP fill:#e8f0fe,stroke:#1a73e8,stroke-width:2px
    style Web fill:#e6f4ea,stroke:#137333,stroke-width:2px
    style SelfHeal fill:#fce8e6,stroke:#c5221f,stroke-width:1px,stroke-dasharray: 5 5
```

### 核心需求拆解

| 模块           | 功能                    | 难度  |
| ------------ | --------------------- | --- |
| HTTP API 服务器 | 审批/提问/状态查询接口          | ⭐⭐  |
| MCP 协议封装     | 符合 Claude Code MCP 标准 | ⭐⭐⭐ |
| ngrok 隧道集成   | 自动启动、URL 获取           | ⭐⭐  |
| 微信推送         | 喵提醒（每天100条）/ 邮件多通道    | ⭐⭐  |
| 手机 Web 前端    | 审批/对话/实时刷新            | ⭐⭐⭐ |
| 安全认证         | 密码设置/Token 鉴权         | ⭐⭐  |
| 自愈机制         | 崩溃自动重启、健康监控           | ⭐⭐  |

---

## 3. 实践感悟

### 🔑 感悟一：从「服务模型」到「服务人」的跨越

**传统模式：以 AI 为技能（服务模型）** 

大家习惯将 AI 作为一种 Skill（技能）来使用。其本质是**人去适应模型**——人输入 Prompt，模型直接输出结果。此时，AI 的核心任务是”展现模型能力”，人与最终价值之间隔着一层模型。

```mermaid
graph LR
    User[人] -->|1. 提问 / Prompt| Model[AI 模型]
    Model -->|2. 直接输出| Result[结果]
    
    %% 注释分支
    Model -.->|核心| Focus[服务于模型能力的输出]

    %% 样式
    style User fill:#f5f5f7,stroke:#333
    style Model fill:#e8f0fe,stroke:#1a73e8,stroke-width:2px
    style Focus fill:#fff,stroke:#ccc,stroke-dasharray: 5 5
```

**进化模式：以 AI 为工厂（服务个人）** 

本次实践打破了这一限制，其本质转变为**模型服务于人**——AI 不再直接给答案，而是化身为”工具工厂”，为人类量身定制出一款独立工具。随后，由该工具直接解决人的问题。**彻底跳过了「频繁与模型交互」的中间环节**，实现了价值的直接交付。

```mermaid
graph TD
    User[人] -->|1. 输入需求| Model[AI 模型 Factory]
    Model -->|2. 制造 / 生成| Tool[独立工具]
    Tool -->|3. 直接服务 / 即拿即用| User

    %% 样式
    style User fill:#f5f5f7,stroke:#333
    style Model fill:#feeed7,stroke:#b06000,stroke-width:2px
    style Tool fill:#e6f4ea,stroke:#137333,stroke-width:2px
```

**意义**：

- ✅ **工具可复用**：生成的审批服务器可以反复使用，不是一次性问答
- ✅ **工具可共享**：工具可以部署、分享、扩展，形成基础设施
- ✅ **工具可进化**：工具可以独立迭代（推送迁移、自愈机制），不依赖 AI 实时在线
- ✅ **效率倍增**：从”每次都要问 AI”变成”一次生成，永久使用”

**这是 AI 应用的进阶形态**：不是让 AI 替你做事，而是让 AI 帮你造工具，工具再替你做事。

---

### 🔑 感悟二：「场景拆解 + 迭代反馈」是分水岭

**核心结论**：高质量的”场景拆解 + 迭代反馈”是让 Agent 从”聊天机器人”进化为”生产力工具”的分水岭。

**实践感悟**：以前从零搭建一个包含 HTTP 服务器 + MCP 协议 + WebSocket 实时推送 + ngrok 隧道 + 微信推送 + 手机 Web 前端的完整系统，至少需要 2-3 天。现在通过 **”场景驱动 → 分步生成 → 迭代纠错”** 的 AI 协作模式，仅需半天即可完成。最大的收获是：**不要试图让 AI 一口气生成完整系统，而是把需求拆成”原子场景”，每个场景单独生成、验证、迭代。**

**后续运维同样适合 AI 协作**：推送通道失效时，Agent 自主排查 → 对比方案 → 完成迁移；服务器不稳定时，Agent 设计并实现自愈机制。这些「上线后」的迭代，同样遵循”描述问题 → Agent 定位 → 修复验证”的循环，效率远超人工排查。

**非量化价值**：原本需要反复查阅 ngrok API、MCP 协议规范、SSE 实时推送等文档，现在 Claude 直接生成可运行代码，开发者只需关注业务逻辑的正确性。最大的改变是——**从”查文档写代码”变成了”审代码改细节”**。

---

## 4. 执行全过程

### 第一轮：需求分析 + 架构设计

**输入 Prompt：**

```
我需要做一个 Claude Code 的手机审批服务器。核心功能：
1. Claude Code 通过 MCP 协议发送审批请求
2. 手机端可以通过 Web 页面批准/拒绝
3. 支持微信推送通知（Server酱）
4. 支持 ngrok 隧道公网访问
5. 首次访问设置密码

请设计架构并列出所有需要创建的文件。
```

**Agent 输出：** 给出了清晰的模块划分：

- `server.js` — HTTP 服务器核心
- `mcp-server.js` — MCP 协议适配层
- `.mcp.json` — Claude Code 配置
- 手机端 HTML 页面内嵌在 server.js 中

**存在问题：** 初始设计没有考虑 SSE 实时推送，手机端需要手动刷新。

---

### 第二轮：核心服务器生成

**输入 Prompt：**

```
请先实现 server.js，包含：
1. HTTP API（/api/request, /api/pending, /api/approve, /api/reject）
2. 持久化存储（JSON 文件）
3. ngrok 自动启动和 URL 获取
4. Server酱 微信推送
5. 首次访问设置密码
6. 端口冲突时自动清理旧进程

要求：零外部依赖，只用 Node.js 内置模块。
```

**Agent 输出：** 一次性生成了 ~500 行 server.js 核心代码，包含所有 API 路由。

**存在问题：**

- ngrok 路径探测只覆盖了 winget 安装路径
- 没有处理 GBK 编码（中文 Windows 环境）

---

### 第三轮：编码修正 + 增强

**优化手段：**

```
补充以下问题修复：
1. ngrok 路径增加 scoop、手动安装等候选路径
2. readBody 增加 GBK 编码检测（用 TextDecoder 的 fatal 模式）
3. 增加 PushPlus 和 SMTP 邮件推送通道
4. 推送消息中附带公网审批链接，手机点击直接审批
```

**交互效果：** Agent 准确理解每个修复点，逐一生成补丁代码，并保持了原有代码风格一致性。

---

### 第四轮：MCP 协议层

**输入 Prompt：**

```
现在需要把 server.js 封装成 MCP Server，让 Claude Code 能直接调用。
要求：
1. 实现 MCP 协议（JSON-RPC over stdin/stdout）
2. 暴露 5 个工具：request_approval, ask_question, check_status, close_conversation, get_server_info
3. 日志输出到 stderr，不干扰 stdout 的 JSON-RPC
4. 支持阻塞等待（request_approval 等待用户批准后才返回）
```

**Agent 输出：** 生成了 mcp-server.js，关键设计：

- `waitForStatus()` 每秒轮询 + 超时控制
- `process.env.MCP_MODE = '1'` 控制日志输出目标
- 复用 server.js 的 `createRequest/decideRequest` 等核心函数

**存在问题：** 初始版本没有实现 `ask_question` 的多轮对话功能。

---

### 第五轮：多轮对话 + 提问功能

**优化手段：**

```
给 ask_question 增加多轮对话支持：
1. 用户回复后不关闭请求，保持 pending 状态
2. 支持追问（使用 conversation_id 关联同一对话）
3. 手机端显示完整对话历史
4. 只有 Claude 主动 close_conversation 才结束对话
```

**关键代码修改：** `replyRequest()` 函数不再将请求移到 completed，保持 pending 等待追问。

---

### 第六轮：手机 Web 前端

**输入 Prompt：**

```
生成一个手机端优化的 Web 审批界面，要求：
1. 深色主题，手机友好的触控 UI
2. 待审批列表：区分 danger/warning/normal 三种风险级别
3. 问题类型：显示对话气泡（Claude 在左，用户在右）
4. SSE 实时推送，新请求自动出现
5. 输入框打字时不要重新渲染（防止丢失焦点）
6. 从推送链接点击直接跳转到审批页面
7. 支持 URL 中 ?do=approve 直接批准
```

**Agent 输出：** 生成了完整的手机 Web 前端（内嵌在 server.js 的 `getHTML()` 函数中），约 500 行。

**亮点：** Agent 主动实现了"输入时不重渲染"的逻辑（检测 `activeElement` 是否为 textarea），这是一个容易忽略的体验细节。

---

### 第七轮：CLAUDE.md 行为规范

**输入 Prompt：**

```
创建 CLAUDE.md，告诉 Claude Code 如何正确使用这些 MCP 工具。核心原则：
1. 所有需要用户确认的内容都必须发到手机（不能只在终端弹确认）
2. Web Search、文件操作、命令执行等都需要 request_approval
3. 选项/建议通过 ask_question 的 context 参数发送
4. 正确流程 vs 错误流程的对比示例
```

**Agent 输出：** 生成了详细的 CLAUDE.md，包含表格化的使用场景对比、正确/错误流程示例。

---

### 第八轮：推送通道迁移（Server酱 → 喵提醒）

**背景问题：**

系统上线一周后，手机突然收不到微信推送了。排查发现推送链路已彻底失效：

| 推送方案     | 结局   | 根因                  |
| -------- | ---- | ------------------- |
| Server酱  | ❌ 废弃 | 免费仅 5 条/天，超额即停      |
| WxPusher | ❌ 废弃 | 微信封杀公众号推送能力（平台层面限制） |
| PushPlus | ❌ 废弃 | 需付费实名认证，不划算         |

**输入 Prompt：**

```
微信推送全部失效了。需求：
1. 找一个免费的、微信能收到的推送方案
2. API 要简单，最好一个 GET 请求就搞定
3. 不需要用户实名认证
4. 替换掉 server.js 中所有旧的推送逻辑

帮我排查 + 切换到新方案。
```

**Agent 执行过程：**

1. 先用 `get_server_info` 检查当前推送通道状态
2. 直接调用 WxPusher API 测试 → 返回成功但微信收不到
3. 用户确认已订阅公众号 → 发现 WxPusher 公众号页面提示「微信已无法推送」
4. 尝试 PushPlus → 返回 `code:905 账户未进行实名认证`
5. **Agent 自主搜索替代方案** → 找到「喵提醒」（miaotixing.com）
6. 测试喵提醒 API → `mptext:1` 表示微信已送达 ✅

**关键代码改动：**

```javascript
// 旧：WxPusher / PushPlus 复杂逻辑
// 新：喵提醒一行搞定
const miaoURL = `http://miaotixing.com/trigger?id=${MIAOTIXING_ID}&text=${encodeURIComponent(text)}`;
httpRequest(miaoURL)  // GET 请求即可
```

**修改文件**：`server.js`、`mcp-server.js`、`.mcp.json`、`config.env`、`README.md`

**实测效果**：喵提醒每天100条额度、微信服务号接收、API 极简。推送稳定性远超之前方案。

---

### 第九轮：服务器自愈机制

**背景问题：**

MCP 服务器运行一段时间后，进程会意外崩溃或端口被占，导致 Claude Code 无法调用审批工具。用户不想运行额外的 watchdog 脚本。

**输入 Prompt：**

```
服务器老是崩，但我不想额外跑 watchdog。要求：
1. server.js 崩溃自动重启（端口冲突、未捕获异常）
2. 定期健康自检（/api/health）
3. 连续崩溃太多次就暂停（防止死循环）
4. mcp-server.js 也要异常捕获，不能静默死掉

全部内置，不要外部守护进程。
```

**Agent 输出：**

```javascript
// server.js: 自愈核心
function doListen() {
  server.listen(PORT, () => {
    startHealthMonitor();  // 每 60 秒自检
  });
}

server.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    setTimeout(doListen, retryDelay);  // 端口冲突自动重试
  }
});

// 全局异常捕获 — 不崩溃
process.on('uncaughtException', (err) => { ... });
process.on('unhandledRejection', (err) => { ... });

// 连续崩溃 > 5 次自动暂停
if (crashCount > 5) process.exit(1);
```

**修改文件**：`server.js`、`mcp-server.js`

**实测效果**：服务器从"需要人工重启"变为"自愈模式"。即使遇到端口冲突、未捕获异常，也能自动恢复。

---

### 第十轮：审批卡片增强（上下文 + 回复功能）

**需求背景：**

用户在手机上审批时，存在两个问题：
1. 只看到命令和描述，缺乏背景信息，难以判断操作合理性
2. 审批后无法同时给 Claude 下达新指令，需要来回切换

**输入 Prompt：**

```
审批卡片需要增强：
1. 新增 context 上下文参数，审批卡片显示背景信息（蓝色区域）
2. 新增回复输入框，审批时可附带指令给 Claude
3. request_approval 返回结果包含 reply 和 conversation_id
4. 微信推送也包含 context 信息
```

**关键改动：**

| 文件 | 改动 |
|------|------|
| mcp-server.js | 工具定义新增 `context` 参数；返回 `reply` 和 `conversation_id` |
| server.js | 保存 context、前端渲染 context 区域；新增回复输入框、`decideWithReply` 函数 |

**使用示例：**
```json
{
  "command": "npm install axios",
  "description": "安装 axios HTTP 客户端",
  "context": "项目需要调用外部 REST API。axios 提供更简洁的 Promise API。",
  "risk": "normal"
}
```

**完整流程：**
1. Claude 请求审批（带 context）→ 手机收到，看到背景说明
2. 用户输入回复："检查配置是否需要调整" + 点击批准
3. Claude 收到 `{status: "approved", reply: "检查配置..."}`
4. Claude 执行安装 + 检查配置 + 把结果发回手机

---

### 第十一轮：修复回复输入框清空 bug

**背景问题：**

用户在审批卡片回复框输入内容后，等待几秒内容被自动清空。

**原因分析：**

前端每 5 秒轮询 `/api/pending` 并调用 `renderPending()` 重新渲染整个列表，`innerHTML` 赋值会清空 textarea 内容。虽然有焦点检测（正在输入时跳过），但用户停下来思考时焦点离开输入框，内容就被清空。

**输入 Prompt：**

```
回复输入框等待一段时间后会清空，bug 原因：
每 5 秒轮询重新渲染列表，textarea 内容丢失。

修复方案：
1. 渲染前保存所有 textarea 的当前值
2. 渲染后恢复保存的值
```

**关键代码：**

```javascript
// 自动刷新时保存/恢复输入内容
const savedValues = {};
document.querySelectorAll('.reply-input').forEach(ta => {
  if (ta.value) savedValues[ta.id] = ta.value;
});
renderPending(d.pending || []);
Object.keys(savedValues).forEach(id => {
  const ta = document.getElementById(id);
  if (ta) ta.value = savedValues[id];
});
```

---

### 第十二轮：OpenCode 适配 + 文档完善

**需求背景：**

OpenCode 也是支持 MCP 协议的 AI 编程工具，用户希望审批系统也能适配 OpenCode。

**输入 Prompt：**

```
生成 OpenCode 适配设计文档和使用指导书：
1. DESIGN_OPENCODE_ADAPT.md - 可行性分析 + 配置说明
2. GUIDE.md - Claude Code + OpenCode 完整适配步骤
3. 指导书包含：前置准备、配置步骤、行为指南、验证测试
```

**核心结论：**

| 组件 | 是否需要修改 | 说明 |
|------|-------------|------|
| server.js | ❌ 不需要 | HTTP 服务器通用 |
| mcp-server.js | ❌ 不需要 | 已实现标准 MCP 协议 |
| 配置文件 | ✅ 需要新增 | OpenCode 用 `opencode.json` |

**产出文档：**

| 文件 | 内容 |
|------|------|
| DESIGN_OPENCODE_ADAPT.md | OpenCode 适配可行性 + 配置示例 |
| GUIDE.md | Claude Code + OpenCode 完整使用指导书 |

---

## 5. 核心秘籍与避坑建议

### 核心秘籍

#### 招式一："原子场景分治法"

**操作逻辑：** 不要说"帮我做一个审批系统"，而是把需求拆成原子场景，每次只让 Agent 聚焦一个模块：

**初始搭建（第一轮 ~ 第七轮）：**

1. HTTP API 基础
2. ngrok 隧道
3. 微信推送
4. MCP 协议层
5. 多轮对话
6. 手机前端
7. 认证安全

**运维迭代（第八轮 ~ 第九轮）：**
8. 推送通道迁移（Server酱 → 喵提醒）
9. 自愈机制（崩溃自动重启 + 健康监控）

**功能增强（第十轮 ~ 第十二轮）：**
10. 审批卡片增强（上下文 + 回复功能）
11. 修复回复输入框清空 bug
12. OpenCode 适配 + 文档完善

**实测效果：** 每轮生成 300-500 行代码，Agent 准确率高，不会出现"顾此失彼"的问题。相比一次性生成全部代码，bug 率降低约 70%。

#### 招式二："场景驱动 Prompt 模板"

**操作逻辑：** 每个 Prompt 遵循统一模板：

```
背景：[一句话说明当前状态]
需求：
1. [具体功能点1]
2. [具体功能点2]
3. [具体功能点3]
约束：
- [技术约束，如"零外部依赖"]
- [环境约束，如"中文 Windows"]
输出要求：
- [可直接运行的完整代码]
```

**实测效果：** Agent 对结构化 Prompt 的理解准确率显著高于自由文本。复杂功能一次生成正确率从约 40% 提升到约 85%。

#### 招式三："迭代式纠错"

**操作逻辑：** 不追求一次完美，而是快速生成 → 实测 → 报告问题 → 修复。每轮只修复 2-3 个问题：

```
第 1 轮：生成基础代码
第 2 轮：修复 ngrok 路径探测不全
第 3 轮：增加 GBK 编码支持
第 4 轮：增加 SSE 实时推送
第 5 轮：增加多轮对话
...
第 8 轮：推送通道失效 → 迁移到喵提醒
第 9 轮：服务器崩溃 → 内置自愈机制
第 10 轮：审批卡片增强（上下文 + 回复功能）
第 11 轮：修复输入框清空 bug
第 12 轮：OpenCode 适配 + 文档完善
```

**实测效果：** 5-7 轮迭代后，系统达到生产可用水平。每轮耗时 5-15 分钟，总计 1-2 小时完成全部功能。

---

## 6. 效果量化

### 开发效率对比

| 衡量维度               | 传统模式 (Human Only)               | AI 协作 (Human + AI)        | 提升倍数      |
| ------------------ | ------------------------------- | ------------------------- | --------- |
| **架构设计**           | 60 min（查资料 + 画架构图）              | 10 min（Agent 直接输出方案）      | **6x**    |
| **HTTP 服务器 + API** | 180 min（查 Node.js 文档 + 手写路由）    | 20 min（生成 + 微调）           | **9x**    |
| **MCP 协议封装**       | 120 min（读 MCP 规范 + 实现 JSON-RPC） | 15 min（Agent 理解协议 + 生成代码） | **8x**    |
| **ngrok 集成**       | 60 min（查 API + 调试进程管理）          | 10 min（Agent 知道 API 用法）   | **6x**    |
| **微信推送**           | 45 min（查 Server酱文档 + 对接）        | 5 min（Agent 直接生成）         | **9x**    |
| **手机 Web 前端**      | 240 min（手写 HTML/CSS/JS + 调样式）   | 30 min（生成 + 微调体验细节）       | **8x**    |
| **安全认证**           | 60 min（Token 机制 + 登录页）          | 10 min（生成）                | **6x**    |
| **调试 + 集成测试**      | 120 min                         | 20 min（AI 辅助定位问题）         | **6x**    |
| **CLAUDE.md 编写**   | 60 min（想清楚行为规范）                 | 10 min（Agent 生成 + 人工审核）   | **6x**    |
| **总计**             | **~885 min（约 15 小时 / 2 个工作日）**  | **~130 min（约 2 小时）**      | **~6.8x** |

> 📝 **注**：以上数据仅统计初始 7 轮开发。后续迭代（推送通道迁移、自愈机制、测试用例等）同样通过 AI 协作完成，传统模式下预计需额外 10-15 小时，AI 协作仅需 1-2 小时。

### 代码质量对比

| 衡量维度      | 传统模式         | AI 协作                 |
| --------- | ------------ | --------------------- |
| 外部依赖数     | 5-10 个 npm 包 | **0 个（零依赖）**          |
| 首次运行成功率   | ~60%         | ~85%（需 5-7 轮迭代）       |
| Bug 数（首周） | ~15 个        | ~3 个                  |
| 代码风格一致性   | 取决于开发者状态     | **高度一致**（同一 Agent 生成） |

### 实际使用效果

| 场景            | 使用前            | 使用后             |
| ------------- | -------------- | --------------- |
| Claude 执行危险操作 | 必须守在电脑前点确认     | 📱 手机审批，随时随地    |
| 吃饭时 AI 提问     | 流程卡死，等回来才能继续   | 📱 手机回复，远程引导    |
| 黄区监控蓝区进度      | 人不在蓝区，AI 成断线风筝 | 📱 微信推送 + 手机审批  |
| 推送通道失效        | 需人工排查 + 手动切换   | 🔄 自愈机制 + 喵提醒兜底 |
| 服务器崩溃         | 需手动重启 Claude   | 🔧 自动重启，无需干预    |

---

## 附录：核心技术实现

### MCP 工具定义

```javascript
const TOOLS = [
  {
    name: 'request_approval',
    description: 'Request user approval before executing a command.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to be executed' },
        description: { type: 'string', description: 'Description of what the command does' },
        risk: { type: 'string', enum: ['normal', 'warning', 'danger'] },
        timeout: { type: 'number', default: 300 }
      },
      required: ['command']
    }
  },
  {
    name: 'ask_question',
    description: 'Ask the user a question and wait for their text reply.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        context: { type: 'string' },
        timeout: { type: 'number', default: 600 },
        conversation_id: { type: 'string' }
      },
      required: ['question']
    }
  }
  // ... check_status, close_conversation, get_server_info
];
```

### 审批流程时序图

```
Claude Code          MCP Server          HTTP API           手机 Web          微信
    |                    |                  |                  |               |
    |-- tools/call ----->|                  |                  |               |
    |  request_approval  |                  |                  |               |
    |                    |-- POST /request->|                  |               |
    |                    |                  |-- pushNotify --->|               |
    |                    |                  |                  |<--- 推送 ------|
    |                    |                  |                  |               |
    |   (轮询等待...)     |                  |<-- POST /approve-|               |
    |                    |                  |                  |               |
    |<-- result ---------|                  |                  |               |
    |  {status:approved} |                  |                  |               |
    |                    |                  |                  |               |
```

---

## 7. 避坑指南（复现参考）

> 💡 以下内容仅在复现开发过程时需要参考，优先级较低，可跳过。

### 避雷点 A：MCP 协议的 stdout/stderr 混淆

**问题：** MCP 要求 JSON-RPC 通过 stdout 传输，但日志也默认输出到 stdout，导致协议解析失败。

**解决方案：** 通过 `process.env.MCP_MODE = '1'` 环境变量，让日志输出到 stderr：

```javascript
const isMCPMode = process.env.MCP_MODE === '1';
const logTarget = isMCPMode ? process.stderr : process.stdout;
```

### 避雷点 B：ngrok 路径探测的跨平台问题

**问题：** 不同安装方式（winget、scoop、手动下载）的 ngrok 路径完全不同。

**解决方案：** 枚举所有候选路径 + `where ngrok` 兜底：

```javascript
const candidates = [
  path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'ngrok.exe'),
  path.join(process.env.USERPROFILE, 'scoop', 'shims', 'ngrok.exe'),
  // ...更多候选
];
for (const p of candidates) {
  if (fs.existsSync(p)) { ngrokPath = p; break; }
}
```

### 避雷点 C：中文 Windows 的 GBK 编码

**问题：** 中文 Windows 系统的 HTTP 请求可能使用 GBK 编码，导致中文乱码。

**解决方案：** 用 `TextDecoder` 的 `fatal` 模式检测编码，失败时 fallback 到 GBK：

```javascript
try {
  new TextDecoder('utf-8', { fatal: true }).decode(buf);
} catch {
  body = new TextDecoder('gbk').decode(buf);
}
```

### 避雷点 D：手机输入框焦点丢失

**问题：** SSE 推送触发重新渲染时，如果用户正在输入框打字，输入框会失去焦点，输入内容丢失。

**解决方案：** 渲染前检查 `activeElement`：

```javascript
const activeEl = document.activeElement;
if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
  return;  // 跳过渲染，不打断用户输入
}
```

### 避雷点 E：端口冲突

**问题：** Claude Code 可能多次启动 MCP Server，导致端口 8765 被旧进程占用。

**解决方案：** 启动前自动清理：

```javascript
// Windows: netstat + taskkill
// Linux/Mac: lsof + kill -9
async function killPortOccupant(port) { ... }
```

### 避雷点 F：推送通道的「假成功」陷阱

**问题：** 多个微信推送平台 API 返回成功（`code:0` 或 `code:1000`），但微信实际收不到消息。这不是代码 bug，而是平台层面的限制——微信逐步封杀了第三方公众号的模板消息推送能力。

**解决方案：**

1. **不要只看 API 返回值**，必须真机验证推送是否到达
2. **选择平台风险低的方案**：喵提醒基于微信服务号（非公众号），目前稳定
3. **备选方案要预留**：代码中保留邮件推送通道，作为微信推送失效时的兜底
4. **定期测试**：推送通道可能静默失效，建议启动时自动测试一次

**核心教训：** 推送这类「依赖外部平台」的功能，比纯代码逻辑脆弱得多。选方案时，**免费 > 付费** 不一定对，但**架构简单 > 复杂** 永远对。喵提醒一行 GET 请求 vs WxPusher 多步 OAuth + 模板消息，后者出问题时排查成本远高于前者。

---

## 总结

| 关键收获            | 一句话                                |
| --------------- | ---------------------------------- |
| **🔑 工具 > 技能**  | 用 AI 生成工具服务人，跳过「服务模型」中间环节，一次生成永久使用 |
| **拆解是王道**       | 7 个原子场景 > 1 个巨型需求                  |
| **迭代 > 完美**     | 5-7 轮快速迭代，比一次追求完美效率高 3 倍           |
| **零依赖更稳定**      | 零外部依赖意味着零版本冲突、零供应链风险               |
| **场景驱动 Prompt** | 结构化模板让 Agent 理解准确率从 40% → 85%      |
| **AI 的产出上限**    | 取决于你把需求拆得多细，不取决于模型有多强              |
| **推送通道要「反脆弱」**  | API 返回成功 ≠ 用户收到消息；选架构简单的方案         |
| **自愈 > 人工值守**   | 内置崩溃恢复，比外部 watchdog 更可靠、更省心        |
