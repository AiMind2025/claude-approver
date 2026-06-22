#!/usr/bin/env node
/**
 * Claude Approver MCP Server
 *
 * 将审批功能封装为 Claude Code MCP 插件
 * Claude Code 启动时自动加载，无需手动启动服务器
 */

// 设置 MCP 模式（让 server.js 的日志输出到 stderr）
process.env.MCP_MODE = '1';

const path = require('path');
const fs = require('fs');

// 导入核心服务器模块
const core = require('./server.js');

// ─── MCP 协议常量 ─────────────────────────────────────────────────────────────
const MCP_VERSION = '2024-11-05';
const SERVER_NAME = 'claude-approver';
const SERVER_VERSION = '1.0.0';

// ─── 工具定义 ─────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'request_approval',
    description: 'Request user approval before executing a command. The user will receive a notification on their phone and can approve or reject.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to be executed'
        },
        description: {
          type: 'string',
          description: 'Description of what the command does'
        },
        risk: {
          type: 'string',
          enum: ['normal', 'warning', 'danger'],
          description: 'Risk level of the command'
        },
        timeout: {
          type: 'number',
          description: 'Timeout in seconds (default: 300)',
          default: 300
        }
      },
      required: ['command']
    }
  },
  {
    name: 'ask_question',
    description: 'Ask the user a question and wait for their text reply. Supports multi-turn conversation.',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question to ask'
        },
        context: {
          type: 'string',
          description: 'Additional context for the question'
        },
        timeout: {
          type: 'number',
          description: 'Timeout in seconds (default: 600)',
          default: 600
        },
        conversation_id: {
          type: 'string',
          description: 'Existing conversation ID for follow-up questions'
        }
      },
      required: ['question']
    }
  },
  {
    name: 'check_status',
    description: 'Check the status of a request without blocking.',
    inputSchema: {
      type: 'object',
      properties: {
        request_id: {
          type: 'string',
          description: 'The request ID to check'
        }
      },
      required: ['request_id']
    }
  },
  {
    name: 'close_conversation',
    description: 'Close/end a conversation.',
    inputSchema: {
      type: 'object',
      properties: {
        conversation_id: {
          type: 'string',
          description: 'The conversation ID to close'
        }
      },
      required: ['conversation_id']
    }
  },
  {
    name: 'get_server_info',
    description: 'Get information about the approval server (tunnel URL, pending count, etc).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

// ─── MCP 消息处理 ─────────────────────────────────────────────────────────────
function sendResponse(id, result) {
  const response = {
    jsonrpc: '2.0',
    id,
    result
  };
  process.stdout.write(JSON.stringify(response) + '\n');
}

function sendError(id, code, message) {
  const response = {
    jsonrpc: '2.0',
    id,
    error: { code, message }
  };
  process.stdout.write(JSON.stringify(response) + '\n');
}

function sendNotification(method, params) {
  const notification = {
    jsonrpc: '2.0',
    method,
    params
  };
  process.stdout.write(JSON.stringify(notification) + '\n');
}

// ─── 工具实现 ─────────────────────────────────────────────────────────────────
async function waitForStatus(requestId, timeout, targetStatuses) {
  const startTime = Date.now();
  const timeoutMs = timeout * 1000;

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutMs) {
      return { status: 'timeout', request: null };
    }

    // 在 pending 和 completed 中查找
    const pending = core.store.pending.find(r => r.id === requestId);
    if (pending && targetStatuses.includes(pending.status)) {
      return { status: pending.status, request: pending };
    }

    const completed = core.store.completed.find(r => r.id === requestId);
    if (completed && targetStatuses.includes(completed.status)) {
      return { status: completed.status, request: completed };
    }

    // 等待 1 秒再检查
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function handleRequestApproval(params) {
  const { command, description, risk = 'normal', timeout = 300 } = params;

  // 创建审批请求
  const req = core.createRequest({
    type: 'approval',
    command,
    description,
    risk
  });

  // 发送进度通知
  sendNotification('notifications/progress', {
    message: `Waiting for approval: ${command.slice(0, 50)}...`,
    requestId: req.id
  });

  // 等待结果
  const result = await waitForStatus(req.id, timeout, ['approved', 'rejected']);

  if (result.status === 'timeout') {
    return {
      content: [{
        type: 'text',
        text: `Timeout after ${timeout}s. Request ID: ${req.id}`
      }]
    };
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        status: result.status,
        request_id: req.id,
        message: result.status === 'approved' ? 'Approved by user' : 'Rejected by user'
      })
    }]
  };
}

async function handleAskQuestion(params) {
  const { question, context, timeout = 600, conversation_id } = params;

  // 创建提问请求
  const req = core.createRequest({
    type: 'question',
    command: question,
    description: context,
    conversationId: conversation_id
  });

  // 发送进度通知
  sendNotification('notifications/progress', {
    message: `Waiting for reply: ${question.slice(0, 50)}...`,
    requestId: req.id
  });

  // 等待回复
  const result = await waitForStatus(req.id, timeout, ['replied', 'closed']);

  if (result.status === 'timeout') {
    return {
      content: [{
        type: 'text',
        text: `Timeout after ${timeout}s. Request ID: ${req.id}`
      }]
    };
  }

  const request = result.request;
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        reply: request.reply,
        request_id: req.id,
        conversation_id: req.id,  // 可用于追问
        messages: request.messages
      })
    }]
  };
}

