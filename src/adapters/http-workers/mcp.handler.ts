/**
 * MCP endpoint handler for Cloudflare Workers.
 * Validates internal API key and uses server-side Replicate token.
 */

import type { UnifiedConfig } from '../../shared/config/env.js';
import { withCors } from '../../shared/http/cors.js';
import { jsonResponse } from '../../shared/http/response.js';
import {
  dispatchMcpMethod,
  handleMcpNotification,
  type CancellationRegistry,
  type McpDispatchContext,
  type McpSessionState,
} from '../../shared/mcp/dispatcher.js';
import { sharedLogger as logger } from '../../shared/utils/logger.js';

// Session state (in-memory, ephemeral in Workers)
const sessionStateMap = new Map<string, McpSessionState>();
const cancellationRegistryMap = new Map<string, CancellationRegistry>();

function getCancellationRegistry(sessionId: string): CancellationRegistry {
  let registry = cancellationRegistryMap.get(sessionId);
  if (!registry) {
    registry = new Map();
    cancellationRegistryMap.set(sessionId, registry);
  }
  return registry;
}

/**
 * Validate internal API key from request.
 */
function validateApiKey(request: Request, config: UnifiedConfig): boolean {
  // If no API_KEY configured, allow all requests (dev mode)
  if (!config.API_KEY) {
    return true;
  }

  // Check Authorization: Bearer header
  const authHeader = request.headers.get('authorization');
  const bearerMatch = authHeader?.match(/^\s*Bearer\s+(.+)$/i);
  if (bearerMatch?.[1] === config.API_KEY) {
    return true;
  }

  // Check X-Api-Key header
  const apiKeyHeader = request.headers.get('x-api-key');
  if (apiKeyHeader === config.API_KEY) {
    return true;
  }

  return false;
}

export interface McpHandlerDeps {
  config: UnifiedConfig;
}

/**
 * Handle MCP POST request.
 */
export async function handleMcpRequest(
  request: Request,
  deps: McpHandlerDeps,
): Promise<Response> {
  const { config } = deps;

  // Validate API key
  if (!validateApiKey(request, config)) {
    return withCors(
      jsonResponse(
        {
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Unauthorized: Invalid or missing API key',
          },
          id: null,
        },
        { status: 401 },
      ),
    );
  }

  // Get or create session ID
  const incomingSessionId = request.headers.get('Mcp-Session-Id');
  const sessionId = incomingSessionId?.trim() || crypto.randomUUID();

  // Parse JSON-RPC body
  const body = (await request.json().catch(() => ({}))) as {
    jsonrpc?: string;
    method?: string;
    params?: Record<string, unknown>;
    id?: string | number | null;
  };

  const { method, params, id } = body;

  logger.debug('mcp_handler', {
    message: 'Processing request',
    sessionId,
    method,
  });

  // Build dispatch context with server-side Replicate token
  const dispatchContext: McpDispatchContext = {
    sessionId,
    auth: {
      sessionId,
      replicateToken: config.REPLICATE_API_TOKEN,
    },
    config: {
      title: config.MCP_TITLE,
      version: config.MCP_VERSION,
    },
    getSessionState: () => sessionStateMap.get(sessionId),
    setSessionState: (state) => sessionStateMap.set(sessionId, state),
    cancellationRegistry: getCancellationRegistry(sessionId),
  };

  // Handle notifications (no id) - return 202 Accepted
  if (!('id' in body) || id === null || id === undefined) {
    if (method) {
      handleMcpNotification(method, params, dispatchContext);
    }
    return withCors(new Response(null, { status: 202 }));
  }

  // Dispatch JSON-RPC request
  const result = await dispatchMcpMethod(method, params, dispatchContext, id);

  // Build response
  const response = jsonResponse({
    jsonrpc: '2.0',
    ...(result.error ? { error: result.error } : { result: result.result }),
    id,
  });

  response.headers.set('Mcp-Session-Id', sessionId);
  return withCors(response);
}

/**
 * Handle MCP GET request (returns 405 per spec).
 */
export function handleMcpGet(): Response {
  return withCors(new Response('Method Not Allowed', { status: 405 }));
}
