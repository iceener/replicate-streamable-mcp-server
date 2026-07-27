import type { McpServer } from '@modelcontextprotocol/server';
import type { AppConfig } from '../config/env.js';
import { runPrediction, searchModels } from '../services/api/replicate.service.js';
import type { ReplicateToolServices, RequestContext } from '../types/context.js';
import { generateImageTool } from './generate-image.tool.js';
import { searchModelsTool } from './search-models.tool.js';

const defaultServices: ReplicateToolServices = { searchModels, runPrediction };

/** Register the existing Replicate tools in their original deterministic order. */
export function registerTools(
  server: McpServer,
  config: AppConfig,
  services: ReplicateToolServices = defaultServices,
): void {
  const context = (signal: AbortSignal): RequestContext => ({
    replicateToken: config.REPLICATE_API_TOKEN,
    signal,
    services,
  });

  server.registerTool(
    searchModelsTool.name,
    {
      description: searchModelsTool.description,
      inputSchema: searchModelsTool.inputSchema,
    },
    (args, requestContext) =>
      searchModelsTool.handler(args, context(requestContext.mcpReq.signal)),
  );

  server.registerTool(
    generateImageTool.name,
    {
      description: generateImageTool.description,
      inputSchema: generateImageTool.inputSchema,
    },
    (args, requestContext) =>
      generateImageTool.handler(args, context(requestContext.mcpReq.signal)),
  );
}
