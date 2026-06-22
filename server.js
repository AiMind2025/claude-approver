/**
 * Claude Code 手机审批服务器 (增强版)
 *
 * 功能:
 *   - 自动启动 ngrok 隧道，手机外网访问
 *   - 多通道推送: Server酱 / PushPlus / 邮件
 *   - 推送内容含公网审批链接，手机直接点
 *   - 首次访问设置密码，生成二维码
 *   - 公网访问全程鉴权
 *
 * 环境变量:
 *   PORT              本地端口           默认 8765
 *   AUTH_TOKEN        访问密码           留空=首次访问时设置
 *   TUNNEL            隧道工具           ngrok | cloudflare | none
 *   NGROK_AUTHTOKEN   ngrok 认证 token
 *   SERVERCHAN_KEY    Server酱 SendKey
 *   PUSHPLUS_TOKEN    PushPlus Token
 *   SMTP_HOST         邮件 SMTP 服务器
 *   SMTP_PORT         SMTP 端口         默认 465
 *   SMTP_USER         发件人
 *   SMTP_PASS         密码/授权码
 *   SMTP_TO           收件人
 */

const http  = require('http');
const https = require('https');
const crypto = require('crypto');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');
const { execSync, spawn } = require('child_process');

// ─── 日志输出控制 ──────────────────────────────────────────────────────────────
// MCP 模式下日志输出到 stderr，独立运行时输出到 stdout
const isMCPMode = process.env.MCP_MODE === '1';
const logTarget = isMCPMode ? process.stderr : process.stdout;
function log(...args) {
  logTarget.write(args.join(' ') + '\n');
}

// ─── 配置 ────────────────────────────────────────────────────────────────────
const PORT     = parseInt(process.env.PORT || '8765', 10);
const DATA_DIR = path.join(__dirname, '.data');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const DATA_FILE = path.join(DATA_DIR, 'requests.json');
const TUNNEL   = (process.env.TUNNEL || 'ngrok').toLowerCase();

// 推送配置
const PUSH = {
  serverchan:  process.env.SERVERCHAN_KEY  || '',
  pushplus:    process.env.PUSHPLUS_TOKEN  || '',
  smtpHost:    process.env.SMTP_HOST       || '',
  smtpPort:    parseInt(process.env.SMTP_PORT || '465', 10),
  smtpUser:    process.env.SMTP_USER       || '',
  smtpPass:    process.env.SMTP_PASS       || '',
  smtpTo:      process.env.SMTP_TO         || '',
};

// ─── 持久化 ──────────────────────────────────────────────────────────────────
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) { console.error(`[加载${file}失败]`, e.message); }
  return fallback;
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

let store     = loadJSON(DATA_FILE, { pending: [], completed: [] });
let authToken = process.env.AUTH_TOKEN || '';
let tunnelURL = '';   // ngrok 公网地址

// 从文件恢复 auth token
if (!authToken && fs.existsSync(AUTH_FILE)) {
  const authData = loadJSON(AUTH_FILE, {});
  if (authData.token) authToken = authData.token;
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
function uid()   { return crypto.randomBytes(4).toString('hex'); }
function now()   { return new Date().toISOString(); }
function esc(s)  { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function json(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      let body = buf.toString('utf8');

      // 检测是否为有效 UTF-8，如果不是尝试 GBK 解码
      // 通过检查是否包含常见的 UTF-8 无效序列来判断
      try {
        // 尝试用 TextDecoder 验证 UTF-8
        const decoder = new TextDecoder('utf-8', { fatal: true });
        decoder.decode(buf);
      } catch {
        // UTF-8 解码失败，尝试 GBK
        try {
          const gbkDecoder = new TextDecoder('gbk');
          body = gbkDecoder.decode(buf);
          log('[编码] 检测到 GBK 编码，已转换为 UTF-8');
        } catch {
          // GBK 也失败，用原始 UTF-8（可能有乱码）
          body = buf.toString('utf8');
        }
      }

      try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); }
    });
  });
}

