// MCP routes for Hono

import { randomUUID } from 'node:crypto';
import type { HttpBindings } from '@hono/node-server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { toFetchResponse, toReqRes } from 'fetch-to-node';
import { Hono } from 'hono';
import { contextRegistry } from '../../core/context.js';
import type { ReplicateAuthContext } from '../middlewares/auth.js';
import { logger } from '../../utils/logger.js';

export function buildMcpRoutes(params: {
  server: McpServer;
  transports: Map<string, StreamableHTTPServerTransport>;
}) {
  const { server, transports } = params;
  const app = new Hono<{ Bindings: HttpBindings }>();

  const connectedTransports = new WeakSet<StreamableHTTPServerTransport>();
  const MCP_SESSION_HEADER = 'Mcp-Session-Id';

  async function ensureConnected(transport: StreamableHTTPServerTransport): Promise<void> {
    if (!connectedTransports.has(transport)) {
      await server.connect(transport);
      connectedTransports.add(transport);
    }
  }

  app.post('/', async (c) => {
    const { req, res } = toReqRes(c.req.raw);

    try {
      const sessionIdHeader = c.req.header(MCP_SESSION_HEADER) ?? undefined;
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        body = undefined;
      }

      const isInitialize = Boolean(
        body && (body as { method?: string }).method === 'initialize',
      );

      const plannedSid = isInitialize ? sessionIdHeader || randomUUID() : undefined;

      void logger.info('mcp_request', {
        message: 'Processing MCP request',
        sessionId: plannedSid || sessionIdHeader,
        isInitialize,
        hasSessionIdHeader: !!sessionIdHeader,
        bodyMethod: (body as { method?: string })?.method,
        bodyId: (body as { id?: unknown })?.id,
      });

      let transport = sessionIdHeader ? transports.get(sessionIdHeader) : undefined;
      
      // If session ID provided but not found, reject (stale session)
      if (sessionIdHeader && !transport && !isInitialize) {
        void logger.warning('mcp', {
          message: 'Unknown session ID - client should re-initialize',
          sessionId: sessionIdHeader,
        });
        return c.json(
          {
            jsonrpc: '2.0',
            error: { code: -32600, message: 'Invalid session. Please re-initialize.' },
            id: (body as { id?: unknown })?.id ?? null,
          },
          400,
        );
      }
      
      if (!transport) {
        const created = new StreamableHTTPServerTransport({
          sessionIdGenerator: isInitialize ? () => plannedSid as string : undefined,
          onsessioninitialized: isInitialize
            ? (sid: string) => {
                transports.set(sid, created);
                void logger.info('mcp', {
                  message: 'Session initialized',
                  sessionId: sid,
                });
              }
            : undefined,
        });
        transport = created;
      }

      transport.onerror = (error) => {
        void logger.error('transport', {
          message: 'Transport error',
          error: error.message,
        });
      };

      // Create request context with server-side Replicate token
      if (body && typeof body === 'object' && 'id' in body && body.id) {
        const replicateAuth = (c as unknown as { replicateAuth?: ReplicateAuthContext }).replicateAuth;

        contextRegistry.create(body.id as string | number, plannedSid, {
          replicateToken: replicateAuth?.replicateToken,
        });
      }

      await ensureConnected(transport);
      await transport.handleRequest(req, res, body);

      res.on('close', () => {
        void logger.debug('mcp', { message: 'Request closed' });
      });

      void logger.info('mcp_response', {
        message: 'MCP request completed',
        bodyMethod: (body as { method?: string })?.method,
        statusCode: res.statusCode,
      });

      return toFetchResponse(res);
    } catch (error) {
      void logger.error('mcp', {
        message: 'Error handling POST request',
        error: (error as Error).message,
      });
      return c.json(
        {
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        },
        500,
      );
    }
  });

  app.get('/', async (c) => {
    const { req, res } = toReqRes(c.req.raw);
    const sessionIdHeader = c.req.header(MCP_SESSION_HEADER);
    
    void logger.info('mcp_get_request', {
      message: 'Processing GET request (SSE stream)',
      sessionId: sessionIdHeader,
      hasSession: !!sessionIdHeader,
    });
    
    if (!sessionIdHeader) {
      void logger.warning('mcp_get_request', { message: 'GET without session ID' });
      return c.json(
        {
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Method not allowed - no session' },
          id: null,
        },
        405,
      );
    }
    try {
      const transport = transports.get(sessionIdHeader);
      if (!transport) {
        void logger.warning('mcp_get_request', { message: 'Unknown session', sessionId: sessionIdHeader });
        return c.text('Invalid session', 404);
      }
      await ensureConnected(transport);
      await transport.handleRequest(req, res);
      void logger.info('mcp_get_response', { message: 'GET SSE stream established', sessionId: sessionIdHeader });
      return toFetchResponse(res);
    } catch (error) {
      void logger.error('mcp', {
        message: 'Error handling GET request',
        error: (error as Error).message,
      });
      return c.json(
        {
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        },
        500,
      );
    }
  });

  app.delete('/', async (c) => {
    const { req, res } = toReqRes(c.req.raw);
    const sessionIdHeader = c.req.header(MCP_SESSION_HEADER);
    if (!sessionIdHeader) {
      return c.json(
        {
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Method not allowed - no session' },
          id: null,
        },
        405,
      );
    }
    try {
      const transport = transports.get(sessionIdHeader);
      if (!transport) {
        return c.text('Invalid session', 404);
      }
      await ensureConnected(transport);
      await transport.handleRequest(req, res);
      transports.delete(sessionIdHeader);
      transport.close();
      return toFetchResponse(res);
    } catch (error) {
      void logger.error('mcp', {
        message: 'Error handling DELETE request',
        error: (error as Error).message,
      });
      return c.json(
        {
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        },
        500,
      );
    }
  });

  return app;
}
