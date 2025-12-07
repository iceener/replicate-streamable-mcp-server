/**
 * Cloudflare Workers entry point for Replicate MCP.
 * Simplified - no OAuth, just Replicate token from headers or env.
 */

import { Router } from 'itty-router';
import { parseConfig } from './shared/config/env.js';
import { corsPreflightResponse, withCors } from './shared/http/cors.js';
import { handleMcpRequest } from './adapters/http-workers/mcp.handler.js';

export interface WorkerEnv {
  REPLICATE_API_TOKEN?: string;
  MCP_TITLE?: string;
  MCP_VERSION?: string;
  NODE_ENV?: string;
  LOG_LEVEL?: string;
  [key: string]: unknown;
}

/**
 * Shim process.env for shared modules.
 */
function shimProcessEnv(env: WorkerEnv): void {
  const g = globalThis as unknown as {
    process?: { env?: Record<string, unknown> };
  };
  g.process = g.process || {};
  g.process.env = { ...(g.process.env ?? {}), ...(env as Record<string, unknown>) };
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    shimProcessEnv(env);
    const config = parseConfig(env as Record<string, unknown>);
    const router = Router();

    // CORS preflight
    router.options('*', () => corsPreflightResponse());

    // Health check
    router.get('/health', () =>
      withCors(
        new Response(JSON.stringify({ 
          status: 'ok', 
          timestamp: new Date().toISOString(),
          title: config.MCP_TITLE,
        }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    // MCP endpoint
    router.post('/mcp', (req: Request) => handleMcpRequest(req, { config }));

    // 404
    router.all('*', () => withCors(new Response('Not Found', { status: 404 })));

    return router.fetch(request);
  },
};