function httpRequest(reqUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(reqUrl);
    const mod = u.protocol === 'https:' ? https : http;
    const reqOpts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 10000,
    };
    const req = mod.request(reqOpts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

// 鉴权检查
function checkAuth(req) {
  if (!authToken) return true;  // 未设密码时不鉴权
  const auth = req.headers.authorization || '';
  if (auth === `Bearer ${authToken}`) return true;
  const parsed = url.parse(req.url, true);
  return parsed.query.token === authToken;
}

function isLocalhost(req) {
  const ip = req.socket.remoteAddress || '';
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'].includes(ip);
}

// ─── 推送通知 ─────────────────────────────────────────────────────────────────
function getApproveURL(reqId) {
  const base = tunnelURL || `http://localhost:${PORT}`;
  const tokenParam = authToken ? `&token=${authToken}` : '';
  return `${base}/?action=review&id=${reqId}${tokenParam}`;
}

function getDashboardURL() {
  const base = tunnelURL || `http://localhost:${PORT}`;
  const tokenParam = authToken ? `?token=${authToken}` : '';
  return `${base}/${tokenParam}`;
}

async function pushNotify(title, desp, reqId) {
  const approveURL = reqId ? getApproveURL(reqId) : '';
  const linkText = approveURL ? `\n\n👉 [点击审批](${approveURL})` : '';
  const fullDesp = desp + linkText;

  const tasks = [];

  // 1. Server酱
  if (PUSH.serverchan) {
    tasks.push(
      httpRequest(`https://sctapi.ftqq.com/${PUSH.serverchan}.send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `title=${encodeURIComponent(title)}&desp=${encodeURIComponent(fullDesp)}`,
      }).then(r => log('[Server酱]', r.status)).catch(e => console.error('[Server酱]', e.message))
    );
  }

  // 2. PushPlus
  if (PUSH.pushplus) {
    tasks.push(
      httpRequest('https://www.pushplus.plus/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: PUSH.pushplus, title, content: fullDesp, template: 'markdown' }),
      }).then(r => log('[PushPlus]', r.status)).catch(e => console.error('[PushPlus]', e.message))
    );
  }

  // 3. Email
  if (PUSH.smtpHost && PUSH.smtpUser && PUSH.smtpTo) {
    tasks.push(sendEmail(title, fullDesp).catch(e => console.error('[Email]', e.message)));
  }

  if (tasks.length === 0) {
    log('[推送] ⚠️ 未配置任何推送通道，仅本地可用');
  }

  await Promise.allSettled(tasks);
}

// 简易 SMTP 邮件发送（纯 Node，无依赖）
function sendEmail(subject, body) {
  return new Promise((resolve, reject) => {
    const net = require('net');
    const tls = require('tls');

    const from = PUSH.smtpUser;
    const to   = PUSH.smtpTo;
    const msg  = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '', body,
    ].join('\r\n');

    let client;
    if (PUSH.smtpPort === 465) {
      client = tls.connect(PUSH.smtpPort, PUSH.smtpHost, { rejectUnauthorized: false });
    } else {
      client = net.createConnection(PUSH.smtpPort, PUSH.smtpHost);
    }

    let step = 0;
    let buffer = '';

    function send(cmd) { client.write(cmd + '\r\n'); }

    client.on('data', (data) => {
      buffer += data.toString();
      if (!buffer.endsWith('\r\n') && !buffer.includes('\r\n')) return;
      const code = parseInt(buffer.slice(0, 3));
      buffer = '';

      switch (step) {
        case 0: // EHLO
          step = 1;
          send('EHLO localhost');
          break;
        case 1:
          if (PUSH.smtpPort !== 465) { step = 2; send('STARTTLS'); }
          else { step = 3; send('AUTH LOGIN'); }
          break;
        case 2: // after STARTTLS
          client = tls.connect({ socket: client, rejectUnauthorized: false });
          step = 3;
          // re-attach handler on new TLS socket handled via the upgrade
          send('EHLO localhost');
          step = 3;
          send('AUTH LOGIN');
          break;
        case 3:
          step = 4;
          send(Buffer.from(PUSH.smtpUser).toString('base64'));
          break;
        case 4:
          step = 5;
          send(Buffer.from(PUSH.smtpPass).toString('base64'));
          break;
        case 5:
          step = 6;
          send(`MAIL FROM:<${from}>`);
          break;
        case 6:
          step = 7;
          send(`RCPT TO:<${to}>`);
          break;
        case 7:
          step = 8;
          send('DATA');
          break;
        case 8:
          step = 9;
          send(msg + '\r\n.');
          break;
        case 9:
          send('QUIT');
          client.end();
          log('[Email] ✅ 发送成功');
          resolve();
          break;
      }
    });

    client.on('connect', () => {});
    client.on('secureConnect', () => {});
    client.on('error', (e) => reject(e));
    client.setEncoding('utf8');
  });
}

// ─── 审批/对话逻辑 ─────────────────────────────────────────────────────────────
function createRequest({ command, description, risk, type, conversationId }) {
  const reqType = type || 'approval';
  const req = {
    id: uid(),
    type: reqType,
    command: command || '(无)',
    description: description || '',
    risk: risk || 'normal',
    status: 'pending',
    // 对话相关字段
    conversationId: conversationId || null,  // 关联同一对话
    messages: reqType === 'question' ? [{ sender: 'claude', content: command, time: now() }] : null,
    reply: null,  // 兼容：最后一条用户回复
    created_at: now(),
    decided_at: null,
  };
  store.pending.unshift(req);
  saveJSON(DATA_FILE, store);

  let title, desp;
  if (reqType === 'question') {
    title = conversationId ? '💬 Claude 追问' : '💬 Claude 提问';
    desp = `**问题:**\n${command}\n\n**说明:** ${description || '无'}`;
  } else {
    const riskEmoji = { normal: '🟢', warning: '🟡', danger: '🔴' }[risk] || '🟢';
    title = `${riskEmoji} Claude 请求审批`;
    desp = `**命令:**\n\`\`\`\n${command}\n\`\`\`\n\n**描述:** ${description || '无'}\n\n**风险:** ${risk}`;
  }

  pushNotify(title, desp, req.id);
  log(`[新请求] ${req.id} (${reqType}): ${(command || '').slice(0, 60)}`);
  return req;
}

function decideRequest(id, decision) {
  const idx = store.pending.findIndex(r => r.id === id);
  if (idx === -1) return null;
  const req = store.pending[idx];
  req.status = decision;
  req.decided_at = now();
  store.completed.unshift(req);
  store.pending.splice(idx, 1);
  if (store.completed.length > 200) store.completed.length = 200;
  saveJSON(DATA_FILE, store);
  log(`[审批] ${req.id} → ${decision}`);
  return req;
}

// 用户回复问题（支持多轮）
function replyRequest(id, message) {
  const idx = store.pending.findIndex(r => r.id === id);
  if (idx === -1) return null;
  const req = store.pending[idx];

  // 添加用户消息到对话历史
  if (req.messages) {
    req.messages.push({ sender: 'user', content: message, time: now() });
  }
  req.reply = message;  // 记录最新回复

  // 对于问题类型，不移动到 completed，保持 pending 等待追问
  // 但更新状态让 Claude 知道有新回复
  req.status = 'replied';
  saveJSON(DATA_FILE, store);
  log(`[回复] ${req.id}: ${(message || '').slice(0, 50)}`);
  return req;
}

// Claude 结束对话
function closeConversation(id) {
  const idx = store.pending.findIndex(r => r.id === id);
  if (idx === -1) {
    // 可能在 completed 里
    const cidx = store.completed.findIndex(r => r.id === id);
    if (cidx !== -1) {
      store.completed[cidx].status = 'closed';
      saveJSON(DATA_FILE, store);
      return store.completed[cidx];
    }
    return null;
  }
  const req = store.pending[idx];
  req.status = 'closed';
  req.decided_at = now();
  store.completed.unshift(req);
  store.pending.splice(idx, 1);
  if (store.completed.length > 200) store.completed.length = 200;
  saveJSON(DATA_FILE, store);
  log(`[对话结束] ${req.id}`);
  return req;
}

// ─── API 路由 ─────────────────────────────────────────────────────────────────
const apiRoutes = {
  'POST /api/request': async (req, res) => {
    if (!checkAuth(req)) return json(res, 401, { error: '未授权' });
    const body = await readBody(req);
    if (!body.command) return json(res, 400, { error: '缺少 command' });
    json(res, 200, { ok: true, request: createRequest(body) });
  },

  'GET /api/pending': (req, res) => {
    if (!checkAuth(req)) return json(res, 401, { error: '未授权' });
    json(res, 200, { pending: store.pending });
  },

  'GET /api/completed': (req, res) => {
    if (!checkAuth(req)) return json(res, 401, { error: '未授权' });
    json(res, 200, { completed: store.completed.slice(0, 50) });
  },

  'POST /api/approve': async (req, res) => {
    const body = await readBody(req);
    const r = decideRequest(body.id, 'approved');
    if (!r) return json(res, 404, { error: '不存在' });
    json(res, 200, { ok: true, request: r });
  },

  'POST /api/reject': async (req, res) => {
    const body = await readBody(req);
    const r = decideRequest(body.id, 'rejected');
    if (!r) return json(res, 404, { error: '不存在' });
    json(res, 200, { ok: true, request: r });
  },

  'POST /api/reply': async (req, res) => {
    if (!checkAuth(req)) return json(res, 401, { error: '未授权' });
    const body = await readBody(req);
    if (!body.message && body.message !== '') return json(res, 400, { error: '缺少 message' });
    const r = replyRequest(body.id, body.message);
    if (!r) return json(res, 404, { error: '不存在' });
    json(res, 200, { ok: true, request: r });
  },

  'POST /api/close': async (req, res) => {
    if (!checkAuth(req)) return json(res, 401, { error: '未授权' });
    const body = await readBody(req);
    const r = closeConversation(body.id);
    if (!r) return json(res, 404, { error: '不存在' });
    json(res, 200, { ok: true, request: r });
  },

  'GET /api/check': (req, res) => {
    const { query } = url.parse(req.url, true);
    const p = store.pending.find(r => r.id === query.id);
    if (p) return json(res, 200, { status: p.status, request: p });
    const c = store.completed.find(r => r.id === query.id);
    if (c) return json(res, 200, { status: c.status, request: c });
    json(res, 404, { error: '不存在' });
  },

  'GET /api/health': (req, res) => {
    json(res, 200, { ok: true, pending: store.pending.length, tunnel: tunnelURL || null, time: now() });
  },

  // 设置密码（首次访问）
  'POST /api/setup': async (req, res) => {
    if (authToken) return json(res, 400, { error: '密码已设置' });
    const body = await readBody(req);
    const pwd = (body.password || '').trim();
    if (pwd.length < 4) return json(res, 400, { error: '密码至少4位' });
    authToken = pwd;
    saveJSON(AUTH_FILE, { token: authToken, created: now() });
    log('[安全] ✅ 密码已设置');
    json(res, 200, { ok: true, token: authToken, url: getDashboardURL() });
  },

  // 验证密码
  'POST /api/login': async (req, res) => {
    const body = await readBody(req);
    if (body.password === authToken) {
      json(res, 200, { ok: true, token: authToken });
    } else {
      json(res, 401, { error: '密码错误' });
    }
  },

  // 获取隧道信息
  'GET /api/tunnel': (req, res) => {
    json(res, 200, { url: tunnelURL || null, type: TUNNEL });
  },

  // SSE 实时推送
  'GET /api/events': (req, res) => {
    if (!checkAuth(req)) { res.writeHead(401); return res.end('Unauthorized'); }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    send({ type: 'init', pending: store.pending });
    const hb = setInterval(() => send({ type: 'heartbeat' }), 30000);
    let lastLen = store.pending.length;
    const poll = setInterval(() => {
      if (store.pending.length !== lastLen) {
        lastLen = store.pending.length;
        send({ type: 'update', pending: store.pending });
      }
    }, 1000);
    req.on('close', () => { clearInterval(hb); clearInterval(poll); });
  },
};

// ─── ngrok 隧道 ───────────────────────────────────────────────────────────────
let ngrokProc = null;

async function startNgrok() {
  // 探测 ngrok 可执行文件路径
  let ngrokPath = '';
  const candidates = [
    // winget 安装路径
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'ngrok.exe'),
    // scoop 安装路径
    path.join(process.env.USERPROFILE || '', 'scoop', 'shims', 'ngrok.exe'),
    // 手动安装路径
    path.join(process.env.LOCALAPPDATA || '', 'ngrok', 'ngrok.exe'),
    'C:\\Program Files\\ngrok\\ngrok.exe',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) { ngrokPath = p; break; }
  }
  // 兜底：从 PATH 查找
  if (!ngrokPath) {
    try {
      ngrokPath = execSync('where ngrok', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] })
        .trim().split(/\r?\n/)[0].trim();
    } catch {}
  }

  if (!ngrokPath || !fs.existsSync(ngrokPath)) {
    log('[ngrok] Not found. Install:');
    log('   1. Run: install-ngrok.bat');
    log('   2. Or download: https://ngrok.com/download');
    log('   3. Or set TUNNEL=none to skip');
    log('');
    return;
  }

  log(`[ngrok] Found: ${ngrokPath}`);

  // 设置 authtoken
  if (process.env.NGROK_AUTHTOKEN) {
    try {
      execSync(`"${ngrokPath}" config add-authtoken ${process.env.NGROK_AUTHTOKEN}`,
        { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
      log('[ngrok] authtoken configured');
    } catch (e) {
      log('[ngrok] authtoken failed:', e.message);
    }
  }

  // 启动 ngrok
  try {
    ngrokProc = spawn(ngrokPath, ['http', String(PORT), '--log=stdout', '--log-format=json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });
  } catch (e) {
    console.error('[ngrok] 启动失败:', e.message);
    return;
  }

  ngrokProc.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const log = JSON.parse(line);
        if (log.msg && log.msg.includes('starting web service')) {
          log('[ngrok] 隧道已建立');
        }
        if (log.addr) {
          log(`[ngrok] ${log.addr}`);
        }
      } catch {}
    }
  });

  ngrokProc.stderr.on('data', (chunk) => {
    console.error('[ngrok]', chunk.toString().trim());
  });

  ngrokProc.on('exit', (code) => {
    log(`[ngrok] 进程退出 (code=${code})`);
    tunnelURL = '';
  });

  // 等待 ngrok 启动，然后获取隧道 URL
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const res = await httpRequest('http://127.0.0.1:4040/api/tunnels');
      const data = JSON.parse(res.body);
      const tunnel = (data.tunnels || []).find(t => t.proto === 'https');
      if (tunnel && tunnel.public_url) {
        tunnelURL = tunnel.public_url;
        log(`[ngrok] ✅ 公网地址: ${tunnelURL}`);
        return;
      }
    } catch {}
  }
  log('[ngrok] ⚠️ 20秒内未获取到公网地址，请检查 ngrok 状态');
}

