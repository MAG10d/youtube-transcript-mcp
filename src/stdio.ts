#!/usr/bin/env node
import * as readline from 'readline';
import { getTranscript } from './tools/transcript';

const rl = readline.createInterface({
  input: process.stdin,
  output: undefined,
  terminal: false,
});

function send(obj: object) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

rl.on('line', async (line) => {
  if (!line.trim()) return;

  let request: any;
  try {
    request = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }

  const { method, params, id } = request;

  try {
    switch (method) {
      case 'initialize':
        send({
          jsonrpc: '2.0', id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'youtube-transcript', version: '1.0.0' }
          }
        });
        break;

      case 'notifications/initialized':
        // No response needed for notifications
        break;

      case 'tools/list':
        send({
          jsonrpc: '2.0', id,
          result: {
            tools: [{
              name: 'get_transcript',
              description: 'Extract transcript from YouTube video URL',
              inputSchema: {
                type: 'object',
                properties: {
                  url: { type: 'string', description: 'YouTube video URL (any format)' },
                  language: { type: 'string', description: "Optional language code (e.g. 'en', 'zh-Hant'). Defaults to 'auto'." }
                },
                required: ['url']
              }
            }]
          }
        });
        break;

      case 'tools/call': {
        const { name, arguments: args } = params;
        if (name === 'get_transcript') {
          try {
            const { url, language = 'auto' } = args;
            const transcript = await getTranscript(url, language);
            send({
              jsonrpc: '2.0', id,
              result: { content: [{ type: 'text', text: transcript }] }
            });
          } catch (error: any) {
            send({
              jsonrpc: '2.0', id,
              error: { code: -1, message: error?.message || 'Failed to fetch transcript' }
            });
          }
        } else {
          send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } });
        }
        break;
      }

      default:
        send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (error: any) {
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: 'Internal error' } });
  }
});