async function handleCheckStatus(params) {
  const { request_id } = params;

  const pending = core.store.pending.find(r => r.id === request_id);
  if (pending) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: pending.status,
          request: pending
        })
      }]
    };
  }

  const completed = core.store.completed.find(r => r.id === request_id);
  if (completed) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: completed.status,
          request: completed
        })
      }]
    };
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ error: 'Request not found' })
    }],
    isError: true
  };
}

async function handleCloseConversation(params) {
  const { conversation_id } = params;

  const result = core.closeConversation(conversation_id);
  if (result) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ ok: true, status: 'closed' })
      }]
    };
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ error: 'Conversation not found' })
    }],
    isError: true
  };
}

async function handleGetServerInfo() {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        port: core.PORT,
        tunnel_url: core.getTunnelURL(),
        tunnel_type: core.TUNNEL,
        pending_count: core.store.pending.length,
        has_auth: !!core.getAuthToken(),
        push_channels: {
          serverchan: !!core.PUSH.serverchan,
          pushplus: !!core.PUSH.pushplus,
          email: !!core.PUSH.smtpHost
        }
      })
    }]
  };
}

// ─── 消息路由 ─────────────────────────────────────────────────────────────────
async function handleRequest(msg) {
  const { id, method, params } = msg;

  try {
    switch (method) {
      case 'initialize':
        return sendResponse(id, {
          protocolVersion: MCP_VERSION,
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION
          }
        });

      case 'notifications/initialized':
        // 初始化完成通知，无需响应
        return;

      case 'tools/list':
        return sendResponse(id, { tools: TOOLS });

      case 'tools/call': {
        const { name, arguments: args } = params;
        let result;

        switch (name) {
          case 'request_approval':
            result = await handleRequestApproval(args);
            break;
          case 'ask_question':
            result = await handleAskQuestion(args);
            break;
          case 'check_status':
            result = await handleCheckStatus(args);
            break;
          case 'close_conversation':
            result = await handleCloseConversation(args);
            break;
          case 'get_server_info':
            result = await handleGetServerInfo();
            break;
          default:
            return sendError(id, -32601, `Unknown tool: ${name}`);
        }

        return sendResponse(id, result);
      }

      default:
        return sendError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    return sendError(id, -32603, error.message);
  }
}

// ─── 端口清理 ────────────────────────────────────────────────────────────────
// 检查端口是否被占用，如果占用则杀掉旧进程
async function killPortOccupant(port) {
  return new Promise((resolve) => {
    // Windows: 用 netstat + taskkill
    const { execSync } = require('child_process');
    try {
      // 查找占用端口的进程
      const cmd = process.platform === 'win32'
        ? `netstat -ano | findstr :${port} | findstr LISTENING`
        : `lsof -ti :${port}`;

      const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

      if (!output) {
        resolve(false);
        return;
      }

      // 提取 PID
      let pid;
      if (process.platform === 'win32') {
        // Windows: 最后一列是 PID
        const parts = output.split(/\s+/);
        pid = parts[parts.length - 1];
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'pipe' });
      } else {
        pid = output;
        execSync(`kill -9 ${pid}`, { stdio: 'pipe' });
      }

      log(`Killed old process (PID ${pid}) on port ${port}`);
      // 等待端口释放
      setTimeout(() => resolve(true), 500);
    } catch (e) {
      // 没有找到占用端口的进程，或者杀掉失败
      resolve(false);
    }
  });
}

// ─── 主入口 ───────────────────────────────────────────────────────────────────
async function main() {
  // 先清理可能被占用的端口
  await killPortOccupant(core.PORT);

  // 启动 HTTP 服务器
  try {
    await core.main();
    log('MCP Server started with HTTP server');
  } catch (error) {
    log(`Failed to start HTTP server: ${error.message}`);
    process.exit(1);
  }

  // 防止 Node 进程因未捕获异常而崩溃（交给 server.js 的自愈机制处理）
  process.on('uncaughtException', (err) => {
    log(`[MCP] 未捕获异常（已忽略，自愈机制会处理）: ${err.message}`);
  });
  process.on('unhandledRejection', (reason) => {
    log(`[MCP] 未处理的 Promise 拒绝（已忽略）: ${reason}`);
  });

  // 处理 stdin 的 JSON-RPC 请求
  let buffer = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;

    // 按行分割处理
    const lines = buffer.split('\n');
    buffer = lines.pop();  // 保留未完成的行

    for (const line of lines) {
      if (line.trim()) {
        try {
          const msg = JSON.parse(line);
          handleRequest(msg);
        } catch (e) {
          log(`Parse error: ${e.message}`);
        }
      }
    }
  });

  process.stdin.on('end', () => {
    log('stdin closed, exiting');
    process.exit(0);
  });

  // MCP 日志输出到 stderr（不干扰 stdout 的 JSON-RPC）
  function log(msg) {
    process.stderr.write(`[MCP] ${msg}\n`);
  }
}

main().catch(e => {
  process.stderr.write(`[MCP] Fatal error: ${e.message}\n`);
  process.exit(1);
});