function stopNgrok() {
  if (ngrokProc) {
    try { ngrokProc.kill(); } catch {}
    ngrokProc = null;
  }
}

// ─── 生成简易二维码 (文本版，用于终端显示) ──────────────────────────────────
function generateQR(text) {
  try {
    return execSync(`node -e "log(require('url').parse('${text}').href)"`, { encoding: 'utf8' }).trim();
  } catch { return text; }
}

// ─── HTML 审批页面 ────────────────────────────────────────────────────────────
function serveHTML(res, req) {
  const parsed = url.parse(req.url, true);
  const tokenFromURL = parsed.query.token || '';
  const actionFromURL = parsed.query.action || '';
  const idFromURL = parsed.query.id || '';
  const doFromURL = parsed.query.do || '';

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(getHTML(tokenFromURL, actionFromURL, idFromURL, doFromURL));
}

function getHTML(initToken, initAction, initId, initDo) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#0f0f1a">
<title>Claude 审批中心</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans SC",sans-serif;
  background:#0f0f1a;color:#e0e0e0;min-height:100vh;padding:0 0 80px}
.header{background:linear-gradient(135deg,#1a1a2e,#16213e);padding:16px;
  position:sticky;top:0;z-index:100;border-bottom:1px solid #2a2a4a}
.header h1{font-size:17px;font-weight:600;color:#fff;display:flex;align-items:center}
.badge{background:#e74c3c;color:#fff;font-size:11px;font-weight:700;border-radius:10px;
  padding:2px 7px;margin-left:8px;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.subtitle{font-size:12px;color:#888;margin-top:4px;display:flex;align-items:center}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px}
.dot-ok{background:#27ae60}.dot-err{background:#e74c3c}.dot-wait{background:#f39c12;animation:pulse 1s infinite}
.tabs{display:flex;background:#1a1a2e;border-bottom:1px solid #2a2a4a}
.tab{flex:1;padding:12px;text-align:center;font-size:13px;color:#888;cursor:pointer;
  border-bottom:2px solid transparent;transition:.2s;-webkit-tap-highlight-color:transparent}
.tab.active{color:#6c5ce7;border-bottom-color:#6c5ce7}
.tab:active{background:#2a2a4a}
.list{padding:12px}
.card{background:#1a1a2e;border-radius:12px;padding:16px;margin-bottom:12px;border:1px solid #2a2a4a;
  transition:all .3s}
.card.risk-danger{border-left:3px solid #e74c3c}
.card.risk-warning{border-left:3px solid #f39c12}
.card.risk-normal{border-left:3px solid #27ae60}
.card.decided{opacity:.4;transform:scale(.98)}
.risk-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
.risk-danger .risk-label{color:#e74c3c}
.risk-warning .risk-label{color:#f39c12}
.risk-normal .risk-label{color:#27ae60}
.desc{font-size:14px;color:#ccc;margin-bottom:10px;line-height:1.4}
.desc-options{background:#1a1a1a;border-radius:8px;padding:12px 14px;margin-bottom:14px;white-space:pre-line;font-size:14px;line-height:1.6;color:#a8e6cf}
.cmd{background:#0d0d1a;border-radius:8px;padding:10px 12px;
  font-family:"Fira Code",Menlo,Consolas,monospace;font-size:12px;color:#a0e0a0;
  white-space:pre-wrap;word-break:break-all;margin-bottom:12px;max-height:120px;
  overflow-y:auto;border:1px solid #2a2a3a}
.time{font-size:11px;color:#555;margin-bottom:12px}
.btns{display:flex;gap:10px}
.btn{flex:1;padding:12px;border:none;border-radius:8px;font-size:15px;font-weight:600;
  cursor:pointer;transition:.15s;-webkit-tap-highlight-color:transparent}
.btn:active{transform:scale(.97)}
.btn-approve{background:#27ae60;color:#fff}
.btn-reject{background:#e74c3c;color:#fff}
.btn:disabled{opacity:.5;pointer-events:none}
.empty{text-align:center;padding:60px 20px;color:#555}
.empty .icon{font-size:48px;margin-bottom:16px}
.empty .msg{font-size:14px}
.history-tag{display:inline-block;font-size:11px;font-weight:700;padding:3px 8px;border-radius:4px;margin-bottom:8px}
.tag-approved{background:rgba(39,174,96,.2);color:#27ae60}
.tag-rejected{background:rgba(231,76,60,.2);color:#e74c3c}
.toast{position:fixed;bottom:30px;left:50%;transform:translateX(-50%) translateY(100px);
  background:#333;color:#fff;padding:12px 24px;border-radius:24px;font-size:14px;
  transition:transform .3s;z-index:200;white-space:nowrap}
.toast.show{transform:translateX(-50%) translateY(0)}

/* 登录/设置页 */
.auth-overlay{position:fixed;inset:0;background:#0f0f1a;z-index:300;display:flex;
  align-items:center;justify-content:center;padding:20px}
.auth-box{background:#1a1a2e;border-radius:16px;padding:32px 24px;width:100%;max-width:360px;
  text-align:center;border:1px solid #2a2a4a}
.auth-box h2{font-size:20px;color:#fff;margin-bottom:8px}
.auth-box p{font-size:13px;color:#888;margin-bottom:24px}
.auth-input{width:100%;padding:12px 16px;border:1px solid #2a2a4a;border-radius:8px;
  background:#0d0d1a;color:#fff;font-size:16px;outline:none;margin-bottom:16px;
  text-align:center;letter-spacing:2px}
.auth-input:focus{border-color:#6c5ce7}
.auth-btn{width:100%;padding:14px;border:none;border-radius:8px;background:#6c5ce7;
  color:#fff;font-size:16px;font-weight:600;cursor:pointer}
.auth-btn:active{background:#5a4bd6}
.auth-error{color:#e74c3c;font-size:13px;margin-top:8px;display:none}

/* URL 信息栏 */
.info-bar{background:#16213e;padding:8px 16px;font-size:11px;color:#888;
  display:flex;justify-content:space-between;align-items:center}
.info-bar a{color:#6c5ce7;text-decoration:none}

/* 对话/提问样式 */
.card-question,.card-question-history{border-left:3px solid #6c5ce7}
.question-header{font-size:12px;font-weight:700;color:#6c5ce7;margin-bottom:12px}
.messages{margin-bottom:12px;max-height:300px;overflow-y:auto}
.msg{padding:10px 12px;border-radius:10px;margin-bottom:8px;max-width:85%}
.msg-claude{background:#1e3a5f;margin-right:auto;border-bottom-left-radius:2px}
.msg-user{background:#2d4a2d;margin-left:auto;border-bottom-right-radius:2px}
.msg-label{font-size:10px;color:#888;margin-bottom:4px}
.msg-content{font-size:14px;color:#e0e0e0;line-height:1.4;word-break:break-word}
.reply-box{margin-top:12px}
.reply-input{width:100%;padding:12px;border:1px solid #2a2a4a;border-radius:8px;
  background:#0d0d1a;color:#fff;font-size:14px;resize:vertical;outline:none;
  font-family:inherit;min-height:60px;margin-bottom:10px}
.reply-input:focus{border-color:#6c5ce7}
.btn-reply{width:100%;padding:12px;border:none;border-radius:8px;background:#6c5ce7;
  color:#fff;font-size:15px;font-weight:600;cursor:pointer}
.btn-reply:active{background:#5a4bd6}
.tag-replied{background:rgba(108,92,231,.2);color:#6c5ce7}
.tag-closed{background:rgba(108,92,231,.1);color:#888}
</style>
</head>
<body>

<!-- 登录 / 首次设置 -->
<div id="auth-overlay" class="auth-overlay" style="display:none">
  <div class="auth-box">
    <h2 id="auth-title">🔐</h2>
    <p id="auth-desc"></p>
    <input id="auth-input" class="auth-input" type="password" placeholder="输入密码" autocomplete="off">
    <button id="auth-btn" class="auth-btn" onclick="submitAuth()">确认</button>
    <div id="auth-error" class="auth-error"></div>
  </div>
</div>

<!-- 主界面 -->
<div id="main-app" style="display:none">
  <div class="header">
    <h1>🤖 Claude 审批中心 <span id="badge" class="badge" style="display:none">0</span></h1>
    <div class="subtitle">
      <span id="dot" class="dot dot-wait"></span>
      <span id="conn-text">连接中...</span>
    </div>
  </div>
  <div id="info-bar" class="info-bar" style="display:none">
    <span id="tunnel-info"></span>
    <a href="javascript:location.reload()">刷新</a>
  </div>
  <div class="tabs">
    <div class="tab active" data-tab="pending" onclick="switchTab('pending')">⏳ 待审批</div>
    <div class="tab" data-tab="history" onclick="switchTab('history')">📋 历史</div>
  </div>
  <div id="pending-list" class="list"></div>
  <div id="history-list" class="list" style="display:none"></div>
</div>

<div id="toast" class="toast"></div>

<script>
const TOKEN_KEY = 'claude_approver_token';
let TOKEN = sessionStorage.getItem(TOKEN_KEY) || '${initToken}' || '';
let API = location.origin;
let sse = null;
let currentTab = 'pending';

function authHeaders() {
  return TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {};
}
function tokenParam() {
  return TOKEN ? 'token=' + TOKEN : '';
}

// ─── 鉴权流程 ─────────────────────────────────
async function checkAuth() {
  // 先尝试直接访问
  try {
    const res = await fetch(API + '/api/health', { headers: authHeaders() });
    if (res.ok) return true;
    if (res.status === 401) {
      showAuthUI(TOKEN ? 'login' : 'setup');
      return false;
    }
  } catch {}
  showAuthUI('setup');
  return false;
}

function showAuthUI(mode) {
  const overlay = document.getElementById('auth-overlay');
  const title   = document.getElementById('auth-title');
  const desc    = document.getElementById('auth-desc');
  const btn     = document.getElementById('auth-btn');
  overlay.style.display = 'flex';
  if (mode === 'setup') {
    title.textContent = '🔑 首次设置';
    desc.textContent = '请设置访问密码（至少4位），手机也需要此密码';
    btn.textContent = '设置密码';
    btn.dataset.mode = 'setup';
  } else {
    title.textContent = '🔐 验证密码';
    desc.textContent = '输入密码以访问审批中心';
    btn.textContent = '登录';
    btn.dataset.mode = 'login';
  }
}

async function submitAuth() {
  const input = document.getElementById('auth-input');
  const errEl = document.getElementById('auth-error');
  const btn   = document.getElementById('auth-btn');
  const pwd   = input.value.trim();
  errEl.style.display = 'none';

  if (pwd.length < 4) {
    errEl.textContent = '密码至少4位';
    errEl.style.display = 'block';
    return;
  }

  const mode = btn.dataset.mode;
  const endpoint = mode === 'setup' ? '/api/setup' : '/api/login';

  try {
    const res = await fetch(API + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
    });
    const data = await res.json();
    if (data.ok) {
      TOKEN = data.token;
      sessionStorage.setItem(TOKEN_KEY, TOKEN);
      // 更新 URL 带 token
      const u = new URL(location.href);
      u.searchParams.set('token', TOKEN);
      history.replaceState(null, '', u.toString());
      document.getElementById('auth-overlay').style.display = 'none';
      document.getElementById('main-app').style.display = '';
      initApp();
    } else {
      errEl.textContent = data.error || '失败';
      errEl.style.display = 'block';
    }
  } catch (e) {
    errEl.textContent = '网络错误';
    errEl.style.display = 'block';
  }
}

// ─── 主逻辑 ─────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('pending-list').style.display = tab === 'pending' ? '' : 'none';
  document.getElementById('history-list').style.display = tab === 'history' ? '' : 'none';
  if (tab === 'history') loadHistory();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function timeAgo(iso) {
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return Math.floor(s/60) + ' 分钟前';
  if (s < 86400) return Math.floor(s/3600) + ' 小时前';
  return d.toLocaleDateString('zh-CN');
}

function esc(s) {
  const el = document.createElement('span');
  el.textContent = s || '';
  return el.innerHTML;
}

function riskLabel(r) {
  return { danger:'🔴 高风险', warning:'🟡 注意', normal:'🟢 普通' }[r] || '🟢 普通';
}

function renderPending(list) {
  const el = document.getElementById('pending-list');
  const badge = document.getElementById('badge');
  if (!list.length) {
    el.innerHTML = '<div class="empty"><div class="icon">✅</div><div class="msg">暂无待处理</div></div>';
    badge.style.display = 'none';
    return;
  }
  badge.textContent = list.length;
  badge.style.display = '';

  el.innerHTML = list.map(r => {
    // 问题类型：显示对话界面
    if (r.type === 'question') {
      const messages = (r.messages || []).map(m => {
        const cls = m.sender === 'claude' ? 'msg-claude' : 'msg-user';
        const label = m.sender === 'claude' ? '🤖 Claude' : '📱 你';
        return \`<div class="msg \${cls}"><div class="msg-label">\${label}</div><div class="msg-content">\${esc(m.content)}</div></div>\`;
      }).join('');

      // 显示描述/选项（如果有）
      const descHtml = r.description ? \`<div class="desc desc-options">\${esc(r.description).replace(/\\n/g, '<br>')}</div>\` : '';

      return \`
        <div class="card card-question" id="card-\${r.id}">
          <div class="question-header">💬 Claude 提问</div>
          \${descHtml}
          <div class="messages">\${messages}</div>
          <div class="reply-box">
            <textarea id="reply-\${r.id}" class="reply-input" placeholder="输入你的回复..." rows="3"></textarea>
            <button class="btn btn-reply" onclick="sendReply('\${r.id}')">发送</button>
          </div>
          <div class="time">\${timeAgo(r.created_at)}</div>
        </div>
      \`;
    }

    // 审批类型：显示原有界面
    return \`
      <div class="card risk-\${r.risk}" id="card-\${r.id}">
        <div class="risk-label">\${riskLabel(r.risk)}</div>
        <div class="desc">\${esc(r.description) || '（无描述）'}</div>
        <div class="cmd">\${esc(r.command)}</div>
        <div class="time">\${timeAgo(r.created_at)}</div>
        <div class="btns">
          <button class="btn btn-reject"  onclick="decide('\${r.id}','reject')">✗ 拒绝</button>
          <button class="btn btn-approve" onclick="decide('\${r.id}','approve')">✓ 批准</button>
        </div>
      </div>
    \`;
  }).join('');
}

function renderHistory(list) {
  const el = document.getElementById('history-list');
  if (!list.length) {
    el.innerHTML = '<div class="empty"><div class="icon">📋</div><div class="msg">暂无历史记录</div></div>';
    return;
  }
  el.innerHTML = list.map(r => {
    // 状态标签
    let statusTag = '';
    if (r.type === 'question') {
      statusTag = r.status === 'closed' ? '<div class="history-tag tag-closed">💬 已结束</div>' : '<div class="history-tag tag-replied">💬 已回复</div>';
    } else {
      statusTag = r.status === 'approved' ? '<div class="history-tag tag-approved">✓ 已批准</div>' : '<div class="history-tag tag-rejected">✗ 已拒绝</div>';
    }

    // 问题类型：显示对话历史
    if (r.type === 'question' && r.messages && r.messages.length > 0) {
      const messages = r.messages.map(m => {
        const cls = m.sender === 'claude' ? 'msg-claude' : 'msg-user';
        const label = m.sender === 'claude' ? '🤖 Claude' : '📱 你';
        return \`<div class="msg \${cls}"><div class="msg-label">\${label}</div><div class="msg-content">\${esc(m.content)}</div></div>\`;
      }).join('');
      return \`
        <div class="card card-question-history">
          \${statusTag}
          <div class="messages">\${messages}</div>
          <div class="time">\${timeAgo(r.decided_at || r.created_at)}</div>
        </div>
      \`;
    }

    // 审批类型
    return \`
      <div class="card">
        \${statusTag}
        <div class="desc">\${esc(r.description) || '（无描述）'}</div>
        <div class="cmd">\${esc(r.command)}</div>
        <div class="time">\${timeAgo(r.decided_at || r.created_at)}</div>
      </div>
    \`;
  }).join('');
}

async function decide(id, action) {
  const card = document.getElementById('card-' + id);
  if (card) { card.classList.add('decided'); }
  try {
    const res = await fetch(API + '/api/' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.ok) {
      showToast(action === 'approve' ? '✅ 已批准' : '❌ 已拒绝');
      setTimeout(() => { if (card) card.remove(); }, 500);
    } else {
      showToast('⚠️ ' + (data.error || '失败'));
      if (card) card.classList.remove('decided');
    }
  } catch {
    showToast('⚠️ 网络错误');
    if (card) card.classList.remove('decided');
  }
}

async function sendReply(id) {
  const textarea = document.getElementById('reply-' + id);
  if (!textarea) return;
  const message = textarea.value.trim();
  if (!message) {
    showToast('请输入回复内容');
    return;
  }

  const card = document.getElementById('card-' + id);
  try {
    const res = await fetch(API + '/api/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ id, message }),
    });
    const data = await res.json();
    if (data.ok) {
      showToast('✅ 已发送');
      textarea.value = '';
      // 刷新列表显示新消息
      if (card) {
        const msgDiv = card.querySelector('.messages');
        if (msgDiv) {
          msgDiv.innerHTML += \`<div class="msg msg-user"><div class="msg-label">📱 你</div><div class="msg-content">\${esc(message)}</div></div>\`;
        }
      }
    } else {
      showToast('⚠️ ' + (data.error || '发送失败'));
    }
  } catch {
    showToast('⚠️ 网络错误');
  }
}

async function loadHistory() {
  try {
    const res = await fetch(API + '/api/completed', { headers: authHeaders() });
    const data = await res.json();
    renderHistory(data.completed || []);
  } catch {}
}

function connectSSE() {
  const dot = document.getElementById('dot');
  const txt = document.getElementById('conn-text');
  const sseUrl = API + '/api/events' + (TOKEN ? '?token=' + TOKEN : '');
  if (sse) sse.close();
  sse = new EventSource(sseUrl);
  sse.onopen = () => { dot.className = 'dot dot-ok'; txt.textContent = '已连接'; };
  sse.onerror = () => { dot.className = 'dot dot-err'; txt.textContent = '断开，重连中...'; };
  sse.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'init' || msg.type === 'update') {
        // 如果用户正在输入框中打字，不要重新渲染（会丢失焦点和输入内容）
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
          return;  // 跳过渲染
        }
        renderPending(msg.pending || []);
      }
    } catch {}
  };
}

async function loadTunnelInfo() {
  try {
    const res = await fetch(API + '/api/tunnel', { headers: authHeaders() });
    const data = await res.json();
    if (data.url) {
      const bar = document.getElementById('info-bar');
      bar.style.display = '';
      document.getElementById('tunnel-info').innerHTML =
        '🌐 <a href="' + data.url + '" target="_blank">' + data.url + '</a>';
    }
  } catch {}
}

async function initApp() {
  connectSSE();
  loadTunnelInfo();
  // 自动刷新兜底
  setInterval(() => {
    // 如果用户正在输入框中打字，不要重新渲染
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
      return;
    }
    fetch(API + '/api/pending', { headers: authHeaders() })
      .then(r => r.json())
      .then(d => renderPending(d.pending || []))
      .catch(() => {});
  }, 5000);
}

// ─── 启动 ─────────────────────────────────
(async () => {
  const ok = await checkAuth();
  if (ok) {
    document.getElementById('main-app').style.display = '';
    initApp();

    // 处理 URL 中的直接审批动作 (从推送链接点击)
    const initAction = '${initAction}';
    const initId = '${initId}';
    const initDo = '${initDo}';
    if (initAction === 'review' && initId) {
      if (initDo === 'approve') {
        decide(initId, 'approve');
      } else if (initDo === 'reject') {
        decide(initId, 'reject');
      }
      // 否则只是打开页面查看该请求（高亮显示）
    }
  }
})();
</script>
</body>
</html>`;
}

// ─── HTTP 服务器 ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const key = `${req.method} ${pathname}`;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
    return res.end();
  }

  // 根路径 → 审批页面
  if (pathname === '/' || pathname === '/index.html') {
    return serveHTML(res, req);
  }

  const handler = apiRoutes[key];
  if (handler) {
    try {
      await handler(req, res);
    } catch (e) {
      console.error('[错误]', e);
      json(res, 500, { error: e.message });
    }
  } else {
    json(res, 404, { error: 'Not Found' });
  }
});

// ─── 启动 ─────────────────────────────────────────────────────────────────────
var isRestarting = false;      // 防止重复重启
var consecutiveFailures = 0;   // 连续失败计数
var healthTimer = null;        // 健康监控定时器
var lastListenTime = 0;        // 上次 listen 成功的时间

async function main() {
  log('');
  log('╔══════════════════════════════════════════════════════╗');
  log('║          🤖 Claude 审批服务器 (自愈版)            ║');
  log('╚══════════════════════════════════════════════════════╝');
  log('');

  doListen();
}

// ─── 监听 + 自愈 ──────────────────────────────────────────────────────────────
function doListen() {
  if (isRestarting) return;
  isRestarting = true;

  // 清理旧的监听状态
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
  try { server.removeAllListeners('listening'); } catch(e) {}
  try { server.removeAllListeners('error'); } catch(e) {}
  try { if (server.listening) server.close(); } catch(e) {}

  // 新的 error 处理器（只注册一次，闭包复用）
  server.once('error', (err) => {
    isRestarting = false;
    log(`\n❌ [自愈] 服务器错误: ${err.message}`);

    const now = Date.now();
    if (now - lastListenTime < 10000) {
      consecutiveFailures++;
    } else {
      consecutiveFailures = 1;
    }

    if (consecutiveFailures > 5) {
      log(`❌ [自愈] 连续失败 ${consecutiveFailures} 次，放弃重启，请人工检查`);
      return;
    }

    const delay = Math.min(consecutiveFailures * 2000, 10000);
    log(`🔄 [自愈] ${delay/1000}秒后重启... (第 ${consecutiveFailures} 次)`);
    setTimeout(doListen, delay);
  });

  // 新的 listening 处理器（只注册一次）
  server.once('listening', async () => {
    isRestarting = false;
    lastListenTime = Date.now();
    consecutiveFailures = 0;
    log(`✅ HTTP 服务: http://localhost:${PORT}`);

    // 启动隧道（仅首次启动时）
    if (TUNNEL !== 'none' && !tunnelURL) {
      await startNgrok();
    }

    // 打印汇总信息
    log('');
    log('─── 访问地址 ───────────────────────────');
    log(`  本地: http://localhost:${PORT}`);
    if (tunnelURL) {
      const tokenSuffix = authToken ? `?token=${authToken}` : '';
      log(`  公网: ${tunnelURL}${tokenSuffix}`);
    }
    log('');
    log('─── 推送通道 ───────────────────────────');
    const channels = [];
    if (PUSH.serverchan) channels.push('✅ Server酱 (微信)');
    if (PUSH.pushplus)   channels.push('✅ PushPlus (微信)');
    if (PUSH.smtpHost)   channels.push('✅ 邮件');
    if (channels.length) channels.forEach(c => log('  ' + c));
    else log('  ⚠️  未配置推送，仅本地/公网页面可用');
    log('');
    log('─── 安全 ───────────────────────────────');
    if (authToken) log(`  🔐 密码已设置 (${authToken.slice(0,2)}***)`);
    else log('  🔓 首次访问网页时将要求设置密码');
    log('');
    log('🛡️  [自愈] 已启用崩溃自动恢复');
    log('');

    startHealthMonitor();
  });

  try {
    server.listen(PORT, '0.0.0.0');
  } catch(e) {
    isRestarting = false;
    log(`❌ [自愈] listen 异常: ${e.message}`);
    setTimeout(doListen, 5000);
  }
}

// ─── 健康监控（每 60 秒自检一次） ──────────────────────────────────────────────
function startHealthMonitor() {
  if (healthTimer) return;  // 已在运行

  healthTimer = setInterval(() => {
    if (isRestarting || !server.listening) return;

    const req = http.request(
      { hostname: '127.0.0.1', port: PORT, path: '/api/health', method: 'GET', timeout: 5000 },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const ok = JSON.parse(data).ok;
            if (!ok) forceRestart('健康检查返回异常');
          } catch(e) {
            forceRestart('健康检查解析失败');
          }
        });
      }
    );
    req.on('error', () => {
      // 端口还在？可能只是暂时卡住，再确认一次
      const net = require('net');
      const sock = new net.Socket();
      sock.setTimeout(2000);
      sock.on('connect', () => { sock.destroy(); /* 端口还在，不重启 */ });
      sock.on('error', () => forceRestart('端口已不可达'));
      sock.on('timeout', () => { sock.destroy(); forceRestart('端口无响应'); });
      sock.connect(PORT, '127.0.0.1');
    });
    req.on('timeout', () => { req.destroy(); });
    req.end();
  }, 60000);
}

function forceRestart(reason) {
  if (isRestarting) return;
  log(`\n⚠️  [自愈] ${reason}，强制重启...`);
  consecutiveFailures++;
  doListen();
}

// 优雅退出
let isShuttingDown = false;
process.on('SIGINT', () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log('\n正在关闭...');
  if (healthTimer) clearInterval(healthTimer);
  stopNgrok();
  server.close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  stopNgrok();
  server.close();
  process.exit(0);
});

// 未捕获异常不崩溃，交给自愈机制
process.on('uncaughtException', (err) => {
  log(`\n💥 [自愈] 未捕获异常: ${err.message}`);
  log(err.stack);
});
process.on('unhandledRejection', (reason) => {
  log(`\n💥 [自愈] 未处理的 Promise 拒绝: ${reason}`);
});

// ─── 模块导出 (供 MCP Server 使用) ─────────────────────────────────────────────
// 只在直接运行时启动，被 require 时不自动启动
if (require.main === module) {
  main().catch(e => {
    console.error('启动失败:', e);
    process.exit(1);
  });
}

// 导出核心函数供外部使用
module.exports = {
  // 审批/对话逻辑
  createRequest,
  decideRequest,
  replyRequest,
  closeConversation,

  // 数据存储
  store,
  saveJSON,
  loadJSON,

  // 服务器
  server,
  main,
  startNgrok,
  stopNgrok,

  // 配置
  PORT,
  TUNNEL,
  PUSH,

  // 状态
  getTunnelURL: () => tunnelURL,
  getAuthToken: () => authToken,
  setAuthToken: (token) => { authToken = token; },

  // 工具函数
  uid,
  now,
};
