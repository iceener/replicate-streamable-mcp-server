import {
  type McpRequestContext,
  McpServer,
  type ServerCapabilities,
} from '@modelcontextprotocol/server';
import type { AppConfig } from '../config/env.js';
import { registerTools } from '../tools/index.js';
import type { ReplicateToolServices } from '../types/context.js';

export interface McpServerDependencies {
  services?: ReplicateToolServices;
}
function capabilitiesFor(context: McpRequestContext): ServerCapabilities {
  return { tools: { listChanged: context.era === 'modern' } };
}

/** Build a fresh Replicate MCP server for one HTTP request. */
export function createMcpServer(
  config: AppConfig,
  context: McpRequestContext,
  dependencies: McpServerDependencies = {},
): McpServer {
  const server = new McpServer(
    {
      name: config.MCP_NAME,
      title: config.MCP_TITLE,
      version: config.MCP_VERSION,
    },
    {
      instructions: config.MCP_INSTRUCTIONS,
      capabilities: capabilitiesFor(context),
      cacheHints: { 'tools/list': { ttlMs: 60_000, cacheScope: 'private' } },
    },
  );
  registerTools(server, config, dependencies.services);
  return server;
}
