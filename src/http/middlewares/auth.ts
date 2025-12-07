// Auth middleware for Replicate MCP
// Validates internal API key and provides server-side Replicate token

import type { HttpBindings } from '@hono/node-server';
import type { MiddlewareHandler } from 'hono';
import { config } from '../../config/env.js';

/**
 * Auth context attached to Hono context.
 */
export interface ReplicateAuthContext {
  /** Whether the request is authenticated */
  authenticated: boolean;
  /** Replicate API token (from server config) */
  replicateToken?: string;
}

/**
 * Middleware that validates internal API key and provides Replicate token.
 * 
 * Client authenticates via:
 * - Authorization: Bearer <API_KEY>
 * - X-Api-Key: <API_KEY>
 * 
 * If API_KEY is not set in env, auth is disabled (dev mode).
 * The REPLICATE_API_TOKEN is stored server-side and never sent by client.
 */
export function replicateAuthMiddleware(): MiddlewareHandler<{
  Bindings: HttpBindings;
}> {
  return async (c, next) => {
    const authContext: ReplicateAuthContext = {
      authenticated: false,
      replicateToken: config.REPLICATE_API_TOKEN,
    };

    // If no API_KEY configured, allow all requests (dev mode)
    if (!config.API_KEY) {
      authContext.authenticated = true;
      (c as unknown as { replicateAuth: ReplicateAuthContext }).replicateAuth = authContext;
      await next();
      return;
    }

    // Check Authorization: Bearer header
    const authHeader = c.req.header('authorization');
    const bearerMatch = authHeader?.match(/^\s*Bearer\s+(.+)$/i);
    if (bearerMatch?.[1] === config.API_KEY) {
      authContext.authenticated = true;
    }

    // Check X-Api-Key header
    const apiKeyHeader = c.req.header('x-api-key');
    if (apiKeyHeader === config.API_KEY) {
      authContext.authenticated = true;
    }

    (c as unknown as { replicateAuth: ReplicateAuthContext }).replicateAuth = authContext;
    await next();
  };
}

/**
 * Middleware that rejects unauthenticated requests.
 * Use after replicateAuthMiddleware on protected routes.
 */
export function requireAuth(): MiddlewareHandler<{ Bindings: HttpBindings }> {
  return async (c, next) => {
    const auth = (c as unknown as { replicateAuth?: ReplicateAuthContext }).replicateAuth;

    if (!auth?.authenticated) {
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Unauthorized: Invalid or missing API key',
          },
          id: null,
        },
        401,
      );
    }

    await next();
  };
}
