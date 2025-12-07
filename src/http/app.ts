// Replicate MCP server entry point (Node.js/Hono)

import type { HttpBindings } from '@hono/node-server';
import { Hono } from 'hono';
import { config } from '../config/env.js';
import { serverMetadata } from '../config/metadata.js';
import { buildServer } from '../core/mcp.js';
import { corsMiddleware } from './middlewares/cors.js';
import { replicateAuthMiddleware, requireAuth } from './middlewares/auth.js';
import { healthRoutes } from './routes/health.js';
import { buildMcpRoutes } from './routes/mcp.js';

export function buildHttpApp(): Hono<{ Bindings: HttpBindings }> {
  const app = new Hono<{ Bindings: HttpBindings }>();

  // Build MCP server
  const server = buildServer({
    name: config.MCP_TITLE || serverMetadata.title,
    version: config.MCP_VERSION,
    instructions: serverMetadata.instructions,
  });

  const transports = new Map();

  // Global middleware
  app.use('*', corsMiddleware());
  app.use('*', replicateAuthMiddleware());

  // Public routes
  app.route('/', healthRoutes());

  // Protected MCP endpoint
  app.use('/mcp', requireAuth());
  app.route('/mcp', buildMcpRoutes({ server, transports }));

  return app;
}
