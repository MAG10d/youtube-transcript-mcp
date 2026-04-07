import type { IncomingMessage, ServerResponse } from 'http';
import { getTranscript } from '../src/lib/youtube';
import { extractVideoId } from '../src/utils/url-normalize';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Accept',
};

function sendJson(res: ServerResponse, status: number, data: object) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS_HEADERS });
  res.end(body);
}

class SimpleMCPServer {
  async handleRequest(request: any) {
    const { method, params, id } = request;
    try {
      switch (method) {
        case 'initialize':
          return {
            jsonrpc: '2.0', id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'youtube-transcript-remote', version: '1.0.0' }
            }
          };

        case 'tools/list':
          return {
            jsonrpc: '2.0', id,
            result: {
              tools: [{
                name: 'get_transcript',
                description: 'Extract transcript from YouTube video URL',
                inputSchema: {
                  type: 'object',
                  properties: {
                    url: { type: 'string', description: 'YouTube video URL (any format)' },
                    language: { type: 'string', description: "Optional language code (e.g. 'en'). Defaults to 'en'." }
                  },
                  required: ['url']
                }
              }]
            }
          };

        case 'tools/call': {
          const { name, arguments: args } = params;
          if (name === 'get_transcript') {
            try {
              const { url, language = 'en' } = args;
              const videoId = extractVideoId(url);
              if (!videoId) {
                return { jsonrpc: '2.0', id, error: { code: -1, message: 'Invalid YouTube URL: could not extract video ID' } };
              }
              const transcript = await getTranscript(videoId, language);
              return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: transcript }] } };
            } catch (error) {
              return { jsonrpc: '2.0', id, error: { code: -1, message: error instanceof Error ? error.message : 'Unknown error' } };
            }
          }
          return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } };
        }

        default:
          return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
      }
    } catch (error) {
      console.error('Error handling request:', error);
      return { jsonrpc: '2.0', id, error: { code: -32603, message: 'Internal error' } };
    }
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // Root info
  if (url.pathname === '/') {
    sendJson(res, 200, {
      name: 'YouTube Transcript Remote MCP Server',
      version: '1.0.0',
      endpoints: { sse: '/sse', mcp: '/mcp' },
      tools: ['get_transcript'],
      status: 'ready'
    });
    return;
  }

  const mcpServer = new SimpleMCPServer();

  // SSE endpoint
  if (url.pathname === '/sse') {
    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        const requestData = JSON.parse(body);
        const response = await mcpServer.handleRequest(requestData);
        const sseData = `data: ${JSON.stringify(response)}\n\n`;
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', ...CORS_HEADERS });
        res.end(sseData);
      } catch (error) {
        console.error('SSE POST error:', error);
        const errData = `data: ${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } })}\n\n`;
        res.writeHead(500, { 'Content-Type': 'text/event-stream', ...CORS_HEADERS });
        res.end(errData);
      }
      return;
    }

    // GET — SSE stream
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', ...CORS_HEADERS });
    const initMsg = `data: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n\n`;
    res.write(initMsg);

    const keepAlive = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': keepalive\n\n');
      } else {
        clearInterval(keepAlive);
      }
    }, 30000);

    req.on('close', () => clearInterval(keepAlive));
    return;
  }

  // /mcp endpoint — Streamable HTTP (POST)
  if (url.pathname === '/mcp' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const requestData = JSON.parse(body);
      const response = await mcpServer.handleRequest(requestData);
      sendJson(res, 200, response);
    } catch (error) {
      console.error('MCP request error:', error);
      sendJson(res, 500, { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } });
    }
    return;
  }

  res.writeHead(404, CORS_HEADERS);
  res.end('Not Found');
}
